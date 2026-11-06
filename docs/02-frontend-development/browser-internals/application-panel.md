# The Browser Application Panel

The Application panel inspects data and web platform features associated
with a site. In Chromium-based DevTools, it includes storage, cookies,
IndexedDB, cache storage, and service workers.

## Why it matters

Persistent browser data can explain why a page remembers a session, shows
stale information, or behaves differently after deployment. The panel helps
inspect that state while debugging.

## Important storage types

| Storage | Typical lifetime and use |
|---|---|
| `localStorage` | String key/value data retained across browser sessions |
| `sessionStorage` | String key/value data scoped to a tab's page session |
| Cookies | Small values sent with matching HTTP requests, subject to attributes |
| IndexedDB | Structured, larger client-side data |
| Cache Storage | Request/response entries commonly managed by service workers |

These are not interchangeable. Data can be partitioned or restricted by
browser privacy settings, origin, and security attributes.

## Practical debugging workflow

Inspect the relevant storage entry, confirm its origin and expiry, and then
reproduce the behavior. **Clear site data** can help test a first visit, but
it deletes state and may sign you out; use it deliberately. Inspect service
worker registration and cache contents when an older application build keeps
appearing.

## Developer perspective and terminology

Cookies can have security attributes such as `Secure`, `HttpOnly`, and
`SameSite`; these have different purposes. JavaScript cannot read an
`HttpOnly` cookie, although browser DevTools can display cookie metadata.
**Origin** is the scheme, host, and port tuple; **service worker** is a
programmable browser worker that can mediate requests and support offline
behavior.

## Common misconceptions

- `localStorage` is not a secure location for secrets.
- Clearing storage may remove login or offline data.
- A service worker cache is separate from the ordinary HTTP cache.

## Further learning

- [Chrome DevTools: Application panel](https://developer.chrome.com/docs/devtools/application/)
- [MDN: Web Storage API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API)
