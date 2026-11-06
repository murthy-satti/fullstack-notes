# System Design

## Introduction

System design turns requirements into a plan for a system's components, data, interfaces, and operating behavior. A good design fits the expected workload and quality goals without unnecessary complexity.

## Why does it exist?

Before implementation, a team should agree on what the system must do and how well. Design exposes questions about traffic, security, failure, cost, and future changes.

## How does it work?

Start with functional requirements (what users can do) and non-functional requirements (performance, availability, or security goals). Estimate workload, define APIs and data models, and sketch components and failure paths. Compare approaches and validate uncertain areas.

System design overlaps with [software architecture](software-architecture.md), while concerns such as [caching](caching.md), [queues](message-queues.md), and [scalability](scalability.md) are techniques to consider—not default requirements.

## Real-world example

For a photo-sharing demo, requirements might include uploading, viewing, and restricting images to their owner. Decide where image data lives, how access is checked, and what happens if storage is unavailable.

## Developer perspective

Clarify requirements before choosing technologies. Include security and failure handling, keep the first version proportional to need, and measure its results.

## Practical example

For a local-only exercise, write three requirements for a notes app, draw a browser-to-application-to-database flow, and annotate where identity is checked and where notes are stored. Discuss a database timeout without connecting to any external service.

## Important terminology

- **Functional requirement:** behavior the system must provide.
- **Non-functional requirement:** quality target or constraint.
- **Workload:** expected pattern and volume of system activity.
- **Failure mode:** way a component or interaction can stop working.

## Advantages and disadvantages

Designing early can reveal risks, but capacity estimates are uncertain. Too much design before feedback slows learning; update plans as evidence changes.

## Common misconceptions

System design is not a choice of fashionable tools. A simple system can be well designed; unneeded redundancy or caching may add failure modes.

## Further Learning & References

- **Official AWS documentation — [AWS Well-Architected Framework](https://docs.aws.amazon.com/wellarchitected/latest/framework/welcome.html):** offers questions for reviewing operational, security, reliability, and performance decisions.
- **Official AWS documentation — [Architecture Center](https://aws.amazon.com/architecture/):** provides reference architectures and design material for common workloads.
