# Update Operations and Operators

updateOne(filter, update) changes at most one matching document; updateMany() changes every match. A selective filter matters: an empty filter can update the entire collection. Inspect matchedCount and modifiedCount. Set upsert: true only when inserting a new document on no match is intended.

~~~javascript
db.inventory.updateOne(
  { sku: "p-100" },
  { $set: { price: 9.25 }, $inc: { stock: -1 }, $currentDate: { updatedAt: true } }
)
~~~

Common update operators:

- $set assigns fields, including dotted nested paths such as "profile.city".
- $unset removes a field; its operand value is ignored.
- $inc adds or subtracts a number.
- $mul, $min, $max, and $rename update numeric values or field names.
- $currentDate writes the current date or timestamp.
- $setOnInsert runs only when an upsert inserts.
- $push, $addToSet, $pull, $pullAll, and $pop modify arrays.

replaceOne() replaces the document, removing fields not in the replacement (subject to _id rules); it is not the same as $set. findOneAndUpdate() atomically updates and can return the before or after document. Array filters target matching embedded elements. Update pipelines can compute values from the old document; in a pipeline, $set and $unset are aggregation stages rather than update modifier operators.

See [update methods](https://www.mongodb.com/docs/manual/reference/update-methods/) and [update operators](https://www.mongodb.com/docs/manual/reference/operator/update/).
