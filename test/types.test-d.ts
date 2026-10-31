// Compile-time tests: `npm run test:types` must pass with no errors, and every
// `@ts-expect-error` line must still be an error.
import {
    DXObject,
    toRaw,
    isGhost,
    type DXObjectOptions,
    type MethodMutationPayload,
    type ArrayMutationPayload,
    type PropertyDeletionPayload,
    type Vivified,
} from '../index.js';

type Equal<A, B> = (<X>() => X extends A ? 1 : 2) extends (<X>() => X extends B ? 1 : 2) ? true : false;
const assertType = <_T extends true>() => {};

interface Form {
    name: string;
    age?: number;
    user?: {
        address?: { city?: string; zip?: string };
        tags?: string[];
    };
    owner: { id: number } | null;
    created: Date;
    lines: { sku: string; qty: number }[];
}

// ── typed access through missing paths ───────────────────────────────────────
const form = DXObject<Form>({});

form.user.address.city = 'Madrid';
form.user.tags.push('admin');
form.lines.push({ sku: 'a', qty: 1 });
form.lines[0].qty = 2;
const city: string | undefined = form.user.address.city;
const created: Date = form.created;
const when: number = form.created.getTime();

// @ts-expect-error unknown property
form.nope = 1;
// @ts-expect-error wrong value type
form.user.address.city = 5;
// @ts-expect-error owner is `X | null`: it is a real value and must be checked
form.owner.id = 1;
if (form.owner) form.owner.id = 1;

// optional leaves keep `| undefined`, objects do not
assertType<Equal<typeof form.age, number | undefined>>();
assertType<Equal<typeof form.user.address, Vivified<{ city?: string; zip?: string }>>>();

// ── untyped usage stays untyped ──────────────────────────────────────────────
const loose = DXObject({});
loose.any.path.at.all = 1;
const looser = DXObject();
looser.a.b.c = 1;

// ── inference from an initial value ──────────────────────────────────────────
const inferred = DXObject({ count: 1, nested: { flag: true } });
inferred.count = 2;
inferred.nested.flag = false;
// @ts-expect-error inferred shape is closed
inferred.other = 1;

// ── partial initial value ────────────────────────────────────────────────────
const seeded = DXObject<Form>({ name: 'x', user: { tags: ['a'] } });
void seeded.name;

// ── arrays as the root ───────────────────────────────────────────────────────
const list = DXObject<{ id: number }[]>([]);
list.push({ id: 1 });
// @ts-expect-error element type
list.push({ id: 'x' });

// ── options and callbacks ────────────────────────────────────────────────────
const options: DXObjectOptions<Form> = {
    onMutation(path, payload, parentProxy, root) {
        const p: string[] = path;
        void p; void payload; void parentProxy;
        const name: string = root.name;
        void name;
    },
    onUndefined(path, parentProxy, root) {
        void path; void parentProxy; void root;
        return undefined;
    },
    onError(message, context) {
        const m: string = message;
        void m; void context;
    },
    arrayMutators: ['fill'],
    depth: 5,
    skipUnchanged: true,
};
DXObject<Form>({}, options);

// @ts-expect-error depth must be a number
DXObject({}, { depth: 'deep' });
// @ts-expect-error unknown option
DXObject({}, { nope: true });

// ── payload types ────────────────────────────────────────────────────────────
const mutation: MethodMutationPayload = { method: 'push', args: [1], result: 1 };
const alias: ArrayMutationPayload = mutation;
const deletion: PropertyDeletionPayload = { property: 'a', value: 1 };
void alias; void deletion;

// ── helpers ──────────────────────────────────────────────────────────────────
const raw = toRaw({ a: 1 });
const n: number = raw.a;
const ghost: boolean = isGhost(form.user);
void n; void ghost;
