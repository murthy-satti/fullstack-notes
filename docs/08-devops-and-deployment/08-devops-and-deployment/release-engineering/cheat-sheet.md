# Release Engineering Cheat Sheet

Quick revision after the release engineering lessons, before an interview
or a release task.

## Key commands

| Command | What it does |
|---|---|
| `git describe --tags` | Names a commit by the last tag: `v2.4.1-5-g3f2a1c9` is 5 commits after `v2.4.1` |
| `git switch -c release/2026.11.2 origin/main` | Cuts the train's release branch from `main` |
| `git cherry-pick -x <sha>` | Backports a fix from `main` and records its source commit |
| `git tag -a v2026.11.2 -m "TaskFlow 2026.11.2" v2026.11.2-rc.3^{commit}` | Tags the last candidate's commit as the release (no rebuild) |
| `pact-broker can-i-deploy --pacticipant tasks-api --version <sha> --to-environment production` | Asks the broker if this version works with everything in production |
| `pact-broker record-deployment` / `record-release` / `record-support-ended` | Tells the broker what runs where and when app support ends |
| `eas update --branch production --rollout-percentage=10` | Ships an over-the-air update to 10% of matching builds |
| `eas update:edit` / `eas update:revert-update-rollout` | Raises the percentage (100 finishes) or rolls back |
| `turbo run lint test build --affected` | Runs tasks of changed packages and their dependents; base from `TURBO_SCM_BASE` |
| `nx affected -t lint test build` | Runs tasks whose inputs changed; base from `NX_BASE` |
| `gh run list --workflow deploy.yml --branch main --status success --limit 1 --json headSha` | Finds the last successful deploy: the monorepo deploy base |
| `pnpm changeset version`, then `pnpm changeset publish` | Applies bumps and changelogs, then publishes and tags packages |

## Key configuration

```text
# Response headers on every call to the deprecated /v1 API
Deprecation: @1796083200
Sunset: Wed, 30 Jun 2027 23:59:59 GMT
Link: <https://docs.example.com/taskflow/v1-migration>; rel="deprecation"
```

## Decision guide

| If you need | Choose | Why |
|---|---|---|
| Builds that updaters and stores can order | SemVer plus an integer build number | `+build.873` metadata is ignored for precedence |
| Dev builds between releases | `2.4.2-dev.N` (next patch) | `2.4.1-dev.5` sorts before 2.4.1 |
| A breaking API change | Expand, switch clients, wait and measure, contract | Servers learn first and forget last |
| Old tabs that survive a deploy | Old hashed assets kept for days, `no-cache` HTML | Open tabs load the old build's chunks |
| To retire old installed apps | A minimum version per platform in config, `426` below it | The floor moves without a deploy |
| Desktop updates you can halt at once | A dynamic update server | A static manifest waits for CDN caches |
| A 10% rollout that means 10% of installs | Bucketing by install ID and release | Per-request dice rolls reach frequent checkers |
| Mobile, desktop, or on-premises releases | A release train: cut, stabilize, phased rollout | They cannot ship on every merge |
| Event schema changes | A registry mode per topic; a new event version for breaking changes | The registry rejects breaking schemas |
| Many services on GitOps | One Argo CD Application per service | Promotion and rollback stay per service |
| Required checks in a monorepo | An always-running workflow with affected detection | Path-filtered checks stay pending |

## Numbers and defaults to remember

| Item | Value |
|---|---|
| Android `versionCode` | At most 2,100,000,000, never reused; `YYMMDDHHmm` overflows |
| MSIX version | Four parts of 0-65535; first not 0; fourth 0 for the Store |
| Pre-release order | `dev` < `rc` (ASCII); `rc.2` < `rc.10`; `semver.satisfies` needs `includePrerelease` |
| Skew at 50% new pods | 20 requests on one version: `2 x 0.5^20`, about 2 in a million |
| Support window | `0.75^n` remain; below 2% after 14 weeks |
| Vercel Skew Protection | Default maximum age 12 h on Pro, 1 day on Enterprise |
| Kubernetes | `kubelet` up to 3 minors older, never newer; 3 minors supported |
| Two-week train, 1 week each to stabilize and roll out | 2 to 4 weeks from merge to everyone, 3 on average |
| Browsers | Chrome every 2 weeks from 153, Firefox from 155; Rust every 6 weeks |
| LTS cost | 3 supported lines: 12 security fixes = 36 patch releases |
| Per-request 10% rollout | Offered after n checks: `1 - 0.9^n` (6 checks: 47%) |
| Update check load | 2 million installs every 4 hours: about 139 requests per second |
| MSIX App Installer | `HoursBetweenUpdateChecks` 0-255, default 24 |
| Monorepo CI | 40 tasks x 2 min = 80 min; 85% cache hits leaves 6 tasks |
| GitHub `paths` filter | Over 1,000 commits always runs; first 3,000 files only |

## Top mistakes

- **Comparing versions as strings.** Use a SemVer library.
- **Contracting the API while old clients remain.** Measure, then contract.
- **Deleting old assets on deploy.** Keep hashed files for days.
- **Calling per-request throttling a rollout.** Bucket by install ID and
  release.
- **Fixing only the release branch.** Fix `main`, then `cherry-pick -x`.
- **Rebuilding the final release.** Promote the last candidate's build.
- **Deploying a monorepo diff against `HEAD^1`.** Use the last successful
  deploy and `fetch-depth: 0`.
- **Undeclared env vars in task hashes.** Declare them (`VITE_*`).

## Where to go deeper

- [Versioning patterns](versioning-patterns.md)
- [Keeping frontend and backend in sync](keeping-frontend-and-backend-in-sync.md)
- [Update mechanisms and updaters](update-mechanisms-and-updaters.md)
- [Release trains and release management](release-trains-and-release-management.md)
- [Deploying microservices](deploying-microservices.md)
- [Monorepo builds and deployments](monorepo-builds-and-deployments.md)
- [Release engineering interview questions and answers](interview-questions-and-answers.md)

Back to the [release engineering overview](../release-engineering.md).
