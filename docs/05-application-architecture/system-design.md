# System Design

System design is the process of turning requirements into an architecture: the
components, the data they store, the APIs between them, and the way they
handle scale and failure. It combines everything in this section, from
caching and queues to replication and consistency, into concrete decisions for
a specific problem.

## What system design involves

- **Requirements:** what the system must do (functional) and how well it must
  do it (non-functional: latency, availability, consistency, scale, cost).
- **Estimation:** rough numbers for requests per second, storage, and
  bandwidth that tell you which problems are real.
- **Interfaces and data:** the API the system exposes and the data model
  behind it.
- **High-level design:** the main components and how a read and a write flow
  through them.
- **Deep dives:** the hardest parts, such as generating unique IDs, fanning
  out messages, or keeping caches consistent.
- **Trade-offs:** what was chosen, what was rejected, and why.

## How a system design discussion flows

1. Clarify the requirements and agree on what is in and out of scope.
2. Estimate the scale with back-of-the-envelope numbers.
3. Define the core API endpoints.
4. Sketch the data model and choose the storage.
5. Draw the high-level design and walk through the main read and write paths.
6. Deep-dive into the bottlenecks and failure modes.
7. Summarize the trade-offs and how the design would evolve with more scale.

## Practical example

```text
Requirement: "Shorten URLs; 100 million new links per month; reads are 100x writes."

Writes: 100,000,000 / (30 * 24 * 3600 s) ≈ 40 per second (peak ~ 80)
Reads:  40 * 100 ≈ 4,000 per second (peak ~ 8,000)
Storage: 100,000,000 links * 500 bytes ≈ 50 GB per month ≈ 600 GB per year

Conclusion: writes are modest; reads dominate, so cache hot links and serve
redirects from memory; one primary database is enough for writes at first.
```

Thirty seconds of arithmetic shows where the design effort should go.

## System design topic map

**The method**

- [The system design process](system-design/system-design-process.md)
- [Back-of-the-envelope estimation](system-design/back-of-the-envelope-estimation.md)
- [System design building blocks](system-design/building-blocks.md)

**Case studies**

- [Case study: URL shortener](system-design/case-study-url-shortener.md)
- [Case study: distributed rate limiter](system-design/case-study-rate-limiter.md)
- [Case study: chat application](system-design/case-study-chat-application.md)
- [Case study: news feed](system-design/case-study-news-feed.md)
- [Case study: notification system](system-design/case-study-notification-system.md)

**Review**

- [System design interview questions and answers](system-design/interview-questions-and-answers.md)

## Developer perspective and common misconceptions

Start from requirements and numbers, not from favorite technologies. Keep the
first design simple, find its bottleneck, and fix that bottleneck. State every
trade-off out loud; in real projects and interviews, the reasoning matters as
much as the final diagram.

- There is no single correct design; there are designs that fit the
  requirements better or worse.
- Adding every component (Kafka, Redis, sharding) to every design is not
  thoroughness; each one must be justified.
- Estimates do not need to be precise; they need the right order of
  magnitude.
- A design is not finished at the happy path; failures, retries, and data
  growth are part of it.

## Further learning

- [Microsoft Azure Architecture Center](https://learn.microsoft.com/en-us/azure/architecture/)
- [The Amazon Builders' Library](https://aws.amazon.com/builders-library/)
- [Scalability](scalability.md) for the principles behind the case studies
- [System design interview questions and answers](system-design/interview-questions-and-answers.md)
