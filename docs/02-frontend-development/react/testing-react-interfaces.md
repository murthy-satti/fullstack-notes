# Testing React Interfaces

React interface tests verify behavior a user or another component depends
on. They help catch regressions when props, state, forms, and async UI change.

## What to test

- A component shows the expected content for its inputs.
- User actions produce visible, correct results.
- Loading, success, empty, and error states are understandable.
- Important keyboard and form behavior works.

Prefer queries based on accessible roles and labels where possible. Tests
should check observable behavior rather than private implementation details
such as internal hook call counts.

## Practical example

With a testing library installed and configured, a test might render a
button and assert that activating it changes the visible count. Keep setup
specific to the project's chosen test runner; React itself does not prescribe
one universal test stack.

## Developer perspective and terminology

Use unit tests for small logic, component tests for UI behavior, and
end-to-end tests for important user journeys across the app. **Assertion**
checks an expected result; **mock** replaces a dependency for a test;
**test double** is a controlled substitute such as a fake or stub.

## Common misconceptions

- A test that passes does not prove every real-world browser case works.
- Snapshot output alone may not explain whether behavior is correct.
- Tests tied to implementation details can break during harmless refactoring.

## Further learning

- [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/)
- [Vitest documentation](https://vitest.dev/guide/)
