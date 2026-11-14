# Security in the Delivery Pipeline

Every change to TaskFlow API passes through the same pipeline: a commit on a
laptop, a pull request, a build, a deploy to staging, and a release. Each of
those steps is a place where a machine can look for a class of security
problem faster and more consistently than a human reviewer. This lesson
explains what each kind of scanner looks at, where it belongs in the
pipeline, and how to turn its output into decisions that a team will
actually act on.

It covers shifting security left, static analysis (SAST) with CodeQL and
Semgrep, dependency scanning (SCA) with `npm audit`, Dependabot, Snyk, and
OSV-Scanner, secret scanning, infrastructure-as-code (IaC) scanning with
Checkov and Trivy, container image scanning, and dynamic testing (DAST) of
the running API with ZAP. Hardening the pipeline itself (least-privilege
tokens, pinned actions, OIDC, SBOMs, and provenance) is covered in
[pipeline and supply chain security](../ci-cd/pipeline-and-supply-chain-security.md);
this page summarizes it and links there.

## Why it matters

Most successful attacks do not need a novel technique. They use a known
vulnerability in a dependency, an injection flaw a scanner would have
flagged, a key committed to a repository, or a cloud resource left open to
the internet. The OWASP Top 10:2025 lists Software Supply Chain Failures
third and Security Misconfiguration second, both of which automated checks
catch well.

The cheapest moment to fix such a problem is while its author is still in
the pull request: the context is fresh, the change is small, and nothing is
deployed. The same flaw found in production needs an incident, a hotfix, and
perhaps a breach notification. That is the whole argument for scanning in
the pipeline.

The opposite failure is just as real. A scanner that floods every pull
request with hundreds of old, low-impact, or false findings teaches the team
to click past it. Then the one finding that matters is ignored too. Good
pipeline security is therefore as much about **which findings stop a
change** as about which tools run.

## Real-world usage

- **Google: static analysis people actually use.** In
  [Lessons from Building Static Analysis Tools at Google](https://research.google/pubs/lessons-from-building-static-analysis-tools-at-google/)
  (Communications of the ACM, 2018), Google engineers describe surfacing
  analysis results in code review and requiring checks shown there to
  produce less than 10% "effective false positives", meaning issues on
  which developers took no positive action. Precision and timing, not the
  number of rules, made developers fix issues by their own choice.
- **DORA: security as part of daily work.** The DORA capability
  [Pervasive security](https://dora.dev/capabilities/pervasive-security/)
  recommends addressing security early, preapproved libraries and tools,
  and automated testing at scale, and reports that high-performing teams
  spend 50 percent less time remediating security issues than
  low-performing teams.
- **Trivy, March 2026: the scanner is a dependency too.** The advisory
  [GHSA-69fq-xp46-6x23](https://github.com/aquasecurity/trivy/security/advisories/GHSA-69fq-xp46-6x23)
  (CVE-2026-33634) describes attackers force-pushing 76 of 77 version tags
  of `aquasecurity/trivy-action` and all tags of `setup-trivy` to an
  infostealer that ran before the real scan, dumped runner memory, and
  exfiltrated credentials. It recommends pinning actions to full commit
  SHAs and treating every secret the affected pipelines could reach as
  exposed.
- **OWASP Top 10:2025.** The [2025 edition](https://owasp.org/Top10/2025/)
  adds A03 Software Supply Chain Failures and keeps Broken Access Control
  first. The categories map well onto pipeline checks (supply chain to SCA
  and pinning, misconfiguration to IaC scanning, injection to SAST), and
  equally show what scanners miss: access control and design flaws need
  tests and review.

**Popular tools and providers:** GitHub code scanning with CodeQL and
Copilot Autofix, Semgrep, SonarQube, Snyk, Dependabot and Renovate,
OSV-Scanner, `npm audit`, GitHub secret scanning and push protection,
gitleaks, TruffleHog, Checkov, Trivy, Grype, Docker Scout, KICS, and ZAP.

## How it works

### Shift left, and keep scanning on the right

"Shift left" means moving a check as early in the delivery path as it can
run, because early feedback is cheap feedback. It does not mean "only
left": some problems exist only in a built image, only in a running
service, or only after a new CVE is published against code that has not
changed in months. A mature pipeline does both.

| Scanner | Looks at | Finds | Misses | Typical placement |
|---|---|---|---|---|
| SAST | Source code | Injection paths, unsafe APIs, dangerous data flows | Runtime config, broken business rules, most access-control bugs | PR (new alerts only) and a full scan on main |
| SCA | Lockfiles, manifests, built artifacts | Known CVEs in dependencies, licenses | Zero-days, flaws in your own code | PR, build, and daily rescans |
| Secret scanning | Commits, history, images, bundles | Tokens and keys in known formats | Secrets in unknown formats, secrets only at runtime | Pre-commit, push, CI, artifacts |
| IaC scanning | Terraform, Kubernetes, Dockerfiles | Public buckets, open ports, missing encryption, root containers | Console changes (drift), runtime posture | PR and plan scan |
| Image scanning | Image layers: OS and language packages | Known CVEs in the base image and dependencies | Application logic | After build, then continuous rescans |
| DAST | The running app over HTTP | Missing headers, injection that shows in responses, exposed endpoints | Code paths the scan never reaches | Staging after each deploy |

![Diagram: a matrix of six stages (laptop in seconds, push and pull request in minutes, main build in minutes, registry with daily rescans, staging after deploy, production continuously) against six scanner types; secrets are blocked by a pre-commit hook, push protection, and an image-layer scan, with leak alerts monitored in production; SAST reports in the IDE, blocks new alerts in the pull request, and runs a full scan on main; SCA reports locally with npm audit, blocks new vulnerabilities in the pull request and fixable high findings in the build, and monitors new CVEs in production; IaC scanning blocks new findings in the pull request and the plan scan, with drift and posture monitored in production; image scanning blocks fixable high findings in the build, rescans daily in the registry, and monitors live images; DAST blocks on an API scan in staging and is passive only in production.](scanner-placement.svg)

### SAST: following untrusted data through the code

Static application security testing reads source code without running it.
Simple linters match patterns line by line. The tools that find real
injection bugs go further: they build a model of the program and follow
**tainted** data from a **source** (anything an attacker controls, such as
`req.body`, headers, or uploaded files) to a **sink** (an operation that is
dangerous with attacker input: a database query, `child_process.exec`, a
redirect, HTML output). If the data reaches the sink without passing a
**sanitizer** (validation, casting, escaping), the tool raises an alert.

![Diagram: two rows; in the tainted flow, the source req.body.owner is copied unchanged into the filter object { owner: req.body.owner }, which reaches the sink Task.find(), and the analyzer raises js/sql-injection; an attacker body {"owner": {"$ne": null}} turns the filter into owner is not null, which matches every task; in the sanitized flow, the same source passes through the sanitizer z.string().parse(owner) before reaching Task.find() with a string, so there is no alert, and non-string input fails validation with a 400.](sast-taint-flow.svg)

This is exactly the NoSQL injection TaskFlow is exposed to. With a JSON
body of `{"owner": {"$ne": null}}`, a handler that passes `req.body.owner`
straight into `Task.find()` asks MongoDB for every task whose owner is not
null. CodeQL's `js/sql-injection` query covers both SQL and NoSQL queries
built from user input. (Express 5's default "simple" query parser no
longer turns `?owner[$ne]=x` into a nested object, but JSON bodies still
carry objects, so validation remains necessary. Mongoose's `sanitizeFilter`
option, off by default, is a useful second layer.)

- **CodeQL** turns the code into a database and runs queries over it.
  GitHub's **default setup** enables it with no workflow file; **advanced
  setup** uses a workflow where you choose languages, query suites
  (`security-extended` adds lower-precision queries to the default set),
  and triggers. For JavaScript and TypeScript, `build-mode: none` analyzes
  the source without a build. The `actions` language analyzes the
  repository's own workflow files for problems such as script injection.
- **Semgrep** matches patterns written to look like the code they find,
  which makes **custom rules** cheap: a team can encode its own conventions
  ("every query on `Task` must filter by the current user") in a few lines
  of YAML. The open-source engine is now called Semgrep Community Edition;
  the commercial platform adds cross-file analysis and triage features.

SAST is weakest where the problem is missing logic rather than bad data
flow: an endpoint that never checks whether the caller owns the task looks
perfectly normal to a scanner. Those bugs need tests and review, see
[authentication and authorization](../../../03-backend-development/backend-concepts/authentication-and-authorization.md).

### SCA: known vulnerabilities in dependencies

Software composition analysis reads what you depend on (the lockfile, or
the packages inside a built image) and matches each package and version
against advisory databases such as the GitHub Advisory Database and OSV.dev.
It finds nothing new; it tells you which already-published vulnerabilities
you ship.

- **`npm audit`** checks the installed tree against the registry's advisory
  data. `--audit-level=high` makes it exit non-zero only for high or
  critical findings, and `--omit=dev` leaves out development tooling that
  never runs in production. `npm audit fix --force` may install semver-major
  upgrades, so never run it unattended.
- **Dependabot** raises alerts, opens security update pull requests, and
  can group them into one pull request per ecosystem. Security updates are
  not delayed by the `cooldown` setting that applies to version updates,
  and they have their own limit of 10 open pull requests.
- **OSV-Scanner** is Google's open-source scanner for the OSV database
  across many ecosystems. Its pull request workflow compares the base and
  head branches and fails only on vulnerabilities the change introduces.
- **Snyk** is a commercial platform with a free tier;
  `snyk test --severity-threshold=high` reports only high and critical
  issues, and `--fail-on=upgradable` fails only when a fix exists.

A CVE in a dependency is not automatically exploitable in your service:
the vulnerable function may never be called. That judgment (and how to
record it with VEX) belongs to
[vulnerability and patch management](vulnerability-and-patch-management.md).
Dependency review on pull requests, lockfiles, `npm ci`, and Dependabot's
configuration are covered in
[pipeline and supply chain security](../ci-cd/pipeline-and-supply-chain-security.md).

### Secret scanning

Secret scanners look for strings in the shape of known credentials (AWS
access key IDs, GitHub tokens, Stripe keys, private key headers) and for
high-entropy strings. Layer them, because each layer catches what the
previous one let through: a pre-commit hook on the laptop, platform push
protection on push, a CI job that scans the commits in each push or pull
request, and a scan of built images and frontend bundles. TruffleHog can
also **verify** a candidate by calling the provider's API, which separates
live keys from test strings; `--results=verified,unknown` reports both
verified and unverifiable ones.

A found secret is an incident, not a lint error: revoke and rotate first,
then clean up. The full runbook is in
[secrets management](../environment-variables/secrets-management.md).

### IaC scanning: misconfiguration before it exists

TaskFlow's infrastructure is Terraform, so a public bucket or a security
group open to `0.0.0.0/0` exists in a pull request before it exists in the
cloud. IaC scanners parse the code (or the JSON output of
`terraform show -json` for a plan, where computed values are known) and
evaluate policies against each resource.

- **Checkov** ships with a large policy library (IDs such as `CKV_AWS_24`,
  "no security group allows ingress from 0.0.0.0/0 to port 22"), supports
  Terraform, CloudFormation, Kubernetes, Helm, and Dockerfiles, can write a
  **baseline** of today's findings so only new ones fail, and accepts
  inline skip comments with a written reason.
- **Trivy** scans IaC with `trivy config` (and in `trivy fs` with the
  `misconfig` scanner). The older tfsec project has been folded into
  Trivy, and its README asks users to migrate.

IaC scanning cannot see changes made by hand in the console. Cloud
posture tools (AWS Security Hub CSPM, AWS Config rules, Google Security
Command Center, Microsoft Defender for Cloud) check the live environment;
see [compliance and audit readiness](compliance-and-audit-readiness.md).

### Container image scanning

An image contains an operating system's packages as well as TaskFlow's
`node_modules`, and either can carry known CVEs. The scan belongs right
after the build, before the image is pushed for deployment, with a gate on
**fixable** high and critical findings (`--ignore-unfixed` in Trivy):
blocking on a CVE that has no fix only teaches people to disable the
check. Registries and runtime tools rescan stored and running images,
because a clean image becomes vulnerable the day a new CVE is published.
Base image choice, digests, and signing are covered in
[container security](../docker/container-security.md).

### DAST: testing the running API on staging

Dynamic application security testing sends real HTTP requests to a running
service. It finds what only appears at runtime: missing security headers,
verbose error pages, injection that changes a response, endpoints that
should not be reachable. It needs an environment that behaves like
production, so it runs against **staging** after each deploy, never against
production without explicit approval, and only ever against systems you own
or are authorized to test.

**ZAP** (formerly OWASP ZAP; since 2024 the open-source project is
maintained by its core team as "ZAP by Checkmarx") provides packaged scans:

- The **baseline scan** spiders the target for one minute by default and
  runs only passive checks; it does not attack.
- The **API scan** imports an OpenAPI, SOAP, or GraphQL definition and runs
  an active scan tuned for APIs, which sends attack payloads.
- The **full scan** spiders and actively attacks a web application; use it
  on a disposable environment because it submits forms and calls
  endpoints with junk data.

A rules file sets each alert to `IGNORE`, `INFO`, `WARN`, or `FAIL`, and the
scripts exit with 1 when any `FAIL` rule matches and 2 when there are only
warnings.

### Gating without drowning the team

A gate is a rule that turns findings into a pass or a fail. The useful
question for each finding is not "is it bad?" but "should it stop this
change?"

![Diagram: a finding from any scanner meets three decisions; if it is not new in this change it is reported only and stays tracked in its existing ticket; if it is new but not high or critical with a high-confidence rule, the pull request shows a warning and a ticket asks for a fix within the SLA; if it is serious but no fix or upgrade is available, the team records a time-boxed exception with an owner, reason, and expiry date; if a fix exists, the merge or release is blocked until the author fixes it and re-runs the check.](finding-gate-flow.svg)

The techniques that keep gates trustworthy:

- **Severity thresholds per tool.** Block on high and critical; report
  medium and low. Calibrate per tool, because severities are not comparable
  across scanners.
- **New findings only.** Code scanning shows alerts inside the pull
  request's diff; Semgrep scans pull requests diff-aware; OSV-Scanner
  compares base and head; Checkov and gitleaks accept baseline files.
  Existing debt becomes tickets with deadlines instead of a wall of red on
  every unrelated change.
- **Fixable only, for dependencies and images.** A gate the author cannot
  satisfy is a gate that gets bypassed.
- **Exceptions with expiry.** Accepting a risk is legitimate when it is
  written down: who accepted it, why, and until when. `.trivyignore` lines
  accept an `exp:` date; Checkov skip comments carry a reason; ZAP rules
  files say `IGNORE` per alert. Review them like code.
- **Monitor before enforcing.** Run a new scanner in report-only mode for a
  few weeks, tune or disable noisy rules, then turn on blocking.
- **Measure the noise.** Track how many findings are dismissed as false
  positives, how long fixes take, and how many critical findings are open.

A worked example shows why precision matters. Suppose a scanner raises 400
findings a week, 70% of them false positives, and each takes 6 minutes to
triage:

```text
before:  400 findings x 6 min = 2,400 min = 40 hours/week
         wasted on false positives: 280 x 6 min = 28 hours/week

after (new findings only, tuned to 10% false positives):
          25 findings x 6 min =   150 min = 2.5 hours/week
         wasted on false positives:   2.5 x 6 min = 15 min/week
```

The tuned gate catches the same new problems for a sixteenth of the
attention, and people trust it.

### One place for results: SARIF

Most scanners can write **SARIF** (Static Analysis Results Interchange
Format), a JSON standard for findings with locations, rules, and severity.
Uploading SARIF to GitHub code scanning with
`github/codeql-action/upload-sarif` puts CodeQL, Semgrep, Checkov, and Trivy
results in one list with annotations on pull requests, deduplication
across runs, and dismissal reasons that are auditable later. The upload
needs `security-events: write`, and each tool should use its own
`category` so results do not overwrite each other.

### The pipeline is attack surface too

Every scanner runs with the job's token and whatever secrets the job can
read, so the security pipeline needs the same hardening as the release
pipeline: read-only `permissions` by default, third-party actions pinned
to full commit SHAs, no secrets in jobs that run fork pull request code,
OIDC instead of stored cloud keys, and SBOMs and provenance for what
ships. The Trivy advisory also shows the limit of pinning: workflows
pinned to recent `trivy-action` commits were safe, but older pinned
commits still pulled the `setup-trivy` action through a mutable
reference, and that was retagged too. A pin protects only the code it
names, so pin scanner versions as well and prefer actions that pin their
own dependencies. Those controls are explained in
[pipeline and supply chain security](../ci-cd/pipeline-and-supply-chain-security.md).

## When to use and when not to use

| Situation | Minimum sensible set | Add later |
|---|---|---|
| Small team, one repository | CodeQL default setup, Dependabot alerts and security updates, push protection, `npm audit` gate | Secret scan in CI, image scan |
| Containers and Terraform in production | The above plus Trivy image scan, Checkov or Trivy config on PRs, TruffleHog or gitleaks | Semgrep custom rules, DAST on staging |
| Regulated data or many teams | All of the above, SARIF in one place, exceptions with expiry, DAST after each staging deploy | Metrics on noise and fix time, a security champions program |

Avoid these common traps:

- Do not run active DAST or full scans against production; use staging or
  a disposable environment with seeded data.
- Do not block pull requests on existing findings in legacy code; baseline
  them and schedule the fixes.
- Do not stack three SCA tools on the same lockfile; they report the same
  CVEs three times. Pick one source of truth and one gate.
- Do not give scanners secrets in workflows that run code from forks.

## Practical examples

The examples use major-version tags for GitHub's own actions, matching the
rest of this site, and full commit SHAs with a version comment for
third-party actions, as recommended after the Trivy compromise.

### A security workflow for TaskFlow API

```yaml
# .github/workflows/security.yml
name: security

on:
  pull_request:
  push:
    branches: [main]
  schedule:
    - cron: "17 3 * * 1"             # weekly: new CVEs appear in unchanged code

permissions:
  contents: read                     # every job starts read-only

jobs:
  codeql:
    name: CodeQL (${{ matrix.language }})
    runs-on: ubuntu-latest
    permissions:
      contents: read
      security-events: write         # upload results to code scanning
    strategy:
      fail-fast: false
      matrix:
        language: [javascript-typescript, actions]
    steps:
      - uses: actions/checkout@v7
        with:
          persist-credentials: false
      - uses: github/codeql-action/init@v4
        with:
          languages: ${{ matrix.language }}
          build-mode: none
          queries: security-extended
      - uses: github/codeql-action/analyze@v4
        with:
          category: /language:${{ matrix.language }}

  dependencies:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
        with:
          persist-credentials: false
      - uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: npm
      - run: npm ci --ignore-scripts   # the audit needs the tree, not install scripts
      - run: npm audit --audit-level=high --omit=dev

  secrets:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
        with:
          fetch-depth: 0             # scan every commit in the push or pull request
          persist-credentials: false
      - uses: trufflesecurity/trufflehog@3bd2b5887eb0efb8fa18bfd1d296032924e4ffdc # v3.99.9
        with:
          version: 3.99.9            # pin the scanner image as well as the action
          extra_args: --results=verified,unknown

  iac:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      security-events: write
    steps:
      - uses: actions/checkout@v7
        with:
          persist-credentials: false
      - uses: bridgecrewio/checkov-action@3f0caf0c3aa9f56ade6b49f6e60b63aaeafb75a3 # v12.3141.0
        with:
          directory: infra
          framework: terraform
          baseline: infra/.checkov.baseline
          output_format: cli,sarif
          output_file_path: console,checkov.sarif
      - uses: github/codeql-action/upload-sarif@v4
        if: success() || failure()   # upload even when the gate fails
        with:
          sarif_file: checkov.sarif
          category: checkov

  image:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      security-events: write
    steps:
      - uses: actions/checkout@v7
        with:
          persist-credentials: false
      - run: docker build --tag taskflow-api:ci .
      - uses: aquasecurity/trivy-action@ed142fd0673e97e23eac54620cfb913e5ce36c25 # v0.36.0
        with:
          image-ref: taskflow-api:ci
          version: v0.76.2           # pin the Trivy binary, not only the action
          severity: CRITICAL,HIGH
          ignore-unfixed: true       # gate only on findings that have a fix
          exit-code: "1"
          trivyignores: .trivyignore
          format: sarif
          output: trivy.sarif
          limit-severities-for-sarif: true
      - uses: github/codeql-action/upload-sarif@v4
        if: success() || failure()
        with:
          sarif_file: trivy.sarif
          category: trivy-image
```

What each part does:

- `permissions: contents: read` at the top makes every job read-only;
  only the jobs that upload SARIF get `security-events: write`.
- The **CodeQL** matrix analyzes the JavaScript code and the workflow files
  themselves. On pull requests, its alerts appear inside the diff.
- The **dependencies** job fails on high or critical advisories in
  production dependencies. `--ignore-scripts` avoids running package
  install scripts in a job that only needs the dependency tree.
- The **secrets** job lets TruffleHog work out the commit range from the
  event (the pull request's base and head, or the pushed commits; the
  weekly run scans the branch) and fail on verified or unverifiable
  secrets.
- The **iac** job fails only on findings that are not in the committed
  baseline and uploads all results for triage.
- The **image** job builds the image locally and fails on fixable high and
  critical CVEs. In a real pipeline, scan the exact image the build job
  produced (by digest) instead of building it twice.
- The `schedule` trigger rescans `main` weekly, because new advisories
  arrive even when the code does not change.

### A custom Semgrep rule for TaskFlow's data access

The rule encodes a TaskFlow convention: MongoDB filters are never built
from raw request input.

```yaml
# .semgrep/taskflow.yml
rules:
  - id: taskflow-mongo-filter-from-request
    languages: [javascript, typescript]
    severity: ERROR
    message: >-
      MongoDB filter built from raw request input. A value such as
      {"$ne": null} changes what the query matches. Validate and cast the
      input (for example with zod) before using it in a filter.
    metadata:
      cwe: "CWE-943: Improper Neutralization of Special Elements in Data Query Logic"
    patterns:
      - pattern-either:
          - pattern: |
              $MODEL.$METHOD({..., $KEY: req.query.$FIELD, ...}, ...)
          - pattern: |
              $MODEL.$METHOD({..., $KEY: req.body.$FIELD, ...}, ...)
      - metavariable-regex:
          metavariable: $METHOD
          regex: ^(find|findOne|countDocuments|updateOne|updateMany|deleteOne|deleteMany|findOneAndUpdate)$
```

```js
// src/routes/tasks.js (excerpt)
const unsafe = await Task.find({ owner: req.body.owner });          // flagged
const owner = z.string().parse(req.body.owner);                     // throws on objects
const safe = await Task.find({ owner });                            // not flagged
```

The `{..., $KEY: req.body.$FIELD, ...}` pattern matches an object literal
with that property anywhere in it, and the `metavariable-regex` limits the
rule to query methods. Run it next to the community rules in CI:

```yaml
# .github/workflows/semgrep.yml
name: semgrep
on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read

jobs:
  semgrep:
    if: github.actor != 'dependabot[bot]'
    runs-on: ubuntu-latest
    permissions:
      contents: read
      security-events: write
    container:
      image: semgrep/semgrep:1.185.0  # pin the engine version
    steps:
      - uses: actions/checkout@v7
        with:
          persist-credentials: false
      - run: semgrep scan --config p/default --config .semgrep/ --error --sarif-output=semgrep.sarif
      - uses: github/codeql-action/upload-sarif@v4
        if: success() || failure()
        with:
          sarif_file: semgrep.sarif
          category: semgrep
```

`--error` makes Semgrep exit with 1 when it has findings, which fails the
job, and `--sarif-output` writes a SARIF copy for code scanning while the
log keeps the readable output. Semgrep's own documentation runs the CLI in
the `semgrep/semgrep` image like this, and skips Dependabot's pull
requests, which cannot read the repository's secrets.

### IaC scanning with a baseline and justified skips

```bash
# Run once, review the output, and commit infra/.checkov.baseline
checkov --directory infra --framework terraform --create-baseline

# Locally or in CI: only findings that are not in the baseline fail
checkov --directory infra --framework terraform --baseline infra/.checkov.baseline
```

```hcl
# infra/uploads.tf (excerpt)
resource "aws_s3_bucket" "uploads" {
  #checkov:skip=CKV_AWS_144:Uploads are copied to the backup account by AWS Backup, not by replication
  #checkov:skip=CKV2_AWS_62:No service consumes object events from this bucket
  bucket = "taskflow-prod-uploads"
}
```

The baseline freezes today's debt so the gate only fails on new problems;
the debt itself gets tickets. A skip comment sits inside the resource and
states the reason, so reviewers and auditors can judge it later.

### Accepting a finding with an expiry date

```text
# .trivyignore
# CVE in a library function TaskFlow never calls; vendor fix expected this quarter.
# Accepted by the API team lead. Review at expiry.
CVE-2026-12345 exp:2026-12-31
```

After the expiry date, Trivy reports the CVE again and the gate fails, so
an accepted risk cannot quietly become permanent. (The CVE ID above is a
placeholder.)

### DAST against staging after each deploy

```yaml
# .github/workflows/dast-staging.yml
name: dast-staging
on:
  workflow_run:
    workflows: [deploy-staging]
    types: [completed]
  schedule:
    - cron: "0 2 * * *"              # nightly, against the current staging build

permissions:
  contents: read

jobs:
  zap-api-scan:
    if: github.event_name == 'schedule' || github.event.workflow_run.conclusion == 'success'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7      # only to read .zap/rules.tsv from the default branch
        with:
          persist-credentials: false
      - uses: zaproxy/action-api-scan@5158fe4d9d8fcc75ea204db81317cce7f9e5453d # v0.10.0
        env:
          ZAP_AUTH_HEADER_VALUE: Bearer ${{ secrets.STAGING_SCAN_TOKEN }}
        with:
          target: https://staging-api.example.com/openapi.json
          format: openapi
          rules_file_name: .zap/rules.tsv
          fail_action: true
          allow_issue_writing: false
```

```text
# .zap/rules.tsv (tab-separated: alert ID, action, name)
10038	IGNORE	(Content Security Policy (CSP) Header Not Set)
10021	FAIL	(X-Content-Type-Options Header Missing)
10035	FAIL	(Strict-Transport-Security Header)
90020	FAIL	(Remote OS Command Injection)
90022	WARN	(Application Error Disclosure)
```

- The scan imports TaskFlow's OpenAPI definition and actively tests each
  operation on staging, authenticated as a dedicated low-privilege test
  user whose token is stored as `STAGING_SCAN_TOKEN`.
- `fail_action: true` turns a failing scan into a failed job;
  `allow_issue_writing: false` keeps findings out of public issues.
- The rules file ignores the CSP alert for JSON responses (TaskFlow API
  serves no HTML), fails on missing transport headers and command
  injection, and only warns on error disclosure while that is being fixed.

### Dependabot security updates in one pull request

```yaml
# .github/dependabot.yml (excerpt)
version: 2
updates:
  - package-ecosystem: npm
    directory: /
    schedule:
      interval: weekly
    groups:
      npm-security:
        applies-to: security-updates
        patterns: ["*"]
```

With Dependabot security updates enabled for the repository, this groups
every npm security fix into one pull request, which is easier to test and
merge than ten separate ones. Version updates, cooldowns, and action pinning
are configured as shown in
[pipeline and supply chain security](../ci-cd/pipeline-and-supply-chain-security.md).

## Best practices

- Run each scanner where its feedback is cheapest, and keep rescanning
  `main`, registries, and production for newly published CVEs.
- Block only on new, high-severity, high-confidence, fixable findings;
  report everything else into tickets with deadlines.
- Introduce every new scanner in report-only mode, tune it, then enforce.
- Record accepted risks with an owner, a reason, and an expiry date, and
  review them like code.
- Send all results to one place (SARIF in code scanning or one platform)
  so findings are deduplicated and triaged once.
- Write custom rules for your own conventions; they are often the
  highest-signal checks a team has.
- Pin third-party scanner actions to commit SHAs and pin scanner versions;
  give scanner jobs the least permissions and no secrets.
- Run DAST only against environments you own, starting with passive scans
  and keeping active scans on staging or disposable environments.
- Measure false-positive rates and time to fix, and remove rules nobody
  acts on.

## In production

- **A new scanner went live and the pull request queue stopped.**
  *Detect:* dozens of PRs fail the same new check, and developers ask for
  admin merges. *Cause:* the gate blocks on all existing findings, not
  only on those the change introduces. *Fix:* switch to report-only,
  create a baseline, block only new findings, and file the backlog as
  tickets with owners.
- **A critical CVE blocks every build, but no fixed version exists.**
  *Detect:* the image or dependency gate fails on the same CVE in every
  pipeline, and the advisory lists no patched release. *Cause:* the gate
  does not distinguish fixable from unfixable findings. *Fix:* gate on
  fixable findings (`--ignore-unfixed`), add a time-boxed exception for
  this CVE with a mitigation note, and subscribe to the advisory.
- **Credentials leaked from CI after a scanner action was compromised.**
  *Detect:* an advisory such as the Trivy one names your action, and
  workflow logs show runs during the exposure window. *Cause:* the action
  was referenced by a mutable tag and ran with secrets in reach. *Fix:*
  rotate every secret those workflows could read, pin actions to full
  SHAs, pin scanner versions, and remove secrets from scanner jobs.
- **The nightly DAST scan filled staging with junk and broke demos.**
  *Detect:* thousands of strange tasks and users appear after the scan
  window. *Cause:* an active scan submits real requests to every
  operation. *Fix:* run active scans against a disposable environment or
  a dedicated tenant, reset data afterwards, and exclude destructive
  operations that need separate tests.
- **SARIF upload fails with "Resource not accessible by integration".**
  *Detect:* the scan succeeds but the upload step fails, and no alerts
  appear in code scanning. *Cause:* the job lacks `security-events: write`
  (private repositories may also need `actions: read`), or the event is a
  fork pull request with a read-only token. *Fix:* grant the permission on
  that job only, and accept that fork pull requests report results through
  logs.
- **Developers dismiss every alert from one SAST rule as a false
  positive.** *Detect:* the dismissal rate for one rule is close to 100%.
  *Cause:* a low-precision rule or a sanitizer the tool does not
  recognize. *Fix:* tune or disable the rule, model the project's
  sanitizer, and track dismissal rates per rule.

## Important terminology

- **Shift left:** Moving a check earlier in the delivery path, where
  feedback is faster and fixes are cheaper.
- **SAST:** Static application security testing; analysis of source code
  without running it.
- **SCA:** Software composition analysis; finding known vulnerabilities and
  licenses in dependencies.
- **DAST:** Dynamic application security testing; probing a running
  application over its interfaces.
- **IaC scanning:** Policy checks on infrastructure code before it is
  applied.
- **Source, sink, sanitizer:** Where untrusted data enters, where it is
  dangerous, and what makes it safe in between.
- **Taint tracking:** Following untrusted data through a program from
  sources to sinks.
- **Baseline:** A recorded set of existing findings that a gate ignores so
  that only new findings fail.
- **Effective false positive:** A finding on which developers take no
  positive action, whatever its technical correctness.
- **SARIF:** A JSON standard format for static analysis results.
- **Security gate:** A pipeline rule that fails a change based on findings.
- **Exception (risk acceptance):** A recorded, time-limited decision to
  accept a known finding.

## Common mistakes and misconceptions

- Believing a clean scan means secure code; scanners miss design and
  access-control flaws.
- Blocking on every severity and every existing finding, which trains
  people to bypass the gate.
- Treating a dismissed finding as a closed one, with no reason or expiry.
- Running active DAST against production, or against systems you are not
  authorized to test.
- Scanning only on pull requests and never rescanning, so new CVEs in
  unchanged code go unnoticed.
- Referencing scanner actions by tag and giving them secrets they do not
  need.
- Installing several overlapping tools and triaging the same CVE three
  times.

## Revision questions

1. Why does "shift left" not remove the need for scans after deployment?
   Give two kinds of problem that only appear later.
2. Explain sources, sinks, and sanitizers using TaskFlow's
   `Task.find({ owner: req.body.owner })` as the example.
3. A scanner reports 300 findings a week, 60% false positives, 5 minutes
   of triage each. How much time is wasted per week on false positives,
   and what would a new-findings-only gate with 10% false positives at 20
   findings a week cost? (900 minutes, or 15 hours; 20 x 5 = 100 minutes in
   total, of which 10 minutes are false positives.)
4. Which findings should block a merge, and what should happen to the
   others?
5. Why is `--ignore-unfixed` a sensible default for an image gate, and
   what risk does it leave open?
6. What is the difference between ZAP's baseline, API, and full scans, and
   where should each run?
7. What did the 2026 Trivy compromise teach about running security tools in
   CI?
8. Why should every accepted risk have an owner and an expiry date?

## Further learning

- [GitHub Docs: About code scanning with CodeQL](https://docs.github.com/en/code-security/code-scanning/introduction-to-code-scanning/about-code-scanning-with-codeql)
  and [workflow configuration options](https://docs.github.com/en/code-security/reference/code-scanning/workflow-configuration-options)
- [Semgrep: CLI reference](https://docs.semgrep.dev/cli-reference) and
  [sample CI configurations](https://docs.semgrep.dev/semgrep-ci/sample-ci-configs)
- [OSV-Scanner GitHub Action](https://google.github.io/osv-scanner/github-action/)
- [Checkov: suppressing and skipping policies](https://www.checkov.io/2.Basics/Suppressing%20and%20Skipping%20Policies.html)
- [Trivy: filtering findings](https://trivy.dev/docs/latest/configuration/filtering/)
- [ZAP: baseline scan](https://www.zaproxy.org/docs/docker/baseline-scan/)
  and [API scan](https://www.zaproxy.org/docs/docker/api-scan/)
- [OWASP DevSecOps Guideline](https://owasp.org/www-project-devsecops-guideline/)
- Next: [identity and access management](identity-and-access-management.md). Back to the [DevSecOps and cloud security overview](../devsecops-and-cloud-security.md).
