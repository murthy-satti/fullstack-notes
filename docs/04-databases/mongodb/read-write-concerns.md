# Read Concern, Write Concern, and Read Preference

Read concern controls which data state a read may observe. Write concern controls the acknowledgment a write waits for. Read preference chooses which replica-set members can serve a read. These are distinct controls and should match the application's consistency and availability needs.

A majority write concern requests acknowledgment by a majority of voting members. A majority read concern returns data acknowledged by a majority. Local reads can observe data that may later roll back. Reading from secondaries can be stale even with a chosen read preference. Linearizable reads provide stronger real-time guarantees in supported contexts, with latency and availability costs.

~~~javascript
db.orders.find({ state: "open" }).readConcern("majority")
db.orders.insertOne(
  { orderId: "o-42", state: "created" },
  { writeConcern: { w: "majority", wtimeout: 5000 } }
)
~~~

Driver APIs and shell helper syntax vary; use the driver documentation for application code. Transactions specify concerns at the transaction level. Avoid selecting strong settings by habit: write down the required guarantee, failure behavior, and latency budget. See [read concern](https://www.mongodb.com/docs/manual/reference/read-concern/), [write concern](https://www.mongodb.com/docs/manual/reference/write-concern/), and [read preference](https://www.mongodb.com/docs/manual/core/read-preference/).
