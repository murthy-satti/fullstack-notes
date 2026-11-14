# Load Balancing and Multi-Server Interview Questions and Answers

These questions review the move from one server to many, load balancers,
global traffic management, multi-AZ and multi-region architecture,
autoscaling, service discovery and meshes, resilience patterns, and how
large companies apply them. They end with traffic-path design questions
and production scenarios. Try answering each one before reading the
answer.

## From one server to many

### 1. What are the usual stages of growth from one server, and what breaks at each?

One server (any reboot is an outage) → a separate managed database (the
app server is still a single point of failure) → several app instances
behind a load balancer (instance-local state breaks) → caches and a CDN
(staleness and invalidation) → multiple Availability Zones (capacity for
a lost zone, cross-zone latency) → multiple regions (replication lag,
write conflicts, data residency, cost).

### 2. What does "stateless" mean for an app tier, and what must leave the instance?

Any instance can serve any request, and losing an instance loses nothing
but in-flight work. Sessions move to a shared store such as Redis (or into
signed tokens), uploads go to object storage, caches become shared or
tolerant of misses, scheduled jobs run once across the fleet through a
per-run claim or a single scheduler, and WebSocket messages fan out
through a shared channel such as a Redis adapter.

### 3. Why are sticky sessions a weak substitute for shared session storage?

They tie a user to one instance, so that instance's failure, scale-in, or
deploy logs the user out or loses work, and load becomes uneven because
long sessions pile onto old instances. They are acceptable as a temporary
step, not as the design.

### 4. How do you make sure a cron job runs once when ten instances run the same code?

Claim each scheduled run: every instance tries `SET` with `NX` and an
expiry on a key made of the job name and the scheduled time, only the
first succeeds, and the key is left to expire rather than deleted, so an
instance whose clock is late cannot run the same occurrence again. Or
move scheduling out of the app into a single scheduler (a Kubernetes
CronJob, a cloud scheduler) that triggers one worker. Make the job
idempotent in case two runs ever overlap.

### 5. When do you scale up and when do you scale out?

Scale up (a bigger machine) when it is simple and the workload is hard to
split, such as a primary database, accepting a hard ceiling and a single
point of failure. Scale out (more machines) for stateless tiers: it adds
redundancy and near-linear capacity but requires statelessness and a load
balancer.

## Load balancers in depth

### 6. What is the difference between a layer 4 and a layer 7 load balancer?

An L4 balancer forwards TCP or UDP connections by address and port
without reading the payload: fast, protocol-agnostic, balancing per
connection. An L7 balancer terminates HTTP, reads paths, headers, and
cookies, and balances per request: routing rules, retries, header
injection, and gRPC awareness, at more cost per request.

### 7. Which balancing algorithm would you choose for an HTTP API, a cache tier, and WebSockets?

For an HTTP API with varying request times, least outstanding requests (or
least connections). For a cache tier, consistent hashing on the key so the
same key reaches the same cache and only about 1/N of keys move when a node
is added. For WebSockets, least connections, because connections are
long-lived and request counts mean little.

### 8. Why does modulo hashing hurt when a node is added?

With `hash(key) mod N`, changing N from 4 to 5 moves about 80% of keys,
so every cache goes cold at once. Consistent hashing moves only the keys
that now belong to the new node, about 1/5.

### 9. What is "power of two random choices", and why is it used?

Pick two backends at random and send to the less loaded one. It gets
almost the benefit of checking every backend while avoiding herd
behavior, because independent balancers rarely sample the same pair. It
suits large fleets with many independent balancers or sidecars.

### 10. How are health check detection and recovery times calculated?

Roughly interval × unhealthy threshold (plus the probe timeout) to remove a
backend, and interval × healthy threshold to restore it. A 10-second
interval with a threshold of 3 means up to about 30 seconds of failed
requests before removal, so pair active checks with passive outlier
detection.

### 11. What does it mean that load balancers "fail open"?

When every backend fails its health check, many balancers route to all of
them rather than none (AWS ALB and NLB, Envoy below its panic threshold,
Azure Front Door). It prevents a total outage caused by a bad health
check, but it also means a check that depends on a shared dependency stops
protecting you exactly when it fails everywhere.

### 12. What are connection draining and slow start?

Draining (AWS calls it the deregistration delay, 300 seconds by default)
stops new requests to a backend being removed while in-flight requests
finish. Slow start ramps a new backend's share of traffic up gradually so
cold caches and JIT compilers are not hit with a full share at once.

### 13. How does the application learn the real client IP behind a load balancer?

An L7 balancer adds `X-Forwarded-For` (and `X-Forwarded-Proto`); the app
must trust only the known proxy hops, or clients can spoof the header. An
L4 balancer can preserve the client IP or send the PROXY protocol header
at the start of the connection, which the backend must be configured to
expect.

### 14. How do you keep the load balancer itself from being a single point of failure?

Use a managed load balancer, which runs nodes in every enabled zone behind
its DNS name; or a self-managed pair sharing a virtual IP through
keepalived and VRRP; or an active-active L4 tier announcing one address
over BGP with ECMP and consistent hashing, as in Maglev-style designs.

## Global traffic management

### 15. What DNS routing policies are available, and what is each for?

Geolocation (answer by the resolver's location: data residency, local
content), latency-based (the region with the lowest measured latency),
weighted (gradual shifts, canary regions), and failover (primary and
secondary with health checks). Route 53, Cloudflare load balancing, and
Azure Traffic Manager offer equivalents.

### 16. How long does a DNS-based failover take?

Detection (interval × threshold), the DNS change itself, then resolver
caches for up to the TTL, plus clients that cache longer and long-lived
connections that never re-resolve. With 30 seconds of detection and a
60-second TTL, most new requests move between 30 and 90 seconds; with a
3,600-second TTL a short incident can last an hour for some users.

### 17. What is anycast, and what are its trade-offs?

The same IP prefix is announced over BGP from many locations, and each
network routes to the one its routing prefers. Failover needs no DNS
change and attack traffic spreads across locations, but routing policy,
not distance, picks the location, convergence takes seconds to minutes,
and route changes can break long-lived TCP flows.

### 18. Why can a global L7 proxy fail over faster than DNS?

Clients keep talking to the same anycast edge address, and the edge
chooses an origin per request based on health and capacity, so there are
no resolver caches to expire. The trade-offs are HTTP-only protocols,
provider lock-in, and cost.

### 19. Why should failover health checks run from many locations?

A single checker can be cut off by its own network problem and declare a
healthy region dead. Checks from several regions, combined with a rule
that needs enough of them to agree, avoid false failovers caused by
partial network failures. Route 53, for example, treats an endpoint as
healthy when more than 18% of its checkers report it healthy.

### 20. Why can a shared dependency in a regional health check disable failover?

If every region's check fails at once because they test the same shared
dependency, providers such as Route 53 treat "all unhealthy" as "all
healthy" and keep answering normally. Regional checks should test what is
specific to that region.

## Multi-AZ and multi-region architecture

### 21. What is the difference between a region and an Availability Zone?

An Availability Zone is one or more data centers with independent power,
cooling, and networking; a region is a group of zones close enough for
low-latency, often synchronous replication. Zones protect against a data
center failure, regions against a regional outage or disaster.

### 22. Why is multi-AZ considered the baseline for production?

Zone failures happen, and spreading load balancer nodes, app instances,
and a database standby across two or three zones costs little extra
compared with multi-region. It removes the single data center as a single
point of failure with almost no change to the application.

### 23. Compare pilot light, warm standby, and active-active.

Pilot light keeps data replicated and infrastructure defined, with compute
switched off, so recovery means starting and scaling it (slowest,
cheapest). Warm standby runs a smaller full copy that can serve at reduced
capacity immediately and scales up during failover. Active-active serves
traffic from every region all the time: the fastest recovery and best
latency, but the hardest data problems and the highest cost. Recovery
objectives are covered in
[disaster recovery, RPO, and RTO](../backups/disaster-recovery-rpo-and-rto.md).

### 24. How do synchronous and asynchronous replication affect RPO?

Synchronous replication waits for the remote copy before acknowledging a
write, giving an RPO of zero but adding the round-trip latency to every
write, which is practical within a region. Asynchronous replication
acknowledges first, so the RPO equals the replication lag at the moment of
failure; it is the usual choice between regions.

### 25. What problems does active-active across regions add?

Write conflicts when the same record changes in two regions (solved by
routing each user's writes to a home region, single-writer partitioning,
or conflict-free data types; last-writer-wins rules also resolve them but
silently discard one of the two updates), replication lag visible to users, data residency rules about where data may live, and
roughly doubled infrastructure and cross-region transfer cost.

### 26. Why must failovers be drilled regularly?

Untested failovers fail: runbooks drift, capacity in the other region is
missing, DNS TTLs are too long, and dependencies are discovered on the
day. Regular drills (and evacuations, as Netflix and Slack practice) prove
the path works and keep the team practiced.

## Autoscaling server fleets

### 27. What are the parts of an autoscaling group?

A template (image, instance type, user data, role), a group with minimum,
maximum, and desired size across zones, health checks that replace broken
instances, and scaling policies. AWS calls them launch templates and Auto
Scaling groups, Google Cloud instance templates and managed instance
groups, and Azure Virtual Machine Scale Sets.

### 28. How does target tracking decide how many instances to add?

It keeps a metric near a target, assuming the metric falls in proportion
to the number of instances. Ten instances at 1,500 requests per target
with a target of 1,000 need about 10 × 1,500 / 1,000 = 15. It scales out
quickly and in gradually.

### 29. Which metrics make good scaling signals?

Request count per target or CPU for web tiers, backlog per instance
(queue depth divided by instances) for workers, or a custom per-instance
load metric. Latency and raw queue length are poor target tracking
metrics because they do not fall in proportion to the fleet size.

### 30. Why does new capacity arrive minutes after a spike, and how do you compensate?

The alarm needs several datapoints, then the instance must boot, start
the application, and pass health checks. Compensate with headroom (a lower
target), golden images for fast boot, warm or standby pools, and scheduled
or predictive scaling for known ramps.

### 31. What are lifecycle hooks and scale-in protection for?

Hooks pause an instance at launch (finish setup before taking traffic) or
termination (drain, flush, finish jobs) until code completes the action or
the heartbeat timeout expires. Scale-in protection keeps specific
instances, such as a worker mid-job, from being chosen for scale-in.

### 32. What is static stability, and how does it change capacity planning?

A statically stable service survives an impairment without having to make
changes, such as launching instances during a zone failure. You run
enough capacity in the remaining zones in advance: needing 12 instances,
you run 6 in each of 3 zones, so losing one still leaves 12.

## Service discovery and service mesh

### 33. Why is service discovery needed?

Instances come and go with autoscaling, deploys, and failures, and get new
addresses each time. Callers need a live list of healthy instances rather
than hard-coded addresses.

### 34. What is the difference between client-side and server-side discovery?

In client-side discovery the caller reads a registry and picks an instance
itself (Eureka with Spring Cloud, gRPC with DNS or xDS): no extra hop,
smarter balancing, but a library per language. In server-side discovery
the caller uses a stable name and a load balancer or the platform picks
(cloud internal load balancers, Kubernetes Services).

### 35. What are the pitfalls of DNS-based discovery?

Caching: resolvers and clients keep answers until the TTL or longer, and
open keep-alive or HTTP/2 connections keep going to old instances. Plain
DNS also cannot express health, zones, or weights. Use short TTLs, cap
connection age, and retry on another instance.

### 36. How do Consul and Eureka differ?

Consul runs an agent on each node that health-checks services, keeps a
consistent catalog with Raft, and offers DNS and HTTP interfaces, a
key-value store, and a mesh. Eureka is a REST registry where instances
renew leases (every 30 seconds, removed after 90 seconds) and clients
cache the registry; it favors availability, with a self-preservation mode
during mass renewal loss.

### 37. What does a service mesh provide, and what does it cost?

Proxies on every hop, configured by a control plane, provide mutual TLS
with workload identities, authorization policy, per-request load
balancing, timeouts, retries, outlier detection, traffic splitting, and
uniform telemetry without code changes. The costs are proxy CPU and
memory, extra latency per hop, a control plane to operate, harder
debugging, and possible retry amplification.

### 38. What is Istio's ambient mode?

A sidecarless data plane: a per-node ztunnel provides mutual TLS, L4
authorization, and L4 telemetry for all Pods on the node, and optional
waypoint proxies per namespace or service add L7 features only where
needed. It has been generally available since Istio 1.24 (November 2024).

## Resilience patterns across servers

### 39. How do you choose a timeout for a remote call?

From the dependency's measured latency and an acceptable false-timeout
rate, for example its p99.9 latency for a 0.1% rate, with padding when the
distribution is tight. Inner timeouts must fit inside outer ones, ideally
by propagating the remaining deadline budget.

### 40. When is retrying a request safe?

When the operation is idempotent (or carries an idempotency key) and the
failure is likely transient: connection errors, timeouts, 429, 502, 503,
504. Never retry client errors such as 400 or 404.

### 41. Why add jitter to exponential backoff?

Without jitter, clients that failed together retry together, and each
wave hits the recovering service at once. Full jitter waits a random time
between zero and the exponential backoff, spreading the same retries over
time.

### 42. What is a retry storm, and how do you prevent one?

Load amplification when many clients or many layers retry at once: three
attempts at each of five layers can multiply load up to 3⁵ = 243 times.
Retry at one layer only, cap attempts, add jitter, and use a retry budget
that keeps retries to about 10% of traffic.

### 43. Describe the circuit breaker states.

Closed: calls pass and results are recorded. Open: after the failure rate
crosses a threshold over a minimum number of calls, calls fail fast for a
cool-down period. Half-open: a few trial calls are allowed; success closes
the breaker, failure reopens it.

### 44. What is the difference between a bulkhead and load shedding?

A bulkhead partitions capacity per dependency or workload, so one slow
dependency can only exhaust its own share. Load shedding rejects excess
work at the entrance when the whole service is saturated, so the requests
it accepts still finish quickly (protecting goodput).

### 45. Where should rate limiting happen, and how is it different from load shedding?

At the edge (CDN, WAF, gateway) to stop abusive clients before they cost
compute, and inside services to enforce per-tenant fairness. Rate limits
cap each client regardless of service health; load shedding reacts to the
service's own overload.

## How top companies run at scale

### 46. Why did Google build Maglev instead of using hardware load balancers?

The Maglev paper lists capacity limited by a single unit, only 1+1
redundancy, little flexibility, and costly upgrades. Maglev runs on
commodity servers behind ECMP, uses consistent hashing and connection
tracking so flows keep their backends, and uses direct server return.

### 47. What problem did GitHub's GLB Director and Cloudflare's Unimog solve that ECMP alone could not?

ECMP rehashes flows when servers join or leave, breaking connections, and
cannot weight by load. GLB Director adds stateless directors with a
"second chance" so draining servers finish their flows; Unimog makes every
server a load balancer and adjusts connection shares by measured load.

### 48. How did Netflix cut region failover from about 50 minutes to under 10?

Most of the 50 minutes was spent after the decision: provisioning,
starting services, and warming them up. With "dark capacity", instances
already running but held out of service, failover became mostly a DNS
change.

### 49. What is shuffle sharding?

Each customer gets a small pseudo-random subset of workers, so customers
rarely share their whole subset. With 8 workers and pairs there are 28
possible shards, so a poison customer fully affects about 1 in 28
customers instead of a whole shard; Route 53 gives each domain 4 of 2,048
virtual name servers.

### 50. What are Slack's AZ cells and Shopify's pods?

Slack siloed services so each only talks within its own Availability
Zone, making a zone a cell that operators can drain in minutes without
knowing the root cause. Shopify's pods give each set of shops its own
isolated datastores and route every request to exactly one pod, so one
pod's failure stays inside it.

## Design the traffic path

### 51. Design the traffic path for the TaskFlow API serving users in Europe and North America.

**Requirements:** low latency on both continents, survive a zone and a
region failure, data residency for European users.

**Traffic path:** a global edge (anycast L7 proxy or CDN) terminates TLS
near users → per-region load balancers in two regions (one in each
continent) → app fleets across three zones per region → a database with
each user homed in their continent's region, replicating asynchronously
for disaster recovery to a second region the residency rules allow (a
second European region for European users).

**Key decisions:** route by home region so writes have a single owner,
health checks per region from many locations, short TTLs or a global proxy
for failover, capacity in each recovery region to absorb the traffic it
takes over during an evacuation.

### 52. Design the traffic path for a WebSocket chat service.

**Requirements:** millions of long-lived connections, messages delivered
across instances, safe deploys.

**Traffic path:** DNS or anycast → an L4 or WebSocket-aware L7 balancer
using least connections → stateless gateway instances holding
connections → a shared pub/sub channel (such as Redis or a message broker)
so a message published on one instance reaches subscribers on others.

**Key decisions:** generous idle timeouts, connection draining with client
reconnects using jitter, deploys that drain slowly (rainbow or gradual),
and capacity planned per connection, not per request.

### 53. Design internal traffic for 40 gRPC microservices in Kubernetes.

**Requirements:** per-request balancing, encryption between services,
consistent timeouts and telemetry.

**Traffic path:** services call stable names; a mesh (sidecars or ambient
mode with waypoints) or client-side `round_robin` over headless Services
balances each request; mutual TLS everywhere.

**Key decisions:** deadlines propagated through calls, retries owned by
one layer with budgets, outlier detection, one circuit breaker per
dependency, and rollout of the mesh namespace by namespace in permissive
mode first.

### 54. Design the traffic path for a flash sale expected to bring ten times normal traffic.

**Requirements:** stay up and keep checkout working while browsing may
degrade.

**Traffic path:** CDN for static assets and cacheable pages → edge rate
limits and bot protection → load balancer → API fleet scaled up ahead of
time by a scheduled action → a queue or virtual waiting room in front of
checkout if capacity is exceeded.

**Key decisions:** pre-provision instead of relying on reactive scaling,
load shedding by priority (checkout over recommendations), bulkheads
between checkout and browsing, database connection limits, and a
load test of the whole path beforehand.

## Scenario-based questions

### 55. Users are logged out at random after the API moved behind a load balancer with three instances. What is wrong?

**What to check first:** where sessions are stored and whether the
balancer uses sticky sessions.

**How to confirm:** the logout happens when a request lands on a different
instance; session data exists in only one instance's memory.

**Likely causes and fixes:** in-memory sessions. Store sessions in Redis
(or use signed tokens) so any instance can serve any request; avoid
relying on stickiness. See
[from one server to many](from-one-server-to-many.md).

### 56. Every deploy causes a short burst of 502 errors. What do you check?

**What to check first:** the target group's deregistration delay and
the application's `SIGTERM` handling.

**How to confirm:** the errors line up with instances being
deregistered, and the instances exit before in-flight requests finish.

**Likely causes and fixes:** no draining, a delay of zero, or an app that
exits immediately. Set the delay just above the longest normal request,
fail readiness and finish in-flight work on `SIGTERM`, and close idle
keep-alive connections. See [load balancers in depth](load-balancers-in-depth.md).

### 57. One backend receives far more traffic than the others behind an L4 balancer. Why?

**What to check first:** the protocol and connection lifetimes.

**How to confirm:** clients use HTTP/2 or gRPC with long-lived
connections, and per-connection balancing put most of them on the oldest
instances.

**Likely causes and fixes:** connection-level balancing of multiplexed
protocols. Use an L7 balancer, client-side per-request balancing, or a
mesh, and cap connection age. See
[load balancers in depth](load-balancers-in-depth.md).

### 58. A region failed, DNS was switched within a minute, but users kept hitting the dead region for an hour. Why?

**What to check first:** the record TTL and how clients hold connections.

**How to confirm:** the record's TTL was 3,600 seconds, and many clients
kept using cached answers or open connections.

**Likely causes and fixes:** a long TTL and connections that never
re-resolve. Lower TTLs well before incidents, recycle connections, and
consider a global proxy or anycast for failover. See
[global traffic management](global-traffic-management.md).

### 59. Failover did not happen although the primary region was clearly down. What went wrong?

**What to check first:** the state of every health check in the failover
group during the incident.

**How to confirm:** all checks failed at once because they tested a shared
dependency, so the DNS service treated all records as healthy.

**Likely causes and fixes:** a health check that is not region-specific.
Check what is unique to each region, from several locations with a
quorum. See [global traffic management](global-traffic-management.md).

### 60. After failing over to the secondary region, users saw recent changes missing. Why?

**What to check first:** the replication mode and lag at the time of the
failover.

**How to confirm:** asynchronous replication was several seconds or
minutes behind, so the last writes never reached the secondary.

**Likely causes and fixes:** RPO equal to replication lag. Monitor lag,
decide the acceptable RPO in advance, reconcile lost writes from the old
primary afterwards, and where zero loss across regions is required, use a
synchronously replicated multi-region database in nearby regions. See
[multi-AZ and multi-region architecture](multi-az-and-multi-region-architecture.md).

### 61. Latency and errors spike every weekday morning until the fleet catches up. How do you fix it?

**What to check first:** scaling activity timestamps compared with the
traffic ramp.

**How to confirm:** new instances launch after the ramp starts and take
several minutes to pass health checks.

**Likely causes and fixes:** reactive scaling cannot follow a steep,
predictable ramp. Add a scheduled minimum before the ramp, try predictive
scaling in forecast-only mode, lower the target, and use warm pools. See
[autoscaling server fleets](autoscaling-server-fleets.md).

### 62. A traffic spike scaled the API to its maximum, and the site still went down. Why?

**What to check first:** the database's CPU and connection count during
the spike.

**How to confirm:** the database hit its connection limit as each new
instance opened its own pool.

**Likely causes and fixes:** the bottleneck was the database, and scaling
out made it worse. Cap the fleet size, pool or proxy connections, shed load
at the edge, and scale on the real bottleneck. See
[autoscaling server fleets](autoscaling-server-fleets.md).

### 63. Errors spike for a minute after every scale-in, from calls to addresses that no longer exist. What is happening?

**What to check first:** how callers discover instances and how long they
cache results.

**How to confirm:** callers use cached registry lists, DNS answers, or
keep-alive connections to terminated instances.

**Likely causes and fixes:** stale discovery data. Drain before
termination, shorten TTLs and cache lifetimes, cap connection age, and
retry connection failures on another instance. See
[service discovery and service mesh](service-discovery-and-service-mesh.md).

### 64. Enabling strict mutual TLS in the mesh broke a nightly job and the metrics scraper. Why?

**What to check first:** which callers are outside the mesh.

**How to confirm:** connections from workloads without a mesh identity are
reset.

**Likely causes and fixes:** strict mode rejects plaintext clients.
Migrate in permissive mode, bring every client into the mesh or give it a
certificate, then switch to strict. See
[service discovery and service mesh](service-discovery-and-service-mesh.md).

### 65. A short database blip turned into a 20-minute outage, with traffic several times normal. What happened?

**What to check first:** request rates at each layer and the retry
configuration of each client.

**How to confirm:** traces show the same request retried at several
layers, with retries arriving in synchronized waves.

**Likely causes and fixes:** a retry storm. Retry at one layer with full
jitter and a retry budget, fail fast elsewhere, and add circuit breakers.
See [resilience patterns across servers](resilience-patterns-across-servers.md).

### 66. A slow reports service made the whole API unresponsive, including login. Why?

**What to check first:** the API's concurrency and connection pool usage
by dependency.

**How to confirm:** every request slot was occupied by calls waiting on
reports.

**Likely causes and fixes:** no timeouts or bulkheads. Short per-try
timeouts, a separate concurrency limit per dependency, a circuit breaker
around reports, and a degraded response when it is unavailable. See
[resilience patterns across servers](resilience-patterns-across-servers.md).

### 67. One zone has intermittent packet loss, and users in every zone see errors. What do you do now, and what do you build next?

**What to check first:** whether errors correlate with calls that cross
into the impaired zone.

**How to confirm:** requests from all zones that touch services in the bad
zone are slow or failing, while other paths are fine.

**Likely causes and fixes:** a gray failure amplified by cross-zone calls.
Now: remove the zone from the load balancers and DNS. Next: silo services
within zones and build an incremental zone drain at the entry points, as
Slack did. See [how top companies run at scale](how-top-companies-run-at-scale.md).

### 68. One tenant's malformed requests keep crashing the shared worker fleet. How do you limit the damage?

**What to check first:** whether the crashes start with traffic from a
single tenant.

**How to confirm:** worker crashes follow that tenant's requests and spread
across every worker.

**Likely causes and fixes:** every tenant shares every worker. Fix the
parsing bug, then contain future cases with shuffle sharding (each tenant
on a small subset of workers) or cells per tenant group. See
[how top companies run at scale](how-top-companies-run-at-scale.md).

## Further learning

- [Load balancing and multi-server overview](../load-balancing-and-multi-server.md)
- [From one server to many](from-one-server-to-many.md) ·
  [Load balancers in depth](load-balancers-in-depth.md) ·
  [Global traffic management](global-traffic-management.md) ·
  [Multi-AZ and multi-region architecture](multi-az-and-multi-region-architecture.md) ·
  [Autoscaling server fleets](autoscaling-server-fleets.md) ·
  [Service discovery and service mesh](service-discovery-and-service-mesh.md) ·
  [Resilience patterns across servers](resilience-patterns-across-servers.md) ·
  [How top companies run at scale](how-top-companies-run-at-scale.md)
- [Google SRE book: Load Balancing in the Datacenter](https://sre.google/sre-book/load-balancing-datacenter/)
- [Amazon Builders' Library: Timeouts, retries, and backoff with jitter](https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/)
