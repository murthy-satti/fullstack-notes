# Next.js Loading UI

`loading.tsx` provides a loading fallback for a route segment while eligible
server work is pending. It can make navigation feel responsive by showing
useful structure before slower work finishes.

## Example

```tsx
// app/products/loading.tsx
export default function LoadingProducts() {
  return <p role="status">Loading products…</p>;
}
```

The file creates a loading boundary associated with the route segment.
Streaming may allow ready portions of a page to appear while slower portions
continue. Exact behavior depends on route structure, data work, and
framework version.

## Design useful loading states

- Describe what is loading when that context helps.
- Keep the layout close to the final content to reduce visual movement.
- Use skeletons for stable content regions and `role="status"` for helpful
  status text when appropriate.
- Avoid indefinite spinners without explanation or recovery.

## Developer perspective and misconceptions

A loading fallback does not mean every task can be cancelled or retried.
It also does not replace explicit error handling. Use smaller boundaries
when parts of a page can load independently.

## Check your understanding

1. Which file convention provides route-level loading UI?
2. Why should a loading layout resemble the final content?
3. Does a loading boundary guarantee cancellation of pending work?

## Further learning

- [Next.js: Loading UI and streaming](https://nextjs.org/docs/app/building-your-application/routing/loading-ui-and-streaming)
