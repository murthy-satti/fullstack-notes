# JavaScript Browser Input, Output, and Debugging

Browser JavaScript can gather simple input, update page content, and report
diagnostic information. This lesson covers built-in dialogs and the console;
real applications should usually use accessible HTML controls instead of
blocking dialogs.

## Input dialogs

```js
const answer = window.prompt("What is your name?");
if (answer !== null) {
  console.log(`Hello, ${answer}`);
}
```

`prompt()` returns a string or `null` if cancelled. `confirm()` returns a
boolean. `alert()` displays a message. These dialogs are synchronous and
block interaction with the page while open; they are mainly useful in small
demos or experiments.

## Console API methods

The Console API writes diagnostic information to the developer console.
Browser presentation, filtering, and a few extensions can differ. These
methods are useful during development, but production applications should
use an intentional logging strategy.

### Logging levels

| Method | Use |
|---|---|
| `console.debug(...values)` | Detailed debugging output; may be filtered by default |
| `console.log(...values)` | General diagnostic output |
| `console.info(...values)` | Informational message |
| `console.warn(...values)` | Warning that deserves attention |
| `console.error(...values)` | Error diagnostic; does not itself throw an exception |

```js
console.debug("Selected item:", item);
console.info("Request completed");
console.warn("Using a fallback value");
console.error("Could not load profile", error);
```

### Inspect values and collections

| Method | Use |
|---|---|
| `console.table(data, columns?)` | Display suitable arrays or objects as a table |
| `console.assert(condition, ...values)` | Log a message if the condition is falsy; it does not stop execution |
| `console.trace(...values)` | Log a stack trace from the call site |

```js
console.table(
  [{ name: "Notebook", price: 4 }, { name: "Pen", price: 2 }],
  ["name", "price"],
);
console.assert(items.length > 0, "Expected at least one item");
```

The exact object-inspection interface depends on the browser DevTools. Do
not assume logged objects are immutable snapshots; consoles may show their
current state when expanded.

### Groups and counters

| Method | Use |
|---|---|
| `console.group(...label)` | Start an expanded nested group |
| `console.groupCollapsed(...label)` | Start a collapsed nested group |
| `console.groupEnd()` | Close the current group |
| `console.count(label?)` | Log and increment a counter for a label |
| `console.countReset(label?)` | Reset a counter |

```js
console.group("Form submission");
console.count("attempt");
console.log("Validating fields");
console.groupEnd();
```

Groups can be nested. Keep labels consistent when incrementing and resetting
counters; omitted labels use a default counter.

### Timing and timestamps

| Method | Use |
|---|---|
| `console.time(label?)` | Start a timer |
| `console.timeLog(label?, ...values)` | Log elapsed time without ending the timer |
| `console.timeEnd(label?)` | Log elapsed time and end the timer |
| `console.timeStamp(label?)` | Add a timestamp marker where supported by DevTools |

```js
console.time("load");
await loadData();
console.timeLog("load", "data received");
renderData();
console.timeEnd("load");
```

Timers use labels and are intended for lightweight diagnostics, not
repeatable benchmarking. Use the Performance panel or a benchmark harness
for deeper measurement. `timeStamp()` support and its appearance depend on
the browser's developer tools.

### Other useful behavior

`console.clear()` clears the visible console when allowed by the
environment; DevTools may preserve messages or ignore clearing according to
user settings. Console format strings commonly support substitutions such
as `%s` (string), `%d`/`%i` (integer), `%f` (number), `%o`/`%O` (object
inspection), and `%c` (CSS styling), with browser-specific details:

```js
console.log("User %s has %d messages", "Mina", 3);
console.log("%cDevelopment only", "color: purple; font-weight: bold");
```

Do not use formatting as a way to insert untrusted content into page HTML;
console output is diagnostic, not rendered page content.

For timing, use `console.time()`, `console.timeLog()`, and
`console.timeEnd()` with the same label. These are useful quick checks, not
a replacement for a browser Performance recording or a benchmark. Methods
such as `console.profile()` are DevTools-specific and are intentionally not
part of this core list.

## Display output to users

The console is for developers, not page visitors. Use DOM text such as
`element.textContent = value` for plain text. `innerHTML` parses markup and
must not receive untrusted strings directly.

## Developer perspective

Use browser DevTools breakpoints, the Console, and the Performance panel
when debugging or profiling. Do not leave sensitive personal data in
production logs. For output to the page, use semantic HTML, labels, and
accessible status messages.

## Common misconceptions

- `console.log` does not display text in the page UI.
- `prompt` does not return a number; it returns text or `null`.
- `console.error` logs a message; it does not throw an exception by itself.
- `console.assert` logs when its condition fails; it is not an assertion that
  terminates the program.
- `console.time` is not a substitute for a proper profiling workflow.
- `innerHTML` parses markup and must not receive untrusted content directly.

## Further learning

- [MDN: `window.prompt`](https://developer.mozilla.org/en-US/docs/Web/API/Window/prompt)
- [MDN: Console API](https://developer.mozilla.org/en-US/docs/Web/API/Console_API)
- [MDN: Console instance methods](https://developer.mozilla.org/en-US/docs/Web/API/console)
- [MDN: `Node.textContent`](https://developer.mozilla.org/en-US/docs/Web/API/Node/textContent)
