# Backup and Archive Storage

Backups and archives are the data you hope never to read. That makes them
perfect for the cheapest storage tiers, which charge very little to keep
data and a lot (in money, time, or both) to get it back. This lesson
covers where backup copies and archives should live: the hot, warm, cold,
and archive tiers; Amazon S3 Glacier Instant Retrieval, Glacier Flexible
Retrieval, and Glacier Deep Archive; Azure Cool, Cold, and Archive; Google
Cloud Nearline, Coldline, and Archive; Backblaze B2, Wasabi, Cloudflare R2
Infrequent Access, and DigitalOcean Spaces Cold Storage; managed backup
services such as AWS Backup; retrieval times and fees, minimum storage
durations, early-deletion charges, and object lock for immutability. A
worked example prices keeping 5 TB for a year with one full restore on
every option.

What to back up, how often, and how to prove restores work is covered in
the [backups](../backups.md) subject:
[backup fundamentals and strategies](../backups/backup-fundamentals-and-strategies.md)
(3-2-1, immutability, retention schedules),
[disaster recovery, RPO, and RTO](../backups/disaster-recovery-rpo-and-rto.md),
and [restore testing and runbooks](../backups/restore-testing-and-runbooks.md).
This page is about the storage underneath.

## Why it matters

Backup data grows quietly. A nightly 20 GB database dump kept for seven
years is about 51 TB. In S3 Standard that would cost more than $1,100 a
month; with a lifecycle rule moving it to Glacier Deep Archive, about $69.
Storage choices for backups are therefore real money.

The catch is that a backup is only worth its restore. The cheapest tiers
add hours of delay before the first byte, per-GB retrieval fees,
per-request restore fees, and minimum durations that punish short-lived
data. Teams that only look at the storage price discover the rest during
an incident, when the database is down and the archive tier says "within
12 hours". Picking a tier means matching three numbers: what it costs to
keep, what it costs to read, and how long reading takes compared with the
recovery time objective.

## Real-world usage

- **Google SRE book.** The chapter
  [Data Integrity: What You Read Is What You Wrote](https://sre.google/sre-book/data-integrity/)
  separates the two jobs this page serves. Backups "can be loaded back
  into an application" and must be recovered quickly, "well within the
  uptime needs of a service". Archives "safekeep data for long periods of
  time to meet auditing, discovery, and compliance needs", and their
  recovery "generally doesn't need to complete within uptime
  requirements". Backups belong in fast tiers; archives belong in the
  cheapest ones. The chapter's summary line: "No one really wants to make
  backups; what people really want are restores."
- **Amazon S3 Object Lock.** The
  [Object Lock feature page](https://aws.amazon.com/s3/features/object-lock/)
  states that in compliance mode a protected object version "can't be
  overwritten or deleted by any user, including the root user", and that
  Object Lock has been assessed by Cohasset Associates for SEC Rule
  17a-4(f), FINRA Rule 4511, and CFTC Regulation 1.31. Regulated firms use
  this write-once-read-many (WORM) storage for records that must not be
  altered.
- **Amazon Glacier (the original vault service).** The
  [Amazon Glacier developer guide](https://docs.aws.amazon.com/amazonglacier/latest/dev/introduction.html)
  states that the standalone vault-based service no longer accepts new
  customers and points new users to the S3 Glacier storage classes; the
  [Glacier pricing page](https://aws.amazon.com/s3/glacier/pricing/) gives
  the date, December 15, 2025. Existing data stays accessible. Archives outlive
  products, so keep them in formats and APIs you can move.
- **CISA ransomware guidance.** The
  [#StopRansomware Guide](https://www.cisa.gov/stopransomware/ransomware-guide)
  recommends maintaining offline, encrypted backups of critical data and
  regularly testing their availability and integrity, because attackers
  look for and delete reachable backups. Object lock and separate backup
  accounts are the cloud versions of "offline".

**Popular tools and providers:** Amazon S3 Glacier storage classes, AWS
Backup, Azure Blob Storage (Cool, Cold, Archive) and Azure Backup, Google
Cloud Storage (Nearline, Coldline, Archive) and Google Cloud Backup and
DR, Backblaze B2, Wasabi, Cloudflare R2, DigitalOcean Spaces Cold Storage,
and backup tools that write to object storage: restic, rclone, Velero,
and pgBackRest.

## How it works

### Hot, warm, cold, and archive

| Temperature | Typical access | First byte | Minimum stay | Typical use |
|---|---|---|---|---|
| Hot | Daily | Milliseconds | None | Live data, last night's backup used by restore tests |
| Warm (infrequent access) | About monthly | Milliseconds | About 30 days | Recent backups you may need quickly |
| Cold | About quarterly | Milliseconds on most providers | About 90 days | Older backups, monthly snapshots |
| Archive | Yearly or never | Minutes to hours (AWS, Azure); milliseconds (Google) | 90 to 365 days | Compliance retention, legal holds, year-end copies |

Each step colder lowers the storage price and raises the cost of reading:
a per-GB retrieval fee, higher request prices, a minimum billed duration,
and on some providers an explicit restore step that takes hours.

![Diagram: a grid comparing storage tiers across providers, rows from hot to archive. Hot: S3 Standard $0.023 per GB-month, Azure Hot $0.0208, Google Standard $0.020, and among others Backblaze B2 at $6.95 per TB, R2 at $0.015, and Wasabi at $7.99 per TB with a 90-day minimum. Warm: S3 Standard-IA $0.0125, Azure Cool $0.0152, Google Nearline $0.010, R2 Infrequent Access $0.01, each with a 30-day minimum and millisecond reads. Cold: S3 Glacier Instant Retrieval $0.004, Azure Cold $0.0036, Google Coldline $0.004, each with a 90-day minimum and millisecond reads, and Spaces Cold Storage $0.007 per GiB with a 30-day minimum. Archive: S3 Glacier Flexible Retrieval $0.0036 restored in minutes to 12 hours, S3 Glacier Deep Archive $0.00099 restored in 12 to 48 hours, Azure Archive $0.00099 rehydrated in up to 15 hours, Google Archive $0.0012 with a 365-day minimum but millisecond reads; B2, R2, and Wasabi have no archive tier.](archive-tier-ladder.svg)

### Amazon S3 Glacier storage classes

**What they are.** Three S3 storage classes for rarely used data. They are
ordinary S3 objects in ordinary buckets, set per object or by lifecycle
rules. You choose the class, lifecycle rules, and restore requests; AWS
stores the data across at least three Availability Zones with the same
eleven-nines durability design as S3 Standard.

| Class | Storage per GB-month | Minimum | Getting data back |
|---|---|---|---|
| Glacier Instant Retrieval | $0.004 | 90 days, 128 KB minimum size | Normal `GET` in milliseconds; $0.03 per GB retrieved; requests $0.02 per 1,000 writes, $0.01 per 1,000 reads |
| Glacier Flexible Retrieval | $0.0036 | 90 days, 40 KB overhead per object | Restore first: expedited 1-5 minutes ($0.03 per GB, $10 per 1,000 requests), standard 3-5 hours ($0.01 per GB, $0.05 per 1,000), bulk 5-12 hours (free) |
| Glacier Deep Archive | $0.00099 | 180 days, 40 KB overhead per object | Restore first: standard within 12 hours ($0.02 per GB, $0.10 per 1,000 requests), bulk within 48 hours ($0.0025 per GB, $0.025 per 1,000) |

Prices are us-east-1 list prices from the
[S3 pricing page](https://aws.amazon.com/s3/pricing/) and the AWS Price
List; retrieval times are from
[Understanding archive retrieval options](https://docs.aws.amazon.com/AmazonS3/latest/userguide/restoring-objects-retrieval-options.html).

How a restore works for Flexible Retrieval and Deep Archive:

1. You call `RestoreObject` with a tier (Expedited, Standard, Bulk) and a
   number of days.
2. S3 creates a **temporary copy** of the object. While it exists, you pay
   for both the archived object and the temporary copy at the S3 Standard
   rate.
3. When the copy is ready (an event notification or `HeadObject` shows the
   `Restore` header with `ongoing-request="false"`), you `GET` it like any
   object, usually copying it somewhere permanent.
4. After the days you asked for, S3 deletes the temporary copy; the object
   stays archived.

Three practical limits: restores run at up to 1,000 restore requests per
second per account and up to 1-2 PB per day, so very large datasets take
longer than the headline times; expedited capacity can be unavailable at
busy times unless you buy provisioned capacity ($100 per unit per month);
and each archived object carries 40 KB of metadata (8 KB of it at the
Standard rate), so archiving millions of tiny files costs more than
bundling them into larger archives first.

**Amazon Glacier (vaults)** is a separate, older service with its own API
for "vaults" and "archives". It no longer accepts new customers (since
December 15, 2025); use the S3 storage classes above. Existing customers
keep access and AWS publishes guidance for moving vault data into S3.

### Azure Blob Storage: Cool, Cold, and Archive

**What they are.** Access tiers on Azure block blobs. Hot, Cool, and Cold
are online (millisecond reads); Archive is **offline**: a blob must be
**rehydrated** to an online tier before it can be read. You set tiers per
blob or with lifecycle management policies; Microsoft manages the storage.

East US, locally redundant storage, from the
[Azure Retail Prices API](https://learn.microsoft.com/en-us/rest/api/cost-management/retail-prices/azure-retail-prices)
(see [Blob pricing](https://azure.microsoft.com/en-us/pricing/details/storage/blobs/)):

| Tier | Storage per GB-month | Minimum | Reading |
|---|---|---|---|
| Cool | $0.0152 | 30 days | $0.01 per GB, milliseconds |
| Cold | $0.0036 | 90 days | $0.03 per GB, milliseconds |
| Archive | $0.00099 | 180 days | Rehydrate first: standard $0.02 per GB, high priority $0.10 per GB; read operations $5 (standard) or $50 (high priority) per 10,000 |

From [Blob rehydration from the archive tier](https://learn.microsoft.com/en-us/azure/storage/blobs/archive-rehydrate-overview):
standard priority "might take up to 15 hours" for objects under 10 GB;
high priority "might complete in less than one hour" for objects under
10 GB; and "a maximum of 10 GiB per storage account can be rehydrated per
hour with priority retrieval". Microsoft warns that these timelines "do
not scale linearly" for bulk rehydration. A 5 TB emergency restore from
Archive is a multi-day job: plan for it, or keep the most recent backups
in Cool or Cold. Archive is available on LRS, GRS, and RA-GRS accounts,
not on zone-redundant ones, and lifecycle policies cannot rehydrate.

### Google Cloud Storage: Nearline, Coldline, and Archive

**What they are.** Storage classes on Cloud Storage objects. Unlike AWS
Glacier and Azure Archive, **every class is online**: an Archive object
returns its first byte in milliseconds with a normal read. The trade-off
is expressed only in price and minimum duration.

| Class | Storage per GiB-month (us-central1) | Minimum | Retrieval per GiB |
|---|---|---|---|
| Nearline | $0.010 | 30 days | $0.01 |
| Coldline | $0.004 | 90 days | $0.02 |
| Archive | $0.0012 | 365 days | $0.05 |

Read and write operations also cost more in colder classes ($0.05 per
1,000 for both on Archive). Source:
[Cloud Storage pricing](https://cloud.google.com/storage/pricing).
Instant access makes Google's Archive attractive for backups you hope
never to read but might need urgently; the one-year minimum makes it
wrong for anything deleted sooner.

### Backblaze B2, Wasabi, Cloudflare R2, and DigitalOcean Spaces

These providers have no glacier-style archive tier. They compete by
making hot or warm storage cheap and restores free or nearly free:

- **Backblaze B2** ($6.95 per TB-month, no minimum duration, egress free
  up to 3x stored data): popular as the offsite copy for backup tools.
  Supports S3-compatible
  [Object Lock](https://www.backblaze.com/docs/cloud-storage-object-lock).
- **Wasabi** ($7.99 per TB-month pay as you go, 1 TB minimum charge,
  **90-day minimum storage duration**, no egress or API fees while egress
  stays at or below stored data): data deleted early is billed as "timed
  deleted storage" until 90 days pass, which matters for backup rotations
  shorter than 90 days. Supports
  [Object Lock](https://docs.wasabi.com/docs/object-lock-overview).
- **Cloudflare R2 Infrequent Access** ($0.01 per GB-month, $0.01 per GB
  retrieval, 30-day minimum, no egress fees): a warm tier with free
  egress. R2 offers
  [bucket locks](https://developers.cloudflare.com/r2/buckets/bucket-locks/)
  that block deletion and overwrites for a period or indefinitely, but
  anyone with permission to edit the bucket's configuration can remove a
  lock rule, so it is weaker than S3's compliance mode.
- **DigitalOcean Spaces Cold Storage** ($0.007 per GiB-month, $0.01 per
  GiB retrieved with the fee waived up to your average daily cold storage
  usage, 30-day minimum): see
  [Spaces pricing](https://docs.digitalocean.com/products/spaces/details/pricing/).

### Managed backup services

**What they are.** Services that schedule, copy, retain, and restore
backups of cloud resources for you, so you write policies instead of
scripts. [AWS Backup](https://aws.amazon.com/backup/) covers EBS, RDS and
Aurora, DynamoDB, EFS, S3, and more;
[Azure Backup](https://learn.microsoft.com/en-us/azure/backup/backup-overview)
and [Google Cloud Backup and DR](https://cloud.google.com/backup-disaster-recovery/docs)
do the same for their platforms. You define backup plans (frequency,
retention, copy to another region or account) and vault policies; the
provider runs the jobs and stores the recovery points.

**How AWS Backup bills** ([AWS Backup pricing](https://aws.amazon.com/backup/pricing/),
us-east-1): per GB-month of backup storage by resource type and per GB
restored. Examples: S3 backups $0.05 per GB-month warm; EFS backups
$0.05 warm and $0.01 cold; restores of S3 and EFS warm backups $0.02 per
GB. EBS snapshots cost $0.05 per GB-month, or $0.0125 in the snapshot
archive tier with a $0.03 per GB restore fee and a 90-day minimum.
**Logically air-gapped vaults** keep backup copies in a separate,
locked vault (with their own prices, for example $0.0575 per GB-month for
warm S3 backups) so a compromised production account cannot delete them.

Managed backup storage costs more per GB than a raw archive class, and
you pay for convenience: consistent snapshots, policies, cross-account
copies, and one-click restores. For a database, also compare with the
provider's built-in point-in-time recovery (see
[database backups and point-in-time recovery](../backups/database-backups-and-point-in-time-recovery.md)).

### Options compared

| Option | What it is | Pricing model | Minimum stay | Time to data | Strengths | Weaknesses | Lock-in |
|---|---|---|---|---|---|---|---|
| S3 Glacier Instant Retrieval | S3 class for rarely read data with instant access | $0.004/GB-month + $0.03/GB read | 90 days, 128 KB | Milliseconds | Instant restores, Object Lock, lifecycle | Retrieval fee hurts frequent restores | Medium: S3 API portable, restores out cost egress |
| S3 Glacier Flexible Retrieval | S3 archive class with a restore step | $0.0036/GB-month + free to $0.03/GB | 90 days, 40 KB overhead | 1 minute to 12 hours | Free bulk restores | Restore step, temporary copy charges | Medium |
| S3 Glacier Deep Archive | AWS's cheapest archive class | $0.00099/GB-month + $0.0025 to $0.02/GB | 180 days, 40 KB overhead | Within 12 or 48 hours | Lowest price for long retention | Slowest restores, no expedited tier | Medium |
| Azure Cool / Cold / Archive | Access tiers on Azure block blobs | $0.0152 / $0.0036 / $0.00099 per GB-month + per-GB reads | 30 / 90 / 180 days | ms / ms / up to 15 hours | Lifecycle, immutable storage, smart tier | Archive is offline; rehydration throughput limits | Medium |
| Google Nearline / Coldline / Archive | Cloud Storage classes | $0.010 / $0.004 / $0.0012 per GiB-month + per-GiB reads | 30 / 90 / 365 days | Milliseconds on all | Instant reads even from Archive | $0.05/GiB Archive reads, one-year minimum | Medium |
| Backblaze B2 | S3-compatible single-class store | $6.95/TB-month; egress free up to 3x stored | None | Milliseconds | Cheap, restores and egress included | No archive tier, fewer regions | Low |
| Wasabi | S3-compatible flat-price hot storage | $7.99/TB-month; no egress or API fees within policy | 90 days, 1 TB minimum charge | Milliseconds | Predictable bill, egress included | 90-day minimum, egress policy | Low to medium |
| R2 Infrequent Access | Warm tier with no egress fees | $0.01/GB-month + $0.01/GB read | 30 days | Milliseconds | Free egress for restores | No archive tier; bucket locks removable | Low |
| AWS Backup | Managed backup service for AWS resources | Per GB-month by resource type + per GB restored | Early-delete charges on cold storage | Depends on resource | Policies, cross-account copies, vault locks | Costs more per GB than raw archive classes | High (AWS-only recovery points) |

### Minimum durations, early deletion, and retrieval fees

| Provider and tier | Minimum billed duration | Early deletion | Retrieval |
|---|---|---|---|
| S3 Standard-IA / One Zone-IA | 30 days | Prorated remainder | $0.01 per GB |
| S3 Glacier Instant Retrieval | 90 days | Prorated remainder | $0.03 per GB |
| S3 Glacier Flexible Retrieval | 90 days | Prorated remainder | Free (bulk) to $0.03 per GB |
| S3 Glacier Deep Archive | 180 days | Prorated remainder | $0.0025 to $0.02 per GB |
| Azure Cool / Cold / Archive | 30 / 90 / 180 days | Prorated remainder | $0.01 / $0.03 / $0.02 (standard) per GB |
| Google Nearline / Coldline / Archive | 30 / 90 / 365 days | Charged as if stored for the minimum | $0.01 / $0.02 / $0.05 per GiB |
| Wasabi pay as you go | 90 days | "Timed deleted storage" until 90 days | None (within egress policy) |
| R2 Infrequent Access | 30 days | Charged for the minimum | $0.01 per GB |
| Backblaze B2 | None | None | None (egress free up to 3x stored) |

Minimums apply to **overwrites and tier changes too**, not only deletes.
A backup job that rewrites the same key every night in Glacier Instant
Retrieval pays 90 days for every version it replaces.

### Object lock and immutability

Ransomware and careless scripts both delete backups. **Write-once-read-
many (WORM)** settings make deletion impossible for a retention period:

- **S3 Object Lock** (requires versioning): **governance mode** blocks
  deletes and overwrites except for users granted a special permission;
  **compliance mode** blocks everyone, including the root user, and the
  retention cannot be shortened. **Legal holds** block deletion with no
  expiry until removed. A default retention can apply to every new object
  in the bucket. See
  [Locking objects with Object Lock](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock.html).
- **Azure immutable storage**: time-based retention policies and legal
  holds at container or version level; a locked time-based policy cannot
  be removed. See
  [immutable storage for blobs](https://learn.microsoft.com/en-us/azure/storage/blobs/immutable-storage-overview).
- **Google Cloud Storage**: bucket retention policies that can be
  permanently locked with
  [Bucket Lock](https://cloud.google.com/storage/docs/bucket-lock), and
  per-object [retention configurations](https://cloud.google.com/storage/docs/object-lock).
- **B2 and Wasabi** implement S3-style Object Lock; **R2** has bucket locks
  (removable by anyone who can edit the bucket configuration).

Use compliance mode (or a locked policy) only after testing: a mistake,
such as a 10-year retention on terabytes of test data, cannot be undone
and you will pay for it. Combine immutability with a **separate account**
for backups, so the credentials that run production cannot reach them.

### Lifecycle policies

A lifecycle rule moves objects to colder tiers by age and deletes them at
the end of retention, so tiering needs no scripts.

![Diagram: lifecycle of TaskFlow's nightly backup objects in S3, on a timeline. Day 0 to 30 in S3 Standard at $0.023 per GB-month, where restore tests read recent dumps; an Object Lock retention of 35 days in compliance mode blocks deletion and overwrites from day 0. Day 30 to 120 in Glacier Instant Retrieval at $0.004 (exactly its 90-day minimum). Day 120 to 2,555 in Glacier Deep Archive at $0.00099 (more than its 180-day minimum). At day 2,555, seven years, the object expires. Transition requests cost $0.02 per 1,000 to Glacier Instant Retrieval and $0.05 per 1,000 to Deep Archive. One 20 GB dump costs about $2.28 over seven years this way, compared with $38.64 if kept in S3 Standard.](backup-lifecycle-policy.svg)

Since September 2024, S3 lifecycle rules by default do not transition
objects smaller than 128 KB, because each transition is a billed request
and small objects can cost more to move than they save (see
[transitioning objects](https://docs.aws.amazon.com/AmazonS3/latest/userguide/lifecycle-transition-general-considerations.html)).
A single rule also cannot move an object out of a class before that
class's minimum duration: if Glacier Instant Retrieval starts at day 30,
Deep Archive can start no earlier than day 120.

### Worked example: 5 TB for a year with one full restore

!!! note "Prices checked November 2026"
    Prices are US-region list prices in USD (AWS us-east-1, Azure East US
    with locally redundant storage, Google Cloud us-central1), checked in
    November 2026 on the official pricing pages and price lists linked
    above. They change often; re-check them in the
    [AWS Pricing Calculator](https://calculator.aws/), the
    [Azure Pricing Calculator](https://azure.microsoft.com/en-us/pricing/calculator/),
    or the [Google Cloud Pricing Calculator](https://cloud.google.com/products/calculator)
    before deciding. Other regions (for example Mumbai or Pune) have
    different prices; select the region on the pricing page or
    calculator.

**Scenario.** TaskFlow keeps 5 TB of backup archives (5,120 GB, stored as
5,120 objects of 1 GB) for 12 months. Once during the year a disaster
forces a **full restore** of all 5 TB to servers in the same region (no
internet egress). Request charges are tiny with 1 GB objects but are
included.

```text
Option                         Storage (12 months)        Full restore                    Total     Time to data
S3 Standard                    5,120 x $0.023 x 12        none                          $1,413.12   immediate
S3 Standard-IA                 5,120 x $0.0125 x 12       5,120 x $0.01 = $51.20          $819.20   immediate
S3 Glacier Instant Retrieval   5,120 x $0.004 x 12        5,120 x $0.03 = $153.60         $399.36   immediate
S3 Glacier Flexible, bulk      5,120 x $0.0036 x 12       free + 3-day temp copy $11.78   $232.96   5-12 hours
S3 Deep Archive, bulk          5,120 x $0.00099 x 12      $12.80 + $0.13 + copy $11.78     $85.54   within 48 hours
S3 Deep Archive, standard      $60.83                     $102.40 + $0.51 + copy $11.78   $175.52   within 12 hours
Azure Archive, standard        5,120 x $0.00099 x 12      $102.40 + reads $2.56           $165.79   hours per blob, days in bulk
Azure Cold                     5,120 x $0.0036 x 12       $153.60 + reads $0.05           $374.83   immediate
Google Archive                 5,120 x $0.0012 x 12       $256.00 + reads $0.26           $329.99   immediate
Google Coldline                5,120 x $0.004 x 12        $102.40 + reads $0.05           $348.21   immediate
Backblaze B2                   5 TB x $6.95 x 12          free (under 3x stored)          $417.00   immediate
Wasabi                         5 TB x $7.99 x 12          free (egress under stored)      $479.40   immediate
Cloudflare R2 IA               5,120 x $0.01 x 12         $51.20 + reads $0.90            $666.50   immediate
```

The 3-day temporary copy is the restored data held at the S3 Standard
rate while it is copied back into service (5,120 x $0.023 x 3/30). If the
restore has to leave AWS (for example to on-premises servers), add
internet egress: 5,120 GB x $0.09 = $460.80 on S3. Backblaze B2, Wasabi
(within its egress policy), and R2 include that egress.

![Diagram: horizontal bar chart of the yearly cost of keeping 5 TB with one full restore, with the time to get data back beside each bar. S3 Standard $1,413 immediate; S3 Standard-IA $819 immediate; Cloudflare R2 Infrequent Access $667 immediate; Wasabi $479 immediate; Backblaze B2 $417 immediate; S3 Glacier Instant Retrieval $399 immediate; Google Cloud Archive $330 immediate; S3 Glacier Flexible Retrieval with bulk restore $233 in 5 to 12 hours; Azure Archive with standard rehydration $166 in hours to days; S3 Glacier Deep Archive with bulk restore $86 within 48 hours.](archive-restore-cost.svg)

What the example teaches:

- **Archive tiers win when restores are rare.** Deep Archive keeps 5 TB
  for a year and restores it once for about $86, one sixteenth of S3
  Standard, if you can wait up to 48 hours.
- **Retrieval fees can flip the ranking.** Google Archive costs almost as
  little to store as Deep Archive, but its $0.05 per GiB retrieval makes
  one full restore cost more than three times its yearly storage. With
  two full restores a year, Google Archive (about $586) would cost more
  than Glacier Instant Retrieval (about $553) or Coldline (about $451).
- **Time is the hidden column.** If the recovery time objective is four
  hours, every option marked "hours" or "days" is disqualified for the
  copy you restore first, whatever it costs.
- **Egress-inclusive providers win restores that leave the cloud.** For an
  off-site copy you might restore elsewhere, B2 and Wasabi include the
  transfer that would add $460.80 on S3.

## When to use and when not to use

Use archive tiers (Deep Archive, Azure Archive, Glacier Flexible, Google
Archive) for compliance retention, legal holds, year-end copies, and
second or third backup copies whose restore time can be hours. Use warm
or cold millisecond tiers (Standard-IA, Glacier Instant Retrieval,
Nearline, Coldline, Cool, Cold, B2, R2 IA) for the most recent backups you
would restore first. Do not put short-lived data, frequently rewritten
keys, or millions of tiny files in tiers with minimum durations or
per-object overheads, and do not rely on an archive tier as the only copy
when the recovery time objective is minutes.

| Backup need | Good fit | Avoid |
|---|---|---|
| Last 7-30 days, restore in minutes | S3 Standard or Standard-IA, Glacier IR, Azure Cool, Nearline, B2 | Any offline archive tier |
| Monthly copies kept a year | Glacier IR, Coldline, Azure Cold | Deep Archive if you restore often |
| Compliance retention for 7+ years | Deep Archive or Azure Archive with object lock | Standard (cost), Wasabi without lock |
| Offsite copy outside your main cloud | B2 or Wasabi with Object Lock | A bucket in the same account as production |
| Many small files (logs, thumbnails) | Bundle into archives first, then tier | Per-object tiering of tiny objects |

### Which to choose

| Scenario | Pick | Runner-up | Why |
|---|---|---|---|
| Side project or portfolio | Backblaze B2 | Cloudflare R2 | 10 GB free on both, no minimum duration on B2, restores free |
| Early startup | Managed database backups plus S3 lifecycle to Glacier IR and Deep Archive | B2 as the off-site copy | Built-in PITR covers fast restores; lifecycle makes long retention cheap without scripts |
| Steady high traffic (large, growing backup sets) | S3 with lifecycle: Standard-IA or Glacier IR for 30 days, then Deep Archive | Azure Cool then Archive | Most data ages into the cheapest tier automatically; recent backups stay fast |
| Spiky traffic (backup volume jumps after launches or imports) | S3 Intelligent-Tiering with archive tiers for unpredictable data | Glacier IR | No retrieval fees and automatic tiering when access patterns are unknown |
| Global audience (data in several regions) | Per-region backups plus cross-region copies to a cold tier | One central archive region if data residency allows | Restores should not depend on the region that failed; check residency rules first |
| Compliance-heavy (for example healthcare records) | S3 Glacier classes with Object Lock in compliance mode, in a separate account under the AWS BAA | Azure Archive with locked immutability under Microsoft's BAA | AWS and Microsoft state on their official [HIPAA](https://aws.amazon.com/compliance/hipaa-compliance/) and [HIPAA/HITECH](https://learn.microsoft.com/en-us/azure/compliance/offerings/offering-hipaa-us) pages that they sign BAAs for eligible services; immutability plus retention meets record-keeping rules |
| Large files and heavy egress (restores leave the cloud) | Backblaze B2 | Wasabi | Restore egress is included, so a full restore does not add a surprise transfer bill |
| Team with no ops people | AWS Backup (or Azure Backup) with a vault lock | B2 with a backup tool such as restic | Policies, schedules, and restores without scripts to maintain |

![Diagram: decision flow for picking a tier for a backup copy. Must this copy restore within minutes? Yes leads to a warm millisecond tier: S3 Standard-IA, Glacier Instant Retrieval, Azure Cool, Google Nearline, or Backblaze B2. No leads to: is it kept mainly for compliance and read less than once a year? Yes leads to an archive tier with object lock: Glacier Deep Archive, Azure Archive, or Google Archive. No leads to: will restores leave the cloud? Yes leads to Backblaze B2 or Wasabi, where egress is included. No leads to: is the data deleted or rewritten within 90 days? Yes leads to a tier without long minimums: S3 Standard, Backblaze B2, or R2 Standard. No leads to a cold tier: Glacier Flexible Retrieval, Coldline, or Azure Cold. A banner adds: in every case, lock it and keep it in a separate account.](backup-tier-decision-flow.svg)

## Practical examples

### A lifecycle rule for nightly database dumps (S3)

TaskFlow writes a compressed MongoDB dump every night to
`backups/mongo/<date>/`. Recent dumps stay in Standard for restore tests,
then age into Glacier Instant Retrieval and Deep Archive, and expire after
seven years:

```json
{
  "Rules": [
    {
      "ID": "mongo-dumps-tiering",
      "Status": "Enabled",
      "Filter": {
        "And": {
          "Prefix": "backups/mongo/",
          "ObjectSizeGreaterThan": 131072
        }
      },
      "Transitions": [
        { "Days": 30, "StorageClass": "GLACIER_IR" },
        { "Days": 120, "StorageClass": "DEEP_ARCHIVE" }
      ],
      "Expiration": { "Days": 2555 },
      "NoncurrentVersionExpiration": { "NoncurrentDays": 30 },
      "AbortIncompleteMultipartUpload": { "DaysAfterInitiation": 7 }
    }
  ]
}
```

```bash
aws s3api put-bucket-lifecycle-configuration \
  --bucket taskflow-backups \
  --lifecycle-configuration file://lifecycle.json
```

- `ObjectSizeGreaterThan` (128 KB) skips small marker files that would
  cost more to transition than to keep.
- Day 30 to 120 is exactly Glacier Instant Retrieval's 90-day minimum, so
  the second transition is allowed and incurs no early-deletion charge.
- `Expiration` deletes the current version after 2,555 days (seven
  years); with versioning, the delete marker is followed 30 days later by
  removal of the noncurrent version.

### Locking the bucket with Object Lock

```bash
# Create the bucket with Object Lock (versioning is enabled automatically)
aws s3api create-bucket --bucket taskflow-backups --object-lock-enabled-for-bucket

# Every new object version is locked for 35 days in compliance mode
aws s3api put-object-lock-configuration \
  --bucket taskflow-backups \
  --object-lock-configuration '{"ObjectLockEnabled":"Enabled","Rule":{"DefaultRetention":{"Mode":"COMPLIANCE","Days":35}}}'
```

Thirty-five days covers the 30-day window of daily restore points plus a
margin. Start with `GOVERNANCE` mode in a test bucket until the retention
settings are proven. The infrastructure-as-code version of this bucket
(separate account, encryption, replication) is in
[backup fundamentals and strategies](../backups/backup-fundamentals-and-strategies.md).

### Uploading straight into a cold class and restoring from Deep Archive

```bash
# Upload an already-compressed archive straight into Glacier Instant Retrieval
aws s3 cp taskflow-2026-11-13.archive.gz \
  s3://taskflow-backups/backups/mongo/2026-11-13/ --storage-class GLACIER_IR

# Restore a Deep Archive object for 3 days using the cheaper Bulk tier
aws s3api restore-object \
  --bucket taskflow-backups \
  --key backups/mongo/2025-01-31/taskflow.archive.gz \
  --restore-request '{"Days":3,"GlacierJobParameters":{"Tier":"Bulk"}}'

# Check progress: Restore shows ongoing-request="true" until the copy is ready
aws s3api head-object \
  --bucket taskflow-backups \
  --key backups/mongo/2025-01-31/taskflow.archive.gz \
  --query Restore
```

For thousands of objects, use S3 Batch Operations to submit the restores
and an event notification (`s3:ObjectRestore:Completed`) to start the
copy back.

### The same policy on Azure and Google Cloud

Azure lifecycle management (cool after 30 days, archive after 120, delete
after seven years; `daysAfterLastTierChangeGreaterThan` stops a
rehydrated blob from being archived again immediately). Azure prefixes
start with the container name, so here the container is `backups` and the
blob names start with `mongo/`:

```json
{
  "rules": [
    {
      "enabled": true,
      "name": "mongo-dumps-tiering",
      "type": "Lifecycle",
      "definition": {
        "filters": {
          "blobTypes": ["blockBlob"],
          "prefixMatch": ["backups/mongo/"]
        },
        "actions": {
          "baseBlob": {
            "tierToCool": { "daysAfterModificationGreaterThan": 30 },
            "tierToArchive": {
              "daysAfterModificationGreaterThan": 120,
              "daysAfterLastTierChangeGreaterThan": 7
            },
            "delete": { "daysAfterModificationGreaterThan": 2555 }
          }
        }
      }
    }
  ]
}
```

```bash
az storage account management-policy create \
  --account-name <storage-account> \
  --resource-group <resource-group> \
  --policy @policy.json
```

Google Cloud Storage lifecycle (Coldline after 30 days, Archive after 120,
delete after seven years):

```json
{
  "rule": [
    {
      "action": { "type": "SetStorageClass", "storageClass": "COLDLINE" },
      "condition": { "age": 30, "matchesStorageClass": ["STANDARD"], "matchesPrefix": ["backups/mongo/"] }
    },
    {
      "action": { "type": "SetStorageClass", "storageClass": "ARCHIVE" },
      "condition": { "age": 120, "matchesStorageClass": ["COLDLINE"], "matchesPrefix": ["backups/mongo/"] }
    },
    {
      "action": { "type": "Delete" },
      "condition": { "age": 2555, "matchesPrefix": ["backups/mongo/"] }
    }
  ]
}
```

```bash
gcloud storage buckets update gs://taskflow-backups --lifecycle-file=lifecycle.json
```

On Google Cloud, the move to Coldline at day 30 and to Archive at day 120
leaves each object in Coldline for exactly its 90-day minimum.

## Best practices

- Decide per copy: the copy you restore first lives in a millisecond
  tier; long-retention copies live in archive tiers.
- Write the restore time of each tier into the runbook next to the RTO,
  including bulk limits (Azure's 10 GiB per hour for priority rehydration,
  S3's restore request rate).
- Bundle small files into compressed archives before tiering, to avoid
  per-object overheads, minimum sizes, and transition request costs.
- Use lifecycle rules, not scripts, for tiering and expiry; include
  noncurrent-version and incomplete-multipart rules.
- Lock backups (Object Lock, immutable policies) and keep them in a
  separate account or subscription with separate credentials.
- Price a full restore, not just storage, before choosing a tier; include
  egress if the restore may leave the provider.
- Keep one copy with a different provider or region for the 3-2-1 rule.
- Test restores from every tier on a schedule, including an archive
  restore, so the hours-long steps are rehearsed before an incident.

## In production

- **A restore from Deep Archive takes two days during an outage.**
  *Detect:* `HeadObject` shows `ongoing-request="true"` long after the
  incident started; the runbook assumed hours. *Cause:* the only copy
  needed was archived, and Bulk was chosen (within 48 hours). *Fix:* keep
  the latest backups in a millisecond tier; use Standard (within 12
  hours) for urgent archive restores; document times per tier.
- **The bill shows large early-deletion charges.**
  *Detect:* usage types such as `EarlyDelete-GIR`, `EarlyDelete-GDA`, or
  Azure "Early Delete" meters. *Cause:* a rotation that deletes or
  overwrites daily backups before the tier's minimum (often a backup tool
  writing the same key each night). *Fix:* write each backup under a new
  key, align retention with minimum durations, or keep short-lived copies
  in a tier without minimums.
- **Archiving millions of small files cost more than expected.**
  *Detect:* storage bytes in Standard grow after archiving, and
  transition request charges spike. *Cause:* 40 KB of metadata per
  archived object (8 KB billed at the Standard rate) and one billed
  request per transition. *Fix:* tar or zip small files into large
  bundles before archiving; use the 128 KB lifecycle size filter.
- **Ransomware deleted the backups along with production.**
  *Detect:* CloudTrail shows `DeleteObject` or `PutBucketLifecycle` calls
  from a production role on the backup bucket. *Cause:* backups in the
  same account, writable by production credentials, without object lock.
  *Fix:* separate backup account, Object Lock in compliance mode or a
  logically air-gapped vault, write-only replication from production.
- **Rehydrated Azure blobs went straight back to Archive.**
  *Detect:* blobs return to the archive tier the day after rehydration.
  *Cause:* the lifecycle rule archives by last-modified age, and
  rehydration does not change last-modified time. *Fix:* add
  `daysAfterLastTierChangeGreaterThan` to `tierToArchive`, or rehydrate by
  copying to a new blob.
- **A compliance-mode lock keeps test data for ten years.**
  *Detect:* objects cannot be deleted, and the storage bill for a test
  bucket keeps growing. *Cause:* compliance mode set with a long default
  retention before the design was proven. *Fix:* nothing can shorten it;
  prevent recurrence by testing in governance mode and reviewing lock
  settings in code review.

## Important terminology

- **Backup:** A copy that can be loaded back into the application for
  recovery.
- **Archive:** Data kept long term for audit, legal, or compliance needs,
  where recovery speed matters less.
- **Storage tier / class:** A price and performance level for stored data
  (hot, warm, cold, archive).
- **Retrieval fee:** A per-GB charge for reading data from colder tiers.
- **Restore (S3 Glacier) / rehydration (Azure):** The step that makes
  archived data readable again, taking minutes to hours.
- **Minimum storage duration:** The minimum time billed for each object in
  a tier, even if deleted, overwritten, or moved sooner.
- **Early deletion charge:** The prorated charge for the unused part of a
  minimum duration.
- **WORM:** Write once, read many; data that cannot be changed or deleted
  during retention.
- **Object Lock (governance / compliance):** S3's WORM feature; compliance
  mode cannot be bypassed by anyone.
- **Legal hold:** A lock with no expiry, kept until explicitly removed.
- **Lifecycle rule:** A policy that changes tier or deletes objects by
  age, prefix, size, or version state.

## Common mistakes and misconceptions

- Choosing a tier by storage price alone and ignoring retrieval fees,
  restore time, and minimums.
- Keeping the only recent backup in an offline archive tier.
- Assuming "archive" means slow everywhere; Google's Archive class reads
  in milliseconds, at a high retrieval fee.
- Rewriting the same backup key nightly in a tier with a minimum duration.
- Archiving millions of small files one by one.
- Believing versioning alone protects against ransomware; versions can
  be deleted by anyone with the right permissions unless locked.
- Using compliance-mode locks before testing retention settings.
- Forgetting that restores which leave the provider pay egress.

## Revision questions

1. What is the difference between a backup and an archive, and how does
   that difference decide the storage tier?
2. Explain how restoring an object from S3 Glacier Deep Archive works,
   step by step, and what it costs besides the retrieval fee.
3. Why does Azure's Archive tier make a 5 TB emergency restore a
   multi-day job?
4. Calculate the yearly cost of keeping 2 TB (2,048 GB) in S3 Glacier
   Instant Retrieval with one full restore, in us-east-1.
   (Answer: 2,048 x $0.004 x 12 = $98.30; 2,048 x $0.03 = $61.44; total
   $159.74.)
5. A backup tool overwrites `latest.tar.gz` every night in Glacier
   Instant Retrieval. What does it pay for each overwrite, and how do you
   fix it?
6. When is Google Cloud's Archive class a better choice than S3 Glacier
   Deep Archive, and when is it worse?
7. What is the difference between governance and compliance mode in S3
   Object Lock, and why test in governance mode first?
8. Your RTO is 4 hours and your retention requirement is 7 years. Design
   a tiering plan and say which tiers each copy uses.

## Further learning

- [Amazon S3 storage classes](https://aws.amazon.com/s3/storage-classes/)
  and [archive retrieval options](https://docs.aws.amazon.com/AmazonS3/latest/userguide/restoring-objects-retrieval-options.html)
- [Managing the lifecycle of objects (S3)](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lifecycle-mgmt.html)
- [Azure access tiers](https://learn.microsoft.com/en-us/azure/storage/blobs/access-tiers-overview)
  and [lifecycle management](https://learn.microsoft.com/en-us/azure/storage/blobs/lifecycle-management-overview)
- [Google Cloud Storage lifecycle](https://cloud.google.com/storage/docs/lifecycle)
- [AWS Backup: logically air-gapped vaults](https://docs.aws.amazon.com/aws-backup/latest/devguide/logicallyairgappedvault.html)
- [AWS Pricing Calculator](https://calculator.aws/),
  [Azure Pricing Calculator](https://azure.microsoft.com/en-us/pricing/calculator/),
  [Google Cloud Pricing Calculator](https://cloud.google.com/products/calculator)
- Related: [backups overview](../backups.md),
  [MongoDB backup and restore](../../../04-databases/mongodb/backup-and-restore.md)
- Next: [cost optimization and cloud bills](cost-optimization-and-cloud-bills.md).
  Back to the [hosting and cloud platforms overview](../hosting-and-platforms.md).
