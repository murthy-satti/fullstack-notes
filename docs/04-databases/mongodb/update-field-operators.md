# Field Update Operators

Update operators change selected fields while preserving unspecified fields. updateOne() changes at most one match; updateMany() changes all matches. Always scope the filter deliberately and inspect matchedCount and modifiedCount.

~~~javascript
db.inventory.updateOne(
  { sku: "p-100" },
  {
    $set: { price: 9.25, "details.color": "blue" },
    $unset: { legacyCode: "" },
    $inc: { stock: -1 },
    $currentDate: { updatedAt: true }
  }
)
~~~

$set creates or replaces fields, including dotted nested paths. $unset removes a field. $inc adds a numeric value, useful for counters when the update must be atomic. $min and $max only replace a value when the new value is lower or higher. $mul multiplies a numeric field; $rename changes a field name; $setOnInsert applies only when an upsert inserts.

Do not confuse update operators with aggregation pipeline stages that share names. In an update pipeline, $set computes an expression from the existing document. For array element updates, see [array operators](arrays.md). See [update operators](https://www.mongodb.com/docs/manual/reference/operator/update/).
