# JavaScript Control Flow and Collections

Control flow determines which statements run and how often. Collections
organize groups of data. Good choices make logic easier to read and reduce
accidental mutation.

## Conditional execution

```js
if (response.ok) {
  showResults();
} else if (response.status === 404) {
  showNotFound();
} else {
  showError();
}
```

Use `switch` when comparing one value with several cases. Use the conditional
operator for a short expression, not a nested substitute for readable
branches.

```js
const label = isSaving ? "Saving…" : "Save";
```

`&&`, `||`, and `??` short-circuit and return operand values. Do not assume
they always return a boolean.

## Loops

`for` provides explicit iteration control; `for...of` iterates iterable
values such as arrays and strings; `for...in` enumerates enumerable property
keys and is usually not the right way to loop over array values.

```js
for (const product of products) {
  console.log(product.name);
}
```

`break` exits a loop or switch; `continue` advances to the next iteration.
Avoid loops whose exit conditions are difficult to understand.

## Arrays and common methods

| Method | Purpose | Returns |
|---|---|---|
| `map(fn)` | Transform every element | New array |
| `filter(fn)` | Keep elements matching a predicate | New array |
| `find(fn)` | Find first matching element | Element or `undefined` |
| `some(fn)` | Test whether any element matches | Boolean |
| `every(fn)` | Test whether all elements match | Boolean |
| `reduce(fn, initial)` | Accumulate a result | Accumulated value |
| `forEach(fn)` | Perform an action for each element | `undefined` |
| `includes(value)` | Check for a matching value | Boolean |
| `slice(start, end)` | Copy a range | New array |
| `splice(start, count, ...)` | Remove/insert in the original array | Removed items |

```js
const orders = [
  { id: "a1", total: 12 },
  { id: "b2", total: 25 },
];

const expensiveIds = orders
  .filter((order) => order.total >= 20)
  .map((order) => order.id);
```

`sort()` mutates the original array; copy first when immutability matters.
Array methods such as `map` and `filter` return new arrays but do not deep
copy contained objects.
For callback signatures, practical method chaining, numeric sorting, and a
detailed `reduce` example, see
[arrays and array methods](arrays-and-array-methods.md).

## Objects and collection types

- **Object:** named properties for record-like data; property keys are
  strings or symbols (numeric-looking keys are converted to strings).
- **Map:** key/value collection where keys can be any value; preserves
  insertion order and provides `get`, `set`, `has`, `delete`, and `size`.
- **Set:** unique values; provides `add`, `has`, `delete`, and `size`.
- **WeakMap / WeakSet:** object-keyed collections that do not keep keys alive
  solely because they are entries; they are not enumerable.

`Map` is the built-in keyed collection sometimes called the Map object. It
is different from the array `.map()` method: `Map` stores key/value pairs,
while `.map()` transforms array elements.

```js
const uniqueTags = new Set(["html", "css", "html"]);
const settings = new Map([["theme", "dark"]]);
```

## Developer perspective and terminology

Use a `Map` when keys are dynamic or not strings, a `Set` for uniqueness,
and arrays for ordered lists. **Predicate** is a function that answers a
condition; **accumulator** is the running value in `reduce`; **mutation**
changes an existing object or collection.

## Common misconceptions

- `map()` is for transforming and returning values; do not use it just for
  side effects.
- `sort()` changes the array and sorts strings lexicographically by default.
- Objects and arrays compare by reference, not by their contents.
- `for...in` and `for...of` do different work.

## Check your understanding

1. When should you choose `filter` rather than `map`?
2. Which common array method mutates its receiver?
3. How does a `Map` differ from a plain object?

## Further learning

- [MDN: Control flow and error handling](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Control_flow_and_error_handling)
- [MDN: Indexed collections](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Indexed_collections)
- [MDN: Keyed collections](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Keyed_collections)
