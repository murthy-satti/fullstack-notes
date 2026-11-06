# Documents and CRUD

MongoDB organizes data as databases, collections, and BSON documents. BSON is a binary representation with types such as dates, ObjectIds, and 64-bit integers. Documents have an `_id` key, generated as an ObjectId when omitted; nested objects and arrays express related values naturally.

## Create and read

In mongosh, select a database and insert a document:

```javascript
use shop
db.products.insertOne({
  sku: "p-100",
  name: "Notebook",
  price: 8.5,
  tags: ["paper", "stationery"],
  createdAt: new Date()
})
```

Find matching documents with a filter. The second argument is a projection; inclusion projections can include `_id` unless explicitly excluded.

```javascript
db.products.find(
  { price: { $gte: 5 }, tags: "paper" },
  { name: 1, price: 1, _id: 0 }
).sort({ price: 1 }).limit(20)
```

Filters support comparison operators such as `$gt`, `$in`, and `$ne`, logical operators such as `$and` and `$or`, and array matching. Use a field path such as `"address.city"` to match a nested field. Treat request input as data and validate it; do not accept arbitrary client-supplied query operators.

## Update and delete

Use update operators to change selected fields without replacing the full document:

```javascript
db.products.updateOne(
  { sku: "p-100" },
  { $set: { price: 9 }, $inc: { stock: 1 } }
)
```

Other common operators include `$unset`, `$min`, `$max`, and array operators such as `$push` and `$addToSet`. A replacement update replaces the document contents except for its identity. Use it only when replacement is intended. An upsert inserts when no document matches; choose its filter and update carefully to avoid accidental duplicates.

```javascript
db.products.deleteOne({ sku: "p-100" })
```

Check acknowledged results and matched/modified/deleted counts. A write to one document is atomic. Multi-document operations can partially succeed unless enclosed in a transaction. See the official [CRUD guide](https://www.mongodb.com/docs/manual/crud/).
