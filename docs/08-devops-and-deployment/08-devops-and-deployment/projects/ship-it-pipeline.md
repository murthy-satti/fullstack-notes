# Ship It Pipeline

Put TaskFlow API under a real team workflow: `main` is protected, every
change arrives through a pull request with a passing check, and a GitHub
Actions pipeline lints, type checks, and tests the code in under five
minutes. You finish with a tagged release and a generated changelog.

## Why this project helps

- Builds the everyday Git and CI skills every team expects: branches, pull
  requests, required checks, and a pipeline you can read and fix.
- Improves **release safety**: nothing reaches `main` without review and
  green tests, including integration tests against a real MongoDB.
- Improves **pipeline speed**: lockfile-keyed caching and parallel jobs keep
  feedback fast, which is what keeps people from skipping CI.
- Gives you concrete answers for interview questions on branch protection,
  caching, flaky tests, and how a release is cut.

## What you need

- A GitHub account and the TaskFlow API repository (Express and MongoDB)
  from the Backend section; GitHub Actions minutes on the free plan are
  enough for a public repository.
- Node 24 and a test runner the project already uses, plus ESLint and
  TypeScript (or JSDoc type checks).
- No earlier projects: this is the first one.

## How to do it

1. Create a branch ruleset (or classic branch protection) for `main` that
   requires a pull request, one approval, and a passing check. See
   [pull requests and code review](../git-and-github/pull-requests-and-code-review.md).
2. Pick a branching model (trunk-based with short-lived branches works well)
   from [branching strategies](../git-and-github/branching-strategies.md).
3. Add `.github/workflows/ci.yml` triggered on `pull_request` and pushes to
   `main`, with `permissions: contents: read`; use `actions/checkout@v7`.
4. Install with `actions/setup-node@v7` (`node-version: 24`, `cache: npm`)
   and `npm ci`, so dependencies are cached on the lockfile hash. See
   [pipeline design](../ci-cd/pipeline-design.md).
5. Run lint and type check in one job and tests in another so they run in
   parallel; see [GitHub Actions in depth](../ci-cd/github-actions-in-depth.md).
6. Start MongoDB as a service container for integration tests, as shown in
   [testing and quality gates](../ci-cd/testing-and-quality-gates.md).
7. Mark the jobs as required checks in the ruleset, then open a pull request
   that fails and one that passes to prove the gate works.
8. Measure the pipeline's duration in the run summary and remove the
   slowest steps until it stays under five minutes.
9. Cut a release with a tag and a generated changelog using release-please
   or `gh release create <tag> --generate-notes`; see
   [versioning, tags, and releases](../git-and-github/versioning-tags-and-releases.md).

## Done when

- A direct push to `main` is rejected.
- A pull request cannot merge until lint, type check, and tests pass.
- Integration tests run against MongoDB in a service container.
- A cached run finishes in under five minutes.
- A tagged release exists with a changelog generated from commits.

## Stretch goals

- Shard the slowest test suite across a matrix and compare durations.
- Add a weekly scheduled run and a status badge to the README.
- Require signed commits on `main`.

## Lessons to use

- [Git and GitHub](../git-and-github.md) and [CI/CD](../ci-cd.md)
- [Continuous integration fundamentals](../ci-cd/continuous-integration-fundamentals.md)
- [Pipeline and supply chain security](../ci-cd/pipeline-and-supply-chain-security.md)

Back to [all projects](../projects.md).
