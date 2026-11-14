# Performance and Reliability Testing Cheat Sheet

Quick revision of the performance and reliability testing lessons, for the
day before an interview, a load test, or a game day.

## Key configuration

```js
// perf/average-load.js (the shape of an open-model test with an SLO gate)
export const options = {
  scenarios: {
    list_tasks: {
      executor: "ramping-arrival-rate", // open model: N iterations per second
      startRate: 10,
      timeUnit: "1s",
      preAllocatedVUs: 50,              // rate x iteration time, plus headroom
      maxVUs: 200,
      stages: [
        { target: 120, duration: "5m" },  // ramp up
        { target: 120, duration: "20m" }, // plateau: read the results here
        { target: 0, duration: "2m" },    // ramp down and watch recovery
      ],
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.001"],
    "http_req_duration{name:GET /tasks}": ["p(95)<300", "p(99)<800"],
    checks: ["rate>0.999"],             // checks alone never fail a run
    dropped_iterations: ["count==0"],   // the planned load was delivered
  },
};
```

## Key commands

| Command | What it does |
|---|---|
| `k6 run -e BASE_URL=<url> perf/average-load.js` | Runs a test; exits 0 if all thresholds pass, 99 if one fails |
| `k6 run --scenario browse,write <script>` | Runs only the named scenarios (k6 2.3+) |
| `k6 run --once <script>` | One VU, one iteration: checks a script before a long run |
| `K6_WEB_DASHBOARD=true K6_WEB_DASHBOARD_EXPORT=results/report.html k6 run <script>` | Dashboard on port 5665 and an HTML report |
| `k6 run -o opentelemetry --tag testid=nightly-42 <script>` | Streams metrics to a Collector or Prometheus |
| `node --cpu-prof --cpu-prof-dir=./profiles src/server.js` | Writes a `.cpuprofile` when the process exits |
| `db.tasks.find(...).explain("executionStats")` | Compare `nReturned` with keys and docs examined |
| `toxiproxy-cli toxic add --type latency --attribute latency=1000 notifications` | Adds 1 s of latency (`latency_downstream`) |
| `aws fis start-experiment --experiment-template-id <id>` | Starts an FIS experiment; `stop-experiment` aborts it |

## Decision guide

| If you need | Choose | Why |
|---|---|---|
| "Can we serve 120 requests/s?" | `constant-arrival-rate` or `ramping-arrival-rate` | Open model: load holds when the server slows |
| A fixed pool of users or workers | `constant-vus` or `ramping-vus` | Closed model: the real system waits too |
| A script and environment check | Smoke test, 1-2 VUs, 1-2 minutes | Cheap before a long run |
| The SLO at the expected peak | Average-load test | Ramp, plateau, ramp down |
| The real capacity | Step or breakpoint test, read per minute | Thresholds are cumulative |
| Slow leaks | Soak test for hours | Memory, connections, disk stay flat |
| ELU near 100% | CPU profile under load (`--cpu-prof`, 0x) | CPU-bound JavaScript or GC |
| ELU low, latency high | Pool waits, slow query log, `explain()` | Waiting on I/O, not CPU |
| A timeout tested in CI | Toxiproxy | Real TCP faults on every build |
| Pod faults in Kubernetes | Chaos Mesh or LitmusChaos | CNCF incubating, custom resources |
| An AWS fault with an automatic stop | AWS FIS with CloudWatch alarms | Up to five alarms per template |
| Practised responders | A tabletop, then a game day | Tests alerts, runbooks, and roles |

## Numbers and defaults to remember

- Little's law, `L = λ × W`: a closed model needs 120/s × (0.15 + 4.85 s)
  = 600 VUs; at 1.15 s the same VUs send 600 / 6.0 = 100/s, 17% less.
- Arrival-rate VUs ≈ rate × iteration time: 200/s × 0.25 s = 50 plus
  headroom; 200/s × 1.5 s = 300 for `maxVUs`.
- Busy pool connections = requests/s × queries per request × seconds per
  query: 120 × 2 × 0.080 = 19.2 of a pool of 20.
- k6 exit codes: 0 passed, 99 a threshold failed, 97 a cloud run aborted
  for another reason (since 2.0), 107 a script error, 108 `test.abort()`.
- k6 defaults: `gracefulStop` 30 s; `compact` summary; trend stats avg,
  min, med, max, p(90), p(95); `http_req_failed` counts statuses outside
  200-399; dashboard updates every 10 s.
- k6 2.0 (May 2026) removed `externally-controlled`, `k6 login`, and
  `--no-summary` (use `--summary-mode=disabled`); 2.4 deprecated the
  `influxdb` and `experimental-prometheus-rw` outputs.
- Load generator: CPU under about 80% and `dropped_iterations` at 0.
- Node.js: `--cpu-prof` samples every 1,000 µs; an idle loop's delay is
  about the sampler resolution (10 ms; 15.6 ms on Windows).
- MongoDB: `slowms` 100 ms; Node.js driver `maxPoolSize` 100 and
  `waitQueueTimeoutMS` 0 (no limit).

## Top mistakes

- **Closed-loop VUs for a rate question.** Use an arrival-rate executor;
  a closed loop eases off and hides slow periods (coordinated omission).
- **Gating on checks alone.** Add a `checks` threshold; a failed check
  only counts.
- **Raw URLs as metric names.** Tag route templates (`GET /tasks/:id`) or
  use `http.url`.
- **Ignoring dropped iterations.** Gate on `count==0` and size VUs with
  Little's law.
- **Reading capacity from the abort time.** Read the knee from the time
  series; `abortOnFail` is only a safety stop.
- **An unpinned k6 in CI.** Pin `k6-version` in `grafana/setup-k6-action`
  and run `mkdir -p results` first: a failed summary write still exits 0.
- **A bigger pool for a saturated database.** Fix the slow query (an ESR
  index), then size the pool.
- **Chaos without a stop.** Start in CI and staging, watch steady state,
  and test the abort first.

## Where to go deeper

- [Load testing fundamentals](load-testing-fundamentals.md)
- [Load testing with k6](load-testing-with-k6.md)
- [Finding bottlenecks](finding-bottlenecks.md)
- [Chaos engineering and game days](chaos-engineering-and-game-days.md)
- [Performance and reliability testing interview questions and answers](interview-questions-and-answers.md)

Back to the [performance and reliability testing overview](../performance-and-reliability-testing.md).
