# HTML Lists

Lists group items that belong together. Select a list element based on
whether item order matters or whether each item has a term and description.

## Unordered and ordered lists

| Element | Meaning | Important attributes |
|---|---|---|
| `<ul>` | A collection where order is not meaningful | Global attributes |
| `<ol>` | A sequence where order matters | `start`, `reversed`, `type` |
| `<li>` | An item in a list | `value` can set its number in an ordered list |

`<ol type>` can use decimal numbers (`1`), letters (`a` or `A`), or Roman
numerals (`i` or `I`). CSS is usually a better choice for visual marker
styling.

```html
<ol>
  <li>Write the page structure.</li>
  <li>Add meaningful content.</li>
  <li>Style the page with CSS.</li>
</ol>
```

Lists can be nested when the parent-child relationship is meaningful. Put
the nested `<ul>` or `<ol>` inside the relevant `<li>`.

## Description lists

`<dl>` groups one or more terms and their descriptions. `<dt>` is a term or
name; `<dd>` is its description or value.

```html
<dl>
  <dt>HTTP</dt>
  <dd>A protocol for exchanging web messages.</dd>
</dl>
```

## Menu

`<menu>` represents a list of commands or items. Its common browser
presentation resembles a list, and it is not a replacement for navigation
landmarks or buttons.

## Developer perspective and misconceptions

Use `<ol>` when sequence or ranking matters, such as numbered instructions.
Use `<ul>` for a group such as a set of related features. Do not select list
elements only because their default markers are convenient.

## Check your understanding

1. Which list should represent steps that must be followed in order?
2. Where should a nested list appear relative to its parent list item?
3. What roles do `<dt>` and `<dd>` play?

## Further learning

- [MDN: `<ul>`](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/ul)
- [MDN: `<ol>`](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/ol)
- [MDN: `<dl>`](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/dl)
