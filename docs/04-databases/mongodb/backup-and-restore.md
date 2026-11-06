# Backup and Restore

Define recovery point objective (acceptable data loss) and recovery time objective (time to restore) before selecting a backup method. Replication is not backup: accidental updates and deletes replicate.

Atlas backup capabilities and retention vary by deployment configuration. Self-managed options include storage snapshots and logical dumps using mongodump/mongorestore. Database Tools are useful for logical exports and smaller deployments but can add performance load; sharded deployments need a coordinated backup approach.

~~~sh
mongodump --uri="$MONGODB_URI" --archive=backup.archive --gzip
mongorestore --uri="$RESTORE_URI" --archive=backup.archive --gzip
~~~

Keep backups encrypted, access-controlled, and outside the database failure domain. Protect credentials and avoid putting them in shell history. Schedule restore drills: verify target cluster, collections, indexes, user/role requirements, application compatibility, and recovery time. Document point-in-time recovery steps if the selected service supports them.

A backup job that reports success is not proof that recovery will work. Regularly test restoration against the stated RPO/RTO. See [backup and restore tools](https://www.mongodb.com/docs/manual/tutorial/backup-and-restore-tools/), [mongodump](https://www.mongodb.com/docs/database-tools/mongodump/), and [Atlas backup](https://www.mongodb.com/docs/atlas/backup/).
