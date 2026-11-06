# Transactions, Replication, and Sharding

## Transactions

A single-document write is atomic, including changes to nested fields and arrays in that document. Prefer a model that keeps common invariants within one document when that is natural. Use a multi-document transaction when a business operation must commit or roll back changes across documents. Transactions have coordination and performance costs and are supported on replica sets and sharded clusters, not standalone deployments.

In a driver, start a session, run the related operations in a transaction, then commit; abort on failure. Design for transient transaction errors and retries using the driver's documented transaction API. Choose read concern, write concern, and read preference to match the consistency and durability contract. See [transactions](https://www.mongodb.com/docs/manual/core/transactions/).

## Replication

A replica set is a group of MongoDB processes that maintain the same data set. The primary accepts writes and records operations in its oplog; secondaries replicate those operations. If the primary becomes unavailable, eligible members can elect a replacement. Replication improves availability and can support reads from secondaries, but secondary reads may lag behind writes.

Write concern controls acknowledgment requirements. A `majority` write concern waits for acknowledgment from a majority of voting members, subject to deployment configuration. Replication is not a backup: accidental updates and deletions replicate too. Maintain backups and test restores. See [replica set architecture](https://www.mongodb.com/docs/manual/replication/).

## Sharding

Sharding distributes collection data across shards, coordinated by query routers and configuration servers. A shard key controls how documents are partitioned and where operations are routed. A good key offers sufficient cardinality and distributes writes and storage while supporting common query targeting.

A monotonically increasing key can concentrate new writes on one range. Hashed keys can spread writes but make range queries less targeted. Poor shard-key choices are expensive to correct, so understand workload, distribution, and growth before sharding. Queries that include the shard key can often target fewer shards; scatter-gather queries consult more of the cluster. Sharding adds operational complexity and should be driven by measured capacity or throughput needs. See [sharding](https://www.mongodb.com/docs/manual/sharding/).
