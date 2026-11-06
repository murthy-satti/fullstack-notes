# React

React is a JavaScript library for building user interfaces from components.
A React component describes UI for its current inputs; state and events let
the interface respond to user actions.

## What React provides

- **Components:** reusable functions that describe interface parts.
- **Props:** inputs passed from a parent component.
- **State:** data that changes and causes the UI to update.
- **JSX:** syntax for describing UI in JavaScript source.
- **Hooks:** functions such as `useState`, `useEffect`, and `useContext` that
  connect function components to React capabilities.
- **Rendering and reconciliation:** React calculates UI and applies needed
  updates to the host environment.

React itself does not prescribe a complete application architecture,
server-rendering strategy, or built-in router. Frameworks such as
[Next.js](nextjs.md) build on React and supply application-level conventions.

## How a React update works

1. A user event invokes an event handler.
2. The handler may call a state setter.
3. React renders the affected component tree using current props and state.
4. React reconciles the result and commits necessary DOM changes.
5. Effects synchronize with external systems after commit where appropriate.

Rendering should be pure: do not mutate external state, manipulate the DOM,
or make side-effecting requests while calculating the component output.

## Practical example

```jsx
import { useState } from "react";

function LikeButton() {
  const [likes, setLikes] = useState(0);
  return (
    <button onClick={() => setLikes((current) => current + 1)}>
      Likes: {likes}
    </button>
  );
}
```

Calling the state setter requests a render with the updated count.

## React topic map

- [Components, JSX, and props](react/components-jsx-props.md)
- [State and events](react/state-and-events.md)
- [Hooks and effects](react/hooks-and-effects.md)
- [Custom hooks](react/custom-hooks.md)
- [Lists, forms, and UI states](react/lists-forms-states.md)
- [Rendering and reconciliation](react/rendering-and-reconciliation.md)
- [Context and state sharing](react/context-and-state-sharing.md)
- [Refs and performance](react/refs-and-performance.md)
- [Suspense and error boundaries](react/suspense-and-error-boundaries.md)
- [Testing React interfaces](react/testing-react-interfaces.md)

## Developer perspective and common misconceptions

Learn JavaScript first. Keep components focused, use stable list keys, and
place state at the nearest common owner that needs it. Learn accessibility
and browser behavior alongside React; a framework does not automatically
make controls accessible.

- React is not the same thing as JSX; JSX is commonly used syntax transformed
  by build tooling.
- A component render does not mean the browser rebuilds the entire DOM.
- Effects are for synchronizing with external systems, not a default place
  for every calculation.
- State setters schedule updates; they do not synchronously replace the
  current variable's value.

## Check your understanding

1. How do props differ from state?
2. What does a state setter request?
3. Why should render logic be pure?

## Further learning

- [React Learn](https://react.dev/learn)
- [React API reference](https://react.dev/reference/react)
- [React Interview Questions and Answers](react/interview-questions-and-answers.md)
