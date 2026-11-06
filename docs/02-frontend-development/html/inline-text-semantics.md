# HTML Inline Text Semantics

Inline elements describe the role or meaning of words within a line. Choose
the element that matches the content, then use CSS if its default appearance
needs to change.

## Common inline elements

| Element | Meaning |
|---|---|
| `<strong>` | Importance, seriousness, or urgency |
| `<em>` | Stress emphasis that can affect the sentence meaning |
| `<b>` | Draws attention without adding importance |
| `<i>` | Alternate voice, technical term, or idiomatic text |
| `<u>` | Non-textual annotation; use carefully because it resembles a link |
| `<s>` | Content that is no longer accurate or relevant |
| `<del>` / `<ins>` | Deleted / inserted changes; may include `cite` and `datetime` |
| `<sub>` / `<sup>` | Subscript / superscript |
| `<code>` | A fragment of computer code |
| `<span>` | Generic inline container when no semantic element applies |

`<br>` creates a line break when the break is part of the content, such as in
an address or poem. `<hr>` represents a thematic change between paragraphs
or sections.

## Example

```html
<p>
  Use <strong>HTTPS</strong> for secure transport.
  The variable <code>userId</code> identifies the account.
</p>
```

## Common misconceptions

- `<strong>` and `<b>` are not interchangeable: one conveys importance, the
  other draws attention without that meaning.
- `<em>` is not simply an italic style; it expresses stress emphasis.
- Repeated `<br>` elements should not be used to create paragraph spacing.
- `<span>` has no built-in meaning; do not use it when a semantic element
  fits.

## Check your understanding

1. Which element marks a code fragment?
2. How do `<em>` and `<i>` differ?
3. When is `<br>` appropriate?

## Further learning

- [MDN: Text-level semantics](https://developer.mozilla.org/en-US/docs/Web/HTML/Element#text_content)
- [MDN: `<strong>`](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/strong)
- [MDN: `<code>`](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/code)
