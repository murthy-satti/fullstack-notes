# Orchestration Fundamentals

Running one container on one server is easy. Running forty containers of
ten services across six servers, replacing them when they crash or a
server dies, rolling out new versions without downtime, and routing
traffic to whichever copies are healthy is not. That job is called
**container orchestration**, and Kubernetes is the system most teams use
for it.

This lesson explains what an orchestrator does, the architecture of a
Kubernetes cluster (the control plane components and what runs on every
node), the idea that drives everything in Kubernetes (desired state and
reconciliation loops), how declarative YAML and `kubectl apply` fit in,
namespaces and API groups, managed compared with self-managed clusters,
and when Kubernetes is the wrong tool.

## Why it matters

Every concept in later lessons (Deployments, Services, probes,
autoscaling) is a controller reconciling some desired state. Once you
understand the loop, Kubernetes stops looking like a collection of magic
YAML keys and becomes predictable: you can reason about why a Pod came
back after you deleted it, why a change you made with `kubectl edit`
disappeared, why a node failure takes minutes to heal, and what each
component's outage would break.

Knowing the architecture also tells you what you are paying for. A managed
service runs the control plane, but you still own node capacity,
upgrades of your manifests across API versions, add-ons, and the
applications. Choosing Kubernetes for a single small service often costs
more than it saves.

## Real-world usage

- **Google (Borg).** The paper
  [Large-scale cluster management at Google with Borg](https://research.google/pubs/large-scale-cluster-management-at-google-with-borg/)
  (EuroSys 2015) describes the cluster manager that ran Google's
  workloads before Kubernetes: declarative job specifications, bin-packing
  of tasks onto machines, and automatic rescheduling on failure. Several
  Kubernetes concepts (Pods, labels, Services) come from lessons the
  paper and its follow-up articles describe.
- **OpenAI.** The post
  [Scaling Kubernetes to 7,500 nodes](https://openai.com/index/scaling-kubernetes-to-7500-nodes/)
  explains how OpenAI ran very large clusters for machine-learning
  workloads and which control plane parts (the API servers, etcd,
  networking, and monitoring) needed attention at that size.
- **Spotify.** The CNCF
  [Spotify case study](https://www.cncf.io/case-studies/spotify/)
  describes moving from Spotify's homegrown orchestrator, Helios, to
  Kubernetes because a small in-house team could not keep up with a
  project supported by a much larger community, running the two side by
  side during the migration.
- **Kubernetes project.** The
  [cluster components](https://kubernetes.io/docs/concepts/overview/components/)
  documentation defines the control plane and node components this page
  walks through.

**Popular tools and providers:** Amazon EKS, Google Kubernetes Engine
(including Autopilot), Azure Kubernetes Service, Red Hat OpenShift,
Rancher and RKE2, k3s, `kubeadm` for self-managed clusters, and kind,
minikube, k3d, or Docker Desktop for local clusters.

## How it works

### What an orchestrator does

| Problem without an orchestrator | What Kubernetes does |
|---------------------------------|----------------------|
| Deciding which server has room for a container | **Scheduling** by CPU and memory requests and placement rules |
| A container crashes at 3 a.m. | **Self-healing**: the kubelet restarts it; controllers replace lost Pods |
| A server dies | Pods on it are recreated on healthy nodes |
| Deploying without downtime | **Rolling updates** with health checks and one-command rollback |
| Clients must find changing container IPs | **Services**: stable names, virtual IPs, and load balancing |
| Traffic grows | **Horizontal autoscaling** of Pods, and of nodes with a cluster autoscaler |
| Configuration and credentials per environment | **ConfigMaps and Secrets** injected at runtime |
| Every team scripts deploys differently | One declarative **API** and a tool ecosystem around it |

### Cluster architecture

A cluster has a **control plane**, which stores the desired state and
makes decisions, and **worker nodes**, which run the application Pods.

![Diagram: kubectl, CI/CD, and GitOps tools send desired state to kube-apiserver in the control plane; kube-apiserver is the only component that talks to etcd, which stores cluster state using Raft; cloud-controller-manager, kube-scheduler, and kube-controller-manager all work through the API server, and cloud-controller-manager also calls the cloud provider API for load balancers, disks, and VMs; three worker nodes each run a kubelet, kube-proxy, a container runtime such as containerd, and Pods, and the kubelets watch the API server for their Pods and report status back.](control-plane-and-nodes.svg)

| Component | Where | Responsibility |
|-----------|-------|----------------|
| `kube-apiserver` | Control plane | The REST front door: authentication, authorization (RBAC), admission control, validation, and the only reader and writer of etcd |
| `etcd` | Control plane | Consistent, replicated key-value store holding every object; uses the Raft consensus algorithm |
| `kube-scheduler` | Control plane | Assigns each unscheduled Pod to a node: filters nodes that fit, scores them, binds the best |
| `kube-controller-manager` | Control plane | Runs the built-in controllers: Deployment, ReplicaSet, StatefulSet, Job, node lifecycle, EndpointSlice, namespace, and more |
| `cloud-controller-manager` | Control plane | Cloud-specific controllers: creates load balancers for Services, attaches routes, removes deleted VMs from the cluster |
| `kubelet` | Every node | Watches for Pods bound to its node, starts them through the runtime, runs probes, reports status |
| `kube-proxy` | Every node | Programs iptables or nftables rules so Service virtual IPs reach Pods (IPVS mode is deprecated since 1.35; some network plugins replace kube-proxy) |
| Container runtime | Every node | containerd or CRI-O, called by the kubelet through the Container Runtime Interface (CRI) |
| Add-ons | Cluster | CoreDNS for service names, a CNI network plugin for Pod networking, a CSI driver for volumes, metrics-server |

Three plug-in interfaces keep Kubernetes portable: **CRI** for container
runtimes, **CNI** for networking (Calico, Cilium, the cloud's VPC
plugins), and **CSI** for storage (cloud disks, network file systems).

Two consequences of the design matter in practice. First, **every
component talks only to the API server**; they never call each other. If
the API server is unavailable, running Pods keep running and Services
keep routing, but nothing new can be scheduled or changed. Second, etcd
needs a **quorum**: with `n` members it needs `floor(n/2) + 1` to agree,
so three members tolerate one failure and five tolerate two. Production
control planes therefore run three or five etcd members, which managed
services do for you.

### Desired state and reconciliation

Every Kubernetes object has a **spec** (what you want) and a **status**
(what is true now, written by the system). A **controller** is a loop that
watches objects of some kind and works to make status match spec:

1. Read the desired state from the spec.
2. Observe the actual state through watches on the API server.
3. Compute the difference.
4. Act: create, update, or delete objects to reduce the difference.
5. Repeat on every change and periodically.

![Diagram: a controller loop with four steps; the desired state in the spec says replicas 3 and image taskflow-api:1.4.0; observing the status through API server watches finds 2 Pods running; comparing gives 1 Pod missing; acting creates 1 Pod, which the scheduler binds to a healthy node; the level-triggered loop repeats until actual equals desired; an example timeline shows node-2 failing at t1, its Pod evicted about five minutes later by default, the ReplicaSet seeing 2 of 3, creating a Pod that the scheduler places on node-3, and 3 of 3 running again.](reconciliation-loop.svg)

The loop is **level-triggered**: controllers act on the current state, not
on a history of events. A missed event does no harm, because the next
pass sees the same gap. This is why Kubernetes heals itself and why manual
changes to managed objects get undone: if you delete a Pod owned by a
ReplicaSet, the ReplicaSet creates a new one; if you `kubectl edit` a
Deployment that a GitOps tool manages, the tool reapplies the version in
Git.

Controllers chain together. A Deployment controller manages ReplicaSets,
a ReplicaSet controller manages Pods, the scheduler fills in each Pod's
node, and the kubelet makes containers exist. Each piece reconciles only
its own level, which keeps every controller simple.

Note the timing in the node-failure example: Kubernetes waits before
evicting Pods from a node that stops responding (by default Pods tolerate
an unreachable node for 300 seconds) so that a brief network blip does
not cause a stampede of rescheduling. Running several replicas spread
across nodes is what keeps the service up during those minutes.

### Declarative YAML and `kubectl apply`

Every object has the same four top-level fields:

```yaml
apiVersion: apps/v1        # API group and version
kind: Deployment           # object type
metadata:                  # name, namespace, labels, annotations
  name: taskflow-api
  namespace: taskflow
spec:                      # desired state; its shape depends on the kind
  replicas: 3
```

There are two ways to change a cluster:

| Imperative | Declarative |
|------------|-------------|
| `kubectl create deployment`, `kubectl scale --replicas=5`, `kubectl set image` | Files in Git, applied with `kubectl apply -f` |
| Fast for experiments | Reviewable, repeatable, and recoverable |
| The cluster becomes the only record of what you did | Git is the record; the cluster can be rebuilt from it |

`kubectl apply` computes what changed between your file and the live
object and patches only that. With client-side apply (the default) it
records the last applied file in an annotation; with
`kubectl apply --server-side`, the API server tracks which **field
manager** owns each field and reports conflicts when two tools try to own
the same one. `kubectl diff -f` shows what an apply would change.
GitOps tools such as Argo CD and Flux run this loop continuously from a
Git repository (see
[immutable infrastructure and GitOps](../infrastructure-as-code/immutable-infrastructure-and-gitops.md)).

### Namespaces

A namespace is a scope for names: two Deployments called `api` can exist
in `taskflow-staging` and `taskflow-prod`. Namespaces are also the unit
for RBAC permissions, resource quotas, default limits, and network
policies. A fresh cluster has `default`, `kube-system` (cluster
components), `kube-public`, and `kube-node-lease` (node heartbeats).

Namespaces are not a hard security boundary by themselves: Pods in
different namespaces can talk to each other unless network policies say
otherwise, and all of them share nodes and the kernel. Nodes,
PersistentVolumes, StorageClasses, and namespaces themselves are
**cluster-scoped**: they belong to no namespace.

### API groups and the objects you will use most

| API group/version | Kinds |
|-------------------|-------|
| `v1` (core) | Pod, Service, ConfigMap, Secret, Namespace, PersistentVolumeClaim, ServiceAccount |
| `apps/v1` | Deployment, ReplicaSet, StatefulSet, DaemonSet |
| `batch/v1` | Job, CronJob |
| `networking.k8s.io/v1` | Ingress, IngressClass, NetworkPolicy |
| `autoscaling/v2` | HorizontalPodAutoscaler |
| `policy/v1` | PodDisruptionBudget |
| `rbac.authorization.k8s.io/v1` | Role, ClusterRole, RoleBinding, ClusterRoleBinding |
| `gateway.networking.k8s.io/v1` | Gateway, HTTPRoute (installed as CRDs) |

APIs move from `v1alpha1` to `v1beta1` to `v1`, and old versions are
removed on a published schedule, so manifests must be updated before
cluster upgrades. **Custom resource definitions (CRDs)** let add-ons
define new kinds (a `Certificate`, an `ExternalSecret`), each with its own
controller, which is how most of the ecosystem extends Kubernetes.

### Managed compared with self-managed Kubernetes

| | Managed (EKS, GKE, AKS) | Self-managed (kubeadm, k3s, RKE2) |
|-|------------------------|------------------------------------|
| Control plane and etcd | Run, scaled, and backed up by the provider | You install, back up, and secure them |
| Upgrades | Provider upgrades the control plane; you upgrade nodes and manifests | You upgrade everything |
| Nodes | You manage node groups, or the provider does (GKE Autopilot, EKS Auto Mode) | You manage machines and their OS |
| Cloud integration | Load balancers, disks, IAM built in | You install controllers and drivers |
| Cost | Control plane fee plus nodes | Engineering time plus machines |
| Typical use | Most companies in the cloud | On-premises, edge, air-gapped, special hardware |

Kubernetes ships about three minor versions per year and each receives
roughly a year of patches, so every cluster needs an upgrade routine.
Managed providers enforce it by ending support for old versions.

## When to use and when not to use

| Option | Good fit | Operational cost |
|--------|----------|------------------|
| Docker Compose on one VM | One small app or internal tool | Lowest; no high availability |
| Platform as a service (Render, Fly.io, Heroku) | Web apps and APIs without a platform team | Low; less control over networking and runtime |
| Serverless containers (Cloud Run, ECS on Fargate, Azure Container Apps) | Stateless HTTP services, workers, and jobs | Low to medium; scales to zero on some platforms |
| Managed Kubernetes | Many services, several teams, need for its ecosystem or portability | Medium to high |
| Self-managed Kubernetes | On-premises, edge, regulatory or hardware constraints | Highest |

Choose Kubernetes when you have enough services and teams that a common
platform pays for itself, when you need its extensibility (operators,
service meshes, custom controllers), or when portability across clouds
and data centers matters. Do not choose it for a single API and a
frontend run by two developers: a serverless container platform gives
the same rolling deploys, autoscaling, and HTTPS with a fraction of the
concepts and cost.

## Practical examples

### A local multi-node cluster with kind

```yaml
# kind-config.yaml: one control-plane node and two workers
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
nodes:
  - role: control-plane
  - role: worker
  - role: worker
```

```bash
kind create cluster --name taskflow --config kind-config.yaml
kubectl cluster-info --context kind-taskflow
kubectl get nodes -o wide

# Use a locally built image without pushing it to a registry
docker build -t taskflow-api:dev .
kind load docker-image taskflow-api:dev --name taskflow
```

### Looking at the control plane

```bash
kubectl get pods -n kube-system            # etcd, apiserver, scheduler, CoreDNS, kube-proxy ...
kubectl get --raw='/readyz?verbose'        # API server health checks
kubectl api-resources | head -20           # every kind, its group, and whether it is namespaced
kubectl explain deployment.spec.strategy   # built-in field documentation
kubectl version                            # client and server versions
```

On managed clusters the control plane Pods are hidden from you; only the
node-level components and add-ons appear in `kube-system`.

### Watching reconciliation happen

```bash
kubectl create namespace taskflow
kubectl -n taskflow create deployment taskflow-api \
  --image=ghcr.io/example/taskflow-api:1.4.0 --replicas=3

# Delete a Pod: the ReplicaSet replaces it
kubectl -n taskflow delete pod -l app=taskflow-api --wait=false
kubectl -n taskflow get pods -w

# Take a node out of service: Pods are evicted and rescheduled elsewhere
kubectl cordon taskflow-worker
kubectl drain taskflow-worker --ignore-daemonsets --delete-emptydir-data
kubectl -n taskflow get pods -o wide
kubectl uncordon taskflow-worker

# What did the controllers do?
kubectl -n taskflow events --for deployment/taskflow-api
kubectl -n taskflow get events --sort-by=.metadata.creationTimestamp
```

### A declarative workflow

```yaml
# k8s/namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: taskflow
  labels:
    app.kubernetes.io/part-of: taskflow
```

```bash
kubectl diff -f k8s/                      # preview changes against the live cluster
kubectl apply -f k8s/ --server-side       # apply the whole directory
kubectl get all -n taskflow
```

### Contexts and default namespaces

```bash
kubectl config get-contexts
kubectl config use-context kind-taskflow
kubectl config set-context --current --namespace=taskflow   # stop typing -n
kubectl config current-context
```

Production contexts deserve care: a command meant for staging that runs
against production is a classic incident. Use separate kubeconfig files
or a prompt that shows the current context.

## Best practices

- Keep every manifest in Git and change clusters declaratively; reserve
  imperative commands for experiments and emergencies.
- Use namespaces per application and environment, with RBAC, quotas, and
  network policies on top.
- Run at least two replicas of anything that serves traffic, spread
  across nodes and zones.
- Prefer a managed control plane unless you have a specific reason and
  the people to run one.
- Track API deprecations and upgrade clusters on a regular schedule.
- Remember that the API server is the single point of entry: protect it
  with RBAC, private endpoints, and audit logging.
- Use `kubectl diff` before `kubectl apply` in CI and in manual changes.

## In production

- **A cluster upgrade fails because manifests use removed APIs.**
  *Detect:* `kubectl apply` returns `no matches for kind
  "PodDisruptionBudget" in version "policy/v1beta1"`, or the
  `apiserver_requested_deprecated_apis` metric lists clients still calling
  old versions. *Cause:* the API version was removed in the target release.
  *Fix:* scan manifests and Helm charts with a deprecation checker (such as
  `pluto` or `kubent`), migrate to the stable versions, then upgrade.
- **Changes made with `kubectl edit` keep reverting.**
  *Detect:* the object's `managedFields` or the GitOps tool's history shows
  another manager rewriting the field. *Cause:* a GitOps controller or a
  pipeline reconciles the object from Git. *Fix:* make the change in Git;
  use server-side apply field ownership to see who owns what.
- **Pods on a failed node take five minutes to come back.**
  *Detect:* the node shows `NotReady`, and its Pods stay `Running` or
  `Terminating` for minutes before replacements appear. *Cause:* the
  default 300-second toleration for unreachable nodes delays eviction.
  *Fix:* run several replicas spread across nodes so the service never
  depends on one node; shorten tolerations only for workloads that need
  faster failover.
- **The API server is slow and `kubectl` commands time out.**
  *Detect:* API request latency and etcd disk sync durations
  (`etcd_disk_wal_fsync_duration_seconds`) climb. *Cause:* on self-managed
  clusters, etcd on slow disks or overloaded control plane nodes; on any
  cluster, controllers or scripts listing huge numbers of objects.
  *Fix:* fast dedicated disks for etcd, scaled control plane nodes,
  paginated and watch-based clients.
- **A team accidentally deletes another team's workloads.**
  *Detect:* audit logs show the deletion from a user with cluster-wide
  rights. *Cause:* everything lives in `default` and everyone has
  `cluster-admin`. *Fix:* a namespace per team or application, RBAC roles
  scoped to namespaces, and separate production credentials.
- **A cluster runs an unsupported Kubernetes version.**
  *Detect:* the provider's console warns of end of support, or security
  advisories no longer list fixes for your minor version. *Cause:* upgrades
  were postponed. *Fix:* a scheduled upgrade process: test in staging,
  check deprecations, upgrade the control plane, then node pools.

## Important terminology

- **Orchestrator:** A system that schedules, runs, heals, and connects
  containers across many machines.
- **Control plane:** The components that store state and make decisions
  (API server, etcd, scheduler, controller managers).
- **Node:** A machine (VM or physical) that runs Pods, with a kubelet and
  a container runtime.
- **Desired state / spec:** What you declared; **status:** what the
  system observed.
- **Controller:** A loop that reconciles actual state toward desired
  state for one kind of object.
- **Reconciliation:** Repeatedly comparing actual and desired state and
  acting on the difference.
- **etcd quorum:** The majority of etcd members that must agree for
  writes to succeed.
- **Namespace:** A named scope for objects, RBAC, and quotas.
- **CRD:** A custom resource definition that adds a new kind to the API.
- **CRI, CNI, CSI:** The plug-in interfaces for runtimes, networking, and
  storage.
- **Managed Kubernetes:** A cloud service that runs the control plane for
  you.

## Common mistakes and misconceptions

- Thinking `kubectl apply` executes the deployment. It stores desired
  state; controllers act asynchronously.
- Editing live objects by hand in a GitOps-managed cluster.
- Treating namespaces as a security boundary without RBAC and network
  policies.
- Running one replica and expecting Kubernetes to avoid downtime.
- Choosing Kubernetes for one or two services because "everyone uses it".
- Ignoring API deprecations until an upgrade breaks deploys.
- Assuming the cluster stops working when the API server is down; running
  workloads continue, but nothing can change.

## Revision questions

1. List the control plane components and say what each does.
2. What runs on every worker node, and how does the kubelet know which
   Pods to run?
3. Explain the reconciliation loop using a ReplicaSet with three replicas
   when one Pod is deleted.
4. An etcd cluster has 5 members. How many can fail before writes stop?
   How many for 3 members, and why is 4 not better than 3?
5. What is the difference between imperative and declarative management,
   and why do teams keep manifests in Git?
6. What happens to running Pods if the API server becomes unavailable?
7. Which responsibilities does a managed Kubernetes service take over, and
   which remain with you?
8. Name three situations where a simpler platform than Kubernetes is the
   better choice.

## Further learning

- [Kubernetes documentation: Kubernetes components](https://kubernetes.io/docs/concepts/overview/components/)
- [Kubernetes documentation: Controllers](https://kubernetes.io/docs/concepts/architecture/controller/)
- [Kubernetes documentation: Objects in Kubernetes](https://kubernetes.io/docs/concepts/overview/working-with-objects/)
- [Kubernetes documentation: Namespaces](https://kubernetes.io/docs/concepts/overview/working-with-objects/namespaces/)
- [Kubernetes documentation: Deprecated API migration guide](https://kubernetes.io/docs/reference/using-api/deprecation-guide/)
- [kind: Kubernetes in Docker](https://kind.sigs.k8s.io/)
- Next: [Pods, Deployments, and Services](pods-deployments-and-services.md).
  Back to the [Kubernetes overview](../kubernetes.md).
