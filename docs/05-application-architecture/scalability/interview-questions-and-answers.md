# Scalability Interview Questions and Answers

These questions review scalability fundamentals, stateless services and
autoscaling, database scaling, availability and reliability, consistency and
the CAP theorem, performance and latency, and capacity planning. Each
question is tagged **Beginner**, **Intermediate**, or **Advanced**; the final
group contains scenario-based questions drawn from real production work.

## Scalability fundamentals

### 1. What is scalability?

Scalability is a system's ability to handle more load (users, requests, data)
by adding resources, while still meeting its goals for latency, errors, and
cost. A scalable system's capacity grows roughly in proportion to the
resources added, without a redesign.

### 2. What is the difference between vertical and horizontal scaling?

Vertical scaling (scaling up) gives one machine more CPU, memory, or disk. It
is simple but has a hard ceiling, gets expensive, and leaves a single point
of failure. Horizontal scaling (scaling out) adds more machines and spreads
the load; it scales further and adds redundancy, but needs load balancing and
stateless design.

### 3. What is the difference between scalability and performance?

Performance is how fast the system handles a given load (latency for one
request). Scalability is how well it keeps that performance as load grows. A
system can be fast for one user and collapse at a thousand, or be slow per
request but scale linearly.

### 4. What is a bottleneck, and how do you find it?

A bottleneck is the resource that limits overall throughput, such as
database CPU, connection pools, or a slow downstream service. Find it by
measuring: load test while watching utilization, saturation, and latency for
each component, and use tracing to see where time goes. Scaling anything
other than the bottleneck does not help.

### 5. What is the scale cube?

The AKF scale cube describes three ways to scale. The X axis clones the
application behind a load balancer (horizontal duplication). The Y axis
splits the system by function or service (functional decomposition). The Z
axis splits data, for example by customer or key range (partitioning or
sharding). Real systems usually combine them.

### 6. Why can adding servers fail to improve throughput?

Because the bottleneck is elsewhere: a single database, a shared lock, a
rate-limited third party, or a cache. More app servers may even make things
worse by opening more database connections. Amdahl's law also limits gains
when part of the work is serialized.

## Stateless services and autoscaling

### 7. What is a stateless service, and why does it scale well?

A stateless service keeps no client-specific data in its own memory between
requests; any state lives in a database, cache, or token. Any instance can
serve any request, so you can add or remove instances freely, and losing one
loses nothing but in-flight requests.

### 8. How do you remove session state from application servers?

Store sessions in a shared store such as Redis or a database, keyed by a
session ID in a cookie, or use self-contained signed tokens (such as JWTs)
that the client sends with each request. Uploaded files go to object storage
and background work to queues, not to local disk or memory.

### 9. What are sticky sessions, and what are their drawbacks?

Sticky sessions make a load balancer send all of a user's requests to the
same instance, usually with a cookie. They let in-memory state work, but load
spreads unevenly, losing an instance loses its users' sessions, and scaling
in or deploying disrupts users. They are best avoided for typical web APIs.

### 10. What signals can drive autoscaling?

CPU utilization, request rate per instance, latency, number of in-flight
requests, queue depth or age of the oldest message for workers, and custom
business metrics. Schedules handle predictable peaks, and some platforms
offer predictive scaling based on history.

### 11. What are common autoscaling pitfalls?

Scaling too slowly for sudden spikes (new instances need minutes to start and
warm up), flapping up and down without cooldown periods, scaling on a metric
that does not reflect the bottleneck, missing minimum or maximum limits, and
scaling the app tier into a database that cannot take the extra connections.

### 12. How should a service shut down gracefully during scale-in or deployment?

It should stop accepting new work (fail readiness checks so the load balancer
drains it), finish in-flight requests within a timeout, stop consumers from
taking new messages, close database connections cleanly, and then exit.

## Database scaling

### 13. How do read replicas help scale a database?

Replicas copy data from the primary and serve read queries, spreading read
load across several machines. Writes still go to the primary. They suit
read-heavy workloads and also provide failover candidates.

### 14. What is replication lag, and what problems does it cause?

Replication lag is the delay before a write on the primary appears on a
replica. Reads from a lagging replica return stale data, such as a user not
seeing a change they just made. Fixes include reading from the primary after
writes, session stickiness, and causal consistency features.

### 15. Why do you need connection pooling?

Opening a database connection is expensive, and databases support a limited
number of connections. A pool keeps a set of open connections that requests
borrow and return. With many app instances, an external pooler such as
PgBouncer keeps the total under the database's limit.

### 16. What is the difference between partitioning and sharding?

Partitioning splits a table into pieces, often within one database server
(for example, by date range). Sharding distributes data across multiple
database servers, each holding a subset, so that storage and write load scale
horizontally. Sharding is partitioning across machines.

### 17. How do you choose a shard key?

Pick a key with high cardinality and even distribution that matches the most
common queries, so most queries hit one shard. Avoid keys that create hot
spots, such as a timestamp that sends all new writes to one shard or a
celebrity user who dominates traffic. Changing the key later is very
expensive.

### 18. What are the drawbacks of sharding?

Cross-shard queries and joins become slow or impossible, transactions across
shards are hard, rebalancing data when adding shards is complex, and
operations (backups, schema changes) multiply. It should come after
indexing, caching, replicas, and vertical scaling.

### 19. What can you try before sharding a database?

Optimize queries and add indexes, cache hot reads, use read replicas, scale
the server vertically, archive or tier old data, move some workloads to
specialized stores (search, analytics), and split data by function into
separate databases.

## Availability and reliability

### 20. What is the difference between availability, reliability, and durability?

Availability is the fraction of time or requests the service works.
Reliability is how consistently it behaves correctly over time. Durability is
the likelihood that stored data is never lost. A service can be available yet
return wrong results, or have durable data while being down.

### 21. How much downtime does 99.9% availability allow?

About 8.76 hours per year, or about 43 minutes per 30-day month. 99.99%
allows about 52.6 minutes per year (about 4.3 minutes per month), and 99.999%
about 5.3 minutes per year.

### 22. How do you calculate the availability of components in series and in parallel?

In series (all are required), multiply the availabilities: two 99.9%
components give about 99.8%. In parallel (any one suffices), the system fails
only if all fail: two independent 99% copies give 1 - 0.01^2 = 99.99%. This
assumes failures are independent.

### 23. What are SLI, SLO, SLA, and an error budget?

An SLI is a measured indicator such as the success rate. An SLO is the
internal target for it, such as 99.9% over 30 days. An SLA is a customer
contract with penalties, usually looser than the SLO. The error budget (100%
minus the SLO) is the unreliability the team may spend on releases and
experiments.

### 24. What is the relationship between MTBF, MTTR, and availability?

Availability is approximately MTBF / (MTBF + MTTR). Because failures cannot
be eliminated, reducing mean time to recovery (fast detection, automatic
failover, quick rollback) often improves availability more than reducing
failure frequency.

### 25. What is the difference between active-active and active-passive redundancy?

In active-active, all copies serve traffic and absorb a failed copy's load.
In active-passive, a standby stays in sync but takes traffic only after
failover. Active-active uses capacity better and fails over faster;
active-passive is simpler for stateful systems such as databases.

### 26. What is a single point of failure, and how do you find them?

A component whose failure stops the whole system, such as one database, one
load balancer, one zone, or one person who knows the deployment. Find them by
tracing every request path and dependency and asking what happens if each
part disappears.

### 27. What is the difference between liveness and readiness checks?

A liveness check asks whether the process is alive; failing it triggers a
restart. A readiness check asks whether the instance can serve traffic now;
failing it removes the instance from the load balancer without a restart.
Liveness checks should be shallow so a slow dependency does not restart every
instance.

### 28. What are RPO and RTO?

RPO (recovery point objective) is the maximum acceptable data loss, measured
in time. RTO (recovery time objective) is the maximum acceptable time to
restore service. They drive the disaster recovery strategy, from backup and
restore to active-active multi-region.

### 29. What is graceful degradation?

Serving a reduced but useful experience when a dependency fails instead of
failing completely: showing cached data, hiding non-essential features,
switching to read-only mode, or shedding low-priority traffic to protect
critical paths.

### 30. What is chaos engineering?

The practice of deliberately injecting failures (killing instances, adding
latency, cutting dependencies) in a controlled way to verify that the system
tolerates them. You define a steady state, form a hypothesis, inject the
fault with a limited blast radius, observe, and fix weaknesses.

## Consistency and the CAP theorem

### 31. State the CAP theorem.

For a replicated data store, when a network partition occurs, the system
must choose between consistency (every read returns the latest write, i.e.
linearizability) and availability (every non-failing node returns a
non-error response). Without a partition, both can be provided.

### 32. Why is "CA" not a real choice for distributed systems?

Network partitions cannot be ruled out in a distributed system, so partition
tolerance is not optional. A system that gives up partition tolerance is
effectively a single node. The meaningful choice is CP or AP behavior during
partitions.

### 33. What is PACELC?

An extension of CAP: if there is a partition (P), choose availability (A) or
consistency (C); else (E), in normal operation, choose lower latency (L) or
consistency (C). It captures the everyday trade-off of waiting for replicas.

### 34. Explain strong consistency versus eventual consistency.

With strong (linearizable) consistency, once a write completes every
subsequent read sees it. With eventual consistency, replicas may temporarily
return older values but converge if writes stop. Strong consistency costs
latency and availability; eventual consistency is faster and more available
but can show stale data.

### 35. What are read-your-writes and monotonic reads?

Read-your-writes guarantees that a client always sees its own earlier writes.
Monotonic reads guarantees that once a client has seen a value, it never sees
an older one later. They are session guarantees that make eventually
consistent systems feel correct to users.

### 36. How do quorum reads and writes work?

With N replicas, a write waits for W acknowledgements and a read queries R
replicas. If R + W > N, every read overlaps the latest successful write in at
least one replica. For example, N = 3, W = 2, R = 2 tolerates one replica
failure for both reads and writes.

### 37. How are conflicts resolved in eventually consistent systems?

With last-write-wins (simple, but loses data and depends on clocks), version
vectors that detect concurrent updates for the application to merge, CRDTs
that merge automatically and deterministically, or application rules such
as merging shopping cart items. Avoiding conflicts with a single writer per
item is often best.

### 38. Which consistency level would you choose for a bank balance and for a like counter?

A bank balance needs strong consistency, or all updates serialized through
one leader in a transaction, to prevent overspending. A like counter can be
eventually consistent: a few seconds of staleness is invisible and the
cheaper, more available option scales better.

## Performance and latency

### 39. What is the difference between latency and throughput?

Latency is the time one operation takes; throughput is how many operations
complete per unit of time. They are related through concurrency (Little's
law) but distinct: batching can raise throughput while increasing per-item
latency.

### 40. Why use percentiles instead of averages for latency?

Averages hide the slow tail: a few very slow requests barely move the mean
while badly affecting real users. Percentiles such as p95 and p99 describe
actual user experiences. Percentiles must be computed from histograms and
never averaged across servers.

### 41. What is tail latency amplification?

When one request fans out to many backends and waits for all of them, the
chance that at least one is slow grows quickly. If each of 100 backends is
slow 1% of the time, about 63% of fan-out requests hit at least one slow
call, so the parts' p99 becomes the whole request's typical latency.

### 42. What is Little's law, and how is it used?

L = λ x W: the average number of items in a system equals the arrival rate
times the average time each spends there. It sizes concurrency, connection
pools, and workers: 200 requests/s at 0.25 s each means about 50 in flight.

### 43. What is the N+1 query problem?

Loading a list with one query and then running one extra query per item, so
50 items cost 51 round trips. Fix it with a join, a single batched `IN` query,
eager loading in an ORM, or DataLoader-style batching in GraphQL.

### 44. Name techniques to reduce API latency.

Caching, avoiding N+1 queries, adding indexes, parallelizing independent
calls, connection pooling and keep-alive, moving slow work to background
jobs, pagination and smaller payloads, compression, CDNs and servers close to
users, and precomputing expensive results.

### 45. Roughly how do memory, SSD, and network latencies compare?

A main memory reference is around 100 nanoseconds, a random SSD read is tens
to roughly a hundred microseconds, a round trip within a data center is about
half a millisecond, and a round trip between continents is on the order of
100 milliseconds. Avoiding network round trips usually matters most.

## Capacity planning

### 46. What is capacity planning?

The process of forecasting demand and making sure enough resources (compute,
database, storage, bandwidth, quotas) exist to meet it with headroom and at a
reasonable cost. It combines traffic forecasts, measured per-instance
capacity, failure margins, and regular review.

### 47. Why should systems not run near 100% utilization?

Queueing makes response time grow sharply as utilization approaches 100%: in
a simple model, response time is service time / (1 - utilization), so 90%
busy means about 10 times the service time. Headroom also absorbs spikes,
failures, and autoscaling delays.

### 48. How do you determine how many instances you need?

Forecast peak requests per second (including growth), load test to find the
maximum sustainable throughput per instance within the latency SLO, divide
peak load by a target utilization of that maximum, then add capacity so that
losing one zone or instance still carries the peak.

### 49. When would you use provisioned capacity instead of autoscaling?

For a predictable baseline, for stateful systems such as databases that
cannot scale out instantly, when warm-up time is long, and for known events
where capacity must be in place before traffic arrives. Autoscaling then
covers the variable part above the baseline.

### 50. Estimate the peak request rate for 10 million daily users making 20 requests each.

That is 200 million requests per day, or about 200,000,000 / 86,400 ≈ 2,300
requests per second on average. With a peak-to-average ratio of 3, plan for
roughly 7,000 requests per second, plus growth and failure headroom.

## Scenario-based questions

### 51. Checkout p99 latency doubled after traffic grew 30%, but p50 barely moved and average CPU is only 55%. What do you check?

**What to check first:** latency histograms per dependency of the checkout
request, and saturation of shared resources (database connection pool wait
time, lock waits, one hot partition or replica).

**How to confirm:** trace slow requests and compare them with fast ones;
check whether slow requests all wait on the same resource.

**Likely causes and fixes:** a resource near saturation causes queueing that
first shows in the tail (pool exhaustion, lock contention, a hot shard).
Increase or fix the constrained resource, reduce time held per request, and
add headroom. Averages hide this; see
[performance and latency](performance-and-latency.md) and
[capacity planning](capacity-planning.md).

### 52. Users update their profile, refresh, and see the old value for a few seconds. What is happening?

**What to check first:** where profile reads are routed: to asynchronous read
replicas or a cache?

**How to confirm:** compare the replica-lag metric at the time of the
complaints, and check whether the cache is invalidated on update.

**Likely causes and fixes:** replication lag (or a stale cache) breaks
read-your-writes. Route a user's reads to the primary for a short window
after they write, track versions, use causally consistent sessions, or
invalidate the cache on write. See
[consistency and the CAP theorem](consistency-and-cap-theorem.md).

### 53. During an availability-zone outage, latency and errors spiked in the surviving zones even though autoscaling started adding instances. Why?

**What to check first:** how much spare capacity each zone had before the
outage, and how long new instances took to become ready.

**How to confirm:** CPU and connection metrics in surviving zones hit their
limits immediately, while new instances arrived many minutes later.

**Likely causes and fixes:** the system relied on reacting to the failure
instead of being statically stable. Keep enough capacity in each zone to
carry the load if one zone fails (for example, overprovision by 50% with three
zones), and treat autoscaling as a supplement. See
[availability and reliability](availability-and-reliability.md).

### 54. A short database slowdown caused every application instance to restart at the same time, turning it into a full outage. What went wrong?

**What to check first:** the liveness and readiness probe definitions.

**How to confirm:** orchestrator events show liveness probe failures across
all instances during the database slowdown.

**Likely causes and fixes:** the liveness probe checks the database, so a
dependency problem triggered mass restarts. Make liveness shallow (the
process responds), move dependency checks into readiness with short timeouts,
and degrade gracefully when the database is slow. See
[availability and reliability](availability-and-reliability.md).

### 55. After scaling the API from 10 to 40 instances, the database reports "too many connections". How do you fix it?

**What to check first:** pool size per instance multiplied by instance count
(plus workers and cron jobs) compared with the database's connection limit.

**How to confirm:** connection count on the database rises in step with the
instance count.

**Likely causes and fixes:** each instance opens its own pool, so total
connections grew fourfold. Reduce per-instance pool sizes based on Little's
law, put a connection pooler such as PgBouncer in front of the database, and
set autoscaling maximums that respect the limit. See
[database scaling](database-scaling.md).

### 56. Marketing plans a flash sale in two weeks expecting five times normal peak traffic. What do you do?

**What to check first:** the current peak per service and which components
are slowest to scale (database, third-party quotas, caches).

**How to confirm:** run load tests at and above the expected peak with a
realistic traffic mix and data size; find the first bottleneck and the knee
of the latency curve.

**Likely causes and fixes:** pre-provision or schedule scaling before the
sale, scale the database ahead (bigger instance, replicas, caching for hot
products), request quota increases, add load shedding and queueing for
non-critical work, and prepare a runbook and dashboards. See
[capacity planning](capacity-planning.md).

### 57. Several times an hour, every endpoint in a Node.js service slows down at the same moment. What do you check?

**What to check first:** the event-loop delay metric and CPU profiles around
the slow periods.

**How to confirm:** event-loop delay spikes coincide with the slowdowns, and a
CPU profile shows one synchronous function dominating (large `JSON.parse`,
sync crypto, a heavy regex, a big report).

**Likely causes and fixes:** synchronous CPU work blocking the event loop, so
all requests wait. Move it to worker threads or a background job, or stream
the data. See [the event loop](../../03-backend-development/nodejs/event-loop.md)
and [performance and latency](performance-and-latency.md).

### 58. Every night, read replica lag rises to several minutes, and morning reports show stale numbers. What do you do?

**What to check first:** which jobs write to the database at night and how
large their transactions are.

**How to confirm:** lag spikes line up with a nightly batch or migration;
replicas are replaying a few very large transactions.

**Likely causes and fixes:** large bulk writes that replicas apply slowly.
Chunk and throttle the batch, avoid one giant transaction, schedule reports
after replicas catch up (or read them from the primary or a dedicated
analytics replica), and alert on lag. See
[database scaling](database-scaling.md).

### 59. Database load spikes every 10 minutes like clockwork. What is the likely cause?

**What to check first:** cache TTLs and scheduled jobs with a 10-minute
period.

**How to confirm:** cache miss rate spikes at the same moments; many requests
miss the same keys at once.

**Likely causes and fixes:** a cache stampede when many hot keys expire
together. Add random jitter to TTLs, coalesce concurrent misses for the same
key, or refresh hot keys in the background before they expire. See
[caching](../caching/cache-fundamentals.md).

### 60. After a database failover, half the app instances kept failing for 15 minutes while the others recovered immediately. Why?

**What to check first:** how instances find the primary: DNS name and TTL,
cached addresses, connection pool behavior.

**How to confirm:** the failing instances still had open connections or a
cached address pointing at the old primary; errors such as "not primary".

**Likely causes and fixes:** long DNS TTLs or pools that keep stale
connections. Use short TTLs for failover endpoints, drivers that discover the
replica-set topology, connection validation, and retries on "not primary"
errors. Test failover regularly. See
[availability and reliability](availability-and-reliability.md).

### 61. The product team wants 99.99% availability for a service that synchronously calls three internal services, each at 99.9%. Is it possible?

**What to check first:** whether the three calls are on the critical path and
synchronous.

**How to confirm:** in series, availability multiplies:
0.999 x 0.999 x 0.999 ≈ 99.7%, before counting the service's own failures.

**Likely causes and fixes:** not as designed. Options are raising the
dependencies' availability, removing them from the critical path (caching,
asynchronous processing, fallbacks and graceful degradation), or agreeing on
a realistic SLO. See [availability and reliability](availability-and-reliability.md).

### 62. Average CPU across the fleet is 40%, yet users complain about slowness at peak times. How can both be true?

**What to check first:** per-instance and per-resource saturation at peak,
using per-minute maximums rather than hourly averages.

**How to confirm:** one zone, one instance group, one database partition, or
one dependency is saturated while the rest are idle; or short peaks are
averaged away.

**Likely causes and fixes:** uneven load (a hot key, sticky sessions, an
unbalanced zone) or averaged metrics. Monitor percentiles and peaks per
resource, rebalance load, and fix the hot spot. See
[capacity planning](capacity-planning.md).

### 63. Two customers both bought the last unit in stock. How do you prevent overselling?

**What to check first:** how the stock check and decrement are implemented,
and whether the check reads from a replica or cache.

**How to confirm:** logs show two concurrent "check stock, then decrement"
sequences both seeing quantity 1.

**Likely causes and fixes:** a race condition with a check-then-act pattern
and possibly a stale read. Use an atomic conditional update on the primary
(`UPDATE ... SET qty = qty - 1 WHERE sku = $1 AND qty > 0`), a transaction
with row locking, or a reservation step. See
[concurrency and race conditions](../../03-backend-development/backend-concepts/concurrency-and-race-conditions.md).

### 64. A downstream service recovered from an outage and was immediately overwhelmed again by your service. Why?

**What to check first:** retry configuration at every layer (client, gateway,
service) and the request rate at the moment of recovery.

**How to confirm:** traffic to the dependency spiked far above normal right
when it came back; retries had no backoff or jitter.

**Likely causes and fixes:** a retry storm amplified by retries at several
layers. Retry at one layer with exponential backoff and jitter, use retry
budgets and circuit breakers, and shed low-priority work. See
[timeouts, retries, and idempotency](../../03-backend-development/backend-concepts/timeouts-retries-and-idempotency.md).

## Further learning

- [Scalability overview](../scalability.md)
- [Availability and reliability](availability-and-reliability.md),
  [consistency and the CAP theorem](consistency-and-cap-theorem.md),
  [performance and latency](performance-and-latency.md), and
  [capacity planning](capacity-planning.md)
- [Google SRE book](https://sre.google/sre-book/table-of-contents/)
- [AWS Well-Architected Reliability Pillar](https://docs.aws.amazon.com/wellarchitected/latest/reliability-pillar/welcome.html)
