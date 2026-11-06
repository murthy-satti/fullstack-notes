# Query Filters and Projections

A filter selects matching documents. Equality can be written as { status: "open" }. Common comparison operators include $gt, $gte, $lt, $lte, $ne, and $in. Logical operators include $and, $or, $nor, and $not. Multiple fields in a filter are implicitly combined with AND.

~~~javascript
db.orders.find(
  { status: { $in: ["paid", "shipped"] }, total: { $gte: 25 }, "shipping.country": "IN" },
  { customerId: 1, total: 1, status: 1, _id: 0 }
).sort({ total: -1 }).limit(25)
~~~

The second find argument is a projection. Inclusion and exclusion projections generally cannot be mixed, except that _id can be excluded from an inclusion projection. Array matching has special semantics: a simple equality can match an array element; use $elemMatch when multiple conditions must match the same embedded array element.

Sorting should be deterministic for pagination; include a unique tie-breaker such as _id. Large skip offsets can become expensive, so range pagination is often better at scale. Always bound results.

Do not accept arbitrary client-built filter objects. Map allowed API fields to server-created filters, validate types, and cap ranges and result sizes. See [query documents](https://www.mongodb.com/docs/manual/tutorial/query-documents/) and [query operators](https://www.mongodb.com/docs/manual/reference/operator/query/).
