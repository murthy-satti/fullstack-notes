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

button.addEventListener("click", () => {
  button.textContent = "Hello, learner!";
});
```

The browser finds the element and runs the callback on a click.

## Important terminology

- **Variable:** A named binding for a value.
- **Function:** Reusable code that can accept inputs and return a result.
- **Event:** A notification of an action or occurrence, such as a click.
- **Promise:** An object representing a result that may become available later.
- **DOM:** A programmable representation of a web document.

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

## Further Learning & References

- **Reference:** [MDN JavaScript Guide](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide) teaches language features with examples.
- **Official standard:** [ECMAScript Language Specification](https://tc39.es/ecma262/) defines the JavaScript language itself, rather than browser APIs.
