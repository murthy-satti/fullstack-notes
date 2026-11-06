# Git and GitHub

## Introduction

Git is a distributed version control system that records file changes. GitHub hosts Git repositories and adds collaboration features such as pull requests. Git works without GitHub.

## Why does it exist?

Version control gives developers a history, supports parallel work, and helps review or restore changes. Hosting helps a team exchange and discuss work.

## How does it work?

Git records snapshots in commits. Developers edit files, stage selected changes, then commit locally. They can push to a remote and fetch others' work. A GitHub pull request proposes changes for review; it is not a Git command.

## Real-world example

A developer creates a branch, commits a search form, then pushes it. A pull request lets teammates review it before merging.

## Developer perspective

Make understandable commits and review diffs. Do not commit credentials or unrelated edits. Resolve conflicts by understanding both changes. Related: [CI/CD](ci-cd.md) runs checks on pull requests.

## Practical example

Inspect `git status`, create a branch, stage a file, and review `git diff --staged` before committing. Push the branch and open a pull request.

## Important terminology

- **Repository:** project files plus version history.
- **Commit:** recorded change with an identifier and metadata.
- **Branch:** named pointer to a line of commits.
- **Remote:** another copy of a repository, often hosted online.
- **Pull request:** proposal and discussion for integrating changes.

## Advantages and disadvantages

Git supports history, offline work, and collaboration. Merges and rebases require care. Hosted services add features but introduce access and availability considerations.

## Common misconceptions

GitHub is not Git, and local commits are not automatically published. Deleting a file does not erase it from repository history.

## Further Learning & References

- **Official Git documentation:** [About Version Control](https://git-scm.com/book/en/v2/Getting-Started-About-Version-Control) introduces version-control ideas and Git's model.
- **Official GitHub documentation:** [About Git](https://docs.github.com/en/get-started/using-git/about-git) explains Git and its use on GitHub.
- **Third-party explainer:** [Atlassian Git tutorials](https://www.atlassian.com/git/tutorials/what-is-git) provides diagrams and practical workflow explanations.
