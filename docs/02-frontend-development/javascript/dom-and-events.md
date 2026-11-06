# The DOM and Browser Events

The Document Object Model (DOM) is the browser's programmable representation
of a page. JavaScript can read and update DOM nodes and respond to events such
as clicks, keyboard input, and form submission.

## Why it matters

DOM APIs connect JavaScript with the document a user sees. Events let code
react to actions without constantly checking whether something changed.

## How it works

The browser dispatches an event to a target element. Event listeners run
registered callback functions. Events often travel through capture and bubble
phases, so a listener on an ancestor may observe an event from a child.
Calling `preventDefault()` cancels a default browser action when that is
appropriate; it does not stop propagation.

## Common DOM methods and event properties

| API/property | Purpose |
|---|---|
| `document.querySelector(selector)` | Finds the first matching element, or `null` |
| `document.querySelectorAll(selector)` | Returns a static collection of matching elements |
| `element.textContent` | Reads or sets text without parsing HTML |
| `element.classList` | Adds, removes, toggles, or checks CSS classes |
| `element.addEventListener(type, handler, options)` | Registers an event listener |
| `event.target` | Element where the event originated |
| `event.currentTarget` | Element whose listener is currently running |
| `event.preventDefault()` | Cancels a cancelable default action |
| `event.stopPropagation()` | Stops further propagation through the event path |

For selecting and traversing nodes, working with a `NodeList`, changing
content, and using `classList`, continue to
[DOM navigation and updates](dom-navigation-and-updates.md). For keyboard
events, checkbox `checked` state, `event.target`, and form submission, see
[event listeners and forms](event-listeners-and-forms.md).

Use the `capture`, `once`, and `signal` listener options when their behavior
is useful. Remove listeners or abort their controller when a component or
view no longer needs them.

## Practical example

```html
<form id="search-form">
  <label for="query">Search</label>
  <input id="query" name="q">
  <button>Go</button>
</form>
```

```js
const form = document.querySelector("#search-form");

if (form instanceof HTMLFormElement) {
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(form);
    console.log(data.get("q"));
  });
}
```

The submit event also works when a user activates the button with a keyboard.
The `instanceof` guard confirms the queried element is a form before using
form-specific APIs.

## Developer perspective and terminology

Prefer semantic HTML controls and attach listeners to the appropriate
elements. **Event target** is the element that originated an event;
**bubbling** is an event phase where it travels from a target toward ancestors;
**event delegation** handles events at a shared ancestor.

## Common misconceptions

- `querySelector` can return `null`; check that an element exists before using
  it when the page structure may vary.
- `preventDefault()` and `stopPropagation()` do different things.
- Updating the DOM with user-provided HTML can create security risks; avoid
  inserting untrusted strings as markup.
- `querySelectorAll` is static; it does not automatically include elements
  added later.

## Further learning

- [MDN: Introduction to events](https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Scripting/Events)
- [MDN: Document Object Model](https://developer.mozilla.org/en-US/docs/Web/API/Document_Object_Model)
