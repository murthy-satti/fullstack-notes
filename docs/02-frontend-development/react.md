# React

## Introduction

React is a JavaScript library for building user interfaces from reusable
components. A component describes a part of the interface, such as a button,
navigation bar, or product card. React updates the page when the data used by
those components changes.

## Why does it exist?

As interfaces grow, manually coordinating every DOM update becomes difficult.
React lets developers describe what the interface should look like for a
particular state. It then manages updates when that state changes, while
components encourage reuse and separation of concerns.

## How does it work?

Components are commonly JavaScript functions that return JSX, a syntax
extension for describing UI. Props pass information from a parent component;
state represents data that can change over time. React renders the component
tree and updates the DOM as needed. Hooks such as `useState` let function
components use React features.

## Real-world example

A shopping cart button might display an item count. When a user adds a
product, the count changes, and the component renders the new value rather
than requiring code to find and manually edit a text node.

## Developer perspective

Keep components focused, use stable keys when rendering lists, and avoid
changing state directly. State should live at the nearest common component
that needs it. Learn [JavaScript](javascript.md) first; [TypeScript](typescript.md)
can describe props and state, while [Next.js](nextjs.md) builds on React for
full-stack web applications.

## Practical example

```jsx
import { useState } from "react";

function LikeButton() {
  const [likes, setLikes] = useState(0);
  return <button onClick={() => setLikes(likes + 1)}>Likes: {likes}</button>;
}
```

Calling the state setter requests a render with the updated count.

## Important terminology

- **Component:** Reusable unit that describes part of a user interface.
- **Props:** Inputs passed to a component by its parent.
- **State:** Component data that can change and trigger a render.
- **JSX:** Syntax for describing UI in JavaScript source.

## Advantages and disadvantages

Components and declarative rendering help organize interactive interfaces.
React introduces concepts and tooling to learn, and careless state placement
or unnecessary rendering can make an application harder to understand or less
efficient.

## Common misconceptions

- React is a library, not a complete routing or server framework by itself.
- JSX is transformed by tooling; browsers do not interpret JSX directly.
- A component render does not mean React always rebuilds the entire page DOM.

## Revision questions

1. How do props differ from state?
2. What does a state setter do?
3. Why should rendered list items have stable keys?

## Further Learning & References

- **Official docs:** [React Learn](https://react.dev/learn) teaches components, state, events, and rendering with interactive explanations.
- **Official API reference:** [React reference](https://react.dev/reference/react) documents the React APIs and built-in components.
