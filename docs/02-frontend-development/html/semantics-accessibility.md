# Semantic HTML and Accessibility

Semantic HTML gives content elements names that describe their purpose. It
helps browsers, search engines, developers, and assistive technologies
understand page structure and behavior.

## Semantic page structure elements

| Element | Meaning and typical use | Important notes |
|---|---|---|
| `<header>` | Introductory content for a page or section | Can appear more than once for different sections |
| `<nav>` | A major group of navigation links | Not every list of links needs a `nav` |
| `<main>` | The document's primary content | Normally one visible `main` landmark per page |
| `<section>` | A thematic grouping, usually with a heading | Do not use only as a generic styling wrapper |
| `<article>` | Self-contained content that can stand on its own | Examples: post, comment, news story |
| `<aside>` | Complementary content related to surrounding content | Examples: related links, callout |
| `<footer>` | Footer for a page or section | May appear at page and article level |
| `<address>` | Contact information for the nearest article or page | Not a general-purpose postal-address wrapper |
| `<search>` | A region containing search or filtering controls | Use a form and labeled controls inside |

## Text and content semantics

| Element | Meaning and example |
|---|---|
| `<h1>`–`<h6>` | Headings by document hierarchy; use levels to express structure |
| `<p>` | Paragraph |
| `<strong>` | Strong importance, seriousness, or urgency |
| `<em>` | Stress emphasis that can affect sentence meaning |
| `<mark>` | Text relevant to the current context |
| `<small>` | Side comments or fine print |
| `<abbr title="...">` | Abbreviation with an optional expansion |
| `<time datetime="...">` | Date/time with machine-readable value |
| `<code>` | Short code fragment |
| `<pre>` | Preformatted text, often used with `code` |
| `<blockquote cite="...">` | Extended quotation |
| `<q cite="...">` | Short inline quotation |
| `<cite>` | Title of a creative work |
| `<figure>` and `<figcaption>` | Self-contained media/content and its caption |
| `<dl>`, `<dt>`, `<dd>` | Description list, term, and description |

Example:

```html
<article>
  <h1>How DNS lookup works</h1>
  <p><strong>DNS</strong> maps names to records used to locate services.</p>
  <figure>
    <img src="/images/dns-flow.svg" alt="A resolver asking DNS servers for a record">
    <figcaption>A simplified DNS lookup.</figcaption>
  </figure>
  <p>Read the <a href="/networking/dns">DNS lesson</a> for details.</p>
</article>
```

## Interactive and disclosure semantics

- `<button>` performs an action; its `type` is `button`, `submit`, or
  `reset`. Inside a form, set the type intentionally.
- `<details>` creates a disclosure widget; `<summary>` is its visible
  heading and must be its first child.
- `<dialog>` represents a dialog; use the dialog APIs to manage modal
  behavior rather than simulating a dialog with a styled `div`.
- `<label>` gives a form control an accessible name; see the dedicated
  [forms lesson](forms.md).

## Attributes and accessibility

Global attributes such as `id`, `lang`, `dir`, and `hidden` may apply to
semantic elements. Use `aria-label` only when visible text cannot provide the
accessible name; prefer a visible `<label>` or button text. `role` can refine
semantics when necessary, but an incorrect role can remove useful native
behavior. See [HTML elements and global attributes](elements-and-global-attributes.md).

## Developer checklist

- Use headings in a logical hierarchy; do not choose a heading for its font
  size.
- Use a link for navigation and a button for an action.
- Ensure keyboard focus is visible and the page works without a mouse.
- Provide useful image alternatives and captions where relevant.
- Do not convey required, invalid, or selected state through color alone.
- Test with keyboard and assistive technology where practical.

## Common misconceptions

- Semantic elements do not automatically make every page accessible; content
  and interaction still matter.
- A `<section>` is not just a more meaningful-looking `<div>`; use it for a
  thematic section, usually with a heading.
- ARIA adds semantics but generally does not implement interaction behavior.

## Further learning

- [MDN: HTML elements reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Element)
- [W3C WAI: Page structure](https://www.w3.org/WAI/tutorials/page-structure/)
- [W3C WAI: Introduction to accessibility](https://www.w3.org/WAI/fundamentals/accessibility-intro/)
