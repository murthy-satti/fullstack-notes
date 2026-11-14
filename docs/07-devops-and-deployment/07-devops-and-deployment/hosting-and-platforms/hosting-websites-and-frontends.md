# Hosting Websites and Frontends

A frontend is either a folder of built files (a static site or a
single-page app such as TaskFlow Web) or a server-rendered application
(for example Next.js) that needs code running per request. This lesson
covers where each kind can be hosted: Amazon S3 with CloudFront, AWS
Amplify Hosting, Vercel, Netlify, Cloudflare, GitHub Pages, Firebase,
Azure Static Web Apps, Render, and DigitalOcean App Platform. For each it
explains what the product is, what you manage, how it bills, and what it
costs at 10 thousand, 1 million, and 50 million page views a month.

How to deploy onto these hosts safely (hashed assets, cache headers,
upload order, invalidation, SPA fallback routing, preview deploys) is
covered in
[deploying frontends and static sites](../deployment-strategies/deploying-frontends-and-static-sites.md).
This lesson is about choosing the host and understanding the bill.

## Why it matters

Frontend hosting looks like a solved, nearly free problem, and at low
traffic it is. The differences appear as traffic grows: one provider
charges nothing for static bandwidth, another charges $0.15 per GB, and
a third converts bandwidth, requests, and even deploys into credits. At
50 million page views a month the same build output costs anywhere from
zero to about five thousand dollars depending on the host.

Rendering mode matters too. A static site or SPA can live anywhere. A
server-rendered Next.js app needs compute at request time, which limits
the choice and adds per-request cost. Free tiers also carry conditions
(non-commercial use only, monthly bandwidth caps, paused projects) that
are easy to discover only after launch.

## Real-world usage

- **Algolia on Vercel.** In
  [Algolia cuts build times in half with ISR](https://vercel.com/customers/algolia),
  Vercel describes Algolia moving its website off a "complex Gatsby
  infrastructure" with growing build times to Next.js on Vercel,
  where build times fell by 50% and the team could publish changes
  without waiting for daily deployments. Incremental Static Regeneration
  (ISR) is one of the features named.
- **The Kubernetes website on Netlify.** The kubernetes.io site is a
  Hugo project whose
  [netlify.toml](https://github.com/kubernetes/website/blob/main/netlify.toml)
  defines separate build commands for production, branch deploys, and
  `deploy-preview` contexts, so every pull request to the documentation
  gets its own preview site before review: the git-push platform
  workflow at the scale of a large open-source project.
- **Cloudflare's own guidance: start with Workers.** In
  [Your frontend, backend, and database, now in one Cloudflare Worker](https://blog.cloudflare.com/full-stack-development-on-cloudflare-workers/)
  (April 2025), Cloudflare says Pages "will continue to be supported"
  but that "all of our investment, optimizations, and feature work will
  be dedicated to improving Workers", and advises that new projects
  "should start with Workers" now that Workers serves static assets and
  server-side rendering.

**Popular tools and providers:** Vercel, Netlify, Cloudflare Workers and
Pages, Amazon S3 with CloudFront, AWS Amplify Hosting, GitHub Pages,
Firebase Hosting and App Hosting, Azure Static Web Apps, Render,
DigitalOcean App Platform, and nginx or Caddy on your own server.

## How it works

### Three kinds of frontend and what each needs

![Diagram: three rendering modes and what the host must do. A static site has every page built to HTML at build time, so the host only serves files from a CDN. A single-page app ships one index.html plus JavaScript bundles; the host serves files and must rewrite unknown paths to index.html, and the app calls an API for data. Server-side rendering and incremental static regeneration produce HTML at request time or on a schedule, so the host must run code per request or per revalidation, as functions, containers, or a Node server, which adds per-request compute cost.](rendering-modes-hosting.svg)

| Kind | Example | What the host must do | Hosting options |
|---|---|---|---|
| Static site | Documentation built with MkDocs or Hugo | Serve files from a CDN with good cache headers | Any static host |
| Single-page app (SPA) | TaskFlow Web (React + Vite) | Serve files and rewrite unknown paths to `index.html` | Any static host with rewrites |
| Server-rendered (SSR, ISR, streaming) | A Next.js storefront | Run code per request or per revalidation, plus serve static assets | Vercel, Netlify, Cloudflare, Amplify, Firebase App Hosting, containers, VMs |

The single biggest hosting decision for a frontend is whether it needs
a server at all. If the HTML can be built ahead of time or rendered in
the browser, every option on this page is open and the cheapest ones
cost nothing.

### Amazon S3 with CloudFront

**What it is:** Amazon S3 stores your build output as objects in a
private bucket; Amazon CloudFront is AWS's CDN, which caches and serves
those files from edge locations worldwide. An *origin access control*
(OAC) lets only your CloudFront distribution read the bucket, and a free
public certificate from AWS Certificate Manager covers your domain.

**You manage:** the bucket, the distribution, cache policies, the deploy
script (upload order and invalidations), redirects or rewrites (with
CloudFront Functions), and DNS. **AWS manages:** storage durability and
the global edge network.

**Billing:** S3 storage at $0.023 per GB-month and requests
([S3 pricing](https://aws.amazon.com/s3/pricing/)), plus CloudFront
either pay-as-you-go or on a flat-rate plan. Pay-as-you-go in
the US is $0.085 per GB for the first 10 TB and $0.0100 per 10,000
HTTPS requests, with 1 TB of transfer, 10 million requests, and 2 million
CloudFront Functions invocations free every month, and origin fetches
from S3 are free
([pay-as-you-go pricing](https://aws.amazon.com/cloudfront/pricing/pay-as-you-go/)).
The flat-rate plans are priced per distribution per month with no
overage charges: Free $0 (1 million requests, 100 GB), Pro $15
(10 million requests, 50 TB), Business $200 (125 million requests,
50 TB), and Premium $1,000 (500 million requests, 50 TB), each bundling
WAF rules and some S3 storage
([CloudFront pricing](https://aws.amazon.com/cloudfront/pricing/)).
The allowances are not hard caps: the
[developer guide](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/flat-rate-pricing-plan.html)
says sustained use well above them can lead AWS to adjust delivery (for
example fewer or more distant edge locations) until you upgrade.

**Strengths and weaknesses:** the cheapest and most controllable option
inside AWS, with your files in your own account; but you assemble the
pieces yourself and get no preview deployments unless you build them.

![Diagram: S3 and CloudFront architecture. A browser resolves app.example.com through Route 53 to the nearest CloudFront edge location, which terminates TLS with an ACM certificate, may run a CloudFront Function to rewrite SPA routes to index.html, and answers from its cache. On a cache miss the edge fetches from a private S3 bucket through an origin access control, which the bucket policy allows only for this distribution; origin fetches from S3 are not billed as transfer. Separately, a CI pipeline builds the app, uploads hashed assets first and index.html last with aws s3 sync, and invalidates only index.html.](s3-cloudfront-architecture.svg)

### AWS Amplify Hosting

**What it is:** a git-connected build and hosting service. You connect a
repository; Amplify builds each push, hosts the result on CloudFront,
and gives branch deployments. It also runs server-rendered Next.js by
provisioning compute for SSR routes.

**You manage:** the build settings and environment variables.
**AWS manages:** builds, CDN, TLS, and SSR compute.

**Billing** ([Amplify pricing](https://aws.amazon.com/amplify/pricing/)):
build minutes at $0.01 per minute (standard instance), storage at $0.023
per GB-month, data transfer out at $0.15 per GB served, and SSR at $0.30
per million requests plus $0.20 per GB-hour of request duration. The
Amplify pricing page lists a 12-month free tier of 1,000 build minutes,
5 GB stored, 15 GB served, and 500,000 SSR requests a month. AWS accounts
created since July 15, 2025 are on the newer credit-based Free Tier (up
to $200 in credits), and AWS does not say whether this allowance still
applies to them, so check your account's Free Tier page.

**Strengths and weaknesses:** a Vercel-like workflow inside your AWS
account; but at $0.15 per GB it costs much more per GB served than
CloudFront directly.

### Vercel

**What it is:** a frontend platform built by the company behind Next.js.
Every `git push` produces an immutable deployment with its own URL; pull
requests get preview deployments; production is an alias that points at
one deployment. Static files are served from Vercel's CDN, and
server-side code runs as Vercel Functions, billed by active CPU time,
provisioned memory, and invocations.

**You manage:** the code and project settings. **Vercel manages:**
builds, CDN, TLS, functions, and scaling.

**Billing** ([pricing](https://vercel.com/pricing)): Hobby is free but,
under the [terms of service](https://vercel.com/legal/terms), only for
"personal or non-commercial use"; Hobby includes 100 GB of Fast Data
Transfer and 1 million function invocations a month, and when a limit is
exceeded the feature pauses until 30 days have passed
([Hobby plan](https://vercel.com/docs/plans/hobby)). Pro costs $20 per
deploying seat per month and includes a $20 usage credit. Its CDN usage
is billed one of two ways. With
[Flat Rate CDN](https://vercel.com/changelog/flat-rate-cdn-is-now-ga-for-pro-teams),
the default for new Pro teams since September 2026, Pro includes 1
million CDN requests and 1 TB of data transfer a month, and higher tiers
cost $20, $100, or $300 a month (10, 50, or 150 million requests, each
with 50 TB). With usage-based billing there is no CDN allowance beyond
the credit: Fast Data Transfer from $0.15 per GB and CDN requests from $2
per million. Functions bill $0.60 per million invocations, active CPU
from $0.128 per hour, and provisioned memory from $0.0106 per GB-hour.

**Strengths and weaknesses:** the best support for Next.js features and
an excellent preview workflow; but per-GB transfer costs more than a CDN
bought directly, seats add up for larger teams, and some features are
Vercel-specific.

### Netlify

**What it is:** a git-push platform for static sites and frameworks with
atomic deploys, Deploy Previews for every pull request, serverless and
edge functions, forms, and redirects.

**You manage:** the code, `netlify.toml`, and `_redirects` and `_headers`
files. **Netlify manages:** builds, CDN, TLS, and functions.

**Billing:** since September 4, 2025, new accounts use
[credit-based plans](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/credit-based-pricing-plans/);
teams created earlier can stay on legacy plans. Free includes 300 credits
a month with a hard limit (projects pause when they run out), Personal
costs $9 for 1,000 credits, and Pro costs $20 for 3,000 credits with
unlimited members. Usage converts to credits: 20 credits per GB of
bandwidth, 2 credits per 10,000 web requests, 15 credits per production
deploy, and 10 credits per GB-hour of compute. Extra credits on Pro cost
$10 per 1,500 ([pricing](https://www.netlify.com/pricing/)).

**Strengths and weaknesses:** a mature, framework-neutral workflow; but
credits make costs harder to predict, and frequent production deploys
consume credits on small plans.

### Cloudflare Workers static assets and Cloudflare Pages

**What it is:** Cloudflare's network serves your static files from its
locations worldwide. **Pages** is the older git-integrated product for
static sites with optional Functions; **Workers** can now serve static
assets and run server-side code from one project, and Cloudflare
recommends it for new projects (see Real-world usage). Workers run in
V8 isolates, which start in milliseconds.

**You manage:** the build output and a `wrangler` configuration file.
**Cloudflare manages:** the network, TLS, and scaling.

**Billing:** "Requests to static assets are free and unlimited" and
there are no charges for data transfer
([Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)).
Server-side code is billed per request on Workers Paid ($5 a month
minimum, including 10 million requests and 30 million CPU milliseconds,
then $0.30 per million requests). Pages Free allows 500 builds a month,
20,000 files per site, and files up to 25 MiB
([Pages limits](https://developers.cloudflare.com/pages/platform/limits/)).

**Strengths and weaknesses:** the lowest cost at any static traffic
level and a very large network; but Workers custom domains require the
domain's DNS to be on Cloudflare (Pages allows a subdomain on external DNS
with a CNAME, though an apex domain on Pages also needs Cloudflare
nameservers), and server-side code
runs in the Workers runtime rather than full Node.js, so some packages
need adaptation.

### GitHub Pages

**What it is:** free static hosting published from a repository, either
from a branch or from a GitHub Actions workflow.

**Limits** ([GitHub Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)):
published sites up to 1 GB, a soft bandwidth limit of 100 GB per month,
a soft limit of 10 builds per hour (not applied to custom Actions
workflows), and no use as "a free web-hosting service to run your online
business, e-commerce site", or commercial SaaS.

**Strengths and weaknesses:** zero cost and zero setup for documentation
and open-source project sites; but no server-side code, no custom
headers, and not for commercial products.

### Firebase Hosting and Firebase App Hosting

**What it is:** Firebase Hosting serves static files from Google's CDN
and can rewrite paths to Cloud Run services or functions. Firebase App
Hosting is a separate product for server-rendered frameworks such as
Next.js and Angular; it builds your app and runs it on Google Cloud
infrastructure.

**Billing** ([Firebase pricing](https://firebase.google.com/pricing)):
Hosting on the no-cost Spark plan includes 10 GB stored and 360 MB of
transfer per day; on the pay-as-you-go Blaze plan, usage beyond that
costs $0.026 per GB stored and $0.15 per GB transferred. App Hosting
requires Blaze; its outgoing bandwidth beyond 10 GiB a month costs $0.15
per GiB when cached and $0.20 per GiB when not.

### Azure Static Web Apps

**What it is:** static hosting on Azure with built-in API routes backed
by Azure Functions, authentication integration, and preview environments
from pull requests.

**Billing** ([pricing](https://azure.microsoft.com/en-us/pricing/details/app-service/static/)
and the Azure retail price list): Free and Standard plans; Standard is
$9 per app per month with an SLA. Both include 100 GB of bandwidth per
subscription; on Standard, extra bandwidth is $0.20 per GB. Free allows
2 custom domains per app and Standard 5.

### Render static sites

**What it is:** Render, a general application platform, hosts static
sites for free on its CDN with automatic deploys from git.

**Billing:** static sites themselves are free; their traffic counts
toward the workspace's included bandwidth (Hobby 5 GB, Pro 25 GB, Scale
1 TB), and extra outbound bandwidth costs $0.15 per GB
([outbound bandwidth](https://render.com/docs/outbound-bandwidth)).

### DigitalOcean App Platform (static sites)

**What it is:** DigitalOcean's PaaS, which also hosts static sites from
git with a CDN and automatic HTTPS.

**Billing** ([App Platform pricing](https://www.digitalocean.com/pricing/app-platform)):
three static-site apps are free, each with a 1 GiB transfer allowance;
additional static apps cost $3 a month, and transfer beyond the
allowance costs $0.02 per GiB.

### A git-push platform, step by step

![Diagram: the git-push platform flow used by Vercel and Netlify. A developer pushes a branch or opens a pull request; the platform's build service installs dependencies and runs the build; the output becomes an immutable deployment with its own URL, posted to the pull request as a preview. Merging to main builds a production deployment, and the production domain alias is switched to it atomically, so every edge location serves the new version at once. Static files are served from the CDN cache; server-rendered routes and API routes run as functions near the data. Rolling back means pointing the alias at the previous deployment.](git-push-platform-flow.svg)

The key idea is that a deployment is immutable and production is only a
pointer. That gives atomic switches, instant rollbacks, and a preview
URL per pull request with no extra infrastructure, which is most of what
these platforms charge for.

### Hosting server-rendered Next.js

The [Next.js deployment guide](https://nextjs.org/docs/app/getting-started/deploying)
lists four ways to deploy: a Node.js server and a Docker container
support all features, a static export supports only features that do not
need a server, and platform adapters vary. Through the
[OpenNext](https://opennext.js.org/) project and Next.js's Deployment
Adapter API (stable in Next.js 16.2), other platforms can run Next.js
without reverse-engineering its build output.

| Where | How it runs Next.js | Good for | Watch out for |
|---|---|---|---|
| Vercel | Native: functions for SSR, CDN for static and ISR | Full feature support with no configuration | Per-GB and per-seat costs at scale |
| Netlify | Netlify's own Next.js integration | Teams already on Netlify | Not yet a verified adapter, so support may vary |
| Cloudflare Workers | OpenNext Cloudflare adapter | Global edge rendering, free static traffic | Workers runtime differences from Node.js |
| AWS Amplify Hosting | Amplify-managed SSR compute | Staying inside AWS with a managed workflow | $0.15 per GB served; not a verified adapter |
| OpenNext on AWS (SST) | Lambda functions, S3, and CloudFront in your account | Full control and AWS pricing | You operate the pieces |
| Firebase App Hosting | Google-managed build and runtime | Firebase and Google Cloud users | Requires the Blaze plan |
| Cloud Run, Fargate, any container | `next start` or `output: "standalone"` in Docker | All features, portable | You handle CDN caching for static assets |
| A VM | `next start` behind nginx | Steady traffic, full control | Patching, scaling, and CDN are yours |

### Options compared

| Host | What it is | You manage | Scaling | Pricing model | Free tier | Strengths | Weaknesses | Lock-in |
|---|---|---|---|---|---|---|---|---|
| S3 + CloudFront | Object storage + AWS CDN | Bucket, distribution, deploy script | Automatic | Per GB and request, or flat-rate plan | 1 TB and 10M requests per month (CDN) | Cheap, controllable, in your account | Assemble it yourself; no previews | Low (files are portable) |
| Amplify Hosting | Git-connected AWS hosting | Build settings | Automatic | Build minutes, GB served, SSR requests | First period for new accounts | Managed workflow in AWS | $0.15 per GB | Low to medium |
| Vercel | Frontend platform | Code, settings | Automatic | Seats + included usage + overages | Hobby (non-commercial) | Best Next.js support, previews | Cost at scale, seats | Medium (framework features) |
| Netlify | Frontend platform | Code, `netlify.toml` | Automatic | Credits | 300 credits per month | Framework-neutral, mature | Credits hard to predict | Low to medium |
| Cloudflare Workers / Pages | Edge network with static assets | Build output, config | Automatic, global | Free static; per request for code | Generous free plan | Free static traffic, fast | Workers runtime, DNS on Cloudflare for Workers | Medium for Workers code |
| GitHub Pages | Static hosting from a repo | Repo and workflow | Automatic | Free | Free | Simplest for docs | No server code; non-commercial | Low |
| Firebase Hosting | Google CDN static hosting | `firebase.json` | Automatic | GB stored and served | 10 GB stored, 360 MB per day | Easy with Firebase backends | $0.15 per GB | Low |
| Azure Static Web Apps | Azure static + Functions API | Config file | Automatic | Per app + GB | Free plan, 100 GB | Azure integration, SLA on Standard | $0.20 per GB beyond 100 GB | Low to medium |
| Render static | Free static sites on a PaaS | Repo settings | Automatic | Workspace bandwidth | Free sites, 5 GB on Hobby | Same place as your API | $0.15 per GB beyond plan | Low |
| DigitalOcean App Platform | PaaS static sites | Repo settings | Automatic | Per app + GiB | 3 apps free | Low per-GB price | 1 GiB included per app | Low |

### What each host costs at three traffic levels

!!! note "Prices checked November 2026"
    Prices on this page are US-region list prices in USD from the linked
    official pricing pages in November 2026. They change often; re-check
    them with each provider's pricing page or the AWS, Azure, or Google
    Cloud pricing calculator before deciding. Other regions (for example
    India) are priced differently: choose the region on the pricing page
    or in the calculator to see its rates.

Assumptions for TaskFlow Web: each page view transfers 500 KB from the
CDN on average (first visits download the bundle, repeat visits are
mostly cached) and makes 10 CDN requests; the team deploys to production
30 times a month. So:

```text
10,000 page views      ->      5 GB  and       100,000 requests
1,000,000 page views   ->    500 GB  and    10,000,000 requests
50,000,000 page views  -> 25,000 GB  and   500,000,000 requests
```

The arithmetic for the less obvious rows, at 50 million page views:

```text
S3 + CloudFront pay-as-you-go (US):
  transfer  (10,240 - 1,024 free) GB x $0.085 = $  783.36
            (25,000 - 10,240) GB x $0.080      = $1,180.80
  requests  (500M - 10M free) / 10,000 x $0.0100 = $  490.00
  total                                         ~ $2,454 (plus a few dollars of S3 origin GETs)

Netlify Pro (credits):
  bandwidth 25,000 GB x 20 = 500,000 credits
  requests  500M / 10,000 x 2 = 100,000 credits
  deploys   30 x 15 = 450 credits
  total 600,450 credits - 3,000 included = 597,450 -> 399 packs x $10 = $3,990 + $20 plan = $4,010

Vercel Pro (usage-based CDN billing: no allowance beyond the $20 credit;
the largest Flat Rate CDN tier covers only 150M requests):
  transfer  25,000 GB x $0.15                    = $3,750
  requests  500M / 1M x $2                       = $1,000
  seat $20, minus the $20 usage credit           ~ $4,750
```

| Host (monthly, USD) | 10k page views | 1M page views | 50M page views |
|---|---|---|---|
| Cloudflare Workers static assets or Pages | $0 | $0 | $0 |
| CloudFront flat-rate plan + S3 | $0 (Free plan) | $15 (Pro) | $1,000 (Premium) |
| S3 + CloudFront pay-as-you-go | $0 | $0 (inside the free tier) | about $2,454 |
| DigitalOcean App Platform static | about $0.07 | about $9.29 | about $466 |
| Render static (Hobby workspace) | $0 | about $74 | about $3,749 |
| Firebase Hosting (Blaze) | $0 | about $73 | about $3,748 |
| AWS Amplify Hosting | about $1.35 | about $75.60 | about $3,751 |
| Netlify (credit plans) | $9 (Personal) | about $90 (Pro + 7 credit packs) | about $4,010 (list); Enterprise in practice |
| Vercel | $0 Hobby if non-commercial, else $20 Pro | $40 (Pro seat + $20 Flat Rate CDN tier for 10M requests) | about $4,750 (usage-based list); Enterprise in practice |
| Azure Static Web Apps | $0 (Free) | $89 (Standard) | about $4,989 |
| GitHub Pages | $0 | Not suitable (100 GB soft limit) | Not suitable |

![Diagram: horizontal bars of the monthly cost of serving TaskFlow Web at 50 million page views, 25,000 GB and 500 million requests, at US list prices: Cloudflare static assets $0, DigitalOcean App Platform about $466, CloudFront flat-rate Premium $1,000, S3 with CloudFront pay-as-you-go about $2,454, Firebase Hosting about $3,748, Render about $3,749, Amplify Hosting about $3,751, Netlify about $4,010, Vercel about $4,750, and Azure Static Web Apps about $4,989. A side column shows the same hosts at 1 million page views, from $0 to about $90.](frontend-hosting-costs.svg)

Three lessons come out of the table. First, below a million page views
the difference is a few tens of dollars, so the workflow matters more
than the price. Second, at high volume the per-GB price dominates, and
it ranges from zero (Cloudflare) through $0.02 (DigitalOcean) and the
CDN rates (CloudFront) to $0.15 or $0.20 (platform markups). Third, list
prices are where negotiation starts: at tens of terabytes, every
platform has an enterprise or flat-rate offer, so get a quote before you
migrate.

## When to use and when not to use

Use a pure static host whenever the frontend can be built ahead of time
or rendered in the browser; it is cheaper, faster, and has fewer moving
parts. Use a platform with server rendering only when SEO, first-load
performance, or personalization genuinely need HTML generated per
request. Do not pick a host for one feature you might use later; moving
a static site is easy, so optimize for today's workflow.

### Which to choose

| Situation | Pick | Runner-up | Why |
|---|---|---|---|
| Side project or portfolio | Cloudflare Workers static assets or Pages | GitHub Pages (non-commercial), Vercel Hobby (non-commercial) | Free at any realistic traffic, custom domain, TLS included |
| Early startup | Vercel or Netlify for previews and speed | Cloudflare for a static SPA | Preview deployments and zero setup save more than they cost at this stage |
| Steady high traffic | S3 + CloudFront (flat-rate plan or committed pricing) or Cloudflare | Negotiated Vercel or Netlify Enterprise if the workflow is worth it | Per-GB price dominates at tens of terabytes |
| Spiky traffic (launches, campaigns) | Any CDN-backed static host; Cloudflare or a CloudFront flat-rate plan to avoid overage risk | Vercel or Netlify with spend limits and alerts | CDNs absorb spikes; the risk is the bill, not capacity |
| Global audience | Cloudflare or CloudFront (large edge networks) | Vercel or Netlify | Static files are served from the edge; keep API calls few and cacheable |
| Compliance-heavy (healthcare) | S3 + CloudFront under the AWS BAA (both are on AWS's [HIPAA eligible services list](https://aws.amazon.com/compliance/hipaa-eligible-services-reference/)) | Vercel with its HIPAA BAA (a paid add-on on Pro, on request for Enterprise) | Keep PHI out of static files and URLs entirely; the build output should hold no patient data, so the contract matters for any server-side code |
| Large files or heavy egress | Cloudflare (no egress charges) or CloudFront flat-rate | DigitalOcean App Platform ($0.02 per GiB) | Avoid $0.15 to $0.20 per GB platform transfer pricing |
| Team with no ops people | Vercel or Netlify | Amplify Hosting inside AWS | Git push, previews, TLS, and rollbacks with no infrastructure to manage |

![Diagram: a decision flow for frontend hosting. If the site needs HTML rendered per request, choose by framework: Next.js teams wanting every feature go to Vercel, teams that want their own cloud go to OpenNext on AWS, Cloudflare, Amplify, or a container on Cloud Run. If the site is static or a single-page app, ask whether it is commercial: non-commercial documentation can use GitHub Pages; otherwise ask whether traffic is large, above about 1 TB per month: if yes, use Cloudflare or CloudFront with a flat-rate plan; if no, ask whether preview deployments and zero setup matter most: if yes, use Vercel or Netlify, otherwise Cloudflare or S3 with CloudFront. A note says healthcare data must never be embedded in static files.](frontend-hosting-decision.svg)

## Practical examples

### TaskFlow Web on a private S3 bucket behind CloudFront (Terraform)

This creates a private bucket, an origin access control, a distribution
with the managed caching policy, and a bucket policy that only that
distribution can use.

```hcl
# infra/web/main.tf: TaskFlow Web on a private S3 bucket behind CloudFront
terraform {
  required_version = ">= 1.6"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

provider "aws" {
  region = "us-east-1"
}

variable "domain_name" {
  type    = string
  default = "app.example.com"
}

variable "certificate_arn" {
  type        = string
  description = "ACM certificate for domain_name; CloudFront requires us-east-1"
}

resource "aws_s3_bucket" "web" {
  bucket = "taskflow-web-example"
}

resource "aws_s3_bucket_public_access_block" "web" {
  bucket                  = aws_s3_bucket.web.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_cloudfront_origin_access_control" "web" {
  name                              = "taskflow-web-oac"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

data "aws_cloudfront_cache_policy" "optimized" {
  name = "Managed-CachingOptimized"
}

resource "aws_cloudfront_distribution" "web" {
  enabled             = true
  is_ipv6_enabled     = true
  default_root_object = "index.html"
  aliases             = [var.domain_name]
  price_class         = "PriceClass_100" # North America and Europe edges only

  origin {
    origin_id                = "s3-web"
    domain_name              = aws_s3_bucket.web.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.web.id
  }

  default_cache_behavior {
    target_origin_id       = "s3-web"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true
    cache_policy_id        = data.aws_cloudfront_cache_policy.optimized.id
  }

  # SPA fallback: S3 returns 403 for missing keys when the policy has no
  # s3:ListBucket, so map it to index.html with a 200
  custom_error_response {
    error_code            = 403
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 10
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = var.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }
}

data "aws_iam_policy_document" "web" {
  statement {
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.web.arn}/*"]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.web.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "web" {
  bucket = aws_s3_bucket.web.id
  policy = data.aws_iam_policy_document.web.json
}

output "cloudfront_domain" {
  value = aws_cloudfront_distribution.web.domain_name
}
```

- The bucket stays private: public access is blocked, and the policy
  lets only the CloudFront service read objects, and only for requests
  from this distribution (`AWS:SourceArn`).
- `price_class = "PriceClass_100"` serves from fewer, cheaper edge
  regions; remove it if many users are in Asia or South America.
- The error mapping turns every missing file, including a mistyped
  asset URL, into `index.html`. A CloudFront Function that rewrites only
  page routes is more precise; the
  [frontend deployment lesson](../deployment-strategies/deploying-frontends-and-static-sites.md)
  shows one, along with the ordered upload and invalidation script.
- Point `app.example.com` at the distribution with a Route 53 alias or a
  CNAME at your DNS provider.

### TaskFlow Web on Cloudflare Workers static assets

```json
// wrangler.jsonc
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "name": "taskflow-web",
  "compatibility_date": "2026-11-01",
  "assets": {
    "directory": "./dist",
    "not_found_handling": "single-page-application"
  }
}
```

```text
# public/_headers (Vite copies it into dist/)
/assets/*
  Cache-Control: public, max-age=31536000, immutable
```

```bash
npm run build          # Vite writes dist/
npx wrangler deploy    # uploads only changed files and switches versions
```

With only an `assets` block and no Worker script, every request is a
static asset request, which Cloudflare does not bill.
`not_found_handling: "single-page-application"` returns `index.html` for
unknown paths, which is the SPA fallback.

### TaskFlow Web on Firebase Hosting

The project's `firebase.json` (plain JSON, so no comments) sets the
output folder, the SPA rewrite, and long caching for hashed assets:

```json
{
  "hosting": {
    "public": "dist",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "rewrites": [{ "source": "**", "destination": "/index.html" }],
    "headers": [
      {
        "source": "/assets/**",
        "headers": [
          { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }
        ]
      }
    ]
  }
}
```

```bash
npm run build
npx firebase-tools deploy --only hosting
```

Rewrites apply only when no file matches the path, so real files are
still served directly.

### TaskFlow Web on Azure Static Web Apps

`staticwebapp.config.json` in the build output configures the fallback
and headers:

```json
{
  "navigationFallback": {
    "rewrite": "/index.html",
    "exclude": ["/assets/*", "/favicon.ico"]
  },
  "routes": [
    {
      "route": "/assets/*",
      "headers": { "cache-control": "public, max-age=31536000, immutable" }
    }
  ]
}
```

### Server-rendered Next.js on Cloud Run

For full Next.js features outside Vercel, build a standalone server and
run it as a container:

```js
// next.config.mjs
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone", // copies only the files the server needs into .next/standalone
};
export default nextConfig;
```

```dockerfile
# Dockerfile
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production PORT=8080 HOSTNAME=0.0.0.0
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
USER node
EXPOSE 8080
CMD ["node", "server.js"]
```

```bash
gcloud run deploy taskflow-site --source . --region=us-central1 \
  --min-instances=0 --max-instances=20 --allow-unauthenticated
```

Put a CDN in front (Cloud CDN through a load balancer, or Cloudflare) so
`/_next/static/*` files, which are content-hashed, are served from cache
instead of from the container.

## Best practices

- Decide the rendering mode first; static and SPA frontends can use the
  cheapest hosts.
- Estimate bandwidth from real numbers: average transferred bytes per
  page view times page views, not bundle size times visits.
- Read the commercial-use terms of free tiers before launching a
  business on them.
- Set spend limits or usage alerts on platforms that bill overages, and
  know what happens at a hard limit (pause or bill).
- Keep the frontend portable: plain build output, rewrites and headers
  in a small config file you could translate to another host.
- Keep secrets and personal data out of the frontend bundle entirely;
  anything in it is public.
- Get a quote before migrating for cost reasons at tens of terabytes;
  list prices are the upper bound.

## In production

- **The site went down on the last days of the month.**
  *Detect:* the platform dashboard shows the project paused or a usage
  limit reached. *Cause:* a hard limit on a free plan, such as Netlify's
  Free credit limit or Vercel Hobby's monthly limits, which pause the
  feature. *Fix:* move production to a paid plan with spend alerts, and
  keep free plans for previews and personal projects.
- **The bandwidth bill is ten times the estimate.**
  *Detect:* the provider's usage page shows transfer far above page
  views times expected size; top paths are large images or video.
  *Cause:* unoptimized images, source maps, or video served as static
  files, or hotlinking from other sites. *Fix:* resize and compress
  images, serve video from a video service, block hotlinking, and move
  heavy files to a host without egress fees.
- **Users get the old version for hours after a deploy.**
  *Detect:* `curl -I https://app.example.com/` shows a long `max-age`
  or an `Age` header from before the deploy. *Cause:* `index.html`
  cached at the CDN or in browsers. *Fix:* serve HTML with
  `Cache-Control: no-cache`, invalidate only `index.html` after each
  deploy, and keep long caching for hashed assets only.
- **Deep links return 404 or 403 on the new host.**
  *Detect:* `/` works but `/tasks/42` fails on refresh. *Cause:* no SPA
  fallback rewrite on the new host. *Fix:* add the host's fallback
  (`not_found_handling`, `rewrites`, `navigationFallback`, or a
  CloudFront Function) as part of the migration checklist.
- **Server-rendered pages are slow and the function bill climbs.**
  *Detect:* function invocations equal page views, and cold starts show
  in latency percentiles. *Cause:* pages that could be static are
  rendered on every request. *Fix:* render at build time or with
  incremental regeneration where content allows, and cache rendered
  HTML at the CDN with `s-maxage`.
- **The custom domain does not attach on Workers.**
  *Detect:* the dashboard refuses the domain or shows it as pending.
  *Cause:* Workers custom domains require nameservers managed by
  Cloudflare. *Fix:* move DNS to Cloudflare, or use Pages (which
  supports a subdomain on external DNS with a CNAME; an apex domain still
  needs Cloudflare nameservers) for that site.

## Important terminology

- **Static site:** a site whose HTML is fully generated at build time.
- **Single-page application (SPA):** one HTML page plus JavaScript that
  renders routes in the browser and calls APIs for data.
- **SSR (server-side rendering):** generating HTML on a server for each
  request.
- **ISR (incremental static regeneration):** serving pre-rendered pages
  and regenerating them in the background after a set time or on demand.
- **Origin:** the server or bucket the CDN fetches from on a cache miss.
- **Origin access control (OAC):** CloudFront's signed access that lets a
  private S3 bucket accept requests only from a distribution.
- **Immutable deployment:** a deployment whose files never change after
  it is created; production is an alias pointing at one.
- **Preview deployment:** a deployment of a branch or pull request at its
  own URL, used for review.
- **Fast Data Transfer:** Vercel's name for data transferred from its CDN
  to users, billed per GB.
- **Credits:** Netlify's unit for usage on credit-based plans.

## Common mistakes and misconceptions

- Choosing a server-rendering platform for a site that could be fully
  static.
- Estimating bandwidth from bundle size alone, ignoring images and
  repeat-visit caching.
- Launching a commercial product on GitHub Pages or Vercel Hobby.
- Assuming "unlimited bandwidth" on every free tier; most have soft
  limits, hard limits, or fair-use clauses.
- Making the S3 bucket public instead of using an origin access control.
- Forgetting that Netlify credit plans count production deploys, so a
  busy CI pipeline consumes credits.
- Comparing platforms at list price at large scale instead of asking for
  an enterprise or flat-rate quote.

## Revision questions

1. What does a host need to provide for a static site, an SPA, and a
   server-rendered Next.js app?
2. Why is an origin access control better than a public S3 bucket for
   static hosting?
3. Calculate the CloudFront pay-as-you-go cost in the US for 3 TB of
   transfer and 20 million HTTPS requests in a month. (Answer: transfer
   (3,072 - 1,024) GB x $0.085 = $174.08; requests (20M - 10M) / 10,000 x
   $0.0100 = $10.00; total $184.08.)
4. On Netlify's credit plans, which three kinds of usage consume credits
   for a static site, and why does deploy frequency matter?
5. Why can a Cloudflare-hosted static site cost nothing at 50 million
   page views while the same site costs thousands of dollars elsewhere?
6. What are the trade-offs of running Next.js on Vercel versus in a
   container on Cloud Run?
7. A startup's marketing site gets 2 million page views a month and its
   team wants preview deployments. Which host would you pick and what
   would you check before launch?
8. What should a healthcare company keep out of its frontend build, and
   why does that matter for choosing a host?

## Further learning

- [Amazon CloudFront: Restricting access to an Amazon S3 origin](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html)
- [Vercel: Pricing on Vercel](https://vercel.com/docs/pricing)
- [Netlify: Credit-based pricing plans](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/credit-based-pricing-plans/)
- [Cloudflare Workers: Static assets](https://developers.cloudflare.com/workers/static-assets/)
- [Next.js: Deploying](https://nextjs.org/docs/app/getting-started/deploying)
- [AWS Pricing Calculator](https://calculator.aws/), [Google Cloud Pricing Calculator](https://cloud.google.com/products/calculator), [Azure Pricing Calculator](https://azure.microsoft.com/en-us/pricing/calculator/)
- Next: [running backend servers and APIs](running-backend-servers-and-apis.md). Back to the [hosting and cloud platforms overview](../hosting-and-platforms.md).
