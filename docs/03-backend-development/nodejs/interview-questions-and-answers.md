# Node.js Interview Questions and Answers

These questions review the Node.js runtime, the event loop, asynchronous
programming, modules, streams, configuration, scaling, and debugging. Try to
answer each question aloud before reading the answer.

## Runtime and architecture

### 1. What is Node.js?

Node.js is an open-source, cross-platform JavaScript runtime that runs
JavaScript outside the browser. It combines the V8 engine with libuv and
built-in modules for files, networking, processes, and more, which makes it
suitable for servers, command-line tools, and build tooling.

### 2. What roles do V8 and libuv play?

V8 parses, compiles (with a just-in-time compiler), and executes JavaScript
and manages memory with garbage collection. libuv provides the event loop,
asynchronous I/O across operating systems, and a thread pool for work that
cannot be done asynchronously by the OS.

### 3. Is Node.js single-threaded?

Your JavaScript runs on a single main thread, so only one piece of your code
executes at a time. Node.js itself uses additional threads—libuv's thread
pool, garbage collection, and other internals—and you can create more with
worker threads.

### 4. What does "non-blocking I/O" mean?

When code starts an I/O operation such as a file read or database query,
Node.js does not wait for it. It hands the work to the OS or thread pool,
continues running other JavaScript, and runs a callback when the result is
ready. This lets one thread serve many concurrent requests.

### 5. Which operations use the libuv thread pool?

Most file system operations, `dns.lookup()`, CPU-heavy asynchronous crypto
such as `pbkdf2` and `scrypt`, and asynchronous `zlib` compression. Network
sockets do not use the pool; they use OS mechanisms like epoll, kqueue, or
IOCP. The pool has four threads by default, configurable with
`UV_THREADPOOL_SIZE`.

### 6. What kinds of applications is Node.js good and bad at?

It is good at I/O-heavy work: APIs, real-time apps, streaming, proxies,
backends-for-frontends, and tooling. It is poor at CPU-heavy work on the main
thread, such as video encoding or large computations, unless that work moves
to worker threads or separate services.

### 7. How does Node.js differ from JavaScript in the browser?

Both run ECMAScript, but Node.js has no DOM, `window`, or `document`. It adds
`process`, `Buffer`, file system, networking, and child process APIs, and
supports CommonJS as well as ES modules. Many web APIs such as `fetch`,
`URL`, and `AbortController` exist in both.

## The event loop

### 8. What is the event loop?

The event loop is the mechanism that runs callbacks when the call stack is
empty. It cycles through phases—timers, pending callbacks, poll, check, and
close callbacks—running queued callbacks for each, and keeps the process
alive while there is pending work.

### 9. What happens in the poll and check phases?

The poll phase retrieves new I/O events and runs their callbacks; if nothing
else is scheduled, the loop waits there for I/O. The check phase runs
`setImmediate` callbacks immediately after poll.

### 10. What are microtasks in Node.js, and when do they run?

Microtasks are callbacks in the `process.nextTick` queue and the Promise
microtask queue. They run after the current callback finishes and before the
next callback or phase: the nextTick queue is drained first, then promise
callbacks, repeating until both are empty.

### 11. What is the difference between `process.nextTick` and `setImmediate`?

`process.nextTick` runs its callback right after the current operation,
before any I/O or timers. `setImmediate` runs in the check phase of the loop,
after I/O callbacks. Despite the names, `nextTick` runs sooner. Recursive
`nextTick` calls can starve the event loop.

### 12. Why is the order of `setTimeout(fn, 0)` and `setImmediate(fn)` sometimes unpredictable?

From the main module, it depends on whether the minimum 1 ms timer delay has
already passed when the loop reaches the timers phase. Inside an I/O
callback the order is deterministic: `setImmediate` always runs first,
because the check phase follows the poll phase.

### 13. What does "blocking the event loop" mean, and what causes it?

It means a callback runs synchronously for so long that no other callback
can run, so every request waits. Causes include long loops, synchronous
crypto or file APIs, parsing very large JSON, and catastrophic regular
expression backtracking.

### 14. How can you detect event loop blocking in production?

Measure event loop delay with `perf_hooks.monitorEventLoopDelay()` and alert
when percentiles rise. When delays appear, take a CPU profile with
`--cpu-prof` or the inspector to find the responsible functions.

## Asynchronous programming

### 15. What is an error-first callback?

A callback convention in which the first argument is an error (or `null`)
and results follow. The callback is called exactly once, and errors are
passed to it rather than thrown, because the original call has already
returned.

### 16. What problems do promises solve compared with callbacks?

Promises avoid deeply nested callbacks, provide a single error path with
`.catch()`, can be chained and combined with `Promise.all` and similar
methods, and guarantee that a result is delivered once. `async`/`await`
builds on promises to make asynchronous code read sequentially.

### 17. Compare `Promise.all`, `Promise.allSettled`, `Promise.race`, and `Promise.any`.

`all` fulfills with all values or rejects on the first rejection.
`allSettled` waits for every promise and reports each outcome. `race` settles
like the first promise to settle. `any` fulfills with the first fulfillment
and rejects with an `AggregateError` only if all reject.

### 18. Why doesn't `array.forEach(async (item) => ...)` wait for the work?

`forEach` ignores the promises returned by the async callback, so it returns
immediately and errors become unhandled rejections. Use `for...of` with
`await` for sequential work or `Promise.all(array.map(...))` for parallel
work.

### 19. How do you run independent async operations in parallel?

Start them without awaiting each one, then await them together with
`Promise.all`. For large lists, limit concurrency (for example, with a small
worker loop or a library) so you don't overwhelm downstream services.

### 20. How do you add a timeout or cancellation to an async operation?

Use an `AbortController` and pass its `signal` to APIs that support it, such
as `fetch`, `fs.readFile`, and `timers/promises`. `AbortSignal.timeout(ms)`
creates a signal that aborts automatically after the given time.

### 21. What happens when a promise rejection is not handled?

By default, Node.js treats an unhandled rejection like an uncaught
exception: it prints the error and exits with a non-zero code. Every
rejection should be handled with `await` in `try`/`catch` or with `.catch()`.

## Events, modules, and packages

### 22. What is an EventEmitter?

`EventEmitter` from `node:events` lets objects emit named events and call
registered listeners. Servers, streams, sockets, and `process` are emitters.
Listeners are called synchronously in the order they were added.

### 23. Why is the `error` event special?

If an emitter emits `"error"` and no listener is registered, Node.js throws
the error, which usually crashes the process. Emitters that can fail, such as
streams and sockets, should always have an `error` listener.

### 24. What does the `MaxListenersExceededWarning` mean?

It warns that more than 10 listeners were added for one event on one
emitter, which often indicates a memory leak from listeners added repeatedly
and never removed. Fix the leak, or raise the limit with `setMaxListeners`
if the listeners are legitimate.

### 25. What are the differences between CommonJS and ES modules?

CommonJS uses `require` and `module.exports`, loads synchronously, and
provides `__dirname`. ES modules use `import` and `export`, form a static
dependency graph, support top-level `await`, use live bindings, require file
extensions in relative imports, and use `import.meta.dirname` instead of
`__dirname`.

### 26. How does Node.js decide whether a file is CommonJS or ESM?

`.mjs` files are ESM and `.cjs` files are CommonJS. For `.js` files, the
nearest `package.json` decides: `"type": "module"` means ESM and
`"type": "commonjs"` means CommonJS. With no `type` field, the file is
CommonJS unless it contains ES module syntax; since Node.js 22.7.0 such files
are detected and run as ESM.

### 27. What is module caching?

A module runs the first time it is loaded, and its exports are cached. Later
imports or requires return the same object, which is why modules behave like
singletons and why module-level state is shared across the application.

### 28. What is the difference between `dependencies` and `devDependencies`?

`dependencies` are needed at runtime in production. `devDependencies` are
needed only for development, testing, and building, and can be omitted from
production installs with `npm ci --omit=dev`.

### 29. What do `^` and `~` mean in version ranges, and why does the lockfile matter?

`^1.2.3` allows any 1.x version from 1.2.3; `~1.2.3` allows 1.2.x versions
from 1.2.3. Because ranges allow many versions, `package-lock.json` records
the exact resolved tree so every install is identical. `npm ci` installs
exactly what the lockfile says.

## File system, buffers, and streams

### 30. When is it acceptable to use synchronous `fs` methods?

During startup, in scripts, and in CLIs, where blocking does not affect other
requests. Inside request handlers, synchronous calls block every concurrent
request and should be avoided.

### 31. How do you prevent path traversal when building file paths from user input?

Avoid user-supplied paths where possible and store files under generated
IDs. If you must use input, resolve the full path with `path.resolve` and
verify it still starts with the allowed base directory plus a separator
before accessing it.

### 32. What is a Buffer?

A `Buffer` is a fixed-length sequence of bytes used for binary data such as
files, network packets, and images. It is a subclass of `Uint8Array` and
converts to and from encodings such as UTF-8, Base64, and hex.

### 33. What are streams, and why are they useful?

Streams process data in chunks as it arrives instead of loading it all into
memory. They keep memory use constant, reduce time to first byte, and can be
chained. Node.js has readable, writable, duplex, and transform streams.

### 34. What is backpressure?

Backpressure is the mechanism that slows a fast producer when a consumer
cannot keep up. `write()` returns `false` when a writable stream's buffer
reaches its `highWaterMark`, and the stream emits `drain` when it can accept
more. `pipe` and `pipeline` handle this automatically.

### 35. Why is `stream.pipeline` preferred over `pipe`?

`pipe` handles backpressure but does not forward errors or clean up the
other streams when one fails, which can leak file handles and sockets.
`pipeline` propagates errors, destroys the streams when one fails (except
those that already ended or finished), and offers a promise version.

## HTTP, process, and configuration

### 36. How do you read a request body with the plain `http` module?

The request is a readable stream, so collect its chunks (for example, with
`for await`), enforce a maximum size, concatenate them with `Buffer.concat`,
decode the result, and parse it. Frameworks like Express do this with body
parsing middleware.

### 37. Why might a Node.js server behind a load balancer return intermittent 502 errors?

A common cause is the server's `keepAliveTimeout` being shorter than the
load balancer's idle timeout, so the server closes a connection just as the
load balancer reuses it. Setting `keepAliveTimeout` slightly longer than the
load balancer's timeout fixes it.

### 38. Does `fetch` in Node.js throw on a 404 or 500 response?

No. `fetch` rejects only on network failures or aborts. HTTP error statuses
produce a fulfilled response, so you must check `response.ok` or
`response.status`.

### 39. How should a Node.js application handle configuration?

Read environment-specific values from environment variables, convert and
validate them once at startup in a single config module, and fail fast if
anything is missing. Never hardcode secrets, and keep real secrets out of
committed files.

### 40. What does `NODE_ENV` do?

Node.js itself ignores it. It is a convention that libraries and frameworks
read to change behavior. With `NODE_ENV=production`, for example, Express
caches view templates and generates less verbose error messages. It
describes the type of environment, not a specific deployment.

### 41. What is graceful shutdown, and how do you implement it?

On `SIGTERM` or `SIGINT`, the process stops accepting new connections,
finishes in-flight requests, stops background work, closes database and
other connections, then exits. A forced-exit timeout prevents hanging past
the platform's grace period.

## Scaling, errors, and performance

### 42. How do you run CPU-intensive work without blocking the server?

Move it to worker threads, ideally a pool sized near the number of CPU
cores, or to a separate service or background job queue. The main thread
then stays free to handle I/O and requests.

### 43. What is the difference between worker threads and child processes?

Worker threads run JavaScript in extra threads within the same process, with
cheap message passing and optional shared memory. Child processes are
separate OS processes that can run any program, are fully isolated, and cost
more to start. Use workers for CPU-heavy JavaScript and child processes for
external programs.

### 44. Why is `child_process.exec` risky?

`exec` runs a command string through a shell, so user-controlled input can
inject extra commands. `execFile` and `spawn` with an arguments array do not
invoke a shell and should be used when input is involved.

### 45. What does the cluster module do, and what are its limitations?

It forks several worker processes from a primary process so they share one
port and use multiple CPU cores. Workers do not share memory, so sessions,
caches, and counters must live in an external store such as Redis. In
container platforms, running more containers is often preferred.

### 46. What is the difference between operational errors and programmer errors?

Operational errors are expected failures in correct code, such as invalid
input or an unavailable database; they should be handled. Programmer errors
are bugs, such as reading a property of `undefined`; they should be fixed,
and at runtime the process is usually logged and restarted.

### 47. What should you do in an `uncaughtException` handler?

Log the error and exit. After an unexpected exception the process may be in
an inconsistent state, so continuing is unsafe. A process manager or
orchestrator should restart the service automatically.

### 48. How do you find a memory leak in a Node.js service?

Confirm memory keeps growing over time, take heap snapshots minutes apart
with the inspector or `v8.writeHeapSnapshot()`, and compare them in Chrome
DevTools to see which objects grow and what retains them. Common causes are
unbounded caches, leaked listeners, uncleared timers, and closures.

### 49. How do you debug a Node.js application?

Start it with `--inspect` (or `--inspect-brk` to pause at the first line)
and attach Chrome DevTools via `chrome://inspect` or the VS Code debugger to
use breakpoints, step through code, and inspect variables. Never expose the
inspector port publicly.

### 50. How would you investigate a slow Node.js endpoint?

Measure first: check response times, event loop delay, and downstream
latency (database, external APIs). If the event loop is busy, capture a CPU
profile to find hot functions; if time is spent waiting, examine queries,
indexes, network calls, and missing parallelism or caching.

## Scenario-based questions

### 51. After a deploy, p99 latency doubled but CPU is flat. What do you check?

**What to check first:** whether requests are now *waiting* rather than
computing. Look at downstream latency (database, other APIs), connection
pool usage, and the deploy diff for new sequential `await`s.

**How to confirm:** traces show long spans for outbound calls while event
loop delay stays at its usual baseline. If `fs`, `crypto.scrypt`, or DNS
spans grew, suspect the four-thread libuv pool.

**Likely causes and fixes:** independent calls changed to sequential
(use `Promise.all`), a slower query or missing index, a smaller connection
pool, or thread-pool saturation (raise `UV_THREADPOOL_SIZE` at startup). See
[asynchronous patterns](asynchronous-patterns.md) and
[runtime and architecture](runtime-and-architecture.md).

### 52. Every endpoint freezes for a few seconds at random moments. What is happening?

**What to check first:** event loop delay
(`perf_hooks.monitorEventLoopDelay()`) at the moment of the freeze, and CPU
on the process.

**How to confirm:** delay jumps far above its normal baseline while one core
hits 100%. A CPU profile (`--cpu-prof`) taken during a freeze shows the
synchronous function.

**Likely causes and fixes:** a backtracking regex on user input (ReDoS),
`JSON.parse` of a huge body, or a `*Sync` call in a handler. Limit input
sizes, fix the regex, and move heavy work to a worker thread. See
[the event loop](event-loop.md).

### 53. The process crashes every two days with "JavaScript heap out of memory". How do you find the cause?

**What to check first:** whether heap usage after garbage collection keeps
rising (a leak) or only spikes with certain requests (a large allocation).

**How to confirm:** take heap snapshots minutes apart under load and compare
them; the growing object type and its retainers point to the code. Writing a
snapshot blocks the loop and needs about twice the heap, so take it from an
instance removed from the load balancer.

**Likely causes and fixes:** an unbounded `Map` cache, listeners added per
request, uncleared timers. Bound the cache and remove listeners. Raising
`--max-old-space-size` only delays the crash. See
[errors, debugging, and performance](errors-debugging-and-performance.md).

### 54. A Node.js API behind an AWS load balancer returns occasional 502s, but the app logs no errors. Why?

**What to check first:** the server's `keepAliveTimeout` (5 seconds by
default) against the balancer's idle timeout (60 seconds by default on an
Application Load Balancer).

**How to confirm:** the 502s appear only in the balancer's metrics, are
rare, and often follow idle periods.

**Likely causes and fixes:** Node.js closes an idle connection that the
balancer still reuses. Set `server.keepAliveTimeout` above the balancer's
timeout (for example 65 s) and `headersTimeout` slightly higher. See
[the http module](http-module.md).

### 55. Every deploy causes a short burst of connection errors for clients. What do you fix?

**What to check first:** whether the process logs that it received
`SIGTERM`, and how the container starts it.

**How to confirm:** errors line up with instance terminations. If the
container runs `npm start`, npm can swallow the signal; if the app ignores
`SIGTERM`, it is killed mid-request.

**Likely causes and fixes:** start with `CMD ["node", "server.js"]`, handle
`SIGTERM` by calling `server.close()`, and force-exit before the platform's
grace period (30 s by default on Kubernetes). See
[process and configuration](process-env-and-configuration.md).

### 56. Containers keep restarting with exit code 137. What does it mean?

**What to check first:** the orchestrator's termination reason for the
container.

**How to confirm:** 137 is 128 + 9, meaning the process was killed with
`SIGKILL`. A reason of `OOMKilled` points to memory; otherwise, check
whether shutdown took longer than the grace period.

**Likely causes and fixes:** memory above the container limit (fix leaks,
set `--max-old-space-size` below the limit) or a shutdown that never
finishes (add a forced-exit timer). See
[process and configuration](process-env-and-configuration.md).

### 57. Logins became slow, and file uploads and outbound calls slowed with them, yet CPU has headroom. Why?

**What to check first:** how many thread-pool tasks run at once: password
hashing with `crypto.scrypt`/`pbkdf2`, `fs` calls, and `dns.lookup()` share
one pool of four threads by default.

**How to confirm:** timing around those calls grows together under load,
while event loop delay stays normal.

**Likely causes and fixes:** hashing saturates the pool and everything else
queues behind it. Set `UV_THREADPOOL_SIZE` before the process starts (setting
it from code is not guaranteed to work), cache DNS lookups, or move hashing to
a worker pool. See [runtime and architecture](runtime-and-architecture.md).

### 58. After `npm update`, the app crashes at startup with `ERR_REQUIRE_ESM`. What happened?

**What to check first:** which package the stack trace names, and the
Node.js version in production.

**How to confirm:** the package's new major version is ESM-only, and the
runtime is older than Node.js 22.12/20.19, which cannot `require()` ES
modules.

**Likely causes and fixes:** upgrade Node.js, load the package with
`await import()`, or pin the previous major until you migrate to ESM. See
[CommonJS and ES modules](modules-commonjs-and-esm.md).

### 59. The app works locally but the production image fails with "Cannot find package". Why?

**What to check first:** whether the missing package is in
`devDependencies`.

**How to confirm:** the image is built with `npm ci --omit=dev`, so dev
packages are absent, and the error names a module your runtime code imports.

**Likely causes and fixes:** move the package to `dependencies`, and run a
smoke test against the built image in CI. See
[npm and package management](npm-and-package-management.md).

### 60. CI fails at `npm ci` with "can only install packages when your package.json and package-lock.json ... are in sync". What do you do?

**What to check first:** the line after the message, such as
`Missing: <package>@<version> from lock file`.

**How to confirm:** `package.json` was changed without the lockfile, or the
lockfile was not committed.

**Likely causes and fixes:** run `npm install` locally, commit both files
together, and keep `npm ci` in CI. Do not switch CI to `npm install`, which
would hide drift. See [npm and package management](npm-and-package-management.md).

### 61. After moving to PM2 cluster mode, users are randomly logged out and rate limits stop working. Why?

**What to check first:** where sessions and rate-limit counters are stored.

**How to confirm:** logs show requests from the same user handled by
different process IDs, and the problem disappears with one process.

**Likely causes and fixes:** each cluster worker is a separate process with
its own memory, so in-memory sessions and counters are not shared. Store them
in Redis or a database. See
[worker threads, child processes, and cluster](worker-threads-child-processes-and-cluster.md)
and [sessions, cookies, and JWT](../backend-concepts/sessions-cookies-and-jwt.md).

### 62. A one-second Redis network blip crashed every instance. How do you prevent it?

**What to check first:** the crash logs for `Unhandled 'error' event`.

**How to confirm:** the error comes from the Redis client, and no `error`
listener was registered on it.

**Likely causes and fixes:** an `EventEmitter` that emits `error` with no
listener throws and ends the process. The node-redis README says you must
listen to `error` events. Add listeners to every client, socket, and stream,
log the error, and let the client reconnect. See
[events and EventEmitter](events-and-eventemitter.md).

### 63. A bulk-import endpoint makes the database reject connections for the whole app. Why?

**What to check first:** connection pool usage and the number of queries in
flight while the import runs.

**How to confirm:** pool usage hits its maximum exactly during the import,
and unrelated endpoints time out waiting for a connection.

**Likely causes and fixes:** `Promise.all(rows.map(insert))` started
thousands of queries at once. Cap concurrency (a small worker loop or
`p-limit`), or batch rows into fewer queries. See
[asynchronous patterns](asynchronous-patterns.md).

### 64. Large report downloads crash the server or lead to `EMFILE: too many open files`. What is wrong?

**What to check first:** how the endpoint reads and sends the file.

**How to confirm:** memory jumps by about the file size per download (whole
file read), or open file descriptors climb with aborted downloads (streams
never closed).

**Likely causes and fixes:** `readFile` of large files (which also fails
above 2 GiB) or `pipe()` without cleanup. Stream with
`await pipeline(createReadStream(file), response)`, which destroys the
streams when the client disconnects. See
[buffers and streams](buffers-and-streams.md).

### 65. Files users uploaded yesterday now return 404. What do you check?

**What to check first:** where uploads are written.

**How to confirm:** they were saved to the container's or dyno's local disk,
and the instance has restarted or the request reached another instance.

**Likely causes and fixes:** local disks on Heroku dynos, Kubernetes
containers, and Lambda are ephemeral and not shared. Store uploads in object
storage and keep only metadata in the database. See
[file system, path, and OS](file-system-path-and-os.md).

## Further learning

- [Node.js overview](../nodejs.md)
- [Node.js: Learn](https://nodejs.org/learn)
- [Node.js API documentation](https://nodejs.org/api/)
