# Software Architecture

## Introduction

Software architecture describes a system's important structures and the decisions shaping how its parts work together. It includes components, responsibilities, communication, and constraints—not just a diagram.

## Why does it exist?

As an application grows, one feature change can affect many areas. Clear boundaries help teams see responsibilities and trade-offs.

## How does it work?

A team identifies goals such as security or maintainability, then chooses structures that support them. A monolith packages capabilities in one application; a service-oriented design separates them into communicating processes. Either can work well.

Teams document high-impact decisions and revisit them when constraints change.

## Real-world example

A course platform may begin as one application with modules for accounts, lessons, and progress. Distinct modules clarify responsibility without requiring separate deployments.

## Developer perspective

Understand the responsibilities and interfaces of the component you change. Prefer explicit contracts and avoid distributed services unless they solve a real problem.

## Practical example

For a local design exercise, sketch a browser, application, and database. Label each arrow with the request or data being exchanged. Then ask which component validates input, owns the data, and handles failure. This diagram is a discussion aid, not a deployment prescription.

## Important terminology

- **Component:** a system part with a defined responsibility.
- **Boundary:** a separation of responsibility or change ownership.
- **Quality attribute:** a non-functional goal, such as reliability or maintainability.
- **Trade-off:** a benefit gained at the cost of another property.

## Advantages and disadvantages

Good architecture clarifies responsibilities. Unhelpful abstraction becomes overhead; distributed designs add network failures and operations work.

## Common misconceptions

There is no universally best architecture, and microservices are not automatically more scalable. A useful design is one a team can operate and change.

## Further Learning & References

- **Official AWS documentation — [AWS Well-Architected Framework](https://docs.aws.amazon.com/wellarchitected/latest/framework/welcome.html):** provides a structured set of questions and pillars for evaluating cloud workloads.
- **Third-party explanation — [Martin Fowler: Microservices](https://martinfowler.com/articles/microservices.html):** explains the microservices style and the organizational and technical trade-offs involved.
