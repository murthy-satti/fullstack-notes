# Message Queues Interview Questions and Answers

These questions review messaging fundamentals, delivery guarantees,
RabbitMQ, Apache Kafka, managed cloud queues, and the patterns that make
asynchronous systems reliable. Each question is tagged **Beginner**,
**Intermediate**, or **Advanced**; the final group contains scenario-based
questions drawn from real production work.

## Fundamentals

### 1. What is a message queue, and why would you use one?

A message queue is a buffer, managed by a broker, where producers put
messages and consumers take them out to process later. It decouples services
in time and space, levels out bursts of load, and lets consumers scale
independently. It can retain work during consumer outages when the queue and
messages are configured for durable storage, subject to retention limits.

### 2. What are a producer, a consumer, and a broker?

The producer creates and sends messages. The broker (RabbitMQ, Kafka, SQS)
receives, stores, routes, and delivers them. The consumer receives messages,
processes them, and acknowledges them so the broker knows they are done.

### 3. What is the difference between a queue and a topic?

In a queue, each message is processed by one consumer, even if several
consumers read from it (point-to-point). With a topic, each message is
delivered to every subscriber (publish/subscribe). Queues suit tasks and
commands; topics suit events that several parts of the system care about.

### 4. What is the difference between a command and an event?

A command asks a specific receiver to do something (`SendInvoice`) and
usually has one consumer. An event records that something happened
(`OrderPlaced`); the producer does not know or care who reacts, and there may
be many consumers. Mixing them up couples producers to consumers.

### 5. What is the difference between push and pull consumers?

With push, the broker sends messages to consumers as they arrive (RabbitMQ,
SNS), so it needs flow control such as prefetch limits. With pull, consumers
ask for messages when ready (Kafka, SQS), which gives natural backpressure;
long polling keeps latency low without empty request storms.

### 6. When should you use asynchronous messaging instead of a synchronous HTTP call?

Use messaging when the caller does not need the result to continue: sending
emails, updating search indexes, notifying other services, slow or
unreliable work. Use synchronous calls when the user needs the answer now,
such as validating a coupon or reading data to display.

### 7. What should a message envelope contain?

A unique message ID (for deduplication), a type, a timestamp, a schema
version, a correlation ID (to trace a flow across services and logs), and
the payload. Optional fields include a causation ID, reply-to address, and
routing or partition key.

### 8. What is the difference between a message broker and an event-streaming platform?

A broker such as RabbitMQ or SQS deletes messages once acknowledged and
tracks per-message state, with rich routing and per-message retries. A
streaming platform such as Kafka keeps an append-only log for a retention
period; consumers track their own offsets and can replay history, and many
independent groups can read the same data.

### 9. How does request-reply work over a message queue?

The requester sends a message containing a reply-to address and a
correlation ID, then waits with a timeout. The responder sends its answer to
the reply-to address with the same correlation ID, which the requester uses
to match the reply to the pending request.

## Delivery guarantees and ordering

### 10. Explain at-most-once, at-least-once, and exactly-once delivery.

At-most-once acknowledges before processing, so a crash can lose the
message. At-least-once acknowledges after processing, so a crash can cause a
duplicate. Exactly-once means each message affects the system exactly once;
in practice it is achieved only inside a closed system or approximated with
deduplication and idempotency.

### 11. Why is exactly-once delivery not achievable in general?

The consumer's side effect (a database write or API call) and its
acknowledgement to the broker are two separate actions in different systems.
A crash between them either loses the ack (causing a duplicate) or loses the
work (if acked first). No protocol can make two independent systems commit
atomically without coordination.

### 12. What does "effectively once" mean?

It means at-least-once delivery combined with idempotent processing. The
broker may deliver a message more than once, but the consumer detects or
tolerates duplicates so the business effect happens only once.

### 13. How do you make a consumer idempotent?

Use naturally idempotent operations (set values, upserts), conditional
updates that only apply in the expected state, or a deduplication (inbox)
table keyed by message ID that is written in the same transaction as the
business change. For external APIs, pass the message ID as an idempotency
key.

### 14. Why should messages be acknowledged after processing rather than on receipt?

Acknowledging on receipt marks the message done before the work happens; if
the consumer then crashes, the message is lost. Acknowledging after the side
effect is durable means a crash leads to redelivery instead, which idempotent
consumers handle safely.

### 15. What is a visibility timeout, and what goes wrong if it is too short?

In SQS, a received message is hidden from other consumers for the visibility
timeout. If processing takes longer, the message reappears and a second
consumer processes it concurrently. Set the timeout above worst-case
processing time and extend it during long jobs.

### 16. What ordering guarantees do RabbitMQ, Kafka, and SQS provide?

RabbitMQ queues are FIFO, but multiple consumers and requeues reorder
processing. Kafka guarantees order only within a partition. SQS standard
queues offer best-effort ordering; FIFO queues guarantee order within a
message group.

### 17. How do you preserve order for related messages while keeping parallelism?

Route related messages by a key (customer or order ID) to the same partition,
message group, or session. Each key is processed in order, while different
keys are processed in parallel. Version numbers in events let consumers
detect gaps or stale events.

### 18. What is a poison message, and how do you handle it?

A poison message fails every time it is processed, for example malformed
data or a message that triggers a bug. Without limits it is retried forever
or blocks an ordered channel. Cap the number of attempts and move it to a
dead-letter queue for inspection.

### 19. What is a dead-letter queue?

A DLQ holds messages that could not be processed after a configured number
of attempts, or that were explicitly rejected or expired. It keeps failures
from blocking or looping in the main queue and lets engineers inspect, fix,
and replay them. A DLQ should always have an alert.

## RabbitMQ

### 20. Describe RabbitMQ's routing model.

Producers publish to an exchange with a routing key. Bindings connect
exchanges to queues with rules, and the exchange copies each message into
every queue whose binding matches. Consumers read from queues and acknowledge
messages.

### 21. What exchange types does RabbitMQ have?

Direct routes by exact routing key match. Topic routes by dot-separated
patterns, where `*` matches one word and `#` matches zero or more. Fanout
sends to all bound queues and ignores the key. Headers routes on message
header values instead of the key.

### 22. What is needed for a RabbitMQ message to survive a broker restart?

The queue must be durable and the message must be published as persistent.
Quorum queues are always durable. For the producer to know the message was
stored, it should also use publisher confirms.

### 23. What are publisher confirms?

A channel mode in which the broker acknowledges each published message once
it has taken responsibility for it (persisted and, for quorum queues,
replicated), or nacks it if it could not. Without confirms, a producer cannot
tell whether a message was lost on the way.

### 24. What does prefetch (basic.qos) do?

It limits how many unacknowledged messages the broker pushes to a consumer.
Without it, one consumer can receive thousands of messages, exhausting memory
and starving other consumers. Low values give fair dispatch for slow tasks;
higher values improve throughput for fast handlers.

### 25. When is a RabbitMQ message dead-lettered?

When it is rejected or nacked without requeue, when its TTL expires, when the
queue's length limit is exceeded, or when it exceeds a quorum queue's
delivery limit. It then goes to the queue's dead-letter exchange, with an
`x-death` header describing why.

### 26. What are quorum queues, and why use them?

Quorum queues are replicated across nodes using the Raft consensus
algorithm, so they keep data safe and available when a minority of nodes
fail. They are the recommended queue type for durable, important data and
support delivery limits for poison messages. They replaced the older mirrored
classic queues.

### 27. How can you implement delayed retries in RabbitMQ?

Send failed messages to a retry queue that has a message TTL and a
dead-letter exchange pointing back to the work queue. When the TTL expires,
the message is dead-lettered back for another attempt. Several retry queues
with growing TTLs give exponential backoff; the delayed message exchange
plugin is an alternative.

## Apache Kafka

### 28. What are topics, partitions, and offsets in Kafka?

A topic is a named stream of records. It is split into partitions, each an
ordered, append-only log stored on brokers. Each record in a partition has a
sequential offset, which consumers use to track their position.

### 29. How does Kafka decide which partition a record goes to?

If the record has a key, the key is hashed, so records with the same key
always go to the same partition and stay in order. Records without a key are
spread across partitions. Adding partitions later changes the mapping for
keys.

### 30. How do consumer groups work?

Consumers with the same group ID share a topic's partitions; each partition
is consumed by exactly one member at a time, so the group processes in
parallel. Separate groups each receive all records independently, which is
how Kafka provides publish/subscribe.

### 31. What happens if a consumer group has more consumers than partitions?

The extra consumers receive no partitions and sit idle. Partitions are the
unit of parallelism in a group, so to scale consumers you must have enough
partitions.

### 32. What is a rebalance, and why can it be a problem?

A rebalance reassigns partitions when consumers join, leave, crash, or exceed
the maximum poll interval. Consumption of affected partitions pauses, and
uncommitted work may be reprocessed. Cooperative rebalancing, static
membership, and short processing per poll reduce the impact.

### 33. How do offset commits relate to delivery guarantees?

Committing before processing gives at-most-once (a crash skips records);
committing after processing gives at-least-once (a crash reprocesses).
Committing offsets inside a Kafka transaction together with produced output
gives exactly-once for pipelines that stay within Kafka.

### 34. What do acks, replication factor, and min.insync.replicas control?

The replication factor is the number of copies of each partition.
`acks=all` makes the producer wait until all in-sync replicas have the
record. `min.insync.replicas` is the minimum number of replicas that must
acknowledge for the write to succeed. Together (for example 3, all, and 2)
they prevent data loss when one broker fails.

### 35. What is an idempotent producer?

A producer that tags records with a producer ID and per-partition sequence
numbers so the broker can discard duplicates caused by retries. It removes
duplicates introduced by the producer's own retries and keeps ordering.

### 36. What is log compaction?

A cleanup policy that keeps at least the latest record for each key and
discards older ones. A record with a null value (a tombstone) deletes the
key. Compacted topics store the current state per key, such as user
settings or changelogs for stream processing.

### 37. What is consumer lag, and why monitor it?

Consumer lag is the difference between the latest offset in a partition and
the group's committed offset. Growing lag means consumers are falling behind,
so data is processed later and may eventually be deleted by retention before
it is read.

### 38. When would you choose Kafka over RabbitMQ, and the reverse?

Choose Kafka for high-throughput event streams, many independent consumers,
replay, retention, and stream processing. Choose RabbitMQ for task queues and
commands that need flexible routing, per-message acknowledgements, retries,
delays, and priorities.

## Cloud queues

### 39. What is the difference between SQS standard and FIFO queues?

Standard queues offer very high throughput with at-least-once delivery and
best-effort ordering. FIFO queues guarantee order within each message group
and suppress duplicate sends with a deduplication ID within a five-minute
window, at lower throughput.

### 40. How do you acknowledge a message in SQS?

By deleting it with the receipt handle returned by the receive call. If it is
not deleted before the visibility timeout ends, it becomes visible again and
is redelivered.

### 41. Why use long polling with SQS?

Short polling returns immediately, often empty, wasting requests and money.
Long polling waits up to 20 seconds for messages to arrive, reducing empty
responses, cost, and the delay before a consumer sees a new message.

### 42. How does an SQS dead-letter queue work?

A redrive policy on the source queue names the DLQ and a `maxReceiveCount`.
When a message has been received more times than that without being deleted,
SQS moves it to the DLQ. After fixing the cause, messages can be redriven
back to the source queue.

### 43. What is the SNS to SQS fan-out pattern?

A producer publishes to one SNS topic, and several SQS queues subscribe to
it. Each queue receives its own copy and buffers it for its own consumers,
so services process independently and a slow consumer cannot affect others.
Filter policies let a queue receive only the events it needs.

## Patterns

### 44. What is the dual-write problem?

When a service must update its database and publish a message, the two
writes are not atomic. A crash between them leaves either a saved change
with no event (lost event) or an event about a change that was never saved
(phantom event).

### 45. How does the transactional outbox pattern work?

The service writes the event to an outbox table in the same database
transaction as the business change. A relay process (polling or change data
capture) publishes outbox rows to the broker and marks them sent. The event
is published if and only if the change committed, at least once.

### 46. What is the competing consumers pattern?

Several identical consumers read from the same queue, and each message is
delivered to only one of them. It scales throughput and tolerates worker
failures, but gives up ordering across messages.

### 47. How should retries be designed in a messaging system?

Classify failures: retry transient ones with exponential backoff and jitter
through delay or retry queues, and send permanent ones to the DLQ at once.
Cap the number of attempts, track the attempt count, and make consumers
idempotent because retries cause repeats.

### 48. How do you handle a growing backlog in a queue?

Find whether the cause is a traffic spike, slow consumers, or failing
messages. Scale consumers based on backlog age or depth, within the capacity
of downstream systems; fix or dead-letter failing messages; and apply
backpressure or shed low-priority work if consumers cannot catch up.

### 49. What is the claim-check pattern?

For large payloads, the producer stores the data in object storage and sends
a small message with a reference to it. The consumer fetches the payload
using the reference. It keeps messages under size limits and brokers fast.

### 50. What is a saga, and how does it relate to messaging?

A saga implements a business process across services as a series of local
transactions, each triggered by a message or event, with compensating actions
that undo earlier steps if a later step fails. Messaging carries the events
or commands between the steps, either by choreography or by an orchestrator.

## Scenario-based questions

### 51. Queue depth keeps growing every evening and messages are 20 minutes old by 9 p.m. What do you check?

**What to check first:** compare the arrival rate with the processing rate
over the evening, and look at the age of the oldest message rather than only
depth. Check whether consumers are busy (CPU, in-flight messages) or idle.

**How to confirm:** if consumers are saturated, the handler or a downstream
dependency is the limit; trace a few slow messages. If they are idle,
something limits delivery (prefetch, a single FIFO group, too few
partitions).

**Likely causes and fixes:** too few consumers for the evening peak (scale on
message age, capped by downstream capacity); a slow database query in the
handler (batch or index it); poison messages being retried repeatedly
(dead-letter them). See [messaging patterns](messaging-patterns.md).

### 52. Customers report receiving the same order confirmation email twice. How do you investigate?

**What to check first:** search logs for the message ID of an affected order
and see whether two workers, or one worker twice, processed it.

**How to confirm:** look at the receive count or `redelivered` flag, worker
crashes or deploys at that time, and processing durations compared with the
visibility timeout.

**Likely causes and fixes:** at-least-once redelivery after a crash before the
ack, or a visibility timeout shorter than processing time. Make the consumer
idempotent (record sent emails by message ID in the same transaction), and
fix the timeout. See [delivery guarantees](delivery-guarantees.md).

### 53. Orders exist in the database, but some downstream services never received their "OrderPlaced" events. Most cases coincide with deployments. Why?

**What to check first:** how the service publishes: after the database
commit, as a separate call?

**How to confirm:** compare order IDs in the database with published event
IDs for the deployment window; check whether the process was killed between
commit and publish (shutdown logs, missing publish logs).

**Likely causes and fixes:** the dual-write problem. A crash or SIGTERM
between the commit and the publish loses the event. Adopt the transactional
outbox with a relay, use publisher confirms, and add graceful shutdown. Run a
reconciliation job to republish the missing events. See
[messaging patterns](messaging-patterns.md).

### 54. Kafka consumer lag grows on one partition while all the others stay near zero. What do you check?

**What to check first:** the consumer logs for that partition: is it
repeatedly failing on the same offset?

**How to confirm:** check the bytes-in rate per partition (a hot key?) and
whether the consumer assigned to that partition is healthy.

**Likely causes and fixes:** a poison record that throws on every attempt
(publish it to a retry or dead-letter topic after N attempts and move on); a
skewed key that sends one tenant's traffic to one partition (choose a better
key or split the hot key); or a single slow consumer instance (replace it).
See [Apache Kafka](apache-kafka.md).

### 55. A Kafka consumer group rebalances every few minutes and throughput collapses. What is happening?

**What to check first:** consumer logs for partitions being revoked and
assigned, and the time taken to process each poll's batch compared with
`max.poll.interval.ms`.

**How to confirm:** correlate rebalances with long-running batches, pod
restarts, or deployments.

**Likely causes and fixes:** processing a batch takes longer than the poll
interval, so the broker considers the consumer dead (reduce the batch size or
speed up handling); frequent restarts during rolling deploys (use static
membership); eager rebalancing that stops all consumers (switch to
cooperative rebalancing). Make processing idempotent, as rebalances cause
reprocessing.

### 56. HTTP requests that publish to RabbitMQ suddenly hang and time out. What do you check?

**What to check first:** the RabbitMQ management UI or diagnostics for memory
or disk alarms, and whether clients received `connection.blocked`.

**How to confirm:** look at queue depths: a large backlog usually explains the
memory or disk pressure.

**Likely causes and fixes:** consumers stopped or slowed, so messages
accumulated until the broker blocked publishers to protect itself. Restore or
scale consumers, add queue length limits with an overflow policy, add disk,
and alert on queue depth long before the alarm thresholds. Add a publish
timeout so web requests fail fast. See [RabbitMQ](rabbitmq.md).

### 57. Two SQS workers process the same message at the same time. How?

**What to check first:** the queue's visibility timeout and the processing
time of the affected messages.

**How to confirm:** the message's `ApproximateReceiveCount` is 2 or more, and
the second receive happened just after the visibility timeout expired.

**Likely causes and fixes:** processing took longer than the visibility
timeout, so the message became visible again. Raise the timeout above the
worst-case processing time, extend it with `ChangeMessageVisibility` during
long jobs, and keep the consumer idempotent. See
[SQS and SNS](cloud-queues-sqs-and-sns.md).

### 58. Right after a release, the dead-letter queue receives thousands of messages. What do you do?

**What to check first:** sample several dead-lettered messages and their
recorded error reasons.

**How to confirm:** check whether the failures started exactly at the deploy
and whether they share a message type or schema version.

**Likely causes and fixes:** a consumer bug or an incompatible schema change
(a renamed field). Roll back or fix forward, then redrive the DLQ to the
source queue once the fix is live. Because consumers are idempotent, replaying
is safe. Prevent recurrence with schema compatibility checks in CI. See
[messaging patterns](messaging-patterns.md).

### 59. A partner API was down for an hour. Minutes after it recovered, it went down again under a flood of requests from your workers. Why?

**What to check first:** the retry policy of the workers and the request rate
to the partner when it recovered.

**How to confirm:** metrics show a spike far above normal traffic at the
moment of recovery; retries had no delay or jitter.

**Likely causes and fixes:** a retry storm: every message that failed during
the outage retried at once. Use exponential backoff with jitter, cap
attempts, add a circuit breaker, and limit worker concurrency to the
partner's rate limit. See
[timeouts, retries, and idempotency](../../03-backend-development/backend-concepts/timeouts-retries-and-idempotency.md).

### 60. An SQS queue subscribed to an SNS topic never receives any messages. What do you check?

**What to check first:** the subscription status and the topic's
`NumberOfNotificationsFailed` metric.

**How to confirm:** inspect the queue's access policy (does it allow this
topic to send?) and, for encrypted queues, the KMS key policy; check any
subscription filter policy against the message attributes.

**Likely causes and fixes:** a missing queue policy statement, a key policy
that does not allow SNS, or a filter policy that matches nothing. Fix the
policies, publish a test message, and alarm on delivery failures. See
[SQS and SNS](cloud-queues-sqs-and-sns.md).

### 61. Order status changes are sometimes applied out of order: orders show "shipped" and then flip back to "paid". How do you fix it?

**What to check first:** whether status events for the same order can be
processed in parallel or retried after later events.

**How to confirm:** logs show the "paid" event processed after "shipped" for
the same order ID, often after a retry.

**Likely causes and fixes:** competing consumers or retries on a channel with
no per-order ordering. Route events by order ID (Kafka key, FIFO message
group), and add version checks so a consumer only applies an event that moves
the state forward. See [delivery guarantees](delivery-guarantees.md).

### 62. An SQS FIFO queue processes slowly even though workers are mostly idle. Why?

**What to check first:** how many distinct `MessageGroupId` values are in
use.

**How to confirm:** sample messages; if most share one group ID, they must
be processed strictly one after another.

**Likely causes and fixes:** a constant group ID (for example the queue name)
serializes everything. Use a group ID per entity, such as an order or account
ID, so different groups run in parallel while each stays ordered.

### 63. To clear a backlog, you scaled consumers from 5 to 50, and the whole system got slower. Why?

**What to check first:** the downstream database or API: connection counts,
lock waits, and query latency when consumers scaled up.

**How to confirm:** the database hit its connection limit or CPU ceiling at
the same moment; per-message processing time increased.

**Likely causes and fixes:** the bottleneck was downstream, not the number of
consumers. Cap consumer count and concurrency to what the downstream system
can absorb, batch writes, and drain the backlog more slowly. See
[messaging patterns](messaging-patterns.md).

### 64. Publishing fails for some messages with a size error, and broker memory spikes when large reports are sent. What do you change?

**What to check first:** message sizes for the failing type compared with the
broker's or service's size limit.

**How to confirm:** the failing messages contain whole files or large report
payloads.

**Likely causes and fixes:** payloads that do not belong in messages. Use the
claim-check pattern: store the payload in object storage and publish a small
message with its key, with a lifecycle rule that keeps objects longer than
the queue and DLQ retention. See [messaging patterns](messaging-patterns.md).

## Further learning

- [Message queues overview](../message-queues.md)
- [Messaging fundamentals](messaging-fundamentals.md) and
  [delivery guarantees](delivery-guarantees.md)
- [RabbitMQ tutorials](https://www.rabbitmq.com/tutorials)
- [Apache Kafka documentation](https://kafka.apache.org/documentation/)
- [Amazon SQS Developer Guide](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/welcome.html)
