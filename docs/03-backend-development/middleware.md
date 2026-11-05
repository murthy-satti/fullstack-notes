# Middleware

## Introduction

Middleware is reusable request-processing code that runs between receiving a
request and sending a response. In Express, middleware can inspect or update
the request, perform a task such as logging, end the response, or pass control
to another middleware or route handler.

## Why does it exist?

Many routes need the same cross-cutting behavior: parsing request bodies,
recording request details, checking authentication, or setting security
headers. Middleware helps share that behavior rather than duplicating it in
every route.

## How does it work?

Express executes middleware in registration order. A middleware function
typically receives `request`, `response`, and `next`. Calling `next()` passes
control onward; ending the response completes the request. If middleware
neither calls `next()` nor sends a response, the request can remain unfinished.
Errors can be passed to the error-handling flow.

## Real-world example

A logging middleware can record the request method and path before a route
runs. Authentication middleware can check a session and reject a request
before it reaches a private endpoint. The concepts apply to routes in
[Express](express.md), including those that implement a [REST API](rest-apis.md).

## Developer perspective

Keep middleware focused and predictable. Place parsing and logging where
needed, and put access checks before protected route behavior. Avoid logging
passwords, tokens, or other sensitive values. Centralized error handling is
described in [error handling](error-handling.md).

## Practical example

```js
function requestLogger(request, response, next) {
  console.log(`${request.method} ${request.path}`);
  next();
}

app.use(requestLogger);
```

This logger runs for requests after it is registered. A production logger
should use an appropriate logging system and avoid recording private data.

## Important terminology

- **Middleware function:** Code invoked during the request-response cycle.
- **`next()`:** Express callback used to pass control to the next handler.
- **Application middleware:** Middleware registered for an app or router.
- **Error-handling middleware:** A handler with a four-argument signature
  that processes errors.

## Advantages and disadvantages

Middleware encourages reuse and makes shared request behavior easier to
compose. Too many layers or unclear ordering can obscure what a route does,
and a middleware that forgets to continue or respond can stall a request.

## Common misconceptions

- Middleware does not always modify a request; it can also log, check, or respond.
- Calling `next()` does not mean a response has been sent.
- Authentication middleware should not be confused with authorization policy.

## Revision questions

1. What are the main choices middleware has after processing a request?
2. Why does registration order matter?
3. What can happen if middleware neither responds nor calls `next()`?

## Further Learning & References

- **Official guide:** [Express: Using middleware](https://expressjs.com/en/guide/using-middleware.html) explains application, router, and error middleware.
- **Official API reference:** [Express application API](https://expressjs.com/en/5x/api.html#app.use) documents `app.use()` and middleware registration.
