# Redis Interview Questions and Answers

These questions review Redis fundamentals, data structures, caching,
common patterns, messaging, atomic operations, persistence, and high
availability.

## Fundamentals

### 1. What is Redis?

Redis is an in-memory data structure server. Clients store values under
keys and manipulate them with type-specific commands for strings, lists,
hashes, sets, sorted sets, streams, and more. It is used for caching,
sessions, counters, rate limits, queues, leaderboards, and messaging.

### 2. Why is Redis so fast?

Data lives in memory, commands are executed one at a time by a single main
thread without locking, small values use compact encodings, and the
protocol is cheap to parse. Optional I/O threads (since Redis 6) handle
network reads and writes in parallel while command execution stays
single-threaded.

### 3. If Redis is single-threaded, what is the main operational risk?

A slow command blocks every other client until it finishes. `KEYS *` on a
large dataset, `DEL` of a huge value, `HGETALL` on a giant hash, or a long
Lua script can freeze the server. Use `SCAN`, `UNLINK`, bounded collections,
and short scripts.

### 4. How does key expiration work?

A key can have a TTL set with `EXPIRE`, `SET ... EX`, and related commands.
Redis deletes expired keys lazily when they are accessed and actively
through a background cycle that samples keys with TTLs. `TTL` returns `-1`
for no expiry and `-2` for a missing key.

### 5. Which operations clear a key's TTL?

Commands that replace the value, such as `SET` without `KEEPTTL`, clear the
TTL. Commands that modify the value in place, such as `INCR`, `LPUSH`, or
`HSET`, keep it. `PERSIST` removes a TTL explicitly.

### 6. Why should you use `SCAN` instead of `KEYS`?

`KEYS pattern` walks the entire keyspace in one blocking call. `SCAN`
returns keys in small batches with a cursor, so the server keeps serving
other clients. `SCAN` may return a key more than once, so callers should
deduplicate.

### 7. How does Redis compare with Memcached?

Both are in-memory caches. Memcached stores only strings, is
multi-threaded, and has no persistence or built-in replication. Redis
offers rich data types, persistence, replication, failover, clustering,
Pub/Sub, streams, transactions, and scripting.

### 8. What is Valkey?

Valkey is a BSD-licensed fork of the last open-source Redis code (the 7.2
line), started under the Linux Foundation in March 2024 after Redis moved
new versions to source-available licenses. It is command-compatible for shared features, and some managed
services, such as Amazon ElastiCache, offer it.

## Data structures

### 9. What data types does Redis support?

Strings, lists, hashes, sets, sorted sets, streams, bitmaps (operations on
strings), HyperLogLog, and geospatial indexes, plus JSON through the JSON
module (included in Redis 8 and later). Each type has its own commands.

### 10. Why is `INCR` safer than reading and writing a counter in the application?

`INCR` performs the read and update as one atomic command, so concurrent
clients never overwrite each other's increments. A read-modify-write in the
application can lose updates when two clients read the same value.

### 11. When would you use a hash instead of a JSON string?

Use a hash when you read or update individual fields, such as incrementing
a login counter with `HINCRBY`, because a JSON string must be read, changed,
and rewritten as a whole. Small hashes are also stored compactly. JSON
strings (or the JSON type) suit nested data that is read whole.

### 12. How is a sorted set implemented, and what is it good for?

It combines a skip list, which keeps members ordered by score with
O(log N) inserts and range queries, with a hash table for O(1) score
lookups. It suits leaderboards, priority queues, time-ordered indexes, and
sliding-window rate limiting.

### 13. How do lists and streams differ for queuing?

A list pops an item and forgets it, so a worker crash loses the item and
there are no acknowledgments. A stream stores entries with IDs, supports
consumer groups, tracks unacknowledged entries, and allows replay and
recovery.

### 14. What is HyperLogLog?

A probabilistic structure that estimates the number of distinct elements
using at most about 12 KB per key, with a standard error of about 0.81%. It
cannot list its members. It is used for approximate unique visitors or
searches.

### 15. What are bitmaps used for?

Bitmaps treat a string as an array of bits addressed by offset. With
integer user IDs as offsets, one key can record a yes/no fact, such as "was
active today", for millions of users compactly, and `BITCOUNT` and `BITOP`
compute totals and combinations.

### 16. How do geospatial commands work?

`GEOADD` stores members with longitude and latitude in a sorted set, using
a geohash as the score. `GEOSEARCH` finds members within a radius or box,
and `GEODIST` measures distances. Longitude comes before latitude.

## Caching

### 17. How does cache-aside work with Redis?

The application checks Redis first. On a hit it returns the cached value; on
a miss it loads from the database, stores the result in Redis with a TTL,
and returns it. On writes, it updates the database and then deletes the
cached key.

### 18. Why delete cache entries on write instead of updating them?

Two concurrent writers that update the cache can finish in a different
order than their database writes, leaving an old value cached. Deleting
forces the next read to load the current value. A TTL bounds staleness if
an invalidation is missed.

### 19. Why add jitter to TTLs?

Keys created together with the same TTL expire together, sending a burst of
misses to the database. Randomizing each TTL slightly spreads expirations
out over time.

### 20. What eviction policies does Redis offer?

`noeviction` rejects writes when memory is full. `allkeys-lru` and
`allkeys-lfu` evict the least recently or least frequently used keys;
`volatile-lru`, `volatile-lfu`, `volatile-ttl`, and `volatile-random` only
evict keys with a TTL; `allkeys-random` evicts randomly. Current Redis
documentation also lists `allkeys-lrm` and `volatile-lrm` (least recently
modified). Caches usually use an `allkeys` policy.

### 21. What is a big key, and why is it a problem?

A big key is a single value or collection that is very large. Reading,
writing, or deleting it blocks the command thread, saturates the network,
and concentrates memory on one cluster node. Find big keys with
`redis-cli --bigkeys` or `MEMORY USAGE` and split or shrink them.

### 22. What is a cache stampede, and how do you prevent it?

When a popular key expires, many concurrent requests miss and all query the
database at once. Prevent it with jittered TTLs, a short lock so only one
request rebuilds the value, early background refresh of hot keys, and
serving slightly stale data while rebuilding.

### 23. How do you measure cache effectiveness?

Compute the hit rate from `INFO stats`: `keyspace_hits / (keyspace_hits +
keyspace_misses)`. These counters are server-wide, so per-prefix metrics in
the application are more precise. Also monitor evictions, memory, and
latency.

## Common use cases

### 24. Why store sessions in Redis?

With several application instances, in-process sessions are not shared, so
users appear logged out when routed elsewhere. Redis gives every instance
the same session data with automatic expiry. Session data must not be
evicted, so it belongs on an instance with `noeviction`; a `volatile-*`
policy would not protect it, because session keys carry TTLs.

### 25. How do you implement a fixed-window rate limiter in Redis?

Use a key per client and window, `INCR` it for each request, and set a TTL
equal to the window when the key is created, inside one transaction or Lua
script. Reject the request with `429` when the count exceeds the limit.

### 26. How does a sorted set implement a sliding-window rate limiter?

Store each request as a member scored by its timestamp. For each new
request, remove members older than the window with `ZREMRANGEBYSCORE`, add
the new one, and count with `ZCARD`. It is accurate but stores one member
per request.

### 27. How do you build a leaderboard?

Use a sorted set with player IDs as members and points as scores.
`ZINCRBY` adds points, `ZRANGE ... REV WITHSCORES` returns the top players,
and `ZREVRANK` gives a player's rank, all in O(log N) time.

### 28. How do you acquire and release a Redis lock correctly?

Acquire with `SET lock:resource <random-token> NX PX <ttl>` so only one
client succeeds and the lock expires if the holder crashes. Release with a
Lua script that deletes the key only if its value still equals your token,
so you never delete a lock someone else acquired after yours expired.

### 29. What are the limitations of Redis locks and Redlock?

An expiring lock can be held by two clients if the first pauses longer than
the TTL, and asynchronous replication can lose a lock on failover. Redlock
uses a majority of independent primaries, but its safety still depends on
timing assumptions. Use Redis locks for efficiency, and fencing tokens or
database constraints when correctness matters.

### 30. What is a fencing token?

A number that increases every time a lock is granted. The protected
resource remembers the highest token it has seen and rejects operations
carrying an older one, so a client whose lock silently expired cannot
overwrite newer work.

### 31. Why use BullMQ instead of a plain Redis list for jobs?

A list loses jobs when a worker crashes after popping and has no retries.
BullMQ adds retries with backoff, delayed jobs, scheduled (repeatable) jobs,
priorities, concurrency control, and job events, and it moves each job
between states atomically with Lua scripts. Its documentation requires the
`noeviction` policy so jobs are never evicted.

## Pub/Sub and streams

### 32. What delivery guarantee does Redis Pub/Sub provide?

At most once. Messages are delivered only to clients subscribed at that
moment and are not stored, so disconnected or slow subscribers miss them.
There are no acknowledgments or retries.

### 33. Why does a subscriber need its own connection?

With the RESP2 protocol, a connection that has subscribed can only run
subscription commands and `PING`. Applications therefore use one connection
for subscriptions and another for normal commands.

### 34. How do consumer groups work in Redis Streams?

A consumer group tracks the last entry delivered to the group. Each entry is
given to one consumer in the group via `XREADGROUP`, recorded in the pending
entries list until `XACK`, and can be claimed by another consumer with
`XAUTOCLAIM` if the original consumer fails. Several groups can read the same
stream independently.

### 35. What is the pending entries list?

The list of entries delivered to consumers in a group but not yet
acknowledged. It lets a restarted consumer reprocess its own unacknowledged
entries and lets other consumers take over stale ones. It also records how
many times each entry was delivered.

### 36. How do you stop a stream from growing forever?

Trim it with `MAXLEN` (keep roughly N entries) or `MINID` (drop entries
older than an ID), either on `XADD` or with `XTRIM`. The `~` modifier
trims approximately and is much cheaper. Acknowledging entries does not
delete them.

### 37. When would you choose Kafka or RabbitMQ over Redis Streams?

When you need long retention or volumes larger than memory, partitioned
scaling across many brokers, strong durability with disk-replicated
acknowledgments, or rich routing features. Redis Streams fit moderate,
short-lived workloads where Redis is already in use.

## Transactions, pipelining, and Lua

### 38. What does `MULTI`/`EXEC` guarantee?

Queued commands run sequentially at `EXEC` with no other client's commands
interleaved. If a command is rejected while queuing, nothing runs. It does
not roll back: if a command fails during execution, the others still take
effect.

### 39. What does `WATCH` do?

`WATCH` marks keys so that the next `EXEC` on that connection aborts
(returns nil) if any watched key changed in the meantime. It provides
optimistic locking for read-decide-write logic, with the client retrying on
conflict.

### 40. What is pipelining, and is it atomic?

Pipelining sends many commands without waiting for each reply, saving round
trips and system calls. It is not atomic: other clients' commands can run
between pipelined commands. Combine it with `MULTI`/`EXEC` when atomicity is
also needed.

### 41. Why use Lua scripts, and what are their risks?

A script runs atomically on the server, so it can read, decide, and write
in one step without races and in one round trip. Because nothing else runs
during a script, long scripts block all clients and trigger `BUSY` errors.
Scripts must receive all key names through `KEYS`.

### 42. Why must keys be passed in `KEYS` rather than built inside a script?

Redis uses the declared keys to route the script to the right node in a
cluster, to verify they share a hash slot, and to check access permissions.
Keys built inside the script bypass these checks and break in clustered
deployments.

### 43. What are Redis Functions?

Introduced in Redis 7.0, Functions are named server-side functions grouped
in libraries, loaded with `FUNCTION LOAD` and called with `FCALL`. Unlike
scripts in the `EVAL` cache, they are persisted and replicated with the
data, so they survive restarts and failovers.

## Persistence and high availability

### 44. Compare RDB and AOF persistence.

RDB writes periodic point-in-time snapshots: compact and fast to load, but
writes since the last snapshot are lost on a crash. AOF logs every write
and replays it on restart; with `appendfsync everysec` at most about one
second is lost. Many deployments use both.

### 45. Is Redis replication synchronous?

No. The primary acknowledges writes before replicas receive them, so a
failover can lose recent writes. `WAIT` can block until a number of
replicas have the data, and `min-replicas-to-write` makes an isolated
primary refuse writes, but neither makes Redis strongly consistent.

### 46. What does Redis Sentinel do?

Sentinel processes monitor a primary and its replicas, agree by quorum that
the primary has failed, promote a replica, reconfigure the others, and tell
clients the new primary's address. At least three Sentinels on separate
machines are recommended.

### 47. How does Redis Cluster distribute data?

Keys map to one of 16,384 hash slots using `CRC16(key) mod 16384`, and each
primary owns a range of slots, with replicas for failover. Hash tags
(`{...}`) force related keys into the same slot. Clients follow `MOVED` and
`ASK` redirects to reach the node that owns a slot.

### 48. What limitations does Redis Cluster place on applications?

Multi-key commands, transactions, and scripts work only when all keys are
in the same slot; otherwise Redis returns `CROSSSLOT`. Only database 0 is
available, and clients must be cluster-aware.

### 49. When would you choose Sentinel versus Cluster?

Choose Sentinel when the dataset and write load fit on one primary and you
need automatic failover with no multi-key restrictions. Choose Cluster when
data or write throughput exceeds one server and you can design keys with
hash tags.

### 50. Is Redis persistence a backup strategy?

No. Persistence and replicas reproduce mistakes such as `FLUSHALL` or a bad
deploy. Take scheduled RDB backups, store them off the server, and test
restores.

## Scenario-based questions

### 51. Redis latency spikes every few minutes and clients time out. What do you check?

**What to check first:** whether the spikes line up with something
periodic: snapshots (`save` rules), AOF rewrites, key expiry bursts, or a
cron job.

**How to confirm:** run `SLOWLOG GET` for slow commands; enable the latency
monitor (`CONFIG SET latency-monitor-threshold 100`) and read
`LATENCY DOCTOR`; compare `latest_fork_usec` in `INFO stats` with the spike
times.

**Likely causes and fixes:** a slow command such as `KEYS *` or a `DEL` of a
big key (use `SCAN`, `UNLINK`, split big keys); slow forks on a large
dataset or with transparent huge pages (disable THP, smaller instances,
schedule saves off-peak). See [Redis fundamentals](redis-fundamentals.md)
and [persistence and high availability](persistence-and-high-availability.md).

### 52. Writes start failing with out-of-memory errors while reads still work. What is happening?

**What to check first:** `INFO memory` for `used_memory` versus
`maxmemory`, and the `maxmemory-policy`.

**How to confirm:** the policy is `noeviction` (the default) and memory is at
the limit; `--bigkeys`/`--memkeys` show which keys hold the memory.

**Likely causes and fixes:** keys without TTLs, big keys, or a growing
backlog. Add TTLs, choose an eviction policy for cache instances, keep
must-keep data on separate `noeviction` instances, and alert well before
the limit. See [using Redis as a cache](redis-as-a-cache.md).

### 53. Users are randomly logged out during busy hours. How do you investigate?

**What to check first:** whether sessions share a Redis instance with a
cache that evicts keys.

**How to confirm:** `evicted_keys` in `INFO stats` rises during the busy
hours; `GET sess:<id>` returns nothing for users who still hold a session
cookie.

**Likely causes and fixes:** an `allkeys-*` policy evicts session keys, and
a `volatile-*` policy would too, because sessions have TTLs. Move sessions
to their own `noeviction` instance with persistence. See
[common use cases](common-use-cases.md).

### 54. After you add a Redis cache, the database still gets a load spike every five minutes. Why?

**What to check first:** whether the hot keys share the same TTL (300
seconds) and expire together.

**How to confirm:** `keyspace_misses` and database queries per second jump
at the same moments; `TTL` on the hot keys counts down in step.

**Likely causes and fixes:** synchronized expiry and a cache stampede on hot
keys. Add TTL jitter, let one request rebuild with a short
`SET lock:<key> <token> NX PX` lock, and refresh the hottest keys early. See
[using Redis as a cache](redis-as-a-cache.md).

### 55. A product's new price is in the database, but users still see the old one. What do you check?

**What to check first:** whether the code path that updated the price also
deleted the cache key.

**How to confirm:** `GET` on the cache key returns the old JSON while the
database has the new value; `TTL` shows how long it will survive.

**Likely causes and fixes:** a write path that skips invalidation, a cache
update racing with another writer, or a key that omits an input such as the
language. Delete keys after every write, keep TTLs as a safety net, and use
versioned keys for bulk changes. See [using Redis as a cache](redis-as-a-cache.md).

### 56. After a failover, a few orders marked "paid" in Redis are missing. How could that happen?

**What to check first:** the timeline of the failover against the missing
writes.

**How to confirm:** the writes were acknowledged by the old primary just
before it failed; the promoted replica's replication offset was behind.

**Likely causes and fixes:** replication is asynchronous, so acknowledged
writes not yet sent to a replica are lost. Use `WAIT` for important writes,
configure `min-replicas-to-write` and `min-replicas-max-lag`, and keep
payment state in a database. See
[persistence and high availability](persistence-and-high-availability.md).

### 57. After moving to Redis Cluster, some operations fail with `CROSSSLOT`. How do you fix them?

**What to check first:** which commands, transactions, or scripts touch more
than one key.

**How to confirm:** `CLUSTER KEYSLOT` on each key shows different slots.

**Likely causes and fixes:** related keys hash to different slots. Give keys
used together the same hash tag (`{user:42}:cart`, `{user:42}:orders`),
pass every key in `KEYS` for scripts, and use pipelined single-key commands
where keys cannot share a slot. See
[transactions, pipelining, and Lua](transactions-pipelining-and-lua.md).

### 58. `EVALSHA` calls start failing with `NOSCRIPT` right after a failover. Why?

**What to check first:** whether the script was loaded only on the old
primary.

**How to confirm:** `SCRIPT EXISTS <sha1>` on the new primary returns `0`.

**Likely causes and fixes:** the script cache is volatile and can be cleared
on restart or failover. Fall back to `EVAL` on `NOSCRIPT` (most clients do),
or load the logic as a Redis Function, which is persisted and replicated. See
[transactions, pipelining, and Lua](transactions-pipelining-and-lua.md).

### 59. Every client suddenly gets `BUSY` errors. What do you do?

**What to check first:** whether a Lua script or Function is still running.

**How to confirm:** the Redis log reports a script running too long; the
errors started when a script exceeded `busy-reply-threshold`.

**Likely causes and fixes:** a script looping over a large collection. Use
`SCRIPT KILL` (or `FUNCTION KILL`) if it has not written anything;
otherwise only `SHUTDOWN NOSAVE` is allowed. Rewrite it to touch a bounded
number of keys. See [transactions, pipelining, and Lua](transactions-pipelining-and-lua.md).

### 60. A stream's consumer group keeps falling behind and the pending list grows. What do you check?

**What to check first:** `XINFO GROUPS key` for `lag` and `pending`.

**How to confirm:** the `XPENDING key group` summary shows old entries
assigned to consumers that crashed or keep failing on the same entries.

**Likely causes and fixes:** crashed consumers, poison messages, or too few
consumers. Run `XAUTOCLAIM` periodically, acknowledge only after success,
dead-letter entries with high delivery counts, add consumers, and trim with
`MAXLEN ~` or `MINID`. See [Pub/Sub and streams](pub-sub-and-streams.md).

### 61. Users who reconnect to a chat miss messages sent while they were away. Why?

**What to check first:** whether messages are delivered with Pub/Sub.

**How to confirm:** `PUBLISH` returned `0` or a lower count than expected
while the user's server was reconnecting.

**Likely causes and fixes:** Pub/Sub is at-most-once and stores nothing.
Load recent history from the database (or a stream) on reconnect, or carry
must-deliver events in a stream with a consumer group. See
[Pub/Sub and streams](pub-sub-and-streams.md).

### 62. One client stays rate-limited long after the window should have reset. What happened?

**What to check first:** the TTL of that client's counter key.

**How to confirm:** `TTL rate:<prefix>:<ip>:<window>` returns `-1`, meaning
the key never expires.

**Likely causes and fixes:** `INCR` and `EXPIRE` ran as separate calls and
the process crashed in between, or `EXPIRE` was skipped. Run them together
in `MULTI`/`EXEC` or a Lua script, use `EXPIRE ... NX`, and delete the stuck
key. See [common use cases](common-use-cases.md).

### 63. A daily report was sent twice even though it is protected by a Redis lock. How?

**What to check first:** how long the job took compared with the lock's TTL.

**How to confirm:** logs show the first worker still running when the
second acquired the lock; GC pauses or slow calls stretched the first run.

**Likely causes and fixes:** the lock expired while its holder was still
working, so a second worker took it. Make the job idempotent, set the TTL
well above the worst case, and use fencing tokens or a database constraint
where duplicates cause harm. See [common use cases](common-use-cases.md).

### 64. After a traffic increase, new connections to Redis are refused. What do you check?

**What to check first:** `connected_clients` versus `maxclients` (10,000 by
default) in `INFO clients`.

**How to confirm:** `rejected_connections` in `INFO stats` is increasing;
the connection count grows with request volume.

**Likely causes and fixes:** a client created per request, or connections
never closed. Create one client per process, reuse it, close it on
shutdown, and size `maxclients` and file-descriptor limits for the real
number of processes. See [Redis fundamentals](redis-fundamentals.md).

### 65. A replica keeps re-copying the whole dataset from the primary. Why?

**What to check first:** `sync_full` in `INFO stats` and the replica's
`master_link_status`.

**How to confirm:** each reconnect triggers a full resynchronization
instead of a partial one, and the logs show the replication link dropping
during transfers.

**Likely causes and fixes:** the replication backlog (`repl-backlog-size`,
1 MB by default) is too small to cover the disconnect, or the
`client-output-buffer-limit replica` setting cuts the link during large
transfers. Raise both for big or busy datasets. See
[persistence and high availability](persistence-and-high-availability.md).

## Further learning

- [Redis overview](../redis.md)
- [Redis documentation: Data types](https://redis.io/docs/latest/develop/data-types/)
- [Redis command reference](https://redis.io/docs/latest/commands/)
- [Redis documentation: Persistence](https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/)
