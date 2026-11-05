# REST APIs

## Introduction

An API (Application Programming Interface) defines how software systems
communicate. REST is an architectural style. In common web APIs, URLs identify
resources and HTTP methods request or change them.

## Why does it exist?

An API lets browsers, mobile applications, and services use a backend through
a defined interface. Resource URLs and standard HTTP semantics help clients
integrate with it.

## How does it work?

A client sends an HTTP method, URL, headers, and sometimes a body. The server
returns a status, headers, and often JSON. `GET` retrieves, `POST` commonly
creates or processes, `PUT` replaces, `PATCH` partially updates, and `DELETE`
removes a resource. The API contract defines exact behavior.

## Real-world example

A task service might use `GET /tasks/42` to retrieve task 42 and
`PATCH /tasks/42` to change its title. It can return `200` for success and
`404` for a missing task. See [Express](express.md) for route implementation.

## Developer perspective

Use consistent resource names, validate request bodies, return meaningful
status codes, and document response shapes. Plan pagination, errors, and
version changes. See [authentication and authorization](authentication-and-authorization.md).

## Practical example

```http
GET /api/tasks/42 HTTP/1.1
Accept: application/json
```

```http
HTTP/1.1 200 OK
Content-Type: application/json

{"id":42,"title":"Read the API lesson","completed":false}
```

An API should document its exact schema and error responses.

## Important terminology

- **Resource:** A concept or item exposed by an API.
- **Endpoint:** A reachable API location, often described by method and path.
- **HTTP method:** A standardized action such as `GET` or `POST`.
- **Status code:** A number that communicates the result of an HTTP request.
- **Idempotent:** Repeating an operation has the same intended effect as doing it once.

## Advantages and disadvantages

REST-style APIs use familiar web infrastructure and serve many clients. Design
still requires decisions about schemas, compatibility, security, and failures;
REST does not prescribe one universal URL or JSON format.

## Common misconceptions

- REST is not synonymous with JSON; REST is an architectural style, while JSON
  is one possible representation format.
- A URL alone does not define the operation; method semantics matter.
- Every successful request does not need to use status `200`; for example,
  resource creation can use `201`.

## Revision questions

1. How do HTTP method and URL work together to describe a request?
2. What is one difference between `PUT` and `PATCH`?
3. Why should an API document its status codes and response schema?

## Further Learning & References

- **Official standard:** [RFC 9110: HTTP Semantics](https://www.rfc-editor.org/rfc/rfc9110) defines HTTP methods, status codes, and message semantics.
- **Reference:** [MDN: REST](https://developer.mozilla.org/en-US/docs/Glossary/REST) provides a concise explanation of REST and its constraints.
