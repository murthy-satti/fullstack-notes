# React Hooks and Effects

Hooks are functions that let function components use React features such as
state and context. Effects synchronize a component with systems outside
React, such as subscriptions or browser APIs.

## Why it matters

Hooks support reusable stateful logic without class components. Effects are
useful when rendering must connect to an external system, but using them for
ordinary calculations can make code harder to follow.

## How effects work

`useEffect` runs after React commits a render. Its dependency list tells React
which reactive values the effect uses. A cleanup function can unsubscribe or
release resources before the effect runs again or the component is removed.
Development Strict Mode may run setup and cleanup an extra time to reveal
unsafe effects.

## Practical example

```jsx
import { useEffect, useState } from "react";

function OnlineStatus() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  return <p>{online ? "Online" : "Offline"}</p>;
}
```

## Developer perspective and terminology

Follow the Rules of Hooks: call hooks at the top level of a component or
custom hook, not conditionally or inside loops. **Dependency array** lists
reactive values used by an effect; **cleanup** reverses external setup;
**custom hook** reuses stateful logic between components.

## Common misconceptions

- An effect is not the normal place to derive one value from another; compute
  derived values during rendering when possible.
- An empty dependency array does not mean “run once in every environment”;
  development behavior and component remounts matter.
- Effects do not run during server rendering.

## Check your understanding

1. What kind of work belongs in an effect?
2. Why does an event listener effect need cleanup?
3. Why must hooks not be called conditionally?

## Further learning

- [React Learn: Synchronizing with Effects](https://react.dev/learn/synchronizing-with-effects)
- [React reference: `useEffect`](https://react.dev/reference/react/useEffect)
