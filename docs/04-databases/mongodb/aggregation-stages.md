# Aggregation Stages

A pipeline applies stages in sequence. Each stage receives the prior stage's documents, so placing a stage changes both output and cost.

- $match filters by query predicates and can use an index when placed early.
- $project selects or computes output fields; $set/$addFields adds or replaces fields.
- $unwind emits one document per array element.
- $group combines documents by a key and uses accumulators.
- $sort orders output; $skip and $limit control result windows.
- $lookup joins another collection into an array; $unionWith combines another pipeline's output.
- $facet runs independent subpipelines over the same input.
- $bucket and $bucketAuto group values into ranges; $setWindowFields computes over ordered partitions.
- $replaceRoot/$replaceWith changes the current document shape.
- $count returns a count of pipeline documents.

Use $match early to reduce work, but preserve semantics when moving stages. Put a limit before expensive work only when it does not change the intended result. See [aggregation pipeline stages](https://www.mongodb.com/docs/manual/reference/operator/aggregation-pipeline/).
