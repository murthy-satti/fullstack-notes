# Change Streams

Change streams let applications subscribe to majority-committed changes on a collection, database, or deployment. They use aggregation pipelines to filter and reshape event notifications and require a replica set or sharded cluster. Common uses include cache invalidation, event-driven integration, and synchronizing a search index.

~~~javascript
const stream = db.orders.watch([
  { $match: { "fullDocument.state": "paid" } }
])
while (stream.hasNext()) {
  const event = stream.next()
  printjson(event)
}
~~~

Production applications should use the official driver stream API and close cursors during shutdown. Every event includes an _id resume token. Persist a token only after its event has been processed durably; after a crash, processing can repeat, so consumers should be idempotent. Resume requires that the oplog still contains the needed history. Handle network interruption, elections, invalidation, and expired tokens.

Pre- and post-images can be enabled for collections when the application needs document state before or after updates and deletes. They add storage and retention considerations. Do not remove or alter the event _id in the pipeline. See [change streams](https://www.mongodb.com/docs/manual/changeStreams/).
