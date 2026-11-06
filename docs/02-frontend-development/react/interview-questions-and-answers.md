# React Interview Questions and Answers

These questions review React's component model, state, rendering, and
common application patterns.

## Components and state

### 1. What is React?

React is a JavaScript library for building user interfaces from reusable
components. It describes UI based on data and updates the rendered
interface when relevant state changes.

### 2. What is a React component?

A component is a reusable unit of UI, commonly a JavaScript function that
returns React elements. Components can receive props and use state and
other React features.

### 3. What are props?

Props are inputs passed from a parent component to a child. A component
should treat its props as read-only and ask the owner to change data
through callbacks or shared state.

### 4. What is state?

State is data managed by a component or React store that can change over
time. Updating state requests a render; it does not directly mutate the
already-rendered UI.

### 5. Why should state not be mutated directly?

React relies on update patterns and identity to reason about changes.
Mutating existing state can make updates hard to detect and reason about.
Create updated arrays or objects and pass them through the state setter.

### 6. What are Hooks?

Hooks are functions such as `useState` and `useEffect` that let function
components use React features. Call Hooks at the top level of a component
or custom Hook, not conditionally or inside loops.

### 7. What is `useEffect` for?

`useEffect` synchronizes a component with an external system after rendering,
such as a subscription or browser API. It is not needed for every
calculation or for deriving values that can be computed during render.

## Rendering and lists

### 8. Why do list items need keys?

Keys help React match items between renders so it can update the correct
elements. Use a stable identifier from the data; array indexes can cause
incorrect state association when items are inserted, removed, or reordered.

### 9. What is reconciliation?

Reconciliation is React's process for comparing the new element description
with the previous one and determining updates to apply. It is an
implementation concept, not a guarantee that every update has a particular
performance cost.

### 10. What is a controlled input?

A controlled input gets its current value from React state and updates that
state through an event handler. An uncontrolled input keeps its current
value in the DOM and can be read with a ref or form APIs.

### 11. What is Context used for?

Context makes a value available to descendants without passing it through
every intermediate component's props. It is useful for shared values such
as theme or locale, but frequent broad updates may cause unnecessary
rendering.

### 12. What is a ref?

A ref stores a mutable value that persists between renders without itself
triggering a render. Refs can also reference DOM elements for focus or
measurement when appropriate.

## Reliability and performance

### 13. What is the difference between `useMemo` and `useCallback`?

`useMemo` caches a computed value between renders when dependencies are
unchanged. `useCallback` caches a function identity. They are performance
tools, not correctness fixes, and should be used when measurement or
component behavior justifies them.

### 14. What is an Error Boundary?

An Error Boundary catches certain rendering errors in its descendant
component tree and displays fallback UI. It does not catch every error,
such as most event-handler errors or arbitrary asynchronous failures.

### 15. What is Suspense used for?

Suspense displays a fallback while a supported child operation is pending,
such as certain code-loading or data integrations. It only handles work
integrated with Suspense; it does not automatically track every Promise.

### 16. How should a React component be tested?

Test observable behavior: render the component, interact as a user would,
and assert visible results or accessible state. Keep tests focused and
avoid depending unnecessarily on private implementation details.

## Further learning

- [React overview](../react.md)
- [React documentation](https://react.dev/learn)
- [React: Rules of Hooks](https://react.dev/reference/rules/rules-of-hooks)
