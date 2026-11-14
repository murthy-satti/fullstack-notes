# Health Probes and Rolling Updates

Kubernetes can only keep an application available if it knows two
things about each Pod: whether it can take traffic right now, and whether
it is broken beyond repair. Health probes answer those questions. Rolling
updates then use the answers to replace Pods a few at a time, and
graceful termination makes sure the Pods being replaced finish their work
before they disappear.

This lesson covers liveness, readiness, and startup probes and exactly
what each failure does, how to design probes that do not cause outages,
the rolling update parameters `maxSurge` and `maxUnavailable` with a
worked example, the full Pod termination sequence (endpoint removal,
`preStop`, `SIGTERM`, the grace period, `SIGKILL`), PodDisruptionBudgets,
and the `kubectl rollout` commands for watching and undoing a release.

## Why it matters

Most deploy-time errors in Kubernetes come from these settings, not from
the code being deployed. Without a readiness probe, new Pods receive
traffic before they can serve it. Without graceful termination, every
deploy cuts off in-flight requests and clients see 502 errors. A liveness
probe that checks the database turns a short database outage into every
API Pod restarting at once. A PodDisruptionBudget that allows no
disruption blocks node upgrades indefinitely.

Done well, the same settings give you zero-downtime deploys, automatic
removal of unhealthy instances from load balancing, and rollouts that stop
themselves when the new version is broken.

## Real-world usage

- **Google Cloud.** The article
  [Kubernetes best practices: Setting up health checks with readiness and liveness probes](https://cloud.google.com/blog/products/containers-kubernetes/kubernetes-best-practices-setting-up-health-checks-with-readiness-and-liveness-probes)
  explains the difference between the two probes, why liveness probes
  need a generous initial delay or a startup phase, and how misconfigured
  probes cause restart loops.
- **Google Cloud.** The companion article
  [Kubernetes best practices: terminating with grace](https://cloud.google.com/blog/products/containers-kubernetes/kubernetes-best-practices-terminating-with-grace)
  walks through the termination sequence: the Terminating state, the
  `preStop` hook, `SIGTERM`, the grace period, and `SIGKILL`.
- **Learnk8s.** The guide
  [Graceful shutdown and zero downtime deployments in Kubernetes](https://learnk8s.io/graceful-shutdown)
  shows that endpoint removal and `SIGTERM` happen in parallel, so an app
  can receive new requests after it was told to stop, and recommends
  waiting briefly before shutting down.
- **Google SRE.** The workbook chapter
  [Canarying releases](https://sre.google/workbook/canarying-releases/)
  describes releasing to a small part of the fleet first and judging it by
  health signals, the same idea that `maxSurge`, readiness gates, and
  progress deadlines automate in a rolling update.

**Popular tools and providers:** `kubectl rollout`, Argo Rollouts and
Flagger for canary and blue-green releases, Helm's `--wait`, the
PodDisruptionBudget API, and cluster upgrade tooling that drains nodes
respecting those budgets.

## How it works

### Three probes, three different questions

![Diagram: three probes compared; startupProbe asks whether the app has finished starting, and its first success hands over to the liveness and readiness probes while failureThreshold failures (failureThreshold times periodSeconds) make the kubelet kill and restart the container; readinessProbe asks whether the Pod can serve traffic now, success marks the endpoint ready and failure removes it from load balancing without a restart; livenessProbe asks whether the container is stuck, success changes nothing, and failure makes the kubelet kill and restart the container, leading to CrashLoopBackOff if repeated; over time the startup probe runs until its first success and then readiness and liveness run every periodSeconds for the Pod's whole life.](probe-outcomes.svg)

| Probe | Question | On repeated failure | Runs |
|-------|----------|--------------------|------|
| `startupProbe` | Has the app finished starting? | Container killed and restarted | From container start until its first success |
| `readinessProbe` | Can this Pod take traffic now? | Endpoint marked not ready: no new traffic; **no restart** | For the container's whole life |
| `livenessProbe` | Is the process stuck beyond self-recovery? | Container killed and restarted | For the container's whole life, after startup succeeds |

A Pod with no probes is considered ready as soon as its containers start,
and it is restarted only if its process exits.

Each probe uses one mechanism: `httpGet` (status 200 to 399 is success),
`tcpSocket` (the port accepts a connection), `exec` (a command exits with
0), or `grpc` (the standard gRPC health checking protocol). And each has
the same timing fields:

| Field | Default | Meaning |
|-------|---------|---------|
| `initialDelaySeconds` | 0 | Wait before the first probe |
| `periodSeconds` | 10 | Time between probes |
| `timeoutSeconds` | 1 | A probe slower than this counts as a failure |
| `failureThreshold` | 3 | Consecutive failures before acting |
| `successThreshold` | 1 | Consecutive successes to count as healthy again (must be 1 for liveness and startup) |

The arithmetic matters. A liveness probe with the defaults restarts a
container after about 30 seconds of failures (3 × 10 s). A startup probe
with `periodSeconds: 10` and `failureThreshold: 30` allows up to 300
seconds to start, while the liveness probe stays disabled; the moment
startup succeeds, liveness takes over with its own short threshold. That
is far better than a large `initialDelaySeconds` on the liveness probe,
which delays failure detection forever after.

### Designing probes that do not cause outages

- **Liveness must not depend on other services.** If `/healthz` checks
  MongoDB and MongoDB has a two-minute outage, every API Pod fails
  liveness and restarts, losing caches and connections, and all of them
  reconnect at once when MongoDB returns. Liveness should answer only
  "is this process able to respond at all?" For Node.js, a cheap HTTP
  handler on the same event loop already detects a blocked or deadlocked
  loop.
- **Readiness reflects this instance's ability to serve.** Good checks:
  startup work finished, the app's own connection pool is established, the
  process is not shutting down. Be careful with shared dependencies: if
  every replica fails readiness because of one external service, all
  endpoints disappear together. Often it is better to stay ready and
  return fast errors (with a circuit breaker) than to vanish from the load
  balancer.
- **Keep probes cheap and give them time.** The default one-second
  timeout is easy to exceed under CPU throttling or a garbage-collection
  pause, which turns load into restarts and more load. Use a few seconds
  of timeout and a failure threshold that tolerates a blip.
- **Use a startup probe for slow starters** (migrations, cache warming,
  JIT-heavy runtimes) instead of stretching liveness timing.
- **Fail readiness during shutdown.** Flipping `/readyz` to 503 on
  `SIGTERM` is a cheap extra safety net beside the `preStop` delay.

### Rolling updates

A Deployment's default strategy, `RollingUpdate`, replaces Pods gradually
by scaling a new ReplicaSet up and the old one down, within two limits:

- **`maxSurge`**: how many Pods may exist above `replicas` during the
  update. Percentages round **up**.
- **`maxUnavailable`**: how many Pods may be unavailable below `replicas`.
  Percentages round **down**.

Both default to 25%. The alternative strategy, `Recreate`, deletes all old
Pods before creating new ones: downtime, but never two versions at once.

Worked example with 4 replicas: `maxSurge` = 25% of 4 = 1, and
`maxUnavailable` = 25% of 4 = 1. So at most 5 Pods exist and at least 3
are available at every moment.

![Diagram: a rolling update of 4 replicas with maxSurge 1 and maxUnavailable 1, so at most 5 Pods and at least 3 available; step 0 has four ready v1 Pods; step 1 starts one v2 and stops one v1, leaving 3 available; steps 2 to 4 each make one more v2 ready, start another v2, and stop another v1, always keeping 3 available; step 5 has four ready v2 Pods; a v2 Pod counts only after its readiness probe passes and minReadySeconds elapse, so a v2 that never becomes ready stops the rollout at step 1 with three v1 Pods serving.](rolling-update-steps.svg)

The key word is **available**: a new Pod counts only after its readiness
probe passes and it has stayed ready for `minReadySeconds` (default 0).
That is what makes rolling updates safe. If version 2 never becomes
ready, the controller cannot remove more old Pods, and the rollout stalls
with three old Pods still serving. After `progressDeadlineSeconds`
(default 600) without progress, the Deployment's `Progressing` condition
becomes `False` with reason `ProgressDeadlineExceeded`. Kubernetes does
not roll back automatically; your pipeline or `kubectl rollout undo` must.

| Settings | Behaviour | Needs |
|----------|-----------|-------|
| `maxSurge: 25%`, `maxUnavailable: 25%` (default) | Balanced speed and capacity | Some spare room |
| `maxSurge: 1`, `maxUnavailable: 0` | Never below full capacity; one extra Pod at a time | Room for one extra Pod |
| `maxSurge: 0`, `maxUnavailable: 1` | No extra Pods; capacity dips by one | No spare room |
| `maxSurge: 100%`, `maxUnavailable: 0` | Full new set first, then old removed | Double capacity briefly |

### Graceful termination

Every rolling update deletes old Pods, so how a Pod stops matters as much
as how a new one starts. When a Pod is deleted:

![Diagram: at 0 seconds the Pod is deleted and marked Terminating; in parallel, its endpoint is removed from EndpointSlices and kube-proxy and ingress controllers update within roughly 1 to 2 seconds, after which no new connections arrive, while the kubelet runs a preStop sleep of 5 seconds during which the container keeps serving; at 5 seconds SIGTERM arrives, the app drains in-flight requests and exits 0 at about 7 seconds; terminationGracePeriodSeconds of 30 seconds counts from deletion and includes the preStop hook, and SIGKILL would arrive at 30 seconds if the container were still running.](pod-termination-timeline.svg)

1. The API server sets the Pod's `deletionTimestamp`; it shows as
   `Terminating`.
2. **In parallel**: the EndpointSlice controller marks the endpoint as
   terminating (not ready), and every node's kube-proxy and every ingress
   controller update their rules, which takes from milliseconds to a few
   seconds; and the kubelet starts shutting the Pod down.
3. The kubelet runs the container's **`preStop` hook**, if any, and waits
   for it.
4. The kubelet sends **`SIGTERM`** (or the image's `STOPSIGNAL`) to the
   container's main process.
5. The app stops accepting connections, finishes in-flight requests,
   closes pools, and exits.
6. If containers are still running when **`terminationGracePeriodSeconds`**
   (default 30) has elapsed, counted from step 1 and including the
   `preStop` time, the kubelet sends **`SIGKILL`**.

Because steps 2 and 3 race, an app that exits immediately on `SIGTERM`
can still receive requests from proxies that have not yet updated, and
those clients see connection errors. A short `preStop` sleep (5 to 10
seconds) keeps the app serving until the endpoint removal has spread.
Kubernetes has a built-in `sleep` action for this (enabled by default
since 1.30), so the image needs no `sleep` binary. The app's own shutdown
logic is the handler from
[writing production Dockerfiles](../docker/writing-production-dockerfiles.md),
and its total time must fit inside the grace period.

### PodDisruptionBudgets

Kubernetes distinguishes **voluntary** disruptions (draining a node for
an upgrade, the cluster autoscaler removing a node, an operator evicting
Pods) from **involuntary** ones (a node crashing, a kernel panic). A
**PodDisruptionBudget** (PDB) limits voluntary disruptions: the eviction
API refuses to evict a Pod if that would leave fewer than `minAvailable`
(or more than `maxUnavailable`) Pods of the selected set.

PDBs do not apply to a Deployment's own rolling update (that is governed
by `maxUnavailable`) and cannot prevent involuntary failures. A PDB that
allows zero disruptions (`minAvailable` equal to the replica count) blocks
node drains and cluster upgrades until someone intervenes. Setting
`unhealthyPodEvictionPolicy: AlwaysAllow` lets broken Pods be evicted even
when the budget is exhausted, so they cannot block a drain.

### Rollout commands

| Command | Use |
|---------|-----|
| `kubectl rollout status deploy/taskflow-api --timeout=5m` | Wait for a rollout; non-zero exit on failure or timeout (use in CI) |
| `kubectl rollout history deploy/taskflow-api` | List revisions and their change causes |
| `kubectl rollout undo deploy/taskflow-api` | Return to the previous revision |
| `kubectl rollout undo deploy/taskflow-api --to-revision=3` | Return to a specific revision |
| `kubectl rollout pause` / `resume` | Batch several changes into one rollout |
| `kubectl rollout restart deploy/taskflow-api` | Replace all Pods with the same template (picks up config changes) |

The `CHANGE-CAUSE` column in the history comes from the
`kubernetes.io/change-cause` annotation; set it in your pipeline when you
deploy (the old `--record` flag is deprecated).

## When to use and when not to use

| Workload | Probes | Strategy |
|----------|--------|----------|
| HTTP API (TaskFlow API) | Readiness on `/readyz`, liveness on cheap `/healthz`, startup if boot is slow | RollingUpdate with `maxUnavailable: 0` |
| Background worker (no port) | Liveness via `exec` or a small health port; readiness rarely needed | RollingUpdate |
| App that must never run two versions at once (incompatible migrations) | As above | `Recreate`, or better, make versions compatible |
| Very slow start (JVM, large caches) | Startup probe with a generous threshold | RollingUpdate with `minReadySeconds` |
| Batch Job | Usually none | Not a Deployment |

Do not add a liveness probe just because you can: if the process exits
when it breaks, the kubelet already restarts it. Add one when the app
can hang without exiting.

## Practical examples

### Probe endpoints in the API

```js
// src/health.js: liveness and readiness handlers for Express
import mongoose from "mongoose";

let shuttingDown = false;
export const markShuttingDown = () => { shuttingDown = true; };

// Liveness: the event loop responds. No dependency checks here.
export function healthz(_req, res) {
  res.status(200).send("ok");
}

// Readiness: this instance can serve right now.
export function readyz(_req, res) {
  const dbConnected = mongoose.connection.readyState === 1;
  if (shuttingDown || !dbConnected) {
    return res.status(503).send("not ready");
  }
  res.status(200).send("ready");
}
```

```js
// src/server.js (excerpt)
import { healthz, readyz, markShuttingDown } from "./health.js";

app.get("/healthz", healthz);
app.get("/readyz", readyz);

process.on("SIGTERM", () => {
  markShuttingDown();               // readiness fails from now on
  server.close(async () => {        // in-flight requests finish
    await mongoose.disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 20_000).unref();   // below the 30 s grace period
});
```

### Probes, rollout strategy, and termination in the Deployment

```yaml
# k8s/api-deployment.yaml (excerpt)
spec:
  replicas: 4
  minReadySeconds: 5
  progressDeadlineSeconds: 300
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  template:
    spec:
      terminationGracePeriodSeconds: 30
      containers:
        - name: api
          image: ghcr.io/example/taskflow-api:1.4.0
          ports:
            - name: http
              containerPort: 3000
          startupProbe:
            httpGet:
              path: /healthz
              port: http
            periodSeconds: 5
            failureThreshold: 24          # up to 120 s to start
          readinessProbe:
            httpGet:
              path: /readyz
              port: http
            periodSeconds: 5
            timeoutSeconds: 2
            failureThreshold: 2
          livenessProbe:
            httpGet:
              path: /healthz
              port: http
            periodSeconds: 10
            timeoutSeconds: 3
            failureThreshold: 3
          lifecycle:
            preStop:
              sleep:
                seconds: 5                # let endpoint removal propagate
```

The time budget adds up: 5 s of `preStop`, then up to 20 s of draining
before the app's own timer exits, which is safely below the 30-second
grace period. With `maxSurge: 1` and `maxUnavailable: 0`, capacity never
drops below four ready Pods during a release. On clusters older than
1.30, replace the `sleep` action with `exec: {command: ["sleep", "5"]}`,
which requires a `sleep` binary in the image.

### Releasing and rolling back

```bash
# Deploy a new version (normally done by CI or GitOps)
kubectl -n taskflow set image deploy/taskflow-api api=ghcr.io/example/taskflow-api:1.5.0
kubectl -n taskflow annotate deploy/taskflow-api \
  kubernetes.io/change-cause="release 1.5.0" --overwrite

# Wait for it; roll back automatically if it does not complete
kubectl -n taskflow rollout status deploy/taskflow-api --timeout=5m \
  || kubectl -n taskflow rollout undo deploy/taskflow-api

kubectl -n taskflow rollout history deploy/taskflow-api
kubectl -n taskflow get deploy taskflow-api \
  -o jsonpath='{.status.conditions[?(@.type=="Progressing")].reason}'
```

### A PodDisruptionBudget

```yaml
# k8s/api-pdb.yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: taskflow-api
  namespace: taskflow
spec:
  maxUnavailable: 1
  unhealthyPodEvictionPolicy: AlwaysAllow
  selector:
    matchLabels:
      app.kubernetes.io/name: taskflow-api
```

```bash
kubectl -n taskflow get pdb taskflow-api
# NAME           MIN AVAILABLE   MAX UNAVAILABLE   ALLOWED DISRUPTIONS   AGE
# taskflow-api   N/A             1                 1                     2d
```

`maxUnavailable: 1` lets node drains proceed one API Pod at a time,
however many replicas the autoscaler has added.

## Best practices

- Give every serving container a readiness probe; add a liveness probe
  only for failure modes where the process hangs without exiting.
- Keep liveness checks local and cheap; never check databases or other
  services from liveness.
- Use startup probes for slow starts instead of long liveness delays.
- Use timeouts of a few seconds and failure thresholds that tolerate a
  blip.
- Handle `SIGTERM`: fail readiness, stop accepting, drain, close pools,
  exit well within the grace period.
- Add a short `preStop` sleep so endpoint removal finishes before
  shutdown begins.
- Use `maxUnavailable: 0` for user-facing services when capacity allows,
  and set `minReadySeconds` and a realistic `progressDeadlineSeconds`.
- Fail the pipeline on `kubectl rollout status` timeouts and roll back.
- Give multi-replica services a PDB that allows at least one disruption.

## In production

- **Every API Pod restarts during a database outage.**
  *Detect:* `RESTARTS` climbs on all Pods at the same time, and
  `kubectl describe pod` shows `Liveness probe failed: HTTP probe failed
  with statuscode: 503` while MongoDB is down. *Cause:* the liveness
  endpoint checks the database. *Fix:* make liveness local only; reflect
  dependency trouble in readiness or in request errors.
- **Clients see 502 errors during every deploy.**
  *Detect:* ingress or load balancer logs show upstream connection
  refused or reset errors only while a rollout runs. *Cause:* Pods exit as
  soon as they get `SIGTERM`, before every proxy has removed them, or
  in-flight requests are cut. *Fix:* a `preStop` sleep, a `SIGTERM`
  handler that drains, and a grace period longer than both.
- **A rollout hangs at "1 of 4 updated replicas are available".**
  *Detect:* `kubectl rollout status` waits, the new Pods are `Running` but
  `0/1` ready, and the Deployment eventually reports
  `ProgressDeadlineExceeded`. *Cause:* the new version fails its
  readiness probe (bad config, missing Secret key, a probe path that
  changed). *Fix:* read `kubectl describe pod` and the logs, then
  `kubectl rollout undo`; automate the undo in CI.
- **Slow-starting Pods are killed in a loop.**
  *Detect:* `CrashLoopBackOff` with `Liveness probe failed` events in the
  first minute, especially after adding startup work. *Cause:* liveness
  starts before the app can answer. *Fix:* add a startup probe whose
  `failureThreshold × periodSeconds` covers the worst-case start time.
- **Liveness failures under peak load make things worse.**
  *Detect:* restarts correlate with traffic peaks and CPU throttling;
  probe events show `context deadline exceeded`. *Cause:* a one-second
  probe timeout on a busy process. *Fix:* raise `timeoutSeconds` and
  `failureThreshold`, keep the handler trivial, and give the container
  enough CPU.
- **A node drain never finishes.**
  *Detect:* `kubectl drain` repeats `Cannot evict pod as it would violate
  the pod's disruption budget`. *Cause:* `minAvailable` equals the replica
  count, or some Pods are unhealthy and the budget is already used up.
  *Fix:* use `maxUnavailable: 1`, add replicas, and set
  `unhealthyPodEvictionPolicy: AlwaysAllow`.
- **New Pods stay `Pending` during a rollout.**
  *Detect:* the surge Pod reports `0/3 nodes are available: Insufficient
  cpu`. *Cause:* `maxSurge` needs spare capacity that does not exist.
  *Fix:* a cluster autoscaler, smaller requests, or `maxSurge: 0` with
  `maxUnavailable: 1`.

## Important terminology

- **Liveness probe:** Decides whether to restart a container.
- **Readiness probe:** Decides whether a Pod receives Service traffic.
- **Startup probe:** Protects slow-starting containers; disables the other
  probes until it succeeds.
- **Rolling update:** Replacing Pods gradually by scaling a new
  ReplicaSet up and the old one down.
- **`maxSurge` / `maxUnavailable`:** The limits on extra Pods and missing
  available Pods during a rolling update.
- **`minReadySeconds`:** How long a Pod must stay ready before it counts
  as available.
- **Progress deadline:** The time after which a stalled rollout is marked
  as failed.
- **`preStop` hook:** An action the kubelet runs before sending
  `SIGTERM`.
- **Termination grace period:** The total time between deletion and
  `SIGKILL`.
- **PodDisruptionBudget:** A limit on voluntary evictions for a set of
  Pods.
- **CrashLoopBackOff:** The state of a container that keeps failing and is
  restarted with increasing delays.

## Common mistakes and misconceptions

- Checking dependencies in liveness probes.
- Using the same aggressive settings for liveness as for readiness.
- Expecting a failing readiness probe to restart the container.
- Using a long `initialDelaySeconds` instead of a startup probe.
- Exiting immediately on `SIGTERM` without a `preStop` delay.
- Setting a `preStop` sleep longer than the grace period allows.
- Assuming Kubernetes rolls back a failed rollout automatically.
- Believing PDBs protect against node crashes or apply to rolling
  updates.

## Revision questions

1. What happens to a Pod when each of the three probes fails repeatedly?
2. A startup probe has `periodSeconds: 5` and `failureThreshold: 24`.
   How long may the app take to start, and what are liveness and
   readiness doing meanwhile?
3. A Deployment has 10 replicas with the default `maxSurge` and
   `maxUnavailable` of 25%. What is the maximum number of Pods during a
   rollout, and the minimum number available?
4. Why should a liveness probe not check MongoDB? What should readiness
   check instead?
5. Describe the termination sequence, and explain why a `preStop` sleep
   reduces errors during deploys.
6. A Pod has a 10-second `preStop` sleep, its app needs 25 seconds to
   drain, and the grace period is 30 seconds. What happens?
7. Why does a stalled rollout not take the service down, and what does
   Kubernetes do after `progressDeadlineSeconds`?
8. What does a PodDisruptionBudget protect against, and what does it not?

## Further learning

- [Kubernetes documentation: Liveness, readiness, and startup probes](https://kubernetes.io/docs/concepts/configuration/liveness-readiness-startup-probes/)
- [Kubernetes documentation: Configure probes](https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/)
- [Kubernetes documentation: Pod termination](https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/#pod-termination)
- [Kubernetes documentation: Deployment rolling update strategy](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/#rolling-update-deployment)
- [Kubernetes documentation: Specifying a disruption budget](https://kubernetes.io/docs/tasks/run-application/configure-pdb/)
- [Rolling, blue-green, and canary deployments](../deployment-strategies/rolling-blue-green-and-canary.md)
- Next: [scaling and resource management](scaling-and-resource-management.md).
  Back to the [Kubernetes overview](../kubernetes.md).
