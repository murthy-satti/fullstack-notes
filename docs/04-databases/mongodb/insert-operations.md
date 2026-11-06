# Insert Operations

insertOne() writes one document. If _id is omitted, MongoDB generates an ObjectId. insertMany() writes a list of documents and reports inserted identifiers and errors. Ordered inserts stop at the first error by default; unordered inserts continue where possible and may improve throughput for independent records.

~~~javascript
db.products.insertMany([
  { sku: "p-100", name: "Notebook", price: 8.5 },
  { sku: "p-101", name: "Pen", price: 1.25 }
], { ordered: false })
~~~

A unique-index conflict or schema validation failure can make an insert fail. For unordered batches, account for partial success and retry only records that did not succeed. Design imports to be idempotent, often with stable keys and upserts rather than assuming a batch runs once.

Single-document inserts are atomic. Bulk writes can mix insert, update, replace, and delete operations; see [bulk writes](bulk-writes.md). See official [insert methods](https://www.mongodb.com/docs/manual/reference/insert-methods/) and [insert documents](https://www.mongodb.com/docs/manual/tutorial/insert-documents/).
