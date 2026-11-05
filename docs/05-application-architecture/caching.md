# Caching

## Introduction

A cache keeps a temporary copy of data so a later request can be served faster. Caches appear in browsers, content delivery networks, and applications. [Redis](redis.md) is one common caching service.

## Why does it exist?

Repeatedly fetching the same information adds latency and consumes capacity. Caching is most useful when reads repeat and the source is slower than the cache.

## How does it work?

An application checks the cache for a key. On a hit, it uses the cached value; on a miss, it reads the source, returns the result, and may store a copy with an expiration time. When source data changes, cached values can become stale. Developers choose expiration, invalidation, or refresh strategies based on how fresh the data must be.

## Real-world example

A public catalog page may be requested many times per minute. Caching its rendered content near readers reduces repeated application and database work. Private account data, by contrast, must not be shared across users through an incorrectly scoped cache key.

## Developer perspective

Treat the source as authoritative unless the design says otherwise. Choose safe values, keys, and expiration times. Measure hit rate and latency, and plan for cache outages.

## Practical example

This local pseudocode demonstrates a cache-aside lookup; `cache` and `load_from_source` are placeholders, not remote services:

```text
value = cache.get("catalog:demo")
if value is missing:
    value = load_from_source("demo catalog")
    cache.set("catalog:demo", value, expires_in=60 seconds)
return value
```

## Important terminology

- **Cache hit/miss:** whether a requested key was found.
- **TTL:** time to live; how long an entry may remain cached.
- **Invalidation:** removing or refreshing data that may be stale.
- **Cache-aside:** the application checks the cache and loads misses from the source.

## Advantages and disadvantages

Caching can lower response times and source-system load. It adds memory use, operational complexity, and a risk of stale or incorrectly shared data. Cache behavior should be an optimization, not an undocumented source of truth.

## Common misconceptions

A cache does not make data permanently available or automatically consistent. A high hit rate is not proof of correctness; a longer TTL can delay visible changes.

## Revision questions

1. What happens on a cache hit and on a miss?
2. Name two ways a cached value can become stale.
3. Why should keys distinguish users or request parameters when needed?

## Further Learning & References

- **Third-party explanation — [Cloudflare: What is caching?](https://www.cloudflare.com/learning/cdn/what-is-caching/):** introduces caching and explains how it helps deliver content.
- **Official Redis documentation — [Key expiration](https://redis.io/docs/latest/commands/expire/):** documents a concrete way to set a key's lifetime in Redis.
