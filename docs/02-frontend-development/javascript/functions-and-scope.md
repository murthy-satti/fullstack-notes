# JavaScript Functions, Expressions, and Scope

Functions package reusable behavior. A function can be declared, assigned
to a variable, passed as an argument, or returned from another function.
Scope determines where its bindings can be used.

## Function declarations and expressions

```js
function formatName(first, last = "") {
  return `${first} ${last}`.trim();
}

const formatLabel = function (value) {
  return `Topic: ${value}`;
};
```

Function declarations are initialized before their containing scope runs
(subject to module and block rules). Function expressions are values
assigned where the expression executes. Prefer clear names and avoid relying
on hoisting for readability.

## Arrow functions

```js
const double = (number) => number * 2;
const logTopic = (topic) => {
  console.log(topic);
};
```

An expression body returns its expression implicitly; a block body needs
`return` to return a value. Arrow functions do not have their own `this` or
`arguments`; they capture `this` lexically from the surrounding scope.

## Parameters, return values, and callbacks

Parameters receive arguments. Default parameters apply when an argument is
`undefined`, not whenever it is falsy. A callback is a function supplied to
another function to be called later or during an operation.

```js
function greet(name = "learner") {
  return `Hello, ${name}`;
}

["HTML", "CSS"].forEach((topic) => console.log(topic));
```

Keep functions focused and return useful values rather than relying on
unnecessary shared state.

## Scope and variable lifetime

- **Global/module scope:** bindings visible across a script or module's
  relevant top-level code.
- **Function scope:** bindings local to a function.
- **Block scope:** `let` and `const` bindings inside `{ ... }`.
- **Lexical scope:** visibility determined by where code is written.

`var` is function-scoped and has older hoisting behavior; prefer `const`
unless reassignment is needed, then use `let`.

## Developer perspective and misconceptions

Passing a function does not call it: `handler` is a reference, while
`handler()` invokes it. Closures let inner functions retain access to
lexical bindings; see [closures and classes](closures-and-classes.md).

## Further learning

- [MDN: Functions](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Functions)
- [MDN: Function expressions](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/function)
- [MDN: Scope](https://developer.mozilla.org/en-US/docs/Glossary/Scope)
