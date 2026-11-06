# Indexes and Query Performance

An index stores an ordered representation of selected fields so MongoDB can locate and order matching documents without scanning the whole collection. The `_id` index is created automatically; other indexes should support measured query patterns.

```javascript
db.orders.createIndex({ customerId: 1, createdAt: -1 })
db.users.createIndex({ email: 1 }, { unique: true })
```

The compound index supports equality on `customerId` followed by a recent-first order on `createdAt`. Field order matters: a compound index can support its leading prefixes, but not every permutation. Unique indexes enforce a data rule as well as speeding lookups; resolve existing duplicates before creating one.

Indexes consume storage and memory and add work to inserts, updates, and deletes. Avoid indexing every field. For each important query, inspect the plan:

```javascript
db.orders.find({ customerId: "c-42" })
  .sort({ createdAt: -1 })
  .explain("executionStats")
```

Compare documents and keys examined with documents returned, and check whether the plan uses the intended index. A covered query can return from index keys alone when the filter and projection are supported by that index. Use representative data and production-like cardinalities; a query that is fast on a tiny collection may behave differently at scale.

Other index types support specific workloads, including text, geospatial, and TTL expiration. TTL indexes remove eligible documents asynchronously and are not an exact timer. Review [index types](https://www.mongodb.com/docs/manual/core/indexes/index-types/) and [index properties](https://www.mongodb.com/docs/manual/core/indexes/index-properties/).
