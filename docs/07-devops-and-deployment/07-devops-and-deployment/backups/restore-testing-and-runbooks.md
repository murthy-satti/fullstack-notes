# Restore Testing and Runbooks

A backup that has never been restored is an assumption. The only proof
that you can recover is a restore that worked recently, produced the
right data, and finished within the RTO. This lesson explains why
untested backups fail, how to schedule restore tests and verify them
automatically (counts, checksums, freshness, and an application smoke
test), how to run game days and DR drills, how to write a runbook people
can follow under pressure, with a complete restore runbook for TaskFlow's
MongoDB database, how to measure the real RTO and RPO in drills, and the
restore failures that catch teams most often.

## Why it matters

Backup jobs fail in ways that look like success: the job exits 0 but
writes an empty file, a version mismatch produces an unusable dump, a new
collection is never included, the encryption key is gone, the restore
tool needs a version nobody has installed. These are discovered at the
worst possible moment, during an incident, when the original data is
already lost. GitLab's 2017 postmortem is the well-known example: several
backup mechanisms existed, and none worked as expected when needed.

Even when backups are fine, recovery depends on people executing a long,
unfamiliar procedure under stress. Restore time in a drill is usually far
longer than anyone estimated: downloads are slower, index builds take
hours, access is missing, a step is ambiguous. Testing turns these
surprises into calm Tuesday-afternoon fixes instead of extended outages.

## Real-world usage

- **GitLab (2017).** The
  [database outage postmortem](https://about.gitlab.com/blog/2017/02/10/postmortem-of-database-outage-of-january-31/)
  lists automated testing of database backup recovery and backup
  monitoring among its improvements, after discovering during the
  incident that regular backups had not been working.
- **AWS disaster recovery guidance.** The whitepaper section
  [Testing disaster recovery](https://docs.aws.amazon.com/whitepapers/latest/disaster-recovery-workloads-on-aws/testing-disaster-recovery.html)
  and the Well-Architected best practice
  [Test disaster recovery implementation to validate the implementation](https://docs.aws.amazon.com/wellarchitected/latest/reliability-pillar/rel_planning_for_recovery_dr_tested.html)
  call for regularly testing failover and restores so you know the
  strategy works and meets its RTO and RPO.
- **AWS Backup restore testing.** AWS Backup offers a
  [restore testing](https://docs.aws.amazon.com/aws-backup/latest/devguide/restore-testing.html)
  feature that restores recovery points on a schedule, records restore
  duration, and lets you run validation before the test resources are
  deleted, a managed form of the pipeline in this lesson.
- **Google SRE.** The SRE book's
  [Data Integrity](https://sre.google/sre-book/data-integrity/) chapter
  stresses continuously testing the recovery process, and the chapter
  [Accelerating SREs to On-Call and Beyond](https://sre.google/sre-book/accelerating-sre-on-call/)
  describes "Wheel of Misfortune" role-play exercises that rehearse
  incident response before it is needed.

**Popular tools and providers:** AWS Backup restore testing, MongoDB
Atlas restore APIs, Percona Backup for MongoDB, pgBackRest (`verify`,
`restore`), restic (`check`), Velero, CI schedulers (GitHub Actions,
GitLab CI), AWS Fault Injection Service, Gremlin, LitmusChaos, and Chaos
Mesh for game days.

## How it works

### Why untested backups are not backups

Common ways a "successful" backup turns out to be useless:

- **Silent job failures:** the script ignores a non-zero exit code, or
  alert emails go nowhere.
- **Incomplete scope:** a new database, collection, bucket, or service was
  never added to the backup configuration.
- **Corrupted or truncated files:** network interruptions, full disks, or
  storage bugs.
- **Missing keys or credentials:** the encryption key or restore role no
  longer exists.
- **Tool and version drift:** the restore needs a specific tool or database
  version.
- **Too slow:** the restore works but takes three times longer than the
  RTO.
- **Unusable result:** data restores, but the application cannot run on it
  (missing indexes, users, configuration, or migrations).
- **Lost knowledge:** the one person who knew the procedure is unavailable.

Only an actual restore, verified against expectations, catches all of
these.

### Levels of verification

| Level | Check | Catches | Typical frequency |
|---|---|---|---|
| 0 | Job exit code and logs | Crashes, permission errors | Every run |
| 1 | Backup exists, size within the expected range | Empty or truncated files, missing runs | Every run |
| 2 | Integrity check (checksums, `restic check`, `pgbackrest verify`) | Corruption in storage | Daily to weekly |
| 3 | Restore completes in a scratch environment | Tool drift, missing keys or permissions | Weekly for tier 0 |
| 4 | Data validation: counts, checksums, invariants, freshness | Incomplete scope, inconsistent dumps, stale data | With every restore test |
| 5 | Application smoke test on restored data | Missing indexes, users, config; schema mismatch | With every restore test |
| 6 | Full DR drill: failover, traffic, measured RTO and RPO | Process, people, and dependency gaps | Quarterly to yearly |

Levels 0 to 2 are cheap and run every time; levels 3 to 5 are the
automated restore test; level 6 is a scheduled drill with people.

### Automated restore verification

![Diagram: a weekly scheduled CI job fetches the latest backup and its manifest with a read-only role, restores it to a fresh scratch MongoDB while timing it, then verifies four things: 1, the restore completed with exit code 0, no errors, and indexes rebuilt; 2, per-collection counts within 0.5% of the manifest; 3, freshness, the newest updatedAt within the RPO; 4, a smoke test where the API on the restored database answers /readyz and a task list query. If all pass, metrics are published and the scratch environment destroyed; if any fail, a ticket or page is raised and the environment kept for debugging. Metrics are last_successful_restore_timestamp, restore_duration_seconds, and restored_data_age_seconds, with an alert if no successful restore happens in 8 days and trends of duration against the RTO and data age against the RPO.](restore-verification-pipeline.svg)

The pipeline's checks, and why each matters:

- **Restore completed:** the tool exited cleanly, logged no errors, and
  rebuilt every index. Restores that "mostly worked" are failures.
- **Counts against a manifest:** at backup time, record the document count
  of every collection (and other facts, such as the newest `updatedAt`).
  After restoring, compare. A tolerance allows for writes during the dump;
  a missing collection or a large drop is a failure.
- **Checksums and invariants:** for data that should not change between
  backup and verification, MongoDB's `dbHash` command returns a hash per
  collection; for live data, check invariants instead: every task's
  `projectId` exists, no task has a null owner, totals reconcile.
- **Freshness:** the newest record should be no older than the RPO before
  the backup time. A backup of a stale replica passes every other check
  and still fails this one.
- **Smoke test:** start TaskFlow API against the restored data and run a
  few real requests. This catches missing indexes (timeouts), missing
  users, and schema mismatches.
- **Timing:** record the restore duration every time. It is your evidence
  for the RTO, and it grows with the data.

Handle the scratch environment as production data: same access controls,
encryption, region, and deletion after the test.

### Game days and DR drills

![Diagram: a cycle of five steps. 1 Plan: scenario, hypothesis, success criteria such as the RTO, blast radius, and abort plan. 2 Prepare: roles (IC, operators, observers), notify people, check access and tools. 3 Execute: inject the failure or start the restore, follow the runbook exactly, and timestamp every step. 4 Observe: measure the actual RTO and RPO, and note gaps, workarounds, and surprises. 5 Learn: blameless review, action items, update the runbook and DR plan, then schedule the next drill. Drill on a schedule: tabletop quarterly, restore monthly, regional failover yearly.](game-day-loop.svg)

Automated tests prove the data; **drills** prove the people and the
process. Types, from cheapest to most realistic:

- **Tabletop exercise:** the team walks through a scenario on paper ("the
  primary region is gone; what do we do first?") and finds gaps in
  knowledge and documentation. No systems are touched.
- **Component restore drill:** restore the production database to a
  point in time in a separate environment, following the runbook, as the
  on-call engineer would during an incident.
- **Failover drill (game day):** fail over a real service to the DR site,
  in staging or in production during a planned window, and measure the
  RTO end to end, including DNS, verification, and communication.
- **Chaos experiments:** deliberately inject failures (instance loss,
  network faults) with tools such as AWS Fault Injection Service to verify
  resilience continuously.

A good drill has a written plan: scenario, hypothesis ("we can restore
tier 0 data within 1 hour with less than 5 minutes of data loss"),
success criteria, blast radius limits, an abort condition, assigned
roles, and observers whose only job is to write down what happens and
when. Rotate who executes the runbook; a drill where the author runs it
proves little.

### Runbook structure

A **runbook** is a step-by-step procedure for a specific operational task,
written for someone competent but unfamiliar with this system, at 3 a.m.
A useful structure:

1. **Header:** purpose, scope, owner, last tested date and result,
   expected duration.
2. **When to use it:** symptoms or decisions that lead here, and when not
   to.
3. **Prerequisites:** access and roles, tools and versions, where
   credentials live, people to involve.
4. **Decision points:** explicit choices (restore to a new cluster or in
   place? which recovery time?) with guidance.
5. **Steps:** numbered, one action each, with copy-pasteable commands and
   the **expected output**.
6. **Verification:** how to know it worked.
7. **Rollback or abort:** how to stop safely at each stage.
8. **Communication:** who to update and when.
9. **After the procedure:** cleanup, follow-up tickets, postmortem.

Principles: commands use variables declared once at the top; steps are
safe to re-run where possible; dangerous steps are marked and require a
second person; the runbook lives somewhere available during an outage;
and it is updated after every use or drill.

### Measuring actual RTO and RPO

During a drill or real restore, the scribe records a timestamp at every
phase boundary:

```text
Drill: restore TaskFlow MongoDB to a point in time (tier 0, target RTO 60 min, RPO 5 min)

10:00  scenario announced (simulated: bad migration at 09:41)
10:06  decision made: PITR to 09:40:59 into a new cluster              decide:   6 min
10:31  restore finished on the new cluster                              restore: 25 min
10:44  verification passed (counts, invariants, smoke test)             verify:  13 min
10:52  application switched to the new cluster, error rate normal      switch:   8 min
                                                         measured RTO: 52 min  (target 60)
Newest restored write: 09:40:57; bad migration at 09:41:00   measured RPO:  3 s  (target 5 min)
Gaps found: restore role missing on one account (fixed during drill, +4 min); runbook step 7 unclear.
```

Trend these numbers across drills. A measured RTO that creeps toward the
target as data grows is an early warning that the strategy needs to
change before a real disaster proves it.

### Common restore failures

| Symptom during restore | Typical cause | Prevention |
|---|---|---|
| Access denied reading backups | Restore role or cross-account permission missing | Test the restore role in every drill; least privilege, but exercised |
| Decryption fails | KMS key disabled, deleted, or in another account | Key policies, deletion alerts, documented key ownership |
| `mongorestore` errors on version or FCV | Restoring into a different major version | Pin restore environments to the source version |
| Restore takes hours longer than planned | Slow downloads, index rebuilds, cold storage retrieval | Measure in drills, keep recent backups in fast storage, prefer physical backups for large data |
| Data restored but app fails | Missing users, roles, indexes, config, or secrets | Back up and restore those too; smoke test |
| PITR stops early | Gap in oplog or WAL archive | Monitor archiving and the oplog window |
| Wrong data restored | Wrong backup chosen, time zone mistakes in the target time | Use UTC everywhere; verification step compares with expectations |
| Restore overwrote good data | Restored in place instead of side by side | Restore to a new cluster first, then copy back or switch |

## When to use and when not to use

| Test type | Use for | Frequency |
|---|---|---|
| Automated restore verification | Every tier 0 and tier 1 data store | Weekly (daily for the most critical) |
| Integrity checks | All backup repositories | Daily or weekly |
| Tabletop exercise | New DR plans, new team members, after architecture changes | Quarterly |
| Component restore drill | Database and storage recovery procedures | Monthly to quarterly |
| Regional failover drill | Pilot light, warm standby, active/active | At least yearly, ideally quarterly |
| Chaos experiments in production | Mature teams with good observability and guardrails | Continuous, in limited blast radius |

Do not run production failover drills without an abort plan, monitoring,
and stakeholder notice, and do not let restore tests touch production
data stores: they write to scratch environments only.

## Practical examples

### Recording a manifest at backup time

```bash
# scripts/mongo-manifest.sh: run right after the dump; stored next to the archive
# STAMP is the same UTC timestamp the backup script used in the archive name
set -euo pipefail
STAMP="${STAMP:?set STAMP to the archive timestamp, e.g. 2026-11-12T020000Z}"
mongosh "$BACKUP_SOURCE_URI" --quiet --eval '
  const tf = db.getSiblingDB("taskflow");
  const counts = {};
  for (const name of tf.getCollectionNames()) {
    counts[name] = tf.getCollection(name).countDocuments({});
  }
  const newest = tf.tasks.find({}, { updatedAt: 1 }).sort({ updatedAt: -1 }).limit(1).toArray()[0];
  print(JSON.stringify({ takenAt: new Date(), counts, newestTaskUpdate: newest?.updatedAt ?? null }));
' > "manifest-${STAMP}.json"
aws s3 cp "manifest-${STAMP}.json" \
  "s3://taskflow-backups-example/mongodb/manifest-${STAMP}.json"
```

### An automated restore test

```bash
#!/usr/bin/env bash
# scripts/restore-test.sh: restore the latest backup into a scratch MongoDB and verify it
set -euo pipefail
START=$(date +%s)
BUCKET="s3://taskflow-backups-example/mongodb"
WORK="$(mktemp -d)"
trap 'docker rm -f restore-test >/dev/null 2>&1 || true; rm -rf "$WORK"' EXIT

# 1. Fetch the newest archive and its manifest (read-only role in the backup account)
LATEST=$(aws s3 ls "$BUCKET/" | awk '{print $4}' | grep '\.archive\.gz$' | sort | tail -n 1)
STAMP="${LATEST#taskflow-}"; STAMP="${STAMP%.archive.gz}"
aws s3 cp "$BUCKET/$LATEST" "$WORK/backup.archive.gz"
aws s3 cp "$BUCKET/manifest-${STAMP}.json" "$WORK/manifest.json"

# 2. Restore into a throwaway MongoDB pinned to the production major version
docker run -d --name restore-test -p 27018:27017 mongo:8.0 >/dev/null
until mongosh "mongodb://localhost:27018" --quiet --eval 'db.runCommand({ ping: 1 }).ok' >/dev/null 2>&1; do sleep 2; done
mongorestore --uri="mongodb://localhost:27018" --archive="$WORK/backup.archive.gz" --gzip --oplogReplay
RESTORE_SECONDS=$(( $(date +%s) - START ))

# 3. Verify counts, freshness, and invariants against the manifest
MANIFEST="$(cat "$WORK/manifest.json")" MAX_AGE_SECONDS=$(( 26 * 3600 )) \
  mongosh "mongodb://localhost:27018" --quiet --file scripts/verify-restore.js

# 4. Smoke test: run the API image against the restored data
docker run --rm --network host \
  -e MONGODB_URI="mongodb://localhost:27018/taskflow" -e NODE_ENV=restore-test \
  ghcr.io/example/taskflow-api:current npm run smoke-test

# 5. Report success and timing (picked up by Prometheus via the Pushgateway)
cat <<EOF | curl --fail --silent --data-binary @- \
  "http://pushgateway.monitoring.internal.example.com:9091/metrics/job/taskflow_restore_test"
# TYPE taskflow_last_successful_restore_timestamp_seconds gauge
taskflow_last_successful_restore_timestamp_seconds $(date +%s)
# TYPE taskflow_restore_duration_seconds gauge
taskflow_restore_duration_seconds ${RESTORE_SECONDS}
EOF
echo "restore test passed in ${RESTORE_SECONDS}s"
```

```js
// scripts/verify-restore.js: run by mongosh against the restored database
const manifest = JSON.parse(process.env.MANIFEST);
const maxAge = Number(process.env.MAX_AGE_SECONDS);
const tf = db.getSiblingDB("taskflow");
const failures = [];

// Counts: every collection present, within 0.5% of the manifest
for (const [name, expected] of Object.entries(manifest.counts)) {
  const actual = tf.getCollection(name).countDocuments({});
  const drift = expected === 0 ? actual : Math.abs(actual - expected) / expected;
  if (drift > 0.005) failures.push(`${name}: expected ~${expected}, got ${actual}`);
}

// Freshness: newest task update close to the backup time
const newest = tf.tasks.find({}, { updatedAt: 1 }).sort({ updatedAt: -1 }).limit(1).toArray()[0];
const ageSeconds = (new Date(manifest.takenAt) - newest.updatedAt) / 1000;
if (ageSeconds > maxAge) failures.push(`data is ${ageSeconds}s older than the backup time`);

// Invariants: no orphaned tasks, required indexes present
const orphans = tf.tasks.aggregate([
  { $lookup: { from: "projects", localField: "projectId", foreignField: "_id", as: "p" } },
  { $match: { p: { $size: 0 } } },
  { $count: "n" },
]).toArray()[0]?.n ?? 0;
if (orphans > 0) failures.push(`${orphans} tasks reference missing projects`);
const indexNames = tf.tasks.getIndexes().map((i) => i.name);
if (!indexNames.includes("userId_1_dueAt_1")) failures.push("index userId_1_dueAt_1 missing");

if (failures.length) {
  print("RESTORE VERIFICATION FAILED:\n- " + failures.join("\n- "));
  quit(1);
}
print("restore verification passed");
```

```yaml
# .github/workflows/restore-test.yml
name: weekly-restore-test
on:
  schedule:
    - cron: "0 6 * * 1" # Mondays 06:00 UTC
  workflow_dispatch: {}
permissions:
  id-token: write # OIDC to assume the read-only restore-test role
  contents: read
jobs:
  restore-test:
    runs-on: ubuntu-latest
    timeout-minutes: 120
    steps:
      - uses: actions/checkout@v7
      - uses: aws-actions/configure-aws-credentials@v6
        with:
          role-to-assume: arn:aws:iam::<backup-account-id>:role/taskflow-restore-test
          aws-region: us-east-1
      - name: Restore and verify the latest backup
        run: ./scripts/restore-test.sh
```

The script assumes `mongosh`, `mongorestore`, and Docker are available on
the runner (install them in an earlier step or use a prepared image), and
the API image provides a `smoke-test` script. An alert fires when
`time() - taskflow_last_successful_restore_timestamp_seconds` exceeds 8
days, so a broken pipeline is noticed even if nobody reads its logs, and a
dashboard shows `taskflow_restore_duration_seconds` against the RTO.

### A restore runbook for TaskFlow's MongoDB

```text
RUNBOOK: Restore TaskFlow MongoDB after data loss or corruption
Owner: tasks-team        Last tested: <date> (drill, measured RTO 52 min)     Expected duration: 45-75 min
Severity: SEV1/SEV2      Requires: incident commander + one operator + second person for step 8

WHEN TO USE
- Data was deleted or corrupted (bad migration, script, bug), or the cluster is unrecoverable.
- NOT for a single failed node or a primary election: the replica set handles those.

PREREQUISITES
- Roles: backup-restore role in the backup account; Atlas project owner (or PBM operator access).
- Tools: mongosh and MongoDB Database Tools matching the cluster's major version.
- Decide the recovery target time in UTC from logs/audit trail. Write it in the incident channel.

VARIABLES (set once)
  export TARGET_TIME="2026-11-10T14:30:59Z"     # one second before the damaging operation
  export RESTORE_CLUSTER="taskflow-restore-20261110"

DECISION 1: Scope
  a) Small, identifiable damage (one collection, some documents)  -> restore side by side, copy back  (steps 1-6, 9)
  b) Widespread corruption or cluster lost                         -> restore side by side, switch over (steps 1-5, 7-9)

STEPS
1. Freeze the damage: stop or disable the job/migration/feature that caused it. Confirm writes of bad data have stopped.
2. Announce: IC posts the plan, target time, and expected duration; comms lead updates the status page.
3. Create the restore target: a NEW cluster "$RESTORE_CLUSTER" in the same region and version as production.
   (Atlas: Backup > Restore > Point in Time > target $TARGET_TIME > restore to $RESTORE_CLUSTER.)
   (Self-managed with PBM: provision new replica set, then: pbm restore --time="${TARGET_TIME%Z}")
   Expected: restore job status "completed". Record the timestamp.
4. Verify the restored data:
   mongosh "$RESTORE_URI" --quiet --eval 'db.getSiblingDB("taskflow").tasks.find({}, {updatedAt: 1}).sort({updatedAt: -1}).limit(1)'
   Expected: the newest updatedAt is just before $TARGET_TIME. Run the invariant checks from scripts/verify-restore.js
   (orphans, required indexes) and spot-check that the damaged records are intact.
5. Smoke test: run the API smoke tests against "$RESTORE_URI". Expected: all pass.
6. (Scope a) Copy back: export only the affected documents from the restored cluster and import them into production,
   e.g. mongoexport --uri="$RESTORE_URI" --db=taskflow --collection=tasks --query='{"projectId": {"$oid": "<id>"}}' --out=fix.json
        mongoimport --uri="$PROD_URI" --db=taskflow --collection=tasks --mode=upsert --file=fix.json
   Then go to step 9.
7. (Scope b) Put the API in maintenance mode (feature flag "maintenance=on"); confirm writes stop.
8. (Scope b) SECOND PERSON REQUIRED. Update the MONGODB_URI secret to "$RESTORE_URI" and restart the API (rolling).
   Expected: /readyz healthy on all pods; error rate normal for 10 minutes. Disable maintenance mode.
   ABORT: revert the secret to the previous value and restart; production cluster is untouched until step 10.
9. Verify with users: check SLO dashboards, error tracker, and a sample of support tickets.
10. Afterwards: keep the damaged cluster read-only for 7 days for investigation, then delete it. Record measured RTO
    (start to step 8/9) and RPO (target time vs. damaging operation). Open the postmortem. Update this runbook.
```

The runbook uses one decision point to choose between copying back a few
documents (keeping good writes made after the target time) and switching
to the restored cluster (losing writes after it). Measured RTO and RPO go
into the drill log and the DR plan.

### A game day plan

```text
Game day: TaskFlow regional failover (staging), <date> 14:00-16:00 UTC
Hypothesis: with the pilot light design, staging recovers in the DR region within 60 minutes
            with no more than 1 minute of data loss.
Scenario:   block all traffic to the primary region's staging subnets (network ACL change).
Roles:      IC <name>; operators <name>, <name> (not the runbook authors); observers <name> (timeline);
            comms <name> (internal channel updates every 15 minutes).
Success:    API healthy in the DR region; synthetic checks green; RPO and RTO measured.
Abort if:   impact spreads beyond staging, or 120 minutes elapse; revert the ACL change.
Afterwards: blameless review within 3 days; action items in the backlog; runbook and DR plan updated.
```

## Best practices

- Treat a backup as valid only after a verified restore; track "last
  verified restore" per data store.
- Automate restore tests on a schedule, with counts, invariants,
  freshness, and an application smoke test.
- Record the restore duration every time and compare it with the RTO.
- Alert on the age of the last successful restore test, not only on backup
  jobs.
- Restore side by side, never over production, unless the runbook says
  otherwise for a reason.
- Write runbooks with copy-pasteable commands, expected outputs, decision
  points, and abort steps; keep them available during outages.
- Run drills with people who did not write the runbook, and rotate them.
- Use UTC for every timestamp in runbooks, logs, and recovery targets.
- Feed every drill's findings back into the runbook, DR plan, and backlog.

## In production

- **The restore test has been "green" for months, but it tests nothing.**
  *Detect:* reading the pipeline shows it only checks that a file exists
  in the bucket. *Cause:* verification stopped at level 1. *Fix:* restore
  the backup, run data validation and a smoke test, and fail on any
  mismatch.
- **A real restore takes six hours against a one-hour RTO.**
  *Detect:* the incident timeline shows hours of index builds after data
  loaded. *Cause:* restore duration was never measured as the data grew.
  *Fix:* track `restore_duration_seconds` from weekly tests, alert when it
  approaches the RTO, and move to physical backups or warm standby.
- **The on-call engineer cannot access the backups during an incident.**
  *Detect:* access denied in the backup account; the person with access is
  on holiday. *Cause:* the restore role was never exercised by on-call
  engineers. *Fix:* use the same role in automated tests, include access
  checks in drills, and document break-glass access.
- **The restored database is missing a collection.**
  *Detect:* verification reports a collection absent from the restore but
  present in production. *Cause:* the backup job lists collections or
  databases explicitly, and a new one was added later. *Fix:* back up
  everything by default, and compare the manifest with production's
  collection list.
- **A drill succeeded, but only because the author ran it.**
  *Detect:* a different engineer gets stuck at an ambiguous step. *Cause:*
  the runbook relies on unwritten knowledge. *Fix:* rotate operators,
  make observers note every question asked, and rewrite unclear steps.
- **Restoring to the wrong time destroys more data.**
  *Detect:* the restored data lacks records from the hour before the
  incident. *Cause:* the target time was given in local time and
  interpreted as UTC. *Fix:* UTC everywhere, an explicit variable in the
  runbook, and verification that compares the newest restored write with
  the intended target.

## Important terminology

- **Restore test:** Restoring a backup into a separate environment to
  prove it works.
- **Manifest:** Facts recorded at backup time (counts, newest timestamps)
  used to verify a restore.
- **Smoke test:** A small set of real requests that prove the application
  works on the restored data.
- **Runbook:** A step-by-step procedure for a specific operational task.
- **Game day:** A planned exercise that injects a failure to test systems
  and people.
- **Tabletop exercise:** A discussion-based walk-through of a scenario.
- **DR drill:** A rehearsal of the disaster recovery plan, measuring RTO
  and RPO.
- **Measured RTO / RPO:** Recovery time and data loss observed in a test,
  as opposed to targets.
- **Restore side by side:** Restoring into a new environment instead of
  over the original.
- **Break-glass access:** An emergency access path used only when normal
  access is unavailable.

## Common mistakes and misconceptions

- Equating "the backup job succeeded" with "we can restore".
- Testing only that backup files exist or decompress.
- Running restore tests against production clusters.
- Never timing restores, so the RTO is a guess.
- Runbooks without commands, expected outputs, or abort steps.
- Keeping runbooks only in systems that may be down during the incident.
- Letting only the runbook author run drills.
- Treating drills as pass or fail rather than as a source of improvements.
- Mixing time zones in recovery targets.

## Revision questions

1. Name five ways a backup can be unusable even though the backup job
   reported success.
2. Describe the levels of backup verification, and which ones a weekly
   automated restore test should cover.
3. Why record a manifest at backup time, and what should it contain for
   TaskFlow?
4. Why is a freshness check needed when counts already match?
5. In a drill, the decision took 9 minutes, the restore 31, verification
   14, and switching 6. The newest restored write was 2 minutes before the
   damaging operation. What are the measured RTO and RPO, and do they meet
   targets of 60 minutes and 5 minutes? (RTO 60 minutes, exactly at the
   target with no margin; RPO 2 minutes, within target.)
6. What are the main sections of a good runbook?
7. Why should restores normally happen side by side rather than in place?
8. Compare a tabletop exercise, a component restore drill, and a regional
   failover drill.

## Further learning

- [AWS Backup: Restore testing](https://docs.aws.amazon.com/aws-backup/latest/devguide/restore-testing.html)
- [AWS whitepaper: Testing disaster recovery](https://docs.aws.amazon.com/whitepapers/latest/disaster-recovery-workloads-on-aws/testing-disaster-recovery.html)
- [MongoDB: dbHash](https://www.mongodb.com/docs/manual/reference/command/dbHash/)
- [MongoDB Shell: Write scripts](https://www.mongodb.com/docs/mongodb-shell/write-scripts/)
- [Principles of Chaos Engineering](https://principlesofchaos.org/)
- [AWS Fault Injection Service](https://docs.aws.amazon.com/fis/latest/userguide/what-is.html)
- Next: [backups interview questions and answers](interview-questions-and-answers.md).
  Back to the [backups overview](../backups.md).
