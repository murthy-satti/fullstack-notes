# Software Architecture

Software architecture is the set of significant decisions about a system's
structure: how it is split into parts, what each part is responsible for, how
the parts depend on and talk to each other, and which qualities, such as
availability, performance, or ease of change, the structure is optimized for.
These are the decisions that are expensive to reverse later.

## What software architecture covers

- **Structure:** whether the system is one deployable application, a modular
  monolith, or many services, and where the boundaries between parts lie.
- **Dependencies:** which parts may depend on which, for example business
  logic that does not depend on a web framework or database driver.
- **Communication:** in-process function calls, synchronous HTTP or gRPC, or
  asynchronous events through a broker.
- **Quality attributes:** the non-functional requirements, such as
  scalability, availability, security, and maintainability, that drive the
  choices above.
- **Principles and patterns:** reusable solutions, such as repositories,
  dependency injection, sagas, and the outbox, that keep code and systems
  understandable.

## How architectural decisions are made

1. Identify the requirements, especially the quality attributes that matter
   most for this system and the constraints (team size, budget, deadlines).
2. List the realistic options for the decision, such as one service or
   several.
3. Compare the options against the quality attributes and name the trade-offs
   explicitly.
4. Choose, and record the decision and its reasons in an architecture decision
   record (ADR) so future developers understand why.
5. Revisit the decision when the requirements change; good architecture
   evolves.

## Practical example

The same "place order" feature can be structured very differently:

```text
Modular monolith                      Microservices
----------------                      -------------
OrdersModule.placeOrder()             Orders service  --HTTP-->  Inventory service
  -> InventoryModule.reserve()            |
  -> PaymentsModule.charge()              +--event "OrderPlaced"--> Payments service
  (one process, one database,             (separate deploys and databases,
   one transaction)                         network calls, eventual consistency)
```

The modular monolith can use one database transaction and is simple to deploy
and debug. The microservices version lets teams deploy independently and scale
parts separately, but must handle network failures and coordinate data with
patterns such as sagas. Neither is better in general; the requirements decide.

## Software architecture topic map

**Foundations**

- [Architecture fundamentals](software-architecture/architecture-fundamentals.md)
- [Monoliths, modular monoliths, and microservices](software-architecture/monolith-modular-monolith-microservices.md)
- [Layered, hexagonal, and clean architecture](software-architecture/layered-hexagonal-and-clean-architecture.md)

**Principles and patterns**

- [Design principles](software-architecture/design-principles.md)
- [Design patterns for backends](software-architecture/design-patterns-for-backends.md)
- [Domain-driven design](software-architecture/domain-driven-design.md)

**Distributed architecture**

- [Event-driven architecture](software-architecture/event-driven-architecture.md)
- [Microservices patterns](software-architecture/microservices-patterns.md)
- [Serverless architecture](software-architecture/serverless-architecture.md)

**Review**

- [Software architecture interview questions and answers](software-architecture/interview-questions-and-answers.md)

## Developer perspective and common misconceptions

Start simple and add structure when a real problem demands it. Keep business
rules independent of frameworks and infrastructure so they can be tested and
changed easily, and write down important decisions with their reasons.

- Microservices are not an upgrade from a monolith. They buy strong module
  boundaries, independent deployment, and technology choice at the cost of
  distribution, eventual consistency, and operational complexity.
- Architecture is not only diagrams; it is the decisions and the reasons
  behind them.
- A design pattern is not automatically good; it adds indirection that must
  pay for itself.
- Architecture is not decided once; it should evolve as requirements, scale,
  and teams change.

## Further learning

- [Martin Fowler: Software Architecture Guide](https://martinfowler.com/architecture/)
- [Microsoft Azure Architecture Center](https://learn.microsoft.com/en-us/azure/architecture/)
- [Software architecture interview questions and answers](software-architecture/interview-questions-and-answers.md)
