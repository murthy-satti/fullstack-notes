# Projection, Sorting, and Pagination

A projection controls which fields a read returns. Inclusion projections specify fields to keep; exclusion projections specify fields to omit. They generally cannot be mixed, except that _id can be excluded from an inclusion projection. Smaller results reduce network transfer and application memory.

~~~javascript
db.orders.find(
  { status: "paid" },
  { customerId: 1, total: 1, createdAt: 1, _id: 0 }
).sort({ createdAt: -1, _id: -1 }).limit(25)
~~~

Sort order can use ascending 1 or descending -1. Include a unique tie-breaker such as _id so results with equal sort keys have deterministic order. A matching compound index may support both filter and sort.

Large skip offsets can be slow because the server must advance past skipped results. Range pagination uses the last seen sort key as the next query boundary. For example, for descending createdAt plus _id, request values lower than the last returned pair, then limit the next page. Ensure the range predicate and sort use compatible indexed fields. See [project fields](https://www.mongodb.com/docs/manual/tutorial/project-fields-from-query-results/) and [sort query results](https://www.mongodb.com/docs/manual/tutorial/sort-results-with-indexes/).
