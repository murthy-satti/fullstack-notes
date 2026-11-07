# Backend Projects

Build these to turn the Backend lessons into practical skill. Each project
grows as you work through its subject.

## Node Internals Lab

A set of small command-line tools that expose how Node.js really works: a log
analyzer that processes a multi-gigabyte file with streams in little memory,
an event-loop lag monitor, a file hasher that compares the main thread with
worker threads, and a plain `node:http` server that shuts down gracefully on
`SIGTERM`. Practices the [Node.js](nodejs.md) lessons. Follow the
[full step-by-step guide](nodejs/project-node-internals-lab.md).

## TaskFlow API

A task-manager REST API built with Express that gains one feature per lesson:
CRUD routes, validation, consistent error responses, JWT login with refresh
tokens and roles, pagination, CORS, automated tests, and production setup with
logs, health checks, and graceful shutdown. Practices the [Express](express.md)
lessons.

## ShopLite Checkout

A small shop backend that forces you to solve real backend problems: a
payment endpoint that is safe to retry, a stock update that can never
oversell, a signed webhook from a payment provider, a rate-limited login,
emails sent by background jobs, image uploads through signed URLs, and live
order status. Practices the [Important Backend Concepts](backend-concepts.md)
lessons.
