import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DXObject } from '../index.js';
import { observe, plain } from './helpers.js';

describe('auto-vivification', () => {
    it('materialises nested objects on assignment and reports the full path', () => {
        const { d, events } = observe();
        d.user.profile.name = 'John';

        assert.deepEqual(plain(d), { user: { profile: { name: 'John' } } });
        assert.equal(events.length, 1);
        assert.equal(events[0].path, 'user.profile.name');
        assert.equal(events[0].payload, 'John');
    });

    it('creates an array when the next key is an index', () => {
        const { d } = observe();
        d.list[0].name = 'first';

        assert.ok(Array.isArray(d.list));
        assert.deepEqual(plain(d), { list: [{ name: 'first' }] });
    });

    it('does not create anything on read alone', () => {
        const { d, events } = observe();
        void d.a.b.c;

        assert.deepEqual(Object.keys(d), []);
        assert.equal(events.length, 0);
    });

    it('passes the root target as the 4th onMutation argument', () => {
        const raw = {};
        const { d, events } = observe(raw);
        d.a.b = 1;

        assert.equal(events[0].root, raw);
    });
});

describe('array mutators on missing paths', () => {
    it('push creates the array (README example)', () => {
        const { d, events } = observe();
        d.cart.items.push({ id: 101 });

        assert.deepEqual(plain(d), { cart: { items: [{ id: 101 }] } });
        assert.equal(events.length, 1);
        assert.equal(events[0].path, 'cart.items');
        assert.deepEqual(events[0].payload, { method: 'push', args: [{ id: 101 }], result: 1 });
        assert.ok(Array.isArray(events[0].parent));
    });

    it('keeps observing the array once it exists', () => {
        const { d, events } = observe();
        d.list.push(1);
        d.list.push(2);

        assert.deepEqual(plain(d), { list: [1, 2] });
        assert.deepEqual(events.map((e) => e.payload.result), [1, 2]);
    });

    it('unshift and splice create the array when they insert something', () => {
        const a = observe();
        a.d.x.unshift('a', 'b');
        assert.deepEqual(plain(a.d), { x: ['a', 'b'] });

        const b = observe();
        b.d.y.splice(0, 0, 'z');
        assert.deepEqual(plain(b.d), { y: ['z'] });
    });

    it('pop, shift and removal-only splice are silent no-ops', () => {
        const { d, events, errors } = observe();

        assert.equal(d.l.pop(), undefined);
        assert.equal(d.l.shift(), undefined);
        d.l.splice(0, 1);

        assert.equal('l' in d, false);
        assert.equal(events.length, 0);
        assert.equal(errors.length, 0);
    });

    it('a ghost named like a mutator still behaves as a normal ghost', () => {
        const { d, events } = observe();
        d.cfg.sort.order = 'asc';

        assert.deepEqual(plain(d), { cfg: { sort: { order: 'asc' } } });
        assert.equal(events[0].path, 'cfg.sort.order');
    });

    it('only mutator-named ghosts are callable', () => {
        const { d } = observe();

        assert.equal(typeof d.nope, 'object');
        assert.equal(typeof d.nope.deeper, 'object');
        assert.equal(typeof d.nope.push, 'function');
    });

    it('reports a mutator called on the root instead of throwing', () => {
        const { d, errors } = observe();

        assert.doesNotThrow(() => d.push(1));
        assert.equal(errors.length, 1);
        assert.deepEqual(Object.keys(d), []);
    });

    it('respects extra arrayMutators names on ghosts', () => {
        const { d, events } = observe({}, { arrayMutators: ['fill'] });
        d.l.push(1, 2);
        d.l.fill(0);

        assert.deepEqual(plain(d), { l: [0, 0] });
        assert.equal(events[1].payload.method, 'fill');
    });
});

describe('depth limit', () => {
    it('blocks writes beyond `depth` and reports through onError without throwing', () => {
        const { d, errors } = observe({}, { depth: 3 });

        d.a.b.c = 1;
        assert.deepEqual(plain(d), { a: { b: { c: 1 } } });

        assert.doesNotThrow(() => { d.x.y.z.w = 1; });
        assert.equal(errors.length, 1);
        assert.match(errors[0].message, /maxDepth/);
        assert.equal('x' in d, false);
    });

    it('a mutator called past the limit reports instead of throwing', () => {
        const { d, errors } = observe({}, { depth: 2 });

        assert.doesNotThrow(() => d.a.b.push(1));
        assert.equal(errors.length, 1);
        assert.equal('a' in d, false);
    });

    it('falls back to the default (10) for null / NaN / non-numeric depth', () => {
        [null, NaN, 'abc', undefined].forEach((depth) => {
            const { d, errors } = observe({}, { depth });
            d.a.b.c.d.e = 1;
            assert.equal(errors.length, 0, `depth=${String(depth)}`);
        });
    });

    it('clamps depth to [1, 100]', () => {
        const low = observe({}, { depth: -5 });
        low.d.a = 1;
        assert.equal(low.errors.length, 0);

        const high = observe({}, { depth: 1000 });
        let node = high.d;
        for (let i = 0; i < 99; i++) node = node['k' + i];
        node.leaf = 1;
        assert.equal(high.errors.length, 0);
    });
});

describe('ghost behaviour', () => {
    it('is not serialised or enumerated', () => {
        const { d } = observe();

        assert.equal(JSON.stringify(d.nope), '{}');
        assert.deepEqual(Object.keys(d.nope), []);
        assert.equal('isProxy' in d.nope, false);
        assert.deepEqual({ ...d.nope }, {});
    });

    it('keeps the read-only isProxy marker for compatibility', () => {
        const { d } = observe({ a: {} });

        assert.equal(d.nope.isProxy, true);
        assert.equal(d.a.isProxy, true);
        assert.equal(d.isProxy, true);
    });

    it('returns the same ghost for repeated reads at any depth', () => {
        const { d } = observe();

        assert.equal(d.a, d.a);
        assert.equal(d.a.b, d.a.b);
        assert.equal(d.a.b.c, d.a.b.c);
    });

    it('is cleaned up once the path is materialised', () => {
        const { d } = observe();
        const before = d.a;
        d.a.b = 1;

        assert.notEqual(d.a, before);
        assert.equal(d.a.b, 1);
    });

    it('resolves to the real value if the path is created after the ghost was obtained', () => {
        const { d } = observe();
        const ghost = d.user;
        d.user = { name: 'x', address: { city: 'Madrid' } };

        assert.equal(ghost.name, 'x');
        assert.equal(ghost.address.city, 'Madrid');
        assert.equal(ghost.address, d.user.address);
    });

    it('a stale ghost writes into the real object, not over it', () => {
        const { d, events } = observe();
        const ghost = d.user;
        d.user = { a: 1 };
        events.length = 0;
        ghost.b = 2;

        assert.deepEqual(plain(d), { user: { a: 1, b: 2 } });
        assert.equal(events[0].path, 'user.b');
    });

    it('stringifies to "undefined" and has an empty iterator', () => {
        const { d } = observe();

        assert.equal(`${d.nope}`, 'undefined');
        assert.deepEqual([...d.nope], []);
    });

    it('returns undefined for framework / interop probe keys', () => {
        const { d } = observe({ a: {} });

        ['then', 'toJSON', '$$typeof', 'asymmetricMatch', 'nodeType', '__ngContext__'].forEach((key) => {
            assert.equal(d[key], undefined, `root.${key}`);
            assert.equal(d.nope[key], undefined, `ghost.${key}`);
            assert.equal(d.a[key], undefined, `nested.${key}`);
        });
    });

    it('is not mistaken for a thenable', async () => {
        const { d } = observe();
        assert.equal(await Promise.resolve(d), d);
    });

    it('JSON.stringify of a real proxy ignores missing toJSON', () => {
        const { d } = observe({ a: { b: 1 } });
        assert.equal(JSON.stringify(d), '{"a":{"b":1}}');
    });

    it('reports (does not store) symbol keys written through a ghost', () => {
        const { d, errors } = observe();

        assert.doesNotThrow(() => { d.nope[Symbol('x')] = 1; });
        assert.equal(errors.length, 1);
        assert.deepEqual(Object.keys(d), []);
    });

    it('cannot be redefined or frozen', () => {
        const { d } = observe();

        assert.throws(() => Object.defineProperty(d.nope, 'x', { value: 1 }), TypeError);
        assert.throws(() => Object.freeze(d.nope), TypeError);
    });

    it('assigning a ghost stores undefined, like plain JS', () => {
        const { d } = observe();
        d.x = d.missing;

        assert.equal('x' in d, true);
        assert.equal(d.x, undefined);
    });
});

describe('onUndefined', () => {
    it('overrides ghost creation when it returns a value', () => {
        const d = DXObject({}, {
            onUndefined: (path) => (path.indexOf('locked') !== -1 ? null : undefined),
        });

        assert.equal(d.locked, null);
        assert.equal(typeof d.user, 'object');
        assert.equal(d.user.locked, null);
    });

    it('receives path, parent proxy and root', () => {
        const calls = [];
        const raw = { a: {} };
        const d = DXObject(raw, { onUndefined: (path, parent, root) => { calls.push({ path, parent, root }); } });
        void d.a.missing;

        assert.deepEqual(calls[0].path, ['a', 'missing']);
        assert.equal(calls[0].parent, d.a);
        assert.equal(calls[0].root, raw);
    });

    it('a throwing onUndefined is reported and a ghost is used instead', () => {
        const errors = [];
        const d = DXObject({}, {
            onUndefined: () => { throw new Error('boom'); },
            onError: (message) => errors.push(message),
        });

        assert.doesNotThrow(() => { d.a.b = 1; });
        assert.deepEqual(plain(d), { a: { b: 1 } });
        assert.ok(errors.length >= 1);
    });
});
