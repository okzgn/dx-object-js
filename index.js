/**
 * @fileoverview DXObject — Recursive Proxy with safe auto-vivification.
 * Creates a deeply observable proxy around a plain object. Reading any nested
 * path — even one that does not exist yet — returns a lightweight "ghost" proxy
 * that materialises the full path in the real target the moment a value is
 * assigned to it. Every mutation (assignment, deletion or mutator method call)
 * fires the `onMutation` callback with the full path and the new value.
 * @module DXObject
 */

// ─── Type definitions ────────────────────────────────────────────────────────

// ─── Payload types ───────────────────────────────────────────────────────────

/**
 * Metadata object emitted by `onMutation` when a mutator method is called.
 * Built-in mutators are `push`, `pop`, `shift`, `unshift`, `splice`, `sort` and
 * `reverse` on arrays, `set`, `delete` and `clear` on `Map`, `add`, `delete` and
 * `clear` on `Set`, and the `set*` methods on `Date`. Any other method can be
 * added through the `arrayMutators` option.
 *
 * @typedef {Object} MethodMutationPayload
 * @property {string}  method - Name of the mutator method that was called.
 * @property {any[]}   args   - Arguments that were passed to the method
 *   (unwrapped: proxies are replaced by their raw objects).
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
 * Former name of {@link MethodMutationPayload}, kept as an alias.
 *
 * @typedef {MethodMutationPayload} ArrayMutationPayload
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
 *   assigned value (e.g. `'Ana'`). Proxies are unwrapped, so you always get the
 *   underlying object.
 * - **Mutator method** (`form.items.push(x)`): `payload` is a
 *   {@link MethodMutationPayload} object.
 * - **Deletion** (`delete form.name`): `payload` is a
 *   {@link PropertyDeletionPayload} object.
 *
 * If the callback throws, the error is routed to `onError` and the mutation
 * itself is not affected (it has already been applied).
 *
 * @callback OnMutationCallback
 * @param {string[]}               path        - Full key path to the mutated
 *   property, one string per level (e.g. `['user', 'address', 'city']`). For a
 *   mutator method it is the path of the array / Map / Set / Date itself.
 * @param {any|MethodMutationPayload|PropertyDeletionPayload} payload   - New
 *   scalar value, mutator-method metadata or property deletion metadata.
 * @param {Proxy}                  parentProxy - Proxy wrapping the object that
 *   was mutated: the direct parent of the key for assignments and deletions,
 *   the array / Map / Set / Date itself for mutator methods.
 * @param {Object}                 root        - The original unwrapped target
 *   passed to `DXObject`.
 * @returns {void}
 */

/**
 * Callback invoked when DXObject intercepts an invalid or dangerous operation.
 * Defaults to `console.error` when not provided. Every blocked operation is
 * reported through it and then dropped without throwing.
 *
 * @callback OnErrorCallback
 * @param {string} message - Human-readable description of the problem.
 * @param {Object} [context] - Optional structured context (varies by error
 *   kind — see individual call sites for the exact shape).
 * @returns {void}
 */

/**
 * Callback invoked every time a property that doesn't exist is accessed.
 *
 * @callback OnUndefinedCallback
 * @param {string[]}               path        - Full key path to the accessed
 *   non-existent property (e.g. `['form', 'fields', 'notFound']`).
 * @param {Proxy}                  parentProxy - Proxy wrapping the direct
 *   parent object of the non-existent property.
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
 *   dangerous operation (Prototype Pollution, depth overflow, etc.) or when one
 *   of your callbacks throws. Defaults to `console.error`.
 * @property {string[]}           [arrayMutators=[]]   Additional method names to
 *   intercept alongside the built-in mutators (see {@link MethodMutationPayload}).
 *   Useful for custom subclasses or polyfilled methods that mutate in-place
 *   without triggering the `set` trap (e.g. `fill`, `copyWithin`).
 * @property {number}             [depth=10]   - Maximum length of any path that
 *   may be created through ghosts, counted from the root. Writes that would
 *   exceed it are dropped and reported through `onError`. Clamped to
 *   `[1, 100]`; anything that is not a finite number falls back to `10`. Useful
 *   for preventing runaway paths from untrusted data.
 * @property {boolean}            [skipUnchanged=false] - When `true`, assigning
 *   a value that is `Object.is`-equal to the one already stored under an
 *   existing key does not fire `onMutation`.
 */

// ─── Implementation ──────────────────────────────────────────────────────────

// Maps every real proxy created by any DXObject to the raw object it wraps, so
// proxies can be unwrapped before they are stored (see `unwrap`).
const rawOf = new WeakMap();

// Every ghost proxy ever handed out. Ghosts represent "undefined".
const ghostSet = new WeakSet();

// Returned by `readPath` when the path does not exist (distinct from a stored
// `undefined`).
const NOT_FOUND = {};

// Properties that libraries and the runtime probe on arbitrary values (thenable
// detection, JSON serialisation, React / Jest / Angular internals). A missing
// one must read as `undefined`, never as a truthy ghost.
const PROBE_KEYS = new Set([
    'then', 'toJSON', '__ngContext__', '$$typeof', 'asymmetricMatch', 'nodeType',
]);

const DEFAULT_ARRAY_MUTATORS = ['push', 'pop', 'shift', 'unshift', 'splice', 'sort', 'reverse'];
const MAP_MUTATORS = ['set', 'delete', 'clear'];
const SET_MUTATORS = ['add', 'delete', 'clear'];
const DATE_MUTATORS = [
    'setDate', 'setFullYear', 'setHours', 'setMilliseconds', 'setMinutes', 'setMonth',
    'setSeconds', 'setTime', 'setUTCDate', 'setUTCFullYear', 'setUTCHours',
    'setUTCMilliseconds', 'setUTCMinutes', 'setUTCMonth', 'setUTCSeconds', 'setYear',
];

// Array methods that compare by identity: they must also find raw objects when
// the array hands out proxies, and the other way round.
const IDENTITY_SEARCH_METHODS = new Set(['includes', 'indexOf', 'lastIndexOf']);

/** Returns true for numeric array-index strings (e.g. "0", "42"). */
const isValidArrayIndex = (key) => /^(0|[1-9]\d*)$/.test(key);

/** Returns true for keys that would corrupt the prototype chain. */
const isDangerousKey = (key) =>
    key === '__proto__' || key === 'constructor' || key === 'prototype';

const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

/**
 * Returns true for plain objects and arrays — i.e. types that are safe to
 * proxy without binding their methods to the raw target. Native objects
 * (Date, Map, Set, RegExp …) and class instances keep their state in places a
 * proxy cannot reach (internal slots, private fields), so their methods and
 * accessors run against the raw target (see {@link createRealProxy}).
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

/**
 * Returns the raw value behind a DXObject proxy. Ghosts become `undefined`
 * (that is what they stand for); anything else is returned untouched.
 *
 * @param {any} value
 * @returns {any}
 */
const unwrap = (value) => {
    if (ghostSet.has(value)) return undefined;
    const raw = rawOf.get(value);
    return raw === undefined ? value : raw;
};

/**
 * Returns the raw object behind a DXObject proxy, e.g. to hand it to
 * `structuredClone`, which cannot clone proxies. Ghosts become `undefined`;
 * non-proxy values are returned as they are.
 *
 * @param {any} value
 * @returns {any}
 *
 * @example
 * const copy = structuredClone(toRaw(form));
 */
export function toRaw(value) {
    return unwrap(value);
}

/**
 * Returns true when `value` is a ghost, i.e. a stand-in for a property that
 * does not exist. Ghosts are always truthy, so this is the way to tell "missing"
 * from "present".
 *
 * @param {any} value
 * @returns {boolean}
 *
 * @example
 * if (isGhost(form.user)) { ... } // user has not been assigned yet
 */
export function isGhost(value) {
    return ghostSet.has(value);
}

// ── Tree bookkeeping ──────────────────────────────────────────────────────────
//
// Every real proxy carries a node `{ raw, parent, key, depth }`. Paths are not
// baked into proxies: they are computed from the node chain when an event is
// emitted, and each link is checked against the raw tree first. That keeps
// paths right when an array is reordered while someone still holds a proxy for
// one of its elements.

/**
 * Tells whether `parentRaw[key]` still is `raw`. Accessor properties cannot be
 * verified by identity (they may build a new object on every read), so the key
 * is trusted for them.
 */
const slotMatches = (parentRaw, key, raw) => {
    if (parentRaw[key] === raw) return true; // fast path: the slot still holds it
    const descriptor = Object.getOwnPropertyDescriptor(parentRaw, key);
    if (descriptor && !('value' in descriptor)) return true;
    return unwrap(descriptor ? descriptor.value : parentRaw[key]) === raw;
};

/** Finds the key under which `parentRaw` currently holds `raw`, or null. */
const relocate = (parentRaw, raw) => {
    if (Array.isArray(parentRaw)) {
        for (let i = 0; i < parentRaw.length; i++) {
            if (unwrap(parentRaw[i]) === raw) return String(i);
        }
        return null;
    }
    const keys = Object.keys(parentRaw);
    for (let i = 0; i < keys.length; i++) {
        if (unwrap(parentRaw[keys[i]]) === raw) return keys[i];
    }
    return null;
};

/**
 * Computes the current path of `node`, repairing keys that went stale.
 *
 * @param {{raw: Object, parent: Object|null, key: string|null, depth: number}} node
 * @returns {string[]|null} The path, or `null` when the object is no longer
 *   part of the tree (it was removed after the caller obtained its proxy).
 */
const resolvePath = (node) => {
    const path = [];
    for (let n = node; n.parent !== null; n = n.parent) {
        if (!slotMatches(n.parent.raw, n.key, n.raw)) {
            const key = relocate(n.parent.raw, n.raw);
            if (key === null) return null;
            n.key = key;
        }
        path.push(n.key);
    }
    return path.reverse();
};

/** Best-effort path of the keys `rel` below `node`, for error contexts. */
const pathOfRel = (node, rel) => (resolvePath(node) || []).concat(rel);

/**
 * Walks `path` inside `root` without creating anything.
 *
 * @param {Object}   root
 * @param {string[]} path
 * @returns {any} The (unwrapped) value found, or `NOT_FOUND`.
 */
const readPath = (root, path) => {
    let current = root;
    for (let i = 0; i < path.length; i++) {
        if (current === null || (typeof current !== 'object' && typeof current !== 'function')) {
            return NOT_FOUND;
        }
        if (!(path[i] in current)) return NOT_FOUND;
        current = unwrap(current[path[i]]);
    }
    return current;
};

/**
 * Builds the shared `get` trap used by every ghost variant. Reading any
 * property on a ghost returns another ghost (or the terminal ghost once
 * `maxDepth` is reached), keeping the chain alive until a write occurs.
 *
 * @param {function(string): any} resolveNext - Returns the value for any
 *   non-special property name. Differs between normal and terminal ghosts.
 * @returns {function} A Proxy `get` trap.
 */
const createBaseGhostGetter = (resolveNext) =>
    function get(_target, prop) {
        // Read-only marker, kept for compatibility. It is not enumerable.
        if (prop === 'isProxy') return true;

        // Coerce to primitive (e.g. template literals, implicit conversions).
        if (
            prop === Symbol.toPrimitive ||
            prop === 'toString' ||
            prop === 'valueOf'
        ) return () => undefined;

        // Provide an empty iterator so `for...of` on a ghost does not throw.
        if (prop === Symbol.iterator) return function* () {};

        // Promise / JSON / framework interop probes and prototype-chain keys:
        // "not a thenable", "no toJSON", "nothing to reach".
        if (
            typeof prop === 'symbol' ||
            PROBE_KEYS.has(prop) ||
            isDangerousKey(prop)
        ) return undefined;

        return resolveNext(prop);
    };

/**
 * Wraps `target` in a recursive observable Proxy with auto-vivification.
 *
 * **Auto-vivification**: accessing any nested path — even one that does not
 * exist — returns a "ghost" Proxy. Assigning a value through it creates all
 * intermediate objects or arrays automatically and then calls `onMutation`.
 * Calling an array mutator (`push`, `unshift`, `splice`) on a ghost creates the
 * array and calls `onMutation` with the same payload a real array would emit.
 *
 * **Safety**: guards against Prototype Pollution (`__proto__`, `constructor`,
 * `prototype`) on reads, writes, deletions and `defineProperty` /
 * `setPrototypeOf`, unbounded ghost-chain depth, and native-object slot errors.
 * Blocked operations are reported through `onError` and dropped without
 * throwing.
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
 * // Paths longer than 5 levels are dropped; onError is called instead.
 *
 * @example <caption>Handling missing properties</caption>
 * const form = DXObject({}, {
 *   onUndefined: (path) => path.includes('locked') ? null : undefined,
 * });
 * console.log(form.locked); // logs: null (Ghost prevented)
 * console.log(form.user);   // logs: [Proxy] (truthy, Standard behavior)
 *
 * @limitations
 * 1. **Shared Objects** — If the same object reference is stored under several
 *    paths (`form.a = obj; form.b = obj`), each path gets its own proxy and
 *    reports its own path, so `form.a !== form.b`. Compare raw objects with
 *    `toRaw`.
 * 2. **Inherited Setters** — `Reflect.set` with a Proxy receiver can trigger
 *    setters defined on the prototype chain. DXObject guards the direct key,
 *    but cannot inspect what a custom prototype setter may mutate internally.
 * 3. **Truthiness** — Because `DXObject` returns Ghost Proxies for non-existent
 *    paths, these accesses will always be truthy (`if (form.user)` is always true,
 *    `form.user ?? x` never reaches `x`). Use `isGhost(form.user)`, check
 *    `'user' in form`, or use the `onUndefined` callback to return values for
 *    properties that don't exist.
 * 4. **Prototype keys** — Reading `__proto__`, `constructor` or `prototype`
 *    through the proxy returns `undefined` unless they are own data
 *    properties, so `form.constructor === Object` is false.
 * 5. **null / undefined values** — A key that exists with the value `null` or
 *    `undefined` is not auto-vivified (`form.n.x = 1` throws, as in plain JS).
 * 6. **Native objects** — `Map`, `Set` and `Date` mutations are reported as
 *    method calls, but the values stored inside them are not wrapped.
 *    Class instances (and anything with private fields) run their methods on
 *    the raw object, so mutations made inside those methods are not observed.
 * 7. **Frozen objects** — Properties that are both non-writable and
 *    non-configurable are returned as raw values (a proxy cannot return
 *    anything else for them), so nested changes below them are not observed.
 * 8. **Cloning** — `structuredClone` cannot clone proxies: use
 *    `structuredClone(toRaw(form))`.
 */
export function DXObject(target = {}, options) {
    options = options && typeof options === 'object' ? options : {};

    // Re-wrapping a DXObject proxy observes the raw object behind it.
    const wrappedRaw = rawOf.get(target);
    if (wrappedRaw !== undefined) target = wrappedRaw;

    const extraMutators = Array.isArray(options.arrayMutators)
        ? options.arrayMutators.filter((name) => typeof name === 'string')
        : [];

    const depthOption = options.depth === null || options.depth === undefined
        ? NaN
        : Number(options.depth);
    const maxDepth = isFinite(depthOption)
        ? Math.max(1, Math.min(100, Math.floor(depthOption)))
        : 10;

    const skipUnchanged = options.skipUnchanged === true;

    const onUndefined = typeof options.onUndefined === 'function' ? options.onUndefined : null;

    const onMutation = typeof options.onMutation === 'function' ? options.onMutation : null;

    /** @type {OnErrorCallback} */
    const userOnError = typeof options.onError === 'function'
        ? options.onError
        : (message, context) => console.error('[DXObject]', message, context);

    // ── Mutator method tables ─────────────────────────────────────────────────

    const arrayMutators = new Set(DEFAULT_ARRAY_MUTATORS.concat(extraMutators));
    const mapMutators = new Set(MAP_MUTATORS.concat(extraMutators));
    const setMutators = new Set(SET_MUTATORS.concat(extraMutators));
    const dateMutators = new Set(DATE_MUTATORS.concat(extraMutators));
    const objectMutators = new Set(extraMutators);

    /** Method names to intercept for a given raw object. */
    const mutatorsFor = (obj) => {
        if (Array.isArray(obj)) return arrayMutators;
        switch (Object.prototype.toString.call(obj)) {
            case '[object Map]': return mapMutators;
            case '[object Set]': return setMutators;
            case '[object Date]': return dateMutators;
            default: return objectMutators;
        }
    };

    // ── Reporting ─────────────────────────────────────────────────────────────

    /** Reports through `onError`; a throwing handler can never break the caller. */
    const reportError = (message, context) => {
        try {
            userOnError(message, context);
        } catch (err) {
            console.error('[DXObject] onError handler threw', err);
        }
    };

    /** Calls `onMutation`; a throwing callback is reported, never propagated. */
    const fire = (path, payload, parentProxy) => {
        if (!onMutation) return;
        try {
            onMutation(path, payload, parentProxy, target);
        } catch (err) {
            reportError('onMutation threw an unhandled exception', { err, path, payload });
        }
    };

    /**
     * Emits a mutation that happened on a real proxy. The path is resolved from
     * `node` plus an optional last `key`.
     */
    const notify = (node, key, payload, parentProxy) => {
        if (!onMutation) return;
        const path = resolvePath(node);
        if (path === null) {
            reportError(
                'Mutation on an object that is no longer part of the tree — onMutation skipped',
                { key, payload }
            );
            return;
        }
        if (key !== undefined) path.push(key);
        fire(path, payload, parentProxy);
    };

    /** Calls `onUndefined`; a throwing callback is reported and ignored. */
    const callOnUndefined = (path, parentProxy) => {
        try {
            return onUndefined(path, parentProxy, target);
        } catch (err) {
            reportError('onUndefined threw an unhandled exception', { err, path });
            return undefined;
        }
    };

    /** Best-effort path of `key` under `node`, for error contexts. */
    const pathWith = (node, key) => pathOfRel(node, [key]);

    // The proxy of the root target; set once the proxy has been created.
    let rootProxy;

    /** Reads `path` through the root proxy, so objects come back as proxies. */
    const proxyAt = (path) => {
        let current = rootProxy;
        for (let i = 0; i < path.length; i++) current = current[path[i]];
        return current;
    };

    // ── Path materialisation ──────────────────────────────────────────────────

    /**
     * Walks `path` inside `root`, creating intermediate objects or arrays as
     * needed, then assigns `value` at the final key.
     *
     * Safety violations are reported through `onError` and abort the write.
     * Assigning to a frozen or otherwise read-only object throws, so callers
     * must guard it.
     *
     * @param {Object}   root  - The raw (unwrapped) root target.
     * @param {string[]} path  - Full path to the property to assign.
     * @param {any}      value - Raw value to assign at the final key.
     * @returns {Object|undefined} The direct parent of the assigned key,
     *   or `undefined` if the write was blocked by a safety guard.
     */
    const materializePath = (root, path, value) => {
        // Should never happen in normal usage; guard against direct misuse.
        if (!path || path.length === 0) {
            reportError('Path cannot be empty', { path, value });
            return;
        }

        let current = root;

        for (let i = 0; i < path.length - 1; i++) {
            const key = path[i];

            if (isDangerousKey(key)) {
                reportError(`Prototype Pollution blocked at intermediate key: "${key}"`, { path, key, value });
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

            current = unwrap(current[key]);
        }

        const finalKey = path[path.length - 1];

        if (isDangerousKey(finalKey)) {
            reportError(`Prototype Pollution blocked at final key: "${finalKey}"`, { path, finalKey, value });
            return;
        }

        current[finalKey] = value;
        return current;
    };

    // ── Ghost proxies ─────────────────────────────────────────────────────────

    /**
     * A self-referential ghost returned when `maxDepth` is reached. Every
     * property read returns the same proxy (no path growth, no allocation).
     * Any write or call attempt calls `onError` and is dropped.
     *
     * It is callable so that `push(...)` at the limit is reported instead of
     * throwing "not a function".
     *
     * @param {Object}   base - Node of the real object the ghost chain hangs from.
     * @param {string[]} rel  - Keys from `base` to the ghost (used in messages only).
     * @returns {Proxy}
     */
    const createTerminalGhost = (base, rel) => {
        // `terminalProxy` must be declared before the Proxy is created so the
        // getter closure can reference it (self-referential).
        let terminalProxy;

        const describe = () => pathOfRel(base, rel).join('.');

        terminalProxy = new Proxy(() => {}, {
            get: createBaseGhostGetter(() => terminalProxy),

            set() {
                reportError(
                    `maxDepth (${maxDepth}) exceeded — write blocked`,
                    { path: describe(), maxDepth }
                );
                return true;
            },

            apply() {
                reportError(
                    `maxDepth (${maxDepth}) exceeded — call blocked`,
                    { path: describe(), maxDepth }
                );
                return undefined;
            },

            has()                          { return false; },
            ownKeys()                      { return []; },
            getOwnPropertyDescriptor()     { return undefined; },
            defineProperty()               { return false; },
            preventExtensions()            { return false; },
        });

        ghostSet.add(terminalProxy);
        return terminalProxy;
    };

    /**
     * Creates a normal ghost proxy. Reads extend the chain recursively; writes
     * materialise the path and call `onMutation`.
     *
     * A ghost remembers the real object it hangs from (`base`) and the keys
     * below it (`rel`), not an absolute path, so it still writes to the right
     * place if that object moved inside its array in the meantime.
     *
     * Once the path would reach `maxDepth`, returns a terminal ghost instead.
     * A ghost named like an array mutator (`push`, `sort`, …) is callable:
     * calling it creates the array on the parent path.
     *
     * @param {Object}   base - Node of the real object the ghost chain hangs from.
     * @param {string[]} rel  - Keys from `base` to this ghost (never empty).
     * @param {Function} [onMaterialize] - Notifies the real parent that its cached
     *   ghost needs cleanup.
     * @returns {Proxy}
     */
    const makeGhost = (base, rel, onMaterialize) => {
        if (base.depth + rel.length >= maxDepth) return createTerminalGhost(base, rel);

        const children = new Map();
        const method = rel[rel.length - 1];
        const callable = arrayMutators.has(method);

        // Called once the array mutator `method` has produced `result` on the
        // array living at `arrayPath`.
        const emitMutator = (arrayPath, rawArgs, result, array) => {
            if (onMutation) fire(arrayPath, { method, args: rawArgs, result }, proxyAt(arrayPath));
            return result === array ? proxyAt(arrayPath) : result;
        };

        /** Best-effort dotted path of this ghost, for error contexts. */
        const describeRel = () => pathOfRel(base, rel).join('.');

        const ghost = new Proxy(callable ? () => {} : {}, {
            get: createBaseGhostGetter((key) => {
                const basePath = resolvePath(base);

                if (basePath !== null) {
                    const fullPath = basePath.concat(rel, [key]);

                    // The path may have been created since this ghost was handed
                    // out: then it reads through to the real value.
                    if (readPath(target, fullPath) !== NOT_FOUND) return proxyAt(fullPath);

                    if (onUndefined) {
                        const res = callOnUndefined(fullPath, ghost);
                        if (res !== undefined) return res;
                    }
                }

                let child = children.get(key);
                if (!child) {
                    child = makeGhost(base, rel.concat([key]), onMaterialize);
                    children.set(key, child);
                }
                return child;
            }),

            set(_t, prop, value) {
                if (typeof prop === 'symbol') {
                    reportError('Symbol keys cannot be auto-vivified', { path: describeRel(), prop });
                    return true;
                }

                // Dangerous key on the ghost's own prop — block immediately.
                if (isDangerousKey(prop)) {
                    reportError(`Prototype Pollution blocked at final key: "${prop}"`, { path: describeRel(), finalKey: prop, value });
                    return true;
                }

                const basePath = resolvePath(base);
                if (basePath === null) {
                    reportError(
                        'Write through a ghost whose parent is no longer part of the tree — write dropped',
                        { key: prop, value }
                    );
                    return true;
                }

                const fullPath = basePath.concat(rel, [prop]);
                const raw = unwrap(value);

                try {
                    if (!materializePath(target, fullPath, raw)) return true; // blocked: already reported
                } catch (err) {
                    reportError('Could not materialise the path', { err, path: fullPath, value: raw });
                    return true;
                }

                if (onMaterialize) onMaterialize();

                if (onMutation) {
                    let parentProxy;
                    try {
                        parentProxy = proxyAt(fullPath.slice(0, -1));
                    } catch (err) {
                        reportError('Could not resolve the parent of the new value — onMutation skipped', { err, path: fullPath });
                        return true;
                    }
                    fire(fullPath, raw, parentProxy);
                }
                return true;
            },

            apply(_t, _this, args) {
                const arrayRel = rel.slice(0, -1);
                const basePath = resolvePath(base);
                if (basePath === null) {
                    reportError(
                        `Call to "${method}" through a ghost whose parent is no longer part of the tree — dropped`,
                        { method }
                    );
                    return undefined;
                }

                const arrayPath = basePath.concat(arrayRel);
                if (arrayPath.length === 0) {
                    reportError(`"${method}" cannot be called on the root object: it is not an array`, { method });
                    return undefined;
                }

                const rawArgs = args.map(unwrap);
                const existing = readPath(target, arrayPath);

                // The array appeared after this ghost was handed out: act on it.
                if (existing !== NOT_FOUND && existing !== null && existing !== undefined) {
                    if (!Array.isArray(existing) || typeof existing[method] !== 'function') {
                        reportError(
                            `Cannot call "${method}": "${arrayPath.join('.')}" is not an array`,
                            { method, path: arrayPath }
                        );
                        return undefined;
                    }
                    const live = existing[method].apply(existing, rawArgs);
                    return emitMutator(arrayPath, rawArgs, live, existing);
                }

                // Run the method on a scratch array; if it ends up holding
                // something, that array becomes the real one.
                const scratch = [];
                if (typeof scratch[method] !== 'function') {
                    reportError(`"${method}" is not an Array method`, { method, path: arrayPath });
                    return undefined;
                }
                const result = scratch[method].apply(scratch, rawArgs);
                if (scratch.length === 0) return result; // pop / shift / … on nothing

                try {
                    if (!materializePath(target, arrayPath, scratch)) return undefined; // blocked: already reported
                    if (onMaterialize) onMaterialize();
                } catch (err) {
                    reportError('Could not materialise the path', { err, path: arrayPath, value: scratch });
                    return undefined;
                }
                return emitMutator(arrayPath, rawArgs, result, scratch);
            },

            has()                          { return false; },
            ownKeys()                      { return []; },
            getOwnPropertyDescriptor()     { return undefined; },
            defineProperty() {
                reportError('defineProperty is not supported on a ghost: assign the value instead', { path: describeRel() });
                return false;
            },
            preventExtensions()            { return false; },
        });

        ghostSet.add(ghost);
        return ghost;
    };

    // ── Real object proxy ─────────────────────────────────────────────────────

    /**
     * Wraps a real (already-existing) object with a full observable Proxy.
     *
     * Proxies are cached per parent and key, not per raw object: the same path
     * always yields the same proxy, while an object reachable from two paths
     * gets one proxy per path and each reports its own.
     *
     * @param {{raw: Object, parent: Object|null, key: string|null, depth: number}} node
     *   Position of the object in the tree.
     * @returns {Proxy}
     */
    const createRealProxy = (node) => {
        const obj = node.raw;
        const plain = isPlainObjectOrArray(obj);
        const isArray = Array.isArray(obj);
        const mutators = mutatorsFor(obj);

        // Both caches are created on first use: most proxies never need one.
        // key → { raw, proxy }: proxies of existing child objects.
        let children = null;
        // key → ghost: ghosts of missing properties (stable across reads).
        let ghosts = null;

        let proxy;

        /** Drops the cached proxy / ghost of `key`. */
        const forget = (key) => {
            if (children) children.delete(key);
            if (ghosts) ghosts.delete(key);
        };

        /** The proxy for the child object `raw` stored under `key`. */
        const childProxy = (key, raw) => {
            const cached = children && children.get(key);
            if (cached && cached.raw === raw) return cached.proxy;
            const child = createRealProxy({ raw, parent: node, key, depth: node.depth + 1 });
            if (!children) children = new Map();
            children.set(key, { raw, proxy: child });
            return child;
        };

        /** The ghost for the missing property `key`. */
        const ghostFor = (key) => {
            let ghost = ghosts && ghosts.get(key);
            if (!ghost) {
                ghost = makeGhost(node, [key], () => { if (ghosts) ghosts.delete(key); });
                if (!ghosts) ghosts = new Map();
                ghosts.set(key, ghost);
            }
            return ghost;
        };

        /** Wraps an in-place mutator so it emits one structured event per call. */
        const wrapMutator = (name, fn) => (...args) => {
            const rawArgs = args.map(unwrap);
            const result = fn.apply(obj, rawArgs);

            // Elements may have moved: drop the per-index proxies.
            if (children) children.clear();

            notify(node, undefined, { method: name, args: rawArgs, result }, proxy);

            // sort / reverse / Map#set / Set#add return the object itself.
            return result === obj ? proxy : result;
        };

        /**
         * Wraps includes / indexOf / lastIndexOf: look for the raw argument in
         * the raw array first, then (only when searching for an object, the one
         * case where a stored proxy can differ from the raw value) in a copy with
         * every stored proxy unwrapped.
         */
        const wrapIdentitySearch = (fn) => (...args) => {
            const rawArgs = args.map(unwrap);
            let result = fn.apply(obj, rawArgs);
            if ((result === -1 || result === false) && rawArgs[0] !== null && typeof rawArgs[0] === 'object') {
                result = fn.apply(obj.map(unwrap), rawArgs);
            }
            return result;
        };

        proxy = new Proxy(obj, {
            get(t, prop, receiver) {
                if (prop === 'isProxy') return true;

                // Native objects and class instances run accessors on the raw
                // target (internal slots / private fields are out of a proxy's reach).
                const self = plain ? receiver : t;

                if (typeof prop === 'symbol') {
                    const symbolValue = Reflect.get(t, prop, self);
                    return typeof symbolValue === 'function' && !plain
                        ? symbolValue.bind(t)
                        : symbolValue;
                }

                // Prototype-chain keys never expose inherited values; only an own
                // data property with that name is plain user data.
                if (isDangerousKey(prop)) {
                    const own = Object.getOwnPropertyDescriptor(t, prop);
                    if (!own || !('value' in own)) return undefined;
                }

                const val = Reflect.get(t, prop, self);

                // Framework internals pass through unmodified.
                if (prop === '__ngContext__') return val;

                if (typeof val === 'function') {
                    // Intercept in-place mutators to emit a structured payload.
                    if (mutators.has(prop)) return wrapMutator(prop, val);

                    if (isArray && IDENTITY_SEARCH_METHODS.has(prop)) return wrapIdentitySearch(val);

                    // Native objects (Date, Map, Set, RegExp …) rely on internal
                    // slots that are inaccessible through a Proxy. Bind their
                    // methods to the raw target so slot access does not throw.
                    // For plain objects, return the function unbound so that any
                    // getters or setters it invokes use the Proxy as `this`,
                    // preserving reactivity.
                    return plain ? val : val.bind(t);
                }

                if (Reflect.has(t, prop)) {
                    // A proxy stored in the raw tree is unwrapped; a stored ghost
                    // reads as the `undefined` it stands for.
                    const raw = unwrap(val);

                    if (raw === null || typeof raw !== 'object') return raw;

                    // A proxy cannot report a different value for a property that
                    // is both read-only and non-configurable (it would throw).
                    const descriptor = Reflect.getOwnPropertyDescriptor(t, prop);
                    if (descriptor && descriptor.configurable === false && descriptor.writable === false) {
                        return val;
                    }

                    // Recursively wrap nested objects.
                    return childProxy(prop, raw);
                }

                // Missing property from here on.
                if (PROBE_KEYS.has(prop)) return undefined;

                if (onUndefined) {
                    const path = resolvePath(node);
                    if (path !== null) {
                        const res = callOnUndefined(path.concat([prop]), receiver);
                        if (res !== undefined) return res;
                    }
                }

                // Property does not exist yet — return a stable cached ghost.
                // Caching ensures the same reference is returned on every read,
                // preventing false change-detection cycles in frameworks like Angular.
                return ghostFor(prop);
            },

            set(t, prop, value, receiver) {
                if (typeof prop === 'symbol') return Reflect.set(t, prop, value, receiver);

                // Block prototype-chain poisoning on real objects too.
                if (isDangerousKey(prop)) {
                    reportError(`Prototype Pollution blocked at key: "${prop}"`, { path: pathWith(node, prop), key: prop, value });
                    return true;
                }

                // Store raw values only: a proxy would be wrapped a second time on
                // read (and fire twice), and a ghost stands for `undefined`.
                const raw = unwrap(value);

                let unchanged = false;
                if (skipUnchanged) {
                    const descriptor = Object.getOwnPropertyDescriptor(t, prop);
                    unchanged = !!descriptor && 'value' in descriptor && Object.is(unwrap(descriptor.value), raw);
                }

                // Invalidate the cached proxies for this key — the property now
                // holds a different value, so future reads must resolve it again.
                forget(prop);
                if (isArray && prop === 'length' && children) children.clear();

                // Reflect.set with `receiver` correctly handles inherited
                // setters defined via Object.defineProperty.
                const success = Reflect.set(t, prop, raw, receiver);

                // A write that lands on another object (e.g. `Object.create(proxy)`)
                // is not a mutation of this tree.
                if (success && !unchanged && receiver === proxy) {
                    notify(node, prop, raw, proxy);
                }

                return success;
            },

            deleteProperty(t, prop) {
                if (typeof prop === 'symbol') return Reflect.deleteProperty(t, prop);

                if (isDangerousKey(prop)) {
                    reportError(`Prototype Pollution blocked at key: "${prop}"`, { path: pathWith(node, prop), key: prop });
                    return true;
                }

                const existed = hasOwn(t, prop);
                const value = existed ? unwrap(Reflect.get(t, prop)) : undefined;
                const success = Reflect.deleteProperty(t, prop);
                if (success) {
                    forget(prop);
                    if (existed) notify(node, prop, { property: prop, value }, proxy);
                }
                return success;
            },

            // Defining a dangerous key directly would bypass the `set` guard.
            // This is not a mutation hook: `Reflect.set` with this proxy as
            // receiver ends up here too, and `set` already reports those.
            // The one case that cannot be dropped silently is an explicit
            // `configurable: false`: the Proxy invariants forbid pretending such a
            // property was added, so that call fails with a TypeError.
            defineProperty(t, prop, descriptor) {
                if (typeof prop === 'string' && isDangerousKey(prop)) {
                    reportError(`Prototype Pollution blocked at key: "${prop}"`, { path: pathWith(node, prop), key: prop });
                    return descriptor.configurable !== false;
                }
                return Reflect.defineProperty(t, prop, descriptor);
            },

            setPrototypeOf() {
                reportError('Changing the prototype is blocked', { path: resolvePath(node) || [] });
                return true;
            },
        });

        rawOf.set(proxy, obj);
        return proxy;
    };

    rootProxy = createRealProxy({ raw: target, parent: null, key: null, depth: 0 });
    return rootProxy;
}
