# Redis

## Introduction

Redis is an in-memory data store commonly used for caching, short-lived state, and other low-latency workloads. It supports data structures such as strings, hashes, lists, and sets through commands and client libraries. Redis is related to, but not identical with, the general concept of [caching](caching.md).

## Why does it exist?

Applications sometimes need quick access to small pieces of shared state without repeatedly querying a primary database. Redis provides an efficient network service for these operations. Whether data should live there depends on its persistence, recovery, and consistency requirements.

## How does it work?

A client connects to a Redis server and sends commands for keys and values. Data structures support different operations: a string can store a counter or text, a set can represent unique members, and a list can model ordered items. A key can have an expiration time. Redis can be configured for persistence, but an application must understand its chosen durability and recovery settings rather than assume that in-memory storage is permanent.

## Real-world example

A learning application might keep a temporary count of page views for a demo lesson. The application increments a Redis counter and lets it expire later, while durable course records remain in a primary database.

## Developer perspective

Select structures that match access patterns, use clear key names, set expiration for temporary data, and avoid storing secrets or user data without an appropriate security design. Handle timeouts and Redis unavailability gracefully. A cache outage should not silently turn into unlimited load on the primary database.

## Practical example

On a locally installed Redis server used only for practice, these commands set and retrieve a harmless demo value:

```text
SET lesson:demo "hello" EX 60
GET lesson:demo
```

The expiration limits the example value's lifetime. Do not run these commands against a production endpoint.

## Important terminology

- **Key:** name used to address a stored value.
- **Data structure:** supported value shape, such as string, hash, or set.
- **Expiration:** automatic removal after a configured lifetime.
- **Persistence:** saving in-memory data to durable storage for recovery.

## Advantages and disadvantages

Redis can provide fast access and useful data structures with simple operations. Memory is limited and can be costly; persistence and failover require configuration and operational understanding. It may be a poor fit as the only store for data that must never be lost unless durability is deliberately designed.

## Common misconceptions

Redis is not only a cache, but using it does not automatically make data durable. “In memory” does not mean unlimited capacity or zero latency. Expiring a key is useful, but it does not replace correct authorization or privacy controls.

## Revision questions

1. Which Redis data structure might represent unique members?
2. Why give temporary keys an expiration?
3. What should an application consider if Redis is unavailable?

## Further Learning & References

- **Official Redis documentation — [Data types](https://redis.io/docs/latest/develop/data-types/):** introduces Redis structures and their core use cases.
- **Official Redis documentation — [EXPIRE command](https://redis.io/docs/latest/commands/expire/):** explains setting a key's expiration period.
