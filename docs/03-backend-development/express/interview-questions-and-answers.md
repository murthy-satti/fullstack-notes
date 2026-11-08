# Express Interview Questions and Answers

These questions review Express fundamentals, routing, middleware, request
handling, security, testing, and running Express in production. Answers
describe Express 5 behavior and note where Express 4 differs. Each question
is tagged **Beginner** (definitions and basic usage), **Intermediate** (how
it works, trade-offs, debugging common issues), or **Advanced** (internals,
scale, failure modes, design decisions).

## Fundamentals

### 1. What is Express?

Express is a minimal, unopinionated web framework for Node.js. It adds
routing, a middleware pipeline, and helpers on the request and response
objects on top of Node's `http` module. It leaves choices such as project
structure, validation, and database access to the developer.

### 2. How is Express related to Node's `http` module?

An Express app is a request-handler function. `app.listen()` creates a Node
`http.Server` with the app as its handler and returns that server. `req` and
`res` are Node's `IncomingMessage` and `ServerResponse` objects extended with
Express helpers such as `req.params` and `res.json()`.

### 3. What are the main changes in Express 5 compared with Express 4?

Rejected promises from async handlers and middleware are passed to the error
handler automatically. Route paths use new syntax: wildcards must be named
(`/*splat`) and optional segments use braces (`{/:id}`). `req.body` is
`undefined` when no body parser ran, `express.urlencoded()` defaults to
`extended: false`, the default query parser is `"simple"`, and old APIs such
as `app.del()`, `req.param()`, and `res.sendfile()` were removed.

### 4. Describe the request-response cycle in Express.

A request enters the app and passes through middleware and route handlers in
the order they were registered. Each function can modify `req`/`res`, end
the response, or call `next()` to continue. Exactly one response must be
sent; if nothing matches, a 404 handler responds, and errors jump to
error-handling middleware.

### 5. How do Express alternatives such as Fastify, Koa, and NestJS differ?

Fastify focuses on performance and built-in schema validation. Koa, from the
original Express team, uses a smaller core built around async middleware.
NestJS is an opinionated framework with modules, decorators, and dependency
injection, and can use Express or Fastify underneath.

## Routing

### 6. What is a route in Express?

A route combines an HTTP method, a path, and one or more handler functions,
for example `app.get("/tasks/:id", handler)`. Express runs the first
matching route in registration order unless a handler calls `next()`.

### 7. What is the difference between route parameters and query strings?

Route parameters are named segments in the path (`/users/:id`) and appear in
`req.params`; they usually identify a resource. Query strings follow `?`
(`/users?role=admin&page=2`) and appear in `req.query`; they usually filter,
sort, or paginate. Both arrive as strings and must be validated and
converted.

### 8. What is `express.Router` used for?

`express.Router()` creates a mini-application with its own routes and
middleware. Routers are mounted on a path with `app.use("/api/tasks",
router)`, which keeps routes modular and lets middleware such as
authentication apply to a group of routes. `mergeParams: true` lets a child
router read parameters from its parent's path.

### 9. Why does route order matter?

Express checks routes and middleware in the order they were added and stops
at the first one that responds. A general route such as `/users/:id`
registered before `/users/me` will capture `me` as an ID. Catch-all routes
and the 404 handler must come after specific routes.

### 10. How do you write wildcard and optional routes in Express 5?

Wildcards must be named: `/files/*filepath` matches everything after
`/files/` and exposes it as `req.params.filepath`, an array of path
segments. `/{*splat}` matches every
path including `/`. Optional segments use braces: `/users{/:id}` matches
both `/users` and `/users/42`. Express 4's `*` and `:id?` forms no longer
work.

## Request and response

### 11. What is the difference between `req.params`, `req.query`, and `req.body`?

`req.params` holds route parameters from the path, `req.query` holds parsed
query-string values, and `req.body` holds the parsed request body. The body
is only populated when a body-parsing middleware such as `express.json()`
has run; otherwise it is `undefined` in Express 5.

### 12. What is the difference between `res.send()`, `res.json()`, and `res.end()`?

`res.json()` serializes a value to JSON and sets `Content-Type:
application/json`. `res.send()` chooses the content type from its argument
(string, Buffer, or object). `res.end()` is Node's low-level method that
finishes the response without Express's content-type or ETag handling.

### 13. What causes "Cannot set headers after they are sent to the client"?

The code tried to send a second response, or set a header, after the first
response started. Common causes are a missing `return` before `res.json()`
in an `if` block, calling `next()` after responding, or both a callback and
a promise sending responses. Use `return res...` and check `res.headersSent`
in error handlers.

### 14. How do redirects work, and which status code should you use?

`res.redirect(url)` sends a `302 Found` by default with a `Location` header.
Use `301`/`308` for permanent moves (308 keeps the method and body), `303`
after a form POST to send the browser to a GET page, and `307` for a
temporary redirect that must keep the method.

### 15. What is `res.locals`?

`res.locals` is an object scoped to a single request. Middleware can store
values there (such as the current user) for later middleware, handlers, and
templates. Unlike `app.locals`, it is reset for every request.

## Middleware and body parsing

### 16. What is middleware in Express?

Middleware is a function with the signature `(req, res, next)` that runs
during the request-response cycle. It can read or modify the request and
response, end the cycle by sending a response, or call `next()` to pass
control on. Logging, authentication, parsing, and validation are typically
middleware.

### 17. What are the types of middleware?

Application-level middleware is registered with `app.use()` or route
methods; router-level middleware with a router; built-in middleware includes
`express.json()`, `express.urlencoded()`, `express.static()`,
`express.raw()`, and `express.text()`; third-party middleware includes
`cors`, `helmet`, and `cookie-parser`; error-handling middleware takes four
arguments `(err, req, res, next)`.

### 18. What happens if middleware neither calls `next()` nor sends a response?

The request hangs until the client or a server timeout gives up, because
nothing ends the cycle. Every middleware path must either respond, call
`next()`, or call `next(err)`.

### 19. What do `next()`, `next("route")`, and `next(err)` do?

`next()` passes control to the next matching middleware or route.
`next("route")` skips the remaining handlers of the current route and moves
to the next matching route. `next(err)` (with any value other than
`"route"` or `"router"`) skips normal middleware and jumps to
error-handling middleware.

### 20. How does Express parse JSON and form bodies?

`express.json()` parses bodies whose `Content-Type` is `application/json`
into `req.body`; `express.urlencoded()` parses HTML form submissions. Both
accept a `limit` option (100 KB by default) and respond `413` when a body is
too large. Malformed JSON produces a `400` error that reaches the error
handler.

### 21. How are file uploads handled?

File uploads use `multipart/form-data`, which the built-in parsers ignore.
Middleware such as Multer parses them, placing files in `req.file` or
`req.files` and text fields in `req.body`. Set explicit limits: common Multer
defaults leave file size, file count, field count, and part count unlimited
(while field size has a default limit). Do not trust the client's filename
or MIME type.

### 22. Why might a webhook route need the raw body?

Webhook providers sign the exact bytes they send. To verify the signature,
the route must hash the raw body, not a re-serialized JSON object. Use
`express.raw({ type: "application/json" })` on that route, or the `verify`
option of `express.json()` to keep a copy of the raw buffer.

## Validation and error handling

### 23. Why and where should requests be validated?

Clients, including attackers, can send any data, so every input (params,
query, body, headers) must be checked for type, shape, length, and allowed
values on the server. Validation usually runs as route-level middleware
using a schema library such as Zod or Joi, and returns `400` (or `422`) with
field-level details.

### 24. What is mass assignment, and how do you prevent it?

Mass assignment happens when the server saves a request body directly, so a
client can set fields it should not control, such as `role` or `isAdmin`.
Prevent it by validating against a schema that strips or rejects unknown
fields and by copying only allowed fields into the database update.

### 25. How do you handle errors in async route handlers?

In Express 5, a rejected promise or an error thrown inside an async handler
is forwarded to the error handler automatically. Express 4 does not do this,
so the rejection is unhandled. Since Node.js 15, an unhandled rejection is
raised as an uncaught exception by default, so the whole process crashes and
every in-flight request on it fails (clients see the connection reset); only
if an `unhandledRejection` listener keeps the process alive does the request
hang instead. In Express 4, wrap the code in `try`/`catch` and call
`next(err)`, or use a wrapper function.

### 26. How does error-handling middleware work?

It is middleware with four parameters `(err, req, res, next)`, registered
after all routes. Express calls it when any middleware calls `next(err)` or
throws. It typically maps known error types to status codes, logs
unexpected errors, and sends a consistent error response. If headers were
already sent, it should delegate with `next(err)`.

### 27. How do you implement a 404 handler?

Add a normal middleware after all routes, for example
`app.use((req, res) => res.status(404).json({ error: "Not found" }))`. It
runs only when no earlier route sent a response. It must come before the
error handler, which has four parameters.

### 28. Why should production error responses not include stack traces?

Stack traces, SQL errors, and file paths reveal how the system is built and
help attackers. Send a generic message for unexpected errors, log full
details server-side with a request ID, and include that ID in the response
for support.

## CORS, cookies, and sessions

### 29. What is CORS, and how do you enable it in Express?

CORS is a browser mechanism that lets a server allow web pages from other
origins to read its responses. In Express, the `cors` middleware sets the
`Access-Control-Allow-*` headers and answers preflight `OPTIONS` requests.
Configure an explicit list of allowed origins instead of allowing all.

### 30. Why can't you combine `Access-Control-Allow-Origin: *` with credentials?

Browsers refuse credentialed requests (cookies or HTTP authentication) when
the allowed origin is the wildcard. With `credentials: true`, the server
must return the exact requesting origin, and the frontend must send
`credentials: "include"`.

### 31. What do the `httpOnly`, `secure`, and `sameSite` cookie options do?

`httpOnly` hides the cookie from JavaScript, reducing theft through XSS.
`secure` sends it only over HTTPS. `sameSite` controls whether the cookie is
sent on cross-site requests (`Strict`, `Lax`, `None`) and is a key defense
against CSRF.

### 32. How does `express-session` work?

It stores a signed, random session ID in a cookie and keeps the session data
in a server-side store. On each request it loads the data into
`req.session` and saves changes afterward. Production apps need a shared
store such as Redis or MongoDB, because the default `MemoryStore` leaks
memory and does not work across instances.

### 33. Why regenerate the session after login?

Regenerating issues a new session ID once the user is authenticated. This
prevents session fixation, where an attacker gets a victim to log in using
a session ID the attacker already knows.

## Authentication and authorization

### 34. How do you store passwords securely?

Hash them with a slow, salted password-hashing algorithm such as Argon2id
or bcrypt, and store only the hash. Never store plain text or use
reversible encryption, and never use fast hashes like MD5 or plain SHA-256
for passwords.

### 35. How does JWT authentication work in an Express API?

After login, the server signs a token containing claims such as the user ID
and an expiry. The client sends it in `Authorization: Bearer <token>`.
Middleware verifies the signature and expiry with `jwt.verify()` (pinning
the allowed algorithms) and attaches the user to `req.user`.

### 36. Why use refresh tokens?

Access tokens are kept short-lived to limit the damage of theft. A
long-lived refresh token, stored securely and sent only to the auth
endpoints, obtains new access tokens. Rotating it on each use and storing
it hashed lets the server revoke it.

### 37. What is the difference between 401 and 403?

`401 Unauthorized` means the request lacks valid credentials: the client
should log in or refresh its token. `403 Forbidden` means the client is
authenticated but not allowed to perform the action.

### 38. What is an ownership check?

An ownership check verifies that the authenticated user may access the
specific record requested, for example that an order's `userId` matches
`req.user.id`. Without it, a user can change an ID in the URL and read
someone else's data: broken object-level authorization, which the OWASP API
Security Top 10 (2023) ranks first.

## Static files, templates, and structure

### 39. How does `express.static` work?

It maps request paths to files in a folder and sends them with proper
content types, ETags, and range support. If no file matches, it calls
`next()`. Options such as `maxAge` and `immutable` control caching, and
dotfiles are ignored by default.

### 40. How do template engines integrate with Express?

You set the views folder and the engine with `app.set("views", ...)` and
`app.set("view engine", "ejs")`, then call `res.render("name", data)`.
Templates receive data from `app.locals`, `res.locals`, and the render
call. Escaped output syntax prevents XSS.

### 41. How would you structure a large Express application?

Separate routes, controllers, services, and data-access layers so HTTP
concerns, business logic, and persistence stay independent. Keep
configuration, middleware, and error classes in shared modules, and export
the app from `app.js` while `server.js` calls `listen()`. Large apps often
group these layers by feature.

## Testing

### 42. How do you test an Express API?

Export the app without calling `listen()` and use `supertest` to send
requests in tests: `await request(app).get("/tasks").expect(200)`. Assert
on status codes, bodies, and headers, cover error paths, and give each test
a fresh database state.

### 43. How do you handle databases and external APIs in tests?

Use an isolated database (an in-memory fake, `mongodb-memory-server`,
Testcontainers, or a dedicated test database) and reset it between tests.
Replace third-party APIs with injected fakes or HTTP interception tools such
as nock or MSW, so tests are fast, free, and deterministic.

## Security

### 44. What does helmet do?

Helmet sets security-related response headers, including
`Content-Security-Policy`, `Strict-Transport-Security`,
`X-Content-Type-Options: nosniff`, frame protection, and `Referrer-Policy`,
and removes `X-Powered-By`. It hardens browser behavior but does not fix
application bugs such as injection.

### 45. How do you prevent NoSQL injection in an Express and MongoDB app?

Validate that each input has the expected type, so an object such as
`{"$ne": null}` cannot reach a query where a string is expected. Never pass
raw request objects into filters, and consider Mongoose's `sanitizeFilter`
option. Express 5's simple query parser avoids nested query-string objects,
but JSON bodies still need validation.

### 46. Why does the `trust proxy` setting matter?

Behind a proxy, Express sees the proxy's IP and protocol. Setting `trust
proxy` to the correct number of hops makes `req.ip`, `req.protocol`, and
`req.secure` reflect the client. Setting it to `true` blindly lets clients
spoof `X-Forwarded-For` and bypass IP-based rate limits.

### 47. How do you protect login endpoints from brute-force attacks?

Rate-limit attempts per IP (for example with `express-rate-limit`) and per
account, add temporary lockouts or increasing delays, return the same error
for unknown users and wrong passwords, and monitor for credential stuffing.
Use a shared store for limits when running several instances.

## Production

### 48. What does `NODE_ENV=production` change?

Express caches view templates and its default error handler hides stack
traces. Many libraries also disable development checks and verbose logging.
It does not configure security or performance by itself.

### 49. How do you implement graceful shutdown?

On `SIGTERM`, mark the instance as not ready and keep serving briefly so the
load balancer stops routing to it. Then call `server.close()` to stop
accepting connections and let in-flight requests finish, close keep-alive
connections as they become idle (otherwise they hold the server open until
`keepAliveTimeout`), close database and cache connections, and exit. A
forced-exit timer prevents hanging forever.

### 50. How do you use all CPU cores with Express?

A Node process runs JavaScript on one thread, so run multiple processes:
PM2 cluster mode, the `cluster` module, or several containers behind a load
balancer. The app must be stateless, with sessions and rate limits stored in
shared services such as Redis.

## Scenario-based questions

### 51. Users are randomly logged out when the app runs behind a load balancer. What do you check?

**What to check first:** which session store `express-session` uses, and
whether more than one instance is running.

**How to confirm:** look for the startup warning `connect.session()
MemoryStore is not designed for a production environment`, and correlate
401 "login required" responses with requests landing on a different
instance or with restarts.

**Likely causes and fixes:** the default `MemoryStore` keeps sessions per
process, so another instance or a restart loses them: use a shared store
such as Redis. If logouts happen site-wide right after a config change, the
session `secret` was replaced; pass `[newSecret, oldSecret]` to rotate. See
[cookies and sessions](cookies-and-sessions.md).

### 52. Login succeeds in production, but the next request is anonymous. Locally everything works. Why?

**What to check first:** the login response in the browser's Network panel:
is there a `Set-Cookie` header?

**How to confirm:** if the header is missing and the session cookie is
configured with `secure: true`, check whether TLS ends at a proxy and what
`app.get("trust proxy")` returns.

**Likely causes and fixes:** Express sees plain HTTP from the proxy, so
`express-session` refuses to send a secure cookie. Set `trust proxy` to the
real number of proxy hops (or use the session's `proxy` option). If the
cookie is set but not sent back, check `SameSite` and whether the frontend
is on a different site. See [cookies and sessions](cookies-and-sessions.md).

### 53. The rate limiter blocks all users at once after a launch. What happened?

**What to check first:** which IP the limiter is counting: log `req.ip`
for a few requests.

**How to confirm:** every request shows the load balancer's IP, and
`express-rate-limit` logs the validation error
`ERR_ERL_UNEXPECTED_X_FORWARDED_FOR`.

**Likely causes and fixes:** `trust proxy` is not set behind a proxy, so all
clients share one key and one limit. Set `trust proxy` to the correct hop
count (never `true`, which lets clients spoof their IP), and use a shared
store such as Redis when several instances run. See
[security best practices](security-best-practices.md).

### 54. The load balancer reports occasional 502 errors, but the Express logs show no failed requests. How do you investigate?

**What to check first:** whether the 502s cluster on connections that were
idle for a few seconds, and the load balancer's idle timeout setting.

**How to confirm:** compare the balancer's idle timeout (for example 60
seconds on an AWS Application Load Balancer by default) with Node's
`server.keepAliveTimeout` (5 seconds by default).

**Likely causes and fixes:** Node closes an idle keep-alive connection just
as the balancer reuses it. Set `server.keepAliveTimeout` longer than the
balancer's idle timeout, for example 65 seconds. See
[running Express in production](production-and-performance.md).

### 55. Every deployment causes a short burst of failed requests. How do you make deploys clean?

**What to check first:** what the process does on `SIGTERM`, and how long
the orchestrator waits before killing it.

**How to confirm:** 5xx or connection-reset errors line up with deploy
times; logs show the process exiting immediately, or "shutting down"
followed by a forced kill at the end of the grace period.

**Likely causes and fixes:** the app exits on `SIGTERM` without draining, or
closes before the load balancer stops routing to it, or keep-alive sockets
keep `server.close()` from finishing. Fail readiness, wait a short drain
delay, call `server.close()`, close idle connections as they go idle, close
clients, and exit before the grace period ends. See
[running Express in production](production-and-performance.md).

### 56. An Express 4 app restarts several times an hour, and clients see "connection reset". Logs show an error from an async route just before each restart. What is going on?

**What to check first:** the Express version and whether async handlers
catch their errors.

**How to confirm:** the logs show an uncaught exception or unhandled
promise rejection followed by the process exiting; reproducing the failing
request crashes the process locally.

**Likely causes and fixes:** Express 4 does not catch rejected promises from
async handlers. Since Node.js 15 an unhandled rejection crashes the process
by default, taking every in-flight request down with it. Wrap handlers with
`try`/`catch` and `next(err)` or an async wrapper, or upgrade to Express 5,
which forwards rejections to the error handler. See
[error handling in Express](error-handling-in-express.md).

### 57. "Cannot set headers after they are sent to the client" appears in the logs for one endpoint. How do you fix it?

**What to check first:** the handler's early-exit branches, such as
validation or "not found" checks.

**How to confirm:** the stack trace points to a second `res.json()`,
`res.send()`, or `next()` call after a response was already sent.

**Likely causes and fixes:** a missing `return` before an early
`res.status(...).json(...)`, calling `next()` after responding, or a
callback and a promise both responding. Add `return` to every early
response, and have error handlers delegate with `next(err)` when
`res.headersSent` is true. See [the response object](response-object.md).

### 58. The browser console shows a CORS error, but the request appears in the server logs. Where is the real problem?

**What to check first:** the actual status code of the failing response in
the Network panel or server logs.

**How to confirm:** if the status is 500 (or a proxy error page), the
response was produced by an error path that did not include CORS headers,
so the browser reports CORS instead of the real error. If it is a preflight
`OPTIONS` returning 401 or 404, authentication or routing ran before cors.

**Likely causes and fixes:** fix the underlying error, register `cors()`
before authentication and routes so preflights and error responses carry
the headers, and check that the origin is in the allowlist. See
[configuring CORS in Express](cors-in-express.md).

### 59. Clients get `Unexpected token '<'` when parsing JSON from your API. Why?

**What to check first:** the response's `Content-Type` and body for the
failing request.

**How to confirm:** the API returned `200` with `text/html`, usually the
single-page app's `index.html`, or an HTML error page.

**Likely causes and fixes:** a mistyped or missing API route fell through to
the SPA catch-all, or a body-parser error reached Express's default HTML
error handler. Register API routes and a JSON 404 for `/api` before the
catch-all, and handle parser errors such as `entity.parse.failed` in your
own JSON error handler. See
[static files and template engines](static-files-and-template-engines.md)
and [body parsing and content types](body-parsing-and-content-types.md).

### 60. Users report that uploads larger than about 1 MB fail with an HTML 413 page. Multer allows 10 MB. What is wrong?

**What to check first:** whether the 413 response comes from Express or
from the reverse proxy.

**How to confirm:** the 413 body is the proxy's HTML page, and the Express
logs show no request at all.

**Likely causes and fixes:** Nginx's `client_max_body_size` defaults to
`1m`, so the proxy rejects the body before it reaches Multer. Raise it for
the upload routes only and keep Multer's `fileSize` as the application
limit, or move large files to presigned direct-to-storage uploads. See
[file uploads with Multer](file-uploads.md).

### 61. Memory usage spikes and the container is restarted during busy upload periods. What do you look at?

**What to check first:** the Multer storage engine and its `limits`.

**How to confirm:** memory graphs climb with concurrent uploads, the
orchestrator reports out-of-memory restarts, or logs show
`JavaScript heap out of memory`.

**Likely causes and fixes:** `memoryStorage` keeps every file in RAM, and
without `fileSize` and `files` limits a few large uploads exhaust memory.
Set limits, stream to disk or object storage, or switch large files to
presigned URLs. See [file uploads with Multer](file-uploads.md).

### 62. p99 latency jumps for every route whenever someone exports a large report. How do you find and fix the cause?

**What to check first:** whether the slowdown affects unrelated routes on
the same process at the same moment.

**How to confirm:** event-loop delay metrics (for example from
`perf_hooks.monitorEventLoopDelay()`) spike during exports, and a CPU
profile shows synchronous work such as a huge `JSON.stringify`, a sync
file read, or a long loop in the export handler.

**Likely causes and fixes:** CPU-heavy synchronous work blocks the event
loop, so every other request waits. Stream the export, process it in
batches, or move it to worker threads or a background job that produces a
download. See [running Express in production](production-and-performance.md)
and [the event loop](../nodejs/event-loop.md).

### 63. After adding `helmet()`, the React app served by Express shows a blank page. What happened?

**What to check first:** the browser console.

**How to confirm:** errors such as "Refused to load the script … because it
violates the following Content Security Policy directive".

**Likely causes and fixes:** helmet's default Content Security Policy
(`default-src 'self'`, `script-src 'self'`) blocks inline scripts and
third-party domains the app relies on. Configure CSP directives for the
sources you actually use instead of disabling CSP. See
[security best practices](security-best-practices.md).

### 64. API tests pass locally but fail randomly in CI. How do you make them reliable?

**What to check first:** which tests fail across reruns of the same commit,
and whether they share a database, collection, or port.

**How to confirm:** running the files one at a time
(`node --test --test-concurrency=1`) makes the failures disappear.

**Likely causes and fixes:** `node --test` runs test files in parallel
processes by default, so files sharing one database interfere, or tests
depend on each other's data. Give each file its own database or collection
names, reset state in `beforeEach`, and close clients in `after()` so the
run exits. See [testing Express APIs](testing-express-apis.md).

### 65. A user changes their password after a suspected account takeover, but the attacker's API calls keep working. Why, and what do you change?

**What to check first:** how the API authenticates: JWT access tokens,
refresh tokens, or server-side sessions.

**How to confirm:** audit logs show requests with tokens issued before the
password change, still accepted because their `exp` has not passed.

**Likely causes and fixes:** JWT access tokens stay valid until they expire,
and refresh tokens were not revoked on the password change. Delete all of
the user's refresh tokens (or sessions) on password change, keep access
tokens short-lived, and optionally add a token-version claim checked
against the user record. See
[implementing authentication in Express](authentication-in-express.md).

## Further learning

- [Express overview](../express.md)
- [Express guide](https://expressjs.com/en/guide/routing.html)
- [Express 5 API reference](https://expressjs.com/en/5x/api/)
- [Migrating to Express 5](https://expressjs.com/en/guide/migrating-5.html)
