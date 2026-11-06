# React Refs and Performance

A ref stores a value that persists between renders without causing a render
when it changes. Refs can also provide access to a DOM node for tasks such as
focusing an input.

## Practical example

```jsx
import { useRef } from "react";

function SearchBox() {
  const inputRef = useRef(null);

  return (
    <>
      <input ref={inputRef} aria-label="Search" />
      <button onClick={() => inputRef.current?.focus()}>Focus search</button>
    </>
  );
}
```

Ref values are mutable and are not reactive state. If a changed value must be
shown in the UI, use state instead.

## Measuring performance

Start by identifying a real user-visible problem. Use browser Performance
tools and React profiling tools where available. Avoid adding memoization
(`memo`, `useMemo`, `useCallback`) without evidence that repeated rendering or
calculation is a bottleneck.

**Ref** is a mutable container associated with a component; **memoization**
caches a result or component work under specified conditions; **profiling**
measures where time is spent.

## Developer perspective and misconceptions

Do not use refs as a second state system or to bypass React for routine UI
updates. Direct DOM manipulation may conflict with React's own updates. A
component re-render is not automatically a performance problem; optimize
measured expensive work.

## Check your understanding

1. Why does changing a ref not trigger a render?
2. When is state a better choice than a ref?
3. Why profile before adding memoization?

## Further learning

- [React Learn: Referencing values with refs](https://react.dev/learn/referencing-values-with-refs)
- [React Learn: Manipulating the DOM with refs](https://react.dev/learn/manipulating-the-dom-with-refs)
- [React Developer Tools](https://react.dev/learn/react-developer-tools)
