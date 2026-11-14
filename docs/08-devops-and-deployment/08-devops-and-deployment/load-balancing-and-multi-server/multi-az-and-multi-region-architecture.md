# Multi-AZ and Multi-Region Architecture

A service in one data center fails with that data center. Cloud providers
group data centers into **Availability Zones** (independent failure
domains many kilometers apart; AWS keeps a region's zones within 100 km
of each other) and **regions** (separate geographic areas, each with
several zones). This lesson explains why running across several
zones is the baseline for production and how to size it so that losing a
zone needs no emergency scaling; when a second region is worth its cost;
the active-passive and active-active designs; synchronous and asynchronous
replication and what they mean for data loss (RPO); write conflicts and
the global databases that handle them; routing users to a home region;
data residency; failover runbooks and drills; and how each step multiplies
the bill.

Traffic steering between regions is covered in
[global traffic management](global-traffic-management.md), and recovery
objectives and DR strategies in
[disaster recovery, RPO, and RTO](../backups/disaster-recovery-rpo-and-rto.md);
this lesson connects them to the shape of the application and its data.

## Why it matters

Zones fail: power, cooling, networking, or a bad change can take one out,
and a service whose instances, NAT gateway, or database all sit in that
zone goes down with it. Spreading across zones costs little: managed load
balancers and databases support it out of the box, and the price is some
spare capacity and cross-zone data transfer.

Regions are a different decision. The compute is easy to copy; the data is
not. AWS's multi-Region guidance puts it bluntly: "Challenges around data
consistency and latency make it very difficult to take an existing
application that was designed for a single Region and make it
multi-Region." A second region doubles much of the infrastructure, adds
replication lag and conflicts, and introduces a failover procedure that
fails in its own ways if it is not practised. Done for the right reasons it
removes a whole class of outage; done by default it can lower availability.

## Real-world usage

- **Amazon: static stability.** The Builders' Library article
  [Static stability using Availability Zones](https://aws.amazon.com/builders-library/static-stability-using-availability-zones/)
  defines the goal ("In a statically stable design, the overall system
  keeps working even when a dependency becomes impaired") and explains
  that with three Availability Zones Amazon overprovisions by 50 percent,
  so the remaining zones absorb a lost one without launching new capacity
  during the event.
- **AWS multi-Region fundamentals.** The guide
  [Understanding the data](https://docs.aws.amazon.com/prescriptive-guidance/latest/aws-multi-region-fundamentals/fundamental-2.html)
  frames the trade-off: "By definition, a multi-Region architecture
  includes network partitions between Regions, so you have to choose
  between availability and consistency." It warns that when writes
  replicate synchronously across Regions, "write latency increases by an
  order of magnitude", and that "Most workloads that use a multi-Region
  approach for resilience won't require an active-active approach."
- **Netflix: active-active.** In
  [Active-Active for Multi-Regional Resiliency](https://netflixtechblog.com/active-active-for-multi-regional-resiliency-c47719f6685b)
  Netflix lists its rules: services must be stateless, with "all data /
  state replication" handled in the data tier, and "there should not be any
  cross-regional calls on user's call path". The later post
  [Project Nimble: Region Evacuation Reimagined](https://netflixtechblog.com/project-nimble-region-evacuation-reimagined-d0d0568254d4)
  describes cutting a full region evacuation to "8 minutes, as opposed to
  the 50 minutes it used to take", while remaining cost neutral.
- **Slack: zones as cells.** In
  [Slack's Migration to a Cellular Architecture](https://slack.engineering/slacks-migration-to-a-cellular-architecture/)
  Slack describes "siloed" services that only take traffic from and send
  traffic within their own zone, and a control that removes traffic from an
  Availability Zone "within 5 minutes", in steps as small as 1%.
- **Amazon DynamoDB global tables.** The documentation on
  [how global tables work](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/V2globaltables_HowItWorks.html)
  shows the core trade-off in one product: multi-Region eventual
  consistency replicates "typically within a second or less" with a "last
  writer wins" rule for conflicts, while multi-Region strong consistency
  replicates synchronously, needs exactly three Regions, and offers an RPO
  of zero at the cost of higher write latency.

**Popular tools and providers:** multi-AZ managed databases (Amazon RDS and
Aurora, Google Cloud SQL, Azure Database), MongoDB Atlas multi-region and
global clusters, Aurora Global Database, DynamoDB global tables, Google
Cloud Spanner, Azure Cosmos DB, and CockroachDB; Amazon Application
Recovery Controller (zonal shift and Region switch), AWS Fault Injection
Service, and Kubernetes topology spread constraints and traffic
distribution.

## How it works

### Failure domains

| Failure domain | What fails | What protects you |
|---|---|---|
| Process or instance | A crash, an out-of-memory kill, a bad host | Several instances behind a load balancer, health checks |
| Availability Zone | Power, cooling, or networking in one data center group; a zonal deploy gone wrong | Instances, load balancer nodes, NAT, and database members in every zone |
| Region | A regional service or control-plane outage | A second region with replicated data |
| Shared global dependency | A global control plane, DNS or CDN provider, identity provider | Avoiding global dependencies on the request path; fallbacks |
| Change | A bad deploy or configuration pushed everywhere at once | Staged rollouts: one box, one zone, one region (see [advanced deployment patterns](../deployment-strategies/advanced-deployment-patterns.md)) |

The last row is a reminder that redundancy alone does not stop the most
common outages: a bad change copied to every zone and region breaks all of
them together.

### Multi-AZ is the baseline

![Diagram: a region with three Availability Zones; a load balancer with a node in every zone sends traffic to six TaskFlow API instances in each zone, each zone carrying half of peak; the MongoDB primary in zone a replicates to secondaries in zones b and c and, with majority write concern, a write is acknowledged by two of three; when zone a fails the balancer stops routing there, the twelve instances in zones b and c still serve peak, a secondary is elected primary, and no majority-acknowledged write is lost.](multi-az-db-standby.svg)

AWS describes its Availability Zones as "within 100 km (60 miles) of each
other" and connected by networking "sufficient to accomplish synchronous
replication between AZs". That is what makes multi-AZ cheap: light needs
about a millisecond for a 100 km round trip, so a database can wait for a
copy in another zone before acknowledging a write.

What to spread across zones:

- **Load balancer nodes** (enable at least two zones; three is common).
- **Application instances**, evenly, so each zone carries its share (in
  Kubernetes, topology spread constraints; see
  [scaling and resource management](../kubernetes/scaling-and-resource-management.md)).
- **NAT gateways and other per-zone network pieces**, one per zone, so a
  zone failure does not cut the others off (see
  [cloud building blocks](../infrastructure-as-code/cloud-building-blocks.md)).
- **Database members.** Managed relational databases keep a synchronous
  standby in another zone; a MongoDB replica set with one member per zone
  and `w: "majority"` acknowledges a write only after two of three members
  have it, so the loss of any one zone loses no acknowledged write.
- **Caches and queues** with replicas in other zones, or at least the
  ability to start empty without overloading the database.

#### Sizing for a lost zone

Static stability means the remaining zones already have enough capacity
when one fails, because launching instances during a zonal incident is
exactly when it is least reliable:

```text
TaskFlow API needs 12 instances at peak.

Zones N    each zone must carry    instances per zone    total    spare capacity
  2        peak / 1 = 100%         12                    24       100%
  3        peak / 2 =  50%          6                    18        50%
  4        peak / 3 =  33%          4                    16        33%

total capacity = peak x N / (N - 1)
```

Three zones are the usual sweet spot: half the spare capacity of two
zones, and a majority (two of three) survives for databases that elect a
leader.

#### Cross-zone traffic and zone affinity

Traffic between zones is fast but not free: AWS notes that "Traffic that
crosses an Availability Zone boundary typically incurs a data transfer
charge." Chatty services can keep calls inside their zone: Kubernetes
Services support `trafficDistribution: PreferSameZone`, load balancers can
turn cross-zone balancing off per target group, and Slack's cellular design
siloes whole request paths inside one zone. Zone affinity also contains
"gray" failures, where a zone is degraded rather than down: you can drain
it on purpose with a tool such as ARC zonal shift, which moves load
balancer traffic away from one zone until you cancel it or it expires.

### Why go multi-region, and why not

Good reasons:

- **A regional outage is not acceptable** for your recovery time
  objective, as agreed in a business impact analysis (see
  [disaster recovery, RPO, and RTO](../backups/disaster-recovery-rpo-and-rto.md)).
- **Users on several continents** need lower latency than one region can
  give, even with a CDN.
- **Data residency**: some data must stay in a country or region.
- **Blast radius**: regions as large cells, so one region's failure or bad
  deploy affects only its users.

Costs: roughly double the infrastructure for a hot second region,
cross-region data transfer, replication lag or slower writes, conflict
handling, a routing layer, and a failover procedure that must be rehearsed.
If none of the good reasons apply, multi-AZ plus backups copied to another
region is usually the right answer.

### Active-passive

In **active-passive** designs, one region serves users and a second waits.
They differ in how much of the second region is running, which sets the
recovery time:

| Strategy | Second region | Typical recovery | Notes |
|---|---|---|---|
| Backup and restore | Backups and infrastructure code only | Hours | Cheapest; depends on rebuilding everything from code |
| Pilot light | Live data replica, compute switched off | Tens of minutes | Start and scale compute during failover |
| Warm standby | Live data replica, a small running copy | Minutes | Scale up during failover |

Failover means: promote the replica, scale compute, shift traffic, verify.
The details, timings, and worked RPO and RTO examples are in
[disaster recovery, RPO, and RTO](../backups/disaster-recovery-rpo-and-rto.md).

### Active-active

![Diagram: three patterns across two regions; read local, write global sends every write to the writer in region A and reads to the local copy, replicating asynchronously to region B, simple and conflict-free but with cross-region writes and stale reads in B; home region per user writes EU data in region A and US data in region B and copies each partition to the other for recovery, keeping most writes local and conflict-free but needing a routing directory and handling travelers and shared data; multi-writer lets both regions write the same records with replication both ways, so any region can write and survive the other's loss, at the cost of conflict resolution or slower synchronous writes and harder unique constraints.](multi-region-write-patterns.svg)

In **active-active** designs every region serves users all the time. The
differences are all about writes:

1. **Read local, write global.** Reads are served from a local replica;
   every write goes to one primary region. Simple and conflict-free, but
   users far from the primary pay a cross-region round trip on writes, and
   a user who writes and then reads locally can see the old value. Aurora
   Global Database works this way (with optional write forwarding from
   secondary regions).
2. **Home region per user or tenant.** Each record has one owning region:
   EU customers' data is written in the EU, US customers' data in the US,
   and each partition is replicated to the other region for recovery. Most
   writes are local and there are still no conflicts. This is the cell idea
   applied to regions, and it is what AWS's guidance suggests when it notes
   you can "shard clients so that half of the clients are aligned to Region
   one and half are aligned to Region two".
3. **Multi-writer.** Every region accepts writes for the same records.
   Either replication is asynchronous and conflicts are resolved after the
   fact (DynamoDB global tables in eventual mode, Cosmos DB with multi-region
   writes), or writes reach a synchronous quorum across regions (Spanner,
   DynamoDB in strong mode, CockroachDB) and every write pays cross-region
   latency.

Most teams that need active-active should use the first or second pattern:
one writer per record removes the hardest problem.

### Synchronous or asynchronous replication

| | Synchronous | Asynchronous |
|---|---|---|
| A write is acknowledged | After a copy exists in another region (or a quorum of regions) | After the local commit; the copy follows |
| Data lost if the region is destroyed (RPO) | None for acknowledged writes | Whatever had not replicated: the replication lag |
| Write latency | Adds at least one cross-region round trip | Unchanged |
| Availability coupling | Writes stall if the remote copy is unreachable (unless a quorum survives) | Regions write independently |

The latency floor comes from distance. Light in fiber travels about 200 km
per millisecond:

```text
Data centers about 480 km apart (northern Virginia to central Ohio): >= 4.8 ms per round trip
About 1,090 km apart (Dublin to Frankfurt):                           >= 10.9 ms
About 5,460 km apart (Dublin to northern Virginia):                   >= 54.6 ms

A request that makes 5 sequential writes, each waiting for a copy in the other region:
  nearby pair:          5 x  4.8 ms = 24 ms extra, at minimum
  transatlantic pair:   5 x 54.6 ms = 273 ms extra, at minimum

Asynchronous replication with 2 s of lag at 500 writes per second:
  losing the region loses about 2 x 500 = 1,000 acknowledged writes
```

That is why synchronous multi-region databases place regions in nearby
pairs or triangles, and why asynchronous designs must monitor lag against
the RPO: lag that quietly grows from one second to ten minutes turns a
small data loss into a large one.

### Write conflicts

With asynchronous multi-writer replication, two regions can accept
different updates to the same record before either sees the other's. If a
user renames a task in the EU while a colleague renames it in the US a
second later, both commits succeed locally, and replication must then
choose:

- **Last writer wins (LWW):** the update with the later timestamp survives
  and the other disappears silently. DynamoDB global tables (eventual mode)
  resolve conflicts "using the modification with the latest internal
  timestamp on a per-item basis", and Cosmos DB uses the `_ts` timestamp by
  default. Simple, but it loses data, and clock skew decides what "later"
  means.
- **Merge:** application rules or data types designed to merge (counters,
  sets, CRDTs) combine both updates. Cosmos DB lets you register a merge
  procedure and writes unresolved conflicts to a conflicts feed.
- **Prevent:** give each record a single writing region (the home-region
  pattern), use conditional writes with version numbers, or use a
  synchronous store that rejects concurrent updates (DynamoDB in strong
  mode returns a `ReplicatedWriteConflictException` that can be retried).

Some invariants cannot be enforced across asynchronous regions at all.
"Every username is unique" needs a single place that decides, such as one
region, a strongly consistent global table, or a naming scheme that makes
collisions impossible.

### Global databases

| Database | Model | Where writes go | Across regions | RPO if a region is lost |
|---|---|---|---|---|
| Aurora Global Database | One primary Region, up to 10 read-only secondary Regions | The primary (secondaries can forward writes) | Asynchronous storage-level replication, "typically under a second" | The replication lag; a planned switchover loses nothing |
| DynamoDB global tables, eventual (MREC) | Multi-active replicas in any Regions | Any replica | Asynchronous, last writer wins per item | The replication delay, "usually a few seconds" |
| DynamoDB global tables, strong (MRSC) | Exactly three Regions: three replicas, or two plus a witness | Any replica | Synchronous to at least one other Region | Zero |
| Spanner, multi-region configuration | Typically read-write replicas in two regions plus a witness in a third; a default leader region | Leader replicas, with a quorum across regions | Strongly consistent | Zero for committed writes |
| Cosmos DB, multi-region writes | Every region accepts writes | Any region | Asynchronous, conflicts resolved by LWW or a merge procedure | Depends on configuration |
| MongoDB Atlas global clusters | Up to nine zones, each zone's shards with their primary in the zone's highest-priority region | The zone that owns the document | Replica sets can span regions | Depends on write concern |

Read the fine print for each: transactions, time-to-live deletes, and
secondary indexes often behave differently across regions (DynamoDB's
strong mode, for example, does not support transactions or TTL).

### Routing users to their home region

![Diagram: global routing at the edge reads each user's home region from a token claim or cookie and sends EU users to eu-west-1 and US users to us-east-1; in each region a load balancer and TaskFlow API instances write to the primary of their own partition and read a read-only replica of the other partition; each partition replicates asynchronously to the other region with a lag equal to the RPO; every user writes only in the home region, so there are no conflicts; if eu-west-1 fails, operators promote the EU replica in us-east-1 and reroute EU users, losing writes that had not replicated, and us-east-1 needs capacity for both groups.](active-active-two-regions.svg)

The home-region pattern needs three pieces:

1. **A directory:** a small, globally replicated mapping from user or tenant
   to home region, read at sign-in.
2. **A routing signal:** the home region travels with each request as a
   signed token claim or cookie, or the client is given a regional API
   address (`api-eu-west-1.taskflow.example.com`) at sign-in.
3. **A guard:** a region that receives a request for a user it does not
   own refuses or forwards it, so a misrouted write never lands in the wrong
   partition.

The edge (a global proxy rule or edge function) can route on the signal so
most requests never reach the wrong region; the guard catches the rest.
Travelers keep their home region (their requests travel further); moving a
tenant between regions is a data migration, not a routing change.

### Data residency

Some laws, regulators, and customer contracts restrict where personal data
may be stored or processed; for example, the European Union regulates
transfers of personal data outside the EU (see the European Commission's
[international dimension of data protection](https://commission.europa.eu/law/law-topic/data-protection/international-dimension-data-protection_en)).
Requirements differ by jurisdiction and contract, so get them from legal
counsel, then design for them:

- Partition by residency: data subject to a rule lives only in regions
  that satisfy it, and its disaster recovery region must satisfy it too.
- Replicate globally only data that is not restricted, or that has been
  pseudonymized.
- Remember the copies people forget: backups, logs, analytics exports,
  search indexes, caches, and support tools.
- Enforce in the application and data layer. GeoDNS and edge routing steer
  traffic; they do not prove where data is stored.

### Failover runbooks and drills

A regional failover is a sequence of risky steps under pressure, so it is
scripted and rehearsed:

1. **Detect and decide.** Clear criteria (for example, error budget burn
   and provider status), a named decision-maker, and a time limit for
   waiting on the provider.
2. **Fence the old primary.** Make sure the failed region cannot keep
   accepting writes if it comes back half-alive, or two primaries will
   diverge (split brain).
3. **Promote data.** Promote the replica or run the database's managed
   failover; record the replication lag at that moment (your actual RPO).
4. **Scale the target region** to carry the extra traffic before moving it.
5. **Shift traffic in steps** with the routing tools from
   [global traffic management](global-traffic-management.md), watching
   errors and latency.
6. **Verify and communicate:** synthetic checks, key business flows, a
   status page update.
7. **Fail back later,** deliberately: resynchronize the original region
   first; failback is a second failover, with the same risks.

Practise it. Regular game days that drain a zone or evacuate a region in
production-like conditions turn a 50-minute scramble into an 8-minute
routine, as Netflix's experience shows. AWS Fault Injection Service, ARC
zonal shift, and chaos engineering tools make the exercises repeatable (see
[chaos engineering and game days](../performance-and-reliability-testing/chaos-engineering-and-game-days.md)
and [restore testing and runbooks](../backups/restore-testing-and-runbooks.md)).

### Cost multiplication

An illustrative model, not a price list: compute that needs 12 instance
units at peak at 100 units of currency per month each, and a database node
at 1,000 per month.

```text
Design                                         compute              database               monthly
Single zone (no spare capacity)                12 x 100 = 1,200     1 node    = 1,000      2,200
Three zones, sized to lose one                 18 x 100 = 1,800     3 nodes   = 3,000      4,800
+ warm standby region (4 instances, 1 node)    +4 x 100 =   400     +1 node   = 1,000      6,200
Active-active, two regions, each able to
  carry all users (3 zones per region)         36 x 100 = 3,600     6 nodes   = 6,000      9,600

Plus: cross-zone and cross-region data transfer, a global routing layer,
duplicated observability, and the engineering time to build and rehearse failover.
```

The same rule as for zones applies to regions: if every region must
survive the loss of another, two regions need 200% of peak capacity and
three regions need 150%. The database lines grow fastest, which is why
many designs keep compute warm in the second region but replicate data more
cheaply, or keep only the most critical data multi-region.

## When to use and when not to use

| Situation | Choose | Avoid |
|---|---|---|
| Any production service | Multi-AZ: three zones, capacity for a lost zone, a multi-AZ database | A single zone, a single NAT gateway |
| Hours of regional downtime are acceptable | Multi-AZ plus backups copied to another region | A hot second region |
| Recovery in tens of minutes, little data loss | Pilot light or warm standby with continuous replication | Active-active complexity |
| Users on several continents, write-heavy per user | Home region per user or tenant | Multi-writer on the same records |
| Read-heavy global product | Read local, write global | Synchronous replication across oceans |
| Records that must never conflict, across regions | A synchronous multi-region database, nearby regions | Asynchronous last-writer-wins |
| Residency rules | Partitioned regions with in-jurisdiction DR | Global replication of restricted data |

## Practical examples

### A replica set across three zones

```js
// mongosh: one member per zone (self-managed; managed services such as Atlas do this for you)
rs.initiate({
  _id: "taskflow",
  members: [
    { _id: 0, host: "mongo-a.internal.example.com:27017", priority: 2, tags: { zone: "eu-west-1a" } },
    { _id: 1, host: "mongo-b.internal.example.com:27017", priority: 1, tags: { zone: "eu-west-1b" } },
    { _id: 2, host: "mongo-c.internal.example.com:27017", priority: 1, tags: { zone: "eu-west-1c" } },
  ],
});
```

```js
// src/db.js: acknowledged writes survive the loss of any one zone
import { MongoClient } from "mongodb";

export const client = new MongoClient(process.env.MONGODB_URI, {
  writeConcern: { w: "majority", wtimeoutMS: 5_000 }, // two of three members, in different zones
  readPreference: "primary",                         // users read their own writes
  retryWrites: true,                                 // one automatic retry after an election
  maxPoolSize: 50,
});
```

With `w: "majority"`, a write that the driver reports as successful exists
in at least two zones, so an election after a zone failure cannot roll it
back. `wtimeoutMS` stops a write from waiting forever when a majority is
unreachable; the write may still have been applied, so retried writes
should be idempotent.

### Keeping Kubernetes traffic inside its zone

```yaml
# k8s/api-service.yaml: prefer endpoints in the caller's zone, fall back to others
apiVersion: v1
kind: Service
metadata:
  name: taskflow-api
  namespace: taskflow
spec:
  selector:
    app.kubernetes.io/name: taskflow-api
  ports:
    - name: http
      port: 80
      targetPort: 3000
  trafficDistribution: PreferSameZone
```

`PreferSameZone` became stable in Kubernetes 1.35 (`PreferClose` is the
older, deprecated name for the same behaviour). It cuts cross-zone traffic
and contains a degraded zone's impact, but it needs pods spread evenly
across zones, or one zone's pods take that zone's whole load.

### Draining a zone with ARC zonal shift

```bash
# Allow zonal shift on the load balancer once
aws elbv2 modify-load-balancer-attributes \
  --load-balancer-arn "<load-balancer-arn>" \
  --attributes Key=zonal_shift.config.enabled,Value=true

# Move traffic away from one zone (use the AZ ID, such as use1-az2, not the name)
aws arc-zonal-shift start-zonal-shift \
  --resource-identifier "<load-balancer-arn>" \
  --away-from use1-az2 \
  --expires-in 2h \
  --comment "elevated 5xx in use1-az2; draining while we investigate"

aws arc-zonal-shift list-zonal-shifts --status ACTIVE
aws arc-zonal-shift cancel-zonal-shift --zonal-shift-id "<zonal-shift-id>"
```

A zonal shift expires on its own (it can be set for up to 72 hours and
extended), so a forgotten shift does not leave a zone drained forever.
Check that the other zones have the capacity first: this is where sizing
for a lost zone pays off.

### A home-region guard in Express

```js
// src/middleware/home-region.js: serve each account only from its home region
const LOCAL_REGION = process.env.AWS_REGION; // for example "eu-west-1"

export const regionalApiUrl = (region) => `https://api-${region}.taskflow.example.com`;

// At sign-in: tell the client which regional API to use from now on
export function signInResponse(user) {
  return { userId: user.id, homeRegion: user.homeRegion, apiUrl: regionalApiUrl(user.homeRegion) };
}

// On every authenticated request; homeRegion comes from the verified token, never from input
export function requireHomeRegion(req, res, next) {
  const home = req.user?.homeRegion;
  if (!home || home === LOCAL_REGION) return next();
  res.set("Cache-Control", "no-store");
  return res.status(409).json({
    error: "wrong_region",
    message: `This account is served from ${home}`,
    apiUrl: regionalApiUrl(home),
  });
}
```

```js
// src/app.js (excerpt): after authentication, before any route touches data
app.use("/tasks", authenticate, requireHomeRegion, tasksRouter);
```

The client switches to `apiUrl` when it sees `wrong_region`, and the edge
routes by the same claim so this rarely happens. During a regional
failover, the directory entry for affected tenants changes to the
recovery region, new tokens carry the new home region, and the guard in
the recovery region starts accepting them.

### A region evacuation runbook outline

```text
Runbook: evacuate eu-west-1 to us-east-1 (TaskFlow API)          owner: on-call primary

Decide   Trigger: EU error budget burn > 14.4x over 1 h (5 min short window) AND provider status confirms a regional issue
         Decision: incident commander; record the time
Fence    Disable writes in eu-west-1: set the region's write switch off; confirm 0 write QPS there
Promote  Promote the EU partition replica in us-east-1; note the replication lag at promotion (actual RPO)
Scale    Raise us-east-1 minimum capacity to 200% of its normal peak; wait for instances to be healthy
Shift    Route EU users to us-east-1: 10% -> 50% -> 100%, 5 minutes per step, watching 5xx and p99
Verify   Synthetic sign-in, create task, list tasks for an EU test tenant; check the status page
Recover  Later: resynchronize eu-west-1 from us-east-1, then fail back with the same steps in reverse
Measure  Record time per step; compare the total with the RTO; file follow-ups
```

## Best practices

- Run every production tier in at least two zones, preferably three, and
  size each so the others can absorb a lost zone without scaling.
- Use managed multi-AZ databases and majority-acknowledged writes.
- Keep chatty traffic inside a zone where you can, and be able to drain a
  zone on purpose.
- Add a second region only for a stated reason: RTO, latency, residency, or
  blast radius.
- Prefer one writer per record (read local and write global, or a home
  region) over multi-writer replication.
- Monitor replication lag against the RPO, and alert before it grows.
- Keep the routing directory, tokens, and edge rules consistent with the
  data's home region.
- Fence the old primary during failover, and treat failback as a separate,
  rehearsed operation.
- Rehearse zone drains and region evacuations, and measure them.
- Budget for the multiplied cost before committing to a design.

## In production

- **One zone failed and the service went down anyway.**
  *Detect:* everything failed at the moment one zone was impaired.
  *Cause:* a hidden single-zone dependency: the database primary with no
  standby, a single NAT gateway, or all replicas scheduled in one zone.
  *Fix:* audit every tier for zone spread, one NAT gateway per zone, and
  spread constraints for pods.
- **A zone failed and the surviving zones fell over.**
  *Detect:* errors and saturation spread to the healthy zones right after
  the first one failed. *Cause:* capacity sized for normal load, relying on
  autoscaling during the incident. *Fix:* static stability (peak x N /
  (N - 1) of capacity) and alarms on per-zone headroom.
- **Cross-zone data transfer dominates the bill.**
  *Detect:* cost reports show inter-zone transfer growing with traffic.
  *Cause:* chatty service-to-service calls and caches crossing zones on
  every request. *Fix:* zone-aware routing, local replicas of hot read
  paths, and larger, less frequent calls.
- **After a regional failover, recent writes are missing.**
  *Detect:* customers report updates from the minutes before the incident
  are gone. *Cause:* replication lag had grown far beyond the expected
  seconds before the failure. *Fix:* alert on replication lag against the
  RPO, and record the lag at every promotion.
- **Two regions both accepted writes after failback.**
  *Detect:* duplicate or diverging records once the old region returned.
  *Cause:* the old primary came back and took writes before it was
  fenced (split brain). *Fix:* fencing as a runbook step, write switches
  per region, and resynchronizing before failback.
- **Edits disappear for users who work across regions.**
  *Detect:* support tickets about changes that vanished; both regions show
  conflicting versions in logs. *Cause:* multi-writer replication with
  last-writer-wins on records edited in two regions. *Fix:* a single home
  region per record, or merge rules designed for that data.
- **EU personal data turned up in a US analytics export.**
  *Detect:* an audit or data inventory finds restricted data outside its
  region. *Cause:* a global replication or export pipeline ignored
  residency. *Fix:* classify data, partition by residency, and enforce
  residency in pipelines and backups, not only in routing.

## Important terminology

- **Availability Zone:** One or more data centers in a region with
  independent power, cooling, and networking.
- **Region:** A geographic area with several Availability Zones.
- **Static stability:** Continuing to work through a failure without
  needing to create new resources.
- **Active-passive:** One region serves users while another waits to take
  over.
- **Active-active:** Several regions serve users at the same time.
- **Home region:** The single region that owns a user's or tenant's data.
- **Synchronous replication:** Acknowledging a write only after a copy
  exists elsewhere.
- **Asynchronous replication:** Acknowledging a write after the local
  commit; copies follow.
- **Replication lag:** How far a replica is behind its source; the RPO of
  an asynchronous design.
- **Write conflict:** Two concurrent updates to the same record accepted in
  different places.
- **Last writer wins (LWW):** Resolving conflicts by keeping the update with
  the latest timestamp.
- **Split brain:** Two copies both acting as primary and accepting writes.
- **Fencing:** Preventing a failed or old primary from accepting writes.
- **Data residency:** Requirements on where data is stored or processed.

## Common mistakes and misconceptions

- Treating multi-AZ as "spread the instances" while the database, NAT
  gateway, or cache stays in one zone.
- Sizing for normal load and counting on autoscaling to replace a lost
  zone.
- Going multi-region before getting multi-AZ, deployments, and backups
  right.
- Assuming asynchronous replication means no data loss.
- Using last-writer-wins for data where a lost update matters.
- Forgetting that DR copies, backups, and logs are subject to residency
  rules too.
- Writing a failover runbook and never running it.
- Expecting two regions to cost twice as much; with spare capacity, data
  transfer, and tooling it is often more.

## Revision questions

1. Why is multi-AZ the baseline for production while multi-region is a
   business decision?
2. A service needs 20 instances at peak. How many does it need in total, and
   per zone, to survive the loss of one zone with two zones and with four?
   (40 with 20 per zone; about 27, rounded up to 28 with 7 per zone.)
3. Compare read local and write global, home region per user, and
   multi-writer designs on latency, conflicts, and failover.
4. Two regions are 1,090 km apart. What is the minimum added latency for a
   request that performs three sequential synchronous writes? (At least
   3 x 10.9 ms, about 33 ms.)
5. With asynchronous replication, the lag is 4 seconds and the region
   handles 300 writes per second. Roughly how many acknowledged writes are at
   risk if the region is destroyed? (About 1,200.)
6. What is a write conflict, and what are three ways to deal with one?
7. Describe the steps of a regional failover runbook. Why must the old
   primary be fenced?
8. Which copies of data must a data residency design account for besides the
   primary database?

## Further learning

- [Amazon Builders' Library: Static stability using Availability Zones](https://aws.amazon.com/builders-library/static-stability-using-availability-zones/)
- [AWS: Multi-Region fundamentals](https://docs.aws.amazon.com/prescriptive-guidance/latest/aws-multi-region-fundamentals/introduction.html)
- [Amazon Aurora Global Database](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/aurora-global-database.html)
- [Amazon DynamoDB: How global tables work](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/V2globaltables_HowItWorks.html)
- [Google Cloud Spanner: Instance configurations](https://docs.cloud.google.com/spanner/docs/instance-configurations)
- [Azure Cosmos DB: Conflict resolution policies](https://learn.microsoft.com/en-us/azure/cosmos-db/conflict-resolution-policies)
- [Consistency and the CAP theorem](../../../05-application-architecture/scalability/consistency-and-cap-theorem.md)
  and [database scaling](../../../05-application-architecture/scalability/database-scaling.md)
  in the Application Architecture section
- Next: [autoscaling server fleets](autoscaling-server-fleets.md). Back to
  the [load balancing and multi-server overview](../load-balancing-and-multi-server.md).
