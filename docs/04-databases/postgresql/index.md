# PostgreSQL

PostgreSQL is an open-source relational database. It stores data in tables with defined columns and supports SQL for querying and changing that data. Relationships and constraints help represent rules explicitly; PostgreSQL also supports additional data types and capabilities as application needs grow.

## Learning objectives

- Describe tables, rows, columns, keys, and relationships.
- Read a simple SQL query and understand its result.
- Explain how constraints and indexes help protect and retrieve data.
- Recognize the benefits and costs of a relational model.

## Learning path

Start with [Database Fundamentals](../database-fundamentals.md), then follow the diagram from an application query to related PostgreSQL tables.

![Diagram showing an application sending SQL to PostgreSQL, where related tables and an index return matching rows.](database-flow.svg)

## Relevant resources

- **Official PostgreSQL documentation — [Tutorial](https://www.postgresql.org/docs/current/tutorial.html):** introduces PostgreSQL and fundamental SQL operations.
- **Official PostgreSQL documentation — [Data Definition](https://www.postgresql.org/docs/current/ddl.html):** explains creating tables, constraints, and related structures.
- **Official PostgreSQL documentation — [Queries](https://www.postgresql.org/docs/current/queries.html):** covers retrieving and combining data.
- **Official PostgreSQL documentation — [Indexes](https://www.postgresql.org/docs/current/indexes.html):** describes index behavior and trade-offs.

Compare this relational model with [MongoDB](../mongodb/index.md) and review shared concepts in [Database Fundamentals](../database-fundamentals.md).
