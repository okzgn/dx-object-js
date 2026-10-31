// Every snippet in README.md / the JSDoc of index.js, run as written.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DXObject } from '../index.js';
import { plain } from './helpers.js';

describe('README examples', () => {
    it('Quick Start', () => {
        const logged = [];
        const data = DXObject({}, {
            onMutation: (path, value) => {
                logged.push(`Path: ${path.join('.')}, Value: ${JSON.stringify(value)}`);
            },
        });

        data.user.profile.name = 'John Doe';
        data.cart.items.push({ id: 101 });

        assert.deepEqual(logged, [
            'Path: user.profile.name, Value: "John Doe"',
            'Path: cart.items, Value: {"method":"push","args":[{"id":101}],"result":1}',
        ]);
    });

    it('Customizing "Not Found" Behavior', () => {
        const config = DXObject({}, {
            onUndefined: (path) => {
                if (path.includes('legacy')) return null;
                return undefined;
            },
        });

        assert.equal(config.legacy, null);
        assert.equal(config.section.legacy, null);
        assert.equal(typeof config.modern, 'object');
    });

    it('Safety & Depth Limits', () => {
        const alerts = [];
        const form = DXObject({}, {
            depth: 5,
            onError: (msg) => { alerts.push(`Security Warning: ${msg}`); },
        });

        form.a.b.c.d.e = 1;
        assert.equal(alerts.length, 0);

        form.a2.b.c.d.e.f = 1;
        assert.equal(alerts.length, 1);
        assert.match(alerts[0], /^Security Warning: maxDepth \(5\) exceeded/);
    });

    it('Property deletion payload', () => {
        const seen = [];
        const form = DXObject({ field: 123 }, { onMutation: (path, payload) => seen.push({ path, payload }) });
        delete form.field;

        assert.deepEqual(seen, [{ path: ['field'], payload: { property: 'field', value: 123 } }]);
    });

    it('Array payloads from the JSDoc', () => {
        const seen = [];
        const form = DXObject({ tags: [], scores: ['a', 'b', 'c'] }, { onMutation: (path, payload) => seen.push(payload) });
        form.tags.push('admin');
        form.scores.splice(1, 2);

        assert.deepEqual(seen, [
            { method: 'push', args: ['admin'], result: 1 },
            { method: 'splice', args: [1, 2], result: ['b', 'c'] },
        ]);
    });

    it('Workaround for truthiness', () => {
        const form = DXObject({ present: 1 });

        assert.equal('present' in form, true);
        assert.equal('user' in form, false);
        assert.equal(Object.keys(form).indexOf('user'), -1);
        assert.equal(Object.prototype.hasOwnProperty.call(form, 'user'), false);
    });

    it('JSDoc: basic scalar assignment', () => {
        const logged = [];
        const form = DXObject({}, { onMutation: (path, value) => logged.push(`${path.join('.')} = ${value}`) });
        form.user.address.city = 'Madrid';

        assert.deepEqual(logged, ['user.address.city = Madrid']);
        assert.deepEqual(plain(form), { user: { address: { city: 'Madrid' } } });
    });

    it('JSDoc: array auto-vivification', () => {
        const calls = [];
        const store = DXObject({}, { onMutation: (...args) => calls.push(args) });
        store.cart.items.push({ id: 1 });

        assert.deepEqual(calls[0][0], ['cart', 'items']);
        assert.deepEqual(calls[0][1], { method: 'push', args: [{ id: 1 }], result: 1 });
    });

    it('JSDoc: handling missing properties', () => {
        const form = DXObject({}, {
            onUndefined: (path) => (path.includes('locked') ? null : undefined),
        });

        assert.equal(form.locked, null);
        assert.ok(form.user);
    });

    it('arrayMutators example (fill / copyWithin)', () => {
        const events = [];
        const d = DXObject({ l: [1, 2, 3, 4] }, {
            arrayMutators: ['fill', 'copyWithin'],
            onMutation: (path, payload) => events.push(payload.method),
        });
        d.l.fill(0, 2);
        d.l.copyWithin(0, 2);

        assert.deepEqual(events, ['fill', 'copyWithin']);
    });
});
