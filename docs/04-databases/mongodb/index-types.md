# Index Types

An index supports particular query patterns. MongoDB creates the _id index automatically; other indexes should be justified by filters, sorts, uniqueness rules, or specialized workloads.

- Single-field and compound indexes support equality/range predicates and sorts. Compound field order is significant and can support leading prefixes.
- Multikey indexes index array values. Compound multikey indexes have restrictions when multiple indexed fields are arrays.
- Unique indexes enforce uniqueness; creating one fails if existing values conflict.
- Partial indexes include only documents matching a filter and can reduce size for a subset workload.
- Sparse indexes omit documents without the indexed field. Understand how this differs from partial filters.
- TTL indexes expire documents asynchronously based on dates; they are not exact timers.
- Text and geospatial indexes serve specialized search patterns. Wildcard indexes can support queries over unknown fields but are not a substitute for schema and query design.
- Hidden indexes let you evaluate planner impact without serving queries, where supported.

Indexes improve reads but consume disk and memory and increase write work. Avoid redundant indexes and measure usage. See [index types](https://www.mongodb.com/docs/manual/core/indexes/index-types/) and [index properties](https://www.mongodb.com/docs/manual/core/indexes/index-properties/).
