# Network Security in the Cloud

IAM decides who may call an API; the network decides what can connect to
what. Together they give defense in depth: an attacker who steals a
credential still needs a network path, and an attacker who finds an open
port still needs a credential. This lesson treats the cloud network as a
security control rather than plumbing.

It covers private subnets for data tiers, security groups and network ACLs
used deliberately, ingress and egress control, private endpoints and
PrivateLink, administrative access with bastions compared with Session
Manager and identity-aware proxies, VPNs, zero trust, encryption in transit
inside the VPC, segmentation, and the flow and DNS logs that show what
actually happened. VPC basics (subnets, route tables, gateways, and the
security group table) are in
[cloud building blocks](../infrastructure-as-code/cloud-building-blocks.md);
hands-on server firewalls are in
[setting up a production server](../linux-server-operations/setting-up-a-production-server.md).

## Why it matters

Anything reachable from the internet is found within hours by automated
scanners that sweep the whole IPv4 address space. A database with a public
IP and a weak password, an SSH port open to the world, or an admin panel on
a forgotten instance is not "hidden"; it is in someone's list. Most cloud
network incidents come from a short list of mistakes: something public that
should not be, a flat network where one compromised host reaches every
other, and unrestricted outbound traffic that lets an attacker pull tools in
and push data out.

The network also limits the damage of application bugs. A server-side
request forgery (SSRF) flaw lets an attacker make TaskFlow API send
requests on their behalf; whether that reaches the instance metadata
service, an internal admin API, or an attacker's server depends on network
and metadata settings, not on the bug.

## Real-world usage

- **Google BeyondCorp.** In
  [BeyondCorp: A New Approach to Enterprise Security](https://research.google/pubs/beyondcorp-a-new-approach-to-enterprise-security/)
  (;login:, 2014), Google explains that once a perimeter is breached "an
  attacker has relatively easy access to a company's privileged intranet",
  and describes removing the requirement for a privileged intranet by
  moving corporate applications to the internet behind checks on users and
  devices. This is the origin of most zero-trust access products.
- **NIST zero trust architecture.**
  [NIST SP 800-207](https://csrc.nist.gov/pubs/sp/800/207/final) (August
  2020) defines zero trust as moving defenses "from static, network-based
  perimeters to focus on users, assets, and resources", with "no implicit
  trust granted to assets or user accounts based solely on their physical
  or network location."
- **AWS IMDSv2.** The AWS Security Blog post
  [Add defense in depth against open firewalls, reverse proxies, and SSRF vulnerabilities](https://aws.amazon.com/blogs/security/defense-in-depth-open-firewalls-reverse-proxies-ssrf-vulnerabilities-ec2-instance-metadata-service/)
  (2019) explains why the metadata service now starts sessions with an HTTP
  `PUT` that returns a token: open WAFs, reverse proxies, and most SSRF
  paths cannot send that request, so they cannot fetch the instance role's
  credentials.
- **AWS Session Manager.** The
  [Session Manager documentation](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager.html)
  states that it provides node access "without the need to open inbound
  ports, maintain bastion hosts, or manage SSH keys", with access decided
  by IAM and session activity logged.
- **AWS VPC Encryption Controls.** AWS
  [announced in November 2025](https://aws.amazon.com/about-aws/whats-new/2025/11/aws-vpc-encryption-controls/)
  a VPC setting that can monitor whether traffic is encrypted in transit
  and, in enforce mode, prevent resources that do not encrypt traffic, a
  sign that "encrypted inside the VPC" is becoming an auditable property.

**Popular tools and providers:** AWS security groups, network ACLs, VPC
Block Public Access, AWS Network Firewall, Route 53 Resolver DNS Firewall,
VPC endpoints and PrivateLink, Session Manager, EC2 Instance Connect
Endpoint, AWS Verified Access, and AWS Client VPN; Google Cloud firewall
rules, Private Service Connect, and Identity-Aware Proxy; Azure network
security groups, Azure Firewall, Private Link, and Azure Bastion;
Cloudflare Access and Tunnel; WireGuard and Tailscale; Istio and Linkerd
for mutual TLS between services.

## How it works

### Two layers: who may call, and what may connect

| Layer | Control | Stops |
|---|---|---|
| Identity | IAM policies, SSO, MFA | Calls by principals without permission |
| Network edge | Only load balancers and CDNs are public; WAF, DDoS protection | Direct access to servers and databases from the internet |
| Inside the VPC | Security groups by reference, isolated data subnets | Lateral movement from one compromised host to everything |
| Outbound | Egress rules, VPC endpoints, DNS and domain filtering | Data exfiltration, malware downloads, callbacks |
| Transport | TLS and mutual TLS, provider encryption | Reading or tampering with traffic on the wire |
| Visibility | Flow logs, DNS query logs, threat detection | Attacks that would otherwise go unnoticed |

### Zones: public, private, and isolated

![Diagram: users reach the load balancer in the public subnet on port 443, the only resource reachable from the internet; it forwards to the API tasks in the private app subnet on port 3000; the API reaches the database through a PrivateLink endpoint in the isolated data subnet on port 27017, Secrets Manager through an interface endpoint on 443, and S3 through a gateway endpoint, so AWS service APIs are reached privately; other outbound traffic goes through the NAT gateway to an egress filter whose domain allowlist allows the payment API and blocks an unknown host; an attacker scanning the internet cannot reach the API or the database because nothing has a public IP and each security group accepts only the tier in front of it.](network-zones.svg)

- **Public subnets** hold only what must accept internet traffic: load
  balancers and NAT gateways. Nothing else gets a public IP.
- **Private app subnets** hold the API tasks, which accept traffic only
  from the load balancer's security group.
- **Isolated data subnets** have no route to an internet gateway or NAT at
  all. The database accepts connections only from the API's security group
  or through a private endpoint.
- **Account-level guardrails** catch mistakes: VPC Block Public Access can
  block internet gateway traffic for a whole account with explicit
  exclusions, and S3 creates new buckets with public access blocked by
  default.

### Security groups and network ACLs as security controls

Security groups are stateful allow-lists attached to network interfaces;
network ACLs are stateless, ordered allow and deny rules on subnets. The
comparison table is in
[cloud building blocks](../infrastructure-as-code/cloud-building-blocks.md).
From a security point of view:

- **Reference groups, not addresses.** "The API accepts 3000 from the load
  balancer's group" stays correct as tasks come and go, and it reads like a
  policy: identity-like rules at the network layer.
- **Know the defaults.** The default security group allows all traffic
  between its members and all outbound traffic, and every new security
  group starts with an outbound rule that allows everything. Terraform's
  `aws_security_group` removes that default egress rule, so egress must be
  declared explicitly, which is what you want.
- **Use NACLs for coarse, subnet-wide decisions**, such as denying an
  address range during an incident or making the data subnets refuse
  anything from the public subnets. Their explicit deny is something
  security groups cannot express.
- **Treat rules as code.** Keep them in Terraform, review them in pull
  requests, and let an IaC scanner fail changes that open administrative
  ports to `0.0.0.0/0` (Checkov's `CKV_AWS_24` does this for port 22).

### Egress control

Inbound rules get attention; outbound rules usually stay "allow all". Yet
outbound access is how a compromised container downloads tools, reaches a
command-and-control server, or uploads stolen data, and how an SSRF bug
reaches places it should not. Options, from coarse to fine:

| Mechanism | Filters by | Good for | Limits |
|---|---|---|---|
| Security group egress rules | IP ranges, prefix lists, other groups | Limiting tiers to the ports and peers they need | Cannot express domain names |
| VPC endpoints | Destination service (S3, Secrets Manager, ECR) | Keeping AWS API traffic off the internet and NAT | Only for services with endpoints |
| Route 53 Resolver DNS Firewall | Domain names in DNS queries | Blocking known-bad domains or allowing only listed ones | A client can still connect to a raw IP address |
| AWS Network Firewall or an egress proxy | Domain via TLS SNI or HTTP Host, IPs, protocols | Allowlisting the third-party APIs a service calls | Cost and operational effort |
| NAT gateway alone | Nothing | Giving private subnets outbound access | Not a security control |

For TaskFlow, the API needs AWS APIs (through endpoints), MongoDB (through
a private endpoint), and a payment provider (through the filtered egress
path). Everything else can be denied. Cost points the same way: NAT
gateways charge per hour and per gigabyte processed, an S3 gateway endpoint
has no additional charge, and interface endpoints charge per hour and per
gigabyte, so moving heavy AWS API traffic to endpoints often lowers the
bill while it removes an internet path.

Two controls protect the instance role's credentials from SSRF: require
**IMDSv2**, which needs a token obtained with a `PUT` request (an account
default, or a declarative policy across an organization), and keep the
metadata hop limit low on hosts that do not run containers. On ECS and EKS,
task and pod credentials come from the platform, not from the instance's
metadata, which is another reason to give each workload its own role.

### Private connectivity: endpoints and PrivateLink

- **Gateway endpoints** (S3 and DynamoDB) add routes to a route table.
  Traffic to the service never leaves the AWS network or touches the NAT
  gateway.
- **Interface endpoints** (AWS PrivateLink) place network interfaces with
  private IPs in your subnets for services such as Secrets Manager, ECR,
  CloudWatch Logs, and STS. With private DNS enabled, the normal service
  hostname resolves to those private IPs, so SDKs need no changes.
- **PrivateLink to partners:** many SaaS providers, MongoDB Atlas among
  them, offer private endpoints, so the database never needs a public
  address.
- **Endpoint and resource policies** form a **data perimeter**. An endpoint
  policy can limit which buckets or principals the endpoint may be used
  for, and a bucket policy can require `aws:SourceVpce` so the bucket is
  reachable only through your endpoint. Remember that `aws:SourceIp` is not
  present in requests that arrive through a VPC endpoint, so IP-based
  bucket policies and endpoints do not mix.

### Administrative access without open ports

![Diagram: three columns; with a bastion host, the engineer's SSH client connects through port 22 opened to office IP ranges to a bastion in a public subnet, then SSH to the private server, with an inbound port on the internet, SSH keys to issue and rotate, and an audit trail on the box; with AWS Systems Manager Session Manager, the engineer uses the AWS CLI over HTTPS with an IAM role from SSO and MFA, Session Manager checks IAM and relays, and the server's agent dials out on 443 so it needs no inbound rules, with sessions logged centrally; with Google Cloud Identity-Aware Proxy, gcloud tunnels over HTTPS with a Google identity, IAP checks IAM on each request and connects only from 35.235.240.0/20, so the VM needs no external IP and access requires the IAP-Secured Tunnel User role.](admin-access-paths.svg)

A **bastion host** (jump box) is a hardened server with SSH open to known
addresses, used to reach private servers. It works, but it is an internet-
facing server to patch, SSH keys to issue and revoke, and logs that live on
the box an attacker would target. Managed alternatives remove all three:

- **AWS Systems Manager Session Manager:** the SSM agent on the instance
  makes an outbound connection; users start shell or port-forwarding
  sessions through the AWS API, authorized by IAM (so by SSO and MFA), with
  shell sessions logged to S3 or CloudWatch Logs and every session start in
  CloudTrail. AWS notes that session logging does not cover port-forwarding
  or SSH sessions, whose contents are encrypted end to end.
- **EC2 Instance Connect Endpoint:** SSH or RDP to instances without public
  IPs and without a bastion, controlled by IAM, with every connection
  attempt logged to CloudTrail.
- **Google Cloud Identity-Aware Proxy TCP forwarding:** the VM has no
  external IP; its firewall accepts SSH only from IAP's range
  `35.235.240.0/20`, and users need the `roles/iap.tunnelResourceAccessor`
  role.
- **Azure Bastion** provides the same managed pattern on Azure.

Server-side SSH hardening and `ProxyJump` are covered in
[SSH and remote access](../linux-server-operations/ssh-and-remote-access.md).

### VPNs and zero trust

![Diagram: on the left, the perimeter model, a remote user's VPN client passes one check at the VPN gateway into a flat internal network where the admin app, database, and CI server are all reachable, so a stolen VPN login reaches everything; on the right, zero trust, an engineer on a managed laptop signed in with SSO goes through an identity-aware proxy that checks identity, device, and context on every request, the admin app is allowed because the engineer is on call while the database is denied because the engineer has no role, and between services the TaskFlow API calls a worker with mTLS and per-call authorization, so network location alone grants nothing.](perimeter-vs-zero-trust.svg)

A **VPN** extends a private network to a laptop (client VPN) or connects
two networks (site-to-site VPN). Site-to-site VPNs remain the normal way to
link an office or data center to a VPC. As a way to give people access to
applications, a client VPN has a structural weakness: one check at the edge
admits the user to a network, and the network then trusts them. Protocol
details are in [VPNs and tunneling](../../01-networking-and-protocols/vpn-and-tunneling.md).

**Zero trust** removes that implicit trust. Each request is authenticated
and authorized on its own merits, using the user's identity, the device's
state, and context such as time and location, and access is granted per
application rather than per network. In practice:

- **For people:** identity-aware proxies (Google IAP, AWS Verified Access,
  Cloudflare Access) put internal tools behind SSO and device checks
  instead of behind a VPN.
- **For services:** every call carries a workload identity, usually through
  mutual TLS issued by a service mesh or the platform, and the receiving
  service authorizes the caller, not just the source IP.
- **For networks:** segmentation still matters as a second layer; zero
  trust does not mean "flat network", it means the network is not the only
  check.

### Encryption in transit inside the VPC

Is traffic inside a VPC already encrypted? Partly, and the details matter
for audits. AWS documents that all traffic between Availability Zones is
encrypted, and that many current instance types (Nitro-based) automatically
encrypt traffic between instances with 256-bit AEAD encryption when both
sides meet the requirements. VPC Encryption Controls can report which flows
are encrypted and, in enforce mode, block resources that are not.

Application-level TLS is still the norm for three reasons: it protects
against anyone inside the network (including a compromised host) and not
just against the physical link; it authenticates the server, and with
mutual TLS the client; and it does not depend on instance types and
configuration that can change. For TaskFlow that means TLS from the load
balancer to the tasks when the data is sensitive, TLS to MongoDB (managed
MongoDB services typically require it), and mTLS between services if a mesh
is introduced. Termination choices are in
[TLS termination and troubleshooting](../ssl-certificates/tls-termination-and-troubleshooting.md).

### Visibility: flow logs and DNS logs

- **VPC Flow Logs** record metadata for IP traffic on a VPC, subnet, or
  interface: addresses, ports, protocol, packet and byte counts, and
  whether the traffic was `ACCEPT`ed or `REJECT`ed. They contain no
  payloads. Send them to the log archive account.
- **Route 53 Resolver query logs** record DNS lookups, which often reveal
  malware and exfiltration before any connection succeeds.
- **Amazon GuardDuty** uses CloudTrail management events, VPC Flow Logs,
  and DNS query logs as its foundational data sources to flag, for example,
  instances talking to known malicious addresses.

## When to use and when not to use

| Need | Use | Avoid |
|---|---|---|
| Public web traffic | A load balancer or CDN in public subnets; WAF in front | Public IPs on application servers |
| Database access from the app | Security group reference or a private endpoint in isolated subnets | A public database endpoint "protected" by an IP allowlist |
| Calling AWS APIs from private subnets | VPC endpoints | Sending S3 or ECR traffic through NAT |
| Shell access for engineers | Session Manager, EC2 Instance Connect Endpoint, or IAP | SSH open to `0.0.0.0/0`; long-lived personal keys |
| Internal tools for staff | An identity-aware proxy with SSO | A client VPN that exposes the whole network |
| Office or data center to cloud | Site-to-site VPN or a dedicated link | Exposing internal services publicly instead |
| Outbound third-party calls | Domain allowlisting for sensitive tiers | Assuming NAT filters anything |

A small team with one service can start with the zones, security groups by
reference, endpoints for AWS APIs, and Session Manager; domain-level egress
filtering and a mesh are worth their cost when the data is sensitive or the
number of services grows.

## Practical examples

### Private AWS access and tight egress for the API tier

The security groups `aws_security_group.api` and the VPC module come from
the reference architecture in
[cloud building blocks](../infrastructure-as-code/cloud-building-blocks.md).

```hcl
# infra/network-security.tf
data "aws_region" "current" {}

# S3 through a gateway endpoint: a route, no internet path, no NAT charges
resource "aws_vpc_endpoint" "s3" {
  vpc_id            = module.vpc.vpc_id
  service_name      = "com.amazonaws.${data.aws_region.current.region}.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = module.vpc.private_route_table_ids
}

# Secrets Manager through an interface endpoint (PrivateLink)
resource "aws_security_group" "endpoints" {
  name        = "taskflow-endpoints"
  description = "Interface endpoints, reachable only from the API tasks"
  vpc_id      = module.vpc.vpc_id
}

resource "aws_vpc_security_group_ingress_rule" "endpoints_from_api" {
  security_group_id            = aws_security_group.endpoints.id
  referenced_security_group_id = aws_security_group.api.id
  ip_protocol                  = "tcp"
  from_port                    = 443
  to_port                      = 443
  description                  = "HTTPS from the API tasks only"
}

resource "aws_vpc_endpoint" "secretsmanager" {
  vpc_id              = module.vpc.vpc_id
  service_name        = "com.amazonaws.${data.aws_region.current.region}.secretsmanager"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = module.vpc.private_subnets
  security_group_ids  = [aws_security_group.endpoints.id]
  private_dns_enabled = true
}

# Egress for the API: only what it needs (Terraform removed the default allow-all)
resource "aws_vpc_security_group_egress_rule" "api_to_endpoints" {
  security_group_id            = aws_security_group.api.id
  referenced_security_group_id = aws_security_group.endpoints.id
  ip_protocol                  = "tcp"
  from_port                    = 443
  to_port                      = 443
  description                  = "AWS APIs through interface endpoints"
}

resource "aws_vpc_security_group_egress_rule" "api_to_s3" {
  security_group_id = aws_security_group.api.id
  prefix_list_id    = aws_vpc_endpoint.s3.prefix_list_id
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
  description       = "S3 through the gateway endpoint"
}

# Flow logs for the whole VPC, delivered to the log archive account's bucket
resource "aws_flow_log" "vpc" {
  vpc_id                   = module.vpc.vpc_id
  traffic_type             = "ALL"
  log_destination_type     = "s3"
  log_destination          = var.flow_logs_bucket_arn
  max_aggregation_interval = 60
}
```

- The gateway endpoint exports a **prefix list** of S3's addresses in the
  Region, so the egress rule can say "S3 on 443" without hard-coding IPs.
- The interface endpoint has its own security group that accepts HTTPS only
  from the API, and private DNS makes the SDK's normal Secrets Manager
  hostname resolve to it.
- The API's remaining egress rules (to the database's private endpoint and
  to the egress filter for the payment provider) follow the same pattern;
  anything not listed is dropped.
- Flow logs capture every flow with a one-minute aggregation interval
  (the default is ten minutes), which helps during investigations.

### A bucket reachable only through your VPC endpoint

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyInsecureTransport",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:*",
      "Resource": [
        "arn:aws:s3:::taskflow-prod-exports",
        "arn:aws:s3:::taskflow-prod-exports/*"
      ],
      "Condition": {
        "Bool": {
          "aws:SecureTransport": "false"
        }
      }
    },
    {
      "Sid": "DenyAccessOutsideTheVpcEndpoint",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:*",
      "Resource": [
        "arn:aws:s3:::taskflow-prod-exports",
        "arn:aws:s3:::taskflow-prod-exports/*"
      ],
      "Condition": {
        "StringNotEquals": {
          "aws:SourceVpce": "vpce-<endpoint-id>"
        },
        "ArnNotLike": {
          "aws:PrincipalArn": "arn:aws:iam::123456789012:role/storage-admin"
        }
      }
    }
  ]
}
```

The first statement refuses plain HTTP. The second denies every request
that does not arrive through the named endpoint, unless it comes from the
`storage-admin` role (both conditions must be true for the deny to apply),
so a stolen credential used from a laptop is useless against this bucket.
Two cautions: test with the exception role first, because a mistake can
lock everyone out, including the console; and do not apply it to the
uploads bucket, because browsers upload there directly with presigned URLs
and their requests never pass through your endpoint. AWS services that
read the bucket on your behalf may need their own exception.

### Session Manager instead of SSH

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "StartSessionsOnTaskflowNodes",
      "Effect": "Allow",
      "Action": "ssm:StartSession",
      "Resource": "arn:aws:ec2:eu-west-1:123456789012:instance/*",
      "Condition": {
        "StringEquals": {
          "ssm:resourceTag/app": "taskflow"
        }
      }
    },
    {
      "Sid": "AllowedSessionDocuments",
      "Effect": "Allow",
      "Action": "ssm:StartSession",
      "Resource": [
        "arn:aws:ssm:eu-west-1:123456789012:document/SSM-SessionManagerRunShell",
        "arn:aws:ssm:eu-west-1:*:document/AWS-StartPortForwardingSessionToRemoteHost"
      ]
    },
    {
      "Sid": "ManageOwnSessionsOnly",
      "Effect": "Allow",
      "Action": [
        "ssm:TerminateSession",
        "ssm:ResumeSession",
        "ssmmessages:OpenDataChannel"
      ],
      "Resource": "arn:aws:ssm:*:*:session/*",
      "Condition": {
        "StringEquals": {
          "ssm:resourceTag/aws:ssmmessages:session-id": "${aws:userid}"
        }
      }
    }
  ]
}
```

Attached to the on-call permission set, this allows sessions only to
instances tagged `app=taskflow`, only with the standard shell and
remote-port-forwarding documents (the `*` in the account field covers
documents owned by AWS), and lets users end or resume only their own
sessions, following AWS's sample policies.

```bash
# A shell on a private instance: no inbound port, no SSH key
aws ssm start-session --target <instance-id>

# Forward a private service to the laptop (here the API's internal port)
aws ssm start-session --target <instance-id> \
  --document-name AWS-StartPortForwardingSessionToRemoteHost \
  --parameters '{"host":["api.internal.example.com"],"portNumber":["3000"],"localPortNumber":["3000"]}'
curl http://localhost:3000/healthz
```

The instance needs the SSM agent, an instance role that allows it to
register with Systems Manager, and a path to the Systems Manager endpoints
(through NAT or, better, interface endpoints for `ssm`, `ssmmessages`, and
`ec2messages`). Security groups need no inbound rule at all.

### IAP TCP forwarding on Google Cloud

```bash
# Allow SSH only from IAP's forwarding range
gcloud compute firewall-rules create allow-ssh-ingress-from-iap \
  --direction=INGRESS --action=allow --rules=tcp:22 \
  --source-ranges=35.235.240.0/20

# Grant one engineer the right to open tunnels
gcloud projects add-iam-policy-binding <project-id> \
  --member=user:oncall@example.com --role=roles/iap.tunnelResourceAccessor

# SSH through IAP; the VM has no external IP
gcloud compute ssh taskflow-worker-1 --zone=europe-west1-b --tunnel-through-iap
```

## Best practices

- Give public IPs only to load balancers, CDNs, and NAT gateways; keep data
  stores in subnets with no internet route.
- Write security group rules by reference to other groups, keep them in
  code, and scan them in pull requests.
- Declare egress explicitly: VPC endpoints for AWS APIs, private endpoints
  for databases, and a filtered path for the few external APIs a service
  needs.
- Require IMDSv2 everywhere and give every workload its own role.
- Replace bastions and open SSH with Session Manager, EC2 Instance Connect
  Endpoint, or IAP, behind SSO and MFA.
- Put internal tools behind an identity-aware proxy rather than a VPN that
  opens the whole network.
- Use TLS for every hop that carries sensitive data, even inside the VPC.
- Turn on flow logs and DNS query logs, store them in the log archive, and
  run threat detection over them.
- Use account-level guardrails such as VPC Block Public Access and S3 Block
  Public Access as a safety net under every change.

## In production

- **The database is suddenly reachable from the internet.**
  *Detect:* a posture tool (Security Hub CSPM, a third-party scanner)
  reports a public endpoint or `0.0.0.0/0` on the database port, or flow
  logs show accepted connections from unknown addresses. *Cause:* a
  "temporary" rule added in the console for debugging. *Fix:* remove the
  rule, check the database logs for access, move debugging to Session
  Manager port forwarding, and enforce through IaC scanning and drift
  detection.
- **An SSRF bug was used to read instance credentials.**
  *Detect:* GuardDuty reports credentials of an instance role used from an
  address outside AWS, or application logs show requests to
  `169.254.169.254`. *Cause:* IMDSv1 still allowed, so a single forged GET
  returned the role's credentials. *Fix:* rotate by stopping the instance
  or revoking role sessions, require IMDSv2 by account default, fix the
  SSRF, and narrow the role.
- **A compromised container downloaded tools and sent data to an unknown
  host.** *Detect:* flow logs and DNS query logs show connections to a
  never-seen domain; GuardDuty flags the destination. *Cause:* allow-all
  egress through NAT. *Fix:* isolate the task, rotate its credentials,
  then add endpoints and domain allowlisting so only required destinations
  are reachable.
- **Builds became slow and expensive after moving to private subnets.**
  *Detect:* NAT gateway processed bytes and charges jump; most traffic goes
  to ECR and S3. *Cause:* image pulls and artifacts flow through NAT.
  *Fix:* add an S3 gateway endpoint and interface endpoints for ECR, which
  cuts NAT data processing and removes an internet path.
- **Session Manager cannot reach a new instance.**
  *Detect:* the instance is missing from Fleet Manager and sessions fail to
  start. *Cause:* no instance role permission to register, no route to the
  Systems Manager endpoints, or the agent is not running. *Fix:* attach the
  managed instance policy to the role, add the `ssm`, `ssmmessages`, and
  `ec2messages` endpoints, and check the agent.
- **After adding a VPC-endpoint-only bucket policy, nobody can open the
  bucket in the console.** *Detect:* `AccessDenied` for every human
  request. *Cause:* console and laptop requests do not come through the
  endpoint, and the exception was missing or misspelled. *Fix:* recover
  through the exception role (or the root user of that account if needed),
  correct the condition, and test policies on a non-critical bucket first.

## Important terminology

- **Public, private, and isolated subnets:** Subnets with a route to an
  internet gateway, with outbound access through NAT only, and with no
  internet route at all.
- **Security group:** A stateful allow-list on network interfaces.
- **Network ACL:** A stateless, ordered allow and deny list on subnets.
- **Egress filtering:** Restricting which destinations workloads may
  connect to.
- **VPC endpoint:** A private path from a VPC to a service; gateway
  endpoints add routes, interface endpoints add private network interfaces
  (PrivateLink).
- **Data perimeter:** Policies that keep data reachable only by trusted
  identities from expected networks.
- **Bastion host:** A hardened server used as a jump point into private
  networks.
- **Identity-aware proxy:** A gateway that authorizes each request by
  identity and context before passing it to an internal application.
- **Zero trust:** A security model that grants no implicit trust based on
  network location.
- **Mutual TLS (mTLS):** TLS in which both client and server present
  certificates.
- **SSRF:** Server-side request forgery; tricking a server into making
  requests for the attacker.
- **IMDSv2:** The token-based version of the EC2 instance metadata service.
- **Flow logs:** Records of IP traffic metadata with accept or reject
  decisions.

## Common mistakes and misconceptions

- Treating "in a private subnet" as "secure"; private resources still need
  narrow security groups, IAM, and TLS.
- Leaving egress open because "outbound is harmless".
- Believing a NAT gateway is a firewall.
- Restricting S3 by `aws:SourceIp` and then adding a VPC endpoint, where
  that key is not present.
- Keeping a bastion with SSH open to the world "for emergencies".
- Assuming zero trust means removing all network segmentation.
- Assuming traffic inside a VPC needs no TLS, without checking what the
  provider encrypts and what auditors require.
- Enabling flow logs but never reading or alerting on them.

## Revision questions

1. Why is a NAT gateway not a security control, and what would you add to
   restrict TaskFlow API's outbound traffic?
2. Describe the three subnet zones for TaskFlow and which resources belong
   in each.
3. How does IMDSv2 defend against SSRF, and why do ECS task roles reduce
   the risk further?
4. Compare a bastion host, Session Manager, and IAP on inbound exposure,
   key management, and audit logging.
5. A bucket policy allows access only from the office IP range. After a VPC
   endpoint is added, the API can no longer read the bucket. Why, and how
   do you fix it?
6. What does zero trust change for an engineer who uses a VPN today to
   reach internal tools?
7. A team moved its build agents to private subnets and the NAT data
   processing charges jumped. Which traffic is the likely cause, and which
   change makes it cheaper and safer?
8. Is traffic between two instances in the same VPC encrypted? What would
   you check, and why might you add TLS anyway?

## Further learning

- [Amazon VPC: Security in Amazon VPC](https://docs.aws.amazon.com/vpc/latest/userguide/security.html)
- [Amazon VPC: Block public access to VPCs and subnets](https://docs.aws.amazon.com/vpc/latest/userguide/security-vpc-bpa.html)
- [AWS PrivateLink: What is AWS PrivateLink?](https://docs.aws.amazon.com/vpc/latest/privatelink/what-is-privatelink.html)
- [AWS Systems Manager: Session Manager](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager.html)
- [Google Cloud: Using IAP for TCP forwarding](https://docs.cloud.google.com/iap/docs/using-tcp-forwarding)
- [NIST SP 800-207: Zero Trust Architecture](https://csrc.nist.gov/pubs/sp/800/207/final)
- [Amazon EC2: Configure the instance metadata service options](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/configuring-instance-metadata-service.html)
- Next: [edge protection: WAF, DDoS, and bots](edge-protection-waf-ddos-and-bots.md). Back to the [DevSecOps and cloud security overview](../devsecops-and-cloud-security.md).
