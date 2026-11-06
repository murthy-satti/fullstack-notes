# Encryption and Data Protection

TLS protects network traffic between MongoDB and clients. Configure certificate verification and hostname validation; do not disable them to bypass a connection error. Atlas configures transport encryption for its service, while self-managed deployments require server and client TLS configuration.

Encryption at rest protects stored files and snapshots. Atlas and self-managed offerings differ in key-management options. Customer-managed keys can give an organization more control but create responsibilities for availability, access, rotation, and recovery. Keep keys separate from encrypted backups and rehearse rotation.

Client-side field-level encryption encrypts selected values before sending them to the database, reducing what database infrastructure can read. Queryable Encryption and related capabilities have driver, server, and workload constraints. Encryption does not hide all metadata and does not replace authorization, secure logs, data minimization, or backup protection.

Classify data and keep secrets out of logs and exports. Review [TLS configuration](https://www.mongodb.com/docs/manual/tutorial/configure-ssl/) and [encryption](https://www.mongodb.com/docs/manual/core/security-encryption/).
