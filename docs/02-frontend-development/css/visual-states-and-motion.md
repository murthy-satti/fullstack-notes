# CSS Visual States and Motion

CSS controls not only the default appearance but also visual states such as
hover, keyboard focus, disabled controls, and transitions between states.

## Why it matters

Clear visual feedback helps users understand which control is active and what
will happen next. Thoughtful motion can explain a change, but unnecessary or
fast animation can distract or cause discomfort.

## How it works

Pseudo-classes such as `:hover`, `:focus-visible`, and `:disabled` match
element states. Transitions interpolate supported property changes over time.
Animations can define multiple steps, while the `prefers-reduced-motion`
media feature lets a page respect a user's operating-system preference.

## Practical example

```css
.button {
  background: #2457a7;
  color: white;
  transition: background-color 150ms ease;
}

.button:hover { background: #173c79; }
.button:focus-visible { outline: 3px solid orange; outline-offset: 3px; }

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    scroll-behavior: auto !important;
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

## Developer perspective and terminology

Do not remove the keyboard focus indicator unless you replace it with an
equally clear one. Keep motion short and meaningful. **Pseudo-class** matches
a state; **transition** interpolates a property change; **reduced motion** is
a user preference that should influence nonessential animation.

## Common misconceptions

- Hover is not available on every device and must not be the only feedback.
- Focus styling is important for keyboard users, not just decoration.
- A transition is not appropriate for every property or every user.

## Check your understanding

1. What does `:focus-visible` represent?
2. Why should a control communicate state without relying on hover alone?
3. How can CSS respond to a reduced-motion preference?

## Further learning

- [MDN: Using media queries](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_media_queries/Using_media_queries)
- [MDN: `prefers-reduced-motion`](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion)
