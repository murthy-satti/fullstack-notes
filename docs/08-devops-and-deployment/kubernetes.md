# Kubernetes

Kubernetes is an open-source system that runs containers across a
cluster of machines and keeps them running the way you declared. You
describe the desired state in YAML (which image, how many replicas, how
much CPU and memory, how traffic reaches them, how to check their health)
and Kubernetes continuously compares that with reality and fixes the
difference: it schedules containers onto machines, restarts them when
they crash, replaces them when a machine dies, rolls out new versions
gradually, and gives them stable names and load-balanced addresses.

## What Kubernetes provides

- **Scheduling:** places each container on a machine with enough free CPU
  and memory, following your placement rules.
- **Self-healing:** restarts crashed containers, replaces Pods on failed
  nodes, and stops sending traffic to Pods that fail health checks.
- **Rollouts and rollbacks:** replaces old versions gradually and can
  undo a release with one command.
- **Service discovery and load balancing:** a stable DNS name and virtual
  IP for a changing set of Pods.
- **Scaling:** more or fewer replicas by hand or automatically from CPU,
  memory, or custom metrics, and more nodes when the cluster is full.
- **Configuration and secrets:** injected into containers at runtime, kept
  out of images.
- **A common API:** the same manifests work on Amazon EKS, Google GKE,
  Azure AKS, and on-premises clusters, and an ecosystem of tools builds on
  it.

Kubernetes also brings real operating cost: a control plane to run or
pay for, networking and storage plugins, upgrades every few months, and a
large set of concepts every team member needs to understand.

## How a typical deployment works

When you deploy the TaskFlow API:

1. `kubectl apply -f deployment.yaml` sends the manifest to the **API
   server**, which authenticates you, checks your permissions, runs
   admission checks, and validates the object.
2. The API server stores the desired state in **etcd**, the cluster's
   key-value store.
3. The **Deployment controller** notices the new Deployment and creates a
   ReplicaSet; the **ReplicaSet controller** creates the requested number
   of Pods.
4. The **scheduler** sees Pods with no node and binds each to a node that
   has room.
5. The **kubelet** on each chosen node sees its new Pods and asks the
   container runtime (containerd) to pull the image and start the
   containers.
6. The kubelet reports status back. When the readiness probe passes, the
   Pod's address is added to its **Service**, and traffic starts to
   arrive.

![Diagram: kubectl apply sends deployment.yaml to the API server, which performs authentication, authorization, admission, and validation (step 1) and stores the desired state in etcd (step 2); controllers create a ReplicaSet and then Pods (step 3); the scheduler binds each new Pod to a worker node (step 4); the kubelet on that node asks containerd through the CRI to pull images and start containers, producing two taskflow-api Pods (step 5), while kube-proxy programs Service routing rules; the kubelet reports Pod status back to the API server (step 6); every component talks only to the API server.](kubernetes-apply-flow.svg)

## Practical example

```yaml
# k8s/taskflow-api.yaml: three replicas of the API behind a Service
apiVersion: apps/v1
kind: Deployment
metadata:
  name: taskflow-api
spec:
  replicas: 3
  selector:
    matchLabels:
      app: taskflow-api
  template:
    metadata:
      labels:
        app: taskflow-api
    spec:
      containers:
        - name: api
          image: ghcr.io/example/taskflow-api:1.4.0
          ports:
            - containerPort: 3000
          readinessProbe:
            httpGet:
              path: /readyz
              port: 3000
---
apiVersion: v1
kind: Service
metadata:
  name: taskflow-api
spec:
  selector:
    app: taskflow-api
  ports:
    - port: 80
      targetPort: 3000
```

```bash
kubectl apply -f k8s/taskflow-api.yaml
kubectl get deployments,pods,services -l app=taskflow-api
kubectl delete pod -l app=taskflow-api --wait=false   # watch them come back
kubectl get pods -l app=taskflow-api --watch
```

Deleting the Pods does not shut the API down: the ReplicaSet notices that
fewer than three exist and creates replacements within seconds. That is
reconciliation, the core idea of Kubernetes. A production version of this
manifest adds resource requests, liveness and startup probes, security
settings, and configuration, built up in the lessons below.

## Kubernetes topic map

**Foundations**

- [Orchestration fundamentals](kubernetes/orchestration-fundamentals.md)
- [Pods, Deployments, and Services](kubernetes/pods-deployments-and-services.md)
- [Configuration and Secrets](kubernetes/configuration-and-secrets.md)

**Running reliably**

- [Health probes and rolling updates](kubernetes/health-probes-and-rolling-updates.md)
- [Scaling and resource management](kubernetes/scaling-and-resource-management.md)

**Traffic, packaging, and other workloads**

- [Ingress, networking, and Helm](kubernetes/ingress-networking-and-helm.md)
- [Stateful workloads and Jobs](kubernetes/stateful-workloads-and-jobs.md)

**Review**

- [Kubernetes interview questions and answers](kubernetes/interview-questions-and-answers.md) · [cheat sheet](kubernetes/cheat-sheet.md)

## Developer perspective and common misconceptions

As an application developer on a Kubernetes platform, your job is to make
the app a good citizen: stateless processes, configuration from the
environment, health endpoints that mean something, graceful handling of
`SIGTERM`, honest resource requests, and logs on stdout. Kubernetes can
only keep promises the application helps it keep.

- Kubernetes is not required to run containers. One service and a small
  team are usually better served by a managed container platform (Cloud
  Run, ECS with Fargate, Azure Container Apps) or Compose on a VM.
- Kubernetes does not make an application highly available by itself. A
  single replica, a missing readiness probe, or a database on one disk is
  still a single point of failure.
- Kubernetes does not need Docker on its nodes; it runs the same OCI
  images through containerd or CRI-O.
- `kubectl apply` does not run anything directly. It records desired
  state; controllers and kubelets make it happen asynchronously.
- Secrets are not encrypted just because they are Kubernetes Secrets:
  their values are only base64-encoded unless the cluster encrypts them at
  rest.

## Further learning

- [Kubernetes documentation: Overview](https://kubernetes.io/docs/concepts/overview/)
- [Kubernetes documentation: Cluster components](https://kubernetes.io/docs/concepts/overview/components/)
- [Kubernetes tutorials: Kubernetes basics](https://kubernetes.io/docs/tutorials/kubernetes-basics/)
- [kubectl quick reference](https://kubernetes.io/docs/reference/kubectl/quick-reference/)
- [Docker](docker.md) for building the images Kubernetes runs
- [Kubernetes interview questions and answers](kubernetes/interview-questions-and-answers.md)
