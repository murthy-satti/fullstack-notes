# CSS

## Introduction

CSS (Cascading Style Sheets) controls how HTML content is presented: colors,
spacing, typography, layout, and adaptation to different screen sizes.
Separating styles from content makes pages easier to change and reuse.

## Why does it exist?

HTML describes content; CSS describes its presentation. This separation lets
a site share a design across pages and adapt layouts without rewriting content.

## How does it work?

A CSS rule has a selector and declarations. The browser matches selectors to
elements and resolves competing declarations using the cascade, specificity,
and inheritance. Selectors can target element types, classes, IDs, and states.

CSS also provides layout algorithms, responsive conditions, custom
properties, and functions. A property accepts values with defined syntax;
the browser computes the final value after applying the cascade.

## Real-world example

A product page may use Grid for desktop columns, a single column on a phone,
and a visible focus outline for keyboard users, while keeping the same HTML.

## Developer perspective

Prefer understandable class names and reusable rules. Test different viewport
sizes, keyboard focus, and color contrast. CSS works with [HTML](html.md), while
[JavaScript](javascript.md) can update classes or styles when interaction
requires it.

## Practical example

```css
/* Flexible columns with a readable minimum width. */
.card-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
  gap: 1rem;
}

.card a:focus-visible {
  outline: 3px solid royalblue;
  outline-offset: 3px;
}
```

The grid creates suitably sized columns; the focus rule makes keyboard
navigation visible.

## Important CSS topic map

- [Syntax, selectors, units, and values](css/syntax-selectors-values.md)
- [Essential CSS properties](css/essential-properties.md)
- [Cascade and specificity](css/cascade-and-selectors.md)
- [Box model, Flexbox, and Grid](css/box-model-and-layout.md)
- [Responsive design](css/responsive-design.md)
- [Positioning and stacking contexts](css/positioning-and-stacking.md)
- [Typography, color, and custom properties](css/typography-colors-variables.md)
- [Focus, visual states, and motion](css/visual-states-and-motion.md)
- [Transforms and animations](css/transforms-and-animations.md)
- [CSS architecture and debugging](css/architecture-and-debugging.md)

## Important terminology

- **Selector:** A pattern that identifies which elements a rule affects.
- **Declaration:** A property and value, such as `color: navy`.
- **Cascade:** The process for resolving applicable declarations.
- **Responsive design:** Layout and styling that adapt to device or viewport needs.

## Advantages and disadvantages

CSS offers declarative styling and adapts designs without duplicated content.
Overly specific selectors and overrides can make the cascade hard to reason about.

## Common misconceptions

- CSS is not only for colors; it also controls layout and responsive behavior.
- A selector matching an element does not guarantee its rule wins; the cascade
  determines the final result.
- Responsive design is not simply shrinking a desktop page.

## Revision questions

1. What are the selector and declarations in a CSS rule?
2. Name two factors that influence which competing style is applied.
3. How does a media-independent layout technique such as Grid help responsiveness?

## Further Learning & References

- **Reference:** [MDN CSS](https://developer.mozilla.org/en-US/docs/Web/CSS) explains CSS concepts and documents selectors, properties, and values.
- **Official standard:** [W3C CSS Snapshot](https://www.w3.org/TR/CSS/) summarizes the current set of CSS specifications and links to modules.
- **Review:** [CSS Interview Questions and Answers](css/interview-questions-and-answers.md).
