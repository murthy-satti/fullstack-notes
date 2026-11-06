# Cursors and Read Methods

find() returns a cursor, which retrieves result batches instead of materializing every document at once. Drivers expose cursor iteration APIs; consume results incrementally and close cursors when finished. Avoid converting unbounded result sets into arrays in application memory.

findOne() returns one matching document or null. Without sort, it does not mean newest or otherwise preferred. countDocuments(filter) counts matching documents; estimatedDocumentCount() uses collection metadata and cannot apply a filter. distinct(field, filter) returns distinct values but can be expensive for high-cardinality fields.

~~~javascript
const cursor = db.orders.find({ state: "open" }).sort({ createdAt: 1 })
while (await cursor.hasNext()) {
  const order = await cursor.next()
  // process a bounded unit of work
}
~~~

Cursors use batches and can expire when idle or when the session ends. Configure batch size based on payload and memory needs, not as a substitute for limits. Keyset pagination is usually preferable to a long-lived cursor for user-facing page navigation. See [cursor behavior](https://www.mongodb.com/docs/manual/core/cursors/) and [find](https://www.mongodb.com/docs/manual/reference/method/db.collection.find/).
