# Browser Internals Interview Questions and Answers

These questions review browser behavior and practical use of developer
tools. Exact interface names may vary slightly between browsers.

## Rendering and runtime

### 1. What happens after a browser receives HTML?

The browser parses HTML into a DOM, processes CSS into style information,
calculates layout, paints pixels, and composites layers. Scripts and
resource loading can affect this process; browsers optimize and interleave
work rather than following one rigid sequence for every page.

### 2. What is the DOM?

The DOM is the browser's object model for a document. JavaScript can query,
change, create, and remove nodes through DOM APIs.

### 3. What is the difference between the DOM and CSSOM?

The DOM represents document structure and content. The CSS Object Model
(CSSOM) represents CSS rules and style information. The browser combines
them when calculating how elements should be displayed.

### 4. What is the browser event loop?

It coordinates JavaScript jobs, tasks, microtasks, and rendering
opportunities. Promise reactions are microtasks; timers are tasks. Long
synchronous work can delay input handling and rendering.

## Network and browser security

### 5. How can DevTools help diagnose a failed request?

The Network panel shows requests, status codes, timing, headers, payloads,
and response information. Check the URL, method, status, console messages,
and whether the browser blocked access due to policy or connectivity.

### 6. What is the same-origin policy?

It is a browser security model that restricts how a document or script can
interact with resources from a different origin. An origin is the
combination of scheme, host, and port.

### 7. What is CORS?

Cross-Origin Resource Sharing is a mechanism by which a server can use
HTTP headers to allow selected cross-origin browser requests to be read.
CORS is enforced by browsers and is not a replacement for server
authentication or authorization.

### 8. What is the difference between cookies and Web Storage?

Cookies can be sent automatically with matching HTTP requests and can have
server-set security attributes. `localStorage` and `sessionStorage` are
JavaScript-accessible string storage and are not automatically attached to
requests.

## DevTools

### 9. What is the Console panel used for?

It displays logs, warnings, and errors; lets developers run JavaScript in
the page context; and can help inspect values. Avoid exposing secrets or
sensitive user data in production logs.

### 10. What can the Application panel help inspect?

Depending on the browser, it can inspect storage such as cookies,
local/session storage, IndexedDB, cache storage, and service workers.
Stored values may be sensitive, so protect user accounts and devices.

### 11. What is the Performance panel used for?

It records runtime activity such as scripting, rendering, layout, and
painting over time. It helps locate main-thread work and performance
bottlenecks; use representative conditions when profiling.

### 12. How would you investigate a slow page?

Reproduce the slowdown, use Network to inspect resource sizes and timing,
then record a Performance trace to locate long tasks, expensive scripts,
layout work, or rendering delays. Change one likely cause at a time and
measure again.

## Further learning

- [Browser Internals overview](../browser-internals.md)
- [MDN: Critical rendering path](https://developer.mozilla.org/en-US/docs/Web/Performance/Guides/Critical_rendering_path)
- [MDN: Same-origin policy](https://developer.mozilla.org/en-US/docs/Web/Security/Same-origin_policy)
- [Chrome DevTools documentation](https://developer.chrome.com/docs/devtools/)
