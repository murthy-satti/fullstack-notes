# Data Modeling and Validation

Design a MongoDB schema from the operations the application needs: list important reads and writes, their filters and sort order, and the expected data growth. Data accessed and updated together is often a useful modeling clue.

## Embed or reference

Embed bounded data that is commonly read with its parent, such as a shipping address snapshot inside an order. This can reduce round trips and lets a single-document update preserve an invariant atomically. Reference data that is shared, independently queried, or grows without a practical bound, such as a customer's orders. References require additional queries or an aggregation join such as `$lookup`.

Embedding duplicates values when useful, but duplicated values need an update policy. Avoid unbounded arrays: large arrays can grow documents and make writes increasingly expensive. MongoDB supports relational patterns; a document model does not mean every relationship should be embedded.

## Enforce useful shape

Collections have flexible schemas by default. Add validation when a collection needs a reliable contract. This example requires a nonnegative numeric price:

```javascript
db.createCollection("products", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["sku", "price"],
      properties: {
        sku: { bsonType: "string" },
        price: { bsonType: ["int", "long", "double", "decimal"], minimum: 0 }
      }
    }
  },
  validationLevel: "strict",
  validationAction: "error"
})
```

Validation is evaluated on writes and can reject invalid documents; it complements application validation and domain rules. Choose validation behavior deliberately when rolling out schema changes to existing data.

## Design workflow

1. Identify the workload and high-value queries.
2. Map relationships and decide what to embed or reference.
3. Choose document shapes that support those operations.
4. Add validation for invariants and indexes for query patterns.
5. Revisit the model as measurements and access patterns change.

See MongoDB's [data modeling guide](https://www.mongodb.com/docs/manual/data-modeling/) and [schema validation reference](https://www.mongodb.com/docs/manual/core/schema-validation/).
