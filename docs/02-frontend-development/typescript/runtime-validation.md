# Runtime Validation of Data

TypeScript checks code during development and build time, but external data
arrives while an application is running. Runtime validation checks that data
actually has the expected shape before code relies on it.

## Why it matters

Network responses, browser storage, user input, and environment values are
not made trustworthy by adding a TypeScript annotation. A malformed response
can still cause a runtime failure or an incorrect decision.

## How it works

Treat data from outside the typed program as `unknown`. Check its structure
and values, then convert it to a trusted application representation. Larger
projects often use a schema-validation library; small boundaries can use
careful explicit checks.

## Practical example

```ts
type Profile = { id: string; displayName: string };

function parseProfile(value: unknown): Profile {
  if (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "displayName" in value &&
    typeof value.id === "string" &&
    typeof value.displayName === "string"
  ) {
    return { id: value.id, displayName: value.displayName };
  }
  throw new Error("Invalid profile response");
}
```

This is a small example; production schemas may need limits, nested checks,
and useful error reporting.

## Developer perspective and terminology

Validate at trust boundaries, especially before using values for access
control, database writes, or rendering. **Trust boundary** is where data
enters from a source not controlled by the current code. **Parsing** turns
input into a structured representation; **validation** verifies constraints.

## Common misconceptions

- `const profile: Profile = await response.json()` does not inspect the JSON.
- A successful HTTP status does not guarantee a response has the expected
  content.
- Validation improves correctness but does not replace authorization or
  output encoding.

## Check your understanding

1. Why should untrusted data start as `unknown`?
2. What is the difference between parsing and validating?
3. Name two trust boundaries in a web application.

## Further learning

- [TypeScript Handbook: `unknown`](https://www.typescriptlang.org/docs/handbook/2/functions.html#unknown)
- [MDN: Working with JSON](https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Scripting/JSON)
