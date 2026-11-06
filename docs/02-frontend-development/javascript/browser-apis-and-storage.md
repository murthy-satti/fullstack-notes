# Browser APIs and Client-Side Storage

The browser provides APIs that JavaScript can use for tasks such as network
requests, navigation, timers, storage, and offline behavior. These APIs are
host features; they are not all part of the JavaScript language itself.

## Fetching data

`fetch()` sends an HTTP request and returns a Promise. Check the response
status and validate data before relying on its shape. Handle network and
parsing failures at a useful boundary.
For detailed JSON parsing, request options, response handling, and safe
rendering of API data, see
[JSON and Fetch API data](json-and-fetch.md). For cookies and the browser's
`window` and `document` objects, see
[window, document, and cookies](window-document-and-cookies.md).

## Choosing browser storage

| Mechanism | Typical use | Important limit |
|---|---|---|
| `localStorage` | Small string preferences that persist | Synchronous; readable by same-origin JavaScript |
| `sessionStorage` | Short-lived per-tab state | Usually removed when the page session ends |
| IndexedDB | Larger structured client-side data | Async API with more involved data modeling |
| Cookies | Values sent with matching HTTP requests | Must consider size, scope, expiry, and security attributes |

Never store passwords, private keys, or sensitive bearer tokens in
JavaScript-readable storage without a deliberate security design. Any
same-origin script can access local and session storage.

## Practical example

```js
async function loadArticles() {
  const response = await fetch("/api/articles");
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  const data = await response.json();
  if (!Array.isArray(data)) {
    throw new Error("Unexpected articles response");
  }
  return data;
}
```

## Developer perspective and terminology

Use the smallest storage mechanism that fits the data and threat model.
**Origin** scopes many browser capabilities; **persistence** describes how
long data remains; **same-origin script** is JavaScript executing with the
page's origin privileges.

## Common misconceptions

- `fetch` does not throw just because the server returned a 404 or 500.
- Local storage is not encrypted secret storage.
- Browser APIs vary in availability and permission requirements.

## Check your understanding

1. Why should a frontend check `response.ok`?
2. Which storage is suitable for larger structured records?
3. Why is local storage unsafe for secrets in many threat models?

## Further learning

- [MDN: Fetch API](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API)
- [MDN: Web Storage API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API)
- [MDN: IndexedDB API](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)
