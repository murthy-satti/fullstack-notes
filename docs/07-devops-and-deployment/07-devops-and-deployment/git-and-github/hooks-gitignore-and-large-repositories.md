# Hooks, .gitignore, and Large Repositories

A repository is more than its code. Hooks run checks automatically at
key moments, `.gitignore` keeps generated files and secrets out of
history, `.gitattributes` controls line endings, diffs, and binary
handling, Git LFS stores large files outside the normal object database,
and partial clones and sparse checkouts keep huge repositories usable.

This lesson covers client-side hooks and the tools that manage them
(husky, lint-staged, commitlint, and the pre-commit framework),
server-side enforcement, `.gitignore` patterns and precedence,
`.gitattributes`, Git LFS, shallow and partial clones, sparse-checkout,
and the trade-offs between monorepos and polyrepos.

## Why it matters

Most repository problems are preventable at the edges. A pre-commit
secret scan stops a leaked key before it exists in any history; a
correct `.gitignore` keeps `node_modules/` and `.env` out from day one; a
`.gitattributes` file ends the "every line changed" diffs between Windows
and macOS teammates; and Git LFS keeps a 300 MB design file from making
every clone slow forever. As repositories grow, the cost of a full clone
lands on every developer laptop and every CI job, many times a day, so
clone strategy becomes a real lever on CI time and cost.

## Real-world usage

- **Google's monorepo.** The paper
  [Why Google Stores Billions of Lines of Code in a Single Repository](https://research.google/pubs/why-google-stores-billions-of-lines-of-code-in-a-single-repository/)
  describes a single repository serving tens of thousands of developers,
  the custom tooling that makes it workable, and the trade-offs of the
  monorepo model compared with many separate repositories.
- **GitHub's clone guidance.** The GitHub blog post
  [Get up to speed with partial clone and shallow clone](https://github.blog/open-source/git/get-up-to-speed-with-partial-clone-and-shallow-clone/)
  recommends blobless clones (`--filter=blob:none`) for developers and
  build machines reused across builds, treeless clones for one-off builds
  that still need history, and shallow clones only for throwaway builds,
  strongly discouraging shallow clones for developers.
- **GitHub file size limits.** GitHub's
  [About large files on GitHub](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github)
  page states that Git warns above 50 MiB and GitHub blocks files larger
  than 100 MiB, which must be stored with Git LFS instead.
- **Git hooks.** The
  [githooks](https://git-scm.com/docs/githooks) reference documents every
  hook, when it runs, and which ones can abort an operation.

**Popular tools and providers:** husky, lint-staged, commitlint, the
pre-commit framework, gitleaks, Git LFS, Scalar (bundled with Git),
monorepo tools such as Nx, Turborepo, Bazel, and npm or pnpm workspaces.

## How it works

### Client-side hooks

Hooks are executable scripts in `.git/hooks/` (or in the directory set by
`core.hooksPath`) that Git runs at specific points. The `.git` directory
is not versioned, so teams use a tool that installs hooks from a
committed directory.

![Diagram: git commit runs pre-commit (lint, format, secret scan), prepare-commit-msg (template, ticket ID), commit-msg (commitlint), stores the commit, and runs post-commit; a non-zero exit from the first three aborts the commit and --no-verify skips pre-commit and commit-msg; git push runs pre-push (quick tests) on the developer's machine, then on the server pre-receive can reject the push, update runs once per ref, and post-receive triggers CI and webhooks; GitHub.com runs no custom server hooks, so enforcement uses rulesets, push protection, and required checks, while GitHub Enterprise Server supports pre-receive hooks.](git-hook-points.svg)

| Hook | Runs | Can abort? | Typical use |
|---|---|---|---|
| `pre-commit` | Before the commit message is requested | Yes | Lint and format staged files, scan for secrets |
| `prepare-commit-msg` | Before the editor opens | Yes | Insert a template or a ticket ID from the branch name |
| `commit-msg` | After the message is written | Yes | Validate the message format (commitlint) |
| `post-commit` | After the commit is created | No | Notifications |
| `post-checkout`, `post-merge` | After switching branches or merging | No | Remind to run `npm install` when the lockfile changed |
| `pre-push` | Before objects are sent | Yes | Fast tests, block pushes to `main` |

Hooks are **conveniences, not controls**. Anyone can skip them
(`git commit --no-verify`, `git push --no-verify`, or simply not
installing them), so every rule a hook enforces must also run in CI or on
the server. Keep them fast: a pre-commit hook that takes a minute will be
bypassed.

**husky** installs hooks for JavaScript projects: `npx husky init` creates
a `.husky/` directory with a `pre-commit` script and adds a `prepare`
script (`"prepare": "husky"`) so hooks are set up on `npm install`.
**lint-staged** runs commands only on the files staged for the commit,
which keeps the hook fast in large codebases. **commitlint** validates
commit messages against a convention such as Conventional Commits.

The **pre-commit framework** (pre-commit.com) does the same for any
language: a `.pre-commit-config.yaml` lists hook repositories pinned to
versions, and `pre-commit install` wires them into Git. It is common in
polyglot and Python-heavy repositories.

### Server-side checks

Server hooks run on the Git server and cannot be skipped by clients:
`pre-receive` (once per push, can reject everything), `update` (once per
ref), and `post-receive` (after the update, cannot reject). Self-hosted
Git servers and GitHub Enterprise Server support custom pre-receive
hooks. GitHub.com does not run custom server hooks; the equivalents are:

| Goal | GitHub.com mechanism |
|---|---|
| Block secrets in pushes | Secret scanning push protection |
| Block large files, certain paths, or extensions | Push rulesets (private and internal repositories) |
| Enforce commit message or author email patterns | Ruleset metadata restrictions |
| Require tests, lint, signatures, reviews before merge | Rulesets and required status checks |
| React to pushes | Webhooks and GitHub Actions `on: push` |

### .gitignore patterns and precedence

`.gitignore` lists paths Git should treat as untracked and not offer to
add. Pattern rules:

| Pattern | Matches |
|---|---|
| `node_modules/` | A directory named `node_modules` anywhere (trailing `/` means directories only) |
| `/dist` | `dist` only at the level of this `.gitignore` (leading `/` anchors) |
| `*.log` | Any file ending in `.log`, in any directory |
| `logs/*.log` | `.log` files directly inside `logs/` (a middle `/` also anchors) |
| `**/coverage` | `coverage` at any depth |
| `build/**` | Everything inside `build/` |
| `!.env.example` | Re-include a file excluded by an earlier pattern |
| `# comment` | A comment; use `\#` for a literal leading `#` |

Two rules surprise people:

- **A file cannot be re-included if a parent directory is excluded.**
  `logs/` followed by `!logs/keep.txt` does not work, because Git never
  looks inside an ignored directory. Use `logs/*` then `!logs/keep.txt`.
- **Ignore rules only affect untracked files.** Adding `.env` to
  `.gitignore` after committing it does nothing; untrack it with
  `git rm --cached .env` (and rotate anything it contained).

Git reads ignore rules from several sources. From highest to lowest
precedence:

1. Patterns given on the command line (for commands that accept them).
2. `.gitignore` files in the path's directory and its parents; a deeper
   file overrides a shallower one.
3. `.git/info/exclude`: personal, per-repository, not committed.
4. The file named by `core.excludesFile` (default
   `~/.config/git/ignore`): personal, for every repository.

Within one file, the last matching pattern wins. Put project artifacts
(`node_modules/`, `dist/`, `.env`) in the committed `.gitignore`, and
personal clutter (`.DS_Store`, editor folders) in your global ignore file.
`git check-ignore -v <path>` tells you exactly which rule matched.

### .gitattributes: line endings, binaries, and diffs

`.gitattributes` assigns attributes to paths, and unlike personal
configuration it is committed, so it applies to everyone.

**Line endings.** Windows uses CRLF and Linux and macOS use LF. Without
rules, editors and `core.autocrlf` settings fight, producing diffs where
every line changed and shell scripts that fail with `/bin/sh^M: bad
interpreter`. The robust fix is to declare it in the repository:

| Attribute | Effect |
|---|---|
| `* text=auto` | Git detects text files and stores them with LF in the repository |
| `*.sh text eol=lf` | Always check out with LF (scripts run in Linux containers) |
| `*.ps1 text eol=crlf` | Always check out with CRLF |
| `*.png binary` | Never convert or diff as text (`binary` = `-text -diff -merge`) |
| `package-lock.json linguist-generated=true` | Collapse in GitHub diffs, exclude from language statistics |
| `vendor/** linguist-vendored` | Treat as third-party code in GitHub statistics |
| `docs/internal/** export-ignore` | Leave out of `git archive` tarballs |
| `*.psd filter=lfs diff=lfs merge=lfs -text` | Store with Git LFS (written by `git lfs track`) |

After adding or changing `.gitattributes`, run `git add --renormalize .`
and commit, so existing files are stored with the new rules.

### Git LFS

Git keeps every version of every file forever, and binary files do not
delta-compress well, so ten versions of a 200 MB video cost roughly 2 GB
in every clone. **Git LFS** (Large File Storage) replaces such files in
Git with small text **pointer files**, and stores the real content on an
LFS server (GitHub provides one):

```text
version https://git-lfs.github.com/spec/v1
oid sha256:4d7a214614ab2935c943f9e0ff69d22eadbb8f32b1258daaa5e2ca24d17e2393
size 12345
```

Git LFS hooks into Git with a clean/smudge filter: on `git add` the file
is copied into the local LFS cache and the pointer is staged, and
`git push` uploads the content to the LFS server; on checkout the pointer
is replaced with the real file, downloaded on demand for the commit you
check out. Clones therefore only download the large files of the
checked-out version. LFS storage and bandwidth are billed or limited
by the hosting plan, and LFS supports file locking (`git lfs lock`) for
unmergeable files such as design documents.

### Large repositories: shallow, partial, and sparse

When a repository has years of history or a huge tree, three independent
techniques reduce what you download and what you check out.

![Diagram: four panels each showing four commits with their trees and blobs; a full clone downloads every commit, tree, and blob; a blobless clone with --filter=blob:none downloads all commits and trees and only the newest blobs, fetching older blobs on demand, best for developers and reused CI; a treeless clone with --filter=tree:0 downloads all commits but only the newest tree and blobs, best for one-off builds that need history; a shallow clone with --depth=1 downloads only the newest commit with its tree and blobs and has no older history, for throwaway CI only.](partial-clone-vs-full-clone.svg)

| Technique | Command | What you lose | Best for |
|---|---|---|---|
| Shallow clone | `git clone --depth 1` | History beyond the depth; some commands (merge-base, blame, describe) misbehave | Throwaway CI builds |
| Blobless partial clone | `git clone --filter=blob:none` | Nothing; old file contents download on demand | Developers, long-lived CI machines |
| Treeless partial clone | `git clone --filter=tree:0` | Nothing; but `git log -- path` and blame trigger many fetches | One-off builds that need commit history |
| Sparse-checkout | `git sparse-checkout set <dirs>` | Files outside the chosen directories are not in the working tree | Monorepos where you work on a few directories |

Partial clone needs server support; GitHub, GitLab, and modern Git
servers provide it. Sparse-checkout in **cone mode** (the default) takes
a list of directories, which keeps it fast; combined with a blobless
clone, Git downloads only the blobs for the directories you check out.
**Scalar**, shipped with Git, configures all of this (partial clone,
sparse-checkout, file system monitor, background maintenance) in one
command for very large repositories.

Other settings that help large repositories:

```bash
git config core.fsmonitor true        # built-in file system monitor (Windows, macOS)
git config core.untrackedCache true   # cache untracked-file scans
git maintenance start                 # background prefetch, commit-graph, repack
```

### Monorepos versus polyrepos

| | Monorepo (one repository, many projects) | Polyrepo (one repository per project) |
|---|---|---|
| Cross-project changes | One atomic commit and PR | Coordinated PRs and releases across repositories |
| Dependency versions | Usually one version of each shared dependency | Each repository chooses; drift is common |
| Code sharing and refactoring | Easy; refactor callers in the same change | Requires publishing packages and upgrading consumers |
| CI | Needs path filters, affected-project detection, and caching to stay fast | Simple per-repository pipelines |
| Ownership and access | CODEOWNERS per directory; access control is coarser | Natural boundaries and per-repository permissions |
| Tooling needs | Workspaces, build tools such as Nx, Turborepo, or Bazel; partial and sparse clones at scale | Standard tooling per repository |
| Scale limits | Git performance must be managed as it grows | Each repository stays small |

Neither is universally better. Monorepos fit teams that share a lot of
code and change it together (for example, TaskFlow API, TaskFlow Web, and
a shared validation package); polyrepos fit independent services owned by
separate teams with separate release cycles.

## When to use and when not to use

| Tool | Use when | Avoid when |
|---|---|---|
| Pre-commit hooks (husky, pre-commit) | Fast checks that save a CI round trip: format, lint changed files, secret scan | Slow suites (full tests belong in CI), or as the only enforcement |
| commit-msg linting | Automation reads commit messages (release tooling) | You squash-merge and lint PR titles instead |
| Global ignore file | Personal OS and editor clutter | Project build output (belongs in the committed `.gitignore`) |
| `.gitattributes` line endings | Mixed Windows and Unix teams, shell scripts in containers | Never skip it on cross-platform teams |
| Git LFS | Large binaries that change: media, design files, datasets | Build artifacts (use CI artifacts and registries), huge datasets (object storage) |
| Shallow clone | Single-use CI jobs that need only the latest snapshot | Developer machines; jobs needing tags or history |
| Blobless clone | Large-history repositories for developers and reused CI | Offline work needing all history locally |
| Sparse-checkout | Large monorepos | Small repositories (adds confusion) |

## Practical examples

### husky, lint-staged, and commitlint for TaskFlow API

```bash
npm install --save-dev husky lint-staged @commitlint/cli @commitlint/config-conventional
npx husky init                         # creates .husky/pre-commit and the prepare script
```

```json
{
  "name": "taskflow-api",
  "type": "module",
  "scripts": {
    "prepare": "husky",
    "lint": "eslint .",
    "test": "node --test"
  },
  "lint-staged": {
    "*.{js,mjs,cjs}": ["eslint --fix", "prettier --write"],
    "*.{json,md,yml,yaml}": "prettier --write"
  }
}
```

```bash
# .husky/pre-commit
npx lint-staged
```

```bash
# .husky/commit-msg
npx --no -- commitlint --edit "$1"
```

```js
// commitlint.config.js
export default { extends: ["@commitlint/config-conventional"] };
```

Now `git commit -m "update stuff"` fails with `type may not be empty`,
while `git commit -m "fix(tasks): reject an empty title"` passes, and
only the staged JavaScript files are linted and formatted. In CI and
Docker builds, set `HUSKY=0` so the `prepare` script does not try to
install hooks; when installing production dependencies only, husky is not
present, so use `"prepare": "husky || true"` or skip `prepare` there.

### The pre-commit framework with a secret scanner

```yaml
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/pre-commit/pre-commit-hooks
    rev: v6.0.0
    hooks:
      - id: trailing-whitespace
      - id: end-of-file-fixer
      - id: check-merge-conflict      # blocks committed conflict markers
      - id: check-added-large-files   # default limit 500 KB
        args: ["--maxkb=1024"]
  - repo: https://github.com/gitleaks/gitleaks
    rev: v8.30.1
    hooks:
      - id: gitleaks
```

```bash
pipx install pre-commit        # or pip install pre-commit
pre-commit install             # writes .git/hooks/pre-commit
pre-commit run --all-files     # run once over the whole repository (also in CI)
pre-commit autoupdate          # bump the pinned revs
```

### A .gitignore for TaskFlow API

```text
# .gitignore
# Dependencies and build output
node_modules/
dist/
coverage/

# Environment files: keep secrets out, keep the template in
.env
.env.*
!.env.example

# Logs and runtime files
*.log
logs/*
!logs/.gitkeep
*.pid

# Local tooling
.cache/
.eslintcache
```

```bash
git check-ignore -v .env.local
# .gitignore:9:.env.*    .env.local
git rm --cached .env           # if it was committed before the rule existed
```

Personal clutter goes in `~/.config/git/ignore` (`.DS_Store`,
`Thumbs.db`, `.idea/`), not in the project file.

### A .gitattributes for a cross-platform team

```text
# .gitattributes
* text=auto

# Scripts that run in Linux containers must keep LF
*.sh   text eol=lf
Dockerfile text eol=lf

# Windows-only scripts
*.ps1  text eol=crlf
*.cmd  text eol=crlf

# Binary assets: no line-ending conversion, no text diff
*.png  binary
*.jpg  binary
*.pdf  binary

# Generated files: collapsed in GitHub diffs
package-lock.json linguist-generated=true
```

```bash
git add --renormalize .
git commit -m "chore: normalize line endings"
```

### Git LFS for TaskFlow Web design assets

```bash
git lfs install                          # once per machine
git lfs track "design/**/*.fig" "*.mp4"  # adds lines to .gitattributes
git add .gitattributes design/onboarding.fig
git commit -m "chore: store design files in LFS"
git lfs ls-files                         # what is stored in LFS

# Move existing large files out of history (rewrites history: coordinate first)
git lfs migrate import --include="*.mp4" --everything
```

### Faster CI checkouts

```yaml
# .github/workflows/ci.yml (checkout step variants)
- uses: actions/checkout@v7          # default: shallow, fetch-depth 1
- uses: actions/checkout@v7
  with:
    fetch-depth: 0                   # full history and tags (versioning, changelogs)
- uses: actions/checkout@v7
  with:
    filter: blob:none                # partial clone
    fetch-depth: 0                   # full history without all blobs
- uses: actions/checkout@v7
  with:
    sparse-checkout: |               # monorepo: only what this job builds
      apps/api
      packages/shared
```

### Working in a large monorepo

```bash
git clone --filter=blob:none --sparse git@github.com:example/taskflow.git
cd taskflow
git sparse-checkout set apps/api packages/shared   # cone mode: directories
git sparse-checkout list
git sparse-checkout add apps/web                   # widen later
```

## Best practices

- Commit a `.gitignore` and `.gitattributes` in the very first commit.
- Never commit `.env`; commit a `.env.example` with placeholders.
- Keep hooks fast (seconds) and run the same checks in CI, because hooks
  can be skipped.
- Install hooks automatically (husky's `prepare` script, `pre-commit
  install` in onboarding docs) and pin hook versions.
- Scan for secrets both before commit (gitleaks) and on the server (push
  protection).
- Put large binaries in Git LFS before they enter history; migrating later
  rewrites history.
- Use blobless clones for developers and shallow or filtered checkouts in
  CI; avoid shallow clones for daily work.
- In monorepos, combine CODEOWNERS, path-filtered CI, and sparse-checkout.

## In production

- **Every line of a file shows as changed in a PR.**
  *Detect:* `git diff --stat` shows whole-file changes; `git ls-files
  --eol` reports mixed `crlf`/`lf`. *Cause:* line endings converted by
  one developer's editor or `core.autocrlf` setting. *Fix:* add
  `.gitattributes` with `* text=auto` and explicit `eol` rules, run
  `git add --renormalize .`, and commit once.
- **A container fails with `/bin/sh^M: bad interpreter`.**
  *Detect:* the entrypoint script fails only in images built on Windows
  machines. *Cause:* the script was checked out with CRLF and copied into
  the image. *Fix:* `*.sh text eol=lf` in `.gitattributes`, renormalize,
  and rebuild.
- **`git push` is rejected because a file exceeds 100 MiB.**
  *Detect:* `remote: error: File ... exceeds GitHub's file size limit of
  100.00 MB`. *Cause:* a large binary in one of the commits being pushed,
  even if a later commit deletes it. *Fix:* remove it from the unpushed
  commits (`git reset` or `git lfs migrate import` on unpushed history),
  track the type with LFS, and push again.
- **CI checkout takes minutes and dominates pipeline time.**
  *Detect:* the checkout step is the slowest step; `size-pack` is
  several GB. *Cause:* full clones of a large history on every job.
  *Fix:* default shallow checkout where history is not needed,
  `filter: blob:none` where it is, sparse-checkout for monorepo jobs, and
  remove big blobs from history if appropriate.
- **Hooks silently stop running for some developers.**
  *Detect:* commits with unformatted code or bad messages reach PRs.
  *Cause:* hooks were not installed (`npm install` skipped, `core.hooksPath`
  changed) or bypassed with `--no-verify`. *Fix:* enforce the same checks
  in CI as required status checks; treat hooks as fast feedback only.
- **`.env` is ignored, but secrets still reached GitHub.**
  *Detect:* secret scanning alerts on `.env`. *Cause:* the file was
  tracked before it was added to `.gitignore`. *Fix:* rotate the
  secrets, `git rm --cached .env`, and follow the history clean-up in
  [undoing mistakes and recovery](undoing-mistakes-and-recovery.md).

## Important terminology

- **Git hook:** A script Git runs at a specific point, such as before a
  commit.
- **Client-side hook:** A hook in a developer's clone; it can be skipped.
- **Server-side hook:** A hook on the Git server (`pre-receive`,
  `update`, `post-receive`); clients cannot skip it.
- **husky / lint-staged / commitlint:** Tools to install hooks, run tasks
  on staged files, and validate commit messages.
- **pre-commit framework:** A language-agnostic hook manager configured
  by `.pre-commit-config.yaml`.
- **`.gitignore`:** Patterns for untracked files Git should ignore.
- **`core.excludesFile`:** A personal, global ignore file.
- **`.gitattributes`:** Per-path attributes for line endings, diffs,
  merges, LFS, and GitHub Linguist.
- **Git LFS:** An extension storing large files outside Git, referenced
  by pointer files.
- **Shallow clone:** A clone with truncated history.
- **Partial clone:** A clone that omits some objects (blobs or trees) and
  fetches them on demand.
- **Sparse-checkout:** Checking out only part of the tree.
- **Monorepo / polyrepo:** One repository for many projects versus one per
  project.

## Common mistakes and misconceptions

- Believing hooks enforce policy. They are skippable; enforcement lives in
  CI and server rules.
- Adding a file to `.gitignore` and expecting Git to stop tracking it.
- Trying to re-include a file inside an ignored directory.
- Relying on each developer's `core.autocrlf` instead of
  `.gitattributes`.
- Committing large binaries "temporarily"; history keeps them forever.
- Using `--depth 1` clones for development and then fighting missing
  history.
- Choosing a monorepo without investing in path-filtered CI and build
  caching.
- Long-running pre-commit hooks that run the whole test suite.

## Revision questions

1. Which hooks can abort a commit, and why must their checks also run in
   CI?
2. Why does `logs/` followed by `!logs/keep.txt` fail to re-include the
   file, and what pattern works?
3. List the sources of ignore rules from highest to lowest precedence.
4. What problem does `* text=auto` solve, and when do you also need
   `eol=lf`?
5. A repository stores 40 versions of a 150 MB video. Roughly how much
   does every full clone download with plain Git, and with Git LFS when
   checking out the latest version? (About 6 GB, compressed only slightly
   by Git; about 150 MB of LFS content plus small pointer files.)
6. Compare shallow, blobless, and treeless clones, and say where each
   fits.
7. How do GitHub.com repositories get server-side enforcement without
   custom pre-receive hooks?
8. Give two advantages and two costs of a monorepo.

## Further learning

- [Git reference: githooks](https://git-scm.com/docs/githooks)
- [Git reference: gitignore](https://git-scm.com/docs/gitignore) and
  [gitattributes](https://git-scm.com/docs/gitattributes)
- [GitHub Docs: Configuring Git to handle line endings](https://docs.github.com/en/get-started/git-basics/configuring-git-to-handle-line-endings)
- [husky](https://typicode.github.io/husky/get-started.html),
  [lint-staged](https://github.com/lint-staged/lint-staged), and
  [commitlint](https://commitlint.js.org/guides/getting-started.html)
- [pre-commit framework](https://pre-commit.com/)
- [Git LFS](https://git-lfs.com/)
- [Git reference: partial clone](https://git-scm.com/docs/partial-clone),
  [git sparse-checkout](https://git-scm.com/docs/git-sparse-checkout), and
  [Scalar](https://git-scm.com/docs/scalar)
- Next: [Git and GitHub interview questions and answers](interview-questions-and-answers.md). Back to the
  [Git and GitHub overview](../git-and-github.md).
