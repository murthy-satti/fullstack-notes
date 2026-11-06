# JavaScript Operators and Control Flow

Operators combine or compare values. Control-flow statements choose which
code runs and how often. They are the building blocks for validation,
business rules, and user-interface behavior.

## Common operator groups

| Group | Examples | Purpose |
|---|---|---|
| Arithmetic | `+`, `-`, `*`, `/`, `%`, `**` | Numeric calculations; `+` also concatenates strings |
| Assignment | `=`, `+=`, `??=` | Assign or update a binding/property |
| Comparison | `===`, `!==`, `<`, `>=` | Compare values; strict equality avoids coercion |
| Logical | `&&`, `||`, `!` | Combine conditions and short-circuit |
| Nullish | `??`, `?.` | Fallback for nullish values; safely access optional paths |
| Conditional | `condition ? a : b` | Select one expression for a short branch |
| Type-related | `typeof`, `instanceof` | Inspect a value's runtime category or prototype relationship |

`&&`, `||`, and `??` return an operand, not necessarily a boolean. `||`
uses a fallback for every falsy value; `??` only falls back for `null` or
`undefined`.

## Conditionals and switch

```js
if (response.ok) {
  showResults();
} else if (response.status === 404) {
  showNotFound();
} else {
  showError();
}
```

Use `switch` when one value is compared against several cases. Cases fall
through unless `break`, `return`, or another control transfer exits:

```js
switch (status) {
  case "ready":
    start();
    break;
  case "paused":
    showPaused();
    break;
  default:
    showUnknown();
}
```

## Loops

- `for` offers explicit initialization, condition, and update.
- `while` repeats while a condition remains true.
- `do...while` runs its body at least once.
- `for...of` iterates values from iterables such as arrays and strings.
- `for...in` enumerates enumerable property keys and is usually unsuitable
  for array values.

`break` exits a loop or switch; `continue` skips to the next iteration.
Ensure loop conditions eventually become false.

## Practical example

```js
const scores = [80, 55, 92];
let passed = 0;

for (const score of scores) {
  if (score >= 60) passed += 1;
}
```

## Common misconceptions

- `=` assigns; `===` compares.
- `switch` does not automatically stop after a matching case.
- `&&` and `||` do not always return `true` or `false`.
- `for...in` does not provide array values in the same way `for...of` does.

## Further learning

- [MDN: Expressions and operators](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Expressions_and_operators)
- [MDN: Control flow](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Control_flow_and_error_handling)
