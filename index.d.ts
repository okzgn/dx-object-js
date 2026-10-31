/**
 * Type definitions for DXObject
 * @module DXObject
 */

/**
 * Metadata object emitted by `onMutation` when a mutator method is called.
 *
 * Built-in mutators: `push`, `pop`, `shift`, `unshift`, `splice`, `sort` and
 * `reverse` on arrays; `set`, `delete` and `clear` on `Map`; `add`, `delete` and
 * `clear` on `Set`; the `set*` methods on `Date`. Add more with the
 * `arrayMutators` option.
 */
export interface MethodMutationPayload {
    method: string;
    /** Arguments of the call, unwrapped (proxies are replaced by raw objects). */
    args: any[];
    result: any;
}

/**
 * Former name of {@link MethodMutationPayload}, kept as an alias.
 */
export type ArrayMutationPayload = MethodMutationPayload;

/**
 * Metadata object emitted by `onMutation` when a property was deleted.
 */
export interface PropertyDeletionPayload {
    property: string;
    value: any;
}

/**
 * Callback invoked after every successful mutation on the proxied target.
 *
 * If it throws, the error is routed to `onError`; the mutation has already
 * been applied.
 */
export type OnMutationCallback<T> = (
    /** One string per level, e.g. `['user', 'address', 'city']`. */
    path: string[],
    /**
     * - Scalar assignment: the raw assigned value (any)
     * - Mutator method: MethodMutationPayload
     * - Property deletion: PropertyDeletionPayload
     */
    payload: any | MethodMutationPayload | PropertyDeletionPayload,
    /**
     * Proxy of the object that was mutated: the parent of the key for
     * assignments and deletions, the array / Map / Set / Date itself for
     * mutator methods.
     */
    parentProxy: any,
    root: T
) => void;

/**
 * Callback invoked when DXObject blocks an invalid or dangerous operation, or
 * when one of your callbacks throws. Defaults to `console.error`.
 */
export type OnErrorCallback = (message: string, context?: Record<string, any>) => void;

/**
 * Callback invoked every time a property that doesn't exist is accessed.
 * Returns a value to override the default Ghost Proxy creation.
 * If `undefined` is returned, the default Ghost Proxy is created.
 */
export type OnUndefinedCallback<T> = (
    path: string[],
    parentProxy: any,
    root: T
) => any;

/**
 * Configuration object accepted as the second argument of `DXObject`.
 */
export interface DXObjectOptions<T> {
    /** Called after every successful mutation. */
    onMutation?: OnMutationCallback<T>;
    /** Called every time a property that doesn't exist is accessed. */
    onUndefined?: OnUndefinedCallback<T>;
    /** Called when DXObject blocks a dangerous operation or a callback throws. */
    onError?: OnErrorCallback;
    /** Additional method names to intercept (e.g. `['fill', 'copyWithin']`). */
    arrayMutators?: string[];
    /**
     * Maximum length of any path created through ghosts, counted from the root.
     * Clamped to `[1, 100]`; defaults to `10`.
     */
    depth?: number;
    /**
     * Skip `onMutation` when an assignment stores a value that is
     * `Object.is`-equal to the one already under an existing key.
     * Defaults to `false`.
     */
    skipUnchanged?: boolean;
}

type Primitive = string | number | bigint | boolean | symbol | null | undefined;

/** Values DXObject never descends into when typing (they are not "containers"). */
type Leaf = Primitive | Function | Date | RegExp | Map<any, any> | Set<any>
    | WeakMap<any, any> | WeakSet<any> | Promise<any> | Error;

/**
 * Makes every nested property optional, so an initial value may be partial.
 */
export type DeepPartial<T> =
    T extends Leaf ? T
    : T extends readonly (infer U)[] ? DeepPartial<U>[]
    : { [K in keyof T]?: DeepPartial<T[K]> };

/** Keys of `T` whose value is an object or array (anything DXObject vivifies). */
type ContainerKeys<T> = {
    [K in keyof T]-?: Exclude<T[K], undefined> extends Leaf ? never : K;
}[keyof T];

/**
 * What the proxy looks like to the type checker: every nested object or array
 * is readable and writable even if it was optional, because reading a missing
 * one returns a ghost that materialises on write. Leaf values keep their
 * declared type, `| undefined` included: a missing leaf is not a ghost-free
 * `undefined` at runtime, so check it with `'key' in obj` or `isGhost`.
 *
 * A property declared `X | null` stays `X | null`: `null` is a real value and
 * is not vivified.
 */
export type Vivified<T> =
    T extends Leaf ? T
    : T extends readonly (infer U)[] ? Vivified<U>[]
    : { [K in ContainerKeys<T>]-?: Vivified<Exclude<T[K], undefined>> }
      & { [K in Exclude<keyof T, ContainerKeys<T>>]: T[K] };

/**
 * Wraps `target` in a recursive observable Proxy with auto-vivification.
 *
 * Pass the shape of the data as the type argument to get typed access to paths
 * that do not exist yet:
 *
 * ```ts
 * interface Form { user?: { address?: { city?: string } } }
 * const form = DXObject<Form>({});
 * form.user.address.city = 'Madrid'; // typed, no optional chaining needed
 * ```
 *
 * Without a type argument, `DXObject({})` and `DXObject()` give an untyped
 * (`Record<string, any>`) proxy.
 *
 * @template T The shape of the target object.
 * @param target The plain object or array to observe. Defaults to `{}`.
 * @param options Configuration options.
 * @returns A fully transparent, deeply observable proxy over `target`.
 */
export function DXObject(
    target?: Record<string, never>,
    options?: DXObjectOptions<Record<string, any>>
): Record<string, any>;
export function DXObject<T extends object = Record<string, any>>(
    target?: DeepPartial<T> | T,
    options?: DXObjectOptions<T>
): Vivified<T>;

/**
 * Returns the raw object behind a DXObject proxy, e.g. to hand it to
 * `structuredClone`. Ghosts become `undefined`; any other value is returned
 * untouched.
 */
export function toRaw<T>(value: T): T;

/**
 * Returns `true` when `value` is a ghost, i.e. a stand-in for a property that
 * does not exist. Ghosts are always truthy, so this is how to tell "missing"
 * from "present".
 */
export function isGhost(value: unknown): boolean;
