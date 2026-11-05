# System Design

## Introduction

System design is the process of turning requirements into a plan for a system's components, data, interfaces, and operating behavior. It combines product needs with technical constraints. A good design is not the most complicated one; it is a clear, testable fit for the expected workload and quality goals.

## Why does it exist?

Before implementation, a team needs to agree on what the system must do and how well it must do it. Design helps expose questions about traffic, data ownership, security, failure, cost, and future changes while there is still time to compare options.

## How does it work?

Start with functional requirements (what users can do) and non-functional requirements (how the service should perform, remain available, or protect data). Estimate workload at a useful level, define APIs and data models, and sketch the major components. Consider normal and failure paths. Then compare approaches, record assumptions, and validate uncertain areas with a small prototype or measurement.

System design overlaps with [software architecture](software-architecture.md), while concerns such as [caching](caching.md), [queues](message-queues.md), and [scalability](scalability.md) are techniques to consider—not default requirements.

## Real-world example

For a simple photo-sharing demo, requirements might include uploading an image, viewing it, and limiting access to its owner. A design discussion should address where metadata and image bytes live, how access is checked, and what the user sees if storage is unavailable.

## Developer perspective

Clarify ambiguous requirements before choosing technologies. Make security, privacy, and failure handling part of the design. Keep the first version proportional to known needs, define how success will be measured, and revisit estimates when real usage provides evidence.

## Practical example

For a local-only exercise, write three requirements for a notes app, draw a browser-to-application-to-database flow, and annotate where identity is checked and where notes are stored. Discuss a database timeout without connecting to any external service.

## Important terminology

- **Functional requirement:** behavior the system must provide.
- **Non-functional requirement:** quality target or constraint.
- **Workload:** expected pattern and volume of system activity.
- **Failure mode:** way a component or interaction can stop working.

## Advantages and disadvantages

Designing early can prevent expensive misunderstandings and reveal risks. Exact capacity estimates are uncertain, and too much design before feedback can slow learning. Treat plans as hypotheses to validate and update.

## Common misconceptions

System design is not a one-time interview diagram or a choice of fashionable tools. A system can be simple yet thoughtfully designed. Adding redundancy or caching without a requirement may increase failure modes instead of reducing risk.

## Revision questions

1. How do functional and non-functional requirements differ?
2. Why should a design include failure paths?
3. Which assumptions in a design should be validated first?

## Further Learning & References

- **Official AWS documentation — [AWS Well-Architected Framework](https://docs.aws.amazon.com/wellarchitected/latest/framework/welcome.html):** offers questions for reviewing operational, security, reliability, and performance decisions.
- **Official AWS documentation — [Architecture Center](https://aws.amazon.com/architecture/):** provides reference architectures and design material for common workloads.
