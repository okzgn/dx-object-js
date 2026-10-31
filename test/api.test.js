import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as lib from '../index.js';
import { observe } from './helpers.js';

describe('toRaw', () => {
    it('returns the original target for the root proxy and for nested proxies', () => {
        const raw = { a: { b: 1 }, list: [1] };
        const { d } = observe(raw);

        assert.equal(lib.toRaw(d), raw);
        assert.equal(lib.toRaw(d.a), raw.a);
        assert.equal(lib.toRaw(d.list), raw.list);
    });

    it('returns anything else untouched', () => {
        const plainObject = {};

        assert.equal(lib.toRaw(plainObject), plainObject);
        assert.equal(lib.toRaw(5), 5);
        assert.equal(lib.toRaw(null), null);
        assert.equal(lib.toRaw('x'), 'x');
    });

    it('turns a ghost into undefined', () => {
        const { d } = observe();

        assert.equal(lib.toRaw(d.nope), undefined);
    });

    it('makes structuredClone possible', () => {
        const { d } = observe({ a: { b: [1, 2] }, when: new Date(0) });

        assert.throws(() => structuredClone(d));
        const copy = structuredClone(lib.toRaw(d));

        assert.deepEqual(copy.a, { b: [1, 2] });
        assert.equal(copy.when.getTime(), 0);
    });

    it('reflects later mutations (it is the live target, not a copy)', () => {
        const { d } = observe({});
        const raw = lib.toRaw(d);
        d.x.y = 1;

        assert.deepEqual(raw, { x: { y: 1 } });
    });
});

describe('isGhost', () => {
    it('distinguishes ghosts from real values', () => {
        const { d } = observe({ a: { b: 1 }, n: null, s: 'x' });

        assert.equal(lib.isGhost(d.missing), true);
        assert.equal(lib.isGhost(d.missing.deeper), true);
        assert.equal(lib.isGhost(d.missing.push), true);
        assert.equal(lib.isGhost(d), false);
        assert.equal(lib.isGhost(d.a), false);
        assert.equal(lib.isGhost(d.a.missing), true);
        assert.equal(lib.isGhost(d.n), false);
        assert.equal(lib.isGhost(d.s), false);
        assert.equal(lib.isGhost(undefined), false);
        assert.equal(lib.isGhost({}), false);
    });

    it('a ghost is truthy (documented limitation) but isGhost sees through it', () => {
        const { d } = observe();

        assert.ok(d.user);
        assert.equal(lib.isGhost(d.user), true);
    });

    it('is false once the path is real', () => {
        const { d } = observe();
        d.user.name = 'x';

        assert.equal(lib.isGhost(d.user), false);
    });

    it('is false for a ghost-turned-live value', () => {
        const { d } = observe();
        const ghost = d.user;
        d.user = { name: 'x' };

        assert.equal(lib.isGhost(ghost.name), false);
        assert.equal(lib.isGhost(ghost.address), true);
    });
});

describe('public surface', () => {
    it('exports exactly DXObject, toRaw and isGhost', () => {
        assert.deepEqual(Object.keys(lib).sort(), ['DXObject', 'isGhost', 'toRaw']);
    });
});
