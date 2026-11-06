# React Lists, Forms, and UI States

Lists, forms, and request states are common building blocks in React
applications. Model them explicitly so the interface remains understandable
for loading, empty, success, and error situations.

## Rendering lists and keys

Use `map()` to return UI for each item. A `key` helps React match items
between renders and should come from stable data such as a database ID.

```jsx
function TaskList({ tasks }) {
  if (tasks.length === 0) return <p>No tasks yet.</p>;

  return (
    <ul>
      {tasks.map((task) => (
        <li key={task.id}>{task.title}</li>
      ))}
    </ul>
  );
}
```

Keys are only required among siblings and are not passed to the component as
a normal prop. Array indexes can cause incorrect associations when items are
inserted, deleted, or reordered; use them only when the list is static and
never changes order.

## Controlled form fields

A controlled input gets its value from React state. Its `onChange` handler
updates that state:

```jsx
import { useState } from "react";

function SearchForm() {
  const [query, setQuery] = useState("");

  function submit(event) {
    event.preventDefault();
    console.log("Search:", query);
  }

  return (
    <form onSubmit={submit}>
      <label htmlFor="query">Search</label>
      <input
        id="query"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <button type="submit">Search</button>
    </form>
  );
}
```

Controlled fields are useful when the UI must respond to each edit, validate
as the user types, or coordinate multiple fields.

## Uncontrolled form fields

An uncontrolled input keeps its current value in the DOM. Use `defaultValue`
for its initial value, and read the submitted data through `FormData` or a
ref. This can be simpler for a basic form. Do not mix `value` and
`defaultValue` for the same field.

## Request and form states

Represent state explicitly:

```ts
type RequestState<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: T }
  | { status: "error"; message: string };
```

A discriminated union prevents impossible combinations such as `loading`
and `error` being true at the same time. Show validation errors next to
fields, announce status changes appropriately, and prevent accidental
duplicate submissions when needed.

## Developer perspective and terminology

Use semantic labels and native form controls. A controlled input's state
should update synchronously in its change handler. **Controlled input** gets
its value from React; **uncontrolled input** holds its value in the DOM;
**discriminated union** represents mutually exclusive state cases.

## Common misconceptions

- A key is used by React for matching and is not automatically a component
  prop.
- An array index is not always a safe key.
- Client-side validation improves UX but does not replace server validation.
- A disabled button alone may not explain why submission is unavailable.

## Check your understanding

1. What does a stable key help React do?
2. How does a controlled input receive its displayed value?
3. What states should a request-driven UI represent?
4. Why must the server validate submitted values?

## Further learning

- [React Learn: Rendering lists](https://react.dev/learn/rendering-lists)
- [React Learn: Reacting to input with state](https://react.dev/learn/reacting-to-input-with-state)
- [React Learn: Sharing state between components](https://react.dev/learn/sharing-state-between-components)
