# Important Backend Concepts

Frameworks change, but the problems a backend solves stay the same. This
subject covers the knowledge every backend developer needs, whatever language
or framework they use: how HTTP works in detail, how to design APIs, how to
identify and authorize callers, and how to keep a service correct and
available when traffic grows and dependencies fail.

## What this subject covers

- **HTTP in depth:** methods, every important status code, headers, caching,
  and CORS. These are the vocabulary of every web API.
- **API design:** REST, consistent naming, pagination, versioning, error
  formats, alternative styles such as GraphQL and gRPC, and webhooks.
- **Security:** authentication and authorization, sessions, cookies, JWT,
  OAuth 2.0 and OpenID Connect, and input validation.
- **Reliability:** error handling, logging and monitoring, rate limiting,
  timeouts and retries, idempotency, and race conditions.
- **Architecture patterns:** background jobs, real-time communication, file
  storage, and configuration and secrets.

## How the concepts fit together

Follow one request, `POST /api/orders`, through a production backend:

1. **Request lifecycle:** DNS, TCP, and TLS connect the client to a load
   balancer, which forwards the request to an application instance.
2. **CORS:** if the request came from a browser on another origin, the browser
   first checks that the API allows that origin.
3. **Rate limiting:** the API checks that this caller has not exceeded its
   allowed request rate, or responds with `429 Too Many Requests`.
4. **Authentication and authorization:** a session cookie or token identifies
   the user, and the API checks that they may create orders.
5. **Validation:** the body is checked against a schema, or the API responds
   with `400 Bad Request`.
6. **Idempotency and concurrency:** an idempotency key stops a retried request
   from creating a second order, and an atomic update stops two requests from
   selling the last item twice.
7. **Background jobs:** sending the confirmation email is queued instead of
   making the client wait.
8. **Response:** the API returns `201 Created` with a `Location` header, or a
   consistent error response if something failed.
9. **Observability:** logs, metrics, and traces with a shared request ID record
   what happened.

Each step is one lesson in this subject.

## Practical example

The status code, headers, and body together describe the result of a request.
Use `curl -i` to see all three:

```text
$ curl -i -X POST http://localhost:3000/api/orders \
    -H "content-type: application/json" \
    -d '{"productId": "p_123", "quantity": 1}'

HTTP/1.1 201 Created
Location: /api/orders/o_789
Content-Type: application/json; charset=utf-8

{"id":"o_789","productId":"p_123","quantity":1,"status":"pending"}
```

`201 Created` says a new resource exists, `Location` says where to find it,
and the JSON body describes it. A real Express server also sends headers such
as `Content-Length`, `ETag`, `Date`, and `Connection`; they are left out here
to keep the example short.

## Backend concepts topic map

**Foundations**

- [Backend fundamentals](backend-concepts/backend-fundamentals.md)
- [Client-server model and request lifecycle](backend-concepts/client-server-and-request-lifecycle.md)

**HTTP in depth**

- [HTTP methods](backend-concepts/http-methods.md)
- [HTTP status codes](backend-concepts/http-status-codes.md)
- [HTTP headers and content negotiation](backend-concepts/http-headers.md)
- [CORS (Cross-Origin Resource Sharing)](backend-concepts/cors.md)

**API design**

- [REST APIs](backend-concepts/rest-apis.md)
- [API design best practices](backend-concepts/api-design-best-practices.md)
- [API styles: REST, GraphQL, gRPC, and RPC](backend-concepts/api-styles-graphql-grpc-and-rpc.md)
- [Webhooks](backend-concepts/webhooks.md)

**Security**

- [Authentication and authorization](backend-concepts/authentication-and-authorization.md)
- [Sessions, cookies, and JWT](backend-concepts/sessions-cookies-and-jwt.md)
- [OAuth 2.0, OpenID Connect, and SSO](backend-concepts/oauth-and-openid-connect.md)
- [Validation and sanitization](backend-concepts/validation-and-sanitization.md)

**Reliability**

- [Error handling](backend-concepts/error-handling.md)
- [Logging, monitoring, and tracing](backend-concepts/logging-and-monitoring.md)
- [Rate limiting and throttling](backend-concepts/rate-limiting-and-throttling.md)
- [Timeouts, retries, and idempotency](backend-concepts/timeouts-retries-and-idempotency.md)
- [Concurrency and race conditions](backend-concepts/concurrency-and-race-conditions.md)

**Architecture patterns**

- [Background jobs and scheduling](backend-concepts/background-jobs-and-scheduling.md)
- [Real-time communication: polling, SSE, and WebSockets](backend-concepts/real-time-communication.md)
- [File storage and uploads](backend-concepts/file-storage-and-uploads.md)
- [Configuration, environments, and secrets](backend-concepts/configuration-and-secrets.md)

**Project**

- [Project: ShopLite Checkout](projects.md#shoplite-checkout)

**Review**

- [Backend concepts interview questions and answers](backend-concepts/interview-questions-and-answers.md)

## Developer perspective and common misconceptions

Learn these concepts alongside [Node.js](nodejs.md) and [Express](express.md)
rather than after them: each Express lesson applies one or more of these
ideas. When a framework does something for you, such as setting a header or
choosing a status code, check that it matches what the concept requires.

- A `200 OK` status with `{"error": "..."}` in the body is not error handling;
  the status code should describe the result.
- CORS does not protect your server; it tells browsers which other origins may
  read your responses.
- Authentication (who are you?) and authorization (what may you do?) are
  separate checks, and both run on the server for every request.
- Frontend validation improves the user experience, but only server-side
  validation protects data.
- A single-threaded runtime such as Node.js can still have race conditions,
  because requests interleave at every `await` and production runs many
  instances.

## Further learning

- [MDN: An overview of HTTP](https://developer.mozilla.org/en-US/docs/Web/HTTP/Overview)
- [RFC 9110: HTTP Semantics](https://www.rfc-editor.org/rfc/rfc9110)
- [OWASP Cheat Sheet Series](https://cheatsheetseries.owasp.org/)
- [Backend concepts interview questions and answers](backend-concepts/interview-questions-and-answers.md)
