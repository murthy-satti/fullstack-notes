# Kubernetes Interview Questions and Answers

These questions review orchestration fundamentals, Pods, Deployments and
Services, configuration and Secrets, probes and rolling updates, scaling
and resources, ingress, networking and Helm, and stateful workloads and
Jobs. Try answering each one before reading the answer.

## Architecture and fundamentals

### 1. What problems does a container orchestrator solve?

Scheduling containers onto machines with enough resources, restarting
and replacing them when they or their machines fail, rolling out new
versions gradually with rollback, giving changing sets of containers
stable names and load balancing, scaling replicas and nodes, and
injecting configuration and secrets, all through one declarative API.

### 2. What are the control plane components, and what does each do?

`kube-apiserver` is the REST front end and the only component that talks
to etcd; etcd stores all cluster state; `kube-scheduler` assigns Pods to
nodes; `kube-controller-manager` runs the built-in controllers
(Deployment, ReplicaSet, node lifecycle, and others); and
`cloud-controller-manager` integrates with the cloud (load balancers,
routes, node lifecycle).

### 3. What runs on every worker node?

The kubelet, which starts the Pods bound to the node through the
container runtime and reports their status; kube-proxy (or an eBPF
replacement), which programs Service routing rules; and a CRI container
runtime such as containerd or CRI-O.

### 4. What does "desired state and reconciliation" mean?

You declare the desired state in an object's `spec`; controllers
continuously observe the actual state (`status`), compute the
difference, and act to close it. The loop is level-triggered, so missed
events do no harm and manual changes to managed objects are undone. This
is why a deleted Pod owned by a ReplicaSet comes back.

### 5. What happens to running workloads if the API server goes down?

Running Pods keep running and Services keep routing, because kubelets and
kube-proxy already have their configuration. But nothing can change: no
scheduling, no scaling, no self-healing that needs new objects, and no
`kubectl` access until it returns.

### 6. Why do etcd clusters have an odd number of members?

Writes need a quorum of `floor(n/2) + 1` members. Three members tolerate
one failure and five tolerate two. Four members still tolerate only one
failure (quorum is three), so an even count adds cost without adding
fault tolerance.

### 7. What is the difference between imperative and declarative management?

Imperative commands (`kubectl create`, `scale`, `set image`) change the
cluster directly and leave no record. Declarative management keeps
manifests in Git and applies them with `kubectl apply` or a GitOps tool,
so changes are reviewed, repeatable, and recoverable.

### 8. What are namespaces for, and are they a security boundary?

They scope names and are the unit for RBAC, resource quotas, limit
ranges, and network policies. By themselves they are not a security
boundary: Pods in different namespaces can communicate and share nodes
unless network policies and other controls are added.

### 9. When would you not use Kubernetes?

For one or two services run by a small team, where a serverless container
platform (Cloud Run, ECS on Fargate, Azure Container Apps), a PaaS, or
Compose on a VM delivers deploys, scaling, and HTTPS with far less
operational cost. Kubernetes pays off with many services, several teams,
or a need for its ecosystem.

## Pods, Deployments, and Services

### 10. What is a Pod, and what do its containers share?

The smallest deployable unit: one or more containers scheduled together
on one node. They share a network namespace (one IP, one port space,
`localhost`), volumes declared in the Pod, and a lifecycle. Pods are
disposable and are replaced, never repaired or moved.

### 11. What are init containers and native sidecar containers?

Init containers run sequentially to completion before app containers
start, for preparation work. Native sidecars are init containers with
`restartPolicy: Always`: they start before the app, run alongside it,
restart if they crash, and stop after the app exits, so they no longer
block Jobs from completing (stable since Kubernetes 1.33).

### 12. How do a Deployment, ReplicaSets, and Pods relate?

The Deployment manages ReplicaSets, one per distinct Pod template, and
each ReplicaSet keeps a number of identical Pods running. A template
change creates a new ReplicaSet and shifts Pods to it; old ReplicaSets are
kept at zero replicas up to `revisionHistoryLimit` so rollbacks are
instant.

### 13. How does a Service find its Pods?

Through its label selector, never by name. The EndpointSlice controller
lists the IPs and ports of matching Pods with ready, serving, and
terminating conditions, and only ready endpoints receive new traffic.

### 14. Compare the Service types.

ClusterIP (default) gives an internal virtual IP and DNS name. NodePort
also opens a port (30000-32767) on every node. LoadBalancer also
provisions a cloud load balancer. ExternalName is a DNS alias to an
outside name. A headless Service (`clusterIP: None`) has no virtual IP,
and DNS returns Pod IPs.

### 15. What is the DNS name of a Service?

`<service>.<namespace>.svc.cluster.local`, for example
`taskflow-api.taskflow.svc.cluster.local`. The short name works within
the same namespace. StatefulSet Pods behind a headless Service also get
`<pod>.<service>.<namespace>.svc.cluster.local`.

### 16. How does a packet sent to a ClusterIP reach a Pod?

kube-proxy has programmed iptables or nftables rules on every
node from the EndpointSlices. The client's own node rewrites the
destination to a ready Pod's IP and port, and the CNI network routes it.
kube-proxy itself is not in the data path.

### 17. Why can gRPC traffic be unevenly balanced across Pods?

Service load balancing happens per connection. HTTP/2 clients keep one
long-lived connection and send all requests over it, so new Pods added by
scaling receive no traffic from existing clients. Use client-side load
balancing with a headless Service, a service mesh, or an L7 proxy.

### 18. Why should you not run bare Pods for applications?

Nothing recreates a bare Pod when it is deleted, evicted, or its node
fails. A controller (Deployment, StatefulSet, Job, DaemonSet) owns Pods
and replaces them.

## Configuration and Secrets

### 19. What is the difference between a ConfigMap and a Secret?

Both hold key-value data or files for Pods. Secrets are for sensitive
values: they are sent only to nodes that run Pods using them, mounted on
tmpfs, can be encrypted at rest, and can be restricted separately with
RBAC. Their values are base64-encoded, which is not encryption.

### 20. Is a Kubernetes Secret secure by default?

No. Its values are only base64-encoded, and etcd stores them unencrypted
unless encryption at rest is configured (ideally with a KMS provider).
Anyone with `get` or `list` on Secrets, or with the right to create Pods
in the namespace, can read them.

### 21. What happens to a running Pod when its ConfigMap changes?

Environment variables never change; the process keeps its startup values.
Mounted files are updated in place by the kubelet after a short delay,
except files mounted with `subPath`, which never update. Apps that read
config only at startup still need a restart.

### 22. How do you roll Pods automatically when configuration changes?

Make the change alter the Pod template: Kustomize's `configMapGenerator`
appends a content hash to the ConfigMap name, Helm charts add a
`checksum/config` annotation computed from the rendered ConfigMap, or a
reloader controller restarts workloads on change. `kubectl rollout
restart` does it manually.

### 23. What are immutable ConfigMaps for?

`immutable: true` prevents changes to the data, protects running Pods from
accidental edits, and lets the kubelet stop watching the object, which
reduces API server load in large clusters. Changes are made by creating a
new, versioned object.

### 24. How do teams keep secret values out of Git?

The External Secrets Operator syncs values from a cloud secret manager or
Vault into Secrets, defined by committed `ExternalSecret` references; the
Secrets Store CSI Driver mounts values directly into Pods; Sealed Secrets
commits values encrypted with the cluster's public key. Workload identity
avoids storing cloud credentials in the cluster.

## Probes and rolling updates

### 25. What is the difference between liveness, readiness, and startup probes?

Readiness decides whether a Pod receives traffic; failing removes it from
endpoints without a restart. Liveness decides whether the container is
restarted. Startup protects slow starters: until it succeeds, liveness and
readiness are disabled, and if it fails for long enough the container is
restarted.

### 26. Why should a liveness probe not check the database?

A database outage would fail liveness on every replica at once, restarting
all of them, losing warm state, and stampeding the database when it
returns. Liveness should only detect a process that cannot recover on its
own; dependency problems belong in readiness or in request handling.

### 27. How long does a default liveness probe take to restart a hung container?

About 30 seconds: `periodSeconds` 10 times `failureThreshold` 3, plus up
to the probe `timeoutSeconds` (1 second by default) per attempt.

### 28. How do `maxSurge` and `maxUnavailable` work?

`maxSurge` is how many Pods may exist above `replicas` during a rolling
update (percentages round up); `maxUnavailable` is how many may be
unavailable below it (percentages round down). Both default to 25%. With 4
replicas: at most 5 Pods and at least 3 available.

### 29. What happens if a new version never becomes ready?

The rollout cannot proceed beyond the `maxUnavailable` budget, so old Pods
keep serving. After `progressDeadlineSeconds` (default 600) the
Deployment's `Progressing` condition becomes `False` with
`ProgressDeadlineExceeded`. Kubernetes does not roll back automatically;
run `kubectl rollout undo` or let the pipeline do it.

### 30. Describe the Pod termination sequence.

The Pod is marked Terminating; in parallel its endpoint is removed from
EndpointSlices (proxies update over the next moments) and the kubelet
runs the `preStop` hook. Then `SIGTERM` is sent; the app drains and exits.
If it is still running when `terminationGracePeriodSeconds` (default 30,
including `preStop`) elapses, it gets `SIGKILL`.

### 31. Why add a `preStop` sleep?

Endpoint removal and `SIGTERM` happen concurrently, so a Pod can receive
new requests after it starts shutting down. A short sleep (5 to 10
seconds) keeps it serving until load balancers and kube-proxy rules have
removed it, eliminating errors during deploys.

### 32. What does a PodDisruptionBudget protect against?

Voluntary evictions through the eviction API: node drains, cluster
upgrades, and autoscaler scale-downs. It does not apply to a Deployment's
rolling update or to involuntary failures such as node crashes. A budget
that allows zero disruptions blocks drains.

## Scaling and resources

### 33. What is the difference between requests and limits?

Requests reserve capacity: the scheduler places Pods by them, and CPU
requests set relative weight under contention. Limits cap usage: a CPU
limit throttles the container, a memory limit gets it OOM-killed when
reached.

### 34. What happens when a container exceeds its CPU limit versus its memory limit?

CPU: it is throttled for the rest of each 100 ms period, so it runs slower
but survives. Memory: the kernel OOM-kills it (`OOMKilled`, exit code 137)
and the kubelet restarts it.

### 35. What are the QoS classes?

Guaranteed: every container has CPU and memory limits equal to requests.
Burstable: some requests or limits but not Guaranteed. BestEffort: none.
Under node memory pressure the kubelet evicts BestEffort Pods and Pods
using more than their requests first, and the OOM killer prefers them
too.

### 36. How does the HPA calculate the desired replica count?

`desiredReplicas = ceil(currentReplicas × currentMetricValue /
targetMetricValue)`, skipped when the ratio is within the 10% tolerance.
For example, 4 replicas at 90% CPU with a 60% target give
`ceil(4 × 90 / 60) = 6`, bounded by `minReplicas` and `maxReplicas`.

### 37. Why does the HPA need resource requests?

CPU and memory utilization targets are percentages of the request.
Without requests the HPA cannot compute utilization and reports
`<unknown>`. Changing requests also changes when it scales.

### 38. Why does HPA scale-down wait longer than scale-up?

Scale-down uses a 300-second stabilization window by default, taking the
highest recommendation in that window, so brief dips do not remove Pods
that will soon be needed. Scale-up reacts immediately (bounded by rate
policies) because under-provisioning hurts users.

### 39. What is the difference between the HPA, the VPA, and the Cluster Autoscaler?

The HPA changes the number of Pods. The VPA recommends or applies better
requests per Pod. The Cluster Autoscaler (or Karpenter) adds nodes when
Pods are Pending for lack of room and removes underused nodes. All of
them depend on accurate requests.

### 40. How do taints, tolerations, and affinity differ?

A taint on a node repels Pods that do not tolerate it; a toleration allows
a Pod onto tainted nodes but does not attract it there. Node affinity and
node selectors attract Pods to nodes with labels. To dedicate a node pool,
taint the nodes and give the intended Pods both a toleration and a
selector.

## Ingress, networking, and Helm

### 41. What is the difference between an Ingress and an ingress controller?

An Ingress is a set of HTTP routing rules (hosts, paths, TLS). An ingress
controller is the proxy that watches Ingress objects and implements them.
Without a controller that claims it through `ingressClassName`, an Ingress
does nothing.

### 42. Why is the Gateway API replacing Ingress for new work?

Ingress is frozen, and everything beyond hosts, paths, and TLS needs
controller-specific annotations. The Gateway API splits responsibilities
into GatewayClass, Gateway, and Route resources owned by different roles,
and standardizes features such as weighted traffic splitting, header
matching, and redirects. The community ingress-nginx controller was also
retired after March 2026.

### 43. How does cert-manager obtain and renew a certificate?

An Issuer or ClusterIssuer describes an ACME CA such as Let's Encrypt. For
a Certificate (often created from an Ingress annotation), cert-manager
proves domain control with an HTTP-01 or DNS-01 challenge, stores the
certificate in a TLS Secret, and renews it automatically, by default
after two thirds of its lifetime.

### 44. How do NetworkPolicies work?

They select Pods and list allowed ingress and egress traffic by Pod
selector, namespace selector, IP block, and port. A Pod selected by a
policy is default-deny for that direction; policies are additive; and
they are enforced only if the CNI supports them. Remember to allow DNS
egress.

### 45. What are a Helm chart, values, a release, and a revision?

A chart is a package of templated manifests with default values. Values
configure an installation (precedence: chart defaults, then `-f` files in
order, then `--set`). A release is one installed instance of a chart, and
each install, upgrade, or rollback creates a revision stored as a Secret
in the release namespace.

### 46. What does `helm rollback` do?

It re-applies the manifests and values of an earlier revision and records
the result as a new revision. It does not undo database changes or
anything outside the release's manifests.

### 47. When would you use Kustomize instead of Helm?

For your own services where environments differ by a few patches, image
tags, and generated ConfigMaps: Kustomize keeps plain YAML, needs no
templating, and is built into `kubectl`. Helm suits distributing software
to others, complex parameterization, and installing third-party software.

## Stateful workloads and Jobs

### 48. What does a StatefulSet guarantee that a Deployment does not?

Stable ordinal Pod names (`mongo-0`), stable DNS names through a headless
Service, a dedicated PersistentVolumeClaim per Pod from
`volumeClaimTemplates`, and ordered creation, scaling, and updates. It does
not make the software replicate itself.

### 49. Explain PV, PVC, and StorageClass.

A PersistentVolume is real storage; a PersistentVolumeClaim is an app's
request for storage of a size, access mode, and class; a StorageClass
tells a CSI provisioner how to create volumes dynamically, with a reclaim
policy and binding mode.

### 50. Why use `volumeBindingMode: WaitForFirstConsumer`?

Cloud block disks are zonal. Waiting until a Pod is scheduled creates the
disk in that Pod's zone. Immediate binding can create the disk in a zone
where the Pod cannot run, leaving it Pending.

### 51. Why do many teams run databases as managed services instead of in Kubernetes?

A StatefulSet provides identity and storage only. Replication, failover,
backups, point-in-time recovery, upgrades, tuning, and monitoring remain
the team's job, or an operator's. Managed services provide those, so
teams often keep primary data there and run stateless services in the
cluster.

### 52. How do Jobs handle failures?

Failed Pods are recreated with exponential back-off (10 s, 20 s, 40 s, up
to six minutes) until `backoffLimit` (default 6) is reached, and
`activeDeadlineSeconds` caps total runtime. `podFailurePolicy` can fail
fast on specific exit codes or ignore disruptions.

### 53. What do CronJob `concurrencyPolicy` and `timeZone` do?

`concurrencyPolicy` decides what happens when a run is due while the
previous Job is still running: `Allow` runs both, `Forbid` skips the new
one, `Replace` stops the old one. `timeZone` sets the IANA zone for the
schedule instead of the controller's default, usually UTC.

## Scenario-based questions

### 54. A Service returns 503 although its Pods are Running. What do you check?

**What to check first:** the Service's EndpointSlices with
`kubectl get endpointslices -l kubernetes.io/service-name=<svc>`.

**How to confirm:** there are no endpoints, or all are not ready;
compare the Service selector with `kubectl get pods --show-labels`.

**Likely causes and fixes:** a selector that does not match the Pod labels,
a wrong `targetPort`, or Pods failing readiness. Fix the labels or port,
or the readiness failure shown in `kubectl describe pod`. See
[Pods, Deployments, and Services](pods-deployments-and-services.md).

### 55. New Pods are stuck in `ImagePullBackOff`. How do you fix it?

**What to check first:** the events in `kubectl describe pod`.

**How to confirm:** the message says `not found` (bad tag or digest) or
`unauthorized` / `denied` (credentials).

**Likely causes and fixes:** a typo or an image never pushed, a deleted
image, a private registry without `imagePullSecrets` or node permissions,
or Docker Hub rate limits. Correct the reference, add credentials, or
mirror the image. See [Pods, Deployments, and Services](pods-deployments-and-services.md).

### 56. A Pod is in `CrashLoopBackOff`. What is your process?

**What to check first:** `kubectl logs <pod> --previous` and the last
state in `kubectl describe pod` (exit code, reason).

**How to confirm:** the exit code and log identify the failure: a missing
environment variable, `OOMKilled`, or liveness probe failures.

**Likely causes and fixes:** configuration or Secret missing (fix the
reference), memory limit too low (raise it, size the heap), or a liveness
probe killing a slow start (add a startup probe). See
[health probes and rolling updates](health-probes-and-rolling-updates.md).

### 57. Every deploy causes a burst of 502 errors at the ingress. Why?

**What to check first:** whether the app handles `SIGTERM` and whether
there is a `preStop` hook.

**How to confirm:** ingress logs show upstream connection refused or reset
errors only during rollouts, from Pods that were terminating.

**Likely causes and fixes:** the app exits immediately on `SIGTERM` while
proxies still route to it, or in-flight requests are cut. Add a short
`preStop` sleep, drain on `SIGTERM`, keep the total under the grace
period, and use readiness probes for new Pods. See
[health probes and rolling updates](health-probes-and-rolling-updates.md).

### 58. During a 3-minute MongoDB outage, every API Pod restarted. What went wrong?

**What to check first:** the liveness probe definition and the
`/healthz` handler.

**How to confirm:** Pod events show `Liveness probe failed` with 503s
during the outage on all replicas at once.

**Likely causes and fixes:** the liveness endpoint checks the database.
Make liveness local only, reflect dependency health in readiness or
error handling, and add circuit breaking. See
[health probes and rolling updates](health-probes-and-rolling-updates.md).

### 59. A rollout has been stuck for 15 minutes at "1 of 4 updated replicas are available". What do you do?

**What to check first:** the new Pods' readiness and events.

**How to confirm:** new Pods are `Running` but not ready, and the
Deployment condition shows `ProgressDeadlineExceeded`.

**Likely causes and fixes:** the new version fails readiness (bad config,
missing Secret key, changed probe path). Run `kubectl rollout undo`,
fix the cause, and make the pipeline undo automatically when
`kubectl rollout status --timeout` fails. See
[health probes and rolling updates](health-probes-and-rolling-updates.md).

### 60. A ConfigMap was updated an hour ago, but the app still uses old values. Why?

**What to check first:** how the value reaches the container (env var or
mounted file) and whether the Pods restarted.

**How to confirm:** `kubectl exec ... -- printenv` shows the old value, and
the Pods' start times predate the change.

**Likely causes and fixes:** environment variables never update, and the
Pod template did not change, so nothing rolled. Run `kubectl rollout
restart` and adopt hash-suffixed ConfigMaps or checksum annotations. See
[configuration and Secrets](configuration-and-secrets.md).

### 61. Latency rises at peak while CPU usage looks moderate. What do you look at?

**What to check first:** CPU throttling: the ratio of
`container_cpu_cfs_throttled_periods_total` to
`container_cpu_cfs_periods_total`, or `nr_throttled` in `cpu.stat`.

**How to confirm:** throttling rises with traffic and correlates with p99
latency.

**Likely causes and fixes:** a CPU limit throttles bursts within each
100 ms period. Raise or remove the CPU limit, raise requests, or add
replicas. See [scaling and resource management](scaling-and-resource-management.md).

### 62. The HPA shows `<unknown>/60%` and never scales. Why?

**What to check first:** `kubectl describe hpa` conditions and whether
metrics-server is running.

**How to confirm:** the HPA reports `failed to get cpu utilization` or
`missing request for cpu`, and `kubectl top pods` fails.

**Likely causes and fixes:** metrics-server missing or unhealthy, or
containers without CPU requests. Install or fix metrics-server and set
requests on every container. See
[scaling and resource management](scaling-and-resource-management.md).

### 63. New Pods stay Pending with "Insufficient cpu", but node CPU usage is 20%. What is happening?

**What to check first:** the sum of requests on nodes with
`kubectl describe node` ("Allocated resources").

**How to confirm:** requests are near 100% of allocatable while real usage
is low.

**Likely causes and fixes:** inflated requests. The scheduler uses
requests, not usage. Right-size requests with measured usage or VPA
recommendations, and run a node autoscaler for genuine growth. See
[scaling and resource management](scaling-and-resource-management.md).

### 64. Users get a certificate error on the new hostname. How do you debug it?

**What to check first:** `kubectl get certificate` and the related
`Challenge` resources.

**How to confirm:** the Certificate is not ready and the HTTP-01 challenge
self-check fails, or DNS for the hostname does not point at the load
balancer yet.

**Likely causes and fixes:** DNS not updated, port 80 blocked, the
solver's ingress class wrong, or rate limits from repeated failures. Fix
DNS and firewall, match the class, and test with the staging issuer. See
[Ingress, networking, and Helm](ingress-networking-and-helm.md).

### 65. After adding a default-deny NetworkPolicy, every service fails to connect. Why?

**What to check first:** whether DNS egress is allowed.

**How to confirm:** Pods log name-resolution errors (`EAI_AGAIN`), and a
test Pod cannot resolve `kubernetes.default`.

**Likely causes and fixes:** egress to CoreDNS on port 53 is denied, and
the required application flows were not yet allowed. Add an allow-DNS
policy and explicit allows for each flow, then apply default deny. See
[Ingress, networking, and Helm](ingress-networking-and-helm.md).

### 66. A database StatefulSet Pod is Pending after a node failure. Why?

**What to check first:** the Pod's events.

**How to confirm:** `volume node affinity conflict`: its PersistentVolume
is in a zone with no available node.

**Likely causes and fixes:** zonal disks pin the Pod to a zone. Restore
capacity in that zone (node autoscaling per zone), spread replicas across
zones, and rely on database replication meanwhile. See
[stateful workloads and Jobs](stateful-workloads-and-jobs.md).

### 67. Customers received the nightly email twice. What happened?

**What to check first:** the CronJob's `concurrencyPolicy` and the Jobs it
created around that time.

**How to confirm:** two Jobs overlapped, or one Job retried a Pod after it
had already sent emails.

**Likely causes and fixes:** `Allow` with a long run, or a non-idempotent
job. Set `concurrencyPolicy: Forbid`, a `startingDeadlineSeconds`, and
make sending idempotent by recording what was sent. See
[stateful workloads and Jobs](stateful-workloads-and-jobs.md).

## Further learning

- [Kubernetes overview](../kubernetes.md)
- [Orchestration fundamentals](orchestration-fundamentals.md) ·
  [Pods, Deployments, and Services](pods-deployments-and-services.md) ·
  [Configuration and Secrets](configuration-and-secrets.md) ·
  [Health probes and rolling updates](health-probes-and-rolling-updates.md) ·
  [Scaling and resource management](scaling-and-resource-management.md) ·
  [Ingress, networking, and Helm](ingress-networking-and-helm.md) ·
  [Stateful workloads and Jobs](stateful-workloads-and-jobs.md)
- [Kubernetes documentation](https://kubernetes.io/docs/home/)
- [kubectl quick reference](https://kubernetes.io/docs/reference/kubectl/quick-reference/)
