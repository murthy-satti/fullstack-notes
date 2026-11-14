# Testing Fundamentals

## Introduction

Software testing checks whether a program behaves as intended and reveals defects before users encounter them. Tests can be automated or manual. Testing gives evidence about behavior under selected conditions; it does not prove software is perfect.

## Why does it exist?

Small code changes can affect other parts of an application. Tests make expected behavior visible, support refactoring, and catch regressions. They document decisions about edge cases and errors.

## How does it work?

Start from requirements. A unit test checks a small piece; an integration test checks component interactions; an end-to-end test exercises a user journey. Good suites balance speed, confidence, and maintenance. Tests should be repeatable and have clear assertions.

## Real-world example

For a shopping cart, unit tests can verify quantity calculations, integration tests can check that orders are saved correctly, and an end-to-end test can verify a customer can add an item and see the updated total.

## Developer perspective

Test normal cases, boundaries, and expected failures. Use descriptive names and make each test explain a behavior. When fixing a bug, add a test that would have caught it. A green suite covers only the scenarios it checks.

## Practical example

For a function that computes a discount, check a normal eligible purchase, a purchase below the minimum, and an invalid negative amount. Assert the exact results and error behavior. Run the focused tests while iterating, then run the wider suite before sharing the change.

## Important terminology

- **Assertion:** a condition a test expects to be true.
- **Regression:** a previously working behavior that breaks after a change.
- **Fixture:** prepared state or data used by a test.
- **Coverage:** a measure of which code or behavior tests exercise; it is not a measure of correctness.

## Advantages and disadvantages

Tests can catch regressions early and make refactoring less risky. They cost time to create and maintain, and brittle tests can slow teams without adding confidence. Prefer meaningful behavior checks over maximizing line coverage alone.

## Common misconceptions

- A passing test does not guarantee absence of bugs.
- High code coverage does not guarantee useful assertions.
- Manual testing and automated testing complement one another.

## Further Learning & References

- **Official documentation:** [pytest documentation](https://docs.pytest.org/en/stable/) explains Python test discovery, assertions, fixtures, and running tests.
- **Third-party explanation:** [Martin Fowler: Test Pyramid](https://martinfowler.com/articles/practical-test-pyramid.html) discusses balancing test levels and feedback speed.
- Continue with [Performance Testing](performance-testing.md) and [OWASP](owasp.md).
