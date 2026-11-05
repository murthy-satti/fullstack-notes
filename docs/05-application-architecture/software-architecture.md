# Software Architecture

## Introduction

Software architecture describes the important structures of a software system and the decisions that shape how its parts work together. It includes components, their responsibilities, communication paths, and constraints. Architecture is not only a diagram: it also includes decisions about deployment, data, and quality goals.

## Why does it exist?

As an application grows, a single feature change can affect many areas. Clear boundaries help teams understand where responsibilities belong and how changes may ripple through the system. Architecture makes trade-offs visible, but cannot eliminate them.

## How does it work?

An architect or team identifies system goals—such as security, maintainability, responsiveness, and availability—then chooses structures that support them. A monolith packages many capabilities in one deployable application; a service-oriented design separates capabilities into communicating processes. Both can work well. Boundaries, ownership, and operational maturity often matter more than a label.

Architecture evolves as constraints change. Teams document high-impact decisions, validate them with prototypes or measurements, and revisit them when evidence changes.

## Real-world example

A small course platform may begin as one application with modules for accounts, lessons, and progress. Keeping modules distinct can support a simple deployment now while making ownership clearer if the product later grows.

## Developer perspective

Understand the responsibilities and interfaces of the component you are changing. Prefer explicit contracts, keep related behavior close, and avoid introducing a distributed service unless the boundary solves a real problem. Document important assumptions and operational requirements alongside code.

## Practical example

For a local design exercise, sketch a browser, application, and database. Label each arrow with the request or data being exchanged. Then ask which component validates input, owns the data, and handles failure. This diagram is a discussion aid, not a deployment prescription.

## Important terminology

- **Component:** a system part with a defined responsibility.
- **Boundary:** a separation of responsibility or change ownership.
- **Quality attribute:** a non-functional goal, such as reliability or maintainability.
- **Trade-off:** a benefit gained at the cost of another property.

## Advantages and disadvantages

Good architecture makes responsibilities and constraints easier to reason about. Documentation and abstraction can become overhead when they do not inform decisions. Distributed designs can improve independent deployment but add network failures and operational work.

## Common misconceptions

There is no universally best architecture, and microservices are not automatically more scalable. An architecture diagram does not prove that a system meets its goals. A useful design is one a team can build, operate, and change.

## Revision questions

1. What is the difference between a component and a boundary?
2. Why might a modular monolith be a reasonable starting point?
3. Which quality attribute matters most for a system you use?

## Further Learning & References

- **Official AWS documentation — [AWS Well-Architected Framework](https://docs.aws.amazon.com/wellarchitected/latest/framework/welcome.html):** provides a structured set of questions and pillars for evaluating cloud workloads.
- **Third-party explanation — [Martin Fowler: Microservices](https://martinfowler.com/articles/microservices.html):** explains the microservices style and the organizational and technical trade-offs involved.
