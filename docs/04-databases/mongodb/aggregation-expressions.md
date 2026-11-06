# Aggregation Expressions and Accumulators

Expressions compute values in stages such as $project, $set, and $group. A field path such as "$price" reads a field; $$ROOT refers to the current root document, while variables such as $$NOW expose server values in supported contexts.

Arithmetic operators include $add, $subtract, $multiply, and $divide. Conditional operators include $cond, $ifNull, and $switch. Comparison and boolean expressions can build derived flags. Array, string, date, and type operators support transformations without application-side loops.

Accumulators summarize a group or window: $sum, $avg, $min, $max, $first, $last, $push, and $addToSet. In $group, _id is the grouping key and each accumulator computes a value for that group. $first and $last depend on input order; sort explicitly if order matters.

~~~javascript
db.orders.aggregate([
  { $set: { lineTotal: { $multiply: ["$quantity", "$unitPrice"] } } },
  { $group: {
      _id: "$customerId",
      revenue: { $sum: "$lineTotal" },
      average: { $avg: "$lineTotal" },
      products: { $addToSet: "$sku" }
  } }
])
~~~

Null, missing, and type conversions can produce subtle results. Use $ifNull, $convert, or explicit type checks where inputs vary, and test edge cases. See [aggregation expressions](https://www.mongodb.com/docs/manual/reference/operator/aggregation/) and [accumulators](https://www.mongodb.com/docs/manual/reference/operator/aggregation/#accumulators).
