# DevSecOps and Cloud Security

DevSecOps builds security into every stage of software delivery instead of
checking it once, at the end, by a separate team. Code is scanned on every
pull request, builds produce images that are scanned and signed, deploys
use short-lived credentials, and production runs behind edge protection,
least-privilege identities, and segmented networks that are watched by
audit logs. Cloud security is the part of this work that protects the
environment the software runs in: identities, networks, the edge, and the
data, under a shared responsibility model with the cloud provider.

## What DevSecOps and cloud security provide

- **Earlier, cheaper fixes:** a vulnerable dependency caught in a pull
  request costs a version bump; the same flaw found in production costs an
  incident.
- **A smaller blast radius:** least-privilege roles, short-lived
  credentials, and private networks limit what one stolen token or one
  compromised container can reach.
- **Protection at the edge:** managed DDoS mitigation, a web application
  firewall (WAF), rate limits, and bot controls absorb attacks before they
  reach the application.
- **A fast response to new vulnerabilities:** an inventory of what runs
  where, plus severity and exploitation data, turns a new CVE into a
  prioritized, time-boxed fix instead of a panic.
- **Evidence for customers and auditors:** audit logs, access reviews,
  and policy as code show that controls exist and keep working, which is
  what SOC 2, ISO/IEC 27001, HIPAA, GDPR, and PCI DSS assessments ask for.

## How a typical DevSecOps pipeline works

![Diagram: four stages run left to right; Code on the laptop and in the pull request has secret scanning on commit with pre-commit hooks and push protection, static analysis with CodeQL or Semgrep, dependency review that blocks new known CVEs, and infrastructure-as-code scanning with Checkov or Trivy; Build in CI on main has an image scan that fails on fixable high or critical findings, an SBOM and provenance attested to the image digest, hardened CI with SHA-pinned actions and least-privilege tokens, and a secret scan of image layers and bundles; Deploy to staging then production uses an OIDC deploy role with short-lived credentials, verifies attestations and policies before deploying, runs a ZAP baseline scan against staging, and requires approval through a protected production environment; Run with live traffic has edge protection with DDoS mitigation, a WAF, and rate limits, least-privilege IAM with roles and SSO with MFA, network segmentation with private subnets and security groups, and detection and patching with audit logs and CVE SLAs; a dashed arrow returns from Run to Code because findings, new CVEs, and incidents become tickets with SLAs.](devsecops-and-cloud-security-overview.svg)

Follow one change to TaskFlow API through the pipeline:

1. **Code:** a pre-commit hook and GitHub push protection stop a pasted
   token before it leaves the laptop. The pull request runs static
   analysis, dependency review, and an infrastructure-as-code scan; only
   new, high-confidence findings block the merge.
2. **Build:** CI builds the image, scans it, and fails on fixable high or
   critical vulnerabilities. It records an SBOM and signed provenance for
   the image digest.
3. **Deploy:** the deploy job assumes a cloud role through OIDC, verifies
   the image's provenance, and ships to staging, where a DAST scan probes
   the running API. Production needs an approval in a protected
   environment.
4. **Run:** requests pass through DDoS protection, a WAF, and rate limits
   at the edge. The API runs in private subnets with a role that can read
   only its own secrets and bucket prefix, and every API call to the cloud
   lands in an audit log.
5. **Feedback:** continuous scanning turns newly published CVEs into
   tickets with deadlines set by severity and exploitation, and incidents
   end with postmortems that add the missing control.

## Practical example

The cheapest useful gate: fail the build when a production dependency has
a known high or critical vulnerability.

```yaml
# .github/workflows/security.yml (excerpt)
jobs:
  dependency-audit:
    runs-on: ubuntu-latest
    permissions:
      contents: read                 # the job can read code and nothing else
    steps:
      - uses: actions/checkout@v7
        with:
          persist-credentials: false
      - uses: actions/setup-node@v7
        with:
          node-version: 24
      - run: npm ci
      - run: npm audit --audit-level=high --omit=dev
```

`--audit-level=high` sets the threshold for a non-zero exit code, and
`--omit=dev` ignores tooling that never ships. Real pipelines add SAST,
image scanning, and a way to accept known findings, as the first lesson
shows.

## DevSecOps and cloud security topic map

**Building securely**

- [Security in the delivery pipeline](devsecops-and-cloud-security/security-in-the-delivery-pipeline.md)

**Protecting the cloud environment**

- [Identity and access management](devsecops-and-cloud-security/identity-and-access-management.md)
- [Network security in the cloud](devsecops-and-cloud-security/network-security-in-the-cloud.md)
- [Edge protection: WAF, DDoS, and bots](devsecops-and-cloud-security/edge-protection-waf-ddos-and-bots.md)

**Staying secure over time**

- [Vulnerability and patch management](devsecops-and-cloud-security/vulnerability-and-patch-management.md)
- [Compliance and audit readiness](devsecops-and-cloud-security/compliance-and-audit-readiness.md)

**Review**

- [DevSecOps and cloud security interview questions and answers](devsecops-and-cloud-security/interview-questions-and-answers.md) ·
  [cheat sheet](devsecops-and-cloud-security/cheat-sheet.md)

## Developer perspective and common misconceptions

Treat security controls like tests: automated, fast, owned by the team
that writes the code, and tuned so that a failure means something. Start
with the controls that remove whole classes of risk (no long-lived cloud
keys, no public databases, patched base images) before buying tools.

- A green scanner run does not mean the code is secure; scanners find
  known patterns and known CVEs, not design flaws or broken access control.
- Passing an audit is not the same as being secure. Compliance proves that
  agreed controls exist; attackers do not read the audit scope.
- The cloud provider secures the cloud, not your configuration. A public
  bucket or an over-privileged role is the customer's side of the shared
  responsibility model.
- A private network is not a trust boundary on its own. Zero trust checks
  identity and context on every request, inside the network too.
- Blocking every finding does not make teams safer; it teaches them to
  ignore or bypass the scanner. Gate on new, fixable, high-impact issues.

## Further learning

- [OWASP Top 10:2025](https://owasp.org/Top10/2025/) and the
  [OWASP DevSecOps Guideline](https://owasp.org/www-project-devsecops-guideline/)
- [NIST SP 800-218: Secure Software Development Framework](https://csrc.nist.gov/pubs/sp/800/218/final)
- [AWS Well-Architected Framework: Security Pillar](https://docs.aws.amazon.com/wellarchitected/latest/security-pillar/welcome.html)
- [DORA: Pervasive security](https://dora.dev/capabilities/pervasive-security/)
- Related lessons: [pipeline and supply chain security](ci-cd/pipeline-and-supply-chain-security.md),
  [secrets management](environment-variables/secrets-management.md),
  [container security](docker/container-security.md), and the
  [Security and Testing section](../../09-security-and-testing/index.md)
- [DevSecOps and cloud security interview questions and answers](devsecops-and-cloud-security/interview-questions-and-answers.md)
