# Managed Databases

A managed database is a database server that a provider installs,
patches, backs up, replicates, and fails over for you, while you keep
the schema, the queries, and the bill. This lesson explains the main
options and how each works underneath: Amazon RDS, Amazon Aurora
(including Aurora Serverless v2), Amazon DynamoDB, MongoDB Atlas,
Supabase, Neon, Google Firestore, Azure Cosmos DB, Google Cloud SQL,
managed Redis and Valkey (ElastiCache, Upstash, Redis Cloud), and
self-hosting on a virtual machine. It shows how each one bills, which
workloads fit which, and what a small and a medium TaskFlow deployment
costs on each.

Data modeling, indexes, and query tuning are covered in the
[Databases section](../../04-databases/index.md) and in
[database scaling](../../05-application-architecture/scalability/database-scaling.md);
backups and restores in depth are in the [backups subject](../backups.md).

## Why it matters

The database is the part of the system that is hardest to move and
most expensive to lose. Running it yourself means owning replication,
failover, backups, point-in-time recovery, minor-version patching, disk
growth, and the 3 a.m. page when a disk fills. A managed service turns
most of that into configuration, and the price premium over a raw VM is
usually smaller than one engineer's time.

The choice of service also fixes the billing model: per instance-hour,
per unit of serverless capacity, or per read and write. The same TaskFlow
workload can cost under a dollar a month on one service and more than
fifty on another, and the ranking flips as traffic grows. Picking the
data model (relational, document, key-value) usually decides the
shortlist before price does.

## Real-world usage

- **Figma (Amazon RDS for PostgreSQL).** In
  [How Figma's databases team lived to tell the scale](https://www.figma.com/blog/how-figmas-databases-team-lived-to-tell-the-scale/),
  Figma explains that its database stack, running on Amazon RDS for
  PostgreSQL, "has grown almost 100x since 2020". It first split related
  tables into separate databases (vertical partitioning), then built
  horizontal sharding on top of RDS Postgres. It evaluated CockroachDB,
  TiDB, Spanner, and Vitess, but stayed because switching would have
  required "a complex data migration" and its team's RDS Postgres
  expertise was the lower-risk path.
- **Notion (sharded PostgreSQL).** In
  [Herding elephants: lessons learned from sharding Postgres at Notion](https://www.notion.com/blog/sharding-postgres-at-notion)
  (October 2021), Notion describes outgrowing a single PostgreSQL
  primary when "the Postgres VACUUM process began to stall consistently",
  and moving to 480 logical shards spread across 32 physical databases.
- **Discord (a self-operated database).** In
  [How Discord stores trillions of messages](https://discord.com/blog/how-discord-stores-trillions-of-messages)
  (March 2023), Discord describes moving its messages database from a
  177-node Cassandra cluster to 72 ScyllaDB nodes, because of
  unpredictable latency, garbage-collection pauses, and on-call toil. The
  post describes Discord's own engineers provisioning the clusters and
  carrying the on-call load: the control, and the work, that running a
  database yourself brings at that scale.
- **Amazon Prime Day (DynamoDB).** AWS reports in
  [AWS services scale to new heights for Prime Day 2025](https://aws.amazon.com/blogs/aws/aws-services-scale-to-new-heights-for-prime-day-2025-key-metrics-and-milestones/)
  that DynamoDB peaked at 151 million requests per second with
  single-digit millisecond responses, which shows what a per-request,
  partitioned key-value design can absorb without capacity planning by
  the application team.

**Popular tools and providers:** Amazon RDS, Amazon Aurora, Amazon
DynamoDB, Amazon ElastiCache, MongoDB Atlas, Supabase, Neon, Google
Cloud SQL, Firestore, Azure Cosmos DB, Azure Database for PostgreSQL,
Upstash, Redis Cloud, and PostgreSQL, MongoDB, or Valkey run on your
own VMs.

## How it works

### What "managed" covers, and what it does not

| Task | Self-hosted on a VM | Managed service |
|---|---|---|
| Install, OS and engine patching | You | Provider (minor versions in a maintenance window) |
| Automated backups and point-in-time recovery | You script and test them | Provider; you choose retention and test restores |
| High availability and failover | You build replication and failover | A setting (Multi-AZ, HA, replica set) |
| Read replicas | You set up and monitor | A button or API call |
| Storage growth | You resize disks | Automatic or a setting |
| Monitoring | You install it | Built-in metrics; you set alerts |
| Schema, indexes, queries | You | **You** |
| Connection limits and pooling | You | **You** |
| Capacity choice and cost | You | **You** |
| Access control and network exposure | You | **You** |

A slow query, a missing index, or a connection storm is still your
problem on every managed service.

### High availability and recovery on a managed service

![Diagram: a managed PostgreSQL deployment across Availability Zones. TaskFlow API instances in two zones connect through a pooler to the writer endpoint, a DNS name that points at the primary in zone A. The primary replicates synchronously to a standby in zone B, so a committed write exists in two zones; if the primary fails, the service promotes the standby and moves the endpoint to it. An asynchronous read replica in zone C serves reads through a separate reader endpoint and may lag slightly. Automated daily snapshots and continuously archived transaction logs go to object storage, which allows restoring a new instance to any second within the retention window.](managed-db-ha-architecture.svg)

- **Synchronous standby (Multi-AZ, HA):** every commit is written in two
  zones before it is acknowledged; on failure the provider promotes the
  standby and moves the endpoint. You pay for two instances.
- **Read replicas:** asynchronous copies for read scaling; they can lag,
  so read-your-own-writes needs care.
- **Point-in-time recovery (PITR):** snapshots plus continuously archived
  transaction logs let the provider restore a *new* instance to any
  second in the retention window, for example just before a bad
  migration.

### Amazon RDS

**What it is:** AWS's managed relational database for PostgreSQL, MySQL,
MariaDB, Oracle, SQL Server, and Db2. Each database is an instance with
EBS storage; RDS automates backups, patching, Multi-AZ failover, and
read replicas.

**You manage:** instance class, storage, parameter groups, schema,
queries, and connections. **Billing:** instance-hours (Multi-AZ doubles
the instance and storage price), storage per GB-month, backup storage
beyond the free allocation at $0.095 per GB-month, and data transfer.
In us-east-1, PostgreSQL `db.t4g.micro` costs $0.016 per hour,
`db.t4g.small` $0.032 ($0.065 Multi-AZ), `db.m7g.large` $0.168 ($0.337
Multi-AZ), and gp3 storage $0.115 per GB-month ($0.23 Multi-AZ)
([RDS for PostgreSQL pricing](https://aws.amazon.com/rds/postgresql/pricing/)).

### Amazon Aurora and Aurora Serverless v2

**What it is:** AWS's MySQL- and PostgreSQL-compatible engine that
replaces the storage layer with a distributed, self-healing volume
replicated across three Availability Zones, so replicas share storage
and failover does not copy data. **Aurora Serverless v2** sizes compute
continuously in Aurora Capacity Units (ACUs, about 2 GiB of memory each
with matching CPU) between a minimum and a maximum you set; since
November 2024 the minimum can be 0 ACUs, which
[pauses the database after inactivity](https://aws.amazon.com/about-aws/whats-new/2024/11/amazon-aurora-serverless-v2-scaling-zero-capacity/)
and resumes it on the next connection (with a delay).

**Billing** ([Aurora pricing](https://aws.amazon.com/rds/aurora/pricing/)):
Serverless v2 at $0.12 per ACU-hour for Aurora PostgreSQL; Aurora
Standard storage at $0.10 per GB-month plus $0.20 per million I/O
requests. The I/O-Optimized configuration removes I/O charges in
exchange for higher compute (about a third more on Serverless v2: $0.16
instead of $0.12 per ACU-hour) and $0.225 per GB-month storage, which
pays off for I/O-heavy workloads.

### Amazon DynamoDB

**What it is:** a serverless key-value and document database. Items are
spread across partitions by their partition key; you query by key (and
by secondary indexes), not with joins. It is multi-AZ by design and
scales without instance sizing.

**You manage:** the table design, which must match your access patterns
up front, and capacity mode. **Billing** ([DynamoDB pricing](https://aws.amazon.com/dynamodb/pricing/)):
on-demand at $0.625 per million write request units and $0.125 per
million read request units (one read unit is a strongly consistent read
of up to 4 KB; one write unit is a write of up to 1 KB), or provisioned
capacity per hour; storage at $0.25 per GB-month after the first 25 GB;
continuous backups (PITR) at $0.20 per GB-month.

### MongoDB Atlas

**What it is:** MongoDB's own managed service, running replica sets on
AWS, Azure, or Google Cloud in the region you choose. It is the natural
home for TaskFlow, which already uses MongoDB.

**Tiers** ([pricing](https://www.mongodb.com/pricing)): Free (512 MB,
shared), Flex ($0.011 per hour, capped at $30 a month, 5 GB, for
development and testing), and Dedicated clusters from M10 ($0.08 per
hour, "starts at $56.94/month", 2 GB RAM, 2 vCPUs) through M20 ($0.20
per hour) and M30 ($0.54 per hour, 8 GB RAM). The older shared M2 and M5
tiers and serverless instances have been retired in favor of Flex
([Flex migration](https://www.mongodb.com/docs/atlas/flex-migration/)).
For self-service accounts, a HIPAA Business Associate Agreement is
included in MongoDB's
[cloud terms](https://www.mongodb.com/products/platform/trust/hipaa).

### Supabase

**What it is:** a platform built around a dedicated PostgreSQL database
per project, adding authentication, file storage, realtime
subscriptions, edge functions, and auto-generated REST and GraphQL APIs.

**Billing** ([pricing](https://supabase.com/pricing)): Free (500 MB
database, shared CPU, 5 GB egress; projects are paused after a week of
inactivity), Pro at $25 a month including $10 of compute credit (enough
for one Micro instance with 1 GB RAM), 8 GB disk then $0.125 per GB,
250 GB egress then $0.09 per GB. Compute sizes run from Small ($15) to
Large ($110, 2 dedicated vCPUs, 8 GB) and beyond. Team ($599 a month)
adds SOC 2 reports and HIPAA as a paid add-on.

### Neon

**What it is:** serverless PostgreSQL that separates storage from
compute. Compute autoscales and scales to zero after 5 minutes idle, and
copy-on-write *branches* give each pull request its own database copy in
seconds. Its pricing page now calls the database Lakebase Postgres.

**Billing** ([pricing](https://neon.com/pricing)): Free (100 CU-hours
per project per month, 1 GB storage), Launch at $0.106 per CU-hour and
$0.35 per GB-month of storage, and Scale at $0.222 per CU-hour with SLAs
and HIPAA. One CU is about 4 GB of RAM with matching CPU, and computes
can be as small as 0.25 CU.

### Google Firestore

**What it is:** a serverless document database from Google (the
database behind many Firebase apps) with realtime listeners and offline
sync for mobile and web clients.

**Billing** ([Firestore pricing](https://cloud.google.com/firestore/pricing),
Standard edition, single region): $0.03 per 100,000 document reads,
$0.09 per 100,000 writes, $0.01 per 100,000 deletes, and about $0.15 per
GiB-month stored (listed as $0.000205479 per GiB-hour). The free quota
is 50,000 reads, 20,000 writes, and 20,000 deletes per day and 1 GiB
stored.

### Azure Cosmos DB

**What it is:** Microsoft's globally distributed, multi-API database
(including a NoSQL API and a MongoDB-compatible API), with tunable
consistency and multi-region writes. Every operation costs Request Units
(RUs): a point read of a 1 KB item is about 1 RU, and writes and queries
cost more.

**Billing** ([Cosmos DB pricing](https://azure.microsoft.com/en-us/pricing/details/cosmos-db/)
and the Azure retail price list, East US): provisioned throughput at
$0.008 per hour per 100 RU/s, serverless at $0.25 per million RUs, and
storage at $0.25 per GB-month. The
[free tier](https://learn.microsoft.com/en-us/azure/cosmos-db/free-tier)
gives the first 1,000 RU/s and 25 GB of an account free for its
lifetime.

### Google Cloud SQL

**What it is:** Google's managed MySQL, PostgreSQL, and SQL Server, much
like RDS. **Billing** ([Cloud SQL pricing](https://cloud.google.com/sql/pricing),
Enterprise edition, us-central1): $0.0413 per vCPU-hour and $0.007 per
GiB-hour of memory, doubled for HA ($0.0826 and $0.014); SSD storage
$0.000232877 per GiB-hour (about $0.17 per GiB-month). The shared-core
`db-f1-micro` costs $0.0105 per hour but is not covered by the Cloud SQL
SLA.

### Managed Redis and Valkey

**What it is:** in-memory key-value stores for caches, sessions, rate
limits, and queues (see [Redis](../../05-application-architecture/redis.md)).
Valkey is the open-source fork of Redis that AWS and others now offer.

- **Amazon ElastiCache:** nodes (Valkey `cache.t4g.micro` at $0.0128 per
  hour versus $0.016 for Redis OSS) or ElastiCache Serverless (Valkey
  $0.084 per GB-hour of data plus $0.0023 per million ElastiCache
  Processing Units, with a 100 MB minimum versus 1 GB for Redis OSS);
  Valkey is 20% cheaper on nodes and 33% cheaper on serverless
  ([ElastiCache pricing](https://aws.amazon.com/elasticache/pricing/)).
- **Upstash:** serverless, Redis-compatible, billed per command: free
  up to 500,000 commands a month and 250 MB of data, then $0.20 per
  100,000 commands, or fixed plans from $10 a month
  ([pricing](https://upstash.com/pricing/redis)). It works over HTTP as
  well as TCP, which suits functions and edge runtimes.
- **Redis Cloud:** Redis's own service: Free (30 MB), Essentials from
  $0.007 per hour ($5 a month), and Pro from $0.014 per hour with a $200
  monthly minimum ([pricing](https://redis.io/pricing/)).

### Self-hosting on a VM

**What it is:** installing PostgreSQL, MongoDB, or Valkey on your own
VMs. It is the cheapest in dollars (a $12 VM runs a small PostgreSQL
comfortably) and gives full control of versions and extensions, but you
own backups, restore tests, replication, failover, upgrades, disk
monitoring, and security. It makes sense with real database skills on
the team, or at a scale where the managed premium is large, as in
Discord's case.

### How each one bills

![Diagram: three charts over one day of TaskFlow traffic that peaks in the afternoon and is near zero at night. A provisioned instance such as RDS or Cloud SQL costs the same every hour, sized for the peak, so night hours are paid for but unused. Serverless capacity such as Aurora Serverless v2 or Neon follows the load in steps above a minimum floor, or drops to zero when paused. Per-request billing such as DynamoDB on-demand, Firestore, or Cosmos DB serverless costs nothing at night and rises exactly with operations. Below, the meters that apply to all three: storage per GB-month, I/O or request units, backups beyond the free allowance, data transfer out and across zones, and a second copy for high availability.](db-billing-models.svg)

| Billing model | Examples | You pay for | Best for | Watch out for |
|---|---|---|---|---|
| Provisioned instance | RDS, Cloud SQL, Atlas Dedicated, Supabase compute | Instance-hours, doubled for HA | Steady load, predictable bills | Paying for the peak all night |
| Serverless capacity | Aurora Serverless v2, Neon | Capacity units per second or hour, with a floor or scale to zero | Variable load, dev and preview databases | Resume delay from zero; cost at sustained high load |
| Per request | DynamoDB on-demand, Firestore, Cosmos DB serverless | Each read and write, plus storage | Spiky or low traffic, key-based access | Scans and fan-out reads multiply cost |
| Per command | Upstash | Each command, plus storage | Caches used by functions | Busy caches cost more than a node |

Every model adds the same side meters: storage per GB-month, backups
beyond the free allowance, data transfer out of the region or across
zones, and a second copy for high availability.

### Options compared

| Option | Data model | You manage | Scaling | Pricing model | Free tier | Strengths | Weaknesses | Lock-in |
|---|---|---|---|---|---|---|---|---|
| RDS | Relational | Size, schema, queries | Vertical; read replicas | Instance-hours + storage | Limited, for new accounts | Standard engines, mature | Pay for idle; manual sizing | Low |
| Aurora (Serverless v2) | Relational | Schema, ACU range | Automatic within range | ACU-hours + storage + I/O | None | Fast failover, scale to zero | AWS-only features, I/O costs | Medium |
| DynamoDB | Key-value / document | Table design | Automatic | Per request or provisioned | 25 GB storage, some capacity | Massive scale, no ops | Access patterns fixed early, no joins | High |
| MongoDB Atlas | Document | Schema, indexes, tier | Vertical, sharding | Per cluster-hour | 512 MB Free | Runs on any of three clouds | Dedicated tiers start near $57 | Low (MongoDB protocol) |
| Supabase | Relational + platform | Schema, compute size | Vertical | Plan + compute + usage | Free (pauses) | Postgres plus auth, storage, realtime | Platform features tie you in | Low for data, medium for features |
| Neon | Relational | Schema, CU limits | Autoscale, to zero | CU-hours + storage | 100 CU-hours | Branching, scale to zero | Cold resume; newer service | Low |
| Firestore | Document | Data model, rules | Automatic | Per read, write, delete | Daily free quota | Realtime sync for apps | Query limits, per-read costs | High |
| Cosmos DB | Multi-API | Partition key, RUs | Automatic or provisioned | RUs + storage | 1,000 RU/s and 25 GB | Global distribution | RU model is hard to estimate | Medium to high |
| Cloud SQL | Relational | Size, schema | Vertical; replicas | vCPU and memory hours | None | Standard engines on Google Cloud | Shared-core has no SLA | Low |
| ElastiCache, Upstash, Redis Cloud | Key-value (memory) | Keys, TTLs | Nodes or serverless | Node-hours, GB-hours, or commands | Upstash and Redis Cloud free tiers | Microsecond to low-ms reads | Not a primary store | Low |
| Self-hosted on a VM | Any | Everything | Manual | VM + disk | None | Cheapest, full control | All operations are yours | Low |

### What TaskFlow costs on each

!!! note "Prices checked November 2026"
    Prices are US-region list prices in USD (AWS us-east-1, Google Cloud
    us-central1, Azure East US) from the linked official pages and price
    lists in November 2026. They change often; re-check them with the
    AWS, Google Cloud, or Azure pricing calculator, or the vendor's
    pricing page, before deciding. Other regions such as India are priced
    differently: choose the region in the calculator to compare.

**Small app** (launch stage): 2 GB of data, 2 million reads and 500,000
writes a month, items around 1 KB, busy about 8 hours a day.

```text
RDS PostgreSQL db.t4g.micro, Single-AZ:  730 h x $0.016 = $11.68 + 20 GB x $0.115 = $2.30  -> $13.98
RDS PostgreSQL db.t4g.small, Multi-AZ:   730 h x $0.065 = $47.45 + 20 GB x $0.23  = $4.60  -> $52.05
Aurora Serverless v2, 0.5 ACU minimum:   730 h x 0.5 x $0.12 = $43.80 + storage $0.20 + 5M I/O $1.00 -> $45.00
  with scale to zero (busy 1/3 of time): 243 h x 0.5 x $0.12 = $14.60 + $1.20       -> about $15.80
DynamoDB on-demand:  2M x $0.125/M = $0.25 + 0.5M x $0.625/M = $0.31, 2 GB free    -> $0.56
Firestore:  reads (2M - 1.5M free) x $0.03/100k = $0.15; writes inside free quota;
            storage (2 - 1 free) GiB x $0.15 = $0.15                                -> $0.30
Cosmos DB serverless (assume 1 RU per read, 6 RU per write):
            (2M + 3M) RU x $0.25/M = $1.25 + 2 GB x $0.25 = $0.50                  -> $1.75
Neon Launch, 0.25 CU busy 8 h/day:  0.25 x 243 h = 60.8 CU-h x $0.106 = $6.45 + 2 GB x $0.35 = $0.70 -> $7.15
Cloud SQL db-f1-micro:  730 h x $0.0105 = $7.67 + 10 GiB SSD x $0.17 = $1.70 (no SLA) -> $9.37
```

| Option (small app) | Monthly | Notes |
|---|---|---|
| DynamoDB on-demand | $0.56 | Only if access patterns are key-based; add $0.40 for PITR |
| Firestore | $0.30 | Mostly inside the free quota |
| Cosmos DB serverless | $1.75 | $0 on the free tier with provisioned throughput |
| Neon Launch | $7.15 | Scales to zero; Free plan if under 1 GB |
| Cloud SQL `db-f1-micro` | $9.37 | Shared core, no SLA |
| Self-hosted on a $12 VM | about $12 | Plus backups, patching, and your time |
| RDS `db.t4g.micro` | $13.98 | Single-AZ: no automatic failover |
| Aurora Serverless v2 | $15.80 to $45.00 | Depends on scale to zero |
| Supabase Pro | $25 | Includes auth, storage, and a Micro instance |
| MongoDB Atlas Flex | up to $30 | No code change for TaskFlow; Free tier is 512 MB |
| RDS `db.t4g.small` Multi-AZ | $52.05 | Automatic failover |
| MongoDB Atlas M10 | $56.94 | Dedicated, replica set, backups |

**Medium app** (growing): 50 GB of data, 200 million reads and 40
million writes a month (about 77 reads and 15 writes per second on
average), high availability required.

```text
RDS PostgreSQL db.m7g.large Multi-AZ: 730 h x $0.337 = $246.01 + 100 GB x $0.23 = $23.00 -> $269.01
Aurora Serverless v2, average 4 ACU:  4 x 730 h x $0.12 = $350.40 + 50 GB x $0.10 = $5.00
                                      + 300M I/O x $0.20/M = $60.00                       -> $415.40
DynamoDB on-demand:  200M x $0.125/M = $25.00 + 40M x $0.625/M = $25.00
                     + (50 - 25) GB x $0.25 = $6.25 + PITR 50 GB x $0.20 = $10.00        -> $66.25
Firestore:  200M / 100k x $0.03 = $60.00 + 40M / 100k x $0.09 = $36.00 + 50 GiB x $0.15 = $7.50 -> $103.50
Cosmos DB serverless:  (200M + 40M x 6) RU = 440M x $0.25/M = $110.00 + 50 GB x $0.25 = $12.50 -> $122.50
MongoDB Atlas M30 (8 GB RAM):  730 h x $0.54                                             -> $394.20
Supabase Pro + Large compute:  $25 + $110 - $10 credit + (50 - 8) GB x $0.125 = $5.25    -> $130.25
Neon Launch, 2 CU always on:  2 x 730 x $0.106 = $154.76 + 50 GB x $0.35 = $17.50        -> $172.26
Cloud SQL HA, 2 vCPU + 8 GiB: (2 x $0.0826 + 8 x $0.014) x 730 = $202.36 + 100 GiB HA SSD $34.00 -> $236.36
Self-hosted: 2 x EC2 m7g.large ($0.0816/h) = $119.14 + 2 x 100 GB gp3 = $16.00           -> $135.14 + people
```

The medium numbers show the trade-off clearly. Per-request databases are
cheapest when every operation is a key lookup on a small item, but a
query that reads 100 items costs 100 reads, and a global secondary index
doubles write cost; a relational instance costs the same whether a
query touches one row or a thousand. Neon and Supabase undercut RDS on
list price at this size, but the RDS and Atlas figures include a standby
or replica set for automatic failover, so check what high availability
adds on the cheaper options before comparing. Aurora's I/O line suggests
the I/O-Optimized configuration at this scale. Price the queries you
actually run, not an average operation.

## When to use and when not to use

Use a managed database by default: the cost premium is small compared
with the risk of losing data or the time spent on failover and backups.
Choose the data model first (relational for joins, constraints, and
reporting; document for flexible nested records; key-value for
predictable key lookups at large or spiky scale), then the billing model
that matches your traffic. Self-host only with database expertise on the
team, a tested restore, and a cost or control reason that outweighs the
operations work.

Do not use a cache as the only copy of data, a per-request database for
analytics scans, or a serverless database that scales to zero for a
user-facing API that cannot tolerate the resume delay.

### Which to choose

| Situation | Pick | Runner-up | Why |
|---|---|---|---|
| Side project or portfolio | MongoDB Atlas Free (TaskFlow), Neon Free, or Supabase Free | Firestore within its free quota | Free, managed, and enough for small data; watch Supabase's pause after inactivity |
| Early startup | Managed PostgreSQL (Neon, Supabase, RDS) or Atlas Flex then M10 for MongoDB apps | Aurora Serverless v2 with a low minimum | Standard engines keep options open; pay little until traffic arrives |
| Steady high traffic | RDS or Cloud SQL with HA on committed pricing, or Atlas dedicated clusters | Aurora provisioned; self-hosted with a strong DBA team | Instance pricing is cheapest at constant load; commitments cut it further |
| Spiky traffic | DynamoDB on-demand, Aurora Serverless v2, or Neon | Firestore or Cosmos DB serverless | Capacity follows load without paying for the peak all month |
| Global audience | DynamoDB global tables, Cosmos DB multi-region, or Atlas global clusters | Regional primary with read replicas near users | Writes need a home or a conflict strategy; replicate reads first |
| Compliance-heavy (healthcare) | RDS, Aurora, or DynamoDB under the AWS BAA; Cloud SQL or Firestore under Google's; Cosmos DB under Microsoft's (check its in-scope list) | MongoDB Atlas (BAA in its terms), Neon Scale, or Supabase Team with the HIPAA add-on | Encryption, audit logs, PITR, and a contract; check each product is in the provider's eligible list |
| Large data or heavy egress | A database in the same region as the app, with read replicas | Self-hosted on VMs with large included transfer | Cross-region and internet egress from a database add up quickly |
| Team with no ops people | Atlas, Supabase, Neon, or RDS with Multi-AZ | Firestore or DynamoDB for simple models | Backups, failover, and patching are handled; avoid self-hosting |

![Diagram: a decision tree for choosing a database service. If the data is relational with joins and constraints, use managed PostgreSQL on RDS, Cloud SQL, Neon, or Supabase, and Aurora at larger scale. Otherwise, if the app uses MongoDB already, use MongoDB Atlas. Otherwise, if access is by known keys at huge or spiky scale, use DynamoDB, Cosmos DB, or Firestore with per-request billing. Otherwise, if a web or mobile app needs realtime sync and built-in auth, use Firestore or Supabase. Otherwise, if load is steady and the team has database skills and cost pressure, self-host on VMs with tested backups. The default is a small managed PostgreSQL instance. A note says caches and sessions belong in managed Redis or Valkey, never as the only copy.](managed-db-decision.svg)

## Practical examples

### PostgreSQL on RDS with Multi-AZ (Terraform)

```hcl
# infra/db/rds.tf: PostgreSQL for TaskFlow with failover, backups, and encryption
variable "private_subnet_ids" {
  type = list(string)
}

variable "db_security_group_id" {
  type = string
}

resource "aws_db_subnet_group" "taskflow" {
  name       = "taskflow-db"
  subnet_ids = var.private_subnet_ids # private subnets in at least two AZs
}

resource "aws_db_instance" "taskflow" {
  identifier     = "taskflow-prod"
  engine         = "postgres"
  engine_version = "17"
  instance_class = "db.t4g.small"

  allocated_storage     = 20
  max_allocated_storage = 200 # storage autoscaling ceiling
  storage_type          = "gp3"
  storage_encrypted     = true

  db_name                     = "taskflow"
  username                    = "taskflow_admin"
  manage_master_user_password = true # password generated and kept in Secrets Manager

  multi_az               = true # synchronous standby in a second AZ
  db_subnet_group_name   = aws_db_subnet_group.taskflow.name
  vpc_security_group_ids = [var.db_security_group_id]
  publicly_accessible    = false

  backup_retention_period    = 14 # days of point-in-time recovery
  backup_window              = "03:00-04:00"
  maintenance_window         = "sun:04:30-sun:05:30"
  auto_minor_version_upgrade = true

  deletion_protection       = true
  skip_final_snapshot       = false
  final_snapshot_identifier = "taskflow-prod-final"
}
```

- `multi_az = true` doubles the instance and storage price and buys
  automatic failover; `backup_retention_period` sets how far back PITR
  can restore.
- `manage_master_user_password` keeps the admin password out of Terraform
  state and code.
- `deletion_protection` and a final snapshot stop one mistaken
  `terraform destroy` from deleting production data.

### Aurora Serverless v2 that pauses when idle (Terraform)

```hcl
# infra/db/aurora.tf: Aurora PostgreSQL Serverless v2 for a preview environment
resource "aws_rds_cluster" "preview" {
  cluster_identifier          = "taskflow-preview"
  engine                      = "aurora-postgresql"
  engine_mode                 = "provisioned" # Serverless v2 uses provisioned mode
  database_name               = "taskflow"
  master_username             = "taskflow_admin"
  manage_master_user_password = true
  storage_encrypted           = true
  skip_final_snapshot         = true # preview data only
  db_subnet_group_name        = aws_db_subnet_group.taskflow.name # from rds.tf
  vpc_security_group_ids      = [var.db_security_group_id]

  serverlessv2_scaling_configuration {
    min_capacity             = 0   # pause when idle
    max_capacity             = 4   # about 8 GiB of memory at most
    seconds_until_auto_pause = 600 # pause after 10 idle minutes
  }
}

resource "aws_rds_cluster_instance" "preview" {
  identifier         = "taskflow-preview-1"
  cluster_identifier = aws_rds_cluster.preview.id
  engine             = aws_rds_cluster.preview.engine
  instance_class     = "db.serverless"
}
```

A preview or staging database used a few hours a day costs a fraction of
an always-on instance. Scaling to 0 ACUs needs a recent Aurora engine
version, so check the Aurora documentation for the supported versions.
The first connection after a pause waits for the database to resume, so
keep `min_capacity` above zero for anything users hit directly.

### DynamoDB on-demand with PITR and TTL (Terraform)

```hcl
# infra/db/dynamodb.tf: per-request table for TaskFlow activity events
resource "aws_dynamodb_table" "activity" {
  name         = "taskflow-activity"
  billing_mode = "PAY_PER_REQUEST" # on-demand: pay per read and write
  hash_key     = "taskId"
  range_key    = "createdAt"

  attribute {
    name = "taskId"
    type = "S"
  }

  attribute {
    name = "createdAt"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true # $0.20 per GB-month in us-east-1
  }

  ttl {
    attribute_name = "expiresAt" # items expire automatically; TTL deletes are free
    enabled        = true
  }
}
```

The key design (`taskId` plus `createdAt`) serves exactly one query
well: "the activity for this task, newest first". A different question,
such as "all activity by this user", needs a secondary index, which adds
write cost. That is the DynamoDB trade-off in one table.

### Sizing connection pools against the database limit

Connection limits are where managed databases most often surprise teams.
Every API instance holds a pool, and every function environment holds
its own:

```js
// src/db.js: one pool per process, sized for the database's limit
import pg from "pg";

// Budget: database max_connections minus a reserve for admin and replicas,
// divided by the maximum number of API processes that can run at once.
// Example: (100 - 10) / 6 processes = 15 connections each.
export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.PG_POOL_MAX ?? 15),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000, // fail fast instead of queueing forever
  ssl: { rejectUnauthorized: true, ca: process.env.PG_CA_CERT },
});

export async function getTask(id) {
  const { rows } = await pool.query("SELECT * FROM tasks WHERE id = $1", [id]);
  return rows[0] ?? null;
}
```

Check the real limit with `SHOW max_connections;` on PostgreSQL (or the
tier's documented limit on Atlas), count the maximum number of processes
your autoscaling allows, and put a pooler (RDS Proxy, PgBouncer, or the
provider's built-in pooler such as Supabase's or Neon's) in front when
functions or many small instances connect.

## Best practices

- Pick the data model and the access patterns before the vendor.
- Turn on HA (Multi-AZ, regional HA, replica sets) for production and
  understand what it costs: usually twice the instance price.
- Set backup retention and PITR deliberately, and test a restore into a
  new instance on a schedule; a backup you have not restored is a hope.
- Keep databases in private networks, require TLS, and use the
  provider's secret storage for credentials.
- Size connection pools against the database limit and add a pooler
  before connecting from functions.
- Watch storage, I/O, and backup meters as well as the instance or
  request price.
- Put development and preview databases on scale-to-zero options, and
  production on capacity that does not pause.
- Prefer standard engines (PostgreSQL, MySQL, the MongoDB protocol)
  unless a proprietary database clearly earns its lock-in.

## In production

- **"Too many connections" errors during a traffic spike.**
  *Detect:* database errors and a connection-count metric at its
  maximum while API instances or function concurrency rise. *Cause:*
  pools multiplied by instances or environments exceed
  `max_connections`. *Fix:* shrink pools, cap autoscaling or function
  concurrency, and add RDS Proxy, PgBouncer, or the provider's pooler.
- **The DynamoDB or Firestore bill jumps without more users.**
  *Detect:* consumed read units or document reads grow much faster than
  requests. *Cause:* a scan, a query without a selective key, a realtime
  listener on a large collection, or a retry loop. *Fix:* find the
  operation in metrics, redesign it around the key or an index, and add
  a cache for hot reads.
- **The first request of the morning times out.**
  *Detect:* connection timeouts only after idle periods; the database
  shows a resume event. *Cause:* Aurora Serverless v2 at 0 ACUs, Neon's
  scale to zero, or a paused Supabase Free project. *Fix:* keep a
  minimum capacity for production, raise client connection timeouts, or
  retry the first connection.
- **Writes stall for a minute or two and then recover.**
  *Detect:* an event in the database's event log about a failover, and
  connection errors from the app. *Cause:* the primary failed or was
  patched, and the endpoint moved to the standby. *Fix:* use the cluster
  endpoint (never an instance IP), retry transient connection errors,
  keep DNS caching short in the driver, and test failover before an
  incident does it for you.
- **The Aurora bill is dominated by I/O.**
  *Detect:* `StorageIOUsage` (I/O requests) is the largest Aurora line
  in Cost Explorer. *Cause:* an I/O-heavy workload on Aurora Standard.
  *Fix:* compare against the I/O-Optimized configuration, which removes
  per-request I/O charges for higher compute and storage prices, and fix
  missing indexes that cause excess reads.
- **A restore takes far longer than expected.**
  *Detect:* a restore drill or real incident runs for hours. *Cause:*
  PITR creates a new instance and replays logs, and large databases take
  time; connection strings must also change. *Fix:* measure restore time
  regularly, document the runbook, and see
  [restore testing and runbooks](../backups/restore-testing-and-runbooks.md).

## Important terminology

- **Managed database:** a database service where the provider handles
  installation, patching, backups, and failover.
- **Multi-AZ / HA:** a synchronous standby in another Availability Zone
  that takes over automatically.
- **Read replica:** an asynchronous copy used to scale reads; it can lag.
- **Point-in-time recovery (PITR):** restoring to any moment in a
  retention window using snapshots plus archived transaction logs.
- **ACU (Aurora Capacity Unit):** Aurora Serverless v2's unit of
  capacity, about 2 GiB of memory with matching CPU.
- **CU (Neon Compute Unit):** Neon's unit of compute, about 4 GB of
  memory with matching CPU.
- **RRU / WRU:** DynamoDB on-demand read and write request units.
- **RU (Request Unit):** Cosmos DB's unit of throughput for every
  operation.
- **Connection pooler:** a proxy that shares a small number of database
  connections among many clients.
- **Scale to zero / auto-pause:** stopping compute when idle so no
  compute is billed, at the cost of a resume delay.

## Common mistakes and misconceptions

- Choosing a database by price before choosing the data model.
- Assuming per-request pricing is always cheap; scans and fan-out reads
  multiply it.
- Running production on a single instance without HA, or on a free tier
  that pauses or expires.
- Believing backups exist because the setting is on, without testing a
  restore.
- Exposing the database to the internet "temporarily".
- Opening a large pool in every function environment.
- Treating a Redis or Valkey cache as durable storage.
- Forgetting storage, I/O, backup, and transfer meters when comparing
  prices.

## Revision questions

1. What does a managed database take off your hands, and what does it
   leave with you?
2. Explain the difference between a Multi-AZ standby and a read replica.
3. Calculate the monthly DynamoDB on-demand cost for 50 million reads and
   10 million writes with 40 GB stored. (Answer: 50 x $0.125 = $6.25;
   10 x $0.625 = $6.25; storage (40 - 25) x $0.25 = $3.75; total $16.25.)
4. Why might Aurora Serverless v2 at 0 ACUs be right for a preview
   environment and wrong for production?
5. A query reads 100 documents to show one page. How does that change the
   cost comparison between Firestore and a provisioned PostgreSQL
   instance?
6. Why is MongoDB Atlas the lowest-risk first choice for TaskFlow, and
   when would you reconsider?
7. How would you size connection pools for six API instances against a
   database with `max_connections` of 100?
8. A healthcare startup needs a database. What must be true of the
   service and contract, and what remains its own responsibility?

## Further learning

- [Amazon RDS Multi-AZ deployments](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Concepts.MultiAZ.html)
- [Aurora Serverless v2](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/aurora-serverless-v2.html)
- [DynamoDB read and write capacity modes](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/capacity-mode.html)
- [MongoDB Atlas cluster types](https://www.mongodb.com/docs/atlas/create-database-deployment/)
- [Neon documentation](https://neon.com/docs/introduction)
- [AWS Pricing Calculator](https://calculator.aws/), [Google Cloud Pricing Calculator](https://cloud.google.com/products/calculator), [Azure Pricing Calculator](https://azure.microsoft.com/en-us/pricing/calculator/)
- Next: [object and file storage](object-and-file-storage.md). Back to the [hosting and cloud platforms overview](../hosting-and-platforms.md).
