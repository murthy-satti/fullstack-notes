# Testing and Quality Gates

A quality gate is an automated check a change must pass before it moves
to the next stage: merging, deploying to staging, or reaching production.
The pipeline is a sequence of such gates, each catching a different class
of problem at a different cost. Designing them well means putting each
kind of test where it gives the most confidence per minute, and keeping
every gate trustworthy enough that red always means "stop".

This lesson covers the test pyramid and testing trophy in CI, where lint,
formatting, type checks, unit, integration, and end-to-end tests belong,
service containers, test sharding, flaky test detection and quarantine,
coverage thresholds and their limits, required checks, preview
environments for end-to-end tests, and performance budgets.

## Why it matters

Tests are only useful in CI if they are fast enough to run on every
change and reliable enough to believe. A suite that takes 40 minutes gets
skipped or batched; a suite that fails randomly trains people to click
"re-run" until green, at which point real failures slip through. Google
reported that about 1.5% of its test runs produced a flaky result and
that 84% of observed pass-to-fail transitions involved a flaky test, so
the cost of unreliable tests is not theoretical. Well-placed gates catch
most defects in minutes at low cost, and reserve slow, expensive,
realistic tests for changes that already passed everything cheaper.

## Real-world usage

- **Google on flaky tests.**
  [Flaky Tests at Google and How We Mitigate Them](https://testing.googleblog.com/2016/05/flaky-tests-at-google-and-how-we.html)
  reports a continual rate of about 1.5% of test runs with a flaky result,
  that almost 16% of tests had some flakiness, and that about 84% of
  pass-to-fail transitions in CI involved a flaky test, which is why
  flakiness needs active management.
- **The practical test pyramid.** Ham Vocke's
  [The Practical Test Pyramid](https://martinfowler.com/articles/practical-test-pyramid.html)
  on martinfowler.com explains writing many fast, isolated tests and few
  slow, broad ones, and how each layer fits a deployment pipeline.
- **The testing trophy.** Kent C. Dodds'
  [testing trophy](https://kentcdodds.com/blog/the-testing-trophy-and-testing-classifications)
  argues for static analysis as the base and integration tests as the
  largest layer for web applications, because they give the most
  confidence per test.
- **Hermetic presubmit tests at Google.** The CI chapter of
  [Software Engineering at Google](https://abseil.io/resources/swe-book/html/ch23.html)
  describes the Google Takeout team moving sandboxed environment tests to
  presubmit, which prevented 95% of broken servers caused by bad
  configuration and cut nightly deployment failures by 50%.

**Popular tools and providers:** Jest, Vitest, and the Node.js test
runner (`node:test`) for unit and integration tests, Supertest for HTTP
APIs, Testcontainers and GitHub Actions service containers for real
dependencies, Playwright and Cypress for end-to-end tests, k6 and Lighthouse
CI for performance budgets, and Stryker for mutation testing.

## How it works

### The pyramid and the trophy in CI

Both models make the same economic argument: lower layers are cheaper,
faster, and more precise; higher layers are more realistic but slower and
flakier.

| Layer | Pyramid emphasis | Trophy emphasis | Typical TaskFlow example |
|---|---|---|---|
| Static analysis | (assumed) | Base of the trophy | ESLint, Prettier, TypeScript, secret scanning |
| Unit tests | Largest layer | Some | Due-date validation logic |
| Integration tests | Middle | Largest layer | `POST /tasks` through Express into a real MongoDB |
| End-to-end tests | Small tip | Small top | Sign in, create a task, see it in TaskFlow Web |

For a typical API, integration tests that exercise HTTP routes against a
real database catch the bugs that matter (queries, validation, error
handling) with few mocks, so many teams weight toward the trophy. For
pure logic libraries the pyramid's unit-heavy shape fits better.

### Where each check runs

![Diagram: a funnel of quality gates from widest and cheapest to narrowest and most expensive: editor and pre-commit formatting and linting in seconds before push; static analysis (lint, type check, secret scan) in seconds on every PR; unit tests under a minute on every PR; integration tests of the API against MongoDB in one to three minutes on every PR with a service container; end-to-end tests on a preview or staging environment in five to fifteen minutes on the PR or after merge; and performance budgets and canary analysis after merge and in production; checks get fewer, slower, costlier, and more realistic going down.](quality-gate-funnel.svg)

| Check | Stage | Blocks merge? | Target time |
|---|---|---|---|
| Format check, lint | PR | Yes | Seconds |
| Type check | PR | Yes | Under a minute |
| Unit tests | PR | Yes | Under a minute |
| Integration tests with service containers | PR | Yes | 1-3 minutes |
| Dependency review and secret scanning | PR | Yes for high severity | Seconds |
| Build and container image scan | PR (build) and main (push) | Yes | A few minutes |
| End-to-end tests | PR preview or staging after merge | Yes before production | 5-15 minutes, sharded |
| Performance budgets | PR (web) or staging (API load test) | Yes for clear regressions | Minutes |
| Canary analysis | Production rollout | Blocks full rollout | Minutes to an hour |

### Real dependencies: service containers and alternatives

Integration tests need a database. Options, from most to least realistic:

| Option | How | Pros | Cons |
|---|---|---|---|
| Service container | `services: mongo: image: mongo:8.0` in the job | Real MongoDB, same version as production, no code changes | Linux runners only; one instance shared by the job |
| Testcontainers | Library starts containers from test code | Per-suite isolation, works locally the same way | Needs Docker on the runner; slower startup |
| In-memory server | `mongodb-memory-server` downloads and runs `mongod` | No Docker needed | Binary download; may differ from production setup |
| Mocks | Replace the driver in tests | Fast | Misses query, index, and validation bugs |

Whatever you choose, keep tests isolated: each test creates the data it
needs and cleans up, test files that share one database run serially (or
use a database per worker), and nothing depends on test order.

### Test sharding

When one suite is too slow, split it across parallel jobs. Each shard runs
a deterministic subset:

| Tool | Command |
|---|---|
| Node.js test runner | `node --test --test-shard=2/4` |
| Jest | `jest --shard=2/4` |
| Vitest | `vitest run --shard=2/4` |
| Playwright | `npx playwright test --shard=2/4` |

With a matrix of four shards, a 12-minute end-to-end suite takes roughly
3 minutes plus per-job setup. Shards finish unevenly when test files vary
in length, so split long files. Merge the shards' reports afterwards
(Playwright's blob reporter and `merge-reports` exist for this).

### Flaky tests

A **flaky test** passes and fails on the same code. Typical causes:

- Fixed sleeps and races (waiting 500 ms for something that usually takes
  400).
- Shared state: a database, files, or globals left behind by another test.
- Order dependence: a test passes only after another one ran.
- Real external services, networks, and DNS.
- Dates, time zones, and randomness without fixed seeds.
- Resource limits: slow shared runners, timeouts set too tight.

![Diagram: when a test fails in CI, rerun it on the same commit; if it fails again it is a real failure to fix or revert; if it passes it is flaky, so label it and count occurrences; if it blocks many PRs, quarantine it by moving it to a non-required job with an issue, owner, and deadline; otherwise fix it now; find the root cause among timing and fixed sleeps, shared state, order dependence, external services, dates and time zones, and runner limits; fix, verify by running it many times, and return it to the required suite.](flaky-test-triage.svg)

A sound policy:

1. **Detect.** Retries that turn a failure into a pass mark a test as
   flaky (Playwright reports these as "flaky"). Track flaky counts per
   test over time.
2. **Quarantine** tests that block many PRs: move them out of the required
   checks into a non-blocking job, with an issue, an owner, and a
   deadline. The quarantine list must stay short.
3. **Fix** the root cause: replace sleeps with waiting for a condition,
   isolate data, fake time, stub external services.
4. **Verify** by running the test many times in a loop before restoring
   it.

Automatic retries (for example `retries: 2` in CI) keep the pipeline
moving but hide flakiness unless you report it; Playwright's
`--fail-on-flaky-tests` turns "passed on retry" into a failure when you
want to enforce zero tolerance.

### Coverage thresholds and their limits

Coverage tools report which lines, branches, and functions ran during
tests. A threshold fails the build when coverage drops below a number:

```bash
node --test --experimental-test-coverage \
  --test-coverage-lines=80 --test-coverage-branches=70 \
  "test/unit/**/*.test.js"
```

Coverage is useful as a **floor** (to stop untested code piling up) and as
a **map** (to find untested areas), but it measures execution, not
verification: a test that calls a function and asserts nothing earns full
coverage. Practical guidance:

- Set thresholds a little below the current level and ratchet up; never
  chase 100%.
- Prefer "no decrease on changed files" over a global number.
- Review what tests assert, not only what they execute; mutation testing
  (Stryker) measures whether tests catch deliberately injected bugs.
- Exclude generated code and configuration from coverage.

### Required checks

A gate only protects `main` if branch rules require it. Combine the
quality gates into one aggregator job and require that job (see
[pipeline design](pipeline-design.md) and
[pull requests and code review](../git-and-github/pull-requests-and-code-review.md)).
Optional checks are informative, but people learn that they can be
ignored.

### Preview environments for end-to-end tests

A **preview environment** is a short-lived deployment of one pull
request: TaskFlow Web and API built from the PR, with seeded test data, at
a unique URL. End-to-end tests run against it before merge, and reviewers
can click through the change. Frontend platforms such as Vercel and
Netlify create deploy previews automatically; for APIs, teams deploy to a
per-PR Kubernetes namespace or run the stack with Docker Compose inside
the CI job.

Rules that keep previews safe and cheap:

- Use test data and test credentials only; never production data.
- Tear down on PR close (`pull_request` with `types: [closed]`) and with a
  scheduled sweeper for leftovers.
- Do not deploy fork PRs with secrets; run previews only for branches in
  the same repository.

### Performance budgets

A **performance budget** is a limit the build must not exceed: p95
latency, error rate, page weight, Largest Contentful Paint. In CI, budgets
catch regressions the moment they are introduced:

| Target | Tool | Example budget |
|---|---|---|
| API latency and errors | k6 thresholds | p95 under 300 ms, error rate under 1% at 20 virtual users |
| Web page performance | Lighthouse CI assertions | Performance score at least 0.9, LCP under 2.5 s |
| JavaScript bundle size | Bundler output checks | Main bundle under a set number of kilobytes |

Short smoke load tests fit in PR or staging pipelines; full load tests
run on a schedule against a production-like environment (see
[performance testing](../../../10-security-and-testing/performance-testing.md)).

## When to use and when not to use

| Test type | Use when | Avoid when |
|---|---|---|
| Unit tests | Pure logic, edge cases, error handling | Testing framework glue or simple data passing |
| Integration tests with a real database | Routes, queries, validation, transactions | Behavior that a unit test covers more precisely |
| Contract tests | Several services or clients depend on an API's shape | A single app with one client in the same repo |
| End-to-end tests | A few critical user journeys (sign in, create task, pay) | Every edge case (too slow and flaky) |
| Coverage thresholds | Preventing untested code from accumulating | As the measure of test quality |
| Preview environments | UI changes, end-to-end tests before merge | When the cost per PR is high and staging tests suffice |
| Performance budgets in PRs | Web pages and hot API endpoints | Full-scale load tests (run on a schedule instead) |

## Practical examples

### An integration test against the service container

```js
// test/integration/tasks.test.js
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { MongoClient } from "mongodb";
import { createApp } from "../../src/app.js";

const client = new MongoClient(process.env.MONGODB_URI);
let app;
let db;

before(async () => {
  await client.connect();
  db = client.db();                  // database name from the URI: taskflow_test
  app = createApp({ db });
});

beforeEach(async () => {
  await db.collection("tasks").deleteMany({});   // each test starts clean
});

after(async () => {
  await client.close();
});

test("POST /tasks creates a task that GET /tasks/:id returns", async () => {
  const created = await request(app)
    .post("/tasks")
    .send({ title: "Write CI docs" })
    .expect(201);

  const res = await request(app).get(`/tasks/${created.body.id}`).expect(200);
  assert.equal(res.body.title, "Write CI docs");
});

test("POST /tasks rejects an empty title with 400", async () => {
  await request(app).post("/tasks").send({ title: "" }).expect(400);
});
```

In CI, `MONGODB_URI` points at the `mongo` service container
(`mongodb://localhost:27017/taskflow_test`); locally it points at a Docker
Compose MongoDB. The same test file runs in both places. Testing Express
APIs in depth is covered in
[testing Express APIs](../../../03-backend-development/express/testing-express-apis.md).

### Sharded Playwright end-to-end tests for TaskFlow Web

```yaml
# .github/workflows/e2e.yml
name: e2e
on:
  pull_request:

permissions:
  contents: read

jobs:
  e2e:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    strategy:
      fail-fast: false
      matrix:
        shardIndex: [1, 2, 3, 4]
        shardTotal: [4]
    steps:
      - uses: actions/checkout@v7
        with:
          persist-credentials: false
      - uses: actions/setup-node@v7
        with:
          node-version-file: .nvmrc
          cache: npm
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npx playwright test --shard=${{ matrix.shardIndex }}/${{ matrix.shardTotal }} --grep-invert @quarantine
      - if: ${{ !cancelled() }}
        uses: actions/upload-artifact@v7
        with:
          name: blob-report-${{ matrix.shardIndex }}
          path: blob-report
          retention-days: 3

  merge-reports:
    if: ${{ !cancelled() }}
    needs: e2e
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
        with:
          persist-credentials: false
      - uses: actions/setup-node@v7
        with:
          node-version-file: .nvmrc
          cache: npm
      - run: npm ci
      - uses: actions/download-artifact@v8
        with:
          path: all-blob-reports
          pattern: blob-report-*
          merge-multiple: true
      - run: npx playwright merge-reports --reporter html ./all-blob-reports
      - uses: actions/upload-artifact@v7
        with:
          name: playwright-report
          path: playwright-report
          retention-days: 14

  quarantined:
    runs-on: ubuntu-latest
    continue-on-error: true            # informative only, not a required check
    steps:
      - uses: actions/checkout@v7
        with:
          persist-credentials: false
      - uses: actions/setup-node@v7
        with:
          node-version-file: .nvmrc
          cache: npm
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npx playwright test --grep @quarantine --repeat-each 5
```

```ts
// playwright.config.ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  retries: process.env.CI ? 2 : 0,          // passing on retry is reported as flaky
  reporter: process.env.CI ? "blob" : "html",
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:4173",
    trace: "on-first-retry",                 // keep a trace when a retry happens
  },
});
```

```ts
// e2e/create-task.spec.ts (a quarantined test is tagged, not deleted)
import { test, expect } from "@playwright/test";

test("create a task from the board", { tag: "@quarantine" }, async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New task" }).click();
  await page.getByLabel("Title").fill("Write CI docs");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Write CI docs")).toBeVisible();
});
```

Four shards run in parallel; `fail-fast: false` lets every shard finish so
the merged report shows all failures. Quarantined tests run separately,
five times each, so their flakiness stays visible without blocking PRs.

### Coverage floor in package.json

```json
{
  "scripts": {
    "test": "node --test \"test/unit/**/*.test.js\"",
    "test:coverage": "node --test --experimental-test-coverage --test-coverage-lines=80 --test-coverage-branches=70 --test-coverage-functions=80 \"test/unit/**/*.test.js\""
  }
}
```

The process exits with code 1 when a threshold is missed, which fails the
CI step. The coverage flags are still marked experimental in Node.js; Jest
(`coverageThreshold`) and Vitest (`coverage.thresholds`) offer the same
gate if you use those runners.

### A preview environment per pull request

```yaml
# .github/workflows/preview.yml
name: preview
on:
  pull_request:
    types: [opened, synchronize, reopened, closed]

permissions:
  contents: read
  pull-requests: write          # comment the preview URL
  id-token: write               # OIDC login to the cluster's cloud account

jobs:
  deploy-preview:
    # same-repository branches only: fork PRs get no secrets or cloud access
    if: github.event.action != 'closed' && github.event.pull_request.head.repo.full_name == github.repository
    runs-on: ubuntu-latest
    environment: preview
    concurrency:
      group: preview-${{ github.event.pull_request.number }}
      cancel-in-progress: true
    steps:
      - uses: actions/checkout@v7
        with:
          persist-credentials: false
      - name: Build, push, and deploy to a per-PR namespace
        env:
          PR: ${{ github.event.pull_request.number }}
        run: ./scripts/preview-deploy.sh "pr-$PR"
      - name: Comment the URL
        env:
          GH_TOKEN: ${{ github.token }}
          PR: ${{ github.event.pull_request.number }}
        run: |
          gh pr comment "$PR" --body "Preview: https://pr-$PR.preview.taskflow.example.com"

  teardown-preview:
    if: github.event.action == 'closed' && github.event.pull_request.head.repo.full_name == github.repository
    runs-on: ubuntu-latest
    environment: preview
    steps:
      - uses: actions/checkout@v7
        with:
          persist-credentials: false
      - env:
          PR: ${{ github.event.pull_request.number }}
        run: ./scripts/preview-teardown.sh "pr-$PR"
```

### Performance budgets for the API and the web app

```js
// perf/tasks-smoke.js: k6 smoke test with pass/fail thresholds
import http from "k6/http";
import { check } from "k6";

export const options = {
  vus: 20,
  duration: "1m",
  thresholds: {
    http_req_failed: ["rate<0.01"],      // under 1% errors
    http_req_duration: ["p(95)<300"],    // 95% of requests under 300 ms
  },
};

export default function () {
  const res = http.get(`${__ENV.BASE_URL}/tasks?limit=20`, {
    headers: { Authorization: `Bearer ${__ENV.API_TOKEN}` },
  });
  check(res, { "status is 200": (r) => r.status === 200 });
}
```

```bash
k6 run -e BASE_URL=https://staging.taskflow.example.com -e API_TOKEN="$STAGING_TEST_TOKEN" perf/tasks-smoke.js
# k6 exits non-zero when a threshold fails, which fails the CI step
```

```json
{
  "ci": {
    "collect": {
      "startServerCommand": "npm run preview",
      "url": ["http://localhost:4173/"],
      "numberOfRuns": 3
    },
    "assert": {
      "assertions": {
        "categories:performance": ["error", { "minScore": 0.9 }],
        "largest-contentful-paint": ["error", { "maxNumericValue": 2500 }],
        "total-byte-weight": ["warn", { "maxNumericValue": 350000 }]
      }
    },
    "upload": { "target": "temporary-public-storage" }
  }
}
```

The JSON is TaskFlow Web's `lighthouserc.json`; `npx @lhci/cli autorun`
builds a report from three runs and fails on the `error` assertions.
Three runs reduce noise, because single Lighthouse runs vary.

## Best practices

- Put each test where it catches its class of bug most cheaply; keep the
  PR pipeline around ten minutes.
- Prefer integration tests against real dependencies (service containers)
  over heavy mocking for APIs.
- Keep tests isolated: own data, cleanup, no order dependence, fixed time
  and seeds.
- Shard slow suites and merge reports; split long test files so shards
  balance.
- Track flaky tests, quarantine quickly with an owner, and fix root
  causes; report retries instead of hiding them.
- Use coverage as a floor and a map, not a target; ratchet, do not chase
  100%.
- Require one aggregate check; keep optional checks few.
- Run end-to-end tests on preview or staging environments with test data,
  limited to critical journeys.
- Gate performance with budgets in CI and run full load tests on a
  schedule.

## In production

- **Everyone re-runs failed jobs and the "re-run" button is the fix.**
  *Detect:* a high share of runs with more than one attempt; failures that
  disappear on retry. *Cause:* flaky tests in required checks. *Fix:*
  measure flakiness per test, quarantine the worst offenders with owners,
  and fix timing and shared-state problems.
- **Integration tests pass alone but fail in the full suite.**
  *Detect:* failures depend on which tests ran before; running a file
  alone passes. *Cause:* shared database state or parallel test files
  writing to the same collections. *Fix:* clean data per test, run files
  serially (`--test-concurrency=1`) or give each worker its own database.
- **Coverage is 92% but a basic bug reached production.**
  *Detect:* the buggy branch shows as covered. *Cause:* tests executed
  the code without asserting the outcome. *Fix:* review assertions, add
  behavior-focused tests, and try mutation testing on critical modules.
- **The end-to-end suite takes 40 minutes and blocks deploys.**
  *Detect:* the e2e job dominates the critical path. *Cause:* too many
  end-to-end tests covering edge cases, run serially. *Fix:* move edge
  cases down to integration tests, keep critical journeys, and shard the
  rest.
- **A performance regression shipped unnoticed.**
  *Detect:* p95 latency jumped after a deploy; no CI check failed. *Cause:*
  no performance budget in the pipeline. *Fix:* add a k6 smoke test with
  thresholds against staging and Lighthouse budgets for the web app.
- **Preview environments pile up and the cloud bill grows.**
  *Detect:* namespaces or deployments for long-closed PRs. *Cause:*
  teardown only on `closed` events, which can be missed. *Fix:* add a
  scheduled sweeper that deletes previews whose PRs are closed, and set
  resource quotas.

## Important terminology

- **Quality gate:** An automated check that must pass before a change
  moves forward.
- **Test pyramid:** Many fast unit tests, fewer integration tests, few
  end-to-end tests.
- **Testing trophy:** Static analysis base, with integration tests as the
  largest layer.
- **Service container:** A dependency container started alongside a CI
  job.
- **Hermetic test:** A test whose environment is fully self-contained.
- **Test sharding:** Splitting a suite across parallel jobs.
- **Flaky test:** A test that both passes and fails on the same code.
- **Quarantine:** Removing a flaky test from blocking checks while it is
  fixed.
- **Code coverage:** The share of code executed by tests.
- **Mutation testing:** Injecting small bugs to see whether tests catch
  them.
- **Preview environment:** A temporary deployment of one pull request.
- **Performance budget:** A limit on a performance metric enforced in CI.

## Common mistakes and misconceptions

- Treating coverage percentage as proof of quality.
- Mocking the database in every test and missing query bugs.
- Writing end-to-end tests for every edge case.
- Using fixed sleeps instead of waiting for conditions.
- Retrying flaky tests silently forever.
- Leaving checks optional and expecting people to honor them.
- Running previews with production data or secrets available to fork PRs.
- Running one-off full load tests on every PR instead of short budgets.

## Revision questions

1. Compare the test pyramid and the testing trophy. Which would you favor
   for TaskFlow API, and why?
2. Place lint, type check, unit, integration, end-to-end, and performance
   checks in a pipeline, with target times.
3. What are three ways to provide MongoDB to integration tests in CI, and
   their trade-offs?
4. An end-to-end suite takes 24 minutes. With 6 shards and 1 minute of
   setup per shard, roughly how long does it take, assuming even shards?
   What makes shards uneven? (About 5 minutes; long test files.)
5. Describe a flaky-test policy from detection to restoration.
6. Why can 90% coverage coexist with poor tests? What complements
   coverage?
7. How would you build preview environments safely for a repository that
   accepts fork PRs?
8. Write k6 thresholds for "fewer than 0.5% errors and p99 under 800 ms".

## Further learning

- [Google Testing Blog: Flaky Tests at Google and How We Mitigate Them](https://testing.googleblog.com/2016/05/flaky-tests-at-google-and-how-we.html)
- [The Practical Test Pyramid](https://martinfowler.com/articles/practical-test-pyramid.html)
- [Node.js test runner](https://nodejs.org/api/test.html)
- [Playwright: Sharding](https://playwright.dev/docs/test-sharding) and
  [Retries](https://playwright.dev/docs/test-retries)
- [GitHub Docs: Using Docker service containers](https://docs.github.com/en/actions/tutorials/use-containerized-services/use-docker-service-containers)
- [Grafana k6: Thresholds](https://grafana.com/docs/k6/latest/using-k6/thresholds/)
- [Lighthouse CI](https://github.com/GoogleChrome/lighthouse-ci)
- Next: [artifacts and environment promotion](artifacts-and-environment-promotion.md). Back to the
  [CI/CD overview](../ci-cd.md).
