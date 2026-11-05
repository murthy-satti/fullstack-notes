# Scalability

## Introduction

Scalability is a system's ability to handle growth in users, requests, or data while meeting its goals for responsiveness and reliability. Growth does not always mean adding servers; it may require changing how work is performed or stored. [System design](system-design.md) provides a broader way to reason about these choices.

## Why does it exist?

A design that works for a small demo may become slow or unreliable under higher load. Planning for growth helps teams identify bottlenecks and make deliberate trade-offs. Prematurely scaling every component can waste money and add complexity, so measurement matters.

## How does it work?

Vertical scaling adds resources—such as CPU or memory—to one machine. Horizontal scaling adds instances and distributes requests among them. Horizontal approaches often require shared or partitioned state, load balancing, health checks, and safe handling of concurrent work. Caching, queues, and database indexes can also increase capacity by reducing repeated or synchronous work.

Capacity is not a single number: a system may be limited by its database, network, external service, or a hot partition. Load tests and production metrics help find the actual constraint.

## Real-world example

A class registration service experiences a burst when enrollment opens. A load balancer can distribute web requests across several application instances, while a queue can defer confirmation emails. Database limits still need attention; adding web instances alone may increase database pressure.

## Developer perspective

Start by identifying the target workload and service goals, then measure latency, throughput, errors, and resource use. Scale the bottleneck, check costs, and test failure behavior. Keep the system observable and use staged changes so the team can compare before and after results.

## Practical example

For a local demo, record response duration while repeating a harmless request to a local endpoint. Compare a small and larger sample, then inspect logs and resource use. This is an observation exercise, not a production load test; avoid sending generated traffic to systems you do not own.

## Important terminology

- **Vertical scaling:** increasing resources on one machine.
- **Horizontal scaling:** adding machines or service instances.
- **Throughput:** work completed per unit of time.
- **Latency:** time taken for one operation.
- **Bottleneck:** constrained component limiting overall performance.

## Advantages and disadvantages

Scaling can improve capacity and resilience, but may raise cost and operational complexity. Horizontal scaling can expose state-sharing and coordination challenges. Scaling without measurement can move a bottleneck rather than remove it.

## Common misconceptions

More servers do not guarantee faster responses. Scalability is not the same as reliability: a system can handle more requests yet still fail in one region. “Scale later” is reasonable only when architecture choices preserve a path to evolve.

## Revision questions

1. How do vertical and horizontal scaling differ?
2. Why can adding application instances overload a database?
3. Which measurements would help locate a bottleneck?

## Further Learning & References

- **Official AWS documentation — [Reliability Pillar: Design Principles](https://docs.aws.amazon.com/wellarchitected/latest/reliability-pillar/design-principles.html):** discusses resilient workload design, including scaling and recovery principles.
- **Official AWS documentation — [Elastic Load Balancing](https://docs.aws.amazon.com/elasticloadbalancing/latest/userguide/what-is-load-balancing.html):** explains distributing traffic across targets.
