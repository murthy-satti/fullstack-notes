# JavaScript JSON and Fetch API Data

JSON is a text format commonly used to exchange structured data. The Fetch
API sends HTTP requests and exposes the response asynchronously through
Promises.

## JSON conversion

`JSON.stringify(value)` converts compatible JavaScript values to JSON text.
`JSON.parse(text)` parses JSON text into JavaScript values and throws a
`SyntaxError` when the text is invalid.

```js
const payload = JSON.stringify({ topic: "JavaScript", complete: true });
const value = JSON.parse(payload);
```

JSON does not represent every JavaScript value. For example, functions and
`undefined` are not preserved as ordinary JSON values. Validate parsed data:
valid JSON is not necessarily the shape or content your application expects.

## Fetch a response

```js
async function loadTopics() {
  const response = await fetch("/api/topics");

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  const data = await response.json();
  if (!Array.isArray(data)) {
    throw new Error("Expected an array of topics");
  }
  return data;
}
```

`fetch()` resolves to a `Response` when an HTTP response arrives, including
many error statuses such as 404 or 500. Check `response.ok` or `status`.
Network failures and aborts reject. Reading a body with `json()` is also
asynchronous and can fail if it is not valid JSON.

## Send JSON

```js
const response = await fetch("/api/topics", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ title: "Learn fetch" }),
});
```

Choose the HTTP method and headers for the API contract. Handle errors,
loading state, cancellation, and stale responses where needed. Never assume
browser input is trusted; the server must validate and authorize requests.

## Display returned data safely

Use DOM text APIs such as `textContent` for plain text. Do not insert
untrusted API strings with `innerHTML`. Handle empty results and failures
with useful, accessible interface states.

## Common misconceptions

- `response.json()` does not return an already-parsed value synchronously.
- A 404 response usually does not cause `fetch()` itself to reject.
- Valid JSON does not guarantee valid application data.
- CORS and authentication rules can affect whether a browser can read a
  response.

## Further learning

- [MDN: Fetch API](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API)
- [MDN: Using Fetch](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch)
- [MDN: JSON](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON)
