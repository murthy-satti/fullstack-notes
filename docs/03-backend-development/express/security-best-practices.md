# Express Security Best Practices

Express gives you routing and middleware, not security. Headers, rate
limits, input validation, injection protection, and safe error handling are
your responsibility. This lesson goes through the protections every
production Express app needs, what each one defends against, and how to
configure it.

## Why it matters

An API is reachable by anyone on the internet, including automated scanners
that probe for well-known weaknesses within minutes of deployment. Most
breaches come from ordinary gaps (an injection, a missing ownership check,
a leaked stack trace, an outdated dependency) rather than exotic attacks.
Security is a set of habits applied consistently.

For the attack catalogue behind these practices, see [OWASP](../../09-security-and-testing/owasp.md)
and [API security](../../09-security-and-testing/api-security.md).

## Real-world usage

- **Stripe** protects its API with several kinds of limits. In
  [Scaling your API with rate limiters](https://stripe.com/blog/rate-limiters)
  it explains that it operates four types of limiters in production,
  including a request rate limiter ("N requests per second" per user) and a
  concurrent requests limiter that caps how many requests a user can have in
  progress at once, alongside load shedders that protect the whole system.
- **GitHub** publishes its API limits and how clients learn about them. Its
  [REST API rate limit documentation](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)
  describes a personal limit of 5,000 requests per hour and says that
  exceeding it returns a 403 or 429 response with the
  `x-ratelimit-remaining` header at 0: limits that clients can read and
  respect.
- **GitHub Dependabot** and **npm** automate dependency auditing.
  [Dependabot alerts](https://docs.github.com/en/code-security/dependabot/dependabot-alerts/about-dependabot-alerts)
  notify you about vulnerable dependencies so you can upgrade, and
  [`npm audit`](https://docs.npmjs.com/cli/v11/commands/npm-audit) submits a
  description of your project's dependencies to the registry and asks for a
  report of known vulnerabilities.

Popular tools: `helmet`, `express-rate-limit` (with `rate-limit-redis` for
several instances), `cors`, `zod` or `joi` for validation, `pino` with
redaction, Dependabot or Renovate for updates, and a web application
firewall at the edge.

## How it works

Security is layered: each control covers gaps in the others.

![Flowchart: a request passes TLS at the proxy, the rate limiter (429 if exceeded), helmet headers, the body size limit (413), authentication (401), authorization (403), and input validation (400) before the route handler runs; errors thrown in the handler go to an error handler that returns 500 with a generic message.](security-request-pipeline.svg)

### Security headers with helmet

`helmet()` sets a group of HTTP response headers that tell browsers to apply
extra protections. The most important ones:

| Header | What it does | Attack it reduces |
|--------|--------------|-------------------|
| `Content-Security-Policy` | Lists which sources of scripts, styles, images, and frames the page may load | XSS, data injection |
| `Strict-Transport-Security` | Tells browsers to use HTTPS only for this site for a period | Downgrade to HTTP, cookie theft on insecure networks |
| `X-Content-Type-Options: nosniff` | Stops browsers from guessing a different content type than declared | Uploaded files being run as scripts |
| `X-Frame-Options` / CSP `frame-ancestors` | Controls whether other sites may embed your pages in frames | Clickjacking |
| `Referrer-Policy` | Limits how much of the URL is sent in the `Referer` header | Leaking paths or tokens in URLs to other sites |
| `Cross-Origin-Opener-Policy` / `Cross-Origin-Resource-Policy` | Isolate your pages and resources from other origins | Cross-origin leaks |

Helmet also removes the `X-Powered-By` header. For a pure JSON API, CSP
matters less (browsers do not render JSON as a page), but the defaults are
harmless and protect any HTML you serve.

### `X-Powered-By`

By default Express adds `X-Powered-By: Express`. Removing it is a small
step: Helmet's own documentation notes it offers very limited security
benefit, but it saves bandwidth and may thwart simplistic attackers who
scan for a framework. Helmet removes it; without helmet, call
`app.disable("x-powered-by")`.

### Rate limiting

Rate limiting caps how many requests a client can make in a window.
`express-rate-limit` stores counters per key (the client IP by default).
Apply a general limit to the API and stricter limits to sensitive routes:
login, registration, password reset, and expensive search endpoints. When
the limit is hit, respond `429 Too Many Requests` with a `Retry-After`
header. Running several instances requires a shared store such as Redis so
all instances count together. See
[rate limiting and throttling](../backend-concepts/rate-limiting-and-throttling.md).

### Body size limits

`express.json()` accepts 100 KB by default. Set an explicit `limit` that fits
your API. Large bodies cost memory and CPU to parse; an attacker can send
many of them to exhaust the server. Oversized requests are rejected with
`413`. File uploads need their own limits in Multer; see
[file uploads](file-uploads.md).

### Input validation

Validate the type, shape, length, and allowed values of every input: body,
params, query, headers, cookies. Reject unknown fields to prevent **mass
assignment** (a client sending `"role": "admin"` that gets saved). See
[request validation](request-validation.md).

### Injection

**NoSQL operator injection.** With MongoDB, if a client sends an object
where you expect a string, it can change the meaning of a query:

```text
POST /login
{"email": "admin@example.com", "password": {"$ne": null}}
```

`User.findOne({ email, password })` would then match any password. Defenses:
validate that each value is a string, never pass raw request objects into
queries, and enable Mongoose's `sanitizeFilter` option, which wraps
operator-like values. Express 5's default "simple" query parser does not
build nested objects from query strings, which removes the `?a[$ne]=` form of
this attack from `req.query`, but JSON bodies can still carry objects.

![Comparison: a login body whose password is {"$ne": null} logs the attacker in as admin when passed straight to User.findOne, because MongoDB treats $ne as an operator; validating that password is a string first rejects the request with 400 before any query runs.](nosql-injection-validation.svg)

**SQL injection.** Never build SQL by concatenating strings. Use
parameterized queries, where values travel separately from the SQL text:

```js
// Unsafe: "1 OR 1=1" in id dumps the whole table.
// await pool.query(`SELECT * FROM users WHERE id = ${req.params.id}`);

// Safe: the driver sends the value as data, never as SQL.
await pool.query("SELECT * FROM users WHERE id = $1", [req.params.id]);
```

**Command injection.** `child_process.exec()` runs a shell, so input such as
`file.png; rm -rf /` becomes a second command. Use `execFile()` or `spawn()`
with an argument array, and validate the input.

### Cross-site scripting (XSS)

XSS means attacker-controlled data runs as script in another user's
browser. APIs contribute when they store unsanitized HTML that a frontend
later renders. Escape output in templates, set `Content-Type` correctly
(JSON as `application/json`), use CSP, and sanitize rich text with a
dedicated library if you must accept HTML.

### Cross-site request forgery (CSRF)

If you authenticate with cookies, another site can make the browser send
authenticated requests. Use `SameSite=Lax` or `Strict` cookies, keep GET
requests free of side effects, check the `Origin` header on state-changing
requests, and use CSRF tokens for traditional forms. APIs authenticated with
`Authorization: Bearer` headers are not exposed to CSRF in the same way,
because browsers do not attach those headers automatically. See
[cookies and sessions](cookies-and-sessions.md).

### CORS done correctly

CORS relaxes the browser's same-origin policy; it never protects your
server. Allow only the origins you trust, never reflect any `Origin` back
while also allowing credentials, and remember that requests from scripts,
curl, or other servers ignore CORS entirely. See
[configuring CORS in Express](cors-in-express.md).

### "Trust proxy" done correctly

Behind a load balancer, `req.ip` is the proxy's address unless you set
`trust proxy`. Setting it to `true` trusts **every** `X-Forwarded-For`
value, so a client can fake its IP and bypass IP-based rate limits. Trust a
specific number of hops (`1` for one proxy) or specific proxy addresses.

### Secrets management

Keep secrets (database URLs, JWT secrets, API keys) in environment variables
or a secrets manager, never in code or Git. Use different secrets per
environment, rotate them, and never log them. See
[environment variables](../../07-devops-and-deployment/environment-variables.md).

### Dependency auditing

Most of an Express app's code comes from npm packages. Commit
`package-lock.json`, install with `npm ci` in CI and production, run
`npm audit` regularly, enable automated update pull requests (for example
Dependabot), and be wary of new or unpopular packages with install scripts.

### HTTPS everywhere

Serve all traffic over HTTPS, usually terminated at a reverse proxy or load
balancer. Redirect HTTP to HTTPS, send HSTS, and mark cookies `secure`. See
[TLS and SSL](../../01-networking-and-protocols/tls-and-ssl.md).

### Errors that don't leak

Stack traces, SQL errors, and file paths tell attackers how your system is
built. Send generic messages for unexpected errors, log the details
server-side, and run with `NODE_ENV=production` so Express's default handler
hides stacks.

### HTTP parameter pollution

`?role=user&role=admin` makes `req.query.role` an array instead of a
string. Code that expects a string may crash or behave unexpectedly, and a
validator that checks only one value can be bypassed. Validate types
explicitly in your validation layer. The older `hpp` middleware, which
rewrites `req.query` to keep only the last value, was written for Express 4:
in Express 5 `req.query` is a getter that re-parses the URL on every access,
so rewriting it has no lasting effect.

### Regular expression denial of service (ReDoS)

Some regular expressions take exponential time on crafted input, such as
`/^(a+)+$/` against a long string of `a`s ending in `!`. Because Node runs
JavaScript on one thread, one such request can freeze the whole server.
Avoid nested quantifiers on user input, limit input length before matching,
and prefer well-tested validation libraries. (Express 5's new path syntax
removed regex features in route strings partly for this reason.)

### Logging without secrets

Log enough to investigate incidents (request ID, user ID, route, status,
timing) but redact passwords, tokens, cookies, `Authorization` headers, and
personal data. Structured loggers such as pino support redaction paths.

## When to use and when not to use

Every internet-facing Express app needs the baseline: HTTPS, validation,
parameterized queries, authorization checks, safe errors, and dependency
updates. Some controls depend on how the app is used:

- **CSP and other browser headers** matter most when you serve HTML. For a
  JSON-only API they are cheap insurance, not the main defense.
- **CSRF tokens** are needed for cookie-authenticated browser apps; APIs
  that only accept `Authorization: Bearer` tokens do not need them.
- **App-level rate limiting** may be unnecessary if an API gateway, load
  balancer, or WAF already enforces the same limits; avoid two layers that
  disagree.
- **`trust proxy`** should be set only when a proxy you control sits in
  front of the app.

| Control | In the Express app | At the edge (proxy, gateway, CDN, WAF) |
|---------|--------------------|-----------------------------------------|
| TLS / HTTPS | Rarely | Usually terminated here |
| Security headers | `helmet()` | Possible, but keep one source of truth |
| Rate limiting | Per user or per route, business-aware | Per IP, coarse, absorbs floods before they reach Node |
| Input validation | Always (only the app knows the schema) | Generic rules only |
| Authorization | Always | Not possible: needs business data |
| Bot and DDoS protection | Limited | Best place |

## Practical examples

### A hardened app setup

```js
import express from "express";
import helmet from "helmet";
import cors from "cors";
import { rateLimit } from "express-rate-limit";

const app = express();

app.set("trust proxy", 1);                 // exactly one proxy in front
app.use(helmet());                         // security headers, no X-Powered-By

app.use(cors({
  origin: ["https://app.example.com"],     // allowlist, not "*"
  credentials: true,
}));

app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,                              // per IP per 15 minutes
  standardHeaders: "draft-8",              // standard RateLimit headers
  legacyHeaders: false,
}));

app.use(express.json({ limit: "50kb" }));  // explicit body limit

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10,
  skipSuccessfulRequests: true });
app.use("/auth", authLimiter);
```

### Blocking NoSQL operator injection by validating types

```js
import { z } from "zod";

const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(200),  // a string, never an object
}).strict();                              // unknown fields are rejected

app.post("/auth/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });
  const user = await verifyCredentials(parsed.data.email, parsed.data.password);
  if (!user) return res.status(401).json({ error: "Invalid email or password" });
  res.json({ id: user.id });
});
```

### Safe command execution

```js
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

app.post("/thumbnails", async (req, res) => {
  const id = String(req.body?.id ?? "");
  if (!/^[a-f0-9-]{36}$/.test(id)) return res.status(400).json({ error: "Bad id" });
  // Arguments are passed as an array: no shell, no command injection.
  await execFileAsync("convert", [`/data/${id}.png`, "-resize", "200x200",
    `/data/${id}-thumb.png`]);
  res.sendStatus(202);
});
```

### An error handler that does not leak

```js
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const status = err.status ?? 500;
  req.log?.error({ err }, "request failed");   // full details in the logs
  res.status(status).json({
    error: status < 500 ? err.message : "Something went wrong",
  });
});
```

### Redacting secrets in logs

```js
import pino from "pino";

export const logger = pino({
  redact: ["req.headers.authorization", "req.headers.cookie", "*.password"],
});
```

## Best practices

### Production checklist

| Area | Check |
|------|-------|
| Transport | HTTPS only; HTTP redirects to HTTPS; HSTS enabled |
| Headers | `helmet()` applied; `X-Powered-By` removed |
| Proxy | `trust proxy` set to the real hop count or proxy IPs |
| Limits | Body size limits; upload limits; rate limits (shared store if multiple instances) |
| Input | Every route validates params, query, body; unknown fields rejected |
| Queries | Parameterized SQL; no raw objects in MongoDB filters |
| Auth | Passwords hashed; short-lived tokens; ownership checked on every record |
| Cookies | `httpOnly`, `secure`, `sameSite` set; CSRF protection for cookie auth |
| CORS | Explicit origin allowlist; credentials only when needed |
| Errors | Generic messages for 5xx; no stacks; `NODE_ENV=production` |
| Secrets | In env or a secrets manager; not in Git; rotated |
| Dependencies | Lockfile committed; `npm ci`; `npm audit`; automated updates |
| Logging | Request IDs; secrets and personal data redacted |
| Processes | No `exec()` with user input; no `eval()` or `new Function()` on input |

### General habits

- Treat every input as hostile until validated.
- Apply security middleware early in the chain, before routes.
- Prefer allowlists (allowed origins, types, fields) over denylists.
- Keep authorization checks in the server for every request, not only in the
  UI.
- Fail closed: if a check errors, deny the request.
- Automate dependency and secret scanning in CI.
- Review security settings when adding a proxy, CDN, or new client.

## In production

- **Rate limits hit everyone at once, or never trigger.** Detect: logs show
  the same client IP (the load balancer's) for all requests, and
  `express-rate-limit` logs the validation error
  `ERR_ERL_UNEXPECTED_X_FORWARDED_FOR` ("the 'X-Forwarded-For' header is set
  but the Express 'trust proxy' setting is false"). Cause: `trust proxy` not
  configured behind a proxy. Fix: set it to your real hop count; never `true`,
  which the library flags as `ERR_ERL_PERMISSIVE_TRUST_PROXY`.
- **The effective limit is several times higher than configured.** Detect:
  a client makes `limit × instances` requests before seeing 429s. Cause: the
  default in-memory store counts per process. Fix: a shared store such as
  Redis (`rate-limit-redis`).
- **The frontend breaks right after adding `helmet()`.** Detect: browser
  console errors such as "Refused to load the script … because it violates
  the following Content Security Policy directive". Cause: helmet's default
  CSP (`default-src 'self'`, `script-src 'self'`) blocks inline scripts and
  third-party domains. Fix: configure CSP directives for the sources you
  actually use, instead of disabling CSP.
- **An HTTP-only internal subdomain becomes unreachable.** Detect: browsers
  refuse plain-HTTP connections to a subdomain after visiting the main site.
  Cause: helmet's default HSTS header is
  `max-age=31536000; includeSubDomains`, so browsers enforce HTTPS on every
  subdomain for a year. Fix: serve those subdomains over HTTPS, or disable
  `includeSubDomains` before rolling HSTS out.
- **Error responses expose stack traces or SQL.** Detect: responses or
  scanner reports containing file paths or query text. Cause: `NODE_ENV` not
  set to `production` with the default handler, or a custom handler returning
  `err.message` for 5xx errors. Fix: a central handler with generic 5xx
  messages and `NODE_ENV=production`.

## Important terminology

- **Security header:** A response header that instructs the browser to apply
  a protection.
- **CSP:** Content Security Policy; restricts where a page can load
  resources from.
- **HSTS:** HTTP Strict Transport Security; forces HTTPS for a domain.
- **Clickjacking:** Tricking users into clicking a hidden framed page.
- **Injection:** Input interpreted as code or query syntax.
- **Mass assignment:** Saving client-supplied fields the client should not
  control.
- **ReDoS:** Denial of service caused by slow regular-expression matching.
- **Parameter pollution:** Sending a parameter several times to confuse
  parsing or validation.

## Common mistakes and misconceptions

- **"CORS protects my API."** It only controls which browser pages can read
  responses.
- **`trust proxy: true` everywhere.** Clients can then spoof their IP.
- **Rate limiting in memory with several instances.** Each instance counts
  separately, multiplying the real limit.
- **Validating only the frontend.** Attackers call the API directly.
- **Returning `err.message` for every error.** Internal messages can expose
  queries and paths.
- **"helmet makes the app secure."** It hardens browser behavior; it does
  nothing for injection or authorization bugs.
- **Never updating dependencies.** Known vulnerabilities accumulate.

## Revision questions

1. Name four headers helmet sets and the attack each one reduces.
2. How can a JSON body cause NoSQL injection, and how do you prevent it?
3. Why is `trust proxy: true` dangerous for IP-based rate limiting?
4. Why does an API using Bearer tokens face less CSRF risk than one using
   cookies?
5. What is ReDoS, and why is it especially harmful in Node.js?
6. What should an error response for an unexpected server error contain?

## Further learning

- [Express: Security best practices](https://expressjs.com/en/advanced/best-practice-security.html)
- [helmet on GitHub](https://github.com/helmetjs/helmet)
- [OWASP Node.js Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Nodejs_Security_Cheat_Sheet.html)
- [OWASP Injection Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Injection_Prevention_Cheat_Sheet.html)
- [OWASP REST Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html)
- [MDN: Content Security Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CSP)
- [Web security fundamentals](../../09-security-and-testing/web-security-fundamentals.md)
