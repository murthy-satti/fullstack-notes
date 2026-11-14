# Stateful Workloads and Jobs

Deployments assume every replica is interchangeable and disposable. Some
workloads are not like that: a database replica needs the same name and
the same disk every time it restarts, a migration should run once and
stop, a nightly report should run on a schedule, and a log agent should
run exactly once on every node. Kubernetes has a workload kind for each:
**StatefulSets**, **Jobs**, **CronJobs**, and **DaemonSets**.

This lesson covers StatefulSets (stable names, ordered rollout, one
volume per Pod), persistent storage (PersistentVolumes,
PersistentVolumeClaims, StorageClasses, dynamic provisioning, and access
modes), why many teams still run databases as managed services, Jobs
(completions, parallelism, retries, deadlines), CronJobs (schedules, time
zones, concurrency policies), and DaemonSets.

## Why it matters

Getting these wrong loses data or runs work the wrong number of times. A
database in a Deployment with a shared volume corrupts itself, or loses
everything when its Pod moves. Deleting a namespace with a `Delete`
reclaim policy destroys the disks behind it. A migration run from an init
container executes once per replica at the same moment. A CronJob that
overlaps itself sends every customer two emails. Choosing the right kind
and the right storage settings prevents all of these.

## Real-world usage

- **Google Cloud.** The article
  [To run or not to run a database on Kubernetes: What to consider](https://cloud.google.com/blog/products/databases/to-run-or-not-to-run-a-database-on-kubernetes-what-to-consider)
  compares fully managed databases, self-managed databases on VMs, and
  databases on Kubernetes, and explains that running them in a cluster
  means taking on operations such as backups, failover, and upgrades,
  often with an operator.
- **Kubernetes project.** The tutorial
  [Running ZooKeeper, a distributed system coordinator](https://kubernetes.io/docs/tutorials/stateful-application/zookeeper/)
  builds a replicated ensemble with a StatefulSet, a headless Service,
  per-Pod volumes, a PodDisruptionBudget, and anti-affinity, the same
  ingredients this page uses.
- **Kubernetes project.** The
  [CronJob](https://kubernetes.io/docs/concepts/workloads/controllers/cron-jobs/)
  documentation warns that a CronJob creates a Job approximately once per
  schedule time, so in rare cases two Jobs or none may be created, and
  that Jobs must therefore be idempotent.
- **CloudNativePG.** The [CloudNativePG](https://cloudnative-pg.io/)
  project is an example of a Kubernetes operator that manages PostgreSQL
  clusters (replication, failover, backups) on top of these primitives,
  the usual approach when teams do run databases inside Kubernetes.

**Popular tools and providers:** CSI drivers (AWS EBS, Google Persistent
Disk, Azure Disk, Ceph via Rook), VolumeSnapshots, Velero for cluster
backups, operators such as CloudNativePG, MongoDB's Kubernetes operators,
and Strimzi for Kafka, Argo Workflows for complex batch pipelines, and
managed databases such as MongoDB Atlas, Amazon RDS, and Cloud SQL.

## How it works

### StatefulSets

A StatefulSet manages Pods that need identity. Compared with a
Deployment, it guarantees:

- **Stable, ordinal names.** Pods are `mongo-0`, `mongo-1`, `mongo-2`,
  not random suffixes, and a replacement for `mongo-1` is again called
  `mongo-1`.
- **Stable network identity.** With a headless Service named in
  `serviceName`, each Pod gets a DNS record such as
  `mongo-0.mongo.taskflow.svc.cluster.local`, so peers and clients can
  address a specific replica.
- **Stable storage.** `volumeClaimTemplates` create one
  PersistentVolumeClaim per Pod (`data-mongo-0`, `data-mongo-1`, ...), and a
  rescheduled Pod reattaches the same claim.
- **Ordering.** With the default `podManagementPolicy: OrderedReady`,
  Pods are created one at a time in order (each waits for the previous to
  be Running and Ready) and removed in reverse order. `Parallel` drops the
  ordering when the application does not need it.

![Diagram: the StatefulSet mongo with 3 replicas, serviceName mongo, and a 10Gi volumeClaimTemplate named data works with the headless Service mongo (clusterIP None) that gives each Pod a DNS name such as mongo-0.mongo.taskflow.svc.cluster.local; Pods are created in order, mongo-0 first, mongo-1 after mongo-0 is Ready, and mongo-2 after mongo-1 is Ready; each Pod mounts its own PVC (data-mongo-0, data-mongo-1, data-mongo-2, 10Gi, ReadWriteOnce) bound to its own cloud disk PV in zones a, b, and c provisioned by CSI; a rescheduled mongo-1 keeps its name and reattaches data-mongo-1, scale-down removes mongo-2 first, and PVCs are kept by default.](statefulset-volumes.svg)

Updates use `updateStrategy`. `RollingUpdate` (the default) replaces Pods
one at a time in reverse ordinal order (`mongo-2` first), waiting for each
to be Ready; a `partition` value updates only Pods with an ordinal at or
above it, which allows staged rollouts. `OnDelete` updates a Pod only
when you delete it yourself.

By default, deleting or scaling down a StatefulSet **keeps** the PVCs, so
the data survives and comes back if you scale up again. The
`persistentVolumeClaimRetentionPolicy` field (`whenDeleted` and
`whenScaled`, each `Retain` or `Delete`) changes that.

A StatefulSet provides identity and storage, not clustering. Making
`mongo-1` a replica of `mongo-0`, electing a primary, and adding members
is the application's (or an operator's) job.

### Persistent storage: PV, PVC, and StorageClass

| Object | Who creates it | What it is |
|--------|----------------|------------|
| PersistentVolume (PV) | A provisioner (or an administrator) | A piece of real storage: a cloud disk, an NFS share; cluster-scoped |
| PersistentVolumeClaim (PVC) | The application | A request for storage: size, access mode, StorageClass; namespaced |
| StorageClass | The cluster administrator | A recipe: which CSI provisioner, disk type, reclaim policy, binding mode |

With **dynamic provisioning**, a new PVC that names a StorageClass makes
the CSI driver create a disk and a matching PV, and binds them. Key
StorageClass settings:

- `reclaimPolicy`: `Delete` (the disk is destroyed when the PVC is
  deleted; the default for dynamically provisioned volumes) or `Retain`
  (the disk is kept for manual recovery).
- `volumeBindingMode: WaitForFirstConsumer`: create the disk only when a
  Pod using the claim is scheduled, so the disk is created in that Pod's
  zone. With `Immediate`, a disk can land in a zone where the Pod cannot
  run.
- `allowVolumeExpansion: true`: lets you grow a claim by editing its size.

**Access modes** describe how a volume may be mounted:

| Mode | Meaning | Typical backing |
|------|---------|-----------------|
| `ReadWriteOnce` (RWO) | Read-write by Pods on a single node | Cloud block disks (EBS, Persistent Disk, Azure Disk) |
| `ReadWriteOncePod` (RWOP) | Read-write by a single Pod only | CSI block disks that support it |
| `ReadOnlyMany` (ROX) | Read-only by many nodes | Shared file systems, prepared images |
| `ReadWriteMany` (RWX) | Read-write by many nodes | NFS, EFS, Azure Files, CephFS |

Block disks are zonal: a Pod whose volume lives in zone a can only run on
nodes in zone a. Losing a zone therefore makes that replica unavailable
until the zone returns, which is why replicated databases spread replicas
(and their disks) across zones. **VolumeSnapshots** (`snapshot.storage.k8s.io/v1`)
take point-in-time copies through the CSI driver, a building block for
backups.

### Why many teams run databases as managed services

Kubernetes can run databases well, but the platform gives you only the
building blocks. Everything that makes a database production-grade is
still yours to build or install:

| Responsibility | Managed service (Atlas, RDS, Cloud SQL) | Operator on Kubernetes | Plain StatefulSet |
|----------------|------------------------------------------|------------------------|-------------------|
| Replication and failover | Provider | Operator | You |
| Backups and point-in-time recovery | Provider, configurable | Operator, configured by you | You |
| Version upgrades | Provider-assisted | Operator-assisted | You |
| Storage performance tuning | Provider | You (StorageClass, nodes) | You |
| Monitoring and alerting | Built in | You install it | You |
| Cost | Highest per unit | Cluster resources plus your time | Cluster resources plus most of your time |

Many teams therefore run stateless services in Kubernetes and keep the
primary database in a managed service, using StatefulSets for caches,
queues, development environments, or databases backed by a mature
operator and a team prepared to operate it. Backup and recovery planning
is covered in [backups](../backups.md) and
[disaster recovery, RPO, and RTO](../backups/disaster-recovery-rpo-and-rto.md).

### Jobs

A Job runs Pods until a given number of them **complete successfully**,
then stops.

| Field | Default | Meaning |
|-------|---------|---------|
| `completions` | 1 | Successful Pods required |
| `parallelism` | 1 | Pods running at the same time |
| `completionMode` | `NonIndexed` | `Indexed` gives each Pod an index (in `JOB_COMPLETION_INDEX`) so it can process its own shard |
| `backoffLimit` | 6 | Failed retries before the Job is marked failed |
| `activeDeadlineSeconds` | none | Fail the whole Job after this long, whatever the retries |
| `ttlSecondsAfterFinished` | none | Delete the finished Job (and its Pods) after this long |
| `podFailurePolicy` | none | Rules on exit codes or conditions: fail fast on a fatal code, ignore Pod disruptions |

The Pod template's `restartPolicy` must be `Never` (each failure creates a
new Pod, keeping the failed one for inspection) or `OnFailure` (the
container restarts in the same Pod). The Job controller recreates failed
Pods with an exponential back-off: 10 seconds, 20 seconds, 40 seconds,
and so on, capped at six minutes.

Good Job workloads: database migrations before a rollout, one-off data
fixes, batch processing, and sending a backlog of emails. Every Job
should be idempotent, because a node failure can make a Pod run its work
twice.

### CronJobs

A CronJob creates Jobs on a schedule written in standard five-field cron
syntax (`minute hour day-of-month month day-of-week`).

![Diagram: the CronJob task-digest runs on the schedule */15 * * * * in time zone Etc/UTC with concurrencyPolicy Forbid and a history of 3 succeeded and 1 failed Job; its jobTemplate sets completions 1, parallelism 1, backoffLimit 3, activeDeadlineSeconds 1800, ttlSecondsAfterFinished 86400, and restartPolicy Never; at 02:00 a Job is created whose first Pod exits 1 and whose retry after back-off exits 0, completing the Job; at 02:15 the run is skipped because the earlier Job is still running; at 02:30 a new Job is created and its Pod is running; failed Pods are retried with growing back-off until backoffLimit, and every run should be idempotent because schedules are approximately once.](cronjob-job-pod.svg)

| Field | Default | Meaning |
|-------|---------|---------|
| `schedule` | required | Cron expression, such as `0 2 * * *` for 02:00 daily |
| `timeZone` | the controller's time zone (usually UTC) | IANA time zone name such as `Europe/Berlin` |
| `concurrencyPolicy` | `Allow` | `Allow` overlapping runs, `Forbid` (skip the new run), or `Replace` (stop the old run) |
| `startingDeadlineSeconds` | none | Skip a run that could not start within this many seconds of its time |
| `successfulJobsHistoryLimit` / `failedJobsHistoryLimit` | 3 / 1 | Finished Jobs kept for inspection |
| `suspend` | `false` | Pause future runs without deleting the CronJob |

Set `timeZone` explicitly; otherwise schedules follow the control plane's
clock, which is usually UTC. Missed schedule times (while the controller
was down or the CronJob was suspended) never produce a backlog: the
controller starts at most one Job, for the most recent missed time, and
records a `TooManyMissedTimes` warning if more than 100 were missed.
Without `startingDeadlineSeconds` that late run starts immediately,
however late it is, so a sensible deadline is good practice.

### DaemonSets

A DaemonSet runs one Pod on every node (or every node matching a selector)
and adds a Pod automatically when a node joins. Typical uses are node-level
agents: log collectors, metrics exporters, CNI and CSI node plugins, and
security agents. DaemonSet Pods often need tolerations to run on tainted
nodes (including control plane nodes on self-managed clusters), host
paths to read node files, and modest resource requests because they run
on every node. Updates roll node by node, controlled by
`updateStrategy.rollingUpdate.maxUnavailable`.

### Choosing the workload kind

| Workload | Kind |
|----------|------|
| Stateless API or web app | Deployment |
| Replicated database, queue broker, or cache with per-replica data | StatefulSet (ideally through an operator) |
| Run once to completion | Job |
| Run on a schedule | CronJob |
| One Pod per node | DaemonSet |

## When to use and when not to use

Use StatefulSets when each replica needs its own identity and storage and
the software knows how to replicate itself. Do not use them to give a
stateless app a fixed name; use a Service. Do not run a production
primary database on a plain StatefulSet without backups, monitoring,
and a tested failover plan; prefer a managed service or an operator.

Use Jobs for finite work, and run database migrations as a Job before the
rollout rather than in init containers (which run once per replica, in
parallel). Use CronJobs for periodic work that tolerates the
"approximately once" guarantee; for work that must run exactly once,
add idempotency keys or a lock. Use DaemonSets only for genuinely per-node
work; a cluster-wide service belongs in a Deployment.

## Practical examples

### A StorageClass for SSD disks

```yaml
# k8s/storageclass-fast-ssd.yaml (AWS EBS CSI driver)
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: fast-ssd
provisioner: ebs.csi.aws.com
parameters:
  type: gp3
reclaimPolicy: Retain
volumeBindingMode: WaitForFirstConsumer
allowVolumeExpansion: true
```

On other clouds only the `provisioner` and `parameters` change (for
example `pd.csi.storage.gke.io` on GKE or `disk.csi.azure.com` on AKS).

### A MongoDB replica set for development and testing

```yaml
# k8s/mongo.yaml
apiVersion: v1
kind: Service
metadata:
  name: mongo
  namespace: taskflow
spec:
  clusterIP: None                 # headless: DNS returns Pod addresses
  selector:
    app.kubernetes.io/name: mongo
  ports:
    - name: mongo
      port: 27017
---
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: mongo
  namespace: taskflow
spec:
  serviceName: mongo
  replicas: 3
  selector:
    matchLabels:
      app.kubernetes.io/name: mongo
  template:
    metadata:
      labels:
        app.kubernetes.io/name: mongo
    spec:
      terminationGracePeriodSeconds: 30
      containers:
        - name: mongo
          image: mongo:8.0
          args: ["--replSet", "rs0", "--bind_ip_all"]
          ports:
            - name: mongo
              containerPort: 27017
          readinessProbe:
            exec:
              command: ["mongosh", "--quiet", "--eval", "db.adminCommand('ping').ok"]
            periodSeconds: 10
            timeoutSeconds: 5
          resources:
            requests:
              cpu: 250m
              memory: 1Gi
            limits:
              memory: 1Gi
          volumeMounts:
            - name: data
              mountPath: /data/db
  volumeClaimTemplates:
    - metadata:
        name: data
      spec:
        accessModes: ["ReadWriteOnce"]
        storageClassName: fast-ssd
        resources:
          requests:
            storage: 10Gi
```

```bash
kubectl apply -f k8s/mongo.yaml
kubectl -n taskflow rollout status statefulset/mongo
kubectl -n taskflow get pods,pvc -l app.kubernetes.io/name=mongo

# One-time replica set initialization
kubectl -n taskflow exec mongo-0 -- mongosh --quiet --eval '
rs.initiate({
  _id: "rs0",
  members: [
    { _id: 0, host: "mongo-0.mongo.taskflow.svc.cluster.local:27017" },
    { _id: 1, host: "mongo-1.mongo.taskflow.svc.cluster.local:27017" },
    { _id: 2, host: "mongo-2.mongo.taskflow.svc.cluster.local:27017" }
  ]
})'
```

The TaskFlow API then connects with
`mongodb://mongo-0.mongo.taskflow.svc.cluster.local:27017,mongo-1.mongo.taskflow.svc.cluster.local:27017,mongo-2.mongo.taskflow.svc.cluster.local:27017/taskflow?replicaSet=rs0`,
and the driver discovers which member is primary. This setup has no
authentication, backups, or anti-affinity: it is fine for a development
cluster, and exactly the work an operator or a managed service does for
you in production.

### A migration Job run before the rollout

```yaml
# k8s/migrate-job.yaml (the CI pipeline sets a unique name per release)
apiVersion: batch/v1
kind: Job
metadata:
  name: taskflow-migrate-1-5-0
  namespace: taskflow
spec:
  backoffLimit: 2
  activeDeadlineSeconds: 600
  ttlSecondsAfterFinished: 86400
  template:
    spec:
      restartPolicy: Never
      containers:
        - name: migrate
          image: ghcr.io/example/taskflow-api:1.5.0
          command: ["node", "dist/migrate.js"]
          env:
            - name: MONGODB_URI
              valueFrom:
                secretKeyRef:
                  name: taskflow-api-secrets
                  key: mongodb-uri
```

```bash
kubectl apply -f k8s/migrate-job.yaml
kubectl -n taskflow wait --for=condition=complete job/taskflow-migrate-1-5-0 --timeout=10m
kubectl -n taskflow logs job/taskflow-migrate-1-5-0
# only then: update the Deployment image
```

The pipeline waits for the Job to complete before rolling out the new
API version. Migrations must stay compatible with the version still
running during the rollout; see
[zero-downtime database migrations](../deployment-strategies/zero-downtime-database-migrations.md).

### A CronJob for the daily digest

```yaml
# k8s/digest-cronjob.yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: task-digest
  namespace: taskflow
spec:
  schedule: "0 7 * * *"
  timeZone: Europe/Berlin
  concurrencyPolicy: Forbid
  startingDeadlineSeconds: 600
  successfulJobsHistoryLimit: 3
  failedJobsHistoryLimit: 1
  jobTemplate:
    spec:
      backoffLimit: 3
      activeDeadlineSeconds: 1800
      template:
        spec:
          restartPolicy: Never
          containers:
            - name: digest
              image: ghcr.io/example/taskflow-api:1.5.0
              command: ["node", "dist/jobs/send-digest.js"]
              env:
                - name: MONGODB_URI
                  valueFrom:
                    secretKeyRef:
                      name: taskflow-api-secrets
                      key: mongodb-uri
```

```bash
kubectl -n taskflow get cronjob task-digest
kubectl -n taskflow create job --from=cronjob/task-digest digest-manual-test   # run it now
kubectl -n taskflow get jobs --watch
```

The digest script should record which users already received today's
email, so a retried or duplicated run sends nothing twice.

### An Indexed Job that processes shards in parallel

```yaml
# k8s/reindex-job.yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: reindex-tasks
  namespace: taskflow
spec:
  completions: 8
  parallelism: 4
  completionMode: Indexed
  backoffLimit: 4
  template:
    spec:
      restartPolicy: Never
      containers:
        - name: reindex
          image: ghcr.io/example/taskflow-api:1.5.0
          command: ["node", "dist/jobs/reindex.js"]
          env:
            - name: SHARD_COUNT
              value: "8"
            # JOB_COMPLETION_INDEX (0-7) is set automatically for Indexed Jobs
```

Four Pods run at a time; the Job completes when each index from 0 to 7 has
succeeded once.

### A DaemonSet for a node metrics agent

```yaml
# k8s/node-exporter.yaml
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: node-exporter
  namespace: monitoring
spec:
  selector:
    matchLabels:
      app.kubernetes.io/name: node-exporter
  template:
    metadata:
      labels:
        app.kubernetes.io/name: node-exporter
    spec:
      hostNetwork: true
      hostPID: true
      tolerations:
        - operator: Exists          # run on every node, including tainted ones
      containers:
        - name: node-exporter
          image: quay.io/prometheus/node-exporter:v1.9.1
          args:
            - --path.procfs=/host/proc
            - --path.sysfs=/host/sys
          ports:
            - name: metrics
              containerPort: 9100
          resources:
            requests:
              cpu: 50m
              memory: 64Mi
            limits:
              memory: 128Mi
          volumeMounts:
            - name: proc
              mountPath: /host/proc
              readOnly: true
            - name: sys
              mountPath: /host/sys
              readOnly: true
      volumes:
        - name: proc
          hostPath:
            path: /proc
        - name: sys
          hostPath:
            path: /sys
```

In practice you would install this with the Prometheus community Helm
chart, which adds security settings and a Service for scraping; the
structure is the same.

## Best practices

- Prefer managed databases for primary data; use operators when you run
  databases in Kubernetes.
- Use `WaitForFirstConsumer` StorageClasses for zonal disks and
  `allowVolumeExpansion` so volumes can grow.
- Use `reclaimPolicy: Retain` for valuable data, and back it up with
  snapshots or the database's own tools; test restores.
- Spread StatefulSet replicas across zones with topology spread
  constraints or anti-affinity, and protect them with a PDB.
- Run migrations as a Job that the pipeline waits for, not in init
  containers.
- Make every Job and CronJob idempotent; set `backoffLimit`,
  `activeDeadlineSeconds`, and `ttlSecondsAfterFinished`.
- Set `timeZone`, `concurrencyPolicy`, and `startingDeadlineSeconds` on
  every CronJob.
- Give DaemonSets small requests, read-only host mounts, and only the
  tolerations they need.

## In production

- **A StatefulSet Pod stays `Pending` after a node failure.**
  *Detect:* events show `volume node affinity conflict` or `didn't match
  PersistentVolume's node affinity`. *Cause:* its disk lives in a zone with
  no available node. *Fix:* make sure every zone has capacity (node
  autoscaling per zone), spread replicas across zones, and rely on the
  database's replication while the zone is down.
- **A database volume fills up.**
  *Detect:* `kubectl exec ... -- df -h /data/db` near 100%, and database
  write errors. *Cause:* the claim was sized for an earlier data volume.
  *Fix:* raise `spec.resources.requests.storage` on the PVC (with
  `allowVolumeExpansion: true`), and alert on volume usage well before it
  is full.
- **Data disappears after a namespace was deleted.**
  *Detect:* PVs from the namespace are gone, and the cloud console shows
  the disks deleted. *Cause:* the StorageClass used `reclaimPolicy:
  Delete`. *Fix:* use `Retain` for important data, protect production
  namespaces from deletion, and keep backups outside the cluster.
- **Customers receive the daily email twice.**
  *Detect:* two Jobs for the same schedule time overlap in
  `kubectl get jobs`. *Cause:* `concurrencyPolicy: Allow` with a slow run,
  or a retried Pod that had already sent emails. *Fix:* `Forbid`, and
  idempotent sending that records what was sent.
- **A CronJob silently stops creating Jobs.**
  *Detect:* `kubectl get jobs` shows one Job from the CronJob still active
  hours or days later, and no newer runs. *Cause:* `concurrencyPolicy:
  Forbid` skips every new run while that Job is active, and a hung Pod
  with no `activeDeadlineSeconds` never ends. *Fix:* set
  `activeDeadlineSeconds` in the job template, delete the stuck Job, and
  alert when a CronJob's last successful run is too old.
- **A Job never completes although its work finished.**
  *Detect:* the main container is `Completed` but the Pod stays `Running`
  because a sidecar is still up. *Cause:* a regular sidecar container keeps
  the Pod alive. *Fix:* declare the sidecar as a native sidecar (an init
  container with `restartPolicy: Always`), which stops after the main
  container exits.
- **A StatefulSet rollout is stuck.**
  *Detect:* `kubectl rollout status statefulset/mongo` waits on `mongo-2`,
  which is not Ready. *Cause:* with ordered updates, the controller waits
  for each Pod before continuing, and the new version fails its readiness
  check. *Fix:* inspect and fix that Pod (or roll the template back), then
  delete it so it is recreated from the corrected template.

## Important terminology

- **StatefulSet:** A workload with stable Pod names, network identities,
  and per-Pod storage.
- **Headless Service:** A Service with `clusterIP: None` whose DNS returns
  the individual Pod addresses.
- **volumeClaimTemplates:** The PVC template a StatefulSet stamps out once
  per Pod.
- **PersistentVolume / PersistentVolumeClaim:** A piece of storage, and a
  request that binds to one.
- **StorageClass:** The provisioner and parameters used to create volumes
  dynamically.
- **Dynamic provisioning:** Creating a disk automatically when a claim
  needs one.
- **Access mode:** How a volume may be mounted (RWO, RWOP, ROX, RWX).
- **Reclaim policy:** What happens to a volume when its claim is deleted
  (`Delete` or `Retain`).
- **Job:** Runs Pods until a number of them complete successfully.
- **CronJob:** Creates Jobs on a cron schedule.
- **DaemonSet:** Runs one Pod per node.
- **Operator:** A controller that encodes the operational knowledge for a
  piece of software, such as a database.

## Common mistakes and misconceptions

- Running a database in a Deployment, or sharing one RWO volume between
  replicas.
- Believing a StatefulSet makes software clustered or highly available by
  itself.
- Using `Immediate` binding with zonal disks and getting volumes in the
  wrong zone.
- Relying on the default `Delete` reclaim policy for important data.
- Running migrations in init containers.
- Assuming CronJobs run exactly once and never overlap.
- Leaving finished Jobs to accumulate forever.
- Using a DaemonSet for a service that does not need to run on every
  node.

## Revision questions

1. Which three guarantees does a StatefulSet give that a Deployment does
   not?
2. What is the DNS name of the second replica of the StatefulSet `mongo`
   in namespace `taskflow`, and what makes it resolvable?
3. Why does `volumeBindingMode: WaitForFirstConsumer` matter for zonal
   disks?
4. Compare the RWO, RWOP, ROX, and RWX access modes with a typical backing
   store for each.
5. A Job has `completions: 12` and `parallelism: 3`, and each Pod takes
   5 minutes with no failures. Roughly how long does the Job take?
6. Why should migrations run as a Job rather than an init container?
7. A CronJob runs every 10 minutes, but one run takes 25 minutes. What
   happens under `Allow`, `Forbid`, and `Replace`?
8. List three responsibilities you take on when you run a database on a
   StatefulSet instead of a managed service.

## Further learning

- [Kubernetes documentation: StatefulSets](https://kubernetes.io/docs/concepts/workloads/controllers/statefulset/)
- [Kubernetes documentation: Persistent volumes](https://kubernetes.io/docs/concepts/storage/persistent-volumes/)
- [Kubernetes documentation: Storage classes](https://kubernetes.io/docs/concepts/storage/storage-classes/)
- [Kubernetes documentation: Jobs](https://kubernetes.io/docs/concepts/workloads/controllers/job/)
- [Kubernetes documentation: DaemonSet](https://kubernetes.io/docs/concepts/workloads/controllers/daemonset/)
- [Kubernetes documentation: Volume snapshots](https://kubernetes.io/docs/concepts/storage/volume-snapshots/)
- Next: [Kubernetes interview questions and answers](interview-questions-and-answers.md).
  Back to the [Kubernetes overview](../kubernetes.md).
