# TypeScript

## Introduction

TypeScript adds a static type system to JavaScript. Developers describe
expected values and relationships, and tools find many mistakes before
execution. TypeScript ultimately emits JavaScript.

## Why does it exist?

In a growing codebase, data and function inputs may be unclear. Types
document expectations, catch mismatches, and make refactoring safer.

## How does it work?

The checker analyzes source and infers types where possible. A build step
transforms supported syntax into JavaScript; type information is generally
erased and does not validate external data at runtime.

## Real-world example

An application can define a `Book` type with an identifier and title. The
editor can warn about a missing property or an incorrect value type. API data
still needs runtime validation.

## Developer perspective

Use types to clarify contracts, not to annotate every obvious value. Prefer
narrow types and model optional values explicitly.
TypeScript is especially useful alongside [JavaScript](javascript.md) and
[React](react.md); code using [Next.js](nextjs.md) can also be written in
TypeScript.

## Practical example

```ts
type Book = {
  id: number;
  title: string;
};

function describeBook(book: Book): string {
  return `${book.title} (#${book.id})`;
}
```

Calling `describeBook` with an object that has a string `id` is a type error
unless the declared type is changed.

## Important terminology

- **Static type checking:** Analysis of types before code executes.
- **Type inference:** The checker deriving a type from context or a value.
- **Type annotation:** Syntax that explicitly states a type.
- **Transpilation:** Transforming source code into another language version.

## Advantages and disadvantages

TypeScript improves editor support and catches many errors before runtime.
It adds build concerns, and types cannot guarantee network data is valid.

## Common misconceptions

- TypeScript does not replace JavaScript at runtime; it produces JavaScript.
- Types are not automatically runtime checks.
- TypeScript does not prevent every bug; tests and careful design remain useful.

## Revision questions

1. What runs in the browser after TypeScript code is built?
2. What is the difference between type inference and an annotation?
3. Why should API data be validated at runtime?

## Further Learning & References

- **Official docs:** [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro.html) introduces the type system and language tools.
- **Official docs:** [TypeScript for JavaScript Programmers](https://www.typescriptlang.org/docs/handbook/typescript-in-5-minutes.html) gives JavaScript developers a concise orientation.
