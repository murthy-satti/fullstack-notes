# TypeScript with React

TypeScript can describe React component props, event handlers, state, and
children. It helps document component contracts and catch incompatible values
while editing.

## Typing component props

```tsx
type GreetingProps = {
  name: string;
  formal?: boolean;
};

function Greeting({ name, formal = false }: GreetingProps) {
  return <p>{formal ? `Good day, ${name}` : `Hi, ${name}`}</p>;
}
```

TypeScript can infer many event types from JSX context. Add annotations when
they clarify an API or when inference cannot identify the intended type.

## State and events

Use `useState` with a clear initial value when inference is sufficient. When
state may have multiple forms, use a union type. Prefer native DOM event types
provided by React's type definitions rather than broad `any`.

## Developer perspective

Avoid typing every component as a generic React component type unless a real
API requires it. Type the data the component accepts and returns, and keep
runtime validation at external boundaries.

**Props type** describes a component's input contract; **event type**
describes the event value provided to a handler; **inference** derives types
from the surrounding JSX and values.

## Common misconceptions

- TypeScript does not validate props received from arbitrary runtime
  JavaScript automatically.
- `React.FC` is not required for every function component.
- A type assertion cannot repair an incorrectly shaped response.

## Check your understanding

1. How can an optional prop be represented?
2. Why should API data be validated at runtime even when components are typed?
3. When can React infer an event type?

## Further learning

- [React TypeScript Cheatsheet](https://react-typescript-cheatsheet.netlify.app/)
- [TypeScript Handbook: JSX](https://www.typescriptlang.org/docs/handbook/jsx.html)
