# Backups Cheat Sheet

Quick revision of the backups lessons, for use before an interview or a
backup and recovery task.

## Key commands

| Command | What it does |
|---|---|
| `mongodump --uri="$MONGODB_URI" --readPreference=secondary --oplog --archive --gzip` | Consistent dump to stdout, for `aws s3 cp -` |
| `mongorestore --uri="$RESTORE_URI" --archive --gzip --oplogReplay --drop` | Restore into a scratch cluster, replaying the dump's oplog |
| `mongorestore ... --nsFrom="taskflow.tasks" --nsTo="recovery.tasks_20261112"` | Restore one collection side by side, under a new name |
| `pbm config --set pitr.enabled=true`, then `pbm restore --time="2026-11-10T14:30:59"` | Percona Backup for MongoDB: continuous oplog capture, then PITR |
| `pg_dump --format=directory --jobs=4 --file=<dir> "$DATABASE_URL"` | Parallel, compressed PostgreSQL dump |
| `pg_dumpall --globals-only` | Dump roles, which `pg_dump` leaves out |
| `pg_restore --jobs=4 ... --dbname="$SCRATCH_DATABASE_URL" <dir>` | Restore a dump in parallel |
| `pg_basebackup --pgdata=<dir> --wal-method=stream --checkpoint=fast` | Physical base backup for PITR |
| `aws rds restore-db-instance-to-point-in-time ... --restore-time 2026-11-10T14:30:59Z` | RDS PITR into a new instance |
| `restic forget --tag uploads --keep-daily 7 --keep-weekly 4 --keep-monthly 12 --prune` | GFS retention for file backups |
| `restic check --read-data-subset=5%` | Read back and verify 5% of the data |

## Key configuration

```ini
# postgresql.conf on the primary: archive every completed WAL segment
wal_level = replica
archive_mode = on
archive_command = 'test ! -f /mnt/wal-archive/%f && cp %p /mnt/wal-archive/%f'
archive_timeout = 300   # switch segments at least every 5 min (bounds the RPO)

# postgresql.conf on the restore server (plus an empty recovery.signal file)
restore_command = 'cp /mnt/wal-archive/%f %p'
recovery_target_time = '2026-11-10 14:30:59+00'
recovery_target_action = 'promote'
```

## Decision guide

| If you need | Choose | Why |
|---|---|---|
| A small database (up to tens of GB) | Nightly logical dumps plus continuous log capture, copied offsite | Portable; restores one collection or table |
| A large database | Physical or snapshot backups with PITR (pgBackRest, WAL-G, Percona Backup for MongoDB) | Logical restores reinsert every record and rebuild every index |
| A managed database (Atlas, RDS) | Its backups and PITR, plus cross-region or cross-account copies you control | Defaults may not meet your RPO, RTO, and isolation needs |
| Files in object storage | Versioning plus a copy in another account with Object Lock | Replication alone copies deletions |
| Ransomware resilience | 3-2-1-1-0 | Attackers look for backups first |
| A major-version or platform migration | Logical dump and restore | Physical backups are tied to the same engine and major version |
| Recovery of one deleted collection or table | Restore to a scratch instance, then copy the records back | Never restore over production |
| DR with hours of tolerable downtime | Backup and restore, rebuilt with IaC | Lowest cost |
| An RTO under an hour | Pilot light or warm standby | Data is already replicated to the DR region |
| Near-zero downtime | Multi-site active/active, plus point-in-time backups | Highest cost; replication still copies corruption |

## Numbers and defaults to remember

| Item | Value |
|---|---|
| 3-2-1-1-0 | 3 copies, 2 types of storage, 1 offsite, 1 immutable or offline, 0 errors in restore tests |
| GFS retention | Daily for 7 to 14 days, weekly for 4 to 5 weeks, monthly for 12 months or more |
| Achieved RPO | Time since the last recoverable copy (backup interval, or replication lag) |
| Achieved RTO | Detect + decide + provision + restore + verify + switch traffic |
| Nightly backups only | Worst-case RPO about 24 h |
| DR strategies | Backup and restore: hours; pilot light: tens of minutes; warm standby: minutes; active/active: near zero |
| `archive_timeout = 300` | At most about 5 min of PostgreSQL commits at risk |
| RDS automated backups | Daily snapshot plus logs about every 5 min; PITR within a retention of 1 to 35 days |
| AWS KMS key deletion | 7 to 30 day waiting period; alert on scheduled deletions |
| S3 Object Lock | Compliance mode: nobody, not even root, can shorten retention or delete; governance mode: specially permitted users can; needs versioning |
| Failover DNS TTL | About 60 s, set before the disaster |
| Restore tests | Automated weekly for tier 0 and 1 (daily for the most critical); regional failover drill at least yearly |

## Top mistakes

- **Treating replication, RAID, or high availability as a backup.** They
  copy deletions and corruption; keep point-in-time backups as well.
- **Keeping every copy in one account, region, or set of credentials.**
  Copy into a separate backup account with Object Lock.
- **Backing up only the database.** Include files, secrets and keys,
  configuration, IaC state, images, and runbooks.
- **Running `mongodump` without `--oplog` on a busy replica set.** Dump
  with `--oplog` and restore with `--oplogReplay`.
- **Never testing restores, or only checking that files exist.** Restore
  to scratch on a schedule, validate counts and invariants, and time it.
- **Restoring over production.** Restore side by side into a new
  instance, then copy back or switch.
- **Retention shorter than the time to notice damage.** Keep some copies
  for months; intruders can wait weeks before encrypting.
- **Encrypting backups with a key stored next to them.** Keep keys
  separate, back them up, and alert on scheduled key deletions.

## Where to go deeper

- [Backup fundamentals and strategies](backup-fundamentals-and-strategies.md)
- [Database backups and point-in-time recovery](database-backups-and-point-in-time-recovery.md)
- [Disaster recovery, RPO, and RTO](disaster-recovery-rpo-and-rto.md)
- [Restore testing and runbooks](restore-testing-and-runbooks.md)
- [Interview questions and answers](interview-questions-and-answers.md)

Back to the [backups overview](../backups.md).
