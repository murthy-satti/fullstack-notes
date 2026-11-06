# TypeScript

TypeScript is a programming language and toolchain built on JavaScript. It
adds a static type system that checks many relationships between values
before the program runs. TypeScript source is transformed to JavaScript for
execution; ordinary type annotations do not exist at runtime.

## Why use it?

Types can document a function's contract, improve editor completion, and
catch errors during development. They are especially helpful when many
components and developers share data structures. They do not prove that a
network response or user input is valid.

## Type inference and annotations

The checker can infer types from values. Add explicit annotations where they
clarify a public contract or prevent an ambiguous type.

```ts
const siteName = "Engineering Notes"; // inferred string
let visitCount: number = 0;           // explicit annotation

function greet(name: string): string {
  return `Hello, ${name}`;
}
```

## Everyday type building blocks

- **Primitive types:** `string`, `number`, `boolean`, `bigint`, `symbol`,
  `null`, and `undefined`.
- **Arrays:** `string[]` or `Array<string>`.
- **Objects:** named properties, including optional properties like
  `nickname?: string`.
- **Union:** `A | B`, meaning one of several possibilities.
- **Literal type:** an exact value such as `"loading"` or `200`.
- **Tuple:** fixed-position values such as `[number, string]`.
- **Function type:** parameter and return types, such as
  `(id: string) => boolean`.
- **`unknown`:** a value that must be checked before use.
- **`never`:** a value that cannot occur, useful for exhaustive checks.

Prefer `unknown` to `any` at uncertain boundaries. `any` turns off many
useful checks.

## Practical example

```ts
type LoadState =
  | { status: "loading" }
  | { status: "success"; items: string[] }
  | { status: "error"; message: string };

function describe(state: LoadState): string {
  switch (state.status) {
    case "loading":
      return "Loading";
    case "success":
      return `${state.items.length} items`;
    case "error":
      return state.message;
  }
}
```

The discriminant `status` lets the checker know which fields are available
in each branch.

## TypeScript and runtime data

Types are erased or otherwise do not automatically check arbitrary values at
runtime. Validate API responses, browser storage, user input, and other
external data. See [runtime validation](typescript/runtime-validation.md).

## Learning path

- [Types and narrowing](typescript/types-and-narrowing.md)
- [Functions, objects, and generics](typescript/functions-objects-generics.md)
- [Advanced and utility types](typescript/advanced-and-utility-types.md)
- [Compiler and project configuration](typescript/compiler-and-project-configuration.md)
- [TypeScript with React](typescript/typescript-with-react.md)
- [Runtime data validation](typescript/runtime-validation.md)

## Common misconceptions

- TypeScript does not replace JavaScript at runtime.
- A type assertion does not convert or validate the actual value.
- A type-safe program can still have logic, accessibility, security, and
  performance bugs.
- More annotations are not always better; inference is often clear and
  reliable.

## Check your understanding

1. What runs after TypeScript is built?
2. How does `unknown` differ from `any`?
3. Why should an API response be checked at runtime?

## Further learning

- [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro.html)
- [TypeScript for JavaScript Programmers](https://www.typescriptlang.org/docs/handbook/typescript-in-5-minutes.html)
- [TypeScript Interview Questions and Answers](typescript/interview-questions-and-answers.md)
