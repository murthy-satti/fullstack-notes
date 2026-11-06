# Sharding

Sharding distributes collection data across multiple shards. A sharded deployment includes shards, mongos query routers, and config servers. Applications connect through mongos, which uses shard-key values and cluster metadata to target operations.

Shard-key choice strongly affects distribution and query efficiency. Evaluate cardinality, write patterns, range queries, common filters, and growth. A monotonically increasing key can concentrate new writes on one range. A hashed key can distribute writes but make range queries less targeted. Compound keys can balance access patterns when selected from measured workload.

Queries containing shard-key predicates can target a subset of shards. Queries without them may scatter across many shards. Balancing and chunk migration move data but do not fix a hot key or poor targeting. Unique indexes and shard-key rules constrain choices; plan carefully because changing a key can be costly.

Do not shard by default. First confirm that data modeling, indexes, and a replica set cannot meet measured capacity or throughput needs. Sharding adds operational complexity. See [sharding](https://www.mongodb.com/docs/manual/sharding/) and [choose a shard key](https://www.mongodb.com/docs/manual/core/sharding-choose-a-shard-key/).
