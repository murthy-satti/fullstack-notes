# Express

## Introduction

Express is a web framework for Node.js. It provides a small set of tools for
handling HTTP requests and responses, defining routes, and composing
middleware. Developers can use it to create APIs and web servers without
manually managing every low-level HTTP detail.

## Why does it exist?

Node.js includes built-in networking APIs, but an application still needs an
organized way to match URLs and methods to behavior. Express supplies a
minimal routing and middleware model that developers can extend with
additional libraries.

## How does it work?

An Express application registers middleware and route handlers. For each
request, Express runs applicable middleware in order, then finds a matching
route. A handler can send a response, modify the request/response context, or
pass control onward. A request must eventually receive a response or be
handed to another handler.

## Real-world example

A task API can use `GET /tasks` to list items and `POST /tasks` to create one.
A logging middleware can run for both routes, while an authentication
middleware can protect only routes that require a signed-in user. See
[REST APIs](rest-apis.md) for method and resource conventions.

## Developer perspective

Register middleware in the intended order, keep route handlers focused, and
handle errors centrally. Express does not automatically validate every input
or define an authentication system; add these deliberately with
[middleware](middleware.md) and appropriate application logic. For
authentication concepts, see [authentication and authorization](authentication-and-authorization.md).

## Practical example

```js
import express from "express";

const app = express();
app.use(express.json());

app.get("/health", (request, response) => {
  response.json({ status: "ok" });
});

app.listen(3000);
```

The JSON middleware parses JSON request bodies; the route returns a JSON
health response. Production applications should configure listening and
errors for their environment.

## Important terminology

- **Application:** The Express instance that configures a server.
- **Route:** A method and path associated with request-handling code.
- **Handler:** A function that processes a request or passes it onward.
- **Router:** A modular set of route and middleware definitions.

## Advantages and disadvantages

Express is lightweight, flexible, and supported by a large ecosystem. That
flexibility means applications must choose their own conventions for
validation, structure, security, and many other concerns.

## Common misconceptions

- Express is not part of Node.js; it is a separate framework package.
- Registering a route does not automatically validate its request data.
- Middleware order can change application behavior.

## Revision questions

1. What happens when a request enters an Express application?
2. Why is middleware order important?
3. What does `express.json()` make available to routes?

## Further Learning & References

- **Official guide:** [Express routing](https://expressjs.com/en/guide/routing.html) explains route methods, paths, and handlers.
- **Official guide:** [Express middleware](https://expressjs.com/en/guide/using-middleware.html) describes middleware behavior and registration.
