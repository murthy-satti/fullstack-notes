# React Components, JSX, and Props

React components are reusable descriptions of interface parts. JSX is syntax
commonly used to describe the elements a component returns, and props pass
information from a parent component to a child.

## Why it matters

Breaking a page into focused components makes repeated UI easier to reuse
and helps keep each piece of behavior understandable. Props make the data
flow explicit.

## How it works

A function component receives props and returns React elements. JSX resembles
HTML but is JavaScript syntax with React-specific rules. JavaScript
expressions can be inserted with braces. Components should be named with an
uppercase first letter when used in JSX.

## Practical example

```jsx
function ProductCard({ name, price }) {
  return (
    <article>
      <h2>{name}</h2>
      <p>${price.toFixed(2)}</p>
    </article>
  );
}

function Catalog() {
  return <ProductCard name="Notebook" price={4.5} />;
}
```

## Developer perspective and terminology

Keep a component responsible for a clear UI concept. **Props** are
read-only inputs from a parent; **JSX** is syntax transformed by tooling;
**component tree** is the nested arrangement of components in a rendered UI.
With TypeScript, props can have an explicit type.

## Common misconceptions

- JSX is not directly understood by browsers without a build or transform
  step.
- Props should not be mutated by the receiving component.
- A component is not required for every single HTML element; use components
  where they clarify reuse or responsibility.

## Check your understanding

1. What is the direction of prop data flow?
2. How does JSX insert a JavaScript expression?
3. Why should a component have a clear responsibility?

## Further learning

- [React Learn: Your first component](https://react.dev/learn/your-first-component)
- [React Learn: Passing props to a component](https://react.dev/learn/passing-props-to-a-component)
