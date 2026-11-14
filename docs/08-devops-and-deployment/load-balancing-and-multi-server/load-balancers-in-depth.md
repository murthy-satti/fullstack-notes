# Load Balancers in Depth

A load balancer accepts connections or requests on one address and spreads
them across a pool of backends, stops sending work to backends that fail,
and lets backends join and leave without clients noticing. This lesson
covers the difference between layer 4 and layer 7 balancing, the balancing
algorithms and when each fits, health checks, connection draining and slow
start, sticky sessions, TLS, passing the client's address to the backend
(`X-Forwarded-For` and the PROXY protocol), HTTP/2, gRPC, and WebSockets,
the cloud load balancers of AWS, Google Cloud, and Azure, the main software
load balancers with working Nginx and HAProxy configurations, and how to
keep the load balancer itself from becoming a single point of failure.

## Why it matters

Every request crosses the load balancer, so its settings decide how a
failure feels to users. With default settings, an AWS Application Load
Balancer needs two failed checks 30 seconds apart before it stops sending
traffic to a dead instance, and it reports a removed instance as draining
for 300 seconds; a deploy tool that waits for each batch to finish draining
turns a five-batch rolling deploy into a 25-minute one. A load balancer
that only checks whether a TCP port is open happily
routes to an instance whose database pool is exhausted. A layer 4 balancer
in front of gRPC services pins every request from a client to one pod. Most
"the load balancer is broken" incidents are really a mismatch between the
balancer's settings and how the application behaves.

## Real-world usage

- **Google SRE book.** The chapter
  [Load Balancing in the Datacenter](https://sre.google/sre-book/load-balancing-datacenter/)
  describes a "lame duck" state in which a backend "is listening on its
  port and can serve, but is explicitly asking clients to stop sending
  requests", **subsetting** (each client talks to a subset of typically 20
  to 100 backend tasks rather than all of them), and weighted round robin
  in which backends report their query rate, error rate, and utilization so
  clients can favor the healthiest ones.
- **HAProxy.** Willy Tarreau's
  [Test Driving "Power of Two Random Choices" Load Balancing](https://www.haproxy.com/blog/power-of-two-load-balancing)
  benchmarked algorithms on one load balancer and found that "Least
  Connections consistently performs better", while power of two choices
  matched round robin. The post also notes that HAProxy's `random`
  algorithm now draws two servers by default.
- **NGINX.** The post
  [NGINX and the "Power of Two Choices" Load-Balancing Algorithm](https://www.f5.com/company/blog/nginx/nginx-power-of-two-choices-load-balancing-algorithm)
  explains the other half of that result: two random choices are "not as
  effective on a single load balancer", but avoid the "herd behavior" that
  appears when many independent load balancers each send work to whichever
  backend looks least loaded.
- **AWS Elastic Load Balancing.** The
  [target group health check documentation](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/target-group-health-checks.html)
  states the fail-open rule: "If a target group contains only unhealthy
  registered targets, the load balancer routes requests to all those
  targets, regardless of their health status."
- **Kubernetes and gRPC.** The Kubernetes blog post
  [gRPC Load Balancing on Kubernetes without Tears](https://kubernetes.io/blog/2018/11/07/grpc-load-balancing-on-kubernetes-without-tears/)
  explains that because HTTP/2 multiplexes requests over one long-lived
  connection, connection-level balancing stops working: "All requests will
  get pinned to a single destination pod."
- **Dropbox.** In
  [Dropbox traffic infrastructure: Edge network](https://dropbox.tech/infrastructure/dropbox-traffic-infrastructure-edge-network),
  Dropbox describes scaling its layer 4 balancers with "BGP ECMP, DSR, and
  consistent hashing", with IPVS as the data plane.

**Popular tools and providers:** AWS Application, Network, and Gateway Load
Balancers; Google Cloud Application and Network Load Balancers; Azure Load
Balancer, Application Gateway, and Front Door; Nginx (and the commercial F5
NGINX Plus), HAProxy, Envoy, Traefik, and Caddy; keepalived for redundant
pairs; Linux IPVS; and Katran and other Maglev-style layer 4 balancers.

## How it works

### What a load balancer does

1. **Accepts traffic** on a stable address (a DNS name, a virtual IP, or an
   anycast address) so clients never need to know backend addresses.
2. **Chooses a backend** with a balancing algorithm.
3. **Checks health** actively (probes) and passively (watching real
   responses) and removes failing backends.
4. **Shapes traffic:** terminates TLS, enforces timeouts and connection
   limits, retries, routes by host or path, and adds headers.
5. **Reports** per-backend request counts, errors, and latency, which are
   often the best signal you have.

Load balancers appear at several places: at the **edge** facing the
internet, **internally** between services, and **client-side** as a library
or sidecar inside the caller (gRPC, Envoy, service meshes). A **proxy**
balancer keeps two connections per request (client to balancer, balancer to
backend); a **pass-through** balancer forwards packets, and with **direct
server return (DSR)** the backend answers the client directly, so the
balancer only handles the smaller inbound traffic.

### Layer 4 compared with layer 7

![Diagram: on the left, a client opens one TCP connection carrying three requests to a layer 4 load balancer that sees only IP addresses and ports; it forwards the whole connection to server A, which receives all three requests while B and C stay idle; it is fast, works for any TCP or UDP protocol, and keeps the client IP, but cannot route by URL or retry. On the right, the same connection reaches a layer 7 load balancer that terminates TLS and parses HTTP; it sends request 1 to A, request 2 to B, and request 3 to C over its own connections; it can route by host, path, and header, retry, and run a WAF, at more CPU cost per request.](l4-vs-l7-load-balancing.svg)

| | Layer 4 (transport) | Layer 7 (application) |
|---|---|---|
| Sees | IP addresses, ports, TCP or UDP | The whole HTTP request: method, path, headers, cookies |
| Decides | Once per connection (flow) | For every request |
| Connections | Packets forwarded, or a TCP proxy | Client side and backend side are separate; backend connections are pooled |
| TLS | Passed through, or terminated on a TLS listener | Terminated, optionally re-encrypted |
| Can do | Any TCP or UDP protocol, very high throughput, static IPs, the original client IP | Host, path, and header routing, retries, header injection, WAF, compression, per-request gRPC balancing |
| Cannot do | Route by URL, retry a request, balance requests inside one HTTP/2 connection | Non-HTTP protocols (outside a TCP mode); it costs more CPU per request |
| Examples | AWS NLB, Azure Load Balancer, Google passthrough Network Load Balancers, HAProxy `mode tcp`, the Nginx `stream` module, Linux IPVS | AWS ALB, Google Application Load Balancers, Azure Application Gateway and Front Door, Nginx `http`, HAProxy `mode http`, Envoy |

Large systems usually use both: a layer 4 tier that spreads connections
across a fleet of layer 7 proxies, which then route each request.

### Balancing algorithms

![Diagram: six cards compare algorithms over servers A, B, and C; round robin sends requests 1 to 6 as A, B, C, A, B, C for two each; weighted round robin with weights 2, 1, 1 sends eight requests as A, B, C, A, A, B, C, A, giving A four; least connections sees 3, 1, and 2 open connections and picks B; power of two choices samples A and C, which have 4 and 1 requests in flight, and picks C; IP hash maps clients X and Z to B and client Y to A; consistent hashing places servers on a ring, and adding D moves only the keys just before D, about one in N; each card lists what the algorithm fits and what to watch.](balancing-algorithms.svg)

| Algorithm | How it picks | Fits | Watch out for |
|---|---|---|---|
| Round robin | Next backend in turn | Identical backends, requests of similar cost | Slow requests pile up on whichever backend gets them |
| Weighted round robin | In turn, in proportion to weights (5:3:2 sends 500, 300, and 200 of 1,000 requests) | Mixed instance sizes, gradual traffic shifts, canaries | Weights are static; a weight cannot know a backend is slow today |
| Least connections | Backend with the fewest open connections | Long-lived connections (WebSockets), uneven request times | Counts connections, not requests; a new backend with zero connections gets a burst |
| Least outstanding requests | Backend with the fewest requests in flight (AWS ALB; Envoy's `least_request`) | HTTP APIs whose request times vary | Needs per-request tracking, so it is a layer 7 feature |
| Random, power of two choices | Pick two backends at random, send to the less loaded one | Many independent balancers or sidecars, large fleets | Needs a load signal; on one balancer, least connections is usually as good |
| IP hash | Hash of the client address picks the backend | Rough affinity without cookies | Many users behind one NAT land on one backend; most clients move when backends change |
| Consistent hashing | Hash of a key (URL, user, tenant) on a ring; the key belongs to the next backend on the ring | Caches and sharded backends, where the same key should reach the same server | Hot keys still overload one backend; uneven rings need virtual nodes |
| Least time | Lowest average response time (Nginx `least_time`) | Backends in different locations or of different speeds | Open-source Nginx gained it only in the 1.31 mainline; earlier it was NGINX Plus only |

Two results explain the hashing and random rows:

```text
Modulo hashing (server = hash(key) mod N), going from 4 to 5 servers:
  a key stays put only if hash mod 4 == hash mod 5, true for 4 of every 20 values
  -> 80% of keys move, and every cache in the tier goes cold at once

Consistent hashing, going from 4 to 5 servers:
  only the keys that now belong to the new server move: about 1/5
  -> 20% of keys move; the other 80% keep hitting a warm cache

Random choices (balls into bins, one million of each):
  one random choice: the fullest bin usually holds about 9
  best of two random choices: it drops to about 4
```

The last result is from the balanced-allocations work surveyed in
[The Power of Two Random Choices](https://www.eecs.harvard.edu/~michaelm/postscripts/handbook2001.pdf)
(Mitzenmacher, Richa, and Sitaraman). It is why two choices are almost as
good as asking every backend, and why they avoid herd behavior: two
balancers rarely sample the same pair.

Which to choose: start with **least outstanding requests** (or least
connections) for HTTP APIs, **round robin** when requests are uniform and
cheap, **weighted** variants for mixed capacity or traffic shifting, and
**consistent hashing** only when data placement matters. Many balancers
combine these: Nginx's `random two least_conn` is power of two choices
using connection counts.

### Health checks

**Active** checks probe each backend on a schedule. **Passive** checks
(Envoy calls them outlier detection) watch real responses and eject a
backend that returns errors or timeouts. Use both: active checks find a
backend that is down before users do, passive checks react to errors
between probes.

Detection and recovery times follow directly from the settings:

```text
time to remove  ~ interval x unhealthy threshold (+ the probe timeout)
time to restore ~ interval x healthy threshold

AWS ALB defaults (interval 30 s, unhealthy 2, healthy 5):  remove ~60 s, restore ~150 s
Tuned ALB (interval 10 s, unhealthy 2, healthy 3):           remove ~20 s, restore ~30 s
HAProxy defaults (inter 2 s, fall 3, rise 2):                remove ~6 s,  restore ~4 s
Google Cloud defaults (interval 5 s, thresholds 2 and 2):    remove ~10 s, restore ~10 s
```

What the check should test:

- **Readiness, not liveness.** The endpoint (`/readyz`) answers "should this
  instance get new requests now?": started, connected, not draining. It is
  cheap and has a timeout shorter than the probe interval. The difference
  between liveness and readiness is covered in
  [deploying backend services](../deployment-strategies/deploying-backend-services.md).
- **Not every dependency.** If `/readyz` fails whenever the database is slow,
  every instance fails at the same moment. Balancers then **fail open**: AWS
  ALB and NLB route to all targets when none are healthy, Envoy ignores
  health once fewer than 50% of hosts are healthy (its panic threshold),
  and Azure Front Door spreads traffic across all origins when every probe
  fails. Failing open is better than serving nothing, but it means the
  health check stopped protecting you. AWS lets you tune the threshold
  with the `target_group_health.unhealthy_state_routing` attributes.
- **Hysteresis.** Requiring several consecutive failures and successes
  stops a backend from flapping in and out on a single slow response.

### Connection draining, deregistration delay, and slow start

![Diagram: a 90-second timeline with three lanes; in an unplanned failure the instance crashes at 0 s, checks every 10 s fail at 10, 20, and 30 s, and only the third failure removes it, so requests can fail for 30 s before it is out of rotation; in a planned removal with a 30 s deregistration delay the instance gets no new requests from 0 s, its last in-flight request finishes at 12 s, and at 30 s it is deregistered and safe to stop; a new instance registered at 0 s passes checks at 5 and 15 s and its share of traffic rises from 0 to 100% during a 60 s slow start, reaching its full share at 75 s.](health-check-and-draining-timeline.svg)

- **Draining** removes a backend from rotation for new requests while its
  in-flight requests finish. On AWS this is the **deregistration delay**
  (default 300 seconds, range 0 to 3,600). The load balancer stops sending
  new requests at once; if the target has no requests in flight it finishes
  deregistering early, but it is still shown as `draining` until the delay
  ends, so tools that wait for the `unused` state wait the full delay. Set
  it a little above your longest normal request (30 seconds for TaskFlow
  API); the default makes every rolling deploy wait five minutes per batch.
- **The application must cooperate.** On `SIGTERM` it fails readiness,
  keeps serving in-flight requests, and closes idle keep-alive connections,
  as shown in
  [deploying backend services](../deployment-strategies/deploying-backend-services.md).
  A target that closes connections before the delay ends returns errors to
  the clients still using them.
- **Long-lived connections never "finish".** WebSockets and streams are
  cut when the delay ends. Clients must reconnect with random jitter, or
  you need longer drains (see rainbow deployments in
  [advanced deployment patterns](../deployment-strategies/advanced-deployment-patterns.md)).
- **Slow start** ramps a backend's share of traffic up from zero so a cold
  instance (empty caches, unwarmed JIT, no pooled connections) is not hit
  with a full share at once. AWS ALB applies it to newly registered targets
  over 30 to 900 seconds, rising linearly. HAProxy's `slowstart` applies to
  a server returning after being seen as down, not at startup. In Nginx,
  `slow_start` is still an NGINX Plus feature. ALB cannot combine slow
  start with the least outstanding requests or weighted random algorithms.

### Sticky sessions

Stickiness (session affinity) sends a client back to the same backend:

- **Load balancer cookie:** the balancer adds its own cookie (AWS ALB
  `AWSALB`, HAProxy `cookie ... insert`, Nginx `sticky cookie`).
- **Application cookie:** the balancer follows a cookie your app sets (ALB
  application-based stickiness).
- **Source IP:** hash or affinity by client address (NLB `source_ip`, Azure
  Load Balancer client IP persistence, Nginx `ip_hash`).

Stickiness has a real cost: load stays uneven (a scale-out helps only new
users), sessions on a failed backend are lost, and some algorithms cannot
use it (ALB's weighted random). Use it for performance or protocol reasons
(Socket.IO long-polling, warm per-instance caches, keeping a canary user on
one version) and never as the only copy of session data, as explained in
[from one server to many](from-one-server-to-many.md).

### TLS at the load balancer

Most HTTP setups terminate TLS at the balancer with a managed certificate;
re-encryption to backends adds encryption inside the network, and
passthrough (a layer 4 balancer routing by SNI) keeps the private key off
the balancer at the cost of all layer 7 features. The trade-offs,
certificate handling, and troubleshooting are covered in
[TLS termination and troubleshooting](../ssl-certificates/tls-termination-and-troubleshooting.md).
AWS ALB can also check client certificates itself (mutual TLS in verify
mode) or pass them to targets in a header (passthrough mode).

### Passing the client's address: X-Forwarded-For and the PROXY protocol

Behind a proxy, the backend's TCP peer is the balancer, so the client's
address must travel separately:

- **Layer 7: headers.** The balancer appends the address it saw to
  `X-Forwarded-For` (`client, proxy1, proxy2`), and sets
  `X-Forwarded-Proto` and `X-Forwarded-Host`; the standard `Forwarded`
  header ([RFC 7239](https://www.rfc-editor.org/rfc/rfc7239.html)) carries
  the same information. Any client can send a fake `X-Forwarded-For`, so a
  backend must trust only the entries added by its own proxies: count hops
  from the right. In Express, `app.set("trust proxy", 1)` trusts exactly one
  hop; in Nginx, `set_real_ip_from` with `real_ip_header` and
  `real_ip_recursive` does the same.
- **Layer 4: the PROXY protocol.** A TCP balancer cannot add HTTP headers,
  so it prepends a small header to the connection (text in version 1,
  binary in version 2) carrying the original addresses and ports. AWS NLB
  sends it when `proxy_protocol_v2.enabled` is true; HAProxy sends it with
  `send-proxy-v2` and accepts it with `accept-proxy`; Nginx accepts it with
  `listen ... proxy_protocol`. Both sides must agree: a backend that does
  not expect the header sees garbage at the start of every connection, and
  one that expects it rejects connections that lack it. Some layer 4
  balancers (AWS NLB with instance targets, for example) instead preserve
  the client's source IP, so no header is needed.

### HTTP/2, gRPC, and WebSockets

- **HTTP/2** multiplexes many requests over one long-lived connection.
  Behind a layer 4 balancer, every request on that connection reaches one
  backend; a layer 7 balancer balances each request (stream) separately.
  AWS ALB sends HTTP/2 or gRPC to targets when the target group's protocol
  version is `HTTP2` or `GRPC`.
- **gRPC** clients keep one channel open for a long time, so behind a
  Kubernetes `ClusterIP` Service (connection-level balancing) a few pods do
  all the work. Fixes, from least to most infrastructure: client-side
  balancing (a headless Service, a `dns:///` target, and the `round_robin`
  policy, since the default `pick_first` uses one address), a maximum
  connection age on the server (`grpc.max_connection_age_ms` in grpc-js) so
  clients reconnect and rebalance, or an L7 proxy or service mesh that
  balances per call (see
  [service discovery and service mesh](service-discovery-and-service-mesh.md)).
- **WebSockets** start as an HTTP request with `Upgrade: websocket` and then
  become a long-lived tunnel; the balancer chooses a backend once, at
  connect time. Use least connections, set idle timeouts above your
  heartbeat interval (the ALB idle timeout defaults to 60 seconds, Nginx's
  `proxy_read_timeout` to 60 seconds), and send pings more often than that.

### Timeouts and retries at the balancer

| Setting | What it limits | Typical value for TaskFlow API |
|---|---|---|
| Connect timeout to backend | Time to open a TCP connection | 1 to 3 s; a healthy backend in the same region connects in milliseconds |
| Response (read) timeout | Time waiting for the backend to respond | A little above the slowest normal endpoint, such as 30 s |
| Client idle timeout | Idle time on the client connection | 60 s (ALB default) |
| Backend keep-alive | How long idle backend connections stay open | The app's `keepAliveTimeout` must be longer than the balancer's, or requests fail with 502 |
| Retries | Sending a failed request to another backend | One retry, for connection failures and idempotent requests only |

Retries are where balancers differ most. Nginx retries on `error` and
`timeout` by default (`proxy_next_upstream`), but never passes a `POST`,
`PATCH`, or `LOCK` to the next server after it reached one, unless you add
`non_idempotent`. HAProxy retries only connection failures by default
(`retry-on conn-failure`); its manual warns that the other retry conditions
replay requests whatever their method, so use them only when the API has
replay protection such as idempotency keys. Retrying at several layers
multiplies load during an outage; budgets and backoff are covered in
[resilience patterns across servers](resilience-patterns-across-servers.md).

### Cloud load balancers

| Provider | Product | Layer and scope | Notes |
|---|---|---|---|
| AWS | Application Load Balancer | L7, regional | HTTP/1.1, HTTP/2, gRPC, WebSockets; host, path, and header rules; weighted target groups; round robin, least outstanding requests, or weighted random with anomaly mitigation; mutual TLS; Target Optimizer caps concurrent requests per target with an agent on each target (round robin only) |
| AWS | Network Load Balancer | L4, regional | TCP, UDP, TLS, TCP_UDP, QUIC, TCP_QUIC; a static IP per zone (Elastic IPs optional); flow-hash routing; client IP preservation; PROXY protocol v2; cross-zone balancing off by default |
| AWS | Gateway Load Balancer | L3, regional | Inserts virtual appliances (firewalls, intrusion detection) inline, using GENEVE on port 6081 and Gateway Load Balancer endpoints |
| AWS | Classic Load Balancer | L4 and L7, regional | Previous generation; AWS recommends migrating |
| Google Cloud | Application Load Balancers | L7: global external, regional external, classic, cross-region internal, regional internal | Global external uses a single anycast IP served by Envoy-based Google Front Ends; regional ones use Envoy |
| Google Cloud | Proxy Network Load Balancers | L4 proxy, global or regional | TCP with optional TLS offload |
| Google Cloud | Passthrough Network Load Balancers | L4 pass-through, regional | External ones are built on Maglev, internal ones on Andromeda; a global external version is in preview |
| Azure | Load Balancer (Standard) | L4, regional | Five-tuple hash by default; client IP persistence options; HA ports on internal balancers; the Basic SKU was retired on September 30, 2025 |
| Azure | Gateway Load Balancer | L3/L4 | Chains network virtual appliances in front of a Standard load balancer using VXLAN |
| Azure | Application Gateway v2 | L7, regional | WAF_v2 SKU with the OWASP Core Rule Set; v1 was retired on April 28, 2026; Application Gateway for Containers serves Kubernetes |
| Azure | Front Door Standard and Premium | L7, global | Latency, priority, weighted, and session-affinity routing at the edge; Front Door (classic) retires on March 31, 2027 |

DNS-based global routing (Route 53, Traffic Manager, Cloud DNS routing
policies) and anycast are covered in
[global traffic management](global-traffic-management.md).

### Software load balancers

| | Nginx | HAProxy | Envoy | Traefik |
|---|---|---|---|---|
| Typical role | Web server and reverse proxy that also balances | Dedicated, very fast L4 and L7 balancer | Sidecar, gateway, and mesh data plane, configured over APIs (xDS) | Edge router that discovers backends from Docker or Kubernetes |
| Algorithms | Round robin, weights, `least_conn`, `ip_hash`, `hash ... consistent`, `random two`, `least_time` (1.31 mainline) | `roundrobin`, `static-rr`, `leastconn`, `first`, `source`, `uri`, `hdr`, `random`, and more; `random` with two draws is the default since 3.3 | Round robin, least request (two choices by default), ring hash, Maglev, random | Weighted round robin (default), power of two choices, highest random weight, least time |
| Health checks | Passive (`max_fails`, `fail_timeout`) in open source; active checks in NGINX Plus | Active HTTP and TCP checks, passive observation | Active checks and outlier detection | Active checks and passive health checks |
| Runtime changes | Reload; DNS re-resolution with `resolve` | Runtime API (drain, weights, add servers) | Full dynamic configuration | Automatic from providers |

Open-source Nginx gained several former NGINX Plus features recently:
`resolve` in 1.27.3, `sticky`, `route`, and `drain` in 1.29.6, upstream
keepalive by default in 1.29.7, and `least_time` in the 1.31 mainline.
Distribution packages often ship older versions, so check `nginx -v`
before relying on them.

### Making the load balancer highly available

![Diagram: three panels; an active-standby pair where clients use virtual IP 10.0.0.100 held by LB 1 as master while LB 2 waits as backup receiving VRRP advertisements, and when LB 1 dies LB 2 claims the IP in seconds with gratuitous ARP, simple on bare metal but with idle standby capacity and API-based IP moves in clouds; a managed cloud load balancer whose DNS name returns node addresses in zones a, b, and c, each forwarding to targets, with nodes replaced and scaled by the provider and unhealthy zones removed from DNS, as long as at least two zones are enabled and clients re-resolve; and an active-active layer 4 tier where routers spread flows with ECMP across four balancers announcing one VIP over BGP and consistent hashing keeps each flow on the same backend, as in Maglev-style systems.](load-balancer-high-availability.svg)

- **Managed cloud balancers** are already a redundant fleet: AWS creates a
  load balancer node in every enabled Availability Zone and returns their
  addresses from the balancer's DNS name. Your job is to enable at least
  two zones, point DNS at the name (an alias record), not at an IP
  address, and let clients re-resolve.
- **A self-managed pair** shares a virtual IP with **keepalived**, which
  implements VRRP ([RFC 5798](https://www.rfc-editor.org/rfc/rfc5798.html)):
  the master holds the address and sends advertisements; when they stop,
  the backup claims the address and announces it with gratuitous ARP.
  Failover takes seconds, but the backup sits idle, and in most clouds
  moving an IP requires an API call rather than VRRP on the local network.
- **An active-active layer 4 tier** announces the same address from many
  balancers over BGP; routers spread flows across them with equal-cost
  multipath (ECMP). Because a router may rehash flows when a balancer
  joins or leaves, the balancers use consistent hashing (and connection
  tracking) so that a flow keeps reaching the same backend. This is the
  design of Google's Maglev and similar systems, described in
  [how top companies run at scale](how-top-companies-run-at-scale.md).

## When to use and when not to use

| Situation | Choose | Avoid |
|---|---|---|
| Public HTTP API or website on a cloud | Managed L7 balancer (ALB, Google Application LB, Application Gateway) with least outstanding requests | One public IP per instance; DNS round robin across instances |
| Non-HTTP TCP or UDP protocol, static IPs, millions of connections | Managed L4 balancer (NLB, Azure Load Balancer) with the PROXY protocol or client IP preservation | An L7 balancer in TCP mode as a workaround for everything |
| gRPC between services | L7 proxy or mesh, or client-side `round_robin` with a headless Service | A plain L4 Service with long-lived channels |
| Cache tier keyed by URL or user | Consistent hashing | Round robin (every node caches everything) or modulo hashing |
| Many balancers or sidecars choosing independently | Power of two choices (`random two`, Envoy `least_request`) | Every balancer chasing the globally least-loaded backend |
| Self-hosted on VMs or bare metal | Nginx or HAProxy, with keepalived for a redundant pair | A single balancer with no standby |
| Sessions in memory you cannot remove yet | Sticky sessions as a temporary measure | Relying on stickiness for correctness long term |

## Practical examples

### Nginx as a layer 7 balancer for TaskFlow API

```nginx
# /etc/nginx/conf.d/taskflow-api.conf: L7 balancing with TLS, retries, and WebSockets
upstream taskflow_api {
    zone taskflow_api 64k;                # shared state across worker processes
    least_conn;
    server 10.0.1.11:3000 max_fails=3 fail_timeout=10s max_conns=200;
    server 10.0.2.11:3000 max_fails=3 fail_timeout=10s max_conns=200;
    server 10.0.3.11:3000 max_fails=3 fail_timeout=10s max_conns=200;
    server 10.0.9.11:3000 backup;         # used only when all others are unavailable
    keepalive 32;
    keepalive_timeout 60s;
}

upstream taskflow_realtime {
    zone taskflow_realtime 64k;
    least_conn;
    sticky cookie tf_srv expires=1h path=/ httponly secure samesite=lax;  # nginx 1.29.6+
    server 10.0.1.11:3001;
    server 10.0.2.11:3001;
    server 10.0.3.11:3001 drain;          # keeps its sticky clients, gets no new ones
}

server {
    listen 443 ssl;
    http2 on;
    server_name api.taskflow.example.com;
    ssl_certificate     /etc/nginx/tls/api.taskflow.example.com/fullchain.pem;
    ssl_certificate_key /etc/nginx/tls/api.taskflow.example.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    proxy_connect_timeout 2s;
    proxy_read_timeout    30s;
    proxy_send_timeout    30s;

    location / {
        proxy_pass http://taskflow_api;
        proxy_http_version 1.1;           # default since 1.29.7; needed for keepalive before
        proxy_set_header Connection "";
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Request-Id $request_id;
        proxy_next_upstream error timeout http_502 http_503 http_504;
        proxy_next_upstream_tries 2;      # the original attempt plus one retry
        proxy_next_upstream_timeout 5s;
    }

    location /realtime/ {
        proxy_pass http://taskflow_realtime;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 1h;            # idle sockets stay open; clients ping every 30 s
    }
}
```

- `max_fails=3 fail_timeout=10s` is passive health checking: three failed
  attempts within 10 seconds mark a server unavailable for 10 seconds. What
  counts as a failure is defined by `proxy_next_upstream`.
- `max_conns=200` caps concurrent connections per server, so one slow
  server cannot absorb unlimited work. `backup` cannot be combined with the
  `hash`, `ip_hash`, or `random` methods.
- The `/realtime/` upstream keeps Socket.IO clients on one server with a
  cookie and uses `drain` to empty a server before maintenance. Both need
  nginx 1.29.6 or later; on older open-source versions use `hash
  $remote_addr consistent`.

Two more upstream patterns:

```nginx
# /etc/nginx/conf.d/taskflow-cache-tier.conf: hashing and two random choices
upstream thumbnail_cache {
    hash $request_uri consistent;         # ketama: adding a server moves about 1/N of URLs
    server 10.0.5.11:8080;
    server 10.0.5.12:8080;
    server 10.0.5.13:8080;
}

upstream taskflow_api_fleet {
    zone taskflow_api_fleet 64k;
    random two least_conn;                # power of two choices on connection counts
    server 10.0.1.11:3000;
    server 10.0.1.12:3000;
    server 10.0.2.11:3000;
    server 10.0.2.12:3000;
}
```

### A layer 4 tier with the PROXY protocol

```nginx
# /etc/nginx/nginx.conf (stream section of the L4 tier): route TLS by SNI without decrypting
stream {
    map_hash_bucket_size 64;              # default follows the CPU cache line; long names need more
    map $ssl_preread_server_name $tls_pool {
        api.taskflow.example.com  taskflow_api_tls;
        default                   taskflow_web_tls;
    }

    upstream taskflow_api_tls {
        least_conn;
        server 10.0.1.11:8443;
        server 10.0.2.11:8443;
    }

    upstream taskflow_web_tls {
        server 10.0.1.21:8443;
        server 10.0.2.21:8443;
    }

    server {
        listen 443;
        ssl_preread on;                   # read the SNI name from the ClientHello
        proxy_pass $tls_pool;
        proxy_protocol on;                # prepend the client's address to each connection
        proxy_connect_timeout 2s;
    }
}
```

```nginx
# /etc/nginx/conf.d/taskflow-api-node.conf: each API node accepts the PROXY protocol
server {
    listen 8443 ssl proxy_protocol;
    server_name api.taskflow.example.com;
    ssl_certificate     /etc/nginx/tls/api.taskflow.example.com/fullchain.pem;
    ssl_certificate_key /etc/nginx/tls/api.taskflow.example.com/privkey.pem;

    set_real_ip_from 10.0.0.0/16;         # only the L4 tier may assert a client address
    real_ip_header   proxy_protocol;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header X-Forwarded-For $remote_addr;   # now the real client address
        proxy_set_header X-Forwarded-Proto https;
    }
}
```

The node terminates TLS itself, so the L4 tier never holds a private key,
yet the app still sees the real client address.

### HAProxy for TaskFlow API

```ini
# /etc/haproxy/haproxy.cfg: TLS termination, health checks, and slow start (HAProxy 3.4)
global
    log stdout format raw local0
    stats socket /run/haproxy/admin.sock mode 660 level admin
    ssl-default-bind-options ssl-min-ver TLSv1.2

defaults
    mode http
    log global
    option httplog
    option forwardfor                  # append the client address to X-Forwarded-For
    option redispatch                  # a retry may go to another server
    retries 2
    retry-on conn-failure              # the default: never replay a request that was sent
    timeout connect 3s
    timeout client 60s
    timeout server 30s
    timeout http-request 10s
    timeout http-keep-alive 10s
    timeout tunnel 1h                  # WebSocket connections after the upgrade

frontend api
    bind :80
    bind :443 ssl crt /etc/haproxy/certs/api.taskflow.example.com.pem alpn h2,http/1.1
    http-request redirect scheme https code 301 unless { ssl_fc }
    http-request set-header X-Forwarded-Proto https if { ssl_fc }
    use_backend taskflow_realtime if { path_beg /realtime/ }
    default_backend taskflow_api

backend taskflow_api
    balance leastconn
    option httpchk
    http-check send meth GET uri /readyz ver HTTP/1.1 hdr Host api.taskflow.example.com
    http-check expect status 200
    default-server inter 2s fall 3 rise 2 slowstart 30s maxconn 200
    server api1 10.0.1.11:3000 check
    server api2 10.0.2.11:3000 check
    server api3 10.0.3.11:3000 check

backend taskflow_realtime
    balance leastconn
    cookie TFSRV insert indirect nocache httponly secure
    option httpchk
    http-check send meth GET uri /readyz ver HTTP/1.1 hdr Host api.taskflow.example.com
    http-check expect status 200
    default-server inter 2s fall 3 rise 2
    server rt1 10.0.1.11:3001 check cookie rt1
    server rt2 10.0.2.11:3001 check cookie rt2
```

- `inter 2s fall 3 rise 2` removes a server after about six seconds of
  failed checks and restores it after two passing checks; `slowstart 30s`
  then ramps its weight and connection limit up over 30 seconds.
- `retry-on conn-failure` plus `option redispatch` retries only requests
  that never reached a server, on a different server, so a `POST` that
  timed out is not sent twice.
- `cookie TFSRV insert indirect nocache` makes HAProxy add its own
  persistence cookie for the real-time backend only.

Draining a server through the runtime API before maintenance:

```bash
# Stop new traffic to api2; established connections finish, health checks continue
echo "set server taskflow_api/api2 state drain" | socat stdio /run/haproxy/admin.sock
echo "show servers state taskflow_api" | socat stdio /run/haproxy/admin.sock
# ... patch or redeploy api2, wait until /readyz passes ...
echo "set server taskflow_api/api2 state ready" | socat stdio /run/haproxy/admin.sock
```

### Tuning an AWS target group

```bash
# Health checks: probe /readyz every 10 s; 2 failures remove, 3 successes restore
aws elbv2 modify-target-group \
  --target-group-arn "<target-group-arn>" \
  --health-check-path /readyz \
  --health-check-interval-seconds 10 \
  --health-check-timeout-seconds 5 \
  --unhealthy-threshold-count 2 \
  --healthy-threshold-count 3 \
  --matcher HttpCode=200

# Drain for 30 s instead of 300, and balance on requests in flight
aws elbv2 modify-target-group-attributes \
  --target-group-arn "<target-group-arn>" \
  --attributes \
    Key=deregistration_delay.timeout_seconds,Value=30 \
    Key=load_balancing.algorithm.type,Value=least_outstanding_requests

# Watch target states: initial, healthy, unhealthy, draining, unused
aws elbv2 describe-target-health --target-group-arn "<target-group-arn>"
```

To use slow start instead (`slow_start.duration_seconds`, 30 to 900), keep
`round_robin`, because ALB does not combine slow start with least
outstanding requests.

### Reading the client address in Express

```js
// src/client-ip.js: the client address behind exactly one load balancer
import express from "express";

export const app = express();
app.set("trust proxy", 1);    // trust the last hop only: the load balancer

app.get("/whoami", (req, res) => {
  // X-Forwarded-For "203.0.113.9, 198.51.100.7" from the balancer at 10.0.1.5:
  // req.ip is "198.51.100.7", the address the balancer itself saw.
  // "203.0.113.9" may have been typed by the client, so it is ignored.
  res.json({ ip: req.ip, protocol: req.protocol });
});
```

Use the same rule anywhere the address matters, such as rate limits, audit
logs, and allowlists: take the address added by your own outermost proxy,
never the leftmost entry.

## Best practices

- Prefer managed, multi-zone load balancers; self-manage only with a
  redundant pair or tier.
- Use L7 balancing for HTTP and gRPC, L4 for other protocols or when you
  need static IPs and maximum throughput.
- Default to least outstanding requests or least connections for APIs;
  use consistent hashing only where data placement matters.
- Health-check a cheap readiness endpoint; keep dependencies out of
  liveness, and know what your balancer does when every target fails.
- Tune check intervals and thresholds so detection takes seconds, not a
  minute, without flapping.
- Set the deregistration delay just above your longest normal request, and
  make the app fail readiness and drain on `SIGTERM`.
- Use slow start or a warm-up for instances with cold caches.
- Keep app keep-alive timeouts longer than the balancer's idle timeout.
- Retry at one layer only, and only for idempotent requests or requests
  that never reached a backend.
- Trust forwarded client addresses only from your own proxies, and enable
  the PROXY protocol on both ends at once.

## In production

- **One backend is overloaded while the others idle.**
  *Detect:* per-backend request rate or CPU is very uneven, often for gRPC
  or HTTP/2 traffic. *Cause:* connection-level balancing of long-lived
  multiplexed connections, or sticky sessions. *Fix:* L7 per-request
  balancing, client-side `round_robin`, or a maximum connection age on the
  server; remove stickiness that is not needed.
- **Intermittent 502 errors during quiet periods.**
  *Detect:* balancer logs show the backend closed the connection; 502s
  cluster on idle, reused connections. *Cause:* the app's keep-alive timeout
  (Node defaults to 5 seconds) is shorter than the balancer's idle timeout,
  so the app closes a connection the balancer is about to reuse. *Fix:* set
  `server.keepAliveTimeout` above the balancer's idle timeout.
- **Health checks pass while users get errors.**
  *Detect:* targets show healthy, yet the 5xx rate is high. *Cause:* a TCP
  or `/` check that does not exercise what requests need. *Fix:* a
  `/readyz` that checks readiness cheaply, plus passive outlier detection.
- **Every target turned unhealthy at once, and traffic kept flowing to
  broken instances.**
  *Detect:* all targets unhealthy at the same moment, often during a
  database incident, and the balancer failing open. *Cause:* the health
  check depends on a shared dependency. *Fix:* check only local readiness,
  and handle dependency failures inside the app with timeouts and
  degradation.
- **Deploys take 25 minutes.**
  *Detect:* each batch waits in `draining` for five minutes. *Cause:* the
  default 300-second deregistration delay. *Fix:* set it just above the
  longest normal request, such as 30 seconds, after confirming the app
  drains on `SIGTERM`.
- **WebSocket users are disconnected every minute.**
  *Detect:* reconnects every 60 seconds on idle sockets. *Cause:* the
  balancer's idle timeout with no traffic on the socket. *Fix:* heartbeat
  pings more often than the idle timeout, or a longer idle timeout for the
  real-time route.
- **All users share one rate limit, or logs show only the balancer's
  address.**
  *Detect:* `req.ip` is the balancer's private address for every request.
  *Cause:* `trust proxy` is not set, or the PROXY protocol is enabled on one
  side only. *Fix:* trust exactly your proxy hops, and enable the PROXY
  protocol on the balancer and the backend together.

## Important terminology

- **Layer 4 / layer 7 load balancing:** Balancing per connection on
  addresses and ports, or per request on HTTP content.
- **Target, backend, upstream:** A server the balancer can send traffic to.
- **Active health check:** A probe sent to each backend on a schedule.
- **Passive health check (outlier detection):** Removing a backend based on
  errors in real traffic.
- **Fail open (panic mode):** Sending traffic to all backends when too few
  are healthy.
- **Connection draining (deregistration delay):** Letting in-flight requests
  finish on a backend that gets no new ones.
- **Slow start:** Ramping a new backend's share of traffic up gradually.
- **Sticky session (session affinity):** Routing a client to the same
  backend repeatedly.
- **Consistent hashing:** Mapping keys to backends so that adding or
  removing one moves only about 1/N of the keys.
- **Power of two choices:** Picking the less loaded of two random backends.
- **PROXY protocol:** A header at the start of a TCP connection that carries
  the client's original address.
- **VRRP / virtual IP:** A protocol and shared address that let a standby
  balancer take over from a failed one.
- **ECMP:** Equal-cost multipath routing, which spreads flows across
  several next hops, such as a tier of balancers.
- **Direct server return (DSR):** Backends replying to clients directly,
  bypassing the balancer on the way back.

## Common mistakes and misconceptions

- Thinking round robin spreads load evenly when request costs differ.
- Health-checking `/` or a TCP port and calling the service healthy.
- Putting database checks in the endpoint the balancer uses, so one
  database blip removes every instance.
- Leaving the 300-second deregistration delay in place and blaming the
  pipeline for slow deploys.
- Trusting the leftmost `X-Forwarded-For` entry for rate limits or access
  control.
- Enabling the PROXY protocol on the balancer but not on the backend, or the
  reverse.
- Expecting a layer 4 balancer to spread gRPC or HTTP/2 requests.
- Retrying non-idempotent requests at the balancer and at the client.
- Forgetting that the balancer itself needs redundancy.

## Revision questions

1. What can a layer 7 balancer do that a layer 4 balancer cannot, and when
   would you still choose layer 4?
2. A target group checks every 15 seconds with an unhealthy threshold of 3
   and a healthy threshold of 4. Roughly how long does it take to remove a
   dead instance, and to restore a recovered one? (About 45 seconds; about
   60 seconds.)
3. Why does consistent hashing suit a cache tier better than modulo hashing?
   What share of keys move when a tier grows from 9 to 10 servers with each?
   (Modulo: about 90%; consistent: about 10%.)
4. Why does power of two choices help most when there are many independent
   balancers?
5. What does "fail open" mean, which balancers do it, and why does a health
   check that tests the database make it more likely?
6. Explain connection draining, the deregistration delay, and slow start, and
   how each protects users during a rolling deploy.
7. How does a backend learn the client's real address behind an L7 balancer,
   and behind an L4 balancer? What breaks if only one side enables the PROXY
   protocol?
8. Compare a keepalived pair, a managed cloud balancer, and an ECMP tier as
   ways to keep the balancer itself available.

## Further learning

- [Nginx: ngx_http_upstream_module](https://nginx.org/en/docs/http/ngx_http_upstream_module.html)
- [HAProxy 3.4 configuration manual](https://docs.haproxy.org/3.4/configuration.html)
- [Envoy: Load balancing](https://www.envoyproxy.io/docs/envoy/latest/intro/arch_overview/upstream/load_balancing/load_balancing)
- [AWS: Target groups for Application Load Balancers](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/load-balancer-target-groups.html)
- [Google Cloud: Cloud Load Balancing overview](https://docs.cloud.google.com/load-balancing/docs/load-balancing-overview)
- [Azure: Load balancing options](https://learn.microsoft.com/en-us/azure/architecture/guide/technology-choices/load-balancing-overview)
- [HAProxy: The PROXY protocol specification](https://www.haproxy.org/download/3.4/doc/proxy-protocol.txt)
- [Load balancing](../../07-servers-and-infrastructure/load-balancing.md)
  and [Nginx](../../07-servers-and-infrastructure/nginx.md) in the Servers
  and Infrastructure section
- Next: [global traffic management](global-traffic-management.md). Back to
  the [load balancing and multi-server overview](../load-balancing-and-multi-server.md).
