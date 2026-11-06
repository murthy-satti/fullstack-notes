# Sessions and Causal Consistency

A session groups related operations and carries logical session metadata. Drivers use sessions for transactions, retryable writes, and causal consistency. Create sessions through the driver and pass them to operations that belong to the session.

Causal consistency lets a session observe its own causally prior writes and reads when used with the required concerns. This is useful when a user writes data and then reads it through a deployment that may route reads to different replica-set members. It does not make unrelated operations globally serializable.

Sessions have lifetimes and must be ended. Do not share one session concurrently across independent operations unless the driver explicitly supports that usage. Transactions run within a session and require sequential handling according to driver rules.

~~~javascript
const session = client.startSession()
try {
  // pass { session } to related driver operations
} finally {
  await session.endSession()
}
~~~

Use the official driver API for the language in use; shell examples are not a substitute for application session handling. See [sessions](https://www.mongodb.com/docs/manual/reference/server-sessions/) and [causal consistency](https://www.mongodb.com/docs/manual/core/causal-consistency-read-write-concerns/).
