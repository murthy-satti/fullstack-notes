# TypeScript Interview Questions and Answers

Review these questions after learning the TypeScript lessons. TypeScript
checks source code before runtime; it does not replace runtime validation.

## Types and narrowing

### 1. What is TypeScript?

TypeScript is a programming language that builds on JavaScript with a
static type system. It is typically checked and transformed into JavaScript
for execution; browsers do not execute TypeScript types.

### 2. What is type inference?

Type inference is the compiler deriving a type from a value or context, so
developers do not need to annotate every variable.

### 3. What is the difference between `any` and `unknown`?

`any` disables many type checks for a value. `unknown` can hold any value,
but code must narrow or validate it before using it as a specific type.
Prefer `unknown` at untrusted boundaries.

### 4. What is `never` used for?

`never` represents a value that cannot occur, such as a function that
always throws or an impossible branch after exhaustive narrowing.

### 5. What are union types?

A union such as `string | number` says a value can be one of several
types. The program must narrow the value before using operations that only
apply to one member.

### 6. What is type narrowing?

Narrowing uses control flow or type guards to refine a broader type into a
more specific one:

```ts
function show(value: string | number) {
  if (typeof value === "string") return value.toUpperCase();
  return value.toFixed(2);
}
```

### 7. What is the difference between `interface` and `type`?

Both can describe object shapes. Interfaces can be extended and
declaration-merged; type aliases can express unions, intersections, and
other type expressions. Choose the form that best communicates the model
and follow project conventions.

## Functions and reusable types

### 8. What are generics?

Generics let code express relationships between input and output types
without choosing one concrete type in advance:

```ts
function first<T>(items: T[]): T | undefined {
  return items[0];
}
```

### 9. What is a type assertion?

A type assertion tells the compiler how the programmer wants a value
treated. It is removed at runtime and does not check or convert the value.
Use it only when the program has information the compiler cannot infer.

### 10. What are utility types?

Utility types transform existing types. Examples include `Partial<T>`,
`Pick<T, K>`, `Omit<T, K>`, and `Readonly<T>`. They affect compile-time
checking and do not enforce runtime behavior.

### 11. What is a discriminated union?

A discriminated union is a union of object types that share a property
whose literal value identifies the variant. Checking that property lets
TypeScript narrow the object safely.

### 12. What is the difference between optional and nullable properties?

An optional property may be absent. A nullable property is present with a
value that may be `null`. These states are distinct and should be modeled
according to the data contract.

## Runtime and project setup

### 13. Do TypeScript types validate API responses at runtime?

No. Type annotations and assertions are erased from emitted JavaScript.
Validate untrusted responses at runtime with checks or a schema-validation
library before relying on them.

### 14. What does `strict` do in `tsconfig.json`?

The `strict` option enables a family of stronger type-checking options.
It helps catch issues such as implicit `any` and possible null access.
Individual flags and project settings can further change the checks.

### 15. What is the difference between `tsc` and a runtime?

`tsc` type-checks and can emit JavaScript. A JavaScript runtime such as a
browser or Node.js executes JavaScript. Build tools may combine or replace
these steps, but type checking and execution remain different concerns.

## Further learning

- [TypeScript overview](../typescript.md)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro.html)
- [TypeScript: `tsconfig.json`](https://www.typescriptlang.org/tsconfig)

## Scenario questions

### 16. An API response is typed as `User`, but a missing field crashes the page. Why did TypeScript not catch it?

A type annotation does not validate JSON at runtime. If the response was asserted as `User` or trusted through an unchecked cast, the compiler accepted the claim without inspecting the payload. Treat external data as `unknown`, validate its shape at the boundary with explicit checks or a schema library, and only then expose a trusted domain type to the rest of the application.

### 17. A function accepts a union but callers repeatedly pass the wrong object shape. How can the type model help?

Model valid variants as a discriminated union with a literal tag, such as `{ kind: "email"; address: string } | { kind: "sms"; phone: string }`. The tag makes narrowing explicit and lets the compiler reject combinations that do not belong to either variant. Avoid a bag of many optional fields when only certain combinations are valid.

### 18. A switch over a union silently misses a new variant after the type changes. How can you make it exhaustive?

After handling each known discriminant, assign the remaining value to `never` in a default branch. If a new union member is added, the remaining value is no longer `never`, producing a compile-time error. This is a compile-time safeguard; still decide how unknown values from external data should be handled at runtime.

### 19. A generic helper returns `any` despite having a type parameter. What should you check?

Look for an `any` input, an overly broad constraint, an unsafe assertion, or a library declaration that leaks `any`. `any` can flow through generic code and disable checking. Prefer `unknown` for untrusted values, constrain type parameters only as needed, and preserve the relationship between inputs and outputs rather than asserting a desired result.

### 20. A value can be missing, `null`, or a concrete value. How should the type express it?

Model the states explicitly, for example `value?: string | null` when the property may be absent, explicitly null, or a string. Then handle each state intentionally; optional chaining can avoid an exception but may collapse meaningful states. Match the API contract and compiler options such as `strictNullChecks`, and normalize the value at the boundary if downstream code needs fewer states.

### 21. A developer adds `as SomeType` to silence a compile error. When is that appropriate?

An assertion changes the compiler's view but does not convert or validate the runtime value. Use one only when a fact is established by surrounding logic that TypeScript cannot express, and keep the assertion close to that proof. Prefer a type guard, parser, or improved type model when possible; broad or chained assertions can hide real defects.

## Further learning
