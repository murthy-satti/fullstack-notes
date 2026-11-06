# Essential CSS Properties

CSS has many properties. This page is a practical reference to frequently
used properties for layout, spacing, typography, color, and interaction.
Consult the property reference for exact syntax and browser support.

## Display and layout

| Property | Common values | Purpose |
|---|---|---|
| `display` | `block`, `inline`, `inline-block`, `flex`, `grid`, `none` | Selects the element's layout behavior |
| `position` | `static`, `relative`, `absolute`, `fixed`, `sticky` | Controls positioning behavior |
| `inset`, `top`, `right`, `bottom`, `left` | lengths or percentages | Offsets a positioned element |
| `z-index` | integer or `auto` | Controls stack order within stacking contexts |
| `overflow` | `visible`, `hidden`, `auto`, `scroll` | Controls content outside a box |
| `float`, `clear` | `left`, `right`, `none`, etc. | Primarily wraps text around content; legacy layout use is discouraged |

## Sizing and spacing

| Property | Purpose |
|---|---|
| `width`, `height` | Set a preferred size |
| `min-width`, `max-width`, `min-height`, `max-height` | Constrain size ranges |
| `box-sizing` | Determines whether declared size includes padding and border |
| `margin` | Outer spacing; supports logical variants such as `margin-inline` |
| `padding` | Inner spacing |
| `border`, `border-radius` | Border edges and corner rounding |
| `gap`, `row-gap`, `column-gap` | Space between Grid/Flex items |

## Flexbox and Grid

Flexbox: `flex-direction`, `flex-wrap`, `justify-content`, `align-items`,
`align-content`, `flex`, `flex-grow`, `flex-shrink`, `flex-basis`, and `order`.

Grid: `grid-template-columns`, `grid-template-rows`, `grid-template-areas`,
`grid-column`, `grid-row`, `place-items`, and `place-content`.

Use the layout lesson for complete examples and how the algorithms differ.

## Typography and text

| Property | Purpose |
|---|---|
| `font-family` | Typeface list with fallbacks |
| `font-size` | Text size |
| `font-weight` | Stroke weight |
| `font-style` | Such as normal or italic |
| `line-height` | Line box spacing |
| `text-align` | Inline content alignment |
| `text-decoration` | Underlines and other text decoration |
| `white-space` | Wrapping and whitespace handling |
| `overflow-wrap` | Breaks long unbreakable text where needed |

## Color and backgrounds

`color` sets foreground text color. `background-color`,
`background-image`, `background-size`, `background-position`, and
`background-repeat` control backgrounds. `opacity` affects an element and
its descendants; use alpha colors when only the background needs
transparency.

## Interaction and accessibility

`cursor` changes the pointer hint but does not make an element interactive.
`outline` styles a focus indicator; do not remove it without providing a
visible alternative. `pointer-events` controls pointer hit testing, not
keyboard access. `visibility: hidden` hides an element while preserving
layout space; `display: none` removes it from layout and generally from the
accessibility tree.

## Example

```css
.lesson-card {
  display: grid;
  gap: 1rem;
  width: min(100% - 2rem, 42rem);
  margin-inline: auto;
  padding: clamp(1rem, 3vw, 2rem);
  color: #172334;
  background-color: white;
  border: 1px solid #cbd5e1;
  border-radius: 0.75rem;
}
```

## Common misconceptions

- `opacity` affects the whole rendered element, not only its background.
- `z-index` behavior depends on the element's layout role and stacking
  context; it is not one global ordering number.
- `display: none` and `visibility: hidden` have different layout behavior.
- `float` is not a substitute for Flexbox or Grid for general application
  layout.

## Check your understanding

1. How do margin and padding differ?
2. Which property is useful for spacing items in a Grid or Flex container?
3. What differs between `display: none` and `visibility: hidden`?

## Further learning

- [MDN: CSS reference](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference)
- [MDN: Flexbox](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_flexible_box_layout)
- [MDN: CSS Grid](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_grid_layout)
