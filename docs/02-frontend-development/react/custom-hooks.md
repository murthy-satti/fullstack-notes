# React Custom Hooks

A custom Hook is a JavaScript function whose name begins with `use` and that
calls React Hooks. It lets components reuse stateful logic without sharing
the same state instance.

## Why use a custom Hook?

If multiple components need the same subscription or interaction logic, a
custom Hook can keep that behavior in one place. Each component calling the
Hook still gets its own Hook state unless the Hook connects to shared state
or an external store.

## Practical example

```jsx
import { useEffect, useState } from "react";

function useOnlineStatus() {
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

  return online;
}

function StatusMessage() {
  const online = useOnlineStatus();
  return <p>{online ? "Online" : "Offline"}</p>;
}
```

In server-rendered applications, use a stable initial value that matches
between server and client, then synchronize with the browser after mounting.
Libraries may provide external-store APIs for this use case.

## Rules of Hooks

- Call Hooks at the top level of a function component or another custom
  Hook.
- Do not call Hooks inside conditions, loops, nested functions, or event
  handlers.
- Call Hooks in the same order on every render.
- Use the `use` prefix for custom Hooks so lint tooling can identify Hook
  rules.

## Developer perspective and misconceptions

Extract a Hook when it gives behavior a meaningful name or removes real
duplication. Do not create a custom Hook only to hide a few lines of markup.
Custom Hooks share logic, not automatically shared state.

## Further learning

- [React Learn: Reusing logic with custom Hooks](https://react.dev/learn/reusing-logic-with-custom-hooks)
- [React reference: Rules of Hooks](https://react.dev/reference/rules/rules-of-hooks)
