# Query Plans and Explain

MongoDB chooses a query plan from the filter, sort, projection, collation, and available indexes. A plan may use an index scan, fetch matching documents, sort in memory, or scan the full collection. Similar query shapes can use different plans as data distribution changes.

~~~javascript
db.orders.find({ customerId: "c-42" })
  .sort({ createdAt: -1, _id: -1 })
  .explain("executionStats")
~~~

Inspect the winning plan, execution time, nReturned, totalKeysExamined, and totalDocsExamined. A high examined-to-returned ratio can signal a weak index or low-selectivity predicate. A COLLSCAN may be correct for a small collection or a query returning much of the data; do not add indexes solely to eliminate every collection scan.

Use realistic data volumes and parameter distributions. Compare plans before and after index changes, and account for write cost. The profiler and slow-query logs help identify workload patterns in production; enable profiling deliberately because it adds overhead and can capture sensitive query values. See [query plans](https://www.mongodb.com/docs/manual/core/query-plans/), [explain](https://www.mongodb.com/docs/manual/reference/method/cursor.explain/), and [query performance](https://www.mongodb.com/docs/manual/administration/query/).
