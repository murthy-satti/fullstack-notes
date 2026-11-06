# JavaScript Closures and Classes

A closure is a function together with access to the lexical environment where
it was created. JavaScript classes provide syntax for constructing objects
with shared methods, using the language's prototype system.

## Closures

```js
function createCounter() {
  let count = 0;
  return function increment() {
    count += 1;
    return count;
  };
}

const nextCount = createCounter();
nextCount(); // 1
nextCount(); // 2
```

The inner function keeps access to `count` after `createCounter` returns.
Closures are useful for callbacks, event handlers, and encapsulating
state—but captured values and retained objects can also keep memory alive.

## Classes and instances

```js
class User {
  constructor(name) {
    this.name = name;
  }

  describe() {
    return `User: ${this.name}`;
  }
}

const learner = new User("Ari");
```

`constructor` initializes a new instance. Instance methods are typically
shared through the prototype. `extends` establishes inheritance and `super`
calls a parent constructor or method. A class body runs in strict mode.

## Static and private members

- `static` members belong to the class itself, not each instance.
- Private fields/methods use `#name` syntax and are enforced by the language.
- Getters and setters define property access behavior; use them only when
  their abstraction is useful.

```js
class Temperature {
  #celsius;

  constructor(celsius) {
    this.#celsius = celsius;
  }

  get celsius() {
    return this.#celsius;
  }

  static fromFahrenheit(value) {
    return new Temperature((value - 32) * 5 / 9);
  }
}
```

## Developer perspective and misconceptions

Prefer simple functions and composition where they communicate intent more
clearly than a class hierarchy. A class method's `this` depends on the call
receiver; passing a detached method as a callback can lose that receiver.
Closures share access to captured bindings, not snapshots of their values.

**Lexical environment** contains visible bindings; **instance** is an object
created from a constructor/class; **prototype** provides shared behavior;
**encapsulation** limits direct access to implementation details.

## Check your understanding

1. What does a closure retain?
2. Where are ordinary class instance methods typically shared?
3. What is the difference between a static member and an instance member?

## Further learning

- [MDN: Closures](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Closures)
- [MDN: Classes](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Classes)
