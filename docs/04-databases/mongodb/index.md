# MongoDB

MongoDB is a document database. It stores records as BSON documents grouped into collections, which can suit data that naturally arrives as nested objects. Flexible structure is not a substitute for deliberate modeling: design around the ways the application reads and updates its data.

## Learning objectives

- Explain the relationship between databases, collections, and documents.
- Read and write simple documents using filters.
- Recognize how indexes and data modeling affect query performance.
- Identify when document storage may or may not fit an application.

## Learning path

Begin with [Database Fundamentals](../database-fundamentals.md), then use the diagram below to connect an application request to a MongoDB collection.

![Diagram showing an application querying a MongoDB collection of BSON documents, with an index helping locate matching documents.](database-flow.svg)

## Relevant resources

- **Official MongoDB documentation — [Documents](https://www.mongodb.com/docs/manual/core/document/):** describes BSON documents and their structure.
- **Official MongoDB documentation — [Databases and Collections](https://www.mongodb.com/docs/manual/core/databases-and-collections/):** explains how MongoDB organizes collections.
- **Official MongoDB documentation — [Query Documents](https://www.mongodb.com/docs/manual/tutorial/query-documents/):** demonstrates filtering and retrieving documents.
- **Official MongoDB documentation — [Data Modeling](https://www.mongodb.com/docs/manual/data-modeling/):** explains how to shape documents around application access patterns.

Compare this document model with [PostgreSQL](../postgresql/index.md) and the shared ideas in [Database Fundamentals](../database-fundamentals.md).
