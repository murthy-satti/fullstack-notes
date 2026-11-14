# Hosting and Cloud Platforms Cheat Sheet

Quick revision of the hosting and cloud platforms lessons, for use before
an interview or a hosting, storage, or cloud-cost task.

## Key commands

| Command | What it does |
|---|---|
| `gcloud run deploy taskflow-api --image=<image> --concurrency=80 --min-instances=1` | Serverless container; one warm instance removes cold starts |
| `aws ecs create-express-gateway-service --service-name taskflow-api ...` | ECS Express Mode: Fargate service, load balancer, and scaling in one call |
| `npx wrangler deploy` | Upload a built static site to Cloudflare (changed files only) |
| `aws s3api put-bucket-lifecycle-configuration --bucket taskflow-backups --lifecycle-configuration file://lifecycle.json` | Apply tier transitions and expirations |
| `aws s3api put-object-lock-configuration --bucket taskflow-backups ...` | Default retention for new versions (35 days, compliance mode) |
| `aws s3api restore-object ... --restore-request '{"Days":3,"GlacierJobParameters":{"Tier":"Bulk"}}'` | Temporary copy of a Deep Archive object, cheapest tier |
| `ffmpeg -i source.mp4 ... -force_key_frames "expr:gte(t,n_forced*2)" -f hls -hls_time 4` | DIY HLS ladder with aligned keyframes |
| `aws ce get-cost-and-usage --granularity MONTHLY --group-by Type=DIMENSION,Key=USAGE_TYPE ...` | Last month's bill by usage type |
| `aws ec2 describe-volumes --filters Name=status,Values=available` | Unattached volumes, still billed |
| `aws ec2 modify-volume --volume-id vol-<id> --volume-type gp3` | Move gp2 to gp3 without downtime |
| `aws logs describe-log-groups --query "logGroups[?retentionInDays==null].logGroupName"` | Log groups that keep data forever |

## Decision guide

| If you need | Choose | Why |
|---|---|---|
| A static site or SPA | Cloudflare (Workers static assets or Pages), or S3 + CloudFront | Cheapest: CDN-served files, free or close to it at realistic traffic |
| Previews and zero setup for a frontend team | Vercel or Netlify | Costs more per GB and per request at scale; worth it early |
| An API with spiky or little traffic | Cloud Run, Container Apps, or Lambda | Cheaper while idle (scale to zero); plan for cold starts and connection limits |
| An API under steady 24/7 load | ECS or EKS on EC2, or GKE, with Savings Plans or committed use discounts | Cheaper than per-request pricing past the crossover |
| Production fast with no ops people | Render, Railway, Fly.io, Cloud Run, or ECS Express Mode | Costs more per unit of compute, but saves an operations hire |
| A relational database | Managed PostgreSQL (RDS, Cloud SQL, Neon, Supabase) | Costs more than self-hosting on a VM; includes backups, failover, patching |
| User uploads and downloads | Object storage behind a CDN, with presigned uploads | Cheaper and more durable than disks; egress is the real cost |
| Heavy public downloads | R2, B2 with a partner CDN, or a flat-rate CDN plan | Cheaper than per-GB hyperscaler egress |
| Video in a product | Mux or Cloudflare Stream | No pipeline to run; DIY (S3 + MediaConvert + CDN) gets cheaper at steady high volume |
| Long backup retention | Lifecycle to Glacier IR, then Deep Archive, with Object Lock | Cheapest per GB; costs more for early deletion and restores |
| A cheaper compute floor | Compute Savings Plan for 70-90% of the baseline, Spot for interruptible work | Commitments and Spot cost less; Spot can be reclaimed |

## Numbers and defaults to remember

| Item | Value |
|---|---|
| Headline prices (AWS us-east-1 list, November 2026) | S3 Standard $0.023, Deep Archive $0.00099 per GB-month; egress $0.09/GB after 100 GB free; cross-zone $0.01/GB each way; NAT gateway $0.045/h + $0.045/GB; public IPv4 $0.005/h |
| Minimum storage durations (days) | S3 IA classes 30 (128 KB minimum size), Glacier IR 90, Deep Archive 180; Azure Cool / Cold / Archive 30 / 90 / 180; Google Nearline / Coldline / Archive 30 / 90 / 365 |
| Restore from the coldest tiers | Deep Archive within 12 h (standard) or 48 h (bulk); Azure Archive up to 15 h; Google Archive in milliseconds |
| Savings Plan break-even (m7g.large) | 1-year Compute Savings Plan at 73% of the month, 3-year at 51% |
| Connection pool per process | (max_connections - reserve) / max processes, for example (100 - 10) / 6 = 15 |
| gp2 to gp3 | 20% cheaper, no downtime |
| Spot on AWS | Two-minute interruption notice |

## Top mistakes

- **Serving files through the API.** Use presigned uploads and downloads
  and a CDN in front of the bucket.
- **Paying hyperscaler egress for heavy downloads.** Use a zero-egress
  store, a partner CDN, or a flat-rate CDN plan.
- **Tiering tiny or short-lived objects.** Respect minimum durations,
  skip objects under 128 KB, and bundle small files first.
- **Backups that production credentials can delete.** Use a separate
  account, Object Lock, and a copy at another provider (3-2-1).
- **Never timing a restore.** Test every tier; a Deep Archive bulk
  restore can take up to 48 hours.
- **Committing before usage is steady.** Wait for a steady quarter, then
  cover 70-90% of the baseline.
- **Sending S3 traffic through a NAT gateway.** Add a free gateway
  endpoint.
- **Connection pools that ignore autoscaling.** Size pools from
  `max_connections` and put a pooler in front of functions.

## Where to go deeper

- [Choosing where to run software](choosing-where-to-run-software.md)
- [Hosting websites and frontends](hosting-websites-and-frontends.md)
- [Running backend servers and APIs](running-backend-servers-and-apis.md)
- [Managed databases](managed-databases.md)
- [Object and file storage](object-and-file-storage.md)
- [Video storage and streaming](video-storage-and-streaming.md)
- [Backup and archive storage](backup-and-archive-storage.md)
- [Cost optimization and cloud bills](cost-optimization-and-cloud-bills.md)
- [Interview questions and answers](interview-questions-and-answers.md)

Back to the [hosting and cloud platforms overview](../hosting-and-platforms.md).
