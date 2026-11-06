# CSS Architecture and Debugging

CSS architecture is how a project organizes styles so that rules remain
understandable as the interface grows. Debugging is the process of finding
why the browser computed an unexpected result.

## Keep styles maintainable

- Use clear component or feature class names.
- Keep selectors as simple as practical.
- Group related rules and avoid broad global overrides.
- Use custom properties for shared colors, spacing, and typography.
- Remove obsolete rules instead of layering new overrides indefinitely.

CSS Modules, utility classes, and naming conventions are different
organization strategies; none removes the need to understand the cascade.

## Debug in the browser

1. Inspect the element in DevTools.
2. Check the matched rules and identify overridden declarations.
3. Review computed styles, inherited properties, and the box model.
4. Toggle one declaration to test a hypothesis.
5. Inspect the parent layout and containing block if geometry is unexpected.

## Terminology

**Cascade conflict** occurs when multiple declarations compete. **Computed
style** is the resolved property value. **Specificity** is one factor in
resolving rules. **CSS Module** scopes class names through a build-time
mechanism, depending on the toolchain.

## Common misconceptions

- Increasing selector complexity is not the only way to fix a rule conflict.
- CSS Modules do not change how layout or properties work.
- A computed value may come from inheritance or browser defaults, not only
  the rule closest to the element.

## Check your understanding

1. What should you inspect when a style appears crossed out?
2. Why are complex selectors costly to maintain?
3. What does a CSS Module scope?

## Further learning

- [MDN: CSS troubleshooting](https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Styling_basics/Debugging_CSS)
- [Chrome DevTools: Inspect and change CSS](https://developer.chrome.com/docs/devtools/css/)
