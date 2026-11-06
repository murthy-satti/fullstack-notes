# CSS Cascade, Specificity, and Inheritance

When multiple CSS declarations can style one property on an element, the
cascade determines which value is applied. Selectors identify elements;
specificity and other cascade rules help resolve competing declarations.

## How the cascade decides

The browser considers, in order, whether a declaration is relevant, its
origin and importance, cascade layer, specificity, scoping proximity where
applicable, and source order. A later rule does not automatically win when an
earlier declaration has greater precedence.

### Specificity

As a useful simplified comparison, specificity has three groups:

1. ID selectors, such as `#header`.
2. Class, attribute, and pseudo-class selectors, such as `.card`,
   `[disabled]`, and `:focus`.
3. Type and pseudo-element selectors, such as `button` and `::before`.

Compare groups left to right, not by adding them into a single number.
Universal selectors and combinators do not add specificity. Pseudo-class
`:where()` has zero specificity; `:is()`, `:not()`, and `:has()` use the
specificity of their arguments under the selector rules.

## Inheritance

Some properties, commonly text-related properties such as `color` and
`font-family`, inherit from an ancestor. Many layout properties do not.
`inherit`, `initial`, `unset`, and `revert` are global keyword values with
different reset behavior.

## Practical example

```css
article p { color: #333; } /* 0 IDs, 0 classes, 2 element selectors */
.notice { color: darkred; } /* 0 IDs, 1 class, 0 element selectors */
```

```html
<article>
  <p class="notice">The class selector wins in this example.</p>
</article>
```

The class rule has greater specificity than the two type selectors, assuming
the declarations have equal origin, importance, and layer.

## Cascade layers and `!important`

`@layer` lets a project establish ordering among groups of author styles.
Layer order is considered before selector specificity for normal declarations.
Important declarations reverse layer ordering. Use `!important` sparingly;
it can make later maintenance and overrides difficult.

## Developer perspective

Prefer simple selectors and establish layer or component conventions early.
When a style does not appear, inspect matched rules and computed styles in
DevTools. Use custom properties for repeated values:

```css
:root { --brand-color: #2457a7; }
.button { background: var(--brand-color); }
```

**Specificity** is selector precedence weight; **inheritance** passes selected
values from ancestors; **cascade layer** groups rules into an explicit order.

## Common misconceptions

- The last declaration does not always win.
- A class selector does not outrank a declaration with higher origin,
  importance, or layer precedence.
- Specificity is not calculated by treating every selector symbol as one
  point.
- `!important` does not fix a confusing stylesheet design.

## Check your understanding

1. Why can a matching rule still lose?
2. Which selector group outranks classes in the basic specificity comparison?
3. Does specificity come before cascade origin and importance?

## Further learning

- [MDN: Cascade](https://developer.mozilla.org/en-US/docs/Web/CSS/Cascade)
- [MDN: Specificity](https://developer.mozilla.org/en-US/docs/Web/CSS/Specificity)
- [MDN: Inheritance](https://developer.mozilla.org/en-US/docs/Web/CSS/inheritance)
