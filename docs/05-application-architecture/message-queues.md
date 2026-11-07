# Message Queues

A message queue lets one part of a system send work or information to another
part without waiting for it to be processed. The sender, called the producer,
puts a message on a broker; one or more receivers, called consumers, take
messages from the broker and process them at their own pace. This decouples
services in time, in availability, and in load.

## What message queues provide

- **Decoupling:** producers do not need to know which consumers exist or
  whether they are running right now.
- **Load leveling:** a burst of messages waits in the queue instead of
  overwhelming the consumers.
- **Resilience:** if a consumer crashes, messages wait and are redelivered
  instead of being lost.
- **Scalability:** more consumers can be added to process a queue faster.
- **Fan-out:** one event can be delivered to many independent subscribers.

The costs are eventual consistency, duplicate deliveries that consumers must
handle, harder debugging, and another piece of infrastructure to operate.

## How a message moves through a queue

1. The producer sends a message, such as `{"type": "OrderPlaced", "orderId":
   "o_789"}`, to the broker.
2. The broker stores it durably in a queue (or topic partition).
3. A consumer receives the message and processes it, for example by sending a
   confirmation email.
4. The consumer acknowledges the message, and the broker removes it or
   advances the consumer's position.
5. If the consumer fails before acknowledging, the broker redelivers the
   message, possibly to another consumer; after repeated failures it is moved
   to a dead-letter queue for inspection.

## Practical example

```text
Without a queue                         With a queue
---------------                         ------------
POST /orders                            POST /orders
  save order          20 ms               save order              20 ms
  charge card        300 ms               publish OrderPlaced       5 ms
  send email         800 ms             -> 201 Created (25 ms)
  update analytics   200 ms
-> 201 Created (1.3 s)                  Workers, later and independently:
   (and fails if email is down)           email worker, analytics worker
```

The request returns quickly, and a slow or failing email provider no longer
fails order creation.

## Message queues topic map

- [Messaging fundamentals](message-queues/messaging-fundamentals.md)
- [Delivery guarantees and ordering](message-queues/delivery-guarantees.md)
- [RabbitMQ](message-queues/rabbitmq.md)
- [Apache Kafka](message-queues/apache-kafka.md)
- [Cloud queues: SQS and SNS](message-queues/cloud-queues-sqs-and-sns.md)
- [Messaging patterns](message-queues/messaging-patterns.md)

**Review**

- [Message queues interview questions and answers](message-queues/interview-questions-and-answers.md)

## Developer perspective and common misconceptions

Design consumers to be idempotent, because almost every broker delivers some
messages more than once. Acknowledge only after processing succeeds, give
every queue a dead-letter queue, and monitor queue depth and message age.
Choose the broker by the problem: a task queue, a durable event log, or a
managed cloud service.

- A queue does not guarantee exactly-once processing on its own; idempotent
  consumers do the real work.
- Asynchronous does not mean faster for the user who needs the result; it
  means the result arrives later.
- Kafka and RabbitMQ are not interchangeable; one is a replayable log, the
  other a routing message broker.
- A message queue is not a database; set retention and plan for messages that
  can never be processed.

## Further learning

- [RabbitMQ tutorials](https://www.rabbitmq.com/tutorials)
- [Apache Kafka documentation](https://kafka.apache.org/documentation/)
- [Amazon SQS Developer Guide](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/welcome.html)
- [Background jobs and scheduling](../03-backend-development/backend-concepts/background-jobs-and-scheduling.md)
- [Message queues interview questions and answers](message-queues/interview-questions-and-answers.md)
