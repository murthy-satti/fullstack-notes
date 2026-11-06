# Aggregation Output and Materialized Results

Most aggregation pipelines return a cursor. $merge and $out write pipeline output to a collection and must be the final stage. They are useful for batch summaries, precomputed reports, or materialized views.

$merge can insert new output and merge, replace, keep, or fail on matching target documents according to its options. Choose a stable on-field and unique index so reruns have predictable behavior. $out replaces a target collection with pipeline results and has restrictions on target namespace and deployment. Neither stage should be treated as a casual substitute for an application write.

Design refresh schedules and failure behavior: Is the result stale while recomputing? Can consumers read the old result until the new one is ready? What happens if the job stops midway? Restrict privileges on output collections and avoid targeting live collections unintentionally.

Use a non-production target while learning. Check server-version and sharded-cluster restrictions before deployment. See [$merge](https://www.mongodb.com/docs/manual/reference/operator/aggregation/merge/) and [$out](https://www.mongodb.com/docs/manual/reference/operator/aggregation/out/).
