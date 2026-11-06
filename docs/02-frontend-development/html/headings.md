# HTML Headings

Headings label sections and communicate how the content is organized.
Browsers display them prominently by default, but their most important job
is to describe the document hierarchy.

## Heading levels

`<h1>` through `<h6>` represent six levels of section headings. A page
usually has one clear main heading, followed by headings that introduce
related sections.

```html
<main>
  <h1>Learning web development</h1>
  <section>
    <h2>Start with HTML</h2>
    <h3>Build a document</h3>
  </section>
</main>
```

Choose a level based on the heading’s relationship to nearby sections. Do
not skip levels simply to get a smaller font; style the heading with CSS.
Modern HTML does not automatically reset heading levels inside nested
`<section>` elements.

## Why hierarchy matters

People often scan headings before reading a page. Screen-reader users may
also navigate by heading level. A clear outline makes long content easier to
understand and helps developers maintain the page.

## Developer checklist

- Write concise headings that accurately describe the section.
- Keep sibling sections at the same level where appropriate.
- Use CSS classes for visual differences rather than selecting a heading
  level for its default appearance.
- Avoid using heading elements only to make text bold or large.

## Common misconceptions

- A heading level is not just a font-size choice.
- A page is not required to contain all six heading levels.
- Nesting a section does not automatically change the meaning of its
  heading level.

## Check your understanding

1. What should determine whether you use `<h2>` or `<h3>`?
2. How can you change the visual size of a heading without changing its
   semantic level?
3. Why are descriptive headings helpful to keyboard and screen-reader users?

## Further learning

- [MDN: Headings](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/Heading_Elements)
- [W3C WAI: Headings](https://www.w3.org/WAI/tutorials/page-structure/headings/)
