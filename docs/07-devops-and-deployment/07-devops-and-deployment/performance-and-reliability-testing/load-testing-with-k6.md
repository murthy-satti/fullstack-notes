# Load Testing with k6

Grafana k6 is an open-source load-testing tool: you describe the traffic in
a JavaScript (or TypeScript) file, and a single Go binary generates it,
measures every request, and decides pass or fail from thresholds you write.
This lesson builds a complete k6 suite for TaskFlow API: the test
lifecycle, scenarios and executors, thresholds, checks, tags and groups,
test data, one shared workload driven by several load shapes, running in
GitHub Actions with a pass/fail gate, and sending results to dashboards.
It ends with a short comparison with JMeter, Gatling, Locust, and
Artillery.

The examples use k6 2.x: version 2.0.0 was released in May 2026 and 2.4.0
is current at the time of writing. Choosing the load shape and the
workload model is covered in
[load testing fundamentals](load-testing-fundamentals.md); a short smoke
test as a CI quality gate is introduced in
[testing and quality gates](../ci-cd/testing-and-quality-gates.md).

## Why it matters

A load test is only useful if it is repeatable, reviewable, and able to
fail a build. k6 treats a test as code: scripts live in the repository next
to the API, changes go through pull requests, and thresholds turn the SLO
into an exit code that CI understands. Because it is one binary with no
runtime to install, the same command runs on a laptop, in a GitHub Actions
job, and on a dedicated load-generator host.

The flip side is that k6 does exactly what the script says. A script that
uses the wrong executor, forgets to group URLs, or has no thresholds will
produce confident, useless numbers. Knowing how k6 schedules work,
aggregates metrics, and evaluates thresholds is what makes the results
trustworthy.

## Real-world usage

- **GitLab.** The
  [GitLab Performance Tool](https://gitlab.com/gitlab-org/quality/performance)
  is "built upon" k6 and provides tests of GitLab's server performance;
  GitLab uses it to continuously validate the performance of its published
  reference architectures through scheduled pipelines.
- **Grafana Labs.** In
  [How we use the k6 load-testing tool for developing Grafana](https://grafana.com/blog/2021/08/23/how-we-use-the-k6-load-testing-tool-for-developing-grafana/)
  (2021), Grafana engineers describe using k6 to test token refresh across
  several Grafana instances before shipping, to reproduce a spike of 500
  errors behind an authentication proxy and verify the fix, and to compare
  a slow database query against different indexes and a rewrite.
- **k6 itself.** The
  [k6 v2.0.0 release notes](https://github.com/grafana/k6/releases/tag/v2.0.0)
  list what changed in the current major version: the
  `externally-controlled` executor, `k6 login`, and the `--no-summary` flag
  were removed, and cloud runs that abort for reasons other than thresholds
  now exit with code 97 instead of 0, so CI cannot mistake them for a pass.

**Popular tools and providers:** k6 (open source, AGPL-3.0), Grafana Cloud
k6 for managed and distributed runs, the k6 Operator for distributed tests
in Kubernetes, the `grafana/setup-k6-action` and `grafana/run-k6-action`
GitHub Actions, Apache JMeter, Gatling, Locust, and Artillery.

## How it works

### The test lifecycle

A k6 script has four stages, and knowing which code runs when prevents
most surprises:

| Stage | Runs | Typical use |
|---|---|---|
| Init code (top level of the file) | Once per VU | Imports, `options`, `open()` of local files, `SharedArray` |
| `setup()` | Once, before the load | Log in test users, create fixtures; the return value is passed on |
| VU code (`default` or a scenario's `exec` function) | Once per iteration | The requests, checks, and custom metrics |
| `teardown(data)` | Once, after the load | Delete data the test created |
| `handleSummary(data)` | Once, at the very end | Write the summary to files or the terminal |

![Diagram: one k6 run in five stages. Init code runs once per VU (imports, options, open, SharedArray); setup runs once (log in test users, return JSON data); VU code runs every iteration (executors start iterations, which run requests and checks); teardown runs once (clean up data created by the test); the end of the test produces the summary or calls handleSummary. setup's data reaches every VU and teardown as a JSON copy. Thresholds are checked during the run over every sample so far, abortOnFail stops the test early, and checks never fail a test without a threshold. The run ends with exit code 0 when every threshold passed or 99 when one failed; other codes include 107 for a script error and 108 for test.abort.](k6-test-lifecycle.svg)

Two rules follow from the table. Init code cannot make HTTP requests, so
logins belong in `setup()` or in the VU code. And `setup()` can only pass
data (JSON), not functions; each VU receives its own copy.

### Not Node.js

k6 runs scripts in its own JavaScript runtime (Sobek) inside a Go binary,
and each VU has its own copy of that runtime. That has consequences:

- Node built-ins (`fs`, `process`, `Buffer` from Node) and npm packages are
  not available directly. k6 has its own modules (`k6/http`, `k6/data`,
  `k6/metrics`, `k6/execution`), imports local files and remote modules
  such as the jslib libraries at `jslib.k6.io`, and accepts code bundled
  from npm.
- k6 2.x runs `.ts` files directly; the TypeScript types are stripped, not
  checked, so run `tsc` separately if you want type checking.
- Memory grows with VUs. Data loaded with `open()` is copied into every
  VU; wrap large test data in a `SharedArray` so it is stored once, and set
  `discardResponseBodies` when the script never reads the bodies.
- Environment values arrive through `__ENV`: `-e NAME=value` on the command
  line, or the real environment variables of the process (passed through by
  default).

### Scenarios and executors

A **scenario** describes one workload: which function to run, with which
**executor**, at what load, starting when. A script can run several
scenarios at once, each with its own executor, tags, and environment.
k6 2.x has six executors:

| Executor | Model | You set | Good for |
|---|---|---|---|
| `constant-arrival-rate` | Open | Iterations per time unit, duration, VU budget | A fixed request rate (average-load, soak) |
| `ramping-arrival-rate` | Open | Stages of target rates, VU budget | Ramps, stress, spike, breakpoint |
| `constant-vus` | Closed | VUs and duration | A fixed population of users or workers |
| `ramping-vus` | Closed | Stages of target VUs | A population that grows and shrinks |
| `shared-iterations` | Closed | Total iterations shared by VUs | Running a fixed amount of work as fast as possible |
| `per-vu-iterations` | Closed | Iterations each VU must run | Each VU processing its own slice of data |

The `externally-controlled` executor, which let `k6 scale` and `k6 pause`
change a running test, was removed in k6 2.0. Every scenario also accepts
`startTime`, `gracefulStop` (30 seconds by default), `exec`, `env`, and
`tags`.

![Diagram: a decision flowchart for choosing a k6 executor. If the target is a rate in requests per second, use ramping-arrival-rate when the rate changes during the test, or constant-arrival-rate when it is fixed (both open models). Otherwise, if the real system has a fixed number of users or workers, use ramping-vus when the number changes, or constant-vus when it does not (closed models). Otherwise, if the test is a fixed amount of work, use per-vu-iterations when every VU must run the same count, or shared-iterations when all VUs share the total. If none applies, rephrase the question as a rate. k6 version 2 removed the externally-controlled executor.](k6-executor-choice.svg)

Arrival-rate executors need a **VU budget**: `preAllocatedVUs` are created
before the test, and k6 adds more up to `maxVUs` when iterations last
longer than expected. Creating VUs mid-test costs CPU and time, so a sudden
spike served by VUs that are still starting drops iterations. Size the
budget with Little's law (rate times iteration duration, see
[load testing fundamentals](load-testing-fundamentals.md)) and watch
`dropped_iterations`; when k6 runs out it logs `Insufficient VUs, reached
N active VUs and cannot initialize more`.

From k6 2.3, `--scenario name1,name2` runs only the named scenarios of a
script, and `--once` runs the script (or each selected scenario) with one
VU and one iteration, which is handy for checking a script before a long
run.

### Metrics k6 records

Every HTTP request produces several built-in metrics:

| Metric | Type | Meaning |
|---|---|---|
| `http_reqs` | Counter | Requests made |
| `http_req_duration` | Trend | Total request time: sending + waiting + receiving |
| `http_req_waiting` | Trend | Time to first byte, the server's share |
| `http_req_blocked`, `http_req_connecting`, `http_req_tls_handshaking` | Trend | Waiting for a connection slot, TCP connect, TLS handshake |
| `http_req_failed` | Rate | Share of responses not marked as expected (by default, statuses outside 200-399) |
| `checks` | Rate | Share of successful checks |
| `iterations`, `iteration_duration` | Counter, Trend | Completed iterations and their length |
| `dropped_iterations` | Counter | Iterations an arrival-rate executor could not start |
| `vus`, `vus_max` | Gauge | Active and allocated VUs |

Which statuses count as expected is configurable with
`http.setResponseCallback(http.expectedStatuses(...))` or a per-request
`responseCallback`; a `404` your test expects should not raise
`http_req_failed`. Custom metrics come from `k6/metrics` (`Counter`,
`Gauge`, `Rate`, `Trend`).

### Thresholds: the pass/fail gate

A **threshold** is a condition on a metric, in the form
`<aggregation> <operator> <value>`. The aggregations depend on the metric
type: `count` and `rate` for counters, `value` for gauges, `rate` for
rates, and `avg`, `min`, `max`, `med`, and `p(N)` for trends (in
milliseconds).

```text
http_req_failed: ["rate<0.001"]                          fewer than 0.1% failed requests
http_req_duration: ["p(95)<300", "p(99)<800"]           latency SLO
"http_req_duration{name:GET /tasks}": ["p(95)<300"]      one endpoint only (tag filter)
"checks{scenario:write}": ["rate>0.999"]                 one scenario only
dropped_iterations: ["count==0"]                         the planned load was delivered
http_req_duration: [{ threshold: "p(95)<1000", abortOnFail: true, delayAbortEval: "1m" }]
```

When any threshold fails, k6 marks it with a cross and exits with code
**99**; when all pass, it exits with 0. That exit code is the whole CI
integration. Three behaviours are worth knowing:

- **Thresholds are cumulative.** k6 computes each one from every sample
  since the start of the test, not over a sliding window. In a local check
  where the server slowed from 8 ms to 300 ms per query 20 seconds into a
  run, a median threshold with `abortOnFail` tripped at 40 seconds, when
  half of all samples were slow. For breakpoint tests, read the knee from
  the time series, not from the moment of the abort.
- **`abortOnFail` stops the test early** when a threshold is crossed;
  `delayAbortEval` waits until enough samples exist, so a few slow
  requests during warm-up do not end the run.
- **Thresholds on tagged sub-metrics** (`metric{tag:value}`) are how you
  hold each endpoint or scenario to its own target. They also make the
  summary print those sub-metrics.

### Checks

A **check** asserts something about a response (status, a header, a field
in the body) and records the result in the `checks` metric. A failing check
does **not** fail the test or stop the iteration; it is a counted
observation. To gate on checks, add a threshold such as
`checks: ["rate>0.999"]`. Use `fail()` from `k6` (or throw) when the
iteration genuinely cannot continue, such as a failed login in `setup()`.

### Tags, groups, and URL grouping

Every metric sample carries **tags**. k6 adds system tags such as
`method`, `status`, `url`, `name`, `group`, `check`, `scenario`, and
`expected_response`; you add your own per request (`tags: { name: ... }`),
per scenario (`tags` in the scenario), or for the whole run (`--tag
testid=nightly-42` or `options.tags`). Tags drive thresholds, summaries,
and dashboards.

The `name` tag matters most. By default it holds the full URL, so
`/tasks/6650f1c2...` and `/tasks/6650f1c3...` become different series, one
per task: useless in a summary and expensive in a metrics backend. Give
requests a route-template name (`tags: { name: "GET /tasks/:id" }`) or
build the URL with the `http.url` template tag, which strips the dynamic
parts from the name. This is the same cardinality rule as for application
metrics (see [metrics and dashboards](../monitoring-and-logging/metrics-and-dashboards.md)).

`group()` nests requests under a name (for example one user journey) and
records `group_duration`; the `group` tag holds the path such as
`::checkout`.

### Results and outputs

At the end of a run k6 prints a summary in `compact` mode by default;
`--summary-mode=full` adds per-group and per-scenario results, and
`--summary-mode=disabled` replaces the `--no-summary` flag removed in 2.0.
`--summary-trend-stats` chooses the statistics shown for trends (the
default is `avg, min, med, max, p(90), p(95)`), and `--summary-export`
writes the summary as JSON. A `handleSummary()` function replaces the
default output entirely and can write any files you like.

![Diagram: one k6 run feeds five destinations. The end-of-test summary or handleSummary writes results/summary.json, kept as a CI artifact and compared with the last baseline. The exit code, 0 for pass and 99 for a failed threshold, makes the CI step pass or fail. The web dashboard, enabled with K6_WEB_DASHBOARD=true, is live on localhost port 5665 or exports an HTML report with K6_WEB_DASHBOARD_EXPORT. File outputs with --out json or csv keep every sample for your own analysis. The opentelemetry output sends metrics to an OpenTelemetry Collector or a Prometheus OTLP receiver, and Grafana shows them next to the application's metrics. The influxdb and experimental-prometheus-rw outputs are deprecated since k6 2.4, with removal planned for k6 3.](k6-results-pipeline.svg)

| Output | How | Use |
|---|---|---|
| Web dashboard | `K6_WEB_DASHBOARD=true` (or `--out web-dashboard`); HTML report with `K6_WEB_DASHBOARD_EXPORT` | Watch a run live on port 5665; attach a self-contained report to CI |
| JSON or CSV files | `--out json=results/metrics.json`, `--out csv=results/metrics.csv` | Every sample, for offline analysis |
| OpenTelemetry | `-o opentelemetry`, configured with `K6_OTEL_*` variables | Stream metrics to a collector or Prometheus and view them in Grafana |
| Grafana Cloud k6 | `k6 cloud run`, or `k6 cloud run --local-execution` | Managed storage, comparison, and distributed load |
| Prometheus remote write, InfluxDB | `experimental-prometheus-rw`, `influxdb` | Deprecated in k6 2.4, planned for removal in k6 3; migrate to OpenTelemetry |

k6 does not create output directories. A missing `results/` directory makes
`--out csv` fail at start-up, and makes `handleSummary()` log "failed to
handle the end-of-test summary" while the run still exits with code 0, so
create the directory first. The dashboard report is skipped for very short
runs (it needs more than three update periods, 10 seconds each by default).

### Running k6 in CI

The usual split, as in
[testing and quality gates](../ci-cd/testing-and-quality-gates.md):

| When | Test | Against | Gate |
|---|---|---|---|
| Every pull request | Smoke, 1 VU for a minute | The API started inside the CI job | Fails the PR on any failed check or request |
| Nightly or before a release | Average-load, 25-30 minutes | The dedicated performance environment | Fails the run on SLO thresholds; report as an artifact |
| Before big events, monthly | Stress, spike, breakpoint, soak | The performance environment | Reviewed by a person; results feed capacity planning |

Two GitHub Actions help: `grafana/setup-k6-action` installs k6 (pin the
version with `k6-version`), and `grafana/run-k6-action` wraps `k6 run`
with glob patterns, `parallel` and `fail-fast` options, a `k6 inspect`
check of each script before it runs, and Grafana Cloud k6 integration when
`K6_CLOUD_TOKEN` is set. Plain `k6 run` after the setup action is enough
for most pipelines.

### Bigger loads and distributed runs

One k6 process can generate a lot of load, but every request still costs
CPU on the generator. When one host is not enough:

- split the test across hosts with `--execution-segment` and
  `--execution-segment-sequence`, so each host runs its share of every
  scenario;
- run it in Kubernetes with the **k6 Operator**, whose `TestRun` custom
  resource describes one test that the operator runs distributed across
  the cluster;
- or use **Grafana Cloud k6**, which runs the load from managed load zones.

### k6 compared with other tools

| | k6 | Apache JMeter | Gatling | Locust | Artillery |
|---|---|---|---|---|---|
| Tests written as | JavaScript or TypeScript | XML test plans (`.jmx`), usually built in a GUI | Java, Kotlin, Scala, or JavaScript/TypeScript code | Python code | YAML scenarios with JavaScript hooks |
| Runs on | A single Go binary | The JVM | The JVM (plus a JavaScript SDK) | Python | Node.js |
| Open model | Arrival-rate executors | Open Model Thread Group, Precise Throughput Timer | `injectOpen` (users per second) | Not built in: users loop with a `wait_time` | `arrivalRate` phases (new VUs per second) |
| Closed model | VU executors | Thread Groups | `injectClosed` (concurrent users) | Users with `wait_time` | Not built in; `maxVusers` only caps concurrency |
| CI pass/fail | Thresholds, exit code 99 | No built-in gate: parse the results file or use a wrapper such as Taurus | Assertions fail the simulation | `--exit-code-on-error` on any failure | `ensure` thresholds, non-zero exit |
| Licence | AGPL-3.0 | Apache 2.0 | Apache 2.0 (Community Edition) | MIT | MPL-2.0 (most of the code) |

All five are mature. Choose k6 when the team writes JavaScript and wants
tests as code with thresholds in CI; JMeter when you need its very wide
protocol support and plugin ecosystem, and run it in CLI mode (its own
documentation says not to load test in GUI mode); Gatling for JVM teams and
explicit open and closed injection profiles; Locust when the team works in
Python; Artillery for YAML-first scenarios and browser tests with
Playwright. Latest releases at the time of writing: JMeter 5.6.3, Gatling
3.16, Locust 2.47, and Artillery 2.0.

## When to use and when not to use

| Situation | Use k6? | Notes |
|---|---|---|
| HTTP, WebSocket, or gRPC APIs, tests reviewed as code | Yes | The core use case |
| Pass/fail performance budgets in CI | Yes | Thresholds and exit code 99 |
| Load from many regions or very high rates | Yes, distributed | Execution segments, the k6 Operator, or Grafana Cloud k6 |
| Real browser timings (Web Vitals) under light load | Yes, with the browser module | Browsers are heavy; keep browser VUs few and generate load with protocol VUs |
| A team fluent in Python or the JVM only | Consider Locust or Gatling | Use the language the team will maintain |
| Protocols k6 does not support natively | Check extensions, or JMeter | k6 extensions (xk6) cover some protocols |
| Finding which function is slow | No | Use a profiler; see [finding bottlenecks](finding-bottlenecks.md) |

## Practical examples

### Project layout

```text
perf/
  lib/
    taskflow.js       HTTP helpers: one function per endpoint, with checks and name tags
    workload.js       the production mix, setup(), and a load-shape helper
    summary.js        handleSummary(): terminal output plus results/summary.json
  data/
    users.json        test accounts (emails only; the password comes from the environment)
  smoke.js            1 VU for a minute, every endpoint
  average-load.js     the weekday peak for 20 minutes
  stress.js           twice the peak, then recovery
  spike.js            five times the peak in 30 seconds
  breakpoint.js       ramp until the SLO breaks
  soak.js             the peak for four hours
```

One workload, many shapes: the endpoint functions and the traffic mix live
in `lib/`, and each test file only states its load shape and thresholds.
`perf/data/users.json` is a JSON array of objects such as
`{ "email": "perf-user-1@example.com" }`.

### Endpoint helpers with checks and route names

```js
// perf/lib/taskflow.js: HTTP helpers shared by every TaskFlow load test
import http from "k6/http";
import { check, fail } from "k6";

export const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const JSON_HEADERS = { "Content-Type": "application/json" };

function params(token, name) {
  return {
    headers: { ...JSON_HEADERS, Authorization: `Bearer ${token}` },
    tags: { name }, // a route template, so /tasks/<id> URLs share one metric series
  };
}

export function login(email, password) {
  const res = http.post(`${BASE_URL}/auth/login`, JSON.stringify({ email, password }), {
    headers: JSON_HEADERS,
    tags: { name: "POST /auth/login" },
  });
  if (!check(res, { "login is 200": (r) => r.status === 200 })) {
    fail(`login failed for ${email}: HTTP ${res.status}`); // aborts setup, so the test stops
  }
  return res.json("token");
}

export function listTasks(token) {
  const res = http.get(`${BASE_URL}/tasks?status=open&limit=20`, params(token, "GET /tasks"));
  check(res, {
    "list is 200": (r) => r.status === 200,
    "list has a tasks array": (r) => Array.isArray(r.json("tasks")),
  });
  return res;
}

export function getTask(token, id) {
  const res = http.get(`${BASE_URL}/tasks/${id}`, params(token, "GET /tasks/:id"));
  check(res, { "get is 200": (r) => r.status === 200 });
  return res;
}

export function createTask(token, title) {
  const res = http.post(`${BASE_URL}/tasks`, JSON.stringify({ title }), params(token, "POST /tasks"));
  check(res, { "create is 201": (r) => r.status === 201 });
  return res;
}

export function updateTask(token, id, status) {
  const res = http.patch(`${BASE_URL}/tasks/${id}`, JSON.stringify({ status }), params(token, "PATCH /tasks/:id"));
  check(res, { "update is 200": (r) => r.status === 200 });
  return res;
}
```

Every request gets a route-template `name`, so thresholds and dashboards
can address `GET /tasks/:id` as one series. `res.json("tasks")` reads one
field of the JSON body with a path selector.

### The shared workload

```js
// perf/lib/workload.js: the TaskFlow production mix, shared by every load shape
import { SharedArray } from "k6/data";
import exec from "k6/execution";
import { login, listTasks, getTask, createTask, updateTask } from "./taskflow.js";

// Loaded once and shared by all VUs; passwords come from the environment, never the file.
const users = new SharedArray("test users", () => JSON.parse(open("../data/users.json")));

export function setup() {
  const tokens = [];
  for (const user of users) tokens.push(login(user.email, __ENV.TEST_USER_PASSWORD));
  return { tokens };
}

function tokenFor(data) {
  return data.tokens[exec.vu.idInTest % data.tokens.length];
}

// Reads: GET /tasks (62% of traffic), followed 37% of the time by GET /tasks/:id (23%).
export function browse(data) {
  const token = tokenFor(data);
  const tasks = listTasks(token).json("tasks") ?? [];
  if (tasks.length > 0 && Math.random() < 0.37) {
    getTask(token, tasks[Math.floor(Math.random() * tasks.length)].id);
  }
}

// Writes: POST /tasks (9%), followed 56% of the time by PATCH /tasks/:id (5%).
export function write(data) {
  const token = tokenFor(data);
  const res = createTask(token, `load test ${exec.scenario.iterationInTest}`);
  if (res.status === 201 && Math.random() < 0.56) updateTask(token, res.json("id"), "done");
}

// One load shape for both kinds of traffic. `peak: 1` is the weekday peak:
// 74 browse + 11 write iterations per second, about 120 requests/s.
export function scenarios(stages, { preAllocatedVUs = 50, maxVUs = 300 } = {}) {
  const at = (perSecondAtPeak) =>
    stages.map((s) => ({ duration: s.duration, target: Math.round(s.peak * perSecondAtPeak) }));
  const base = { executor: "ramping-arrival-rate", startRate: 0, timeUnit: "1s" };
  const quarter = (n) => Math.ceil(n / 4); // writes are 11 of every 85 iterations
  return {
    browse: { ...base, exec: "browse", preAllocatedVUs, maxVUs, stages: at(74) },
    write: { ...base, exec: "write", preAllocatedVUs: quarter(preAllocatedVUs), maxVUs: quarter(maxVUs), stages: at(11) },
  };
}

// The SLO as thresholds, plus a guard that the planned load was really delivered.
export const sloThresholds = {
  http_req_failed: ["rate<0.001"],
  "http_req_duration{name:GET /tasks}": ["p(95)<300", "p(99)<800"],
  "http_req_duration{name:GET /tasks/:id}": ["p(95)<200"],
  "http_req_duration{name:POST /tasks}": ["p(95)<400"],
  checks: ["rate>0.999"],
  dropped_iterations: ["count==0"],
};
```

What each part does:

- **`SharedArray`** reads `users.json` once for all VUs. `open()` resolves
  the path relative to the module that calls it, so `../data/users.json`
  from `lib/` finds `perf/data/users.json`.
- **`setup()`** logs every test user in once, before the load starts, and
  returns their tokens; each VU then uses one token chosen by its
  test-wide VU number (`exec.vu.idInTest`).
- **`browse` and `write`** reproduce the production mix: 74 browse and 11
  write iterations per second give about 74 + 27 + 11 + 6 = 118 requests
  per second at the peak.
- **`scenarios(stages)`** turns a list of stages, written as multiples of
  the peak, into two `ramping-arrival-rate` scenarios, so every load shape
  keeps the same mix.
- **`sloThresholds`** is the SLO, endpoint by endpoint, plus
  `dropped_iterations: ["count==0"]`, which fails the run when k6 could
  not deliver the planned load.

### The average-load test

```js
// perf/average-load.js: the expected weekday peak, held for 20 minutes
import { scenarios, sloThresholds } from "./lib/workload.js";
export { setup, browse, write } from "./lib/workload.js";
export { handleSummary } from "./lib/summary.js";

export const options = {
  scenarios: scenarios([
    { duration: "5m", peak: 1 },  // ramp up to about 120 requests/s
    { duration: "20m", peak: 1 }, // hold: read the results from this window
    { duration: "2m", peak: 0 },  // ramp down and watch recovery
  ]),
  thresholds: sloThresholds,
  tags: { test: "average-load" },
};
```

```js
// perf/lib/summary.js: keep the terminal summary and also write a JSON file for CI
import { textSummary } from "https://jslib.k6.io/k6-summary/0.1.0/index.js";

export function handleSummary(data) {
  return {
    stdout: textSummary(data, { indent: " ", enableColors: true }),
    // k6 does not create directories: run `mkdir -p results` first
    "results/summary.json": JSON.stringify(data, null, 2),
  };
}
```

```bash
mkdir -p results
k6 run -e BASE_URL=https://perf.taskflow.example.com perf/average-load.js
# TEST_USER_PASSWORD is read from the environment, never typed on the command line
```

The scenario functions are re-exported from the shared module, which is
how k6 finds `setup`, `browse`, and `write` by name. `handleSummary()`
replaces the default terminal output, so it prints the standard text
summary itself (with the jslib `textSummary` helper) as well as writing the
JSON file.

### A smoke test

```js
// perf/smoke.js: one user touching every endpoint for a minute
import { sleep } from "k6";
import { login, listTasks, getTask, createTask, updateTask } from "./lib/taskflow.js";

export const options = {
  vus: 1,
  duration: "1m",
  thresholds: {
    checks: ["rate==1"],        // every check must pass
    http_req_failed: ["rate==0"],
  },
};

export function setup() {
  return { token: login(__ENV.TEST_USER_EMAIL, __ENV.TEST_USER_PASSWORD) };
}

export default function ({ token }) {
  listTasks(token);
  const created = createTask(token, `smoke ${Date.now()}`);
  const id = created.json("id");
  getTask(token, id);
  updateTask(token, id, "done");
  sleep(1);
}
```

A smoke test is strict on correctness (every check, no failed requests) and
loose on latency; its job is to prove that the script, the test data, and
the environment work before anyone spends 30 minutes on a bigger run.

### Stress, spike, breakpoint, and soak with the same workload

```js
// perf/stress.js: twice the weekday peak for 20 minutes; it may degrade, it must not fall over
import { scenarios } from "./lib/workload.js";
export { setup, browse, write } from "./lib/workload.js";

export const options = {
  scenarios: scenarios([
    { duration: "5m", peak: 1 },
    { duration: "5m", peak: 2 },  // step to 2x (about 240 requests/s)
    { duration: "20m", peak: 2 },
    { duration: "5m", peak: 0 },  // recovery is part of the test
  ], { preAllocatedVUs: 100, maxVUs: 600 }),
  thresholds: {
    http_req_failed: ["rate<0.01"],    // degraded but serving: under 1% errors
    http_req_duration: ["p(95)<1000"],
    dropped_iterations: ["count==0"],
  },
  tags: { test: "stress" },
};
```

```js
// perf/spike.js: a push notification sends five times the peak in 30 seconds
import { scenarios } from "./lib/workload.js";
export { setup, browse, write } from "./lib/workload.js";

export const options = {
  scenarios: scenarios([
    { duration: "2m", peak: 0.5 },
    { duration: "3m", peak: 0.5 },
    { duration: "30s", peak: 5 },   // the surge
    { duration: "2m", peak: 5 },
    { duration: "30s", peak: 0.5 }, // back to normal: does latency recover?
    { duration: "5m", peak: 0.5 },
  ], { preAllocatedVUs: 400, maxVUs: 1500 }), // VUs started mid-spike arrive too late
  thresholds: {
    http_req_failed: ["rate<0.05"],
  },
  tags: { test: "spike" },
};
```

```js
// perf/breakpoint.js: ramp until the SLO breaks, then stop on our own
import { scenarios } from "./lib/workload.js";
export { setup, browse, write } from "./lib/workload.js";

export const options = {
  // 0 to 8 times the peak (about 960 requests/s) over 30 minutes
  scenarios: scenarios([{ duration: "30m", peak: 8 }], { preAllocatedVUs: 200, maxVUs: 2000 }),
  thresholds: {
    http_req_failed: [{ threshold: "rate<0.01", abortOnFail: true, delayAbortEval: "1m" }],
    http_req_duration: [{ threshold: "p(95)<1000", abortOnFail: true, delayAbortEval: "1m" }],
  },
  tags: { test: "breakpoint" },
};
```

```js
// perf/soak.js: the weekday peak for four hours, looking for slow leaks
import { scenarios, sloThresholds } from "./lib/workload.js";
export { setup, browse, write } from "./lib/workload.js";

export const options = {
  scenarios: scenarios([
    { duration: "10m", peak: 1 },
    { duration: "4h", peak: 1 },
    { duration: "5m", peak: 0 },
  ]),
  thresholds: sloThresholds,
  tags: { test: "soak" },
};
```

Notes on the shapes:

- **Stress** relaxes the thresholds to "degraded but serving", because the
  question is how the system fails, not whether it meets the normal SLO.
- **Spike** pre-allocates 400 VUs: at five times the peak, 370 browse
  iterations per second that slow to about a second each need roughly 370
  VUs, and VUs created during the surge start too late.
- **Breakpoint** stops itself when 1% of requests fail or p95 passes
  1 second. Because thresholds are cumulative, find the real knee in the
  time series (throughput against p95 per minute) rather than at the
  moment of the abort.
- **Soak** reuses the normal SLO; what you watch is the trend of memory,
  connections, and latency over the four hours, not the final summary.

### A pull-request smoke test in GitHub Actions

```yaml
# .github/workflows/perf-smoke.yml
name: perf-smoke
on:
  pull_request:
    paths: ["src/**", "perf/**", "package-lock.json"]

permissions:
  contents: read

jobs:
  k6-smoke:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    services:
      mongo:
        image: mongo:8.0
        ports: ["27017:27017"]
    env:
      MONGODB_URI: mongodb://localhost:27017/taskflow_perf
      PORT: "3000"
      BASE_URL: http://localhost:3000
      TEST_USER_EMAIL: perf-user-1@example.com
    steps:
      - uses: actions/checkout@v7
        with:
          persist-credentials: false
      - uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - name: Create a throwaway password for the seeded test users
        run: |
          pw="$(openssl rand -hex 16)"
          echo "::add-mask::$pw"
          echo "TEST_USER_PASSWORD=$pw" >> "$GITHUB_ENV"
      - name: Seed test data and start the API in the background
        run: |
          npm run seed:perf          # the project's seed script: test users and sample tasks
          npm start > api.log 2>&1 &
          curl --retry 30 --retry-connrefused --retry-delay 1 -fsS "$BASE_URL/healthz"
      - uses: grafana/setup-k6-action@v1
        with:
          k6-version: "2.4.0"
      - name: k6 smoke test (exit code 99 fails the job)
        run: |
          mkdir -p results
          k6 run --summary-export=results/smoke-summary.json perf/smoke.js
      - if: ${{ !cancelled() }}
        uses: actions/upload-artifact@v7
        with:
          name: k6-smoke
          path: |
            results/
            api.log
          retention-days: 7
```

The job starts its own MongoDB service container and TaskFlow API, so the
test never touches a shared environment and fork pull requests need no
secrets: the password for the seeded users is generated in the job and
masked in the logs. `curl --retry-connrefused` waits until the API answers
its health check. Pinning `k6-version` keeps a k6 upgrade from changing
results or breaking scripts without a reviewed change.

### A nightly average-load test against the performance environment

```yaml
# .github/workflows/perf-nightly.yml
name: perf-nightly
on:
  schedule:
    - cron: "30 1 * * 1-5"   # 01:30 UTC, Monday to Friday
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: perf-environment     # never two load tests against the same environment
  cancel-in-progress: false

jobs:
  average-load:
    runs-on: ubuntu-latest
    timeout-minutes: 45
    environment: perf
    env:
      BASE_URL: https://perf.taskflow.example.com
      TEST_USER_PASSWORD: ${{ secrets.PERF_TEST_PASSWORD }}
      K6_WEB_DASHBOARD: "true"
      K6_WEB_DASHBOARD_PORT: "-1"                  # no live server in CI, only the report
      K6_WEB_DASHBOARD_EXPORT: results/report.html
    steps:
      - uses: actions/checkout@v7
        with:
          persist-credentials: false
      - uses: grafana/setup-k6-action@v1
        with:
          k6-version: "2.4.0"
      - name: Average-load test
        run: |
          mkdir -p results
          k6 run --tag testid="nightly-${{ github.run_id }}" perf/average-load.js
      - if: ${{ !cancelled() }}
        uses: actions/upload-artifact@v7
        with:
          name: k6-average-load
          path: results/
          retention-days: 30
```

The `concurrency` group queues runs instead of letting two tests share the
performance environment and spoil each other's numbers. The artifact holds
`summary.json` (from `handleSummary()`) and the HTML dashboard report,
which can be opened without any server. With `grafana/run-k6-action@v1`
the test step becomes:

```yaml
# excerpt of a job using grafana/run-k6-action instead of a run step
      - run: mkdir -p results          # k6 still does not create it
      - uses: grafana/run-k6-action@v1
        with:
          path: perf/average-load.js
          flags: --tag testid=nightly-${{ github.run_id }}
          disable-analytics: true   # the action reports anonymous usage by default
```

### Sending results to Prometheus and Grafana

```bash
# Prometheus started with --web.enable-otlp-receiver accepts OTLP at /api/v1/otlp/v1/metrics
export K6_OTEL_EXPORTER_PROTOCOL=http/protobuf
export K6_OTEL_HTTP_EXPORTER_ENDPOINT=prometheus.perf.example.com:9090   # host:port, no scheme
export K6_OTEL_HTTP_EXPORTER_URL_PATH=/api/v1/otlp/v1/metrics
export K6_OTEL_HTTP_EXPORTER_INSECURE=true    # plain HTTP inside the private network
export K6_OTEL_METRIC_PREFIX=k6_
k6 run --tag testid=nightly-2026-11-14 -o opentelemetry perf/average-load.js
```

k6 exports trends as OpenTelemetry histograms and rates as counters with a
`condition` attribute; Prometheus stores them under `k6_`-prefixed names
(its OTLP translation adds unit and type suffixes). The `testid` tag, sent
as an attribute on every metric, lets a Grafana dashboard show one run at a
time, and putting k6 panels next to the API's own RED and saturation panels
is what turns "p95 rose at 300 requests per second" into a cause. The same
variables work with an OpenTelemetry Collector (the default protocol is
gRPC on `localhost:4317`).

## Best practices

- Keep load tests in the repository, reviewed like code, with one shared
  workload module and one small file per load shape.
- Express the SLO as thresholds, per endpoint where it matters, and add
  `dropped_iterations: ["count==0"]` to every arrival-rate test.
- Give every request a route-template `name` tag; never let raw URLs with
  IDs become metric names.
- Use arrival-rate executors for rate questions and size VUs with Little's
  law; pre-allocate enough for spikes.
- Gate on thresholds, not on checks alone; add a `checks` threshold.
- Pin the k6 version in CI and upgrade deliberately, reading the release
  notes (k6 2.0 removed commands, flags, and an executor).
- Create output directories before the run and upload the summary and HTML
  report as artifacts.
- Tag each run (`--tag testid=...`) and stream metrics next to the
  application's dashboards.
- Keep secrets out of scripts and data files; pass them through the
  environment.
- Smoke test every script change before running long tests.

## In production

- **Scripts stop working after a k6 upgrade.**
  *Detect:* CI fails with an unknown executor, flag, or command right after
  the runner picked up a new k6 version. *Cause:* k6 2.0 removed
  `externally-controlled`, `--no-summary`, `k6 login`, and `k6 cloud
  script.js`, and requires a stack for every `k6 cloud` command. *Fix:* pin
  `k6-version`, migrate to `--summary-mode=disabled`, `k6 cloud login`, and
  `k6 cloud run`, and upgrade on purpose.
- **The run "passed" but the planned load never arrived.**
  *Detect:* `dropped_iterations` above zero, achieved requests per second
  below the plan, "Insufficient VUs" warnings in the log. *Cause:* too
  small a VU budget, or VUs created too late during a spike. *Fix:* raise
  `preAllocatedVUs` and `maxVUs` using Little's law, and add
  `dropped_iterations: ["count==0"]` so this fails the run.
- **The metrics backend slows down or runs out of memory during tests.**
  *Detect:* the number of k6 series in Prometheus jumps by thousands per
  run. *Cause:* requests without a `name` tag, so every task ID is a new
  series, or high-cardinality custom tags. *Fix:* route-template names or
  `http.url`, and no IDs in tags.
- **Latency gets worse as the load generator gets busier.**
  *Detect:* the generator's CPU is near 100%, `http_req_blocked` grows, and
  server-side latency stays flat. *Cause:* the generator is saturated:
  heavy JSON parsing in checks, large response bodies, too many VUs per
  host. *Fix:* `discardResponseBodies` where bodies are not needed, lighter
  checks, and more generator hosts (execution segments, the k6 Operator,
  or Grafana Cloud k6).
- **The CI artifact with the summary is missing.**
  *Detect:* the upload step finds no `results/summary.json`, while the k6
  step was green. *Cause:* the directory did not exist; `handleSummary()`
  logged an error but k6 still exited with 0. *Fix:* `mkdir -p results`
  before the run, and fail the job if the artifact is missing.
- **A breakpoint test aborts long after the system broke.**
  *Detect:* per-minute dashboards show p95 rising well before the abort
  time. *Cause:* thresholds aggregate every sample since the start, so a
  long healthy ramp dilutes the slow tail. *Fix:* take the knee from the
  time series; use tighter percentiles for `abortOnFail`; keep the
  thresholds as a safety stop, not as the measurement.

## Important terminology

- **Virtual user (VU):** One k6 JavaScript runtime executing iterations.
- **Iteration:** One run of the scenario's function.
- **Scenario:** A named workload: function, executor, load, timing, tags.
- **Executor:** The scheduler that decides how VUs and iterations run.
- **Threshold:** A pass/fail condition on a metric; a failure makes k6 exit
  with code 99.
- **Check:** An assertion on a response, counted in the `checks` metric,
  which does not stop the test by itself.
- **Tag:** A key-value label on every metric sample, used for filtering.
- **Sub-metric:** A metric filtered by tags, such as
  `http_req_duration{name:GET /tasks}`.
- **Group:** A named block of requests with its own `group_duration`.
- **SharedArray:** Read-only test data stored once and shared by all VUs.
- **`setup()` / `teardown()`:** Functions that run once before and after
  the load.
- **`handleSummary()`:** A function that replaces the end-of-test summary
  output.
- **Output:** A destination for metrics during the run (files,
  OpenTelemetry, the web dashboard).
- **Dropped iteration:** An iteration an arrival-rate executor could not
  start on time.
- **k6 Operator:** A Kubernetes operator that runs distributed k6 tests
  from a `TestRun` resource.

## Common mistakes and misconceptions

- Treating checks as assertions that fail the test; without a threshold
  they only count.
- Using `constant-vus` with no think time to answer "can we handle 500
  requests per second?".
- Leaving raw URLs as the `name` tag and drowning the summary and the
  metrics backend in series.
- Assuming k6 is Node.js and trying to import npm packages or `fs`.
- Loading large data with `open()` in every VU instead of a `SharedArray`.
- Reading a breakpoint result from the abort time instead of the time
  series.
- Running the latest k6 in CI without pinning, and finding out about
  breaking changes from a red pipeline.
- Forgetting that `handleSummary()` replaces the terminal summary unless it
  prints one itself.
- Writing passwords or tokens into scripts and data files.

## Revision questions

1. In which lifecycle stage would you log in test users, and why not in the
   init code?
2. Which executor would you use to hold 150 requests per second for 30
   minutes, and which to model a pool of 20 workers?
3. An arrival-rate scenario runs 200 iterations per second. Iterations take
   250 ms at the median and up to 1.5 s when the system struggles. How many
   VUs should you pre-allocate, and what `maxVUs` keeps the load honest when
   it struggles? (About 200 x 0.25 = 50 plus headroom, say 60-80; at least
   200 x 1.5 = 300 for `maxVUs`.)
4. Write thresholds for "p95 of `POST /tasks` under 400 ms, fewer than 0.1%
   failed requests, and all planned iterations delivered".
5. Why does a failing check not fail a k6 test, and how do you make it?
6. What does the `name` tag do, and what goes wrong without it?
7. A nightly k6 job is green but uploads no summary file. What happened?
8. Why might `abortOnFail` stop a breakpoint test much later than the
   moment the system actually broke?

## Further learning

- [Grafana k6 documentation](https://grafana.com/docs/k6/latest/)
- [k6: Scenarios](https://grafana.com/docs/k6/latest/using-k6/scenarios/) and
  [executors](https://grafana.com/docs/k6/latest/using-k6/scenarios/executors/)
- [k6: Thresholds](https://grafana.com/docs/k6/latest/using-k6/thresholds/)
- [k6: OpenTelemetry output](https://grafana.com/docs/k6/latest/results-output/real-time/opentelemetry/)
- [k6: Web dashboard](https://grafana.com/docs/k6/latest/results-output/web-dashboard/)
- [k6 releases on GitHub](https://github.com/grafana/k6/releases)
- [grafana/setup-k6-action](https://github.com/grafana/setup-k6-action) and
  [grafana/run-k6-action](https://github.com/grafana/run-k6-action)
- Next: [finding bottlenecks](finding-bottlenecks.md). Back to the
  [performance and reliability testing overview](../performance-and-reliability-testing.md).
