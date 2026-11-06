# Transactions

A write to one document is atomic. Prefer a document model that keeps common invariants together. Use a multi-document transaction when a business operation must commit or roll back changes across multiple documents, such as transferring value between two accounts.

Transactions require a replica set or sharded cluster, not a standalone server. They add coordination and latency, so they should solve a real cross-document requirement rather than compensate for every modeling choice. Keep them short and avoid waiting on user input or unrelated external services inside a transaction.

In a driver, start a session and use the driver's transaction helper. It handles transaction labels and retry rules according to that driver. Operations in a transaction must use the session. Do not perform non-idempotent external side effects in a callback that may be retried. Use idempotency keys or an outbox pattern when a committed database change must trigger an external action.

Choose transaction read concern and write concern according to consistency requirements and deployment support. Test transient errors and uncertain commit results. See [transactions](https://www.mongodb.com/docs/manual/core/transactions/) and [production considerations](https://www.mongodb.com/docs/manual/core/transactions-production-consideration/).
