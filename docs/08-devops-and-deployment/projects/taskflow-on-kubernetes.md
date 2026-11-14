# TaskFlow on Kubernetes

Run TaskFlow API on a local Kubernetes cluster with proper configuration,
probes, resource settings, and autoscaling. Under load you watch it scale,
roll out a new image, roll back, and keep serving requests the whole time;
the result is packaged as a Helm chart.

## Why this project helps

- Builds working knowledge of the objects every Kubernetes job uses:
  Deployments, Services, ConfigMaps, Secrets, probes, and autoscalers.
- Improves **availability**: readiness probes and rolling updates are what
  keep requests succeeding during deploys and failures.
- Improves **cost and capacity control**: requests, limits, and an HPA match
  resources to real load.
- Gives you a live demo for interviews: "here is a rollback under load".

## What you need

- kind or minikube, `kubectl`, and Helm on your laptop (all free).
- metrics-server installed in the cluster, because the HPA needs it.
- A load-testing tool such as k6.
- Builds on [Production Image](production-image.md).

## How to do it

1. Create a cluster with `kind create cluster` (or `minikube start`) and
   load or pull the TaskFlow image.
2. Write a Deployment and a Service for the API and a StatefulSet or simple
   Deployment for MongoDB; see
   [pods, Deployments, and Services](../kubernetes/pods-deployments-and-services.md).
3. Move settings into a ConfigMap and the database password into a Secret,
   as in [configuration and secrets](../kubernetes/configuration-and-secrets.md).
4. Add readiness and liveness probes with sensible thresholds; see
   [health probes and rolling updates](../kubernetes/health-probes-and-rolling-updates.md).
5. Set CPU and memory requests and limits, install metrics-server, and add
   an `autoscaling/v2` HorizontalPodAutoscaler; see
   [scaling and resource management](../kubernetes/scaling-and-resource-management.md).
6. Generate load with k6 and watch `kubectl get hpa -w` as replicas are
   added and later removed.
7. Roll out a new image tag, follow it with `kubectl rollout status`, then
   run `kubectl rollout undo` while the load test keeps running.
8. Package the manifests as a chart with `helm create`, check it with
   `helm lint` and `helm template`, and deploy with `helm upgrade --install`;
   see [ingress, networking, and Helm](../kubernetes/ingress-networking-and-helm.md).

## Done when

- `kubectl get pods` shows all replicas ready and the API answers through
  the Service.
- No value in the manifests is hard-coded that belongs in a ConfigMap or
  Secret.
- Under load, the HPA adds replicas and removes them afterwards.
- A rollout and a rollback complete with zero failed requests in the load
  test results.
- `helm upgrade --install` reproduces the whole deployment.

## Stretch goals

- Add an Ingress or Gateway API route with a hostname.
- Add a PodDisruptionBudget and drain a node during the load test.
- Run a Job that seeds the database before the API starts.

## Lessons to use

- [Kubernetes](../kubernetes.md)
- [Orchestration fundamentals](../kubernetes/orchestration-fundamentals.md)
- [Stateful workloads and Jobs](../kubernetes/stateful-workloads-and-jobs.md)
- [Load testing with k6](../performance-and-reliability-testing/load-testing-with-k6.md)

Back to [all projects](../projects.md).
