# Import, Export, and Data Migration

MongoDB Database Tools include mongoimport and mongoexport for JSON/CSV-oriented exchange, and mongodump/mongorestore for BSON database dumps. These tools serve different purposes: JSON/CSV are useful for interchange, while BSON dumps preserve MongoDB-specific types better.

~~~sh
mongoimport --uri="$MONGODB_URI" --db=shop --collection=products --file=products.json
mongoexport --uri="$MONGODB_URI" --db=shop --collection=products --out=products.json
~~~

Test imports on a disposable database. Decide whether the target collection should be dropped, merged, or appended; validate field types, duplicate keys, encoding, and row counts. Large imports should use bounded batches and report rejected records. Avoid putting credentials in command history.

For production migration, plan source/target compatibility, indexes, validation, change capture or write downtime, cutover, rollback, and data verification. Atlas migration tools and cloud provider features vary. See [mongoimport](https://www.mongodb.com/docs/database-tools/mongoimport/), [mongoexport](https://www.mongodb.com/docs/database-tools/mongoexport/), and [migration guidance](https://www.mongodb.com/docs/atlas/import/).
