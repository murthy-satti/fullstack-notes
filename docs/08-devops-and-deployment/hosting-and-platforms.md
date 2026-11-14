# Hosting and Cloud Platforms

Hosting is the decision about where your software runs and where its data
lives: on a virtual machine you manage, in containers on a managed
service, as functions that run per request, as static files on a CDN, or
on a developer platform that hides all of that behind `git push`. Every
option trades control for convenience and a predictable bill for one that
follows your traffic. This subject explains what each option is, what you
manage and what the provider manages, how each one bills, which well-known
companies use it and why, and how to pick one for a given situation.

## What hosting and cloud platforms provide

- **Compute:** virtual machines, containers, functions, and edge runtimes
  that run your code, from one small server to thousands of instances.
- **Managed data services:** relational and document databases, caches,
  queues, and object storage that someone else patches, backs up, and
  fails over.
- **Delivery:** load balancers, CDNs, TLS certificates, and DNS that put
  your application in front of users worldwide.
- **Elasticity:** capacity you can add in minutes and remove when traffic
  drops, so you pay for what you use instead of buying for the peak.
- **Compliance building blocks:** audited data centers, encryption, and
  contracts (such as a HIPAA Business Associate Agreement) that you could
  not easily build yourself.

Each of these also creates a bill with several meters (instance-hours,
requests, GB-seconds, GB stored, GB transferred), responsibilities you
keep (your code, your data, your access settings), and some degree of
lock-in to the provider's APIs.

## How a typical hosting decision works

1. **List the workloads.** For TaskFlow these are a React frontend
   (TaskFlow Web), a Node.js API (TaskFlow API), a MongoDB database,
   uploaded files, and a few background jobs.
2. **Pick a level of control for each.** Static files rarely need a
   server; an API can run on a platform, in containers, or as functions;
   a database is almost always better managed.
3. **Check the hard constraints:** long-lived WebSocket connections,
   request duration limits, data residency, compliance contracts, and
   the regions your users are in.
4. **Price it with real units** for your expected traffic, including the
   meters people forget: data transfer out, NAT gateways, load balancer
   hours, public IPv4 addresses, and log ingestion.
5. **Estimate the exit cost:** how much code and data would have to change
   to move, and what moving the data out would cost in egress fees.
6. **Start with the simplest option that meets the constraints,** write
   down the traffic or cost level at which you would revisit it, and
   measure.

![Diagram: compute options listed from most control to most convenience: virtual machines such as EC2, Droplets, Hetzner, and Linode, where you manage the OS, patches, runtime, and scaling and pay instance-hours; Kubernetes on EKS, GKE, or AKS, where you manage nodes, manifests, and upgrades and pay for nodes plus a cluster fee; serverless containers on Cloud Run, Fargate, or Azure Container Apps, where you supply an image and pay vCPU- and GB-seconds; platforms as a service such as Render, Heroku, App Service, and Fly.io, where you supply code and config and pay per instance plan; functions on Lambda, Azure Functions, or Cloud Run functions, where you write handlers and pay requests plus GB-seconds; edge functions on Cloudflare Workers or CloudFront Functions, billed by requests and CPU time; and static hosting on a CDN, billed by GB served and requests. Below, data storage runs from databases and block storage through file and object storage to archive storage, getting colder, slower to read, and cheaper per GB from left to right.](hosting-control-spectrum.svg)

## Practical example

The same TaskFlow API container image can run on several of these
options. On Google Cloud Run, one command deploys it as a serverless
container that scales to zero when idle:

```bash
# Deploy the TaskFlow API image to Cloud Run (request-based billing)
gcloud run deploy taskflow-api \
  --image=us-docker.pkg.dev/example-project/apps/taskflow-api:1.4.0 \
  --region=us-central1 \
  --port=3000 \
  --cpu=1 --memory=512Mi \
  --min-instances=0 --max-instances=10 \
  --set-secrets=MONGODB_URI=taskflow-mongodb-uri:latest \
  --allow-unauthenticated
```

What that costs at TaskFlow's launch traffic:

!!! note "Prices checked November 2026"
    The estimate below uses Google Cloud us-central1 list prices in USD
    from the [Cloud Run pricing page](https://cloud.google.com/run/pricing)
    in November 2026. Prices change often and differ by region; re-check
    them with the Google Cloud Pricing Calculator before deciding.

```text
TaskFlow API, 2 million requests a month, 120 ms each, 1 vCPU, 512 MiB
(us-central1 list prices, checked November 2026). Billable time is
rounded up to 100 ms, so an isolated 120 ms request is billed as 200 ms:

  billable time   2,000,000 x 0.2 s                = 400,000 instance-seconds
  CPU             400,000 vCPU-s - 180,000 free    = 220,000 x $0.000024 = $5.28
  memory          200,000 GiB-s, under the 360,000 GiB-s free tier      = $0.00
  requests        2,000,000, inside the 2 million free tier             = $0.00
  total                                                                 ~ $5.28 / month
```

Requests that overlap on one instance share billable time, so the real
figure is usually lower. The same image could run on AWS Fargate behind
a load balancer for a steady monthly price, or on a $12 virtual machine.
Which one is cheapest depends on traffic shape, and the
[backend servers lesson](hosting-and-platforms/running-backend-servers-and-apis.md)
works out where the lines cross.

## Hosting and cloud platforms topic map

**Choosing compute**

- [Choosing where to run software](hosting-and-platforms/choosing-where-to-run-software.md)
- [Hosting websites and frontends](hosting-and-platforms/hosting-websites-and-frontends.md)
- [Running backend servers and APIs](hosting-and-platforms/running-backend-servers-and-apis.md)

**Data and storage**

- [Managed databases](hosting-and-platforms/managed-databases.md)
- [Object and file storage](hosting-and-platforms/object-and-file-storage.md)
- [Video storage and streaming](hosting-and-platforms/video-storage-and-streaming.md)
- [Backup and archive storage](hosting-and-platforms/backup-and-archive-storage.md)

**Cost**

- [Cost optimization and cloud bills](hosting-and-platforms/cost-optimization-and-cloud-bills.md)

**Review**

- [Hosting and cloud platforms interview questions and answers](hosting-and-platforms/interview-questions-and-answers.md) · [cheat sheet](hosting-and-platforms/cheat-sheet.md)

## Developer perspective and common misconceptions

Choose per workload, not per company: static files on a CDN, the API on
whatever your team can operate well, and the database on a managed
service. Keep the application portable where it is cheap to do so (a
container image, standard SQL or the MongoDB wire protocol, environment
configuration), and accept lock-in deliberately where it buys real value.
Put a budget alert on every account on day one.

- "Serverless is always cheaper." It is cheapest at low or spiky
  traffic; at steady high traffic, per-request pricing usually costs more
  than instances that run all month.
- "The cloud is always more expensive than your own servers." For small
  teams, the operations work you avoid usually outweighs the price
  difference; the comparison changes only at large, steady scale.
- "The price on the pricing page is the bill." Data transfer, NAT
  gateways, load balancers, logs, and idle resources often add more than
  the compute itself.
- "A managed service means no operations." You still own schema
  design, capacity choices, access control, cost, and restore testing.
- "Free tiers are a hosting plan." Many free tiers sleep, expire, or
  forbid commercial use; read the limits before launching on one.

## Further learning

- [AWS Pricing Calculator](https://calculator.aws/)
- [Google Cloud Pricing Calculator](https://cloud.google.com/products/calculator)
- [Azure Pricing Calculator](https://azure.microsoft.com/en-us/pricing/calculator/)
- [AWS Well-Architected Framework: Cost Optimization Pillar](https://docs.aws.amazon.com/wellarchitected/latest/cost-optimization-pillar/welcome.html)
- [The Twelve-Factor App](https://12factor.net/) for applications that move easily between hosts
- [Hosting and cloud platforms interview questions and answers](hosting-and-platforms/interview-questions-and-answers.md)
