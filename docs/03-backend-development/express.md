# Express

Express is a minimal web framework for Node.js. It adds routing, middleware,
and convenient request and response helpers on top of the built-in
`node:http` module, so you can build APIs and web servers without handling
every low-level HTTP detail yourself.

## What Express provides

- **Routing:** match an HTTP method and path, such as `GET /users/:id`, to the
  code that handles it.
- **Middleware:** functions that run in order for each request to parse
  bodies, log, authenticate, or reject a request early.
- **Request helpers:** `req.params`, `req.query`, `req.body`, `req.get()`,
  and more for reading what the client sent.
- **Response helpers:** `res.status()`, `res.json()`, `res.redirect()`,
  `res.cookie()`, and `res.sendFile()` for building replies.
- **Routers:** `express.Router()` groups related routes and middleware into
  modules that can be mounted under a path.
- **Error handling:** a dedicated error-handling middleware signature for
  turning failures into consistent responses.

Express is deliberately unopinionated. It does not choose a database,
validation library, authentication system, or folder structure for you. You
add these yourself, which keeps Express flexible but means you must make and
document those decisions.

Express 5 is the current major version. The most visible changes from
Express 4 are that errors from `async` handlers reach the error handler
automatically, and that route path syntax for wildcards and optional segments
has changed. The lessons show Express 5 and point out Express 4 differences
where you are likely to meet them in older code.

## How Express handles a request

1. Node.js receives the HTTP request and passes it to the Express app.
2. Express runs registered middleware in the order it was added, for example
   `express.json()`, a logger, and an authentication check.
3. Each middleware either ends the response or calls `next()` to continue.
4. The router finds the first route whose method and path match.
5. The route handler validates input, calls the business logic, and sends a
   response.
6. If anything fails, the error is passed to error-handling middleware, which
   sends an error response.

## Practical example

```js
import express from "express";

const app = express();
app.use(express.json()); // Parse JSON request bodies into req.body.

const tasks = [{ id: 1, title: "Learn Express" }];

app.get("/tasks", (req, res) => {
  res.json(tasks);
});

app.post("/tasks", (req, res) => {
  const title = req.body?.title;
  if (typeof title !== "string" || title.trim() === "") {
    return res.status(400).json({ error: "title is required" });
  }
  const task = { id: tasks.length + 1, title };
  tasks.push(task);
  res.status(201).json(task);
});

app.listen(3000, () => {
  console.log("API listening on http://localhost:3000");
});
```

`GET /tasks` returns the list, and `POST /tasks` validates the input, then
returns `201 Created` with the new task or `400 Bad Request` with an error.

## Express topic map

**Foundations**

- [Getting started with Express](express/getting-started.md)
- [Routing and routers](express/routing-and-routers.md)

**Requests and responses**

- [The request object](express/request-object.md)
- [The response object](express/response-object.md)
- [Body parsing and content types](express/body-parsing-and-content-types.md)

**Middleware, validation, and errors**

- [Middleware](express/middleware.md)
- [Request validation](express/request-validation.md)
- [Error handling in Express](express/error-handling-in-express.md)

**Browser and client concerns**

- [Configuring CORS in Express](express/cors-in-express.md)
- [Cookies and sessions in Express](express/cookies-and-sessions.md)
- [Implementing authentication in Express](express/authentication-in-express.md)

**Files and views**

- [File uploads with Multer](express/file-uploads.md)
- [Static files and template engines](express/static-files-and-template-engines.md)

**Building for production**

- [Structuring an Express project](express/project-structure.md)
- [Express security best practices](express/security-best-practices.md)
- [Testing Express APIs](express/testing-express-apis.md)
- [Running Express in production](express/production-and-performance.md)

**Project**

- [Project: TaskFlow API](projects.md#taskflow-api)

**Review**

- [Express interview questions and answers](express/interview-questions-and-answers.md)

## Developer perspective and common misconceptions

Learn [Node.js](nodejs.md) and the HTTP basics in
[Important Backend Concepts](backend-concepts.md) first, especially
[HTTP methods](backend-concepts/http-methods.md) and
[status codes](backend-concepts/http-status-codes.md). Register middleware in
a deliberate order, keep route handlers thin by moving business logic into
services, validate every input, and handle errors in one place.

- Express is not part of Node.js; it is a separate npm package.
- Registering a route does not validate its input; you must add validation.
- Middleware order changes behavior: a body parser registered after a route
  does not run for that route.
- `res.json()` does not stop your function; code after it still runs unless
  you `return`.
- Express does not make an API secure by default; headers, rate limits, CORS,
  and authentication are added deliberately.

## Further learning

- [Express: Getting started](https://expressjs.com/en/starter/installing.html)
- [Express 5 API reference](https://expressjs.com/en/5x/api/)
- [Express: Migrating to Express 5](https://expressjs.com/en/guide/migrating-5.html)
- [Express interview questions and answers](express/interview-questions-and-answers.md)
