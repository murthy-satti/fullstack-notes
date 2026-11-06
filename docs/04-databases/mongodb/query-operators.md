# Query Operators

Query predicates select documents by matching field values. Equality uses concise syntax; comparison operators include $gt, $gte, $lt, $lte, $ne, and $in. Logical operators include $and, $or, $nor, and $not. Multiple field predicates are ANDed by default.

~~~javascript
db.orders.find({
  status: { $in: ["paid", "shipped"] },
  total: { $gte: 25, $lt: 500 },
  $or: [{ region: "west" }, { priority: true }]
})
~~~

For arrays, a simple equality can match an element. Use $all to require several values and $elemMatch when multiple predicates must match the same embedded element. For nested documents, dot notation addresses a path such as customer.address.city. Exact embedded-document equality is sensitive to the document shape and field order; dot-notation predicates are usually more flexible.

Use $exists to distinguish an absent field from present values, and type-aware comparisons where values may have mixed BSON types. Do not accept raw client-supplied filter documents; validate allowed fields, operators, values, and complexity. See [query operators](https://www.mongodb.com/docs/manual/reference/operator/query/) and [query documents](https://www.mongodb.com/docs/manual/tutorial/query-documents/).
