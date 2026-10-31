# Changelog

## 5.0.0

### Security
- **Prototype Pollution bypass fixed.** `d.a.__proto__.x = 1` and `d.a.constructor.prototype.x = 1` used to modify `Object.prototype`. Reading `__proto__`, `constructor` or `prototype` through a proxy now returns `undefined` (unless it is an own data property of your object).
- `defineProperty` on dangerous keys, `setPrototypeOf` and `delete` of dangerous keys are blocked on real proxies as well. Every blocked operation is reported through `onError`.
- Objects frozen (or with read-only, non-configurable properties) no longer throw a `TypeError` on read.

### Fixed
- **`push` / `unshift` / `splice` on a missing path** (`data.cart.items.push(x)`, the README's own example) threw `push is not a function`. It now creates the array and emits the same event a real array would.
- **Stale paths after reordering arrays.** After `shift`, `unshift`, `splice`, `sort` or `reverse`, `onMutation` reported the position an element had when it was first read. Paths are now resolved when the event fires, also for proxies and ghosts held across the reorder.
- **Double events when a proxy is assigned back into the tree** (`d.b.ref = d.a; d.b.ref.x = 1` fired twice). Proxies are unwrapped on assignment and in the `args` of mutators.
- `parentProxy` was the raw object when the write went through a ghost. It is now always a proxy.
- `sort()` and `reverse()` returned the raw array, so chained calls escaped observation. They return the proxy.
- `indexOf` / `includes` / `lastIndexOf` could not find raw objects stored in a proxied array.
- A ghost no longer serialises as `{"isProxy":true}`; `Object.keys`, spread and `JSON.stringify` see an empty object.
- `depth: null` meant a depth of 1; it now falls back to the default (10), like any other non-numeric value.
- The depth limit and blocked writes now behave as documented: `onError` is called and nothing throws (they used to throw a `TypeError` in ES modules).
- `Map#size`, `Map` / `Set` iteration and `RegExp` / `Date` accessors threw "incompatible receiver"; class instances with private fields could not be read through getters.
- A write whose receiver is another object (`Object.create(proxy).x = 1`) was reported as a mutation of the tree.
- `delete` on a property that does not exist fired a deletion event.
- `then`, `toJSON` and similar probe keys returned truthy ghosts on real proxies.
- `ghost[Symbol('x')] = 1` created a string key named `"Symbol(x)"`; symbol keys are now rejected on ghosts and reported.
- `d.a.b` returned a new ghost on every read beyond the first level; ghosts are now stable.
- A ghost obtained before its path was created kept returning ghosts after the path existed; it now reads through to the real value.
- Calling `Object.defineProperty` or `Object.freeze` on a ghost silently acted on a throwaway object.
- `onMutation` / `onUndefined` that throw no longer break the operation: they are reported through `onError` (a throwing `onMutation` used to propagate out of assignments on real objects, but not out of ghost writes).

### Added
- `toRaw(value)` and `isGhost(value)` helpers.
- `skipUnchanged` option.
- `Map` (`set`, `delete`, `clear`), `Set` (`add`, `delete`, `clear`) and `Date` (`set*`) mutations are reported with a `{ method, args, result }` payload. `MethodMutationPayload` type (`ArrayMutationPayload` stays as an alias).
- TypeScript: `DXObject<Form>({})` gives typed access through optional paths (`Vivified<T>`, `DeepPartial<T>`); `DXObject({})` is `Record<string, any>`.
- Test suite (`npm test`), type tests (`npm run test:types`), an ES2015 syntax check (`npm run check:es6`) and CI.

### Behavior changes
These are the places where 5.0.0 behaves differently from 4.x on purpose:
- **One proxy per path instead of per object.** An object reachable from two paths gets two proxies (`d.a !== d.b`) and each reports its own path. Before, the first path won for both.
- `d.constructor`, `d.__proto__` and `d.prototype` read as `undefined` (see Security).
- A ghost named like an array mutator (`push`, `pop`, `shift`, `unshift`, `splice`, `sort`, `reverse`, or any `arrayMutators` name) has `typeof` `'function'`. It still works as a normal ghost for reads and writes.
- A ghost reached past the depth limit is callable and has `typeof` `'function'`.
- Getters and methods of non-plain objects (class instances, `Date`, `Map`, …) run on the raw object, never on the proxy.
- Blocked operations return without throwing; an `onMutation` or `onUndefined` that throws is routed to `onError`.
- Writing through an object that was removed from the tree applies the write, skips `onMutation` and calls `onError`.
- `JSON.stringify` / `Object.keys` / spread of a ghost give `{}` / `[]` / `{}` (reading `ghost.isProxy` still returns `true`).
- `delete` of a missing property no longer fires `onMutation`.
- A *missing* key named `then`, `toJSON`, `__ngContext__`, `$$typeof`, `asymmetricMatch` or `nodeType` reads as `undefined` instead of a ghost, so it cannot be auto-vivified.
- `Object.defineProperty(d, '__proto__', { …, configurable: false })` throws a `TypeError` (and defines nothing); without `configurable: false` it is dropped silently.
- `onMutation` payloads and `args` contain raw objects, never proxies.
