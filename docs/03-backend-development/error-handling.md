# Error Handling

## Introduction

Error handling detects failures and responds in a controlled way. A backend
may encounter invalid input, missing records, unavailable dependencies, or
programming mistakes. Clear responses help clients and developers.

## Why does it exist?

Failures are normal in networked systems. Without a strategy, an application
may crash, expose internal details, or return inconsistent responses. Good
handling gives clients an outcome and preserves diagnostics for operators.

## How does it work?

Code detects an error, logs relevant details, and maps it to a response. HTTP
status codes communicate outcomes; a body can provide a stable code and safe
explanation. Express passes errors to centralized middleware; see
[middleware](middleware.md).

## Real-world example

If a task does not exist, return `404 Not Found`. If a database is unavailable,
return `503 Service Unavailable` without exposing a connection string or
stack trace. Operators can investigate logs.

## Developer perspective

Distinguish expected errors from unexpected faults. Return consistent
responses, log useful context without secrets, and ensure each request gets a
response or reaches an error handler. Check Express's version-specific async
error behavior.

## Practical example

```js
app.use((error, request, response, next) => {
  console.error(error);
  response.status(500).json({ error: "Internal server error" });
});
```

This sends a generic message while recording a server-side diagnostic.
Configure production logs to protect private information.

## Important terminology

- **Operational error:** An expected failure condition, such as a missing record.
- **Programmer error:** A defect in the code that should be investigated.
- **Error middleware:** Express middleware dedicated to handling errors.
- **Status code:** HTTP response value describing the general result.

## Advantages and disadvantages

Centralized handling supports predictable responses and monitoring. Generic
errors can hide distinctions; overly detailed responses can leak information.

## Common misconceptions

- Returning status `200` with an error message does not communicate failure clearly.
- A `try/catch` block does not automatically handle every asynchronous error.
- Logging an error is not the same as recovering from it or notifying the client.

## Revision questions

1. Why should clients receive a safe message instead of a stack trace?
2. Give an example of an expected operational error.
3. What are the responsibilities of an Express error handler?

## Further Learning & References

- **Official guide:** [Express error handling](https://expressjs.com/en/guide/error-handling.html) explains how errors are passed through Express and handled.
- **Official API docs:** [Node.js errors](https://nodejs.org/api/errors.html) describes error objects and conventions used by Node.js APIs.
- **Official standard:** [RFC 9110: HTTP Semantics](https://www.rfc-editor.org/rfc/rfc9110) defines HTTP status code classes and their meaning.
