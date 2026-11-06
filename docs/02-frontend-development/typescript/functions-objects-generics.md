# TypeScript Functions, Objects, and Generics

TypeScript describes function inputs and outputs, object shapes, and
relationships between reusable values. These types help callers understand
contracts and help the checker catch mismatches.

## Object types

```ts
type User = {
  id: string;
  name: string;
  nickname?: string;
  readonly createdAt: Date;
};
```

- `?` marks a property optional; reading it may produce `undefined`.
- `readonly` prevents reassignment through that type in checked code; it
  does not freeze the object at runtime.
- Types are generally structural: compatible property shapes can be
  assignable even when type names differ.

`interface` and `type` can both describe object shapes. Interfaces can be
declaration-merged and extended; type aliases can represent unions, tuples,
and other type expressions. Choose a consistent project convention.

## Function types and overloads

```ts
type Formatter = (value: number, currency?: string) => string;

const formatPrice: Formatter = (value, currency = "USD") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency }).format(value);
```

Function types can describe parameters, optional/rest parameters, and return
values. Use overload signatures only when callers truly get different
type-level behavior from different argument shapes; avoid overloads that
obscure a simple union.

## Generics

A generic type parameter preserves a relationship between types:

```ts
function first<T>(items: readonly T[]): T | undefined {
  return items[0];
}

const firstName = first(["Ari", "Sam"]); // string | undefined
```

Constraints narrow which types are accepted:

```ts
function getId<T extends { id: string }>(value: T): string {
  return value.id;
}
```

Generic defaults and multiple type parameters can model more complex
relationships, but use the simplest type that communicates the contract.

## `keyof`, indexed access, and `typeof`

```ts
type Product = { id: string; price: number; title: string };
type ProductKey = keyof Product; // "id" | "price" | "title"
type ProductPrice = Product["price"]; // number

const defaults = { pageSize: 20, compact: false };
type Defaults = typeof defaults;
```

These operators derive types from existing structures and reduce duplication.

## Practical example

```ts
type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function first<T>(items: readonly T[]): T | undefined {
  return items[0];
}

type Book = { id: string; title: string };
const result: ApiResult<Book[]> = {
  ok: true,
  data: [{ id: "b1", title: "Web Basics" }],
};
```

## Developer perspective and misconceptions

Use generics when the input/output relationship matters, not simply to make
a function look reusable. Use readonly arrays and properties when mutation
should be discouraged. Types do not validate runtime API data; validate
external boundaries.

- Structural typing checks compatible members, not just declared names.
- `readonly` is a compile-time restriction and is often shallow.
- `T extends U` constrains `T`; it does not mean `T` is exactly `U`.
- Avoid defaulting to `any` for convenience.

## Check your understanding

1. What does `keyof Product` produce?
2. What relationship does a generic preserve?
3. Does `readonly` freeze an object at runtime?

## Further learning

- [TypeScript Handbook: Object types](https://www.typescriptlang.org/docs/handbook/2/objects.html)
- [TypeScript Handbook: Functions](https://www.typescriptlang.org/docs/handbook/2/functions.html)
- [TypeScript Handbook: Generics](https://www.typescriptlang.org/docs/handbook/2/generics.html)
- [TypeScript Handbook: `keyof`](https://www.typescriptlang.org/docs/handbook/2/keyof-types.html)
