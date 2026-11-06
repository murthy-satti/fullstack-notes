# Message Queues

## Introduction

A message queue lets one part of a system hand work to another without requiring both to finish at the same moment. A producer sends a message; a consumer processes it. This suits asynchronous work such as sending a receipt.

## Why does it exist?

Some tasks take longer than a user-facing request should wait or depend on a temporarily unavailable service. A queue buffers work, smooths bursts, and separates responsibilities.

## How does it work?

A producer submits a task or event message to a broker. A consumer reads and processes it, then acknowledges success. Unacknowledged messages may be delivered again, so consumers should tolerate duplicates. Repeated failures need bounded retries and a review path.

## Real-world example

An online shop can record an order first and place a “send confirmation” message on a queue. A separate worker sends the email. If the mail provider is briefly unavailable, the worker can retry without holding the customer's checkout request open.

## Developer perspective

Define message format, retry policy, and failure handling. Make side effects idempotent where possible: processing a message twice should not repeat an action. Monitor queue depth and age.

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

Queues absorb spikes and reduce timing dependencies. They add moving parts and delays; ordering and delivery guarantees vary by product.

## Common misconceptions

A queue does not guarantee exactly-once side effects. Acknowledgment does not prove business logic was correct, and a queue cannot fix a consumer that cannot keep up.

## Further Learning & References

- **Official AWS documentation — [Amazon SQS Developer Guide](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/welcome.html):** explains a managed queue service, its concepts, and usage.
- **Official AWS documentation — [Queue-based load leveling pattern](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/queue-based-load-leveling.html):** describes how a queue can separate producers from slower consumers.
