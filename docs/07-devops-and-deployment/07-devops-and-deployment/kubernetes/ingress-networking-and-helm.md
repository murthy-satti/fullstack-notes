# Ingress, Networking, and Helm

Services give Pods stable addresses inside the cluster. Getting HTTP
traffic in from the internet, securing it with TLS, controlling which
Pods may talk to which, and packaging all the YAML so it can be installed
per environment are the next problems. This lesson covers Ingress and
ingress controllers, TLS certificates with cert-manager, the Gateway API
that succeeds Ingress, NetworkPolicies, and the two packaging tools almost
every team uses: Helm (charts, values, templates, releases, upgrades, and
rollbacks) and Kustomize (bases and overlays), with guidance on when to
use which.

## Why it matters

The entry point is where every user request first meets your cluster, so
mistakes there are visible immediately: an Ingress no controller picks
up returns 404, a certificate that failed to renew takes the site down,
and controller-specific annotations lock you into one implementation.
Inside the cluster, the default network is fully open, so one compromised
Pod can reach every database unless NetworkPolicies say otherwise. And
without a packaging tool, every environment ends up with hand-edited
copies of the same manifests that drift apart.

The ecosystem has also shifted. The Gateway API is now the recommended
model for new traffic routing work, and the widely used community
ingress-nginx controller has been retired, so teams need to understand
both the old and the new model.

## Real-world usage

- **Kubernetes SIG Network.** The announcement
  [Ingress NGINX Retirement: What You Need to Know](https://kubernetes.io/blog/2025/11/11/ingress-nginx-retirement/)
  explains that the community ingress-nginx controller received only
  best-effort maintenance until March 2026, with no further releases or
  security fixes afterwards, and recommends migrating to the Gateway API
  or another maintained controller.
- **Kubernetes project.** The post
  [Gateway API v1.0: GA Release](https://kubernetes.io/blog/2023/10/31/gateway-api-ga/)
  describes the role-oriented resources (GatewayClass, Gateway, HTTPRoute)
  that standardize features such as traffic splitting and header matching,
  which previously needed controller-specific annotations on Ingress.
- **cert-manager.** The [cert-manager documentation](https://cert-manager.io/docs/)
  shows how issuers obtain certificates from ACME providers such as Let's
  Encrypt, store them in Secrets used by Ingresses and Gateways, and renew
  them automatically before they expire.
- **Helm.** The [Helm documentation](https://helm.sh/docs/) describes
  charts, values, releases, and the upgrade and rollback model used by
  most publicly distributed Kubernetes software, which is published as
  Helm charts.

**Popular tools and providers:** Envoy Gateway, Istio, Cilium, NGINX
Gateway Fabric and the F5 NGINX Ingress Controller, Traefik, HAProxy, Kong,
the AWS Load Balancer Controller, GKE Gateway, cert-manager, Calico and
Cilium for NetworkPolicies, Helm, Kustomize, and GitOps tools (Argo CD,
Flux) that apply both.

## How it works

### Getting traffic into the cluster

| Option | How | Suits |
|--------|-----|-------|
| `NodePort` Service | A port on every node | Labs, bare metal behind an external load balancer |
| `LoadBalancer` Service | One cloud load balancer per Service (L4) | A few TCP or UDP services |
| Ingress | One HTTP(S) entry point; rules route by host and path to ClusterIP Services | HTTP applications (stable API, frozen for new features) |
| Gateway API | Gateway (listeners, TLS) plus Routes (HTTPRoute, GRPCRoute, and others) | HTTP and other protocols; the recommended model for new work |

### Ingress and ingress controllers

An **Ingress** is only a set of routing rules: hostnames, paths, the
backend Service for each, and TLS settings. It does nothing until an
**ingress controller** (a proxy such as Envoy, NGINX, HAProxy, or a cloud
load balancer controller) watches Ingress objects and configures itself
to implement them. A cluster can run several controllers;
`spec.ingressClassName` says which one should handle an Ingress.

![Diagram: a browser sends HTTPS to api.example.com or app.example.com, which DNS points at a cloud load balancer created for the ingress controller; the controller Pods terminate TLS using a Secret that cert-manager obtains from Let's Encrypt over ACME and renews, and route by host and path according to watched Ingress or HTTPRoute rules, sending api.example.com to the taskflow-api Service and its two Pods and app.example.com to the taskflow-web Service and its Pod; many controllers read EndpointSlices and send traffic straight to Pod IPs.](ingress-request-path.svg)

Things to know about Ingress:

- `pathType` is `Prefix` (matches path segments: `/api` matches `/api/v1`
  but not `/apiv1`), `Exact`, or `ImplementationSpecific`.
- Anything beyond hosts, paths, and TLS (timeouts, body-size limits,
  rewrites, rate limits, canary weights) is configured with
  **controller-specific annotations**, so an Ingress written for one
  controller usually does not behave the same on another.
- The Ingress API is stable but frozen: it receives no new features,
  which go into the Gateway API instead.
- The community ingress-nginx controller was retired after March 2026.
  Existing installations keep working but receive no fixes, so clusters
  running it should migrate to the Gateway API or another maintained
  controller (the `ingress2gateway` tool converts Ingress objects to
  Gateway API resources).

### TLS with cert-manager

cert-manager adds certificate resources to the cluster and automates the
ACME protocol used by Let's Encrypt and other certificate authorities:

1. An `Issuer` (namespaced) or `ClusterIssuer` describes a certificate
   authority and how to prove domain control: an **HTTP-01** challenge
   (a file served over port 80 through the ingress) or a **DNS-01**
   challenge (a TXT record, required for wildcard certificates).
2. A `Certificate` lists the DNS names and the Secret to write. An
   annotation such as `cert-manager.io/cluster-issuer` on an Ingress
   creates the Certificate for you from its `tls` section.
3. cert-manager completes the challenge, stores the certificate and key
   in a `kubernetes.io/tls` Secret, and renews it automatically, by
   default when two thirds of its lifetime has passed.

How certificates and ACME challenges work in general is covered in
[obtaining and renewing certificates](../ssl-certificates/obtaining-and-renewing-certificates.md),
and where to terminate TLS in
[TLS termination and troubleshooting](../ssl-certificates/tls-termination-and-troubleshooting.md).

### The Gateway API

The Gateway API splits the entry point into resources owned by different
roles:

| Resource | Owned by | Defines |
|----------|----------|---------|
| `GatewayClass` | Infrastructure provider | Which implementation runs the gateways (like `IngressClass`) |
| `Gateway` | Cluster operators | Listeners: ports, protocols, hostnames, TLS certificates, which namespaces may attach routes |
| `HTTPRoute`, `GRPCRoute` (and other routes) | Application teams | Hostnames, matches on path, headers, query, and method, filters (redirects, header changes), and weighted backends |
| `ReferenceGrant` | Owner of the referenced object | Permission for a route in one namespace to reference a Service or Secret in another |

Compared with Ingress, features that used to need annotations are part of
the portable API: weighted traffic splitting for canaries, header-based
routing, redirects, and request mirroring. Application teams can manage
their own routes without access to the shared gateway, and the same
manifests work across implementations that support the features used.
The API is installed as CRDs and implemented by many projects and cloud
providers.

### NetworkPolicies

By default every Pod can connect to every other Pod in the cluster. A
**NetworkPolicy** selects Pods (by label, in its namespace) and lists the
traffic allowed to them (`ingress`) or from them (`egress`), by Pod
selector, namespace selector, IP block, and port.

- A Pod selected by any policy for a direction becomes **default deny**
  for that direction; only listed traffic is allowed. Pods not selected by
  any policy stay fully open.
- Policies are additive: the allowed traffic is the union of all
  policies that select the Pod. There is no "deny" rule.
- Policies are enforced by the network plugin (Calico, Cilium, most cloud
  CNIs). On a plugin that does not implement them, they are accepted and
  silently ignored.
- When you add egress rules, remember DNS: Pods must still reach CoreDNS
  on port 53 (UDP and TCP) to resolve Service names.

A common baseline is a default-deny policy per namespace plus explicit
allows: from the ingress controller to the web and API Pods, from the API
to MongoDB, and DNS for everyone.

### Helm

Helm packages Kubernetes manifests as **charts**:

- `Chart.yaml`: the chart's name, `version` (of the chart), and
  `appVersion` (of the application it deploys); `apiVersion: v2` for
  current charts.
- `values.yaml`: default configuration values.
- `templates/`: manifests written as Go templates with Helm's helper
  functions, plus shared snippets in `_helpers.tpl`.
- Optional dependencies on other charts, and hooks (for example a
  migration Job that runs before an upgrade).

Installing a chart with a set of values creates a **release**; every
install, upgrade, or rollback creates a new **revision**, recorded as a
Secret in the release's namespace.

![Diagram: the chart taskflow-api contains Chart.yaml, values.yaml with defaults, and templates for the Deployment, Service, and HPA plus _helpers.tpl; values from values-production.yaml and --set image.tag=1.5.0 override the defaults, in the order chart values, then -f files, then --set; helm upgrade --install merges the values and renders plain manifests, which the Kubernetes API applies; Helm records each revision of the release as a Secret, with revisions 1 (1.4.0) and 2 (1.4.1) superseded and revision 3 (1.5.0) deployed; helm rollback taskflow-api 2 re-applies revision 2 and records it as revision 4.](helm-chart-to-release.svg)

| Command | Purpose |
|---------|---------|
| `helm upgrade --install <release> <chart> -f values.yaml` | Install or upgrade idempotently (the usual CI command) |
| `helm template <release> <chart> -f values.yaml` | Render manifests locally without installing |
| `helm lint <chart>` | Check a chart for problems |
| `helm list -n <ns>`, `helm history <release>` | See releases and their revisions |
| `helm rollback <release> <revision>` | Re-apply an earlier revision as a new revision |
| `helm get values <release>` | Show the values a release was installed with |
| `helm package`, `helm push <chart>.tgz oci://<registry>/<path>` | Publish charts to an OCI registry |

Helm 4, released in November 2025, keeps these core commands, and
existing `apiVersion: v2` charts work unchanged. Some flags changed when
moving from Helm 3: automatic rollback on a failed upgrade, `--atomic` in
Helm 3, is `--rollback-on-failure` in Helm 4, and `--wait` now selects a
wait strategy (plain `--wait` waits for resources to become ready).

### Kustomize

Kustomize, built into `kubectl` (`kubectl apply -k`), customizes plain
YAML without templates. A **base** holds the common manifests; each
**overlay** references the base and applies changes: patches, a
namespace, labels, name prefixes or suffixes, image tag overrides, and
generated ConfigMaps and Secrets with content-hash names. The output is
always valid Kubernetes YAML you can read, and there is no release state
stored in the cluster.

### Choosing between Helm, Kustomize, and plain manifests

| | Plain manifests | Kustomize | Helm |
|-|-----------------|-----------|------|
| Learning curve | None | Low | Moderate (templating) |
| Environment differences | Copies of files | Overlays and patches | Values files |
| Distributing software to others | Poor | Possible | Excellent: the ecosystem standard |
| Release history and rollback | None (Git history) | None (Git history) | Built in |
| Readability of what is applied | Direct | Direct | Requires rendering |
| Typical use | Tiny projects | Your own services, GitOps | Third-party software, shared internal charts |

Many teams install third-party software (cert-manager, monitoring, the
gateway implementation) with Helm and manage their own services with
Kustomize overlays or a small internal chart, all applied by a GitOps tool
(see [immutable infrastructure and GitOps](../infrastructure-as-code/immutable-infrastructure-and-gitops.md)).

## When to use and when not to use

| Need | Use |
|------|-----|
| HTTP(S) routing for a new cluster | Gateway API with a maintained implementation |
| Existing Ingress resources | Keep them on a maintained controller; plan a Gateway API migration |
| Automatic TLS certificates | cert-manager with ACME (HTTP-01, or DNS-01 for wildcards) |
| Canary traffic split at the edge | HTTPRoute `backendRefs` weights (or Argo Rollouts, Flagger) |
| Limit which Pods can reach the database | NetworkPolicies with a CNI that enforces them |
| Install third-party software | Its Helm chart |
| Per-environment differences for your services | Kustomize overlays or Helm values |

Avoid one `LoadBalancer` Service per HTTP application, avoid relying on
controller annotations for behaviour you need to stay portable, and avoid
deeply nested Helm templating for a single internal service where a
Kustomize overlay would be clearer.

## Practical examples

### An Ingress for the TaskFlow API and web app

```yaml
# k8s/ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: taskflow
  namespace: taskflow
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
spec:
  ingressClassName: nginx          # the IngressClass of your installed controller
  tls:
    - hosts:
        - api.example.com
        - app.example.com
      secretName: taskflow-tls
  rules:
    - host: api.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: taskflow-api
                port:
                  name: http
    - host: app.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: taskflow-web
                port:
                  number: 80
```

### A ClusterIssuer for Let's Encrypt

```yaml
# k8s/cluster-issuer.yaml
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: ops@example.com
    privateKeySecretRef:
      name: letsencrypt-prod-account-key
    solvers:
      - http01:
          ingress:
            ingressClassName: nginx
```

```bash
kubectl -n taskflow get certificate                     # READY should become True
kubectl -n taskflow describe certificate taskflow-tls   # events, renewal time
kubectl get challenges -A                               # ACME challenges in progress
```

Test against Let's Encrypt's staging endpoint first; the production
endpoint enforces rate limits.

### The same routing with the Gateway API, including a canary

```yaml
# k8s/gateway.yaml: owned by the platform team
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: public
  namespace: infra
spec:
  gatewayClassName: example-gateway-class   # provided by your Gateway API implementation
  listeners:
    - name: https
      protocol: HTTPS
      port: 443
      hostname: "*.example.com"
      tls:
        mode: Terminate
        certificateRefs:
          - name: wildcard-example-com-tls
      allowedRoutes:
        namespaces:
          from: All
---
# k8s/api-route.yaml: owned by the TaskFlow team
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: taskflow-api
  namespace: taskflow
spec:
  parentRefs:
    - name: public
      namespace: infra
      sectionName: https
  hostnames:
    - api.example.com
  rules:
    - matches:
        - path:
            type: PathPrefix
            value: /
      backendRefs:
        - name: taskflow-api
          port: 80
          weight: 90
        - name: taskflow-api-canary
          port: 80
          weight: 10
```

Ten percent of requests go to the canary Service, with no
controller-specific annotation. Shifting the weights step by step is the
canary process described in
[rolling, blue-green, and canary deployments](../deployment-strategies/rolling-blue-green-and-canary.md).

### NetworkPolicies: default deny with explicit allows

```yaml
# k8s/network-policies.yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny
  namespace: taskflow
spec:
  podSelector: {}                  # every Pod in the namespace
  policyTypes: ["Ingress", "Egress"]
---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-dns
  namespace: taskflow
spec:
  podSelector: {}
  policyTypes: ["Egress"]
  egress:
    - to:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: kube-system
          podSelector:
            matchLabels:
              k8s-app: kube-dns
      ports:
        - protocol: UDP
          port: 53
        - protocol: TCP
          port: 53
---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: api-traffic
  namespace: taskflow
spec:
  podSelector:
    matchLabels:
      app.kubernetes.io/name: taskflow-api
  policyTypes: ["Ingress", "Egress"]
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: ingress-controller
      ports:
        - protocol: TCP
          port: 3000
  egress:
    - to:
        - podSelector:
            matchLabels:
              app.kubernetes.io/name: mongo
      ports:
        - protocol: TCP
          port: 27017
```

The API now accepts connections only from the ingress controller's
namespace on port 3000 and may connect only to MongoDB and DNS. Policies
refer to the **container port** (3000), not the Service port (80). The
`kubernetes.io/metadata.name` label is set automatically on every
namespace, and CoreDNS Pods carry the `k8s-app: kube-dns` label in most
distributions.

### A small Helm chart for the API

```yaml
# charts/taskflow-api/Chart.yaml
apiVersion: v2
name: taskflow-api
description: TaskFlow API
type: application
version: 0.3.0
appVersion: "1.5.0"
```

```yaml
# charts/taskflow-api/values.yaml
replicaCount: 3
image:
  repository: ghcr.io/example/taskflow-api
  tag: ""                     # defaults to appVersion
resources:
  requests:
    cpu: 250m
    memory: 384Mi
  limits:
    memory: 384Mi
config:
  LOG_LEVEL: info
```

```yaml
# charts/taskflow-api/templates/deployment.yaml (excerpt)
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "taskflow-api.fullname" . }}
  labels:
    {{- include "taskflow-api.labels" . | nindent 4 }}
spec:
  replicas: {{ .Values.replicaCount }}
  selector:
    matchLabels:
      {{- include "taskflow-api.selectorLabels" . | nindent 6 }}
  template:
    metadata:
      labels:
        {{- include "taskflow-api.selectorLabels" . | nindent 8 }}
      annotations:
        checksum/config: {{ include (print $.Template.BasePath "/configmap.yaml") . | sha256sum }}
    spec:
      containers:
        - name: api
          image: "{{ .Values.image.repository }}:{{ .Values.image.tag | default .Chart.AppVersion }}"
          ports:
            - name: http
              containerPort: 3000
          envFrom:
            - configMapRef:
                name: {{ include "taskflow-api.fullname" . }}
          {{- with .Values.resources }}
          resources:
            {{- toYaml . | nindent 12 }}
          {{- end }}
```

```yaml
# charts/taskflow-api/values-production.yaml
replicaCount: 4
config:
  LOG_LEVEL: warn
```

```bash
helm lint charts/taskflow-api
helm template taskflow-api charts/taskflow-api -f charts/taskflow-api/values-production.yaml \
  | kubectl diff -n taskflow -f -                      # preview against the cluster

helm upgrade --install taskflow-api charts/taskflow-api \
  -n taskflow --create-namespace \
  -f charts/taskflow-api/values-production.yaml \
  --set image.tag=1.5.0 \
  --wait --timeout 5m

helm history taskflow-api -n taskflow
helm rollback taskflow-api 2 -n taskflow

helm package charts/taskflow-api
helm push taskflow-api-0.3.0.tgz oci://ghcr.io/example/charts
```

The helper templates (`taskflow-api.fullname`, `labels`,
`selectorLabels`) live in `_helpers.tpl`, which `helm create` generates.
`--wait` makes the command wait until the resources are ready, so CI fails
when the new version does not become healthy.

### Kustomize base and overlay

```yaml
# k8s/base/kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - api-deployment.yaml
  - api-service.yaml
labels:
  - pairs:
      app.kubernetes.io/part-of: taskflow
```

```yaml
# k8s/overlays/production/kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
namespace: taskflow
resources:
  - ../../base
  - ingress.yaml
images:
  - name: ghcr.io/example/taskflow-api
    newTag: "1.5.0"
patches:
  - target:
      kind: Deployment
      name: taskflow-api
    patch: |-
      - op: replace
        path: /spec/replicas
        value: 4
```

```bash
kubectl kustomize k8s/overlays/production     # render
kubectl apply -k k8s/overlays/production      # apply
```

## Best practices

- Use one entry point (a Gateway or an ingress controller) for HTTP
  services, with ClusterIP Services behind it.
- Prefer the Gateway API for new routing; keep controller-specific
  annotations to a minimum.
- Run a maintained controller; migrate off retired ones such as the
  community ingress-nginx.
- Automate certificates with cert-manager and monitor certificate expiry.
- Start every namespace with default-deny NetworkPolicies, then allow
  DNS and the required flows; confirm your CNI enforces them.
- Keep Helm charts simple, lint them, render them in CI, and install with
  `upgrade --install --wait`.
- Pin chart versions for third-party software and review their values.
- Use Kustomize overlays (or Helm values) for environment differences,
  never copies of whole manifests.
- Apply everything from Git, ideally through a GitOps controller.

## In production

- **An Ingress returns 404 for every path.**
  *Detect:* the response comes from the controller's default backend, and
  `kubectl describe ingress` shows no address or events. *Cause:* no
  controller claims the Ingress: `ingressClassName` is missing or names a
  class nobody runs, or the host header does not match. *Fix:* set the
  right `ingressClassName` (`kubectl get ingressclass`) and check the host.
- **The site returns 503 Service Unavailable.**
  *Detect:* controller logs show no healthy upstreams for the Service.
  *Cause:* the backend Service has no ready endpoints (selector mismatch or
  failing readiness) or the port name or number is wrong. *Fix:* check
  `kubectl get endpointslices` for the Service and the Ingress backend port.
- **A certificate is never issued.**
  *Detect:* `kubectl get certificate` stays `READY False`, and `kubectl
  describe challenge` shows the HTTP-01 self-check failing. *Cause:* DNS
  does not point at the load balancer yet, port 80 is blocked, or the
  solver uses the wrong ingress class. *Fix:* fix DNS and firewall rules,
  match the solver's class, and test with the staging issuer.
- **Everything breaks after applying a default-deny policy.**
  *Detect:* Pods log `getaddrinfo EAI_AGAIN` or time out on every
  hostname. *Cause:* egress to CoreDNS is now denied. *Fix:* add an egress
  policy allowing UDP and TCP port 53 to `kube-dns` before or with the
  default deny.
- **NetworkPolicies seem to have no effect.**
  *Detect:* a test Pod can still reach the database despite a policy.
  *Cause:* the cluster's CNI does not enforce NetworkPolicies, or the
  policy's selectors do not match the Pods. *Fix:* use an enforcing CNI
  (or enable enforcement on the managed service) and verify the labels.
- **`helm upgrade` fails with "another operation is in progress".**
  *Detect:* `helm history` shows the latest revision as
  `pending-upgrade` or `pending-install`. *Cause:* an earlier upgrade was
  interrupted (a cancelled CI job or a timeout). *Fix:* roll back to the
  last `deployed` revision with `helm rollback`, then rerun the upgrade.
- **The cluster still runs the retired community ingress-nginx.**
  *Detect:* `kubectl get pods -A` shows `ingress-nginx-controller` Pods.
  *Cause:* the migration was deferred. *Fix:* plan a move to a Gateway API
  implementation or another maintained controller, translating
  annotations and testing each host before switching DNS.

## Important terminology

- **Ingress:** An object with HTTP routing rules (hosts, paths, TLS) for
  a controller to implement.
- **Ingress controller:** The proxy that implements Ingress rules.
- **IngressClass:** Names a controller so an Ingress can select it.
- **Gateway API:** The successor to Ingress: GatewayClass, Gateway, and
  Route resources split by role.
- **HTTPRoute:** A Gateway API resource that routes HTTP requests by host,
  path, and headers to weighted backends.
- **cert-manager:** A controller that obtains and renews TLS certificates
  and stores them in Secrets.
- **ACME / HTTP-01 / DNS-01:** The protocol and challenge types used to
  prove domain control to certificate authorities.
- **NetworkPolicy:** A rule set selecting Pods and allowing specific
  ingress and egress traffic.
- **Helm chart / release / revision:** A package of templates; one
  installed instance of it; one version of that installation.
- **Values:** The configuration a Helm chart is rendered with.
- **Kustomize base / overlay:** Shared manifests and the
  environment-specific changes applied on top.

## Common mistakes and misconceptions

- Creating an Ingress without an ingress controller running.
- Assuming annotations work the same on every controller.
- Exposing every HTTP service with its own `LoadBalancer`.
- Forgetting DNS egress when adding default-deny policies.
- Assuming NetworkPolicies are enforced on any cluster.
- Writing policies against Service ports instead of container ports.
- Hand-editing resources that a Helm release manages, which the next
  upgrade overwrites.
- Building complex logic into Helm templates for one internal service.

## Revision questions

1. What is the difference between an Ingress and an ingress controller,
   and what does `ingressClassName` do?
2. Why is the Gateway API split into GatewayClass, Gateway, and Route
   resources?
3. Walk through how cert-manager obtains a certificate for
   `api.example.com` with an HTTP-01 challenge.
4. A namespace has a default-deny policy and a policy allowing ingress
   to the API on port 3000 from the ingress namespace. Can the API reach
   MongoDB? Can it resolve `mongo.taskflow`? Why?
5. What does a Helm release revision record, and what does `helm rollback`
   actually do?
6. In what order are values applied when you pass `values.yaml`, two `-f`
   files, and `--set`?
7. When would you choose Kustomize over Helm, and the reverse?
8. A canary should receive 5% of traffic. How would you express that with
   an HTTPRoute?

## Further learning

- [Kubernetes documentation: Ingress](https://kubernetes.io/docs/concepts/services-networking/ingress/)
- [Kubernetes documentation: Gateway API](https://kubernetes.io/docs/concepts/services-networking/gateway/)
- [Gateway API project](https://gateway-api.sigs.k8s.io/)
- [Kubernetes documentation: Network policies](https://kubernetes.io/docs/concepts/services-networking/network-policies/)
- [Helm documentation: Chart template guide](https://helm.sh/docs/chart_template_guide/)
- [Kustomize reference](https://kubectl.docs.kubernetes.io/references/kustomize/)
- Next: [stateful workloads and Jobs](stateful-workloads-and-jobs.md).
  Back to the [Kubernetes overview](../kubernetes.md).
