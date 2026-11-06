# Views and On-Demand Materialized Views

A standard view is a read-only virtual collection defined by an aggregation pipeline. It does not store results; MongoDB runs the view pipeline when it is queried. Views can present a stable or restricted shape without duplicating source documents.

~~~javascript
db.createView(
  "activeCustomers",
  "customers",
  [{ $match: { active: true } }, { $project: { name: 1, region: 1 } }]
)
~~~

Views are useful for reusable transformations and exposing only selected fields to a read role. They have restrictions on updates and pipeline stages; avoid assuming a view behaves like a writable collection.

An on-demand materialized view stores computed results in a collection, commonly using $merge or $out from an aggregation. It can make expensive reads faster but requires refresh, staleness, and failure policies. Index the stored results according to consumer queries.

See [views](https://www.mongodb.com/docs/manual/core/views/) and [on-demand materialized views](https://www.mongodb.com/docs/manual/core/materialized-views/).
