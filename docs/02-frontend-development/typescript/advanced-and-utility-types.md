# Advanced and Utility Types

TypeScript includes features for deriving, combining, and transforming types.
These tools help model real application data without duplicating every
definition.

## Unions and intersections

A union such as `A | B` represents a value that may be either type. An
intersection such as `A & B` combines requirements from both types. Use
discriminated unions for variants that need different fields or behavior.

## Useful built-in utility types

- `Partial<T>` makes properties optional.
- `Pick<T, K>` selects a subset of properties.
- `Omit<T, K>` removes selected properties.
- `Record<K, V>` describes an object keyed by `K` with values of type `V`.
- `Readonly<T>` prevents reassignment of properties in checked code.
- `ReturnType<F>` derives a function's return type.

```ts
type Account = { id: string; name: string; active: boolean };
type AccountUpdate = Partial<Pick<Account, "name" | "active">>;
type AccountById = Record<string, Account>;
```

These are compile-time descriptions. `Readonly` does not freeze an object at
runtime, and `Partial` does not validate incoming JSON.

## Developer perspective and terminology

Prefer types that make valid states clear and remain easy to understand.
**Mapped type** transforms properties of another type; **conditional type**
selects a type based on a type relationship; **utility type** is a reusable
built-in type transformation.

## Common misconceptions

- A complex type is not automatically more precise or safer.
- `Readonly<T>` is generally shallow unless nested values are also readonly.
- Utility types do not change runtime objects.

## Further learning

- [TypeScript Handbook: Utility Types](https://www.typescriptlang.org/docs/handbook/utility-types.html)
- [TypeScript Handbook: Creating types from types](https://www.typescriptlang.org/docs/handbook/2/types-from-types.html)
