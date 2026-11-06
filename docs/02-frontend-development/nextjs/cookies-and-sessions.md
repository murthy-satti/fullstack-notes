# Cookies and Sessions in Next.js

A cookie is a small value the browser stores and may send with matching
requests. A session is server-managed authenticated state associated with a
user. Cookies often carry an opaque session identifier, while the actual
session data remains on the server.

## Cookie attributes

| Attribute | Purpose |
|---|---|
| `HttpOnly` | Prevents JavaScript from reading the cookie through `document.cookie` |
| `Secure` | Sends the cookie only over HTTPS, except local development behavior may differ |
| `SameSite` | Controls cross-site sending behavior: `Strict`, `Lax`, or `None` |
| `Path` | Limits which URL paths receive the cookie |
| `Domain` | Controls eligible hosts; omit it when host-only behavior is desired |
| `Max-Age` | Lifetime in seconds |
| `Expires` | Absolute expiry date |

`SameSite=None` generally requires `Secure`. Cookie rules and browser privacy
behavior can change; use HTTPS in production and test the actual browsers.

## Reading and writing cookies

In Next.js 15 and later, `cookies()` is asynchronous. Reading cookies
is request-specific and may affect whether a route can be statically
rendered. Cookie writes are allowed in supported mutation contexts such as a
Server Action or Route Handler, not during ordinary Server Component
rendering.

```tsx
import { cookies } from "next/headers";

export async function GET() {
  const cookieStore = await cookies();
  const theme = cookieStore.get("theme")?.value ?? "system";
  return Response.json({ theme });
}
```

In a Server Action or Route Handler, a cookie can be set using the API
supported by the installed version:

```ts
const cookieStore = await cookies();
cookieStore.set("session", sessionId, {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
  maxAge: 60 * 60 * 24,
});
```

This illustrates attributes, not a complete authentication implementation.
Do not generate session IDs with weak randomness or store sensitive identity
data directly in a client-readable cookie.

In Next.js 14 and earlier, `cookies()` was synchronous. Next.js 15 provided
a synchronous compatibility path during migration, but current code should
use `await cookies()` and follow the installed version's API documentation.
With newer Cache Components configurations, reading request-time cookies can
also require a Suspense boundary or a different rendering design.

## Session security

- Use a maintained authentication/session library where appropriate.
- Use unpredictable session identifiers and rotate or invalidate them when
  security-sensitive events occur.
- Check authentication and authorization on every protected server action
  and data access.
- Use `HttpOnly`, `Secure`, and a deliberate `SameSite` policy for session
  cookies.
- Consider CSRF protections for state-changing requests.
- Never treat a client-provided user ID or hidden form value as proof of
  identity.

## Developer perspective and terminology

**Cookie** is browser-managed request state; **session** is authenticated
state associated with the user; **session fixation** is an attack involving
reuse of a known session identifier; **CSRF** induces a browser to send an
unwanted authenticated request.

## Common misconceptions

- `HttpOnly` reduces script access but does not stop all XSS consequences.
- `Secure` does not encrypt data at rest in browser storage.
- Cookies are sent automatically under matching rules, so cookie-based
  authentication needs CSRF-aware design.
- `cookies()` usage can make output depend on each request.

## Check your understanding

1. What does `HttpOnly` prevent?
2. How do a session and a cookie differ?
3. Why is cookie-based authentication relevant to CSRF?

## Further learning

- [Next.js: `cookies`](https://nextjs.org/docs/app/api-reference/functions/cookies)
- [MDN: HTTP cookies](https://developer.mozilla.org/en-US/docs/Web/HTTP/Cookies)
- [OWASP: Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
