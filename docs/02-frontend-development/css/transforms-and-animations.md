# CSS Transforms and Animations

Transforms change how an element is drawn without changing its normal-flow
layout position. Transitions interpolate property changes; keyframe
animations define named sequences of styles.

## Transform properties and functions

| Property/function | Purpose |
|---|---|
| `transform` | Applies one or more 2D/3D transform functions |
| `translate()` | Moves an element along axes |
| `rotate()` | Rotates around an axis |
| `scale()` | Changes drawn size |
| `skew()` | Slants drawn geometry |
| `transform-origin` | Sets the point used for a transform |
| `perspective` | Adds depth perspective for 3D transforms |

```css
.card:hover {
  transform: translateY(-0.2rem);
}
```

Transforms do not make surrounding content reflow to the transformed
position. They can create stacking contexts and affect overflow.

## Transitions

The `transition` shorthand combines property, duration, timing function, and
delay. The longhands are `transition-property`,
`transition-duration`, `transition-timing-function`, and
`transition-delay`.

```css
.button {
  background-color: #2457a7;
  transition: background-color 160ms ease;
}

.button:hover {
  background-color: #173c79;
}
```

Transition only the properties that need a smooth change. Avoid
`transition: all` when it can animate an unintended property.

## Keyframe animations

`@keyframes` defines a sequence; `animation` applies it. Related properties
include `animation-name`, `duration`, `timing-function`, `delay`,
`iteration-count`, `direction`, `fill-mode`, and `play-state`.

```css
@keyframes appear {
  from { opacity: 0; transform: translateY(0.5rem); }
  to { opacity: 1; transform: translateY(0); }
}

.notice {
  animation: appear 180ms ease-out both;
}
```

## Accessibility and performance

Respect reduced-motion preferences for nonessential motion:

```css
@media (prefers-reduced-motion: reduce) {
  .notice {
    animation: none;
    transition: none;
  }
}
```

Motion should communicate change, not obscure it. Prefer animating `transform`
or `opacity` when appropriate, but profile real pages—compositor behavior and
performance depend on the browser and page.

## Common misconceptions

- A transform changes drawing, not normal-flow layout.
- Adding `will-change` everywhere can use more memory; use it only after
  evidence of a need.
- Reduced-motion support is not just disabling every transition; preserve
  essential state feedback.

## Check your understanding

1. How do a transition and keyframe animation differ?
2. Why does transform not move neighboring content in normal flow?
3. How can CSS respect a user's reduced-motion preference?

## Further learning

- [MDN: Using CSS transitions](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_transitions/Using_CSS_transitions)
- [MDN: CSS animations](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_animations/Using_CSS_animations)
- [MDN: `prefers-reduced-motion`](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion)
