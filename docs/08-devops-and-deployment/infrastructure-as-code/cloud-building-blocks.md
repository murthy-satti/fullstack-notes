# Cloud Building Blocks

Infrastructure code describes cloud resources, so writing it well requires
knowing what those resources are and how they fit together. This lesson
covers the building blocks every web service uses: compute options and
how to choose between them, networking (VPCs, public and private subnets,
route tables, internet and NAT gateways, security groups and network
ACLs), load balancers, object, block, and file storage, managed databases,
identity and access management (IAM) principles, regions and Availability
Zones, and a reference architecture for TaskFlow. Examples use AWS names,
with the equivalents on Google Cloud and Azure where it helps; the
concepts transfer.

## Why it matters

Most cloud incidents and most surprising bills come from building blocks
used without understanding them: a database in a public subnet, a
security group open to the internet "temporarily", every instance in one
Availability Zone, an IAM user's access key in a config file, NAT gateway
data charges from traffic that could have used a free endpoint. IaC makes
these mistakes repeatable at scale. Knowing what each block is for lets
you design an environment once, correctly, and then let code reproduce
it.

## Real-world usage

- **Amazon: static stability.** The Amazon Builders' Library article
  [Static stability using Availability Zones](https://aws.amazon.com/builders-library/static-stability-using-availability-zones/)
  explains designing services to keep working when an Availability Zone
  fails without having to create new resources during the event, for
  example by running enough capacity in the remaining zones in advance.
  That is why production designs spread every tier across zones.
- **AWS IAM best practices.** The
  [IAM best practices guide](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html)
  recommends federation with temporary credentials for people, IAM roles
  with temporary credentials for workloads, multi-factor authentication,
  least-privilege permissions, and regularly removing unused users,
  roles, and permissions.
- **Google Cloud VPC.** The
  [VPC overview](https://cloud.google.com/vpc/docs/vpc) explains that a
  Google Cloud VPC network is global while its subnets are regional, a
  useful contrast with AWS, where a VPC belongs to one region and each
  subnet to one Availability Zone.
- **AWS VPC.** The page
  [How Amazon VPC works](https://docs.aws.amazon.com/vpc/latest/userguide/how-it-works.html)
  describes subnets, route tables, internet gateways, and NAT devices,
  and defines a public subnet as one whose route table has a route to an
  internet gateway.

**Popular tools and providers:** AWS (EC2, ECS and Fargate, EKS, Lambda,
S3, EBS, EFS, RDS, Aurora, ALB, NLB, IAM), Google Cloud (Compute Engine,
Cloud Run, GKE, Cloud Functions, Cloud Storage, Persistent Disk,
Filestore, Cloud SQL, Cloud Load Balancing), Azure (Virtual Machines,
Container Apps, AKS, Functions, Blob Storage, Managed Disks, Azure Files,
Azure Database, Load Balancer and Application Gateway), and MongoDB Atlas
for managed MongoDB.

## How it works

### Regions and Availability Zones

- A **region** is a geographic area (for example `eu-west-1`). Choose it
  for latency to users, data residency rules, service availability, and
  price.
- An **Availability Zone (AZ)** is one or more data centers in a region
  with independent power, cooling, and networking, connected to the other
  AZs by low-latency links. AZs fail independently; that is their purpose.
- **Production should span at least two AZs** (three is common for
  databases that need a majority to elect a leader). Everything in one AZ
  shares one failure domain.
- **Multiple regions** protect against a regional outage but add data
  replication, cost, and complexity. Most services start multi-AZ and add
  regions only for specific availability, latency, or regulatory needs
  (see [disaster recovery](../backups/disaster-recovery-rpo-and-rto.md)).

### Compute options

![Diagram: four compute options compared on five layers; for virtual machines the provider manages hardware while you manage the operating system and patching, the runtime, scaling, and code; for Kubernetes with a managed control plane the provider manages hardware, nodes are shared through managed node groups, you build the container image and configure autoscaling, and you manage the code; for serverless containers such as Cloud Run or Fargate the provider manages hardware and the operating system while you build the image, configure scaling, and manage the code; for functions such as Lambda the provider manages everything except your code; moving right means less to operate and less control.](compute-spectrum.svg)

| Option | Examples | You manage | Scaling | Strengths | Watch out for |
|---|---|---|---|---|---|
| Virtual machines | EC2, Compute Engine, Azure VMs | OS, patching, runtime, deploys, scaling groups | Auto scaling groups (minutes) | Full control, any software, long-running processes | Patching and drift; build images to stay immutable |
| Kubernetes | EKS, GKE, AKS | Workloads, cluster add-ons, upgrades, node pools | Pod and cluster autoscalers | Portable, rich ecosystem, many services on shared nodes | Operational depth; worth it with several services and a team that knows it |
| Serverless containers | ECS on Fargate, Cloud Run, Azure Container Apps | Container image, CPU and memory, scaling settings | Per service, some scale to zero | Containers without servers or clusters | Platform limits (request timeouts, local disk); per-second pricing can exceed VMs at steady high load |
| Functions | AWS Lambda, Cloud Functions, Azure Functions | Code and configuration | Per request, automatic | Event-driven work, spiky traffic, no idle cost | Cold starts, execution time limits, connection management to databases |

For TaskFlow API (a long-running Express server with MongoDB connections
and steady traffic), serverless containers or a small Kubernetes setup
fit well; functions would struggle with connection pooling and cold
starts on the main API, but suit background jobs such as thumbnailing
uploads.

### Networking: the VPC

A **VPC** (virtual private cloud; a VNet in Azure) is your private network
in the cloud, with an IP range you choose (a CIDR block such as
`10.20.0.0/16`, which holds 65,536 addresses).

![Diagram: users reach an internet gateway attached to the TaskFlow VPC 10.20.0.0/16 in eu-west-1, which spans Availability Zones a and b; each zone has a public subnet routed to the internet gateway holding a load balancer node with a security group open on 443 and a NAT gateway for outbound traffic only, a private app subnet that routes outbound traffic through the NAT gateway in the same zone and holds API tasks accepting port 3000 only from the load balancer, and a database subnet with no internet route holding the database primary in zone a and a replicating standby in zone b that accept the database port only from the API.](vpc-two-az.svg)

- **Subnets** divide the VPC range; on AWS each subnet lives in exactly
  one AZ. AWS reserves 5 addresses in every subnet, so a `/24` (256
  addresses) offers 251.
- **Route tables** decide where traffic leaving a subnet goes. Every route
  table has a local route for the VPC range.
- An **internet gateway** connects the VPC to the internet. A subnet is
  **public** if its route table sends `0.0.0.0/0` to an internet gateway;
  resources there can have public IPs.
- **Private subnets** have no route to the internet gateway. Instances
  there cannot be reached from the internet.
- A **NAT gateway** sits in a public subnet and lets private resources
  make *outbound* connections (to third-party APIs, package registries)
  without accepting inbound ones. It is created in one AZ, so production
  designs use one per AZ to keep each zone independent. NAT gateways
  charge per hour and per gigabyte processed.
- **VPC endpoints** give private access to cloud services without the
  internet or NAT: a **gateway endpoint** for S3 (no additional charge) or
  **interface endpoints** (PrivateLink) for many other services and
  partner services such as MongoDB Atlas.
- **Plan CIDR ranges** so VPCs that may ever be peered or connected to an
  office network do not overlap.

### Security groups and network ACLs

| | Security group | Network ACL |
|---|---|---|
| Attached to | Network interfaces (instances, tasks, load balancers, databases) | Subnets |
| State | Stateful: return traffic is allowed automatically | Stateless: return traffic (ephemeral ports) must be allowed explicitly |
| Rules | Allow only | Allow and deny |
| Evaluation | All rules considered together | In order by rule number, first match wins |
| Can reference | Other security groups (`api` accepts from `alb`) | IP ranges only |
| Typical use | The main, fine-grained firewall for every tier | A coarse extra layer, for example blocking a range for a whole subnet |

Chaining security groups by reference is the key pattern: the load
balancer accepts 443 from anywhere, the API accepts 3000 only from the
load balancer's group, the database accepts its port only from the API's
group. No IP addresses to maintain, and nothing reaches the database from
anywhere else.

### Load balancers

| Type | Layer | Use |
|---|---|---|
| Application Load Balancer (or a Google Cloud Application Load Balancer, Azure Application Gateway) | 7 (HTTP) | Web APIs and sites: host and path routing, TLS termination, WebSockets, health checks per target |
| Network Load Balancer (Azure Load Balancer) | 4 (TCP, UDP, TLS) | Very high throughput, static IPs, non-HTTP protocols |

Place load balancers in public subnets of at least two AZs, terminate TLS
there with a managed certificate, health-check targets with your
readiness endpoint, and keep targets in private subnets. See
[load balancing](../../07-servers-and-infrastructure/load-balancing.md)
for algorithms and behavior.

### Storage: object, block, file

| Type | Examples | Access | Good for | Not for |
|---|---|---|---|---|
| Object | S3, Cloud Storage, Azure Blob | HTTP API, whole objects, keys in a flat namespace | User uploads, static sites, backups, logs, data lakes | Databases, files that change in small parts |
| Block | EBS, Persistent Disk, Managed Disks | A disk attached to one instance (one AZ) | Database volumes, boot disks | Sharing between instances |
| File | EFS, Filestore, Azure Files | NFS or SMB, shared by many instances | Shared content for legacy apps, home directories | High-performance databases; prefer object storage for new designs |

TaskFlow stores user uploads in S3: the API creates presigned URLs so
browsers upload directly, and the bucket stays private (see
[file storage and uploads](../../03-backend-development/backend-concepts/file-storage-and-uploads.md)).

### Managed databases

Managed database services (RDS and Aurora, Cloud SQL, Azure Database,
MongoDB Atlas) run the database software for you: provisioning,
replication across AZs with automatic failover, backups and point-in-time
recovery, minor version patching in maintenance windows, and monitoring.
You still own schema design, indexes, query performance, capacity
choices, connection limits, and testing restores. Self-managing a
database on VMs makes sense only with specific needs (a version or
extension the service does not offer, extreme scale with an experienced
team). Put databases in subnets without internet routes and allow access
only from the application's security group or a private endpoint.

### IAM principles

- **Least privilege:** grant only the actions and resources a principal
  needs; start narrow and add, rather than starting with `*`.
- **Roles over users:** workloads assume roles and receive temporary
  credentials (instance profiles, task roles, workload identity). Long-lived
  access keys are a last resort.
- **People through federation:** engineers sign in through the company
  identity provider with MFA and assume roles; no shared accounts.
- **Lock away the root account:** strong MFA, no access keys, used only
  for the few tasks that require it.
- **Separate accounts (or projects, subscriptions) per environment:**
  production in its own account turns "wrong environment" mistakes into
  permission errors and limits blast radius.
- **Guardrails above accounts:** organization policies (AWS service
  control policies, Google Cloud organization policies, Azure Policy) can
  forbid actions everywhere, such as disabling audit logging.
- **Audit and clean up:** cloud audit logs on, access analyzers to find
  unused or external access, regular removal of stale permissions.

### A reference architecture for TaskFlow

| Component | Choice | Why |
|---|---|---|
| DNS | Route 53 | Managed DNS with health checks |
| Web frontend | S3 bucket behind CloudFront | Static hosting with a global CDN (see [deploying frontends](../deployment-strategies/deploying-frontends-and-static-sites.md)) |
| API entry | Application Load Balancer in public subnets of two AZs, TLS from a managed certificate | HTTP routing, health checks, no servers to patch |
| API compute | ECS on Fargate, at least two tasks per AZ, in private subnets | Containers without managing servers; rolling deploys built in |
| Database | MongoDB Atlas replica set across three AZs, reached through PrivateLink | Managed MongoDB with automatic failover; no public endpoint |
| Uploads | Private S3 bucket, accessed through the task role and presigned URLs | Durable object storage; browsers upload directly |
| Outbound traffic | One NAT gateway per AZ, S3 gateway endpoint | Zone independence; S3 traffic avoids NAT charges |
| Secrets | Secrets Manager, read by the task role | No credentials in images or variables (see [secrets management](../environment-variables/secrets-management.md)) |
| Images | ECR | Private registry close to the compute |
| Observability | CloudWatch logs and metrics, alarms, tracing | Signals for deploy verification and on-call |
| Accounts | Separate AWS accounts for staging and production | Isolation and simpler permissions |

All of it is described in Terraform, in modules such as `network`,
`uploads-bucket`, and `api-service`, with one root module and state per
environment.

## When to use and when not to use

| Need | Choose | Avoid |
|---|---|---|
| Long-running HTTP API with steady traffic | Serverless containers or Kubernetes | Functions for the main API with persistent DB connections |
| Event-driven or spiky background work | Functions or queue-driven containers | Always-on VMs sized for peaks |
| Many services, platform team | Kubernetes | Kubernetes for a single small service |
| Strict OS-level control or special hardware | VMs (built from images) | Hand-configured long-lived VMs |
| Files users upload | Object storage | Block or file storage on app servers |
| Relational or document database | Managed database service | Self-managed on VMs without a strong reason |
| Private services reaching the internet | NAT gateway per AZ, endpoints for cloud services | Public IPs on app instances |
| Workload permissions | Roles with temporary credentials | IAM users with access keys |

## Practical examples

### A VPC across two Availability Zones with the community module

```hcl
# network.tf: a VPC across two Availability Zones for TaskFlow
terraform {
  required_version = ">= 1.11"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

provider "aws" {
  region = "eu-west-1"
}

module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 6.7"

  name = "taskflow-prod"
  cidr = "10.20.0.0/16"
  azs  = ["eu-west-1a", "eu-west-1b"]

  public_subnets   = ["10.20.0.0/24", "10.20.1.0/24"]   # load balancer, NAT gateways
  private_subnets  = ["10.20.10.0/24", "10.20.11.0/24"] # API tasks
  database_subnets = ["10.20.20.0/24", "10.20.21.0/24"] # databases, no internet route

  enable_nat_gateway     = true
  one_nat_gateway_per_az = true # an AZ failure does not cut the other AZ's outbound traffic

  enable_dns_hostnames = true
  enable_dns_support   = true
}
```

The module creates the VPC, six subnets, the internet gateway, two NAT
gateways with their public IPs, and the route tables. Leaving gaps
between ranges (`.0` and `.1` public, `.10` and `.11` app, `.20` and `.21`
database) leaves room to add a third AZ later without renumbering.

### Security groups that chain tiers by reference

```hcl
# security.tf: each tier accepts traffic only from the tier in front of it
resource "aws_security_group" "alb" {
  name        = "taskflow-alb"
  description = "Public HTTPS load balancer"
  vpc_id      = module.vpc.vpc_id
}

resource "aws_security_group" "api" {
  name        = "taskflow-api"
  description = "API tasks, reachable only from the load balancer"
  vpc_id      = module.vpc.vpc_id
}

resource "aws_vpc_security_group_ingress_rule" "alb_https" {
  security_group_id = aws_security_group.alb.id
  description       = "HTTPS from anywhere"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
}

resource "aws_vpc_security_group_egress_rule" "alb_to_api" {
  security_group_id            = aws_security_group.alb.id
  description                  = "Forward to API tasks"
  referenced_security_group_id = aws_security_group.api.id
  ip_protocol                  = "tcp"
  from_port                    = 3000
  to_port                      = 3000
}

resource "aws_vpc_security_group_ingress_rule" "api_from_alb" {
  security_group_id            = aws_security_group.api.id
  description                  = "App port from the load balancer only"
  referenced_security_group_id = aws_security_group.alb.id
  ip_protocol                  = "tcp"
  from_port                    = 3000
  to_port                      = 3000
}

resource "aws_vpc_security_group_egress_rule" "api_https_out" {
  security_group_id = aws_security_group.api.id
  description       = "Outbound HTTPS through the NAT gateway (database, AWS APIs)"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
}
```

The separate `aws_vpc_security_group_ingress_rule` and `..._egress_rule`
resources (one rule per resource) are the current recommended style in
the AWS provider; each rule can be added or removed without touching the
others.

### A task role instead of access keys

```hcl
# iam.tf: a role the API tasks assume; no access keys anywhere
data "aws_iam_policy_document" "ecs_tasks_trust" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "api_task" {
  name               = "taskflow-api-prod"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_trust.json
}

data "aws_iam_policy_document" "api_secrets" {
  statement {
    sid       = "ReadOwnSecretsOnly"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = ["arn:aws:secretsmanager:eu-west-1:123456789012:secret:taskflow/prod/*"]
  }
}

resource "aws_iam_role_policy" "api_secrets" {
  name   = "read-taskflow-prod-secrets"
  role   = aws_iam_role.api_task.id
  policy = data.aws_iam_policy_document.api_secrets.json
}
```

The trust policy says who may assume the role (the ECS tasks service);
the permission policy says what the role may do (read only production
TaskFlow secrets). The uploads bucket policy from
[Terraform in practice](terraform-in-practice.md) attaches to this same
role.

### Planning subnet sizes

```text
VPC 10.20.0.0/16            65,536 addresses
  /24 subnet                256 addresses, 251 usable on AWS (5 reserved)
  /20 subnet                4,096 addresses, 4,091 usable

Fargate tasks use one IP each; Kubernetes pods often do too (VPC CNI).
60 API tasks at peak + 50% headroom for rolling surges = 90 IPs per AZ
  -> a /24 per AZ is enough for the app tier
A Kubernetes cluster with 30 nodes x 30 pods = 900 pod IPs
  -> plan /20 or larger subnets for pods
```

All the snippets above validate with Terraform 1.17.2, AWS provider
6.73.0, and version 6.7.3 of the VPC module.

## Best practices

- Spread every production tier across at least two AZs and size capacity
  so one AZ can fail without scaling actions.
- Keep only load balancers and NAT gateways in public subnets; put
  compute and databases in private subnets.
- Use one NAT gateway per AZ for production, and VPC endpoints for heavy
  traffic to cloud services.
- Chain security groups by reference; avoid `0.0.0.0/0` except on the
  public load balancer.
- Prefer the most managed compute that fits the workload.
- Use managed databases with multi-AZ failover and tested restores.
- Give workloads roles and temporary credentials; federate people with
  MFA; lock the root account.
- Separate environments into separate accounts or projects.
- Plan CIDR ranges up front so networks never overlap.

## In production

- **The whole site went down when one Availability Zone had problems.**
  *Detect:* all instances or tasks were in the affected AZ. *Cause:* a
  single-AZ deployment or a single NAT gateway. *Fix:* spread tasks and
  subnets across AZs, one NAT gateway per AZ, and capacity to absorb the
  loss of one AZ.
- **The database was reachable from the internet.**
  *Detect:* a security scan or exposure alert. *Cause:* a public subnet or
  a security group rule open to `0.0.0.0/0`. *Fix:* database subnets with
  no internet route, ingress only from the API's security group, and a
  policy check that rejects public database settings in plans.
- **The NAT gateway bill exceeds the compute bill.**
  *Detect:* cost reports show high NAT data processing. *Cause:* large
  traffic from private subnets to S3 or other AWS services through NAT.
  *Fix:* an S3 gateway endpoint and interface endpoints for chatty
  services.
- **New tasks fail to start during a deploy with "no IP addresses".**
  *Detect:* placement errors about subnet capacity. *Cause:* subnets too
  small for peak tasks plus rolling surge (or pod IPs). *Fix:* larger or
  additional subnets; plan IP capacity including surges.
- **An access key leaked and was used to start expensive instances.**
  *Detect:* billing alarm and unfamiliar resources in audit logs.
  *Cause:* a long-lived IAM user key with broad permissions. *Fix:*
  revoke it, remove IAM users for workloads in favor of roles, add
  guardrail policies and billing alerts.
- **A VPC peering request failed.**
  *Detect:* the peering cannot be created or routes conflict. *Cause:*
  overlapping CIDR ranges. *Fix:* plan non-overlapping ranges across all
  environments and partners from the start.

## Important terminology

- **Region / Availability Zone:** a geographic area / an independent
  failure domain inside it.
- **VPC (VNet):** a private virtual network with your chosen IP range.
- **CIDR block:** an IP range written as address and prefix length.
- **Subnet:** a range inside a VPC, in one AZ on AWS.
- **Route table:** rules deciding where traffic from a subnet goes.
- **Internet gateway:** the VPC's connection to the internet.
- **NAT gateway:** lets private resources make outbound connections only.
- **VPC endpoint:** private access to a cloud service without the
  internet.
- **Security group:** a stateful firewall attached to network interfaces.
- **Network ACL:** a stateless firewall attached to subnets.
- **Object, block, and file storage:** objects by key over HTTP, disks for
  one machine, shared file systems.
- **IAM role:** an identity that workloads or people assume to receive
  temporary credentials.
- **Least privilege:** granting only the permissions needed.
- **Static stability:** continuing to work through a failure without
  needing to create new resources.

## Common mistakes and misconceptions

- Treating "private subnet" as a security setting by itself; security
  groups still decide what can talk to what.
- One NAT gateway for all AZs in production.
- Opening a security group to `0.0.0.0/0` for debugging and forgetting it.
- Assuming the cloud provider backs up and restores your data without
  any configuration or testing.
- IAM users with access keys for applications.
- Choosing Kubernetes because it is popular, not because the workload
  needs it.
- Storing uploads on instance disks that disappear with the instance.
- Small subnets that block scaling later.

## Revision questions

1. What makes a subnet public on AWS, and what should live in public
   subnets?
2. Why use one NAT gateway per AZ, and how can VPC endpoints reduce NAT
   costs?
3. Compare security groups and network ACLs on state, scope, and rule
   types.
4. How many usable addresses does a `/22` subnet have on AWS?
5. Which compute option would you choose for TaskFlow API, for an image
   thumbnail job, and for a legacy app that needs a specific kernel
   module? Why?
6. What is the difference between object, block, and file storage? Where
   should user uploads go?
7. List four IAM principles and how each limits damage from a mistake.
8. What does static stability mean for capacity planning across three
   AZs if the service needs 12 tasks to handle peak load?

## Further learning

- [AWS: How Amazon VPC works](https://docs.aws.amazon.com/vpc/latest/userguide/how-it-works.html)
- [AWS: NAT gateways](https://docs.aws.amazon.com/vpc/latest/userguide/vpc-nat-gateway.html)
- [AWS: Gateway endpoints for Amazon S3](https://docs.aws.amazon.com/vpc/latest/privatelink/vpc-endpoints-s3.html)
- [AWS: Security best practices in IAM](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html)
- [Amazon Builders' Library: Static stability using Availability Zones](https://aws.amazon.com/builders-library/static-stability-using-availability-zones/)
- [Google Cloud: VPC networks](https://cloud.google.com/vpc/docs/vpc)
- [Terraform registry: AWS VPC module](https://registry.terraform.io/modules/terraform-aws-modules/vpc/aws/latest)
- Next: [immutable infrastructure and GitOps](immutable-infrastructure-and-gitops.md). Back to the
  [infrastructure as code overview](../infrastructure-as-code.md).
