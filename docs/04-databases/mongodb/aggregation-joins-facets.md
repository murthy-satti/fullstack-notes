# Aggregation Joins, Facets, and Windows

$lookup performs a left outer join from the current collection to a foreign collection and places matching documents in an array. Equality joins use localField and foreignField; pipeline form supports more complex matching. Index the foreign join field and bound the result where possible.

~~~javascript
db.orders.aggregate([
  { $lookup: {
      from: "customers",
      localField: "customerId",
      foreignField: "_id",
      as: "customer"
  } },
  { $unwind: { path: "$customer", preserveNullAndEmptyArrays: true } }
])
~~~

$unwind turns array elements into separate pipeline documents. preserveNullAndEmptyArrays keeps documents with a missing or empty array. This option changes whether a join behaves like an inner or left join after unwind.

$facet runs multiple branches over a common input, often for a page plus facets or counts. $setWindowFields calculates over partitions and sort order, such as rankings or running totals, without collapsing every partition into one document. These stages can require substantial memory and sort work; inspect plans and pipeline limits. See [lookup](https://www.mongodb.com/docs/manual/reference/operator/aggregation/lookup/), [unwind](https://www.mongodb.com/docs/manual/reference/operator/aggregation/unwind/), and [setWindowFields](https://www.mongodb.com/docs/manual/reference/operator/aggregation/setWindowFields/).
