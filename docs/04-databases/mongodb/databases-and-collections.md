# Databases and Collections

A database is a namespace for collections. A collection stores documents and has collection-level options such as validation, default collation, capped behavior, or time-series configuration. Databases and collections are often created implicitly by first write, but explicit creation is useful when configuring validation, capped size, time-series options, or other collection settings.

~~~javascript
use shop
db.createCollection("products")
show dbs
show collections
~~~

An empty database may not appear in listings until it contains data. Collection names should be stable and avoid reserved system namespaces. Collections can have indexes and validators; those properties are part of the data contract and should be managed deliberately.

Use separate databases when access boundaries, deployment ownership, or lifecycle needs differ. Use collections to group documents with related query and validation behavior. Splitting collections solely because fields differ is often unnecessary; polymorphic documents can share a collection when queries and indexes remain clear.

See [databases and collections](https://www.mongodb.com/docs/manual/core/databases-and-collections/) and [create collections](https://www.mongodb.com/docs/manual/reference/method/db.createCollection/).
