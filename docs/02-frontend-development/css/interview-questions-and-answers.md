# CSS Interview Questions and Answers

Use these questions to review CSS fundamentals and common layout and
responsive-design decisions.

## Selectors and cascade

### 1. What is CSS?

CSS (Cascading Style Sheets) describes how HTML and other document content
is presented, including layout, color, typography, and responsive behavior.

### 2. What is the cascade?

The cascade resolves competing declarations by considering origin and
importance, cascade layer, specificity, and source order. The exact
comparison rules matter when multiple rules match the same property.

### 3. What is CSS specificity?

Specificity is one part of resolving competing selectors. IDs generally
outrank classes, attributes, and pseudo-classes, which outrank type
selectors. Specificity is compared only after higher-priority cascade
factors, such as origin, importance, and layer, are considered.

### 4. What is inheritance in CSS?

Some properties, such as `color` and `font-family`, commonly inherit from
an element's parent. Others, such as `margin` and `border`, do not normally
inherit. Consult the property's behavior rather than assuming all styles
inherit.

### 5. What is the difference between a class and an ID selector?

A class selector such as `.card` can match multiple elements and can be
combined with other classes. An ID selector such as `#main` targets the
element with that ID and has higher specificity. Classes are usually more
reusable for styling.

## Box model and layout

### 6. What is the CSS box model?

An element's box consists of content, padding, border, and margin.
`box-sizing: border-box` includes padding and border within the declared
width and height, which can make sizing easier to reason about.

### 7. What is the difference between Flexbox and Grid?

Flexbox is primarily one-dimensional, arranging items along a row or
column. Grid is two-dimensional, controlling rows and columns together.
They can be combined in one layout.

### 8. What does `position: absolute` position against?

An absolutely positioned element is positioned relative to its nearest
ancestor that establishes a containing block for absolute positioning,
commonly one with a non-static position. If none exists, it uses the
initial containing block.

### 9. What does `z-index` do?

`z-index` controls stacking order within applicable stacking contexts.
Large numbers do not escape their stacking context, so a child may still
appear behind content in another context.

### 10. What is the difference between `display: none` and `visibility: hidden`?

`display: none` removes the element from layout. `visibility: hidden`
keeps its layout space while hiding it visually. Accessibility-tree
behavior can depend on the element and context; use the appropriate
interaction pattern.

## Responsive design and maintainability

### 11. What is a media query?

A media query applies styles when a condition is true, commonly based on
viewport width or user preferences such as reduced motion. Use it to adapt
the layout to content and available space.

### 12. What is the difference between `px`, `em`, and `rem`?

`px` is a CSS reference pixel. `em` is relative to the relevant font size
(for many properties, the element's computed font size); `rem` is relative
to the root element's font size. Choose units based on the desired
relationship.

### 13. What are pseudo-classes and pseudo-elements?

A pseudo-class such as `:hover`, `:focus-visible`, or `:checked` selects an
element in a state. A pseudo-element such as `::before` or `::first-line`
styles a generated or specific part of an element.

### 14. What are CSS custom properties?

Custom properties store reusable values and can participate in the
cascade:

```css
:root { --accent: #3156c9; }
.link { color: var(--accent); }
```

### 15. How should motion preferences be respected?

Use the `prefers-reduced-motion` media feature to reduce or remove
nonessential animation for users who request reduced motion. Keep
information and functionality available without animation.

## Further learning

- [CSS overview](../css.md)
- [MDN: CSS reference](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference)
- [MDN: CSS layout](https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/CSS_layout)
