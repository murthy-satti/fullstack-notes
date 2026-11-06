# Upserts, Replacements, and Find-and-Modify

An upsert inserts a document when an update matches nothing. It is useful for idempotent synchronization when the filter identifies a stable business key and a unique index enforces that key.

~~~javascript
db.settings.updateOne(
  { name: "theme" },
  { $set: { value: "dark" }, $setOnInsert: { createdAt: new Date() } },
  { upsert: true }
)
~~~

An upsert can construct inserted fields from equality predicates in the filter plus update operators. Design the filter carefully; a broad filter can create surprising records or duplicate logical entities. A unique index protects against concurrent duplicate upserts.

replaceOne() replaces the matched document contents, removing omitted fields while preserving _id constraints. Use it only when full replacement is intended. findOneAndUpdate() and findOneAndReplace() atomically modify one matching document and return a before or after image according to options. They are useful when the caller needs the changed record in the same round trip.

See [upsert behavior](https://www.mongodb.com/docs/manual/reference/method/db.collection.updateOne/) and [findOneAndUpdate](https://www.mongodb.com/docs/manual/reference/method/db.collection.findOneAndUpdate/).
