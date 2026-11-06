# Arrays and Embedded Values

Arrays are useful for bounded, related values such as tags or order line items. They support atomic updates alongside the parent document. Unbounded arrays can grow documents, increase write cost, and complicate pagination.

A filter such as { tags: "sale" } matches an array containing that value. Use $all when every listed value must exist, $size for exact length, and $elemMatch when multiple predicates must match one array element.

~~~javascript
db.orders.find({
  items: { $elemMatch: { sku: "p-100", quantity: { $gte: 2 } } }
})
~~~

Array updates include $push (append), $addToSet (append only when absent), $pull (remove matches), and $pop (remove an endpoint). The positional $ operator updates the first matched element; $[] updates all elements; $[name] updates elements matching arrayFilters.

~~~javascript
db.orders.updateOne(
  { _id: orderId },
  { $set: { "items.$[line].quantity": 3 } },
  { arrayFilters: [{ "line.sku": "p-100" }] }
)
~~~

Array fields create multikey indexes; compound multikey indexes have restrictions. If a child list can grow without a practical bound, consider a separate collection with a reference to its parent. See [array query operators](https://www.mongodb.com/docs/manual/reference/operator/query-array/) and [array update operators](https://www.mongodb.com/docs/manual/reference/operator/update-array/).
