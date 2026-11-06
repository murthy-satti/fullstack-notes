# Asynchronous JavaScript

Asynchronous JavaScript lets a program start work that may take time—such as
a network request—without blocking all other browser activity while waiting.

## Why it matters

Waiting synchronously for a slow response would make a page feel frozen.
Promises and `async`/`await` let code describe how to continue after work
finishes and how to handle failure.
For callback-based APIs and timers such as `setTimeout`, first see
[callbacks, timers, and callback hell](callbacks-and-timers.md).

## How it works

A Promise represents a result that may be fulfilled or rejected later.
`async` functions always return a Promise; `await` pauses that function until
the awaited Promise settles, without blocking the browser's whole JavaScript
thread. Browser tasks, promise callbacks, and rendering are scheduled by the
event loop.

## Practical example

```js
async function loadProfile(userId) {
  const response = await fetch(`/api/users/${userId}`);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return response.json();
}

loadProfile("42")
  .then((profile) => console.log(profile))
  .catch((error) => console.error("Could not load profile", error));
```

`fetch` does not reject solely because the server returned an HTTP error such
as 404; check `response.ok` or the status.

## Developer perspective and terminology

Show loading, success, empty, and error states in the interface. Consider
cancellation or stale responses when users can start a new request before an
old one completes. **Promise** represents eventual completion; **event loop**
coordinates queued work; **race condition** is behavior affected by the order
in which operations complete.

## Common misconceptions

- `await` does not make a network request instantaneous or block all browser
  work.
- A rejected Promise should be handled at an appropriate boundary.
- `Promise.all` rejects if one of its input Promises rejects; use other
  combinators when partial results are required.

## Further learning

- [MDN: Promises](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Using_promises)
- [MDN: Using `fetch`](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch)
