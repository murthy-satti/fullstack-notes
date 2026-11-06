# JavaScript Objects, Destructuring, Rest, and Spread

Objects group values under property names. Destructuring extracts values;
rest collects remaining values; spread expands iterable values or copies
own enumerable object properties into a new object.

## Nested objects

```js
const user = {
  name: "Ravi",
  address: {
    city: "Chennai",
    country: "India",
  },
};

console.log(user.address.city);
console.log(user.preferences?.theme ?? "light");
```

Optional chaining (`?.`) stops access when the left side is `null` or
`undefined`. It is not a substitute for validating required data.

## Destructuring

```js
const { name, address: { city } } = user;
const [firstTopic, secondTopic] = ["HTML", "CSS"];
```

Object patterns match property names; array patterns match positions.
Aliases and default values are supported:

```js
const { name: displayName = "Guest" } = user;
```

## Rest parameters and rest properties

A rest parameter gathers remaining function arguments into an array:

```js
function sum(...numbers) {
  return numbers.reduce((total, number) => total + number, 0);
}
```

In destructuring, `...rest` gathers remaining properties or elements:

```js
const { name: ignored, ...publicDetails } = user;
```

## Spread syntax

Spread expands an iterable into values or copies enumerable object
properties:

```js
const original = ["HTML", "CSS"];
const allTopics = [...original, "JavaScript"];

const updatedUser = { ...user, name: "Anika" };
```

These are shallow copies. Nested objects remain shared references unless
they are copied separately.

## Developer perspective and misconceptions

Destructuring and spread can make updates clear, but deeply nested patterns
can hide assumptions about input shape. Spread is not a deep clone, and
rest parameters are not the same feature as spread despite sharing `...`.

## Check your understanding

1. How does object destructuring find a property?
2. What does a rest parameter collect?
3. Why is `{ ...user }` only a shallow copy?
4. What does optional chaining protect against?

## Further learning

- [MDN: Destructuring](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Destructuring)
- [MDN: Rest parameters](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Functions/rest_parameters)
- [MDN: Spread syntax](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Spread_syntax)
