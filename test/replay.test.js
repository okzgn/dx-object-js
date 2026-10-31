// Property test: the events fired by `onMutation` must be enough to rebuild the
// final state. Random operations hit a DXObject (including held proxies across
// reorders and ghost chains); every event is replayed onto an empty replica.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DXObject, toRaw } from '../index.js';

const clone = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

/** Small deterministic PRNG (mulberry32). */
function rng(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const isMethodPayload = (p) => p !== null && typeof p === 'object' && typeof p.method === 'string' && Array.isArray(p.args);
const isDeletionPayload = (p) => p !== null && typeof p === 'object' && typeof p.property === 'string' && 'value' in p && Object.keys(p).length === 2;

/** Applies one recorded event to the replica, creating containers like the library does. */
function applyEvent(replica, event) {
    const { path, kind } = event;

    const walk = (keys, create) => {
        let current = replica;
        for (let i = 0; i < keys.length; i++) {
            const next = keys[i + 1];
            if (current[keys[i]] === undefined || current[keys[i]] === null || typeof current[keys[i]] !== 'object') {
                if (!create) return undefined;
                current[keys[i]] = /^(0|[1-9]\d*)$/.test(next === undefined ? '' : next) ? [] : {};
            }
            current = current[keys[i]];
        }
        return current;
    };

    if (kind === 'method') {
        let array = walk(path, false);
        if (array === undefined) { walk(path.slice(0, -1), true)[path[path.length - 1]] = []; array = walk(path, false); }
        array[event.method].apply(array, clone(event.args));
    } else if (kind === 'delete') {
        delete walk(path.slice(0, -1), false)[path[path.length - 1]];
    } else {
        walk(path.slice(0, -1), true)[path[path.length - 1]] = clone(event.value);
    }
}

/** Every object / array node of the tree as { path, node }. */
function collect(root) {
    const out = [];
    const visit = (node, path) => {
        out.push({ path, node });
        Object.keys(node).forEach((key) => {
            if (node[key] !== null && typeof node[key] === 'object') visit(node[key], path.concat(key));
        });
    };
    visit(root, []);
    return out;
}

function runSeed(seed) {
    const random = rng(seed);
    const pick = (list) => list[Math.floor(random() * list.length)];
    const int = (n) => Math.floor(random() * n);

    const events = [];
    const errors = [];
    const raw = {};
    const d = DXObject(raw, {
        onMutation: (path, payload) => {
            if (isMethodPayload(payload)) events.push({ kind: 'method', path: path.slice(), method: payload.method, args: clone(payload.args) });
            else if (isDeletionPayload(payload)) events.push({ kind: 'delete', path: path.slice() });
            else events.push({ kind: 'set', path: path.slice(), value: clone(payload) });
        },
        onError: (message) => errors.push(message),
        depth: 100,
    });

    const access = (path) => path.reduce((proxy, key) => proxy[key], d);
    const scalar = () => (random() < 0.5 ? int(100) : 's' + int(100));
    const fresh = () => 'k' + int(1000000);
    let counter = 0;

    for (let step = 0; step < 40; step++) {
        const nodes = collect(raw);
        const { path, node } = pick(nodes);
        const target = access(path);
        const isArray = Array.isArray(node);
        const op = int(8);

        if (op === 0) {
            // assign a scalar to an existing or new key / index
            if (isArray) target[int(node.length + 1)] = scalar();
            else target[pick(['a', 'b', 'c', fresh()])] = scalar();
        } else if (op === 1 && !isArray) {
            // deep write through a ghost chain
            target[fresh()][fresh()][fresh()] = { v: counter++ };
        } else if (op === 2 && isArray) {
            const method = pick(['push', 'unshift', 'pop', 'shift', 'splice', 'sort', 'reverse']);
            if (method === 'push' || method === 'unshift') target[method]({ v: counter++ }, scalar());
            else if (method === 'splice') target.splice(int(node.length + 1), int(3), { v: counter++ });
            else target[method]();
        } else if (op === 3 && !isArray) {
            // array created by calling a mutator on a ghost
            const method = pick(['push', 'unshift']);
            target[fresh()][fresh()][method](scalar(), { v: counter++ });
        } else if (op === 4 && !isArray) {
            const keys = Object.keys(node);
            if (keys.length) delete target[pick(keys)];
        } else if (op === 5) {
            const value = random() < 0.5 ? { v: counter++ } : [scalar(), scalar()];
            if (isArray) target[int(node.length + 1)] = value;
            else target[pick(['a', 'b', 'c', fresh()])] = value;
        } else if (op === 6 && isArray && node.length > 1 && node.every((e) => e && typeof e === 'object' && !Array.isArray(e))) {
            // hold an element across a reorder, then mutate it
            const held = target[int(node.length)];
            const reorder = pick(['shift', 'unshift', 'reverse', 'sort']);
            if (reorder === 'unshift') target.unshift({ v: counter++ });
            else target[reorder]();
            const stillThere = toRaw(target).indexOf(toRaw(held)) !== -1;
            if (stillThere) held.held = counter++;
        } else if (op === 7 && !isArray) {
            // ghost write below an existing object, held across nothing
            const ghost = target[fresh()];
            ghost[fresh()] = scalar();
        }
    }

    const replica = {};
    events.forEach((event) => applyEvent(replica, event));
    assert.deepEqual(errors, [], `seed ${seed}`);
    assert.equal(JSON.stringify(replica), JSON.stringify(raw), `seed ${seed}`);
}

describe('event replay', () => {
    it('rebuilds the final state from the onMutation events (300 random sessions)', () => {
        for (let seed = 1; seed <= 300; seed++) runSeed(seed);
    });
});
