# MongoDB Operations

Operations includes routine health checks, capacity planning, incident response, upgrades, backup verification, and query troubleshooting. Managed Atlas automates parts of infrastructure operation; application teams still own access policy, data lifecycle, recovery requirements, query quality, and cost.

## Monitor

Track availability, latency percentiles, request throughput, errors, connections, CPU, memory, disk space and latency, storage growth, replication lag, and backup status. Use alerts tied to user impact and document the response steps. For self-managed deployments, collect server metrics and logs and protect administrative interfaces.

## Troubleshoot slow queries

Capture the filter, sort, projection, result count, and realistic values. Use explain("executionStats") and compare keys/documents examined with documents returned. Check collection scans, blocking sorts, low selectivity, and oversized results. Profiler output can help find slow operations but adds overhead; enable it deliberately and manage sensitive query data in logs.

## Operate safely

Reuse driver clients and connection pools. Bound query results and batches. Keep supported server versions, review upgrade compatibility, and rehearse upgrades with representative data. Plan disk space for data, indexes, journal, oplog, temporary aggregation work, and backups. Test recovery procedures and certificate rotation before an incident. See the [operations checklist](https://www.mongodb.com/docs/manual/administration/production-checklist-operations/) and [Atlas monitoring](https://www.mongodb.com/docs/atlas/monitor-cluster/).
