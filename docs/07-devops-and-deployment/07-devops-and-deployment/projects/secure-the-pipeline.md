# Secure the Pipeline

Add security checks to TaskFlow's delivery pipeline that catch real
problems without drowning the team, replace stored cloud keys with OIDC,
test the running API on staging, rate-limit the login endpoint at the edge,
and triage findings by severity and real-world exploitation.

## Why this project helps

- Builds DevSecOps skills: SAST, dependency and secret scanning, IaC and
  image scanning, DAST, and workload identity.
- Improves **security**: known vulnerabilities, leaked secrets, and risky
  infrastructure changes are caught before they reach production.
- Improves **signal quality**: gating only on new, fixable, serious findings
  keeps the checks trusted instead of ignored.
- Interviewers ask how you would secure a pipeline and how you prioritize a
  flood of CVEs; this project gives you concrete answers.

## What you need

- The pipeline from [Ship It Pipeline](ship-it-pipeline.md), the image from
  [Production Image](production-image.md), and the Terraform from
  [Infrastructure from Code](infrastructure-from-code.md).
- Free tools: CodeQL or Semgrep, Dependabot or OSV-Scanner, GitHub secret
  scanning, Checkov or Trivy, and ZAP.
- A staging deployment you own, and a WAF in front of it (a cloud WAF or a
  CDN's rate limiting rules).

## How to do it

1. Read [security in the delivery pipeline](../devsecops-and-cloud-security/security-in-the-delivery-pipeline.md)
   and decide which findings block a merge.
2. Enable CodeQL (or Semgrep), Dependabot alerts, and secret scanning with
   push protection; pin third-party actions to full commit SHAs.
3. Scan the Terraform code with Checkov or `trivy config` on pull requests.
4. Scan the image and fail only on fixable critical findings, for example
   `trivy image --severity CRITICAL --ignore-unfixed --exit-code 1`.
5. Replace stored cloud keys with OIDC and a least-privilege deploy role;
   see [identity and access management](../devsecops-and-cloud-security/identity-and-access-management.md).
6. Run a ZAP baseline or API scan against staging after each deploy, never
   against production.
7. Add a WAF rate-limit rule on the login path; see
   [edge protection](../devsecops-and-cloud-security/edge-protection-waf-ddos-and-bots.md).
8. Triage findings with CVSS for severity, EPSS for exploitation
   likelihood, and the CISA KEV catalog for confirmed exploitation; see
   [vulnerability and patch management](../devsecops-and-cloud-security/vulnerability-and-patch-management.md).

## Done when

- A pull request that adds a vulnerable dependency or a test secret is
  blocked with a clear message.
- Terraform and image scans run on every change, and only fixable critical
  image findings fail the build.
- No long-lived cloud keys remain in CI secrets.
- A ZAP report exists for staging, with each alert fixed or justified.
- Repeated failed logins from one address are blocked at the edge.
- Every open finding has a priority based on CVSS, EPSS, and KEV, and an
  owner.

## Stretch goals

- Generate an SBOM and provenance for the image and verify them before
  deploy; see [pipeline and supply chain security](../ci-cd/pipeline-and-supply-chain-security.md).
- Write a custom Semgrep rule for a TaskFlow convention.
- Restrict outbound traffic from the API; see
  [network security in the cloud](../devsecops-and-cloud-security/network-security-in-the-cloud.md).

## Lessons to use

- [DevSecOps and Cloud Security](../devsecops-and-cloud-security.md)
- [Container security](../docker/container-security.md)
- [Secrets management](../environment-variables/secrets-management.md)

Back to [all projects](../projects.md).
