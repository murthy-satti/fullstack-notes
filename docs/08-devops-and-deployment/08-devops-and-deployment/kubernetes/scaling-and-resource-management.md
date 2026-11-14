# Scaling and Resource Management

Kubernetes packs Pods onto nodes and grows or shrinks capacity, but it can
only do that well if every container says how much CPU and memory it
needs. This lesson covers resource requests and limits and what the
kernel does at each boundary (CPU throttling compared with memory
OOM kills), the three quality-of-service classes and eviction, namespace
guardrails with LimitRange and ResourceQuota, the HorizontalPodAutoscaler
and its formula with worked numbers, the Vertical Pod Autoscaler, node
autoscaling with the Cluster Autoscaler and Karpenter, and the scheduling
controls that decide where Pods land: node selectors, affinity, taints
and tolerations, and topology spread constraints.

## Why it matters

Resource settings decide cost, reliability, and latency at the same time.
Requests that are too high waste nodes you pay for; requests that are too
low pack too many Pods on a node, which then starves or evicts them. A
memory limit below the real working set restarts Pods under load. A CPU
limit can quietly add tens of milliseconds to every request through
throttling, while average CPU graphs look healthy. Autoscaling built on
wrong requests scales at the wrong times, and replicas that all land on
one node or zone fail together.

## Real-world usage

- **Google Cloud.** The article
  [Kubernetes best practices: Resource requests and limits](https://cloud.google.com/blog/products/containers-kubernetes/kubernetes-best-practices-resource-requests-and-limits)
  explains how the scheduler uses requests, what happens when containers
  exceed CPU or memory limits, and how namespace quotas and limit ranges
  keep teams from starving each other.
- **The Linux kernel.** The
  [CFS bandwidth control](https://docs.kernel.org/scheduler/sched-bwc.html)
  documentation describes the quota-per-period mechanism behind CPU
  limits and the throttling statistics (`nr_throttled`,
  `throttled_time`) used to diagnose it.
- **Kubernetes project.** The
  [horizontal Pod autoscaling](https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/)
  documentation gives the replica formula, the tolerance, the handling of
  not-yet-ready Pods, and the default scale-up and scale-down behaviour
  used in the worked example below.
- **Karpenter.** The [Karpenter](https://karpenter.sh/) project, started
  at AWS and now a Kubernetes SIG Autoscaling subproject, provisions
  right-sized nodes directly from the requirements of pending Pods and
  consolidates underused nodes, an alternative to scaling fixed node
  groups.

**Popular tools and providers:** metrics-server, the
HorizontalPodAutoscaler, the Vertical Pod Autoscaler, the Cluster
Autoscaler, Karpenter, KEDA (event-driven autoscaling), Prometheus Adapter
for custom metrics, and Goldilocks for request recommendations.

## How it works

### Requests and limits

Each container can declare, per resource:

| | Request | Limit |
|-|---------|-------|
| Meaning | What the container is guaranteed | The most it may use |
| Used by the scheduler | Yes: a Pod fits on a node only if the sum of requests fits the node's allocatable capacity | No |
| CPU enforcement | Relative weight under contention (`cpu.weight`) | Hard quota per 100 ms period (`cpu.max`): throttling |
| Memory enforcement | Used for eviction ranking under node memory pressure | Hard cap (`memory.max`): OOM kill at the limit |

Units: CPU is measured in cores, with `m` meaning thousandths (`250m` is a
quarter of a core). Memory uses bytes with binary suffixes (`256Mi`,
`1Gi`) or decimal ones (`256M`). Case matters: `400m` of memory means 0.4
bytes, a classic typo.

![Diagram: for CPU with a request of 250m and a limit of 500m, usage within the request is a guaranteed share, usage between request and limit uses idle CPU when available, and at the limit the container is throttled every 100 ms period, getting slower but never killed; for memory with a request of 256Mi and a limit of 512Mi, usage within the request has the lowest eviction risk, usage above the request makes the Pod among the first evicted under node memory pressure, and reaching the limit gets the container OOMKilled with exit code 137 and restarted; the scheduler uses requests only, and QoS classes are Guaranteed, Burstable, and BestEffort.](requests-limits-behaviour.svg)

### CPU throttling compared with OOM kills

**CPU is compressible.** With a 500m limit, the container may use 50 ms of
CPU time in each 100 ms period, across all its threads. A request that
needs 80 ms of CPU therefore cannot finish in one period: it runs for
50 ms, waits about 50 ms for the next period, and finishes 30 ms into it,
taking around 130 ms of wall time instead of 80 ms. Multi-threaded
runtimes burn through the quota faster, because every thread consumes it
in parallel. The container never dies from this; it just gets slower, and
the only clue is the throttling counters.

**Memory is not compressible.** When a container's memory reaches its
limit, the kernel reclaims what it can and then the OOM killer kills a
process in the container. Kubernetes reports `OOMKilled` with exit code
137, and the kubelet restarts the container.

That difference leads to common guidance:

- **Always set a memory limit**, usually equal to or slightly above the
  memory request, and size runtimes inside it (for Node.js, set
  `--max-old-space-size` to about 75% of the limit).
- **Always set a CPU request.** Whether to set a CPU limit is a trade-off:
  limits make performance predictable and stop noisy neighbours, but
  cause throttling at bursts. Many teams omit CPU limits for
  latency-sensitive services and rely on requests for fair sharing; others
  require them for strict multi-tenant isolation.

### Quality-of-service classes and eviction

Kubernetes assigns every Pod a QoS class from its resource settings:

| QoS class | Rule | Under node memory pressure |
|-----------|------|----------------------------|
| `Guaranteed` | Every container has CPU and memory limits equal to its requests | Evicted last; lowest OOM-kill priority |
| `Burstable` | At least one container has a request or limit, but not Guaranteed | Evicted if using more than requested |
| `BestEffort` | No requests or limits at all | Evicted first; killed first |

When a node runs low on memory or disk, the kubelet **evicts** Pods,
ranking first those whose usage exceeds their requests, then by Pod
priority. Evicted Pods are recreated elsewhere by their controllers, but
a BestEffort Pod can be evicted again and again. Every production Pod
should at least be Burstable with honest requests.

### Namespace guardrails: LimitRange and ResourceQuota

- A **LimitRange** sets per-container defaults (requests and limits
  applied when a manifest omits them) and minimums and maximums within a
  namespace.
- A **ResourceQuota** caps a namespace's totals: summed CPU and memory
  requests and limits, number of Pods, PersistentVolumeClaims, Services,
  and other objects. Once a quota tracks `requests.cpu`, every new Pod in
  the namespace must declare a CPU request (or receive one from a
  LimitRange), or the API server rejects it.

Together they stop one team's runaway deployment from consuming a shared
cluster.

### The HorizontalPodAutoscaler

The HPA (`autoscaling/v2`) changes a workload's replica count to keep a
metric near a target. Every 15 seconds by default it reads the metric and
computes:

```text
desiredReplicas = ceil( currentReplicas × currentMetricValue / targetMetricValue )
```

![Diagram: four taskflow-api Pods requesting 250m report CPU usage through kubelets to metrics-server; every 15 seconds the HPA controller reads it through the metrics.k8s.io API and sets the Deployment from 4 to 6 replicas, and the ReplicaSet adds 2 Pods; if there is no room, the Cluster Autoscaler or Karpenter adds a node; the calculation shows average CPU of 225m of 250m, or 90 percent, against a 60 percent target, so desired is ceil(4 × 90 / 60) = 6 within minReplicas 3 and maxReplicas 10; after scaling, 900m over 6 Pods is 150m or 60 percent, inside the 0.1 tolerance; when load drops to 20 percent, ceil(6 × 20 / 60) = 2 is raised to minReplicas 3 and applied only after the 5-minute stabilization window.](hpa-control-loop.svg)

Worked example for the TaskFlow API (CPU request 250m, target 60%):

```text
4 replicas, average usage 225m           -> utilization 225/250 = 90%
desired = ceil(4 × 90 / 60) = ceil(6.0)  -> 6 replicas
after scale-out: 900m total / 6 Pods     -> 150m each = 60%, ratio 1.0: stay at 6
traffic falls, utilization 20%           -> ceil(6 × 20 / 60) = 2, min 3: scale to 3
                                            (after the 300 s stabilization window)
```

Details that shape its behaviour:

- **Utilization is relative to requests.** Without a CPU request the HPA
  cannot compute a percentage and shows `<unknown>`. Changing the request
  changes when it scales.
- **Tolerance.** If the ratio is within 10% of 1.0, nothing happens, which
  prevents constant small adjustments.
- **Stabilization.** Scale-down uses the highest recommendation from the
  last 300 seconds by default, so a short dip does not remove Pods that
  will be needed again a minute later. Scale-up has no window by default
  and may at most double the replicas or add 4 Pods (whichever is more)
  per 15 seconds.
- **Not-ready Pods and missing metrics** are treated conservatively, so
  new Pods that are still starting do not trigger another scale-up.
- **Metric types:** `Resource` (CPU, memory), `Pods` (a per-Pod custom
  metric such as requests per second), `Object` (a metric of another
  object, such as an Ingress), and `External` (a queue length from a
  cloud service). Custom and external metrics need an adapter such as
  Prometheus Adapter or KEDA.
- When an HPA manages a Deployment, remove `replicas` from the
  Deployment manifest, or every `kubectl apply` resets the count.

Memory is usually a poor HPA metric for Node.js and other garbage-collected
runtimes, because memory rarely drops when load falls. CPU, request rate,
or queue length track load better.

### The Vertical Pod Autoscaler

The VPA (an add-on, `autoscaling.k8s.io/v1`) watches actual usage and
recommends, or applies, better requests. Its update modes are `Off`
(recommendations only), `Initial` (set requests when Pods are created),
`Recreate` (evict Pods to apply new values; the older `Auto` mode is a
deprecated alias for it), and `InPlaceOrRecreate` (resize running Pods in
place, evicting only when that fails). In-place resizing of a running
Pod's resources is on by default since Kubernetes 1.33 and stable since
1.35. Running the VPA in `Off` mode is a safe way to right-size requests.
Do not let the HPA and the VPA act on the same CPU or memory metric for
the same workload; they would fight each other.

### Node autoscaling: Cluster Autoscaler and Karpenter

The HPA adds Pods; something must add nodes when they do not fit.

| | Cluster Autoscaler | Karpenter |
|-|--------------------|-----------|
| Trigger | Pods `Pending` because no node has room | Same |
| Scales | Predefined node groups (cloud auto scaling groups) | Provisions individual nodes chosen from Pod requirements (`NodePool` rules) |
| Instance choice | Fixed per node group | Picks sizes and types to fit the pending Pods |
| Scale-down | Removes underused nodes, respecting PodDisruptionBudgets | Consolidation: replaces or removes nodes to pack Pods more cheaply |
| Providers | Most clouds | AWS, Azure, and others through providers |

Both act on **requests**, not on real usage: a cluster whose Pods request
far more than they use autoscales into waste. **KEDA** complements them
by scaling workloads on event sources (queue depth, stream lag, cron
windows), including scaling to zero.

### Scheduling basics

The scheduler filters nodes that can run a Pod (enough allocatable
resources, matching selectors and affinities, tolerated taints), scores
the rest, and binds the Pod to the best one.

| Control | What it does | Example |
|---------|--------------|---------|
| `nodeSelector` | Only nodes with these labels | `kubernetes.io/arch: arm64` |
| Node affinity | Required or preferred rules with operators (`In`, `NotIn`, `Exists`) | Prefer `node.kubernetes.io/instance-type` in a list |
| Pod affinity / anti-affinity | Place near, or away from, Pods with given labels, per topology domain | Keep API replicas on different hosts |
| Taints and tolerations | A tainted node repels Pods that do not tolerate the taint (`NoSchedule`, `PreferNoSchedule`, `NoExecute`) | GPU or batch-only node pools |
| Topology spread constraints | Limit the imbalance (`maxSkew`) of matching Pods across zones or nodes | Spread replicas evenly across three zones |
| PriorityClass | Higher-priority Pods can preempt lower ones when the cluster is full | Critical services over batch jobs |

Taints keep the wrong Pods off a node; tolerations only *allow* a Pod onto
tainted nodes and do not attract it there. To dedicate a node pool, combine
a taint (to keep others off) with a node selector or affinity (to steer
the intended Pods on).

## When to use and when not to use

| Situation | Approach |
|-----------|----------|
| Stateless API with load that varies over the day | HPA on CPU (or requests per second), minimum 2 to 3 replicas |
| Queue workers | KEDA or an HPA on an external queue-length metric |
| You do not know the right requests | VPA in `Off` mode, or measured p95 usage plus headroom |
| Bursty, latency-sensitive service | CPU request without a CPU limit (if policy allows); memory request equal to limit |
| Shared multi-team cluster | LimitRange defaults, ResourceQuotas, PriorityClasses |
| Highly available service | Topology spread across zones and nodes, PDB, at least 3 replicas |
| Special hardware or isolated workloads | Taints and tolerations plus node affinity |

Do not autoscale on memory for garbage-collected runtimes, do not
combine HPA and VPA on the same resource metric, and do not let
autoscalers compensate for missing or wildly wrong requests.

## Practical examples

### Requests and limits for the TaskFlow API

```yaml
# k8s/api-deployment.yaml (excerpt): container resources
resources:
  requests:
    cpu: 250m          # about the p95 CPU per Pod at normal load
    memory: 384Mi      # steady-state memory plus headroom
  limits:
    memory: 384Mi      # equal to the request: predictable, lowest eviction risk
    # no CPU limit: bursts use idle CPU instead of being throttled
env:
  - name: NODE_OPTIONS
    value: --max-old-space-size=288   # about 75% of the memory limit
```

```bash
kubectl -n taskflow top pods -l app.kubernetes.io/name=taskflow-api   # needs metrics-server
kubectl -n taskflow get pod <pod> -o jsonpath='{.status.qosClass}'
kubectl describe node <node> | grep -A 8 "Allocated resources"
```

### A HorizontalPodAutoscaler

```yaml
# k8s/api-hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: taskflow-api
  namespace: taskflow
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: taskflow-api
  minReplicas: 3
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 60
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 0
      policies:
        - type: Pods
          value: 4
          periodSeconds: 60
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
        - type: Percent
          value: 50
          periodSeconds: 60
```

```bash
kubectl -n taskflow get hpa taskflow-api --watch
# NAME           REFERENCE                 TARGETS       MINPODS   MAXPODS   REPLICAS
# taskflow-api   Deployment/taskflow-api   cpu: 90%/60%  3         10        4
kubectl -n taskflow describe hpa taskflow-api      # conditions and scaling events
```

The `behavior` section adds at most 4 Pods per minute and removes at most
half of them per minute after five quiet minutes, which smooths spiky
traffic. The 60% target leaves headroom so existing Pods absorb a surge
while new ones start.

### Namespace guardrails

```yaml
# k8s/namespace-guardrails.yaml
apiVersion: v1
kind: LimitRange
metadata:
  name: defaults
  namespace: taskflow
spec:
  limits:
    - type: Container
      defaultRequest:
        cpu: 100m
        memory: 128Mi
      default:
        memory: 256Mi
      max:
        memory: 2Gi
---
apiVersion: v1
kind: ResourceQuota
metadata:
  name: taskflow-quota
  namespace: taskflow
spec:
  hard:
    requests.cpu: "8"
    requests.memory: 16Gi
    limits.memory: 24Gi
    pods: "60"
    persistentvolumeclaims: "10"
```

```bash
kubectl -n taskflow describe resourcequota taskflow-quota   # used compared with hard
```

### Spreading replicas and steering Pods

```yaml
# k8s/api-deployment.yaml (excerpt): pod template spec scheduling rules
spec:
  topologySpreadConstraints:
    - maxSkew: 1
      topologyKey: topology.kubernetes.io/zone
      whenUnsatisfiable: DoNotSchedule
      labelSelector:
        matchLabels:
          app.kubernetes.io/name: taskflow-api
    - maxSkew: 1
      topologyKey: kubernetes.io/hostname
      whenUnsatisfiable: ScheduleAnyway
      labelSelector:
        matchLabels:
          app.kubernetes.io/name: taskflow-api
  affinity:
    nodeAffinity:
      requiredDuringSchedulingIgnoredDuringExecution:
        nodeSelectorTerms:
          - matchExpressions:
              - key: kubernetes.io/arch
                operator: In
                values: ["amd64", "arm64"]
```

```yaml
# k8s/report-job.yaml (excerpt): run only on a dedicated, tainted batch pool
spec:
  nodeSelector:
    workload: batch
  tolerations:
    - key: dedicated
      operator: Equal
      value: batch
      effect: NoSchedule
```

```bash
kubectl taint nodes <batch-node> dedicated=batch:NoSchedule
kubectl label nodes <batch-node> workload=batch
```

The first spread constraint keeps zones within one replica of each other
and refuses to break that rule; the second spreads across hosts when
possible. The batch Job both tolerates the taint and selects the label,
so it lands only on the batch pool while other Pods stay off it.

### Finding CPU throttling

```bash
# Inside a container (cgroup v2): how often the quota was hit
kubectl -n taskflow exec <pod> -- cat /sys/fs/cgroup/cpu.stat
# nr_periods 120000
# nr_throttled 18000      <- 15% of periods throttled
# throttled_usec 540000000
```

In Prometheus, the cAdvisor metrics
`container_cpu_cfs_throttled_periods_total` divided by
`container_cpu_cfs_periods_total` give the same ratio per container.

## Best practices

- Set CPU and memory requests on every container from measured usage, and
  revisit them as the code changes.
- Set memory limits, usually equal to requests, and size the runtime's
  heap below them.
- Decide CPU limits deliberately; watch throttling wherever they exist.
- Keep production Pods out of BestEffort.
- Use LimitRanges and ResourceQuotas in shared clusters.
- Autoscale stateless services with the HPA on CPU or request rate; leave
  headroom in the target.
- Run a node autoscaler so HPA scale-outs never wait on manual capacity.
- Spread replicas across zones and nodes with topology spread
  constraints.
- Remove `replicas` from manifests of HPA-managed workloads.
- Use taints plus selectors to dedicate node pools.

## In production

- **Latency rises while average CPU looks fine.**
  *Detect:* p99 latency climbs with traffic, and the ratio of throttled to
  total CFS periods is above a few percent. *Cause:* a CPU limit throttles
  short bursts, especially for multi-threaded processes. *Fix:* raise or
  remove the CPU limit, raise the request, or add replicas.
- **Pods are OOMKilled after a traffic spike.**
  *Detect:* `kubectl describe pod` shows `Last State: Terminated, Reason:
  OOMKilled, Exit Code: 137`, and memory metrics hit the limit first.
  *Cause:* the limit is below the peak working set, or the runtime's heap
  is not sized to the limit. *Fix:* raise the limit from measured peaks,
  set the heap size explicitly, and look for leaks.
- **New Pods stay `Pending` although nodes look idle.**
  *Detect:* events show `0/6 nodes are available: 6 Insufficient cpu`,
  while node CPU usage is low. *Cause:* requests are far higher than real
  usage, so the scheduler sees the nodes as full. *Fix:* right-size
  requests using VPA recommendations or usage data.
- **The HPA shows `<unknown>/60%` and never scales.**
  *Detect:* `kubectl describe hpa` reports `failed to get cpu utilization`
  or `missing request for cpu`. *Cause:* metrics-server is not installed or
  not healthy, or the containers have no CPU requests. *Fix:* install or fix
  metrics-server and set requests on every container in the Pod.
- **Replica count jumps back after every deploy.**
  *Detect:* the HPA had scaled to 8, a `kubectl apply` sets 3, then the HPA
  scales up again. *Cause:* the Deployment manifest still contains
  `replicas`. *Fix:* remove the field and let the HPA own it.
- **One zone outage takes the service down.**
  *Detect:* all replicas were on nodes in the failed zone
  (`kubectl get pods -o wide` and node zone labels). *Cause:* no spread
  constraints, so the scheduler packed them together. *Fix:* topology
  spread constraints across zones, at least one replica per zone, and a
  PDB.
- **New Pods in a namespace are rejected outright.**
  *Detect:* `kubectl apply` fails with `must specify requests.cpu`.
  *Cause:* a ResourceQuota tracks CPU requests and the manifest has none.
  *Fix:* add requests, or a LimitRange with default requests.

## Important terminology

- **Request:** The amount of a resource reserved for a container and used
  for scheduling.
- **Limit:** The maximum a container may use; enforced by cgroups.
- **Allocatable:** A node's capacity minus what is reserved for the system
  and kubelet.
- **CPU throttling:** Pausing a container that used its CPU quota until
  the next period.
- **OOMKilled:** A container killed by the kernel for exceeding its memory
  limit.
- **QoS class:** Guaranteed, Burstable, or BestEffort, derived from
  requests and limits.
- **Eviction:** The kubelet removing Pods to relieve node resource
  pressure.
- **LimitRange / ResourceQuota:** Per-container defaults and bounds, and
  per-namespace totals.
- **HPA:** The controller that scales replicas to keep a metric near a
  target.
- **VPA:** The add-on that recommends or applies better requests.
- **Cluster Autoscaler / Karpenter:** Controllers that add and remove
  nodes based on pending Pods.
- **Taint / toleration:** A node marking that repels Pods, and a Pod's
  permission to ignore it.
- **Topology spread constraint:** A rule limiting how unevenly Pods are
  spread across zones or nodes.

## Common mistakes and misconceptions

- Leaving requests unset and getting BestEffort Pods.
- Treating limits as reservations; only requests reserve capacity.
- Setting memory limits far above requests and then being surprised by
  evictions under node pressure.
- Believing CPU limits never hurt because the container is not killed.
- Autoscaling on memory for garbage-collected runtimes.
- Forgetting that the HPA computes utilization against requests.
- Expecting tolerations to attract Pods to tainted nodes.
- Relying on the scheduler to spread replicas across zones without
  telling it to.

## Revision questions

1. What do requests and limits each control, for CPU and for memory?
2. A container with a 200m CPU limit needs 60 ms of CPU for a request.
   Roughly how long does the request take, and why?
3. Classify the QoS class of a Pod whose only container sets
   `requests.memory: 256Mi` and `limits.memory: 256Mi` but no CPU
   settings.
4. An HPA targets 70% CPU. Five replicas average 84% utilization. How many
   replicas does it want? What if they average 72%?
5. Why does scale-down wait for a stabilization window, and why does
   scale-up not?
6. What is the difference between the HPA, the VPA, and a node
   autoscaler?
7. How do you keep a GPU node pool for GPU jobs only?
8. A node has 3.5 CPU allocatable. How many Pods requesting 500m fit,
   regardless of their actual usage?

## Further learning

- [Kubernetes documentation: Resource management for Pods and containers](https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/)
- [Kubernetes documentation: Pod quality of service classes](https://kubernetes.io/docs/concepts/workloads/pods/pod-qos/)
- [Kubernetes documentation: Node-pressure eviction](https://kubernetes.io/docs/concepts/scheduling-eviction/node-pressure-eviction/)
- [Kubernetes documentation: Taints and tolerations](https://kubernetes.io/docs/concepts/scheduling-eviction/taint-and-toleration/)
- [Kubernetes documentation: Pod topology spread constraints](https://kubernetes.io/docs/concepts/scheduling-eviction/topology-spread-constraints/)
- [Kubernetes autoscaler (Cluster Autoscaler and VPA)](https://github.com/kubernetes/autoscaler)
- [KEDA](https://keda.sh/)
- Next: [ingress, networking, and Helm](ingress-networking-and-helm.md).
  Back to the [Kubernetes overview](../kubernetes.md).
