import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { observe, plain } from './helpers.js';

const touchAll = (items) => { for (let i = 0; i < items.length; i++) void items[i].n; };

describe('paths stay correct after array reordering', () => {
    it('shift', () => {
        const { d, events } = observe({ items: [{ n: 1 }, { n: 2 }, { n: 3 }] });
        touchAll(d.items);
        d.items.shift();
        events.length = 0;

        d.items[0].n = 'X';

        assert.equal(events.length, 1);
        assert.equal(events[0].path, 'items.0.n');
        assert.deepEqual(plain(d), { items: [{ n: 'X' }, { n: 3 }] });
    });

    it('unshift', () => {
        const { d, events } = observe({ items: [{ n: 1 }] });
        touchAll(d.items);
        d.items.unshift({ n: 0 });
        events.length = 0;

        d.items[1].n = 'X';

        assert.equal(events[0].path, 'items.1.n');
        assert.deepEqual(plain(d), { items: [{ n: 0 }, { n: 'X' }] });
    });

    it('splice', () => {
        const { d, events } = observe({ items: [{ n: 1 }, { n: 2 }, { n: 3 }] });
        touchAll(d.items);
        d.items.splice(0, 2);
        events.length = 0;

        d.items[0].n = 'X';

        assert.equal(events[0].path, 'items.0.n');
    });

    it('sort and reverse', () => {
        const { d, events } = observe({ items: [{ n: 3 }, { n: 1 }, { n: 2 }] });
        touchAll(d.items);
        d.items.sort((a, b) => a.n - b.n);
        events.length = 0;

        d.items[0].n = 9;
        assert.equal(events[0].path, 'items.0.n');
        assert.deepEqual(plain(d).items.map((i) => i.n), [9, 2, 3]);

        d.items.reverse();
        events.length = 0;
        d.items[0].n = 'last';
        assert.equal(events[0].path, 'items.0.n');
        assert.deepEqual(plain(d).items.map((i) => i.n), ['last', 2, 9]);
    });

    it('a proxy held across a reorder reports its new index', () => {
        const { d, events } = observe({ items: [{ n: 1 }, { n: 2 }, { n: 3 }] });
        const second = d.items[1];
        d.items.shift();
        events.length = 0;

        second.n = 'X';

        assert.equal(events[0].path, 'items.0.n');
    });

    it('a proxy held across a reorder inside nested objects reports its new path', () => {
        const { d, events } = observe({ rows: [{ cells: [{ v: 1 }, { v: 2 }] }, { cells: [{ v: 3 }] }] });
        const cell = d.rows[1].cells[0];
        d.rows.shift();
        events.length = 0;

        cell.v = 'X';

        assert.equal(events[0].path, 'rows.0.cells.0.v');
    });

    it('a ghost obtained under an element writes to that element after a reorder', () => {
        const { d, events } = observe({ items: [{ n: 1 }, { n: 2 }] });
        const second = d.items[1];
        const ghost = second.tags;
        d.items.shift();
        events.length = 0;

        ghost.first = 'x';

        assert.deepEqual(plain(d), { items: [{ n: 2, tags: { first: 'x' } }] });
        assert.equal(events[0].path, 'items.0.tags.first');
    });
});

describe('detached objects', () => {
    it('applies the write but skips onMutation and reports through onError', () => {
        const { d, events, errors } = observe({ items: [{ n: 1 }, { n: 2 }] });
        const first = d.items[0];
        d.items.shift();
        events.length = 0;

        first.n = 'gone';

        assert.equal(first.n, 'gone');
        assert.equal(events.length, 0);
        assert.equal(errors.length, 1);
        assert.deepEqual(plain(d), { items: [{ n: 2 }] });
    });

    it('does not report anything when there is no onMutation to skip', () => {
        const errors = [];
        const raw = { items: [{ n: 1 }, { n: 2 }] };
        const { d } = observe(raw, { onMutation: undefined, onError: (m) => errors.push(m) });
        const first = d.items[0];
        d.items.shift();

        first.n = 'gone';

        assert.equal(errors.length, 0);
    });

    it('a ghost whose base was detached drops the write and reports', () => {
        const { d, events, errors } = observe({ items: [{ n: 1 }, { n: 2 }] });
        const first = d.items[0];
        const ghost = first.tags;
        d.items.shift();
        events.length = 0;

        assert.doesNotThrow(() => { ghost.x = 1; });
        assert.equal(errors.length, 1);
        assert.equal(events.length, 0);
        assert.deepEqual(plain(d), { items: [{ n: 2 }] });
    });
});

describe('shared references', () => {
    it('each access path reports its own path', () => {
        const shared = { v: 1 };
        const { d, events } = observe({ a: shared, b: shared });

        d.a.v = 2;
        d.b.v = 3;

        assert.deepEqual(events.map((e) => e.path), ['a.v', 'b.v']);
        assert.equal(shared.v, 3);
    });

    it('the same path always returns the same proxy', () => {
        const { d } = observe({ a: { x: 1 } });

        assert.equal(d.a, d.a);
    });

    it('a replaced object gets a new proxy', () => {
        const { d } = observe({ a: { x: 1 } });
        const before = d.a;
        d.a = { x: 2 };

        assert.notEqual(d.a, before);
        assert.equal(d.a.x, 2);
    });
});

describe('proxies assigned back into the tree', () => {
    it('fires a single event when a proxy is assigned and then mutated', () => {
        const { d, events } = observe({ a: { x: 1 }, b: {} });
        d.b.ref = d.a;
        events.length = 0;

        d.b.ref.x = 2;

        assert.deepEqual(events.map((e) => e.path), ['b.ref.x']);
        assert.equal(d.a.x, 2);
    });

    it('stores the raw object and reports the raw value', () => {
        const { d, events } = observe({ a: { x: 1 }, b: {} });
        d.b.ref = d.a;

        assert.equal(events[0].payload.isProxy, undefined);
        assert.deepEqual(events[0].payload, { x: 1 });
    });

    it('handles proxies nested inside an assigned plain object', () => {
        const { d, events } = observe({ a: { x: 1 } });
        d.holder = { ref: d.a };
        events.length = 0;

        d.holder.ref.x = 5;

        assert.deepEqual(events.map((e) => e.path), ['holder.ref.x']);
        assert.equal(d.a.x, 5);
    });

    it('unwraps proxies pushed into arrays', () => {
        const { d, events } = observe({ a: { x: 1 }, list: [] });
        d.list.push(d.a);

        assert.equal(events[0].payload.args[0].isProxy, undefined);
        events.length = 0;
        d.list[0].x = 2;
        assert.deepEqual(events.map((e) => e.path), ['list.0.x']);
    });

    it('moves a proxy between parents', () => {
        const { d, events } = observe({ left: { item: { n: 1 } }, right: {} });
        d.right.item = d.left.item;
        delete d.left.item;
        events.length = 0;

        d.right.item.n = 2;

        assert.deepEqual(events.map((e) => e.path), ['right.item.n']);
    });
});
