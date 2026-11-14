# CI/CD

CI/CD automates the path from a code change to running software.
**Continuous integration (CI)** merges every developer's work into a
shared main line frequently and verifies each change automatically with
builds and tests. **Continuous delivery (CD)** keeps every verified change
releasable, so deploying is a routine, low-risk, push-button decision;
**continuous deployment** goes one step further and releases every change
that passes the pipeline without a manual step. Together they turn
releases from rare, stressful events into small, frequent, reversible
ones.

## What CI/CD provides

- **Fast feedback:** a broken build or failing test is reported minutes
  after the push, while the change is still fresh in the author's mind.
- **A main line that always works:** automated checks gate every merge,
  so `main` stays deployable.
- **Repeatable releases:** the same scripted steps build, test, and
  deploy every time, instead of a checklist someone follows by hand.
- **Traceability:** every artifact and deployment links back to a commit,
  a pipeline run, and the checks it passed.
- **Smaller, safer changes:** frequent deploys of small batches are easier
  to review, test, diagnose, and roll back.
- **Measurable delivery:** pipelines make DORA metrics such as deployment
  frequency and change lead time visible.

A pipeline is also software: it needs maintenance, security review, and
speed budgets, and a green check only means the configured checks passed.

## How a typical CI/CD pipeline works

A change to the TaskFlow API travels through these steps:

1. A developer pushes a commit or opens a pull request.
2. **CI** runs automatically: install dependencies, lint, type-check,
   run unit and integration tests, and build.
3. On `main`, the pipeline produces **one artifact**, such as a container
   image identified by its digest.
4. The pipeline deploys that artifact to **staging** and runs smoke and
   end-to-end tests against it.
5. An **approval gate** (for example, a required reviewer on the
   production environment) decides when to release. In continuous
   deployment this gate is automated.
6. The **same artifact** is deployed to **production**, often gradually.
7. **Monitoring** checks error rates and latency; problems lead to a
   rollback or a fix-forward commit, which starts the loop again.

![Diagram: a commit or pull request triggers CI checks for lint, tests, and build; the build produces one artifact, an image identified by digest; it is deployed to staging with smoke and end-to-end tests; when all are green an approval gate with a required reviewer releases the same artifact to production, often with a canary; monitoring of SLOs, errors, and DORA metrics feeds back to developers who roll back or fix forward; in continuous delivery a person approves the release step, and in continuous deployment that step is automated.](ci-cd-overview.svg)

## Practical example

```yaml
# .github/workflows/ci.yml: the smallest useful CI for TaskFlow API
name: CI
on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version-file: .nvmrc   # same Node version as production
          cache: npm
      - run: npm ci                   # exact versions from package-lock.json
      - run: npm run lint
      - run: npm test
```

Every pull request and every push to `main` now gets a pass or fail
status. Marking the `test` check as required in the branch rules turns it
into a merge gate. The full pipeline, with a MongoDB service container,
build artifacts, and deployments, is built up in
[GitHub Actions in depth](ci-cd/github-actions-in-depth.md).

## CI/CD topic map

**Foundations**

- [Continuous integration fundamentals](ci-cd/continuous-integration-fundamentals.md)
- [Pipeline design](ci-cd/pipeline-design.md)

**GitHub Actions**

- [GitHub Actions in depth](ci-cd/github-actions-in-depth.md)

**Quality and delivery**

- [Testing and quality gates](ci-cd/testing-and-quality-gates.md)
- [Artifacts and environment promotion](ci-cd/artifacts-and-environment-promotion.md)

**Security**

- [Pipeline and supply chain security](ci-cd/pipeline-and-supply-chain-security.md)

**Review**

- [CI/CD interview questions and answers](ci-cd/interview-questions-and-answers.md) · [cheat sheet](ci-cd/cheat-sheet.md)

## Developer perspective and common misconceptions

Make the pipeline run the same commands you run locally (`npm ci`,
`npm test`), keep it fast enough that people wait for it (around ten
minutes for pull requests), and treat a red `main` as the team's top
priority. Build once and promote the same artifact; keep secrets out of
untrusted code paths; give workflows the least permissions they need.

- CI is not "having a build server". It is the practice of integrating
  small changes into the main line at least daily; a server testing
  month-old branches is not CI.
- Continuous delivery does not mean deploying every commit to production;
  that is continuous deployment. Delivery means every commit *could* be
  deployed.
- A green pipeline does not prove the software is correct, only that the
  checks you wrote passed. Flaky or missing tests make it lie.
- Rebuilding the code separately for staging and production means
  production runs something that was never tested.
- Pipelines are an attack surface: they hold credentials and run code
  from pull requests and third-party actions.

## Further learning

- [Martin Fowler: Continuous Integration](https://martinfowler.com/articles/continuousIntegration.html)
- [DORA: Continuous delivery capability](https://dora.dev/capabilities/continuous-delivery/)
- [GitHub Docs: Understanding GitHub Actions](https://docs.github.com/en/actions/get-started/understand-github-actions)
- [GitHub Docs: Security hardening for GitHub Actions](https://docs.github.com/en/actions/reference/security/secure-use)
- [CI/CD interview questions and answers](ci-cd/interview-questions-and-answers.md)
