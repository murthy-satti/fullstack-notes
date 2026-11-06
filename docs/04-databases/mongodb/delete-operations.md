# Delete Operations

deleteOne(filter) removes at most one document matching a filter. deleteMany(filter) removes every match. A filter of {} matches all documents, so never use an empty filter unless removing the full collection contents is deliberate.

~~~javascript
const target = { state: "expired", expiresAt: { $lt: new Date() } }
db.sessions.find(target, { _id: 1, expiresAt: 1 }).limit(20)
db.sessions.deleteMany(target)
~~~

Preview a destructive filter with find(), countDocuments(), and a narrow projection before issuing the delete. Check deletedCount and log enough operational context to audit the action without logging secrets or sensitive document contents.

Deletion is not automatically reversible. Backups or point-in-time recovery may be needed. TTL indexes can expire documents asynchronously based on a BSON Date; use them for retention, not exact-time deletion. A multi-document delete is not a single-document atomic operation. See [delete methods](https://www.mongodb.com/docs/manual/reference/delete-methods/).
