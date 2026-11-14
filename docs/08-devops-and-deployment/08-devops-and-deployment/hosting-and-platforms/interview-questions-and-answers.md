# Hosting and Cloud Platforms Interview Questions and Answers

These questions review where to run and store software: hosting models,
frontend and backend hosting, managed databases, object and file storage,
video delivery, backup and archive tiers, and cloud cost. Prices quoted
are the November 2026 US list prices used in the lessons; always re-check
them before deciding. Try answering each question before reading the
answer.

## Choosing where to run software

### 1. Explain IaaS, CaaS, serverless containers, PaaS, FaaS, edge compute, and static hosting in one line each.

IaaS rents virtual machines you operate (EC2, Compute Engine, Droplets).
CaaS runs your container images on an orchestrator whose nodes you pay
for (EKS, GKE, ECS on EC2). Serverless containers run images without
nodes (Fargate, Cloud Run, Container Apps). PaaS builds and runs your code
from a git push (Render, Heroku, App Service). FaaS runs a handler per
event (Lambda, Cloud Run functions). Edge compute runs small functions in
CDN locations (Cloudflare Workers, CloudFront Functions). Static hosting
serves pre-built files from a CDN.

### 2. What does the shared responsibility model say, and which responsibility never moves to the provider?

The provider secures the cloud itself (data centers, hardware,
hypervisor); the customer secures what they put in it. As you move from
VMs to platforms and functions, the provider takes over the OS, runtime,
and scaling. Data, identities, and access control stay yours on every
model: a public bucket or a leaked key is always the customer's problem.

### 3. What unit does each hosting model bill by?

VMs bill instance-hours (EC2 per second with a 60-second minimum);
bundled VMs a flat monthly price with transfer included; serverless
containers vCPU-seconds and GB-seconds (plus requests on Cloud Run);
functions requests plus GB-seconds; PaaS per instance or per second of
use; static hosts per GB and request, or a plan. The unit decides the
shape of the bill: per-request pricing tracks traffic, per-hour pricing
is flat until capacity runs out.

### 4. Which AWS costs are not in the headline price?

Internet egress ($0.09 per GB for the first 10 TB after 100 GB free), NAT
gateways ($0.045 per hour plus $0.045 per GB processed), cross-zone
traffic ($0.01 per GB each way), load balancer hours ($0.0225 plus LCUs),
public IPv4 addresses ($0.005 per hour each), CloudWatch Logs ingestion
($0.50 per GB), and idle resources such as unattached volumes. In a small
two-task Fargate setup they add up to more than three times the compute
cost.

### 5. What is lock-in, and how do you keep it under control?

Lock-in is the cost of leaving: code to rewrite, data to move, people to
retrain. Keep the portable layers portable: OCI container images,
standard engines (PostgreSQL, MySQL, the MongoDB protocol), Terraform or
OpenTofu, OIDC between systems. Accept provider-specific services only
where they clearly pay off, and remember data gravity: moving 50 TB out
at list price is about $4,400 of egress plus transfer time.

### 6. Compare hyperscalers, developer platforms, and budget providers.

Hyperscalers (AWS, Azure, Google Cloud) offer every service, many
regions, compliance programs, and commitment discounts, at the price of
complexity and metered extras. Developer platforms (Vercel, Netlify,
Render, Railway, Fly.io) offer git-push deploys and previews with little
operations work, but price cliffs and fewer controls. Budget providers
(Hetzner, DigitalOcean, Akamai) offer cheap VMs with generous included
bandwidth and fewer managed services. Mixing them is normal.

### 7. Which product changes from 2022-2026 should a team know about?

Heroku ended free dynos in November 2022; Google renamed Cloud Functions
to Cloud Run functions; Azure Media Services was retired on June 30, 2024;
AWS closed App Runner to new customers and recommends ECS Express Mode;
the original Amazon Glacier vault service stopped accepting new customers
on December 15, 2025 (use the S3 Glacier storage classes); CloudFront
added flat-rate plans in November 2025. Products change, so keep
deployments in code and data in portable formats.

## Hosting websites and frontends

### 8. What does the host have to do for a static site, an SPA, and a server-rendered site?

A static site only needs files served from a CDN with good cache headers.
An SPA also needs unknown paths rewritten to `index.html`, so client-side
routes work on refresh. A server-rendered site (SSR, ISR, streaming)
needs code running per request or per revalidation, as functions,
containers, or a Node server. If the site needs no server, every host is
an option and the cheapest cost nothing.

### 9. How does S3 with CloudFront serve a private bucket, and how should a deploy upload files?

The bucket stays private; an origin access control lets only the
CloudFront distribution read it, and ACM provides the certificate. A
deploy uploads content-hashed assets first and `index.html` last, then
invalidates only `index.html`, so users never load HTML that points at
assets not yet uploaded. Origin fetches from S3 to CloudFront are not
billed as transfer.

### 10. Why do platforms such as Vercel and Netlify make rollbacks instant?

Every build becomes an immutable deployment with its own URL, and
production is only an alias pointing at one deployment. Promoting a
release switches the alias atomically at every edge, and rolling back
points it at the previous deployment. Preview URLs per pull request come
from the same model.

### 11. Where can you run server-rendered Next.js, and what are the trade-offs?

Vercel runs it natively with full feature support but per-GB and
per-seat costs at scale. OpenNext on AWS uses Lambda, S3, and CloudFront
in your own account, with pieces you operate. Cloudflare Workers run it
through the OpenNext adapter with runtime differences from Node.js.
Amplify Hosting and Firebase App Hosting manage it for you. A container
on Cloud Run or Fargate (`output: "standalone"`) supports everything and
is portable, but you add CDN caching for static assets yourself.

### 12. Why do frontend hosting bills diverge so much at high traffic?

Because the price of transfer differs by an order of magnitude: requests
to Cloudflare Workers static assets are free and unlimited, CloudFront
charges $0.085 per GB in the US after its free terabyte, and several
frontend platforms charge well above CDN rates per GB. At 50 million page
views (about 25 TB) that is the difference between nothing and several
thousand dollars a month at list price (the frontend lesson prices each
host). Below about a million page views the difference is tens of
dollars, so workflow matters more than price.

### 13. What are CloudFront flat-rate plans, and what is the catch?

Monthly plans per distribution with no overage charges: Free $0 (1
million requests, 100 GB), Pro $15 (10 million requests, 50 TB), Business
$200 (125 million requests, 50 TB), and Premium $1,000 (500 million
requests, 50 TB), bundling WAF, DDoS protection, and other features. The
catch: one plan covers one distribution, and sustained use above the
allowance can lead AWS to reduce performance (fewer or more distant edge
locations) until you upgrade.

## Running backend servers and APIs

### 14. Compare VMs, platforms, container services, and functions by unit of scale, start time, and idle cost.

VMs scale by adding VMs, start in tens of seconds to minutes, and bill
while idle. Platforms scale by instances, start in seconds, and usually
bill while idle (some sleep). Container services scale tasks or pods,
start in seconds, and bill unless they scale to zero. Functions scale by
execution environments, start in milliseconds to seconds (cold starts),
and do not bill while idle.

### 15. What is a cold start on AWS Lambda, and how do you reduce it?

When no warm execution environment is free, Lambda creates a Firecracker
microVM, loads the code, starts the runtime, and runs module-scope
initialization before the handler: that is the cold start. Reduce it with
a small package, lazy initialization, Provisioned Concurrency for
predictable traffic, or (on other platforms) minimum instances such as
Cloud Run's `--min-instances`.

### 16. Why do functions exhaust database connections, and how do you fix it?

Each execution environment opens its own pool, so a traffic spike that
creates hundreds of environments multiplies connections past
`max_connections`. Fixes: one or two connections per environment, a cap
on reserved concurrency, and a pooler or proxy (RDS Proxy, PgBouncer) or
a data API built for serverless clients.

### 17. Which platforms suit WebSockets and long-running work?

VMs, ECS, and Kubernetes have no platform request limit (only load
balancer idle timeouts). Cloud Run supports WebSockets but each
connection is a request bound by the timeout (up to 60 minutes), so
clients must reconnect. Heroku must start responding within 30 seconds.
Lambda invocations last at most 15 minutes and WebSockets go through API
Gateway. Long jobs belong on workers and queues on any platform.

### 18. At what traffic does an always-on VM become cheaper than Lambda for TaskFlow API?

At 120 ms and 512 MB, Lambda costs about $1.20 per million requests
($0.20 per million requests plus 0.12 s x 0.5 GB x $0.0000166667). One
`t4g.small` with disk and an IPv4 address costs $17.51 a month, so the
crossover is 17.51 / 1.20 = about 14.6 million requests a month; two
Fargate tasks with an ALB ($58.31) cross at about 48.6 million. The flat
lines step up when instances fill, and functions save people time below
the crossover.

### 19. What is AWS Fargate, and how is it billed?

Fargate runs ECS or EKS tasks without servers you manage: each task gets
an isolated environment with the vCPU and memory you request. It bills
$0.04048 per vCPU-hour and $0.004445 per GB-hour (x86, us-east-1) per
second with a one-minute minimum, so a 0.5 vCPU, 1 GB task costs about
$18 a month running all the time.

### 20. When is Kubernetes the right hosting choice, and when is it not?

It fits many services, a team that knows and owns it, and needs for fine
control of scheduling and networking. It is wrong for a small team with
a few services: the control plane fee (about $73 a month on EKS or GKE),
node upgrades, add-ons, and on-call work cost more than the flexibility
is worth. Serverless containers or a platform give most of the benefit
with none of the cluster work.

## Managed databases

### 21. What does a managed database take off your plate, and what stays with you?

The provider handles installation, patching, automated backups and
point-in-time recovery, failover, read replicas, and storage growth. You
still own the schema, indexes, query performance, connection limits and
pooling, capacity choice and cost, and network exposure and access
control.

### 22. Explain a synchronous standby, a read replica, and point-in-time recovery.

A synchronous standby (Multi-AZ, HA) receives every commit in another
zone before it is acknowledged and is promoted on failure; you pay for
two instances. A read replica is an asynchronous copy for read scaling
that can lag. Point-in-time recovery combines snapshots with archived
transaction logs to restore a new instance to any second within the
retention window.

### 23. Compare provisioned, serverless-capacity, and per-request database billing.

Provisioned instances (RDS, Cloud SQL, Atlas dedicated) cost the same
every hour, sized for the peak: best for steady load. Serverless capacity
(Aurora Serverless v2, Neon) follows load above a floor or scales to
zero: good for variable load and preview databases, with a resume delay.
Per-request databases (DynamoDB on-demand, Firestore, Cosmos DB
serverless) bill each operation: cheap for spiky key lookups, expensive
for scans and fan-out reads.

### 24. Why can a per-request database bill jump without more users?

Because cost follows operations, not users: a scan, a query without a
selective key, a realtime listener on a large collection, a retry loop,
or a new secondary index (which multiplies write cost) all raise reads or
writes. Find the operation in the metrics, redesign around keys or
indexes, and cache hot reads.

### 25. How do you size a connection pool against a managed database limit?

Divide `max_connections` minus a reserve for administration and replicas
by the maximum number of processes autoscaling allows. With a limit of
100, a reserve of 10, and up to six API processes: (100 - 10) / 6 = 15
connections per pool. Add a pooler when functions or many small
instances connect.

### 26. When does self-hosting a database make sense?

When the team has real database skills, a tested restore procedure, and a
cost or control reason large enough to pay for backups, replication,
failover, upgrades, and security work. Otherwise a managed service is the
default: the premium is small next to the risk of losing data.

## Object and file storage

### 27. What are object, block, and file storage, and when do you use each?

Object storage holds whole objects under keys in buckets over an HTTP API
and scales without limit: uploads, media, backups. Block storage is a
virtual disk attached to one server in one zone: root disks and
self-hosted databases. File storage is a shared NFS or SMB filesystem
mounted by many servers: legacy apps and shared datasets. On AWS, gp3 is
$0.08 per GB-month and EFS Standard $0.30, against $0.023 for S3
Standard.

### 28. Walk through the S3 storage classes.

Express One Zone ($0.11 per GB-month, single zone, single-digit
milliseconds). Standard ($0.023). Intelligent-Tiering (moves objects
between $0.023, $0.0125, and $0.004 tiers by access, plus monitoring).
Standard-IA ($0.0125, 30-day and 128 KB minimums, $0.01 per GB read).
One Zone-IA ($0.01, one zone). Glacier Instant Retrieval ($0.004, 90
days, $0.03 per GB read). Glacier Flexible Retrieval ($0.0036, restore in
minutes to hours). Deep Archive ($0.00099, 180 days, restore within 12 or
48 hours).

### 29. How does S3 Intelligent-Tiering work, and when is it a bad choice?

S3 monitors each object: after 30 days without access it moves to the
Infrequent Access tier, after 90 days to Archive Instant Access, and
optional archive tiers can be enabled for 90 and 180 days. A read moves
it back with no retrieval fee. It costs $0.0025 per 1,000 objects
monitored, and objects under 128 KB are not monitored and always pay the
frequent rate, so it is poor for millions of tiny objects.

### 30. Why is the storage price a misleading way to compare object stores?

Because egress and requests dominate download-heavy workloads. Storing
10 TB and serving 50 TB a month costs about $4,643 straight from S3 and
$4,297 through CloudFront pay-as-you-go, but about $154 on Cloudflare R2,
$274 on Backblaze B2 direct, and $436 on a CloudFront Business flat-rate
plan if the terms fit. Storage is under $240 in every case.

### 31. What conditions apply to "free egress" on R2, B2, Wasabi, and Spaces?

R2 has no egress charge at all. B2 is free up to three times your average
stored data, then $0.01 per GB, and unlimited through partner CDNs. Wasabi
has no egress fee but its policy says a use case whose monthly egress
exceeds active storage is not a good fit, and service can be limited.
DigitalOcean Spaces includes 1,024 GiB a month, then $0.01 per GiB.

### 32. How do presigned uploads work, and what does a POST policy add over a PUT URL?

The API checks permissions, chooses the key, and signs a short-lived URL
or form; the browser uploads straight to the bucket, so large files never
touch the API servers. A presigned POST policy can enforce conditions
such as `content-length-range` and an exact `Content-Type`; a presigned
PUT cannot enforce a size range, so check the size afterwards. R2
supports presigned GET, HEAD, PUT, and DELETE but not HTML form POST.

### 33. Uploaded files disappear after every deploy. Why?

They were written to the local disk of an instance or container, which is
replaced on deploy or scale-in. Write uploads to object storage, store
the key in the database, and treat servers as disposable; this is also
what makes horizontal scaling possible.

## Video storage and streaming

### 34. Describe the stages of a video delivery pipeline.

Upload the source (resumable), transcode it into an ABR ladder of
renditions, package each rendition into short segments with HLS or DASH
playlists, store segments in object storage, deliver them through a CDN,
and play them in a player that switches renditions. Upload, transcode,
and packaging run once per video; delivery and playback run on every
view, which is why delivery dominates the bill.

### 35. What is adaptive bitrate streaming, and why must keyframes be aligned?

The player picks a rendition per segment based on measured bandwidth,
moving between, for example, 360p at 0.8 Mbps and 1080p at 5 Mbps. It
can switch only at segment boundaries, so every rendition must start
each segment with a keyframe at the same timestamp; otherwise switches
glitch or stall.

### 36. What are HLS, DASH, and CMAF?

HLS (RFC 8216) uses `.m3u8` master and media playlists and plays natively
on Apple devices. MPEG-DASH uses an XML `.mpd` manifest. CMAF is a common
fragmented-MP4 segment format both can reference, so one set of segments
can serve HLS and DASH players.

### 37. How do you estimate video delivery egress?

GB = minutes watched x 60 x average Mbps / 8 / 1,000. At 3 Mbps, one
minute is 22.5 MB, so 500,000 minutes watched is 11,250 GB: about $864 on
CloudFront pay-as-you-go, $500 on Cloudflare Stream ($1 per 1,000
minutes), about $400 on Mux at the 1080p tier after 100,000 free minutes,
and about $112 on bunny.net at $0.01 per GB.

### 38. When is per-minute delivery cheaper than per-GB delivery?

Convert through the bitrate. CloudFront's first-tier $0.085 per GB costs
bitrate x 7.5 MB x $0.085 per minute, which equals $0.001 per minute at
about 1.6 Mbps. Above that average bitrate, per-minute platforms (Stream,
Mux 1080p) beat CloudFront's list rate; low per-GB CDNs such as bunny.net
stay cheaper across the range.

### 39. What is the difference between signed URLs, HLS AES-128 encryption, and DRM?

Signed URLs or tokens stop link sharing but not a logged-in user saving
the stream. AES-128 encrypts segments but hands the key to the client.
DRM (Widevine, FairPlay, PlayReady) decrypts inside a protected module
using a licence from a licence server; studios require it. Internal
training video rarely needs more than signed URLs.

## Backup and archive storage

### 40. What is the difference between a backup and an archive?

The Google SRE book puts it this way: backups can be loaded back into the
application and must be recovered quickly, within the service's uptime
needs; archives keep data for long periods for audit, discovery, and
compliance, and their recovery time matters less. Backups belong in fast
tiers, archives in the cheapest.

### 41. Compare S3 Glacier Instant Retrieval, Flexible Retrieval, and Deep Archive.

Instant Retrieval: $0.004 per GB-month, 90-day minimum, millisecond
reads at $0.03 per GB. Flexible Retrieval: $0.0036, 90 days, restore
first: expedited 1-5 minutes, standard 3-5 hours, bulk 5-12 hours (free).
Deep Archive: $0.00099, 180 days, standard within 12 hours ($0.02 per
GB) or bulk within 48 hours ($0.0025 per GB).

### 42. What happens, and what do you pay, when you restore from Deep Archive?

You call `RestoreObject` with a tier and a number of days; S3 creates a
temporary copy, billed at the S3 Standard rate on top of the archived
object, and you copy it somewhere permanent before it expires. You pay
the per-GB retrieval fee and per-request restore fee. Large restores are
limited to about 1,000 restore requests per second and 1-2 PB a day per
account.

### 43. How does Azure's Archive tier differ from Cool and Cold?

Cool and Cold are online, with millisecond reads and 30- and 90-day
minimums. Archive ($0.00099 per GB-month, 180 days) is offline: a blob
must be rehydrated, which can take up to 15 hours at standard priority.
Microsoft documents a limit of 10 GiB per storage account per hour for
high-priority rehydration and warns that bulk timelines do not scale
linearly, so a multi-terabyte emergency restore takes days.

### 44. Why is Google Cloud's Archive class unusual?

Every Cloud Storage class is online, so Archive returns data in
milliseconds with a normal read. The trade-offs are a 365-day minimum and
a $0.05 per GiB retrieval fee: keeping 5 TB a year costs about $74, but
one full restore adds about $256.

### 45. A backup job overwrites `latest.tar.gz` every night in Glacier Instant Retrieval. What does it cost?

Each overwrite ends the previous version before its 90-day minimum, so
every replaced version is billed for the remainder of 90 days: the job
pays about 90 days of storage for every nightly copy. Write each backup
under a new key and expire by age, or keep short-lived copies in a tier
without minimums.

### 46. Explain S3 Object Lock governance and compliance modes, and how R2's bucket locks compare.

Both block deletes and overwrites of locked versions for a retention
period. Governance mode can be bypassed by users granted a special
permission; compliance mode cannot be bypassed by anyone, including the
root user, and the retention cannot be shortened. Legal holds have no
expiry. R2 bucket locks block deletion too, but anyone allowed to edit
the bucket configuration can remove the rule, so they are weaker.

## Cost optimization and cloud bills

### 47. How do you read a cloud bill to find what changed?

Group by usage type, not only by service ("EC2-Other" hides NAT, EBS,
transfer, and IPv4), and by day to find the step change. Know the views:
unblended cost is what each hour was charged; amortized spreads
commitment payments over their term and is the right basis for unit
costs. Export the raw data (Cost and Usage Report 2.0 or FOCUS) for SQL
analysis.

### 48. How do you attribute cloud costs to teams and services?

Accounts or projects per environment and team are the strongest boundary.
Tags add detail, but on AWS they must be activated as cost allocation
tags and enforced (provider `default_tags`, tag policies), because
hand-made resources are rarely tagged. Shared costs need an agreed
allocation rule. Start with showback (reporting); chargeback bills the
team's budget.

### 49. Does a budget stop spending? What does anomaly detection add?

A budget alerts on actual or forecast spend; it only stops anything if
you attach an action (on AWS, applying an IAM or SCP policy or stopping
specific EC2 and RDS instances). Anomaly detection learns each service's
normal spend and alerts on unusual jumps, catching a $40-a-day leak weeks
before a monthly threshold would.

### 50. How do you decide how much to commit to Savings Plans?

Commit to the floor of steady usage after cleanup and rightsizing, not
to the peak. For `m7g.large` ($0.0816 on demand), a 1-year Compute
Savings Plan at $0.0599 breaks even at 73% utilization (about 536 of 730
hours) and a 3-year plan at $0.0414 at 51%. Prefer Compute Savings Plans
when the architecture may change (they also cover Fargate and Lambda),
and ladder purchases over time.

### 51. Which workloads suit Spot capacity, and how much notice do you get?

Stateless queue workers, CI runners, batch and data jobs, and extra
nodes for stateless pods. Not databases or a single instance serving
traffic. AWS gives a two-minute interruption notice, Azure 30 seconds
through Scheduled Events, and Google Cloud a configurable 120 seconds
(none by default) plus up to 30 seconds of shutdown. Diversify instance
types and zones and checkpoint long work.

### 52. What are the alternatives to sending everything through a NAT gateway?

S3 and DynamoDB gateway endpoints carry that traffic at no charge (1 TB a
month through NAT costs $46.08 in processing). Interface endpoints for
services such as ECR and CloudWatch Logs cost $0.01 an hour per zone plus
$0.01 per GB, cheaper than NAT above roughly 420 GB a month per service
in two zones. IPv6 egress-only internet gateways have no gateway charge.
NAT instances and public subnets save more but add operations or
exposure.

### 53. How do you cut log costs without losing what you need?

Log errors always, sample successful requests, never log health checks
at full volume, set retention on every log group (CloudWatch keeps logs
forever by default), use a cheaper log class for rarely queried logs
($0.25 instead of $0.50 per GB ingested on CloudWatch), archive what
compliance requires to object storage, and use metrics for counts and
latencies.

### 54. What is unit economics in cloud cost, and what is FinOps?

Unit cost divides cost by a business driver: TaskFlow's $1,216.94 a month
over 30 million requests is $0.0406 per 1,000 requests, or $3.04 per
paying team. FinOps is the practice of shared ownership of cloud cost
across engineering, finance, and the business, cycling through Inform
(allocate and report), Optimize (rightsize, commit, re-architect), and
Operate (budgets, policies, reviews).

## Scenario-based questions

### 55. A two-person startup is launching TaskFlow (React SPA, Express API, MongoDB) and has a plan for EKS with a self-hosted database. The estimate is already over budget. What would you choose instead, and why?

**What to check first:** the hard constraints (WebSockets, long jobs,
compliance contracts), expected traffic, and who will be on call.

**How to confirm:** price each tier with real units: a static host for
the SPA, Cloud Run or a PaaS for the API at expected requests, and Atlas
Flex or M10 for MongoDB; compare with EKS's control-plane fee, nodes, and
database operations time.

**Likely causes and fixes:** over-engineering for the stage. Put the SPA
on Cloudflare or a CloudFront flat-rate plan, the API on Cloud Run,
Render, or Railway (or ECS Express Mode inside AWS), and the data on
MongoDB Atlas; revisit when the bill or a constraint demands it. See
[choosing where to run software](choosing-where-to-run-software.md).

### 56. TaskFlow API runs on Lambda. After quiet periods p99 latency spikes, and during a marketing spike the database starts refusing connections. What do you do?

**What to check first:** `Init Duration` in Lambda `REPORT` lines on slow
requests, function concurrency, and the database's connection count.

**How to confirm:** slow requests coincide with new environments, and the
connection count hits `max_connections` as concurrency climbs.

**Likely causes and fixes:** cold starts plus one pool per execution
environment. Trim dependencies and initialize lazily, add Provisioned
Concurrency for the baseline, cap reserved concurrency, shrink pools to
one or two connections, and put RDS Proxy, PgBouncer, or the provider's
pooler in front. See
[running backend servers and APIs](running-backend-servers-and-apis.md).

### 57. After moving ECS tasks into private subnets, the AWS bill doubled while traffic stayed flat. Why?

**What to check first:** Cost Explorer grouped by usage type for
`NatGateway-Hours`, `NatGateway-Bytes`, and `PublicIPv4:InUseAddress`.

**How to confirm:** VPC flow logs show most NAT traffic going to S3, ECR,
and CloudWatch address ranges.

**Likely causes and fixes:** a NAT gateway per zone processing AWS-service
traffic at $0.045 per GB. Add S3 and DynamoDB gateway endpoints (no
charge), interface endpoints for ECR and logs where volume justifies
them, and decide deliberately between one NAT gateway per zone and one
shared gateway. See
[cost optimization and cloud bills](cost-optimization-and-cloud-bills.md).

### 58. Product wants training videos in TaskFlow: about 11,000 minutes stored and 500,000 minutes watched a month. The team has no video experience. Which option would you choose, and why?

**What to check first:** whether the videos are private, whether live is
needed, the expected average bitrate, and whether files must stay in
your own account.

**How to confirm:** price the scenario: DIY S3 + MediaConvert + CloudFront
about $931 a month at list prices (or about $82 with a CloudFront Pro
flat-rate plan, if its terms fit), Cloudflare Stream about $555, Mux about
$413 after its credit, Bunny Stream about $121.

**Likely causes and fixes:** without video expertise, building the
pipeline is the expensive part. Choose a managed platform: Mux for the
best API and analytics, Cloudflare Stream for the simplest bill, or Bunny
Stream for the lowest delivery price; keep the original uploads in your
own storage so you can leave. See
[video storage and streaming](video-storage-and-streaming.md).

### 59. A healthcare customer will upload patient documents to TaskFlow. Which hosting and storage would you choose?

**What to check first:** whether the customer requires a HIPAA BAA, data
residency, retention rules, and audit requirements.

**How to confirm:** check each service you plan to use on the provider's
official HIPAA eligible services list and confirm the BAA covers it.

**Likely causes and fixes:** a provider without a BAA for the product
cannot hold PHI. Use a hyperscaler under its BAA (for example S3 with
encryption, Object Lock for records, and a separate account), keep PHI
out of static files and URLs, and use smaller providers only where their
official page offers a BAA for that product. See
[object and file storage](object-and-file-storage.md) and
[choosing where to run software](choosing-where-to-run-software.md).

### 60. Users download 50 TB a month of exported files from S3, and egress is now about $4,400 of the bill. What would you do?

**What to check first:** whether downloads go straight to S3 or through a
CDN, the cache hit ratio, and file sizes.

**How to confirm:** Cost Explorer shows `DataTransfer-Out-Bytes` as the
top usage type; access logs show repeated downloads of the same files.

**Likely causes and fixes:** per-GB egress at list price. A CDN alone on
pay-as-you-go rates only gets to about $4,297. Real fixes are a
different delivery model: Cloudflare R2 (about $154 including storage),
B2 with a partner CDN, or a CloudFront flat-rate plan if its terms fit.
Compress files and use signed, short-lived download URLs. See
[object and file storage](object-and-file-storage.md).

### 61. The business needs a 4-hour RTO and 7-year retention for TaskFlow's database backups. Design the storage tiers.

**What to check first:** backup size and growth, how often restores
happen, and whether restores may need to leave the provider.

**How to confirm:** time a real restore from each candidate tier,
including bulk limits, and price one full restore per year.

**Likely causes and fixes:** one tier cannot meet both goals. Keep the
last 30 days in a millisecond tier (S3 Standard or Glacier Instant
Retrieval, Azure Cool, Nearline, or B2) for the 4-hour RTO; transition
older copies to Deep Archive or Azure Archive with object lock for the
7-year retention; keep a copy in a separate account. See
[backup and archive storage](backup-and-archive-storage.md).

### 62. During an outage, a restore from S3 Glacier Deep Archive has been "in progress" for a day. What went wrong?

**What to check first:** the `Restore` header on the objects and the
retrieval tier used in the restore requests.

**How to confirm:** `ongoing-request="true"` long after the start, with
the Bulk tier (within 48 hours) and thousands of objects.

**Likely causes and fixes:** the only usable copy was archived, and Bulk
was chosen. Standard restores finish within 12 hours; there is no
expedited tier for Deep Archive. Keep recent backups in a millisecond
tier, document per-tier restore times in the runbook, and rehearse an
archive restore. See
[backup and archive storage](backup-and-archive-storage.md).

### 63. To save money, the team moved an uploads bucket to S3 Standard-IA, and the bill went up. Why?

**What to check first:** usage types `TimedStorage-SIA-SmObjects`,
`EarlyDelete-SIA`, and `Retrieval-SIA` after the change.

**How to confirm:** object size and age distribution (S3 Storage Lens or
Storage Class Analysis) shows many objects under 128 KB, deleted within
30 days, or read often.

**Likely causes and fixes:** minimum billable size, minimum duration, and
retrieval fees. Use Intelligent-Tiering for unknown access patterns,
filter transitions by size and age, and keep small or hot objects in
Standard. See [object and file storage](object-and-file-storage.md).

### 64. TaskFlow API on Lambda now handles a steady 60 million requests a month. Should it move to containers?

**What to check first:** whether traffic is steady, average duration and
memory, whether API Gateway is in the path, and the team's capacity to
run containers.

**How to confirm:** at about $1.20 per million requests Lambda costs
about $72 a month (about $132 with an API Gateway HTTP API at $1.00 per
million); two Fargate tasks with an ALB cost $58.31 if a load test shows
they can carry the peak.

**Likely causes and fixes:** past the crossover (about 48.6 million
requests against Fargate), always-on capacity is cheaper, and
a Compute Savings Plan cuts it further. The saving is modest at this
volume, so move when it also simplifies WebSockets, connections, or
latency, not for the money alone. See
[running backend servers and APIs](running-backend-servers-and-apis.md).

### 65. A static marketing site on a developer platform went offline at the end of a launch month, or showed an overage bill of several thousand dollars. Which hosting would you choose instead?

**What to check first:** the platform's plan limits and the month's
transfer and requests.

**How to confirm:** the dashboard shows the project paused for usage
limits, or the invoice shows per-GB transfer overages multiplied by tens
of terabytes.

**Likely causes and fixes:** hard limits on free plans and per-GB markups
at scale. For a static site, use Cloudflare Workers static assets
(requests to static assets are free and unlimited) or a CloudFront
flat-rate plan; on paid platforms set spend alerts and limits before
launches. See
[hosting websites and frontends](hosting-websites-and-frontends.md).

### 66. Six months after buying an EC2 Instance Savings Plan, its utilization dropped to 60%. What happened?

**What to check first:** the Savings Plans utilization report and recent
architecture changes.

**How to confirm:** usage of the committed instance family fell when
services moved to Fargate, another family, or another region.

**Likely causes and fixes:** a commitment tied to an instance family and
region. Nothing refunds it: move matching usage back where it makes
sense, buy Compute Savings Plans next time, commit only to the floor, and
ladder purchases. See
[cost optimization and cloud bills](cost-optimization-and-cloud-bills.md).

### 67. A bucket on Wasabi that serves public downloads received a notice about its usage. What is going on?

**What to check first:** monthly egress compared with active storage.

**How to confirm:** egress is several times the stored data (for example
5 TB stored, 20 TB downloaded).

**Likely causes and fixes:** Wasabi's free egress policy assumes egress
at or below active storage. Put a CDN in front so most reads are served
from cache, or move public downloads to a store priced for egress (R2,
B2 with partner CDNs) and keep Wasabi for backups. See
[object and file storage](object-and-file-storage.md).

### 68. The CEO read about companies leaving the cloud and asks whether TaskFlow should buy servers. How do you answer?

**What to check first:** the size, steadiness, and composition of the
bill, unit costs, and the team's ability to run hardware.

**How to confirm:** model owned or rented hardware including refresh
cycles, data center contracts, staff time, and on-call against the
current bill after cleanup and commitments.

**Likely causes and fixes:** cloud exits pay off for large, steady,
storage- or bandwidth-heavy workloads with strong infrastructure teams
(37signals projected about $7 million over five years from a $3.2 million
yearly bill). At TaskFlow's roughly $1,200 a month, cleanup and
commitments save more with less risk; Netflix stayed in the cloud for
reliability and elasticity. Revisit with budget providers for steady
parts as the bill grows. See
[cost optimization and cloud bills](cost-optimization-and-cloud-bills.md).

## Further learning

- [Hosting and cloud platforms overview](../hosting-and-platforms.md)
- [Choosing where to run software](choosing-where-to-run-software.md) ·
  [Hosting websites and frontends](hosting-websites-and-frontends.md) ·
  [Running backend servers and APIs](running-backend-servers-and-apis.md) ·
  [Managed databases](managed-databases.md) ·
  [Object and file storage](object-and-file-storage.md) ·
  [Video storage and streaming](video-storage-and-streaming.md) ·
  [Backup and archive storage](backup-and-archive-storage.md) ·
  [Cost optimization and cloud bills](cost-optimization-and-cloud-bills.md)
- [AWS Pricing Calculator](https://calculator.aws/),
  [Azure Pricing Calculator](https://azure.microsoft.com/en-us/pricing/calculator/),
  [Google Cloud Pricing Calculator](https://cloud.google.com/products/calculator)
- [AWS Well-Architected Framework: Cost Optimization Pillar](https://docs.aws.amazon.com/wellarchitected/latest/cost-optimization-pillar/welcome.html)
- [Google SRE book: Data Integrity](https://sre.google/sre-book/data-integrity/)
