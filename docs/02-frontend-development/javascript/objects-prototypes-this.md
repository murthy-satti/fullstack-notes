# JavaScript Objects, Prototypes, and `this`

Objects group properties and methods. JavaScript uses prototypes to provide
shared behavior, and the meaning of `this` depends on how a function is
called.

## Objects and prototypes

An object can have another object as its prototype. Property lookup checks
the object first, then follows the prototype chain. JavaScript classes provide
syntax over this prototype-based behavior; they do not create a separate
classical object model.

## `this`

In a method call such as `account.deposit()`, `this` refers to the receiver
object for that call. Arrow functions do not create their own `this`; they
capture it lexically from the surrounding scope. Detached callbacks can lose
the expected receiver if they are ordinary functions.

## Practical example

```js
const account = {
  balance: 10,
  deposit(amount) {
    this.balance += amount;
    return this.balance;
  },
};

account.deposit(5);
```

For callback code, use an arrow function when lexical `this` is intended, or
explicitly bind/pass the needed value.

## Developer perspective and terminology

Prefer composition and straightforward object data over deep prototype
hierarchies. **Prototype chain** is the sequence checked during property
lookup; **method receiver** is the object to the left of the method call;
**lexical `this`** is captured from the surrounding scope.

## Common misconceptions

- `this` is not always the object where a function was written.
- Arrow functions do not have their own `this` or `arguments`.
- JavaScript `class` syntax still uses prototypes for instance methods.

## Further learning

- [MDN: Working with objects](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Working_with_objects)
- [MDN: `this`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/this)
