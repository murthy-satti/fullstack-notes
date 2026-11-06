# JavaScript DOM Navigation and Updates

The Document Object Model (DOM) is the browser's in-memory representation
of a document. JavaScript can select nodes, move through relationships,
create content, and update the page.

## Selecting elements

| API | Result |
|---|---|
| `document.getElementById(id)` | One matching element or `null` |
| `document.querySelector(selector)` | First CSS-selector match or `null` |
| `document.querySelectorAll(selector)` | Static `NodeList` of matches |
| `element.closest(selector)` | Closest matching ancestor, including itself, or `null` |

```js
const title = document.querySelector("main h1");
const buttons = document.querySelectorAll("button");
```

`querySelectorAll()` returns a static NodeList: later DOM additions do not
appear in that already-created list. A NodeList may be iterated with
`for...of`; use `Array.from(nodes)` when array methods are needed.

## Navigate relationships

Useful properties include `parentElement`, `children`,
`firstElementChild`, `lastElementChild`, `nextElementSibling`, and
`previousElementSibling`. Prefer element-specific relationships when text
nodes and comments are not relevant.

## Change content and classes

```js
const message = document.querySelector("#message");

if (message) {
  message.textContent = "Saved successfully";
  message.classList.add("is-success");
}
```

`classList` provides `add`, `remove`, `toggle`, `contains`, and `replace`.
Use `textContent` for plain text. `innerHTML` parses markup and must not be
populated with untrusted strings.

## Create and remove elements

```js
const item = document.createElement("li");
item.textContent = "Practice JavaScript";
document.querySelector("#topics")?.append(item);
```

Other useful APIs include `prepend`, `before`, `after`, `replaceWith`, and
`remove`. Build elements and assign text or safe attributes rather than
concatenating untrusted data into HTML strings.

## Developer perspective and common mistakes

Query results can be `null` or empty. Check for the expected element before
using it. A static NodeList does not update when matching elements are
added later. For interaction, prefer semantic buttons, links, and form
controls over clickable generic containers.

## Further learning

- [MDN: Document Object Model](https://developer.mozilla.org/en-US/docs/Web/API/Document_Object_Model)
- [MDN: `Element.classList`](https://developer.mozilla.org/en-US/docs/Web/API/Element/classList)
- [MDN: `Document.querySelectorAll`](https://developer.mozilla.org/en-US/docs/Web/API/Document/querySelectorAll)
