# CI/CD Interview Questions and Answers

These questions review continuous integration, pipeline design, GitHub
Actions, testing and quality gates, artifacts and environment promotion,
and pipeline and supply chain security. Try answering each one before
reading the answer.

## Continuous integration fundamentals

### 1. What is continuous integration?

A practice in which every developer merges small changes into a shared
main line at least daily, and every merge is verified by an automated
build and tests. Its purpose is to find integration problems while they
are small and cheap. A build server running tests on weeks-old branches
is automation, not CI.

### 2. What is the difference between continuous delivery and continuous deployment?

Continuous delivery keeps every change on `main` releasable, with
deployment a push-button decision (usually one approval). Continuous
deployment releases every change that passes the pipeline automatically,
with no manual step. Delivery is the prerequisite for deployment.

### 3. Why does pipeline speed matter so much?

Feedback that arrives in about ten minutes keeps developers focused on
the change and encourages small batches. At 30-45 minutes people stop
waiting, batch changes, and context-switch, so failures become harder to
diagnose and lead time grows. Speed multiplies across every push of every
developer.

### 4. What does "keep the build green" mean in practice?

A red `main` is the team's top priority: the author fixes or, more often,
reverts the breaking change within minutes; nobody merges on top of a
failure; and flaky tests are quarantined so red always means something.
Teams often require up-to-date branches or a merge queue to prevent
combination failures.

### 5. What should a minimum CI pipeline for a Node.js API check?

Checkout of the exact commit, the runtime version from `.nvmrc`, `npm ci`
from the lockfile, lint and format checks, type checks if applicable,
unit tests, integration tests against a real database, a build, and
dependency and secret scanning. CI should call the same `npm run` scripts
developers use.

### 6. Why use `npm ci` instead of `npm install` in CI?

`npm ci` installs exactly what the lockfile specifies, fails if
`package.json` and the lockfile disagree, and starts from a clean
`node_modules`. `npm install` may resolve newer versions and rewrite the
lockfile, so CI would test something other than what was committed.

### 7. Name and define DORA's software delivery metrics.

Throughput: change lead time (commit to running in production),
deployment frequency, and failed deployment recovery time (time to recover
from a deployment that needs immediate intervention). Instability: change
fail rate (share of deployments needing immediate intervention) and
deployment rework rate (share of deployments that are unplanned fixes for
production incidents).

### 8. How should DORA metrics be used?

Per application or service, to track improvement over time, using
several metrics together because throughput and instability can pull
against each other (DORA's research finds they usually improve
together). They should not be targets or used to rank teams; mandated
targets invite gaming.

### 9. What runs before merge and what after?

Before merge: fast, reliable checks (lint, types, unit and integration
tests, build, scans). After merge: slower or less deterministic suites
(full end-to-end, performance, long scans), with clear ownership and fast
revert, because failures there affect everyone.

## Pipeline design

### 10. What is a pipeline's critical path?

The longest chain of dependent jobs in the job graph. Wall-clock time
equals its length, so speeding up jobs off the critical path saves
nothing; parallelize independent checks and shorten the jobs on the path.

### 11. What does fail-fast mean in pipeline design?

Running cheap checks that catch common failures first, and stopping work
once a run is doomed. In GitHub Actions matrices, `fail-fast: true`
(the default) cancels the remaining matrix jobs after one fails; set it to
`false` when you need every combination's result.

### 12. When is a matrix build appropriate?

When the variation is real: a library supporting several Node.js versions
or operating systems, or sharding one suite across jobs. An application
deployed on one runtime should test that runtime; a matrix only adds cost.

### 13. How should dependency caches be keyed, and what should be cached?

On everything that changes the content: OS, runtime version when native
modules are built, and the lockfile hash, with a prefix `restore-keys`
fallback. Cache the package manager's download cache (`~/.npm`), not
`node_modules`. Caches must be optional for correctness.

### 14. What is the difference between a cache and an artifact?

A cache speeds up repeated work, may be evicted, and is never guaranteed
to exist. An artifact passes outputs of the current run between jobs or
keeps them for people (reports, bundles), with a retention period.
Container images go to a registry, not either.

### 15. What does "build once, deploy many" mean, and why?

Build the deployable artifact once per commit and deploy that same
artifact to every environment, injecting configuration at deploy time.
Rebuilding per environment means production runs bits that were never
tested, because dependencies, base images, or flags can change between
builds.

### 16. What makes a build deterministic?

Pinned inputs: a committed lockfile with `npm ci`, base images pinned by
digest, pinned tool and action versions, no network fetches after the
install step, and no embedded timestamps or paths. Tests also need fixed
time, seeds, and isolated data.

### 17. Why are path filters dangerous for required checks?

A workflow skipped by a `paths` filter never reports its checks, so a
required check stays pending and blocks the PR. Run the workflow always
and decide inside it, using a change-detection job and conditional jobs
(a job skipped by `if:` reports success).

### 18. What makes a deploy step idempotent?

Running it twice yields the same end state: declaring desired state
("run image digest X", `kubectl apply`, `terraform apply`) rather than
issuing increments, tracked migrations, immutable inputs, verification
after acting, and a concurrency group so two runs cannot deploy at once.

## GitHub Actions

### 19. Explain workflows, events, jobs, steps, and runners.

An event (push, pull request, schedule, manual dispatch, release) starts a
workflow defined in `.github/workflows/`. The workflow is a graph of jobs;
each job runs on its own runner and executes ordered steps, each a shell
command (`run`) or an action (`uses`). Jobs run in parallel unless linked
with `needs`.

### 20. What is the difference between `pull_request` and `pull_request_target`?

`pull_request` runs the PR's merge commit with a read-only token and no
secrets for fork PRs. `pull_request_target` runs the base branch's
workflow in the base repository's context, with a write-capable token and
secrets. The latter is for metadata tasks only; checking out and running
PR code there is a "pwn request".

### 21. How do outputs pass between steps and jobs?

A step writes `name=value` to `$GITHUB_OUTPUT` and is read as
`steps.<id>.outputs.name`. A job maps step outputs in `outputs:`, and
later jobs read them as `needs.<job>.outputs.name`. Reusable workflows map
job outputs to workflow outputs.

### 22. What happens to dependent jobs when a job fails, and why does it matter for branch protection?

Jobs that `need` the failed job are skipped, and a skipped job counts as
passing for required checks. Requiring only a downstream job could let a
failing PR merge. Use an aggregator job with `if: always()` that fails
when any needed job failed or was cancelled.

### 23. Compare `env`, `vars`, and `secrets`.

`env:` defines non-sensitive values in the workflow file. `vars` are
configuration variables set in repository, organization, or environment
settings, visible in logs. `secrets` are encrypted, masked in logs, and
not given to fork PRs. Environment-level values override repository-level
ones and are released only after protection rules pass.

### 24. What are environments and deployment protection rules?

Named deployment targets with their own secrets and variables, guarded by
rules: required reviewers (up to six, one approval needed, self-review can
be prevented), wait timers, allowed branches or tags, and custom rules
from GitHub Apps. Jobs referencing them pause until rules pass and create
deployment records.

### 25. How does `concurrency` work?

Runs or jobs with the same group key do not run simultaneously. With
`cancel-in-progress: true`, a new run cancels the running one (good for
superseded PR runs). With `false`, the new run waits, and a newer pending
run replaces an older pending one, so a deploy group holds at most one
running and one waiting run.

### 26. Reusable workflow or composite action?

A composite action bundles steps that run inside the caller's job on the
caller's runner, receiving values as inputs; good for setup sequences. A
reusable workflow (`on: workflow_call`) supplies whole jobs with their own
runners, environments, and secrets; good for standardized build and
deploy pipelines across repositories. Pin either to a tag or SHA.

### 27. What does the `permissions` block do?

It sets the `GITHUB_TOKEN`'s scopes for the workflow or a job; any scope
not listed becomes `none`. Best practice is `contents: read` at the top
and extra scopes (`packages: write`, `id-token: write`) only on the jobs
that need them. A called reusable workflow can only reduce the caller's
permissions.

### 28. Why don't events created with `GITHUB_TOKEN` trigger workflows?

To prevent recursive runs. Pushes, tags, or PRs created with the default
token do not start new workflow runs (except `workflow_dispatch` and
`repository_dispatch`). Release bots use a GitHub App token, or the
follow-up work runs in the same workflow.

### 29. How do service containers work in GitHub Actions?

`services:` starts containers (such as `mongo:8.0`) for the job's
duration on Linux runners. With health check options, the job waits until
the service is healthy. A job running directly on the runner reaches it
via mapped ports on `localhost`; a job running in a container uses the
service name as the hostname.

### 30. Hosted or self-hosted runners?

Hosted runners give a fresh, patched VM per job with no maintenance.
Self-hosted runners reach private networks and custom hardware but must be
patched and secured; persistent self-hosted runners must never run
untrusted code such as public fork PRs. Ephemeral self-hosted runners
(destroyed after each job) reduce that risk.

## Testing and quality gates

### 31. Compare the test pyramid and the testing trophy.

The pyramid favors many fast unit tests, fewer integration tests, and few
end-to-end tests. The trophy adds static analysis as the base and makes
integration tests the largest layer, arguing they give the most confidence
per test for web applications. Both put few, slow end-to-end tests on top.

### 32. Where should each kind of check run?

Formatting and lint in seconds before push and on PRs; type checks and
unit tests on PRs; integration tests with service containers on PRs; end-
to-end tests on preview or staging environments; performance budgets on
PRs (web) or staging (API); canary analysis during production rollout.

### 33. What is a flaky test, and what causes flakiness?

A test that passes and fails on the same code. Causes include fixed
sleeps and races, shared state between tests, order dependence, real
external services, dates and time zones, randomness without seeds, and
slow runners with tight timeouts.

### 34. How should a team handle flaky tests?

Detect them (a retry that passes marks a test as flaky), track counts per
test, quarantine the ones blocking many PRs into a non-required job with
an owner and deadline, fix the root cause, verify by repeated runs, and
restore them. Never normalize re-running until green.

### 35. What are the limits of code coverage thresholds?

Coverage measures executed code, not verified behavior: a test without
assertions earns coverage. Thresholds are useful as a floor and a map,
ideally "no decrease" on changed code. Mutation testing measures whether
tests catch injected bugs.

### 36. How does test sharding work, and what limits it?

Each parallel job runs a deterministic subset (`--shard=2/4` in Jest,
Vitest, Playwright, or `--test-shard` in Node.js). Total time is roughly
the slowest shard plus setup; uneven test files and per-job setup cost
limit the speed-up, and reports must be merged.

### 37. What are preview environments, and what are the safety rules?

Short-lived deployments of one PR, used for end-to-end tests and review.
Use test data and credentials only, tear them down on PR close plus a
scheduled sweeper, and never deploy fork PRs with secrets.

### 38. What is a performance budget in CI?

A limit enforced by the pipeline, such as a k6 threshold (`p(95)<300` ms,
error rate below 1%) or Lighthouse CI assertions (performance score,
LCP, page weight). The build fails on regression, catching it in the
change that caused it.

## Artifacts and environment promotion

### 39. What properties should a deployable artifact have?

Immutable, uniquely identified (digest or immutable version), traceable
to the commit and build that produced it, and environment-neutral, with
configuration and secrets injected at deploy time.

### 40. Why deploy container images by digest instead of tag?

Tags are mutable names that can be repointed; a digest is the hash of the
image manifest and always identifies the same image. Deploying by digest
guarantees what was tested is what runs and prevents silent upgrades on
restarts. Tags remain useful as human-friendly labels.

### 41. How can you promote an image without rebuilding it?

Deploy the digest from the build job to each environment, add a tag with
`docker buildx imagetools create`, copy it to another registry with
`crane copy` or `skopeo` (the digest stays the same), or commit the
digest into a GitOps environment repository.

### 42. Why is frontend promotion harder, and how do you fix it?

Bundlers like Vite inline `VITE_*` variables at build time, forcing a
build per environment. Load non-secret configuration at runtime instead,
for example a `config.json` written at deploy time, so one bundle serves
every environment.

### 43. What should a deployment record contain?

The artifact digest and version, commit SHA, pipeline run, environment,
who triggered and who approved, time, and result. Such records answer
"what is running?", support rollback, and feed DORA metrics.

### 44. What belongs in a production approval gate?

Automated gates (tests green, staging healthy, canary analysis) decide
safety; a required reviewer decides timing, with context such as the diff
since the last release and test results. Environment rules restrict
deploys to `main` and prevent self-approval.

### 45. Why are GitHub Actions workflow artifacts not a release store?

They exist to pass files between jobs and keep reports, and they expire
(90 days by default). Releases belong in registries or release assets with
retention policies that protect rollback targets.

## Pipeline and supply chain security

### 46. Why is a CI/CD pipeline a high-value target?

It holds credentials that can push code, publish packages, and deploy,
and it executes code from many sources: PRs, actions, and dependencies.
Compromising a build step can be easier than attacking production and
yields broader access.

### 47. What is script injection in GitHub Actions, and how do you prevent it?

`${{ }}` expressions are expanded into scripts before the shell runs, so
an attacker-controlled value (PR title, branch name, comment) can become
commands. Pass such values through `env:` and quote them; lint workflows
with zizmor or actionlint.

### 48. Why pin actions to full commit SHAs?

Tags can be moved to malicious code, as in the 2025 `tj-actions/changed-files`
compromise; a full SHA cannot. Add the version as a comment, let
Dependabot propose updates, and enforce pinning with GitHub's Actions
policy where available.

### 49. How do OIDC credentials work for GitHub Actions to AWS?

A job with `id-token: write` requests a signed JWT from GitHub's OIDC
provider; it calls `AssumeRoleWithWebIdentity`; AWS STS verifies the
signature and the role's trust policy conditions on `aud` and `sub`, and
returns temporary credentials. No long-lived keys are stored, and the
`sub` binds access to a repository and environment or branch.

### 50. What is the `sub` claim, and why scope it tightly?

It identifies the source of the run, for example
`repo:example/taskflow-api:environment:production` or
`...:ref:refs/heads/main` or `...:pull_request`. A trust policy that
matches only the production environment prevents other repositories,
branches, or PRs from assuming the production role.

### 51. What do Dependabot and dependency review each do?

Dependabot opens PRs for security updates and, if configured, version
updates (waiting a default 3-day cooldown for new versions). Dependency
review runs on PRs, shows dependency changes, and fails the check for new
vulnerable or disallowed-license dependencies.

### 52. What is an SBOM, and why generate one per release?

A machine-readable list (SPDX or CycloneDX) of an artifact's components,
versions, licenses, and hashes. When a new vulnerability is disclosed, it
tells you quickly which releases and services contain the component.

### 53. What is provenance, and what do SLSA build levels require?

Provenance is a signed record of how an artifact was built. SLSA L1:
provenance exists; L2: signed provenance from a hosted build platform;
L3: a hardened platform that isolates runs and keeps signing material away
from build steps. GitHub artifact attestations alone reach L2; shared
reusable build workflows can reach L3.

### 54. How do secret scanning and push protection differ?

Secret scanning finds known secret formats already in the repository and
alerts. Push protection blocks pushes containing detected secrets before
they land; bypasses require a reason and create alerts. Both complement
pre-commit scanners.

### 55. What are the risks of self-hosted runners and caches?

Persistent self-hosted runners let untrusted code leave malware or steal
credentials for later jobs; use ephemeral runners and keep untrusted code
on hosted runners. Caches shared between low-trust and privileged
workflows can be poisoned; avoid caching in release and deploy workflows.

## Scenario-based questions

### 56. The PR pipeline takes 40 minutes and developers have started batching changes. How do you speed it up?

**What to check first:** per-job durations and the job graph for the
slowest runs.

**How to confirm:** `gh run view <id> --json jobs` shows which jobs sit on
the critical path and how long setup, install, and tests take.

**Likely causes and fixes:** serial jobs, no dependency caching, slow
end-to-end tests before merge, and a single huge test job. Parallelize
independent jobs, cache by lockfile, shard long suites, move slow suites
after merge, and set a speed budget. See [pipeline design](pipeline-design.md).

### 57. A PR with failing tests was merged even though branch protection requires CI. How?

**What to check first:** which check is required and how its job relates
to the test job.

**How to confirm:** the required job `needs` the test job and shows
"skipped", which counts as success.

**Likely causes and fixes:** a skipped dependent job satisfied the rule.
Require an aggregator job with `if: always()` that fails when any needed
job failed or was cancelled. See [pipeline design](pipeline-design.md).

### 58. Monorepo PRs touching only docs are stuck on "Expected: waiting for status". Why?

**What to check first:** whether the required workflow has `paths`
filters.

**How to confirm:** no run exists for the PR's head commit for that
workflow.

**Likely causes and fixes:** the workflow was skipped, so its check never
reported. Run it always and use in-job change detection with conditional
jobs. See [pipeline design](pipeline-design.md).

### 59. After enabling the merge queue, nothing merges. What is wrong?

**What to check first:** the triggers of workflows that provide required
checks.

**How to confirm:** no runs appear for `gh-readonly-queue/*` refs.

**Likely causes and fixes:** the workflows lack `on: merge_group`. Add it
to every workflow providing required checks. See
[GitHub Actions in depth](github-actions-in-depth.md).

### 60. Integration tests pass locally but fail in CI with connection errors to MongoDB. What do you check?

**What to check first:** the service container definition, health check,
and the connection string's host.

**How to confirm:** logs show tests starting before MongoDB was ready, or
connecting to `mongo` from a job running directly on the runner.

**Likely causes and fixes:** no health check, or the wrong host. Add a
`mongosh` ping health check, use `localhost` with mapped ports for runner
jobs (the service name for container jobs), and run integration files
serially if they share one database. See
[GitHub Actions in depth](github-actions-in-depth.md).

### 61. A third of CI runs need a re-run to pass. What is your plan?

**What to check first:** which tests fail on one attempt and pass on the
next.

**How to confirm:** the same tests fail intermittently on unchanged
commits; retries mark them flaky.

**Likely causes and fixes:** flaky tests from timing, shared state, or
external services. Track flakiness per test, quarantine the worst with
owners and deadlines, fix root causes, and stop treating re-runs as the
fix. See [testing and quality gates](testing-and-quality-gates.md).

### 62. Staging passed, but production fails with the "same release". Why?

**What to check first:** the image digests running in staging and
production.

**How to confirm:** the digests differ for the same version tag, or the
pipeline has separate build jobs per environment.

**Likely causes and fixes:** rebuilding per environment or a moved tag.
Build once, pass the digest as a job output, deploy by digest everywhere,
and make release tags immutable. See
[artifacts and environment promotion](artifacts-and-environment-promotion.md).

### 63. Two production deploys ran at the same time and left mixed versions. How do you prevent it?

**What to check first:** the deploy job's `concurrency` configuration.

**How to confirm:** overlapping runs in the deployments history.

**Likely causes and fixes:** no concurrency group. Add
`concurrency: { group: deploy-production, cancel-in-progress: false }`,
deploy by digest, and verify the rollout in the deploy step. See
[GitHub Actions in depth](github-actions-in-depth.md).

### 64. A release workflow triggered by tags never runs after the release bot creates a tag. Why?

**What to check first:** which token created the tag.

**How to confirm:** the tag exists, but no workflow run was triggered by
it.

**Likely causes and fixes:** tags created with `GITHUB_TOKEN` do not
trigger workflows. Run publishing in the same workflow gated on the
release output, or use a GitHub App token for the bot. See
[versioning, tags, and releases](../git-and-github/versioning-tags-and-releases.md).

### 65. An advisory says a GitHub Action you use was compromised last week. What do you do?

**What to check first:** which workflows reference the action and how
(tag or SHA).

**How to confirm:** `gh search code` finds the references; run history in
the exposure window shows which workflows executed it.

**Likely causes and fixes:** a tag repointed to malicious code. Rotate
every secret those workflows could access, review logs, pin to a verified
SHA or remove the action, and enforce SHA pinning by policy. See
[pipeline and supply chain security](pipeline-and-supply-chain-security.md).

### 66. A workflow triggered by a fork PR pushed a commit to `main`. How did it happen?

**What to check first:** the triggering event and whether the workflow
checked out PR code.

**How to confirm:** the run used `pull_request_target` with a checkout of
`github.event.pull_request.head.sha` and a write-capable token.

**Likely causes and fixes:** a pwn request. Revert, rotate secrets, run
untrusted code only under `pull_request` with read-only permissions, and
move privileged follow-ups to a `workflow_run` workflow that treats PR
output as data. See
[pipeline and supply chain security](pipeline-and-supply-chain-security.md).

### 67. The team stores an AWS access key as a secret for deployments. What would you change?

**What to check first:** where the key is used and what its IAM policy
allows.

**How to confirm:** CloudTrail shows the key's usage pattern and age.

**Likely causes and fixes:** a long-lived credential that can leak. Set up
an IAM OIDC provider for GitHub, a role whose trust policy matches only
`repo:<org>/<repo>:environment:production`, grant `id-token: write` on the
deploy job, use `aws-actions/configure-aws-credentials` with
`role-to-assume`, and delete the key. See
[pipeline and supply chain security](pipeline-and-supply-chain-security.md).

### 68. The registry cleanup job deleted the image you need for a rollback. How do you prevent it next time?

**What to check first:** the retention rules and which tags the previous
release had.

**How to confirm:** redeploying the previous digest fails with "manifest
unknown"; the cleanup log shows it was expired.

**Likely causes and fixes:** a policy that expires by count or age without
protecting releases. Tag releases with versions excluded from cleanup,
protect recently deployed digests, and test rollback regularly. See
[artifacts and environment promotion](artifacts-and-environment-promotion.md).

### 69. Leadership wants to compare teams by deployment frequency. How do you respond?

**What to check first:** what decision the comparison is meant to inform.

**How to confirm:** the services differ in architecture, risk, and
release constraints, so raw numbers are not comparable.

**Likely causes and fixes:** a misuse of DORA metrics. Measure per
service, track trends over time, use throughput and instability together,
and discuss constraints; DORA warns that targets and rankings lead to
gaming. See
[continuous integration fundamentals](continuous-integration-fundamentals.md).

## Further learning

- [CI/CD overview](../ci-cd.md)
- [Continuous integration fundamentals](continuous-integration-fundamentals.md) ·
  [Pipeline design](pipeline-design.md) ·
  [GitHub Actions in depth](github-actions-in-depth.md) ·
  [Testing and quality gates](testing-and-quality-gates.md) ·
  [Artifacts and environment promotion](artifacts-and-environment-promotion.md) ·
  [Pipeline and supply chain security](pipeline-and-supply-chain-security.md)
- [DORA: Software delivery performance metrics](https://dora.dev/guides/dora-metrics/)
- [GitHub Actions documentation](https://docs.github.com/en/actions)
- [GitHub Docs: Secure use reference](https://docs.github.com/en/actions/reference/security/secure-use)
