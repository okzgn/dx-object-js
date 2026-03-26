# DX Object

A lightweight, zero-dependency library that creates a deeply observable Proxy with **safe auto-vivification**. It allows you to access any nested path—even if it doesn't exist—by returning a "Smart Ghost Proxy." As soon as you assign a value to that path, the full object tree is materialized, and the mutation is reported. Features comprehensive mutation, deletion, and undefined-access tracking via configurable callbacks (`onMutation`, `onUndefined`, `onError`). ESM only.

## 💡 Key Features
*   **Safe Auto-vivification:** Access nested properties without checking for existence (`form.user.address.street = '...'` works even if `user` is undefined).
*   **Deep Observation:** Tracks mutations via a centralized `onMutation` callback.
*   **Security First:** Hardened against Prototype Pollution (`__proto__`, `constructor`, `prototype`).
*   **Depth Control:** Configurable `maxDepth` to prevent runaway paths from untrusted data.
*   **Array Awareness:** Deeply observes array mutators (`push`, `pop`, `splice`, etc.) with structured payloads.

---

## 🚀 Installation

```bash
npm install dx-object
```

---

## ⚡ Quick Start

```javascript
import { DXObject } from 'dx-object';

const data = DXObject({}, {
  onMutation: (path, value) => {
    console.log(`Path: ${path.join('.')}, Value:`, value);
  }
});

// Auto-vivification: Accessing non-existent paths creates a "Smart Ghost Proxy"
// Setting a value materializes the path.
data.user.profile.name = 'John Doe';
// Output: Path: user.profile.name, Value: John Doe

// Array mutations are tracked
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
| `onError` | `Function` | Callback for dangerous operations (Prototype Pollution, depth overflow). Defaults to `console.error`. |
| `arrayMutators` | `string[]` | Additional array method names to intercept (e.g., `['fill', 'copyWithin']`). |
| `depth` | `number` | Maximum smart-ghost-chain depth (1-100). Default: `10`. |

---

## Callbacks

### `onMutation(path, payload, parentProxy, root)`
Invoked after every successful mutation.

- **`path`**: `string[]` - The dot-separated key path (e.g., `['user', 'settings', 'theme']`).
- **`payload`**: The new scalar value, or an `ArrayMutationPayload` / `PropertyDeletionPayload`.
- **`parentProxy`**: The proxy wrapping the direct parent object.
- **`root`**: The original raw target object.

#### Mutation Payloads

**Array Mutation Payload**
If a method like `push` or `splice` is called:
```javascript
{
  method: 'push',
  args: ['new-item'],
  result: 1
}
```

**Property Deletion Payload**
If `delete` is called:
```javascript
{
  property: 'fieldName',
  value: 'originalValue'
}
```

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
To prevent attacks using deeply nested objects (e.g., from untrusted JSON input), `DXObject` limits path creation depth.

```javascript
const form = DXObject({}, {
  depth: 5,
  onError: (msg, ctx) => {
    alert(`Security Warning: ${msg}`);
  }
});
```

---

## Limitations & Best Practices

1.  **Shared Object References:** If the same object reference is assigned to multiple paths (e.g., `form.a = obj; form.b = obj`), the proxy cache associates the object with the **first cache entry registered**. Subsequent mutations on either path will report the first path.
2.  **Inherited Setters:** `DXObject` guards the direct key. It cannot intercept logic inside custom setters defined on the prototype chain of an object. If that ocurrs, then `onMutation` will be executed like the mutation happens on the target object path.
3.  **Truthiness:** Because accessing non-existent paths returns a "Smart Ghost Proxy", `if (form.user)` will **always evaluate to true**.
    *   *Workaround:* Check against specific values (`'user' in form`) or check existence via `Object.keys()` / `hasOwnProperty`.
4.  **Native Objects:** Passing complex native objects (Date, Map, Set) works, but internal slots are accessed via binding to the raw target. While standard for Proxy usage, avoid complex class instances with private state if possible.

---

## 📝 License

MIT License.

Copyright © 2026 [OKZGN](https://okzgn.com)