# Git and GitHub Cheat Sheet

Quick revision of the Git and GitHub lessons, for use before an
interview or a Git task.

## Key commands

| Command | What it does |
|---|---|
| `git switch -c feat/task-due-dates` | Create a branch and switch to it |
| `git add -p` | Stage chosen hunks only |
| `git push -u origin feat/task-due-dates` | Publish the branch and set its upstream |
| `git fetch --prune` | Update `origin/*`, drop deleted ones; files untouched |
| `git rebase origin/main` | Replay your private branch on the latest `main` |
| `git commit --fixup=<sha>`, then `git rebase -i --autosquash main` | Fold a fix into an earlier commit before review |
| `git rebase --onto main feat-model feat-api` | Move only the commits of `feat-api` onto `main` |
| `git push --force-with-lease --force-if-includes` | Overwrite your own rewritten branch safely |
| `git cherry-pick -x <sha>` | Backport a fix and record the source commit |
| `git revert -m 1 <merge-sha>` | Undo a merged PR without rewriting history |
| `git reset --soft HEAD~3` | Make the last 3 local commits one staged change |
| `git restore --staged <file>` | Unstage a file and keep the edits |
| `git reflog`, then `git branch rescue <sha>` | Recover commits after a bad reset, rebase, or delete |
| `git bisect start HEAD v2.3.0`, then `git bisect run <script>` | Binary-search for the first bad commit |
| `git stash push -u -m "wip"` | Set work aside, including untracked files |
| `git tag -a v2.4.0 -m "2.4.0"`, then `git push origin v2.4.0` | Create and publish an annotated release tag |
| `git filter-repo --sensitive-data-removal --invert-paths --path .env` | Purge a leaked file from history, after rotating the secret |
| `gh pr create --fill --base main`, `gh pr merge --squash --auto` | Open a PR; auto-merge once requirements pass |

## Key configuration

```ini
# ~/.gitconfig
[pull]
    rebase = true            # or ff = only: choose deliberately
[push]
    autoSetupRemote = true   # Git 2.37+
[merge]
    conflictStyle = zdiff3   # show the merge base in conflicts
[rerere]
    enabled = true           # reuse recorded resolutions
```

```text
# .gitattributes
* text=auto
*.sh  text eol=lf
*.png binary
```

```yaml
# .github/workflows/ci.yml (trigger section)
on:
  pull_request:
  merge_group:        # required for merge queue checks
```

## Decision guide

| If you need | Choose | Why |
|---|---|---|
| To update your private branch | `git rebase origin/main` | Linear history; only your commits change |
| To update a branch others use | `git merge origin/main` | Nothing is rewritten |
| To undo a commit already on `main` | `git revert` | Adds an inverse commit; clones stay valid |
| One revertable commit per PR | Squash and merge | Clean `main`; revert without `-m` |
| A record of a big branch's merge | Merge commit (`--no-ff`) | Keeps branch commits and the merge point |
| A fix on a release branch | Fix `main` first, then `cherry-pick -x` | No lost fixes; traceable source |
| One production version, fast CI | Trunk-based development | Daily integration; flags hide unfinished work |
| Several supported versions | Trunk plus release branches | Stable lines for apps, SDKs, and LTS |
| Different environments | Promote one artifact | Environment branches drift and rebuild |
| A green `main` at high merge rates | A merge queue | Tests the exact combination that lands |
| Large binaries | Git LFS | Clones fetch only checked-out versions |
| Fast CI checkouts | Shallow default; `filter: blob:none` with history | Download only what the job uses |

## Numbers and defaults to remember

| Item | Value |
|---|---|
| Pruning unreachable objects | After 2 weeks (`gc.pruneExpire`) |
| Reflog expiry | 90 days; 30 for entries no longer reachable |
| Default merge strategy | `ort`, since Git 2.34 |
| SHA-256 repositories | Since Git 2.29; planned default in Git 3.0 |
| Bisect tests | About log2(N): 4 for 16 commits, about 10 for 1,000 |
| `git bisect run` exit codes | 0 good, 1-127 bad (except 125), 125 skip |
| `actions/checkout` | One commit, no tags; `fetch-depth: 0` gets all |
| GitHub file sizes | Warning above 50 MiB; files over 100 MiB blocked |
| Release assets | Each under 2 GiB, up to 1,000 per release |
| PR size (Google) | About 100 lines reasonable; 1,000 usually too large |
| SemVer | `-rc.1` sorts first; `+build` is ignored for precedence |
| Conventional Commits | `fix` patch, `feat` minor, `!` or `BREAKING CHANGE:` major |
| npm ranges | `^2.4.1` is `<3.0.0`, `~2.4.1` is `<2.5.0`, `^0.4.1` is `<0.5.0` |

## Top mistakes

- **Rebasing or force-pushing a shared branch.** Merge instead, and block
  force pushes on shared branches.
- **Using bare `--force`.** Use `--force-with-lease --force-if-includes`,
  and only on your own branches.
- **Deleting a leaked secret in a new commit.** Rotate it first, then
  rewrite history with `git filter-repo` and contact GitHub Support.
- **Re-merging a reverted branch.** Revert the revert first, then merge
  the fixes.
- **Running `reset --hard` over uncommitted work.** Commit or stash first;
  never-committed edits cannot be recovered.
- **Adding a tracked file to `.gitignore`.** Untrack it with
  `git rm --cached`; ignore rules affect only untracked files.
- **Required checks that never report.** Do not path-filter required
  workflows, and add `merge_group` for merge queues.
- **Treating hooks as enforcement.** Anyone can skip them; run the same
  checks in CI and rulesets.

## Where to go deeper

- [Git fundamentals and internals](git-fundamentals-and-internals.md)
- [Branching, merging, and rebasing](branching-merging-and-rebasing.md)
- [Branching strategies](branching-strategies.md)
- [Pull requests and code review](pull-requests-and-code-review.md)
- [Versioning, tags, and releases](versioning-tags-and-releases.md)
- [Undoing mistakes and recovery](undoing-mistakes-and-recovery.md)
- [Hooks, .gitignore, and large repositories](hooks-gitignore-and-large-repositories.md)
- [Interview questions and answers](interview-questions-and-answers.md)

Back to the [Git and GitHub overview](../git-and-github.md).
