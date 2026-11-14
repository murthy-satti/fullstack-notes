# DevSecOps and Cloud Security Cheat Sheet

Quick revision of the DevSecOps and cloud security lessons, for a last look
before an interview or a security task.

## Key commands

| Command | What it does |
|---|---|
| `npm audit --audit-level=high --omit=dev` | Fails on high or critical advisories in production dependencies |
| `semgrep scan --config p/default --config .semgrep/ --error` | Community plus custom rules; exits 1 on findings |
| `checkov --directory infra --framework terraform --baseline infra/.checkov.baseline` | Fails only on IaC findings that are not in the baseline |
| `trivy image --vex .vex/taskflow-api.openvex.json <image>` | Hides findings a reviewed VEX statement marks `not_affected` |
| `trivy sbom --severity HIGH,CRITICAL --ignore-unfixed <sbom.cdx.json>` | Rechecks a stored SBOM against today's advisories |
| `aws iam update-access-key --user-name <user> --access-key-id <id> --status Inactive` | First step after a key leaks |
| `aws cloudtrail lookup-events --lookup-attributes AttributeKey=AccessKeyId,AttributeValue=<id>` | What the key did (90 days of event history) |
| `opa eval --fail-defined --data policy/terraform.rego --input plan.json "data.terraform.guardrails.deny[msg]"` | Exits 1 when a Terraform plan breaks a guardrail |

## Key configuration

```yaml
# .github/workflows/security.yml (excerpt): read-only jobs, pinned scanner
permissions:
  contents: read                     # every job starts read-only
jobs:
  image:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      security-events: write
    steps:
      - uses: aquasecurity/trivy-action@ed142fd0673e97e23eac54620cfb913e5ce36c25 # v0.36.0
        with:
          image-ref: taskflow-api:ci
          version: v0.76.2           # pin the binary, not only the action
          severity: CRITICAL,HIGH
          ignore-unfixed: true       # gate only on findings that have a fix
          exit-code: "1"
```

```text
# .trivyignore: an accepted risk that expires
CVE-YYYY-NNNNN exp:2026-12-31
```

## Decision guide

| If you need | Choose | Why |
|---|---|---|
| A first security gate | `npm audit` gate plus CodeQL default setup | Cheap; catches known CVEs and injection paths |
| To stop leaked secrets | Pre-commit hook, push protection, CI and image scans | Each layer catches what the last one missed |
| Engineers in AWS | IAM Identity Center with the company IdP and MFA | No IAM users or personal access keys |
| CI deploying to AWS | OIDC role bound to one repository and environment | No stored cloud keys |
| Shell access to private servers | Session Manager, EC2 Instance Connect Endpoint, or IAP | No inbound port; IAM-controlled and logged |
| AWS APIs from private subnets | VPC endpoints | Off the internet, and often cheaper than NAT |
| A public API with logins | WAF managed rules, edge rate limits, origin cloaking | Stops floods and exploits before the origin |
| CVE priorities | KEV first, a BOD 26-04-style table, then EPSS and CVSS | Exposure and exploitation set the deadline |
| Audit evidence | Policy as code, locked CloudTrail, exported PR approvals | Evidence from systems, not people |

## Numbers and defaults to remember

| Item | Value |
|---|---|
| STS role session | 15 minutes up to the role's maximum (1 to 12 hours) |
| Permission set session | 1 hour by default, up to 12 hours |
| AWS WAF rate-based rules | Window 60, 120, 300 (default), or 600 s; minimum limit 10 |
| AWS core rule set | Blocks request bodies over 8 KB (`SizeRestrictions_BODY`) |
| OWASP CRS scoring | CRITICAL 5, ERROR 4, WARNING 3, NOTICE 2; inbound threshold 5, outbound 4 |
| CVSS v4.0 severity | Low 0.1-3.9, Medium 4.0-6.9, High 7.0-8.9, Critical 9.0-10.0 |
| EPSS | Probability of exploitation in the next 30 days; mean about 2.8%, median about 0.7% |
| BOD 26-04 | 3, 14, or 60 days, or fix on system upgrade; forensic triage for KEV plus total impact in the 3-day class |
| Dependabot security PRs | Up to 10 open; not delayed by `cooldown` |
| PCI DSS v4.0.1 | Critical patches in one month; access reviews every 6 months; logs kept 12 months |
| Breach notices | GDPR: 72 hours to the authority; HIPAA: 60 days to individuals |
| Expected exploits | n findings at EPSS p: n x p expected; at least one: 1 - (1 - p)^n |
| Leaked-key bill | Instances x Regions x hours: 30 x 4 x 72 = 8,640 instance-hours |

## Top mistakes

- **Blocking on every existing finding.** Baseline the debt and block only
  new, high-confidence, fixable findings.
- **Scanner actions by tag, with secrets in reach.** Pin third-party
  actions to full SHAs, pin scanner versions, and give scanners no secrets.
- **Long-lived keys for people or CI.** SSO with MFA for people, roles for
  workloads, and OIDC for pipelines.
- **Trusting NAT as a firewall.** Declare egress: VPC endpoints, private
  endpoints, and a domain allowlist.
- **A WAF in blocking mode on day one.** Run in count mode, fix false
  positives narrowly, then block.
- **An origin reachable around the CDN.** Allow only the edge's prefix
  list, require a secret header or mTLS, or use a VPC origin or tunnel.
- **Prioritizing by CVSS alone.** KEV first, deadlines from exposure and
  exploitation, then EPSS and CVSS.
- **Rebuilding images without deploying them.** Deploy every rebuild and
  alert on the age of running images.

## Where to go deeper

- [Security in the delivery pipeline](security-in-the-delivery-pipeline.md)
- [Identity and access management](identity-and-access-management.md)
- [Network security in the cloud](network-security-in-the-cloud.md)
- [Edge protection: WAF, DDoS, and bots](edge-protection-waf-ddos-and-bots.md)
- [Vulnerability and patch management](vulnerability-and-patch-management.md)
- [Compliance and audit readiness](compliance-and-audit-readiness.md)
- [DevSecOps and cloud security interview questions and answers](interview-questions-and-answers.md)

Back to the [DevSecOps and cloud security overview](../devsecops-and-cloud-security.md).
