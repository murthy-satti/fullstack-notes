# Aggregation Pipelines

An aggregation pipeline transforms documents through an ordered list of stages. Each stage receives the previous stage's output. Stages filter, reshape, split arrays, group, join, sort, paginate, or write results. Expressions compute values within stages.

## Example: category revenue

Assume each order has a status, date, and `items` array with `productId`, `quantity`, and `unitPrice`. Products contain a category.

```javascript
db.orders.aggregate([
  { $match: { status: "paid", createdAt: { $gte: ISODate("2026-01-01") } } },
  { $unwind: "$items" },
  {
    $lookup: {
      from: "products",
      localField: "items.productId",
      foreignField: "_id",
      as: "product"
    }
  },
  { $unwind: "$product" },
  {
    $project: {
      category: "$product.category",
      lineTotal: { $multiply: ["$items.quantity", "$items.unitPrice"] }
    }
  },
  {
    $group: {
      _id: "$category",
      revenue: { $sum: "$lineTotal" },
      lineCount: { $sum: 1 },
      averageLine: { $avg: "$lineTotal" }
    }
  },
  { $sort: { revenue: -1 } },
  { $limit: 10 }
])
```

The initial `$match` reduces input and may use an index. `$unwind` emits one pipeline document per array element. `$lookup` matches another collection and adds an array of results; the second `$unwind` turns each matched product into a document. `$project` keeps or computes fields, and `$group` groups by its `_id` expression.

## Common stages

- `$match`: keep documents matching a query predicate.
- `$project`: include, exclude, rename, or compute fields.
- `$group`: group documents and calculate accumulators.
- `$unwind`: expand array elements into separate documents.
- `$lookup`: join a foreign collection into an array field.
- `$sort`, `$skip`, and `$limit`: order and paginate results. Large offsets with `$skip` require walking past skipped results; range pagination can scale better.
- `$facet`: run multiple subpipelines over the same input, for example a result page and summary counts.
- `$merge`: write pipeline output into a collection, merging with or replacing matching documents according to its options.
- `$out`: write results to a collection by replacing it; it has restrictions, so check the server-version documentation before using it.

`$merge` and `$out` are terminal write stages and are useful for batch summaries or materialized views. Treat their target collections and rerun behavior as part of the job design.

## Expressions and accumulators

Expressions include field paths such as `"$price"`; arithmetic such as `$add` and `$multiply`; conditionals such as `$cond` and `$ifNull`; comparisons; and array, string, and date operations. For instance, `{ $cond: [{ $gte: ["$qty", 10] }, "bulk", "single"] }` classifies a quantity.

Accumulators operate within `$group` or selected other stages: `$sum`, `$avg`, `$min`, `$max`, `$first`, `$last`, `$push`, and `$addToSet`. Sort before `$first` or `$last` when a specific ordering is required.

Stage order changes both meaning and cost. Filter early, keep only useful fields where appropriate, and measure large groups and sorts. See [aggregation pipeline stages](https://www.mongodb.com/docs/manual/reference/operator/aggregation-pipeline/) and [aggregation expressions](https://www.mongodb.com/docs/manual/reference/operator/aggregation/).
