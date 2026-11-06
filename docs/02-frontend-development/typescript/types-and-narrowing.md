# TypeScript Types and Narrowing

TypeScript's type system describes the values a program expects. Type
narrowing uses checks and control flow to refine a broad type to a more
specific one.

## Everyday type forms

| Type form | Example | Meaning |
|---|---|---|
| Primitive | `string`, `number`, `boolean` | Common basic values |
| Array | `string[]`, `Array<number>` | Ordered values of one element type |
| Object | `{ id: string; active: boolean }` | Named properties with declared types |
| Optional property | `{ nickname?: string }` | Property can be absent or `undefined` |
| Union | `string \| number` | Value can be one of several types |
| Literal | `"idle" \| "loading"` | Value must match listed values |
| Tuple | `[string, number]` | Ordered positions with known types |
| `unknown` | `unknown` | Must be checked before being used as a specific type |
| `never` | `never` | No possible value; useful for exhaustive branches |

## Why it matters

Types help editors explain how code is used and help catch mismatches before
execution. Narrowing is especially useful when a value may be absent or may
have one of several shapes.

## How it works

TypeScript infers many types from assigned values. An annotation can make a
public contract clearer. Union types represent alternatives; checks such as
`typeof`, `in`, and equality comparisons can narrow those alternatives inside
a branch.

## Practical example

```ts
type Result =
  | { ok: true; value: string }
  | { ok: false; message: string };

function showResult(result: Result): string {
  if (result.ok) {
    return result.value;
  }
  return result.message;
}
```

Checking the discriminant `ok` allows TypeScript to know which properties
exist in each branch.

## Common narrowing checks

```ts
function describe(value: string | number | null): string {
  if (value === null) return "No value";
  if (typeof value === "number") return value.toFixed(2);
  return value.toUpperCase();
}
```

Other narrowing tools include `in` for object properties, `instanceof` for
class instances, equality checks, and user-defined type guards. Prefer
checks that prove the value's shape rather than assertions that merely tell
the compiler to trust you.

## Exhaustiveness checks

When handling a union, a `never` assignment can help identify a new case that
was not handled:

```ts
type Theme = "light" | "dark";

function labelTheme(theme: Theme): string {
  switch (theme) {
    case "light": return "Light";
    case "dark": return "Dark";
    default: {
      const exhaustive: never = theme;
      return exhaustive;
    }
  }
}
```

## Developer perspective and terminology

Prefer precise types over `any`, which disables many useful checks. Use
`unknown` for data whose shape has not yet been verified. A **union** allows
one of several types; a **discriminated union** shares a property whose value
identifies each case; **narrowing** reduces possible types after a check.

## Common misconceptions

- Type annotations are removed from emitted JavaScript and do not validate
  data at runtime.
- A type assertion changes the checker's view; it does not convert or verify
  the value.
- `any` can hide errors rather than solve them.
- An optional property may be missing; reading it can produce `undefined`.

## Further learning

- [TypeScript Handbook: Everyday types](https://www.typescriptlang.org/docs/handbook/2/everyday-types.html)
- [TypeScript Handbook: Narrowing](https://www.typescriptlang.org/docs/handbook/2/narrowing.html)
