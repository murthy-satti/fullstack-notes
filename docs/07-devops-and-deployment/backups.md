# Backups

## Introduction

A backup is a recoverable copy of data or configuration. It protects against accidental deletion, bugs, device failure, and some security incidents. It is useful only if it can be restored in time.

## Why does it exist?

Production data can be lost or corrupted. Replication may keep a service running but also copy accidental deletion. A backup provides a point-in-time recovery option.

## How does it work?

A backup process copies selected data to another location on a schedule or continuously. A retention policy defines how long copies are kept. Protect copies and test that they can be restored.

## Real-world example

A shop keeps a month's worth of nightly database backups. If a migration corrupts records, the team can restore a clean copy.

## Developer perspective

Identify what to back up: databases, uploaded files, and configuration may need different schedules. **RPO** is acceptable recent data loss; **RTO** is target restore time. Practice restoring safely. See [servers](../06-servers-and-infrastructure/servers.md), [Docker](docker.md), and [monitoring](monitoring-and-logging.md).

## Practical example

Schedule database exports to protected storage and periodically restore one into a test database. Never overwrite the only live copy during a test.

## Important terminology

- **Snapshot:** point-in-time representation of data or a volume.
- **Retention:** how long backup versions are kept.
- **Restore:** recovering data from a backup.
- **RPO:** acceptable data-loss interval.
- **RTO:** target recovery duration.

## Advantages and disadvantages

Backups enable recovery but consume storage and require maintenance. Replicas alone are not a complete backup plan.

## Common misconceptions

A successful backup job does not prove a restore will work. A backup on the same machine may be lost with the original.

## Revision questions

1. How do RPO and RTO differ?
2. Why should backups be restored in a test?
3. Why is replication not always a backup?

## Further Learning & References

- **Official AWS documentation:** [What is AWS Backup?](https://docs.aws.amazon.com/aws-backup/latest/devguide/whatisbackup.html) describes managed backup and recovery concepts.
- **Official AWS documentation:** [What is AWS Backup?](https://docs.aws.amazon.com/aws-backup/latest/devguide/whatisbackup.html) explains managed backup plans, recovery points, and supported AWS resources.
