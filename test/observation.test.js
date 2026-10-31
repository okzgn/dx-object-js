import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DXObject } from '../index.js';
import { observe, plain } from './helpers.js';

describe('assignment', () => {
    it('reports scalar assignment with path, value, parent proxy and root', () => {
        const raw = { user: { name: 'a' } };
        const { d, events } = observe(raw);
        d.user.name = 'Ana';

        assert.equal(events.length, 1);
        assert.equal(events[0].path, 'user.name');
        assert.equal(events[0].payload, 'Ana');
        assert.equal(events[0].parent, d.user);
        assert.equal(events[0].root, raw);
    });

    it('passes a proxy as parent when the write goes through a ghost', () => {
        const { d, events } = observe();
        d.a.b = 1;

        assert.equal(events[0].parent.isProxy, true);
        assert.equal(events[0].parent, d.a);
    });

    it('reports array index and length writes', () => {
        const { d, events } = observe({ l: [1, 2, 3] });
        d.l[1] = 9;
        d.l.length = 0;

        assert.deepEqual(events.map((e) => e.path), ['l.1', 'l.length']);
        assert.deepEqual(plain(d), { l: [] });
    });

    it('works with Object.assign', () => {
        const { d, events } = observe({});
        Object.assign(d, { a: 1, b: 2 });

        assert.deepEqual(events.map((e) => e.path), ['a', 'b']);
    });

    it('works with an array as the root target', () => {
        const { d, events } = observe([]);
        d.push({ id: 1 });
        d[0].id = 2;

        assert.deepEqual(events.map((e) => e.path), ['', '0.id']);
        assert.deepEqual(plain(d), [{ id: 2 }]);
    });

    it('ignores writes whose receiver is not the proxy itself', () => {
        const { d, events } = observe({});
        const child = Object.create(d);
        child.x = 1;

        assert.equal(events.length, 0);
    });

    it('does not fire for symbol keys', () => {
        const { d, events } = observe({});
        d[Symbol('s')] = 1;

        assert.equal(events.length, 0);
    });

    it('fires for unchanged values by default', () => {
        const { d, events } = observe({ a: 1 });
        d.a = 1;

        assert.equal(events.length, 1);
    });
});

describe('skipUnchanged', () => {
    it('suppresses events for Object.is-equal assignments to existing keys only', () => {
        const { d, events } = observe({ a: 1, n: NaN }, { skipUnchanged: true });

        d.a = 1;
        d.n = NaN;
        assert.equal(events.length, 0);

        d.a = 2;
        d.fresh = undefined;
        assert.deepEqual(events.map((e) => e.path), ['a', 'fresh']);
    });

    it('still writes the value', () => {
        const { d } = observe({ a: 1 }, { skipUnchanged: true });
        d.a = 2;

        assert.equal(d.a, 2);
    });
});

describe('deletion', () => {
    it('reports deleted properties with their previous value', () => {
        const { d, events } = observe({ field: 123 });
        delete d.field;

        assert.equal(events.length, 1);
        assert.equal(events[0].path, 'field');
        assert.deepEqual(events[0].payload, { property: 'field', value: 123 });
        assert.equal('field' in d, false);
    });

    it('does not report deleting a property that does not exist', () => {
        const { d, events } = observe({});
        delete d.nothing;

        assert.equal(events.length, 0);
    });

    it('a deleted key becomes a ghost again', () => {
        const { d } = observe({ a: { b: 1 } });
        delete d.a;
        d.a.c = 2;

        assert.deepEqual(plain(d), { a: { c: 2 } });
    });
});

describe('array methods', () => {
    it('reports every default mutator with a structured payload', () => {
        const { d, events } = observe({ l: [3, 1, 2] });

        d.l.push(4);
        d.l.pop();
        d.l.shift();
        d.l.unshift(0);
        d.l.splice(1, 1, 'x', 'y');
        d.l.sort();
        d.l.reverse();

        assert.deepEqual(events.map((e) => e.payload.method), ['push', 'pop', 'shift', 'unshift', 'splice', 'sort', 'reverse']);
        assert.deepEqual(events[0].payload, { method: 'push', args: [4], result: 4 });
        assert.deepEqual(events[4].payload.args, [1, 1, 'x', 'y']);
        assert.deepEqual(events[4].payload.result, [1]);
        assert.ok(events.every((e) => e.path === 'l'));
        assert.ok(events.every((e) => Array.isArray(e.parent)));
    });

    it('fires exactly one event per mutator call', () => {
        const { d, events } = observe({ l: [1, 2, 3] });
        d.l.splice(0, 1);

        assert.equal(events.length, 1);
    });

    it('supports extra arrayMutators', () => {
        const { d, events } = observe({ l: [1, 2, 3] }, { arrayMutators: ['fill'] });
        d.l.fill(0);

        assert.equal(events.length, 1);
        assert.equal(events[0].payload.method, 'fill');
        assert.deepEqual(plain(d), { l: [0, 0, 0] });
    });

    it('without extras, fill is seen as index writes', () => {
        const { d, events } = observe({ l: [1, 2] });
        d.l.fill(0);

        assert.deepEqual(events.map((e) => e.path), ['l.0', 'l.1']);
    });

    it('sort and reverse return the proxy so chaining stays observed', () => {
        const { d, events } = observe({ l: [1, 2, 3] });
        d.l.reverse().push(9);

        assert.deepEqual(events.map((e) => e.payload.method), ['reverse', 'push']);
        assert.equal(d.l.sort(), d.l);
    });

    it('read-only methods hand out proxied elements', () => {
        const { d, events } = observe({ items: [{ n: 1 }, { n: 2 }] });
        d.items.map((item) => item).forEach((item) => { item.n += 10; });

        assert.deepEqual(events.map((e) => e.path), ['items.0.n', 'items.1.n']);
    });

    it('indexOf / includes / lastIndexOf find raw objects and proxies alike', () => {
        const a = { n: 1 };
        const b = { n: 2 };
        const { d } = observe({ items: [a, b, a] });

        assert.equal(d.items.indexOf(a), 0);
        assert.equal(d.items.lastIndexOf(a), 2);
        assert.equal(d.items.includes(b), true);
        assert.equal(d.items.indexOf(d.items[1]), 1);
        assert.equal(d.items.includes({ n: 1 }), false);
        assert.equal(d.items.indexOf(b, 2), -1);
    });

    it('identity search copes with NaN and primitives', () => {
        const { d } = observe({ l: [1, NaN, 'x'] });

        assert.equal(d.l.includes(NaN), true);
        assert.equal(d.l.indexOf(NaN), -1);
        assert.equal(d.l.indexOf('x'), 2);
    });

    it('works with for..of, spread and Array.isArray', () => {
        const { d } = observe({ l: [1, 2, 3] });

        assert.ok(Array.isArray(d.l));
        assert.deepEqual([...d.l], [1, 2, 3]);
        const seen = [];
        for (const v of d.l) seen.push(v);
        assert.deepEqual(seen, [1, 2, 3]);
    });
});

describe('callbacks', () => {
    it('a throwing onMutation never breaks a real write and is reported', () => {
        const errors = [];
        const d = DXObject({}, {
            onMutation() { throw new Error('boom'); },
            onError: (message, context) => errors.push({ message, context }),
        });

        assert.doesNotThrow(() => { d.a = 1; });
        assert.doesNotThrow(() => { d.x.y = 1; });
        assert.doesNotThrow(() => { d.list.push(1); });
        assert.deepEqual(plain(d), { a: 1, x: { y: 1 }, list: [1] });
        assert.equal(errors.length, 3);
        assert.match(errors[0].message, /onMutation/);
        assert.equal(errors[0].context.err.message, 'boom');
    });

    it('options are optional and tolerate junk', () => {
        assert.doesNotThrow(() => DXObject({}));
        assert.doesNotThrow(() => DXObject({}, null));
        assert.doesNotThrow(() => DXObject({}, 'nope'));
        assert.doesNotThrow(() => DXObject({}, { onMutation: 1, onError: 'x', arrayMutators: 'push' }));

        const d = DXObject();
        d.a.b = 1;
        assert.deepEqual(plain(d), { a: { b: 1 } });
    });

    it('wrapping a proxy again observes the same raw object', () => {
        const raw = { a: 1 };
        const first = DXObject(raw);
        const { d, events } = observe(first);
        d.a = 2;

        assert.equal(raw.a, 2);
        assert.equal(events.length, 1);
    });
});

describe('native objects', () => {
    it('Map: methods, size and iteration work and mutations are reported', () => {
        const { d, events } = observe({ m: new Map([['a', 1]]) });

        assert.equal(d.m.size, 1);
        assert.equal(d.m.get('a'), 1);
        assert.deepEqual([...d.m], [['a', 1]]);

        const chained = d.m.set('b', 2);
        d.m.delete('a');
        d.m.clear();

        assert.equal(chained, d.m);
        assert.deepEqual(events.map((e) => e.payload.method), ['set', 'delete', 'clear']);
        assert.ok(events.every((e) => e.path === 'm'));
        assert.deepEqual(events[0].payload.args, ['b', 2]);
        assert.equal(events[1].payload.result, true);
    });

    it('Set: methods, size and iteration work and mutations are reported', () => {
        const { d, events } = observe({ s: new Set([1]) });

        assert.equal(d.s.size, 1);
        assert.equal(d.s.has(1), true);
        d.s.add(2);
        d.s.delete(1);

        assert.deepEqual([...d.s], [2]);
        assert.deepEqual(events.map((e) => e.payload.method), ['add', 'delete']);
    });

    it('Date: getters work and setters are reported', () => {
        const { d, events } = observe({ when: new Date(0) });

        assert.equal(d.when.getTime(), 0);
        d.when.setTime(86400000);
        d.when.setUTCFullYear(2000);

        assert.deepEqual(events.map((e) => e.payload.method), ['setTime', 'setUTCFullYear']);
        assert.equal(d.when.getUTCFullYear(), 2000);
    });

    it('RegExp accessors work', () => {
        const { d } = observe({ re: /ab+c/gi });

        assert.equal(d.re.source, 'ab+c');
        assert.equal(d.re.flags, 'gi');
        assert.equal(d.re.test('xABBc'), true);
    });

    it('Map values are not wrapped (documented)', () => {
        const inner = { n: 1 };
        const { d, events } = observe({ m: new Map([['k', inner]]) });
        d.m.get('k').n = 2;

        assert.equal(inner.n, 2);
        assert.equal(events.length, 0);
    });

    it('custom extra mutators apply to any object type', () => {
        const { d, events } = observe({ counter: { n: 0, inc() { this.n++; return this.n; } } }, { arrayMutators: ['inc'] });

        assert.equal(d.counter.inc(), 1);
        assert.equal(events.length, 1);
        assert.equal(events[0].payload.method, 'inc');
    });
});

describe('transparency', () => {
    it('JSON.stringify, Object.keys, in and spread work on real proxies', () => {
        const { d } = observe({ a: 1, b: { c: 2 } });

        assert.equal(JSON.stringify(d), '{"a":1,"b":{"c":2}}');
        assert.deepEqual(Object.keys(d), ['a', 'b']);
        assert.equal('a' in d, true);
        assert.equal('zzz' in d, false);
        assert.deepEqual({ ...d.b }, { c: 2 });
    });

    it('keeps null and primitives untouched', () => {
        const { d } = observe({ n: null, s: 'x', z: 0, f: false });

        assert.equal(d.n, null);
        assert.equal(d.s, 'x');
        assert.equal(d.z, 0);
        assert.equal(d.f, false);
    });

    it('null / undefined values are not vivified (documented)', () => {
        const { d } = observe({ n: null, u: undefined });

        assert.throws(() => { d.n.x = 1; }, TypeError);
        assert.throws(() => { d.u.x = 1; }, TypeError);
    });

    it('functions stored as data are returned as they are', () => {
        const fn = () => 42;
        const { d } = observe({ fn });

        assert.equal(d.fn, fn);
        assert.equal(d.fn(), 42);
    });

    it('methods on plain objects run with the proxy as `this` (stay reactive)', () => {
        const { d, events } = observe({ n: 0, inc() { this.n += 1; } });
        d.inc();

        assert.equal(d.n, 1);
        assert.deepEqual(events.map((e) => e.path), ['n']);
    });

    it('class instances: methods run on the raw object', () => {
        class Counter { constructor() { this.n = 0; } inc() { this.n += 1; return this.n; } }
        const { d } = observe({ c: new Counter() });

        assert.equal(d.c.inc(), 1);
        assert.equal(d.c.n, 1);
    });

    it('class instances with private fields keep working', () => {
        class Secret { #v = 7; get v() { return this.#v; } reveal() { return this.#v; } }
        const { d } = observe({ s: new Secret() });

        assert.equal(d.s.reveal(), 7);
        assert.equal(d.s.v, 7);
    });

    it('survives cyclic structures', () => {
        const raw = { name: 'root' };
        raw.self = raw;
        const { d, events } = observe(raw);

        d.self.self.name = 'changed';

        assert.equal(raw.name, 'changed');
        assert.equal(events[0].path, 'self.self.name');
    });
});
