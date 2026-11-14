# GitHub Actions in Depth

GitHub Actions is GitHub's built-in automation platform. A YAML
**workflow** in `.github/workflows/` declares which **events** start it
and which **jobs** to run; each job runs on a **runner** and executes
**steps**, which are shell commands or reusable **actions**. Because it is
part of the repository, the pipeline is versioned, reviewed, and
protected like the code it builds.

This lesson walks through the moving parts in the order you meet them:
events, jobs, steps, and runners; contexts and expressions; `needs`,
`if`, and outputs; environment variables, configuration variables, and
secrets; environments with protection rules; `concurrency`; caching;
reusable workflows and composite actions; and the `GITHUB_TOKEN`
`permissions` block. It ends with a complete CI workflow for TaskFlow API
with a MongoDB service container.

## Why it matters

Most teams on GitHub run their whole delivery pipeline in Actions, so
Actions knowledge decides how fast, cheap, and safe that pipeline is. The
details matter: a missing `merge_group` trigger blocks a merge queue,
an unscoped `GITHUB_TOKEN` turns a compromised dependency into write
access to your repository, a cache key without the lockfile hash breaks
builds, and a missing `concurrency` group lets two deploys race. The
syntax is small, but the semantics (which context is available where,
what a skipped job reports, which events see secrets) are where real
pipelines succeed or fail.

## Real-world usage

- **GitHub's own documentation.**
  [Understanding GitHub Actions](https://docs.github.com/en/actions/get-started/understand-github-actions)
  and the
  [workflow syntax reference](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax)
  define every key used on this page; the
  [events reference](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows)
  lists each trigger, its activity types, and which ref and commit the run
  uses.
- **Security hardening guidance.** GitHub's
  [secure use reference](https://docs.github.com/en/actions/reference/security/secure-use)
  recommends least-privilege `GITHUB_TOKEN` permissions, pinning
  third-party actions to full commit SHAs, and avoiding untrusted input in
  scripts, practices applied in every example below and expanded in
  [pipeline and supply chain security](pipeline-and-supply-chain-security.md).
- **Reusable workflows at scale.** GitHub's
  [reusing workflow configurations](https://docs.github.com/en/actions/concepts/workflows-and-actions/reusing-workflow-configurations)
  page compares reusable workflows and composite actions: reusable
  workflows contain jobs, can use secrets, log each step, and can be
  nested up to ten levels; composite actions bundle steps that run inside
  the caller's job. Platform teams use them to give hundreds of
  repositories one maintained deployment pipeline.

**Popular tools and providers:** GitHub-hosted and larger runners,
self-hosted runners with Actions Runner Controller on Kubernetes, the
GitHub CLI (`gh workflow`, `gh run`), `actionlint` for workflow linting,
and the Marketplace of actions (`actions/*`, `docker/*`, cloud
providers' official actions).

## How it works

### Events, workflows, jobs, steps

![Diagram: events push, pull_request, workflow_dispatch, schedule, and release trigger the workflow file ci.yml in .github/workflows, which declares on, permissions, env, concurrency, and jobs; the lint job and the test job run in parallel on separate ubuntu-latest runners, test with a mongo:8.0 service container, each with ordered steps (checkout, setup-node, npm ci, then lint or test); the build job needs lint and test, builds and pushes an image, and exposes a digest output read as needs.build.outputs; each job reports a check, logs, and artifacts.](actions-workflow-anatomy.svg)

| Concept | What it is | Key facts |
|---|---|---|
| Workflow | A YAML file in `.github/workflows/` | Several workflows can run for one event |
| Event | What starts a run (`on:`) | Push, pull request, manual, schedule, release, and many more |
| Job | A set of steps on one runner | Jobs run in parallel unless linked with `needs`; each gets a fresh machine on hosted runners |
| Step | One command (`run:`) or action (`uses:`) | Steps share the job's file system and environment, in order |
| Action | Reusable step logic | JavaScript, Docker container, or composite; referenced as `owner/repo@ref` or `./path` |
| Runner | The machine executing a job | GitHub-hosted or self-hosted |

### Events

The events used most in CI/CD:

```yaml
on:
  push:
    branches: [main, "release/**"]
    tags: ["v*"]
    paths-ignore: ["docs/**", "**/*.md"]
  pull_request:                       # default types: opened, synchronize, reopened
    branches: [main]
  merge_group:                        # required when using a merge queue
  workflow_dispatch:                  # manual "Run workflow" button and API
    inputs:
      environment:
        description: Where to deploy
        type: environment
        required: true
      dry-run:
        type: boolean
        default: true
  schedule:
    - cron: "17 3 * * 1-5"            # 03:17 UTC, Monday to Friday
  release:
    types: [published]
```

| Event | Runs on | Typical use | Notes |
|---|---|---|---|
| `push` | The pushed commit | Build and deploy `main`, tag releases | Filters: `branches`, `tags`, `paths` and their `-ignore` forms |
| `pull_request` | A merge commit of the PR into its base | PR checks | From forks: read-only `GITHUB_TOKEN`, no secrets |
| `merge_group` | The merge queue's temporary branch | Required checks with a merge queue | Without it, queued PRs never get their checks |
| `workflow_dispatch` | The chosen branch | Manual deploys, maintenance jobs | Typed inputs; `gh workflow run deploy.yml -f environment=staging` |
| `schedule` | Latest commit on the default branch | Nightly scans, dependency checks, cleanup | Cron in UTC; shortest interval 5 minutes; can be delayed under load; disabled in public repos after 60 days without activity |
| `release` | The release's tag | Publish packages and assets | Choose types, usually `published` |
| `workflow_call` | Inherits the caller's event | Reusable workflows | See below |

`pull_request_target` and `workflow_run` also exist; they run with
elevated privileges in the context of the base repository and are covered
as security risks in
[pipeline and supply chain security](pipeline-and-supply-chain-security.md).

### Runners

| | GitHub-hosted | Self-hosted |
|---|---|---|
| Machine | Fresh VM per job (Linux, Windows, macOS; larger and ARM sizes available) | Your VM, container, or server |
| State between jobs | None: clean every time | Persists unless configured as ephemeral |
| Maintenance | GitHub patches images | You patch, scale, and secure them |
| Network | Public internet | Can reach private networks (databases, clusters) |
| Cost | Free for public repositories on standard runners; per-minute beyond plan quotas for private ones | Your infrastructure cost |
| Security caveat | Isolated per job | Never let untrusted code (public fork PRs) run on persistent self-hosted runners |

`runs-on: ubuntu-latest` picks the current Ubuntu image; pin a version
label such as `ubuntu-24.04` when you need stability across image
upgrades. Self-hosted runners are selected by labels
(`runs-on: [self-hosted, linux, x64]`), and Actions Runner Controller
autoscales ephemeral runners on Kubernetes.

### Contexts and expressions

Expressions, written `${{ <expression> }}`, read **contexts**:

| Context | Contains | Example |
|---|---|---|
| `github` | The event and run: `event_name`, `ref`, `sha`, `actor`, `repository`, `event.*` | `github.ref == 'refs/heads/main'` |
| `env` | Environment variables set with `env:` | `env.NODE_ENV` |
| `vars` | Configuration variables (org, repo, environment) | `vars.AWS_REGION` |
| `secrets` | Encrypted secrets, masked in logs | `secrets.SLACK_WEBHOOK_URL` |
| `inputs` | `workflow_dispatch` or `workflow_call` inputs | `inputs.environment` |
| `matrix`, `strategy` | Current matrix values | `matrix.node` |
| `steps` | Outputs and outcomes of earlier steps in the job | `steps.meta.outputs.version` |
| `needs` | Results and outputs of jobs this job needs | `needs.build.outputs.digest` |
| `job`, `runner` | The current job's container/services; the runner's OS, temp dir | `runner.os` |

Operators (`==`, `!=`, `&&`, `||`, `!`) and functions such as
`contains()`, `startsWith()`, `format()`, `join()`, `toJSON()`,
`fromJSON()`, and `hashFiles()` are available. **Status functions**
control whether a step or job runs: `success()` (the default),
`failure()`, `cancelled()`, and `always()`.

Two rules prevent confusion:

- Expressions are evaluated **before** the step runs, by the runner, and
  the result is pasted into the script. Untrusted values (PR titles,
  branch names) must therefore never be interpolated into `run:` directly;
  pass them through `env:` instead.
- Not every context is available everywhere: for example, `secrets` cannot
  be referenced directly in `if:` conditions, and `env` cannot be used in
  `runs-on`. The contexts reference has an availability table.

### needs, if, and outputs

`needs` builds the job graph and gives access to upstream outputs. `if`
decides whether a job or step runs. Outputs are written to files the
runner provides:

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    outputs:
      version: ${{ steps.meta.outputs.version }}   # job output from a step output
    steps:
      - uses: actions/checkout@v7
      - id: meta
        run: echo "version=$(node -p "require('./package.json').version")-${GITHUB_SHA::7}" >> "$GITHUB_OUTPUT"

  report:
    needs: build
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - env:
          VERSION: ${{ needs.build.outputs.version }}
        run: echo "Built $VERSION" >> "$GITHUB_STEP_SUMMARY"
```

| File variable | Effect |
|---|---|
| `$GITHUB_OUTPUT` | `name=value` lines become step outputs (`steps.<id>.outputs.name`) |
| `$GITHUB_ENV` | `NAME=value` lines become environment variables for later steps |
| `$GITHUB_PATH` | Directories added to `PATH` for later steps |
| `$GITHUB_STEP_SUMMARY` | Markdown shown on the run's summary page |

When a job fails, the jobs that need it are skipped, and a skipped job
counts as successful for required checks. Use an aggregator job with
`if: always()` as the required check (see
[pipeline design](pipeline-design.md)).

### env, vars, and secrets

| | `env:` | Configuration variables (`vars`) | Secrets (`secrets`) |
|---|---|---|---|
| Defined in | The workflow file (workflow, job, or step level) | Repository, organization, or environment settings | Repository, organization, or environment settings |
| Visible in logs | Yes | Yes | Masked (`***`) |
| Use for | Non-sensitive values tied to the workflow | Non-sensitive settings that differ per repo or environment (region, URLs) | Tokens, passwords, keys |
| Fork pull requests | Available | Available | **Not available** (except a read-only `GITHUB_TOKEN`) |

Environment-level secrets and variables override repository-level ones
with the same name, and are only available to jobs that reference that
environment, after its protection rules pass. Prefer OIDC federation over
long-lived cloud keys stored as secrets wherever the provider supports it.

### Environments and protection rules

An **environment** (staging, production) is a named deployment target
with its own secrets, variables, and **deployment protection rules**:

- **Required reviewers:** up to six people or teams; one approval lets the
  job proceed, and you can prevent the person who triggered the run from
  approving it.
- **Wait timer:** delay the job by a number of minutes.
- **Deployment branches and tags:** only `main` (or `v*` tags) may deploy
  to production.
- **Custom protection rules:** GitHub Apps that check external conditions
  (change tickets, monitoring).

```yaml
jobs:
  deploy-production:
    runs-on: ubuntu-latest
    environment:
      name: production
      url: https://api.taskflow.example.com
```

A job that names the environment pauses until the rules pass, and every
run creates a **deployment** record visible on the repository's
deployments page, linking commit, run, environment, and status.
Availability in private repositories depends on the plan: environments
need GitHub Pro, Team, or Enterprise, and required reviewers and wait
timers need GitHub Enterprise.

### concurrency

`concurrency` limits how many runs or jobs in the same **group** run at
once:

```yaml
# Cancel superseded PR runs, never a main run that has started
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}
```

```yaml
# Serialize deploys to one environment
jobs:
  deploy-production:
    concurrency:
      group: deploy-production
      cancel-in-progress: false
```

With `cancel-in-progress: false`, a new run waits while one is in
progress, and if a newer run arrives while one is already pending, the
older pending run is cancelled; so a deploy queue holds at most one
running and one waiting run, and the waiting one is always the newest.
That is usually what you want for deployments (the latest commit
wins), but it means intermediate commits are not deployed individually.

### Caching

Two ways to cache dependencies:

- **Built into setup actions:** `actions/setup-node` with `cache: npm`
  caches npm's download cache keyed on the lockfile. Recent versions also
  enable npm caching automatically when `package.json` declares npm as
  its package manager, which you can turn off with
  `package-manager-cache: false` (worth doing in privileged release
  workflows).
- **`actions/cache`** for anything else, with an explicit `key` and
  `restore-keys` (examples in [pipeline design](pipeline-design.md)).

Caches are immutable per key, scoped to branches (a branch can read its
own and the default branch's caches), limited per repository (10 GB by
default), and evicted after 7 days without use.

### Reusable workflows and composite actions

Two ways to avoid copy-pasting YAML across jobs and repositories:

![Diagram: the caller workflow release.yml in taskflow-api has a job deploy-staging that uses ./.github/workflows/deploy.yml with inputs environment staging and an image digest and secrets inherit; the called workflow declares on workflow_call with inputs, expected secrets, and outputs; its deploy job runs on its own runner in the named environment so protection rules and environment secrets apply, logs in to the cloud with OIDC, and returns outputs.url to the caller, where smoke-test reads it through needs; below, a composite action bundles steps that run inside the caller's job on the caller's runner, while a reusable workflow supplies whole jobs with their own runners, environments, and secrets, up to ten levels deep.](reusable-workflow-call.svg)

| | Composite action | Reusable workflow |
|---|---|---|
| Defined in | `action.yml` with `runs.using: composite` | A workflow with `on: workflow_call` |
| Called from | A step: `uses: ./.github/actions/setup` | A job: `uses: ./.github/workflows/deploy.yml` or `org/repo/.github/workflows/deploy.yml@v3` |
| Contains | Steps | Jobs (with their own runners, services, environments) |
| Secrets | Receive values only as inputs | Declared `secrets`, or `secrets: inherit` |
| Logs | One step in the caller's log | Each job and step logged separately |
| Best for | Setup sequences (install, configure, login) | Whole standardized pipelines (build, deploy) |

Details that trip people up: a reusable workflow cannot inherit the
caller's workflow-level `env:`; the called workflow can only reduce, never
raise, the `GITHUB_TOKEN` permissions the caller grants; and called
workflows from other repositories should be pinned to a tag or, better,
a commit SHA.

### GITHUB_TOKEN and the permissions block

Each run receives an automatically generated `GITHUB_TOKEN`, scoped to the
repository and expiring when the job ends (or after 24 hours at most).
Its permissions come from the repository or organization default
(read-only for repositories created since early 2023), overridden by the
workflow's `permissions:` block:

```yaml
permissions:            # workflow level: applies to every job
  contents: read

jobs:
  release:
    permissions:        # job level: replaces the workflow-level set for this job
      contents: write   # create tags and releases
      packages: write   # push to ghcr.io
      id-token: write   # request an OIDC token for cloud login or attestations
      attestations: write
```

| Scope | Grants |
|---|---|
| `contents` | Read code; `write` to push commits, tags, releases |
| `pull-requests` | Comment on, label, or update pull requests |
| `issues` | Create and edit issues |
| `packages` | Read or publish GitHub Packages (GHCR) |
| `id-token` | `write` lets the job request an OIDC token |
| `actions`, `checks`, `statuses`, `deployments` | Manage runs, check runs, commit statuses, deployments |
| `security-events` | Upload code scanning results |
| `attestations` | Create artifact attestations |

Any scope not listed is `none` once a `permissions` block exists, so
`permissions: {}` disables everything. Two more rules: events created with
`GITHUB_TOKEN` do not start new workflow runs (except `workflow_dispatch`
and `repository_dispatch`), and `actions/checkout` persists the token in
the job for later Git commands unless you set `persist-credentials:
false`.

## When to use and when not to use

| Need | Use | Avoid |
|---|---|---|
| Checks on every PR | `pull_request` (+ `merge_group` with a queue) | `pull_request_target` for running PR code |
| Deploy after merge | `push` to `main` with environments | Deploying from PR workflows |
| Manual operations | `workflow_dispatch` with typed inputs | Editing the workflow to trigger it |
| Nightly jobs | `schedule` (UTC cron, off the hour) | Relying on exact timing |
| Repeated setup steps | Composite action | Copy-pasted steps |
| Standard pipeline across many repos | Reusable workflow, pinned | Forked copies of YAML that drift |
| Private network access | Ephemeral self-hosted runners | Persistent self-hosted runners on public repositories |
| Cloud credentials | OIDC with `id-token: write` | Long-lived access keys in secrets |

## Practical examples

### Complete CI workflow for TaskFlow API

```yaml
# .github/workflows/ci.yml
name: CI

on:
  pull_request:
  merge_group:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}

jobs:
  lint:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v7
        with:
          persist-credentials: false
      - uses: actions/setup-node@v7
        with:
          node-version-file: .nvmrc
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run format:check

  test:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    services:
      mongo:
        image: mongo:8.0
        ports:
          - 27017:27017
        options: >-
          --health-cmd "mongosh --quiet --eval 'db.adminCommand({ ping: 1 })'"
          --health-interval 5s
          --health-timeout 5s
          --health-retries 12
    env:
      NODE_ENV: test
      MONGODB_URI: mongodb://localhost:27017/taskflow_test
    steps:
      - uses: actions/checkout@v7
        with:
          persist-credentials: false
      - uses: actions/setup-node@v7
        with:
          node-version-file: .nvmrc
          cache: npm
      - run: npm ci
      - name: Unit tests
        run: npm test
      - name: Integration tests against MongoDB
        run: |
          mkdir -p reports
          npm run test:integration
      - name: Upload test report
        if: ${{ !cancelled() }}
        uses: actions/upload-artifact@v7
        with:
          name: integration-report
          path: reports/
          retention-days: 14

  build:
    needs: [lint, test]
    runs-on: ubuntu-latest
    timeout-minutes: 10
    outputs:
      version: ${{ steps.meta.outputs.version }}
    steps:
      - uses: actions/checkout@v7
        with:
          persist-credentials: false
      - uses: actions/setup-node@v7
        with:
          node-version-file: .nvmrc
          cache: npm
      - run: npm ci
      - run: npm run build
      - id: meta
        run: echo "version=$(node -p "require('./package.json').version")-${GITHUB_SHA::7}" >> "$GITHUB_OUTPUT"
      - uses: actions/upload-artifact@v7
        with:
          name: dist-${{ steps.meta.outputs.version }}
          path: dist/

  ci-ok:
    if: always()
    needs: [lint, test, build]
    runs-on: ubuntu-latest
    steps:
      - name: Fail if any required job failed or was cancelled
        if: contains(needs.*.result, 'failure') || contains(needs.*.result, 'cancelled')
        run: exit 1
```

```json
{
  "scripts": {
    "lint": "eslint .",
    "format:check": "prettier --check .",
    "test": "node --test \"test/unit/**/*.test.js\"",
    "test:integration": "node --test --test-concurrency=1 --test-reporter=spec --test-reporter-destination=stdout --test-reporter=junit --test-reporter-destination=reports/integration.xml \"test/integration/**/*.test.js\"",
    "build": "node scripts/build.js"
  }
}
```

How the pieces fit:

- **Triggers:** PRs, the merge queue, pushes to `main`, and a manual
  button. `concurrency` cancels outdated PR runs but never cancels a
  `main` run that has started.
- **Least privilege:** the whole workflow only reads the repository, and
  `persist-credentials: false` stops checkout from leaving the token
  configured for later Git commands, so test code and dependencies cannot
  reuse it.
- **Service container:** `mongo:8.0` starts before the steps; the health
  check (using `mongosh`, which the official image includes) makes the job
  wait until MongoDB answers. Because the job runs directly on the runner,
  the mapped port is reachable at `localhost:27017`. (If the job itself
  ran in a container, it would use the service name `mongo` as the host.)
  Service containers require Linux runners.
- **Isolation:** integration test files run one at a time
  (`--test-concurrency=1`) because they share one database; each test
  cleans up its own data.
- **Reports:** the JUnit report is uploaded even when tests fail
  (`!cancelled()`), so failures can be inspected.
- **One required check:** `ci-ok` fails if any job failed or was
  cancelled, so branch protection requires just `ci-ok`.

### A manual deployment with typed inputs

```yaml
# .github/workflows/deploy-manual.yml
name: deploy (manual)
on:
  workflow_dispatch:
    inputs:
      environment:
        type: environment
        required: true
      image-digest:
        description: "sha256:... digest to deploy"
        type: string
        required: true

permissions:
  contents: read
  id-token: write

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: ${{ inputs.environment }}
    concurrency:
      group: deploy-${{ inputs.environment }}
      cancel-in-progress: false
    steps:
      - uses: actions/checkout@v7
        with:
          persist-credentials: false
      - name: Validate the digest format
        env:
          DIGEST: ${{ inputs.image-digest }}
        run: |
          [[ "$DIGEST" =~ ^sha256:[0-9a-f]{64}$ ]] || { echo "invalid digest"; exit 1; }
      - name: Deploy
        env:
          ENVIRONMENT: ${{ inputs.environment }}
          IMAGE: ghcr.io/example/taskflow-api@${{ inputs.image-digest }}
        run: ./scripts/deploy.sh "$ENVIRONMENT" "$IMAGE"
```

```bash
gh workflow run deploy-manual.yml -f environment=staging -f image-digest=sha256:<digest>
gh run watch                          # follow the run in the terminal
```

User input reaches the shell only through `env:` and is validated before
use, which closes the script-injection hole.

### A composite action for shared setup

```yaml
# .github/actions/setup-taskflow/action.yml
name: Set up TaskFlow
description: Install Node.js from .nvmrc and dependencies with npm ci
inputs:
  npm-ci-args:
    description: Extra arguments for npm ci
    required: false
    default: ""
runs:
  using: composite
  steps:
    - uses: actions/setup-node@v7
      with:
        node-version-file: .nvmrc
        cache: npm
    - shell: bash
      env:
        NPM_CI_ARGS: ${{ inputs.npm-ci-args }}
      run: npm ci $NPM_CI_ARGS
```

```yaml
# usage in any job of the same repository (after checkout)
steps:
  - uses: actions/checkout@v7
  - uses: ./.github/actions/setup-taskflow
  - run: npm test
```

Composite `run` steps must declare `shell`. A local action needs the
repository checked out first, because the runner reads `action.yml` from
the workspace.

### A reusable deployment workflow

```yaml
# .github/workflows/deploy.yml
name: deploy
on:
  workflow_call:
    inputs:
      environment:
        type: string
        required: true
      image:
        type: string
        required: true
    outputs:
      url:
        description: URL of the deployed environment
        value: ${{ jobs.deploy.outputs.url }}

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment:
      name: ${{ inputs.environment }}
      url: ${{ steps.deploy.outputs.url }}
    concurrency:
      group: deploy-${{ inputs.environment }}
      cancel-in-progress: false
    outputs:
      url: ${{ steps.deploy.outputs.url }}
    steps:
      - uses: actions/checkout@v7
        with:
          persist-credentials: false
      - uses: aws-actions/configure-aws-credentials@v6
        with:
          role-to-assume: ${{ vars.AWS_DEPLOY_ROLE_ARN }}
          aws-region: ${{ vars.AWS_REGION }}
      - id: deploy
        env:
          ENVIRONMENT: ${{ inputs.environment }}
          IMAGE: ${{ inputs.image }}
        run: |
          ./scripts/deploy.sh "$ENVIRONMENT" "$IMAGE"
          echo "url=https://$ENVIRONMENT.taskflow.example.com" >> "$GITHUB_OUTPUT"
```

```yaml
# Caller (excerpt of .github/workflows/release.yml)
jobs:
  deploy-staging:
    needs: build-image
    uses: ./.github/workflows/deploy.yml
    permissions:
      contents: read
      id-token: write          # the called job needs OIDC; the caller must grant it
    with:
      environment: staging
      image: ghcr.io/example/taskflow-api@${{ needs.build-image.outputs.digest }}

  smoke-test:
    needs: deploy-staging
    runs-on: ubuntu-latest
    steps:
      - env:
          URL: ${{ needs.deploy-staging.outputs.url }}
        run: curl --fail --retry 5 --retry-all-errors "$URL/healthz"
```

The environment's protection rules and environment-scoped variables
(`vars.AWS_DEPLOY_ROLE_ARN` can differ between staging and production)
apply inside the called job, so every repository using this workflow gets
the same guarded deployment.

### Lint your workflows

```bash
# actionlint catches syntax errors, unknown contexts, and shell issues in run: blocks
actionlint .github/workflows/*.yml
```

Running actionlint in CI on changes under `.github/workflows/` catches
mistakes (a typo in `needs`, an undefined output, an invalid cron
expression) before they reach `main`.

## Best practices

- Set `permissions: contents: read` at the top of every workflow and grant
  more per job only where needed.
- Pin third-party actions to full commit SHAs; at least pin official
  actions to a major version and keep them updated with Dependabot.
- Pass untrusted values to scripts through `env:`, never inline
  `${{ }}` in `run:`.
- Use `concurrency` to cancel superseded PR runs and to serialize deploys.
- Give every job `timeout-minutes`; the six-hour default hides hangs.
- Cache with setup actions or lockfile-keyed `actions/cache`; never cache
  secrets.
- Use environments with required reviewers and branch restrictions for
  production, and OIDC instead of stored cloud keys.
- Extract repeated steps into composite actions and whole pipelines into
  reusable workflows.
- Require one aggregator check, include `merge_group` when using a merge
  queue, and lint workflows with actionlint.

## In production

- **The merge queue never merges anything.**
  *Detect:* queued PRs time out waiting for required checks; no runs
  appear for `gh-readonly-queue/*` refs. *Cause:* the workflow lacks the
  `merge_group` trigger. *Fix:* add `merge_group:` to every workflow that
  provides required checks.
- **Integration tests fail with "connection refused" to MongoDB.**
  *Detect:* errors at the first database call, only in CI. *Cause:* tests
  start before MongoDB is ready, or they connect to `mongo` while running
  directly on the runner (or to `localhost` while running in a container).
  *Fix:* add a service health check, and use `localhost` with port
  mapping for runner jobs or the service name for container jobs.
- **Fork contributors' PRs fail with empty credentials.**
  *Detect:* steps using `secrets.*` fail only on PRs from forks. *Cause:*
  secrets are not passed to `pull_request` runs from forks, by design.
  *Fix:* keep PR checks secret-free (service containers, mocks), and run
  secret-dependent jobs after merge; do not switch to
  `pull_request_target` to get secrets.
- **Two deployments to production ran at the same time.**
  *Detect:* overlapping runs in the deployments history; mixed versions.
  *Cause:* no concurrency group for the deploy job. *Fix:*
  `concurrency: { group: deploy-production, cancel-in-progress: false }`.
- **A workflow suddenly fails with "Resource not accessible by
  integration".**
  *Detect:* a step calling the GitHub API or pushing gets 403. *Cause:*
  the `GITHUB_TOKEN` lacks the needed scope (a `permissions` block was
  added, or the org default became read-only). *Fix:* grant exactly the
  missing scope at the job level.
- **Nightly scheduled job stopped running.**
  *Detect:* no runs for weeks; a banner says the workflow was disabled.
  *Cause:* scheduled workflows in public repositories are disabled after
  60 days without repository activity. *Fix:* re-enable it (`gh workflow
  enable`) and add a keep-alive only if it is genuinely needed.

## Important terminology

- **Workflow:** A YAML automation file in `.github/workflows/`.
- **Event (trigger):** The activity that starts a workflow run.
- **Job:** Steps executed on one runner; jobs form a graph via `needs`.
- **Step:** A single `run` command or `uses` action within a job.
- **Action:** A reusable unit of steps (JavaScript, Docker, or composite).
- **Runner:** The machine that executes a job, GitHub-hosted or
  self-hosted.
- **Context:** An object available to expressions, such as `github`,
  `needs`, or `secrets`.
- **Expression:** `${{ }}` syntax evaluated before a step runs.
- **Service container:** A container (for example MongoDB) started for a
  job's duration.
- **Environment:** A deployment target with protection rules, secrets, and
  variables.
- **Concurrency group:** A key that limits simultaneous runs or jobs.
- **Reusable workflow:** A workflow triggered by `workflow_call` and used
  as a job.
- **Composite action:** An action that bundles several steps.
- **`GITHUB_TOKEN`:** The per-run token whose scopes are set by
  `permissions`.

## Common mistakes and misconceptions

- Assuming jobs share files; each job runs on a fresh runner.
- Interpolating `${{ github.event.* }}` into `run:` scripts.
- Granting `write-all` or relying on a permissive org default.
- Expecting secrets in fork PRs, then reaching for `pull_request_target`.
- Requiring a check that can be skipped into a pass.
- Using `env` or `secrets` in places where those contexts are not
  available.
- Forgetting that `schedule` uses UTC and runs on the default branch.
- Running untrusted PR code on persistent self-hosted runners.
- Treating `cancel-in-progress: false` as a full queue; only the newest
  pending run waits.

## Revision questions

1. Explain the relationship between an event, a workflow, a job, a step,
   and a runner.
2. Which events would you use for PR checks, deploying `main`, a manual
   rollback, and a nightly scan, and what are the caveats of each?
3. Why should `${{ github.event.pull_request.title }}` never appear inside
   a `run:` script, and what is the safe alternative?
4. How do step outputs become job outputs, and how does a later job read
   them?
5. Compare `env`, `vars`, and `secrets`, including what fork PRs can see.
6. A deploy workflow uses `concurrency: { group: deploy-prod,
   cancel-in-progress: false }`. Commits A, B, C, and D merge one minute
   apart while each deploy takes ten minutes. Which commits get deployed?
   (A, then D; B and C are cancelled while pending.)
7. When do you choose a composite action and when a reusable workflow?
8. What does `permissions: {}` do, and which scopes does a job that pushes
   an image to GHCR and logs in to AWS with OIDC need?

## Further learning

- [GitHub Docs: Understanding GitHub Actions](https://docs.github.com/en/actions/get-started/understand-github-actions)
- [GitHub Docs: Workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax)
- [GitHub Docs: Events that trigger workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows)
- [GitHub Docs: Contexts](https://docs.github.com/en/actions/reference/workflows-and-actions/contexts)
  and [Expressions](https://docs.github.com/en/actions/reference/workflows-and-actions/expressions)
- [GitHub Docs: Managing environments for deployment](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments)
- [GitHub Docs: Control workflow concurrency](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency)
- [GitHub Docs: Reusing workflow configurations](https://docs.github.com/en/actions/concepts/workflows-and-actions/reusing-workflow-configurations)
- [actionlint](https://github.com/rhysd/actionlint)
- Next: [testing and quality gates](testing-and-quality-gates.md). Back to the
  [CI/CD overview](../ci-cd.md).
