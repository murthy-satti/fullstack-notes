# Caching

Caching stores a copy of data somewhere faster or closer than its original
source, so repeated requests can be answered without redoing the slow work.
Browsers, CDNs, reverse proxies, application memory, Redis, and databases all
cache. Used well, caching cuts latency and load dramatically; used carelessly,
it serves stale or even wrong data.

## What caching provides

- **Lower latency:** reading from memory takes microseconds, while a database
  query or a call to another service can take milliseconds or more.
- **Less load on the source:** a cache that answers 95% of reads leaves the
  database only 5% of the traffic.
- **Resilience:** some caches can keep serving slightly stale data while the
  source is slow or unavailable.

Every cache also adds questions you must answer: how long data may be stale,
how it is invalidated when the source changes, what is evicted when the cache
is full, and what happens when the cache itself fails.

## How a typical application cache works

The most common pattern, cache-aside, works like this:

1. The application receives a request for a product.
2. It looks up the key `product:42` in the cache.
3. **Cache hit:** the value is returned immediately.
4. **Cache miss:** the application reads the database, stores the result in
   the cache with a time to live (TTL), and returns it.
5. When the product is updated, the application writes to the database and
   deletes `product:42` from the cache, so the next read reloads fresh data.

## Practical example

```js
// Cache-aside with Redis (node-redis client).
async function getProduct(id) {
  const key = `product:${id}`;
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached); // hit

  const product = await db.products.findById(id); // miss: go to the source
  if (product) {
    await redis.set(key, JSON.stringify(product), { EX: 300 }); // 5-minute TTL
  }
  return product;
}
```

The TTL bounds how stale a cached product can be even if an invalidation is
missed. (Recent node-redis versions mark the `EX` option as deprecated in
favor of `{ expiration: { type: "EX", value: 300 } }`; `EX` still works.)

## Caching topic map

- [Cache fundamentals](caching/cache-fundamentals.md)
- [Caching strategies](caching/caching-strategies.md)
- [Cache invalidation and expiration](caching/invalidation-and-expiration.md)
- [Eviction policies](caching/eviction-policies.md)
- [Cache failure modes](caching/cache-failure-modes.md)
- [HTTP and CDN caching](caching/http-and-cdn-caching.md)

**Review**

- [Caching interview questions and answers](caching/interview-questions-and-answers.md)

## Developer perspective and common misconceptions

Measure before caching: find the slow, frequently repeated reads, then cache
those. Decide how stale each kind of data may be, give every key a TTL, and
monitor the hit ratio. Never cache one user's private data under a key another
user can read.

- A cache is not a database; data in it can disappear at any time and must be
  rebuildable from the source.
- Caching does not fix a slow query for the first request or for cache misses.
- Deleting a cache entry on update is usually safer than updating it in place.
- A higher TTL is not always better; it trades freshness for hit ratio.

## Further learning

- [AWS: Caching challenges and strategies (Amazon Builders' Library)](https://aws.amazon.com/builders-library/caching-challenges-and-strategies/)
- [MDN: HTTP caching](https://developer.mozilla.org/en-US/docs/Web/HTTP/Caching)
- [Redis](redis.md) for the most common distributed cache
- [Caching interview questions and answers](caching/interview-questions-and-answers.md)
