# Backup and Restore Drill

Schedule encrypted MongoDB backups to object storage with a retention
policy and an immutable copy, then prove they work: drop a collection,
restore to the minute before the mistake, verify the data, and compare the
time it really took with the RPO and RTO you would promise users.

## Why this project helps

- Builds backup and recovery skills: full and incremental backups,
  point-in-time recovery, retention, and immutability.
- Improves **resilience**: a backup that has never been restored is a hope,
  not a plan; this project turns it into a measured procedure.
- Improves **ransomware and mistake protection**: an immutable copy survives
  an attacker or an admin with delete rights.
- RPO and RTO questions, and "tell me about a restore you have done", come
  up in interviews for any backend or operations role.

## What you need

- A MongoDB replica set (local containers, or a managed cluster whose
  continuous backup supports point-in-time restore).
- The MongoDB Database Tools (`mongodump`, `mongorestore`) or restic for
  encrypted, deduplicated backups.
- An object storage bucket with versioning, lifecycle rules, and Object Lock
  (or your provider's equivalent).
- Builds on [Infrastructure from Code](infrastructure-from-code.md) for the
  bucket, and any earlier project that runs TaskFlow.

## How to do it

1. Read [backup fundamentals and strategies](../backups/backup-fundamentals-and-strategies.md)
   and write down the RPO and RTO you are aiming for.
2. Schedule backups with `mongodump --oplog` (or restic, or the managed
   service's continuous backup), encrypted before or as they reach storage;
   see [database backups and point-in-time recovery](../backups/database-backups-and-point-in-time-recovery.md).
3. Add a retention policy (daily, weekly, monthly) with lifecycle rules or
   restic's `forget` options.
4. Copy backups to a separate account or bucket with Object Lock so they
   cannot be deleted before their retention ends.
5. Seed test data, note the time, and drop a collection.
6. Restore into a scratch environment to the minute before the drop, by
   replaying the oplog with `mongorestore --oplogReplay` and a stop point,
   or with the managed point-in-time restore.
7. Verify with document counts per collection and a smoke test of the API,
   then switch over or copy the data back; see
   [restore testing and runbooks](../backups/restore-testing-and-runbooks.md).
8. Record each step's duration and compare the totals with your RPO and
   RTO; see [disaster recovery, RPO, and RTO](../backups/disaster-recovery-rpo-and-rto.md).

## Done when

- Backups run on a schedule, are encrypted, and follow the retention policy.
- An immutable copy exists that cannot be deleted during its retention.
- The dropped collection is restored to the minute before the mistake.
- Counts and the smoke test match the expected data.
- A runbook records the real restore time and data loss next to the RPO and
  RTO targets.

## Stretch goals

- Automate a monthly restore test in CI that fails if the restore breaks.
- Restore into another region and time it.
- Back up uploads in object storage as well; see
  [backup and archive storage](../hosting-and-platforms/backup-and-archive-storage.md).

## Lessons to use

- [Backups and Disaster Recovery](../backups.md)
- [MongoDB security and operations](../../../04-databases/mongodb/security-and-operations.md)

Back to [all projects](../projects.md).
