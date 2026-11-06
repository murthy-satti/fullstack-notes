# Backend Fundamentals

## Introduction

Backend development builds an application's server-side parts. A backend
receives requests, applies business rules, accesses data, and returns
responses. It may integrate with email, payment, or search services.

## Why does it exist?

Some responsibilities cannot safely live only in a browser. A server can
enforce access rules, coordinate shared data, protect credentials, and serve
multiple clients.

## How does it work?

A client sends an HTTP request. The server routes it to logic that can
validate input, check permissions, and access a database. It returns a status,
headers, and possibly a body. [REST APIs](rest-apis.md) are one common
interface style.

## Real-world example

For a task list, the backend authenticates a user, retrieves only their tasks,
and returns a structured response. A database preserves tasks across devices.

## Developer perspective

Keep responsibilities clear: routing receives requests, business logic
applies rules, and persistence code handles storage. Validate input, limit
data access, and return predictable failures. The
[Node.js](nodejs.md) and [Express](express.md) lessons show one JavaScript
server stack.

## Practical example

A conceptual endpoint might respond to `GET /tasks` with status `200` and a
JSON array of tasks. For a request to create a task, the backend should check
that the title is valid and that the caller is allowed to create it before
storing anything.

## Important terminology

- **Client:** A program that initiates a request, such as a browser.
- **Server:** A program that receives and responds to requests.
- **Business logic:** Rules describing what the application should do.
- **Persistence:** Keeping data beyond the lifetime of a single request.

## Advantages and disadvantages

Backend services centralize data and rules for multiple clients. They require
deployment, monitoring, and careful handling of failures, security, and scaling.

## Common misconceptions

- Backend code is not automatically secure just because it runs on a server.
- A database is not the whole backend; validation and application rules matter.
- A successful HTTP response does not prove that the result is correct.

## Further Learning & References

- **Reference:** [MDN: Introduction to the server side](https://developer.mozilla.org/en-US/docs/Learn/Server-side/First_steps/Introduction) explains server-side responsibilities and request processing.
- **Reference:** [MDN: Client-server overview](https://developer.mozilla.org/en-US/docs/Learn/Server-side/First_steps/Client-Server_overview) introduces clients, servers, and HTTP communication.
