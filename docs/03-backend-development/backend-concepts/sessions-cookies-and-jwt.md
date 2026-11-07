# Sessions, Cookies, and JWT

HTTP is stateless: each request stands alone, and the server does not
remember that the same browser signed in a minute ago. Sessions, cookies, and
tokens are the mechanisms that carry "this client is already authenticated"
from one request to the next. Choosing and configuring them correctly decides
how secure, scalable, and revocable your sign-in system is.

## Why it matters

After a user signs in, every later request must prove who it comes from. If
that proof is easy to steal, forge, or replay, an attacker becomes the user.
If it cannot be revoked, a stolen credential stays valid until it expires. If
it is configured loosely, cross-site attacks can make the browser send it on
the attacker's behalf. Understanding cookie attributes, session stores, and
JWT verification is therefore core backend knowledge, not an implementation
detail.

## Real-world usage

- **Google Sign-In ID tokens.** Google documents the checks an app must run
  on every ID token: the signature against keys from the `jwks_uri` in its
  discovery document, then `iss`, `aud` (your client ID), and `exp`
  ([Google Identity: OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect)).
- **Firebase Authentication.** Firebase ID tokens are RS256-signed JWTs. The
  Admin SDK's `verifyIdToken()` returns the decoded token when it has the
  correct format, is not expired, and is properly signed — and the docs note
  that this does **not** check whether the token was revoked, which is the
  classic JWT trade-off
  ([Firebase: Verify ID tokens](https://firebase.google.com/docs/auth/admin/verify-id-tokens)).
- **Refresh token rotation at Auth0.** Each refresh returns a new refresh
  token and invalidates the one that was used; if an already-used refresh
  token is presented again, Auth0 also invalidates the most recently issued
  token in that family
  ([Auth0: refresh token rotation](https://auth0.com/docs/secure/tokens/refresh-tokens/refresh-token-rotation)).
- **SameSite by default in Chrome.** Chrome treats cookies that have no
  `SameSite` attribute as `SameSite=Lax`, which blocks most cross-site sends
  and therefore most CSRF
  ([web.dev: SameSite cookies explained](https://web.dev/articles/samesite-cookies-explained)).

**Popular tools and providers:** `express-session` with a Redis store, the
`jose` and `jsonwebtoken` libraries, Passport.js, and hosted token services
such as Auth0, Okta, Amazon Cognito, and Firebase Authentication.

## How it works

### Cookies

A **cookie** is a small name-value pair the server asks the browser to store
with the `Set-Cookie` response header. The browser then sends it back
automatically in the `Cookie` request header on matching requests.

```text
HTTP/1.1 200 OK
Set-Cookie: sid=3f9a1c...; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=3600

GET /api/profile HTTP/1.1
Cookie: sid=3f9a1c...
```

### Set-Cookie attributes

| Attribute | What it does | Guidance |
|---|---|---|
| `Expires=<date>` | Absolute expiry time | Without `Expires` or `Max-Age`, it is a session cookie removed when the browser session ends |
| `Max-Age=<seconds>` | Relative lifetime; takes precedence over `Expires` | `Max-Age=0` deletes the cookie |
| `Domain=<domain>` | Sends the cookie to that domain **and its subdomains** | Omit it to restrict the cookie to the exact host that set it (safer) |
| `Path=<path>` | Sends the cookie only for URLs under this path | Not a security boundary; usually `Path=/` |
| `Secure` | Sends the cookie only over HTTPS | Always set for authentication cookies |
| `HttpOnly` | Hides the cookie from JavaScript (`document.cookie`) | Always set for session/refresh cookies; limits damage from XSS |
| `SameSite=Strict` | Never sent on cross-site requests, including clicking a link from another site | Strongest CSRF protection; can feel like being "signed out" when arriving from links |
| `SameSite=Lax` | Sent on top-level navigations (`GET` links) but not on cross-site subrequests or form `POST`s | Good default; Chromium browsers treat cookies without `SameSite` as `Lax`, but other browsers differ — always set it explicitly |
| `SameSite=None` | Sent on all cross-site requests | Requires `Secure`; only for genuine cross-site use (embedded widgets, separate API domain) |
| `Partitioned` | Stores the cookie separately per top-level site (CHIPS) | For third-party embeds that need state without cross-site tracking |

**Cookie name prefixes** let the browser enforce rules:

- `__Secure-name`: must be set with `Secure` from an HTTPS page.
- `__Host-name`: must be `Secure`, must have `Path=/`, and must **not** have a
  `Domain` attribute — so it is locked to one exact host. This is the best
  choice for a session cookie.

"Same-site" is not the same as "same-origin": `app.example.com` and
`api.example.com` are different origins but the same site (same registrable
domain). A request from the app to the API is therefore a same-site request,
so cookies that `api.example.com` set with `SameSite=Lax` or `Strict` are
still sent with it. (Each host still only receives its own cookies, unless a
cookie was set with a shared `Domain`.)

### Session-based authentication

The server keeps the session state and gives the client only a random,
unguessable **session ID**.

```text
Browser                         Server                     Session store
   │  POST /login (email, pw)     │                            (Redis)
   │─────────────────────────────►│ verify password            │
   │                              │ create session ───────────►│ sid → { userId, roles,
   │  Set-Cookie: sid=abc; HttpOnly│                            │        createdAt }
   │◄─────────────────────────────│                            │
   │                              │                            │
   │  GET /api/orders             │                            │
   │  Cookie: sid=abc             │ look up sid ──────────────►│
   │─────────────────────────────►│◄─────────── { userId } ────│
   │  200 OK (user's orders)      │                            │
   │◄─────────────────────────────│                            │
   │  POST /logout                │ delete sid ───────────────►│
```

Key properties:

- The cookie carries no user data, only a random identifier (at least 128
  bits of entropy from a secure random generator).
- All state lives on the server, so the server can revoke a session instantly
  by deleting it.
- With several app instances, the store must be shared — usually
  [Redis](../../05-application-architecture/redis.md) or a database —
  instead of process memory.
- **Regenerate the session ID on sign-in** (and privilege changes) to prevent
  **session fixation**, where an attacker plants a known session ID before the
  victim signs in.
- Use an **idle timeout** (expire after inactivity) and an **absolute
  timeout** (expire after a maximum lifetime regardless of activity).

### Token-based authentication

Instead of storing state, the server issues a **signed token** that contains
the claims it needs. The client sends it on each request, commonly in the
`Authorization` header:

```text
GET /api/orders HTTP/1.1
Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOi...
```

The server verifies the signature and expiry, then trusts the claims without
a database lookup. This is convenient for APIs, mobile apps, and
service-to-service calls, but it makes revocation harder.

### JWT structure

A **JSON Web Token** (RFC 7519) has three base64url-encoded parts separated
by dots:

```text
header.payload.signature

eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9      ← header  {"alg":"HS256","typ":"JWT"}
.eyJzdWIiOiJ1XzQyIiwiZXhwIjoxNzk...      ← payload {"sub":"u_42","exp":1790000000}
.Qm9vZ3VzU2lnbmF0dXJlRXhhbXBsZQ          ← signature over header + "." + payload
```

- **Header:** the algorithm (`alg`) and type, and sometimes a key ID (`kid`).
- **Payload:** the claims.
- **Signature:** proves the header and payload were produced by someone holding
  the key and have not been modified.

A signed JWT (JWS) is **not encrypted**. Anyone can base64url-decode the
payload and read it, so never put passwords, secrets, or sensitive personal
data in it. (Encrypted JWTs, JWE, exist but are less common.)

### Registered claims

| Claim | Meaning | What the server checks |
|---|---|---|
| `iss` | Issuer — who created the token | Matches the expected issuer |
| `sub` | Subject — whom the token is about (user ID) | Used as the identity |
| `aud` | Audience — who the token is intended for | Includes this API; rejects tokens meant for another service |
| `exp` | Expiration time (seconds since epoch) | Current time is before `exp` (allow a small clock skew) |
| `nbf` | Not before | Current time is after `nbf` |
| `iat` | Issued at | Useful for age checks and "revoke tokens issued before X" |
| `jti` | JWT ID — unique token identifier | Used for denylists and replay detection |

### Signing algorithms and JWKS

| Algorithm | Type | Keys | When to use |
|---|---|---|---|
| `HS256` | HMAC with SHA-256 | One shared secret signs and verifies | A single service that both issues and verifies tokens |
| `RS256` | RSA signature | Private key signs; public key verifies | Many services verify, only the issuer can sign |
| `ES256` | ECDSA (P-256) signature | Private/public key pair, smaller signatures than RSA | Same as RS256, more compact |

With asymmetric algorithms, the issuer publishes its public keys as a **JWKS**
(JSON Web Key Set) at a URL. Verifiers fetch and cache it, pick the key by the
token's `kid`, and can follow key rotation without redeploying.

### Verifying a JWT — every step

1. Parse the three parts; reject malformed tokens.
2. Check the `alg` against an **allowlist you configured** (for example,
   only `RS256`). Never let the token choose the algorithm.
3. Select the key (by `kid` from your JWKS, or your configured secret).
4. Verify the signature.
5. Validate `exp` and `nbf` (with a small clock tolerance), `iss`, and `aud`.
6. Only then trust `sub` and the other claims; apply any revocation check.

![A JWT's header, payload, and signature parts, followed by the six verification steps in order; failing any of steps one to five rejects the request with 401, and only a token that passes every step lets the handler trust its claims.](jwt-structure-verification.svg)

### Attacks to know

- **`alg: none`:** an attacker sends an unsigned token with `"alg":"none"`.
  A library that honors the header accepts it. Defense: an explicit algorithm
  allowlist.
- **Algorithm confusion:** a server expects `RS256` and verifies with an RSA
  public key. An attacker crafts an `HS256` token signed using that public key
  as the HMAC secret. A naive library uses the public key as an HMAC secret
  and accepts it. Defense: fix the algorithm per key; never accept both
  symmetric and asymmetric algorithms with the same key.
- **Weak HMAC secrets:** short or guessable secrets can be brute forced
  offline from any captured token. Use at least 256 bits of randomness.
- **Missing `aud` check:** a token issued for one service is replayed against
  another that trusts the same issuer.

### Where to store tokens in the browser

| Storage | XSS exposure | CSRF exposure | Notes |
|---|---|---|---|
| `localStorage` / `sessionStorage` | Readable by any script on the page — XSS steals the token | None (not sent automatically) | Simple, but one XSS bug leaks long-lived credentials |
| In-memory JavaScript variable | Still usable by injected script while the page is open, but not persisted | None | Lost on reload; often paired with a refresh cookie |
| `HttpOnly; Secure; SameSite` cookie | Script cannot read it (XSS can still make requests while the page is open) | Sent automatically — needs `SameSite` and/or CSRF tokens | Generally the safer choice for browser apps |

A common browser pattern: keep a short-lived access token in memory and the
refresh token in an `HttpOnly` cookie scoped to the refresh endpoint.

### Access tokens, refresh tokens, and rotation

- **Access token:** short-lived (for example, 5–15 minutes), sent with every
  API request.
- **Refresh token:** longer-lived, sent **only** to the token endpoint to get
  a new access token. Store it server-side (or a hash of it) so it can be
  revoked.

**Refresh token rotation:** every refresh returns a new refresh token and
invalidates the old one. **Reuse detection:** if an already-used refresh
token is presented again, someone has a stolen copy — revoke the whole token
family and force a new sign-in.

![Sequence diagram: the client exchanges refresh token R1 for A2 and R2, an attacker then replays the stolen R1, the server detects reuse and revokes the whole family, and both the attacker and the client's next refresh with R2 get 401.](refresh-token-rotation.svg)

### Revoking JWTs

A signed token stays valid until `exp` unless the server checks something
else. Options:

- **Short expiry:** limits the window; combine with revocable refresh tokens.
- **Denylist:** store revoked `jti` values (in Redis, with TTL equal to the
  remaining lifetime) and check on each request.
- **Token version:** store `tokenVersion` on the user; put it in the token;
  increment it to invalidate every existing token ("sign out everywhere").
- **Introspection:** ask the authorization server whether a token is active
  (common with opaque tokens in OAuth).

Every option except short expiry reintroduces a lookup — the main "stateless"
advantage of JWTs shrinks once revocation is required.

### Sessions versus JWT

![Side-by-side sequence diagrams: with sessions the server stores a session ID, the browser sends it in a cookie, the server looks it up, and logout deletes it at once; with JWT the server signs a token, the client sends it as a Bearer token, the server verifies it without a lookup, and a copied token stays valid until it expires.](session-vs-token-auth.svg)

| Aspect | Server-side sessions | JWT access tokens |
|---|---|---|
| State | Stored on the server | Carried in the token |
| Revocation | Immediate (delete session) | Hard; needs short expiry, denylist, or versioning |
| Lookup per request | Yes (fast with Redis) | No (signature check only) |
| Size on the wire | Small random ID | Larger; grows with claims |
| Cross-domain / mobile / service-to-service | Awkward | Natural fit |
| Data freshness | Always current (roles read from store) | Claims stale until the token expires |
| Typical fit | Traditional web apps, same-site SPAs | Distributed APIs, mobile clients, OAuth/OIDC |

Neither is universally better. For a browser app talking to its own backend,
an `HttpOnly` session cookie is often the simplest secure option.

### CSRF with cookie-based authentication

Because browsers attach cookies automatically, a malicious site can trigger a
request to your API that carries the victim's cookie — **cross-site request
forgery (CSRF)**. Defenses:

- **`SameSite=Lax` or `Strict`** on authentication cookies blocks most
  cross-site sends.
- **CSRF tokens:** the server issues a random token (for example, in a
  readable cookie or page) and requires it in a header or form field on
  state-changing requests; a cross-site page cannot read it. The "double
  submit cookie" pattern compares a cookie value with a header value.
- **Check `Origin`** (or `Sec-Fetch-Site`) on state-changing requests.
- **Never change state on `GET`.**

Tokens sent in an `Authorization` header are not sent automatically, so they
are not vulnerable to CSRF — but they are exposed to XSS if stored in
JavaScript-readable storage.

### Logout

- **Sessions:** delete the server-side session and clear the cookie
  (`Max-Age=0` with the same `Path` and `Domain`).
- **JWT:** discard tokens on the client, revoke the refresh token on the
  server, and (if needed) denylist the current access token's `jti`.
- **Sign out everywhere:** delete all sessions for the user or bump the token
  version.

## When to use and when not to use

**Use a server-side session in an `HttpOnly` cookie when:**

- A browser app talks to its own backend on the same site.
- You need instant revocation (sign out, ban, role change).
- You want the simplest secure default with no token handling in JavaScript.

**Use JWT access tokens when:**

- Many services must verify identity without calling a central store.
- Clients are mobile apps, CLIs, or other services rather than browsers.
- You are integrating with OAuth 2.0 / OpenID Connect providers that issue
  them.

**Avoid:**

- Long-lived JWTs without refresh tokens or a revocation plan.
- Putting tokens in `localStorage` for apps that handle sensitive data.
- `SameSite=None` cookies unless the app truly needs cross-site requests.

| Scenario | Recommended | Why |
|---|---|---|
| Server-rendered site or same-site SPA | Session ID in `__Host-` cookie | Revocable, not readable by scripts |
| SPA on a different site from its API | Short access token in memory + refresh token in `HttpOnly` cookie | Limits XSS exposure while working cross-site |
| Mobile app | Access + refresh tokens in the platform's secure storage | No cookie jar; tokens sent in `Authorization` |
| Service-to-service calls | Short-lived JWT from OAuth client credentials | Verified locally; no user session involved |
| Need to kick a user out immediately | Sessions, or JWT plus a denylist check | Plain JWTs stay valid until `exp` |

## Practical examples

### Setting a secure session cookie in Express

```js
response.cookie("__Host-sid", sessionId, {
  httpOnly: true,       // not readable by JavaScript
  secure: true,         // HTTPS only (required for the __Host- prefix)
  sameSite: "lax",      // blocks most cross-site sends
  path: "/",            // required for the __Host- prefix
  maxAge: 60 * 60 * 1000, // 1 hour in milliseconds (Express converts it)
});
```

### Issuing and verifying JWTs with the `jose` library

```js
import { SignJWT, jwtVerify } from "jose";

// At least 256 bits of randomness, loaded from configuration
const secret = new TextEncoder().encode(process.env.JWT_SECRET);

export async function issueAccessToken(user) {
  return new SignJWT({ role: user.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuer("https://auth.example.com")
    .setAudience("orders-api")
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(secret);
}

export async function verifyAccessToken(token) {
  const { payload } = await jwtVerify(token, secret, {
    algorithms: ["HS256"],               // explicit allowlist
    issuer: "https://auth.example.com",
    audience: "orders-api",
    clockTolerance: 5,                   // seconds of clock skew
  });
  return payload; // { sub, role, iat, exp, iss, aud }
}
```

### Authentication middleware for Bearer tokens

```js
export async function authenticate(request, response, next) {
  const header = request.get("authorization") ?? "";
  const [scheme, token] = header.split(" ");
  // RFC 9110: a 401 response must name the expected scheme
  response.set("WWW-Authenticate", "Bearer");
  if (scheme !== "Bearer" || !token) {
    return response.status(401).json({ error: "Sign in required" });
  }
  try {
    const claims = await verifyAccessToken(token);
    request.user = { id: claims.sub, role: claims.role };
    response.removeHeader("WWW-Authenticate");
    next();
  } catch {
    response.status(401).json({ error: "Invalid or expired token" });
  }
}
```

See [authentication in Express](../express/authentication-in-express.md) and
[cookies and sessions in Express](../express/cookies-and-sessions.md) for full
wiring with `express-session` and a Redis store.

## Best practices

- Use `HttpOnly`, `Secure`, and `SameSite` on every authentication cookie;
  prefer the `__Host-` prefix.
- Generate session IDs and refresh tokens with a cryptographically secure
  random generator; store refresh tokens hashed.
- Regenerate session IDs at sign-in; enforce idle and absolute timeouts.
- Keep access tokens short-lived; rotate refresh tokens and detect reuse.
- Pin JWT algorithms, and always validate `exp`, `iss`, and `aud`.
- Keep JWT payloads small and free of sensitive data.
- Use a shared store (Redis) for sessions when running more than one instance.
- Protect cookie-authenticated, state-changing endpoints against CSRF.

## In production

- **Users are signed out at random after scaling out.** *Symptom:* sign-in
  works, then some requests return 401. *Detect:* logs show "session not
  found" on one instance for a session created on another. *Cause:* sessions
  live in process memory (`express-session`'s default `MemoryStore`, which its
  docs say is not for production). *Fix:* use a shared store such as Redis.
- **The session cookie is never set behind a proxy.** *Symptom:* sign-in
  "succeeds" but the browser has no cookie. *Detect:* no `Set-Cookie` header
  in the sign-in response. *Cause:* the cookie is marked `secure`, TLS ends at
  the load balancer, and the app sees plain HTTP, so `express-session` will
  not send it. *Fix:* `app.set("trust proxy", 1)` (or the exact number of
  proxies) so the app trusts `X-Forwarded-Proto`.
- **A cross-site SPA cannot stay signed in.** *Symptom:* sign-in works, the
  next API call returns 401. *Detect:* browser DevTools shows the cookie
  blocked because of its `SameSite` setting, or the request has no `Cookie`
  header. *Cause:* the API is on a different site, the cookie is `Lax`, or the
  client did not use `credentials: "include"`. *Fix:* serve the API from the
  same site, or use `SameSite=None; Secure` with CORS credentials enabled.
- **Valid tokens are rejected on some servers.** *Symptom:* intermittent 401s
  right after sign-in. *Detect:* errors such as `"nbf" claim timestamp check
  failed` or `"exp" claim timestamp check failed` from `jose`. *Cause:* server
  clocks drift apart. *Fix:* run NTP on every host and allow a few seconds of
  `clockTolerance`.
- **Every user is signed out after a key change.** *Symptom:* a spike of 401s
  right after a deploy. *Detect:* signature verification failures in logs.
  *Cause:* the old signing key was removed while tokens signed with it were
  still valid. *Fix:* publish old and new keys in the JWKS with different
  `kid` values, sign with the new key, and remove the old key only after the
  longest token lifetime has passed.
- **Requests fail once tokens grow.** *Symptom:* `431 Request Header Fields
  Too Large` or a 400 from the proxy for some users. *Detect:* the failing
  users have large permission lists. *Cause:* every permission was put into
  the JWT or cookie. *Fix:* keep claims small and look up detailed
  permissions on the server.

## Important terminology

- **Stateless protocol:** each request is handled independently; the server
  keeps no built-in memory of earlier requests.
- **Cookie:** a value the server asks the browser to store and send back.
- **Session:** server-side state tied to a client by a session ID.
- **Session fixation:** forcing a victim to use a session ID the attacker
  already knows.
- **JWT:** JSON Web Token; a compact, signed set of claims.
- **Claim:** a statement inside a token, such as `sub` or `exp`.
- **JWS / JWE:** signed / encrypted JSON Web Token formats.
- **JWKS:** JSON Web Key Set; published public keys for verifying tokens.
- **Bearer token:** a token that grants access to whoever holds it.
- **Refresh token rotation:** issuing a new refresh token on every use and
  invalidating the old one.
- **CSRF:** cross-site request forgery; tricking a browser into sending an
  authenticated request.
- **SameSite:** cookie attribute controlling whether cookies go on
  cross-site requests.

## Common mistakes and misconceptions

- **"JWTs are encrypted."** Signed JWTs are only encoded; anyone can read the
  payload.
- **"JWTs are always better than sessions."** They trade easy revocation for
  fewer lookups; many web apps are simpler and safer with sessions.
- **Trusting the token's `alg` header.** Always verify with a fixed algorithm
  allowlist.
- **Skipping `aud` and `iss` checks.** Tokens from the same issuer for another
  service will be accepted.
- **Long-lived access tokens** (days or weeks) with no revocation strategy.
- **Storing long-lived tokens in `localStorage`.** Any XSS bug leaks them.
- **Setting `Domain` unnecessarily**, which shares the cookie with every
  subdomain.
- **Using `SameSite=None` without need**, which reopens CSRF exposure.
- **Not regenerating the session ID on sign-in**, enabling session fixation.
- **Logging out only on the client** while the server still accepts the
  session or refresh token.

## Revision questions

1. Why does a backend need sessions or tokens at all if the user already
   signed in?
2. Explain `HttpOnly`, `Secure`, and each `SameSite` value. Which threat does
   each address?
3. What are the three parts of a JWT, and why is its payload not secret?
4. Describe the `alg: none` and algorithm-confusion attacks and how to
   prevent them.
5. How do refresh token rotation and reuse detection limit the damage of a
   stolen refresh token?
6. Compare server-side sessions and JWTs for revocation, scalability, and
   freshness of user data.

## Further learning

- [MDN: Using HTTP cookies](https://developer.mozilla.org/en-US/docs/Web/HTTP/Cookies)
- [MDN: Set-Cookie header](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie)
- [RFC 6265: HTTP State Management Mechanism](https://www.rfc-editor.org/rfc/rfc6265)
- [RFC 7519: JSON Web Token](https://www.rfc-editor.org/rfc/rfc7519)
- [RFC 8725: JWT Best Current Practices](https://www.rfc-editor.org/rfc/rfc8725)
- [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- [OWASP Cross-Site Request Forgery Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
- Related notes: [Authentication and authorization](authentication-and-authorization.md),
  [OAuth 2.0, OpenID Connect, and SSO](oauth-and-openid-connect.md)
