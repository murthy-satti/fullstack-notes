# Running Backend Servers and APIs

A backend API such as TaskFlow API (Node.js, Express, MongoDB) is a
process that must be reachable over HTTPS, scale with traffic, survive
restarts, and talk to a database. It can run on a virtual machine, on a
platform that hides the machine, in containers, or as functions. This
lesson explains what each concrete product is (EC2, Lightsail, Azure
VMs, Compute Engine, Droplets, Hetzner, Linode, Elastic Beanstalk,
Heroku, Render, Railway, Fly.io, App Service, App Engine, App Platform,
ECS, Fargate, EKS, Cloud Run, Container Apps, AKS, GKE, Lambda, Azure
Functions, Cloud Run functions, Cloudflare Workers, and Vercel
Functions), the constraints that rule some out (WebSockets, long jobs,
cold starts), and what TaskFlow API costs on each, including where
functions stop being the cheapest option.

The mechanics of deploying a Node service without dropping requests
(health checks, graceful shutdown, zero-downtime restarts) are in
[deploying backend services](../deployment-strategies/deploying-backend-services.md);
this lesson is about where the process runs and what that costs.

## Why it matters

The compute model decides how the API behaves under load and how the
bill grows. Functions scale from zero to thousands of copies in seconds
but add cold starts, duration limits, and a database connection per copy.
Containers keep connections warm and handle WebSockets, but someone must
size them. A VM is the cheapest per CPU but a single one is a single
point of failure, and its patching is yours. Platforms remove most of
that work and charge for it.

Getting this wrong is common in both directions: steady APIs paying
per-request prices ten times higher than a small cluster would cost, and
small teams running Kubernetes for a service that two platform instances
would serve. The aim of this lesson is to make the trade-offs concrete,
with numbers.

## Real-world usage

- **Capital One (functions first, containers as the fallback).** The
  AWS case study
  [Capital One saves developer time and reduces costs by going serverless](https://aws.amazon.com/solutions/case-studies/capital-one-lambda-ecs-case-study)
  says the bank's "default strategy is to migrate its applications to
  serverless compute" on AWS Lambda to reduce the operational burden on
  engineering teams, and that "for use cases when AWS Lambda cannot be
  used" it runs containers on Amazon ECS with AWS Fargate. One migrated
  application "achieved 90 percent cost savings".
- **LAAM (serverless containers instead of a cluster).** In
  [LAAM's Google Cloud case study](https://cloud.google.com/customers/laam),
  the commerce platform hosts roughly 135 stateless microservices on
  Cloud Run, which "eliminated the need to operate a complex Kubernetes
  control plane" and "scales down to zero". Its CTO explains the choice:
  "we had a tiny team and zero time to operate infrastructure".
- **37signals (owned servers for steady load).** The
  [cloud exit savings post](https://world.hey.com/dhh/our-cloud-exit-savings-will-now-top-ten-million-over-five-years-c7d9b5bd)
  reports moving seven applications, including HEY, from the cloud onto
  about $700,000 of their own hardware, cutting the cloud bill from a
  $3.2 million per year run rate to $1.3 million: the economics of a
  large, predictable workload with an experienced operations team.
- **AWS Lambda at scale.** The
  [Firecracker project page](https://firecracker-microvm.github.io/)
  describes the open-source microVM technology that isolates Lambda
  workloads and powers "15 trillion+ monthly Lambda function
  invocations", which is why a Lambda environment boots fast enough to
  create on demand.

**Popular tools and providers:** Amazon EC2, ECS, Fargate, EKS, and
Lambda; Google Compute Engine, Cloud Run, and GKE; Azure Virtual
Machines, App Service, Container Apps, AKS, and Functions; Cloudflare
Workers; Vercel; Heroku; Render; Railway; Fly.io; DigitalOcean; Hetzner;
and Akamai Cloud (Linode).

## How it works

### Four ways to run a server process

![Diagram: three compute models side by side. A virtual machine stacks hardware, a hypervisor, a full guest OS that you patch, the Node runtime, and TaskFlow API, scales by adding VMs behind a load balancer, starts in tens of seconds to minutes, and bills per hour while running. A container on a node or on Fargate stacks hardware, a host OS, a container runtime, and the TaskFlow image with Node inside, scales by adding tasks or pods, starts in seconds, and bills per node or per vCPU- and GB-second. A function runs each execution environment in a Firecracker microVM with a managed Node runtime and your handler, handles one request at a time per environment, scales by creating environments with a cold start, and bills per request and GB-second.](compute-models-under-the-hood.svg)

| Model | Unit that scales | Typical start time | Holds connections between requests | Billed while idle |
|---|---|---|---|---|
| Virtual machine | A VM | Tens of seconds to minutes | Yes | Yes |
| Platform (PaaS) | An instance (dyno, service instance, Machine) | Seconds | Yes | Usually yes (some sleep or scale to zero) |
| Container service | A task or pod | Seconds | Yes | Yes, unless it scales to zero |
| Function | An execution environment | Milliseconds to seconds (cold start) | Only while the environment stays warm | No |

### Virtual machines

You rent a VM and run TaskFlow API on it with systemd or PM2 behind nginx
(see [deploying backend services](../deployment-strategies/deploying-backend-services.md)).
The products differ mainly in price, included bandwidth, and what else
the provider offers around the VM.

- **Amazon EC2:** AWS's general VM service with hundreds of instance
  types, billed per second (60-second minimum). Disks (EBS), public IPv4
  addresses, and data transfer are billed separately. Graviton (Arm)
  instances such as `t4g` cost less than comparable x86 ones.
- **Amazon Lightsail:** simple VM bundles with a fixed monthly price that
  includes an SSD, a public IPv4 address, and a data transfer allowance;
  overage is billed per GB. Good for small, predictable servers that do
  not need the rest of AWS.
- **Azure Virtual Machines and Google Compute Engine:** the equivalents
  on Azure and Google Cloud. Google's free tier includes one `e2-micro`
  VM a month in us-west1, us-central1, or us-east1
  ([free tier](https://cloud.google.com/free/docs/free-cloud-features)).
- **DigitalOcean Droplets:** VMs with simple monthly prices and generous
  included transfer.
- **Hetzner Cloud:** a German provider with data centers in Germany,
  Finland, the US (Ashburn and Hillsboro), and Singapore, known for low
  prices and large traffic allowances. Prices are in euros, and some
  plans show as unavailable in some locations when capacity is short.
- **Akamai Cloud (formerly Linode):** VMs with included transfer and a
  low overage rate.

!!! note "Prices checked November 2026"
    Prices in this lesson are US-region list prices in USD (AWS
    us-east-1, Google Cloud us-central1, Azure East US) from the linked
    official pricing pages in November 2026, except Hetzner, which is
    priced in euros. They change often; re-check with the provider's
    pricing page or calculator before deciding. Other regions such as
    India are priced differently: pick the region in the calculator or
    on the pricing page.

| Provider and size | Monthly price | Included outbound transfer | Source |
|---|---|---|---|
| EC2 `t4g.small` (2 vCPU, 2 GiB, Arm) | $0.0168/hour = $12.26, plus disk ($0.08 per GB-month gp3) and IPv4 ($3.65) | 100 GB/month free across the account, then $0.09/GB | [EC2](https://aws.amazon.com/ec2/pricing/on-demand/) |
| Lightsail 2 GB (2 vCPU, 60 GB SSD) | $12, IPv4 included | 3 TB | [Lightsail](https://aws.amazon.com/lightsail/pricing/) |
| Azure `B1ms` (1 vCPU, 2 GiB), Linux | $0.0207/hour = about $15.11 | Billed separately | [Azure VMs](https://azure.microsoft.com/en-us/pricing/details/virtual-machines/linux/) |
| DigitalOcean Droplet 2 GiB (1 vCPU, 50 GiB) | $12 | 2,000 GiB | [DigitalOcean](https://www.digitalocean.com/pricing/droplets) |
| Akamai Linode 2 GB (1 CPU, 50 GB) | $12 | 2 TB, then $0.005/GB | [Akamai](https://www.akamai.com/cloud/pricing/cpu) |
| Hetzner Cloud `CPX02` (1 vCPU, 1 GB), Regular Performance | from €5.49 excluding VAT in EU locations; prices vary by location | at least 20 TB in EU locations, 1 TB in US locations | [Hetzner](https://www.hetzner.com/cloud/regular-performance) |
| Google Compute Engine `e2-micro` | free tier: one VM per month in three US regions | 1 GB from North America | [Google Cloud free tier](https://cloud.google.com/free/docs/free-cloud-features) |

### Platforms (PaaS)

- **AWS Elastic Beanstalk:** creates EC2 instances, an Auto Scaling
  group, and a load balancer in your account from your code, and manages
  deployments and platform updates. "There is no additional charge for
  AWS Elastic Beanstalk": you pay for the resources it creates
  ([pricing](https://aws.amazon.com/elasticbeanstalk/pricing/)).
- **Heroku:** the original git-push platform. Apps run in containers
  called dynos: Eco $5 a month (sleeps after 30 minutes of inactivity),
  Basic $7, Standard-1X $25, and Standard-2X $50
  ([pricing](https://www.heroku.com/pricing/)). Free dynos ended on
  November 28, 2022, and in February 2026 Heroku moved to a
  [sustaining engineering model](https://www.heroku.com/blog/an-update-on-heroku/):
  existing customers continue unchanged, but new feature work is not the
  focus and Enterprise contracts are not offered to new customers. The
  router ends any request that takes longer than 30 seconds
  ([request timeout](https://devcenter.heroku.com/articles/request-timeout)).
- **Render:** web services, workers, cron jobs, and managed databases
  from git or an image. Workspace plans are Hobby ($0), Pro ($25 a month),
  and Scale ($499 a month) plus compute; a 512 MB, 0.5 CPU instance is
  $7 a month and 2 GB with 1 CPU is $25. Free web services spin down
  after 15 minutes without traffic and take about a minute to start again
  ([free tier](https://render.com/docs/free)).
- **Railway:** bills actual CPU and memory use per second: $0.00000772
  per vCPU-second (about $20 per vCPU-month) and $0.00000386 per
  GB-second (about $10 per GB-month), with egress at $0.05 per GB. Hobby
  has a $5 monthly minimum that includes $5 of usage; Pro has a $20
  minimum ([pricing](https://railway.com/pricing)).
- **Fly.io:** runs your container image as Fly Machines, lightweight VMs
  that start quickly, in the regions you choose, with private networking
  between them. A shared-cpu-1x Machine costs $2.19 a month with 256 MB
  and $3.69 with 512 MB; outbound data is $0.02 per GB in North America
  and Europe ([pricing](https://fly.io/docs/about/pricing/)). Fly.io
  states that it signs BAAs for healthcare apps.
- **Azure App Service:** Microsoft's PaaS for web apps and APIs. The
  Linux Basic B1 plan is $0.017 per hour (about $12.41 a month) in East
  US, and a Free F1 tier exists for testing
  ([pricing](https://azure.microsoft.com/en-us/pricing/details/app-service/linux/)).
- **Google App Engine:** Google's original PaaS. In the standard
  environment, the first 28 F1 instance-hours per day are free and then
  $0.05 per hour ([pricing](https://cloud.google.com/appengine/pricing)).
- **DigitalOcean App Platform:** containers from git or a registry,
  from $5 a month (512 MiB, limited to one instance) and $12 a month for
  a 1 GiB instance size you can run several copies of, with outbound
  transfer beyond the allowance at $0.02 per GiB
  ([pricing](https://www.digitalocean.com/pricing/app-platform)).
- **AWS App Runner (closed to new customers):** AWS
  [closed App Runner to new customers](https://docs.aws.amazon.com/apprunner/latest/dg/apprunner-availability-change.html);
  existing customers can keep using it. AWS recommends **Amazon ECS
  Express Mode**, which, from one API call with an image and two IAM
  roles, creates an ECS service on Fargate, an Application Load
  Balancer, autoscaling, and networking in your account, at no charge
  beyond those resources.

### Containers

- **Amazon ECS:** AWS's own container orchestrator. You define a task
  (image, CPU, memory, ports) and a service (how many copies, which load
  balancer). Tasks run either on **EC2 instances** you manage in an
  Auto Scaling group (cheaper at steady load, more work) or on
  **AWS Fargate**, which runs each task in its own isolated environment
  and bills $0.04048 per vCPU-hour and $0.004445 per GB-hour (Arm:
  $0.03238 and $0.00356), per second with a one-minute minimum
  ([Fargate pricing](https://aws.amazon.com/fargate/pricing/)).
- **Amazon EKS, Google Kubernetes Engine, Azure Kubernetes Service:**
  managed Kubernetes control planes. EKS and GKE charge $0.10 per
  cluster-hour (about $73 a month); GKE's free tier gives $74.40 of
  monthly credit, enough for one zonal or Autopilot cluster
  ([GKE pricing](https://cloud.google.com/kubernetes-engine/pricing)).
  AKS has a free tier with no management fee and a Standard tier at
  $0.10 per cluster-hour with an uptime SLA
  ([AKS pricing](https://azure.microsoft.com/en-us/pricing/details/kubernetes-service/)). Worker nodes, or Autopilot
  and Fargate pods, are billed on top. See the
  [Kubernetes subject](../kubernetes.md).
- **Google Cloud Run:** runs a container image as an autoscaled HTTPS
  service that can scale to zero. Each instance can serve many requests
  at once (the *concurrency* setting). With request-based billing you
  pay $0.000024 per vCPU-second and $0.0000025 per GiB-second only while
  an instance is starting, serving requests, or shutting down, plus $0.40
  per million requests; the first 180,000 vCPU-seconds, 360,000
  GiB-seconds, and 2 million requests each month are free. Billable time
  is rounded up to 100 ms ([pricing](https://cloud.google.com/run/pricing)).
- **Azure Container Apps:** a serverless container service built on
  Kubernetes, with scale to zero, revisions, and Dapr integration. The
  consumption plan bills $0.000024 per active vCPU-second, $0.000003 per
  GiB-second, and $0.40 per million requests, with the same monthly free
  amounts as Cloud Run per subscription
  ([pricing](https://azure.microsoft.com/en-us/pricing/details/container-apps/)).

### Functions

- **AWS Lambda:** the classic function service. Each execution
  environment is a Firecracker microVM that handles one request at a
  time; Lambda creates more environments as concurrent requests grow.
  Pricing is $0.20 per million requests and $0.0000166667 per GB-second
  on x86 ($0.0000133334 on Arm), with 1 million requests and 400,000
  GB-seconds free each month; one invocation can run for up to 15
  minutes ([pricing](https://aws.amazon.com/lambda/pricing/),
  [quotas](https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-limits.html)).
  An HTTP endpoint comes from a function URL, which has no extra charge,
  or from API Gateway, whose HTTP APIs cost $1.00 per million requests
  ([API Gateway pricing](https://aws.amazon.com/api-gateway/pricing/)).
  Two newer options change the model: **Lambda Managed Instances**
  (announced November 2025) run functions on EC2 instances in your VPC
  for a management fee on top of the EC2 price, and **Lambda Web
  Functions** (announced
  [October 2026](https://aws.amazon.com/about-aws/whats-new/2026/10/aws-lambda-web-functions/))
  let an Express or Hono app listen on a port, serve multiple concurrent
  requests per environment, and pay for active CPU time rather than
  time spent waiting on the database.
- **Azure Functions:** Microsoft's functions service. The Flex
  Consumption plan is the recommended serverless plan; the Linux
  Consumption plan stops being available on September 30, 2028
  ([Microsoft Learn](https://learn.microsoft.com/en-us/azure/azure-functions/consumption-plan)).
  Flex Consumption on-demand bills $0.000026 per GB-second after 100,000
  free GB-seconds and $0.40 per million executions after 250,000 free
  ([Functions pricing](https://azure.microsoft.com/en-us/pricing/details/functions/)).
- **Cloud Run functions:** Google renamed Cloud Functions (2nd gen) to
  [Cloud Run functions](https://cloud.google.com/blog/products/serverless/google-cloud-functions-is-now-cloud-run-functions);
  they are deployed and billed as Cloud Run services, so the Cloud Run
  prices above apply.
- **Cloudflare Workers:** functions in V8 isolates at every Cloudflare
  location. The free plan allows 100,000 requests a day with 10 ms of
  CPU per request; the paid plan has a $5 monthly minimum with 10 million
  requests and 30 million CPU milliseconds included, then $0.30 per
  million requests and $0.02 per million CPU milliseconds, with no
  charge for egress. HTTP requests have no wall-clock limit, and CPU time
  per request can be raised to 5 minutes
  ([limits](https://developers.cloudflare.com/workers/platform/limits/)).
  Workers are not a full Node.js server, so database drivers that need
  raw TCP need adapting.
- **Vercel Functions:** server code deployed with a Vercel project,
  billed by active CPU time (from $0.128 per hour), provisioned memory
  (from $0.0106 per GB-hour), and invocations ($0.60 per million). Hobby
  functions run up to 300 seconds; Pro can configure up to 800 seconds
  ([Hobby plan](https://vercel.com/docs/plans/hobby)).

### WebSockets, long requests, and background work

Real APIs are not only short request-response calls. TaskFlow pushes
task updates over WebSockets and generates CSV exports that take
minutes. These needs rule options in or out:

| Platform | Longest request or invocation | WebSockets | Long background work |
|---|---|---|---|
| VM, ECS, Kubernetes | No platform limit (load balancer idle timeouts apply; ALB defaults to 60 seconds idle) | Yes | Any worker process |
| Cloud Run | Request timeout up to 60 minutes, default 5 | Yes, but each connection is a request bound by the timeout, so clients must reconnect ([docs](https://cloud.google.com/run/docs/triggering/websockets)) | Cloud Run jobs |
| Heroku | 30 seconds to start responding | Yes | Worker dynos |
| AWS Lambda | 15 minutes | Through API Gateway WebSocket APIs, which hold the connection and invoke the function per message | Asynchronous invokes, SQS, Step Functions |
| Cloudflare Workers | No wall-clock limit for HTTP; CPU limit up to 5 minutes | Yes, with Durable Objects to coordinate | Queues, Cron Triggers |
| Vercel Functions | 300 seconds on Hobby, configurable to 800 on Pro | Not as a long-lived server | Separate background services |

### Cold starts

A cold start is the time to create a new instance before it can serve a
request: on Lambda, creating the microVM, starting the runtime, loading
your code, and running everything at module scope (such as connecting to
MongoDB). Later requests reuse the warm environment and skip all of it.

![Diagram: a Lambda request sequence. First request: the client calls the function URL, Lambda finds no free execution environment, creates a Firecracker microVM, downloads the code, and runs the INIT phase, which starts the Node runtime and runs module-scope code including connecting to MongoDB, then runs the handler, which queries the database, and returns the response; the INIT phase is the cold start. A later request finds the warm environment, skips INIT, runs only the handler, and returns. If two requests arrive at the same moment, the second one needs another environment and pays its own cold start.](lambda-cold-start-sequence.svg)

Ways to reduce cold starts, by platform:

- **Lambda:** keep the package small, initialize lazily, and use
  Provisioned Concurrency to keep a set number of environments
  initialized (billed while configured).
- **Cloud Run:** set `--min-instances` to keep instances warm (billed at
  the idle rate) and enable startup CPU boost.
- **Azure Functions Flex Consumption:** configure always-ready instances.
- **Cloudflare Workers:** isolates start in milliseconds, so cold starts
  are rarely noticeable.
- **Any platform:** a slow-starting framework or a large dependency tree
  is often the biggest part of the delay.

### Options compared

| Option | What it is | You manage | Scaling | Pricing model | Free tier | Strengths | Weaknesses | Lock-in |
|---|---|---|---|---|---|---|---|---|
| EC2, Azure VMs, Compute Engine | Hyperscaler VMs | OS, runtime, proxy, scaling | Add VMs + load balancer | Per second or hour + disk, IPv4, egress | Limited (e2-micro, credits) | Full control, discounts | Ops work, single VM is a SPOF | Low |
| Lightsail, Droplets, Linode, Hetzner | Bundled budget VMs | Same as VMs | Manual | Flat monthly with transfer | Rare | Cheapest per vCPU, bandwidth included | Fewer managed services | Low |
| Heroku, Render, Railway, Fly.io, App Service, App Engine, App Platform | PaaS | Code and config | Instance count or autoscale | Per instance or per second | Some (sleeping) | Fast, little ops | Price per CPU, platform limits, roadmap risk | Low to medium |
| ECS on EC2 / Fargate | AWS container orchestrator | Task and service definitions (and EC2 hosts) | Service autoscaling | EC2 hours or Fargate vCPU/GB-hours | None | Deep AWS integration | AWS networking to learn | Medium |
| EKS, GKE, AKS | Managed Kubernetes | Manifests, nodes, add-ons | HPA, cluster autoscaler | Cluster fee + nodes | GKE credit, AKS free tier | Portable, powerful | Complexity, needs an owner | Low to medium |
| Cloud Run, Container Apps | Serverless containers | Image and limits | Per request, to zero | vCPU-s, GiB-s, requests | Monthly free amounts | Containers without a cluster | Request timeouts, cold starts | Low (it is a container) |
| Lambda, Azure Functions, Cloud Run functions | Functions | Handler code | Per request | Requests + GB-s | Monthly free amounts | Zero idle cost, fast scaling | Cold starts, limits, connections | Medium to high |
| Cloudflare Workers, Vercel Functions | Edge or platform functions | Handler code | Global, automatic | Requests + CPU | Yes | Global, fast start | Runtime differences, limits | Medium to high |

### What TaskFlow API costs on each

The scenario: 2 million requests a month, 120 ms average duration,
512 MB of memory, in a US region. The arithmetic (free tiers ignored
unless stated):

```text
Lambda (x86, 512 MB, function URL)
  requests  2,000,000 x $0.20 / 1M                       = $0.40
  compute   2,000,000 x 0.12 s x 0.5 GB = 120,000 GB-s
            120,000 x $0.0000166667                      = $2.00
  total                                                  = $2.40
  with the free tier (1M requests, 400,000 GB-s free)    = $0.20
  with API Gateway HTTP API: + 2,000,000 x $1.00 / 1M    = $4.40

Cloud Run (1 vCPU, 512 MiB, request-based, worst case: no request overlap)
  billable time rounds up to 100 ms, so each 120 ms request bills 0.2 s
  CPU       2,000,000 x 0.2 s = 400,000 vCPU-s x $0.000024      = $9.60
  memory    400,000 s x 0.5 GiB = 200,000 GiB-s x $0.0000025    = $0.50
  requests  2 x $0.40                                           = $0.80
  total                                                         = $10.90
  after the free tier: (400,000 - 180,000) vCPU-s x $0.000024   = $5.28

Two Fargate tasks (0.5 vCPU, 1 GB) + Application Load Balancer
  tasks     2 x (0.5 x $0.04048 + 1 x $0.004445) x 730           = $36.04
  ALB       730 x $0.0225 + 730 x 1 LCU x $0.008                 = $22.27
  total                                                         = $58.31 (+ public IPv4 addresses)

One small VM: EC2 t4g.small + 20 GB gp3 + public IPv4
  730 x $0.0168 + 20 x $0.08 + 730 x $0.005                     = $17.51 (no redundancy)
```

| Option | TaskFlow API, 2M requests a month | Notes |
|---|---|---|
| Lambda + function URL | $0.20 (with free tier), $2.40 (without) | Scales to zero; cold starts; a connection pool per environment |
| Cloud Run | $5.28 (with free tier), $10.90 (without) | Worst case; less when requests overlap on one instance |
| Railway | $5 Hobby minimum (about $4 of usage at 0.05 vCPU and 0.3 GB average) | Bills actual use, not allocation |
| Fly.io, two shared-cpu-1x 512 MB Machines | $7.38 | Plus $0.02 per GB egress in North America |
| Render, one 512 MB instance | $7 (Hobby workspace) | Two instances for redundancy: $14 |
| Lightsail or DigitalOcean 2 GB VM | $12 | Transfer included; patching is yours |
| Azure App Service B1 (Linux) | about $12.41 | One instance |
| One EC2 `t4g.small` | $17.51 | No redundancy |
| Two Fargate tasks + ALB | $58.31 | Redundant across zones; the cost floor of an always-on HA setup |

Azure Container Apps is missing from the table on purpose: it bills a
running replica per second at an active rate ($0.000024 per vCPU-second)
while it processes requests and at a lower idle rate ($0.000003 per
vCPU-second and per GiB-second) otherwise, and with steady traffic a
replica rarely scales to zero. Its cost depends on how much of the month
the replica counts as active or idle, so estimate it with the Azure
calculator rather than assuming the free grant covers it.

At this traffic every option is cheap, so choose for operations and
constraints. The picture changes as traffic grows, because functions
and request-billed containers cost a fixed amount per request while
always-on instances cost the same until they run out of capacity:

```text
Lambda cost per request (no free tier):
  $0.20 / 1M + 0.12 s x 0.5 GB x $0.0000166667 = $0.0000002 + $0.000001 = $0.0000012
  = $1.20 per million requests

Crossover with one t4g.small VM ($17.51):        17.51 / 1.20 = 14.6 million requests a month
Crossover with two Fargate tasks + ALB ($58.31): 58.31 / 1.20 = 48.6 million requests a month
```

![Diagram: a line chart of monthly cost against requests per month, from zero to 100 million. Lambda rises in a straight line at $1.20 per million requests, Lambda behind an API Gateway HTTP API rises at $2.20 per million, and Cloud Run in the worst case, with no overlapping requests and each 120 ms request billed as 200 ms, rises at about $5.45 per million. One small EC2 VM is flat at $17.51 and two Fargate tasks with a load balancer are flat at $58.31. Lambda crosses the VM line at about 14.6 million requests and the Fargate line at about 48.6 million requests; above those points the always-on options are cheaper, until they need more instances.](taskflow-api-cost-crossover.svg)

Two cautions. The flat lines are flat only until the instances are
full; then you add instances and the line steps up. And the function
line ignores the people cost: below the crossover, functions are often
cheaper in total because nobody sizes or patches anything.

### Reserved capacity, Savings Plans, and spot

Always-on compute can be bought for less if you commit:

- **AWS Savings Plans:** Compute Savings Plans reduce EC2, Fargate, and
  Lambda prices by up to 66% for a one- or three-year commitment to a
  dollar amount per hour; EC2 Instance Savings Plans reach up to 72% for
  a specific instance family and region
  ([Savings Plans pricing](https://aws.amazon.com/savingsplans/compute-pricing/));
  the [Fargate pricing page](https://aws.amazon.com/fargate/pricing/)
  states up to 50% for Fargate usage.
- **Spot instances:** spare EC2 capacity "at a discount of up to 90% off
  compared to On-Demand pricing"
  ([Spot pricing](https://aws.amazon.com/ec2/spot/pricing/)), which AWS
  can reclaim with short notice. Good for stateless workers, CI runners,
  and batch jobs; risky for the only copy of an API.
- **Google Cloud and Azure:** committed use discounts (Cloud Run's
  pricing page lists 1- and 3-year rates) and Azure reservations and
  savings plans work the same way.

Commit only to the baseline you are confident you will use for the whole
term; keep the spiky part on demand. The
[cost optimization lesson](cost-optimization-and-cloud-bills.md) shows
how to size a commitment from past usage.

## When to use and when not to use

Use functions when work is event-driven, spiky, or mostly idle, and when
each request is short and independent. Use serverless containers or a
platform when you want a normal Express server without managing
machines. Use containers on a cluster or VMs when traffic is steady and
large, when you need long-lived connections or long jobs, or when you
have people who can operate them.

Avoid functions for chatty WebSocket services, multi-minute jobs, or
APIs at steady high traffic. Avoid Kubernetes without a team that owns
it. Avoid a single VM for anything that must stay up during a hardware
failure or a reboot.

### Which to choose

| Situation | Pick | Runner-up | Why |
|---|---|---|---|
| Side project or portfolio | Cloud Run or Azure Container Apps (scale to zero, free grants) | Render free (sleeps) or a small VPS (DigitalOcean from $4, Hetzner from €5.49) | No cost while idle; a VM teaches operations but bills every hour |
| Early startup | Render, Railway, or Fly.io; or Cloud Run | ECS Express Mode on AWS | A normal Express server, git-push deploys, no infrastructure hire |
| Steady high traffic | ECS or EKS on EC2 (or GKE) with Savings Plans or committed use discounts | Budget VMs (Hetzner, DigitalOcean) behind a load balancer, or owned hardware at very large scale | Past the crossover, per-request pricing costs more; commitments cut 50 to 72% |
| Spiky traffic | Lambda or Cloud Run with a small warm minimum | Containers with aggressive autoscaling | Pay for bursts only; watch database connection counts |
| Global audience | Cloud Run or Fly.io in two or three regions, edge caching for public reads | Cloudflare Workers for light logic near users | Latency follows distance, but data has a home; replicate reads, not writes |
| Compliance-heavy (healthcare) | ECS, Lambda, or EC2 on AWS under its BAA; Cloud Run or Azure equivalents under their BAAs | Fly.io (signs BAAs) or Render's HIPAA workspaces on the Scale plan | Contract, audit logging, encryption, and private networking are all available |
| Large files or heavy egress | Budget VMs with large included transfer (Hetzner, Linode, DigitalOcean) or Lightsail; serve files from object storage and a CDN | Fly.io at $0.02 per GB | Stream files from storage, not through the API; see [object and file storage](object-and-file-storage.md) |
| Team with no ops people | Render, Railway, Heroku, or Cloud Run | ECS Express Mode | Patching, scaling, TLS, and logs are handled for you |

![Diagram: a decision tree for backend hosting. If the API needs long-lived connections or jobs longer than 15 minutes, use containers or VMs, noting that Cloud Run allows requests up to 60 minutes. Otherwise, if traffic is event-driven or idle most of the time, use functions such as Lambda, Azure Functions Flex Consumption, or Cloud Run functions. Otherwise, if no one runs infrastructure, use a platform or serverless containers such as Render, Railway, Fly.io, Cloud Run, or ECS Express Mode. Otherwise, if there are many services and a platform team, use Kubernetes on EKS, GKE, or AKS. Otherwise, if load is large, steady, and cost-sensitive, use VMs or ECS on EC2 with Savings Plans, or budget VMs. The default is serverless containers on Cloud Run, Fargate, or Container Apps.](backend-hosting-decision.svg)

## Practical examples

### TaskFlow API on Lambda with connection reuse

Code at module scope runs once per execution environment, during INIT.
Creating the MongoDB client there lets warm invocations reuse it:

```js
// src/lambda.mjs: GET /tasks/:id as a Lambda handler behind a function URL
import { MongoClient, ObjectId } from "mongodb";

// Runs once per execution environment (the cold start); reused while warm.
const client = new MongoClient(process.env.MONGODB_URI, {
  maxPoolSize: 2, // one request at a time per environment, so keep the pool tiny
  serverSelectionTimeoutMS: 5000,
});
const connected = client.connect();

export const handler = async (event) => {
  // Function URLs send the HTTP API payload format 2.0
  const method = event.requestContext?.http?.method;
  const match = /^\/tasks\/([a-f0-9]{24})$/.exec(event.rawPath ?? "");
  if (method !== "GET" || !match) {
    return { statusCode: 404, body: JSON.stringify({ error: "not found" }) };
  }

  await connected;
  const task = await client
    .db("taskflow")
    .collection("tasks")
    .findOne({ _id: new ObjectId(match[1]) });

  if (!task) {
    return { statusCode: 404, body: JSON.stringify({ error: "task not found" }) };
  }
  return {
    statusCode: 200,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(task),
  };
};
```

The catch is multiplication: 500 concurrent environments each hold up to
two connections, so the database sees up to 1,000 connections during a
burst. Cap the function's reserved concurrency, size the pool per
environment, and check the connection limit of the database tier (see
[managed databases](managed-databases.md)).

### TaskFlow API on Cloud Run with a warm instance

```bash
# One warm instance, 80 concurrent requests per instance, faster cold starts
gcloud run deploy taskflow-api \
  --image=us-docker.pkg.dev/example-project/apps/taskflow-api:1.4.0 \
  --region=us-central1 \
  --port=3000 \
  --cpu=1 --memory=512Mi \
  --concurrency=80 \
  --min-instances=1 --max-instances=20 \
  --cpu-boost \
  --timeout=300 \
  --set-secrets=MONGODB_URI=taskflow-mongodb-uri:latest \
  --allow-unauthenticated
```

- `--concurrency=80` lets one instance serve many requests while they
  wait on MongoDB, which is what Node.js is good at; the bill is per
  instance-second, so overlapping requests share it.
- `--min-instances=1` removes cold starts for normal traffic. With
  request-based billing an idle minimum instance is billed at the idle
  rate: 730 hours x 3,600 s x ($0.0000025 for 1 vCPU + 0.5 GiB x
  $0.0000025) = about $9.86 a month.
- `--cpu-boost` gives extra CPU during startup to shorten cold starts.
- `--timeout=300` caps request duration at 5 minutes; long exports
  belong in a Cloud Run job or a queue worker.

### TaskFlow API on Azure Container Apps

```bash
# Create a scale-to-zero container app with external HTTPS ingress
az containerapp create \
  --name taskflow-api \
  --resource-group rg-taskflow \
  --environment taskflow-env \
  --image ghcr.io/example/taskflow-api:1.4.0 \
  --target-port 3000 \
  --ingress external \
  --cpu 0.5 --memory 1.0Gi \
  --min-replicas 0 --max-replicas 5 \
  --secrets mongodb-uri=<connection-string> \
  --env-vars MONGODB_URI=secretref:mongodb-uri
```

The secret is stored on the app and injected through `secretref:`, so
the connection string never appears in the environment variable
definition. Set `--min-replicas 1` when cold starts matter more than the
idle cost.

### A capacity check before trusting a flat line

Fixed-price options are cheaper past the crossover only if they can
carry the load. A rough check for TaskFlow API on two Fargate tasks:

```text
Measured in a load test: 20 ms of CPU per request (the rest is waiting on MongoDB)
One task has 0.5 vCPU = 500 ms of CPU per second
Max per task at 100% CPU:      500 / 20      = 25 requests per second
Target 60% CPU for headroom:   25 x 0.6      = 15 requests per second per task
Two tasks:                                     30 requests per second
Per month:  30 x 3,600 x 730                 = about 78.8 million requests
Peak-to-average ratio of 3:  78.8M / 3       = about 26 million requests a month
```

So two tasks handle TaskFlow up to roughly 26 million requests a month
with a 3x daily peak. The Lambda crossover at 48.6 million is past that
point, which means a third or fourth task (and its cost) belongs in the
comparison. Always compare at the capacity you would actually run.

## Best practices

- Start from constraints (connections, durations, compliance), then
  team skills, then cost.
- Keep the app a normal HTTP server in a container image; it then runs
  on VMs, platforms, Cloud Run, Fargate, and, with Lambda Web Functions,
  even on Lambda without rewriting.
- Price at the capacity you would really run, including redundancy and
  peak headroom, not at one instance.
- Put database connection pooling in front of function-based APIs, or
  cap concurrency, before the first traffic spike.
- Keep a warm minimum for user-facing APIs on scale-to-zero platforms.
- Commit (Savings Plans, committed use discounts) only to the steady
  baseline you are sure of.
- Watch provider announcements for the products you run on, and keep
  deployment definitions in code so a forced move is routine.

## In production

- **p99 latency spikes after quiet periods.**
  *Detect:* traces show an INIT or startup span on slow requests; Lambda
  reports `Init Duration` in its `REPORT` log line. *Cause:* cold starts
  on a scale-to-zero or function platform. *Fix:* set a minimum of warm
  instances or Provisioned Concurrency, trim dependencies, and defer
  heavy initialization.
- **The database runs out of connections during a traffic spike.**
  *Detect:* database errors such as "too many connections" while
  function concurrency climbs. *Cause:* every new execution environment
  opens its own pool. *Fix:* cap reserved concurrency, shrink the pool to
  one or two per environment, and use a pooler (RDS Proxy, PgBouncer) or
  a data API designed for serverless clients.
- **WebSocket clients disconnect every few minutes.**
  *Detect:* reconnect storms at regular intervals in client logs.
  *Cause:* a platform request timeout (Cloud Run's configured timeout) or
  a load balancer idle timeout. *Fix:* raise the timeout to the
  platform's maximum, send heartbeats, make clients reconnect with
  backoff, or move the WebSocket service to containers or VMs without a
  request limit.
- **Requests fail with H12 errors on Heroku.**
  *Detect:* `H12` in the router logs. *Cause:* the request did not start
  responding within 30 seconds. *Fix:* move slow work to a worker dyno
  and a queue, and return `202 Accepted` with a status URL.
- **The serverless bill grows faster than traffic.**
  *Detect:* cost per million requests rising month over month. *Cause:*
  longer durations (slower queries, more memory), retries, or polling
  clients. *Fix:* profile the handler, fix slow queries, cache reads, and
  re-run the crossover math; past it, move the steady part to containers.
- **A single VM's reboot takes the API down.**
  *Detect:* the uptime monitor shows downtime matching a host maintenance
  event. *Cause:* no redundancy. *Fix:* run two instances in different
  zones behind a load balancer, or move to a managed platform that
  replaces instances for you.

## Important terminology

- **Execution environment:** the isolated sandbox (on Lambda, a
  Firecracker microVM) in which a function runs.
- **Cold start:** the extra latency when a new instance or environment
  must be created and initialized.
- **Concurrency (Cloud Run):** how many requests one instance may serve
  at the same time.
- **Provisioned Concurrency:** Lambda environments kept initialized
  ahead of demand, billed while configured.
- **Dyno:** Heroku's name for a container running your app.
- **Task (ECS) and pod (Kubernetes):** the unit of one or more containers
  that the orchestrator schedules.
- **Fargate:** AWS's serverless container compute for ECS and EKS.
- **Function URL:** a built-in HTTPS endpoint for a Lambda function.
- **Crossover point:** the traffic level at which two pricing models
  cost the same.
- **Savings Plan / committed use discount:** a lower price in exchange
  for a one- or three-year commitment.
- **Spot capacity:** spare capacity sold at a discount that the provider
  can reclaim.

## Common mistakes and misconceptions

- Assuming functions are always cheapest; past the crossover they are
  not.
- Comparing one VM to a multi-zone function service as if both were
  equally available.
- Ignoring the 30-second, 5-minute, or 15-minute limits until a slow
  export fails in production.
- Opening a large connection pool in every function environment.
- Running Kubernetes for one or two services without anyone to upgrade
  it.
- Building on a free plan that sleeps and treating the wake-up delay as
  an application bug.
- Starting new projects on a product that is closed to new customers
  (App Runner) instead of its named replacement.

## Revision questions

1. Explain what happens during a Lambda cold start and which code runs
   only once per environment.
2. Why can Cloud Run serve the same traffic more cheaply with a higher
   concurrency setting?
3. Calculate the monthly Lambda cost for 10 million requests at 200 ms
   and 1 GB without the free tier. (Answer: requests 10 x $0.20 = $2.00;
   compute 10,000,000 x 0.2 x 1 = 2,000,000 GB-s x $0.0000166667 =
   $33.33; total $35.33.)
4. At what monthly request volume does that same function cost as much
   as two Fargate tasks with an ALB at $58.31? (Answer: cost per million
   = $3.53, so about 16.5 million requests.)
5. Which platforms on this page cannot hold a WebSocket open for an
   hour, and what are the workarounds?
6. What did AWS recommend to new customers instead of App Runner, and
   what does it create in your account?
7. When does a $12 VM beat every serverless option, and what risks come
   with it?
8. A team of two is building a healthcare scheduling API with steady
   daytime traffic. Which hosting would you pick and why?

## Further learning

- [AWS Lambda execution environment lifecycle](https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtime-environment.html)
- [Cloud Run: About instance autoscaling](https://cloud.google.com/run/docs/about-instance-autoscaling)
- [Amazon ECS Express Mode](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/express-service-getting-started.html)
- [Azure Container Apps overview](https://learn.microsoft.com/en-us/azure/container-apps/overview)
- [Heroku Dev Center: Request timeout](https://devcenter.heroku.com/articles/request-timeout)
- [AWS Pricing Calculator](https://calculator.aws/), [Google Cloud Pricing Calculator](https://cloud.google.com/products/calculator), [Azure Pricing Calculator](https://azure.microsoft.com/en-us/pricing/calculator/)
- Next: [managed databases](managed-databases.md). Back to the [hosting and cloud platforms overview](../hosting-and-platforms.md).
