# Security and Operations

## Security

- Enable authentication and grant users only the roles their work requires.
- Restrict network exposure; use TLS for connections and protect credentials in a secret manager.
- Apply encryption for storage and backups according to the deployment's requirements.
- Validate application input and construct filters from known fields and typed values. Do not pass untrusted objects directly as query documents.
- Keep database credentials out of source control and client-side code. Rotate secrets and review access regularly.

Use the MongoDB [security checklist](https://www.mongodb.com/docs/manual/administration/security-checklist/) for deployment-specific controls.

## Operational practices

Monitor query latency, slow operations, connection usage, disk space, memory pressure, replication lag, and storage growth. Use `explain("executionStats")` and representative workload measurements to investigate slow queries. Applications should reuse driver clients and their connection pools rather than opening a connection for each request.

Take backups and periodically test restoring them. Replication does not protect against logical mistakes or destructive writes. Plan upgrades against the deployed release's compatibility notes, and rehearse changes in a representative environment. Define alert thresholds and capacity plans before an incident.

See MongoDB's [operations checklist](https://www.mongodb.com/docs/manual/administration/production-checklist-operations/) and [backup methods](https://www.mongodb.com/docs/manual/core/backups/).
