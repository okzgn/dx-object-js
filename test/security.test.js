import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { DXObject } from '../index.js';
import { observe, cleanPrototype } from './helpers.js';

afterEach(cleanPrototype);

const swallow = (fn) => { try { fn(); } catch (e) { /* a TypeError from writing on undefined is fine */ } };

describe('prototype pollution', () => {
    it('does not expose Object.prototype through __proto__', () => {
        const { d } = observe({ a: {} });

        swallow(() => { d.a.__proto__.p1 = 1; });
        swallow(() => { d.__proto__.p1 = 1; });

        assert.equal(({}).p1, undefined);
        assert.equal(d.a.__proto__, undefined);
    });

    it('does not expose Object.prototype through constructor.prototype', () => {
        const { d } = observe({ a: {} });

        swallow(() => { d.a.constructor.prototype.p2 = 1; });

        assert.equal(({}).p2, undefined);
        assert.equal(d.a.constructor, undefined);
        assert.equal(d.a.prototype, undefined);
    });

    it('is not fooled by a vulnerable recursive merge', () => {
        const { d } = observe({});
        const merge = (target, source) => {
            Object.keys(source).forEach((key) => {
                if (source[key] && typeof source[key] === 'object') merge(target[key], source[key]);
                else target[key] = source[key];
            });
        };

        swallow(() => merge(d, JSON.parse('{"__proto__":{"p3":1}}')));
        swallow(() => merge(d, JSON.parse('{"constructor":{"prototype":{"p3":1}}}')));

        assert.equal(({}).p3, undefined);
    });

    it('blocks ghost chains through dangerous keys', () => {
        const { d } = observe();

        swallow(() => { d.x.__proto__.p4 = 1; });
        swallow(() => { d.x.constructor.prototype.p4 = 1; });

        assert.equal(({}).p4, undefined);
        assert.equal('x' in d, false);
    });

    it('drops writes to dangerous keys, reports them and does not throw', () => {
        const { d, errors } = observe({ a: {} });

        assert.doesNotThrow(() => { d.__proto__ = { p5: 1 }; });
        assert.doesNotThrow(() => { d.a.constructor = 'x'; });
        assert.doesNotThrow(() => { d.a.prototype = 'x'; });

        assert.equal(errors.length, 3);
        assert.equal(Object.getPrototypeOf(d), Object.prototype);
        assert.equal(({}).p5, undefined);
        assert.deepEqual(Object.keys(d.a), []);
    });

    it('drops dangerous keys at any level of a ghost write', () => {
        const { d, errors } = observe();

        assert.doesNotThrow(() => { d.a.b.__proto__ = 1; });
        assert.equal(errors.length, 1);
        assert.equal('a' in d, false);
    });

    it('blocks setPrototypeOf', () => {
        const { d, errors } = observe({});

        assert.doesNotThrow(() => Object.setPrototypeOf(d, null));

        assert.equal(Object.getPrototypeOf(d), Object.prototype);
        assert.equal(errors.length, 1);
    });

    it('blocks defineProperty on dangerous keys', () => {
        const { d, errors } = observe({});
        const descriptor = { value: { p1: 1 }, configurable: true, enumerable: true, writable: true };

        assert.doesNotThrow(() => Object.defineProperty(d, '__proto__', descriptor));
        assert.doesNotThrow(() => Object.defineProperty(d, 'constructor', descriptor));

        assert.deepEqual(Object.keys(d), []);
        assert.equal(errors.length, 2);
    });

    it('an explicit configurable:false define cannot be dropped silently: it fails and defines nothing', () => {
        const { d, errors } = observe({});

        assert.throws(() => Object.defineProperty(d, '__proto__', { value: { p1: 1 }, configurable: false }), TypeError);
        assert.equal(Reflect.defineProperty(d, 'constructor', { value: 1, configurable: false }), false);

        assert.deepEqual(Object.keys(d), []);
        assert.equal(({}).p1, undefined);
        assert.equal(errors.length, 2);
    });

    it('still allows defineProperty on normal keys', () => {
        const { d, errors } = observe({});
        Object.defineProperty(d, 'ok', { value: 1, configurable: true, enumerable: true, writable: true });

        assert.equal(d.ok, 1);
        assert.equal(errors.length, 0);
    });

    it('blocks deleting dangerous keys', () => {
        const { d, errors, events } = observe({});

        assert.doesNotThrow(() => { delete d.constructor; });
        assert.doesNotThrow(() => { delete d.__proto__; });

        assert.equal(errors.length, 2);
        assert.equal(events.length, 0);
    });

    it('treats own data properties named like dangerous keys as plain data', () => {
        const { d } = observe(JSON.parse('{"constructor":"Toyota","__proto__":{"p":1}}'));

        assert.equal(d.constructor, 'Toyota');
        assert.equal(d.__proto__.p, 1);
        assert.equal(({}).p, undefined);
    });

    it('keeps instanceof and prototype methods working', () => {
        const { d } = observe({ a: [1, 2] });

        assert.ok(d instanceof Object);
        assert.ok(d.a instanceof Array);
        assert.equal(typeof d.hasOwnProperty, 'function');
        assert.equal(d.hasOwnProperty('a'), true);
    });
});

describe('frozen and sealed targets', () => {
    it('reads through non-configurable, non-writable properties without throwing', () => {
        const d = DXObject(Object.freeze({ a: Object.freeze({ b: 1 }) }));

        assert.equal(d.a.b, 1);
    });

    it('works for objects frozen after wrapping', () => {
        const d = DXObject({ a: { b: 1 } });
        Object.freeze(d);

        assert.equal(d.a.b, 1);
    });
});

describe('blocked operations are consistent', () => {
    it('reports every blocked write through onError and never throws', () => {
        const { d, errors } = observe({}, { depth: 2 });

        assert.doesNotThrow(() => {
            d.__proto__ = 1;
            d.a.b.c = 1;
            d.x.__proto__ = 1;
        });
        assert.equal(errors.length, 3);
    });

    it('defaults onError to console.error', (t) => {
        const calls = [];
        t.mock.method(console, 'error', (...args) => { calls.push(args); });
        const d = DXObject({});

        d.__proto__ = 1;

        assert.equal(calls.length, 1);
        assert.equal(calls[0][0], '[DXObject]');
    });

    it('survives an onError handler that throws', (t) => {
        t.mock.method(console, 'error', () => {});
        const d = DXObject({}, { onError: () => { throw new Error('handler bug'); } });

        assert.doesNotThrow(() => { d.__proto__ = 1; });
    });
});
