# CSS Syntax, Selectors, Units, and Values

CSS describes presentation through rules. Each rule has a selector and one or
more declarations; a declaration is a property paired with a value.

## Basic syntax

```css
.lesson-card {
  color: #172334;
  padding: 1rem;
  border: 1px solid #ccd5e0;
}
```

`.lesson-card` is the selector. `color`, `padding`, and `border` are
properties; the text after each colon is its value.

## Selector types

| Selector | Example | Matches |
|---|---|---|
| Type | `p` | All paragraph elements |
| Class | `.notice` | Elements with class `notice` |
| ID | `#main` | The element with ID `main` |
| Attribute | `input[required]` | Required inputs |
| Descendant | `article p` | Paragraphs anywhere inside an article |
| Child | `nav > a` | Anchors that are direct children of `nav` |
| Pseudo-class | `button:hover` | A button in its hover state |
| Pseudo-element | `p::first-line` | A generated/selected part of an element |
| Selector list | `h1, h2` | Both heading types |

Use classes for reusable styling. IDs are usually better for unique document
identity and fragment navigation than for CSS styling.

## Values and units

- **Unitless values:** `0`, line-height numbers, opacity values, and some
  other properties.
- **Absolute lengths:** `px` is a CSS reference pixel, not necessarily one
  physical display pixel.
- **Relative lengths:** `rem` relates to the root font size; `em` relates to
  the current context; `%` relates to a property's reference dimension.
- **Viewport units:** `vw`, `vh`, and newer dynamic/small/large viewport
  variants relate to viewport size; use carefully on mobile.
- **Colors:** hex, `rgb()`, `hsl()`, named values, and custom properties.
- **Functions:** `calc()`, `min()`, `max()`, `clamp()`, and `var()`.

```css
.reading-column {
  width: min(100% - 2rem, 68rem);
  margin-inline: auto;
  font-size: clamp(1rem, 0.95rem + 0.3vw, 1.2rem);
}
```

## At-rules

At-rules begin with `@` and control groups of declarations or CSS behavior:

- `@media` applies conditions such as viewport width or user preferences.
- `@supports` applies rules if a browser supports a feature.
- `@font-face` declares a downloadable typeface.
- `@keyframes` defines animation steps.
- `@layer` defines cascade layer ordering.

## Developer perspective and misconceptions

Prefer readable selectors and values that adapt to content. A CSS pixel is a
logical measurement and can map to multiple device pixels. A selector
matching an element does not guarantee its rule wins; see the
[cascade lesson](cascade-and-selectors.md).

## Further learning

- [MDN: CSS syntax](https://developer.mozilla.org/en-US/docs/Web/CSS/Syntax)
- [MDN: CSS selectors](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_selectors)
- [MDN: CSS values and units](https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Styling_basics/Values_and_units)
