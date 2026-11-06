# HTML Text and Paragraphs

HTML text elements structure prose and preserve the meaning of written
content. Browsers and assistive technologies use this structure; CSS controls
how it looks.

## Paragraphs

`<p>` represents a paragraph. Browsers add default spacing, but the element
is not a generic spacing tool. Use CSS margins to adjust layout.

```html
<p>HTML describes the structure and meaning of web content.</p>
<p>CSS controls how that content is presented.</p>
```

## Quotations

Use `<blockquote>` for a longer quotation taken from another source. Its
optional `cite` attribute can store a source URL, but it is not shown as a
visible citation. Use `<q>` for a short inline quotation; browsers may add
quotation marks.

```html
<blockquote cite="https://example.com/article">
  <p>Accessible structure helps more people use the web.</p>
</blockquote>
<p>The guide calls this idea <q>inclusive design</q>.</p>
```

Provide a visible attribution in the surrounding content when readers need
to know who said the quoted words.

## Preformatted text

`<pre>` preserves whitespace and line breaks. It is often paired with
`<code>` for source code. Escape characters such as `<` and `&` when they
should be displayed literally.

```html
<pre><code>if (ready) {
  start();
}</code></pre>
```

## Developer perspective and terminology

**Prose** is ordinary written content. **Preformatted text** preserves
spacing instead of being collapsed like regular HTML whitespace. Prefer
meaningful elements over manually inserting spaces or repeated line breaks.

## Common misconceptions

- A `<p>` should not contain another `<p>` or other block-level sections.
- `<blockquote cite>` does not by itself display a citation.
- `<pre>` is not a general-purpose way to preserve page layout whitespace.

## Further learning

- [MDN: `<p>`](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/p)
- [MDN: `<blockquote>`](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/blockquote)
- [MDN: `<pre>`](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/pre)
