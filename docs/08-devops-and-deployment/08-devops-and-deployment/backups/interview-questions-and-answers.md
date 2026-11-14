# Backups Interview Questions and Answers

These questions review backup fundamentals and strategies, database
backups and point-in-time recovery, disaster recovery with RPO and RTO,
and restore testing and runbooks. Try answering each one before reading
the answer.

## Backup fundamentals and strategies

### 1. What is the difference between a backup, replication, and a snapshot?

A backup is an independent, point-in-time copy kept for a retention
period so you can restore after loss or corruption. Replication keeps a
continuously updated copy for availability and fast failover. A snapshot
is a point-in-time image of a volume or database, which becomes a backup
only when copied somewhere independent with its own retention.

### 2. Why is replication not a backup?

Replication copies every change, including mistakes and attacks, within
seconds. A dropped collection, a bad migration, or ransomware encryption
reaches every replica. Only a copy from before the event, kept
independently, lets you recover.

### 3. Compare full, incremental, and differential backups.

A full copies everything. An incremental copies changes since the previous
backup of any kind, so it is small but a restore needs the full plus every
incremental in order. A differential copies changes since the last full,
so it grows each day but a restore needs only the full and the latest
differential.

### 4. With 500 GB of data and 25 GB of daily changes, how much does a week of each scheme store?

Daily fulls: 7 x 500 = 3,500 GB. Incremental: 500 + 6 x 25 = 650 GB.
Differential: 500 + (25 + 50 + 75 + 100 + 125 + 150) = 1,025 GB, assuming
each day changes different data. Restoring Saturday needs 1, 7, and 2
pieces respectively.

### 5. What is a synthetic full backup?

A full backup assembled on the backup system from the previous full and
later incrementals, without reading the production source again. It keeps
restore chains short while preserving the low production impact of
incrementals.

### 6. What is the 3-2-1 rule, and what does 3-2-1-1-0 add?

Keep 3 copies of the data (production plus 2 backups), on 2 different
storage types, with 1 copy offsite. 3-2-1-1-0 adds 1 immutable or offline
copy that cannot be changed or deleted, and 0 errors, proven by verified
restore tests.

### 7. How do immutable backups protect against ransomware?

Write-once storage such as S3 Object Lock in compliance mode, or a locked
backup vault, prevents anyone, including administrators and the root
account, from deleting or overwriting backups before their retention
expires. Combined with a separate account and credentials, an attacker who
takes over production cannot destroy the recovery path.

### 8. What is the difference between S3 Object Lock governance and compliance modes?

In governance mode, users with a special permission can shorten retention
or delete locked versions; in compliance mode nobody can, until the
retention date passes. Governance suits testing and internal controls;
compliance suits backups that must survive account compromise. Object Lock
requires bucket versioning.

### 9. How should backups be encrypted, and what is the key risk?

Encrypt at rest (server-side with a KMS key or client-side before upload)
and in transit, with keys kept separately from the backups and protected
by restrictive policies. The risk is losing the key: if it is deleted or
inaccessible, every backup encrypted with it is permanently unreadable.

### 10. What is grandfather-father-son retention?

A schedule with daily backups (sons) kept for about a week, weekly
backups (fathers) kept for about a month, and monthly backups
(grandfathers) kept for a year or more. About 23 restore points cover a
year, fine-grained for recent data and coarse for old data.

### 11. How do you choose a retention period?

From how long it takes to discover corruption or an intrusion (often
weeks), legal and contractual requirements, privacy rules that limit how
long personal data may be kept, and cost. Retention shorter than detection
time means every backup already contains the damage.

### 12. What besides the database should be backed up?

Object storage (uploaded files), secrets and encryption keys,
configuration, infrastructure-as-code state, source code mirrors,
container images or the ability to rebuild them, logs needed for audits,
and runbooks. Caches and search indexes can be rebuilt instead, if the
rebuild is documented and fits the RTO.

### 13. Why is object storage replication not enough to protect uploaded files?

Replication propagates deletions and overwrites. Use versioning so old
versions survive, and copy objects to another account with Object Lock or
backup retention, so a mistake or attacker in the source account cannot
remove every copy.

### 14. How do backups interact with privacy rules such as the right to erasure?

Rewriting every backup to delete one person's data is usually impractical
and, with immutable storage, impossible. Common practice is short,
documented retention so deleted data expires with the backups, never
restoring deleted records into production (re-applying deletions after a
restore), and per-tenant or per-user encryption keys whose destruction
makes old copies unreadable (crypto-shredding).

## Database backups and point-in-time recovery

### 15. Compare logical and physical database backups.

Logical backups (`mongodump`, `pg_dump`) read records through the
database into portable files; they allow selective restores and version
migrations but are slow for large data and slow to restore because indexes
are rebuilt. Physical backups (snapshots, `pg_basebackup`) copy files or
blocks; they are fast to take and restore but tied to the same engine and
version, usually restoring everything.

### 16. What makes a database backup consistent?

It represents a state the database actually had at one moment. `pg_dump`
runs in a single transaction snapshot. `mongodump --oplog` captures oplog
entries during the dump and replays them on restore. Snapshots are
crash-consistent if the journal is on the same volume; multi-volume and
sharded setups need locks or coordinated tools.

### 17. What does `mongodump --oplog` do, and what are its limits?

It records oplog entries written during the dump so `mongorestore
--oplogReplay` brings the restore to a single consistent point. It needs a
full dump of a replica set member, cannot be combined with `--db`,
`--collection`, or `--query`, is not supported through `mongos` on sharded
clusters, and fails if operations such as collection renames, `$out`
aggregations, or user changes run during the dump.

### 18. How do `pg_dump` formats differ?

Plain (`-Fp`) is a SQL script; custom (`-Fc`) is compressed and allows
selective restore with `pg_restore`; directory (`-Fd`) also allows
parallel dumps with `--jobs`; tar is another archive format. Roles and
other cluster-wide objects need `pg_dumpall --globals-only`.

### 19. Explain point-in-time recovery.

Restore a base backup, then replay the database's change log (PostgreSQL
WAL or the MongoDB oplog) up to a chosen recovery target: a timestamp, log
position, or named restore point. It requires an unbroken log archive
from the base backup to the target.

### 20. What determines the RPO of a PITR setup?

How much committed log has not yet been archived when the disaster hits:
for PostgreSQL, bounded by `archive_timeout` and archiving speed; for
MongoDB, by how continuously the oplog is captured. Gaps in the archive
or an oplog window shorter than the capture interval break recovery
entirely after the gap.

### 21. Why restore into a new instance rather than over production?

It keeps the damaged system available for investigation, lets you verify
the restore before committing, and allows copying back only the affected
records, preserving good writes made after the recovery target. Restoring
in place can destroy data you still need.

### 22. What do managed services such as Atlas and RDS provide, and what remains your job?

They take scheduled snapshots and capture logs for point-in-time restore
within a retention window (RDS: 1 to 35 days, with restores creating a new
instance). You still choose retention, copy backups to other regions and
accounts, protect against deletion of the instance and its backups, and
test restores and connection switching.

### 23. Why back up from a replica, and which kind?

Backups read a lot of data and evict the working set from cache; on the
primary they slow user traffic. A hidden MongoDB member (priority 0,
hidden) or a PostgreSQL standby serves backups without application load.
Check replication lag, because the backup is only as fresh as the replica.

### 24. Is a delayed replica a backup?

No. A delayed member that stays an hour behind is a convenient way to
recover from a mistake noticed within that hour, but it lives in the same
cluster and account and eventually applies every change, including the
mistake. It complements backups.

### 25. Why might a logical backup be the wrong choice for a large database?

Restoring requires reinserting every document and rebuilding every index,
which can take many hours for hundreds of gigabytes and exceed the RTO.
Physical or snapshot-based backups restore by copying files and starting
the server.

### 26. How do you back up a sharded MongoDB cluster?

Use a tool that coordinates a consistent point across every shard and the
config servers: Atlas Cloud Backup, Ops Manager, or Percona Backup for
MongoDB. `mongodump` through `mongos` needs the balancer, cross-shard
transactions, and schema changes paused, cannot use `--oplog`, and is not
a sound production backup strategy for sharded clusters.

## Disaster recovery, RPO, and RTO

### 27. Define RPO and RTO.

RPO (recovery point objective) is the maximum acceptable data loss,
measured as time before the disaster. RTO (recovery time objective) is the
maximum acceptable time from the disaster until the service works again.
Both must fit within the maximum tolerable downtime from the business
impact analysis.

### 28. Backups run every 6 hours. What is the worst-case RPO?

Six hours (plus any copy delay): a disaster just before the next backup
loses almost everything since the previous one. Continuous log capture is
the way to get an RPO of minutes.

### 29. What makes up the RTO?

Time to detect, decide, provision infrastructure, restore data, verify,
and switch traffic. Restoring data is often less than half; decision
making, access problems, and DNS caching are commonly underestimated.

### 30. What is a business impact analysis?

An assessment of each business function's dependence on systems and the
impact of losing it over time (revenue, contracts, regulation,
reputation). It sets maximum tolerable downtime and acceptable data loss,
which become RTO and RPO targets per tier.

### 31. Describe the four DR strategies.

Backup and restore keeps only backups and rebuilds everything (hours).
Pilot light replicates data live and keeps core infrastructure ready but
compute switched off (tens of minutes). Warm standby runs a scaled-down
working copy (minutes). Multi-site active/active serves users from several
regions (near zero), at the highest cost and complexity.

### 32. What is the difference between pilot light and warm standby?

Pilot light cannot serve requests until servers are started and scaled;
warm standby can serve immediately at reduced capacity and only needs to
scale up. Warm standby costs more and recovers faster.

### 33. Does active/active remove the need for backups?

No. It protects against losing a region, but corruption, accidental
deletion, and ransomware replicate to every region. Point-in-time backups
are still required, and data recovery from them still has a non-zero RPO.

### 34. How do availability zones and regions differ for DR?

Availability zones are isolated data centers within a region with
low-latency links, protecting against data center failures; multi-AZ is
the production default. Regions are separate geographic areas protecting
against regional outages, with asynchronous replication, higher latency,
and data residency considerations.

### 35. How does DNS failover work, and what are its pitfalls?

Health-checked DNS returns the primary endpoint while it is healthy and a
secondary otherwise. Clients and resolvers cache answers for the TTL, so
DR records need short TTLs set in advance; anycast or global load
balancers avoid DNS caching. Automatic failover on noisy checks can cause
unnecessary data loss, so many teams keep a human decision.

### 36. Why prefer data plane over control plane operations during failover?

Control planes (APIs that create or change resources) are more likely to
be impaired during a regional event than data planes (serving traffic,
health checks). Failover that only flips health-checked routing is more
reliable than one that must create resources at the worst moment.

### 37. What should a DR plan contain?

Scope and objectives, scenarios and strategies, roles and contacts,
criteria for declaring a disaster, runbooks for failover, restore, and
failback, communication plans, dependencies and prerequisites, and the
testing schedule with measured results, stored outside the systems it
protects.

### 38. What third-party dependencies can block recovery in a DR region?

Identity and single sign-on, secrets and keys, container registries, CI/CD
systems, DNS and CDN providers, email and payment providers, and
monitoring and status pages hosted in the failed region.

### 39. What is the difference between RTO and maximum tolerable downtime?

Maximum tolerable downtime, from the business impact analysis, is the
outage length beyond which harm becomes unacceptable. The RTO is the
engineering target for restoring service and must be shorter, leaving a
margin for verification and for things going wrong during recovery.

## Restore testing and runbooks

### 40. Why is an untested backup not a backup?

Backups fail silently: empty or truncated files, version mismatches,
missing collections, missing keys or permissions, or restores far slower
than the RTO. Only a verified restore proves the backup works.

### 41. What should an automated restore test verify?

That the restore completes without errors, document counts match a
manifest recorded at backup time within a tolerance, invariants hold
(no orphaned references, required indexes present), the data is fresh
(newest record within the RPO), and the application runs against the
restored data in a smoke test. It also records the restore duration.

### 42. What is a backup manifest?

Facts recorded when the backup is taken, such as the document count per
collection and the newest update timestamp, stored with the backup. The
restore test compares the restored data with it to detect missing or stale
data.

### 43. What metrics should you alert on for backups?

Backup job failures, the age of the last successful backup, unexpected
changes in backup size, the age of the last successful **restore** test,
restore duration against the RTO, and replication or log-shipping lag
against the RPO.

### 44. What is the difference between a tabletop exercise and a DR drill?

A tabletop exercise is a discussion that walks through a scenario on paper
to find gaps in plans and knowledge, touching no systems. A drill actually
performs the restore or failover, following the runbook, and measures the
real RTO and RPO.

### 45. What makes a good runbook?

A clear purpose and scope, owner and last-tested date, prerequisites,
explicit decision points, numbered steps with copy-pasteable commands and
expected output, verification, abort or rollback steps, communication
points, and post-steps. It is stored where it is available during an
outage and updated after every use.

### 46. How do you measure the actual RTO and RPO in a drill?

Record UTC timestamps at every phase (scenario start, decision, restore
complete, verification, traffic switched), sum them for the RTO, and
compare the newest restored write with the time of the simulated damage for
the RPO. Trend the results across drills.

### 47. Why should someone other than the runbook author run drills?

The author fills gaps from memory without noticing. A different engineer
exposes ambiguous steps, missing access, and unwritten knowledge, which is
exactly what an on-call engineer will face during a real incident.

## Scenario-based questions

### 48. The nightly backup job has reported success for months, but a restore test finds the archives are empty. What happened, and what do you change?

**What to check first:** the backup script's handling of exit codes and
the dump tool's logs and version.

**How to confirm:** the dump command fails (for example a version mismatch
or authentication error) while the script continues and uploads an empty
file, as in GitLab's 2017 incident.

**Likely causes and fixes:** missing `set -euo pipefail` and exit-code
checks, and no size or restore verification. Fail the job on errors,
alert on size anomalies and on the age of the last verified restore, and
run weekly automated restore tests. See
[restore testing and runbooks](restore-testing-and-runbooks.md).

### 49. A migration deleted a field from every task at 14:31. Nightly backups ran at 02:00. How do you recover with minimal data loss?

**What to check first:** whether point-in-time recovery is available
(continuous backup in Atlas, PBM PITR, or archived oplog) and the exact
time of the migration in UTC.

**How to confirm:** the PITR window covers 14:30:59, and logs show the
migration's start time.

**Likely causes and fixes:** restore to 14:30:59 into a new cluster,
verify, then copy the field values back to production for the affected
tasks, keeping good writes made after 14:31. Without PITR, the best
option is the 02:00 backup plus manual reconstruction. See
[database backups and point-in-time recovery](database-backups-and-point-in-time-recovery.md).

### 50. Ransomware encrypted production servers, and the attacker also deleted the backup snapshots. How could this have been prevented?

**What to check first:** where the backups lived and which credentials
could delete them.

**How to confirm:** audit logs show deletions by a production
administrator role in the same account.

**Likely causes and fixes:** backups in the same account with deletable
retention. Copy backups to a separate account, enable Object Lock or vault
lock in compliance mode, give backup writers no delete permission, keep
retention longer than typical intrusion dwell time, and keep an offline
copy of critical data. See
[backup fundamentals and strategies](backup-fundamentals-and-strategies.md).

### 51. A restore of the 400 GB MongoDB database took nine hours against a two-hour RTO. What do you do?

**What to check first:** where the time went: download, data insertion,
or index builds.

**How to confirm:** the drill timeline shows `mongorestore` spending most
of the time rebuilding indexes after loading data.

**Likely causes and fixes:** a logical backup used for a database too large
for it. Move to snapshot or physical backups for full restores, keep
logical dumps for selective recovery, consider warm standby for tier 0,
and track restore duration in weekly tests. See
[database backups and point-in-time recovery](database-backups-and-point-in-time-recovery.md).

### 52. Point-in-time recovery stopped three hours short of the target time. Why?

**What to check first:** the WAL or oplog archive for gaps around where
recovery stopped.

**How to confirm:** archiving failures (`pg_stat_archiver.failed_count`
rising) or a missing oplog range during that period.

**Likely causes and fixes:** an archive destination that was full or
unreachable, expired credentials, or an oplog window shorter than the
capture interval. Alert on archiving failures and lag, size the oplog
generously, and take a new base backup after any gap. See
[database backups and point-in-time recovery](database-backups-and-point-in-time-recovery.md).

### 53. After failing over to the DR region, users still reach the dead region for an hour. What went wrong?

**What to check first:** the TTL on the API's DNS record and what resolvers
return.

**How to confirm:** the record has a TTL of 3,600 seconds and resolvers
still serve the old answer.

**Likely causes and fixes:** a long TTL set before the incident. Lower TTLs
on DR-critical records to about 60 seconds in advance, or use anycast or a
global load balancer. See
[disaster recovery, RPO, and RTO](disaster-recovery-rpo-and-rto.md).

### 54. The DR region's infrastructure exists, but the application will not start there during a drill. What do you check?

**What to check first:** image pulls, secret reads, and key access in the
DR region.

**How to confirm:** pods fail with image pull errors from the primary
region's registry, or access denied reading secrets and KMS keys.

**Likely causes and fixes:** registries, secrets, or keys that exist only in
the primary region. Replicate images, secrets, and keys, raise quotas in
advance, and include deploying from scratch in the DR region in every
drill. See [disaster recovery, RPO, and RTO](disaster-recovery-rpo-and-rto.md).

### 55. After a regional failover, more data was lost than the 5-minute RPO allowed. Why?

**What to check first:** replication or log-shipping lag to the DR region
before the outage.

**How to confirm:** metrics show lag had grown to 40 minutes days earlier,
with no alert.

**Likely causes and fixes:** monitoring checked that replication was
running, not how far behind it was. Alert on lag against the RPO,
investigate bandwidth or write-volume growth, and consider stronger write
concerns for critical data. See
[disaster recovery, RPO, and RTO](disaster-recovery-rpo-and-rto.md).

### 56. A restored database looks complete, but tasks link to attachments that return 404. What is missing?

**What to check first:** whether the uploads bucket is backed up and at
what point in time.

**How to confirm:** the attachments were deleted from the bucket (or never
copied), and only replication protected it.

**Likely causes and fixes:** object storage outside the backup scope.
Enable versioning, copy objects to a separate account with retention, and
make restore tests check references between the database and storage. See
[backup fundamentals and strategies](backup-fundamentals-and-strategies.md).

### 57. During an incident, the on-call engineer cannot decrypt the backups. What happened?

**What to check first:** the state of the KMS key and the restore role's
permissions on it.

**How to confirm:** the key is disabled or pending deletion, or its policy
does not allow the restore role.

**Likely causes and fixes:** key management outside the backup design.
Restrict key deletion, alert on scheduled deletions and policy changes,
document key ownership, and exercise the restore role and key in every
restore test. See
[backup fundamentals and strategies](backup-fundamentals-and-strategies.md).

### 58. The weekly restore test passes, but a real restore last month surprised everyone. Why might the test be misleading?

**What to check first:** what the test actually verifies and how it
differs from the real procedure.

**How to confirm:** it only checks that the archive exists and
decompresses, restores a much smaller staging backup, or skips the
application switch and DNS steps.

**Likely causes and fixes:** verification stopped at a shallow level.
Restore the real production backup, validate counts, freshness, and
invariants, run a smoke test, time the restore, and run periodic drills
that include switching traffic. See
[restore testing and runbooks](restore-testing-and-runbooks.md).

### 59. The team restored the database to "14:30" but lost an extra hour of data. What went wrong?

**What to check first:** the time zone of the recovery target and of the
logs used to choose it.

**How to confirm:** the incident was at 14:31 local time (UTC-1), but the
target was interpreted as 14:30 UTC, an hour earlier than intended.

**Likely causes and fixes:** mixed time zones. Use UTC everywhere, set the
target as an explicit variable in the runbook, and verify the newest
restored write against the intended target before switching. See
[restore testing and runbooks](restore-testing-and-runbooks.md).

### 60. Backup storage costs double every few months although the database grows slowly. How do you fix it?

**What to check first:** retention settings, lifecycle rules, and whether
backups are full or incremental.

**How to confirm:** old backups and noncurrent object versions are never
expired, and every nightly backup is a full copy.

**Likely causes and fixes:** missing lifecycle expiry and retention policy.
Apply GFS retention, expire noncurrent versions, move older backups to
cheaper tiers where restore time allows, and use incremental or
deduplicating tools. See
[backup fundamentals and strategies](backup-fundamentals-and-strategies.md).

## Further learning

- [Backups overview](../backups.md)
- [Backup fundamentals and strategies](backup-fundamentals-and-strategies.md) ·
  [Database backups and point-in-time recovery](database-backups-and-point-in-time-recovery.md) ·
  [Disaster recovery, RPO, and RTO](disaster-recovery-rpo-and-rto.md) ·
  [Restore testing and runbooks](restore-testing-and-runbooks.md)
- [Google SRE book: Data Integrity](https://sre.google/sre-book/data-integrity/)
- [AWS whitepaper: Disaster recovery options in the cloud](https://docs.aws.amazon.com/whitepapers/latest/disaster-recovery-workloads-on-aws/disaster-recovery-options-in-the-cloud.html)
