# Database Fundamentals

## Introduction

A database is an organized system for storing information so software can find and change it reliably. Applications use databases for records such as user profiles, orders, messages, and product catalogs. This lesson introduces the ideas shared by many database systems. The [MongoDB learning path](mongodb/index.md) and [PostgreSQL learning path](postgresql/index.md) show two different approaches.

## Why does it exist?

Keeping application data only in a program's memory loses it when the program stops and makes it hard to share between users or servers. A database persists data, provides ways to search it, and coordinates simultaneous changes. It can also help enforce rules, such as requiring every order to have an identifier.

## How does it work?

The application sends a request using a database language or client library. The database locates or changes records, applies its consistency rules, and returns a result. Relational databases organize related values into tables; document databases store flexible, structured documents. Many databases use indexes—additional data structures that speed up selected lookups—at the cost of storage and write work.

Transactions group operations so they succeed or fail together. Backups and replication address recovery and availability, but do not replace careful data modeling or access control.

## Real-world example

A small shop might store customers, products, and orders. An order references the customer and records the purchased items. Staff can look up an order by its number, while a report totals sales by date.

## Developer perspective

Choose a database based on the shape of the data, query patterns, consistency needs, team experience, and operational constraints—not popularity alone. Define what each record means and how it relates to others before optimizing. Use parameters rather than string-building queries, validate input, and keep credentials out of source code.

## Practical example

This local-only SQL example illustrates a table and a read; it assumes a practice database and creates no external connection:

```sql
CREATE TABLE demo_notes (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL
);
INSERT INTO demo_notes (id, title) VALUES (1, 'Database basics');
SELECT title FROM demo_notes WHERE id = 1;
```

## Important terminology

- **Schema:** rules describing data structure.
- **Query:** a request to read or change data.
- **Index:** structure that helps locate records faster.
- **Transaction:** a group of database operations treated as one unit.
- **Persistence:** retaining data beyond a program's lifetime.

## Advantages and disadvantages

Databases make durable, shared, searchable data practical and can enforce important constraints. They also add setup, maintenance, and capacity needs. Indexes and flexible schemas each have trade-offs; no one design is best for every workload.

## Common misconceptions

A database is not automatically a backup, and a successful query does not guarantee that the data model is sound. Adding indexes to every field can slow writes and consume space. “NoSQL” does not mean “no structure”; document data still benefits from clear rules.

## Revision questions

1. Why should an application use persistent storage?
2. What does an index trade for faster lookups?
3. When might a transaction be useful?

## Further Learning & References

- **Official PostgreSQL documentation — [Getting Started](https://www.postgresql.org/docs/current/tutorial.html):** a guided introduction to relational database concepts and SQL.
- **Official MongoDB documentation — [Documents](https://www.mongodb.com/docs/manual/core/document/):** explains MongoDB's basic unit of stored data.
