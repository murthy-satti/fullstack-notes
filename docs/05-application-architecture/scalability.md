# Scalability

## Introduction

Scalability is a system's ability to handle growth in users, requests, or data while meeting its responsiveness goals. Growth may require changing how work is performed or stored. [System design](system-design.md) provides a broader view.

## Why does it exist?

A design that works for a demo may become slow under higher load. Planning helps identify bottlenecks, but scaling before measuring can waste money and add complexity.

## How does it work?

Vertical scaling adds resources to one machine; horizontal scaling adds instances and distributes requests. Horizontal approaches may require load balancing, shared state, and safe concurrent work. Caching, queues, and indexes can reduce repeated work.

A system may be limited by its database, network, or an external service. Metrics and load tests help find the constraint.

## Real-world example

A registration service gets a burst when enrollment opens. A load balancer can distribute requests and a queue defer confirmation emails. Adding web instances alone may increase database pressure.

## Developer perspective

Identify workload and service goals, then measure latency, throughput, errors, and resource use. Scale the bottleneck, check costs, and test failure behavior.

## Practical example

For a local demo, record response duration while repeating a harmless request to a local endpoint. Compare a small and larger sample, then inspect logs and resource use. This is an observation exercise, not a production load test; avoid sending generated traffic to systems you do not own.

## Important terminology

- **Vertical scaling:** increasing resources on one machine.
- **Horizontal scaling:** adding machines or service instances.
- **Throughput:** work completed per unit of time.
- **Latency:** time taken for one operation.
- **Bottleneck:** constrained component limiting overall performance.

## Advantages and disadvantages

Scaling can improve capacity but raises cost and complexity. Horizontal scaling exposes state-sharing challenges; scaling blindly may only move a bottleneck.

## Common misconceptions

More servers do not guarantee faster responses or reliability. “Scale later” works best when architecture preserves a path to evolve.

## Revision questions

1. How do vertical and horizontal scaling differ?
2. Why can adding application instances overload a database?
3. Which measurements would help locate a bottleneck?

## Further Learning & References

- **Official AWS documentation — [Reliability Pillar: Design Principles](https://docs.aws.amazon.com/wellarchitected/latest/reliability-pillar/design-principles.html):** discusses resilient workload design, including scaling and recovery principles.
- **Official AWS documentation — [Elastic Load Balancing](https://docs.aws.amazon.com/elasticloadbalancing/latest/userguide/what-is-load-balancing.html):** explains distributing traffic across targets.
