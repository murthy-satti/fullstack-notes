# HTML

## Introduction

HTML (HyperText Markup Language) describes the structure and meaning of web
content. Browsers read elements such as headings, links, forms, and images to
build a document people can navigate.

## Why does it exist?

The web needs a shared way to express documents. HTML provides that vocabulary.
Semantic elements communicate purpose to browsers, assistive technologies,
and developers. For example, `<nav>` identifies navigation more clearly than
a generic `<div>`.

## How does it work?

An HTML document is a tree of elements. Tags mark the beginning and end of most
elements; attributes provide extra information. The browser parses the source
into a Document Object Model (DOM), which scripts and styles can work with.
Elements can contain other elements, but they must be nested correctly.

## Real-world example

A news story might use `<main>`, `<article>`, `<h1>`, `<time>`, and `<figure>`
to identify its content and image caption before CSS changes its appearance.

## Developer perspective

Start with meaningful structure, use headings in order, give images useful
alternative text, and associate labels with form controls. Semantic HTML
provides useful accessibility behavior without extra scripting. See also
[CSS](css.md), [JavaScript](javascript.md), and [browser internals](browser-internals.md).

## Practical example

```html
<article>
  <h1>Choosing a first programming project</h1>
  <p>Published <time datetime="2026-03-08">March 8, 2026</time></p>
  <p>Pick a small problem you would enjoy solving.</p>
  <a href="/projects">Explore project ideas</a>
</article>
```

The `datetime` value provides a consistent date for software.

## Important terminology

- **Element:** A unit of content, usually represented by opening and closing tags.
- **Attribute:** A name-value setting on an element, such as `href`.
- **DOM:** The browser's in-memory tree representation of the document.
- **Semantic markup:** Elements selected for their meaning, not merely appearance.

## Advantages and disadvantages

HTML is widely supported and provides semantic features. It does not define
visual design or application logic; CSS and JavaScript usually handle those.
Poorly structured markup is difficult to navigate and maintain.

## Common misconceptions

- HTML is not a programming language; it marks up content.
- A page is not accessible just because it uses HTML; correct semantics and
  thoughtful labels and alternatives matter.
- A `<div>` is not the best default for every piece of content.

## Revision questions

1. What does semantic HTML communicate beyond how content looks?
2. What is the DOM, and how is it related to an HTML document?
3. Why should a form control have an associated label?

## Further Learning & References

- **Official standard:** [WHATWG HTML Living Standard](https://html.spec.whatwg.org/multipage/) defines HTML elements, parsing, and browser behavior.
- **Reference:** [MDN HTML](https://developer.mozilla.org/en-US/docs/Web/HTML) explains core concepts and provides element and attribute guides.
