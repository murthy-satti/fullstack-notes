# JavaScript Callbacks and Timers

A callback is a function passed to other code so that code can call it at
the appropriate time. Callbacks are common in event listeners, array
methods, timers, and many browser APIs.

## Callback example

```js
function loadMessage(onSuccess) {
  setTimeout(() => {
    onSuccess("The message is ready");
  }, 500);
}

loadMessage((message) => console.log(message));
```

Callbacks can run immediately or later. Do not assume a callback is
synchronous unless the API documents that behavior.

## Timers

| API | Behavior |
|---|---|
| `setTimeout(callback, delay)` | Schedules a callback no earlier than a delay |
| `clearTimeout(id)` | Cancels a pending timeout |
| `setInterval(callback, delay)` | Repeatedly schedules callbacks |
| `clearInterval(id)` | Cancels a repeating timer |

```js
const timerId = setTimeout(() => {
  console.log("The timer became eligible");
}, 1000);

clearTimeout(timerId);
```

Timers are scheduling requests, not precise clocks: the callback runs only
when the event loop can process it, and delays may be clamped by the
browser. Avoid intervals that can overlap long-running async work; schedule
the next timeout after each operation when sequential execution is needed.

## Callback nesting and callback hell

Several dependent asynchronous operations can become deeply nested:

```js
loadUser((user) => {
  loadOrders(user.id, (orders) => {
    loadRecommendations(orders, (items) => show(items));
  });
});
```

This is often called **callback hell** because nesting obscures control
flow and error handling. Promises and `async`/`await` can express the same
sequence more clearly; see [Promises and async/await](async-javascript.md).

## Developer perspective and misconceptions

Callbacks are still useful and not inherently bad. Use them for event
listeners and APIs designed around callbacks. Choose Promises for
composable asynchronous results. A zero-delay timer still runs later, not
immediately.

## Check your understanding

1. What is a callback?
2. Does `setTimeout(fn, 0)` run `fn` immediately?
3. Why can deeply nested callbacks be difficult to maintain?
4. Which APIs cancel a timeout and an interval?

## Further learning

- [MDN: Functions as callbacks](https://developer.mozilla.org/en-US/docs/Glossary/Callback_function)
- [MDN: `setTimeout`](https://developer.mozilla.org/en-US/docs/Web/API/Window/setTimeout)
- [MDN: `setInterval`](https://developer.mozilla.org/en-US/docs/Web/API/Window/setInterval)
