# The Browser Console Panel

The Console displays JavaScript errors, warnings, and log messages. It can
also run expressions in the context of the current page, making it useful for
quick investigation.

## Why it matters

Errors often include a message, source location, and stack trace. These
details help identify where a failure occurred and which sequence of calls
led to it.

## How to use it

- Reproduce the behavior and look for errors at the time it occurs.
- Expand the stack trace and open the source location.
- Filter by level or text to focus on relevant messages.
- Use `console.debug`, `console.info`, `console.warn`, and `console.error`
  to communicate the intended diagnostic level.
- Use `console.table()` for arrays of similarly shaped objects.
- Clear or preserve messages when needed; browser options and shortcuts vary.
- In the Console prompt, inspect page values carefully and avoid changing
  production data.

The Console API also includes `assert`, `dir`, `dirxml`, `trace`, nested
`group` methods, `count` counters, and `time` timers. See the JavaScript
[Console API lesson](../javascript/browser-input-output-and-debugging.md)
for the method reference and examples. DevTools adds interface features
such as filtering, live expressions, source links, and preservation of
messages; those controls vary by browser.

## Practical example

```js
const products = [
  { name: "Notebook", price: 4 },
  { name: "Pen", price: 2 },
];

console.table(products);
```

In application code, use structured logging that can be removed or controlled
for production rather than leaving noisy debug output everywhere.

## Developer perspective and terminology

Read the first useful application frame in a stack trace and inspect the
values passed into that function. **Stack trace** is a record of nested calls;
**source map** connects built code back to original source; **exception** is
an error thrown during execution.

Do not paste commands into a Console unless you understand what they do:
Console code runs with the permissions of the page and may access account
data.

## Common misconceptions

- A warning is not always harmless; understand its source before ignoring it.
- The Console is not a substitute for automated tests.
- A runtime error may be caused by data or timing, not only syntax.

## Further learning

- [Chrome DevTools: Console overview](https://developer.chrome.com/docs/devtools/console/)
- [Chrome DevTools: Console features reference](https://developer.chrome.com/docs/devtools/console/reference/)
- [MDN: Console API](https://developer.mozilla.org/en-US/docs/Web/API/console)
