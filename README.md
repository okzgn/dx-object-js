# DX Object

A lightweight, zero-dependency library that creates a deeply observable Proxy with **safe auto-vivification**. It allows you to access any nested path—even if it doesn't exist—by returning a "Smart Ghost Proxy." As soon as you assign a value to that path, the full object tree is materialized, and the mutation is reported. Features comprehensive mutation, deletion, and undefined-access tracking via configurable callbacks (`onMutation`, `onUndefined`, `onError`). ESM only.

## 💡 Key Features
*   **Safe Auto-vivification:** Access nested properties without checking for existence (`form.user.address.street = '...'` works even if `user` is undefined), and call `push` / `unshift` / `splice` on arrays that do not exist yet (`cart.items.push(item)`).
*   **Deep Observation:** Tracks mutations via a centralized `onMutation` callback, with the right path even after arrays are reordered.
*   **Security First:** Hardened against Prototype Pollution (`__proto__`, `constructor`, `prototype`) on reads, writes, deletions, `defineProperty` and `setPrototypeOf`.
*   **Depth Control:** Configurable `depth` to prevent runaway paths from untrusted data.
*   **Array, Map, Set and Date Awareness:** Observes mutator methods (`push`, `splice`, `Map#set`, `Set#add`, `Date#setTime`, …) with structured payloads.
*   **Typed:** Ships TypeScript definitions that understand auto-vivification.

---

## 🚀 Installation

```bash
npm install dx-object-js
```
---

## ⚡ Quick Start

```javascript
import { DXObject } from 'dx-object-js';

const data = DXObject({}, {
  onMutation: (path, value) => {
    console.log(`Path: ${path.join('.')}, Value:`, value);
  }
});

// Auto-vivification: Accessing non-existent paths creates a "Smart Ghost Proxy"
// Setting a value materializes the path.
data.user.profile.name = 'John Doe';
// Output: Path: user.profile.name, Value: John Doe

// Array mutations are tracked, even on arrays that do not exist yet
data.cart.items.push({ id: 101 });
// Output: Path: cart.items, Value: { method: 'push', args: [{id: 101}], result: 1 }
```

---

## 📖 API Reference

### `DXObject(target, options)`

Creates a new observable proxy.

| Parameter | Type | Description |
| :--- | :--- | :--- |
| `target` | `Object` | (Optional) The initial object/array to observe. Defaults to `{}`. |
| `options` | `Object` | (Optional) Configuration options. |

#### `DXObjectOptions`

| Option | Type | Description |
| :--- | :--- | :--- |
| `onMutation` | `Function` | Callback for every successful mutation. |
| `onUndefined` | `Function` | Interceptor for non-existent properties. Return a value to override Smart Ghost Proxy creation. |
| `onError` | `Function` | Callback for blocked operations (Prototype Pollution, depth overflow) and for callbacks that throw. Defaults to `console.error`. |
| `arrayMutators` | `string[]` | Additional method names to intercept (e.g., `['fill', 'copyWithin']`). |
| `depth` | `number` | Maximum length of any path created through ghosts, counted from the root (1-100). Anything that is not a finite number falls back to `10`. |
| `skipUnchanged` | `boolean` | Skip `onMutation` when an assignment stores a value that is `Object.is`-equal to the one already under an existing key. Default: `false`. |

### `toRaw(value)`

Returns the plain object behind a proxy. Use it wherever a proxy is not accepted, e.g. `structuredClone(toRaw(form))`. A ghost becomes `undefined`; anything else is returned as it is.

### `isGhost(value)`

Returns `true` when `value` is a ghost (a stand-in for a property that does not exist). Ghosts are always truthy, so this is the way to tell "missing" from "present":

```javascript
if (isGhost(form.user)) { /* user has not been assigned yet */ }
```

---

## Callbacks

### `onMutation(path, payload, parentProxy, root)`
Invoked after every successful mutation. If it throws, the error goes to `onError` and the mutation is not affected (it has already been applied).

- **`path`**: `string[]` - One string per level (e.g., `['user', 'settings', 'theme']`). For mutator methods it is the path of the array / Map / Set / Date itself.
- **`payload`**: The new scalar value, a `MethodMutationPayload` or a `PropertyDeletionPayload`. Proxies are unwrapped: you always receive plain objects.
- **`parentProxy`**: The proxy of the object that was mutated: the parent of the key for assignments and deletions, the array / Map / Set / Date itself for mutator methods.
- **`root`**: The original raw target object.

#### Mutation Payloads

**Method Mutation Payload** (`ArrayMutationPayload` is kept as an alias)
If a mutator method like `push` or `splice` is called:
```javascript
{
  method: 'push',
  args: ['new-item'],
  result: 1
}
```
Built-in mutators: `push`, `pop`, `shift`, `unshift`, `splice`, `sort`, `reverse` (arrays); `set`, `delete`, `clear` (`Map`); `add`, `delete`, `clear` (`Set`); the `set*` methods of `Date`. Anything else can be added with `arrayMutators`.

**Property Deletion Payload**
If `delete` is called on a property that exists:
```javascript
{
  property: 'fieldName',
  value: 'originalValue'
}
```

### `onUndefined(path, parentProxy, root)`
Invoked every time a property that does not exist is read. Return a value to use instead of a ghost, or `undefined` to get the ghost.

### `onError(message, context)`
Invoked when DXObject blocks an operation or one of your callbacks throws. **Blocked operations do not throw**: they are reported here and dropped. (The one exception is `Object.defineProperty` with an explicit `configurable: false` on `__proto__` / `constructor` / `prototype`, which the Proxy rules force to fail with a `TypeError`; nothing is defined.)

---

## 📖 Advanced Usage

### Customizing "Not Found" Behavior
Use `onUndefined` to prevent the creation of a Smart Ghost Proxy for specific paths or return custom default values.

```javascript
const config = DXObject({}, {
  onUndefined: (path) => {
    // Return null instead of a Proxy for properties containing 'legacy'
    if (path.includes('legacy')) return null;
    return undefined; // Let the library create the Smart Ghost Proxy
  }
});
```

### Safety & Depth Limits
To prevent attacks using deeply nested objects (e.g., from untrusted JSON input), `DXObject` limits path creation depth. Writes that would go deeper are dropped and reported through `onError`.

```javascript
const form = DXObject({}, {
  depth: 5,
  onError: (msg, ctx) => {
    alert(`Security Warning: ${msg}`);
  }
});
```

Prototype-chain keys are blocked everywhere: reading `__proto__`, `constructor` or `prototype` through the proxy returns `undefined` (unless it is an own data property of your object), and writing, deleting or defining them is dropped and reported.

### Arrays on missing paths
A mutator called on a path that does not exist creates the array when it ends up holding something, and fires the same event a real array would:

```javascript
store.cart.items.push({ id: 1 });   // creates cart.items, onMutation(['cart', 'items'], { method: 'push', ... })
store.cart.tags.pop();              // nothing to remove: no array is created, no event
```

A key that is named like a mutator (`sort`, `reverse`, …) still works as a normal ghost: `config.sort.order = 'asc'` creates `{ sort: { order: 'asc' } }`.

### Maps, Sets and Dates
Their mutator methods are reported like array methods; the values stored inside a `Map` or `Set` are not wrapped.

```javascript
const state = DXObject({ seen: new Set() }, { onMutation: console.log });
state.seen.add('a'); // path ['seen'], payload { method: 'add', args: ['a'], result: Set }
```

### Shared references and held proxies
A proxy belongs to a path. The same path always returns the same proxy; an object stored under two paths gets one proxy per path and each reports its own path (`form.a !== form.b`, compare with `toRaw`). If you hold a proxy while its array is reordered, events keep reporting its current position. If the object is removed from the tree, the write still happens but no `onMutation` is fired and `onError` is told.

### TypeScript
Pass the shape of your data to get typed access to paths that do not exist yet:

```typescript
interface Form { user?: { address?: { city?: string } } }

const form = DXObject<Form>({});
form.user.address.city = 'Madrid'; // no optional chaining needed
```

Nested objects and arrays become readable and writable even when they were optional. Leaf values keep their declared type, and a property declared `X | null` stays `X | null` (`null` is a real value and is not vivified).

---

## Limitations & Best Practices

1.  **Truthiness:** Because accessing non-existent paths returns a "Smart Ghost Proxy", `if (form.user)` will **always evaluate to true**, and `form.user ?? fallback` never reaches `fallback`.
    *   *Workaround:* use `isGhost(form.user)`, `'user' in form`, `Object.keys()` / `hasOwnProperty`, or `onUndefined` to return values for properties that do not exist.
2.  **Ghost `typeof`:** a ghost is an `object`, except one named like an array mutator (`push`, `sort`, …), which is a `function` so it can be called.
3.  **Prototype keys:** `form.constructor`, `form.__proto__` and `form.prototype` read as `undefined`, so checks like `form.constructor === Object` do not work. Use `Object.getPrototypeOf(form)`.
4.  **`null` and `undefined` values:** a key that exists with the value `null` or `undefined` is not vivified: `form.n.x = 1` throws, as in plain JavaScript. Missing keys are the ones that become ghosts.
5.  **Inherited Setters:** `DXObject` guards the direct key. It cannot intercept logic inside custom setters defined on the prototype chain. If that occurs, `onMutation` is executed as if the mutation happened on the target object path.
6.  **Native objects and classes:** `Date`, `Map`, `Set` and `RegExp` work (their methods and accessors run on the raw object). Class instances, and anything with private fields, do too, but state changed inside their methods is not observed. Values stored inside a `Map` or `Set` are not wrapped.
7.  **Frozen objects:** a property that is both read-only and non-configurable is returned as the raw value (a proxy cannot return anything else for it), so nested changes below it are not observed.
8.  **Cloning:** `structuredClone` cannot clone proxies. Use `structuredClone(toRaw(form))`.
9.  **Reserved names:** a *missing* key named `then`, `toJSON`, `__ngContext__`, `$$typeof`, `asymmetricMatch` or `nodeType` reads as `undefined` (not a ghost, and `onUndefined` is not consulted), because Promises, `JSON.stringify` and several frameworks probe those names. They cannot be auto-vivified (`form.a.nodeType.label = 'x'` throws); assign the object first (`form.a.nodeType = {}`). Existing keys with those names behave normally.
10. **`isProxy`:** reading `isProxy` on any DXObject proxy or ghost returns `true`. It is kept for compatibility; prefer `isGhost` / `toRaw`.

---

## ⬆️ Upgrading from 4.x

Version 5 fixes several bugs and changes a few behaviors; see [CHANGELOG.md](CHANGELOG.md).

---

## 📝 License

MIT License.

Copyright © 2026 [OKZGN](https://okzgn.com)
