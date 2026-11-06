# Storage Engines and Journaling

A storage engine manages how MongoDB stores data in memory and on disk. WiredTiger is the default engine for current self-managed deployments. It provides document-level concurrency, compression, checkpoints, and journaling. Storage engine selection affects performance, durability, and operational behavior.

Journaling is write-ahead logging used to recover writes after an unexpected shutdown between checkpoints. Checkpoints create consistent on-disk snapshots; the journal records later operations needed for recovery. Current MongoDB versions enable journaling by default and remove older controls, so follow documentation for the deployed release.

Storage-engine concepts inform disk capacity, cache pressure, checkpoints, compression, and recovery time. Do not manually edit data files while mongod is running. Use supported backup and maintenance procedures. Atlas manages underlying storage configuration differently from self-managed deployments.

See [storage engines](https://www.mongodb.com/docs/manual/core/storage-engines/) and [journaling](https://www.mongodb.com/docs/manual/core/journaling/).
