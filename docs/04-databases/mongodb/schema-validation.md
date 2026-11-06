# Schema Validation and Evolution

MongoDB permits flexible document shapes, but collection validators can enforce required fields, BSON types, ranges, and allowed values. Validation is checked on inserts and updates. Invalid writes may be rejected or logged according to validationAction.

~~~javascript
db.createCollection("products", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["sku", "price"],
      properties: {
        sku: { bsonType: "string" },
        price: { bsonType: ["int", "long", "double", "decimal"], minimum: 0 },
        status: { enum: ["draft", "active", "retired"] }
      }
    }
  },
  validationLevel: "strict",
  validationAction: "error"
})
~~~

strict checks every insert and update. moderate has different behavior for existing invalid records. error rejects invalid writes; warn records validation failures but allows the write. Understand these settings before changing production rules.

Evolve schemas compatibly: make readers tolerate old and new forms, introduce and backfill new fields, migrate writers, then tighten validation after old records and clients are handled. Use collMod to change a validator. Validation complements application and domain rules; it does not prove business correctness. See [schema validation](https://www.mongodb.com/docs/manual/core/schema-validation/) and [JSON Schema query operator](https://www.mongodb.com/docs/manual/reference/operator/query/jsonSchema/).
