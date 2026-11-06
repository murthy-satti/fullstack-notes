# Redis

## Introduction

Redis is an in-memory data store commonly used for caching and short-lived state. It supports strings, hashes, lists, and sets. Redis is related to, but not identical with, [caching](caching.md).

## Why does it exist?

Applications sometimes need quick access to shared state without repeatedly querying a primary database. Whether data belongs in Redis depends on persistence and recovery requirements.

## How does it work?

A client sends commands for keys and values. A string can store a counter, a set can represent unique members, and a list can model ordered items. Keys can expire. Redis persistence and recovery depend on its configuration.

## Real-world example

A learning application might keep a temporary count of page views for a demo lesson. The application increments a Redis counter and lets it expire later, while durable course records remain in a primary database.

## Developer perspective

Select structures that match access patterns, use clear key names, and expire temporary data. Handle Redis unavailability gracefully; a cache outage should not overload the primary database.

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

Redis provides fast access and useful data structures. Memory is limited and can be costly; persistence and failover require deliberate configuration. It may not fit data that must never be lost unless durability is designed.

## Common misconceptions

Redis is not only a cache, but using it does not automatically make data durable. “In memory” does not mean unlimited capacity or zero latency.

## Further Learning & References

- **Official Redis documentation — [Data types](https://redis.io/docs/latest/develop/data-types/):** introduces Redis structures and their core use cases.
- **Official Redis documentation — [EXPIRE command](https://redis.io/docs/latest/commands/expire/):** explains setting a key's expiration period.
