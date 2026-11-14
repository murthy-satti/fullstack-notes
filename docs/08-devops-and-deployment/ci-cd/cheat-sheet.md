# CI/CD Cheat Sheet

Quick revision of the CI/CD lessons, for the day before an interview or
before you write a pipeline.

## Key configuration

```yaml
# .github/workflows/ci.yml (the shape of a TaskFlow API pipeline)
on:
  pull_request:
  merge_group:                          # required with a merge queue
  push:
    branches: [main]
permissions:
  contents: read                        # grant more only per job
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}
jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 15                 # the default is 360
    steps:
      - uses: actions/checkout@v7
        with:
          persist-credentials: false
      - uses: actions/setup-node@v7
        with:
          node-version-file: .nvmrc
          cache: npm                    # caches ~/.npm, keyed on the lockfile
      - run: npm ci
      - run: npm run ci
  ci-ok:                                # the one required check
    if: always()
    needs: [test]
    runs-on: ubuntu-latest
    steps:
      - if: contains(needs.*.result, 'failure') || contains(needs.*.result, 'cancelled')
        run: exit 1
```

| Key | What it does |
|---|---|
| `needs: [a, b]` | Builds the job graph; a job is skipped when a job it needs fails |
| `if: always()` | Runs even after failures (aggregator jobs, test reports) |
| `$GITHUB_OUTPUT`, `outputs:` | `steps.<id>.outputs.x`, then `needs.<job>.outputs.x` |
| `env:`, `vars`, `secrets` | File values; visible settings; masked secrets, none for fork PRs |
| `environment: production` | Protection rules, environment secrets, a deployment record |
| `permissions:` | `GITHUB_TOKEN` scopes; unlisted scopes become `none` |
| `id-token: write` | Lets the job request an OIDC token for cloud login |

## Key commands

| Command | What it does |
|---|---|
| `npm ci` | Installs exactly the lockfile; fails if it is out of sync |
| `actionlint .github/workflows/*.yml` | Lints workflows, contexts, and expressions |
| `gh run view <id> --json jobs` | Job start and end times, to find the critical path |
| `docker buildx imagetools create --tag <repo>:2.4.0 <repo>@sha256:<digest>` | Adds a tag without rebuilding |
| `crane copy <src>@sha256:<digest> <dst>:2.4.0` | Copies to another registry; same digest |
| `gh attestation verify oci://<image>@sha256:<digest> --owner example` | Verifies provenance before deploying |

## Decision guide

| If you need | Choose | Why |
|---|---|---|
| Checks on every PR | `pull_request` (+ `merge_group`) | Fork PRs get a read-only token, no secrets |
| Deploys after merge | `push` to `main` with environments | Approvals, environment secrets, records |
| Cloud credentials | OIDC, role bound to repo and environment | No long-lived keys to leak |
| Reuse | Composite action (steps) or reusable workflow (jobs) | Jobs get their own runners and secrets |
| Several Node.js versions | A matrix | For libraries; an app tests its one runtime |
| A slow suite | Sharding (`--shard=2/4`) | About the slowest shard plus setup |
| Required checks in a monorepo | Change detection and conditional jobs | Path filters leave checks pending |
| A production release | The digest staging tested | What was tested is what runs |
| One web bundle everywhere | Runtime `config.json` | Vite inlines `VITE_*` at build time |

## Numbers and defaults to remember

- PR pipeline about 10 minutes; at 30 to 45, people batch changes.
  Flaky failures well under 1% of runs.
- Critical path, the longest chain of jobs: 4 + 3 + 2 + 6 + 3 = 18
  minutes in the example, against 22 run serially.
- Matrix jobs = combinations - excludes + new includes (3 x 2 = 6).
- Caches: immutable per key, 10 GB per repository by default, evicted
  after 7 days unused; a branch reads its own and the default branch's.
  Artifacts are kept 90 days by default.
- Concurrency (default): one running and one pending run per group; a
  newer pending run replaces the older one. `queue: max` keeps up to 100
  pending (not with `cancel-in-progress: true`).
- `schedule`: UTC, every 5 minutes at most, disabled in public
  repositories after 60 days without activity.
- Required reviewers: up to 6, one approval. In private repositories,
  required reviewers and wait timers need GitHub Enterprise.
- `GITHUB_TOKEN` expires with the job (24 hours at most); events it
  creates start no runs, except `workflow_dispatch` and
  `repository_dispatch`. Reusable workflows nest up to ten levels.
- Dependabot waits 3 days before proposing a new version by default;
  security updates are not delayed.
- DORA change fail rate: 6 failed of 60 deployments = 10%.

## Top mistakes

- **Requiring a job that `needs` the tests.** Require an `if: always()`
  aggregator; a skipped job counts as passing.
- **Path filters on required workflows.** Run them always and decide
  inside with a change-detection job.
- **Rebuilding for each environment.** Build once and deploy the digest.
- **Caching `node_modules`, or keys without the lockfile hash.** Cache
  `~/.npm` keyed on the OS and the lockfile hash.
- **`${{ github.event.* }}` inside `run:`.** Pass values through `env:`
  and quote them.
- **`pull_request_target` with a checkout of the PR head.** Run PR code
  under `pull_request`; privileged follow-ups use `workflow_run`.
- **Third-party actions pinned by tag.** Pin full commit SHAs.
- **Long-lived cloud keys in secrets.** Use OIDC with a tight `sub`.

## Where to go deeper

- [Continuous integration fundamentals](continuous-integration-fundamentals.md)
- [Pipeline design](pipeline-design.md)
- [GitHub Actions in depth](github-actions-in-depth.md)
- [Testing and quality gates](testing-and-quality-gates.md)
- [Artifacts and environment promotion](artifacts-and-environment-promotion.md)
- [Pipeline and supply chain security](pipeline-and-supply-chain-security.md)
- [CI/CD interview questions and answers](interview-questions-and-answers.md)

Back to the [CI/CD overview](../ci-cd.md).
