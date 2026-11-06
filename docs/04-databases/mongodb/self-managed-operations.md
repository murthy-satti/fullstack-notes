# Self-Managed Operations

Self-managed MongoDB requires ownership of installation, configuration, upgrades, storage, networking, security, monitoring, backups, recovery, and incident response. Follow official instructions for the operating system and exact server version.

Keep deployments on supported versions. Plan upgrades with server compatibility, feature compatibility version, drivers, and rollback constraints in mind. Test against representative data and workload, and automate consistent configuration across members. Protect configuration files and credentials.

Plan disk capacity for data, indexes, journal, oplog, temporary aggregation work, and backups. Monitor disk latency and free space as well as CPU and memory. Configure replica members across suitable failure domains. Document maintenance for index builds, certificate rotation, member replacement, and restore.

Restrict operating-system access and network paths. Prepare alerts and runbooks before incidents. Atlas shifts some infrastructure work to MongoDB but does not transfer responsibility for application access policy, schema, retention, query quality, and recovery objectives. See [operations checklist](https://www.mongodb.com/docs/manual/administration/production-checklist-operations/) and [installation](https://www.mongodb.com/docs/manual/installation/).
