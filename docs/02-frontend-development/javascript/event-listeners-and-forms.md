# JavaScript Event Listeners and Forms

Events notify code about user actions and browser activity. Event listeners
connect an event type to a callback. Form and keyboard events let interfaces
respond to input accessibly.

## Registering listeners

```js
const button = document.querySelector("#save");

button?.addEventListener("click", (event) => {
  console.log(event.type, event.target);
});
```

`event.target` is where the event originated. `event.currentTarget` is the
element whose listener is currently running. A child event can bubble to an
ancestor, enabling event delegation.

Listener options include `capture` (listen during capture), `once` (remove
after one call), and `signal` (remove when an `AbortSignal` is aborted).
Use these or `removeEventListener` to avoid retaining unnecessary listeners.

## Keyboard events

`keydown` fires when a key is pressed; `keyup` fires when it is released.
For text entry, use input events on the relevant control rather than
reconstructing text from key presses. Prefer semantic controls that already
support keyboard behavior. If a custom shortcut is needed, consider
`event.key` and avoid intercepting keys users need for assistive technology.

## Handle form submission

Listen for the form's `submit` event, not only a button click. This also
supports Enter-key submission:

```js
const form = document.querySelector("#search-form");

form?.addEventListener("submit", (event) => {
  event.preventDefault();
  const formData = new FormData(form);
  console.log(formData.get("q"));
});
```

For checkboxes and radio inputs, the `checked` property reports the current
selection state; it is a boolean. The HTML `checked` attribute describes
the initial/default state, while the property reflects current interaction:

```js
const newsletter = document.querySelector("#newsletter");
if (newsletter instanceof HTMLInputElement && newsletter.checked) {
  console.log("The current form selection is checked");
}
```

`preventDefault()` cancels the browser's default action when the event is
cancelable. It does not stop propagation; `stopPropagation()` is separate.
Validate on the server even when client-side checks are provided.

## Event phases and delegation

Events can travel through capture, target, and bubble phases. Delegation
places one listener on a parent and checks `event.target` or
`closest()` for the relevant child. This is helpful for many similar or
dynamically added controls.

## Common misconceptions

- `event.target` and `event.currentTarget` can be different.
- `preventDefault()` does not stop the event from bubbling.
- A button click handler alone misses some form submission paths.
- Client-side validation is not a security boundary.

## Check your understanding

1. What is the difference between `target` and `currentTarget`?
2. Why listen for `submit` on a form instead of `click` on its button?
3. What does `preventDefault()` do?
4. When can event delegation be useful?

## Further learning

- [MDN: Event reference](https://developer.mozilla.org/en-US/docs/Web/Events)
- [MDN: Event bubbling](https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Scripting/Event_bubbling)
- [MDN: `Event.preventDefault`](https://developer.mozilla.org/en-US/docs/Web/API/Event/preventDefault)
