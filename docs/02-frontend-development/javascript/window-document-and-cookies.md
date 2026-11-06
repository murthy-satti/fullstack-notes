# JavaScript `window`, `document`, and Cookies

The browser exposes objects that connect scripts to a page and its
browsing context. `window` represents the current browser window/global
context; `document` represents the loaded page. Cookies are small values
associated with web requests and have important security rules.

## `window` and `globalThis`

In a browser page, `window` represents the browsing context and is also the
traditional global object. `globalThis` is the environment-neutral way to
refer to the global object. Some browser globals, such as `document`, can
also be accessed as `window.document`.

The Window interface is large and browser-dependent. These are the
important APIs commonly used in frontend development, not every property.

| API/property | Common use |
|---|---|
| `window.location` | Read the current URL; set `href` to navigate |
| `window.history` | Navigate history or manage same-document URLs with `pushState()` and `replaceState()` |
| `window.document` | Access the current page DOM |
| `window.navigator` | Access browser capabilities; see [Navigator and device APIs](navigator-and-device-apis.md) |
| `window.addEventListener()` | Listen for events such as `resize`, `online`, or `offline` |
| `window.setTimeout()` / `clearTimeout()` | Schedule or cancel a delayed callback |
| `window.setInterval()` / `clearInterval()` | Schedule or cancel repeated callbacks |
| `window.requestAnimationFrame()` | Schedule visual work before a repaint |
| `window.fetch()` | Make an HTTP request |
| `window.localStorage` / `sessionStorage` | Store same-origin string data |
| `window.innerWidth` / `innerHeight` | Read viewport dimensions in CSS pixels |
| `window.scrollTo()` / `scrollBy()` | Change the document scroll position |
| `window.matchMedia()` | Check a media query or user preference |
| `window.alert()` / `confirm()` / `prompt()` | Show simple blocking dialogs, mainly for demos |

`pushState()` changes the URL and history entry without loading a new
document; the application must render matching content and handle
back/forward navigation. Use CSS media queries for layout breakpoints, and
use `requestAnimationFrame()` for visual updates. Timers are not precise
clocks. Browser globals are not available in every JavaScript runtime.

## `document`

`document` provides access to the page and its DOM, including
`document.title`, `document.body`, `document.forms`, and selectors such as
`document.querySelector()`. Common properties and methods include:

| API/property | Common use |
|---|---|
| `document.documentElement`, `document.head`, `document.body` | Access root, head, and body elements |
| `document.title` | Read or set the page title |
| `document.forms`, `document.images` | Access collections of document elements |
| `getElementById()`, `querySelector()`, `querySelectorAll()` | Find elements |
| `createElement()` | Create a DOM element |
| `visibilityState`, `visibilitychange` | Detect when the page is visible |
| `cookie` | Read/write cookies available to JavaScript; see cookie security below |

`document.write()` is a legacy API that can replace or interfere with a
document during parsing; do not use it for ordinary DOM updates. Use DOM
APIs instead. See [DOM navigation and updates](dom-navigation-and-updates.md).

## Cookies

Cookies are set by servers with the `Set-Cookie` response header and sent
back by browsers when their scope and request rules match. A page may read
and write some cookies through `document.cookie`, but this interface is a
string containing visible cookie pairs, not a normal object.

Security-relevant cookie attributes include:

- `HttpOnly`: prevents JavaScript access through `document.cookie`.
- `Secure`: sends the cookie only over HTTPS.
- `SameSite`: controls cross-site sending behavior.
- `Path`, `Domain`, and expiry/`Max-Age`: scope and lifetime controls.

JavaScript cannot set `HttpOnly`; configure it in the server's
`Set-Cookie` response. Session identifiers should generally be protected
with appropriate server-set attributes and server-side authorization.

## Developer perspective and misconceptions

Do not store secrets in browser-readable cookies or local storage without
understanding the threat model. `HttpOnly` reduces script access to a
cookie but does not stop all request forgery or fix XSS. Cookie rules,
SameSite defaults, and partitioning behavior vary with browsers and
deployment; follow current standards and security guidance.

## Check your understanding

1. How does `document` differ from `window`?
2. What does `HttpOnly` prevent?
3. Can JavaScript set the `HttpOnly` attribute?
4. Does an HttpOnly cookie remove the need for other security controls?

## Further learning

- [MDN: Window](https://developer.mozilla.org/en-US/docs/Web/API/Window)
- [MDN: Document](https://developer.mozilla.org/en-US/docs/Web/API/Document)
- [MDN: Using HTTP cookies](https://developer.mozilla.org/en-US/docs/Web/HTTP/Cookies)
- [OWASP: Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
