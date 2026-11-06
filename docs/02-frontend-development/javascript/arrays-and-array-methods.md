# JavaScript Arrays and Array Methods

Arrays store ordered values. JavaScript provides methods for searching,
transforming, filtering, and combining array data. Many methods accept a
callback that is called once for each visited element.

## Creating and reading arrays

```js
const topics = ["HTML", "CSS", "JavaScript"];
console.log(topics[0]); // "HTML"
console.log(topics.length); // 3
```

Array indexes begin at zero. Arrays can contain different value types, but
consistent item shapes are usually easier to reason about. A two-dimensional
array is an array whose elements are themselves arrays:

```js
const grid = [
  ["A1", "A2"],
  ["B1", "B2"],
];
console.log(grid[1][0]); // "B1"
```

## Core methods

| Method | Use | Result / mutation |
|---|---|---|
| `forEach(callback)` | Perform an action for each item | Returns `undefined`; does not build a result array |
| `map(callback)` | Transform each visited item | New array |
| `filter(callback)` | Keep items whose callback result is truthy | New array |
| `find(callback)` | Find the first matching item | Item or `undefined` |
| `some(callback)` / `every(callback)` | Test one / all items | Boolean |
| `reduce(callback, initialValue)` | Accumulate a result | One accumulated value |
| `includes(value)` | Check for a value | Boolean |
| `slice(start, end)` | Copy a range | New array; original unchanged |
| `splice(start, count, ...items)` | Remove or insert items | Mutates original; returns removed items |

Callbacks commonly receive `(element, index, array)`. Use `map` for a
transformation, `filter` for selection, and `forEach` for side effects.
Always supply an initial value to `reduce` when an empty array is possible.

```js
const orders = [{ total: 12 }, { total: 25 }, { total: 8 }];
const expensiveTotals = orders
  .filter((order) => order.total >= 10)
  .map((order) => order.total);

const total = orders.reduce((sum, order) => sum + order.total, 0);
```

This is **method chaining**: each returned value becomes the receiver for
the next method.

## Sorting

`sort()` mutates the array and sorts values as strings by default. Supply a
comparator for numbers, and copy first if the original order must remain:

```js
const scores = [30, 4, 100];
const ascending = [...scores].sort((a, b) => a - b);
```

The comparator should return a negative value, zero, or a positive value to
order `a` before, equal to, or after `b`. For object records:

```js
const byName = [...users].sort((a, b) => a.name.localeCompare(b.name));
```

## Random example: a dice roll

```js
const roll = Math.floor(Math.random() * 6) + 1;
console.log(`You rolled ${roll}`);
```

`Math.random()` is not suitable for security-sensitive randomness.

## Developer perspective and misconceptions

Methods such as `map` create a new outer array but do not deep-copy objects
inside it. `sort`, `splice`, `push`, and `pop` mutate the array. Choose
methods based on whether mutation is intended.

## Further learning

- [MDN: Indexed collections](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Indexed_collections)
- [MDN: `Array.prototype.reduce`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/reduce)
- [MDN: `Array.prototype.sort`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/sort)
