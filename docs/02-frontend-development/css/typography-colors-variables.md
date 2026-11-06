# CSS Typography, Colors, and Custom Properties

Typography and color strongly affect readability, hierarchy, and brand
identity. CSS custom properties let a design reuse values consistently.

## Typography

Choose readable font sizes, line heights, and line lengths. Use a fallback
font stack because a preferred font may not be installed or may fail to load.
For long text, test at different zoom levels and screen widths.

## Color and contrast

Use color to reinforce meaning, not as the only way to distinguish states.
Check text and interface contrast against accessibility guidance. A muted
color that looks fine on one display may be difficult to read elsewhere.

## Custom properties

```css
:root {
  --color-text: #1d2733;
  --color-accent: #2457a7;
  --space-3: 1rem;
}

.notice {
  color: var(--color-text);
  border-inline-start: 0.25rem solid var(--color-accent);
  padding: var(--space-3);
}
```

Custom properties participate in the cascade and can be overridden on a
component or theme root.

## Developer perspective and terminology

Use a small, meaningful token set rather than inventing a new value for every
element. **Fallback font** is a substitute when the primary typeface is
unavailable; **contrast ratio** compares perceived luminance; **design
token** is a named reusable design value, often implemented with a custom
property.

## Common misconceptions

- A named color does not guarantee sufficient contrast.
- Custom properties are not compile-time constants; they inherit and cascade.
- A font size that looks comfortable on one monitor may not work at zoom or
  on a small device.

## Further learning

- [MDN: CSS custom properties](https://developer.mozilla.org/en-US/docs/Web/CSS/Using_CSS_custom_properties)
- [W3C WAI: Contrast minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)
