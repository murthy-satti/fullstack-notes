# Insert and Read Operations

insertOne() inserts one document and returns its _id. insertMany() inserts a batch; by default an error can stop ordered inserts, while unordered inserts continue where possible and report failures. Unique indexes can reject duplicates, so bulk imports need error reporting and a safe restart strategy.

~~~javascript
db.products.insertOne({
  sku: "p-100", name: "Notebook", price: 8.5,
  tags: ["paper"], createdAt: new Date()
})
~~~

find() returns a cursor. Iterate it or use a limit rather than reading an unbounded collection into application memory. findOne() returns one match or null. Without an explicit sort, the selected matching document is not guaranteed to be the newest or otherwise meaningful first result.

~~~javascript
db.products.find({ price: { $lt: 10 } }, { name: 1, price: 1 })
  .sort({ price: 1, _id: 1 }).limit(50)
db.products.countDocuments({ tags: "paper" })
~~~

countDocuments(filter) counts matching documents. estimatedDocumentCount() uses collection metadata and cannot filter; it is intended as a faster estimate. Write concern controls acknowledgment and durability expectations; choose it with the deployment and application requirements in mind. See [insert methods](https://www.mongodb.com/docs/manual/reference/insert-methods/) and [find methods](https://www.mongodb.com/docs/manual/reference/method/js-collection/).
