# Redis

Redis is an in-memory data structure server. It stores keys whose values can
be strings, lists, hashes, sets, sorted sets, streams, and more, and it runs
commands on them in well under a millisecond. Backends use Redis as a cache,
a session store, a rate limiter, a leaderboard, a lock service, a lightweight
message broker, and a queue backend.

## What Redis provides

- **Speed:** data lives in memory, and commands are executed one at a time on
  a main thread, so each command is atomic and very fast.
- **Data structures:** instead of only storing blobs, Redis can increment
  counters, push to lists, rank members in sorted sets, and more on the
  server.
- **Expiration:** any key can have a time to live, which makes caches and
  temporary data simple.
- **Messaging:** Pub/Sub for fire-and-forget broadcasts and Streams for
  durable, consumer-group-based messaging.
- **Persistence and availability:** optional snapshots and append-only files,
  replication, automatic failover with Sentinel, and sharding with Redis
  Cluster.

## How an application uses Redis

1. The application opens a long-lived connection to Redis through a client
   library.
2. It sends commands such as `GET`, `SET`, `INCR`, or `ZADD` over that
   connection.
3. Redis executes each command against data in memory and replies.
4. Keys can expire automatically, and when memory is full Redis evicts keys
   according to its configured policy.
5. Optionally, Redis persists data to disk and replicates it to replicas so it
   survives restarts and failures.

## Practical example

```text
$ redis-cli
127.0.0.1:6379> SET session:abc123 "user:42" EX 1800
OK
127.0.0.1:6379> GET session:abc123
"user:42"
127.0.0.1:6379> INCR page:home:views
(integer) 1
127.0.0.1:6379> ZADD leaderboard 1500 "alice" 1200 "bob"
(integer) 2
127.0.0.1:6379> ZRANGE leaderboard 0 1 REV WITHSCORES
1) "alice"
2) "1500"
3) "bob"
4) "1200"
```

A session with a 30-minute expiry, an atomic counter, and a ranked
leaderboard each take one command.

## Redis topic map

- [Redis fundamentals](redis/redis-fundamentals.md)
- [Redis data structures](redis/data-structures.md)
- [Using Redis as a cache](redis/redis-as-a-cache.md)
- [Common Redis use cases](redis/common-use-cases.md)
- [Pub/Sub and Streams](redis/pub-sub-and-streams.md)
- [Transactions, pipelining, and Lua](redis/transactions-pipelining-and-lua.md)
- [Persistence and high availability](redis/persistence-and-high-availability.md)

**Review**

- [Redis interview questions and answers](redis/interview-questions-and-answers.md)

## Developer perspective and common misconceptions

Design key names deliberately (`object:id:field`), give temporary data a TTL,
set a memory limit with an eviction policy that fits the use case, and avoid
very large keys and slow commands such as `KEYS *` in production. Decide up
front whether Redis holds data you can rebuild (a cache) or data you must not
lose (sessions, queues), because that changes how you configure persistence.

- Redis is not only a cache; its data structures solve many coordination
  problems.
- "Single-threaded" refers to command execution; one slow command blocks all
  other clients.
- Redis persistence exists, but Redis is not a drop-in replacement for a
  primary database.
- Pub/Sub messages are not stored; a subscriber that is offline misses them.

## Further learning

- [Redis documentation](https://redis.io/docs/latest/)
- [Redis commands reference](https://redis.io/docs/latest/commands/)
- [Caching](caching.md) for cache strategies that apply to Redis
- [Redis interview questions and answers](redis/interview-questions-and-answers.md)
