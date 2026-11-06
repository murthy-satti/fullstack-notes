# JavaScript Interview Questions and Answers

Use these questions to review JavaScript fundamentals, browser APIs, and
common coding patterns. Answers are concise; follow the linked lessons for
deeper explanations and practical examples.

## Language fundamentals

### 1. What is JavaScript?

JavaScript is a programming language standardized as ECMAScript. It runs in
browsers and other environments such as Node.js. The environment supplies
additional APIs: browsers provide the DOM and `fetch`, while Node.js
provides server-side APIs.

### 2. What are `var`, `let`, and `const`?

- `var` is function-scoped (or global-scoped at script top level) and can be
  redeclared in the same scope. Its declaration is initialized to
  `undefined` when its scope is entered.
- `let` is block-scoped and can be reassigned, but not redeclared in the
  same scope. It cannot be accessed before its declaration is initialized.
- `const` is block-scoped and cannot be reassigned. If it holds an object,
  that object's properties may still be changed.

Prefer `const` by default, then use `let` when reassignment is needed.

### 3. What is the difference between `==` and `===`?

`==` allows type coercion before comparison. `===` compares without that
coercion and is usually the clearer default:

```js
5 == "5";  // true
5 === "5"; // false
```

### 4. What is a closure?

A closure is a function together with access to the lexical bindings around
where it was created. Those bindings remain available even after the outer
function returns:

```js
function makeCounter() {
  let count = 0;
  return () => ++count;
}

const counter = makeCounter();
counter(); // 1
counter(); // 2
```

### 5. What is the difference between `null` and `undefined`?

`undefined` commonly means a value was not provided or assigned. `null` is
an explicit value that represents an intentional absence. They are distinct
values and are not strictly equal.

### 6. What is hoisting?

Before execution, JavaScript establishes declarations according to their
scope rules. Function declarations can generally be called before their
textual position. `var` bindings exist as `undefined` before assignment.
`let` and `const` bindings exist but cannot be accessed before
initialization; that period is called the temporal dead zone. Hoisting does
not move assignment expressions.

### 7. What are JavaScript's data types?

The primitive types are `string`, `number`, `bigint`, `boolean`,
`undefined`, `symbol`, and `null`. Other values are objects, including
arrays and functions. `typeof null` returns `"object"` for historical
reasons.

### 8. What is the difference between a function declaration and a function expression?

A function declaration defines a function and is initialized according to
declaration hoisting rules. A function expression creates a function value
where the expression is evaluated; if assigned to `const` or `let`, that
binding cannot be used before initialization.

```js
function declared() {}
const expressed = function () {};
```

### 9. What does `this` mean?

For an ordinary function, `this` is generally determined by how the
function is called. In `account.deposit()`, it refers to `account`. In a
plain function call it can be `undefined` in strict mode. Arrow functions
do not create their own `this`; they capture it from the surrounding
lexical context.

### 10. What is an arrow function?

An arrow function is a concise function expression using `=>`:

```js
const add = (a, b) => a + b;
```

Arrow functions have no own `this`, `arguments`, or `super`, and cannot be
used as constructors with `new`. They are useful for callbacks and
functions that should use lexical `this`.

### 11. What is the event loop?

The event loop coordinates JavaScript jobs with work performed by the host
environment. Synchronous JavaScript runs to completion. Promise
continuations use the microtask queue; timers and many events are scheduled
as tasks. The host decides when queued work can run, and browser rendering
is coordinated with that scheduling.

### 12. What is the difference between synchronous and asynchronous code?

Synchronous code runs step by step and the current operation finishes
before the next one begins. Asynchronous code arranges for later work to be
handled when a result becomes available, allowing the main thread to do
other work while waiting. It does not automatically make CPU-heavy
synchronous code non-blocking.

### 13. What is a Promise?

A Promise represents the eventual fulfillment or rejection of an
asynchronous operation. It begins pending, then settles as fulfilled or
rejected:

```js
const result = Promise.resolve("Done");
result.then((value) => console.log(value));
```

### 14. What are template literals?

Template literals use backticks and support interpolation with `${...}` and
multiline text:

```js
const name = "Mina";
const greeting = `Hello, ${name}!`;
```

### 15. What is destructuring?

Destructuring extracts values from arrays or properties from objects into
bindings:

```js
const user = { name: "Mina", age: 24 };
const { name, age } = user;
```

### 16. What is a callback function?

A callback is a function passed to other code so that code can invoke it.
Callbacks may run immediately or later, depending on the API. Event
listeners and array methods such as `map` use callbacks.

### 17. What is the difference between `map()` and `forEach()`?

`map()` calls a callback for each visited element and returns a new array of
the results. `forEach()` calls a callback for side effects and returns
`undefined`.

### 18. What is spread syntax?

Spread syntax (`...`) expands iterable values or enumerable object
properties in a context that accepts them:

```js
const combined = [...[1, 2], 3];
const updated = { ...user, age: 25 };
```

These copies are shallow.

### 19. What is the difference between `undefined` and an undeclared variable?

`undefined` is a JavaScript value. A declared binding can contain it. An
undeclared identifier has no binding; reading it normally throws a
`ReferenceError`.

### 20. What is the difference between a shallow copy and a deep copy?

A shallow copy copies the top-level structure but keeps references to
nested objects. A deep copy recursively duplicates supported nested data.
`structuredClone()` can deep-clone many built-in data types, but it does
not support every value or every object behavior. Choose a clone strategy
based on the data rather than assuming spread makes a deep copy.

### 21. What is the difference between primitive and object values?

Primitive values such as numbers and strings are immutable values. Objects
are mutable values that can be accessed through references. Assigning an
object copies its reference value; it does not clone the object.

### 22. What is a higher-order function?

A higher-order function accepts a function as an argument, returns a
function, or both. `map()` is an example because it accepts a callback.

### 23. What is event delegation?

Event delegation handles events from multiple descendant elements using a
listener on a common ancestor. It often relies on event bubbling and is
useful when child elements are added dynamically.

### 24. What do `async` and `await` do?

An `async` function always returns a Promise. `await` pauses that function's
continuation until a Promise settles; it does not block the entire
JavaScript thread:

```js
async function getValue() {
  return await Promise.resolve(42);
}
```

### 25. What is a pure function?

A pure function returns the same result for the same inputs and has no
observable side effects, such as changing external state or performing
network requests. Pure functions are usually easier to test and reason
about.

### 26. What is memoization?

Memoization caches results so a repeated call with the same inputs can
reuse a previous result. It is useful when computation is expensive and
inputs repeat, but cache size, invalidation, and memory use need
consideration.

### 27. What does the `typeof` operator do?

`typeof` returns a string describing a value's primitive type or broad
category:

```js
typeof 123;        // "number"
typeof "hello";    // "string"
typeof undefined; // "undefined"
```

There are special cases: `typeof null` is `"object"`, and arrays also
report `"object"`. Use `Array.isArray()` to identify arrays.

### 28. What is optional chaining (`?.`)?

Optional chaining stops property access or a call when the value to its
left is `null` or `undefined`, returning `undefined` instead of throwing:

```js
const city = user.address?.city;
```

It does not validate that a value has the correct shape.

### 29. What is nullish coalescing (`??`)?

`??` uses its right-hand value only when the left-hand value is `null` or
`undefined`:

```js
const pageSize = suppliedSize ?? 20; // preserves 0
```

Unlike `||`, it does not replace other falsy values such as `0` or `""`.

### 30. How does `Object.is()` differ from `===`?

Both avoid ordinary type coercion, but `Object.is()` treats `NaN` as equal
to itself and distinguishes positive zero from negative zero:

```js
NaN === NaN;         // false
Object.is(NaN, NaN); // true
Object.is(+0, -0);   // false
```

### 31. What are JavaScript modules?

Modules divide code into files with explicit imports and exports. ES
modules use `export` and `import`, have their own scope, and help organize
reusable code.

### 32. What is the difference between `slice()` and `splice()`?

`slice(start, end)` returns a shallow copy of a selected range without
changing the original array. `splice(start, count, ...items)` changes the
original array by removing, replacing, or inserting elements.

### 33. What is event bubbling?

Bubbling is an event propagation phase in which an event moves from its
target through ancestor elements. Some events do not bubble. A listener can
stop propagation with `stopPropagation()` when that behavior is
appropriate.

### 34. What is a Promise chain?

A Promise chain links asynchronous steps with `.then()`, `.catch()`, and
`.finally()`. Each `.then()` returns a new Promise, so returned values and
errors flow to the next step.

### 35. What is JSON?

JSON (JavaScript Object Notation) is a text format for structured data.
`JSON.stringify()` converts supported JavaScript data to JSON text;
`JSON.parse()` parses JSON text and throws a `SyntaxError` if the text is
invalid. Parsed data should still be checked against the shape the
application expects.

### 36. What is the difference between `for...in` and `for...of`?

`for...in` iterates enumerable property keys. `for...of` iterates values
from an iterable such as an array or string. Use `for...of` for array
values; use object-specific APIs when enumerating an object's own keys.

### 37. What does `instanceof` check?

`instanceof` checks whether a constructor's `prototype` appears in an
object's prototype chain. It is not a universal type check across realms
such as separate windows, and it does not validate the object's data.

### 38. What is the DOM?

The Document Object Model is the browser's object-based representation of
a document. JavaScript can select, inspect, and update DOM nodes.

### 39. What are `setTimeout()` and `setInterval()`?

`setTimeout(callback, delay)` schedules one callback after at least the
requested delay. `setInterval(callback, delay)` repeatedly schedules a
callback. Neither is an exact clock; the event loop and browser can delay
execution. Cancel them with `clearTimeout()` and `clearInterval()`.

### 40. How do `localStorage`, `sessionStorage`, and cookies differ?

- `localStorage` stores string key/value pairs for an origin and generally
  persists until cleared.
- `sessionStorage` stores string key/value pairs scoped to an origin and a
  page session, commonly a tab.
- Cookies have scope and expiry rules, and matching cookies are sent with
  HTTP requests. Servers can set security attributes such as `HttpOnly`,
  `Secure`, and `SameSite`.

Storage limits and session behavior vary by browser. JavaScript-readable
storage is accessible to same-origin scripts and should not be treated as
secret storage.

### 41. Does JavaScript pass objects by reference?

JavaScript passes arguments by value. For an object, the copied value is a
reference to the same object. A function can mutate that object, but
reassigning its parameter does not reassign the caller's variable.

### 42. What are throttling and debouncing?

Debouncing delays work until a period passes without a new call, useful for
search input. Throttling limits how often work runs during repeated events,
useful for scroll or resize handling.

### 43. What is a `Symbol`?

A Symbol is a primitive value that is unique, even when two Symbols have
the same description. Symbols can be used as property keys to avoid
collisions:

```js
Symbol("id") === Symbol("id"); // false
```

### 44. What is the `arguments` object?

In a regular function, `arguments` is an array-like object containing
arguments passed to that call. Arrow functions do not have their own
`arguments`. Rest parameters are usually clearer:

```js
function logAll(...values) {
  console.log(values);
}
```

### 45. What is the difference between rest and spread?

They share `...` syntax but are used in different positions. Rest collects
remaining values into an array or object; spread expands values or
properties:

```js
const [first, ...remaining] = [1, 2, 3]; // rest
const combined = [...remaining, 4];      // spread
```

### 46. What does `eval()` do, and why is it discouraged?

`eval()` parses and executes a string as JavaScript. Avoid it: untrusted
input can lead to code injection, and it makes code harder to analyze and
optimize. Use structured data parsing or explicit functions instead.

### 47. What is the `with` statement?

`with` adds an object's properties to the scope chain, making name lookup
ambiguous. It is forbidden in strict mode and should not be used in modern
JavaScript. ES modules are strict mode automatically.

### 48. What is a `Proxy`?

A `Proxy` wraps an object and can intercept operations such as property
reads and writes through a handler. Proxies enable metaprogramming but can
make behavior harder to inspect and should be used deliberately.

### 49. What are microtasks and tasks?

Promise reactions and `queueMicrotask()` schedule microtasks. Timers and
many user events schedule tasks. After a JavaScript job completes, the host
processes queued microtasks before moving on according to its event-loop
rules. Avoid assuming that every browser renders at an identical point
relative to every task.

### 50. What is the global object?

The global object provides global environment properties. In browsers it
is commonly accessible as `window`; in modern JavaScript the
environment-neutral name is `globalThis`. Node.js has its own global
environment. Global declarations do not all become properties in exactly
the same way across scripts and modules.

### 51. What is function composition?

Function composition combines functions so one function's output becomes
another's input. It can build a larger transformation from small,
reusable functions.

### 52. What are dynamic imports?

`import()` loads a module asynchronously and returns a Promise for its
module namespace object. It can support conditional loading and code
splitting:

```js
const math = await import("./math.js");
console.log(math.add(2, 3));
```

### 53. How do default parameters work?

A default parameter value is used when the argument is omitted or is
`undefined`, not whenever it is falsy:

```js
function greet(name = "Guest") {
  return `Hello, ${name}`;
}
greet(""); // "Hello, "
```

### 54. What is method chaining?

Method chaining calls a method on the value returned by a previous method.
For example, `filter(...).map(...)` works because `filter()` returns an
array. Not every method returns its receiver; `forEach()` returns
`undefined`.

### 55. What is the difference between `Object.freeze()` and `Object.seal()`?

`Object.freeze()` prevents adding, removing, or changing an object's own
properties. `Object.seal()` prevents adding or removing properties but
allows writes to existing writable properties. Both are shallow: nested
objects are not automatically frozen or sealed.

### 56. What is the ternary operator?

The conditional (ternary) operator returns one of two expressions:

```js
const label = isReady ? "Open" : "Wait";
```

Use it for short, readable choices; deeply nested ternaries are difficult
to understand.

### 57. What is optional catch binding?

Optional catch binding allows omitting the error parameter when it is not
needed:

```js
try {
  runTask();
} catch {
  showGenericFailure();
}
```

### 58. Is `{}` different from `new Object()`?

Both can create an ordinary object in common cases. `{}` is the object
literal syntax and is the usual, concise choice. The `Object` constructor
has special behavior for some inputs, so it is not a universal substitute
for an object literal.

### 59. What is the difference between `Math.floor()`, `Math.ceil()`, and `Math.round()`?

`Math.floor()` rounds toward negative infinity, `Math.ceil()` rounds toward
positive infinity, and `Math.round()` rounds to the nearest integer using
JavaScript's specified tie behavior. For negative values, floor is not the
same as truncating toward zero.

### 60. Can function expressions be called before their line in the source?

Function declarations are initialized according to their scope's hoisting
rules. A function expression assigned to `let` or `const` cannot be used
before that binding is initialized. A `var` binding exists earlier as
`undefined`, so attempting to call it before assignment fails.

### 61. What are common pitfalls of `typeof`?

`typeof null` is `"object"` and `typeof []` is `"object"`. Use
`value === null` to check for null, `Array.isArray(value)` for arrays, and
`typeof` for appropriate primitive-type checks.

### 62. What is type coercion?

Type coercion is converting a value to another type. Explicit conversion
uses functions such as `Number()` or `String()`. Implicit coercion happens
as part of operations, such as string concatenation with `+`.

### 63. What is `NaN`?

`NaN` means “Not a Number,” but its JavaScript type is `number`. It
represents an invalid numeric result. Since `NaN !== NaN`, use
`Number.isNaN(value)` to test for it.

### 64. How do `for`, `while`, and `do...while` differ?

`for` combines initialization, a condition, and an update in one construct.
`while` checks its condition before each iteration. `do...while` checks
after its body, so it runs at least once.

### 65. What do `&&`, `||`, and `!` do?

`&&` and `||` short-circuit and return one of their operands. `!` converts
its operand to a boolean and negates it. They are logical operators, but
`&&` and `||` do not always return boolean values.

### 66. What are string escape sequences?

Escape sequences use a backslash to represent special characters in a
string, such as `\n` for a newline, `\t` for a horizontal tab, and `\\` for
a backslash. Quotes can also be escaped when needed.

### 67. What is short-circuit evaluation?

Short-circuit evaluation stops evaluating an expression once its result is
determined. For example, `a && b` does not evaluate `b` when `a` is falsy;
`a || b` does not evaluate `b` when `a` is truthy. `??` similarly skips
its right side when the left side is not nullish.

### 68. What is the difference between `parseInt()` and `Number()`?

`parseInt()` parses an integer prefix (provide radix `10` for ordinary
decimal input); `Number()` converts the whole input:

```js
parseInt("42px", 10); // 42
Number("42px");       // NaN
Number("42.5");       // 42.5
```

### 69. What are JavaScript's falsy values?

The falsy values are `false`, `0`, `-0`, `0n`, `""`, `null`, `undefined`,
and `NaN`. All other values—including empty arrays and empty objects—are
truthy.

### 70. What is the difference between `innerText` and `textContent`?

`textContent` reads or sets text content without considering rendered
appearance. `innerText` reflects rendered text and is affected by styling
and layout. Use `textContent` for inserting plain text; avoid using
`innerHTML` with untrusted strings.

### 71. How do arrow functions differ from regular functions?

Arrow functions have lexical `this`, no own `arguments`, and cannot be
constructors. Regular functions can have a call-dependent `this` and may
be constructors when used appropriately. Choose based on behavior, not
only shorter syntax.

## Browser and API questions

### 72. What does `fetch()` return, and how should its response be checked?

`fetch()` returns a Promise that fulfills with a `Response` when a response
is received. HTTP statuses such as 404 and 500 do not normally reject that
Promise; check `response.ok` or `response.status` before reading the body.
Network errors and aborts can reject.

### 73. What is the difference between `preventDefault()` and `stopPropagation()`?

`preventDefault()` cancels a cancelable event's browser default action,
such as a form's normal navigation. `stopPropagation()` stops the event
from continuing through the propagation path. They solve different
problems.

### 74. What is the difference between `event.target` and `event.currentTarget`?

`event.target` is the event's originating node. `event.currentTarget` is
the element whose listener is currently executing. They can differ when an
event bubbles.

### 75. What does the `checked` property represent?

For a checkbox or radio input, `checked` is a boolean representing its
current checked state. The HTML `checked` attribute describes the initial
state; user interaction can change the property.

### 76. How should JavaScript errors be handled?

Use `try`/`catch` for synchronous exceptions and awaited Promise failures.
Catch an error where the code can respond meaningfully, such as displaying
a retry option or reporting an operation failure. Avoid empty catches and
do not expose sensitive internal details to users.

### 77. What is JSON parsing, and why validate the result?

`JSON.parse()` converts valid JSON text into JavaScript values. Parsing
only verifies JSON syntax; it does not ensure the result has the fields,
types, or allowed values your application expects. Validate data at
runtime before relying on it.

### 78. Why can assigning a value to `innerHTML` be risky?

`innerHTML` parses its input as markup. If untrusted input is inserted,
attackers may inject executable markup or otherwise alter the page. Use
`textContent` for plain text and trusted, context-appropriate sanitization
when HTML rendering is required.

### 79. How should dates be formatted for different locales?

Use `Intl.DateTimeFormat` or `Date.prototype.toLocaleString()` with an
explicit locale and, where needed, timezone. A `Date` represents an
instant; formatting varies across locales and runtimes.

## Further learning

- [MDN: JavaScript Guide](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide)
- [MDN: JavaScript Reference](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference)
- [ECMAScript Language Specification](https://tc39.es/ecma262/)
- [MDN: DOM events](https://developer.mozilla.org/en-US/docs/Web/API/Document_Object_Model/Events)
- [MDN: Fetch API](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API)
