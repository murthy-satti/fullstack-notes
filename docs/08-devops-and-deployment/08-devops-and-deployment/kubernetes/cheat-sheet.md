# Kubernetes Cheat Sheet

Quick revision of the Kubernetes lessons, for use before an interview, a
deployment, or a debugging task. Commands assume `taskflow` is the current
namespace.

## Key commands

| Command | What it does |
|---|---|
| `kubectl diff -f k8s/`, then `kubectl apply -f k8s/ --server-side` | Preview against the live cluster, then apply |
| `kubectl describe pod <pod>` | Events: scheduling, image pulls, probe failures |
| `kubectl logs <pod> --previous` | Logs from the crashed container's last run |
| `kubectl debug -it <pod> --image=busybox:1.37 --target=api` | Ephemeral debug container in a running Pod |
| `kubectl port-forward svc/taskflow-api 8080:80` | Reach a ClusterIP Service from your machine |
| `kubectl rollout status deploy/taskflow-api --timeout=5m` | Wait for a rollout; fails if it does not complete |
| `kubectl rollout undo deploy/taskflow-api` | Back to the previous revision (or `--to-revision=3`) |
| `kubectl rollout restart deploy/taskflow-api` | Replace all Pods, for example after a config change |
| `kubectl drain <node> --ignore-daemonsets --delete-emptydir-data` | Evict Pods, respecting PDBs, before node maintenance |
| `kubectl top pods`, `kubectl describe hpa taskflow-api` | Usage (needs metrics-server); HPA conditions and events |
| `helm upgrade --install taskflow-api charts/taskflow-api -f <values file> --wait --timeout 5m` | Idempotent install or upgrade; fails if not ready |
| `helm rollback taskflow-api 2` | Roll back to revision 2 (`helm history` lists them) |

## Key configuration

```yaml
# k8s/api-deployment.yaml (excerpt): rollout, probes, resources, shutdown
spec:
  replicas: 4
  strategy:
    rollingUpdate: {maxSurge: 1, maxUnavailable: 0}
  template:
    spec:
      terminationGracePeriodSeconds: 30
      containers:
        - name: api
          image: ghcr.io/example/taskflow-api:1.4.0
          ports: [{name: http, containerPort: 3000}]
          readinessProbe: {httpGet: {path: /readyz, port: http}, periodSeconds: 5}
          livenessProbe: {httpGet: {path: /healthz, port: http}, periodSeconds: 10}
          resources:
            requests: {cpu: 250m, memory: 384Mi}
            limits: {memory: 384Mi}      # no CPU limit: no throttling
          lifecycle:
            preStop: {sleep: {seconds: 5}}
```

## Decision guide

| If you need | Choose | Why |
|---|---|---|
| A stateless API or web app | Deployment + ClusterIP Service | Pods are replaced automatically; Services route by label |
| HTTP(S) from the internet | Gateway API, or Ingress on a maintained controller | One entry point; Ingress is frozen and ingress-nginx is retired |
| Stable identity and storage per replica | StatefulSet + headless Service | Only for software that replicates itself; prefer a managed database |
| Finite or scheduled work | Job, CronJob | Run migrations as a Job before the rollout, not in init containers |
| Settings, not secrets | ConfigMap | Env vars, or a mounted file that can change live |
| Secrets | A secret manager synced by External Secrets Operator, or Sealed Secrets | Secrets are base64, not encrypted; never commit them |
| Variable load | HPA on CPU with at least 2 to 3 replicas; KEDA for queues | Utilization is computed against requests |
| Unknown requests | VPA in `Off` mode, or p95 usage plus headroom | Do not combine HPA and VPA on the same metric |
| One team, a few services | PaaS, serverless containers, or Compose on a VM | Kubernetes pays off with many services and teams |

## Numbers and defaults to remember

| Item | Value |
|---|---|
| Probes | `periodSeconds` 10, `timeoutSeconds` 1, `failureThreshold` 3, `initialDelaySeconds` 0 |
| Rolling update | `maxSurge` 25% (rounded up), `maxUnavailable` 25% (rounded down) |
| Deployment | `progressDeadlineSeconds` 600, `revisionHistoryLimit` 10 |
| Shutdown | 30 s grace period from deletion, including `preStop`, then `SIGKILL` |
| HPA | Every 15 s; desired = ceil(current replicas x current / target); tolerance 0.1; scale-down window 300 s |
| Job | `backoffLimit` 6; retries after 10 s, 20 s, 40 s, capped at 6 min |
| CronJob | Keeps 3 successful and 1 failed Job; `concurrencyPolicy: Allow` |
| ConfigMap or Secret | 1 MiB at most |
| CrashLoopBackOff | Restart delay doubles, up to 5 min |
| OOMKilled | Exit code 137 |
| Node lost | Pods evicted after 300 s |
| etcd quorum | floor(n/2) + 1: 3 members survive 1 failure, 5 survive 2 |
| Helm 4 | `--atomic` is now `--rollback-on-failure` |

## Top mistakes

- **Checking dependencies in liveness probes.** Keep liveness cheap; put
  dependency checks in readiness.
- **Expecting Kubernetes to roll back a failed rollout.** Gate CI on
  `rollout status --timeout` and run `rollout undo` when it fails.
- **Exiting at once on `SIGTERM`.** Add a short `preStop` sleep, drain
  in-flight requests, and finish within the grace period.
- **Leaving requests unset.** Set CPU and memory requests; BestEffort Pods
  are evicted first and the HPA cannot compute utilization.
- **Treating base64 Secrets as encrypted, or committing them.** Sync from a
  secret manager or use Sealed Secrets, with encryption at rest.
- **Deploying `latest` tags.** Use immutable version tags so rollouts and
  rollbacks are predictable.
- **A PDB with `minAvailable` equal to the replica count.** Use
  `maxUnavailable: 1` so node drains can proceed.

## Where to go deeper

- [Orchestration fundamentals](orchestration-fundamentals.md)
- [Pods, Deployments, and Services](pods-deployments-and-services.md)
- [Configuration and secrets](configuration-and-secrets.md)
- [Health probes and rolling updates](health-probes-and-rolling-updates.md)
- [Scaling and resource management](scaling-and-resource-management.md)
- [Ingress, networking, and Helm](ingress-networking-and-helm.md)
- [Stateful workloads and Jobs](stateful-workloads-and-jobs.md)
- [Interview questions and answers](interview-questions-and-answers.md)

Back to the [Kubernetes overview](../kubernetes.md).
