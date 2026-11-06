# Browser DevTools Overview

Browser Developer Tools (DevTools) are built-in tools for inspecting a page,
its code, network activity, browser storage, and performance. The names and
exact features can differ slightly between browsers.

## Why developers use DevTools

The tools show what the browser actually received and executed. This is often
more useful than guessing from source code: a request may fail, a CSS rule
may be overridden, or a stale service worker may serve an old file.

## How to open and navigate

In Chrome and Edge, common shortcuts are `F12` or `Ctrl+Shift+I` on Windows
and Linux, and `Cmd+Option+I` on macOS. You can also use the browser menu.
Right-clicking an element and choosing **Inspect** opens the Elements panel
near that element.

| Panel | Useful for |
|---|---|
| Elements | Inspecting DOM nodes, computed styles, and layout |
| Console | Reading errors, warnings, and running small expressions |
| Network | Inspecting requests, responses, headers, and timing |
| Application | Examining storage, cookies, and service workers |
| Performance | Recording runtime activity and diagnosing slow interactions |
| Sources | Setting breakpoints and stepping through JavaScript |

## A practical debugging workflow

1. Reproduce the problem and note the page URL and user action.
2. Check Console for errors and Network for failed or unexpected requests.
3. Inspect the element or stored data related to the behavior.
4. Record Performance only when you have a performance question.
5. Change one thing, repeat the same action, and compare the result.

## Developer perspective and terminology

Use a local development environment when possible. DevTools can change page
state, disable cache, emulate conditions, and expose private data. A
**breakpoint** pauses execution; **computed style** is the final style after
the cascade; **waterfall** visualizes request timing.

## Common misconceptions

- A clean Console does not prove that the page is correct.
- DevTools emulation is helpful but does not perfectly reproduce every
  physical device or network.
- Do not share screenshots, HAR files, or Console output without checking for
  tokens and personal data.

## Check your understanding

1. Which panel should you open first for a failed API request?
2. What is the difference between source CSS and computed style?
3. Why should a captured network log be treated carefully?

## Further learning

- [Chrome DevTools documentation](https://developer.chrome.com/docs/devtools/)
- [Microsoft Edge DevTools documentation](https://learn.microsoft.com/en-us/microsoft-edge/devtools-guide-chromium/)
