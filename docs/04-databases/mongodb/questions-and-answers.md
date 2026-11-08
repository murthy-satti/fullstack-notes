# MongoDB Questions and Answers

Use these questions to review MongoDB concepts, application usage, data modeling, performance, and operations. The answers are concise; follow the linked lessons for detailed explanations and examples.

## Core concepts

### 1. What is MongoDB?

MongoDB is a document database. It stores BSON documents in collections and provides query, aggregation, indexing, replication, and sharding features.

### 2. How are databases, collections, and documents related?

A deployment contains databases. A database contains collections, and collections contain documents. Documents in one collection can differ in shape, but a consistent model makes application queries and validation easier.

### 3. What is BSON?

BSON is MongoDB's binary document format. It supports JSON-like objects and arrays plus types such as ObjectId, Date, Decimal128, binary values, and distinct integer types.

### 4. What is the purpose of the _id field?

Each document has a unique _id within its collection. If omitted, a driver or MongoDB generates an ObjectId. Applications can choose other supported BSON values when they need a different identifier scheme.

### 5. Is an ObjectId a timestamp or a sequential number?

No. It contains a timestamp component and other bytes that make collisions very unlikely, but it is not a strict global clock or sequence. Store a BSON Date separately when creation or event time matters.

### 6. Is MongoDB schema-less?

No. MongoDB permits flexible document shapes, but applications still need a deliberate schema. Teams can enforce required fields and BSON types with collection validation.

### 7. What does single-document atomicity mean?

A write affecting one document is applied atomically: other operations do not observe a partially updated document. Embedding values that change together can use this property to protect invariants.

### 8. When should data be embedded or referenced?

Embed bounded data commonly read and updated with its parent. Reference shared, independently queried, or unbounded data. Choose from access patterns and growth rather than a rule that all relationships must use one approach.

## Queries and CRUD

### 9. What do CRUD operations stand for?

Create, read, update, and delete. MongoDB provides methods such as insertOne(), find(), updateOne(), and deleteOne(), with corresponding batch methods for many documents.

### 10. What is the difference between insertOne() and insertMany()?

insertOne() writes one document. insertMany() submits a batch; ordered batches stop on an error by default, while unordered batches continue where possible and may partially succeed.

### 11. What does find() return?

find() returns a cursor, not a fully materialized array. Cursors retrieve results in batches, so applications should iterate and bound results rather than loading an unbounded collection into memory.

### 12. How does findOne() choose a document?

It returns one document matching the filter. Without an explicit sort, the selected document is not guaranteed to be the newest or otherwise meaningful first match.

### 13. How are multiple fields in a query filter combined?

Predicates on separate fields are combined with AND by default. Use operators such as $or, $and, and $nor when the query needs explicit logical alternatives.

### 14. What is the difference between $in and $all?

$in matches when a field equals any listed value; for an array field it can match an element. $all requires an array to contain every specified value.

### 15. When should $elemMatch be used?

Use $elemMatch when multiple conditions must match the same element of an array. Without it, separate predicates may be satisfied by different array elements.

### 16. What is a projection?

A projection controls which fields a read returns. It reduces response size and can support covered queries when the filter and returned fields are available in an index.

### 17. Why include a tie-breaker in a sort?

Documents can have equal values for the chosen sort key. Adding a unique field such as _id makes the order deterministic and supports stable pagination.

### 18. Why can large skip values be slow?

The server still has to advance past skipped results. Range pagination based on the last seen sort key often scales better for deep pages.

### 19. What does updateOne() do?

It updates at most one document matching a filter, even if several documents match. Use a selective filter and inspect matchedCount and modifiedCount in the result.

### 20. What is the difference between $set and $unset?

$set creates or replaces specified fields, including nested fields addressed with dot notation. $unset removes specified fields from the document.

### 21. What does $inc do?

$inc adds a numeric amount to a field and creates the field if it does not exist. It is useful for atomic counters and inventory changes, but the application must still define how negative values are prevented when required.

### 22. How is updateMany() different from updateOne()?

updateMany() applies the update to every document matching the filter. It is not one atomic operation across the whole matched set; individual document writes are atomic.

### 23. What is the difference between an update and a replacement?

An update document changes fields specified by operators and preserves other fields. replaceOne() replaces the document contents, so omitted fields are removed (subject to _id rules).

### 24. What is an upsert?

An upsert updates a matching document or inserts one if no match exists. Use a stable key and a unique index when an upsert represents one logical entity; otherwise concurrent operations can create duplicates.

### 25. What is the difference between deleteOne() and deleteMany()?

deleteOne() removes at most one match; deleteMany() removes every match. An empty filter matches the full collection, so inspect destructive filters before running them.

### 26. What is bulkWrite() used for?

bulkWrite() batches insert, update, replace, and delete operations to reduce round trips. It can partially succeed; ordered mode stops on errors, while unordered mode continues where possible.

### 27. How do common array update operators differ?

$push appends a value, $addToSet appends only if the value is not already present, $pull removes matching values, and $pop removes an endpoint element. Use array filters when updates should target particular embedded elements.

## Modeling, validation, and indexes

### 28. What is an unbounded array, and why is it risky?

It is an array that can grow without a practical limit. It can make documents large, increase write costs, and complicate pagination; move independently growing children to another collection when appropriate.

### 29. What does schema validation enforce?

A validator can require fields and constrain BSON types, ranges, or allowed values. It protects writes at the collection boundary but does not replace application-level business validation.

### 30. How can a schema change be deployed safely?

Make readers tolerate old and new shapes, introduce and backfill fields, update writers, then tighten validation after old data and clients are migrated. Test the migration on representative data.

### 31. What is an index?

An index is an ordered data structure that helps MongoDB find or sort matching documents without scanning the entire collection. Indexes speed some reads but require storage and extra work on writes.

### 32. Why does field order matter in a compound index?

A compound index is ordered by its fields and can generally support queries on leading prefixes. Choose field order from equality filters, sort order, and range predicates in real query patterns.

### 33. What does a unique index do?

It enforces that indexed key values are unique, in addition to supporting lookup. Existing duplicates must be corrected before the index can be created.

### 34. What is a multikey index?

It indexes values from an array field. It supports array queries, but compound multikey indexes have restrictions, particularly when more than one indexed field is an array.

### 35. What is a TTL index?

A TTL index removes eligible documents after a configured duration or expiration date. Cleanup is asynchronous, so TTL is useful for retention but not precise real-time deletion.

### 36. What does explain("executionStats") show?

It reports the selected query plan and execution statistics, including keys and documents examined and results returned. Use it to understand collection scans, index effectiveness, and expensive sorts.

### 37. What is collation?

Collation defines language-aware string comparison, including case and accent rules. Queries and indexes need compatible collation settings for the index to support those string comparisons.

### 38. What is a geospatial index used for?

A 2dsphere index supports queries over GeoJSON geometries on a spherical model. A 2d index supports legacy planar coordinate pairs; choose based on the stored representation and query semantics.

## Aggregation

### 39. What is an aggregation pipeline?

It is an ordered sequence of stages that filters, reshapes, groups, joins, or writes documents. Each stage receives the output of the previous stage.

### 40. Why put $match early in a pipeline?

An early $match reduces the number of documents passed to later stages and may use an index. Only move filters when doing so preserves the intended result.

### 41. What does $unwind do?

$unwind emits a separate pipeline document for each element in an array. Its preserveNullAndEmptyArrays option controls whether documents with missing or empty arrays remain.

### 42. How does $lookup work?

$lookup performs a left outer join to another collection and adds the matches as an array. Index the foreign join field and account for the size of the joined results.

### 43. What does $group do?

$group combines documents that share a key in its _id expression. Accumulators such as $sum, $avg, $min, $max, $push, and $addToSet compute group results.

### 44. What is the difference between $project and $set?

$project selects, excludes, renames, or computes fields in the output shape. $set adds or replaces fields while retaining other fields; it is an alias of $addFields in aggregation.

### 45. What is $facet used for?

$facet runs multiple subpipelines over the same input, such as calculating a page of results and summary counts. It can reduce repeated source work but may need substantial memory.

### 46. What are $merge and $out used for?

They are terminal pipeline stages that write aggregation results to a collection. Their replacement and merge behavior differs; use them deliberately for batch outputs or materialized results.

### 47. How should an aggregation be tuned?

Filter early, keep intermediate documents small, bound array expansion, use indexes for initial matches and sorts, and measure with representative data. Large groups and blocking sorts can consume substantial memory.

## Consistency, availability, and scale

### 48. When is a multi-document transaction needed?

Use one when a business invariant must atomically span multiple documents. Prefer a single-document model when natural; transactions add coordination and latency.

### 49. What deployments support transactions?

Multi-document transactions require a replica set or sharded cluster. A standalone mongod does not support them.

### 50. What are read concern and write concern?

Read concern controls the consistency level of data returned by a read. Write concern controls the acknowledgment requested for a write. Choose both from the application's durability and latency requirements.

### 51. What does majority write concern mean?

It requests acknowledgment from the calculated majority of data-bearing
voting members; arbiters do not store data and cannot acknowledge the write.
The precise durability behavior depends on MongoDB version and deployment
configuration, so majority is stronger than a primary-only acknowledgment
but should not be described as an unconditional durability guarantee.

### 52. What is a replica set?

A replica set is a group of mongod processes that maintain the same data. One primary accepts writes while secondaries replicate the operation log; eligible members can elect a new primary after failure.

### 53. Does replication replace backups?

No. Replication copies changes, including accidental deletes and harmful updates. Backups provide a separate recovery path and should be restored in regular drills.

### 54. What is sharding?

Sharding partitions collection data across multiple shards to distribute storage and workload. It introduces routing and operational complexity, so use it when measured scale requires it.

### 55. Why is shard-key selection important?

The shard key determines document distribution and how queries target shards. Evaluate cardinality, write distribution, growth, and common query filters; a poor key can create hot spots or scatter-gather queries.

### 56. What are change streams?

Change streams let applications subscribe to majority-committed changes on a collection, database, or deployment. They require a replica set or sharded cluster and are consumed through a cursor or driver API.

### 57. How does a change-stream resume token work?

The event _id is a resume token that identifies progress in the stream. Persist it after processing an event durably; consumers should be idempotent because events may be delivered again after a restart.

### 58. What do sessions provide?

Sessions group operations and support transactions, retryable writes, and causal consistency. Use driver-managed sessions and end them when work is complete.

## Tools, security, and operations

### 59. How are Atlas users different from database users?

Atlas users manage cloud resources and project settings. Database users authenticate to the data deployment and receive database roles. Permission in one system does not automatically grant permission in the other.

### 60. What is an Atlas IP access list?

It restricts which client source IP addresses or CIDR ranges may connect to a project deployment. Network access and database authentication are both required; avoid broad entries such as 0.0.0.0/0.

### 61. What is MongoDB Compass useful for?

Compass is a graphical tool for browsing documents, testing filters, inspecting sampled schema, building aggregation pipelines, and viewing indexes. Its schema view is based on sampling and does not prove every document has the same shape.

### 62. What is mongosh?

mongosh is MongoDB's interactive JavaScript shell. It is useful for exploration and administration; production applications should use an official language driver with a reused connection pool.

### 63. Why should credentials not be embedded in a connection URI in source code?

Source code can be copied, committed, or logged. Store credentials in a secret manager or protected environment configuration, and prevent them from appearing in process logs and shell history.

### 64. What does TLS protect?

TLS protects network traffic and verifies the server identity when certificate validation is enabled. It complements authentication and authorization; it does not encrypt every stored field from database administrators.

### 65. What should be monitored in production?

Track latency, errors, throughput, connections, CPU, memory, disk space and latency, storage growth, replication lag, and backup status. Use explain and slow-query profiling to investigate performance, with awareness that profiling adds overhead.

### 66. Why should backups be restore-tested?

A successful backup job does not prove that data can be restored within recovery time objectives. Restore tests reveal missing data, incompatible versions, access gaps, or incomplete runbooks.

## Specialized features

### 67. What is the difference between a standard view and a materialized result?

A standard view is a read-only virtual collection whose pipeline runs when queried. A materialized result stores computed documents, often using $merge or $out, and needs a refresh and staleness policy.

### 68. What are time-series collections for?

They optimize storage and queries for measurements recorded over time. Choose a BSON Date time field and suitable metadata; check feature limitations before using one instead of a regular collection.

### 69. What is GridFS?

GridFS stores large files as metadata and chunks across collections so drivers can stream files larger than the 16 MiB BSON document limit. Object storage may be preferable for many media-delivery workloads.

### 70. What is a capped collection?

It is a fixed-size collection that preserves insertion order and overwrites old records when full. It has update and delete restrictions and is suited only when those overwrite semantics are acceptable.

### 71. What is MongoDB Search?

MongoDB Search provides indexed full-text search with analyzers and relevance features. Search availability and deployment requirements depend on the MongoDB product and version; check the current documentation.

### 72. What is Vector Search?

Vector Search retrieves documents by similarity to embeddings and can combine semantic relevance with filters or text search. The application must generate compatible embeddings and evaluate result quality for its use case.

## Further learning

- [MongoDB Manual](https://www.mongodb.com/docs/manual/contents/)
- [CRUD operations](https://www.mongodb.com/docs/manual/crud/)
- [Data modeling](https://www.mongodb.com/docs/manual/data-modeling/)
- [Aggregation](https://www.mongodb.com/docs/manual/aggregation/)
- [MongoDB Search and Vector Search](https://www.mongodb.com/docs/manual/text-search/)
- [Atlas documentation](https://www.mongodb.com/docs/atlas/)
- [MongoDB Compass](https://www.mongodb.com/docs/compass/)
- [mongosh](https://www.mongodb.com/docs/mongodb-shell/)
