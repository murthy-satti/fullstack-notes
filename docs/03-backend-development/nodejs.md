# Node.js

Node.js is an open-source JavaScript runtime that runs outside the browser. It
executes server programs, command-line tools, build tooling, and automation,
and it provides APIs for files, networking, processes, and binary data that a
browser deliberately does not expose.

## What Node.js provides

- **A JavaScript engine:** V8 compiles and runs your JavaScript.
- **An event loop:** libuv schedules timers, I/O callbacks, and other queued
  work so one JavaScript thread can serve many connections.
- **Non-blocking I/O:** file, network, and DNS operations start and report
  back later instead of making the program wait.
- **Core modules:** built-in APIs such as `node:fs`, `node:path`,
  `node:http`, `node:events`, `node:stream`, `node:crypto`, and
  `node:worker_threads`.
- **A module system:** CommonJS and ES modules for splitting code into files
  and reusing packages.
- **A package ecosystem:** npm, the registry and client used to install and
  publish packages.

Node.js does not include a web framework, a database, or an application
structure. Frameworks such as [Express](express.md) add routing and
middleware on top of the built-in `node:http` module.

## How Node.js runs a server

1. Node.js starts, loads your entry file, and runs its top-level code.
2. The code registers work for later, such as a server that listens on a port.
3. When a request arrives, libuv notices the network event and queues a
   callback.
4. The event loop runs that callback on the single JavaScript thread.
5. While the handler waits for a database or file, the thread is free to run
   other callbacks.
6. When the result arrives, its callback or promise continuation runs and the
   response is sent.

This model handles many concurrent I/O-bound requests efficiently. Long
synchronous work, such as hashing a large file in a loop, blocks every other
request until it finishes, which is why CPU-heavy work is moved to worker
threads or separate services.

## Practical example

```js
import { createServer } from "node:http";

const server = createServer((request, response) => {
  // Runs on the event loop for every incoming request.
  response.writeHead(200, { "content-type": "application/json" });
  response.end(JSON.stringify({ message: "Hello from Node.js" }));
});

server.listen(3000, () => {
  console.log("Listening on http://localhost:3000");
});
```

Save this as `server.mjs` and run `node server.mjs`. A real service also needs
configuration, input validation, logging, graceful shutdown, and error
handling, which the following lessons cover.

## Node.js topic map

**Runtime foundations**

- [Node.js runtime and architecture](nodejs/runtime-and-architecture.md)
- [Installing Node.js and managing versions](nodejs/installation-and-versions.md)
- [The Node.js event loop](nodejs/event-loop.md)
- [Asynchronous programming in Node.js](nodejs/asynchronous-patterns.md)
- [Events and EventEmitter](nodejs/events-and-eventemitter.md)

**Modules and packages**

- [Modules: CommonJS and ES modules](nodejs/modules-commonjs-and-esm.md)
- [npm and package management](nodejs/npm-and-package-management.md)

**Core modules**

- [File system, path, and OS modules](nodejs/file-system-path-and-os.md)
- [Buffers and streams](nodejs/buffers-and-streams.md)
- [Building HTTP servers with the http module](nodejs/http-module.md)
- [Process, environment variables, and configuration](nodejs/process-env-and-configuration.md)

**Scaling and reliability**

- [Worker threads, child processes, and cluster](nodejs/worker-threads-child-processes-and-cluster.md)
- [Errors, debugging, and performance](nodejs/errors-debugging-and-performance.md)

**Review**

- [Node.js interview questions and answers](nodejs/interview-questions-and-answers.md)

## Developer perspective and common misconceptions

Learn [JavaScript](../02-frontend-development/javascript.md) first,
especially functions, promises, and `async`/`await`. Use asynchronous APIs in
request handlers, keep secrets in environment variables instead of source
code, and choose dependencies carefully because each one is code you run.

- Node.js is a runtime, not a language and not a framework.
- Node.js is not "single-threaded" in every sense: your JavaScript runs on one
  main thread, but libuv uses a thread pool and the operating system for I/O.
- Asynchronous I/O does not make CPU-bound work fast; it only stops waiting
  from blocking other work.
- Node.js is not a browser, so `window`, `document`, and the DOM do not exist.
- Node.js can serve HTTP without Express; frameworks add structure, not
  capability.

## Further learning

- [Node.js: Introduction to Node.js](https://nodejs.org/en/learn/getting-started/introduction-to-nodejs)
- [Node.js API documentation](https://nodejs.org/api/)
- [Node.js interview questions and answers](nodejs/interview-questions-and-answers.md)
