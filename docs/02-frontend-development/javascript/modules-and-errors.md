# JavaScript Modules and Error Handling

Modules divide JavaScript into files with explicit imports and exports. Error
handling makes failures visible and gives an application a controlled way to
respond.

## ES module exports and imports

```js
// format.js
export function formatPrice(amount) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

export const currency = "USD";
```

```js
import { currency, formatPrice } from "./format.js";
import defaultFormatter from "./default-formatter.js";

console.log(formatPrice(12.5), currency);
```

Named imports use the exported name, unless renamed with `as`. A module may
also have one default export:

```js
export default function formatDate(date) {
  return date.toLocaleDateString();
}
```

Modules have their own scope. In a browser without a bundler, load a module
with `<script type="module" src="/main.js"></script>`. Modules are deferred
by default and use strict mode.

## Dynamic imports

`import()` loads a module asynchronously and returns a Promise. It is often
used to split code that is not needed immediately:

```js
const button = document.querySelector("#edit");

if (button) {
button.addEventListener("click", async () => {
  const { openEditor } = await import("./editor.js");
  openEditor();
});
}
```

## Exceptions and handling

Throw an `Error` for a failure that the current function cannot resolve.
Catch errors where the application can respond meaningfully, such as a UI
boundary or request handler. A `finally` block runs whether the operation
succeeded or failed.

```js
async function loadProfile() {
  try {
    const response = await fetch("/api/profile");
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error("Could not load profile", error);
    throw error;
  }
}
```

Logging and rethrowing is appropriate when adding context for a higher-level
handler; avoid logging the same failure repeatedly at every layer.

## Developer perspective and terminology

Organize modules around cohesive responsibilities and keep imports explicit.
**Named export** is imported by name; **default export** is the module's
primary export; **exception** is an error value thrown during execution;
**dynamic import** loads a module asynchronously.

## Common misconceptions

- Importing a module does not make its values global.
- Catching an error and doing nothing hides failures.
- A `try` block does not catch a rejected Promise unless the Promise is
  awaited there or has a rejection handler.
- `finally` is not a place to return a second result that accidentally
  overrides the original return or exception.

## Further learning

- [MDN: JavaScript modules](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules)
- [MDN: Control flow and error handling](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Control_flow_and_error_handling)
