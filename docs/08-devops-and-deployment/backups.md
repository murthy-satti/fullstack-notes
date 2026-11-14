# Backups

A backup is a separate, protected copy of data taken at a point in time,
kept so you can **restore** after the original is lost, corrupted,
deleted by mistake, or encrypted by ransomware. Backups are the last line
of defence: replication, redundancy, and high availability protect
against machines failing, but only a backup protects against the data
itself going wrong. And a backup is only as good as the last time someone
successfully restored from it.

## What backups provide

- **Recovery from mistakes:** a bad migration, a deleted collection, or a
  bug that overwrites records can be undone to a point before it
  happened.
- **Recovery from attacks:** ransomware and malicious deletion are
  survivable if a copy exists that the attacker could not reach or change.
- **Disaster recovery:** losing a region, an account, or a provider is
  survivable if data and the means to rebuild exist elsewhere.
- **Compliance and history:** regulations, contracts, and audits often
  require data to be retained for set periods and restorable on demand.
- **Safer change:** a fresh backup before a risky operation turns a
  potential catastrophe into an inconvenience.

Backups also create obligations: they contain the same sensitive data as
production, so they need encryption, access control, retention limits,
and the ability to delete data when the law requires it.

## How a typical backup system works

For TaskFlow API's MongoDB data and the files users upload:

1. **Decide what to protect and how much loss is acceptable.** The
   recovery point objective (RPO) says how much recent data you may lose;
   the recovery time objective (RTO) says how long a restore may take.
2. **Back up on a schedule:** a nightly snapshot or dump of the database,
   plus continuous capture of the oplog (or the WAL in PostgreSQL) for
   point-in-time recovery, and copies of object storage, configuration,
   secrets, and infrastructure state.
3. **Encrypt** every backup with keys kept separately from the backups.
4. **Store copies offsite and immutably:** another region and another
   account, with write-once retention (for example S3 Object Lock) so
   neither mistakes nor attackers can delete them early.
5. **Expire old backups** on a retention schedule (daily, weekly, monthly).
6. **Restore regularly** into a scratch environment and verify the result
   automatically: counts, checksums, and an application smoke test.

![Diagram: MongoDB (tasks and users), object storage (uploaded files), config and secrets (encrypted copies), and IaC state (Terraform state) feed backup jobs that take nightly snapshots, capture the oplog continuously, and sync files and state on a schedule. Backups are encrypted with a KMS key in a separate account, then stored as an immutable copy in another region and another account, with Object Lock and GFS retention. A weekly automated restore test restores into a scratch environment and checks counts, checksums, and a smoke test, feeding a dashboard and alerts that show the last good backup and restore.](backups-overview.svg)

## Practical example

A nightly logical backup of TaskFlow's MongoDB replica set, streamed
directly into encrypted object storage, and the matching restore:

```bash
# Back up: consistent dump (with oplog) from a secondary, compressed, to S3 with KMS encryption
set -o pipefail   # a failed mongodump must fail the job, not upload a truncated archive
mongodump --uri="$MONGODB_URI" --readPreference=secondary --oplog --archive --gzip \
  | aws s3 cp - "s3://taskflow-backups-example/mongodb/taskflow-$(date -u +%Y-%m-%dT%H%M%SZ).archive.gz" \
      --sse aws:kms --sse-kms-key-id "$BACKUP_KMS_KEY_ARN"
# Streams larger than 50 GB also need --expected-size <bytes> on aws s3 cp

# Restore into a scratch cluster, replaying the oplog captured during the dump
aws s3 cp "s3://taskflow-backups-example/mongodb/taskflow-2026-11-12T020000Z.archive.gz" - \
  | mongorestore --uri="$RESTORE_URI" --archive --gzip --oplogReplay --drop
```

`--oplog` makes the dump consistent to a single moment even though writes
continue during it. The restore goes into a separate environment first;
restoring over production is the last step of a recovery, not the first.
Larger databases usually move to snapshot-based backups, covered in the
database lesson.

## Backups topic map

**Foundations**

- [Backup fundamentals and strategies](backups/backup-fundamentals-and-strategies.md)

**Databases**

- [Database backups and point-in-time recovery](backups/database-backups-and-point-in-time-recovery.md)

**Recovery**

- [Disaster recovery, RPO, and RTO](backups/disaster-recovery-rpo-and-rto.md)
- [Restore testing and runbooks](backups/restore-testing-and-runbooks.md)

**Review**

- [Backups interview questions and answers](backups/interview-questions-and-answers.md) · [cheat sheet](backups/cheat-sheet.md)

## Developer perspective and common misconceptions

Start from the restore, not the backup: decide how fast you must be back
and how much data you can lose, then design backups that meet those
numbers, and prove it with scheduled restore tests. MongoDB-specific tools
and options are covered in
[MongoDB backup and restore](../04-databases/mongodb/backup-and-restore.md)
in the Databases section; this subject covers strategy, disaster recovery,
and operations around them.

- **Replication is not a backup.** A replica faithfully copies a dropped
  collection or a ransomware encryption within milliseconds.
- **RAID and multi-zone storage are not backups.** They protect against
  hardware failure, not against deletion or corruption.
- **Snapshots in the same account are not offsite.** Whoever can delete
  the database can usually delete its snapshots too.
- **"The cloud provider backs it up" is only partly true.** Managed
  services offer backup features, but retention, cross-region copies,
  restore testing, and protection from your own mistakes are your job.
- **An untested backup is a hope, not a backup.** Silent failures (wrong
  tool version, missing permissions, empty files) are common.
- **Encrypted backups are useless without the key.** Back up and protect
  the keys, separately from the data.

## Further learning

- [Google SRE book: Data Integrity](https://sre.google/sre-book/data-integrity/)
- [MongoDB: Backup methods](https://www.mongodb.com/docs/manual/core/backups/)
- [AWS whitepaper: Disaster recovery options in the cloud](https://docs.aws.amazon.com/whitepapers/latest/disaster-recovery-workloads-on-aws/disaster-recovery-options-in-the-cloud.html)
- [CISA: #StopRansomware Guide](https://www.cisa.gov/stopransomware/ransomware-guide)
- [Backups interview questions and answers](backups/interview-questions-and-answers.md)
