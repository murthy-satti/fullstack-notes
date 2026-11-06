# Next.js Hydration Errors and Troubleshooting

Hydration is the process where React in the browser attaches behavior to
HTML that was rendered on the server. A hydration mismatch happens when the
initial browser render does not match the HTML the server produced.

## Common causes

- Rendering different values on server and browser, such as `Date.now()`,
  random numbers, or locale-dependent formatting.
- Reading `window`, `localStorage`, or browser-only state during the initial
  render.
- Invalid HTML nesting that the browser repairs before React hydrates it.
- Data changing between server rendering and the first browser render.
- Browser extensions modifying the page before hydration.
- Using a component or library that assumes it only runs in a browser.

## Debugging workflow

1. Read the mismatch message and identify the component and element.
2. Compare server-generated markup with the first client render.
3. Check invalid nesting and values that vary by time, randomness, locale,
   or environment.
4. Move genuinely browser-only work to an effect that runs after hydration,
   or use an intentional client-only rendering boundary when appropriate.
5. Ensure server and client start with the same data and deterministic
   markup.
6. Re-test with extensions disabled only when needed to rule out extension
   interference.

## Avoid masking the cause

`suppressHydrationWarning` is an escape hatch for a narrow, intentional
text/attribute difference; it does not fix a mismatched component tree.
Disabling SSR for a component can be appropriate for a browser-only widget,
but can affect initial content and performance. Prefer deterministic
initial rendering where possible.

## Practical example

This is risky during initial rendering because time may differ:

```tsx
function Clock() {
  return <time>{new Date().toLocaleTimeString()}</time>;
}
```

For a live client clock, render a deterministic placeholder first and update
after mounting, or format a server-provided timestamp consistently.

## Developer perspective and terminology

**Hydration** attaches client-side React behavior to server output.
**Mismatch** means the expected initial client tree differs from the server
HTML. **Deterministic rendering** produces the same initial result for the
same inputs and environment.

## Common misconceptions

- Hydration errors are not always caused by Next.js itself.
- `useEffect` can avoid an initial mismatch for browser-only values, but using
  it for every piece of data can cause flicker and delayed content.
- `suppressHydrationWarning` should not be applied broadly.

## Further learning

- [Next.js: React hydration error](https://nextjs.org/docs/messages/react-hydration-error)
- [React: `hydrateRoot`](https://react.dev/reference/react-dom/client/hydrateRoot)
