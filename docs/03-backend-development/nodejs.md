# Node.js

## Introduction

Node.js is an open-source JavaScript runtime outside the browser. It runs
server programs, command-line tools, and automation, with APIs for files and
network communication.

## Why does it exist?

Node.js made JavaScript practical for servers and general-purpose tools.
Using one language across an application can simplify code sharing, though
browser and server APIs differ.

## How does it work?

Node.js runs JavaScript with V8 and provides an event-driven runtime. Many
I/O operations are asynchronous, so a program can continue while waiting. The
event loop coordinates queued work; CPU-heavy synchronous work can block it.

## Real-world example

A Node.js server can accept HTTP requests and return JSON. A service may use
[Express](express.md) for routes and [middleware](middleware.md) for shared
request processing.

## Developer perspective

Use asynchronous APIs appropriately, handle errors, and keep secrets out of
source control. Choose dependencies carefully. Node.js APIs differ from
browser APIs described in [JavaScript](../02-frontend-development/javascript.md).

## Practical example

```js
import { createServer } from "node:http";

const server = createServer((request, response) => {
  response.writeHead(200, { "content-type": "text/plain" });
  response.end("Hello from Node.js\n");
});

server.listen(3000);
```

This listens on port 3000 and sends plain text. A service also needs
configuration, graceful shutdown, and failure handling.

## Important terminology

- **Runtime:** The environment that executes a program and supplies APIs.
- **Event loop:** Mechanism that coordinates queued callbacks and asynchronous work.
- **Non-blocking I/O:** Starting I/O without waiting synchronously for it to finish.
- **Package:** Reusable code distributed for use by a project.

## Advantages and disadvantages

Node.js handles I/O-heavy workloads well. Synchronous work can block the event
loop, and its package ecosystem requires dependency management.

## Common misconceptions

- Asynchronous I/O does not make CPU-bound work automatically fast.
- Node.js is not a browser and does not provide browser-only APIs such as `document`.
- Node.js can serve HTTP without Express, though a framework may add useful structure.

## Revision questions

1. What does Node.js add beyond the JavaScript language?
2. Why can synchronous CPU-heavy work affect other requests?
3. How does the runtime differ from a browser environment?

## Further Learning & References

- **Official docs:** [Node.js: Introduction to Node.js](https://nodejs.org/en/learn/getting-started/introduction-to-nodejs) explains the runtime and common uses.
- **Official API docs:** [Node.js HTTP API](https://nodejs.org/api/http.html) documents the built-in HTTP server and client interfaces.
