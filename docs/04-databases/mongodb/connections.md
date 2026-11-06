# Connection Strings and Drivers

Use an official MongoDB driver for application access. Drivers handle connection pools, BSON conversion, topology discovery, sessions, and supported retry behavior. Select a version compatible with both the application runtime and server deployment.

A standard URI can list hosts, while an Atlas SRV URI uses DNS to discover hosts. URIs can also define a default database, authentication source, TLS, and timeouts. Atlas supplies a URI through its connect workflow. Do not commit credentials in connection strings; reserved characters in credentials may need percent encoding. Keep secrets in environment-specific secret storage and prevent them from appearing in logs.

Create one long-lived client per application process so requests can reuse its connection pool. Close it during orderly shutdown. Tune pool sizes and timeouts from measured concurrency and failure behavior. Let the driver implement retryable operations where supported; for application retries, ensure the operation is idempotent or protected by an idempotency key.

A connection failure can arise from DNS/SRV lookup, firewall routes, TLS verification, the Atlas IP access list, authentication, or database roles. Diagnose the failing layer without disabling certificate checks or broadening network access unnecessarily. See the [connection string reference](https://www.mongodb.com/docs/manual/reference/connection-string/) and [official drivers](https://www.mongodb.com/docs/drivers/).
