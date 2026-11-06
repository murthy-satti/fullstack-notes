# JavaScript

## Introduction

JavaScript is a programming language used in browsers and other environments.
In a web page it can respond to actions, update the DOM, validate input, and
communicate with servers. It adds behavior to the structure described by
[HTML](html.md) and the presentation defined by
[CSS](css.md).

## Why does it exist?

JavaScript lets pages respond to users: a button can open a menu, a form can
report missing information, or a page can request data without reloading.

## How does it work?

An engine parses and executes JavaScript. The browser provides APIs such as
the DOM and `fetch`; these are host features, not the language itself. The
event loop coordinates queued asynchronous work.

JavaScript is dynamically typed: values have runtime types, while variables
can refer to values of different types at different times. It supports
functions as values, objects, modules, and asynchronous operations using
Promises and `async`/`await`.

## Real-world example

When a user submits a search, code can request and render results. The server
must still validate the query; browser checks are not a security boundary.

## Developer perspective

Use small functions and descriptive names, and prefer `const` unless a value
must be reassigned. Handle asynchronous failures and test unusual input.
Larger projects may use
[TypeScript](typescript.md), and [React](react.md) builds user interfaces
using JavaScript components.

## Practical example

```js
const button = document.querySelector("#greeting");

button?.addEventListener("click", () => {
  button.textContent = "Hello, learner!";
});
```

The browser finds the element and runs the callback on a click. The optional
chain avoids calling the listener method if the element is absent; TypeScript
or a deliberate null check can make that condition more explicit.

## Important terminology

- **Variable:** A named binding for a value.
- **Function:** Reusable code that can accept inputs and return a result.
- **Event:** A notification of an action or occurrence, such as a click.
- **Promise:** An object representing a result that may become available later.
- **DOM:** A programmable representation of a web document.
- **Event loop:** Host scheduling mechanism that runs queued asynchronous
  callbacks when JavaScript execution is available.

## Advantages and disadvantages

JavaScript runs widely and supports small scripts and large applications.
Inconsistent conventions, unhandled asynchronous errors, or excessive
client-side work can make code harder to maintain or pages slower.

## Common misconceptions

- JavaScript and Java are distinct languages.
- The browser DOM and `fetch` are Web APIs, not built-in parts of ECMAScript.
- Client-side validation cannot replace server-side validation.

## Revision questions

1. What work does the browser provide beyond the JavaScript language?
2. How does an event listener connect an action to code?
3. Why must a server validate data even if the browser checks it?

## Explore JavaScript topics

- [Values, variables, and functions](javascript/foundations.md): primitive
  types, declarations, operators, and basic functions.
- [Strings and type conversion](javascript/strings-and-type-conversion.md):
  string operations, coercion, parsing, and explicit conversion.
- [Operators and control flow](javascript/operators-and-control-flow.md):
  comparisons, conditionals, switch statements, and loops.
- [Control flow and collections](javascript/control-flow-and-collections.md):
  iteration and the core collection types.
- [Arrays and array methods](javascript/arrays-and-array-methods.md):
  common methods including `forEach`, `map`, `filter`, `reduce`, `sort`,
  chaining, and two-dimensional arrays.
- [Objects, destructuring, and spread](javascript/objects-destructuring-and-spread.md):
  nested objects, object/array destructuring, rest parameters, and spread.
- [Objects, prototypes, and `this`](javascript/objects-prototypes-this.md)
- [Functions and scope](javascript/functions-and-scope.md): declarations,
  expressions, arrow functions, parameters, return values, and scope.
- [Closures and classes](javascript/closures-and-classes.md): closures,
  constructors, static members, inheritance, `super`, getters, and setters.
- [Browser input, output, and debugging](javascript/browser-input-output-and-debugging.md):
  common output methods, input dialogs, and console timing.
- [DOM and events overview](javascript/dom-and-events.md), followed by
  focused lessons on [DOM navigation and updates](javascript/dom-navigation-and-updates.md)
  and [event listeners and forms](javascript/event-listeners-and-forms.md).
- [Callbacks, timers, and callback hell](javascript/callbacks-and-timers.md)
- [Promises and async/await](javascript/async-javascript.md)
- [Event loop and concurrency](javascript/event-loop-and-concurrency.md)
- [JSON and fetching API data](javascript/json-and-fetch.md)
- [Browser APIs and storage](javascript/browser-apis-and-storage.md)
- [Window, document, and cookies](javascript/window-document-and-cookies.md)
- [Navigator and device APIs](javascript/navigator-and-device-apis.md):
  browser language, online hints, permissions, location, media, clipboard,
  sharing, and other capability APIs.
- [Dates and internationalization](javascript/dates-and-internationalization.md)
- [Modules and error handling](javascript/modules-and-errors.md)
- [JavaScript Interview Questions and Answers](javascript/interview-questions-and-answers.md):
  review core concepts with concise answers and examples.

## Further Learning & References

- **Reference:** [MDN JavaScript Guide](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide) teaches language features with examples.
- **Official standard:** [ECMAScript Language Specification](https://tc39.es/ecma262/) defines the JavaScript language itself, rather than browser APIs.
