# HTML Interview Questions and Answers

Review these questions after the focused HTML lessons. Each answer highlights
the practical meaning of the concept rather than relying on memorized
definitions.

## Document structure and semantics

### 1. What is HTML?

HTML (HyperText Markup Language) describes the structure and meaning of web
content. CSS controls presentation and JavaScript adds behavior.

### 2. What is the purpose of `<!doctype html>`?

It tells browsers to use modern standards mode when parsing the document.
It is a declaration, not an HTML element.

### 3. What is the difference between an element and a tag?

A tag is markup such as `<p>` or `</p>`. An element is the document
construct represented by its start tag, content, and optional end tag.
Some elements, such as `<img>`, are void and have no end tag.

### 4. What are HTML attributes?

Attributes provide additional information or configuration on an element:
`<a href="/about">About</a>` uses `href` to provide the link destination.
Some attributes are global; others only apply to particular elements.

### 5. What is semantic HTML?

Semantic HTML uses elements that describe the purpose of content, such as
`<nav>`, `<main>`, `<article>`, and `<button>`. It helps browsers,
assistive technology, and developers understand the document.

### 6. What is the difference between `<section>` and `<div>`?

`<section>` represents a thematic grouping of content, usually with a
heading. `<div>` is a generic container with no built-in meaning. Use
`<div>` when no more appropriate semantic element fits.

### 7. What is the difference between `<article>` and `<section>`?

An `<article>` is self-contained content that can stand on its own, such as
a post or comment. A `<section>` groups related content within a larger
page or article.

## Text, links, images, and tables

### 8. Why should heading levels follow a logical hierarchy?

Headings communicate the structure of a page and help people scan or
navigate it. Choose a level based on section relationships, not its default
font size; CSS controls appearance.

### 9. What is the difference between `<strong>` and `<b>`?

`<strong>` conveys importance or urgency. `<b>` draws attention without
adding that importance. Use CSS for visual styling alone.

### 10. When should you use `<ol>` instead of `<ul>`?

Use `<ol>` when sequence or ranking matters, such as ordered instructions.
Use `<ul>` when the items form a group but order is not meaningful.

### 11. What is the difference between a link and a button?

An `<a href="...">` navigates to a resource or location. A `<button>`
performs an action, such as submitting a form or opening a dialog.

### 12. Why does an image need `alt` text?

`alt` supplies a text alternative for users who cannot see the image and
for cases where it cannot load. Use useful descriptive text for meaningful
images and `alt=""` for decorative images.

### 13. What do `srcset` and `sizes` do?

`srcset` lists image candidates. `sizes` tells the browser the expected
rendered width at different viewport conditions, helping it choose a
suitable candidate.

### 14. Why should a data table use `<th>` and `<td>` correctly?

`<th>` identifies a header cell and `<td>` identifies a data cell.
Appropriate headers and `scope` communicate row or column relationships to
assistive technology.

## Forms and accessibility

### 15. Why should every form control have a label?

A label gives a control an accessible name and often enlarges its clickable
area. Connect a `<label for="email">` to a control with `id="email"`, or
wrap the control in its label.

### 16. What is the difference between `id` and `name` on a form control?

`id` identifies an element in the document and can connect it to a label.
`name` supplies the key used when a successful control's value is submitted.

### 17. What is the difference between GET and POST in a form?

GET generally places form data in the URL and suits safe retrieval such as
search. POST sends data in the request body and is commonly used for
state-changing operations. POST does not encrypt data; HTTPS is needed for
transport confidentiality.

### 18. Does `required` replace server-side validation?

No. Browser constraints improve feedback but can be bypassed. The server
must validate input and enforce authorization independently.

### 19. What is the purpose of `<fieldset>` and `<legend>`?

`<fieldset>` groups related controls, and `<legend>` gives that group a
caption. They are especially useful for related radio buttons or
checkboxes.

### 20. Does semantic HTML automatically make a page accessible?

No. Semantics provide a strong foundation, but content, labels, keyboard
behavior, focus, color contrast, alternatives, and testing also matter.

## Further learning

- [HTML overview](../html.md)
- [MDN: HTML elements reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element)
- [WHATWG HTML Living Standard](https://html.spec.whatwg.org/multipage/)
- [W3C WAI: Tutorials](https://www.w3.org/WAI/tutorials/)

## Scenario questions

### 21. A form looks correct, but screen-reader users cannot tell what each field means. What do you inspect?

Check that each control has a programmatic label, typically a `<label>` associated by matching `for` and `id`. A placeholder is not a durable substitute: it can disappear during entry and may not provide the expected accessible name. Group related controls with `fieldset` and `legend` where appropriate, and associate useful error text with the relevant control. Verify the result with keyboard navigation and accessibility inspection.

### 22. A button-looking control changes the URL but does not perform an action. Which element should it use?

Use an anchor with a meaningful `href` when the outcome is navigation, including to another page or a section. Use a `<button>` for an action such as opening a dialog or submitting data. Native elements provide expected keyboard behavior, focus, and semantics; styling a generic `<div>` to look interactive does not provide those behaviors automatically.

### 23. A decorative image is announced with an unhelpful filename. How should it be marked up?

If the image conveys no information beyond nearby content, use `alt=""` so assistive technology can skip it. If it carries meaning, provide a concise alternative that communicates that meaning in context. Do not repeat an adjacent caption verbatim unless that repetition is useful. For complex charts, provide the key information in nearby text or a data table rather than putting a long explanation in `alt`.

### 24. A submitted form omits a checked checkbox from the request. Why?

Only successful controls are submitted. A checkbox needs a `name`, and an unchecked checkbox is omitted; checked values are submitted using its `value` or a default value. Disabled controls are also omitted. Inspect the actual form data and make sure the server handles omitted values deliberately rather than assuming the browser submits `false` for every unchecked box.

### 25. A table is difficult to navigate with assistive technology. What semantic fixes might help?

Use a real `<table>` for tabular data, mark header cells with `<th>`, and use `scope="col"` or `scope="row"` for straightforward relationships. Give the table a useful caption when it needs a title. For complex multi-level headers, explicit associations may be needed. Do not use tables for page layout, and verify that the reading order remains understandable on small screens.

### 26. A user can activate a custom control with a mouse but not a keyboard. What is the likely issue?

The control may be built from a non-interactive element without keyboard behavior or semantics. Prefer a native `<button>`, `<a>`, or form control. If a custom widget is necessary, implement its accessible role, name, focus behavior, keyboard interaction, and state according to the relevant pattern, then test it with keyboard and assistive technology. Adding `tabindex="0"` alone does not reproduce native interaction.

## Further learning
