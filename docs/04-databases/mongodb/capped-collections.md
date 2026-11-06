# Capped Collections

A capped collection is a fixed-size collection that preserves insertion order and overwrites the oldest documents when it reaches its configured size. It can support bounded rolling logs or event buffers when overwrite semantics are acceptable.

Capped collections have behavioral restrictions compared with ordinary collections: documents cannot be deleted individually, and update operations cannot increase document size. They do not provide general retention guarantees based on event time. For time-based expiration, consider a TTL index; for high-volume time-stamped measurements, consider a time-series collection.

~~~javascript
db.createCollection("recentEvents", {
  capped: true,
  size: 10485760,
  max: 100000
})
~~~

Choose size and max-document limits from expected event size and retention rate. Capped collections preserve insertion order, but they are not a replacement for a durable event log or backup. See [capped collections](https://www.mongodb.com/docs/manual/core/capped-collections/).
