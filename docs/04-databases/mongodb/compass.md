# MongoDB Compass

Compass is MongoDB's graphical interface for connecting to deployments, exploring documents, building filters and aggregation pipelines, inspecting schemas, and managing indexes.

## Everyday workflow

Connect with a local or Atlas URI, select the intended database and collection, and use the Documents tab to filter, sort, project, and inspect records. The query filter uses MongoDB Query Language, for example: { status: "paid", total: { $gte: 50 } }. The Schema tab samples documents to summarize field types and values; sampling is useful for discovery but does not prove that every document follows the same shape.

The Aggregations tab helps construct stages and examine intermediate results. The Indexes tab shows existing indexes and may provide index management actions, depending on Compass edition, connected server, and privileges. Explain plans help investigate query behavior.

Treat Compass edits as real database writes. Confirm the selected environment before deleting or changing data, use least-privilege credentials, and practice against a development deployment. Turn exploratory work into reviewed scripts or migrations so it can be repeated. See [Compass documentation](https://www.mongodb.com/docs/compass/), [view documents](https://www.mongodb.com/docs/compass/documents/view/), and [analyze a schema](https://www.mongodb.com/docs/compass/schema/).
