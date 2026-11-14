# Git and GitHub Interview Questions and Answers

These questions review Git internals, branching, merging and rebasing,
branching strategies, pull requests and code review, versioning and
releases, recovery, and repository hygiene at scale. Try answering each
one before reading the answer.

## Fundamentals and internals

### 1. Does Git store diffs or snapshots?

Snapshots. Each commit points to a tree describing the whole project at
that moment. Unchanged files are not duplicated, because identical
content has the same hash and is stored once; packfiles later
delta-compress similar objects. Diffs are computed on demand by comparing
two snapshots.

### 2. What are Git's four object types?

Blobs (file content), trees (directory listings of mode, type, hash, and
name), commits (a root tree, parent commits, author, committer, and
message), and annotated tags (a named, signed or described pointer to
another object). Everything in `.git/objects` is one of these.

### 3. What does content addressing mean in Git, and what does it give you?

An object's name is the hash of its type, size, and content
(`blob 6\0hello\n` for a 6-byte file). This gives deduplication,
integrity checking (a corrupted object no longer matches its name), and
tamper evidence: a commit hash covers its tree and parents, so changing
history changes every later hash.

### 4. What is the status of SHA-256 in Git?

Git supports SHA-256 repositories (`git init --object-format=sha256`)
since 2.29, and the format is no longer labelled experimental. SHA-1 and
SHA-256 repositories cannot yet interoperate, and hosting support varies.
Git's published plans make SHA-256 the default for new repositories in
Git 3.0. SHA-1 in Git already uses collision detection against the known
attacks.

### 5. What is a branch, technically?

A ref under `refs/heads/` that stores one commit hash. Committing moves
the branch to the new commit. Creating a branch writes one small ref,
which is why branching is instant and cheap.

### 6. What is HEAD, and what is a detached HEAD?

`HEAD` records what is checked out, normally as a symbolic ref such as
`ref: refs/heads/main`. Detached HEAD means it holds a commit hash
directly, which happens when you check out a tag or commit. Commits made
there belong to no branch; create one with `git switch -c <name>` before
switching away, or recover them from the reflog later.

### 7. What is the index (staging area) for?

It is the proposed next commit: a file listing each tracked path with its
mode and blob hash plus cached file metadata. `git commit` builds trees
from the index, not from the working tree. It lets you commit exactly the
changes you choose (`git add -p`) and speeds up `git status`. During a
conflict it holds stages 1, 2, and 3 for the base, ours, and theirs.

### 8. What is the difference between `git fetch` and `git pull`?

`fetch` downloads new objects and updates remote-tracking branches such as
`origin/main`; your branches and files do not change. `pull` is fetch
followed by integrating the upstream into the current branch, by merge
(default) or rebase (`--rebase` or `pull.rebase=true`). Since recent Git
versions, a pull with diverged branches and no configured preference
stops and asks you to choose.

### 9. What are remote-tracking branches and upstreams?

Remote-tracking branches (`refs/remotes/origin/*`) record where the
remote's branches were at the last fetch, as set by the refspec
`+refs/heads/*:refs/remotes/origin/*`. An upstream is the remote-tracking
branch a local branch follows, which enables ahead/behind counts and
argument-less push and pull.

### 10. What are packfiles, and when are unreachable commits deleted?

Packfiles store many objects compressed together, often as deltas, with
an index for lookup; `git gc` creates them from loose objects. Unreachable
objects are pruned only after a grace period (two weeks by default), and
reflog entries keep commits reachable for 90 days (30 for entries no
longer reachable from the ref), which is what makes recovery possible.

## Branching, merging, and rebasing

### 11. What is the difference between a fast-forward and a three-way merge?

A fast-forward happens when the current branch has not moved since the
other branch started: Git just moves the pointer, and no commit is
created. Otherwise Git finds the merge base, compares base, ours, and
theirs, and records a merge commit with two parents. `--ff-only` forbids
merge commits; `--no-ff` always creates one.

### 12. How does Git decide what conflicts in a three-way merge?

For each region, if only one side changed it relative to the merge base,
that side wins; if both changed it identically, the change is taken once;
if both changed it differently, it is a conflict. The default strategy
since Git 2.34 is `ort`.

### 13. How do you resolve a merge conflict?

Inspect with `git status` and the conflict markers (use
`merge.conflictStyle=zdiff3` to see the base), edit to the correct final
content, run the tests, `git add` the files, then `git commit` or
`git rebase --continue`. `--abort` returns to the start. `git mergetool`
opens a three-way tool, and `rerere` remembers resolutions.

### 14. What happens during a rebase?

Git finds your commits not in the new base, saves the old tip as
`ORIG_HEAD`, checks out the new base, and replays each commit as a new
commit with a new parent and therefore a new hash, then moves the branch.
Conflicts are resolved commit by commit. Commits whose patches already
exist upstream are skipped.

### 15. What is the golden rule of rebasing, and why?

Do not rebase commits that others may have based work on. Rebasing
abandons the original commits; collaborators who have them get diverged
history, duplicate commits with different hashes, and repeated conflicts.
Rebase your own branches freely and push with `--force-with-lease`.

### 16. What can you do with interactive rebase?

Reorder, reword, edit, squash, fixup, drop, or run commands (`exec`)
between commits before sharing them. `git commit --fixup=<sha>` with
`git rebase -i --autosquash` places fix commits under their targets
automatically. `--exec "npm test"` verifies each commit builds.

### 17. Compare merge commit, squash and merge, and rebase and merge for pull requests.

Merge commit keeps all branch commits plus a two-parent merge commit
(non-linear, original hashes). Squash creates one new commit per PR
(linear, easy single-commit revert, coarse bisect). Rebase-merge copies
each commit onto the base (linear, fine-grained, new hashes, needs clean
commits). Pick one per repository and enforce it.

### 18. What is the difference between `-X ours` and `-s ours`?

`-X ours` is a strategy option: merge normally but resolve conflicting
hunks in favor of the current branch. `-s ours` is a strategy that
records a merge while keeping the current tree entirely, discarding all
of the other branch's changes.

### 19. When do you use `git cherry-pick`, and why `-x`?

To apply specific commits elsewhere, typically backporting a fix from
`main` to a release branch. `-x` appends "(cherry picked from commit
...)" so the origin is traceable. Routine cherry-picking between
long-lived branches signals a branching problem.

### 20. What does `git rebase --onto` do?

`git rebase --onto <newbase> <upstream> <branch>` moves the commits in
`<branch>` that are not in `<upstream>` onto `<newbase>`. It is used to
move a stacked branch onto `main` after its base branch was squash-merged.

## Branching strategies

### 21. What is trunk-based development?

Everyone integrates small changes into one shared trunk (`main`) at least
daily, through direct commits or very short-lived branches, with CI on
every change and a stop-the-line rule for a red build. Unfinished work
hides behind feature flags or branch by abstraction. DORA associates it
with three or fewer active branches, daily merges, and no code freezes.

### 22. What is GitHub flow?

A branch per change, a pull request, CI and review, merge into `main`,
deploy, and delete the branch. The rule is that `main` is always
deployable. With short branches it converges with trunk-based development.

### 23. Describe GitFlow and why many teams moved away from it.

GitFlow has long-lived `main` and `develop`, plus `feature/*`,
`release/*`, and `hotfix/*` branches; release and hotfix branches merge
into both `main` and `develop`. It delays integration, multiplies merges
(forgotten merge-backs lose fixes), and fights continuous delivery. Its
author's 2020 note recommends simpler flows for continuously delivered
web apps and keeps GitFlow for explicitly versioned software.

### 24. When do you need release branches?

When several versions are supported at once or releases need a stable
line: mobile and desktop apps, on-premises products, SDKs with LTS
versions. Cut `release/x.y` from a green `main`, ship tags from it, and
backport fixes from `main` with `cherry-pick -x` (upstream first).

### 25. Why are environment branches (dev, staging, prod) an anti-pattern?

They drift through partial merges and hotfixes, so what was tested is not
what ships; each branch rebuilds its own artifact; and environment
differences become code differences. Build once from `main` and promote
the same artifact with per-environment configuration.

### 26. What are feature flags, and what do they cost?

Runtime switches that turn code paths on or off without a deploy, letting
unfinished features merge dark and roll out gradually. They add code
paths to test, configuration to manage, and cleanup work; each flag needs
an owner and a removal date.

### 27. How does the branching strategy affect DORA metrics?

Waiting on long-lived branches adds directly to change lead time,
batching caps deployment frequency, large merges raise change fail rate,
and a special hotfix path slows recovery. Small batches into trunk improve
all four, and DORA's fifth metric, deployment rework rate, as well.

## Pull requests and code review

### 28. What makes a good pull request?

Small and focused (Google's guidance: about 100 lines is reasonable,
1,000 is usually too large), a description of what and why, how to test,
and the risks, linked to an issue, with mechanical checks automated so
reviewers can focus on correctness and design.

### 29. What is CODEOWNERS, and how is it evaluated?

A file in `.github/`, the root, or `docs/` mapping path patterns to
owners. The last matching pattern wins. Owners are requested
automatically, and with "require review from Code Owners" one of them
must approve. Owners need write access; `CODEOWNERS` and workflows should
themselves be owned.

### 30. How do rulesets differ from branch protection rules?

Many rulesets can apply to a branch and their rules are aggregated (most
restrictive wins), they can target tags and pushes, have enforcement
status and explicit bypass lists, are visible to anyone with read access,
and can be defined at the organization level on eligible plans. Only one
branch protection rule applies per branch. Both can coexist.

### 31. What does "require branches to be up to date" do, and what is its cost?

It requires the PR to contain the latest base before merging, so CI
tested the combination. Without it, two green PRs can break `main`
together. The cost is constant rebasing and re-running CI as other PRs
merge; a merge queue solves that at scale.

### 32. How does a merge queue work?

Approved PRs join a queue; for each, GitHub builds a temporary branch
with the latest base, the PRs ahead of it, and the PR, runs required
checks (workflows must handle `merge_group`), and merges passing PRs in
order. A failing PR is removed and the groups behind it are rebuilt.

### 33. Why might a required check never report?

The workflow was skipped by a `paths` or branch filter (a skipped
workflow leaves the check pending, unlike a job skipped by `if:`, which
reports success), the job was renamed, or the workflow lacks the
`merge_group` trigger when a merge queue is used.

### 34. What review settings prevent sneaking in unreviewed code?

Required approvals, dismiss stale approvals on push, require approval of
the most recent reviewable push, require code owner review (including for
`CODEOWNERS` and `.github/workflows/`), require conversation resolution,
and no bypass for administrators.

### 35. What are stacked pull requests?

Dependent PRs where each targets the previous PR's branch so each diff
stays small. GitHub retargets a PR to `main` when its base branch is
deleted after merging; after a squash merge, the upper branch needs
`git rebase --onto`. `git rebase --update-refs` keeps a local stack in
sync.

## Versioning, tags, and releases

### 36. Explain Semantic Versioning.

MAJOR.MINOR.PATCH: increment MAJOR for incompatible API changes, MINOR
for backward-compatible features, PATCH for backward-compatible fixes,
resetting lower parts. `0.y.z` means the API is not yet stable. Released
versions are immutable. Pre-releases (`-rc.1`) sort before the release;
build metadata (`+sha.1a2b3c4`) is ignored for precedence.

### 37. How do `^` and `~` ranges in npm relate to SemVer?

`^2.4.1` allows `>=2.4.1 <3.0.0` (compatible minors and patches); `~2.4.1`
allows `>=2.4.1 <2.5.0` (patches). For `0.x` versions the caret treats
the minor as breaking (`^0.4.1` is `<0.5.0`). A breaking change shipped as
a minor therefore reaches every consumer automatically.

### 38. What is the difference between lightweight, annotated, and signed tags?

A lightweight tag is just a ref to a commit. An annotated tag is an object
with tagger, date, and message. A signed tag is an annotated tag with a
GPG, SSH, or X.509 signature. Releases should use annotated or signed
tags; `git describe` and `push --follow-tags` consider annotated tags by
default.

### 39. What are Conventional Commits?

A message format `type(scope)!: description` with optional body and
footers. `fix` maps to a patch, `feat` to a minor, and `!` or a
`BREAKING CHANGE:` footer to a major. Tools use it to compute versions,
generate changelogs, and write release notes.

### 40. How do release-please and semantic-release differ?

release-please maintains a Release PR with the version bump and changelog;
merging it creates the tag and GitHub Release, so a human decides when.
semantic-release runs in CI on each push to a release branch and, if
commits warrant it, tags, creates the release, and publishes in one run.
semantic-release needs full history (`fetch-depth: 0`).

### 41. Why might a workflow triggered by tags not run after a bot created the tag?

Events created with the default `GITHUB_TOKEN` do not trigger new
workflow runs, to prevent recursion. Run the publish job in the same
workflow, or use a GitHub App or fine-grained token for the bot.

### 42. How do you make a deployed artifact traceable to its source?

Stamp the version and commit SHA at build time: image tags plus OCI labels
(`org.opencontainers.image.version`, `.revision`), a `/version` endpoint,
and the release field in logs and error tracking. Never rebuild the same
version; promote one artifact by digest.

## Undoing mistakes and recovery

### 43. Compare `git reset --soft`, `--mixed`, and `--hard`.

All move the branch and HEAD. `--soft` keeps the index and working tree,
so the undone changes are staged. `--mixed` (default) resets the index,
leaving changes as unstaged edits. `--hard` resets the index and working
tree, discarding changes; uncommitted edits are lost permanently.

### 44. When do you use `git revert` instead of `git reset`?

When the commit is on a shared branch. Revert adds a new commit with the
inverse change, preserving history for everyone; reset rewrites history
and breaks collaborators' clones.

### 45. How do you revert a merge commit, and what is the catch?

`git revert -m 1 <merge>` undoes the changes relative to the first parent
(the mainline). The branch's commits still count as merged, so re-merging
the fixed branch brings only new commits; you must revert the revert
first.

### 46. How do you recover commits after a bad reset or rebase?

`git reflog` shows every previous position of HEAD and branches; find the
hash and run `git reset --hard <sha>` or `git branch rescue <sha>`.
Immediately after a reset or rebase, `ORIG_HEAD` points at the old tip.
Never-committed changes cannot be recovered this way.

### 47. How does `git bisect` work, and how many steps does it take?

Binary search between a known good and a known bad commit: test the
midpoint, mark it, and halve the range. It needs about log2(N) tests:
4 for 16 commits, about 10 for 1,000. `git bisect run <script>` automates
it, with exit code 0 good, 1-127 bad (except 125), and 125 skip.

### 48. What is the difference between `--force` and `--force-with-lease`?

`--force` overwrites the remote branch unconditionally, deleting anyone
else's pushed commits. `--force-with-lease` fails if the remote moved
since your last fetch; adding `--force-if-includes` also protects against
background fetches that updated your remote-tracking ref.

### 49. A secret was pushed. What do you do, in order?

Revoke or rotate it immediately, check provider logs for misuse, then, if
needed, rewrite history with `git filter-repo --sensitive-data-removal`,
force push, ask GitHub Support to clean PR refs and caches, have
collaborators re-clone, and enable secret scanning push protection and a
pre-commit scanner. Deleting the file in a new commit is not enough.

### 50. How do you recover a deleted branch?

Use the hash printed by `git branch -D` or find it in `git reflog`, then
`git branch <name> <sha>`. On GitHub, the pull request page offers
"Restore branch". Another clone that still has the branch can push it
back.

## Hooks, .gitignore, and large repositories

### 51. Why are client-side hooks not a security control?

They live in each clone, must be installed, and can be skipped with
`--no-verify`. Use them for fast feedback and enforce the same rules in
CI, rulesets, and push protection.

### 52. What do husky, lint-staged, and commitlint do?

husky installs Git hooks from a committed `.husky/` directory via the
`prepare` script; lint-staged runs linters and formatters only on staged
files; commitlint validates commit messages, typically in the
`commit-msg` hook.

### 53. Why does adding `.env` to `.gitignore` not stop Git from tracking it?

Ignore rules apply only to untracked files. Untrack it with `git rm
--cached .env`, commit, and rotate any secrets it held, because they
remain in history.

### 54. What does `.gitattributes` solve that `core.autocrlf` does not?

It is committed, so line-ending rules apply to everyone regardless of
personal settings (`* text=auto`, `*.sh text eol=lf`). It also marks
binaries, controls diffs and merges, configures LFS, and sets GitHub
Linguist attributes.

### 55. When should you use Git LFS?

For large binaries that change over time (media, design files, models of
modest size): Git stores small pointers and LFS stores the content, so
clones download only the versions they check out. GitHub blocks files
over 100 MiB without LFS. Build artifacts belong in CI artifacts or
registries instead.

### 56. Compare shallow, blobless, and treeless clones, and sparse-checkout.

Shallow (`--depth 1`) truncates history: for throwaway CI only.
Blobless (`--filter=blob:none`) has all commits and trees and fetches
file contents on demand: best for developers. Treeless (`--filter=tree:0`)
also fetches trees on demand: for one-off builds needing history.
Sparse-checkout limits the working tree to chosen directories, typically
combined with a blobless clone in monorepos.

## Scenario-based questions

### 57. A developer ran `git reset --hard HEAD~3` on their feature branch and wants the commits back. What do you do?

**What to check first:** `git reflog` for the entry just before the
reset.

**How to confirm:** `git show <sha>` on that entry shows the latest of
the lost commits; `git log <sha>` shows all three.

**Likely causes and fixes:** a reset that went too far. Run
`git reset --hard ORIG_HEAD` (if nothing moved since) or `git reset
--hard <sha>`; uncommitted edits at the time are not recoverable. See
[undoing mistakes and recovery](undoing-mistakes-and-recovery.md).

### 58. After a teammate pushed, your `git push` is rejected as non-fast-forward. What do you do?

**What to check first:** `git fetch` then `git status` (ahead/behind
counts).

**How to confirm:** `git log --oneline HEAD..origin/<branch>` shows their
commits.

**Likely causes and fixes:** the branches diverged. Rebase or merge onto
`origin/<branch>`, run tests, and push. Do not force push a shared branch.
See [Git fundamentals and internals](git-fundamentals-and-internals.md).

### 59. Everyone on the team gets duplicate commits and repeated conflicts after pulling a shared feature branch. What happened?

**What to check first:** the remote branch's history for a forced update
(`git reflog show origin/<branch>` in someone's clone).

**How to confirm:** `git log --cherry-mark --oneline HEAD...origin/<branch>`
shows equivalent commits with different hashes.

**Likely causes and fixes:** someone rebased and force-pushed shared
history. Agree on the correct tip, rebase each person's new work onto it
with `--onto`, and block force pushes on shared branches. See
[branching, merging, and rebasing](branching-merging-and-rebasing.md).

### 60. `main` is broken although every merged PR passed CI. How do you prevent this?

**What to check first:** the failing commit and which PRs merged just
before it.

**How to confirm:** each PR passed against an older `main`; combining
them fails.

**Likely causes and fixes:** semantic conflicts between PRs tested in
isolation. Revert to restore green, then require up-to-date branches or
adopt a merge queue with `merge_group` CI. See
[pull requests and code review](pull-requests-and-code-review.md).

### 61. A PR has been stuck on "Expected: waiting for status to be reported" for hours. What is wrong?

**What to check first:** whether the required check's workflow ran at
all for the PR's latest commit.

**How to confirm:** the Actions tab shows no run, or a run whose job name
differs from the required check name.

**Likely causes and fixes:** a `paths` filter skipped the workflow, a job
was renamed, or `merge_group` is missing for the merge queue. Make the
workflow always run and skip inside jobs, update the check names, and add
the trigger. See [pull requests and code review](pull-requests-and-code-review.md).

### 62. A feature was reverted on `main`, fixed on its branch, and merged again, but most of it is missing. Why?

**What to check first:** whether the original merge was undone with
`git revert -m 1`.

**How to confirm:** `git log` shows the revert commit; the re-merge diff
contains only the new fix commits.

**Likely causes and fixes:** the old commits still count as merged.
Revert the revert, then merge the fixes. See
[undoing mistakes and recovery](undoing-mistakes-and-recovery.md).

### 63. A database password was found in the repository's history. What is your plan?

**What to check first:** whether the credential is still valid and
where else it is used.

**How to confirm:** secret scanning alerts or `git log -p -S '<part of
the value>'` show the commits containing it.

**Likely causes and fixes:** a `.env` committed before it was ignored.
Rotate the password now and review database logs, then rewrite history
with `git filter-repo --sensitive-data-removal`, contact GitHub Support
for PR refs and caches, have collaborators re-clone, and enable push
protection. See [undoing mistakes and recovery](undoing-mistakes-and-recovery.md).

### 64. A pagination bug exists now but did not in `v2.3.0`, 900 commits ago. How do you find the cause quickly?

**What to check first:** that a test reliably reproduces the bug.

**How to confirm:** the test passes on `v2.3.0` and fails on `HEAD`.

**Likely causes and fixes:** use `git bisect start HEAD v2.3.0` and
`git bisect run` with the test (about 10 steps); use exit code 125 to
skip unbuildable commits and `--first-parent` to identify the PR. See
[undoing mistakes and recovery](undoing-mistakes-and-recovery.md).

### 65. The week before every release is spent resolving merge conflicts. What would you change?

**What to check first:** branch lifetimes and how many long-lived
branches exist.

**How to confirm:** feature branches live for weeks and integrate only at
release time; conflicts cluster before release dates.

**Likely causes and fixes:** late integration. Move to trunk-based
development or GitHub flow with short-lived branches, feature flags, and
fast CI; keep release branches only for versioned products. See
[branching strategies](branching-strategies.md).

### 66. A hotfix shipped last month and the same bug reappeared in this release. What happened?

**What to check first:** `git branch -a --contains <fix-sha>`.

**How to confirm:** the fix exists only on a release or hotfix branch,
not on `main` or `develop`.

**Likely causes and fixes:** the fix was not merged back (GitFlow) or was
made only on the release branch. Land fixes upstream first and
cherry-pick to release branches, and add a CI check for merge-backs. See
[branching strategies](branching-strategies.md).

### 67. Consumers of your npm package broke after a minor release. What went wrong and how do you prevent it?

**What to check first:** the diff between the two versions for removed
or changed public API.

**How to confirm:** a field or function was removed or its behavior
changed, and the commit lacked `!` or `BREAKING CHANGE`.

**Likely causes and fixes:** a breaking change released as minor. Publish
a patch restoring compatibility, release the change as a major later, add
API contract tests, and lint PR titles. See
[versioning, tags, and releases](versioning-tags-and-releases.md).

### 68. The release job runs `git describe` and fails in CI with "No names found". Why?

**What to check first:** the checkout step's `fetch-depth` and
`fetch-tags` settings.

**How to confirm:** `git tag` in the job prints nothing.

**Likely causes and fixes:** a shallow checkout without tags. Use
`fetch-depth: 0` (history and tags) in the jobs that need history;
fetching tags alone is not enough, because `git describe` walks back
from `HEAD` through history to find one. See
[versioning, tags, and releases](versioning-tags-and-releases.md).

### 69. CI spends four minutes cloning a repository with a large history. How do you speed it up?

**What to check first:** whether the job needs history, and the
repository's pack size.

**How to confirm:** the checkout step dominates job time;
`git count-objects -vH` shows gigabytes.

**Likely causes and fixes:** full clones of history with large blobs.
Use the default shallow checkout where history is not needed, a blobless
partial clone where it is, sparse-checkout for monorepo jobs, Git LFS for
binaries, and consider removing large blobs from history. See
[hooks, .gitignore, and large repositories](hooks-gitignore-and-large-repositories.md).

### 70. A Windows developer's PR shows every line changed, and a shell script now fails in the container. What is the fix?

**What to check first:** `git ls-files --eol` for the affected files.

**How to confirm:** the files have CRLF in the working tree or index, and
the container error mentions `^M`.

**Likely causes and fixes:** inconsistent line-ending conversion. Add
`.gitattributes` with `* text=auto` and `*.sh text eol=lf`, run
`git add --renormalize .`, and commit. See
[hooks, .gitignore, and large repositories](hooks-gitignore-and-large-repositories.md).

## Further learning

- [Git and GitHub overview](../git-and-github.md)
- [Git fundamentals and internals](git-fundamentals-and-internals.md) ·
  [Branching, merging, and rebasing](branching-merging-and-rebasing.md) ·
  [Branching strategies](branching-strategies.md) ·
  [Pull requests and code review](pull-requests-and-code-review.md) ·
  [Versioning, tags, and releases](versioning-tags-and-releases.md) ·
  [Undoing mistakes and recovery](undoing-mistakes-and-recovery.md) ·
  [Hooks, .gitignore, and large repositories](hooks-gitignore-and-large-repositories.md)
- [Pro Git book](https://git-scm.com/book/en/v2)
- [GitHub Docs](https://docs.github.com/en)
