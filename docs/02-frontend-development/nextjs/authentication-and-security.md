# Authentication and Security in Next.js

Authentication establishes who a user is. Authorization decides what that
user is allowed to do. A Next.js application often combines browser UI,
server-rendered routes, and server-side handlers, so security checks must be
made at the data and action boundaries.

## Secure application flow

1. Authenticate a user through a well-reviewed identity solution.
2. Store and manage session credentials using an appropriate secure design.
3. On each protected server operation, verify the session.
4. Check whether the user is authorized for the specific resource and action.
5. Return only the data that the user is allowed to receive.

Middleware or layout redirects can improve navigation, but should not be the
only protection. Route Handlers, Server Actions, and data access code must
enforce authorization too.

## Security practices

- Keep private keys and server-only credentials out of client bundles.
- Validate all inputs on the server and encode output for its context.
- Use framework and library guidance for session and cookie attributes.
- Protect state-changing requests against relevant CSRF risks.
- Avoid exposing detailed internal errors to users.
- Keep dependencies and framework versions maintained.

## Developer perspective and terminology

**Authentication** verifies identity; **authorization** decides permissions;
**session** represents authenticated state across requests; **CSRF** tricks a
browser into making an unwanted authenticated request.

## Common misconceptions

- Hiding a link or button is not access control.
- A client component is not a place to keep secrets.
- Middleware checks do not replace checks at the protected operation.
- A successful login does not mean every resource is accessible.

## Further learning

- [Next.js: Authentication](https://nextjs.org/docs/app/guides/authentication)
- [OWASP: Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- [OWASP: Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)
