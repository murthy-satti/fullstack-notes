# DevSecOps and Cloud Security Interview Questions and Answers

These questions review security in the delivery pipeline, identity and
access management, network security, edge protection, vulnerability and
patch management, and compliance. Try answering each one before reading
the answer.

## Security in the delivery pipeline

### 1. What does "shift left" mean, and why is it not enough on its own?

Shift left means running a check as early in the delivery path as it can
run (on the laptop, in the pull request), because the author still has the
context and nothing is deployed yet. It is not enough on its own: new CVEs
are published against code that has not changed, some problems exist only
in a built image or a running service, and console changes never pass
through a pull request. Mature pipelines also rescan `main`, registries,
and production continuously.

### 2. What do SAST, SCA, secret scanning, IaC scanning, image scanning, and DAST each find, and what do they miss?

SAST reads source code and follows untrusted data to dangerous operations;
it misses missing logic such as broken access control. SCA matches
dependencies against advisory databases; it finds nothing new. Secret
scanning finds credentials in known formats. IaC scanning finds public
buckets and open ports before they exist, but not console drift. Image
scanning finds known CVEs in OS and language packages. DAST probes the
running app over HTTP and misses code paths it never reaches.

### 3. How does taint tracking find an injection bug? Use a NoSQL example.

The analyzer follows data from a **source** an attacker controls
(`req.body.owner`) to a **sink** where it is dangerous (`Task.find()`); if
no **sanitizer** sits in between, it raises an alert. With the body
`{"owner": {"$ne": null}}`, the filter matches every task whose owner is
not null. Validating the input as a string first (`z.string().parse()`)
breaks the taint, and non-string input fails with a 400.

### 4. Which findings should block a merge, and what happens to the rest?

Block only on findings that are **new** in the change, **high or critical**
from a high-confidence rule, and **fixable**. Everything else is reported
and becomes a ticket with a deadline. A gate that blocks on old, unfixable,
or noisy findings trains people to bypass it, and then the one important
finding is ignored too. New scanners start in report-only mode and are
tuned before they enforce.

### 5. What is the difference between a baseline and an exception?

A **baseline** is a recorded snapshot of existing findings that a gate
ignores so only new ones fail (Checkov's `--create-baseline`, for
example); the debt itself goes into tickets. An **exception** accepts one
specific finding, with an owner, a reason, and an expiry date:

```text
# .trivyignore: accepted by the API team lead; reviewed at expiry
CVE-YYYY-NNNNN exp:2026-12-31
```

After the expiry date the finding returns and the gate fails again.

### 6. Why is ignoring unfixed vulnerabilities a sensible default for an image gate, and what risk remains?

A gate the author cannot satisfy gets bypassed, and a CVE without a fixed
version cannot be fixed by a version bump. Gating on fixable findings
(Trivy's `--ignore-unfixed`) keeps the gate meaningful. The risk is that an
exploitable vulnerability without a fix stays open, so it needs a separate
track: a mitigation, a time-boxed exception, and a subscription to the
advisory.

### 7. What should happen when a secret is found in a commit?

Treat it as an incident, not a lint error: revoke and rotate the credential
first, then check what it was used for, then clean up the history. Rewriting
Git history does not make a pushed secret safe. Prevent recurrence with
layers: a pre-commit hook, platform push protection, a CI scan of every
push, and a scan of built images and bundles. TruffleHog can verify a
candidate against the provider to separate live keys from test strings.

### 8. What is SARIF, and why send every scanner's results to one place?

SARIF is a JSON standard for static analysis results (rule, location,
severity). Uploading every tool's SARIF to code scanning gives one list
with pull request annotations, deduplication across runs, and auditable
dismissal reasons, so a finding is triaged once. The upload job needs
`security-events: write`, and each tool should use its own `category`.

### 9. What did the 2026 compromise of the Trivy GitHub Action teach about running scanners in CI?

In March 2026 attackers force-pushed 76 of 77 version tags of
`aquasecurity/trivy-action` (CVE-2026-33634) to code that stole credentials
from the runner before the real scan ran. Scanners are dependencies too:
pin third-party actions to full commit SHAs, pin the scanner binary, give
scanner jobs read-only permissions and no secrets, and rotate everything
the affected workflows could read. A pin protects only the code it names,
so prefer actions that pin their own dependencies.

### 10. Where should DAST run, and how do ZAP's baseline, API, and full scans differ?

Against staging or a disposable environment you own, never against
production without explicit approval. The **baseline** scan spiders for a
minute and runs passive checks only. The **API** scan imports an OpenAPI,
SOAP, or GraphQL definition and actively attacks each operation. The
**full** scan spiders and actively attacks a web app, filling it with junk
data. A rules file marks each alert `IGNORE`, `INFO`, `WARN`, or `FAIL`.

## Identity and access management

### 11. Why are IAM roles safer than IAM users?

An IAM user's access key works from anywhere until someone deletes it. A
role has no long-term credentials: a principal assumes it through STS and
receives temporary credentials that expire (role sessions last from 15
minutes up to the role's maximum of 1 to 12 hours). People should sign in
through federation and workloads should use roles, so long-lived keys
become rare exceptions with an owner and a rotation date.

### 12. How does AWS evaluate a request when several policy types apply?

Everything is denied by default, and an explicit deny anywhere wins. Then,
in an organization, SCPs and RCPs must allow the request; an identity-based
or resource-based policy must allow it (either one within an account, both
across accounts); and a permissions boundary and a session policy must
allow it if they exist. If any required layer lacks an allow, the request
is denied.

### 13. What is a role's trust policy, and what is the confused deputy problem?

The trust policy is the resource-based policy on a role that says who may
assume it. The confused deputy problem arises when a trusted service, such
as ECS, can be tricked by another customer into using your role. Adding
`aws:SourceAccount` or `aws:SourceArn` conditions to the trust policy limits
assumption to the service acting for your account and resources.

### 14. Why can't `aws:MultiFactorAuthPresent` enforce MFA for single sign-on users?

AWS documents that the key is present only when temporary credentials were
used, and is absent for federated identities and for requests signed with
access keys. MFA for people who sign in through IAM Identity Center is
enforced in the identity provider, preferably with phishing-resistant
methods such as passkeys or security keys.

### 15. What do SCPs and RCPs do, and what can they not do?

They set the maximum permissions for every principal (SCPs) or resource
(RCPs) in member accounts and organizational units: guardrails such as
"no unused Regions" or "nobody may stop CloudTrail". They never grant
anything, and they do not affect the management account, which is one
reason to run no workloads there. Test them on a test OU first, because a
guardrail can block a deploy that needs a global service.

### 16. How should a GitHub Actions workflow authenticate to AWS?

With OIDC instead of stored keys. The job requests an ID token
(`id-token: write`), and STS exchanges it for short-lived role credentials
if the trust policy's conditions match:

```json
{"StringEquals": {
  "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
  "token.actions.githubusercontent.com:sub": "repo:example/taskflow-api:environment:production"}}
```

Binding `sub` to one repository and environment means another repository,
branch, or pull request cannot assume the production role. Never use a
wildcard such as `repo:example/*` for a deploy role.

### 17. Which IAM permissions are classic privilege-escalation paths?

`iam:PassRole` on `*` lets a principal hand any role, including an
administrator role, to a service it controls. `iam:CreatePolicyVersion`,
`iam:AttachRolePolicy`, and broad `sts:AssumeRole` are similar. Restrict
`iam:PassRole` to specific role ARNs and services (`iam:PassedToService`),
add permissions boundaries to roles that tools create, and run policy
checks that flag these patterns.

### 18. What is a break-glass process, and how do you keep it both safe and usable?

It is a second way in for a few administrators when single sign-on fails
(an identity provider outage or an expired federation certificate): a
dedicated emergency account with pre-created users tied to individuals, or
a vaulted root user with hardware MFA, protected by SCPs. Every use raises
an alert, credentials are rotated after use, logs go to the log archive,
and the path is tested in game days so it works when needed.

### 19. What makes an access review fast and credible?

Generated evidence instead of spreadsheets: permission set assignments per
account from Identity Center, unused-access findings from IAM Access
Analyzer, credential reports for the remaining IAM users, and one ticket
per removal, signed off by a named owner on a fixed cadence (often
quarterly for production; PCI DSS 7.2.4 requires at least every six
months). Managing permission set assignments as code makes every change a
reviewed pull request.

### 20. A leaked key starts 30 instances in each of 4 Regions over a 72-hour weekend. What does it cost, and which controls shrink each factor?

`30 x 4 x 72 = 8,640` instance-hours before any data-loss cost. An SCP that
denies unused Regions cuts the Regions; budget alerts and threat detection
(GuardDuty, Security Command Center, Defender for Cloud) cut the hours;
least privilege limits what the key can start; and having no long-lived
keys removes the event.

## Network security in the cloud

### 21. What belongs in public, private, and isolated subnets?

Public subnets hold only what must accept internet traffic: load balancers
and NAT gateways. Private app subnets hold the API tasks, which accept
traffic only from the load balancer's security group. Isolated data subnets
have no route to an internet gateway or NAT at all, and the database
accepts connections only from the API's security group or through a
private endpoint.

### 22. Why write security group rules by reference to other groups instead of IP addresses?

"The API accepts port 3000 from the load balancer's group" stays correct
as tasks are replaced and IPs change, and it reads like a policy. Know the
defaults: the default security group allows all traffic between members
and all outbound traffic, and new groups start with allow-all egress
(Terraform's `aws_security_group` removes it, so egress must be declared).
Keep rules in code and scan them in pull requests.

### 23. When do you use network ACLs instead of security groups?

Security groups are stateful allow-lists on network interfaces and do most
of the work. Network ACLs are stateless, ordered allow and deny lists on
subnets; use them for coarse, subnet-wide decisions such as denying an
address range during an incident or making data subnets refuse anything
from public subnets. Their explicit deny is something security groups
cannot express.

### 24. Why is a NAT gateway not a security control, and how do you control egress?

NAT gives private subnets outbound access but filters nothing. Egress
controls, from coarse to fine: security group egress rules (IP ranges,
prefix lists, groups), VPC endpoints for AWS APIs, Route 53 Resolver DNS
Firewall for domain names (which a client can bypass with a raw IP), and
AWS Network Firewall or an egress proxy that filters by TLS SNI or HTTP
Host. Endpoints often lower NAT charges as well.

### 25. How does IMDSv2 protect instance credentials from SSRF?

The metadata service starts each session with an HTTP `PUT` that returns a
token, and every read must carry that token. Open WAFs, reverse proxies,
and most SSRF bugs can only make `GET` requests, so they cannot fetch the
role's credentials. Require IMDSv2 as an account default (or through a
declarative policy), keep the hop limit low on hosts without containers,
and prefer task or pod roles, which do not come from instance metadata.

### 26. Compare a bastion host, Session Manager, and Identity-Aware Proxy for administrative access.

A bastion is an internet-facing server with SSH open to known ranges: a
host to patch, keys to issue and revoke, and logs on the box an attacker
would target. Session Manager's agent connects outbound, users start
sessions through the AWS API with IAM (so SSO and MFA), and sessions are
logged centrally with no inbound port. Google's IAP lets SSH in only from
`35.235.240.0/20` and requires the `roles/iap.tunnelResourceAccessor` role,
so the VM needs no external IP.

### 27. What does zero trust change compared with a client VPN?

A VPN checks the user once at the edge and then the network trusts them,
so a stolen VPN login reaches everything on it. Zero trust authenticates
and authorizes each request using identity, device state, and context,
per application: identity-aware proxies for people, workload identity and
mutual TLS for services. Segmentation still matters; zero trust means the
network is not the only check, not that the network is flat.

### 28. Is traffic inside a VPC encrypted, and why add TLS anyway?

AWS documents that traffic between Availability Zones is encrypted and
that many Nitro-based instance types encrypt traffic between instances
automatically when both sides qualify; VPC Encryption Controls can report
and enforce this. Application TLS is still the norm: it protects against a
compromised host inside the network, it authenticates the server (and the
client with mTLS), and it does not depend on instance types that can
change.

### 29. What is a data perimeter, and why does `aws:SourceIp` stop working with VPC endpoints?

A data perimeter keeps data reachable only by trusted identities from
expected networks, built from endpoint policies and resource policies such
as a bucket policy that requires `aws:SourceVpce`. Requests that arrive
through a VPC endpoint do not include the `aws:SourceIp` key, so a bucket
policy that allows only certain IP addresses denies the API's own requests
once an endpoint is added. Use `aws:SourceVpce` instead, with a tested
exception role.

## Edge protection: WAF, DDoS, and bots

### 30. What are the three kinds of DDoS attack, and where is each stopped?

**Volumetric** attacks (UDP floods, amplification through open DNS, NTP, or
memcached servers) exhaust bandwidth and are absorbed by the provider's
backbone and anycast edge. **Protocol** attacks (SYN floods, fragments)
exhaust connection tables and are stopped by the edge network and load
balancers. **Application-layer** attacks (HTTP floods, HTTP/2 Rapid Reset,
expensive search requests) look like real traffic and need WAF rules, rate
limits, bot management, caching, and a resilient application.

### 31. What does AWS Shield Standard include, and when is a premium DDoS tier worth it?

Shield Standard protects every AWS customer against common layer 3 and 4
attacks at no extra charge. Shield Advanced adds protection for more
resource types, automatic application-layer mitigation through AWS WAF, a
response team, and DDoS cost protection, for a large fixed subscription
with a one-year commitment. It pays off when an outage costs more than the
subscription or expert help during an attack is needed; a small team
behind a CDN usually starts with the included tier plus a WAF.

### 32. How does the OWASP Core Rule Set decide whether to block a request?

By **anomaly scoring**. Each matching rule adds points by severity
(CRITICAL 5, ERROR 4, WARNING 3, NOTICE 2), and after all request rules run
the total is compared with the inbound threshold, 5 by default, so one
critical match blocks. Responses have their own threshold (4). The
**paranoia level** (1 to 4) chooses how many rules run; level 1 rarely
causes false positives, and CRS 4 can log a higher detection level without
blocking on it.

### 33. How do you roll out a WAF without breaking real users?

Deploy in count or detection mode and send logs to a central store; read
what would have been blocked over a representative period, including
releases and batch jobs; fix false positives narrowly (override one rule
to count, scope it away from one path, or exclude one field, using labels
in AWS WAF); then switch to blocking and alert on sudden changes in the
block rate after deploys.

### 34. Why don't per-IP rate limits stop credential stuffing?

The attack is distributed. With a limit of 10 login requests per minute
per IP, a botnet of 2,000 addresses still makes
`2,000 x 10 x 60 = 1,200,000` guesses an hour without hitting it, while an
office of 300 people behind one NAT address shares the same 10 requests.
Add bot detection, per-account failure throttling, breached-password
checks, and MFA, and choose better keys than IP where you can.

### 35. Why can't an API used by mobile apps rely on JavaScript challenges?

Challenges and CAPTCHAs run in browsers. A mobile app or API client cannot
solve them, so a challenge simply breaks it. API endpoints need other
signals: API keys or session tokens, signed requests, app attestation where
available, and per-key or per-account rate limits.

### 36. What is origin cloaking, and how do you implement it?

Making the origin unreachable except through the edge, because every edge
protection is optional for an attacker who can reach the origin directly,
and origin addresses leak through old DNS records, unproxied subdomains,
mail headers, and certificate logs. Allow only the edge's addresses (on
AWS, the `com.amazonaws.global.cloudfront.origin-facing` prefix list),
require a secret header or mutual TLS, or remove the public origin with a
CloudFront VPC origin or Cloudflare Tunnel.

### 37. Does a WAF rule replace patching?

No. A WAF rule is a **virtual patch**: it blocks known exploit patterns
(such as the Log4j JNDI rules in AWS's known bad inputs group) and buys time
while you patch. Attackers obfuscate payloads to get around it, and CISA's
KEV entry for Log4Shell accepted temporary mitigations only until updates
were available. Patch, rebuild, and redeploy as fast as the deadline
requires.

## Vulnerability and patch management

### 38. What is the difference between a CVE, a CWE, and an advisory such as a GHSA?

A **CVE** is a unique ID and record for one publicly known vulnerability,
assigned by a CVE Numbering Authority, often the vendor itself. A **CWE** is
a class of weakness (Log4Shell is CWE-917, expression language
injection). A **GHSA** advisory in the GitHub Advisory Database maps a
vulnerability to exact vulnerable and fixed package versions in an
ecosystem such as npm, which is what dependency scanners match against.

### 39. What does a CVSS score tell you, and what does it not?

CVSS (version 4.0, maintained by FIRST) describes severity: how bad
exploitation would be for a generic installation. Its base metrics are
intrinsic; threat metrics add exploit maturity and environmental metrics
add your own controls. Most published scores are base-only (CVSS-B), so they
say nothing about whether anyone is exploiting the vulnerability or
whether your deployment is exposed. Use CVSS to order work, not to set
deadlines.

### 40. What is EPSS, and how should it be combined with CVSS and KEV?

FIRST's Exploit Prediction Scoring System gives a daily probability that a
CVE will see exploitation activity in the next 30 days; version 5 has
published scores since June 2026. Confirmed exploitation (a KEV entry)
overrides any score, and EPSS must not be multiplied by CVSS, which is an
ordinal scale. Probabilities add up: 100 findings at 0.05 mean about 5
exploited in a month, and `1 - 0.95^100 ≈ 99.4%` odds of at least one.

### 41. What is the CISA KEV catalog, and why check it first?

A list of vulnerabilities with an assigned CVE, reliable evidence of
exploitation in the wild, and a clear remediation action; the November
2026 catalog holds 1,779 entries, 361 marked as used in ransomware
campaigns. It is the strongest single signal and small enough to drive to
zero. It is published as a JSON feed that scripts can read, and CISA
recommends that every organization address KEV entries immediately.

### 42. How does CISA's BOD 26-04 set remediation deadlines?

It replaced BOD 22-01's fixed deadlines (two weeks for recent CVEs, six
months for older ones) in June 2026 for US federal civilian agencies. Four
decision points (publicly exposed, in KEV, automatable, technical impact)
map to 3, 14, or 60 days, or "fix on system upgrade". KEV entries with
total impact in the 3-day class also need forensic triage. The clock starts
at the KEV addition or at discovery, whichever comes first, and moves when
the facts change.

### 43. What is VEX, and when is a `not_affected` statement justified?

VEX records whether a product is affected by a vulnerability, with the
statuses `not_affected`, `affected`, `fixed`, and `under_investigation`. A
`not_affected` statement needs a justification such as
`component_not_present` or `vulnerable_code_not_present` (kernel headers
flagged in a container image, for example). Trivy reads OpenVEX,
CycloneDX, and CSAF with `--vex`. Treat it as a reviewed claim with an owner
and a review date, never as a mute button.

### 44. What changed at the NVD in 2026, and how should a team adapt?

Since April 15, 2026, NIST enriches priority CVEs (KEV entries, software
used by the federal government, and critical software) and leaves the rest
"not scheduled for immediate enrichment"; it also no longer routinely adds
its own severity score when one exists. A process that waits for an NVD
score stalls. Use the CNA's score, GHSA and OSV data, distribution
severities, KEV, EPSS, and CISA's SSVC data instead.

### 45. How should a team keep container base images patched?

Images are snapshots, so rebuild on a schedule, not only on code changes:
`docker build --pull --no-cache` picks up a moved base tag and fresh OS
packages. If the base is pinned by digest, a bot (Renovate `pinDigests` or
Dependabot) opens pull requests when the digest changes. Either way,
deploy the rebuilt image, alert on the age of what is running, and prefer
slim or distroless bases with fewer packages to patch.

### 46. Compare patching servers in place with replacing them.

In place, `unattended-upgrades` (on by default on Ubuntu Server) or a
managed service such as AWS Systems Manager Patch Manager installs updates
on running hosts; reboots and service restarts must be scheduled. By
replacement, a new golden image is baked weekly and rolled through the
fleet with an instance refresh, so patching becomes a tested, reversible
deploy with no drift. Containers are always replaced, never patched in
place. Either way, a patch is not active until the process restarts.

### 47. How do Dependabot and Renovate keep dependencies current without adding risk?

They open pull requests for advisories and new versions. Security updates
skip the release-age delay (Dependabot's `cooldown`, Renovate's
`minimumReleaseAge`), while ordinary updates wait a few days so a malicious
or broken release can be caught first. Automerge only patch versions and
digest bumps after tests pass, and let humans start major upgrades. npm's
`overrides` field in the root `package.json` can force a patched transitive
version until the parent package catches up.

### 48. How do SBOMs help during a zero-day, and what did Log4Shell show?

An SBOM per release and per deployed image digest turns "are we affected?"
into a query, and rescanning stored SBOMs daily (`trivy sbom`, Grype)
checks old releases against new advisories without rebuilding them. The
Cyber Safety Review Board found that groups representing organizations
already using SBOMs reported none had used them to find vulnerable Log4j
deployments. Store them, cover hosts and vendor tools, and rehearse the
query before you need it.

### 49. Walk through the first hours of a Log4Shell-class zero-day.

Declare an incident; query every SBOM, image, and host inventory for the
component and contact vendors; rank exposure (internet-facing first); apply
mitigations immediately (WAF rules, configuration changes, egress
filtering, isolation); patch, rebuild, and redeploy, and expect follow-up
fixes (Log4j needed 2.15.0, 2.16.0, 2.17.0, and 2.17.1 in under three
weeks); verify by rescanning what is running; check exposed systems for
compromise; then communicate and write the postmortem.

## Compliance and audit readiness

### 50. What is the difference between a SOC 2 Type 1 and a Type 2 report?

Both are attestation reports by a CPA firm against the AICPA Trust Services
Criteria, not certifications. Type 1 covers the design of controls at a
point in time; Type 2 also covers how they operated over a period. A Type 2
therefore needs continuous evidence: a control that silently broke in month
two fails the audit in month twelve.

### 51. What does the shared responsibility model mean for compliance?

The provider's certifications cover security of the cloud (data centers,
hardware, hypervisors), which you inherit by giving its reports (AWS
Artifact and equivalents) to your auditor. Everything you configure is
yours to prove: IAM, bucket policies, security groups, encryption settings,
logging, backups, and application access control. Each vendor that handles
regulated data adds its own contract, such as a DPA or a BAA.

### 52. How do you make CloudTrail trustworthy as audit evidence?

Use an organization trail for every account and Region, delivered to a
bucket in a separate log archive account; enable log file integrity
validation, which writes signed digest files that reveal modified or
deleted logs; protect the bucket with S3 Object Lock in compliance mode;
add data events for buckets holding regulated data (they are not recorded
by default); and alert on any change to logging. Event history alone keeps
only 90 days.

### 53. What does "evidence from systems, not people" mean in an audit?

Auditors take a **population** ("every production change this year") and
**samples** ("for these 25, show approval, tests, and deploy"). If pull
request approvals, CI logs, policy results, configuration rule results,
and access review tickets are exported automatically to an append-only,
timestamped store mapped to controls, the answer is a query instead of
weeks of screenshots, and one control's evidence serves several
frameworks.

### 54. How do you handle a GDPR erasure request when the data also exists in backups and invoices?

Run one erasure job across every live copy (database, search index,
caches, processors) and record that it happened without keeping the data.
Backups are not edited: keep their retention short and re-apply the list
of completed erasures after any restore. Data kept under a legal
obligation, such as invoices, stays with restricted access until its
retention period ends. The request must be answered within one month,
extendable by two further months where necessary.

### 55. When do you need a BAA, and does the cloud provider's BAA cover your other vendors?

Under HIPAA, every vendor that creates, receives, maintains, or transmits
PHI for you needs a business associate agreement; HHS treats a cloud
provider that stores encrypted ePHI it cannot read as a business associate
too. The cloud provider's BAA covers only its eligible services. Error
trackers, email, SMS, analytics, and support tools need their own BAA, or
PHI must not reach them, and a BAA alone does not make your solution
compliant.

### 56. What is policy as code, and how does it produce audit evidence?

Rules such as "no public buckets" written as automated checks: Open Policy
Agent, Checkov, or Trivy on every Terraform plan before deploy; AWS Config
rules, Azure Policy, or Google organization policies on the live cloud,
which also catch console changes; and admission controllers such as
Kyverno in Kubernetes. Every evaluation is timestamped and tied to a
commit or resource, which is exactly what a Type 2 auditor samples.

### 57. A breach is discovered. What are the GDPR and HIPAA notification deadlines?

GDPR Article 33 requires notifying the supervisory authority without undue
delay and, where feasible, within 72 hours of becoming aware of the breach,
unless it is unlikely to result in a risk; information can be provided in
phases if not all facts are known yet. HIPAA requires notifying affected
individuals without unreasonable delay and no later than 60 calendar days
after discovering a breach of unsecured PHI. Rehearse both clocks before an
incident.

## Scenario-based questions

### 58. A new security scanner went live on Monday, and by Tuesday nearly every pull request fails the same check. What do you do?

**What to check first:** whether the gate fails on all findings or only on
findings the change introduces.

**How to confirm:** the failing pull requests touch unrelated code, and
the findings are in files the authors never changed.

**Likely causes and fixes:** the scanner blocks on existing debt. Switch it
to report-only, record a baseline, block only new high-confidence
findings, and turn the backlog into tickets with owners and deadlines. See
[security in the delivery pipeline](security-in-the-delivery-pipeline.md).

### 59. An access key appears in a public commit and was pushed 20 minutes ago. What are your first steps?

**What to check first:** which principal owns the key and whether it is
still active.

**How to confirm:** CloudTrail `lookup-events` filtered by the access key ID
in every Region shows any calls from unknown addresses or new Regions, plus
any users, keys, or roles created as persistence.

**Likely causes and fixes:** a long-lived key committed in a file or test.
Deactivate it at once, investigate its activity everywhere (including the
organization trail), remove anything the attacker created, then replace it
with a role or OIDC and enable push protection. See
[identity and access management](identity-and-access-management.md).

### 60. Deploys start failing with `AccessDenied` an hour after the security team attached a new SCP. What happened?

**What to check first:** the exact error message and the deploy role's
failing API calls in CloudTrail.

**How to confirm:** the error names an explicit deny in a service control
policy, and the failures start at the time of the SCP change.

**Likely causes and fixes:** a guardrail, often a Region restriction,
blocks an action the deploy needs, such as a global service called through
`us-east-1`. Exempt the global services as AWS's example does, narrow or
detach the SCP, and test SCPs on a test OU before attaching them widely.
See [identity and access management](identity-and-access-management.md).

### 61. GuardDuty reports that an instance role's credentials were used from an address outside AWS. Where do you look?

**What to check first:** the instance's metadata settings (is IMDSv1 still
allowed?) and its application logs.

**How to confirm:** the logs show requests to `169.254.169.254` triggered
through a user-supplied URL, and CloudTrail shows the role's calls from the
foreign address.

**Likely causes and fixes:** an SSRF bug reached the metadata service
because IMDSv1 accepted a simple `GET`. Revoke the role's active sessions,
require IMDSv2 by account default, fix the SSRF, narrow the role, and check
what the attacker did with the credentials. See
[network security in the cloud](network-security-in-the-cloud.md).

### 62. After moving build agents into private subnets, NAT gateway charges jump and builds slow down. Why?

**What to check first:** which destinations account for the NAT gateway's
processed bytes.

**How to confirm:** flow logs show most traffic going to ECR and S3
address ranges.

**Likely causes and fixes:** image pulls and artifacts flow through NAT.
Add an S3 gateway endpoint and interface endpoints for ECR, which cuts NAT
data processing and removes an internet path at the same time. See
[network security in the cloud](network-security-in-the-cloud.md).

### 63. Login failures are high across thousands of accounts, but no client IP exceeds the login rate limit. What is going on?

**What to check first:** failed logins per account and per IP, and the
number of distinct source addresses.

**How to confirm:** each IP makes only a few attempts, the attempted
passwords match known breach lists, and attempts are spread over many
accounts.

**Likely causes and fixes:** credential stuffing from a botnet. Add bot
detection or account takeover protection on the login path, per-account
failure throttling, breached-password checks, and MFA, and key rate limits
on more than the IP. See
[edge protection: WAF, DDoS, and bots](edge-protection-waf-ddos-and-bots.md).

### 64. Large task imports started failing with 403 right after the WAF's managed core rule set was enabled. How do you fix it without weakening the WAF?

**What to check first:** the WAF logs for the failing requests: which rule
matched and with which action.

**How to confirm:** the logs show the core rule set's body size rule
blocking `POST /api/tasks/import`, because its bodies exceed 8 KB.

**Likely causes and fixes:** a managed rule that does not fit one
endpoint. Override only that rule to count, then add a custom rule that
blocks requests carrying its label except on the import path, so every
other path stays protected. See
[edge protection: WAF, DDoS, and bots](edge-protection-waf-ddos-and-bots.md).

### 65. Origin access logs show attack traffic that never appears in the WAF logs. How did it get in?

**What to check first:** the source addresses of the requests at the
origin load balancer.

**How to confirm:** they are not the CDN's addresses, and the origin's
security group accepts traffic from anywhere.

**Likely causes and fixes:** the origin is reachable directly, so the edge
is optional. Allow only the edge's prefix list, require a secret header or
mutual TLS, answer everything else with a fixed 403, or move the origin
behind a VPC origin or tunnel. See
[edge protection: WAF, DDoS, and bots](edge-protection-waf-ddos-and-bots.md).

### 66. On a Friday afternoon, CISA adds a CVE to KEV that affects a library in your internet-facing API. How do you decide how fast to act?

**What to check first:** whether the vulnerable component is in the image
that is actually running, and whether attacker input can reach it.

**How to confirm:** query the SBOM for the deployed digest, rescan that
digest, and read the CVE record's SSVC data (automatable, technical
impact) and the fixed version from the advisory.

**Likely causes and fixes:** publicly exposed plus KEV means a 3-day
deadline in a BOD 26-04-style policy, with forensic triage if the impact
is total. Mitigate now (a WAF rule, a disabled feature), then upgrade,
rebuild, redeploy through the normal pipeline, verify with a rescan, and
check for signs of earlier compromise. See
[vulnerability and patch management](vulnerability-and-patch-management.md).

### 67. Every container image scan shows dozens of Linux kernel CVEs, some of them in KEV. Is the API exploitable?

**What to check first:** which package the findings are reported against.

**How to confirm:** they sit on `linux-libc-dev` (kernel headers) or
similar packages in the image, not on anything the application executes.

**Likely causes and fixes:** build tools and headers shipped in the
runtime image, while containers run on the host's kernel. Move to a
multi-stage build on a slim or distroless base, record a VEX
`vulnerable_code_not_present` statement for anything that remains, and
patch the hosts' kernels as a separate asset with their own deadline. See
[vulnerability and patch management](vulnerability-and-patch-management.md).

### 68. Patch Manager reports the fleet as patched, but a scanner still finds the old OpenSSL in use. Why?

**What to check first:** pending reboots and long-running processes on the
hosts.

**How to confirm:** `describe-instance-patch-states` shows
`InstalledPendingRebootCount` above zero, `/var/run/reboot-required`
exists, or running processes still map the old library.

**Likely causes and fixes:** packages were installed without a reboot or
service restart (for example with `RebootOption=NoReboot`). Schedule
rolling reboots behind the load balancer, use `needrestart` for services,
and consider replacing instances with a freshly baked image instead. See
[vulnerability and patch management](vulnerability-and-patch-management.md).

### 69. The image pipeline rebuilds TaskFlow API every night, yet production runs a three-month-old image. How?

**What to check first:** the digest that is actually running compared with
the newest digest in the registry.

**How to confirm:** the rebuild workflow pushes images but never calls the
deploy workflow, or the deploy manifest still pins the old digest.

**Likely causes and fixes:** a rebuild without a deploy protects nothing.
Deploy rebuilt images through the normal pipeline (with its canary and
rollback), and alert when the running image is older than the rebuild
cadence allows. See
[vulnerability and patch management](vulnerability-and-patch-management.md).

### 70. The auditor asks for every production change in the audit period, with approvals for a sample of 25. Several changes have no review. What went wrong, and how do you prevent it?

**What to check first:** how the unreviewed changes reached production:
direct pushes, console edits, or approvals given in chat.

**How to confirm:** the commits bypassed branch protection or the
resources were changed outside Terraform, as CloudTrail and configuration
history show.

**Likely causes and fixes:** controls that existed on paper only. Require
reviews through branch protection, deploy only from CI, detect console
changes with configuration rules, and export pull request and pipeline
records continuously to an append-only evidence store. See
[compliance and audit readiness](compliance-and-audit-readiness.md).

## Further learning

- [DevSecOps and cloud security overview](../devsecops-and-cloud-security.md)
- [Security in the delivery pipeline](security-in-the-delivery-pipeline.md) ·
  [Identity and access management](identity-and-access-management.md) ·
  [Network security in the cloud](network-security-in-the-cloud.md) ·
  [Edge protection: WAF, DDoS, and bots](edge-protection-waf-ddos-and-bots.md) ·
  [Vulnerability and patch management](vulnerability-and-patch-management.md) ·
  [Compliance and audit readiness](compliance-and-audit-readiness.md)
- [OWASP DevSecOps Guideline](https://owasp.org/www-project-devsecops-guideline/)
- [AWS Well-Architected Framework: Security Pillar](https://docs.aws.amazon.com/wellarchitected/latest/security-pillar/welcome.html)
- [CISA: Known Exploited Vulnerabilities catalog](https://www.cisa.gov/known-exploited-vulnerabilities-catalog)
- [NIST SP 800-207: Zero Trust Architecture](https://csrc.nist.gov/pubs/sp/800/207/final)
