# Responsive Design

Responsive design lets a page adapt to its content and viewing environment,
including narrow phones, tablets, laptops, zoomed text, and wide displays.

## Why it matters

People do not all use the same screen size, orientation, or input method.
Responsive layouts preserve readability and useful controls rather than
shrinking a desktop design until it becomes cramped.

## How it works

Start with flexible layouts and intrinsic sizing. Add breakpoints only when
the content no longer fits well. Media queries can change layout at a
viewport condition; relative units such as `%`, `rem`, and `vw` express
relationships rather than fixed device assumptions.

## Practical example

```css
.page {
  width: min(100% - 2rem, 70rem);
  margin-inline: auto;
}

.article-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1.5rem;
}

@media (min-width: 48rem) {
  .article-grid {
    grid-template-columns: 2fr 1fr;
  }
}
```

The content stays within a readable maximum width and gains a second column
only when enough space is available.

## Developer perspective

Test real content at multiple widths, zoom levels, and keyboard navigation.
Avoid relying on a particular phone model; breakpoints should be chosen where
the design needs them. Use responsive images where appropriate, and ensure
controls remain easy to operate.

**Viewport** is the visible page area. **Breakpoint** is a condition where
layout rules change. **Mobile-first** commonly means starting with the
simplest narrow layout, then enhancing it for wider space.

## Common misconceptions

- Responsive design is not one special CSS framework or a list of device
  widths.
- A layout that fits the viewport can still be hard to read or operate.
- Media queries complement, but do not replace, flexible layout.

## Further learning

- [MDN: Responsive design](https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/CSS_layout/Responsive_Design)
- [web.dev: Responsive web design basics](https://web.dev/articles/responsive-web-design-basics)
