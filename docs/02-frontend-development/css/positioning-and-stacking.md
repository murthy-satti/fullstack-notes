# CSS Positioning and Stacking

CSS positioning controls how an element participates in document layout and
where it is placed. Stacking rules determine which overlapping content is
painted on top.

## Position modes

- `static` is the normal flow default.
- `relative` keeps the element in flow but allows an offset; it can also
  establish a containing block for positioned descendants.
- `absolute` removes the element from normal flow and positions it against a
  containing block.
- `fixed` positions relative to the viewport in common cases.
- `sticky` behaves like normal flow until a scroll threshold is reached.

## Stacking contexts

`z-index` is not one global number line. Certain properties create stacking
contexts, which are painted as a group relative to other contexts. A child
with a huge `z-index` cannot necessarily escape a lower parent stacking
context.

## Practical example

```css
.card { position: relative; }
.badge {
  position: absolute;
  inset-block-start: 0.5rem;
  inset-inline-end: 0.5rem;
}

.site-header { position: sticky; inset-block-start: 0; z-index: 10; }
```

Logical inset properties work with writing direction and avoid hard-coding
left/right for every language direction.

## Developer perspective

Use normal flow and layout systems first; use positioning for overlays,
badges, anchored controls, and sticky elements. Inspect ancestors and
stacking-context triggers when layering seems wrong.

**Containing block** is the reference box for positioned coordinates;
**stacking context** is a local painting order; **normal flow** is the
browser's default layout participation.

## Common misconceptions

- `position: relative` does not remove an element from flow.
- A higher `z-index` does not always win across stacking contexts.
- `fixed` content can obscure users when zoomed or on small screens.

## Check your understanding

1. Which position value removes an element from normal flow?
2. Why may a child with `z-index: 9999` still appear behind another element?
3. When is sticky positioning useful?

## Further learning

- [MDN: Position](https://developer.mozilla.org/en-US/docs/Web/CSS/position)
- [MDN: Stacking context](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_positioned_layout/Stacking_context)
