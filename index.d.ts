/**
 * Type definitions for DXObject
 * @module DXObject
 */

/**
 * Metadata object emitted by `onMutation` when an Array mutator method is
 * called (`push`, `pop`, `shift`, `unshift`, `splice`, `sort`, `reverse`).
 */
export interface ArrayMutationPayload {
    method: string;
    args: any[];
    result: any;
}

/**
 * Metadata object emitted by `onMutation` when a property was deleted.
 */
export interface PropertyDeletionPayload {
    property: string;
    value: any;
}

/**
 * Callback invoked after every successful mutation on the proxied target.
 */
export type OnMutationCallback<T> = (
    path: string[],
    /**
     * - Scalar assignment: the raw assigned value (any)
     * - Array mutator: ArrayMutationPayload
     * - Property deletion: PropertyDeletionPayload
     */
    payload: any | ArrayMutationPayload | PropertyDeletionPayload,
    parentProxy: any,
    root: T
) => void;

/**
 * Callback invoked when DXObject intercepts an invalid or dangerous operation.
 */
export type OnErrorCallback = (message: string, context?: Record<string, any>) => void;

/**
 * Callback invoked every time that property doesn't exist was accessed.
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
    /** Called when DXObject blocks a dangerous operation. */
    onError?: OnErrorCallback;
    /** Additional array method names to intercept. */
    arrayMutators?: string[];
    /** Maximum ghost-chain depth before writes are blocked. */
    depth?: number;
}

/**
 * Wraps `target` in a recursive observable Proxy with auto-vivification.
 * 
 * @template T The shape of the target object.
 * @param target The plain object or array to observe.
 * @param options Configuration options.
 * @returns A fully transparent, deeply observable proxy over `target`.
 */
export function DXObject<T extends object>(target: T, options?: DXObjectOptions<T>): T;