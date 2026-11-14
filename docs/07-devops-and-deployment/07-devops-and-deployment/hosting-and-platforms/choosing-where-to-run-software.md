# Choosing Where to Run Software

Every program runs on somebody's computer. The real questions are how much
of that computer you rent, how much of it you operate yourself, how you
are billed for it, and how hard it would be to leave. This lesson explains
the hosting models from virtual machines to static hosting, what you and
the provider each manage in every model, how each one bills, the costs
that never appear in the headline price, lock-in and portability, and the
three families of providers: hyperscalers, developer platforms, and budget
providers. It ends with a verdict for common situations and a decision
tree.

The next lessons apply this to
[frontends](hosting-websites-and-frontends.md),
[backend APIs](running-backend-servers-and-apis.md), and
[databases](managed-databases.md). How to ship a release onto any of
these hosts (pipelines, rollouts, health checks) is covered in
[deployment strategies](../deployment-strategies.md); the networking
pieces (VPCs, subnets, security groups) are in
[cloud building blocks](../infrastructure-as-code/cloud-building-blocks.md).

## Why it matters

The hosting model decides four things that are expensive to change later:

- **How much operations work the team owns.** A two-person team that
  picks Kubernetes spends days on cluster upgrades and node patching that
  a platform would have done for it.
- **The shape of the bill.** Per-request pricing is close to free at low
  traffic and becomes the most expensive option at steady high traffic;
  instance pricing is the reverse.
- **The failure modes.** Functions have cold starts and duration limits;
  a single VM is a single point of failure; a platform can raise prices,
  change plans, or stop selling a product.
- **The exit cost.** Data, identity, and networking accumulate in one
  provider, and moving terabytes out is billed per GB.

None of these choices is permanent, but each one gets harder to reverse
every month. Writing down why you chose a host, and at what traffic or
cost you would reconsider, turns an accident into a decision.

## Real-world usage

- **Netflix (moved into the cloud).** In
  [Completing the Netflix Cloud Migration](https://about.netflix.com/en/news/completing-the-netflix-cloud-migration)
  (February 2016), Netflix explains that a major database corruption in
  2008 stopped DVD shipping for three days and showed it had to move away
  from "vertically scaled single points of failure". It chose AWS and
  finished the migration in January 2016. The stated reasons were
  elasticity ("thousands of virtual servers and petabytes of storage
  within minutes") and availability; it says cost reduction "was not the
  main reason", although its per-stream cloud cost ended up lower than
  in its data centers.
- **37signals (moved out of the cloud).** In
  [Our cloud-exit savings will now top ten million over five years](https://world.hey.com/dhh/our-cloud-exit-savings-will-now-top-ten-million-over-five-years-c7d9b5bd)
  (October 2024), the makers of Basecamp and HEY report cutting their
  cloud bill from a $3.2 million per year run rate to $1.3 million after
  moving their applications onto about $700,000 of their own hardware,
  with the remaining spend being Amazon S3, which they planned to replace
  with their own storage. Their reasoning, a large and steady workload
  that no longer benefits from elasticity, is collected at
  [basecamp.com/cloud-exit](https://basecamp.com/cloud-exit).
- **Dropbox (moved storage in-house).** The post
  [Scaling to exabytes and beyond](https://dropbox.tech/infrastructure/magic-pocket-infrastructure)
  (March 2016) describes how Dropbox moved over 90% of user data off Amazon S3
  onto its own storage system by October 2015, because owning the whole
  stack let it "customize the entire stack end-to-end", improve
  performance, and get "better unit economics" at its scale.
- **Platform risk is real.** AWS closed App Runner to new customers
  ([availability change](https://docs.aws.amazon.com/apprunner/latest/dg/apprunner-availability-change.html))
  and recommends Amazon ECS Express Mode instead, and in February 2026
  Heroku announced
  [a sustaining engineering model](https://www.heroku.com/blog/an-update-on-heroku/)
  focused on stability rather than new features, with Enterprise
  contracts no longer offered to new customers. Existing users of both
  keep running, but the roadmap you bought into changed.

**Popular tools and providers:** Amazon Web Services, Microsoft Azure,
Google Cloud, Cloudflare, Vercel, Netlify, Render, Railway, Fly.io,
Heroku, DigitalOcean, Hetzner, Akamai Cloud (Linode), and colocation or
owned hardware.

## How it works

### Virtual machines (IaaS)

**What it is:** a rented virtual server with a fixed amount of vCPU,
memory, disk, and network. Examples: Amazon EC2 and Lightsail, Azure
Virtual Machines, Google Compute Engine, DigitalOcean Droplets, Hetzner
Cloud, and Akamai Cloud (Linode).

**How it works underneath:** a hypervisor on a physical host divides the
machine into isolated virtual machines. Your VM boots an operating system
image, gets a block-storage disk and a network interface, and keeps
running (and billing) until you stop it.

**You manage:** the OS and its patches, the runtime (Node.js version),
the process manager, the reverse proxy, TLS, scaling (adding VMs and a
load balancer), backups of anything on the disk, and monitoring.
**The provider manages:** the data center, hardware, hypervisor, and the
physical network.

**Typical use:** steady workloads, software that needs a full OS, and
teams that want maximum control or the lowest price per CPU.

### Containers on an orchestrator (CaaS)

**What it is:** you package the app as a container image and a scheduler
decides which machine runs each copy. Examples: Amazon EKS, Google
Kubernetes Engine, Azure Kubernetes Service, and Amazon ECS on EC2.

**How it works underneath:** a control plane (managed by the provider on
EKS, GKE, and AKS) stores the desired state; worker nodes (VMs you pay
for) run the containers; the scheduler restarts failed containers and
spreads replicas across nodes and zones.

**You manage:** images, manifests, node pools and their upgrades (unless
you use a node-less mode such as GKE Autopilot), cluster add-ons,
autoscaling rules, and networking policy. **The provider manages:** the
control plane and the hardware.

**Typical use:** many services, teams that already know Kubernetes, and
workloads that need fine control over networking or scheduling. See the
[Kubernetes subject](../kubernetes.md) for how it works.

### Serverless containers

**What it is:** you hand the provider a container image plus CPU and
memory settings, and it runs as many copies as traffic needs, with no
nodes to manage. Examples: AWS Fargate (under ECS or EKS), Google Cloud
Run, and Azure Container Apps.

**How it works underneath:** each task or instance runs in an isolated
sandbox on the provider's fleet. Cloud Run and Container Apps can scale
to zero instances and start one when a request arrives; Fargate tasks
run until you stop them or a scaling policy removes them.

**You manage:** the image (including the runtime and its patches),
CPU and memory sizes, minimum and maximum instance counts, and
networking choices. **The provider manages:** servers, OS, scheduling,
and (on Cloud Run and Container Apps) the HTTPS endpoint.

**Typical use:** stateless HTTP APIs and workers, from small teams that
want containers without a cluster to large fleets.

### Platform as a service (PaaS)

**What it is:** you push code (or an image), and the platform builds it,
runs it, routes traffic to it, and gives you logs, TLS, and scaling.
Examples: Heroku, Render, Railway, Fly.io, Azure App Service, Google App
Engine, AWS Elastic Beanstalk, and DigitalOcean App Platform.

**How it works underneath:** a build step turns your repository into an
image (with buildpacks or your Dockerfile); the platform runs it on its
own fleet behind its router. Fly.io runs each app instance as a
lightweight VM it calls a Machine; Elastic Beanstalk is different in that
it creates EC2 instances and a load balancer inside your own AWS account.

**You manage:** code, configuration, instance size and count.
**The provider manages:** almost everything else.

**Typical use:** early startups, internal tools, and teams with no
dedicated operations people.

### Functions (FaaS)

**What it is:** you write a handler function; the provider runs it per
event (an HTTP request, a queue message, a file upload) and bills per
invocation and duration. Examples: AWS Lambda, Azure Functions, Cloud Run
functions (formerly Cloud Functions), Cloudflare Workers, and Vercel
Functions.

**How it works underneath:** on AWS Lambda each execution environment is
a lightweight microVM built on
[Firecracker](https://firecracker-microvm.github.io/). A classic Lambda
environment handles one request at a time, so concurrency comes from
starting more environments. When no warm environment is free, Lambda
creates one, downloads your code, and runs your initialization code
first: that delay is a **cold start**. Warm environments are reused for
later requests until Lambda reclaims them.

**You manage:** handler code, memory size, timeouts, and concurrency
limits. **The provider manages:** servers, runtime patching, and scaling.

**Typical use:** event processing, spiky APIs, scheduled jobs, and glue
between services.

### Edge compute

**What it is:** small functions that run in a CDN's points of presence,
close to users. Examples: Cloudflare Workers, CloudFront Functions, and
Lambda@Edge.

**How it works underneath:** Cloudflare Workers run in V8 isolates (the
sandbox technology of the Chrome JavaScript engine) inside every
Cloudflare location, which start in milliseconds instead of booting a VM
or container; CloudFront Functions run lightweight JavaScript on every
request at CloudFront edge locations.

**You manage:** small handlers with tight CPU and memory limits.
**The provider manages:** global placement and scaling.

**Typical use:** redirects, authentication checks, A/B routing, header
rewrites, and APIs that read from globally replicated data.

### Static hosting with a CDN

**What it is:** the host serves pre-built files (HTML, JavaScript, CSS,
images) from a CDN. Examples: Amazon S3 with CloudFront, Cloudflare,
Vercel, Netlify, GitHub Pages, Firebase Hosting, and Azure Static Web
Apps.

**How it works underneath:** your build output is uploaded once, copied
or cached at edge locations worldwide, and served without running any of
your code per request.

**You manage:** the build output, cache headers, and redirects.
**The provider manages:** everything else.

**Typical use:** marketing sites, documentation, and single-page apps
such as TaskFlow Web. The
[frontends lesson](hosting-websites-and-frontends.md) compares these
hosts in detail.

### Who manages what

The [AWS shared responsibility model](https://aws.amazon.com/compliance/shared-responsibility-model/)
summarizes the split as the provider being responsible for security "of"
the cloud and the customer for security "in" the cloud. Where the line
falls depends on the model:

![Diagram: a grid of responsibility layers against hosting models. Rows from bottom to top are data center and hardware, host and hypervisor, operating system and patches, language runtime, scaling and capacity, application code, and data, identities and access. Columns from left to right are own servers, virtual machines, Kubernetes, serverless containers, platform as a service, functions, and static hosting. With own servers you manage every layer. With virtual machines the provider takes the hardware and hypervisor. With Kubernetes the OS is shared because you manage the nodes; with serverless containers the provider runs the OS, while you still own the runtime inside your image and the scaling settings. A platform also manages the runtime and scaling, functions manage scaling per request, and static hosting leaves you only the files and settings. Data, identities, and access are your responsibility in every column.](responsibility-spectrum.svg)

| Layer | Own servers | VMs | Kubernetes | Serverless containers | PaaS | Functions | Static |
|---|---|---|---|---|---|---|---|
| Hardware, data center | You | Provider | Provider | Provider | Provider | Provider | Provider |
| Host OS, hypervisor | You | Provider | Provider | Provider | Provider | Provider | Provider |
| Guest OS and patches | You | You | Nodes: you (or Autopilot) | Provider | Provider | Provider | Provider |
| Language runtime | You | You | You (in the image) | You (in the image) | Provider (buildpack) | Provider | n/a |
| Scaling and capacity | You | You | You configure | You set limits | You pick size and count | Provider | Provider |
| Application code | You | You | You | You | You | You | Your files |
| Data, identities, access | You | You | You | You | You | You | You |

The last row never moves. A public S3 bucket, a leaked API key, or a
database open to the internet is the customer's problem on every model.

### How each model bills

!!! note "Prices checked November 2026"
    Prices on this page are US-region list prices (AWS us-east-1, Google
    Cloud us-central1, Azure East US) in USD as published on the linked
    official pages in November 2026. They change often; re-check them
    with the provider's calculator before deciding.

Each model has a different unit of billing, and that unit decides the
shape of the bill:

| Model | Billed for | Example list price | Source |
|---|---|---|---|
| VM | Instance-hours (EC2: per second, 60-second minimum) | EC2 `t4g.small` (2 vCPU, 2 GiB, Arm): $0.0168/hour | [EC2 pricing](https://aws.amazon.com/ec2/pricing/on-demand/) |
| VM bundle | Flat monthly price with transfer included | Lightsail 2 GB: $12/month with 3 TB transfer; DigitalOcean 2 GiB Droplet: $12/month with 2,000 GiB | [Lightsail](https://aws.amazon.com/lightsail/pricing/), [DigitalOcean](https://www.digitalocean.com/pricing/droplets) |
| Budget VM | Hourly with a monthly cap | Hetzner Cloud from €5.49/month excluding VAT | [Hetzner](https://www.hetzner.com/cloud/) |
| Kubernetes | Nodes (VMs) plus a cluster fee | EKS: $0.10 per cluster-hour; GKE: $0.10 per cluster-hour with a $74.40 monthly credit | [EKS](https://aws.amazon.com/eks/pricing/), [GKE](https://cloud.google.com/kubernetes-engine/pricing) |
| Serverless containers | vCPU-seconds and GB-seconds allocated | Fargate: $0.04048 per vCPU-hour + $0.004445 per GB-hour (per second, 1-minute minimum) | [Fargate](https://aws.amazon.com/fargate/pricing/) |
| Scale-to-zero containers | vCPU- and GiB-seconds while serving, plus requests | Cloud Run: $0.000024 per vCPU-second, $0.0000025 per GiB-second, $0.40 per million requests | [Cloud Run](https://cloud.google.com/run/pricing) |
| PaaS instance | Fixed price per instance size | Render: $7/month for 512 MB; Heroku Basic dyno: $7/month | [Render](https://render.com/pricing), [Heroku](https://www.heroku.com/pricing/) |
| PaaS usage | Per-second CPU and memory | Railway: $0.00000772 per vCPU-second, $0.00000386 per GB-second | [Railway](https://railway.com/pricing) |
| Functions | Requests plus GB-seconds (1 ms granularity) | Lambda: $0.20 per million requests + $0.0000166667 per GB-second | [Lambda](https://aws.amazon.com/lambda/pricing/) |
| Edge functions | Requests plus CPU time | Workers Paid: $5/month minimum including 10 million requests and 30 million CPU-ms | [Workers](https://developers.cloudflare.com/workers/platform/pricing/) |
| Developer platform | Seats or plan fee plus metered usage | Vercel Pro: $20 per developer seat per month with a $20 usage credit | [Vercel](https://vercel.com/pricing) |

To compare them you convert every unit into a monthly number. Cloud
calculators use 730 hours per month:

```text
VM:                    price per hour x 730
Serverless container:  (vCPU x price per vCPU-hour + GB x price per GB-hour) x hours running
Function:              requests x price per request
                       + requests x duration (s) x memory (GB) x price per GB-second

Example: one Fargate task with 0.5 vCPU and 1 GB, running all month
  (0.5 x $0.04048 + 1 x $0.004445) x 730 = $0.024685 x 730 = $18.02
```

Prices also differ by region. Fly.io, for example, charges $0.02 per GB
of outbound data in North America and Europe but $0.12 per GB in Africa
and India ([Fly.io pricing](https://fly.io/docs/about/pricing/)), while
Google lists Mumbai (asia-south1) in the same Tier 1 price group as
us-central1 for Cloud Run. To check a region such as India, pick it in the
region selector of the pricing page or the calculator.

Free tiers change as well. New AWS accounts now receive up to $200 in
credits and choose between a free plan, which closes after six months or
when the credits run out, and a paid plan; more than 30 services keep
always-free monthly allowances on both
([AWS Free Tier](https://aws.amazon.com/free/)). Developer platforms
revise their free plans often, so read the current terms before relying
on one.

### The costs that are not in the headline price

A pricing page shows the main meter. A real bill has several more. On
AWS (us-east-1) the usual surprises are:

| Item | List price | Why it surprises people |
|---|---|---|
| Data transfer out to the internet | $0.09 per GB for the first 10 TB, after 100 GB per month free across AWS | Every API response, download, and image leaves through this meter |
| NAT gateway | $0.045 per hour (about $32.85 per month) plus $0.045 per GB processed | Private subnets need one per Availability Zone to reach the internet, ECR, or third-party APIs |
| Data between Availability Zones | $0.01 per GB in each direction | Multi-AZ designs send app-to-database and replication traffic across zones |
| Application Load Balancer | $0.0225 per hour (about $16.43 per month) plus $0.008 per LCU-hour | Billed even when traffic is zero; one per environment adds up |
| Public IPv4 address | $0.005 per hour (about $3.65 per month) per address, in use or idle | Every public load balancer node, NAT gateway, and instance address counts |
| CloudWatch Logs | $0.50 per GB ingested, $0.03 per GB-month stored | Verbose request logging can cost more than the servers |
| EKS cluster | $0.10 per hour; $0.50 per hour on extended support | An old Kubernetes version quietly multiplies the control-plane fee by five |
| Idle and forgotten resources | gp3 volumes $0.08 per GB-month; databases billed per hour | Stopped instances still pay for disks; dev databases run all weekend |

Sources: [EC2 data transfer](https://aws.amazon.com/ec2/pricing/on-demand/),
[VPC pricing](https://aws.amazon.com/vpc/pricing/),
[EBS pricing](https://aws.amazon.com/ebs/pricing/),
[Elastic Load Balancing pricing](https://aws.amazon.com/elasticloadbalancing/pricing/),
[CloudWatch pricing](https://aws.amazon.com/cloudwatch/pricing/), and the
[AWS Price List Bulk API](https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/using-ppslong.html).

Here is what that does to a modest TaskFlow API on ECS with Fargate: two
tasks (0.5 vCPU, 1 GB each) in private subnets across two zones, behind
an Application Load Balancer, with one NAT gateway per zone.

```text
Fargate        2 tasks x $18.02                                   = $ 36.04
ALB            730 h x $0.0225 = $16.43; ~1 LCU x 730 h x $0.008 = $5.84 = $ 22.27
NAT gateways   2 x 730 h x $0.045 = $65.70; 100 GB x $0.045 = $4.50  = $ 70.20
Public IPv4    4 addresses (2 ALB nodes, 2 NAT) x $3.65             = $ 14.60
Logs           30 GB x $0.50 = $15.00; 30 GB stored x $0.03 = $0.90  = $ 15.90
Cross-AZ       200 GB app-to-database x $0.01 x 2 directions        = $  4.00
Internet out   150 GB - 100 GB free = 50 GB x $0.09                 = $  4.50
                                                                  -------
Total                                                             $167.51
```

![Diagram: a stacked bar comparing the expected and actual monthly bill for TaskFlow API on ECS Fargate. The expected bar shows only the two Fargate tasks at $36.04. The actual bar adds NAT gateways at $70.20, the load balancer at $22.27, CloudWatch Logs at $15.90, public IPv4 addresses at $14.60, cross-zone traffic at $4.00, and internet egress at $4.50, for $167.51 in total, so compute is about 22 percent of the bill. Notes list cheaper layouts: gateway endpoints for S3, fewer NAT gateways or public subnets for tasks, and lower log volume.](hidden-costs-bill.svg)

Compute is about a fifth of the bill. The fixes are design choices, not
discounts: S3 and DynamoDB gateway endpoints carry that traffic without
a NAT gateway and without a charge, other AWS services can be reached
through interface endpoints (which have their own hourly fee), a single
NAT gateway halves that line at the cost of a zone dependency, and
logging only errors and sampled requests cuts the log line. The
[cost optimization lesson](cost-optimization-and-cloud-bills.md) covers
these in depth.

### Lock-in and portability

Lock-in is the cost of leaving: the code you would rewrite, the data you
would move, and the people you would retrain. Some of it is worth paying
for, but it should be chosen, not accidental.

| Layer | Portable choice | Provider-specific choice | Cost of leaving the specific choice |
|---|---|---|---|
| Packaging | OCI container image | Lambda handler signature, Workers APIs | Rewrite entry points and local tooling |
| Relational data | PostgreSQL or MySQL (RDS, Cloud SQL, Neon, self-hosted) | Aurora-only features | Usually small: a dump and restore |
| Document data | MongoDB protocol (Atlas, self-hosted) | DynamoDB, Firestore, Cosmos DB native APIs | Rewrite the data-access layer and its access patterns |
| Infrastructure definition | Terraform or OpenTofu | CloudFormation, Bicep | Re-express resources; the concepts carry over |
| Identity and permissions | OIDC between systems | IAM roles and policies | Always provider-specific; rebuild per provider |
| Data volume | Small datasets | Hundreds of TB in one provider | Egress fees and transfer time |

Moving 50 TB out of AWS over the internet at list price costs roughly
$4,400 (10 TB at $0.09 and 40 TB at $0.085 per GB). AWS says customers
who move all their data off AWS can ask AWS Support for free data
transfer out for that move
([AWS News Blog](https://aws.amazon.com/blogs/aws/free-data-transfer-out-to-internet-when-moving-out-of-aws/)),
but you still pay in time and engineering effort.

### Three families of providers

| Family | Examples | Strengths | Weaknesses | Pick it when |
|---|---|---|---|---|
| Hyperscalers | AWS, Azure, Google Cloud | Every service you could need, many regions, compliance programs and BAAs, commitment discounts, enterprise support | Complexity, many metered extras, egress fees, IAM and networking learning curve | You need breadth, compliance, specific regions, or long-term scale |
| Developer platforms | Vercel, Netlify, Cloudflare, Render, Railway, Fly.io, Heroku | Git-push deploys, preview environments, good defaults, almost no operations | Price cliffs at plan limits, fewer regions and controls, platform and roadmap risk | You want to ship fast with a small team |
| Budget and infrastructure providers | Hetzner, DigitalOcean, Akamai Cloud (Linode) | Low prices per vCPU, generous included bandwidth, simple pricing | Fewer managed services, fewer regions, compliance and support vary | Steady workloads, cost-sensitive teams that can run servers |

These families mix well: a common and sensible setup is a static
frontend on a developer platform, an API on a hyperscaler or budget VM,
and a managed database from a specialist such as MongoDB Atlas.

## When to use and when not to use

Use a more managed option (platform, serverless containers, functions)
when the team is small, traffic is uncertain or spiky, or speed of
delivery matters most. Move toward more control (containers on your own
cluster, VMs, owned hardware) when traffic is large and steady, when you
need something the platform cannot do (long-running connections, special
hardware, unusual networking), or when the platform's markup has become
a large share of the budget.

Do not choose Kubernetes because large companies use it, functions
because they are fashionable, or owned hardware because of one blog
post. Choose the cheapest option, counting people's time, that meets the
hard constraints.

### Which to choose

| Situation | Pick | Runner-up | Why |
|---|---|---|---|
| Side project or portfolio | Static frontend on Cloudflare or GitHub Pages; API on Cloud Run (free tier, scales to zero) | A small VPS (DigitalOcean from $4 a month, Hetzner from €5.49) | Costs nothing while idle; a VPS teaches Linux but bills every hour |
| Early startup | A developer platform (Render, Railway, Fly.io) or Cloud Run, plus a managed database; frontend on Vercel or Netlify | ECS Express Mode on AWS (Fargate and a load balancer created for you) | Fastest path to production with no operations hire; move when the bill or a constraint says so |
| Steady high traffic | Containers or VMs on committed capacity (ECS or EKS on EC2 with Savings Plans, GKE with committed use discounts) | Owned or colocated hardware at very large, very steady scale | Per-request pricing costs most at constant load; AWS Compute Savings Plans cut compute prices by up to 66% ([AWS](https://aws.amazon.com/savingsplans/compute-pricing/)) |
| Spiky or unpredictable traffic | Functions (Lambda) or scale-to-zero containers (Cloud Run, Container Apps) | Autoscaled containers with a small warm minimum | You pay for the spike, not for idle hours; plan for cold starts and database connection limits |
| Global audience | CDN and edge for static and cacheable content; API in one or two regions near most users | Multi-region instances on Fly.io or Cloud Run | Most latency is distance; data still has a home region, so move reads to the edge first |
| Compliance-heavy (for example healthcare) | A hyperscaler under its BAA, using only HIPAA-eligible services: [AWS](https://aws.amazon.com/compliance/hipaa-compliance/), [Google Cloud](https://cloud.google.com/security/compliance/hipaa), [Azure](https://learn.microsoft.com/en-us/azure/compliance/offerings/offering-hipaa-us) | Platforms that sign BAAs: [Fly.io](https://fly.io/docs/about/healthcare/), Vercel (a paid add-on on Pro, on request for Enterprise), Render (HIPAA workspaces on its Scale plan) | You need the contract, audit logs, encryption, and access controls; a BAA alone does not make your app compliant |
| Large files or heavy egress | Object storage with low or no egress fees plus a CDN; compute on providers with large included transfer (Hetzner, Lightsail, DigitalOcean) | CloudFront flat-rate plans, which include 50 TB of transfer from $15 per month per distribution | At $0.09 per GB, egress dominates; see [object and file storage](object-and-file-storage.md) |
| Team with no ops people | A fully managed platform (Render, Railway, Heroku-style) or Cloud Run with a managed database | ECS Express Mode | Nobody has to patch servers or run clusters; avoid Kubernetes until someone owns it |

![Diagram: a decision tree for choosing where to run a workload. If the output is only static files, use static hosting with a CDN. Otherwise, if the code needs long-lived connections, GPUs, or a full OS, use VMs or containers. If traffic is idle most of the time or very spiky, use functions or scale-to-zero containers. If the team has no one to run infrastructure, use a platform as a service or serverless containers. If the load is large and steady, use containers or VMs with committed discounts. Otherwise serverless containers or a platform are the default. A compliance contract requirement filters every branch to providers that sign one.](where-to-run-decision-tree.svg)

## Practical examples

### A cost model you can rerun

Prices change and traffic grows, so keep the comparison as a small script
next to the code and rerun it when either changes:

```js
// scripts/hosting-cost.mjs: compare monthly cost of four hosting models
// Prices: US list prices checked November 2026 (see the linked pages)
const PRICE = {
  lambdaPerRequest: 0.20 / 1e6,        // aws.amazon.com/lambda/pricing
  lambdaPerGbSecond: 0.0000166667,
  fargateVcpuHour: 0.04048,            // aws.amazon.com/fargate/pricing
  fargateGbHour: 0.004445,
  albHour: 0.0225,                     // aws.amazon.com/elasticloadbalancing/pricing
  albLcuHour: 0.008,
  ec2T4gSmallHour: 0.0168,             // aws.amazon.com/ec2/pricing/on-demand
  gp3GbMonth: 0.08,
  ipv4Hour: 0.005,                     // aws.amazon.com/vpc/pricing
  cloudRunVcpuSecond: 0.000024,        // cloud.google.com/run/pricing
  cloudRunGibSecond: 0.0000025,
  cloudRunPerRequest: 0.40 / 1e6,
};
const HOURS = 730;

export function monthlyCost({ requests, durationMs, memoryGb }) {
  const seconds = durationMs / 1000;

  // Functions: pay per request and per GB-second (ignoring the free tier)
  const lambda =
    requests * PRICE.lambdaPerRequest +
    requests * seconds * memoryGb * PRICE.lambdaPerGbSecond;

  // Scale-to-zero container, 1 vCPU, concurrency 1 (worst case): billable
  // time is rounded up to 100 ms, so an isolated 120 ms request bills 200 ms
  const billedSeconds = Math.ceil(durationMs / 100) / 10;
  const cloudRun =
    requests * billedSeconds * PRICE.cloudRunVcpuSecond +
    requests * billedSeconds * memoryGb * PRICE.cloudRunGibSecond +
    requests * PRICE.cloudRunPerRequest;

  // Two always-on Fargate tasks (0.5 vCPU, 1 GB) behind an ALB at ~1 LCU
  const fargate =
    2 * (0.5 * PRICE.fargateVcpuHour + 1 * PRICE.fargateGbHour) * HOURS +
    PRICE.albHour * HOURS + PRICE.albLcuHour * HOURS;

  // One small VM with a 20 GB disk and a public IPv4 address (no redundancy)
  const vm =
    PRICE.ec2T4gSmallHour * HOURS + 20 * PRICE.gp3GbMonth + PRICE.ipv4Hour * HOURS;

  return { lambda, cloudRun, fargate, vm };
}

const round = (n) => Math.round(n * 100) / 100;
for (const millions of [1, 2, 10, 50, 100]) {
  const cost = monthlyCost({ requests: millions * 1e6, durationMs: 120, memoryGb: 0.5 });
  console.log(`${millions}M requests/month`, Object.fromEntries(
    Object.entries(cost).map(([k, v]) => [k, `$${round(v)}`]),
  ));
}
```

```text
$ node scripts/hosting-cost.mjs
1M requests/month { lambda: '$1.2', cloudRun: '$5.45', fargate: '$58.31', vm: '$17.51' }
2M requests/month { lambda: '$2.4', cloudRun: '$10.9', fargate: '$58.31', vm: '$17.51' }
10M requests/month { lambda: '$12', cloudRun: '$54.5', fargate: '$58.31', vm: '$17.51' }
50M requests/month { lambda: '$60', cloudRun: '$272.5', fargate: '$58.31', vm: '$17.51' }
100M requests/month { lambda: '$120', cloudRun: '$545', fargate: '$58.31', vm: '$17.51' }
```

The model is deliberately simple: it ignores free tiers, assumes the
fixed-price options have enough capacity, and treats Cloud Run as if no
two requests ever overlapped on an instance, which overstates its cost
for I/O-bound Node.js code that serves many requests per instance. The
[backend lesson](running-backend-servers-and-apis.md) refines it and
plots the crossover points.

### One image, three hosts

A container image is the most portable unit you can build. The same
TaskFlow API image can run on three very different hosting models:

```bash
# 1. AWS: ECS Express Mode creates a Fargate service, an ALB, scaling, and networking
aws ecs create-express-gateway-service \
  --service-name taskflow-api \
  --execution-role-arn arn:aws:iam::<account-id>:role/ecsTaskExecutionRole \
  --infrastructure-role-arn arn:aws:iam::<account-id>:role/ecsInfrastructureRoleForExpressServices \
  --primary-container '{
      "image": "<account-id>.dkr.ecr.us-east-1.amazonaws.com/taskflow-api:1.4.0",
      "containerPort": 3000
    }' \
  --health-check-path "/healthz" \
  --scaling-target '{"minTaskCount":2,"maxTaskCount":6}'

# 2. Google Cloud: a scale-to-zero serverless container
gcloud run deploy taskflow-api \
  --image=us-docker.pkg.dev/example-project/apps/taskflow-api:1.4.0 \
  --region=us-central1 --port=3000 --min-instances=0 --max-instances=10

# 3. A plain VM: Docker restarts the container if it or the VM restarts
docker run -d --name taskflow-api --restart=unless-stopped \
  -p 127.0.0.1:3000:3000 --env-file /etc/taskflow/api.env \
  ghcr.io/example/taskflow-api:1.4.0
```

The image did not change; only the surrounding responsibilities did. On
the VM you also own nginx, TLS, patching, and a second VM for
redundancy, which the
[backend deployment lesson](../deployment-strategies/deploying-backend-services.md)
walks through.

### Find the hidden costs on an AWS account

These read-only AWS CLI queries list the usual hidden-cost items so you
can review them each month:

```bash
#!/usr/bin/env bash
# scripts/hidden-costs.sh: read-only checks for common hidden AWS costs
set -euo pipefail
export AWS_PAGER=""

echo "== Unattached EBS volumes (billed per GB-month while unused)"
aws ec2 describe-volumes --filters Name=status,Values=available \
  --query 'Volumes[].{id:VolumeId,gb:Size,created:CreateTime}' --output table

echo "== Elastic IPs not associated with anything (billed per hour)"
aws ec2 describe-addresses \
  --query 'Addresses[?AssociationId==null].PublicIp' --output text

echo "== Network interfaces holding a public IPv4 address"
aws ec2 describe-network-interfaces \
  --query 'NetworkInterfaces[?Association.PublicIp].{ip:Association.PublicIp,type:InterfaceType,desc:Description}' \
  --output table

echo "== NAT gateways (hourly charge each, plus per-GB processing)"
aws ec2 describe-nat-gateways --filter Name=state,Values=available \
  --query 'NatGateways[].{id:NatGatewayId,vpc:VpcId,subnet:SubnetId}' --output table

echo "== Log groups with no retention (stored forever)"
aws logs describe-log-groups \
  --query 'logGroups[?!retentionInDays].[logGroupName,storedBytes]' --output table

echo "== Last month's cost by usage type"
aws ce get-cost-and-usage \
  --time-period Start=2026-10-01,End=2026-11-01 \
  --granularity MONTHLY --metrics UnblendedCost \
  --group-by Type=DIMENSION,Key=USAGE_TYPE \
  --query 'ResultsByTime[0].Groups[].[Keys[0],Metrics.UnblendedCost.Amount]' --output text \
  | sort -k2 -n -r | head -20
```

Usage types containing `NatGateway-Hours`, `DataTransfer-Out-Bytes`,
`PublicIPv4:InUseAddress`, and `DataProcessing-Bytes` (log ingestion),
often with a region prefix such as `USE1-`, point straight at the lines
in the table above. Run the script per region
(`AWS_REGION=eu-west-1 ./scripts/hidden-costs.sh`), because most of these
resources are regional.

## Best practices

- Choose per workload: static files, APIs, background jobs, and
  databases often belong on different hosting models.
- Start with the most managed option that meets the hard constraints,
  and write down the traffic or cost at which you would revisit it.
- Price every option with the full set of meters (egress, NAT, load
  balancer, IPv4, logs, cross-zone traffic), not just compute.
- Keep the application portable where it is cheap: a container image,
  configuration in environment variables, standard database protocols,
  and infrastructure as code.
- Put budgets and anomaly alerts on every account and project from the
  first day.
- Tag or label every resource with its service, environment, and owner
  so the bill can be split and orphaned resources found.
- Read the free tier and plan limits: whether it sleeps, expires,
  pauses, or forbids commercial use.
- Track each provider's status pages and announcements for products you
  depend on; closures and pricing changes come with notice.

## In production

- **The bill doubled after moving tasks into private subnets.**
  *Detect:* Cost Explorer shows `NatGateway-Hours` and
  `NatGateway-Bytes` as new top usage types. *Cause:* each private
  subnet's zone got a NAT gateway, and image pulls and API calls now go
  through it. *Fix:* add S3 and DynamoDB gateway endpoints, use interface
  endpoints for ECR and CloudWatch where they cost less than the NAT
  traffic, and decide deliberately between one NAT gateway per zone and
  one shared gateway.
- **Small new charges for "public IPv4" on every service.**
  *Detect:* `PublicIPv4:InUseAddress` usage in the bill, roughly $3.65
  per address per month. *Cause:* AWS bills every public IPv4 address,
  including load balancer nodes and instances that get one
  automatically. *Fix:* disable auto-assigned public IPs, put instances
  behind a load balancer, and use IPv6 where clients support it.
- **The Kubernetes control-plane fee jumped five times.**
  *Detect:* EKS usage type `extendedSupport` at $0.50 per hour instead
  of $0.10. *Cause:* the cluster runs a Kubernetes version past standard
  support. *Fix:* schedule regular version upgrades; treat the extended
  support fee as an alert, not a plan.
- **The first request after a quiet period takes many seconds.**
  *Detect:* latency spikes only on the first request after idle time;
  platform logs show the service starting. *Cause:* a free or
  scale-to-zero tier: Render spins down a Free web service after 15
  minutes without traffic, Heroku Eco dynos sleep after 30 minutes, and
  Cloud Run with zero minimum instances starts one on demand. *Fix:* set
  a minimum of one instance, move to a paid always-on plan, or accept
  the delay for internal tools.
- **A site went offline at the end of the month.**
  *Detect:* the platform dashboard shows the project paused for usage.
  *Cause:* a hard plan limit, such as Netlify's Free plan credit limit
  or Vercel Hobby limits, which pause the feature until the next period.
  *Fix:* upgrade before launch, set usage alerts, and use spend limits on
  paid plans instead of hard stops for production.
- **The provider stopped selling the service you depend on.**
  *Detect:* an availability notice in the documentation, such as App
  Runner being closed to new customers. *Cause:* a product lifecycle
  change. *Fix:* follow the named replacement (ECS Express Mode for App
  Runner), keep deployments in infrastructure as code so a migration is
  a project, not a rewrite, and keep the app containerized.
- **Egress costs spike overnight.**
  *Detect:* `DataTransfer-Out-Bytes` jumps; CDN or load balancer logs
  show one referrer or crawler downloading large files repeatedly.
  *Cause:* hotlinking, a scraper, or an uncached large download.
  *Fix:* serve files through a CDN with caching, add rate limits and bot
  rules, and use signed URLs for large private files.

## Important terminology

- **IaaS (infrastructure as a service):** renting virtual machines,
  disks, and networks that you configure and operate.
- **CaaS (containers as a service):** a managed service that runs
  container images, with or without visible nodes.
- **PaaS (platform as a service):** a platform that builds and runs your
  code and handles routing, TLS, and scaling.
- **FaaS (functions as a service):** running handler functions per
  event, billed per invocation and duration.
- **Edge compute:** code that runs in a CDN's locations near users.
- **Shared responsibility model:** the split of security and operations
  duties between provider and customer, which changes by hosting model.
- **Cold start:** the delay when a platform must create a new execution
  environment or instance before handling a request.
- **Egress:** data sent out of a provider's network, usually billed per
  GB.
- **NAT gateway:** a managed service that lets resources in private
  subnets reach the internet; billed per hour and per GB.
- **Lock-in:** the cost, in rewriting, retraining, and data transfer, of
  moving to another provider.
- **Hyperscaler:** one of the largest general-purpose clouds (AWS, Azure,
  Google Cloud).
- **Committed use discount:** a lower price in exchange for committing to
  a level of spend or usage for one or three years.

## Common mistakes and misconceptions

- Comparing only compute prices and ignoring egress, NAT gateways, load
  balancers, IPv4 addresses, and logs.
- Choosing Kubernetes before there is anyone to own the cluster.
- Assuming serverless is always cheaper; at steady high traffic it
  usually is not.
- Assuming the cloud is always more expensive than owned hardware without
  counting people, data center contracts, and spare capacity.
- Launching a commercial product on a free tier that sleeps, expires,
  pauses, or forbids commercial use (GitHub Pages and Vercel Hobby both
  restrict commercial use).
- Treating "managed" as "no responsibility": data, access control, and
  configuration mistakes are always yours.
- Leaving development environments, snapshots, and test databases
  running indefinitely.
- Building deep lock-in by accident instead of choosing where it pays off.

## Revision questions

1. Describe what you manage and what the provider manages for a VM, a
   serverless container, and a function.
2. Why does a classic AWS Lambda function have cold starts, and what
   happens during one?
3. Name five costs that rarely appear in the headline price on AWS, with
   the unit each is billed in.
4. Calculate the monthly cost of one always-on Fargate task with 1 vCPU
   and 2 GB at the prices on this page. (Answer:
   (1 x 0.04048 + 2 x 0.004445) x 730 = $36.04.)
5. A two-zone setup uses two NAT gateways that process 300 GB per month.
   What do they cost, and what would you change first? (Answer:
   2 x 730 x $0.045 + 300 x $0.045 = $65.70 + $13.50 = $79.20; start with
   gateway endpoints for S3 traffic.)
6. When is a developer platform a better choice than a hyperscaler, and
   when is it worse?
7. Which parts of an application are cheap to keep portable, and which
   kinds of lock-in can be worth accepting?
8. A healthcare startup must store patient data. What must be true of its
   hosting provider before it stores any, and what remains its own job?

## Further learning

- [AWS shared responsibility model](https://aws.amazon.com/compliance/shared-responsibility-model/)
- [AWS Pricing Calculator](https://calculator.aws/)
- [Google Cloud Pricing Calculator](https://cloud.google.com/products/calculator)
- [Azure Pricing Calculator](https://azure.microsoft.com/en-us/pricing/calculator/)
- [AWS Well-Architected Framework: Cost Optimization Pillar](https://docs.aws.amazon.com/wellarchitected/latest/cost-optimization-pillar/welcome.html)
- [Google Cloud Well-Architected Framework](https://cloud.google.com/architecture/framework)
- [The Twelve-Factor App](https://12factor.net/)
- Next: [hosting websites and frontends](hosting-websites-and-frontends.md). Back to the [hosting and cloud platforms overview](../hosting-and-platforms.md).
