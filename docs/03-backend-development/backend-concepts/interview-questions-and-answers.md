# Backend Concepts Interview Questions and Answers

These questions review the core backend concepts: HTTP, APIs, security,
reliability, and the building blocks behind production services. Try to
answer each one aloud before reading the answer.

## Backend fundamentals and the request lifecycle

### 1. What are the main responsibilities of a backend?

A backend receives requests, authenticates and authorizes them, validates
input, runs business logic, reads and writes persistent data, integrates with
other services, and returns responses. It also handles cross-cutting
concerns such as logging, error handling, security, and performance.

### 2. What does it mean for a server to be stateless, and why is it useful?

A stateless server keeps no per-client data in its own memory between
requests; any state lives in the request (a token) or in a shared store
(database, Redis). Any instance can then handle any request, which makes
horizontal scaling, load balancing, and restarts simple.

### 3. Describe what happens when a browser requests `https://api.example.com/orders`.

The browser resolves the domain with DNS, opens a TCP connection (or QUIC
for HTTP/3), performs a TLS handshake, and sends the HTTP request. It may
pass through a CDN, load balancer, and reverse proxy before reaching an app
server, where middleware, routing, controllers, services, and the database
produce a response that travels back the same way.

### 4. Why might a request fail with 502 or 504 even though the app code is fine?

These come from a proxy or gateway in front of the app. `502 Bad Gateway`
means the upstream returned an invalid response or the connection failed
(for example, the app crashed). `504 Gateway Timeout` means the upstream did
not respond within the proxy's timeout, often because of a slow query or
dependency.

## HTTP methods, status codes, and headers

### 5. What is the difference between safe and idempotent methods?

A safe method does not request a state change (`GET`, `HEAD`, `OPTIONS`,
`TRACE`). An idempotent method has the same intended effect whether performed
once or repeatedly (`GET`, `HEAD`, `OPTIONS`, `TRACE`, `PUT`, `DELETE`).
`POST` is neither by definition, so retries need application-level
idempotency protection when duplicate effects matter.

### 6. What is the difference between PUT and PATCH?

`PUT` replaces the whole resource with the representation sent, and is
idempotent. `PATCH` applies a partial modification; it is idempotent only if
the patch is (setting a field is, incrementing a counter is not). JSON Merge
Patch and JSON Patch are standard patch formats.

### 7. When should you return 201, 202, and 204?

`201 Created` after creating a resource, ideally with a `Location` header
pointing to it. `202 Accepted` when the request was accepted for later
processing (a background job). `204 No Content` when the request succeeded
and there is no body to return, such as a successful delete.

### 8. What is the difference between 401 and 403?

`401 Unauthorized` means the request lacks valid authentication — the server
does not know who you are, or your credentials are invalid or expired.
`403 Forbidden` means the server knows who you are and you are not allowed
to do this; signing in again will not help.

### 9. What is the difference between 400 and 422?

`400 Bad Request` means the request is malformed or invalid in general.
`422 Unprocessable Content` means the request is well-formed (for example,
valid JSON) but its content fails validation rules. Many APIs use 400 for
all validation errors; the important thing is consistency.

### 10. What is the difference between 301, 302, 307, and 308?

`301` and `308` are permanent redirects; `302` and `307` are temporary.
`307` and `308` require the client to repeat the same method and body,
while clients historically changed `POST` to `GET` on `301` and `302`. `303
See Other` explicitly tells the client to fetch another URL with `GET`.

### 11. How do ETags and conditional requests work?

The server sends an `ETag` identifying a version of a resource. A client
can send `If-None-Match` with that value on a `GET`; if unchanged, the
server returns `304 Not Modified` without a body, saving bandwidth. With
`If-Match` on a `PUT`, the server returns `412 Precondition Failed` if
someone else changed it, preventing lost updates.

### 12. What do `Cache-Control: no-cache` and `no-store` mean?

`no-cache` allows storage but requires successful validation before reuse.
`no-store` tells caches not to store the response, but is not a complete
privacy guarantee. `max-age` sets freshness lifetime; `private` allows
private caches such as a user agent to store the response while prohibiting
shared caches from storing it.

## CORS

### 13. What is the same-origin policy, and what is CORS?

The same-origin policy stops scripts on one origin (scheme, host, and port)
from reading responses from another origin. CORS is a mechanism that lets a
server opt in, using response headers such as
`Access-Control-Allow-Origin`, to allow specific other origins to read its
responses. The browser enforces it.

### 14. What is a preflight request?

For requests that are not "simple" — for example, `PUT` or `DELETE`, a
JSON `Content-Type`, or custom headers like `Authorization` — the browser
first sends an `OPTIONS` request with `Access-Control-Request-Method` and
`Access-Control-Request-Headers`. The server must answer with matching
allow headers before the browser sends the real request.

### 15. Why can't you use `Access-Control-Allow-Origin: *` with cookies?

When a request includes credentials (cookies, HTTP authentication), the
browser requires the server to echo a specific origin and send
`Access-Control-Allow-Credentials: true`; a wildcard is rejected. This
prevents any website from reading authenticated responses. Servers that
reflect origins must use an allowlist and send `Vary: Origin`.

## REST, API design, and API styles

### 16. What are the key constraints of REST?

Client-server separation, statelessness, cacheability, a uniform interface
(resources identified by URIs, manipulated through representations,
self-descriptive messages, and hypermedia), a layered system, and optional
code on demand. Most "REST APIs" follow some of these, especially resources
and HTTP semantics.

### 17. How would you design endpoints for a blog's posts and comments?

`GET /posts`, `POST /posts`, `GET /posts/{id}`, `PATCH /posts/{id}`,
`DELETE /posts/{id}`, and nested `GET /posts/{id}/comments` and
`POST /posts/{id}/comments`. Use plural nouns, let HTTP methods express the
action, return appropriate status codes, and support pagination on lists.

### 18. Compare offset and cursor pagination.

Offset pagination (`?page=3&limit=20`) is simple and allows jumping to a
page, but gets slow on large offsets and can skip or repeat items when data
changes. Cursor (keyset) pagination (`?after=<last-id>`) uses an indexed
position, stays fast, and is stable under inserts, but cannot jump to an
arbitrary page.

### 19. What are common API versioning strategies?

A version in the URI (`/v1/orders`), in a custom header, or in the media
type (`Accept: application/vnd.example.v2+json`). URI versioning is the most
visible and easiest to route. Whatever the strategy, prefer backward
compatible, additive changes so new versions are rarely needed.

### 20. Why use a standard error format such as RFC 9457 problem details?

A consistent format (`type`, `title`, `status`, `detail`, `instance`, plus
extensions like field errors) lets clients handle errors generically and
programmatically. It avoids each endpoint inventing its own shape, and
separates stable error types from human-readable messages.

### 21. When would you choose GraphQL over REST?

When clients need flexible queries across related data and you want to
avoid over-fetching and many round trips — for example, several frontends
with different data needs. Trade-offs include harder HTTP caching, the N+1
query problem (solved with batching such as DataLoader), query cost
limiting, and errors that are often returned inside a `200` response.

### 22. When is gRPC a good choice?

For internal service-to-service communication that needs high performance,
strict contracts, and streaming. gRPC uses Protocol Buffers over HTTP/2,
generates typed clients, and supports bidirectional streaming. It is less
convenient for browsers and public APIs, which usually use REST or GraphQL.

## Webhooks

### 23. What is a webhook, and how does it differ from polling?

A webhook is an HTTP callback: when an event happens, the provider sends a
`POST` to a URL the consumer registered. Polling means the consumer
repeatedly asks whether anything changed. Webhooks deliver events promptly
without wasted requests, but the consumer must expose a reliable, secure
endpoint.

### 24. How do you receive webhooks securely and reliably?

Verify the signature (usually an HMAC over the **raw** body with a shared
secret, compared in constant time), check a timestamp to reject replays,
respond with `2xx` quickly, process the event asynchronously via a queue,
and deduplicate by event ID because providers retry and may deliver events
more than once or out of order.

## Authentication and authorization

### 25. What is the difference between authentication and authorization?

Authentication establishes who is making the request. Authorization decides
whether that identity may perform a specific action on a specific resource.
Both must happen on the server for every protected request.

### 26. How should passwords be stored?

As hashes from a slow, salted password-hashing algorithm such as Argon2id,
scrypt, or bcrypt — never plain text, never reversible encryption, and never
a fast hash like SHA-256 alone. Each password gets a unique salt; an optional
pepper stored outside the database adds protection if the database leaks.

### 27. What is IDOR (broken object-level authorization)?

It is when an API loads an object by an ID supplied in the request without
checking that the caller may access it, so changing `/invoices/1001` to
`/invoices/1002` returns someone else's invoice. Prevent it by scoping
queries to the current user or checking ownership/relationship on every
access.

### 28. Compare RBAC and ABAC.

RBAC grants permissions based on roles (`admin`, `editor`). ABAC evaluates
policies over attributes of the user, resource, action, and environment
("doctors can read records for patients in their clinic"). RBAC is simpler;
ABAC is more expressive. Many systems combine roles with ownership checks.

### 29. How do you prevent user enumeration on a login endpoint?

Return the same message ("Invalid email or password") and similar response
times whether the account exists or not, and apply the same approach to
registration and password reset flows. Add rate limiting so attackers cannot
probe many accounts quickly.

## Sessions, cookies, JWT, and OAuth

### 30. What do the `HttpOnly`, `Secure`, and `SameSite` cookie attributes do?

`HttpOnly` hides the cookie from JavaScript, limiting theft through XSS.
`Secure` sends it only over HTTPS. `SameSite` controls whether it is sent on
cross-site requests: `Strict` limits sending to same-site contexts; `Lax`
also permits some top-level cross-site navigations using safe methods;
`None` permits cross-site use when `Secure` is set. Browser privacy settings
may still block cross-site cookies.

### 31. What is a JWT, and is its payload secret?

A JSON Web Token is a compact token of three base64url parts — header,
payload (claims), and signature. A signed JWT is not encrypted: anyone can
decode and read the payload. The signature only proves it was issued by a
key holder and not modified, so never put secrets in it.

### 32. What must a server check when verifying a JWT?

The signature using an explicitly allowed algorithm and the right key, the
expiry (`exp`) and not-before (`nbf`) with small clock tolerance, the issuer
(`iss`), and the audience (`aud`). Accepting the algorithm from the token
header enables `alg: none` and algorithm-confusion attacks.

### 33. Sessions or JWTs — which would you choose?

For a browser app talking to its own backend, server-side sessions in
`HttpOnly` cookies are simple, secure, and instantly revocable. JWTs suit
distributed APIs, mobile clients, and service-to-service calls where
avoiding a lookup matters, but need short expiry and refresh tokens because
revocation is hard.

### 34. How do refresh token rotation and reuse detection work?

Each time a refresh token is used, the server issues a new one and
invalidates the old one. If an old, already-used refresh token is presented
again, the server assumes theft and revokes the whole token family, forcing
the user to sign in again. This limits the damage from a stolen refresh
token.

### 35. What is CSRF, and how do you prevent it?

Cross-site request forgery tricks a user's browser into sending an
authenticated request (with cookies) to your site from another site.
Defenses include `SameSite` cookies, CSRF tokens required on state-changing
requests, checking the `Origin` header, and never changing state with `GET`.

### 36. Explain the OAuth authorization code flow with PKCE, and what OIDC adds.

The client redirects the user to the authorization server with a `state`
and a code challenge (hash of a secret verifier). After sign-in and consent,
the server redirects back with a short-lived code, which the client exchanges
along with the verifier for tokens. OpenID Connect adds an ID token and a
standard UserInfo endpoint to OAuth 2.0. Provider discovery is defined by a
related specification and is an optional deployment feature.

## Validation and error handling

### 37. What is the difference between validation and output encoding?

Validation checks input against rules and rejects what does not conform, at
the trust boundary. Output encoding transforms data for the context it is
placed in (HTML, JavaScript, CSS, or URLs) so it is treated as data rather
than code. For SQL use parameterized queries; for shells, avoid constructing
command strings and use safe argument APIs. You need both; there is no single
input sanitization that is safe for every output.

### 38. How does NoSQL injection work in a MongoDB login query?

If the API passes JSON input straight into a query, an attacker can send an
operator object such as `{"password": {"$ne": null}}`, which matches any
value. Validate that fields are the expected primitive types (strings) before
building queries, and use schemas that reject unexpected shapes.

### 39. What is mass assignment?

Copying request fields directly into a database update or model, which lets
clients set fields they should not control, such as `role` or `balance`.
Prevent it by validating with a strict schema that allows only specific
fields and by building update objects explicitly.

### 40. What is the difference between operational and programmer errors?

Operational errors are expected failures in correct code — invalid input,
not found, timeouts — and are handled and mapped to responses. Programmer
errors are bugs, such as reading a property of `undefined`; they should be
logged, return a generic `500`, and be fixed. Unknown errors that escape all
handlers usually warrant a process restart.

### 41. Why should errors be handled in one central place?

A central error handler maps every error to a correct status code and a
consistent response, logs it once with context and a request ID, and keeps
internal details out of client responses. Handlers stay simple because they
can let errors propagate instead of repeating try/catch logic.

## Observability and rate limiting

### 42. What is the difference between logs, metrics, and traces?

Logs are detailed records of individual events. Metrics are numeric
measurements aggregated over time, ideal for dashboards and alerts. Traces
follow a single request across services as timed spans, showing where time
is spent. They answer different questions and work best together.

### 43. Why monitor p95 and p99 latency rather than the average?

Averages hide slow outliers: a few very slow requests barely move the mean.
Percentiles show what the slowest 5% or 1% of requests experience, which
often includes your most active users. Teams track percentiles such as p95
and p99; a latency SLO can also state the fraction of requests that must
meet a specific threshold.

### 44. Explain the token bucket rate limiting algorithm.

A bucket holds up to a fixed number of tokens and refills at a steady rate.
Each request consumes a token; when the bucket is empty, requests are
rejected with `429`. It enforces an average rate while allowing short bursts
up to the bucket's capacity.

### 45. What problems arise when rate limiting a scaled-out app?

Per-instance memory counters allow the limit multiplied by the number of
instances, so counters must live in a shared store like Redis and be updated
atomically. The app must also identify the real client IP correctly behind
proxies (`trust proxy`), without trusting forged `X-Forwarded-For` headers.

## Reliability and concurrency

### 46. Why should every outbound call have a timeout?

Without a timeout, a slow or hung dependency holds connections, memory, and
waiting users indefinitely, and can exhaust the service's capacity, causing a
cascading failure. A timeout bounds the damage; note that a timeout means the
outcome is unknown, not that the operation failed.

### 47. What is exponential backoff with jitter?

Retry delays grow exponentially (for example, 100 ms, 200 ms, 400 ms) up to
a maximum, and random jitter spreads them out so many clients do not retry
in synchronized waves. Combined with a maximum number of attempts, it gives
transient failures time to clear without overwhelming the dependency.

### 48. How do idempotency keys work?

The client generates a unique key per logical operation and sends it with
every attempt (for example, in an `Idempotency-Key` header). The server
atomically records the key, performs the operation once, stores the
response, and returns the stored response for repeats — so retrying a
payment cannot charge twice.

### 49. What is a circuit breaker?

A component that monitors calls to a dependency. When failures exceed a
threshold it opens and fails calls immediately, giving the dependency time to
recover. After a cooldown it half-opens to allow trial calls, closing again
on success or reopening on failure.

### 50. How can a race condition happen in single-threaded Node.js, and how do you prevent it?

Requests interleave at every `await`, and production runs multiple
processes, so a read-check-write sequence can interleave with another
request's (two buyers both see stock 1). Prevent it with atomic conditional
updates (`$inc` with a condition, `UPDATE ... WHERE stock >= 1`), unique
constraints, optimistic version checks, or row locks in transactions.

## Jobs, real-time, files, and configuration

### 51. Why use background jobs, and why must they be idempotent?

Slow or unreliable work (emails, reports, image processing, third-party
calls) is moved off the request path so responses stay fast and failures can
be retried. Queues usually deliver at least once, so a job may run twice
after a crash; idempotent jobs ensure duplicates cause no extra effects.

### 52. How do you run a scheduled job once when the app has several instances?

In-process schedulers like `node-cron` run once per instance. Use a single
dedicated scheduler process, queue-based repeatable jobs (such as BullMQ job
schedulers), a distributed lock so only one instance runs each occurrence,
or a platform scheduler such as a Kubernetes CronJob.

### 53. When would you use SSE instead of WebSockets?

When updates flow only from server to client — notifications, progress,
live feeds, streaming AI output. SSE works over plain HTTP, reconnects
automatically with `Last-Event-ID`, and is simpler to operate. WebSockets are
better when both sides send frequent messages, such as chat or multiplayer
games.

### 54. How would you implement large file uploads?

Have the API authorize the upload and return a short-lived presigned URL so
the client uploads directly to object storage, using multipart or resumable
uploads for very large files. Afterwards, verify the object's size and real
type (magic bytes), scan it, process it in a background job, store metadata
in the database, and serve private files through short-lived signed URLs.

### 55. How should configuration and secrets be managed?

Keep configuration out of code and deploy the same build to every
environment, supplying config through environment variables and secrets
through a secret manager. Validate config at startup and fail fast, use
separate least-privilege credentials per environment, never commit or log
secrets, and rotate any secret that leaks.

## Scenario-based questions

### 56. A payment webhook was processed twice and the customer was credited twice — what happened, and how do you prevent it?

**What to check first:** whether both runs had the same provider event ID,
and how long your endpoint took to answer the first delivery.
**How to confirm:** logs or the provider's dashboard show two deliveries of
one event, often a retry after a slow or failed response. Stripe, for
example, retries for up to three days and tells you to track event IDs to
spot duplicates.
**Likely causes and fixes:** delivery is at least once, and the handler is not
idempotent. Record processed event IDs under a unique constraint in the same
transaction as the side effect, respond `2xx` quickly, and do the work from a
queue. See [webhooks](webhooks.md) and
[timeouts, retries, and idempotency](timeouts-retries-and-idempotency.md).

### 57. The browser shows a CORS error only for requests that carry an `Authorization` header. Why?

**What to check first:** the `OPTIONS` preflight in the browser's network
panel — `Authorization` is not a CORS-safelisted header, so it always
triggers a preflight.
**How to confirm:** the preflight returns 401 or 404, or its
`Access-Control-Allow-Headers` does not list `authorization`.
**Likely causes and fixes:** authentication middleware runs before CORS and
rejects the credential-less preflight, or the allowed headers omit
`Authorization` — which a `*` wildcard does not cover. Answer preflights
before authentication and list `Authorization` explicitly. See
[CORS](cors.md) and [CORS in Express](../express/cors-in-express.md).

### 58. After adding a second app instance, users are signed out at random. What do you look at?

**What to check first:** where sessions are stored.
**How to confirm:** requests that fail are served by a different instance
from the one that created the session; logs show "session not found".
**Likely causes and fixes:** sessions live in process memory, such as
`express-session`'s default `MemoryStore`. Move them to a shared store like
Redis, or use tokens that any instance can verify. See
[sessions, cookies, and JWT](sessions-cookies-and-jwt.md).

### 59. Right after putting the API behind a load balancer, every user starts getting 429. What happened?

**What to check first:** the IP address the rate limiter uses as its key.
**How to confirm:** the limiter's keys in logs are all the load balancer's
IP; `express-rate-limit` logs `ERR_ERL_UNEXPECTED_X_FORWARDED_FOR` when it
sees `X-Forwarded-For` while `trust proxy` is off.
**Likely causes and fixes:** `trust proxy` is unset, so every client shares
one key. Set it to the exact number of proxies in front of the app — not
`true`, which would let clients forge their IP. See
[rate limiting and throttling](rate-limiting-and-throttling.md).

### 60. p99 latency on every endpoint jumps from 200 ms to 8 seconds, but CPU is low. How do you investigate?

**What to check first:** traces for slow requests and the latency of each
downstream dependency.
**How to confirm:** spans show requests waiting on one dependency or on a
connection pool; many sockets are open to a single host.
**Likely causes and fixes:** a slow dependency with no timeout holds
connections, and because they are shared, unrelated endpoints wait too.
Undici, behind Node's `fetch`, waits up to 300 seconds for headers by
default. Set timeouts on every call, add a bulkhead per dependency, and
consider a circuit breaker. See
[timeouts, retries, and idempotency](timeouts-retries-and-idempotency.md)
and [logging, monitoring, and tracing](logging-and-monitoring.md).

### 61. During a flash sale, stock went negative and more orders were accepted than units existed. What went wrong?

**What to check first:** how the purchase handler checks and updates stock.
**How to confirm:** a concurrency test with 20 parallel purchases of an item
with stock 1 produces more than one success.
**Likely causes and fixes:** read-then-write in application code, so
requests interleave at each `await`. Use one atomic conditional update
(`UPDATE ... SET stock = stock - 1 WHERE stock >= 1`, or `$inc` with a
`stock: { $gte: 1 }` filter), add a `CHECK (stock >= 0)` constraint, and keep
the concurrency test in CI. See
[concurrency and race conditions](concurrency-and-race-conditions.md).

### 62. After "Sign in with Google", some users land back on the sign-in page with "Invalid sign-in state". Why?

**What to check first:** whether the pre-login session cookie that stores
`state` is sent on the callback request.
**How to confirm:** the callback request has no session cookie, or reaches an
instance that cannot find the session.
**Likely causes and fixes:** the cookie is `SameSite=Strict`, so it is not
sent on the cross-site redirect back from Google, or sessions are not shared
across instances. Use `SameSite=Lax` for that cookie and a shared session
store. See [OAuth 2.0, OpenID Connect, and SSO](oauth-and-openid-connect.md).

### 63. After rotating the JWT signing key, every user is signed out at once. What went wrong?

**What to check first:** which keys the verifiers accept and when the old key
was removed.
**How to confirm:** a spike of signature verification failures starts exactly
at the deploy; failing tokens carry the old `kid`.
**Likely causes and fixes:** the old key was removed while tokens signed with
it were still valid. Publish both keys in the JWKS with different `kid`
values, sign new tokens with the new key, and retire the old key only after
the longest token lifetime has passed. See
[sessions, cookies, and JWT](sessions-cookies-and-jwt.md).

### 64. Welcome emails are arriving hours after sign-up. Where do you look?

**What to check first:** queue depth and the age of the oldest waiting job.
**How to confirm:** the backlog grows steadily, and per-job processing time
or the email provider's latency has risen.
**Likely causes and fixes:** too few workers, low worker concurrency, or a
slow or rate-limited provider. Scale workers, raise concurrency within the
provider's limits, and alert on job age rather than queue depth alone. See
[background jobs and scheduling](background-jobs-and-scheduling.md).

### 65. The nightly report was emailed three times. How do you find and fix the cause?

**What to check first:** how the job is scheduled and how many instances run.
**How to confirm:** logs show the job starting on every instance at the same
minute, or a second instance starting after the first one's lock expired.
**Likely causes and fixes:** `node-cron` runs once per instance, or a
distributed lock expired while a slow job was still running. Use a queue job
scheduler or a single scheduler process, extend locks while working, and make
the job idempotent. See
[background jobs and scheduling](background-jobs-and-scheduling.md) and
[concurrency and race conditions](concurrency-and-race-conditions.md).

### 66. Clients receive an HTML error page instead of JSON for some 500 errors. Why?

**What to check first:** the response `Content-Type` and the server log for
the same request ID.
**How to confirm:** the logs show an error thrown inside the error-handling
middleware, or the handler is registered before the routes.
**Likely causes and fixes:** the error handler itself crashed — for example,
calling `.toLowerCase()` on a driver error whose `code` is a number — so
Express's built-in handler answered with HTML. Register the handler last,
expose only your own error codes, and test it with unexpected error types.
See [error handling](error-handling.md).

### 67. An SSE progress bar jumps straight from 0% to 100%. What is happening?

**What to check first:** whether events reach the client as they are written.
**How to confirm:** `curl -N` directly against the app streams events, but
through the proxy they arrive all at once at the end.
**Likely causes and fixes:** a reverse proxy buffers the response, or
compression middleware holds data back. Send `X-Accel-Buffering: no` (or turn
off `proxy_buffering` in Nginx) and exclude `text/event-stream` from
compression. See [real-time communication](real-time-communication.md).

### 68. Direct uploads to S3 with presigned URLs started failing after an AWS SDK upgrade. What changed?

**What to check first:** the query parameters of a newly generated upload
URL.
**How to confirm:** the URL now contains `x-amz-checksum-crc32` and
`x-amz-sdk-checksum-algorithm`.
**Likely causes and fixes:** recent SDK versions calculate request checksums
by default (`WHEN_SUPPORTED`), and on a presigned URL that is the checksum of
an empty body, so the real upload does not match. Create the client with
`requestChecksumCalculation: "WHEN_REQUIRED"`. See
[file storage and uploads](file-storage-and-uploads.md).

### 69. A security review found bearer tokens in your log platform. What do you do?

**What to check first:** which code path logs the tokens, and how long the
logs are retained and who can read them.
**How to confirm:** search the logs for `Bearer ` and `authorization`; find
the logger or middleware that writes whole request headers.
**Likely causes and fixes:** request logging without redaction. Treat the
tokens as leaked: revoke or expire them, add redaction paths such as
`req.headers.authorization`, add a test that checks redaction, and delete the
affected logs within your retention policy. See
[logging, monitoring, and tracing](logging-and-monitoring.md) and
[configuration and secrets](configuration-and-secrets.md).

### 70. A deploy passed its health checks, but every payment now fails with "invalid API key". How do you prevent this next time?

**What to check first:** the environment variables present in the new
release compared with the previous one.
**How to confirm:** the payment key variable is missing or empty in the new
environment, and errors start exactly at the deploy time.
**Likely causes and fixes:** configuration is read lazily, so the app started
without it. Validate all configuration at startup and exit non-zero, so the
deploy fails before taking traffic; keep secrets in a secret manager per
environment. See [configuration and secrets](configuration-and-secrets.md).

## Further learning

- [Backend concepts overview](../backend-concepts.md)
- [HTTP status codes](http-status-codes.md)
- [Authentication and authorization](authentication-and-authorization.md)
- [Timeouts, retries, and idempotency](timeouts-retries-and-idempotency.md)
- [OWASP Cheat Sheet Series](https://cheatsheetseries.owasp.org/)
- [MDN: HTTP](https://developer.mozilla.org/en-US/docs/Web/HTTP)
