# Compliance and Audit Readiness

Compliance means showing, to customers, auditors, and regulators, that
agreed security and privacy controls exist and keep working. For an
engineering team it is mostly operational: who can access production,
whether data is encrypted, what is logged and for how long, how changes
are reviewed, how data is deleted, and whether you can prove all of it
for a whole audit period. This lesson covers what SOC 2, ISO/IEC 27001,
HIPAA, GDPR, and PCI DSS ask of operations, the shared responsibility
model, encryption at rest and in transit, audit logs, access reviews,
evidence collection, data retention and deletion, business associate
agreements for health data, and policy as code.

It builds on the previous lessons: least privilege and access reviews in
[identity and access management](identity-and-access-management.md), and
patch deadlines in
[vulnerability and patch management](vulnerability-and-patch-management.md).

!!! note "Not legal advice"
    This page summarizes frameworks at a high level for engineers. Which
    laws and standards apply to you, and what they require in your case,
    depends on your contracts, data, and jurisdictions, and the texts
    change: proposals to amend the GDPR and the HIPAA Security Rule, and
    draft 2027 SOC 2 criteria, were all pending at the time of writing.
    Confirm with your legal, privacy, or compliance owner and the official
    texts linked below.

## Why it matters

Customers increasingly ask for a SOC 2 report or an ISO/IEC 27001
certificate before they sign, hospitals need a business associate
agreement before they share health data, and card brands require PCI DSS
compliance before you touch card numbers. Regulators can fine heavily:
GDPR Article 83 allows fines of up to EUR 20 million or 4% of worldwide
annual turnover for the most serious infringements.

For engineers, the expensive part is not the controls themselves (most
are good practice anyway) but proving them after the fact. Teams that
build evidence into their pipelines, such as reviewed pull requests,
policy checks, locked audit logs, and recorded access reviews, pass audits
with an export. Teams that do not spend weeks assembling screenshots and
discover that a control silently stopped working months ago.

## Real-world usage

- **AICPA SOC 2.** The AICPA describes
  [SOC 2](https://www.aicpa-cima.com/topic/audit-assurance/audit-and-assurance-greater-than-soc-2)
  as a report on controls at a service organization relevant to security,
  availability, processing integrity, confidentiality, or privacy, the
  five Trust Services Criteria categories. A Type 1 report covers the
  design of controls at a point in time; a Type 2 report also covers how
  they operated over a period. Reports use the 2017 Trust Services
  Criteria (with revised points of focus, 2022); in October 2026 the AICPA
  published exposure drafts of proposed 2027 criteria, which are not yet
  in effect.
- **ISO/IEC 27001:2022.** The current edition of
  [ISO/IEC 27001](https://www.iso.org/standard/82875.html) specifies
  requirements for an information security management system (ISMS);
  Amendment 1:2024 added climate action changes to the context clauses.
  Its Annex A lists 93 controls grouped into organizational, people,
  physical, and technological themes.
- **HHS and HIPAA.** The US Department of Health and Human Services
  publishes the
  [HIPAA Security Rule](https://www.hhs.gov/hipaa/for-professionals/security/index.html)
  (administrative, physical, and technical safeguards for electronic
  protected health information) and
  [guidance on cloud computing](https://www.hhs.gov/hipaa/for-professionals/special-topics/health-information-technology/cloud-computing/index.html),
  which explains that a cloud provider storing electronic PHI is a
  business associate even if it only stores encrypted data it cannot read.
- **GDPR.** Regulation (EU) 2016/679, the
  [General Data Protection Regulation on EUR-Lex](https://eur-lex.europa.eu/eli/reg/2016/679/oj),
  requires security appropriate to the risk (Article 32, which names
  encryption and pseudonymisation), breach notification to the supervisory
  authority within 72 hours where feasible (Article 33), and erasure on
  request when its conditions are met (Article 17).
- **PCI Security Standards Council.** The Council's announcement
  [Just Published: PCI DSS v4.0.1](https://blog.pcisecuritystandards.org/just-published-pci-dss-v4-0-1)
  describes the June 2024 limited revision of PCI DSS v4.0, which
  clarified requirements without adding or removing any. PCI DSS v4.0 was
  retired at the end of 2024, so v4.0.1 is the version assessments use.

**Popular tools and providers:** AWS Artifact, AWS Config conformance
packs, AWS Security Hub CSPM, AWS Audit Manager, CloudTrail, Azure Policy and
Microsoft Defender for Cloud regulatory compliance, Google Cloud Audit
Logs and Security Command Center, Open Policy Agent, Checkov, Kyverno, and
compliance automation platforms such as Vanta, Drata, and Secureframe.

## How it works

### What each framework asks of operations

| Framework | What it is | Who it applies to | What it asks of operations (high level) |
|---|---|---|---|
| SOC 2 | An attestation report by a CPA firm against the AICPA Trust Services Criteria | Service organizations whose customers ask for it (common for B2B SaaS) | Controls for access, change management, monitoring, incident response, vendor management, and backups, with evidence that they operated through the audit period (Type 2) |
| ISO/IEC 27001:2022 | A certifiable standard for an information security management system | Any organization that wants certification | A risk assessment, a Statement of Applicability choosing Annex A controls, internal audits, management review, and continual improvement, checked by surveillance audits |
| HIPAA | US law and regulations for protected health information | Covered entities (health plans, clearinghouses, most providers) and their business associates | Risk analysis, access control, audit controls, integrity, authentication, transmission security, contingency plans, BAAs, breach notification, documentation kept 6 years |
| GDPR | EU regulation on personal data | Organizations processing personal data of people in the EU, under its territorial rules | Security of processing, data protection by design, records of processing, processor contracts, data subject rights such as access and erasure, breach notification within 72 hours |
| PCI DSS v4.0.1 | An industry standard from the PCI Security Standards Council | Anyone who stores, processes, or transmits payment card account data | Network controls, secure configuration, protected stored card data, strong cryptography in transit, patching, need-to-know access, MFA, logging, regular testing |

A few concrete operational numbers that come up constantly:

- **PCI DSS 10.5.1:** keep audit log history for at least 12 months, with
  at least the most recent three months immediately available for
  analysis.
- **PCI DSS 7.2.4:** review all user accounts and their access privileges
  at least once every six months.
- **PCI DSS 6.3.3:** install critical-severity security patches within
  one month of release.
- **HIPAA:** retain required Security Rule documentation for six years.
  Notify affected individuals of a breach of unsecured PHI without
  unreasonable delay and no later than 60 days after discovery.
- **GDPR Article 12(3):** answer data subject requests (such as erasure)
  without undue delay and within one month, extendable by two further
  months where necessary.

In January 2025 HHS published a
[proposed rule to update the HIPAA Security Rule](https://www.federalregister.gov/documents/2025/01/06/2024-30983/hipaa-security-rule-to-strengthen-the-cybersecurity-of-electronic-protected-health-information)
(for example, making encryption and multi-factor authentication required
rather than "addressable"). At the time of writing it was still a
proposal, and the current rule remains in force; check HHS for its
status.

### Shared responsibility

![Diagram: seven layers compared for virtual machines, managed services such as Fargate, RDS, or Cloud Run, and software as a service; data, classification, and retention and identities and access are always the customer's; application code is the customer's except in software as a service; configuration such as network rules, keys, and logs is the customer's on virtual machines and shared on managed services and software as a service, where the customer chooses the settings; operating system, runtime, and patching are the customer's only on virtual machines; hosts, virtualization, network hardware, and physical data centers are always the provider's; the provider's reports cover its side and the customer's audit covers the rest.](compliance-shared-responsibility.svg)

A cloud provider's certifications cover its side of the line: the
[AWS shared responsibility model](https://aws.amazon.com/compliance/shared-responsibility-model/)
calls it security *of* the cloud, while the customer is responsible for
security *in* the cloud. Practically:

- Download the provider's reports (AWS Artifact, the Microsoft Service
  Trust Portal, Google's compliance reports manager) and give them to your
  auditor for the inherited controls, such as physical security.
- Everything you configure is yours to prove: bucket policies, security
  groups, IAM, encryption settings, logging, backups, and your
  application's access control.
- Each vendor that handles regulated data for you adds its own line and
  its own contract (a data processing agreement under GDPR, a BAA under
  HIPAA).

### Encryption at rest and in transit

| | At rest | In transit |
|---|---|---|
| What | Disks, databases, object storage, backups, snapshots, logs | Browser to edge, edge to load balancer, service to service, service to database |
| How | Provider-managed encryption on by default, or customer-managed keys in a KMS with envelope encryption | TLS 1.2 or later (1.3 preferred), HSTS for websites, TLS to databases and caches, mTLS in a service mesh |
| What auditors check | Encryption enabled everywhere, who can use the keys, key rotation, encrypted backups | No plaintext protocols, current TLS versions and ciphers, certificates managed and renewed |
| Framework hooks | GDPR Art. 32, HIPAA addressable encryption, PCI DSS requirement 3, ISO A.8.24 | GDPR Art. 32, HIPAA transmission security, PCI DSS requirement 4, ISO A.8.24 |

Encryption at rest in the cloud mostly protects against lost media and
some insider paths; it does not protect against a stolen credential that
can read the data through the API. That is why key policies matter:
customer-managed keys let you separate who can administer data from who
can decrypt it, and every decryption is logged. Under HIPAA, data
encrypted consistently with HHS guidance counts as "secured", which
affects whether a lost device or leaked file is a reportable breach. For
secrets and signing keys see
[secrets management](../environment-variables/secrets-management.md);
for TLS see
[TLS and certificate fundamentals](../ssl-certificates/tls-and-certificate-fundamentals.md)
and [network security in the cloud](network-security-in-the-cloud.md).

### Audit logs

Every framework asks for a record of who did what, when, and from where,
protected from tampering and kept long enough to investigate. Collecting
is not enough: the HIPAA Security Rule, for example, requires regularly
reviewing records of information system activity such as audit logs and
access reports, so pair logs with alerts and a review routine.

- **AWS CloudTrail** records API calls. Event history keeps 90 days of
  management events per Region for free; for anything longer, create a
  multi-Region trail (an organization trail for all accounts) that delivers
  to an S3 bucket, ideally in a separate log-archive account. Turn on log
  file integrity validation, which writes signed hourly digest files that
  prove whether log files were modified or deleted, and protect the bucket
  with
  [S3 Object Lock](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock.html)
  so not even an administrator can delete logs early. Data events (such as
  S3 object reads) are not recorded by default and cost extra; enable them
  for buckets holding regulated data.
- **Google Cloud Audit Logs:** Admin Activity logs are always written;
  Data Access logs, except for BigQuery, are disabled by default and must
  be enabled for services holding sensitive data.
- **Azure:** the Activity log records control-plane operations and keeps
  them for 90 days; export it with diagnostic settings for longer
  retention, alongside Microsoft Entra ID sign-in and audit logs.
- **Application audit logs** are your responsibility: who viewed which
  patient record, who exported which report, who changed whose role. Log
  identifiers, not the sensitive data itself, and treat these logs as
  regulated data (see
  [structured logging](../monitoring-and-logging/structured-logging.md)).

### Access reviews

Access reviews confirm, on a fixed cadence, that every person and
workload still needs the access it has. The mechanics (identity center
exports, unused-access findings, one ticket per removal) are covered in
[identity and access management](identity-and-access-management.md#access-reviews).
For compliance, what matters is that the review happens on schedule
(PCI DSS sets a maximum of six months; quarterly is common for
production), that a named owner signs off, and that every removal is
recorded. A review nobody can show did not happen.

### Evidence collection

![Diagram: four controls each backed by an automated evidence source; changes are reviewed, mapped to ISO A.8.32 and SOC 2 CC8.1, shown by Git and CI pull request approvals and pipeline runs; data is encrypted, mapped to ISO A.8.24 and PCI DSS requirements 3 and 4, shown by policy as code plan checks and Config rules; access is reviewed, mapped to ISO A.5.18 and PCI DSS 7.2.4, shown by identity provider exports and review tickets; activity is logged, mapped to ISO A.8.15 and PCI DSS requirement 10, shown by CloudTrail delivered to a locked bucket; all four feed an append-only, timestamped evidence store mapped to controls and kept for the audit period, which the auditor samples during a SOC 2 Type 2 period or ISO surveillance audit.](compliance-evidence-pipeline.svg)

Auditors usually work with a **population** and **samples**: "list every
production change in the period", then "for these 25, show the approval,
the tests, and the deploy". Design so that the answer is a query:

- **One control, many frameworks.** Map each internal control (such as
  "production changes are reviewed") to every framework it satisfies, and
  collect its evidence once.
- **Evidence from systems, not people:** pull request approvals and branch
  protection settings, CI logs, Terraform plans and policy results, cloud
  configuration rule results, access review tickets, backup and restore
  test reports, incident postmortems, training records.
- **Timestamped and append-only:** store exports in a bucket with
  versioning or Object Lock so evidence cannot be edited afterwards.
- **Continuous, not annual:** a control that silently broke in month two
  fails a Type 2 audit in month twelve. Alert when a check fails.

### Data retention and deletion

![Diagram: a user's data lives in five places from account creation; after an erasure request, a deletion job removes it from the primary database and from search and caches within days, inside the one-month response deadline; backups are not edited but age out when their 35-day retention ends, and a restore first re-applies the list of completed erasures; application logs hold only pseudonymous identifiers and age out after 90 days; invoices are kept with restricted access under a legal obligation until their retention period ends years later.](compliance-data-lifecycle.svg)

GDPR's storage limitation principle (Article 5) and most customer
contracts require that personal data is kept no longer than needed, and
deleted when a valid erasure request arrives. Make it operational:

- **A retention schedule:** for each data type, how long, why (contract,
  law, legitimate need), and the mechanism that enforces it.
- **Mechanisms, not intentions:** MongoDB TTL indexes, S3 lifecycle rules,
  log group retention settings, and scheduled jobs.
- **Erasure across copies:** primary databases, search indexes, caches,
  analytics, data warehouses, file storage, and processors (email and
  support tools). Keep a record that the erasure happened without keeping
  the data.
- **Backups:** editing backups is impractical; common practice is short
  backup retention, encrypted backups, and re-applying completed erasures
  after any restore. Write that down in your policy.
- **Exceptions:** legal holds and legal obligations (such as accounting
  records) override deletion for specific data; restrict access to it.
- **Crypto-shredding:** encrypting each tenant's data with its own key lets
  you make it unreadable everywhere, including backups, by destroying the
  key.

### BAAs for health data

Under HIPAA, a covered entity (or a business associate) must have a
**business associate agreement** with any vendor that creates, receives,
maintains, or transmits PHI on its behalf. HHS publishes
[sample BAA provisions](https://www.hhs.gov/hipaa/for-professionals/covered-entities/sample-business-associate-agreement-provisions/index.html).
For cloud providers, rely only on what their official pages state:

- **AWS** offers a Business Associate Addendum that customers review and
  accept in AWS Artifact, and its
  [HIPAA page](https://aws.amazon.com/compliance/hipaa-compliance/) says
  to process, store, and transmit PHI only in HIPAA-eligible services.
- **Microsoft** states on its
  [Azure HIPAA page](https://learn.microsoft.com/en-us/azure/compliance/offerings/offering-hipaa-us)
  that the HIPAA BAA is available by default to covered entities and
  business associates through the Microsoft Product Terms and Data
  Protection Addendum, for in-scope services.
- **Google Cloud** states on its
  [HIPAA page](https://cloud.google.com/security/compliance/hipaa) that it
  enters into BAAs as necessary, covering its infrastructure and the
  listed products, and that unsupported services should not be used for
  PHI.

For every other vendor in the data path (error tracking, email, SMS,
analytics, support desks), check its official documentation; if it does
not offer a BAA, PHI must not reach it. A BAA is necessary but not
sufficient: Microsoft's page notes that using a BAA-covered service does
not by itself make your solution compliant.

### Policy as code

Policy as code turns rules such as "no public buckets" or "databases are
encrypted" into automated checks:

- **Before deploy:** check Terraform plans with Open Policy Agent, Checkov,
  or Trivy in pull requests (see
  [IaC fundamentals](../infrastructure-as-code/iac-fundamentals.md) and
  [Terraform in practice](../infrastructure-as-code/terraform-in-practice.md)).
- **In the cloud:** AWS Config rules and conformance packs, Azure Policy,
  and Google Cloud organization policies evaluate or block the live
  configuration, including changes made outside Terraform.
- **In Kubernetes:** admission controllers such as Kyverno or OPA
  Gatekeeper reject non-compliant workloads.
- **As evidence:** every evaluation is timestamped, which is exactly what a
  Type 2 auditor wants to sample.

## When to use and when not to use

| Situation | Typical starting point |
|---|---|
| B2B SaaS selling to mid-size and enterprise customers in the US | SOC 2 Type 1, then Type 2 |
| Customers in Europe or regulated industries asking for certification | ISO/IEC 27001 |
| Handling PHI for US covered entities | HIPAA safeguards, BAAs with every vendor in the PHI path |
| Personal data of people in the EU | GDPR: records of processing, DPAs, rights handling, breach process |
| Taking card payments | PCI DSS; minimize scope with a hosted payment page or tokenization so card numbers never touch your servers |
| Early-stage product with no regulated data and no customer demand | Good security practice and a short security page; start formal programs when customers or data require them |

Avoid buying a compliance tool before you have controls to measure, and
avoid expanding scope: keeping card numbers or PHI out of systems that do
not need them is the cheapest control there is.

## Practical examples

### An audit trail that cannot be deleted

```hcl
# audit-trail.tf: every API call in every Region, written to a write-once bucket
data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

locals {
  trail_name = "taskflow-audit"
  trail_arn  = "arn:aws:cloudtrail:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:trail/${local.trail_name}"
}

resource "aws_s3_bucket" "audit" {
  bucket              = "example-taskflow-audit-logs"
  object_lock_enabled = true # must be set when the bucket is created
}

resource "aws_s3_bucket_versioning" "audit" {
  bucket = aws_s3_bucket.audit.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_object_lock_configuration" "audit" {
  bucket = aws_s3_bucket.audit.id
  rule {
    default_retention {
      mode = "COMPLIANCE" # nobody, not even the root user, can delete or shorten it
      days = 400
    }
  }
}

resource "aws_s3_bucket_public_access_block" "audit" {
  bucket                  = aws_s3_bucket.audit.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

data "aws_iam_policy_document" "cloudtrail_write" {
  statement {
    sid       = "CloudTrailAclCheck"
    actions   = ["s3:GetBucketAcl"]
    resources = [aws_s3_bucket.audit.arn]
    principals {
      type        = "Service"
      identifiers = ["cloudtrail.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:SourceArn"
      values   = [local.trail_arn]
    }
  }

  statement {
    sid       = "CloudTrailWrite"
    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.audit.arn}/AWSLogs/${data.aws_caller_identity.current.account_id}/*"]
    principals {
      type        = "Service"
      identifiers = ["cloudtrail.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "s3:x-amz-acl"
      values   = ["bucket-owner-full-control"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:SourceArn"
      values   = [local.trail_arn]
    }
  }
}

resource "aws_s3_bucket_policy" "audit" {
  bucket = aws_s3_bucket.audit.id
  policy = data.aws_iam_policy_document.cloudtrail_write.json
}

resource "aws_cloudtrail" "audit" {
  name                          = local.trail_name
  s3_bucket_name                = aws_s3_bucket.audit.id
  is_multi_region_trail         = true # one trail records every Region
  include_global_service_events = true # IAM, STS, and other global services
  enable_log_file_validation    = true # hourly signed digests prove nothing was altered

  depends_on = [aws_s3_bucket_policy.audit]
}
```

Four hundred days of compliance-mode retention covers PCI DSS's 12-month
minimum with margin. In an AWS Organization, put this bucket in a
dedicated log-archive account and make the trail an organization trail,
so that workload accounts cannot touch it.

### Continuous configuration checks as evidence

```hcl
# config-rules.tf: continuous checks that double as audit evidence
# (assumes an AWS Config recorder and delivery channel already exist in the account)
locals {
  managed_rules = {
    "cloudtrail-enabled"               = "CLOUD_TRAIL_ENABLED"
    "s3-bucket-versioning"             = "S3_BUCKET_VERSIONING_ENABLED"
    "s3-bucket-public-read-prohibited" = "S3_BUCKET_PUBLIC_READ_PROHIBITED"
    "ebs-volumes-encrypted"            = "ENCRYPTED_VOLUMES"
    "rds-storage-encrypted"            = "RDS_STORAGE_ENCRYPTED"
    "iam-user-mfa-enabled"             = "IAM_USER_MFA_ENABLED"
  }
}

resource "aws_config_config_rule" "managed" {
  for_each = local.managed_rules

  name = each.key
  source {
    owner             = "AWS"
    source_identifier = each.value
  }
}
```

Each rule evaluates resources continuously and keeps a compliance
history, so "were all volumes encrypted during the audit period?" becomes
a report instead of a guess. Note that some rule names differ from their
identifiers (`cloudtrail-enabled` is `CLOUD_TRAIL_ENABLED`). There is no
rule for default S3 encryption here: since January 2023 Amazon S3 encrypts
all new objects with SSE-S3 by default. Both files validate with Terraform
1.17.2 and AWS provider 6.73.0.

### Guardrails on every Terraform plan with Open Policy Agent

```text
# policy/terraform.rego: guardrails checked against `terraform show -json` output
package terraform.guardrails

# Changes that create or update something (ignore deletes and no-ops)
changes contains rc if {
	some rc in input.resource_changes
	some action in rc.change.actions
	action in {"create", "update"}
}

deny contains msg if {
	some rc in changes
	rc.type == "aws_s3_bucket_public_access_block"
	some setting in ["block_public_acls", "block_public_policy", "ignore_public_acls", "restrict_public_buckets"]
	rc.change.after[setting] != true
	msg := sprintf("%s: %s must be true", [rc.address, setting])
}

deny contains msg if {
	some rc in changes
	rc.type == "aws_vpc_security_group_ingress_rule"
	rc.change.after.cidr_ipv4 == "0.0.0.0/0"
	rc.change.after.from_port != 443
	msg := sprintf("%s: only port 443 may be open to the internet", [rc.address])
}

deny contains msg if {
	some rc in changes
	rc.type == "aws_db_instance"
	not rc.change.after.storage_encrypted
	msg := sprintf("%s: database storage must be encrypted", [rc.address])
}
```

```text
# policy/terraform_test.rego: unit tests for the guardrails (run with `opa test policy/`)
package terraform.guardrails_test

import data.terraform.guardrails

test_open_ssh_is_denied if {
	count(guardrails.deny) == 1 with input as {"resource_changes": [{
		"address": "aws_vpc_security_group_ingress_rule.ssh",
		"type": "aws_vpc_security_group_ingress_rule",
		"change": {"actions": ["create"], "after": {"cidr_ipv4": "0.0.0.0/0", "from_port": 22}},
	}]}
}

test_unencrypted_database_is_denied if {
	count(guardrails.deny) == 1 with input as {"resource_changes": [{
		"address": "aws_db_instance.main",
		"type": "aws_db_instance",
		"change": {"actions": ["create"], "after": {"storage_encrypted": false}},
	}]}
}
```

```bash
terraform plan -out=tfplan
terraform show -json tfplan > plan.json
opa test policy/
opa eval --fail-defined --format pretty \
  --data policy/terraform.rego --input plan.json "data.terraform.guardrails.deny[msg]"
```

Run against a plan that adds a public access block with
`block_public_acls = false` and an SSH rule open to `0.0.0.0/0`, the
evaluation prints:

```text
[
  "aws_s3_bucket_public_access_block.exports: block_public_acls must be true",
  "aws_vpc_security_group_ingress_rule.ssh_anywhere: only port 443 may be open to the internet"
]
```

`--fail-defined` makes the command exit with code 1 when any `deny`
message exists, so it can gate a pull request. The policy uses the Rego
v1 syntax of OPA 1.x (`contains` and `if`), passes `opa fmt`, and was
tested with OPA 1.22.4 against a real `terraform show -json` plan.
Conftest, a CLI built on OPA for testing configuration files, accepts the
same syntax if you prefer it in CI.

### Keeping the policy run as evidence in CI

```yaml
# .github/workflows/terraform-policy.yml (excerpt)
jobs:
  policy:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write
    defaults:
      run:
        working-directory: infra/envs/prod
    steps:
      - uses: actions/checkout@v7
      - uses: hashicorp/setup-terraform@dfe3c3f87815947d99a8997f908cb6525fc44e9e # v4.0.1
        with:
          terraform_wrapper: false
      - uses: aws-actions/configure-aws-credentials@v6
        with:
          role-to-assume: arn:aws:iam::123456789012:role/taskflow-terraform-plan
          aws-region: eu-west-1
      - run: terraform init -input=false
      - run: terraform plan -input=false -lock=false -out=tfplan
      - run: terraform show -json tfplan > plan.json
      - name: Install OPA
        run: |
          curl -fsSL -o /usr/local/bin/opa \
            https://github.com/open-policy-agent/opa/releases/download/v1.22.4/opa_linux_amd64_static
          chmod +x /usr/local/bin/opa
      - name: Evaluate guardrails
        run: |
          opa eval --format pretty --data ../../../policy/terraform.rego --input plan.json \
            "data.terraform.guardrails.deny" | tee policy-result.txt
          opa eval --fail-defined --format pretty --data ../../../policy/terraform.rego \
            --input plan.json "data.terraform.guardrails.deny[msg]" > /dev/null
      - if: always()
        uses: actions/upload-artifact@v7
        with:
          name: policy-evidence-${{ github.sha }}
          path: infra/envs/prod/policy-result.txt
```

The uploaded result ties a commit to the policies it passed. Artifact
storage has its own retention limits, so for audit periods copy the
results to the evidence bucket as well.

### Retention by TTL and an erasure job

```js
// scripts/retention-indexes.js: let MongoDB delete expiring data on its own
import { MongoClient } from "mongodb";

const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
const db = client.db();

// Sessions disappear 30 days after the user was last seen
await db.collection("sessions").createIndex(
  { lastSeenAt: 1 },
  { expireAfterSeconds: 60 * 60 * 24 * 30, name: "ttl_sessions_30d" },
);

// Password reset tokens live for one hour
await db.collection("passwordResets").createIndex(
  { createdAt: 1 },
  { expireAfterSeconds: 60 * 60, name: "ttl_password_resets_1h" },
);

await client.close();
```

```js
// src/privacy/erase-user.js: one job deletes a user's personal data everywhere we hold it
import { createHash } from "node:crypto";

export async function eraseUser(db, userId, { searchIndex, emailProvider }) {
  const user = await db.collection("users").findOne({ _id: userId });
  if (!user) return { status: "not_found" };

  await db.collection("tasks").deleteMany({ ownerId: userId });
  await db.collection("comments").deleteMany({ authorId: userId });
  await db.collection("sessions").deleteMany({ userId });
  await searchIndex.deleteByOwner(userId);           // copies outside MongoDB
  await emailProvider.deleteContact(user.email);      // processors too

  // Invoices stay (legal obligation); detach them from the person's profile
  await db.collection("invoices").updateMany(
    { userId },
    { $set: { customerName: "erased", customerEmail: null } },
  );

  await db.collection("users").deleteOne({ _id: userId });

  // Record that the erasure happened, without keeping who it was
  await db.collection("erasures").insertOne({
    subject: createHash("sha256").update(String(userId)).digest("hex"),
    completedAt: new Date(),
  });
  return { status: "erased" };
}
```

A TTL index removes a document once its date field is older than
`expireAfterSeconds`; MongoDB's background task runs about every minute,
so expiry is not instant. The `erasures` collection lists the users to
re-delete after any backup restore, and it is evidence that requests were
handled on time. Whether invoices may keep a name depends on local
accounting law; this is where your privacy owner decides, not the code.

### A retention schedule

| Data | Retention | Basis | Mechanism |
|---|---|---|---|
| Active account data | While the account exists | Contract | Erasure job on account deletion |
| Sessions | 30 days after last use | Security, legitimate need | TTL index |
| Application logs | 90 days | Operations, security | Log retention setting; identifiers only |
| Cloud audit logs | 400 days | PCI DSS 10.5.1, security investigations | Object Lock on the audit bucket |
| Backups | 35 days | Disaster recovery | Backup retention policy; erasures re-applied on restore |
| Invoices | As required by accounting law | Legal obligation | Restricted access, scheduled deletion after the period |
| Audit evidence | Audit period plus one year | Certification and attestation | Versioned evidence bucket |

## Best practices

- Map each internal control to every framework it satisfies, and collect
  its evidence once, automatically.
- Know your side of the shared responsibility line, and keep the
  provider's reports for the rest.
- Encrypt everything at rest and in transit by default; control and log
  who can use the keys.
- Send audit logs from every account and Region to a separate, locked
  account with integrity validation, kept at least as long as your
  strictest framework requires.
- Run access reviews on schedule with named owners, and record every
  removal.
- Check policies on every Terraform plan and continuously in the cloud;
  alert when a check fails.
- Write a retention schedule and enforce it with TTLs, lifecycle rules, and
  jobs; plan erasure across every copy, including processors and backups.
- Sign BAAs or DPAs before regulated data reaches a vendor, and keep
  regulated data out of systems that do not need it.
- Rehearse the breach process, including the 72-hour GDPR clock and
  HIPAA's 60-day limit.

## In production

- **The auditor asks for a year of change approvals and nobody can
  produce them.**
  *Detect:* evidence requests take weeks; some changes have no linked
  review. *Cause:* direct pushes, console changes, and approvals in chat.
  *Fix:* branch protection with required reviews, deploys only from CI,
  and exports of pull request and pipeline records to the evidence store.
- **CloudTrail had gaps for weeks.**
  *Detect:* the `cloudtrail-enabled` rule reports non-compliance; digest
  validation shows missing files. *Cause:* a trail stopped or a bucket
  policy changed. *Fix:* an organization trail managed in code, Object
  Lock, Config rules and alerts on logging changes.
- **A departed engineer still had production access during the audit
  period.**
  *Detect:* the access review sample shows an active account weeks after
  their last day. *Cause:* offboarding not tied to the identity provider,
  or IAM users outside single sign-on. *Fix:* single sign-on with automatic
  deprovisioning, no IAM users for people, and recorded reviews.
- **A restore brought back users who had asked to be erased.**
  *Detect:* a complaint from a person who requested erasure. *Cause:*
  backups restored without re-applying erasures. *Fix:* keep the erasure
  list and run it as part of every restore procedure.
- **PHI showed up in a third-party error tracker without a BAA.**
  *Detect:* a search of error events finds patient names in payloads.
  *Cause:* full request bodies attached to error reports. *Fix:* scrub or
  allowlist fields before sending, sign a BAA if the vendor offers one or
  stop sending such data, and assess whether a breach notification is
  required.
- **Encryption was enabled, but the same role could administer and read
  everything.**
  *Detect:* key policies grant broad decrypt access. *Cause:*
  default keys with permissive access. *Fix:* customer-managed keys with
  separated administration and usage permissions, and alerts on unusual
  decrypt activity.

## Important terminology

- **SOC 2 Type 1 / Type 2:** attestation reports on the design of controls
  at a point in time / on design and operating effectiveness over a
  period.
- **Trust Services Criteria:** the AICPA criteria for security,
  availability, processing integrity, confidentiality, and privacy.
- **ISMS:** an information security management system, the subject of
  ISO/IEC 27001.
- **Statement of Applicability:** the ISO/IEC 27001 document stating which
  Annex A controls apply and why.
- **PHI / ePHI:** protected health information / in electronic form.
- **Covered entity / business associate:** organizations HIPAA applies to
  directly / vendors handling PHI on their behalf.
- **BAA:** a business associate agreement required between those parties.
- **Controller / processor:** under GDPR, who decides why and how data is
  processed / who processes it on the controller's behalf.
- **DPA:** a data processing agreement between controller and processor.
- **Cardholder data environment (CDE):** the systems that store, process,
  or transmit card data, which PCI DSS scopes.
- **Shared responsibility model:** the split of security duties between
  cloud provider and customer.
- **Evidence:** records that show a control operated, collected for
  auditors.
- **Retention schedule:** how long each type of data is kept, why, and how
  deletion is enforced.
- **Crypto-shredding:** making data unreadable by destroying its
  encryption key.
- **Policy as code:** compliance and security rules written as automated,
  version-controlled checks.

## Common mistakes and misconceptions

- Believing a cloud provider's certification makes your system compliant.
- Treating compliance as a yearly project instead of continuous evidence.
- Assuming a BAA or DPA with the cloud provider covers every other vendor.
- Logging sensitive data (PHI, card numbers, passwords) in application
  logs to make debugging easier.
- Keeping data "just in case", which increases risk and conflicts with
  storage limitation.
- Promising deletion without accounting for backups, analytics, and
  processors.
- Thinking encryption at rest stops attackers who hold valid credentials.
- Equating passing an audit with being secure.

## Revision questions

1. What is the difference between a SOC 2 Type 1 and a Type 2 report, and
   why does Type 2 need continuous evidence?
2. Which parts of a deployment on managed containers are your
   responsibility under the shared responsibility model?
3. A breach affecting EU users is discovered on Friday at 16:00. By when
   must the supervisory authority normally be notified under GDPR
   Article 33, and what if not all facts are known yet?
4. How do you make CloudTrail logs trustworthy as audit evidence?
5. PCI DSS requires 12 months of audit log history with three months
   immediately available. Design a storage setup that meets this.
6. Why can a cloud provider be a HIPAA business associate even if it only
   stores encrypted data? How do you check whether a vendor offers a BAA?
7. How would you handle an erasure request for data that also exists in
   backups and in invoices?
8. Give two examples of policy as code, one before deploy and one in the
   running cloud, and explain how each produces audit evidence.

## Further learning

- [AICPA: SOC 2](https://www.aicpa-cima.com/topic/audit-assurance/audit-and-assurance-greater-than-soc-2)
- [ISO/IEC 27001:2022](https://www.iso.org/standard/82875.html)
- [HHS: HIPAA Security Rule](https://www.hhs.gov/hipaa/for-professionals/security/index.html)
  and [Breach Notification Rule](https://www.hhs.gov/hipaa/for-professionals/breach-notification/index.html)
- [EUR-Lex: General Data Protection Regulation (EU) 2016/679](https://eur-lex.europa.eu/eli/reg/2016/679/oj)
- [PCI Security Standards Council: Document library](https://www.pcisecuritystandards.org/document_library/)
- [AWS: Shared responsibility model](https://aws.amazon.com/compliance/shared-responsibility-model/)
- [AWS CloudTrail: Validating log file integrity](https://docs.aws.amazon.com/awscloudtrail/latest/userguide/cloudtrail-log-file-validation-intro.html)
- [AWS Config: Conformance packs](https://docs.aws.amazon.com/config/latest/developerguide/conformance-packs.html)
- [Open Policy Agent: Policy language](https://www.openpolicyagent.org/docs/policy-language)
- Next: [DevSecOps and cloud security interview questions and answers](interview-questions-and-answers.md). Back to the
  [DevSecOps and cloud security overview](../devsecops-and-cloud-security.md).
