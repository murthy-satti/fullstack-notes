# Delete and Bulk Operations

deleteOne(filter) removes at most one match; deleteMany(filter) removes all matches. An empty filter matches every document. Before deletion, run find(filter) with a projection and a small limit to confirm the target. A TTL index can suit automatic expiry when the retention rule is based on a date.

~~~javascript
db.sessions.deleteMany({ expiresAt: { $lt: new Date() } })
~~~

bulkWrite() combines inserts, updates, replacements, and deletes in fewer round trips. Ordered batches stop on an error; unordered batches continue where possible. Use bounded batch sizes, account for partial failures, and ensure retries cannot create duplicate business effects.

~~~javascript
db.inventory.bulkWrite([
  { updateOne: { filter: { sku: "p-100" }, update: { $inc: { stock: -1 } } } },
  { insertOne: { document: { sku: "p-101", stock: 20 } } }
], { ordered: false })
~~~

Deletion is not reversible without a backup or another recovery path. Use transactions only when deletion must coordinate atomically with other writes. Grant application roles only the write actions they need. See [delete methods](https://www.mongodb.com/docs/manual/reference/delete-methods/) and [bulk write operations](https://www.mongodb.com/docs/manual/core/bulk-write-operations/).
