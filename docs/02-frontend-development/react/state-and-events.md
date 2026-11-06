# React State and Events

State is data that changes over time and affects what a component displays.
Event handlers connect user actions—such as clicks and form input—to updates.

## Why it matters

Interactive interfaces need a reliable source of truth. React state lets a
component describe the UI for the current data rather than manually editing
DOM nodes after every action.

## How it works

`useState` returns a current value and a setter. Calling the setter schedules
a render using the updated value. When a new value depends on the previous
one, use the functional update form to avoid stale values.

## Practical example

```jsx
import { useState } from "react";

function Counter() {
  const [count, setCount] = useState(0);

  return (
    <button onClick={() => setCount((current) => current + 1)}>
      Count: {count}
    </button>
  );
}
```

The state setter requests a render; it does not directly edit the DOM.

## Developer perspective and terminology

Keep state as close as practical to the components that need it. **State** is
component data that can change; **event handler** is a function run in
response to an event; **render** calculates the UI for current props and
state.

## Common misconceptions

- Do not mutate arrays or objects stored in state; create updated values.
- A state update may be batched and is not an immediate variable assignment.
- Props and state have different owners: a component receives props and owns
  its local state.

## Check your understanding

1. What does calling a state setter request?
2. When is a functional state update useful?
3. Why should objects in state be updated immutably?

## Further learning

- [React Learn: State — a component's memory](https://react.dev/learn/state-a-components-memory)
- [React Learn: Responding to events](https://react.dev/learn/responding-to-events)
