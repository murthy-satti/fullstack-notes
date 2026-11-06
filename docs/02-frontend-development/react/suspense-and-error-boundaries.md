# React Suspense and Error Boundaries

Suspense lets a part of a React tree display a fallback while a supported
child is not ready. Error boundaries display fallback UI when descendant
rendering throws an error.

## Suspense

```jsx
import { Suspense, lazy } from "react";

const HelpPanel = lazy(() => import("./HelpPanel"));

function Page() {
  return (
    <Suspense fallback={<p>Loading help…</p>}>
      <HelpPanel />
    </Suspense>
  );
}
```

`lazy` defers loading a component's code until it is rendered. Suspense
behavior for data sources depends on the library or framework providing that
integration; wrapping an arbitrary Promise does not automatically make it
Suspense-enabled.

## Error boundaries

An error boundary catches errors thrown while rendering descendants and
shows fallback UI. In React's core API, error boundaries are traditionally
implemented with a class component or supplied by a framework/library.
They do not automatically catch errors in event handlers, arbitrary
asynchronous callbacks, or server requests; handle those at their proper
boundary.

## Developer perspective

Place boundaries around areas that can fail or load independently. A useful
fallback should preserve context, explain what happened, and offer a next
step when possible. Log unexpected failures without exposing sensitive
details.

**Fallback** is temporary or recovery UI; **code splitting** loads code in
separate chunks; **error boundary** catches descendant render/lifecycle
errors within its supported scope.

## Common misconceptions

- Suspense does not automatically fetch data from any Promise.
- A React error boundary does not catch every JavaScript error.
- A loading fallback should not be the only feedback for a failed operation.

## Further learning

- [React reference: `Suspense`](https://react.dev/reference/react/Suspense)
- [React reference: `lazy`](https://react.dev/reference/react/lazy)
- [React: Error Boundary](https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary)
