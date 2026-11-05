# Message Queues

## Introduction

A message queue lets one part of a system hand work to another part without requiring both to complete the work at the same moment. A producer sends a message; a consumer receives and processes it. Queues are useful when work can happen asynchronously, such as sending a receipt after an order is accepted.

## Why does it exist?

Some tasks take longer than a user-facing request should wait, or depend on a service that is temporarily unavailable. A queue can buffer work, smooth bursts, and separate responsibilities. It does not remove failure; it gives a system a controlled way to handle and retry some work.

## How does it work?

A producer creates a message describing a task or event and submits it to a broker. The broker stores or routes messages according to its delivery model. A consumer reads a message, performs the work, then acknowledges successful processing. Unacknowledged messages may be delivered again, so consumers should usually tolerate duplicate attempts. Poison messages—those that repeatedly fail—need bounded retries and a review path.

## Real-world example

An online shop can record an order first and place a “send confirmation” message on a queue. A separate worker sends the email. If the mail provider is briefly unavailable, the worker can retry without holding the customer's checkout request open.

## Developer perspective

Define message ownership, format, versioning, retry policy, and what happens when processing fails. Make side effects idempotent where possible: processing the same message twice should not charge a customer twice or create duplicate work. Monitor queue depth and age, not just whether the broker responds.

## Practical example

Safe local-only pseudocode illustrates the flow:

```text
queue = LocalDemoQueue()
queue.publish({"type": "welcome-email", "user_id": 42})

message = queue.receive()
if message is not None:
    print("Would prepare email for demo user", message["user_id"])
    queue.acknowledge(message)
```

## Important terminology

- **Producer/consumer:** sends messages / processes messages.
- **Broker:** service that stores, routes, or delivers messages.
- **Acknowledgment:** confirmation that a message was handled.
- **Dead-letter queue:** holding place for messages that cannot be processed normally.

## Advantages and disadvantages

Queues reduce tight timing dependencies and can absorb workload spikes. They add moving parts, delivery delays, and eventual rather than immediate results. Queue ordering and delivery guarantees vary by product and configuration.

## Common misconceptions

A queue is not automatically a database or a guarantee of exactly-once side effects. Acknowledgment does not prove that downstream business logic was correct. Adding a queue also does not fix a consumer that cannot keep up.

## Revision questions

1. Why might email delivery be moved to a worker?
2. Why should consumers expect possible duplicate delivery?
3. What metrics help reveal a growing backlog?

## Further Learning & References

- **Official AWS documentation — [Amazon SQS Developer Guide](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/welcome.html):** explains a managed queue service, its concepts, and usage.
- **Official AWS documentation — [Queue-based load leveling pattern](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/queue-based-load-leveling.html):** describes how a queue can separate producers from slower consumers.
