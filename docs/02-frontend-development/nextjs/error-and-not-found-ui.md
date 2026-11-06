# Next.js Error and Not-Found UI

The App Router provides special files for unexpected rendering errors and
missing resources. Clear boundaries let an application show a useful
recovery path without exposing internal details.

## Error boundaries

`error.tsx` creates an error boundary for a route segment and must be a
Client Component. It receives an error and a `reset` function in current
App Router conventions:

```tsx
"use client";

export default function ProductsError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section>
      <h2>Products could not be loaded.</h2>
      <button onClick={() => reset()}>Try again</button>
    </section>
  );
}
```

`reset()` retries the boundary's rendering attempt; it cannot guarantee an
underlying service has recovered. A segment's boundary generally does not
catch errors from its own parent layout. `global-error.tsx` handles root
level failures and must provide document tags because it replaces the root
layout.

## Missing-resource UI

`not-found.tsx` defines UI for a missing route or resource. Application code
can call `notFound()` when a requested record does not exist. A not-found
screen is not an authorization mechanism; protect private records before
rendering them.

## Developer perspective

Model expected outcomes—such as invalid input, no matching record, or
permission denied—deliberately. Log unexpected failures through a safe
server-side observability path and do not display sensitive stack traces or
internal service details.

## Common misconceptions

- An error boundary does not catch every failure in the entire application.
- A retry button does not ensure the failed service is healthy.
- A not-found page does not protect a private URL.

## Check your understanding

1. Why must `error.tsx` be a Client Component?
2. What does `reset()` attempt to do?
3. Why is a not-found page not access control?

## Further learning

- [Next.js: Error handling](https://nextjs.org/docs/app/building-your-application/routing/error-handling)
- [Next.js: `notFound`](https://nextjs.org/docs/app/api-reference/functions/not-found)
