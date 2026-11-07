# Implementing Authentication in Express

Authentication answers "who is making this request?" and authorization
answers "are they allowed to do this?". Express has no built-in login
system, so you assemble one from password hashing, a way to remember the
user (a session or a token), and middleware that protects routes. This
lesson builds both a session-based and a JWT-based login and shows how to add
role and ownership checks.

## Why it matters

Authentication code guards every private route in an application, and the
mistakes are expensive: plain-text passwords leak in breaches, tokens that
never expire stay usable after theft, and missing ownership checks let one
user read another user's data. Building the flow yourself once, carefully,
teaches you what libraries and identity providers do for you.

For the underlying concepts, see
[authentication and authorization](../backend-concepts/authentication-and-authorization.md)
and [sessions, cookies, and JWT](../backend-concepts/sessions-cookies-and-jwt.md).

## Real-world usage

- **Dropbox** layers its password storage. Its engineering blog,
  [How Dropbox securely stores your passwords](https://dropbox.tech/security/how-dropbox-securely-stores-your-passwords),
  describes hashing with bcrypt (cost 10, a unique per-user salt) and then
  encrypting the result with a separately stored key it calls a "pepper",
  so a stolen database alone is not enough to start cracking.
- **Auth0** offers refresh token rotation. Its
  [documentation](https://auth0.com/docs/secure/tokens/refresh-tokens/refresh-token-rotation)
  explains that every time an application exchanges a refresh token,
  Auth0 also returns a new refresh token, and that **automatic reuse
  detection** revokes the token family when an old refresh token is
  presented again: the rotation-plus-reuse-detection pattern shown below.
- **GitHub** redesigned its access tokens to be easy to recognize when they
  leak. Its post
  [Behind GitHub's new authentication token formats](https://github.blog/engineering/platform-security/behind-githubs-new-authentication-token-formats/)
  introduces prefixes such as `ghp` for personal access tokens and `gho` for
  OAuth access tokens, so its secret scanning can detect leaked tokens with
  far fewer false positives.

Popular tools and providers: `argon2`, `bcrypt`, `jsonwebtoken`, `jose`,
Passport.js, `express-rate-limit`; hosted identity providers such as Auth0,
Okta, Amazon Cognito, and Firebase Authentication.

## How it works

### The overall flow

![Flowchart: registration validates input, hashes the password with argon2.hash, and saves only the hash with 201 Created; login finds the user and checks argon2.verify, logging the user in on a match or returning 401 with the same message either way.](auth-register-login-flow.svg)

Once a user is logged in, every protected request passes through the same
checks, authentication first and authorization second:

![Flowchart: a protected request returns 401 if no token is present or jwt.verify fails, sets req.user when valid, returns 403 if requireRole rejects the role, returns 404 if the order belongs to another user, and only then reaches the route handler with 200.](auth-request-check-flow.svg)

### Password hashing

Passwords are **hashed**, never stored as plain text and never encrypted.
Encryption is reversible: whoever holds the key can recover every password.
A password hash is one-way.

Use an algorithm designed to be slow and memory-hard:

| Algorithm | Package | Notes |
|-----------|---------|-------|
| Argon2id | `argon2` | Modern recommendation; tunable memory and time cost |
| bcrypt | `bcrypt` (or `bcryptjs`) | Widely used; OWASP recommends a work factor of 10 or more; only the first 72 bytes count |
| scrypt | `node:crypto` | Built in; memory-hard |

These libraries generate a random **salt** for every password and store it
inside the hash string, so identical passwords produce different hashes.
Never use fast hashes such as MD5 or SHA-256 alone for passwords.

### Two ways to remember the user

| | Session-based | Token-based (JWT) |
|-|---------------|-------------------|
| What the client holds | A random session ID in a cookie | A signed token |
| Where user state lives | Server-side store (Redis, DB) | Inside the token's claims |
| Logout / revocation | Delete the session: immediate | Hard until expiry; needs short lifetimes or a denylist |
| Typical clients | Browser apps on your own domain | Mobile apps, third-party clients, service-to-service |
| Main risk | CSRF (mitigate with SameSite, tokens) | Token theft (keep lifetimes short, avoid `localStorage`) |

Browser apps on your own domain usually do best with sessions. JWTs suit
clients that cannot rely on cookies.

### JWT access and refresh tokens

A JSON Web Token has three base64url parts: header, payload (claims), and
signature. The server signs it with a secret (HS256) or a private key
(RS256/ES256), and later verifies the signature and the `exp` claim.

Because a stolen JWT works until it expires, systems use two tokens:

- **Access token:** short-lived (5–15 minutes), sent on each API request in
  `Authorization: Bearer <token>`.
- **Refresh token:** long-lived, sent only to a refresh endpoint to get a new
  access token. Store it hashed in the database so it can be revoked, and
  **rotate** it: issue a new one on every refresh and invalidate the old one.

![Sequence diagram: login returns a 15-minute access token and an HttpOnly refresh cookie whose hash is stored; API calls use the Bearer token until it expires and returns 401; the client then posts to /auth/refresh, the API deletes the old refresh hash and saves a new one, returns a new access token, and the retried call succeeds.](jwt-refresh-sequence.svg)

### Where to store tokens in a browser

- **`localStorage`:** readable by any script on the page, so an XSS bug
  exposes the token. Avoid for long-lived tokens.
- **Memory (a JavaScript variable):** lost on reload; pair it with a refresh
  token in an `httpOnly` cookie.
- **`httpOnly` cookie:** unreadable by scripts; needs `SameSite` and CSRF
  protection because the browser sends it automatically.

### 401 vs 403

- **401 Unauthorized:** the request has no valid credentials. "Who are you?"
  Log in or refresh the token.
- **403 Forbidden:** credentials are valid, but this user may not do this.
  Logging in again will not help.

### Passport.js in brief

Passport is authentication middleware built around **strategies**: plug-ins
for a method of logging in, such as `passport-local` (username and
password), `passport-jwt` (Bearer tokens), and strategies for OAuth
providers such as Google or GitHub. Each strategy calls a "verify" function
you write, and `passport.authenticate("strategy-name")` runs it as
middleware. Passport saves boilerplate when you support many login
methods. For one or two methods, plain middleware like the examples below is
often clearer. In recent versions `req.logout()` takes a callback.

### Login with a provider

"Sign in with Google" uses OAuth 2.0 and OpenID Connect: your server
redirects the user to the provider, the provider redirects back with a code,
and your server exchanges the code for tokens that identify the user. You
then create your own session or tokens as above. The protocol details are
covered in [OAuth 2.0 and OpenID Connect](../backend-concepts/oauth-and-openid-connect.md).

## When to use and when not to use

Build authentication yourself in Express when:

- You need a simple email-and-password login for one application and can
  maintain it (hashing, rate limits, password reset, account recovery).
- You are learning how authentication works, or have unusual requirements
  no provider supports.

Prefer a hosted identity provider or a framework-level library when:

- You need MFA, passkeys, SSO for business customers (SAML, OIDC), or social
  login.
- Several applications must share one login.
- You lack the time to own security fixes, breach response, and compliance
  for credentials.

| Option | You own | Good for | Trade-off |
|--------|---------|----------|-----------|
| Hand-built (this lesson) | Everything: hashing, sessions/tokens, reset flows | One app, full control, learning | Most security responsibility |
| Passport.js strategies | Glue code and user storage | Several login methods in one Express app | Still your user database and flows |
| Hosted provider (Auth0, Okta, Cognito, Firebase Auth) | Integration only | MFA, SSO, social login, many apps | Cost, vendor dependency, less control |
| Session vs JWT | — | Sessions for same-site browser apps; JWT for mobile and service clients | See the comparison table above |

## Practical examples

### Registration and password hashing

```js
import express from "express";
import argon2 from "argon2";

const app = express();
app.use(express.json());

// In a real app this is a database collection with a unique index on email.
const users = new Map();

app.post("/auth/register", async (req, res) => {
  const { email, password } = req.body ?? {};
  if (typeof email !== "string" || typeof password !== "string") {
    return res.status(400).json({ error: "Email and password are required" });
  }
  if (password.length < 12) {
    return res.status(400).json({ error: "Use at least 12 characters" });
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (users.has(normalizedEmail)) {
    return res.status(409).json({ error: "Email already registered" });
  }

  const passwordHash = await argon2.hash(password); // argon2id by default
  const user = { id: crypto.randomUUID(), email: normalizedEmail,
    passwordHash, role: "user" };
  users.set(normalizedEmail, user);

  res.status(201).json({ id: user.id, email: user.email });
});
```

With bcrypt the calls are `await bcrypt.hash(password, 12)` and
`await bcrypt.compare(password, hash)`.

### Verifying credentials safely

```js
// A real hash of a random value, created once at startup. Comparing against
// it when the user does not exist keeps response times similar.
const DUMMY_HASH = await argon2.hash(crypto.randomUUID());

async function verifyCredentials(email, password) {
  const user = users.get(String(email).trim().toLowerCase());
  const hash = user?.passwordHash ?? DUMMY_HASH;
  const valid = await argon2.verify(hash, String(password));
  return user && valid ? user : null;
}
```

Return the same message for "no such user" and "wrong password", so the
endpoint does not reveal which emails are registered.

### Session-based login

```js
import session from "express-session";

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, secure: true, sameSite: "lax",
    maxAge: 8 * 60 * 60 * 1000 },
  // store: a Redis or MongoDB store in production
}));

app.post("/auth/login", async (req, res, next) => {
  const user = await verifyCredentials(req.body?.email, req.body?.password);
  if (!user) return res.status(401).json({ error: "Invalid email or password" });

  req.session.regenerate((err) => {          // prevent session fixation
    if (err) return next(err);
    req.session.user = { id: user.id, role: user.role };
    res.json({ id: user.id, email: user.email });
  });
});

function requireSession(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: "Login required" });
  req.user = req.session.user;
  next();
}
```

The full cookie and session setup is covered in
[cookies and sessions](cookies-and-sessions.md).

### JWT-based login and verify middleware

```js
import jwt from "jsonwebtoken";

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;

function issueAccessToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role },           // claims
    ACCESS_SECRET,
    { expiresIn: "15m", algorithm: "HS256", issuer: "my-api" }
  );
}

app.post("/auth/token", async (req, res) => {
  const user = await verifyCredentials(req.body?.email, req.body?.password);
  if (!user) return res.status(401).json({ error: "Invalid email or password" });
  res.json({ accessToken: issueAccessToken(user), tokenType: "Bearer",
    expiresIn: 900 });
});

function requireJwt(req, res, next) {
  const header = req.get("authorization") ?? "";
  const [scheme, token] = header.split(" ");
  // A 401 should tell the client which auth scheme to use.
  res.set("WWW-Authenticate", "Bearer");
  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ error: "Missing bearer token" });
  }
  try {
    // Pin the algorithm so a forged header cannot switch it.
    const claims = jwt.verify(token, ACCESS_SECRET,
      { algorithms: ["HS256"], issuer: "my-api" });
    res.removeHeader("WWW-Authenticate"); // authenticated: not needed
    req.user = { id: claims.sub, role: claims.role };
    next();
  } catch (err) {
    const expired = err.name === "TokenExpiredError";
    res.status(401).json({ error: expired ? "Token expired" : "Invalid token" });
  }
}
```

Example request and response:

```text
GET /orders HTTP/1.1
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...

HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer
{"error":"Token expired"}
```

### Refresh-token rotation

```js
import { createHash, randomBytes } from "node:crypto";

const refreshTokens = new Map(); // tokenHash -> { userId, expiresAt }
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function issueRefreshToken(res, userId) {
  const token = randomBytes(32).toString("base64url");
  refreshTokens.set(sha256(token), {
    userId, expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000 });
  res.cookie("refresh", token, {
    httpOnly: true, secure: true, sameSite: "strict",
    // Sent only to /auth/* routes (refresh and logout), not to the rest of
    // the API. A narrower path such as "/auth/refresh" would stop the
    // browser sending it to /auth/logout, so logout could not revoke it.
    path: "/auth",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

app.post("/auth/refresh", (req, res) => {
  const token = req.cookies?.refresh;          // requires cookie-parser
  const record = token && refreshTokens.get(sha256(token));
  if (!record || record.expiresAt < Date.now()) {
    return res.status(401).json({ error: "Please log in again" });
  }
  refreshTokens.delete(sha256(token));         // rotate: old token is dead
  const user = findUserById(record.userId);
  issueRefreshToken(res, user.id);
  res.json({ accessToken: issueAccessToken(user) });
});
```

Production systems also detect **reuse**: if an already-rotated refresh
token is presented, someone copied it, so revoke all of that user's tokens.

### Authorization: roles and ownership

```js
function requireRole(...allowed) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Login required" });
    if (!allowed.includes(req.user.role)) {
      return res.status(403).json({ error: "Not allowed" });
    }
    next();
  };
}

app.delete("/admin/users/:id", requireJwt, requireRole("admin"),
  (req, res) => res.sendStatus(204));

// Ownership: a user may read only their own orders.
app.get("/orders/:id", requireJwt, async (req, res) => {
  const order = await findOrder(req.params.id);
  if (!order || order.userId !== req.user.id) {
    // 404 instead of 403 avoids confirming that the order exists.
    return res.status(404).json({ error: "Order not found" });
  }
  res.json(order);
});
```

Missing ownership checks are called broken object-level authorization, and
the OWASP API Security Top 10 (2023) ranks them first (API1). Checking
roles alone is not enough.

### Logout

```js
app.post("/auth/logout", (req, res) => {
  const token = req.cookies?.refresh;
  if (token) refreshTokens.delete(sha256(token)); // revoke server-side
  res.clearCookie("refresh", { path: "/auth", httpOnly: true,
    secure: true, sameSite: "strict" });   // same path as when it was set
  res.sendStatus(204);
});
```

The short-lived access token remains valid until it expires, which is why
its lifetime is kept short.

### Brute-force protection

```js
import { rateLimit } from "express-rate-limit";

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,   // 15 minutes
  limit: 10,                  // 10 attempts per IP per window
  standardHeaders: "draft-8", // send the standard RateLimit headers
  legacyHeaders: false,       // drop the old X-RateLimit-* headers
  skipSuccessfulRequests: true,
});

app.post("/auth/login", loginLimiter /* , login handler */);
```

Per-IP limits do not stop attackers spread over many IPs. Add per-account
measures too: temporary lockout or increasing delays after repeated failures
for one email, plus alerts and optional CAPTCHA.

## Best practices

- Hash passwords with Argon2id or bcrypt; never store or log plain passwords.
- Use one generic error for any login failure.
- Regenerate sessions on login; destroy them on logout.
- Keep access tokens short-lived; rotate and store refresh tokens hashed.
- Pin JWT algorithms in `jwt.verify()` and validate `iss`/`aud` when used.
- Load secrets from environment variables and keep them long and random.
- Check authorization on every request, including ownership of the record.
- Rate-limit login, registration, and password-reset endpoints.
- Use HTTPS everywhere; tokens and cookies are credentials.
- Consider an identity provider when you need MFA, SSO, or social login.

## In production

- **Valid tokens fail on some servers.** Detect: intermittent 401s and
  `JsonWebTokenError: invalid signature` in logs from only some instances.
  Cause: instances signing and verifying with different secrets (a missing
  environment variable, or a secret generated at startup). Fix: load one
  secret (or key pair) from your secret manager on every instance; for
  rotation, verify against the old and new keys during the switch.
- **Freshly issued tokens are rejected as expired or not yet valid.**
  Detect: `TokenExpiredError` or `NotBeforeError` seconds after login,
  often only when the issuer and verifier are different machines. Cause:
  clock skew between servers. Fix: keep clocks synchronized with NTP and
  allow a few seconds with `jwt.verify`'s `clockTolerance` option.
- **Login becomes slow and CPU spikes during an attack.** Detect: rising
  p99 latency on the login route, high CPU, and many 401s from a small set
  of IPs. Cause: credential stuffing; password hashing is deliberately
  expensive, so each attempt costs real CPU and memory. Fix: rate-limit by
  IP and by account, add increasing delays or CAPTCHA after failures, and
  alert on failure-rate spikes.
- **Users stay signed in after a password change or "log out everywhere".**
  Detect: support reports, or audit logs showing API calls with old tokens.
  Cause: JWT access tokens stay valid until `exp`, and refresh tokens were
  not revoked. Fix: delete all of the user's refresh tokens on password
  change, keep access tokens short, and optionally add a token-version claim
  checked against the user record.
- **Users are randomly logged out with several tabs open.** Detect:
  refresh-endpoint 401s "Please log in again" shortly after successful
  refreshes for the same user. Cause: two tabs refresh at the same moment
  with the same refresh token; rotation invalidates it for the second one
  (and reuse detection may revoke the whole family). Fix: let only one
  refresh run at a time on the client and share its result across tabs.

## Important terminology

- **Authentication:** Proving who the user is.
- **Authorization:** Deciding what an authenticated user may do.
- **Hash:** A one-way transformation; the original cannot be recovered.
- **Salt:** Random data mixed into each password hash.
- **JWT:** A signed token carrying claims such as `sub` and `exp`.
- **Bearer token:** A token that grants access to whoever presents it.
- **Refresh token:** A long-lived credential used only to get new access
  tokens.
- **Token rotation:** Replacing a refresh token every time it is used.
- **RBAC:** Role-based access control.
- **Strategy (Passport):** A plug-in that implements one login method.

## Common mistakes and misconceptions

- **"JWTs are encrypted."** The payload is only base64url-encoded; anyone can
  read it. Never put secrets in it.
- **Long-lived JWTs with no revocation.** A stolen token works until expiry.
- **Using `jwt.decode()` to authenticate.** It does not verify the signature;
  use `jwt.verify()`.
- **Returning 403 for missing credentials.** Missing or invalid credentials
  are 401.
- **Checking only roles.** A logged-in user changing an ID in the URL must
  still be blocked.
- **Different errors for unknown email and wrong password.** This lets
  attackers enumerate accounts.
- **Storing tokens in `localStorage` "because it is easy."** Any XSS bug can
  steal them.
- **Assuming authentication middleware also authorizes.** They are separate
  steps.

## Revision questions

1. Why are passwords hashed rather than encrypted, and what does a salt add?
2. Compare session-based and JWT-based login for a browser app.
3. Why do access tokens expire quickly, and how does refresh-token rotation
   limit the damage of theft?
4. When should an API return 401, and when 403?
5. What is an ownership check, and why are role checks not enough?
6. Why are per-IP rate limits insufficient against credential stuffing?

## Further learning

- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- [OWASP JSON Web Token Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_Cheat_Sheet.html)
- [jsonwebtoken on npm](https://www.npmjs.com/package/jsonwebtoken)
- [argon2 on npm](https://www.npmjs.com/package/argon2)
- [Passport.js documentation](https://www.passportjs.org/)
- [express-rate-limit on npm](https://www.npmjs.com/package/express-rate-limit)
- [Authentication security](../../09-security-and-testing/authentication-security.md)
