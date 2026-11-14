# Monorepo Builds and Deployments

A monorepo keeps many projects in one repository: for TaskFlow, the API,
a background worker, the web app, the desktop app, and the packages they
share. One repository does not mean one build or one deploy. The work of
release engineering in a monorepo is to build, test, and deploy only what
a change affects, to reuse every result that has not changed, and to keep
each app on its own release path even though the code lives together.

This lesson covers monorepo versus polyrepo from a delivery point of
view; what changes in CI: affected-project detection (Nx `affected`,
Turborepo `--affected` and `--filter`, Bazel), choosing the base commit,
task graphs with local and remote caching, path filters in GitHub
Actions, one workflow per deployable app versus a matrix; per-app deploys
from one repository; shared packages and their versioning (fixed versus
independent, Changesets, publishing internal packages); atomic
cross-cutting changes; `CODEOWNERS` per directory; and dependency hygiene
with pnpm workspaces and a one-version policy. Repository mechanics
(partial clones, sparse checkout, large files) are covered in
[hooks, .gitignore, and large repositories](../git-and-github/hooks-gitignore-and-large-repositories.md).

The example repository:

```text
taskflow/
  apps/
    api/            TaskFlow API (Express) -> container image
    worker/         background jobs -> container image
    web/            TaskFlow Web (React + Vite) -> static site
    desktop/        TaskFlow Desktop (Tauri) -> installers, released on a train
  packages/
    shared-types/   TypeScript types used by api and api-client, published with the client
    api-client/     typed client for the API, used by web and desktop, also published to npm
    ui/             React components used by web and desktop
  pnpm-workspace.yaml
  turbo.json
```

## Why it matters

- **CI time grows with the repository unless it is scoped.** If every pull
  request lints, tests, and builds every project, 40 tasks of two minutes
  each cost 80 runner-minutes per push, for a change that may touch one
  file in one app.
- **Deploys must stay per app.** A documentation fix should not redeploy
  the API, and a change to the API should not rebuild the desktop
  installers.
- **Atomic commits are not atomic deploys.** One pull request can change
  the API, its client, and the web app together, but the API and the web
  app still deploy separately, so the version skew rules from
  [keeping frontend and backend in sync](keeping-frontend-and-backend-in-sync.md)
  still apply.
- **Shared code needs a versioning decision.** Internal packages can
  always track the latest source; packages published to npm need SemVer
  and changelogs, and a choice between one version for all and one per
  package.

## Real-world usage

- **Google.** Rachel Potvin and Josh Levenberg's
  [Why Google Stores Billions of Lines of Code in a Single Repository](https://research.google/pubs/why-google-stores-billions-of-lines-of-code-in-a-single-repository/)
  (Communications of the ACM, 2016) describes one repository serving as
  the source of truth for tens of thousands of developers, the custom
  tooling that makes it workable, and the trade-offs of the model.
- **Microsoft.** Brian Harry's
  [The largest Git repo on the planet](https://devblogs.microsoft.com/bharry/the-largest-git-repo-on-the-planet/)
  (2017) describes moving the Windows codebase, about 3.5 million files
  and 300 GB, with about 4,000 engineers, to Git, which needed GVFS to
  virtualize the repository so developers download only what they use.
- **Meta.** Meta's
  [Sapling announcement](https://engineering.fb.com/2022/11/15/open-source/sapling-source-control-scalable/)
  (2022) describes source control built to serve an internal repository
  with tens of millions of files, commits, and branches for tens of
  thousands of developers.
- **Nx and Turborepo.** Nx's
  [affected](https://nx.dev/docs/features/ci-features/affected) command
  runs only the tasks whose inputs changed between a base and a head
  commit, and recommends using the last successful commit on `main` as
  the base. Turborepo's
  [`--affected`](https://turborepo.dev/docs/reference/run) flag is
  equivalent to `--filter=...[main...HEAD]`, and its documentation warns
  that a too-shallow checkout makes every package look changed.
- **Vercel.** Vercel's
  [monorepo documentation](https://vercel.com/docs/monorepos) creates one
  project per app directory and skips builds for projects that a commit
  did not change, based on the workspace's declared dependencies and the
  lockfile.

**Popular tools and providers:** Nx, Turborepo, Bazel, pnpm, npm, and
Yarn workspaces, Changesets, release-please in manifest mode, Vercel and
Netlify monorepo support, GitHub `CODEOWNERS` and merge queues, and
remote caches (Vercel Remote Cache, Nx Cloud, self-hosted HTTP caches,
Bazel remote execution services).

## How it works

### Monorepo or polyrepo, from a delivery point of view

| Delivery concern | Monorepo | Polyrepo |
|---|---|---|
| Cross-project change | One pull request, reviewed and tested together | Several pull requests merged in order |
| Shared code | Consumed from source (`workspace:*`), always current | Published packages, upgraded by each consumer |
| CI cost | Needs affected detection and caching, or it grows with the repository | Naturally scoped to one project |
| Deploy independence | Must be designed (per-app workflows or affected deploys) | The default |
| Ownership | `CODEOWNERS` per directory | Repository permissions |
| Tooling | Workspaces, a task runner, remote caching | Standard per-repository tooling |

Neither model is better in general. A monorepo trades per-project
simplicity for cheap cross-project changes and one set of tools; the
build system is what makes that trade work.

### The project graph and affected detection

Workspace tools build a **project graph** from each package's declared
dependencies (`"@taskflow/api-client": "workspace:*"` in `package.json`).
A change is mapped to the projects that own the changed files, and the
**affected** set is those projects plus everything that depends on them,
directly or transitively.

![Diagram: the TaskFlow project graph after a change to packages/shared-types: shared-types is changed; the api app and the api-client package depend on it and are affected; web and desktop depend on api-client and are affected transitively; ui and worker do not depend on shared-types and are not affected; global inputs such as the lockfile, turbo.json, and tsconfig.base.json affect everything. A summary says CI rebuilds and tests five projects, deploys the api as an image and web as a static site, builds and tests desktop now while it ships on its next train, and runs nothing for ui and worker; the commands are turbo run build test --affected or nx affected -t build test.](affected-graph.svg)

| Tool | Command | Granularity and notes |
|---|---|---|
| Nx | `nx affected -t lint test build` | Task-level: selects tasks whose inputs include a changed file; base defaults to `main`, override with `--base` and `--head` or `NX_BASE` and `NX_HEAD` |
| Turborepo | `turbo run lint test build --affected` | Package-level by default: any changed file selects all of that package's tasks; base and head from `TURBO_SCM_BASE` and `TURBO_SCM_HEAD` |
| Turborepo filters | `turbo run build --filter=...[origin/main]` | `...` before a selector adds dependents; `--filter=@taskflow/ui...` selects a package and its dependencies |
| Bazel | `bazel query "rdeps(//..., set(//packages/shared-types:lib))"` | Target-level reverse dependencies within a universe; the most precise, at the cost of declaring everything in BUILD files |

Global inputs need special handling: a change to the root lockfile, the
task runner's configuration, or a shared compiler configuration can
affect every project. Turborepo lists such files in
`globalDependencies`; Nx treats workspace configuration as an input to
every project.

### Choosing the base commit

Affected detection is a diff, so its answer depends on what you diff
against:

- **Pull requests:** the merge base with the target branch (what the pull
  request would add to `main`).
- **Pushes to `main` that deploy:** the last commit that was
  *successfully deployed*, not the previous commit.

![Diagram: three commits on main: X, the last successful deploy; A, which changes apps/api but whose deploy failed on a flaky test; and B, a docs-only change that is the current run. Wrong: with base HEAD^1, which is A, the diff A..B is docs only, so nothing deploys and the api change in A never ships. Right: with the base set to the last successful deploy X, the diff X..B includes apps/api, so the api is rebuilt and deployed. Nx's nx-set-shas action finds the last successful run on main; with Turborepo set TURBO_SCM_BASE; pull requests use the merge base.](affected-base-selection.svg)

Nx documents a GitHub action, `nrwl/nx-set-shas`, that uses the GitHub API
to find the last successful workflow run on `main` and sets `NX_BASE` and
`NX_HEAD`; with Turborepo you set `TURBO_SCM_BASE` yourself (the deploy
workflow below does it with `gh run list`). Either way the checkout needs
history: `fetch-depth: 0` (Turborepo also suggests `filter: blob:none` to
keep it fast), because without the base commit every package counts as
changed.

### Task graphs and build caching

Inside the affected set, tasks form a graph: `web#build` needs
`api-client#build` and `ui#build` first (`dependsOn: ["^build"]`), while
lint and unit tests can often run in parallel. The task runner schedules
that graph across CPU cores and, crucially, skips tasks whose result is
already known.

![Diagram: for the task web#build, the build tool hashes its inputs (source files in apps/web, hashes of internal dependencies, the declared env vars VITE_* and APP_VERSION, the task definition in turbo.json, and resolved external dependencies from the lockfile) into a hash such as 8f3c91e2; on a local or remote cache hit it downloads dist/ and the logs, checks the HMAC signature, and replays the logs in about 5 seconds; on a miss it runs vite build in about 2 minutes and stores signed outputs and logs, with only CI writing. With 40 tasks of 2 minutes and an 85% hit rate, only 6 tasks run, 12 minutes plus 34 short restores; if VITE_API_URL is not declared as an input, a staging build can be restored for production.](remote-cache-hit-miss.svg)

How caching works:

- **The hash is the cache key.** It covers the files the task reads, the
  hashes of the internal packages it depends on, the declared
  environment variables, the task's configuration, and the resolved
  versions of external dependencies.
- **Outputs and logs are stored.** Turborepo treats logs as artifacts, so
  a cache hit replays the original output; Bazel stores an action cache
  (action hash to result) and a content-addressable store of output
  files.
- **Remote caches share results** between CI runs and developers. A task
  built on one pull request is a hit on the next pull request and on
  `main` after the merge.
- **Trust matters.** A poisoned cache entry would ship in every build that
  hits it. Let only CI write to the remote cache (Bazel's documentation
  suggests exactly that, and `--remote_upload_local_results=false` makes a
  client read-only), and sign entries: Turborepo can sign
  artifacts with HMAC-SHA256 using `TURBO_REMOTE_CACHE_SIGNATURE_KEY` and
  treats any artifact that fails verification as a miss.
- **Undeclared inputs cause wrong hits.** If the web build reads
  `VITE_API_URL` but the task does not declare it, staging and production
  builds have the same hash, and production can receive the staging
  bundle. Declare environment variables explicitly (Turborepo's `env`,
  with wildcards such as `VITE_*`), and prefer runtime configuration for
  values that differ per environment (see
  [build-time versus runtime configuration](../environment-variables/build-time-vs-runtime-configuration.md)).

### Path filters in GitHub Actions

GitHub's own `paths` filter is the simplest scoping tool: a workflow runs
only if at least one changed file matches. Three properties shape how to
use it (details and a required-check workaround are in
[pipeline design](../ci-cd/pipeline-design.md)):

- A workflow skipped by a path filter leaves its checks **pending**, which
  blocks merging if those checks are required.
- The filter does not know the dependency graph: `apps/web/**` misses a
  change in `packages/ui` that web depends on, unless you list every
  dependency path by hand and keep the list current.
- GitHub documents limits: if a push contains more than 1,000 commits the
  workflow always runs, and for very large diffs only the first 3,000
  files are considered.

A good split: workflow-level `paths` filters for non-required, per-app
deploy workflows, and an always-running CI workflow that uses the task
runner's affected detection for required checks.

### One workflow per deployable app, or one matrix

| | One workflow per app | One workflow, matrix of affected apps |
|---|---|---|
| Triggers | `paths` per app (or a call from a shared workflow) | One trigger; the matrix is computed from the affected set |
| Environments and approvals | Natural: each app has its own environment and reviewers | Possible per matrix entry, but less clear in the UI |
| Ownership | `CODEOWNERS` can assign each workflow file to its team | One file that every team edits |
| Duplication | Avoided with a reusable workflow | None |
| Required checks | Hard with path filters (pending checks) | Easy: one job always reports |

A common combination: one always-running CI workflow with
`--affected` for required checks, and one deploy workflow per app (each a
thin caller of a shared reusable workflow) or a single deploy job that
runs `turbo run deploy --affected` when all apps deploy the same way.

### Per-app deploys from one repository

- **Vercel:** one project per app directory (the Root Directory setting).
  Vercel skips builds for projects that a commit did not change, when the
  repository is on GitHub and uses npm, Yarn, pnpm, or Bun workspaces with
  unique package names and explicit dependencies between packages; other
  repositories can use the Ignored Build Step setting.
- **Netlify:** one site per app, with the package directory pointing at
  the app. By default any change in the base directory (the repository
  root) builds every connected site, so monorepos add an `ignore` command
  that checks only the relevant paths.
- **Containers:** each app has its own image, built from the repository
  root as context so it can include workspace packages.
  `turbo prune <package> --docker` produces a pruned copy of the workspace (the
  `package.json` files separately from the full source, plus a pruned
  lockfile), so the Docker build installs and caches only what that app
  needs.
- **Desktop and mobile:** built and tested on every affected change, but
  released on their own train with their own version numbers (see
  [release trains and release management](release-trains-and-release-management.md)).

### Shared packages and versioning

There are two kinds of shared package, and they need different rules:

- **Internal-only packages** (`ui`) are consumed from source with
  `workspace:*`. They have no meaningful version; every app always
  builds against the current code, and affected detection decides what
  to rebuild. This is the "one version" model: there is never an old
  copy of `ui` in use.
- **Published packages** (`@taskflow/api-client` on npm for customers,
  and `@taskflow/shared-types`, whose types the client exposes) need
  SemVer, changelogs, and tags, because consumers outside the repository
  upgrade on their own schedule. Inside the repository the apps still
  consume them from source.

For published packages, choose how versions relate:

| Strategy | Meaning | Fits |
|---|---|---|
| Fixed | Every package in the group always shares one version; all are bumped and published together even without changes (Changesets `fixed`) | SDKs whose packages are always used together |
| Linked | Packages keep their own versions, but a release bumps changed ones to the highest current version in the group plus the highest bump type (Changesets `linked`) | Related packages whose versions should line up when they change |
| Independent | Each package versions itself | Unrelated libraries |

Changesets makes versions explicit: each pull request adds a small
changeset file naming the packages and bump types, `changeset version`
applies the bumps and updates changelogs, and `changeset publish`
publishes to npm and creates tags like `@taskflow/api-client@2.5.0`. Its
GitHub action opens a versioning pull request that collects pending
changesets, so releasing is merging that pull request. release-please's
manifest mode is the alternative driven by Conventional Commits (see
[versioning, tags, and releases](../git-and-github/versioning-tags-and-releases.md)).

### Atomic cross-cutting changes

A monorepo's strongest feature is one reviewed, tested commit that
changes a shared package and every consumer: rename a field in
`shared-types`, update `api-client`, the API, and the web app, and CI
proves they still compile and pass together. Large-scale refactors and
codemods depend on this.

The trap is assuming the deploy is atomic too. After the merge, the API
and the web app deploy separately, old web tabs keep running, desktop
and mobile users update over weeks, and published `api-client` versions
live in customers' lockfiles. So a cross-cutting change that alters a
wire format still needs the expand, migrate, contract sequence; the
monorepo only makes each step easier to review.

### Ownership with CODEOWNERS

`CODEOWNERS` maps directories to teams, and a branch rule that requires
code owner review makes each team approve changes to its area. The last
matching pattern wins, so a general owner goes first and specific
directories after it. Give the platform team ownership of
`.github/workflows/` and the build configuration, since a change there
affects every project.

### Dependency hygiene

- **Workspaces** (`pnpm-workspace.yaml`, or `workspaces` in `package.json`
  for npm and Yarn) define which directories are packages, and the
  `workspace:` protocol links them from source.
- **One version per external dependency.** Two versions of React in one
  app, or tests running against a different version than production, are
  classic monorepo bugs. pnpm **catalogs** define a version range once in
  `pnpm-workspace.yaml` and let packages reference it with `catalog:`, so
  an upgrade is one edit and package files stop conflicting in merges.
- **Group dependency updates** (Renovate or Dependabot groups) so one pull
  request upgrades a library everywhere, with affected detection testing
  every consumer.
- **Find duplicates** with `pnpm why <package>` and fix them before they
  reach production bundles.

## When to use and when not to use

| Situation | Approach |
|---|---|
| Several apps sharing a lot of code, one or a few teams | Monorepo with workspaces, affected detection, and remote caching |
| Independent services owned by separate teams with little shared code | Polyrepo, or a monorepo only if tooling investment is acceptable |
| Shared packages consumed only inside the repository | `workspace:*`, no versions |
| Packages published to npm | Changesets or release-please with SemVer and changelogs |
| Required checks in a monorepo | An always-running workflow with affected detection, not path filters |
| Per-app deploys | Per-app workflows calling a shared reusable workflow, or `turbo run deploy --affected` with the base set to the last successful deploy |
| Very large, polyglot codebases | Bazel or a similar build system with fine-grained targets and remote execution |

Avoid a monorepo without investing in affected detection and caching;
the first months feel fine, and then every pull request takes an hour.

## Practical examples

### The workspace, with a catalog

```yaml
# pnpm-workspace.yaml
packages:
  - "apps/*"
  - "packages/*"

catalog:
  react: ^19.2.0
  react-dom: ^19.2.0
  typescript: ^5.9.0
  vite: ^7.0.0
  vitest: ^3.2.0
```

```json
{
  "name": "@taskflow/web",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "vite build",
    "test": "vitest run",
    "lint": "eslint .",
    "deploy": "node ../../scripts/deploy-web.mjs"
  },
  "dependencies": {
    "@taskflow/api-client": "workspace:*",
    "@taskflow/ui": "workspace:*",
    "react": "catalog:",
    "react-dom": "catalog:"
  },
  "devDependencies": {
    "typescript": "catalog:",
    "vite": "catalog:",
    "vitest": "catalog:"
  }
}
```

The second file is `apps/web/package.json`. The `deploy` script is what
the deploy workflow below runs for every affected app that defines one;
`apps/desktop` deliberately has none, because it is released by its
train.

### Tasks, inputs, and a signed remote cache

```json
{
  "$schema": "https://turborepo.dev/schema.json",
  "globalDependencies": ["tsconfig.base.json"],
  "remoteCache": { "signature": true },
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "inputs": ["$TURBO_DEFAULT$", "!**/*.test.ts", "!**/*.md"],
      "outputs": ["dist/**"],
      "env": ["VITE_*", "APP_VERSION"]
    },
    "test": {
      "dependsOn": ["^build"],
      "outputs": []
    },
    "lint": {},
    "deploy": {
      "dependsOn": ["build", "test", "lint"],
      "cache": false
    }
  }
}
```

This is `turbo.json` at the repository root. `^build` builds internal
dependencies first; `inputs` keeps tests and docs out of the build hash,
so editing a test does not invalidate the bundle; `env` puts every
`VITE_*` variable into the hash; and `deploy` is never cached, because
its job is a side effect.

### CI that runs only affected tasks

```yaml
# .github/workflows/ci.yml: always runs, so required checks always report
name: ci
on:
  pull_request:

permissions:
  contents: read

jobs:
  affected:
    runs-on: ubuntu-latest
    env:
      TURBO_TOKEN: ${{ secrets.TURBO_TOKEN }}
      TURBO_TEAM: ${{ vars.TURBO_TEAM }}
      TURBO_REMOTE_CACHE_SIGNATURE_KEY: ${{ secrets.TURBO_REMOTE_CACHE_SIGNATURE_KEY }}
    steps:
      - uses: actions/checkout@v7
        with:
          fetch-depth: 0              # affected detection needs the base commit
          filter: blob:none
          persist-credentials: false
      - uses: pnpm/action-setup@v6    # pnpm version from "packageManager" in package.json
      - uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm turbo run lint test build --affected
        env:
          TURBO_SCM_BASE: ${{ github.event.pull_request.base.sha }}
```

A pull request that touches only `apps/web` runs web's three tasks; one
that touches `packages/shared-types` runs the affected projects from the
diagram; a re-run after a flaky failure restores every task that already
passed from the remote cache.

### Deploy every app changed since the last successful deploy

```yaml
# .github/workflows/deploy.yml
name: deploy
on:
  push:
    branches: [main]

permissions:
  contents: read

concurrency:
  group: deploy-production
  cancel-in-progress: false            # never cancel a deploy halfway

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production
    permissions:
      contents: read
      actions: read                    # read earlier runs of this workflow
      id-token: write                  # OIDC for the cloud deploy scripts
      packages: write
    env:
      TURBO_TOKEN: ${{ secrets.TURBO_TOKEN }}
      TURBO_TEAM: ${{ vars.TURBO_TEAM }}
      TURBO_REMOTE_CACHE_SIGNATURE_KEY: ${{ secrets.TURBO_REMOTE_CACHE_SIGNATURE_KEY }}
    steps:
      - uses: actions/checkout@v7
        with:
          fetch-depth: 0
          filter: blob:none
          persist-credentials: false
      - name: Find the commit of the last successful deploy
        id: base
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          sha=$(gh run list --workflow deploy.yml --branch main --status success \
                --limit 1 --json headSha --jq '.[0].headSha')
          # First deploy ever: compare with the root commit, so everything deploys
          echo "sha=${sha:-$(git rev-list --max-parents=0 HEAD | tail -n 1)}" >> "$GITHUB_OUTPUT"
      - uses: pnpm/action-setup@v6
      - uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - name: Build, test, and deploy every affected app
        env:
          TURBO_SCM_BASE: ${{ steps.base.outputs.sha }}
        run: pnpm turbo run deploy --affected
```

- The base is the last *successful* run of this workflow, so a failed
  deploy's changes are picked up again by the next run, as in the
  diagram above.
- `concurrency` serializes deploys, so two merges in quick succession
  cannot deploy out of order.
- One job holds credentials for every app. When apps need separate
  approvals or separate cloud roles, use one workflow per app instead,
  each calling a reusable deploy workflow.

### Version published packages with Changesets

```json
{
  "changelog": "@changesets/cli/changelog",
  "commit": false,
  "fixed": [],
  "linked": [["@taskflow/api-client", "@taskflow/shared-types"]],
  "access": "public",
  "baseBranch": "main",
  "updateInternalDependencies": "patch"
}
```

That is `.changeset/config.json`. A pull request that changes the client
adds a changeset file such as `.changeset/brave-tasks-sing.md`:

```text
---
"@taskflow/api-client": minor
"@taskflow/shared-types": minor
---

Add the `due` object to tasks. `dueDate` is deprecated and will be removed in 3.0.0.
```

```bash
# scripts/release-packages.sh: what the release pull request and its merge run
pnpm changeset version    # apply pending bumps, update CHANGELOG.md files and internal ranges
pnpm changeset publish    # publish changed packages; tags such as @taskflow/api-client@2.5.0
git push --follow-tags
```

`linked` keeps the two packages' versions aligned when both change,
without forcing a release of one when only the other changed (that would
be `fixed`). Apps are private packages and are not published; they get
their versions from the release process of each app.

### Ownership per directory

```text
# .github/CODEOWNERS: the last matching pattern wins
*                          @example/platform
/apps/api/                 @example/tasks-team
/apps/worker/              @example/tasks-team
/apps/web/                 @example/web-team
/apps/desktop/             @example/desktop-team
/packages/ui/              @example/web-team @example/desktop-team
/packages/shared-types/    @example/tasks-team
/packages/api-client/      @example/tasks-team
/.github/workflows/        @example/platform
/turbo.json                @example/platform
```

With "Require review from Code Owners" enabled, a change to `ui` needs one
approval from either team that owns it, and a change to the workflows or
the task configuration always reaches the platform team.

## Best practices

- Run CI on the affected set, not the whole repository, and keep a
  workflow that always runs for required checks.
- Use the merge base for pull requests and the last successful deploy as
  the base on `main`; check out enough history.
- Cache task results locally and remotely; let only CI write, sign the
  entries, and declare every input, including environment variables.
- Keep deploys per app: per-app workflows or an affected `deploy` task,
  never "deploy everything on every merge".
- Consume internal packages from source with `workspace:*`; version and
  changelog only what you publish.
- Keep one version of each external dependency with catalogs and grouped
  updates.
- Assign every directory an owner with `CODEOWNERS`, and give the
  platform team the build configuration.
- Treat atomic commits as a review tool, not a deploy guarantee; keep
  wire changes backward compatible.

## In production

- **Pull requests take an hour although most change one app.**
  *Detect:* CI duration grows month by month; logs show every package
  building on every push. *Cause:* no affected detection or remote
  caching. *Fix:* run tasks with `--affected` (or `nx affected`), add a
  remote cache, and track the cache hit rate.
- **A merged change never reached production.**
  *Detect:* the feature is on `main` but not live; the deploy log of the
  next run shows no affected apps. *Cause:* the deploy compared with
  `HEAD^1`, and the run for the change itself had failed. *Fix:* use the
  last successful deploy as the base, and alert when deploy runs fail.
- **Every package rebuilds on every push to `main`.**
  *Detect:* the affected set is always everything; the log notes that no
  base commit was found. *Cause:* a shallow checkout. *Fix:*
  `fetch-depth: 0` (with `filter: blob:none` for speed).
- **Production served a bundle pointing at the staging API.**
  *Detect:* the production web app calls the staging URL right after a
  deploy; the build log shows a cache hit. *Cause:* `VITE_API_URL` was not
  part of the task's hash, so the staging build was restored. *Fix:*
  declare `env` (for example `VITE_*`), invalidate the cache, and move
  per-environment values to runtime configuration.
- **A required check stays "Expected" forever on docs-only pull
  requests.**
  *Detect:* merging is blocked; the workflow never started. *Cause:* a
  `paths` filter skipped the workflow that provides a required check.
  *Fix:* make the required workflow always run and decide inside it what
  to test.
- **Two versions of React end up in the web bundle.**
  *Detect:* the bundle grows; hooks fail with errors about invalid hook
  calls. *Cause:* `ui` and `web` declared different React ranges. *Fix:*
  move React to the catalog, run `pnpm why react`, and add a duplicate
  check to CI.

## Important terminology

- **Monorepo:** one repository containing many projects.
- **Project graph:** the dependencies between projects in a workspace.
- **Affected projects:** projects changed by a commit range plus all
  their dependents.
- **Base and head:** the two commits whose difference defines what
  changed.
- **Task graph:** the order in which tasks must run, derived from task
  dependencies such as `^build`.
- **Task hash:** the cache key computed from a task's inputs.
- **Remote cache:** a shared store of task outputs and logs keyed by hash.
- **Workspace protocol:** `workspace:*`, a dependency on the in-repository
  version of a package.
- **Catalog:** a pnpm workspace feature that defines dependency versions
  once for all packages.
- **Fixed, linked, and independent versioning:** ways to relate the
  versions of published packages in one repository.
- **Changeset:** a file describing which packages a change bumps, and by
  how much.
- **CODEOWNERS:** a file mapping paths to the owners whose review is
  required.

## Common mistakes and misconceptions

- Believing a monorepo means one build and one deploy.
- Running every task on every pull request.
- Using `HEAD^1` as the deploy base.
- Shallow checkouts in jobs that compute affected projects.
- Letting every developer machine write to the remote cache, or not
  signing cache entries.
- Forgetting environment variables in task inputs.
- Path filters on required checks.
- Versioning internal-only packages, or not versioning published ones.
- Assuming a cross-cutting commit deploys atomically.

## Revision questions

1. What does "affected" mean, and how does a workspace tool compute it?
2. Why should the base for a deploy on `main` be the last successful
   deploy rather than `HEAD^1`? Describe the failure the wrong base
   causes.
3. Which inputs go into a task hash, and what happens when one is
   missing?
4. A repository has 40 tasks of 2 minutes each. With affected detection a
   typical pull request runs 9 of them, and the remote cache hits 6 of
   those 9. How many task-minutes does the pull request use? (`3 x 2 = 6`
   minutes, plus a few seconds per restore.)
5. Why are path filters a poor fit for required checks, and what do you
   use instead?
6. Compare fixed, linked, and independent versioning for published
   packages.
7. A pull request changes the API response and the web app together.
   Why must the change still be backward compatible?
8. What should `CODEOWNERS` assign to the platform team in a monorepo,
   and why?

## Further learning

- [Nx: Run only tasks affected by a change](https://nx.dev/docs/features/ci-features/affected)
- [Turborepo: run reference (`--affected`, `--filter`)](https://turborepo.dev/docs/reference/run)
- [Turborepo: Remote caching](https://turborepo.dev/docs/core-concepts/remote-caching)
- [Bazel: Remote caching](https://bazel.build/remote/caching)
- [pnpm: Catalogs](https://pnpm.io/catalogs)
- [Changesets: Linked packages](https://changesets.dev/guide/linked-packages) and
  [fixed packages](https://changesets.dev/guide/fixed-packages)
- [GitHub Docs: About code owners](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners)
- [Vercel: Using monorepos](https://vercel.com/docs/monorepos)
- Next: [release engineering interview questions and answers](interview-questions-and-answers.md). Back to the [release engineering overview](../release-engineering.md).
