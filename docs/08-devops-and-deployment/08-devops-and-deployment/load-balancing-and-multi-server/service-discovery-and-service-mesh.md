# Service Discovery and Service Mesh

In a fleet that autoscales, deploys several times a day, and replaces
failed machines automatically, the set of addresses behind each service
changes constantly. **Service discovery** is how a caller finds the
healthy instances of the service it wants to call right now. A
**service mesh** goes one step further and moves discovery, load
balancing, encryption, retries, and telemetry for service-to-service
traffic out of the application and into proxies managed by a control
plane.

This lesson covers why hard-coded addresses fail, client-side and
server-side discovery, self-registration and platform registration,
DNS-based discovery and its caching pitfalls, the main registries
(Consul, Eureka, etcd, ZooKeeper, cloud registries) and how Kubernetes
does it, then service meshes: sidecar proxies, mutual TLS, retries,
traffic splitting, observability, Istio and Linkerd, sidecarless designs
such as Istio's ambient mode, and the real cost and complexity of
running one.

## Why it matters

The first multi-server version of an application usually puts a list of
IP addresses in a configuration file. That breaks as soon as instances
come and go: callers keep sending requests to terminated instances,
miss new ones, and every scaling event becomes a config change. Even
with a registry, the details decide whether failures are invisible or
painful: how quickly a dead instance disappears from callers' lists,
what callers do when the registry itself is unreachable, and how
connections that stay open for minutes interact with a list that
changed seconds ago.

A mesh promises uniform encryption, retries, and metrics for every
service without code changes, which is valuable with dozens of services
written in several languages. It also adds a proxy to every hop, a
control plane to operate, and new failure modes, so it should be adopted
for concrete reasons.

## Real-world usage

- **Netflix.** The 2012 post
  [Netflix Shares Cloud Load Balancing And Failover Tool: Eureka!](https://netflixtechblog.com/netflix-shares-cloud-load-balancing-and-failover-tool-eureka-c10647ef95e5)
  explains why Netflix built a registry: in AWS "servers come and go",
  AWS did not yet offer a middle-tier load balancer, and putting mid-tier
  services behind internet-facing load balancers would have given up the
  protection of security groups. Eureka let clients balance load across
  instances themselves.
- **Envoy.** The [What is Envoy](https://www.envoyproxy.io/docs/envoy/latest/intro/what_is_envoy)
  page states the belief the proxy was built on: the network should be
  transparent to applications, and when network and application problems
  occur it should be easy to find the source. Envoy is the data plane of
  Istio's sidecar mode and of many other meshes and gateways.
- **Slack.** In describing its
  [migration to a cellular architecture](https://slack.engineering/slacks-migration-to-a-cellular-architecture/),
  Slack lists the discovery interfaces its services used at the same
  time: the Envoy xDS API, the Consul API, and plain DNS, and notes that
  DNS has no way to express ideas such as "drain this zone".
- **Dropbox.** The post
  [Robinhood: in-house load balancing service](https://dropbox.tech/infrastructure/robinhood-in-house-load-balancing-service)
  explains that clients doing plain round robin over the subset of
  servers that discovery gave them produced imbalanced load, so Robinhood
  attaches load-based weights to endpoints through Envoy's Endpoint
  Discovery Service; Dropbox reports reducing fleet size by 25% for some
  of its largest services.

**Popular tools and providers:** Consul, Eureka (through Spring Cloud
Netflix), etcd, ZooKeeper, AWS Cloud Map, Kubernetes Services and
CoreDNS, Envoy and its xDS APIs, gRPC's built-in load balancing, Istio,
Linkerd, Cilium, and Consul's service mesh.

## How it works

### Why static addresses break

Instances get new IP addresses whenever they are replaced, autoscaled,
rescheduled, or redeployed. A list in a file or an environment variable
has to be edited and redeployed for every change, and it says nothing
about health. Discovery replaces the static list with a live one: a
**registry** that knows which instances exist and are healthy, and a way
for callers to read it.

### Client-side compared with server-side discovery

![Diagram: on the left, client-side discovery; tasks instances register with a service registry such as Consul or Eureka and send heartbeats; the orders service asks the registry for healthy tasks instances, caches the list 10.0.1.5, 10.0.2.7, and 10.0.3.9, picks one, and calls it directly, saving a hop but needing a library per language; on the right, server-side discovery; the orders service calls a stable name, a load balancer or Kubernetes Service that knows the healthy instances chooses one and forwards the request, and the platform registers the instances in target groups or EndpointSlices; a service mesh moves server-side discovery into a proxy next to each client.](client-vs-server-side-discovery.svg)

| | Client-side discovery | Server-side discovery |
|-|-----------------------|-----------------------|
| Who picks the instance | The caller, using a library | A load balancer, proxy, or kernel rules |
| Extra network hop | No | Usually one (a load balancer), or none with kernel rules (Kubernetes) |
| Smart balancing (zone preference, least load) | Easy, in the library | Depends on the load balancer |
| Languages | A library per language, kept in sync | Any client that can call a name |
| Examples | Eureka with Spring Cloud LoadBalancer, gRPC with DNS or xDS, Consul API clients | Cloud internal load balancers, Kubernetes Services, Consul DNS behind a proxy |

### How instances get registered

- **Self-registration:** the instance registers itself at startup and
  renews a lease with heartbeats (Eureka). Simple, but every service
  needs the client code, and a hung process may keep heartbeating.
- **Platform registration:** something outside the instance registers
  it: the Auto Scaling group adds it to a target group, Kubernetes adds
  ready Pods to EndpointSlices, or a Consul agent on the host registers
  services from configuration and runs their health checks. The
  application does not need to know.

Either way, registration must be paired with **health checking** and
**deregistration**: a registry full of dead instances is worse than no
registry, because callers trust it.

### DNS-based discovery and its caching pitfalls

DNS is the most universal discovery interface: every language can
resolve a name. A registry or platform publishes A or AAAA records for
instance addresses, and **SRV records** (`_http._tcp.tasks.example`) can
also carry ports and weights. The pitfalls all come from caching:

- **TTLs.** Resolvers and operating systems cache answers until the TTL
  expires, so a short TTL (a few seconds to a minute) is needed for
  dynamic fleets, at the cost of more lookups.
- **Client caches.** Some runtimes and libraries keep their own DNS
  cache longer than the TTL; check the defaults of yours.
- **Long-lived connections.** A keep-alive or HTTP/2 connection opened
  to an instance keeps going to that instance whatever DNS now says. New
  instances receive no traffic from existing connections, and a removed
  instance keeps receiving it until the connection breaks. Cap connection
  age, or use a balancer that understands membership changes.
- **No health or zones in plain DNS.** DNS returns a list; it cannot say
  "prefer your zone" or "send 1% here". That is why richer systems use
  APIs such as xDS.

### Registries

| Registry | Model | Notes |
|----------|-------|-------|
| **Consul** | An agent on every node runs health checks and gossips membership; servers keep the catalog consistent with Raft. Discovery via DNS (port 8600, `name.service.consul`) and an HTTP API | Also a key-value store and a service mesh. Licensed under the Business Source License since version 1.17; HashiCorp, including Consul, is now part of IBM |
| **Eureka** | REST registry with client-side load balancing; instances renew leases every 30 seconds and are removed after 90 seconds without a renewal; clients cache the registry and refresh every 30 seconds | Favors availability: in "self-preservation" mode during mass renewal loss it stops expiring instances. Community-maintained on GitHub, widely used through Spring Cloud Netflix |
| **etcd** | Strongly consistent key-value store (Raft) with leases and watches | The store behind Kubernetes; registration is a key bound to a lease that expires if not kept alive |
| **ZooKeeper** | Consistent coordination service; ephemeral nodes disappear when the session ends | Older but still common in data infrastructure (and behind older Kafka clusters; Kafka 4.0 removed it) |
| **AWS Cloud Map** | Managed registry with DNS and API discovery | Integrates with ECS and other AWS services |
| **Kubernetes** | The API server stores Services and EndpointSlices; CoreDNS answers names | Built in; see below |

Worked example of staleness with Eureka's defaults: an instance crashes
just after its last renewal. The server removes it after 90 seconds
without a renewal, and a client may then use its cached list for up to
30 more seconds. For about two minutes, some calls go to a dead address,
so callers must time out quickly and retry on a different instance.
Faster heartbeats shorten the window but multiply registry traffic, and
the Eureka documentation advises against changing the renewal interval
because the server uses it to detect widespread renewal problems.

### Discovery in Kubernetes

Kubernetes provides server-side discovery out of the box. Ready Pods are
listed in a Service's EndpointSlices, CoreDNS resolves
`taskflow-api.taskflow.svc.cluster.local` to a virtual IP, and kernel
rules on every node spread connections across the endpoints (see
[Pods, Deployments, and Services](../kubernetes/pods-deployments-and-services.md)).
A **headless Service** returns the Pod addresses themselves, which is how
gRPC clients do client-side balancing inside a cluster. Because the
kernel balances per connection, long-lived HTTP/2 connections can pin
traffic to a few Pods, one of the main reasons teams adopt a mesh or
client-side balancing.

### xDS: discovery as an API

Envoy introduced a family of discovery APIs, collectively called **xDS**:
listeners, routes, clusters, and endpoints, each pushed from a control
plane to the proxy as they change. Endpoints can carry health, zone, and
weight, which plain DNS cannot. Istio and other meshes speak xDS to
their proxies, and gRPC can consume xDS directly for proxyless
client-side balancing.

### Service mesh: data plane and control plane

![Diagram: the control plane, for example istiod or the Linkerd control plane, watches services and endpoints, reads routing and security policy, and acts as certificate authority; it pushes configuration over xDS and a short-lived certificate for each workload to the proxies in the data plane; in Pod A the orders app makes a plain HTTP call over localhost to its sidecar proxy, which sends it as mutual TLS to the proxy in Pod B, which hands it to the tasks app over localhost; the proxies apply timeouts, retries, traffic splits, and authorization and report metrics, logs, and trace spans to Prometheus and a tracing backend.](mesh-data-and-control-plane.svg)

A mesh has two parts:

- The **data plane**: proxies on the request path, traditionally a
  sidecar container in every Pod, which intercept inbound and outbound
  traffic.
- The **control plane**: watches the platform for services and
  endpoints, turns your policies into proxy configuration, and runs a
  certificate authority that gives every workload a short-lived identity
  certificate (often in the SPIFFE format).

What the proxies provide without application changes:

| Feature | What it means |
|---------|---------------|
| Mutual TLS | Every hop encrypted, both sides authenticated by workload identity, certificates rotated automatically |
| Authorization policy | Rules such as "only `orders` may call `POST /tasks`", based on identity rather than IP |
| Load balancing | Per request (not per connection), with least-request and zone-aware options |
| Timeouts and retries | Configured per route; see the warnings in [resilience patterns across servers](resilience-patterns-across-servers.md) |
| Outlier detection | Temporarily ejecting instances that return errors |
| Traffic splitting and mirroring | Weighted routing for canaries, header-based routing, shadow traffic |
| Telemetry | Request rate, error rate, and latency for every service pair, plus trace spans (see [distributed tracing](../monitoring-and-logging/distributed-tracing.md)) |

### Istio, Linkerd, and sidecarless meshes

- **Istio** has a single control plane binary, **istiod**, and two data
  plane modes. In **sidecar mode** each Pod gets an Envoy proxy. In
  **ambient mode**, a per-node **ztunnel** proxy handles mutual TLS, L4
  authorization, and L4 telemetry for every Pod on the node, and optional
  **waypoint** proxies (Envoy-based, per namespace or service) add L7
  features only where they are needed. Ambient mode reached general
  availability in Istio 1.24 (November 2024); at the time of writing
  (November 2026) the current Istio release is 1.32.
- **Linkerd**, a graduated CNCF project, keeps a sidecar design with
  its own small Rust proxy and puts simplicity first. Its release model
  changed in February 2024: the open source project now publishes edge
  releases (weekly or near-weekly), and stable releases come from vendors
  such as Buoyant, whose Buoyant Enterprise for Linkerd distribution is
  free for companies with fewer than 50 employees and paid for larger
  ones in production. Linkerd 2.20 was announced in June 2026.
- **Cilium** offers sidecar-free mesh features built on eBPF in the
  kernel, with Envoy for L7 where needed, and **Consul** includes its own
  mesh using Envoy.

![Diagram: in sidecar mode a node runs three Pods, each with its app and its own proxy, so every Pod pays proxy memory and CPU, each request crosses two full L7 proxies, proxy upgrades restart application Pods, and Linkerd keeps this sidecar design; in Istio ambient mode the three Pods contain only their apps, one ztunnel per node provides mutual TLS, L4 authorization, and L4 metrics, and an optional waypoint proxy per namespace or service adds L7 routing, retries, and policy; ambient mode has been generally available since Istio 1.24 in November 2024.](sidecar-vs-ambient-mesh.svg)

### What a mesh costs

- **Resources.** Every sidecar uses memory and CPU, multiplied by the
  number of Pods; size requests for it.
- **Latency.** Each hop passes through extra proxies; usually small, but
  it adds up on deep call chains.
- **Operations.** A control plane to upgrade and monitor, certificates to
  reason about, CRDs and policies to review, and proxy upgrades that in
  sidecar mode require restarting application Pods.
- **Debugging.** A failed request may now be a proxy configuration
  problem, a policy denial, or a certificate issue.
- **Retry amplification.** Mesh retries stack on top of application and
  client retries unless one layer owns them.

## When to use and when not to use

| Situation | Recommendation |
|-----------|----------------|
| A few services on one platform | Platform discovery (Kubernetes Services, internal load balancers) and libraries for timeouts and retries |
| VMs in autoscaling groups | Internal load balancers per service, or Consul / Cloud Map |
| Java estate already on Spring Cloud | Eureka with client-side balancing remains reasonable |
| gRPC services that need per-request balancing | Headless Services with client-side balancing, or a mesh |
| Many services, several languages, mTLS required everywhere | A service mesh |
| Need zero-trust identity between services | Mesh (mTLS plus authorization policy) |
| Small team, no clear driver | No mesh yet |

Adopt a mesh for a specific need (encryption and identity everywhere,
per-request balancing, uniform telemetry, traffic splitting) and roll it
out namespace by namespace. Do not adopt one because it is popular, and
do not make the registry or mesh control plane a hard dependency of
every request.

## Practical examples

### Registering the API with Consul

```hcl
# /etc/consul.d/taskflow-api.hcl: the local agent registers and health-checks the API
service {
  name = "taskflow-api"
  id   = "taskflow-api-1"
  port = 3000
  tags = ["v1.5.0"]

  check {
    id       = "readyz"
    name     = "HTTP readiness"
    http     = "http://localhost:3000/readyz"
    interval = "10s"
    timeout  = "2s"
    deregister_critical_service_after = "5m"
  }
}
```

```bash
consul reload
dig @127.0.0.1 -p 8600 taskflow-api.service.consul SRV +short    # healthy instances and ports
curl -s "http://127.0.0.1:8500/v1/health/service/taskflow-api?passing=true"
```

Only instances whose check passes are returned, and an instance that
stays critical for five minutes is removed from the catalog.

### Client-side discovery in Node.js

```js
// src/discovery/consul-client.js
// Client-side discovery: ask the local Consul agent for healthy instances,
// cache the list briefly, and round-robin across it.
export function createDiscovery({ consulUrl = "http://127.0.0.1:8500", ttlMs = 5_000 } = {}) {
  const cache = new Map(); // service name -> { instances, expiresAt, next }

  async function load(service) {
    const url = `${consulUrl}/v1/health/service/${encodeURIComponent(service)}?passing=true`;
    const res = await fetch(url, { signal: AbortSignal.timeout(1_000) });
    if (!res.ok) throw new Error(`Consul returned ${res.status}`);
    const entries = await res.json();
    return entries.map((e) => ({
      host: e.Service.Address || e.Node.Address,
      port: e.Service.Port,
    }));
  }

  async function lookup(service) {
    const cached = cache.get(service);
    if (cached && cached.expiresAt > Date.now()) return cached;
    try {
      const instances = await load(service);
      const entry = { instances, expiresAt: Date.now() + ttlMs, next: cached?.next ?? 0 };
      cache.set(service, entry);
      return entry;
    } catch (err) {
      if (!cached) throw err;
      // Registry unreachable: keep serving the last known list, retry in 1 s
      cached.expiresAt = Date.now() + 1_000;
      return cached;
    }
  }

  return {
    async pick(service) {
      const entry = await lookup(service);
      if (entry.instances.length === 0) throw new Error(`no healthy ${service} instances`);
      const instance = entry.instances[entry.next % entry.instances.length];
      entry.next += 1;
      return `http://${instance.host}:${instance.port}`;
    },
  };
}
```

```js
// src/clients/tasks-via-consul.js (usage)
import { createDiscovery } from "../discovery/consul-client.js";

const discovery = createDiscovery();

export async function getTask(id) {
  const base = await discovery.pick("taskflow-api");
  const res = await fetch(`${base}/tasks/${id}`, { signal: AbortSignal.timeout(2_000) });
  if (!res.ok) throw new Error(`tasks returned ${res.status}`);
  return res.json();
}
```

Two properties matter more than the code size: the list is cached, so the
registry is not called on every request, and if the registry is
unreachable the client keeps using the last list it saw instead of
failing every call. Callers should still retry a failed call on a
different instance, as shown in
[resilience patterns across servers](resilience-patterns-across-servers.md).

### Per-request gRPC balancing over a headless Service

```js
// src/clients/tasks-grpc.js: round robin across every Pod behind a headless Service
import grpc from "@grpc/grpc-js";

const serviceConfig = JSON.stringify({ loadBalancingConfig: [{ round_robin: {} }] });

export const channelOptions = {
  "grpc.service_config": serviceConfig,
  "grpc.keepalive_time_ms": 30_000,
};

// dns:/// re-resolves the headless Service name and balances per request
export const target = "dns:///tasks-grpc.taskflow.svc.cluster.local:50051";

export function createClient(ClientCtor) {
  return new ClientCtor(target, grpc.credentials.createInsecure(), channelOptions);
}
```

The headless Service (`clusterIP: None`) makes DNS return every ready Pod
address, and the `round_robin` policy opens a connection to each and
spreads requests across them, instead of pinning every request to the
single connection a ClusterIP would give.

### Turning on Istio for the TaskFlow namespace

```bash
# Ambient mode: no sidecars; ztunnel provides mTLS for every Pod in the namespace
kubectl label namespace taskflow istio.io/dataplane-mode=ambient

# Add a waypoint so L7 policies (routing, retries) apply to this namespace
istioctl waypoint apply -n taskflow --enroll-namespace

# Or sidecar mode instead: inject an Envoy proxy into each new Pod
# kubectl label namespace taskflow istio-injection=enabled
# kubectl rollout restart deployment -n taskflow
```

```yaml
# k8s/mesh/peer-authentication.yaml: refuse plaintext traffic to the namespace
apiVersion: security.istio.io/v1
kind: PeerAuthentication
metadata:
  name: default
  namespace: taskflow
spec:
  mtls:
    mode: STRICT
---
# k8s/mesh/tasks-destination-rule.yaml: subsets and outlier detection
apiVersion: networking.istio.io/v1
kind: DestinationRule
metadata:
  name: taskflow-api
  namespace: taskflow
spec:
  host: taskflow-api
  trafficPolicy:
    connectionPool:
      http:
        http1MaxPendingRequests: 100
    outlierDetection:
      consecutive5xxErrors: 5
      interval: 10s
      baseEjectionTime: 30s
      maxEjectionPercent: 50
  subsets:
    - name: v1
      labels:
        version: v1
    - name: v2
      labels:
        version: v2
---
# k8s/mesh/tasks-virtual-service.yaml: a 90/10 canary with one timeout and few retries
apiVersion: networking.istio.io/v1
kind: VirtualService
metadata:
  name: taskflow-api
  namespace: taskflow
spec:
  hosts:
    - taskflow-api
  http:
    - route:
        - destination:
            host: taskflow-api
            subset: v1
          weight: 90
        - destination:
            host: taskflow-api
            subset: v2
          weight: 10
      timeout: 2s
      retries:
        attempts: 2
        perTryTimeout: 800ms
        retryOn: connect-failure,refused-stream,unavailable,reset
```

Start with `mode: PERMISSIVE` while some callers are still outside the
mesh, and switch to `STRICT` once every client sends mutual TLS. The
retry policy retries only connection-level failures, not every 5xx, so a
slow, overloaded service does not receive three times its traffic.

In ambient mode, Istio documents VirtualService support as Alpha and
recommends the Gateway API (`HTTPRoute`, with weighted `backendRefs`) for
traffic splitting, so prefer `HTTPRoute` for new ambient setups.

### Linkerd: inject and observe

```bash
kubectl annotate namespace taskflow linkerd.io/inject=enabled
kubectl rollout restart deployment -n taskflow      # new Pods get the proxy
linkerd viz stat deploy -n taskflow                 # success rate, RPS, latency per deployment
```

## Best practices

- Never hard-code instance addresses; use platform discovery or a
  registry.
- Pair registration with health checks and automatic deregistration.
- Cache discovery results in clients and keep working on the last known
  list when the registry is unreachable.
- Keep DNS TTLs short for dynamic services and cap connection lifetimes
  so traffic follows membership changes.
- Retry failed calls on a different instance, with timeouts short enough
  to notice dead instances quickly.
- Prefer platform registration over self-registration where available.
- Adopt a mesh for a concrete need, one namespace at a time, starting in
  permissive mTLS mode.
- Decide which single layer owns retries: mesh, client library, or
  application.
- Budget sidecar resources, and plan proxy upgrades as rollouts.

## In production

- **Errors spike briefly after every scale-in.**
  *Detect:* connection-refused or timeout errors to addresses that no
  longer exist, right after terminations. *Cause:* clients use cached
  lists, DNS answers, or keep-alive connections to removed instances.
  *Fix:* drain before termination, shorten TTLs and cache lifetimes,
  limit connection age, and retry connection failures on another
  instance.
- **New instances receive almost no traffic.**
  *Detect:* per-instance request rates are uneven, and recently started
  instances sit idle. *Cause:* long-lived HTTP/2 or keep-alive
  connections stay on the old instances. *Fix:* per-request balancing
  (client-side or a mesh), maximum connection age, or periodic reconnects.
- **The registry went down and every service failed.**
  *Detect:* errors started when the registry became unreachable, although
  service instances were healthy. *Cause:* clients looked up the registry
  on every request and failed when it did not answer. *Fix:* cache
  results, serve stale lists, and treat the registry as a control plane
  that may be briefly unavailable.
- **Dead instances stay registered after a network blip.**
  *Detect:* a Eureka server reports self-preservation mode, and its
  registry lists instances that no longer exist. *Cause:* many renewals
  were lost at once, so the server stopped expiring instances to avoid
  wiping the registry. *Fix:* retries on other instances in clients,
  alerting on self-preservation, and investigating the network problem.
- **Enabling strict mTLS broke a nightly job and the monitoring
  scraper.** *Detect:* connections from workloads outside the mesh are
  reset. *Cause:* `STRICT` mode rejects plaintext clients. *Fix:* migrate
  with `PERMISSIVE`, bring every client into the mesh or give it a
  certificate, then switch to `STRICT`.
- **An overloaded service received three times its normal traffic.**
  *Detect:* request rates at the service far exceed what callers sent;
  traces show repeated attempts. *Cause:* retries in the mesh plus retries
  in the client library. *Fix:* one owner for retries, retry budgets, and
  retries only on connection failures for non-idempotent calls.
- **Pods crash at startup with connection errors.**
  *Detect:* the app's first outbound calls fail before the sidecar is
  ready. *Cause:* the application container started before its proxy.
  *Fix:* native sidecars or Istio's `holdApplicationUntilProxyStarts`, or
  ambient mode.

## Important terminology

- **Service discovery:** Finding the current, healthy instances of a
  service.
- **Service registry:** A database of service instances and their health.
- **Client-side discovery:** The caller reads the registry and picks an
  instance.
- **Server-side discovery:** A load balancer or proxy picks the instance
  for the caller.
- **Self-registration / platform registration:** The instance registers
  itself, or the platform registers it.
- **SRV record:** A DNS record that carries a target host and port.
- **xDS:** Envoy's family of discovery APIs for listeners, routes,
  clusters, and endpoints.
- **Service mesh:** Proxies on every service-to-service hop, managed by a
  control plane.
- **Sidecar:** A proxy container running next to the application in the
  same Pod.
- **Ambient mode:** Istio's sidecarless data plane: per-node ztunnel for
  L4, optional waypoint proxies for L7.
- **Mutual TLS (mTLS):** TLS in which both client and server present
  certificates.
- **Outlier detection:** Temporarily removing instances that return errors
  from load balancing.
- **Self-preservation:** Eureka's mode that stops expiring instances when
  many renewals are lost at once.

## Common mistakes and misconceptions

- Hard-coding IP lists in configuration.
- Calling the registry on every request instead of caching.
- Ignoring how DNS TTLs and keep-alive connections delay changes.
- Trusting self-registration without health checks.
- Assuming a mesh fixes application design problems such as missing
  timeouts or non-idempotent retries.
- Enabling strict mTLS before every client is in the mesh.
- Stacking mesh retries on top of library retries.
- Treating "mesh" as mandatory for microservices; many systems do well
  without one.

## Revision questions

1. Why do hard-coded instance lists break in an autoscaling fleet?
2. Compare client-side and server-side discovery. Which is a Kubernetes
   Service, and which is Eureka with Spring Cloud?
3. With Eureka's defaults (30-second renewals, removal after 90 seconds,
   30-second client refresh), roughly how long can clients keep calling a
   crashed instance? How should clients cope?
4. Why can a keep-alive or HTTP/2 connection keep sending traffic to a
   removed instance, and what limits it?
5. What does a service mesh's control plane do, and what do the data plane
   proxies do?
6. How does Istio's ambient mode differ from sidecar mode, and when would
   you add a waypoint proxy?
7. What changed in Linkerd's release model in 2024?
8. Name three costs of a service mesh and one situation in which you would
   still adopt it.

## Further learning

- [Consul documentation](https://developer.hashicorp.com/consul/docs)
- [Eureka on GitHub](https://github.com/Netflix/eureka)
- [AWS Cloud Map](https://docs.aws.amazon.com/cloud-map/latest/dg/what-is-cloud-map.html)
- [Istio: Ambient mode overview](https://istio.io/latest/docs/ambient/overview/)
- [Istio: Ambient mode reaches general availability](https://istio.io/latest/blog/2024/ambient-reaches-ga/)
- [Linkerd: Releases and versions](https://linkerd.io/releases/)
- [SPIFFE overview](https://spiffe.io/docs/latest/spiffe-about/overview/)
- [Kubernetes blog: gRPC load balancing on Kubernetes without tears](https://kubernetes.io/blog/2018/11/07/grpc-load-balancing-on-kubernetes-without-tears/)
- Next: [resilience patterns across servers](resilience-patterns-across-servers.md).
  Back to the [load balancing and multi-server overview](../load-balancing-and-multi-server.md).
