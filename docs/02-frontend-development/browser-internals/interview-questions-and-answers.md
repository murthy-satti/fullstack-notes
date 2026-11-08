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

## Scenario questions

### 13. A page is blank for several seconds, but the server returns HTML quickly. How do you investigate?

Start with the Network panel: check whether scripts or styles are slow, blocked, or unusually large, and whether the document waits on a long request. Then record a Performance trace to see whether parsing, JavaScript execution, style calculation, or rendering blocks the main thread. Check the Console for runtime errors and compare a cold load with a warm load. Fix the measured bottleneck; a fast document response alone does not prove the page is ready to use.

### 14. A button responds slowly even though its click handler looks small. What could be delaying it?

The handler may trigger expensive synchronous work, or earlier long tasks may prevent the event from being handled promptly. Record a trace, inspect main-thread tasks around the interaction, and use the Long Tasks or Event Timing information available in the browser. Split CPU-heavy work into smaller chunks or move suitable computation to a worker; avoid repeatedly forcing layout by alternating DOM writes and geometry reads.

### 15. An API works in an API client but fails in the browser with a CORS message. What do you check?

Inspect the browser Network entry and Console message. Determine whether the browser sent an `OPTIONS` preflight and whether the response allows the requested origin, method, and headers. For credentialed requests, confirm the server returns a specific allowed origin and `Access-Control-Allow-Credentials: true`; wildcard origin cannot be used with credentials. CORS controls browser access to a response and does not replace server-side authentication or authorization.

### 16. A user reports that a saved preference disappears after restarting the browser. How do you debug it?

First identify where the preference is written and what persistence lifetime is intended. Inspect the relevant Application panel storage and check whether code clears it on startup, whether the value is stored in session-only storage, and whether the origin changed. Also inspect failed storage operations and private-browsing or quota conditions. Do not put sensitive credentials in JavaScript-readable storage just to make them persistent.

### 17. A service worker deployment appears to keep serving an old interface. What do you investigate?

Inspect the registered service worker, its lifecycle state, controlled clients, and Cache Storage entries. Verify the new worker installs and activates, and review its update and cache-version strategy. Existing tabs can remain controlled by an older worker until clients are replaced or the lifecycle advances. Provide a deliberate cache invalidation path and test updates with an existing open tab as well as a clean profile.

## Further learning
