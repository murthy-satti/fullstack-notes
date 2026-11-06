# Time Series and TTL

Time-series collections are optimized for measurements recorded over time, such as telemetry and sensor readings. Choose a BSON Date timeField and a stable metaField that groups measurements by source or device. Set granularity based on event frequency and expected query windows. Time-series collections have feature and update limitations compared with regular collections, so check compatibility with the operations your application needs.

~~~javascript
db.createCollection("readings", {
  timeseries: {
    timeField: "timestamp",
    metaField: "device",
    granularity: "minutes"
  }
})
~~~

A TTL index removes eligible documents after a configured duration. For example, an index on expiresAt with expireAfterSeconds set to zero expires documents at their stored timestamp. TTL cleanup is asynchronous, not an exact timer. Use BSON dates and do not rely on TTL for immediate deletion or precise scheduling.

Retention choices affect storage, compliance, and query history. Validate the actual behavior with the deployed server version. See [time-series collections](https://www.mongodb.com/docs/manual/core/timeseries-collections/) and [TTL indexes](https://www.mongodb.com/docs/manual/core/index-ttl/).
