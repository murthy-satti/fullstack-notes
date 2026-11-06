# Aggregation Patterns and Tuning

Aggregation is a staged transformation. A common reporting flow matches a bounded time range, unwinds line items, joins dimensions, computes values, groups results, sorts, and limits output. Stage order affects both meaning and cost.

~~~javascript
db.orders.aggregate([
  { $match: { state: "paid" } },
  { $unwind: "$items" },
  { $set: { lineTotal: { $multiply: ["$items.qty", "$items.price"] } } },
  { $group: {
      _id: "$customerId",
      spend: { $sum: "$lineTotal" },
      products: { $addToSet: "$items.sku" }
  } },
  { $sort: { spend: -1, _id: 1 } },
  { $limit: 20 }
])
~~~

Use $facet to run multiple branches over one input, such as a page and count summary. $bucket and $bucketAuto group values into ranges. $setWindowFields calculates over ordered partitions, for example a running total. $unionWith combines another collection's pipeline output. $replaceRoot and $replaceWith change the current document shape.

$merge writes results to a target collection and supports merge/replace strategies; $out writes pipeline output as a collection under its documented restrictions. Both are terminal write stages. Check deployed-version rules before using them.

Filter early where semantics allow, bound arrays before $unwind, and use indexes for initial matching and sorting. Large $group and sort stages can consume substantial memory. Inspect explain output and intermediate result sizes with representative data. See [pipeline stages](https://www.mongodb.com/docs/manual/reference/operator/aggregation-pipeline/) and [pipeline limits](https://www.mongodb.com/docs/manual/core/aggregation-pipeline-limits/).
