# BSON Documents and Types

A BSON document is an ordered set of fields and values. MongoDB stores documents in collections; each document has a unique _id field. Nested documents model structured values, while arrays model ordered lists. BSON supports strings, booleans, null, dates, binary data, ObjectIds, Decimal128, and multiple integer and floating-point types.

Use BSON Date for timestamps rather than strings so range queries and date operators behave correctly. For money, use Decimal128 or integer minor units instead of binary floating point when exact decimal arithmetic matters. Choose one consistent identifier type for related documents. Field names and types should be stable even though MongoDB permits variation.

JSON tools may not preserve BSON distinctions. Extended JSON represents BSON-only types when exporting or transmitting documents through JSON-oriented systems. Documents are limited in size; large content can use GridFS or object storage.

See [BSON types](https://www.mongodb.com/docs/manual/reference/bson-types/), [documents](https://www.mongodb.com/docs/manual/core/document/), and [Extended JSON](https://www.mongodb.com/docs/manual/reference/mongodb-extended-json/).
