# JavaScript Foundations: Values, Variables, and Functions

JavaScript is a dynamically typed programming language standardized as
ECMAScript. A browser supplies additional Web APIs—such as the DOM and
`fetch`—that JavaScript programs can use.

## Values and types

JavaScript's primitive types are `string`, `number`, `bigint`, `boolean`,
`undefined`, `symbol`, and `null`. Objects, arrays, and functions are
reference values.

```js
const title = "Frontend";     // string
const lessonCount = 8;        // number
const published = true;       // boolean
const missingValue = null;    // deliberate absence
let notAssignedYet;           // undefined
const lessons = ["HTML", "CSS"]; // object (array)
```

`typeof null` returns `"object"` for historical reasons. Use explicit
comparisons when checking for `null`.
For more examples of string operations, escape sequences, and converting
values from form input, see
[strings and type conversion](strings-and-type-conversion.md).

## Variables and scope

- `const` prevents reassignment of the binding; an object stored in it can
  still be mutated.
- `let` allows reassignment and is block-scoped.
- `var` is function-scoped and has older hoisting behavior; prefer `const`
  and `let` in modern code.

```js
const settings = { theme: "light" };
settings.theme = "dark"; // allowed: the object changed
// settings = {};        // TypeError: the const binding cannot be reassigned
```

## Operators and comparisons

Use `===` and `!==` to avoid implicit type conversion in comparisons.
Logical operators `&&`, `||`, and `!` work with truthy/falsy values and
return operands, not necessarily booleans. Nullish coalescing `??` uses a
fallback only for `null` or `undefined`; unlike `||`, it preserves values
such as `0` and `""`.

```js
const pageSize = requestedSize ?? 20;
const displayName = user.name || "Guest";
```
For arithmetic, logical, comparison, and conditional operators, plus
`if`/`switch` and loop statements, see
[operators and control flow](operators-and-control-flow.md).

## Functions

Functions can be declared, assigned to variables, passed as values, and
returned from other functions.

```js
function formatName(first, last = "") {
  return `${first} ${last}`.trim();
}

const double = (value) => value * 2;
```

An arrow function with an expression body returns that expression. Arrow
functions do not create their own `this`; see
[objects, prototypes, and `this`](objects-prototypes-this.md).

## Objects and arrays

Objects organize named properties; arrays organize ordered values. Object and
array assignment copies a reference, not a deep copy. Destructuring extracts
properties; spread syntax creates a shallow copy.

```js
const user = { id: "u1", name: "Ari" };
const { name } = user;
const renamed = { ...user, name: "Sam" };
```

Nested objects inside a spread result may still be shared references.
The [arrays and array methods lesson](arrays-and-array-methods.md) covers
`forEach`, `map`, `filter`, `reduce`, sorting, and chained transformations.
The [objects, destructuring, and spread lesson](objects-destructuring-and-spread.md)
covers nested data, rest parameters, and copying values in more detail.

## Practical example

```js
const cart = { items: 2, total: 18 };

function addItem(currentCart, price) {
  return {
    items: currentCart.items + 1,
    total: currentCart.total + price,
  };
}

const updatedCart = addItem(cart, 5);
```

Returning a new object avoids mutating `cart`, which is often helpful when
reasoning about UI state.

## Important terminology

- **Primitive:** Immutable value such as a string or boolean.
- **Reference:** A value that points to an object held elsewhere.
- **Scope:** Where a binding can be accessed.
- **Hoisting:** JavaScript's processing of declarations before execution;
  details vary by declaration type.
- **Closure:** A function retaining access to its surrounding lexical scope.
- **Coercion:** Conversion between types, sometimes implicit.

## Common misconceptions

- `const` does not freeze objects.
- JavaScript and Java are different languages.
- `null` and `undefined` are different values.
- TypeScript types do not change JavaScript's runtime type behavior.

## Check your understanding

1. What does `const` protect, and what does it not protect?
2. How do `??` and `||` differ when the left value is `0`?
3. Does assigning an object to another variable make a copy?

## Further learning

- [MDN: JavaScript Guide](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide)
- [MDN: Grammar and types](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Grammar_and_types)
- [ECMAScript specification](https://tc39.es/ecma262/)
