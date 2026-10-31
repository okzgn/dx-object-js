import { DXObject } from '../index.js';

/**
 * Builds a DXObject that records every `onMutation` / `onError` call.
 * Paths are joined with "." so assertions stay readable.
 */
export function observe(target, options) {
    const events = [];
    const errors = [];

    const d = DXObject(target === undefined ? {} : target, Object.assign({
        onMutation: (path, payload, parent, root) => {
            events.push({ path: path.join('.'), payload, parent, root });
        },
        onError: (message, context) => {
            errors.push({ message, context });
        },
    }, options));

    return { d, events, errors };
}

/** Snapshot of a proxy as plain JSON (works for real proxies and ghosts). */
export const plain = (value) => JSON.parse(JSON.stringify(value));

const POLLUTION_KEYS = ['p1', 'p2', 'p3', 'p4', 'p5', 'polluted'];

/** Removes anything a failed pollution test may have leaked onto Object.prototype. */
export function cleanPrototype() {
    POLLUTION_KEYS.forEach((key) => { delete Object.prototype[key]; });
}
