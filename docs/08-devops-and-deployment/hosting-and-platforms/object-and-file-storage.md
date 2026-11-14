# Object and File Storage

Almost every application stores files: user uploads, exported reports,
build artifacts, images, backups, logs. Where those bytes live decides how
much you pay every month, how fast users can download them, and how hard
it is to leave a provider later. This lesson explains the three kinds of
cloud storage (object, block, and file), every major object store and its
storage classes (Amazon S3, Cloudflare R2, Backblaze B2, Wasabi, Google
Cloud Storage, Azure Blob Storage, DigitalOcean Spaces), the block and
file services that sit next to virtual machines, the egress economics that
decide most storage choices, and presigned uploads that keep large files
off your API servers.

It follows [managed databases](managed-databases.md): databases hold
structured records; this page covers everything that is a file. Archive
tiers for backups get their own lesson in
[backup and archive storage](backup-and-archive-storage.md).

## Why it matters

Storage looks cheap on a pricing page, a few cents per gigabyte per
month, so teams rarely think about it until the bill arrives. The bill is
usually not driven by storage at all. It is driven by **egress** (data
leaving the provider's network), by **requests** (millions of small reads
and writes), and by **retrieval and minimum-duration fees** on the colder
classes. A team that stores 10 TB of user files and lets users download
50 TB a month can pay more than $4,000 a month on one provider and under
$200 on another, for the same bytes.

The kind of storage also shapes the architecture. Object storage scales
without limits and lets any number of servers share files, which is what
makes stateless API servers possible. Block storage is a disk for one
server. File storage is a shared network drive. Choosing the wrong one
leads to classic failures: uploads saved on an instance's local disk that
vanish when the instance is replaced, a shared filesystem used as a
database, or a bucket of private documents left publicly readable.

## Real-world usage

- **Dropbox (Magic Pocket, 2016).** In
  [Scaling to exabytes and beyond](https://dropbox.tech/infrastructure/magic-pocket-infrastructure)
  Dropbox explains that it moved over 90% of its users' data from Amazon
  S3 to its own storage system, Magic Pocket. The reasons given are
  performance, the ability to customize the whole stack end to end for
  its workload, and better unit economics at its scale. It kept using AWS
  where that made sense, for example to store data in Germany for European
  business customers.
- **37signals (2023-2025).** In
  [We stand to save $7m over five years from our cloud exit](https://world.hey.com/dhh/we-stand-to-save-7m-over-five-years-from-our-cloud-exit-53996caa)
  the company behind Basecamp reported a 2022 cloud bill of $3.2 million,
  just under $1 million of it for 8 PB in S3. In
  [It's five grand a day to miss our S3 exit](https://world.hey.com/dhh/it-s-five-grand-a-day-to-miss-our-s3-exit-b8293563)
  (March 2025) it reported spending just under $1.5 million a year on S3
  and replacing it with about $1.5 million of storage hardware, and noted
  that AWS offered a free 60-day egress window for leaving. Storage at
  petabyte scale with steady growth is the case where owning hardware can
  win.
- **Cloudflare R2 (2021).**
  [Announcing Cloudflare R2 Storage](https://blog.cloudflare.com/introducing-r2-object-storage/)
  states that R2 was built to cut the egress fees of typical cloud storage
  "to zero", describing those fees as charges "that don't correspond to
  any customer value". R2's pricing has no egress line at all, which is
  why it appears in the worked example below.
- **AWS (2024).**
  [Free data transfer out to internet when moving out of AWS](https://aws.amazon.com/blogs/aws/free-data-transfer-out-to-internet-when-moving-out-of-aws/)
  announced that customers leaving AWS can request free data transfer out
  for that move. Egress fees are a real switching cost, and providers now
  treat them as part of the competitive and regulatory picture.

**Popular tools and providers:** Amazon S3, Cloudflare R2, Backblaze B2,
Wasabi, Google Cloud Storage, Azure Blob Storage, DigitalOcean Spaces,
Ceph RADOS Gateway (self-hosted, S3-compatible), and the `rclone` and AWS
CLI tools for moving data between them.

## How it works

### Object, block, and file storage

| | Object storage | Block storage | File storage |
|---|---|---|---|
| What you get | Buckets of objects addressed by key over HTTPS | A raw virtual disk attached to one server | A shared network filesystem (NFS or SMB) |
| How you use it | `PUT`, `GET`, `DELETE`, `LIST` through an API or SDK | Format it (ext4, XFS) and mount it like a local disk | Mount it on many servers at once |
| Who can read it | Any client with permission, from anywhere | The one server it is attached to (with rare exceptions) | Every server that mounts it |
| Edits | Replace the whole object; no in-place edits | Byte-level random reads and writes | File-level reads and writes with locking |
| Scale | Practically unlimited; you never resize | You choose a size and grow it | Grows automatically on most managed services |
| Typical latency | Tens of milliseconds per request | Sub-millisecond to a few milliseconds | Low milliseconds |
| Typical use | Uploads, media, static assets, backups, data lakes | Root disks, self-hosted databases | Shared content for legacy apps, home directories, ML datasets |
| Examples | S3, R2, B2, Wasabi, GCS, Azure Blob, Spaces | EBS, Persistent Disk and Hyperdisk, Azure Managed Disks | EFS, FSx, Azure Files, Filestore |

![Diagram: three side-by-side panels. Object storage: many clients (browser, API server, CDN) send PUT and GET requests over HTTPS to a bucket that holds objects addressed by keys such as tasks/42/report.pdf. Block storage: one virtual machine attaches one volume in the same availability zone and puts its own filesystem on it. File storage: three servers mount the same NFS share and see the same directory tree. Caption: object storage is shared over an API, block storage is one server's disk, file storage is a shared drive.](object-block-file-storage.svg)

The rule of thumb for a web application such as TaskFlow API: user files
go to **object storage**, the database's disk is **block storage** (or a
managed database that hides it), and **file storage** appears only when
software insists on a shared POSIX filesystem.

### How object storage works underneath

An object store is a giant key-value store for files. You create a
**bucket** (a namespace with its own settings), then write **objects**
under **keys** such as `tasks/42/attachments/report.pdf`. The slashes are
part of the key; there are no real folders, only key prefixes that tools
display as folders.

- **Immutable objects.** You cannot change byte 500 of an object. You
  upload a new version of the whole object. Large files are uploaded in
  parts (multipart upload), so a failed part can be retried alone and
  parts can upload in parallel.
- **Durability by redundancy.** Amazon S3 Standard is designed for
  99.999999999% (eleven nines) durability and stores data across at least
  three Availability Zones. Providers use replication and erasure coding
  (splitting data into fragments plus parity, so lost fragments can be
  rebuilt) across many disks and buildings.
- **Consistency.** Amazon S3 has provided
  [strong read-after-write consistency](https://aws.amazon.com/s3/consistency/)
  since December 2020: after a successful write, every read returns the
  new object. Older articles that warn about eventual consistency in S3
  are out of date.
- **Access control.** Buckets are private by default. Access comes from
  identity policies, bucket policies, and short-lived **presigned URLs**
  that let a browser upload or download one object without credentials.
- **Metadata and features.** Each object carries metadata (content type,
  custom headers). Buckets add versioning, lifecycle rules, replication,
  event notifications, and object lock (write-once retention).
- **S3 compatibility.** The S3 API became the industry's common language.
  R2, B2, Wasabi, Spaces, GCS (through its XML API), and self-hosted Ceph
  accept S3-style requests, so the same SDK often works against all of
  them with a different endpoint. Compatibility is never total: check the
  provider's list of supported operations.

### What you are billed for

!!! note "Prices checked November 2026"
    All prices on this page are US-region list prices (AWS us-east-1,
    Google Cloud us-central1, Azure East US) in USD, checked in November
    2026 from the official pricing pages and price lists linked next to
    each number. Prices change often; re-check them in the
    [AWS Pricing Calculator](https://calculator.aws/), the
    [Google Cloud Pricing Calculator](https://cloud.google.com/products/calculator),
    or the [Azure Pricing Calculator](https://azure.microsoft.com/en-us/pricing/calculator/)
    before deciding. Other regions, for example Mumbai (ap-south-1) or
    India Central, are priced differently: select the region in the
    calculator or on the pricing page.

Every object store bills some combination of these meters:

| Meter | Unit | Notes |
|---|---|---|
| Storage | GB-month (average stored over the month) | Lower in colder classes |
| Write requests (PUT, COPY, POST, LIST) | Per 1,000 or per million | Often called Class A operations |
| Read requests (GET, HEAD) | Per 1,000 or per million | Often called Class B operations |
| Retrieval | Per GB read | Only on infrequent-access and archive classes |
| Minimum storage duration | Days | Deleting early is billed as if the object stayed |
| Minimum billable object size | KB | Small objects billed as if larger (128 KB on S3 IA classes) |
| Egress | Per GB leaving the provider | The largest cost for download-heavy apps |
| Management features | Per object or per GB | Inventory, Intelligent-Tiering monitoring, replication |

### Amazon S3 and its storage classes

**What it is.** [Amazon S3](https://aws.amazon.com/s3/) (Simple Storage
Service) is AWS's object store and the reference design for the whole
category. You manage buckets, keys, permissions, lifecycle rules, and the
choice of storage class per object; AWS manages the hardware, redundancy,
scaling, and durability. A storage class is a per-object setting that
trades storage price against access price and speed.

| Class | What it is for | Storage per GB-month | Retrieval per GB | Minimum duration | First byte |
|---|---|---|---|---|---|
| S3 Express One Zone | Latency-critical hot data in one zone you choose (directory buckets) | $0.11 | $0.0006, plus $0.0032 per GB uploaded | None | Single-digit milliseconds |
| S3 Standard | Default for active data | $0.023 (first 50 TB), $0.022 (next 450 TB), $0.021 (over 500 TB) | None | None | Milliseconds |
| S3 Intelligent-Tiering | Unknown or changing access; S3 moves each object between tiers | $0.023 / $0.0125 / $0.004 by tier, plus $0.0025 per 1,000 objects monitored | None | None | Milliseconds (optional archive tiers: hours) |
| S3 Standard-IA | Accessed about once a month, needs millisecond access | $0.0125 | $0.01 | 30 days, 128 KB minimum size | Milliseconds |
| S3 One Zone-IA | Re-creatable data in one zone | $0.01 | $0.01 | 30 days, 128 KB minimum size | Milliseconds |
| S3 Glacier Instant Retrieval | Archive read about once a quarter, instantly | $0.004 | $0.03 | 90 days, 128 KB minimum size | Milliseconds |
| S3 Glacier Flexible Retrieval | Archive restored in minutes to hours | $0.0036 | $0.03 / $0.01 / free (expedited / standard / bulk) | 90 days, 40 KB overhead per object | 1-5 minutes to 12 hours |
| S3 Glacier Deep Archive | Long-term retention, restored in hours | $0.00099 | $0.02 / $0.0025 (standard / bulk) | 180 days, 40 KB overhead per object | Within 12 or 48 hours |

Sources: [Amazon S3 pricing](https://aws.amazon.com/s3/pricing/) and the
public [AWS Price List](https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/price-changes.html)
for us-east-1. Requests on S3 Standard cost $0.005 per 1,000 writes and
$0.0004 per 1,000 reads; the infrequent-access classes charge more per
request ($0.01 per 1,000 writes on Standard-IA, $0.02 per 1,000 on
Glacier Instant Retrieval). Durability, availability, and minimums are
from the S3 user guide's
[storage class comparison](https://docs.aws.amazon.com/AmazonS3/latest/userguide/storage-class-intro.html#sc-compare).

![Diagram: a ladder of eight S3 storage classes from hottest to coldest. Express One Zone at $0.11 per GB-month with single-digit millisecond access in one zone; Standard at $0.023; Intelligent-Tiering moving objects automatically between $0.023, $0.0125, and $0.004; Standard-IA at $0.0125 with a 30-day minimum and $0.01 per GB retrieval; One Zone-IA at $0.01 in one zone; Glacier Instant Retrieval at $0.004 with a 90-day minimum and $0.03 per GB retrieval; Glacier Flexible Retrieval at $0.0036 restored in minutes to hours; Deep Archive at $0.00099 with a 180-day minimum, restored within 12 to 48 hours. An arrow down the left says storage gets cheaper; an arrow down the right says reads get slower and more expensive.](s3-storage-class-ladder.svg)

How the classes behave in practice:

- **Intelligent-Tiering** watches each object. After 30 days without
  access it moves to the Infrequent Access tier, after 90 days to Archive
  Instant Access; optional Archive Access (90+ days) and Deep Archive
  Access (180+ days) tiers can be switched on for data that tolerates
  restores. Any read moves the object back to the frequent tier, with no
  retrieval fee. Objects under 128 KB are not monitored and always pay
  frequent-tier rates, so it suits large objects with unpredictable
  access. ([How S3 Intelligent-Tiering works](https://docs.aws.amazon.com/AmazonS3/latest/userguide/intelligent-tiering-overview.html))
- **Minimums bite small objects.** A 10 KB thumbnail in Standard-IA is
  billed as 128 KB, so it costs more than in Standard. Glacier Flexible
  Retrieval and Deep Archive add 40 KB of metadata per object (8 KB at the
  Standard rate), which dominates for millions of small files: bundle them
  into archives first.
- **One Zone classes** keep a single copy set in one Availability Zone.
  The data is still durable against disk failures but is lost if that
  zone is destroyed. Use them only for data you can re-create, such as
  thumbnails or replicas.
- **Express One Zone** is the high-performance class: single-digit
  millisecond access, lower request prices than Standard, but almost five
  times the storage price. It suits analytics and ML jobs that read the
  same data many times from compute in the same zone, not user uploads.

### Cloudflare R2

**What it is.** [R2](https://developers.cloudflare.com/r2/) is
Cloudflare's S3-compatible object store. It runs on Cloudflare's own
network, which is also a large CDN, and its headline feature is **no
egress fees** in any storage class. You manage buckets, keys, tokens, and
lifecycle rules; Cloudflare manages everything else. Buckets can be
exposed on a custom domain behind Cloudflare's cache, and Workers (edge
functions) can read and write R2 directly.

**Pricing** ([R2 pricing](https://developers.cloudflare.com/r2/pricing/)):
Standard storage $0.015 per GB-month, Class A operations (writes, lists)
$4.50 per million, Class B operations (reads) $0.36 per million, egress
free. Infrequent Access storage is $0.01 per GB-month with $9.00 and $0.90
per million operations, a $0.01 per GB retrieval fee, and a 30-day
minimum. The monthly free tier covers 10 GB-month of Standard storage,
1 million Class A and 10 million Class B operations. Usage is rounded up
to the next billing unit (1.1 GB-month is billed as 2).

**Trade-offs.** No egress fees changes the economics for download-heavy
apps. The downsides: fewer storage classes and no deep-archive tier, an
S3 API that does not implement every operation (for example S3 Object
Lock is listed as unimplemented; R2 has its own
[bucket locks](https://developers.cloudflare.com/r2/buckets/bucket-locks/)),
presigned URLs for `GET`, `HEAD`, `PUT`, and `DELETE` but not HTML form
`POST` uploads, and a smaller compliance catalogue than the hyperscalers.

### Backblaze B2 Cloud Storage

**What it is.** [Backblaze B2](https://www.backblaze.com/cloud-storage) is
an S3-compatible object store from a company that started in consumer
backup. It has a single storage class and a deliberately simple price.

**Pricing** ([B2 pricing](https://www.backblaze.com/cloud-storage/pricing)):
$6.95 per TB per month, billed by byte-hour, with the first 10 GB free and
no minimum file size or storage duration. Egress is free up to three
times your average monthly stored data, then $0.01 per GB, and unlimited
free egress applies when downloading through partner CDNs and compute
providers (the page lists Fastly, Cloudflare, bunny.net, CacheFly,
CoreWeave, Equinix Metal, Vultr, and phoenixNAP). Class A, B, and C API
calls are free on pay-as-you-go; Class D calls cost $0.004 per 10,000
after 2,500 free per day.

**Trade-offs.** Very cheap for storage-heavy data with moderate reads.
Fewer regions than a hyperscaler, no storage classes or archive tier, and
fewer surrounding services (no built-in event-driven compute next to the
data).

### Wasabi Hot Cloud Storage

**What it is.** [Wasabi](https://wasabi.com/) sells S3-compatible "hot"
storage at a flat price per TB with **no egress or API request fees**.

**Pricing** ([Wasabi pricing](https://wasabi.com/pricing)): pay as you go
from $7.99 per TB per month, with a minimum charge of 1 TB of active
storage and a **90-day minimum storage duration** (deleted data is billed
as "timed deleted storage" until 90 days). Reserved capacity in 1-, 3-, or
5-year terms is cheaper and has a 30-day minimum.

**The egress catch.** Egress is free under a policy: the
[pricing FAQ](https://wasabi.com/pricing/faq) says that if your monthly
egress is greater than your active storage, your use case "is not a good
fit" for the free egress policy, and Wasabi reserves the right to limit
or suspend service for regular overuse. Wasabi suits backups and archives
that are written often and read rarely. It does not suit a public
download site serving each file many times a month, unless a CDN in front
absorbs most of the reads.

### DigitalOcean Spaces

**What it is.** [Spaces](https://docs.digitalocean.com/products/spaces/)
is DigitalOcean's S3-compatible object store with a built-in CDN, aimed at
teams already running Droplets or App Platform.

**Pricing** ([Spaces pricing](https://docs.digitalocean.com/products/spaces/details/pricing/)):
a $5 monthly subscription includes 250 GiB of storage and 1,024 GiB of
outbound transfer; extra storage is $0.02 per GiB-month and extra transfer
$0.01 per GiB. The CDN is included, and its traffic counts against the
same transfer allowance. Spaces Cold Storage costs $0.007 per GiB-month
with a $0.01 per GiB retrieval fee (waived up to your average daily cold
storage usage) and a 30-day minimum.

**Trade-offs.** Predictable and simple, with a CDN in the box. Fewer
regions and features than S3, and the $0.01 per GiB transfer price, while
low, still adds up for heavy downloads.

### Google Cloud Storage

**What it is.** [Cloud Storage](https://cloud.google.com/storage) is
Google Cloud's object store. Buckets are regional, dual-region, or
multi-region, and each object has one of four classes. It integrates with
BigQuery, Cloud Run, and Google's CDN products.

**Pricing** ([Cloud Storage pricing](https://cloud.google.com/storage/pricing),
us-central1 and us-east1): Standard $0.020 per GiB-month, Nearline $0.010
(30-day minimum, $0.01 per GiB retrieval), Coldline $0.004 (90 days,
$0.02 per GiB), Archive $0.0012 (365 days, $0.05 per GiB). Operations on
Standard cost $0.005 per 1,000 Class A and $0.0004 per 1,000 Class B.
Unlike AWS's archive classes, every GCS class returns the first byte in
milliseconds; the colder classes are cheaper to keep and dearer to read.
**Autoclass** can move objects between classes automatically, and
retrieval fees do not apply in Autoclass buckets.

### Azure Blob Storage

**What it is.** [Blob Storage](https://learn.microsoft.com/en-us/azure/storage/blobs/storage-blobs-introduction)
is Azure's object store, organised as storage accounts that contain
containers that contain blobs. Each block blob has an access tier.

**Pricing** ([Blob pricing](https://azure.microsoft.com/en-us/pricing/details/storage/blobs/),
East US, locally redundant storage, from the
[Azure Retail Prices API](https://learn.microsoft.com/en-us/rest/api/cost-management/retail-prices/azure-retail-prices)):
Hot $0.0208 per GB-month (first 50 TB), Cool $0.0152 (30-day minimum,
$0.01 per GB read), Cold $0.0036 (90 days, $0.03 per GB), Archive
$0.00099 (180 days, $0.02 per GB standard rehydration, $0.10 per GB high
priority). Archive is offline: a blob must be rehydrated, which can take
up to 15 hours (see
[Access tiers for blob data](https://learn.microsoft.com/en-us/azure/storage/blobs/access-tiers-overview)).

### Options compared

| Option | What it is | Storage price | Egress | Free tier | Strengths | Weaknesses | Lock-in |
|---|---|---|---|---|---|---|---|
| Amazon S3 | AWS's object store with eight storage classes | $0.023/GB Standard down to $0.00099 Deep Archive | $0.09/GB first 10 TB (less via CloudFront) | 100 GB/month egress across AWS | Most features, classes, integrations, compliance programs | Egress and request costs; many knobs | Medium: S3 API is portable, the surrounding services are not |
| Cloudflare R2 | S3-compatible store on Cloudflare's network | $0.015 Standard, $0.01 IA | Free | 10 GB-month, 1M writes, 10M reads | Zero egress, edge integration with Workers | Two classes, partial S3 API, no archive tier | Low: S3 API, no exit fee |
| Backblaze B2 | S3-compatible single-class store | $6.95/TB | Free up to 3x stored, $0.01/GB after; free via partner CDNs | 10 GB | Cheapest simple storage, no minimums | One class, fewer regions and services | Low |
| Wasabi | S3-compatible flat-price hot storage | $7.99/TB (1 TB minimum) | No fee if egress stays at or below stored data | None | Flat price, no API fees | 90-day minimum; not for download-heavy use | Low to medium (minimums) |
| DigitalOcean Spaces | S3-compatible store with a built-in CDN | $5 includes 250 GiB, then $0.02/GiB | 1,024 GiB included, then $0.01/GiB | Included allowance | Built-in CDN, simple bill | Fewer regions and features | Low |
| Google Cloud Storage | Google Cloud's object store with four classes | $0.020 Standard down to $0.0012 Archive | Per GB, by destination | 5 GB-months in us-east1, us-west1, us-central1 | Millisecond access on all classes, Autoclass | Retrieval fees on cold classes | Medium |
| Azure Blob Storage | Azure's object store with access tiers | $0.0208 Hot down to $0.00099 Archive | Per GB, by destination | Limited trial credits | Fits Microsoft-centric estates, smart tier | Archive is offline (hours) | Medium |

The Google Cloud free tier line comes from the
[Google Cloud Free Program](https://docs.cloud.google.com/free/docs/free-cloud-features),
which also includes 5,000 Class A and 50,000 Class B operations and 100 GB
of outbound transfer from North America per month.

### Block storage: EBS, Persistent Disk, Managed Disks

**What it is.** Block storage is a network-attached virtual disk.
[Amazon EBS](https://aws.amazon.com/ebs/), Google Cloud
[Persistent Disk and Hyperdisk](https://cloud.google.com/compute/docs/disks),
and [Azure Managed Disks](https://learn.microsoft.com/en-us/azure/virtual-machines/managed-disks-overview)
all work the same way: you create a volume of a chosen size and
performance in one zone, attach it to a VM, and put a filesystem on it.
The provider replicates the volume inside the zone; you manage the
filesystem, resizing, and snapshots. A volume is tied to its zone, so a
VM in another zone cannot attach it without restoring a snapshot.

On AWS, the default `gp3` volume costs $0.08 per GB-month and includes a
baseline of 3,000 IOPS and 125 MB/s; extra IOPS cost $0.005 per
provisioned IOPS-month and extra throughput $0.04 per provisioned MiB/s
per month in us-east-1 (price list effective November 2026; see
[EBS pricing](https://aws.amazon.com/ebs/pricing/)). Snapshots, which are
incremental copies stored in S3, cost $0.05 per GB-month, or $0.0125 in
the snapshot archive tier with a $0.03 per GB restore fee. Compare $0.08
for a block volume with $0.023 for S3 Standard: block storage is for data
a running server needs as a disk, not for piles of files.

### File storage: EFS, FSx, Azure Files, Filestore

**What it is.** Managed file storage is a network filesystem that many
servers mount at once. [Amazon EFS](https://aws.amazon.com/efs/) speaks
NFS, grows and shrinks automatically, and spans zones;
[Amazon FSx](https://aws.amazon.com/fsx/) offers managed Windows File
Server, Lustre, NetApp ONTAP, and OpenZFS;
[Azure Files](https://learn.microsoft.com/en-us/azure/storage/files/storage-files-introduction)
offers SMB and NFS shares; Google Cloud
[Filestore](https://cloud.google.com/filestore) offers managed NFS. You
manage mounts and permissions; the provider manages servers, replication,
and capacity.

EFS Standard storage costs $0.30 per GB-month in us-east-1, more than ten
times S3 Standard, with infrequent-access and archive tiers and per-GB
charges for elastic throughput ([EFS pricing](https://aws.amazon.com/efs/pricing/)).
Use shared file storage when software needs POSIX semantics: a CMS that
writes uploads to a directory, a legacy app you cannot change, or a
machine-learning job that reads a dataset as files. For new code, object
storage is cheaper and scales further.

### Egress: the cost that decides most storage choices

Storage is billed once per month per byte; egress is billed **every time
a byte is downloaded**. For anything users download repeatedly (images,
videos, exports, installers), egress quickly outgrows storage.

**Worked example.** TaskFlow lets teams attach files to tasks. After two
years it stores **10 TB** (10,240 GB) of attachments, and users download
**50 TB** (51,200 GB) a month. Average file size is 5 MiB, so that is
about 10.5 million downloads (10,485,760 GET requests). Monthly cost, US
list prices:

```text
S3 Standard, downloads straight from S3
  storage   10,240 GB x $0.023                        =   $235.52
  egress    10,240 GB x $0.09 + 40,960 GB x $0.085    = $4,403.20
  requests  10,485,760 / 1,000 x $0.0004              =     $4.19
  total (ignoring the 100 GB/month AWS free allowance)  ~ $4,643

S3 Standard + CloudFront, pay-as-you-go
  storage                                             =   $235.52
  S3 to CloudFront transfer                           =     $0.00  (free from AWS origins)
  CloudFront egress: 1,024 GB free, 9,216 GB x $0.085,
                     40,960 GB x $0.080               = $4,060.16
  HTTPS requests: (10,485,760 - 10,000,000 free)
                  / 10,000 x $0.01                    =     $0.49
  S3 GETs on cache misses (10%): 1,048,576 / 1,000
                  x $0.0004                           =     $0.42
  total                                               ~ $4,297

S3 Standard + CloudFront Business flat-rate plan
  plan ($200/month: 125M requests, 50 TB transfer)    =   $200.00
  storage                                             =   $235.52
  total (if the workload fits the plan's terms)       ~   $436

Cloudflare R2
  storage   (10,240 - 10 free) GB x $0.015            =   $153.45
  reads     485,760 beyond the free 10M, billed as 1M
            x $0.36                                   =     $0.36
  egress                                              =     $0.00
  total                                               ~   $154

Backblaze B2, downloads straight from B2
  storage   10 TB x $6.95                             =    $69.50
  egress    30 TB free (3 x stored), 20,480 GB x $0.01 =   $204.80
  total                                               ~   $274

Backblaze B2 + bunny.net CDN (partner: B2 egress free)
  storage                                             =    $69.50
  CDN       51,200 GB x $0.01 (Europe and North America) = $512.00
  total                                               ~   $582

Wasabi + bunny.net CDN
  storage   10 TB x $7.99                             =    $79.90
  CDN       51,200 GB x $0.01                         =   $512.00
  origin egress ~5 TB at a 90% cache hit ratio: under the 10 TB stored,
            so inside Wasabi's free egress policy     =     $0.00
  total                                               ~   $592

DigitalOcean Spaces (CDN included)
  base      $5 (250 GiB + 1,024 GiB transfer)         =     $5.00
  storage   9,990 GiB x $0.02                         =   $199.80
  transfer  50,176 GiB x $0.01                        =   $501.76
  total                                               ~   $707
```

Sources: [S3 pricing](https://aws.amazon.com/s3/pricing/),
[CloudFront pay-as-you-go pricing](https://aws.amazon.com/cloudfront/pricing/pay-as-you-go/),
[CloudFront flat-rate plans](https://aws.amazon.com/cloudfront/pricing/),
[R2 pricing](https://developers.cloudflare.com/r2/pricing/),
[B2 pricing](https://www.backblaze.com/cloud-storage/pricing),
[bunny.net CDN pricing](https://bunny.net/pricing/cdn/),
[Wasabi pricing](https://wasabi.com/pricing),
[Spaces pricing](https://docs.digitalocean.com/products/spaces/details/pricing/).

![Diagram: horizontal bar chart of the monthly cost of storing 10 TB and serving 50 TB of downloads. S3 direct about $4,643; S3 plus CloudFront pay-as-you-go about $4,297; DigitalOcean Spaces about $707; Wasabi plus bunny.net CDN about $592; Backblaze B2 plus bunny.net CDN about $582; S3 plus CloudFront Business flat-rate plan about $436; Backblaze B2 direct about $274; Cloudflare R2 about $154. Storage itself is under $240 in every case; the rest is egress.](egress-cost-comparison.svg)

What the numbers teach:

- **Storage is the small part.** Every option stores 10 TB for $70 to
  $236. The spread from $154 to $4,643 is almost entirely egress.
- **A CDN alone does not fix hyperscaler egress.** CloudFront's
  pay-as-you-go rates are only a little below S3's direct rates. What
  changes the bill is a provider or plan whose model is not per-GB egress:
  R2, B2's partner egress, or CloudFront's
  [flat-rate plans](https://aws.amazon.com/blogs/networking-and-content-delivery/introducing-flat-rate-pricing-plans-with-no-overages/)
  (launched November 2025; Free $0, Pro $15, Business $200, Premium
  $1,000 a month). Flat-rate plans cover one distribution, have no overage
  charges, and may reduce performance if you exceed the allowance, so
  read the terms and watch the usage alerts.
- **"Free egress" has conditions.** B2's is free up to 3x storage or via
  partners; Wasabi's assumes egress stays at or below stored data;
  Spaces includes 1 TB. R2 has no egress line at all.
- **Requests matter for small files.** At 5 MiB per file, requests cost a
  few dollars. Serve 100 KB thumbnails instead and the same 50 TB becomes
  about 537 million requests: R2 would bill about $190 in Class B
  operations and CloudFront about $527 in HTTPS requests.

### Presigned uploads: keep files off your servers

If browsers upload files through the API, every byte crosses the API
servers twice (in and out), ties up connections, and needs large request
size limits. The standard pattern is a **presigned upload**:

1. The browser asks TaskFlow API for permission to upload one file,
   sending its name, type, and size.
2. The API checks the user's rights and the file type and size, chooses
   the object key itself (never trust a client-supplied path), and signs
   a short-lived upload URL or form with its own credentials.
3. The browser uploads the bytes directly to the bucket.
4. The browser (or a bucket event) tells the API the upload finished; the
   API records the key against the task, and optionally triggers a virus
   scan or thumbnail job.

The bucket stays private: downloads use presigned `GET` URLs or a CDN
with signed URLs. The application-side details (validation, scanning,
private downloads) are in
[file storage and uploads](../../03-backend-development/backend-concepts/file-storage-and-uploads.md)
and [file uploads in Express](../../03-backend-development/express/file-uploads.md);
the code below shows the storage side.

## When to use and when not to use

| Need | Use | Avoid |
|---|---|---|
| User uploads, media, exports, static assets | Object storage | Instance disks (lost on replacement), shared file systems |
| A disk for one server or a self-hosted database | Block storage | Object storage mounted as a filesystem |
| Many servers need the same POSIX directory | Managed file storage | A database or object store forced into the role |
| Millisecond reads by the same compute, many times | S3 Express One Zone or block storage | Cold classes with retrieval fees |
| Data read rarely but instantly | Standard-IA, Glacier Instant Retrieval, Nearline, Cool, R2 IA | Archive tiers that need restores |
| Heavy public downloads | R2, B2 with a partner CDN, a flat-rate CDN plan | Per-GB egress straight from a hyperscaler |

### Which to choose

| Scenario | Pick | Runner-up | Why |
|---|---|---|---|
| Side project or portfolio | Cloudflare R2 | Backblaze B2 | R2's free tier (10 GB, 10M reads) and zero egress cover most hobby sites at $0; B2 is just as cheap with 10 GB free |
| Early startup on AWS | S3 Standard plus lifecycle rules | R2 for public downloads | S3 integrates with IAM, Lambda, and the rest of the stack; move only download-heavy buckets if egress shows up on the bill |
| Steady high traffic | S3 or GCS behind a CDN with a committed or flat-rate CDN plan | R2 | At steady volume, negotiated or flat-rate delivery beats list egress; keep storage near compute |
| Spiky traffic | R2 or a flat-rate CDN plan | S3 + CloudFront pay-as-you-go | A viral file on per-GB egress becomes a surprise bill; zero or flat egress caps the risk |
| Global audience | Any object store behind a global CDN; R2 (Cloudflare network) | S3 + CloudFront | Users download from the nearest edge; the origin's region matters less than cache hit ratio |
| Compliance-heavy (for example healthcare) | S3, GCS, or Azure Blob under the provider's BAA | The same in a dedicated, locked-down account | [AWS](https://aws.amazon.com/compliance/hipaa-compliance/), [Google Cloud](https://docs.cloud.google.com/docs/security/compliance/hipaa), and [Microsoft Azure](https://learn.microsoft.com/en-us/azure/compliance/offerings/offering-hipaa-us) state on their official pages that they sign a HIPAA BAA covering eligible services; for any smaller provider, use it for health data only if its official page offers a BAA for that product |
| Large files and heavy egress | R2 | B2 with a partner CDN | Egress is the bill (see the worked example) |
| Team with no ops people | The object store of the platform you already use (S3, Spaces, R2) | Backblaze B2 | One account, one bill, one set of credentials; nothing to operate either way |

![Diagram: decision flow starting from where should these bytes live. Do many servers need a shared filesystem? Yes leads to managed file storage (EFS, FSx, Filestore, Azure Files). No leads to: is this a disk for one server, such as the OS or a self-hosted database? Yes leads to block storage (EBS, Persistent Disk, Azure Managed Disks). No means use object storage, then ask: will monthly downloads exceed stored data? Yes leads to a zero or low egress option (R2, B2 with a partner CDN, or a flat-rate CDN plan). No leads to: is the data read mostly by compute in the same cloud? Yes leads to that cloud's object store (S3, GCS, or Blob) with lifecycle rules; no leads to the cheapest per terabyte store that fits compliance (Backblaze B2, Wasabi, or a cold storage class).](storage-choice-decision-flow.svg)

## Practical examples

### Presigned POST upload for TaskFlow attachments (S3)

A presigned **POST** lets the bucket itself enforce limits: the signed
policy fixes the key, the content type, and a size range, so a client
cannot upload a 5 GB file with a URL meant for 25 MB.

```js
// src/storage/attachments.js: presigned uploads and downloads (Node 24, AWS SDK v3)
import { randomUUID } from "node:crypto";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const s3 = new S3Client({ region: process.env.AWS_REGION });
const BUCKET = process.env.ATTACHMENTS_BUCKET;
const MAX_BYTES = 25 * 1024 * 1024; // 25 MiB
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "application/pdf"]);

export async function createUploadForm({ taskId, contentType }) {
  if (!ALLOWED_TYPES.has(contentType)) {
    throw Object.assign(new Error("Unsupported file type"), { status: 400 });
  }
  // The server chooses the key; the client never controls the path.
  const key = `tasks/${taskId}/${randomUUID()}`;

  const { url, fields } = await createPresignedPost(s3, {
    Bucket: BUCKET,
    Key: key,
    Conditions: [
      ["content-length-range", 1, MAX_BYTES],
      ["eq", "$Content-Type", contentType],
    ],
    Fields: { "Content-Type": contentType },
    Expires: 300, // seconds
  });
  return { url, fields, key };
}

export function createDownloadUrl(key, filename) {
  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ResponseContentDisposition: `attachment; filename="${filename.replace(/"/g, "")}"`,
  });
  return getSignedUrl(s3, command, { expiresIn: 300 });
}
```

- `content-length-range` makes S3 reject bodies outside 1 byte to 25 MiB.
- `eq $Content-Type` stops a client from uploading HTML or SVG under an
  image key, which would otherwise be a stored cross-site scripting risk
  if the file were ever served inline.
- `Expires: 300` keeps a leaked form useless after five minutes.
- `ResponseContentDisposition` forces downloads instead of rendering the
  file in the browser.

The browser sends every returned field, then the file last (S3 ignores
form fields after the file):

```js
// web/src/upload.js: TaskFlow Web uploads directly to the bucket
export async function uploadAttachment(taskId, file) {
  const res = await fetch(`/api/tasks/${taskId}/attachments/upload-form`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contentType: file.type }),
  });
  if (!res.ok) throw new Error("Could not start upload");
  const { url, fields, key } = await res.json();

  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) form.append(name, value);
  form.append("file", file); // must be the last field

  const upload = await fetch(url, { method: "POST", body: form });
  if (!upload.ok) throw new Error(`Upload rejected: ${upload.status}`);
  return key; // then tell the API the upload finished
}
```

### Bucket CORS for browser uploads

Browsers block cross-origin requests unless the bucket allows the app's
origin:

```json
{
  "CORSRules": [
    {
      "AllowedOrigins": ["https://app.example.com"],
      "AllowedMethods": ["GET", "PUT", "POST"],
      "AllowedHeaders": ["*"],
      "ExposeHeaders": ["ETag"],
      "MaxAgeSeconds": 3000
    }
  ]
}
```

```bash
# Apply the CORS rules to the attachments bucket
aws s3api put-bucket-cors \
  --bucket taskflow-attachments \
  --cors-configuration file://cors.json
```

List exact origins. `*` would let any website use your upload endpoint
with a leaked form.

### The same code against Cloudflare R2

R2 speaks the S3 API, so only the client changes. R2 presigned URLs
support `GET`, `HEAD`, `PUT`, and `DELETE`, with an expiry from 1 second
to 7 days; HTML form `POST` uploads are not supported, so use a presigned
`PUT`:

```js
// src/storage/r2.js: presigned PUT against Cloudflare R2
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const r2 = new S3Client({
  region: "auto", // required by the SDK, ignored by R2
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

export function createR2UploadUrl(key, contentType) {
  // The client must send the same Content-Type header, or R2 rejects the upload.
  const command = new PutObjectCommand({
    Bucket: process.env.R2_BUCKET,
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(r2, command, { expiresIn: 300 });
}
```

A presigned `PUT` cannot enforce a size range the way a `POST` policy
can. Check the object's size after upload (a `HEAD` request or an event
notification) and delete anything over the limit.

```bash
# .env for local development against R2 (placeholders only)
R2_ACCOUNT_ID=<account-id>
R2_ACCESS_KEY_ID=<access-key-id>
R2_SECRET_ACCESS_KEY=<secret-access-key>
R2_BUCKET=taskflow-attachments
```

### Lifecycle rules for an uploads bucket

Attachments are read often for a few weeks, then rarely. This rule moves
them to Intelligent-Tiering after a week (most are over 128 KB), deletes
old versions, and cleans up abandoned multipart uploads, which are billed
as storage but invisible in normal listings:

```json
{
  "Rules": [
    {
      "ID": "attachments-tiering",
      "Filter": { "Prefix": "tasks/" },
      "Status": "Enabled",
      "Transitions": [
        { "Days": 7, "StorageClass": "INTELLIGENT_TIERING" }
      ],
      "NoncurrentVersionExpiration": { "NoncurrentDays": 30 },
      "AbortIncompleteMultipartUpload": { "DaysAfterInitiation": 7 }
    }
  ]
}
```

```bash
aws s3api put-bucket-lifecycle-configuration \
  --bucket taskflow-attachments \
  --lifecycle-configuration file://lifecycle.json
```

Archive-tier rules (Glacier, Deep Archive) and retention locks are covered
in [backup and archive storage](backup-and-archive-storage.md).

### Mounting shared file storage (EFS)

When an off-the-shelf app needs a shared directory, mount EFS on every
instance with the Amazon EFS mount helper and TLS:

```bash
# On each instance (Amazon Linux): install the helper, mount, and persist
sudo dnf install -y amazon-efs-utils
sudo mkdir -p /mnt/shared
sudo mount -t efs -o tls fs-<id>:/ /mnt/shared
echo "fs-<id>:/ /mnt/shared efs _netdev,noresvport,tls 0 0" | sudo tee -a /etc/fstab
```

## Best practices

- Keep buckets private, turn on S3 Block Public Access (or the provider's
  equivalent) at the account level, and serve public files through a CDN.
- Let the server choose object keys; include tenant and task IDs in the
  key so permissions and lifecycle rules can target prefixes.
- Use presigned uploads with short expiry and enforced size and type;
  never proxy large uploads through the API.
- Estimate egress before choosing a provider: multiply expected downloads
  by file size, then price it on two or three providers.
- Put a CDN in front of anything public and measure the cache hit ratio;
  every miss is origin egress and a request.
- Add lifecycle rules on day one: abort incomplete multipart uploads,
  expire old versions, and tier data by age.
- Respect minimums: do not put small or short-lived objects in IA or
  archive classes.
- Tag buckets by owner and environment so storage shows up per team on
  the bill (see [cost optimization](cost-optimization-and-cloud-bills.md)).
- Use the S3 API through an SDK with a configurable endpoint, so moving
  between S3-compatible providers is a configuration change.

## In production

- **The storage bill is ten times what storage should cost.**
  *Detect:* Cost Explorer grouped by usage type shows
  `DataTransfer-Out-Bytes` or CloudFront data transfer as the top line,
  not `TimedStorage-ByteHrs`. *Cause:* download-heavy files served on
  per-GB egress, often through a public bucket that bypasses the CDN.
  *Fix:* serve through a CDN with a high hit ratio, move public downloads
  to a zero-egress store or flat-rate plan, and block direct bucket
  access.
- **Storage keeps growing although users delete files.**
  *Detect:* S3 Storage Lens or bucket metrics show noncurrent version
  bytes or incomplete multipart upload bytes rising. *Cause:* versioning
  keeps every overwritten and deleted object; failed uploads leave parts
  behind. *Fix:* add `NoncurrentVersionExpiration` and
  `AbortIncompleteMultipartUpload` lifecycle rules.
- **Moving to Standard-IA made the bill go up.**
  *Detect:* new `EarlyDelete-SIA`, `TimedStorage-SIA-SmObjects`, and
  `Retrieval-SIA` usage types appear after the change. *Cause:* many
  objects were under 128 KB, were deleted within 30 days, or were read
  often. *Fix:* use Intelligent-Tiering for unknown access, or filter
  transitions by object size and age; analyse access with S3 Storage
  Class Analysis first.
- **Browser uploads fail with a CORS error after a domain change.**
  *Detect:* the browser console shows a blocked preflight to the bucket
  endpoint; the bucket's CORS rules list the old origin. *Cause:* bucket
  CORS is separate from the API's CORS. *Fix:* add the new origin to the
  bucket's CORS configuration and redeploy.
- **Uploaded files disappear after a deploy.**
  *Detect:* files referenced in the database return 404; the instances or
  containers were replaced. *Cause:* uploads were written to the local
  disk of an instance or container. *Fix:* write uploads to object
  storage; treat servers as disposable.
- **A bucket of private documents is found publicly readable.**
  *Detect:* an external report, AWS Trusted Advisor or IAM Access Analyzer
  findings, or `aws s3api get-bucket-policy-status` returning
  `IsPublic: true`. *Cause:* a bucket policy or ACL granting `*` read,
  often added to "make images work". *Fix:* enable Block Public Access,
  remove the grant, serve through a CDN with origin access control, rotate
  any exposed data, and treat it as a security incident.

## Important terminology

- **Object storage:** Storage of whole files (objects) under keys in
  buckets, accessed over an HTTP API.
- **Block storage:** A network-attached virtual disk for one server.
- **File storage:** A shared network filesystem mounted by many servers.
- **Bucket:** A named container for objects with its own settings.
- **Key:** The full name of an object, including any `/` prefixes.
- **Storage class / access tier:** A per-object setting trading storage
  price against access price and speed.
- **Egress:** Data transferred out of a provider's network, usually
  billed per GB.
- **Minimum storage duration:** The period an object is billed for even
  if deleted sooner.
- **Minimum billable object size:** The size small objects are billed at
  in some classes (128 KB on S3 IA classes).
- **Presigned URL:** A time-limited URL signed with server credentials
  that allows one specific request without credentials.
- **Multipart upload:** Uploading a large object in independently
  retryable parts.
- **S3-compatible:** A non-AWS service that accepts S3 API requests.

## Common mistakes and misconceptions

- Comparing providers on storage price alone, when egress and requests
  dominate download-heavy workloads.
- Believing a CDN automatically removes egress costs; on per-GB CDN
  pricing it mostly moves them.
- Assuming "free egress" is unconditional; read the multiplier, the
  partner list, or the fair-use policy.
- Putting small or short-lived objects into IA or archive classes and
  paying minimums.
- Storing uploads on instance disks or in container filesystems.
- Using EFS as a cheap object store; it costs more than ten times as much
  per GB as S3 Standard.
- Making a bucket public to serve images instead of using a CDN with
  origin access control.
- Assuming every "S3-compatible" service supports every S3 feature (POST
  policies, Object Lock, event notifications).

## Revision questions

1. Explain object, block, and file storage, and give one workload that
   fits each.
2. Why can't you edit part of an object in place, and how do multipart
   uploads help with large files?
3. What do the minimum storage duration and the minimum billable object
   size mean, and when do they make Standard-IA more expensive than
   Standard?
4. Calculate the monthly cost of storing 2 TB (2,048 GB) in S3 Standard
   and serving 5 TB (5,120 GB) of downloads directly from S3 in
   us-east-1, ignoring requests and free allowances.
   (Answer: 2,048 x $0.023 = $47.10 storage; 5,120 x $0.09 = $460.80
   egress; about $508.)
5. Why does a CDN in front of S3 not, by itself, make heavy downloads
   cheap? What does?
6. What conditions apply to the "free egress" of Backblaze B2 and Wasabi?
7. Why should the server, not the browser, choose an upload's object key,
   and what does a presigned POST policy enforce that a presigned PUT
   does not?
8. A team serves 100 KB thumbnails. Which costs grow, and which storage
   classes should they avoid?

## Further learning

- [Amazon S3 storage classes](https://aws.amazon.com/s3/storage-classes/)
  and [S3 pricing](https://aws.amazon.com/s3/pricing/)
- [Amazon S3 user guide: Uploading objects with presigned URLs](https://docs.aws.amazon.com/AmazonS3/latest/userguide/PresignedUrlUploadObject.html)
- [Cloudflare R2 documentation](https://developers.cloudflare.com/r2/)
- [Backblaze B2 documentation](https://www.backblaze.com/docs/cloud-storage)
- [Google Cloud Storage classes](https://cloud.google.com/storage/docs/storage-classes)
- [Azure Blob Storage access tiers](https://learn.microsoft.com/en-us/azure/storage/blobs/access-tiers-overview)
- [AWS Pricing Calculator](https://calculator.aws/),
  [Google Cloud Pricing Calculator](https://cloud.google.com/products/calculator),
  [Azure Pricing Calculator](https://azure.microsoft.com/en-us/pricing/calculator/)
- Related: [CDN](../../07-servers-and-infrastructure/cdn.md),
  [HTTP and CDN caching](../../05-application-architecture/caching/http-and-cdn-caching.md),
  [backup fundamentals and strategies](../backups/backup-fundamentals-and-strategies.md)
- Next: [video storage and streaming](video-storage-and-streaming.md).
  Previous: [managed databases](managed-databases.md). Back to the
  [hosting and cloud platforms overview](../hosting-and-platforms.md).
