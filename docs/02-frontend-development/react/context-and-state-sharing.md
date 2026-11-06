# React Context and State Sharing

Context lets a component make a value available to descendants without
passing it through every intermediate component. It is useful for data such
as the current theme or locale that many components need.

## When to use context

If only a few nearby components need state, keep it in their closest shared
parent and pass props. Context can reduce repetitive prop passing across
deep trees, but a frequently changing context value can cause many consumers
to update.

## Practical example

```jsx
import { createContext, useContext } from "react";

const ThemeContext = createContext("light");

function Page() {
  return (
    <ThemeContext.Provider value="dark">
      <Toolbar />
    </ThemeContext.Provider>
  );
}

function Toolbar() {
  const theme = useContext(ThemeContext);
  return <p>Current theme: {theme}</p>;
}
```

In modern React, provider syntax and conventions may vary by React version;
follow the version used by the project.

## State ownership

“Lifting state up” means moving shared state to the nearest common ancestor
that needs to coordinate it. Context distributes a value; it does not
automatically provide a complete state-management architecture.

## Developer perspective and terminology

Keep context values focused and stable. **Provider** supplies a context
value; **consumer** reads it; **lifting state up** moves ownership to a shared
parent. For complex shared client state, choose a dedicated store only when
the application has a need for its capabilities.

## Common misconceptions

- Context is not automatically faster or simpler than props.
- Context does not replace server data fetching or persistence.
- Any component reading a changed context value may need to render again.

## Further learning

- [React Learn: Passing data deeply with context](https://react.dev/learn/passing-data-deeply-with-context)
- [React reference: `useContext`](https://react.dev/reference/react/useContext)
