# Identity and Access Management

In the cloud, every action is an API call, and every API call is checked by
identity and access management (IAM): who is calling, what are they trying
to do, to which resource, and under what conditions. There is no network
cable to unplug; a stolen credential with the right permissions is as good
as being inside the data center. That makes IAM the most important control
plane in a cloud deployment.

This lesson covers principals, users and roles, least privilege, AWS IAM
policies with conditions and how AWS evaluates them, MFA, single sign-on
and identity providers, short-lived credentials for people and workloads,
break-glass accounts, access reviews, separating production into its own
account with AWS Organizations and a landing zone, and what a leaked key
really costs. Examples use AWS, with the Google Cloud and Azure equivalents
named where they differ. The basic IAM principles are introduced in
[cloud building blocks](../infrastructure-as-code/cloud-building-blocks.md),
and workload identity for secrets in
[secrets management](../environment-variables/secrets-management.md).

## Why it matters

Most cloud breaches do not break encryption or exploit the hypervisor. They
use a credential: an access key in a public repository, a token printed in
a CI log, a session stolen from a laptop, or a workload role that can do
far more than the workload needs. Once inside, the attacker's reach is
exactly the reach of that identity. Good IAM design makes each credential
short-lived, narrowly scoped, and attributable to one person or workload,
so a single leak becomes a small, visible, recoverable event instead of a
company-wide incident.

IAM also decides how fast a team can safely move. Engineers who can get
the access they need through a well-designed single sign-on flow do not
keep personal admin keys "just in case". Production that lives in its own
account turns "I ran it against the wrong environment" into a permission
error.

## Real-world usage

- **Uber, 2016.** The US Federal Trade Commission's
  [settlement announcement](https://www.ftc.gov/news-events/news/press-releases/2018/04/uber-agrees-expanded-settlement-ftc-related-privacy-security-claims)
  explains that intruders reached data in a third-party cloud provider "by
  using an access key an Uber engineer had posted on a code-sharing
  website", downloading files with more than 25 million names and email
  addresses, and that the breach was not disclosed until November 2017.
  One long-lived key unlocked the data store.
- **Microsoft Exchange Online, 2023.** The Cyber Safety Review Board's
  [review](https://www.cisa.gov/sites/default/files/2025-03/CSRBReviewOfTheSummer2023MEOIntrusion508.pdf)
  describes attackers forging authentication tokens with a consumer signing
  key created in 2016 that should have been retired in 2021; manual
  rotation had stopped, and the key's scope was not enforced. The board
  calls signing keys a cloud provider's "crown jewels". The lessons apply
  to any team's keys: rotate automatically, scope narrowly, and alert on
  old credentials.
- **AWS IAM best practices.** AWS's
  [IAM best practices](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html)
  recommend federation with temporary credentials for people, IAM roles for
  workloads, MFA, least privilege, and regularly removing unused users,
  roles, and permissions.
- **AWS quarantines exposed keys.** When AWS detects that an IAM user's
  keys were exposed publicly, it can attach the managed policy
  [AWSCompromisedKeyQuarantine](https://docs.aws.amazon.com/aws-managed-policy/latest/reference/AWSCompromisedKeyQuarantineV4.html),
  which denies certain actions "to limit the potential damage that may be
  caused by fraud-related activity leading to unauthorized charges", and
  opens a support case. The existence of an automated quarantine shows how
  routinely exposed keys are abused.
- **Emergency access done deliberately.** The Well-Architected practice
  [SEC03-BP03 Establish emergency access process](https://docs.aws.amazon.com/wellarchitected/latest/framework/sec_permissions_emergency_process.html)
  recommends a dedicated emergency access account with pre-created roles or
  users, SCPs protecting those roles, alerts whenever the account is used,
  and regular testing.

**Popular tools and providers:** AWS IAM, IAM Identity Center, AWS
Organizations, AWS Control Tower, and IAM Access Analyzer; Google Cloud IAM,
organization policies, and Workload Identity Federation; Microsoft Entra
ID, Azure RBAC, managed identities, and Privileged Identity Management;
identity providers such as Microsoft Entra ID, Okta, and Google Workspace;
HashiCorp Vault for dynamic credentials.

## How it works

### Principals and credentials

A **principal** is anything that can make a request: a person, a
workload (an EC2 instance, an ECS task, a Lambda function, a Kubernetes
pod), a CI job, another AWS account, or an AWS service acting for you. A
principal proves who it is with **credentials**, and the kind of
credential decides most of the risk.

| Credential | Lifetime | Typical holder | Main risk |
|---|---|---|---|
| IAM user password plus MFA | Until changed | Break-glass users only | Phishing, shared accounts |
| IAM user access key | Until deleted | Legacy tools, third-party integrations | Leaks into code, logs, and laptops; valid from anywhere |
| Role session (STS) | 15 minutes to the role's maximum (1 to 12 hours) | People through SSO, workloads, CI | Theft during the session; limited by expiry |
| Instance or task role credentials | Rotated automatically | EC2, ECS, Lambda, EKS pods | Theft through SSRF or a compromised container |
| OIDC token exchanged for a role | Minutes, then a role session | CI jobs, workloads in other clouds | Over-broad trust policy conditions |

An **IAM user** has long-lived credentials. An **IAM role** has none: a
principal **assumes** it through AWS STS and receives temporary
credentials (an access key ID, a secret key, and a session token) that
expire. AWS's guidance is that people sign in through federation and
workloads use roles, so long-lived access keys become rare exceptions with
an owner and a rotation date.

### Policies and how AWS evaluates them

A policy is a JSON document of **statements**. Each statement has an
`Effect` (`Allow` or `Deny`), an `Action` (such as `s3:GetObject`), a
`Resource` (an ARN), and optionally a `Condition` that must be true, such
as `aws:SourceIp`, `aws:PrincipalOrgID`, or `s3:prefix`. Policies come in
several types:

- **Identity-based policies** attach to users, groups, and roles: what this
  principal may do.
- **Resource-based policies** attach to resources such as S3 buckets, KMS
  keys, and SQS queues: who may use this resource. A role's **trust
  policy** is the resource-based policy that says who may assume it.
- **Permissions boundaries** cap what an identity-based policy can grant,
  which lets a team create roles without being able to create
  administrators.
- **Session policies** narrow a single role session.
- **Service control policies (SCPs)** and **resource control policies
  (RCPs)** in AWS Organizations cap the permissions of every principal or
  resource in an account or organizational unit. They never grant
  anything.

![Diagram: a request carrying principal, action, resource, and context goes through five checks in order; an explicit Deny in any policy type leads straight to Denied; then SCPs and RCPs must allow it when the account is in an organization; then an identity-based or resource-based policy must allow it, as a union within one account and from both sides across accounts; then a permissions boundary must allow it if the principal has one; then a session policy must allow it if the session has one; any failed check leads to Denied, and only a request that passes all five is Allowed.](iam-policy-evaluation.svg)

Two rules explain almost every "access denied" message. Everything is
**denied by default**, and an **explicit deny always wins** over any allow.
Within one account, an allow in either the identity-based or the
resource-based policy is enough, but SCPs, RCPs, boundaries, and session
policies must all allow as well. Across accounts, both sides must allow:
the caller's identity policy and the resource's policy.

### Least privilege in practice

Least privilege means each principal can do what its job needs and nothing
more. In practice it is a process, not a single policy:

1. **Start from the actions the workload performs.** TaskFlow API reads its
   own secrets, reads and writes objects under one bucket prefix, and
   nothing else. Write exactly that.
2. **Scope resources by ARN and prefix**, not `*`. A role that may read
   `taskflow/prod/*` secrets cannot read the billing service's secrets.
3. **Add conditions** where they express intent: only through a given
   service (`kms:ViaService`), only from your organization
   (`aws:PrincipalOrgID`), only over TLS (`aws:SecureTransport`).
4. **Generate and trim.** IAM Access Analyzer can generate a policy from
   the actions a role actually used in CloudTrail, and its unused access
   analyzer reports roles, keys, and permissions that have not been used
   for a chosen number of days.
5. **Watch the dangerous permissions.** `iam:PassRole` on `*` lets a
   principal hand any role, including an administrator role, to a service
   it controls. `iam:CreatePolicyVersion`, `iam:AttachRolePolicy`, and
   `sts:AssumeRole` on broad resources are similar escalation paths.

Attribute-based access control (ABAC) adds tags to the picture: a
condition such as
`"aws:ResourceTag/project": "${aws:PrincipalTag/project}"` lets one policy
serve many teams, each limited to resources carrying its own tag.

### People: single sign-on, MFA, and short sessions

Engineers should not have IAM users at all. They sign in to the company's
**identity provider** (IdP) such as Microsoft Entra ID, Okta, or Google
Workspace, which enforces MFA and knows who has joined, moved, or left.
**IAM Identity Center** connects the IdP to every AWS account: groups map
to **permission sets**, and each permission set becomes a role in the
assigned accounts.

![Diagram: sequence with four lifelines; the engineer runs aws sso login against the start URL of IAM Identity Center, signs in at the identity provider with MFA such as a passkey, the identity provider sends a SAML assertion with the user's groups to Identity Center, Identity Center maps the group taskflow-oncall to the ProdViewOnly permission set in the production account, returns temporary credentials valid for one hour, the engineer's API calls to production are signed with those credentials, and CloudTrail records each call with the user's identity; with no long-lived keys, removing the user in the identity provider ends access at the next sign-in.](human-access-flow.svg)

- **Session length:** a new permission set defaults to a 1-hour session,
  configurable up to 12 hours. Shorter sessions for production limit what a
  stolen laptop session can do.
- **MFA:** enforce it in the IdP, preferably with phishing-resistant
  methods such as passkeys or security keys. The IAM condition key
  `aws:MultiFactorAuthPresent` is only present when temporary credentials
  were used, and AWS documents that it is not present for federated
  identities or for requests signed with access keys, so it cannot enforce
  MFA for SSO users by itself.
- **Joiners, movers, leavers:** provision users and groups from the IdP
  (SCIM), so removing someone in one place removes their access to every
  account.
- **Elevated access:** keep everyday permission sets read-only in
  production and grant write access through a separate, time-limited
  permission set or a just-in-time approval tool.

The Google Cloud equivalent is Cloud Identity or Workspace with IAM roles
on projects and folders; on Azure, Microsoft Entra ID with Azure RBAC and
Privileged Identity Management for just-in-time roles.

### Workloads: identities without keys

Workloads should receive credentials from the platform they run on, never
from a file or an environment variable:

- **EC2:** an instance profile; the role's credentials come from the
  instance metadata service. Require IMDSv2 (session-token based), which
  blocks the simple server-side request forgery (SSRF) tricks that read
  credentials through a vulnerable proxy; see
  [network security in the cloud](network-security-in-the-cloud.md).
- **ECS and Fargate:** a **task role** per service; **Lambda:** an
  execution role; **EKS:** Pod Identity or IAM roles for service accounts.
- **CI:** an OIDC token from GitHub Actions exchanged for a role whose
  trust policy names one repository and environment; see
  [pipeline and supply chain security](../ci-cd/pipeline-and-supply-chain-security.md).
- **Other clouds:** Google Cloud's Workload Identity Federation and Azure
  managed identities follow the same idea.

When an AWS service assumes a role on your behalf, add the
`aws:SourceAccount` or `aws:SourceArn` condition to the trust policy, as
the ECS documentation recommends, so that another customer cannot trick the
service into using your role (the **confused deputy** problem).

### Accounts as blast-radius boundaries

An AWS account is a hard isolation boundary: resources, IAM, quotas, and
billing are separate. Putting production in its own account is the
simplest way to guarantee that a staging credential, a sandbox experiment,
or a mistyped profile cannot touch production.

![Diagram: the management account holds the organization and billing and runs no workloads, next to IAM Identity Center for SSO, MFA, and permission sets; the Security OU contains the Log Archive account with the organization trail and Config logs, the Audit account with security tools and audit roles, and an emergency access account with an alert on any use; the Workloads OU contains taskflow-staging and taskflow-production with SCP guardrails restricting Regions, protecting trails, and denying the root user; the Sandbox OU contains developer sandboxes with budgets and SCPs that limit instance types; a dashed path shows the CloudTrail organization trail delivering every account's API activity to Log Archive.](aws-account-structure.svg)

- **AWS Organizations** groups accounts into **organizational units
  (OUs)**. SCPs attached to an OU set the maximum permissions for every
  principal in its accounts; RCPs do the same for resources. Neither
  affects the management account, which is one reason to run no workloads
  there. Declarative policies set service configurations (for example,
  requiring IMDSv2 for new EC2 instances) across the organization.
- **A landing zone** is the standard multi-account setup most teams copy:
  a log archive account that receives every account's audit logs, an audit
  or security tooling account, workload accounts per environment, and
  sandboxes. **AWS Control Tower** builds one, provisions new accounts
  through Account Factory, and applies preventive, detective, and
  proactive controls.
- **Root users:** with centralized root access management, the management
  account can delete the root user credentials of member accounts and run
  the few tasks that need root through short-term privileged sessions.
- **Elsewhere:** Google Cloud uses an organization, folders, projects, and
  organization policies; Azure uses management groups, subscriptions, and
  Azure Policy.

### Break-glass access

Single sign-on is a dependency: if the IdP is down, or its federation
certificate expires, nobody can sign in. A **break-glass** process provides
a second path for a small set of administrators, and AWS's Well-Architected
guidance describes it as a dedicated emergency access account with
pre-created IAM users (each tied to one person) or a vaulted root user with
multiple hardware MFA devices, cross-account roles protected by SCPs, logs
in the central log archive, and alerts whenever the account is used outside
a declared emergency. Credentials are rotated after every use, and the
path is tested in game days, because a break-glass procedure that has never
been tried will fail when it is needed.

### Access reviews

Permissions accumulate: people change teams, projects end, and temporary
access is never removed. An **access review** asks each owner, on a fixed
cadence (often quarterly for production), to confirm who has which access
and to remove what is no longer needed. Make reviews cheap by generating
the evidence: permission set assignments per account from Identity Center,
unused access findings from IAM Access Analyzer, IAM credential reports for
the few remaining IAM users, and a ticket per removal. Auditors for SOC 2
and ISO/IEC 27001 ask for exactly this record; see
[compliance and audit readiness](compliance-and-audit-readiness.md).

### The cost of a leaked key

A long-lived key in a public repository should be considered stolen as
soon as it is pushed. Attackers use leaked cloud keys to start compute in
every Region they can reach (often for cryptocurrency mining), copy data,
and create new users or keys so they keep access after the original key is
revoked. The compute bill grows with three multipliers: instances per
Region, Regions reached, and hours until someone notices. Thirty large
instances in each of 4 Regions over a 72-hour weekend is
`30 x 4 x 72 = 8,640` instance-hours that the account pays for, before any
data-loss cost. Each multiplier maps to a control on this page: an SCP that
denies unused Regions cuts the Regions, budget alerts and threat detection
(Amazon GuardDuty, Google Security Command Center, Microsoft Defender for
Cloud) cut the hours, least-privilege policies cut what the key can start,
and having no long-lived keys removes the event entirely.

## When to use and when not to use

| Need | Use | Avoid |
|---|---|---|
| Engineers accessing AWS | IAM Identity Center federated to the company IdP, MFA, short sessions | IAM users with personal access keys |
| A service running on AWS | A role per service (task role, instance profile, execution role) | Access keys in environment variables or files |
| CI deploying to AWS | OIDC federation to a role bound to repository and environment | Repository secrets holding access keys |
| A third-party tool that only accepts keys | An IAM user with a minimal policy, key rotation, and monitoring | Sharing an engineer's key |
| Separating environments | Separate accounts per environment under Organizations | Tags or naming conventions as the only boundary |
| Emergency access | A tested break-glass process with alerts | Shared admin passwords kept "for emergencies" |
| Org-wide rules | SCPs and RCPs as guardrails | Expecting SCPs to grant access; they only restrict |

## Practical examples

### A least-privilege task role for TaskFlow API

The API running on ECS reads its own secrets and stores attachments under
one prefix of the uploads bucket.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ReadOwnSecrets",
      "Effect": "Allow",
      "Action": "secretsmanager:GetSecretValue",
      "Resource": "arn:aws:secretsmanager:eu-west-1:123456789012:secret:taskflow/prod/*"
    },
    {
      "Sid": "DecryptSecretsThroughSecretsManagerOnly",
      "Effect": "Allow",
      "Action": "kms:Decrypt",
      "Resource": "arn:aws:kms:eu-west-1:123456789012:key/<key-id>",
      "Condition": {
        "StringEquals": {
          "kms:ViaService": "secretsmanager.eu-west-1.amazonaws.com"
        }
      }
    },
    {
      "Sid": "ReadWriteAttachments",
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::taskflow-prod-uploads/attachments/*"
    },
    {
      "Sid": "ListAttachmentsPrefixOnly",
      "Effect": "Allow",
      "Action": "s3:ListBucket",
      "Resource": "arn:aws:s3:::taskflow-prod-uploads",
      "Condition": {
        "StringLike": {
          "s3:prefix": "attachments/*"
        }
      }
    }
  ]
}
```

- Secrets are limited to the `taskflow/prod/` path; Secrets Manager adds a
  random six-character suffix to secret ARNs, which the trailing `*` also
  covers.
- `kms:Decrypt` is needed only when the secrets use a customer managed KMS
  key, and `kms:ViaService` limits it to decryption performed by Secrets
  Manager, so the role cannot decrypt arbitrary data with that key.
- Object actions apply to `attachments/*` only. `s3:ListBucket` is a
  bucket-level action, so its prefix restriction is a condition on
  `s3:prefix` rather than a resource path.
- There is no `s3:*`, no `Resource: "*"`, and no IAM permission at all.

### The trust policy: who may assume the role

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "ecs-tasks.amazonaws.com"
      },
      "Action": "sts:AssumeRole",
      "Condition": {
        "ArnLike": {
          "aws:SourceArn": "arn:aws:ecs:eu-west-1:123456789012:*"
        },
        "StringEquals": {
          "aws:SourceAccount": "123456789012"
        }
      }
    }
  ]
}
```

Only ECS tasks may assume the role, and only when the request comes from
ECS acting for this account in this Region, which closes the confused
deputy path.

### Organization guardrails with SCPs

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyLeavingTheOrganization",
      "Effect": "Deny",
      "Action": "organizations:LeaveOrganization",
      "Resource": "*"
    },
    {
      "Sid": "ProtectAuditTrails",
      "Effect": "Deny",
      "Action": [
        "cloudtrail:DeleteTrail",
        "cloudtrail:StopLogging",
        "cloudtrail:UpdateTrail",
        "cloudtrail:PutEventSelectors"
      ],
      "Resource": "*",
      "Condition": {
        "ArnNotLike": {
          "aws:PrincipalArn": "arn:aws:iam::*:role/security-admin"
        }
      }
    },
    {
      "Sid": "DenyRootUserExceptBucketPolicyRecovery",
      "Effect": "Deny",
      "NotAction": [
        "s3:GetBucketPolicy",
        "s3:PutBucketPolicy",
        "s3:DeleteBucketPolicy"
      ],
      "Resource": "*",
      "Condition": {
        "ArnLike": {
          "aws:PrincipalArn": "arn:aws:iam::*:root"
        }
      }
    }
  ]
}
```

Attached to the Workloads OU, this SCP stops any principal in staging or
production from removing the account from the organization, stops anyone
except the security team's role from turning off audit trails, and denies
the root user everything except fixing a bucket policy that locked
everyone out. These statements follow AWS's published
[SCP examples](https://github.com/aws-samples/service-control-policy-examples),
which also include a Region restriction: a `Deny` with `NotAction` listing
global services and a `StringNotEquals` condition on `aws:RequestedRegion`.
Use the full list of exempt global services from that example (IAM, for
instance, is always called in `us-east-1`), and test every SCP on a test OU
before attaching it widely.

### Permission sets as code

```hcl
# infra/identity/production-access.tf
data "aws_ssoadmin_instances" "this" {}

locals {
  sso_instance_arn  = tolist(data.aws_ssoadmin_instances.this.arns)[0]
  identity_store_id = tolist(data.aws_ssoadmin_instances.this.identity_store_ids)[0]
}

resource "aws_ssoadmin_permission_set" "prod_view_only" {
  name             = "ProdViewOnly"
  description      = "Resources and metadata in production, no data access"
  instance_arn     = local.sso_instance_arn
  session_duration = "PT1H"
}

resource "aws_ssoadmin_managed_policy_attachment" "prod_view_only" {
  instance_arn       = local.sso_instance_arn
  permission_set_arn = aws_ssoadmin_permission_set.prod_view_only.arn
  managed_policy_arn = "arn:aws:iam::aws:policy/job-function/ViewOnlyAccess"
}

data "aws_identitystore_group" "oncall" {
  identity_store_id = local.identity_store_id

  alternate_identifier {
    unique_attribute {
      attribute_path  = "DisplayName"
      attribute_value = "taskflow-oncall"
    }
  }
}

resource "aws_ssoadmin_account_assignment" "oncall_production" {
  instance_arn       = local.sso_instance_arn
  permission_set_arn = aws_ssoadmin_permission_set.prod_view_only.arn
  principal_id       = data.aws_identitystore_group.oncall.group_id
  principal_type     = "GROUP"
  target_id          = var.production_account_id
  target_type        = "AWS_ACCOUNT"
}
```

The on-call group gets a one-hour, view-only session in production.
`ViewOnlyAccess` shows resources and metadata without reading data such as
object contents, unlike `ReadOnlyAccess`. Because the assignment is code,
every change to production access is a reviewed pull request, which is also
access review evidence.

### Finding unused access

```bash
# One analyzer for the whole organization, run from the management account
# or the delegated administrator account
aws accessanalyzer create-analyzer \
  --analyzer-name org-unused-access \
  --type ORGANIZATION_UNUSED_ACCESS \
  --configuration '{"unusedAccess": {"unusedAccessAge": 90}}'

# Findings: unused roles, access keys, passwords, and permissions (90+ days)
aws accessanalyzer list-findings-v2 --analyzer-arn <analyzer-arn>
```

Review the findings in each access review and remove what nobody used.

### Responding to a leaked access key

```bash
# 1. Disable the key at once (re-enable later if it was a false alarm)
aws iam update-access-key --user-name ci-legacy \
  --access-key-id <access-key-id> --status Inactive

# 2. What did it do? Event history keeps 90 days of management events per Region
aws cloudtrail lookup-events --region eu-west-1 \
  --lookup-attributes AttributeKey=AccessKeyId,AttributeValue=<access-key-id> \
  --max-results 50

# 3. Look for persistence the attacker may have created
aws iam list-users --query 'Users[].[UserName,CreateDate]' --output table
aws iam list-access-keys --user-name ci-legacy

# 4. Delete the key and move the workload to a role
aws iam delete-access-key --user-name ci-legacy --access-key-id <access-key-id>
```

Check every Region the account can use, not only the one you normally
deploy to, and check the organization trail in the log archive account,
which keeps events longer than the 90-day event history. Then treat it as a
security incident: see
[incident response and postmortems](../monitoring-and-logging/incident-response-and-postmortems.md).

## Best practices

- Federate people through one identity provider with phishing-resistant
  MFA; give engineers no IAM users and no access keys.
- Give every workload its own role, and every CI pipeline an OIDC-assumed
  role bound to repository and environment.
- Write policies per workload with explicit actions and resource ARNs;
  add conditions that express intent; review `iam:PassRole` carefully.
- Put production in its own account; use SCPs for guardrails, a log
  archive account for audit logs, and no workloads in the management
  account.
- Keep production sessions short and default to read-only; grant write
  access through a separate, time-limited path.
- Remove root user credentials from member accounts, and protect the
  management account's root user with multiple hardware MFA devices.
- Maintain and test a break-glass process, with alerts on every use.
- Run access reviews on a schedule with generated evidence, and remove
  unused access found by IAM Access Analyzer.
- Treat any exposed key as compromised: disable, investigate, rotate, and
  replace it with a role.

## In production

- **Deploys fail with "AccessDenied" after a new SCP was attached.**
  *Detect:* CloudTrail shows `errorCode: AccessDenied` for the deploy role
  starting at the time of the SCP change, and the error message names an
  explicit deny in a service control policy. *Cause:* a guardrail (often a
  Region restriction) blocks an action the deploy needs, such as a global
  service called through `us-east-1`. *Fix:* detach or narrow the SCP,
  exempt the global service, and test SCPs on a test OU first.
- **An access key appears in a public commit.**
  *Detect:* GitHub secret scanning, a provider notification, or AWS
  attaching a quarantine policy and opening a case. *Cause:* a long-lived
  key in a file or test. *Fix:* deactivate the key, review CloudTrail for
  its activity in every Region, remove anything the attacker created, then
  replace the key with a role or OIDC.
- **A service can read another service's secrets.**
  *Detect:* IAM Access Analyzer or a policy review shows
  `secretsmanager:GetSecretValue` on `*`; CloudTrail shows reads of
  unrelated secrets. *Cause:* a shared, over-broad task role. *Fix:* one
  role per service with secret ARNs scoped by path, and an alert on
  cross-service secret reads.
- **Nobody can sign in during an identity provider outage.**
  *Detect:* SSO sign-in fails for everyone while the IdP status page
  reports an incident. *Cause:* no tested emergency path. *Fix:* invoke
  the break-glass process; afterwards, rotate the break-glass credentials
  and schedule regular tests.
- **A departed engineer's access key is still active months later.**
  *Detect:* the IAM credential report or an unused-access finding shows a
  key with a recent "last used" date after the person left. *Cause:* an
  IAM user created outside the IdP, so offboarding never reached it.
  *Fix:* deactivate and investigate, remove IAM users for people, and
  include IAM users in access reviews.
- **A role can escalate itself to administrator.**
  *Detect:* a privilege-escalation check (Access Analyzer policy checks,
  a third-party IAM scanner) flags `iam:PassRole` or
  `iam:CreatePolicyVersion` on `*`. *Cause:* a convenience policy written
  for a deploy tool. *Fix:* restrict `iam:PassRole` to the specific role
  ARNs and the service (`iam:PassedToService`), and add a permissions
  boundary for roles the tool creates.

## Important terminology

- **Principal:** An entity that makes requests: a user, role session,
  service, or account.
- **IAM role:** An identity without long-term credentials that principals
  assume to receive temporary credentials.
- **Trust policy:** The resource-based policy on a role that says who may
  assume it.
- **Least privilege:** Granting only the permissions a task needs.
- **Explicit deny:** A `Deny` statement, which overrides any allow.
- **Permissions boundary:** A policy that caps the permissions an
  identity-based policy can grant.
- **SCP and RCP:** Organization policies that cap the permissions of
  principals (SCP) or resources (RCP) in member accounts.
- **Permission set:** An IAM Identity Center template that becomes a role
  in each assigned account.
- **Federation:** Signing in with an external identity provider instead of
  local credentials.
- **Workload identity:** Credentials issued to software by the platform it
  runs on.
- **Confused deputy:** A trusted service tricked into acting for the wrong
  party.
- **Break-glass access:** A tested emergency path used only when normal
  access fails.
- **Landing zone:** A standard multi-account environment with shared
  logging, security, and guardrails.

## Common mistakes and misconceptions

- Creating IAM users with access keys for people because "SSO is extra
  work".
- Believing SCPs grant permissions; they only limit them.
- Using `"Resource": "*"` because finding the ARN format took too long.
- Expecting `aws:MultiFactorAuthPresent` to enforce MFA for SSO users; MFA
  for federated users is enforced in the identity provider.
- Sharing one role across services, which makes every service as powerful
  as the most powerful one.
- Running workloads in the management account, where SCPs do not apply.
- Deleting a leaked key from Git history but leaving it active.
- Having a break-glass account that nobody has tested.

## Revision questions

1. Why are IAM roles safer than IAM users for both people and workloads?
2. Walk through how AWS evaluates a request when an SCP, an identity
   policy, and a permissions boundary all apply. What happens when only one
   of them lacks an allow?
3. Write the statements a service needs to list and read objects only
   under `reports/` in one bucket, and explain why `s3:ListBucket` needs a
   condition rather than a resource path.
4. What problem do `aws:SourceArn` and `aws:SourceAccount` solve in a trust
   policy?
5. An access key leaked at 09:00 on Friday starts 30 instances in each of
   4 Regions, and nobody notices until 09:00 on Monday. How many
   instance-hours does the account pay for, and which control shrinks each
   multiplier? (30 x 4 x 72 = 8,640 instance-hours; an SCP denying unused
   Regions cuts the Regions, budget alerts and threat detection cut the
   hours, and having no long-lived keys prevents the event.)
6. Why should production live in its own account, and what belongs in the
   management account?
7. Describe a break-glass process and how you would know it was used.
8. What evidence makes an access review fast and credible?

## Further learning

- [AWS: Security best practices in IAM](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html)
- [AWS: Policy evaluation logic](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_evaluation-logic.html)
- [AWS: Global condition context keys](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_condition-keys.html)
- [AWS Organizations: Managing organization policies](https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_policies.html)
- [AWS Control Tower: What is AWS Control Tower?](https://docs.aws.amazon.com/controltower/latest/userguide/what-is-control-tower.html)
- [IAM Identity Center: Set session duration](https://docs.aws.amazon.com/singlesignon/latest/userguide/howtosessionduration.html)
- [Google Cloud: Workload Identity Federation](https://docs.cloud.google.com/iam/docs/workload-identity-federation)
- Next: [network security in the cloud](network-security-in-the-cloud.md). Back to the [DevSecOps and cloud security overview](../devsecops-and-cloud-security.md).
