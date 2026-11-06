# Bulk Writes

bulkWrite() sends multiple insert, update, replace, and delete operations together. It reduces round trips and can improve throughput for imports or synchronization, but it does not make a whole arbitrary batch one atomic transaction.

~~~javascript
db.inventory.bulkWrite([
  { updateOne: { filter: { sku: "p-100" }, update: { $inc: { stock: -1 } } } },
  { updateMany: { filter: { discontinued: true }, update: { $set: { available: false } } } },
  { insertOne: { document: { sku: "p-200", stock: 20 } } },
  { deleteOne: { filter: { sku: "retired" } } }
], { ordered: false })
~~~

Ordered writes execute in sequence and stop on an error. Unordered writes continue where possible and may execute operations in parallel. Results can contain partial success and per-operation errors. Bound batch sizes, use stable identifiers, and make retries idempotent.

Drivers generally expose bulkWrite at collection level. Newer server/driver versions may support cross-namespace operations; verify compatibility before using them. On sharded collections, unordered writes may distribute more efficiently, but shard-key choice still matters. See [bulk write operations](https://www.mongodb.com/docs/manual/core/bulk-write-operations/).
