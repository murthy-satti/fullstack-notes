# Backend Development

Backend development is the work of building the server side of an
application: the code that receives requests, applies business rules, stores
and reads data, talks to other services, and returns reliable responses. Users
rarely see the backend directly, but every login, payment, search, upload, and
notification depends on it.

A backend is more than "an API". It decides who a caller is and what they may
do, validates every input it receives, keeps data consistent when many
requests arrive at once, survives slow or failing dependencies, and records
enough information for developers to understand what happened when something
goes wrong.

![Diagram showing a client request passing through middleware to an application route and data service, then returning a response.](backend-request-flow.svg)

## What this section teaches

You will learn how to:

- Explain what a backend is responsible for and trace one request from the
  browser to the database and back.
- Use the HTTP protocol precisely: methods, every important status code,
  headers, caching, and CORS.
- Run JavaScript on the server with Node.js and understand its runtime, event
  loop, modules, streams, and processes.
- Build APIs with Express: routing, middleware, validation, error handling,
  authentication, uploads, security, testing, and production setup.
- Design APIs that are consistent, versioned, documented, and safe to retry.
- Apply the concepts every backend needs: authentication and authorization,
  sessions and tokens, OAuth, rate limiting, logging, background jobs,
  real-time communication, file storage, and configuration.

## How a backend handles a request

1. A client sends an HTTP request, such as `POST /api/orders`, to a server.
2. Infrastructure in front of the application (a CDN, load balancer, or
   reverse proxy) forwards the request to an application instance.
3. Middleware runs shared steps: parsing the body, logging, checking the
   caller's identity, and applying rate limits.
4. The router matches the method and path to a handler.
5. The handler validates the input and calls the business logic.
6. The business logic reads or writes data in a database, cache, queue, or
   external service.
7. The server returns a status code, headers, and a body that describe the
   result, and errors are turned into consistent error responses.

Node.js and Express do not replace these ideas. They are one practical way to
implement them, and the same concepts apply to backends written in other
languages and frameworks.

## Learning path

The navigation is organized into three subject groups:

1. **Node.js**: the JavaScript runtime that executes server code.
2. **Express**: a minimal web framework built on Node.js for routing and
   middleware.
3. **Important Backend Concepts**: protocol, API, security, and reliability
   knowledge that applies to any backend stack.

A useful order for a first pass is:

1. Read [Backend Fundamentals](backend-concepts/backend-fundamentals.md) and
   [Client-Server Model and Request Lifecycle](backend-concepts/client-server-and-request-lifecycle.md).
2. Learn the HTTP vocabulary: [HTTP Methods](backend-concepts/http-methods.md),
   [HTTP Status Codes](backend-concepts/http-status-codes.md), and
   [HTTP Headers](backend-concepts/http-headers.md).
3. Work through [Node.js](nodejs.md) from the runtime to streams and
   processes.
4. Build APIs with [Express](express.md).
5. Return to the remaining [backend concepts](backend-concepts.md), such as
   CORS, authentication, rate limiting, and background jobs, and apply each
   one in your Express project.

Every lesson includes an explanation of how the concept works, practical
examples, best practices, important terminology, common mistakes, revision
questions, and official learning resources. Each subject ends with interview
questions and answers.

## Related sections

Some backend topics have their own sections in these notes:

- [Networking and Protocols](../01-networking-and-protocols/index.md) for
  DNS, TCP, TLS, HTTP versions, and WebSockets at the protocol level.
- [Databases](../04-databases/index.md) for data modeling, queries, indexes,
  and transactions.
- [Application Architecture](../05-application-architecture/index.md) for
  caching, Redis, message queues, and scalability.
- [Servers and Infrastructure](../06-servers-and-infrastructure/index.md) for
  Nginx, reverse proxies, and load balancing.
- [DevOps and Deployment](../07-devops-and-deployment/index.md) for Docker,
  CI/CD, environment variables, and monitoring.
- [Security and Testing](../09-security-and-testing/index.md) for OWASP,
  API security, and testing strategy.

## A first practical exercise

Build a small task API with Node.js and Express:

1. `GET /tasks` returns a list, and `POST /tasks` creates a task.
2. Return `201 Created` for a new task, `400 Bad Request` for invalid input,
   and `404 Not Found` for a missing task.
3. Add a logging middleware and a central error handler.
4. Call the API from a page on a different port and fix the CORS error you
   see in the browser console.

Then use `curl -i` to inspect the status line and headers of each response.

## Before moving on

- What responsibilities belong to a backend rather than a frontend?
- Which steps does a request pass through before reaching a route handler?
- Why should every input from a client be validated on the server, even when
  the frontend already validates it?
- Why are Node.js and Express tools for applying backend concepts rather than
  the concepts themselves?
