# Application Architecture Projects

Build these to practice the architecture lessons on running systems. Several
build on the Backend projects, TaskFlow API and ShopLite Checkout.

## Clean Architecture Refactor

Restructure the TaskFlow API into ports and adapters so business rules no
longer depend on Express or MongoDB. Swap the database for an in-memory store
in tests, and write short decision records explaining each choice. Practices
[Software Architecture](software-architecture.md).

## Cache Lab

Put Redis in front of a deliberately slow endpoint and learn caching by
measuring it: latency and hit ratio under load, invalidation and the stale
data it can cause, a cache stampede and its fix, and how LRU and LFU eviction
behave on the same traffic. Practices [Caching](caching.md).

## LiveBoard

A real-time game leaderboard with chat: rankings in a sorted set, chat shared
across two server instances with Pub/Sub, game events processed with a stream
consumer group, a daily reset job protected by a lock, and per-user rate
limits. Practices [Redis](redis.md).

## OrderFlow Events

Split ShopLite Checkout into order, inventory, payment, and notification
services that communicate through a message broker. Add a transactional
outbox, a saga that refunds when stock runs out, consumers that safely ignore
duplicates, and a dead-letter queue you inspect and replay. Practices
[Message Queues](message-queues.md) and event-driven architecture.

## Scale It

Run the TaskFlow API as several instances behind a load balancer, move
sessions to Redis, and add a database replica set. Load-test it to find the
bottleneck, watch replication lag, then stop an instance and a database node
to see how the system recovers. Practices [Scalability](scalability.md).

## Design-then-Build URL Shortener

Write a short design document first, with requirements, estimates, API, and
data model, then build the URL shortener from the case study with a cache and
click analytics. Finish by load-testing it and comparing the results with your
estimates. Practices [System Design](system-design.md).
