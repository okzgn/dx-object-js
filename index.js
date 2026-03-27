/**
 * @fileoverview DXObject — Recursive Proxy with safe auto-vivification.
 * Creates a deeply observable proxy around a plain object. Reading any nested
 * path — even one that does not exist yet — returns a lightweight "ghost" proxy
 * that materialises the full path in the real target the moment a value is
 * assigned to it. Every mutation (assignment or array method) fires the
 * `onMutation` callback with the full path and the new value.
 * @module DXObject
 */

// ─── Type definitions ────────────────────────────────────────────────────────

// ─── Payload types ───────────────────────────────────────────────────────────
 
/**
 * Metadata object emitted by `onMutation` when an Array mutator method is
 * called (`push`, `pop`, `shift`, `unshift`, `splice`, `sort`, `reverse`).
 *
 * @typedef {Object} ArrayMutationPayload
 * @property {string}  method - Name of the mutator method that was called.
 * @property {any[]}   args   - Arguments that were passed to the method.
 * @property {any}     result - Return value produced by the method.
 *
 * @example
 * // form.tags.push('admin') emits:
 * { method: 'push', args: ['admin'], result: 1 }
 *
 * // form.scores.splice(1, 2) emits:
 * { method: 'splice', args: [1, 2], result: ['b', 'c'] }
 */

/**
 * Metadata object emitted by `onMutation` when a property was deleted.
 *
 * @typedef {Object} PropertyDeletionPayload
 * @property {string}  property - Name of the deleted property.
 * @property {any}     value - Value of the property before deletion.
 *
 * @example
 * // form.field = 123
 * // delete form.field emits:
 * { property: 'field', value: 123 }
 */

// ─── Callback types ──────────────────────────────────────────────────────────

/**
 * Callback invoked after every successful mutation on the proxied target.
 *
 * The `payload` parameter carries different shapes depending on the mutation
 * kind:
 * - **Scalar assignment** (`form.user.name = 'Ana'`): `payload` is the raw
 *   assigned value (e.g. `'Ana'`).
 * - **Array mutator** (`form.items.push(x)`): `payload` is an
 *   {@link ArrayMutationPayload} object.
 *
 * @callback OnMutationCallback
 * @param {string[]}               path        - Full dot-separated key path to
 *   the mutated property (e.g. `['user', 'address', 'city']`).
 * @param {any|ArrayMutationPayload|PropertyDeletionPayload} payload   - New scalar
 *   value, array mutation or property deletion metadata.
 * @param {Proxy}                  parentProxy - Proxy wrapping the direct
 *   parent object of the mutated key.
 * @param {Object}                 root        - The original unwrapped target
 *   passed to `DXObject`.
 * @returns {void}
 */
 
/**
 * Callback invoked when DXObject intercepts an invalid or dangerous operation.
 * Defaults to `console.error` when not provided.
 *
 * @callback OnErrorCallback
 * @param {string} message - Human-readable description of the problem.
 * @param {Object} [context] - Optional structured context (varies by error
 *   kind — see individual call sites for the exact shape).
 * @returns {void}
 */

/**
 * Callback invoked every time that property doesn't exist was accessed.
 *
 * @callback OnUndefinedCallback
 * @param {string[]}               path        - Full dot-separated key path to
 *   the accessed not existent property (e.g. `['form', 'fields', 'notFound']`).
 * @param {Proxy}                  parentProxy - Proxy wrapping the direct
 *   parent object of the not existent property.
 * @param {Object}                 root        - The original unwrapped target
 *   passed to `DXObject`.
 * @returns {any} Return a value to override the default Ghost Proxy creation.
 * If `undefined` is returned, the default Ghost Proxy is created.
 */
 
/**
 * Configuration object accepted as the second argument of `DXObject`.
 *
 * @typedef {Object} DXObjectOptions
 * @property {OnMutationCallback} [onMutation] - Called after every successful
 *   mutation. Omit to use DXObject purely for auto-vivification without
 *   observation.
 * @property {OnUndefinedCallback} [onUndefined] - Called every time a property 
 *   that doesn't exist is accessed. If this function returns a value other than 
 *   undefined, that value will be returned instead of creating a Ghost Proxy.
 * @property {OnErrorCallback}    [onError]    - Called when DXObject blocks a
 *   dangerous operation (Prototype Pollution, depth overflow, etc.). Defaults
 *   to `console.error`.
 * @property {string[]}           [arrayMutators=[]]   Additional array method names to
*    intercept alongside the built-in mutators (`push`, `pop`, `shift`,
*    `unshift`, `splice`, `sort`, `reverse`). Useful for custom subclasses or
*    polyfilled methods that mutate in-place without triggering the `set` trap.
 * @property {number}             [depth=10]   - Maximum ghost-chain depth
 *   before writes are silently blocked and `onError` is called. Clamped to
 *   `[1, 100]`. Useful for preventing runaway paths from untrusted data.
 */
 
// ─── Implementation ──────────────────────────────────────────────────────────
 
/**
 * Wraps `target` in a recursive observable Proxy with auto-vivification.
 *
 * **Auto-vivification**: accessing any nested path — even one that does not
 * exist — returns a "ghost" Proxy. Assigning a value through it creates all
 * intermediate objects or arrays automatically and then calls `onMutation`.
 *
 * **Safety**: guards against Prototype Pollution (`__proto__`, `constructor`,
 * `prototype`), unbounded ghost-chain depth, and native-object slot errors.
 *
 * @param {Object}          [target={}] - Plain object or array to observe.
 *   Must be a plain object or Array; passing class instances with private state may
 *   produce unexpected behaviour (see Limitations).
 * @param {DXObjectOptions} [options]   - Configuration (see
 *   {@link DXObjectOptions}).
 * @returns {Proxy} A fully transparent, deeply observable proxy over `target`.
 *
 * @example <caption>Basic scalar assignment</caption>
 * const form = DXObject({}, {
 *   onMutation: (path, value) => console.log(path.join('.'), '=', value),
 * });
 * form.user.address.city = 'Madrid';
 * // → logs: "user.address.city = Madrid"
 * // target is now: { user: { address: { city: 'Madrid' } } }
 *
 * @example <caption>Array auto-vivification</caption>
 * const store = DXObject({}, { onMutation: console.log });
 * store.cart.items.push({ id: 1 });
 * // items[] was created automatically; onMutation receives
 * // path=['cart','items'], payload={ method:'push', args:[{id:1}], result:1 }
 *
 * @example <caption>Custom error handler</caption>
 * const form = DXObject({}, {
 *   onError: (msg, ctx) => Sentry.captureMessage(msg, { extra: ctx }),
 * });
 *
 * @example <caption>Depth cap for untrusted input</caption>
 * const form = DXObject({}, { depth: 5 });
 * // Chains longer than 5 levels are blocked; onError is called instead.
 *
 * @example <caption>Handling missing properties</caption>
 * const form = DXObject({}, {
 *   onUndefined: (path) => path.includes('locked') ? null : undefined,
 * });
 * console.log(form.locked); // logs: null (Ghost prevented)
 * console.log(form.user);   // logs: [Proxy] (truthy, Standard behavior)
 * 
 * @limitations
 * 1. **Shared Objects** — If the same object reference is assigned to multiple
 *    paths (`form.a = obj; form.b = obj`), the proxy cache records the *first*
 *    access path. Subsequent `onMutation` calls from either path will report
 *    that first path. This is a deliberate trade-off to prevent memory leaks.
 * 2. **Inherited Setters** — `Reflect.set` with a Proxy receiver can trigger
 *    setters defined on the prototype chain. DXObject guards the direct key,
 *    but cannot inspect what a custom prototype setter may mutate internally.
 * 3. **Truthiness** — Because `DXObject` returns Ghost Proxies for non-existent
 *    paths, these accesses will always be truthy (`if (form.user)` is always true).
 *    Always verify against a specific value, use `Object.keys()` to check
 *    for existence, rather than checking the object itself, or use `onUndefined`
 *    callback to return values for properties that doesn't exist.
 */
export function DXObject(target = {}, options) {
    options = options && typeof options === 'object' ? options : {};
 
    const extraArrayMutators = Array.isArray(options.arrayMutators) ? options.arrayMutators : [];
    
    const maxDepth = isNaN(options.depth)
        ? 10
        : Math.max(1, Math.min(100, Number(options.depth)));
 
    const onUndefined = options.onUndefined;

    const onMutation = options.onMutation;
 
    /** @type {OnErrorCallback} */
    const onError = typeof options.onError === 'function'
        ? options.onError
        : (message, context) => console.error('[DXObject]', message, context);
 
    // Caches one proxy per raw object so the same reference always returns the
    // same proxy. Uses WeakMap so cached proxies are collected with their targets.
    const proxyCache = new WeakMap();
 
    // ── Helpers ───────────────────────────────────────────────────────────────
 
    /** Returns true for numeric array-index strings (e.g. "0", "42"). */
    const isValidArrayIndex = (key) => /^(0|[1-9]\d*)$/.test(key);
 
    /** Returns true for keys that would corrupt the prototype chain. */
    const isDangerousKey = (key) =>
        key === '__proto__' || key === 'constructor' || key === 'prototype';
 
    /**
     * Returns true for plain objects and arrays — i.e. types that are safe to
     * proxy without binding their methods to the raw target. Native objects
     * (Date, Map, Set, RegExp …) require `bind(rawTarget)` to preserve their
     * internal slots (see {@link createRealProxy}).
     *
     * @param {any} obj
     * @returns {boolean}
     */
    const isPlainObjectOrArray = (obj) => {
        if (Array.isArray(obj)) return true;
        if (obj === null || typeof obj !== 'object') return false;
        const proto = Object.getPrototypeOf(obj);
        return proto === Object.prototype || proto === null;
    };
 
    // ── Path materialisation ──────────────────────────────────────────────────
 
    /**
     * Walks `path` inside `root`, creating intermediate objects or arrays as
     * needed, then assigns `value` at the final key.
     *
     * This function never throws — errors are reported through `onError` and
     * the function returns the deepest `current` object reached before the
     * problem occurred.
     *
     * @param {Object}   root  - The raw (unwrapped) root target.
     * @param {string[]} path  - Full path to the property to assign.
     * @param {any}      value - Value to assign at the final key.
     * @returns {Object|undefined} The direct parent of the assigned key,
     *   or `undefined` if the write was blocked by a safety guard.
     */
    const materializePath = (root, path, value) => {
        // Should never happen in normal usage; guard against direct misuse.
        if (!path || path.length === 0) {
            onError('Path cannot be empty', { path, value });
            return;
        }
 
        let current = root;
 
        for (let i = 0; i < path.length - 1; i++) {
            const key = path[i];
 
            if (isDangerousKey(key)) {
                onError(`Prototype Pollution blocked at intermediate key: "${key}"`, { path, key, value });
                return;
            }
 
            const nextKey = path[i + 1];
 
            // Create the intermediate node if absent or non-object.
            // Use an Array when the next key is a valid array index.
            if (
                !(key in current) ||
                current[key] === null ||
                typeof current[key] !== 'object'
            ) {
                current[key] = isValidArrayIndex(nextKey) ? [] : {};
            }
 
            current = current[key];
        }
 
        const finalKey = path[path.length - 1];
 
        if (isDangerousKey(finalKey)) {
            onError(`Prototype Pollution blocked at final key: "${finalKey}"`, { path, finalKey, value });
            return;
        }
 
        current[finalKey] = value;
        return current;
    };
 
    // ── Ghost proxies ─────────────────────────────────────────────────────────
 
    /**
     * Builds the shared `get` trap used by both ghost variants. Reading any
     * property on a ghost returns another ghost (or the terminal ghost once
     * `maxDepth` is reached), keeping the chain alive until a write occurs.
     *
     * @param {function(string): any} resolveNext - Returns the value for any
     *   non-special property name. Differs between normal and terminal ghosts.
     * @returns {function} A Proxy `get` trap.
     */
    const createBaseGhostGetter = (resolveNext) =>
        function get(_target, prop) {
            if (prop === 'isProxy') return true;
 
            // Coerce to primitive (e.g. template literals, implicit conversions).
            if (
                prop === Symbol.toPrimitive ||
                prop === 'toString' ||
                prop === 'valueOf'
            ) return () => undefined;
 
            // Provide an empty iterator so `for...of` on a ghost does not throw.
            if (prop === Symbol.iterator) return function* () { yield* []; };
 
            // Angular internal slot and Promise interop — return undefined to
            // signal "not a thenable / not an Angular element".
            if (
                prop === '__ngContext__' ||
                prop === 'then' ||
                typeof prop === 'symbol'
            ) return undefined;
 
            return resolveNext(String(prop));
        };
 
    /**
     * A self-referential ghost returned when `maxDepth` is reached. Every
     * property read returns the same proxy (no path growth, no allocation).
     * Any write attempt calls `onError` and returns `false` to the engine.
     *
     * @param {string[]} path - The path at which the depth limit was hit
     *   (used in the error message only).
     * @returns {Proxy}
     */
    const createTerminalGhost = (path) => {
        // `terminalProxy` must be declared before the Proxy is created so the
        // getter closure can reference it (self-referential).
        let terminalProxy;
 
        terminalProxy = new Proxy({}, {
            get: createBaseGhostGetter(() => terminalProxy),
 
            set() {
                onError(
                    `maxDepth (${maxDepth}) exceeded — write blocked`,
                    { path: path.join('.'), maxDepth }
                );
                return false; // Causes a TypeError in strict mode, silent in sloppy.
            },
 
            has(_t, prop)                  { return prop === 'isProxy'; },
            ownKeys()                      { return ['isProxy']; },
            getOwnPropertyDescriptor(_t, prop) {
                if (prop === 'isProxy')
                    return { configurable: true, enumerable: true, value: true };
                return undefined;
            },
        });
 
        return terminalProxy;
    };
 
    /**
     * Creates a normal ghost proxy for `path`. Reads extend the chain
     * recursively; writes materialise the path and call `onMutation`.
     *
     * Once `path.length` reaches `maxDepth`, returns a terminal ghost instead.
     *
     * @param {string[]} path - Accumulated key path from the root.
     * @param {Function} [onMaterialize] - Notifies to the upper proxy that cached ghost need cleanup.
     * @returns {Proxy}
     */
    const makeGhost = (path, onMaterialize) => {
        if (path.length >= maxDepth) return createTerminalGhost(path);
 
        return new Proxy({}, {
            get: createBaseGhostGetter((propStr) => makeGhost([...path, propStr], onMaterialize)),
 
            set(_t, prop, value) {
                const propStr = String(prop);
 
                // Dangerous key on the ghost's own prop — block immediately.
                if (isDangerousKey(propStr)) return false;
 
                const fullPath = [...path, propStr];
 
                try {
                    // materializePath handles its own errors via onError and
                    // never throws, so this try/catch only covers exceptions
                    // that may originate inside onMutation (consumer code).
                    const parentObj = materializePath(target, fullPath, value);
                    if (parentObj) {
                        if (onMaterialize) onMaterialize();
                        if (onMutation) onMutation(fullPath, value, parentObj, target);
                    }
                    return parentObj ? true : false;
                } catch (err) {
                    onError('onMutation threw an unhandled exception', { err, fullPath, value });
                    return false;
                }
            },
 
            has(_t, prop)                  { return prop === 'isProxy'; },
            ownKeys()                      { return ['isProxy']; },
            getOwnPropertyDescriptor(_t, prop) {
                if (prop === 'isProxy')
                    return { configurable: true, enumerable: true, value: true };
                return undefined;
            },
        });
    };
 
    // ── Real object proxy ─────────────────────────────────────────────────────
 
    /** Array methods that mutate in-place and do not trigger the `set` trap. */
    const arrayMutators = new Set(
        ['push', 'pop', 'shift', 'unshift', 'splice', 'sort', 'reverse'].concat(extraArrayMutators)
    );
 
    /**
     * Wraps a real (already-existing) object with a full observable Proxy.
     * Cached by raw object reference so the same object always returns the
     * same proxy (see Limitation 1 in the JSDoc).
     *
     * @param {Object}   obj         - Raw object to wrap.
     * @param {string[]} currentPath - Path from the root to this object.
     * @returns {Proxy}
     */
    const createRealProxy = (obj, currentPath) => {
        if (proxyCache.has(obj)) return proxyCache.get(obj);
 
        const localGhostCache = new Map();

        const proxy = new Proxy(obj, {
            get(t, prop, receiver) {
                const propStr = String(prop);
                if (prop === 'isProxy') return true;
 
                const val = Reflect.get(t, prop, receiver);
 
                // Pass symbols and framework internals through unmodified.
                if (typeof prop === 'symbol' || prop === '__ngContext__') return val;
 
                if (typeof val === 'function') {
                    // Intercept in-place array mutators to emit a structured payload.
                    if (arrayMutators.has(propStr) && (Array.isArray(t) || (extraArrayMutators.includes(propStr) && typeof t[propStr] === 'function'))) {
                        return (...args) => {
                            const result = val.apply(t, args);
 
                            if (onMutation) {
                                /** @type {ArrayMutationPayload} */
                                const payload = { method: propStr, args, result };
                                onMutation(currentPath, payload, receiver, target);
                            }
 
                            return result;
                        };
                    }
 
                    // Native objects (Date, Map, Set, RegExp …) rely on internal
                    // slots that are inaccessible through a Proxy. Bind their
                    // methods to the raw target so slot access does not throw.
                    if (!isPlainObjectOrArray(t)) return val.bind(t);
 
                    // For plain objects, return the function unbound so that any getters
                    // or setters it invokes use the Proxy as `this`, preserving
                    // reactivity.
                    return val;
                }
 
                if (Reflect.has(t, prop)) {
                    if (val === null) return null;
 
                    // Recursively wrap nested objects.
                    if (typeof val === 'object') {
                        return createRealProxy(val, [...currentPath, propStr]);
                    }
 
                    return val;
                }
 
                if (onUndefined) {
                    const onUndefinedResult = onUndefined([...currentPath, propStr], receiver, target);
                    if(onUndefinedResult !== undefined) return onUndefinedResult;
                }

                // Property does not exist yet — return a stable cached ghost.
                // Caching ensures the same reference is returned on every read,
                // preventing false change-detection cycles in frameworks like Angular.
                if (localGhostCache.has(propStr)) return localGhostCache.get(propStr);
                const ghost = makeGhost([...currentPath, propStr], () => localGhostCache.delete(propStr));
                localGhostCache.set(propStr, ghost);
                return ghost;
            },
 
            set(t, prop, value, receiver) {
                const propStr = String(prop);
 
                // Block prototype-chain poisoning on real objects too.
                if (isDangerousKey(propStr)) return false;

                // Invalidate the cached ghost for this key — the property now exists
                // as a real value, so future reads must return the real proxy, not a ghost.
                localGhostCache.delete(propStr);
 
                // Reflect.set with `receiver` correctly handles inherited
                // setters defined via Object.defineProperty.
                const success = Reflect.set(t, prop, value, receiver);
 
                if (success && typeof prop !== 'symbol' && onMutation) {
                    onMutation([...currentPath, propStr], value, receiver, target);
                }
 
                return success;
            },

            deleteProperty(t, prop) {
                const propStr = String(prop);
                const value = Reflect.get(t, prop);
                const success = Reflect.deleteProperty(t, prop);
                if (success && typeof prop !== 'symbol') {
                    localGhostCache.delete(propStr);
                    if(onMutation) onMutation([...currentPath, propStr], { property: propStr, value }, proxy, target);
                }
                return success;
            },
 
            has(t, prop)                  { return Reflect.has(t, prop); },
            ownKeys(t)                    { return Reflect.ownKeys(t); },
            getOwnPropertyDescriptor(t, prop) {
                return Reflect.getOwnPropertyDescriptor(t, prop);
            },
        });
 
        proxyCache.set(obj, proxy);
        return proxy;
    };
 
    return createRealProxy(target, []);
}