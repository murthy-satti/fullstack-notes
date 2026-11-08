# Caching Interview Questions and Answers

These questions review cache fundamentals, strategies, invalidation,
eviction, failure modes, and HTTP/CDN caching. Try answering each one
before reading the answer.

## Fundamentals

### 1. What is a cache, and why does caching improve performance?

A cache is a fast, temporary store holding copies of data from a slower
source. It improves performance because reading from memory or a nearby
cache is much faster than repeating a database query, computation, or
long network call, and because programs tend to reuse recently or
frequently accessed data (locality).

### 2. What are a cache hit, a cache miss, and the hit ratio?

A hit means the requested key was found in the cache; a miss means it was
not and the data had to be loaded from the source. The hit ratio is
`hits / (hits + misses)`. It is the main measure of how much work a cache
saves.

### 3. How do you calculate the effective latency of a cached lookup?

`hit ratio × hit time + (1 − hit ratio) × miss time`, where the miss time
includes checking the cache and loading from the source. With a 1 ms
cache, a 50 ms source, and a 90% hit ratio, the average is about 6 ms;
at 99% it is about 1.5 ms.

### 4. Where can caches exist in a typical web system?

In the browser, at CDN edge servers, in a reverse proxy, inside each
application process, in a distributed cache such as Redis, and inside the
database's own memory (buffer cache). Each layer closer to the user saves
more work but is harder to control.

### 5. When would you use an in-process cache instead of Redis?

For small, rarely changing, very frequently read data where network round
trips matter, such as configuration or lookup tables. Its downsides are
that each instance has its own copy (they can disagree), memory is
multiplied by the number of instances, and invalidation must reach every
instance.

### 6. What data should you avoid caching?

Data with low reuse (highly personalized responses), sensitive data
unless strictly scoped and short-lived, data whose staleness causes harm
(balances, stock used to accept orders), and data that is already cheap to
fetch. Caching these adds risk or complexity without benefit.

### 7. What makes a good cache key?

It uniquely identifies the value and includes every input that changes
it: entity, id, query parameters, user or tenant, locale, and a version.
Keys follow a consistent naming scheme (`type:id:qualifier`), and long
inputs can be hashed. A key that omits the user can leak one user's data
to another.

### 8. Why should cache entries have a TTL even if you invalidate on write?

A TTL bounds how long a wrong value can survive when an invalidation is
missed, fails, or loses a race. It also removes entries that are no
longer used, freeing memory.

## Strategies

### 9. Explain the cache-aside pattern.

The application checks the cache; on a miss, it loads from the database,
stores the value with a TTL, and returns it. On writes, it updates the
database and deletes the cached entry. It caches only requested data and
survives cache outages, which makes it the common default.

### 10. How does read-through differ from cache-aside?

In read-through, the cache layer itself loads missing data through a
configured loader, so callers only talk to the cache. In cache-aside, the
application code performs the load and the store. The data flow is
similar; the difference is where the logic lives.

### 11. What is write-through caching, and what are its drawbacks?

Each write updates both the cache and the database synchronously, so
reads right after a write are fresh. Drawbacks are slower writes,
caching data that may never be read, and divergence if one of the two
writes fails.

### 12. What is write-behind (write-back) caching, and when is it appropriate?

Writes go to the cache and are acknowledged immediately; they reach the
database later, often batched. It gives very fast writes but risks losing
acknowledged data if the cache fails before flushing. It suits
loss-tolerant data such as view counters or analytics.

### 13. What is write-around?

Writes go only to the database, and the cache is filled by later reads.
It avoids filling the cache with data that is written but rarely read,
at the cost of a miss on the first read after a write.

### 14. What is refresh-ahead?

Hot entries are reloaded in the background shortly before they expire,
so readers rarely see a miss. It lowers latency for popular keys but
wastes work if refreshed entries are not read again.

### 15. On a write, should you update the cached value or delete it? Why?

Usually delete it. If two writers update the cache, their cache writes can
arrive in the wrong order and leave an older value cached. Deleting means
the next read loads whatever the database committed last.

### 16. Should you write the database or the cache first?

Write the database first, then delete the cache entry. Deleting first
lets a concurrent reader repopulate the cache with the old value before
the database write commits.

## Invalidation and expiration

### 17. Why is cache invalidation considered hard?

The cache and database cannot be updated in one transaction, many
instances read and write concurrently, one record can feed many cached
entries, and local caches exist on every instance. Any missed or
mistimed invalidation leaves stale data.

### 18. What is the difference between absolute and sliding expiration?

Absolute expiration removes an entry a fixed time after it was written,
bounding staleness. Sliding expiration resets the timer on each access,
keeping popular entries but possibly never refreshing them. Sliding
expiration suits sessions; absolute expiration suits data copies.

### 19. Describe a race that leaves stale data even with write-then-delete.

A reader misses and reads the old value from the database; then a writer
updates the database and deletes the key; then the reader stores its old
value in the cache. The cache now holds stale data until the TTL expires.

### 20. What is delayed double delete?

Delete the cache entry, write the database, wait slightly longer than a
typical read-and-populate, then delete again. The second delete removes
stale values written by racing readers. It reduces the race window but
does not eliminate it, so TTLs are still needed.

### 21. What is namespace bumping?

Keys include a version number read from a counter, such as
`catalog:17:product:1`. Incrementing the counter makes every key with the
old version unreachable, invalidating a whole group with one command. The
orphaned keys expire through their TTLs.

### 22. What is event-driven invalidation?

A separate process watches the database's change log (MongoDB change
streams or CDC tools such as Debezium) and deletes affected cache keys
after each committed change. It catches writes from every service and
avoids invalidation logic scattered through the code.

### 23. What is tag-based invalidation?

Cache entries are associated with tags, such as `product:42`, stored as
sets of keys. When the product changes, all keys in its tag set are
deleted together. CDNs offer the same idea as surrogate keys or cache
tags.

### 24. What does stale-while-revalidate mean?

A stale value may be served immediately while one background request
fetches a fresh one. Users get fast responses and the cache converges to
fresh data. HTTP supports it as a `Cache-Control` directive.

### 25. How do you decide how stale data may be?

Ask what harm a stale value causes and for how long that harm is
acceptable. Descriptions can be minutes old; prices shown in a catalog can
be seconds old but must be checked at checkout; permissions and balances
need near-zero staleness or no caching.

## Eviction

### 26. What is the difference between eviction and expiration?

Expiration removes an entry because its TTL passed, even if memory is
free. Eviction removes an entry early because the cache is full, chosen by
the eviction policy. Frequent eviction suggests the cache is too small.

### 27. How does LRU work, and how is it implemented in O(1)?

LRU evicts the entry unused for the longest time. It combines a hash map
for O(1) lookup with a doubly linked list ordered by recency; each access
moves a node to the head, and eviction removes the tail.

### 28. When is LFU better than LRU?

When popularity is stable over time. A one-time scan of many keys can
flush an LRU cache, while LFU keeps frequently used keys. LFU needs count
decay so formerly popular keys do not stay forever.

### 29. How does Redis implement LRU and LFU?

Approximately. Redis samples a few keys (`maxmemory-samples`) and evicts
the best candidate from a small pool, rather than keeping an exact list.
Its LFU uses a small logarithmic counter per key that decays over time.

### 30. What does Redis's `noeviction` policy do?

It never evicts. When memory reaches `maxmemory`, commands that need more
memory return errors, while reads keep working. It is the default in
open-source Redis (managed services can differ: Amazon ElastiCache defaults
to `volatile-lru`) and suits Redis instances holding data that must not be
silently dropped.

### 31. Which `maxmemory-policy` would you choose for a pure cache?

`allkeys-lru` for recency-driven access, or `allkeys-lfu` when a stable
set of keys is popular. Both consider every key for eviction.

### 32. What is the risk of a `volatile-*` policy?

Only keys with a TTL can be evicted. If cache keys lack TTLs, Redis has
nothing to evict and writes fail like `noeviction`. Conversely, these
policies let you protect non-expiring keys in a mixed-use instance.

### 33. How do you size a cache?

Estimate the working set (distinct keys used per TTL window times average
entry size plus overhead), add headroom for buffers and persistence, then
tune from the hit ratio, eviction count, and memory metrics. Hit ratio
gains usually flatten after a point.

## Failure modes

### 34. What is a cache stampede?

When a popular key expires, many concurrent requests miss at once and all
run the same expensive load, overwhelming the database. It is also called
a thundering herd.

### 35. How do you prevent cache stampedes?

Coalesce concurrent misses within a process (single-flight), use a
distributed lock so one instance refreshes, serve stale data while
revalidating, refresh hot keys ahead of expiry, or use probabilistic early
expiration.

### 36. What is single-flight (request coalescing)?

Concurrent requests for the same missing key share one in-flight load
instead of each starting their own. In Node.js this is done by storing the
pending promise in a map keyed by the cache key and removing it when it
settles.

### 37. What is cache penetration, and how do you defend against it?

Requests for data that does not exist always miss the cache and reach the
database, which attackers can exploit with random ids. Defenses are
caching "not found" results briefly, using a Bloom filter of existing ids,
validating ids, and rate limiting.

### 38. Why is a Bloom filter useful here?

It is a compact probabilistic set. If it says an id is absent, the id is
definitely absent, so the database lookup is skipped. It may occasionally
report a missing id as present (false positive), which only costs one
database lookup.

### 39. What is a cache avalanche, and how do you prevent it?

Many keys expire or disappear at the same time (identical TTLs, a cache
restart), flooding the database with misses for different keys. Prevent
it with TTL jitter, warming the cache before traffic, gradual traffic
shifts, and limits on database load.

### 40. How do you handle a hot key in a distributed cache?

Add a small in-process cache with a short TTL in front of it, replicate
the key under several names spread across nodes and read a random copy,
or use replicas for the node holding it. Detect hot keys with metrics or
Redis tools.

### 41. Why are big keys a problem in Redis?

Redis executes commands one at a time, so reading, writing, or deleting a
huge value blocks other clients and increases latency, and it uses
network bandwidth and uneven memory. Split large values, store only what
is needed, and delete big keys with `UNLINK`.

### 42. What should happen when the cache is down?

Requests should continue by treating cache errors as misses, with short
timeouts on cache calls. Database fallbacks must be limited (bulkheads,
load shedding, circuit breakers), because the database is usually not
sized to take all the traffic the cache was absorbing.

### 43. What is a cold cache, and how do you warm it?

A new or flushed cache with no entries, so nearly every request misses.
Warm it by preloading the most-read keys, shifting traffic gradually, or
replaying recent read traffic before it goes live.

## HTTP and CDN caching

### 44. What is the difference between `no-cache` and `no-store`?

`no-cache` allows storing the response but requires revalidation with the
origin before each use. `no-store` forbids storing it at all. Sensitive
responses need `no-store`.

### 45. What is the difference between `max-age` and `s-maxage`?

`max-age` sets freshness for all caches, including browsers. `s-maxage`
overrides it for shared caches such as CDNs and proxies, so you can let a
CDN cache longer than browsers.

### 46. How does revalidation with ETags work?

The origin sends an `ETag` identifying the version. When the cached copy
is stale, the cache sends `If-None-Match` with that ETag; if the content
has not changed, the origin replies `304 Not Modified` without a body and
the cache reuses its copy.

### 47. Why can hashed asset files be cached for a year?

The hash is derived from the file's content, so a given URL always has
the same content. A new deploy produces new filenames referenced from
HTML that is revalidated on each visit, so users get updates without
purging.

### 48. What is a CDN cache key, and what can go wrong with it?

It is the set of request properties the CDN uses to identify a stored
response, usually host, path, and query string, plus any configured
headers or cookies. Including too much (tracking parameters, user agents)
lowers the hit ratio; including too little can serve the wrong or
another user's content.

### 49. How can HTTP caching leak private data?

If a shared cache stores a personalized response, other users receive
it. Prevent this with `Cache-Control: private` or `no-store` on
user-specific responses, never caching responses that set cookies, and
guarding against web cache deception and cache poisoning.

### 50. Does a CDN purge remove content from users' browsers?

No. A purge clears CDN edge caches only. Responses already stored in
browsers stay until their `max-age` expires, which is why browser
`max-age` should be short for content you might need to change.

## Scenario-based questions

### 51. Right after a deploy, database CPU jumps from 30% to 95% and API latency doubles, but traffic is unchanged. What do you do?

**What to check first:** the cache hit ratio and Redis `keyspace_misses`
before and after the deploy.

**How to confirm:** compare cache key names written before and after the
deploy, and check whether database queries per second rose at the deploy
time.

**Likely causes and fixes:** a changed key format or version segment
(every key is new, so the cache is cold), or a code path that skips the
cache. Warm the hot keys, roll out gradually, and change key formats
deliberately. See [cache fundamentals](cache-fundamentals.md).

### 52. After editing their profile, users still see their old name for a few minutes. What is going on?

**What to check first:** whether the write path deletes the profile's cache
key, and in what order relative to the database write.

**How to confirm:** after an update, read the key's value and TTL in Redis
and compare it with the database row.

**Likely causes and fixes:** no invalidation (only the TTL expires it), the
cache deleted before the database write, or the read/write race. Write the
database first, then delete the key; add versioned writes or a delayed
second delete if the race persists. See
[invalidation and expiration](invalidation-and-expiration.md).

### 53. Every five minutes the database shows a burst of identical queries for the homepage feed. How do you stop it?

**What to check first:** the TTL of the feed key and the timing of the
bursts.

**How to confirm:** the slow-query log shows the same query many times in
the same second, matching the key's expiry.

**Likely causes and fixes:** a cache stampede on a hot key. Add
single-flight per process, a short lock or stale-while-revalidate across
instances, probabilistic early refresh, and TTL jitter. See
[cache failure modes](cache-failure-modes.md).

### 54. Redis memory is at `maxmemory` and `SET` commands fail with out-of-memory errors. Why isn't Redis evicting?

**What to check first:** `CONFIG GET maxmemory-policy` and how many keys
have a TTL (`INFO keyspace` shows `expires`).

**How to confirm:** `evicted_keys` stays at 0 while `used_memory` sits at
the limit.

**Likely causes and fixes:** the policy is `noeviction`, or a `volatile-*`
policy with keys that have no TTL. Use `allkeys-lru` or `allkeys-lfu` for a
pure cache, or set TTLs on every cache key. See
[eviction policies](eviction-policies.md).

### 55. Users are logged out at random during traffic peaks. Sessions live in the same Redis as the cache. What happened?

**What to check first:** `evicted_keys` and the eviction policy during the
peaks.

**How to confirm:** session keys disappear before their TTL, at the same
times evictions rise.

**Likely causes and fixes:** an `allkeys-*` policy lets cache pressure evict
sessions. Move sessions to a separate instance with `noeviction`, or use a
`volatile-*` policy with TTLs only on cache keys. See
[eviction policies](eviction-policies.md).

### 56. During a flash sale, one Redis Cluster node is at 100% CPU while the others sit at 10%. How do you fix it?

**What to check first:** which keys that node serves and their request
rates.

**How to confirm:** `redis-cli --hotkeys` (with an LFU policy) or per-key
client metrics show one key dominating.

**Likely causes and fixes:** a hot key such as the sale product. Put a
short-TTL in-process cache in front of it, or store several copies under
keys that hash to different nodes and read a random copy. See
[cache failure modes](cache-failure-modes.md).

### 57. Database load is rising and logs show thousands of lookups for product IDs that do not exist. What is happening?

**What to check first:** the distribution of requested IDs and which
clients send them.

**How to confirm:** the hit ratio for these lookups is zero and most return
`404`.

**Likely causes and fixes:** cache penetration, possibly an attack or
scraping. Validate IDs, cache "not found" results briefly, rate-limit the
clients, and use a Bloom filter for very large ID spaces. See
[cache failure modes](cache-failure-modes.md).

### 58. Redis was down for two minutes and the whole site went down with it, although the database was healthy. Why?

**What to check first:** how the application handles cache errors and the
database load during the outage.

**How to confirm:** request latency matched the cache client timeout, and
database connections hit their limit.

**Likely causes and fixes:** long cache timeouts and unlimited database
fallbacks; the database was sized only for misses. Use short timeouts, treat
errors as misses, cap concurrent fallbacks, add a circuit breaker, and run
the cache with replicas. See [cache failure modes](cache-failure-modes.md).

### 59. A CSS fix was deployed an hour ago, but some users still see the old styling. Why?

**What to check first:** the `Cache-Control` header on the CSS file and
whether its URL changed with the deploy.

**How to confirm:** the old file is served with a long `max-age` from the
browser cache or CDN (look at the `Age` header).

**Likely causes and fixes:** an unversioned file with long caching. Use
content-hashed filenames with `immutable`, and serve HTML with `no-cache`
so it picks up new asset URLs. See [HTTP and CDN caching](http-and-cdn-caching.md).

### 60. A customer reports seeing another customer's order history on the account page. What do you check?

**What to check first:** the response's `Cache-Control` header, CDN cache
status for that URL, and the application cache key for the order list.

**How to confirm:** CDN logs show a cache hit for a personalized URL, or the
cache key lacks the user ID.

**Likely causes and fixes:** a shared cache storing a personalized response,
web cache deception, or a key missing the user. Mark personalized responses
`private, no-store`, include the user in keys, purge the affected entries,
and treat it as a security incident. See
[HTTP and CDN caching](http-and-cdn-caching.md).

### 61. The CDN hit ratio is only 20% for a product page that should be highly cacheable. Why?

**What to check first:** the cache key configuration and the variety of
query strings and headers on requests.

**How to confirm:** CDN logs show many distinct cache keys for the same
page, differing by `utm_*` parameters or a header such as `User-Agent`.

**Likely causes and fixes:** tracking parameters or high-variety headers in
the key, `Vary: User-Agent`, or a cache policy that prevents shared storage.
Do not assume `Set-Cookie` alone makes a response uncacheable; inspect origin
and CDN rules. Remove high-variety inputs from the key only when they do not
change the response. See [HTTP and CDN caching](http-and-cdn-caching.md).

### 62. A price change shows on the product page, but category listings still show the old price. How do you fix it?

**What to check first:** which cache entries include the price and which
ones the write path invalidates.

**How to confirm:** the product key was deleted but list and search keys
still hold the old value.

**Likely causes and fixes:** derived entries were not invalidated. Tag list
and search entries with the product IDs they contain and delete by tag, or
bump the namespace for listings. See
[invalidation and expiration](invalidation-and-expiration.md).

### 63. After moving to a managed Redis service, keys without TTLs start disappearing (or writes start failing). Nothing changed in the code. Why?

**What to check first:** `maxmemory-policy` in the new environment
compared with the old one.

**How to confirm:** `CONFIG GET maxmemory-policy` returns a different value,
for example `volatile-lru`, which is Amazon ElastiCache's default.

**Likely causes and fixes:** a different default eviction policy. Set the
policy explicitly in every environment and give cache keys TTLs. See
[eviction policies](eviction-policies.md).

### 64. After the nightly reporting job, the cache hit ratio drops from 95% to 60% and recovers slowly. What is happening?

**What to check first:** whether the job reads through the same cache and
which eviction policy is used.

**How to confirm:** `evicted_keys` rises during the job and hot keys are
missing the next morning.

**Likely causes and fixes:** the job's one-off reads pushed out hot keys
under LRU. Switch to `allkeys-lfu`, let the job bypass the cache, or give it
a separate cache. See [eviction policies](eviction-policies.md).

## Further learning

- [Caching overview](../caching.md)
- [Cache fundamentals](cache-fundamentals.md) ·
  [Caching strategies](caching-strategies.md) ·
  [Invalidation and expiration](invalidation-and-expiration.md) ·
  [Eviction policies](eviction-policies.md) ·
  [Cache failure modes](cache-failure-modes.md) ·
  [HTTP and CDN caching](http-and-cdn-caching.md)
- [AWS Builders' Library: Caching challenges and strategies](https://aws.amazon.com/builders-library/caching-challenges-and-strategies/)
- [MDN: HTTP caching](https://developer.mozilla.org/en-US/docs/Web/HTTP/Caching)
