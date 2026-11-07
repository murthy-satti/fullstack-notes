# System Design Interview Questions and Answers

These questions review the system design process, estimation, the standard
building blocks, and the recurring themes of the case studies. Each question
is tagged **Beginner** (definitions, basic usage), **Intermediate** (how it
works, trade-offs), or **Advanced** (scale, failure modes, design decisions).
Answer each one aloud, with a reason for every choice, before reading the
answer.

## The design process

### 1. What are the main steps of a system design discussion?

Clarify functional and non-functional requirements, agree the scope,
estimate scale, define the API, define the data model, draw the high-level
design with read and write paths, deep dive into the hardest parts, discuss
bottlenecks and trade-offs, and wrap up. You loop back when new information
changes an earlier decision.

### 2. Why start with requirements instead of components?

Components only make sense relative to requirements. Read-heavy versus
write-heavy, strict versus eventual consistency, and 100 versus 100,000
requests per second lead to completely different designs. Starting with
technologies risks solving the wrong problem or over-engineering.

### 3. What are non-functional requirements? Give examples.

Quality targets and constraints rather than features: latency (p99 under
200 ms), availability (99.99%), durability (never lose a payment),
consistency (read-your-writes), scale (10 M daily users), security, privacy,
and cost. They drive most architectural decisions.

### 4. How would you spend 45 minutes in a system design interview?

Roughly 5–8 minutes on requirements and scope, 3–5 on estimates, 5–7 on API
and data model, 10–12 on the high-level design, 10–15 on deep dives, and 3–5
on bottlenecks and wrap-up. The most common failure is running out of time
before the deep dives.

### 5. How do you communicate a trade-off well?

State the options, the criteria from the requirements, your choice, and what
you give up: "Fan-out on write makes reads cheap because reads outnumber
writes 100:1; the cost is heavy writes for celebrities, which I handle by
pulling their posts at read time."

### 6. What should a real-world design document contain?

Context and goals, non-goals, requirements, the proposed design (APIs, data
model, components, flows), alternatives considered and why they were
rejected, rollout and migration plan, monitoring, security and privacy
considerations, risks, and open questions.

## Estimation

### 7. How do you convert daily active users into requests per second?

Multiply DAU by actions per user per day and divide by 86,400 seconds
(round to 10^5). For 10 M users making 20 requests each: 2 × 10^8 ÷ 10^5 =
2,000 requests per second on average. Then multiply by a peak factor such as
2–3×.

### 8. Why estimate peak and not just average load?

Systems fail at peaks, not averages. Traffic follows daily cycles and
events; sizing for the average guarantees overload during busy hours. Peak
estimates also determine headroom and autoscaling limits.

### 9. How much downtime does 99.99% availability allow?

About 52.6 minutes per year, or about 4.3 minutes per 30-day month. Each
extra nine cuts allowed downtime by a factor of ten, and usually increases
cost and complexity substantially.

### 10. How do you estimate storage?

Records per day × size per record × retention period × replication factor,
plus overhead for indexes. Estimate large blobs (images, video) separately
from structured data, since they belong in object storage.

### 11. How do you size a cache?

Use the 80/20 rule: a small share of items serves most reads, so caching
about 20% of the daily read working set captures most of the benefit. Memory
≈ 0.2 × unique items read per day × item size; using total requests instead
of unique items gives an upper bound.

### 12. Name some latency numbers every engineer should know.

Main memory access ~100 ns; SSD random read ~0.1 ms; round trip inside a
data center ~0.5 ms; hard disk seek ~5–10 ms; round trip between continents
~70–150 ms. Memory is far faster than disk, and network round trips often
dominate request latency.

## Building blocks

### 13. What does a load balancer do, and what is the difference between layer 4 and layer 7?

It distributes traffic across healthy servers and removes unhealthy ones via
health checks. Layer 4 balances TCP/UDP connections without reading HTTP;
layer 7 understands HTTP, so it can route by path or host, terminate TLS,
and add headers.

### 14. What is the difference between a reverse proxy and an API gateway?

A reverse proxy forwards client requests to backend servers and handles
concerns like TLS termination, compression, and caching. An API gateway is a
specialized entry point for APIs that adds routing to many services,
authentication, per-key rate limits and quotas, versioning, and analytics.

### 15. When should you use a CDN?

Whenever the same content is served to many users, especially static assets
and media, and for cacheable public API responses. A CDN cuts latency by
serving from nearby edge locations, reduces origin load and egress cost, and
absorbs traffic spikes.

### 16. Why should application servers be stateless?

So any instance can handle any request. That enables horizontal scaling,
autoscaling, and replacing failed instances without losing data. Sessions,
uploads, and other state live in shared stores such as Redis, databases, and
object storage.

### 17. When would you add a cache, and what are the risks?

When data is read far more often than it changes and some staleness is
acceptable, or when the database cannot handle the read load. Risks include
stale data, invalidation bugs, cache stampedes when hot keys expire, and the
database being overwhelmed if the cache fails.

### 18. How do you choose between SQL and NoSQL databases?

By access patterns, consistency needs, and scale. Relational databases suit
related data with transactions and flexible queries. Key-value, document,
and wide-column stores suit massive volumes of simple access patterns and
horizontal partitioning. Many systems use both.

### 19. Why use a message queue?

To decouple producers from consumers, absorb bursts, move slow or unreliable
work off the request path, retry failures, and fan events out to several
consumers. Consumers must be idempotent because most queues deliver at least
once.

### 20. What is an inverted index?

A map from each term to the documents containing it. Search engines such as
Elasticsearch and OpenSearch use it to answer full-text queries quickly and
rank results by relevance. It is derived data, updated asynchronously from
the source of truth.

### 21. Compare UUID v4, UUID v7, and Snowflake-style IDs.

UUID v4 is 128 bits of mostly random data — no coordination, but random
inserts fragment B-tree indexes. UUID v7 starts with a millisecond timestamp,
so it is time-ordered and index-friendly. Snowflake IDs pack a timestamp,
machine ID, and sequence into 64 bits: compact and time-ordered, but each
generator needs a unique machine ID.

### 22. What problem does consistent hashing solve?

With `hash(key) % N`, changing N remaps most keys (about 75% going from 3 to
4 nodes), emptying caches and moving most data. Consistent hashing places nodes and keys on a ring so
adding or removing a node moves only about 1/N of the keys.

### 23. Why use virtual nodes in consistent hashing?

With one position per node, arcs on the ring are uneven, so load is
unbalanced, and a failed node's whole load moves to one neighbor. Many
virtual positions per node even out the load, spread a failed node's keys
across many nodes, and let bigger machines take more virtual nodes.

### 24. What is a single point of failure, and how do you remove it?

A component whose failure stops the whole system, such as one database
server or one load balancer. Remove it with redundancy (replicas, multiple
instances across availability zones), automatic failover, and by keeping
critical paths independent of non-critical components.

## Data, consistency, and scaling

### 25. What is the difference between vertical and horizontal scaling?

Vertical scaling uses a bigger machine — simple but limited and often a
single point of failure. Horizontal scaling adds more machines — needs
stateless services, load balancing, and data partitioning, but scales much
further and improves availability.

### 26. What are read replicas, and what problem do they introduce?

Copies of the primary database that serve reads, increasing read capacity.
Replication is usually asynchronous, so replicas may lag: a user may not see
their own write immediately. Solutions include reading your own writes from
the primary or tracking replication position.

### 27. What is sharding, and how do you choose a shard key?

Splitting data across multiple databases by a key so each holds a part.
Choose a key that spreads data and load evenly, matches the main access
pattern (queries should hit one shard), and avoids hot spots — for example,
`userId` or `conversationId`, not a timestamp or a celebrity's ID.

### 28. What does the CAP theorem say?

During a network partition, a distributed system must choose between
consistency (every read sees the latest write) and availability (every
request gets a response). Without partitions, systems still trade
consistency against latency. Design per feature: payments need consistency;
feeds and likes can be eventually consistent.

### 29. What is eventual consistency? Give an example where it is acceptable.

If no new writes occur, all replicas eventually converge to the same value,
but reads may briefly be stale. It is acceptable for social feeds, like
counts, presence indicators, and analytics — users tolerate a few seconds of
delay there.

### 30. What is a hot spot, and how do you mitigate one?

A key, partition, or server receiving disproportionate traffic, such as a
viral post or a celebrity account. Mitigations include caching with local
in-process caches, replicating hot data, splitting hot keys into sub-keys,
and special handling (for example, pulling celebrity posts instead of pushing
them).

## URL shortener

### 31. How would you generate short codes?

Base62-encode a number. Options: hash the URL (needs collision handling),
use a counter with pre-allocated ID ranges per server (no collisions,
scramble to avoid enumeration), or pick random codes and insert-if-absent.
A conditional insert on the primary key is the final uniqueness guarantee.

### 32. How long should the code be?

Enough for the total links over the system's life. 62^7 ≈ 3.5 trillion, so 7
characters comfortably hold billions of links; 6 characters (≈ 57 billion)
works for smaller systems but fills faster, raising collision rates for
random codes.

### 33. Should redirects use 301 or 302?

301 is permanent and cacheable by default, so browsers often keep it for a
long time: that reduces load but hides repeat clicks from analytics and
prevents changing or disabling the link. 302 (or 307) is temporary and is
not cached unless cache headers allow it, so clicks reach the server
(apart from any short max-age you set), enabling accurate analytics and
control. Choose based on whether analytics and control matter.

### 34. How do you keep redirects fast and available?

Keep the redirect path minimal — server, cache, key-value store — with
analytics sent asynchronously. Use layered caching (in-process LRU, Redis),
negative caching for unknown codes, replicated storage across zones, and
regional replicas for global users.

## Rate limiter

### 35. Which rate limiting algorithm would you choose for an API, and why?

Usually the token bucket: it allows bursts up to a capacity while enforcing
an average rate and needs only two values of state per client. Sliding window
counters are a good alternative for simple quotas; strict sign-in limits may
use a sliding window log.

### 36. How do you prevent race conditions in a distributed rate limiter?

Perform read, compute, and write atomically in the shared store — for
example, a Redis Lua script — instead of reading the count in the
application and writing it back. Using Redis's own clock in the script also
avoids clock differences between gateway instances.

### 37. Should a rate limiter fail open or fail closed?

It depends on the rule. General API limits usually fail open (with a coarse
local fallback) to protect availability. Security- and cost-sensitive limits
— sign-in attempts, OTP verification, SMS sending — fail closed to prevent
brute force and runaway costs.

## Chat application

### 38. Why use WebSockets for chat, and what makes them hard to scale?

They give a persistent, bidirectional, low-latency connection for pushing
messages. They are stateful: each server holds open connections, so you need
a session registry, routing between servers, heartbeats, reconnection with
backoff and jitter, and load balancers that support long-lived connections.

### 39. How does a message reach a recipient connected to a different server?

The chat service persists the message, looks up the recipient's connection
server in a session registry (for example, Redis), and publishes the message
to that server's channel via pub/sub. The server pushes it down the
recipient's WebSocket. If the publish is lost, the client recovers the
message from the database on reconnect.

### 40. How do you keep chat messages in order?

Assign a per-conversation sequence number on the server — via an atomic
counter or a single writer per conversation — and order by it. Never rely on
client timestamps. Global ordering across conversations is unnecessary.

### 41. How do you implement read receipts efficiently?

Store per-member watermarks (`lastDeliveredSeq`, `lastReadSeq`) instead of
one row per message per recipient. A single update marks everything up to a
sequence number as read, unread counts are simple subtraction, and clients
batch receipt updates.

## News feed

### 42. Compare fan-out on write and fan-out on read.

Fan-out on write pushes each new post ID into every follower's precomputed
feed: reads are cheap, writes scale with follower count. Fan-out on read
assembles the feed at read time from followed authors: writes are cheap,
reads are expensive. A hybrid pushes for normal accounts and pulls for
high-follower accounts.

### 43. Why store post IDs rather than full posts in feed caches?

Posts change: edits, deletions, and like counts would otherwise require
updating millions of feed copies. Storing IDs keeps feeds small and lets the
read path hydrate current post data in one batched lookup.

### 44. How do you paginate a feed that changes constantly?

Use cursor pagination instead of offsets: pass the position of the last item
seen (for example, its timestamp and ID) and fetch items after it. For ranked
feeds, rank once into a short-lived feed session and page through that
snapshot so items do not shift between pages.

## Notification system

### 45. Why use a separate queue per notification channel?

Isolation and independent scaling: an email provider outage or slow SMS
throughput only backs up that channel's queue, while push and in-app keep
flowing. Each channel can be throttled to its provider's limits, with
priority lanes so urgent messages bypass bulk campaigns.

### 46. How do you avoid sending duplicate notifications?

Require idempotency keys on the send API, make queue consumers check and
update delivery status atomically before sending (conditional `queued →
sending` transition), use provider idempotency features and push collapse
IDs, and accept that a tiny window for duplicates remains with external
providers.

### 47. How do you respect user preferences and regulations?

Check each notification against category and channel preferences, global
unsubscribes, suppression lists (hard bounces, complaints, SMS STOP),
consent records, and quiet hours before sending. Mandatory categories like
security alerts bypass optional preferences. Email bulk messages include
one-click unsubscribe headers.

## Scenario-based questions

### 48. Your URL shortener's redirect latency spikes whenever a link goes viral — what is happening and how do you fix it?

**What to check first:** whether the spike is limited to one code and one
cache shard, or affects every redirect.
**How to confirm:** per-key request counts, per-node Redis CPU, and cache hit
rate during the spike; check whether the hot key recently expired.
**Likely causes and fixes:** a hot key concentrating traffic on one Redis
shard and one database partition, sometimes made worse by a stampede when
its entry expires. Add an in-process LRU cache on redirect servers, cache the
redirect briefly at the CDN, and use request coalescing so only one request
reloads an expired key. See the [URL shortener case study](case-study-url-shortener.md)
and [cache failure modes](../caching/cache-failure-modes.md).

### 49. You added a Redis cache, but database load barely dropped. Why?

**What to check first:** the cache hit rate, and which queries still reach
the database.
**How to confirm:** hit/miss metrics per key pattern, TTL distribution, and
the database's top queries before and after.
**Likely causes and fixes:** TTLs far shorter than the data's real change
rate; keys that include volatile parameters, so identical data is cached
under many keys; a working set larger than the cache (evictions); or the
heavy queries were never cached. Normalize keys, lengthen TTLs where
staleness is acceptable, size the cache from the measured working set (see
[back-of-the-envelope estimation](back-of-the-envelope-estimation.md)), and
cache the expensive queries. See [cache fundamentals](../caching/cache-fundamentals.md).

### 50. Every hour, on the hour, database CPU spikes for a few minutes. What do you investigate?

**What to check first:** what else happens on the hour — cache TTLs set to
round numbers, scheduled jobs, batch imports.
**How to confirm:** line up cache hit rate, scheduled job runs, and the
database's top queries on the same timeline.
**Likely causes and fixes:** many cache entries created together with the
same TTL expire together (a stampede), or every instance runs the same cron
job at once. Add random jitter to TTLs, coalesce reloads, run scheduled jobs
once through a queue or lock, and spread batch work over time. See
[cache failure modes](../caching/cache-failure-modes.md) and
[background jobs and scheduling](../../03-backend-development/backend-concepts/background-jobs-and-scheduling.md).

### 51. After scaling the API gateway from 3 to 12 instances, customers exceed their rate limits by about 4×. Why?

**What to check first:** where the rate limiter keeps its counters.
**How to confirm:** compare a customer's actual request count per minute
with their configured limit; check whether the overshoot matches the ratio
of new to old instance counts (12 ÷ 3 = 4).
**Likely causes and fixes:** counters held in each instance's memory, with
each instance's limit set to the quota divided by the original 3 instances.
Each of the 12 instances now grants a third of the quota, so a client whose
requests are spread across all of them gets 12 × ⅓ = 4× its limit (with a
full quota per instance it would be up to 12×). Move counters to a shared
store such as
Redis and update them atomically with a Lua script; keep a coarse local
limit only as a fallback when Redis is unavailable. See the
[distributed rate limiter case study](case-study-rate-limiter.md).

### 52. After moving behind a new load balancer, all anonymous users suddenly get 429 errors. What happened?

**What to check first:** which key the limiter is counting for anonymous
traffic.
**How to confirm:** group 429 responses by limiter key; if almost all share
one IP, it is the load balancer's address.
**Likely causes and fixes:** the app reads the TCP peer address (the load
balancer) instead of the client IP from forwarding headers. Configure the
trusted proxy hop count precisely — never trust `X-Forwarded-For` from
everyone, which allows spoofing. See
[rate limiting and throttling](../../03-backend-development/backend-concepts/rate-limiting-and-throttling.md).

### 53. Chat users report missing messages that reappear after they refresh. What is going on?

**What to check first:** whether the gaps coincide with connection server
restarts or deploys.
**How to confirm:** client telemetry for sequence-number gaps; pub/sub and
connection-server logs at those times.
**Likely causes and fixes:** real-time deliveries over pub/sub were lost
while a connection server restarted; the messages are safely stored, which
is why a refresh shows them. Make clients compare their last `seq` with the
conversation's `lastSeq` on reconnect and fetch the gap; consider a durable
log if real-time delivery itself must not drop. See the
[chat application case study](case-study-chat-application.md).

### 54. Every chat deploy causes a wave of failed connections and the authentication service falls over. How do you fix it?

**What to check first:** connection attempts per second and their timing
during deploys.
**How to confirm:** a sharp spike of reconnects within seconds of each
server shutting down, followed by auth errors.
**Likely causes and fixes:** all clients of a drained server reconnect at the
same instant, and each reconnect re-authenticates — a thundering herd. Drain
servers gradually, make clients reconnect with exponential backoff and
jitter, use short-lived reconnect tickets that are cheap to verify, and scale
or rate-limit the auth path. See the
[chat application case study](case-study-chat-application.md).

### 55. When a popular creator posts, followers see it minutes late and the fan-out queue backs up. What do you change?

**What to check first:** the creator's follower count versus the celebrity
threshold, and fan-out queue depth over time.
**How to confirm:** fan-out lag metrics (post time to fan-out complete)
spiking with posts from specific accounts.
**Likely causes and fixes:** the account is just below the threshold, so each
post triggers millions of feed inserts. Lower the threshold so such accounts
are pulled at read time, fan out to recently active followers first, skip
inactive users, and autoscale workers on queue depth. See the
[news feed case study](case-study-news-feed.md).

### 56. Users scrolling their feed see duplicate posts or miss some. Why?

**What to check first:** how the feed endpoint paginates.
**How to confirm:** reproduce by loading page 1, creating new posts, then
loading page 2 — items shift between pages.
**Likely causes and fixes:** offset pagination over a list that changes as
new posts arrive at the top. Switch to cursor pagination on (timestamp, ID)
for chronological feeds, or rank once into a feed session snapshot for
ranked feeds. See the [news feed case study](case-study-news-feed.md) and
[API design best practices](../../03-backend-development/backend-concepts/api-design-best-practices.md).

### 57. During a marketing campaign, sign-in codes arrive several minutes late. What is wrong with the design?

**What to check first:** whether one-time codes share queues or workers with
bulk campaign messages.
**How to confirm:** age of the oldest message per queue and priority during
the campaign; OTP send latency against campaign start time.
**Likely causes and fixes:** urgent and bulk messages compete for the same
capacity and provider throughput. Add priority lanes with dedicated
workers, pace campaigns, reserve provider capacity for transactional
messages, and give OTPs a short expiry so stale codes are dropped. See the
[notification system case study](case-study-notification-system.md).

### 58. After a worker deploy, some users received the same push notification twice. How do you prevent it?

**What to check first:** whether the duplicates have the same notification
and delivery IDs.
**How to confirm:** delivery records showing two sends for one delivery row,
around the time workers restarted.
**Likely causes and fixes:** the queue redelivered jobs whose workers were
killed mid-send (at-least-once delivery). Atomically move the delivery from
`queued` to `sending` before calling the provider, shut workers down
gracefully, use push collapse IDs, and accept that a tiny window remains with
external providers. See the [notification system case study](case-study-notification-system.md)
and [delivery guarantees](../message-queues/delivery-guarantees.md).

### 59. One database shard runs at 95% CPU while the others sit at 20%. What do you do?

**What to check first:** which keys and queries dominate that shard.
**How to confirm:** per-shard request counts and top keys; check whether one
tenant, user, or time range owns most of the traffic.
**Likely causes and fixes:** a skewed shard key (a timestamp, a huge tenant,
a celebrity). Cache the hot data, split hot keys, choose a key that spreads
writes and reads (such as a hashed user ID), and rebalance with more
partitions or virtual nodes. See [building blocks](building-blocks.md) and
[database scaling](../scalability/database-scaling.md).

### 60. Your estimate said 10 instances would handle launch traffic, but production saturates at half that load. Why?

**What to check first:** how the per-instance capacity figure was obtained.
**How to confirm:** compare production per-instance throughput, CPU, and
latency with the load test; compare data sizes, cache hit rates, and request
mix.
**Likely causes and fixes:** the load test used a warm cache, a tiny dataset,
or only cheap endpoints, so capacity was overstated; or peak traffic was
underestimated. Re-test with production-like data and traffic mixes, add
headroom, and autoscale. See
[back-of-the-envelope estimation](back-of-the-envelope-estimation.md) and
[performance testing](../../09-security-and-testing/performance-testing.md).

### 61. A region failed, and users kept hitting it for 15 minutes despite DNS failover. Why, and how do you shorten that?

**What to check first:** the TTL on the failover DNS records and how fast
health checks marked the region unhealthy.
**How to confirm:** synthetic checks from several locations, DNS query logs,
and client errors over time after the failure.
**Likely causes and fixes:** long TTLs and resolvers or clients caching
answers, plus slow health checks. Use short TTLs on failover records, faster
health checks, and failover at the load balancer or global traffic-routing
layer where possible; make clients retry against alternative endpoints. See
[building blocks](building-blocks.md) and
[DNS](../../01-networking-and-protocols/dns.md).

## Further learning

- [System design overview](../system-design.md)
- [The system design process](system-design-process.md)
- [Back-of-the-envelope estimation](back-of-the-envelope-estimation.md)
- [Building blocks](building-blocks.md)
- [AWS Builders' Library](https://aws.amazon.com/builders-library/)
- [Google SRE books](https://sre.google/books/)
