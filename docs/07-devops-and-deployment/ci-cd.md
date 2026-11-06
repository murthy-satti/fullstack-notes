# CI/CD

## Introduction

Continuous integration and continuous delivery/deployment (CI/CD) automate software checks and releases. A pipeline runs repeatable steps when code changes, helping teams find problems early.

## Why does it exist?

Manual build and release steps can be inconsistent. Automation makes checks predictable and records what was tested. CI/CD does not guarantee a change is correct.

## How does it work?

A repository event starts a workflow. Jobs install dependencies, test, lint, and build. A delivery pipeline may publish an artifact; continuous deployment can release automatically after checks pass. Scope secrets and permissions carefully.

## Real-world example

A pull request starts tests and a build. After review and merge, a workflow publishes the artifact to staging; production can require approval.

## Developer perspective

Use familiar local commands, clear failures, and deterministic tests. Review workflow permissions and actions; do not expose secrets to untrusted pull-request code. See [Git and GitHub](git-and-github.md), [Docker](docker.md), and [environment variables](environment-variables.md).

## Practical example

Create a workflow that tests each pull request. Run the command locally, then confirm the workflow reports success and failure accurately.

## Important terminology

- **Pipeline/workflow:** automated sequence of jobs.
- **Job/step:** grouped work and an individual command or action.
- **Artifact:** output retained or passed between jobs.
- **Continuous delivery:** changes are kept ready for release.
- **Continuous deployment:** qualifying changes are released automatically.

## Advantages and disadvantages

CI/CD reduces repetitive work and catches defects earlier. Pipelines need maintenance and secure credentials. A green check means configured checks passed, not that software is defect-free.

## Common misconceptions

CI/CD does not mean deploying every commit to production. Teams can automate tests and require production approval.

## Further Learning & References

- **Official GitHub documentation:** [Understanding GitHub Actions](https://docs.github.com/en/actions/about-github-actions/understanding-github-actions) explains workflows, jobs, events, and runners.
- **Official GitHub documentation:** [Building and testing your code](https://docs.github.com/en/actions/automating-builds-and-tests) provides examples for configuring automated checks.
