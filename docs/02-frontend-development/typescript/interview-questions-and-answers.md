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
