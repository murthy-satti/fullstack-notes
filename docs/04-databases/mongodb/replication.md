# Replication and Replica Sets

A replica set is a group of mongod processes that maintain the same data set. The primary accepts writes and records them in its oplog; secondaries replicate oplog entries. If the primary becomes unavailable, eligible voting members can elect a replacement.

A majority of voting members is needed to elect and maintain a primary. Plan members across failure domains, and understand votes, priority, hidden members, delayed members, and maintenance procedures. Secondaries may serve reads, but their data can lag. Read preference chooses eligible nodes; it does not alone guarantee freshness.

Write concern controls the acknowledgment requested for writes. A majority write concern waits for acknowledgment from a majority of voting members, subject to configuration. Read concern controls visibility guarantees. These settings trade latency and availability for consistency and durability behavior; select them from the application's contract.

Monitor member health, elections, replication lag, and oplog window. Replication improves availability but is not a backup: accidental writes propagate. Maintain independent backups and test recovery. See [replication](https://www.mongodb.com/docs/manual/replication/) and [read and write concerns](https://www.mongodb.com/docs/manual/reference/read-concern/).
