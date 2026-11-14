# Performance and Reliability Testing Interview Questions and Answers

These questions review load-testing fundamentals, load testing with k6,
finding bottlenecks, and chaos engineering and game days. Try answering
each one before reading the answer.

## Load testing fundamentals

### 1. What are smoke, average-load, stress, spike, soak, and breakpoint tests?

They are the same script driven by different load shapes. A smoke test
runs minimal load for a minute or two to prove the script and environment
work. An average-load test holds the expected peak to check the SLO. A
stress test goes above the peak to see how the system degrades. A spike
test jumps to several times normal in seconds. A soak test holds normal
load for hours to find leaks. A breakpoint test ramps until something
breaks, to find capacity.

### 2. Why run a smoke test before any bigger test?

A broken script, missing test data, or a misconfigured environment wastes
a 30-minute run and produces meaningless numbers. A smoke test with one or
two VUs and strict checks (every check passes, no failed requests) proves
the plumbing in a minute.

### 3. What is the difference between an open and a closed workload model?

In a closed model, a fixed number of virtual users each send a request,
wait for the response, think, and repeat, so throughput is
`VUs / (response time + think time)` and drops when the server slows. In
an open model, requests (or sessions) arrive at a set rate regardless of
responses, so a slow server accumulates requests in flight, as it would
with real independent users.

### 4. Which model fits a public API, and why?

An open model. Internet users arrive independently and do not wait for
each other, so the arrival rate does not fall when the API slows down. A
closed model eases off exactly when the server struggles and understates
the problem. Closed models fit fixed populations, such as a pool of 20
worker processes or a team using an internal tool.

### 5. What is think time, and why does it matter?

The pause between one user's actions, such as reading a page before
clicking. Without it, each VU sends requests back to back, so a few VUs
generate as much traffic as thousands of real users and the VU count stops
meaning anything. Think time should be randomized (for example 2-6
seconds) and taken from production where possible.

### 6. What is coordinated omission?

A measurement error in closed-loop load generators. When the server
pauses, each VU is stuck on one request and sends nothing else, so the
pause is recorded once per VU instead of once for every request real users
would have sent. In a local test against a server pausing 500 ms every 5
seconds, a 2-VU closed loop reported p99 of 22-36 ms while an open model at
120 requests per second reported 468-475 ms.

### 7. How do you avoid coordinated omission?

Use an open model (arrival-rate executors) when the question is a rate;
check that the planned load was delivered (achieved against intended
throughput, `dropped_iterations` at zero); distrust p99 values from
closed-loop benchmarks with few connections and no think time; or use
tools that measure from the intended send time, as wrk2 does.

### 8. State Little's law and use it to size a closed-model test.

`L = λ × W`: the number in the system equals the arrival rate times the
time each one stays. To offer 200 requests per second when each iteration
is one request with 0.1 s of response and 2.9 s of think time, W = 3.0 s,
so L = 200 × 3.0 = 600 VUs. If responses slow to 1.1 s, W = 4.0 s and the
same 600 VUs send only 600 / 4.0 = 150 requests per second.

### 9. How many VUs does an arrival-rate scenario need?

About the rate times the iteration duration, plus headroom; k6 documents
it as `preAllocatedVUs = median iteration duration × rate + a constant for
variance`. At 200 iterations per second and 0.25 s per iteration that is
50 VUs plus headroom, but if iterations slow to 1.5 s it needs 300, so set
`maxVUs` for the slowest latency you want to measure honestly.

### 10. Where should the endpoint mix, peak rate, and think time come from?

From production: request counts per route during the busiest hour, the
busiest five-minute rate over recent weeks, and the time between requests
within user sessions from logs. Guessed mixes miss expensive endpoints,
and planning from averages misses the peak.

### 11. Why does the size of the test data matter?

With small data, every index and document fits in memory, caches hit
almost every time, and queries are fast. Production-sized data (including
heavy users with thousands of records) exercises disk, index selectivity,
and memory pressure. A test on a tiny dataset can pass at a rate that
production cannot sustain.

### 12. What should you measure during a load test?

On the client side: achieved throughput against the target, latency
percentiles per endpoint, error rate by type, failed checks, and dropped
iterations. On the server side: RED metrics per route and USE metrics per
resource (CPU, event loop, memory and GC, connection pools, database,
dependencies). Read time series, not only the end-of-test summary.

### 13. How do you know the load generator is not the bottleneck?

Watch its CPU (keep it below roughly 80%), memory, and network; check that
`dropped_iterations` is zero and the achieved rate matches the target. A
large gap between client-side and server-side latency, with idle servers,
also points to the generator or something in front of the application.

### 14. How do you compare two load-test runs fairly?

Same script, data snapshot, environment sizes, configuration, and warm-up;
compare the same steady-state window and exclude the ramps; run important
tests at least twice to know the run-to-run spread; record the version of
the system under test; and change one thing at a time.

## Load testing with k6

### 15. What runs in k6's init code, `setup()`, VU code, and `teardown()`?

Init code (top level) runs once per VU: imports, options, `open()` of
files, `SharedArray`. `setup()` runs once before the load, for example to
log in test users, and returns JSON data. The VU code runs once per
iteration and receives a copy of that data. `teardown()` runs once at the
end. Init code cannot make HTTP requests.

### 16. Is k6 Node.js? What follows from that?

No. k6 is a Go binary with its own JavaScript runtime, one per VU. Node
built-ins and npm packages are not available directly; k6 has its own
modules and can import local files, remote modules such as jslib, and
bundled code. k6 2.x runs TypeScript files directly by stripping the
types. Memory grows with VUs, so large data belongs in a `SharedArray`.

### 17. Which executors does k6 2.x have?

Six: `constant-arrival-rate` and `ramping-arrival-rate` (open model), and
`constant-vus`, `ramping-vus`, `shared-iterations`, and
`per-vu-iterations` (closed model). The `externally-controlled` executor
was removed in k6 2.0.

### 18. What is a threshold, and how does it fail a build?

A pass/fail condition on a metric, such as
`http_req_duration: ["p(95)<300"]` or `http_req_failed: ["rate<0.001"]`.
If any threshold fails, k6 exits with code 99, which fails the CI step;
when all pass, it exits with 0.

```js
// perf/thresholds-example.js: the SLO as thresholds
export const options = {
  thresholds: {
    http_req_failed: ["rate<0.001"],
    "http_req_duration{name:GET /tasks}": ["p(95)<300", "p(99)<800"],
    dropped_iterations: ["count==0"],
  },
};
export default function () {}
```

### 19. Do failed checks fail a k6 test?

No. A check records a pass or fail in the `checks` metric and the
iteration continues. To gate on checks, add a threshold such as
`checks: ["rate>0.999"]`. Use `fail()` or throw when an iteration cannot
continue, for example after a failed login in `setup()`.

### 20. Why give requests a `name` tag?

By default the `name` tag holds the full URL, so `/tasks/<id>` creates one
metric series per task: an unreadable summary and a cardinality problem
for any metrics backend. A route-template name such as `GET /tasks/:id`,
or the `http.url` template tag, groups them into one series that
thresholds and dashboards can use.

### 21. How do you set a threshold for one endpoint or one scenario?

Put a tag filter in the metric name to create a sub-metric:
`"http_req_duration{name:POST /tasks}": ["p(95)<400"]` or
`"checks{scenario:write}": ["rate>0.999"]`. The summary then prints that
sub-metric too, which is why always-true thresholds are sometimes added
just to display per-scenario numbers.

### 22. What does `abortOnFail` do, and why can it fire late?

It stops the test as soon as a threshold is crossed, optionally after
`delayAbortEval` so warm-up samples do not trigger it. It can fire late
because thresholds are computed over every sample since the start of the
test, not a sliding window: a long healthy ramp dilutes the slow samples.
In a local check, a median threshold tripped 20 seconds after the server
actually degraded.

### 23. What is `dropped_iterations`, and how do you gate on it?

A counter of iterations an arrival-rate executor could not start on time,
usually because it ran out of VUs; k6 also logs "Insufficient VUs". A run
with dropped iterations did not deliver the planned load. Gate with
`dropped_iterations: ["count==0"]` and size `preAllocatedVUs` and
`maxVUs` with Little's law.

### 24. How do you share test data between VUs efficiently?

Load it once in a `SharedArray` in the init context:
`new SharedArray("users", () => JSON.parse(open("./data/users.json")))`.
Without it, every VU holds its own copy of the file. Keep secrets out of
the data files and pass them through environment variables.

### 25. How would you run k6 in CI?

A short smoke test on every pull request against the API started inside
the job, and longer average-load tests on a schedule against a dedicated
performance environment. Install a pinned k6 version with
`grafana/setup-k6-action`, run `k6 run`, rely on exit code 99 to fail the
job, create the results directory first, and upload the summary and HTML
report as artifacts. Use a concurrency group so two tests never share the
environment.

### 26. How do you get k6 results into Grafana dashboards?

Use the OpenTelemetry output (`-o opentelemetry`) to send metrics to an
OpenTelemetry Collector or to Prometheus's OTLP receiver (Prometheus
started with `--web.enable-otlp-receiver`), then chart them next to the
application's own metrics. Tag each run with `--tag testid=...`. The
InfluxDB and Prometheus remote-write outputs were deprecated in k6 2.4 and
are planned for removal in k6 3. For a single run, the built-in web
dashboard can export a self-contained HTML report.

### 27. What changed in k6 2.0 that can break a pipeline?

The `externally-controlled` executor, `k6 login`, `--no-summary`
(use `--summary-mode=disabled`), the `legacy` summary mode, and the
`k6 cloud script.js` form (use `k6 cloud run`) were removed; every
`k6 cloud` command needs a stack; and cloud runs aborted for reasons other
than thresholds now exit with 97 instead of 0. Pin the k6 version in CI and
upgrade deliberately.

### 28. How does k6 compare with JMeter, Gatling, Locust, and Artillery?

k6 uses JavaScript or TypeScript tests, one Go binary, open and closed
executors, and thresholds with an exit code for CI. JMeter uses XML test
plans built in a GUI and run in CLI mode, with a huge plugin ecosystem.
Gatling uses Java, Kotlin, Scala, or JavaScript code with explicit open
and closed injection profiles and assertions. Locust uses Python users
with wait times. Artillery uses YAML scenarios with arrival-rate phases and
`ensure` thresholds. Choose the one your team will maintain.

## Finding bottlenecks

### 29. What is a bottleneck, and why does fixing one reveal another?

The first resource to saturate as load rises; it caps the throughput of
the whole system. Once it is fixed, load can rise until the next resource
saturates, so capacity grows in steps and each fix should be followed by
the same test again.

### 30. Explain the USE method and apply it to a database connection pool.

For every resource, check utilization, saturation, and errors. For a
connection pool: utilization is connections in use against `maxPoolSize`,
saturation is the number of requests waiting and their checkout wait time,
and errors are checkout timeouts. USE complements RED, which tells you
which endpoint hurts.

### 31. How do you find the knee of the latency curve?

Run a step test that raises the offered rate and holds each step. Below
the limit, achieved throughput follows the offered load and latency is
flat; at the knee, throughput stops following and p95 rises sharply. In a
local step test against a 5-connection pool with roughly 21 ms queries,
throughput plateaued at about 232 requests per second (5 / 0.0215 is
about 233) while p95 rose from 40 ms to 726 ms.

### 32. What are event-loop utilization and event-loop delay?

ELU is the share of time the Node.js event loop is busy running code,
from `performance.eventLoopUtilization()`. Event-loop delay is how late
timers fire, from `monitorEventLoopDelay()`; long synchronous work delays
every request in the process. Each delay sample includes the sampling
interval, so an idle loop reports roughly the resolution.

### 33. ELU is low, but latency is high under load. Where do you look?

The process is waiting, not computing: look at connection pool waits,
slow queries and database saturation, slow dependencies in traces, and
locks. A CPU profile would show mostly idle time. More CPU will not help.

### 34. How do you CPU-profile a Node.js service under load?

Start it with `node --cpu-prof --cpu-prof-dir=./profiles`, apply a steady
realistic load, then stop it so it exits normally; the profile is written
before exit, so the server needs a shutdown handler that calls
`process.exit()`. Open the `.cpuprofile` in Chrome DevTools or VS Code,
or summarize self time per function with a script.

### 35. How do you read a flame graph?

The x-axis is the population of samples sorted alphabetically, not time;
the y-axis is stack depth, with callers below callees; width is how often a
frame was on the stack. The top edges are what was running, so wide
plateaus at the top are where CPU time goes. A flame chart, as in
DevTools, puts time on the x-axis instead.

### 36. What are Clinic.js and 0x, and should you use them?

Both build on Node's profiling. 0x writes an interactive flame graph from
a single command and supports Node.js 20 and later. Clinic.js (Doctor,
Flame, Bubbleprof, Heap Profiler) carries a notice that it is not being
actively maintained and may give inaccurate results on current Node.js;
its last release was in 2023. Prefer `--cpu-prof`, 0x, or a continuous
profiler for new work.

### 37. How do you recognize garbage-collection pressure?

Latency spikes that line up with major collections, a large share of time
in the `(garbage collector)` frame or in `nodejs_gc_duration_seconds`, and
a heap that saws up and down fast or keeps a rising floor. Allocate less
per request, bound caches, and use heap snapshots for leaks; raising the
heap limit only delays a leak.

### 38. How does `explain()` reveal a missing index, and what is ESR?

Compare `nReturned` with `totalKeysExamined` and `totalDocsExamined`:
returning 20 documents after examining 41,200 means the index does not
fit the query; `COLLSCAN` is a full scan and `SORT` is an in-memory sort.
The ESR guideline orders compound index fields as Equality, Sort, Range,
so `{ ownerId, status }` sorted by `dueDate` wants
`{ ownerId: 1, status: 1, dueDate: 1 }`.

### 39. How does Little's law apply to a connection pool?

Busy connections = requests per second × queries per request × seconds
per query. At 100 requests per second, 2 queries each, and 50 ms per
query, 100 × 2 × 0.05 = 10 connections are busy on average, so a pool of
10 is saturated and requests queue; if the queries drop to 5 ms, only 1
connection is busy.

### 40. Why can raising `maxPoolSize` make things worse?

If queries are slow because the database is saturated, a bigger pool sends
more concurrent work to it, and every query gets slower. More instances
multiply the effect, since each has its own pool. Fix the slow queries
first, and raise the pool only when the database has headroom.

### 41. How do you catch N+1 queries before production?

Count database commands per request in an integration test, with command
monitoring enabled (`monitorCommands: true` and `commandStarted` events),
and assert that the count does not grow with the page size, for example
the same number of `find` commands for 5 and 50 tasks. Fix N+1 with a
batched `$in` query, `$lookup`, or embedding.

## Chaos engineering and game days

### 42. What is chaos engineering?

In the words of principlesofchaos.org, "the discipline of experimenting on
a system in order to build confidence in the system's capability to
withstand turbulent conditions in production". You define steady state,
hypothesize that it holds, inject real-world faults, and try to disprove
the hypothesis.

### 43. What is steady state, and what makes a good hypothesis?

Steady state is a measurable, user-visible output such as a success rate
or a latency percentile. A good hypothesis is specific and falsifiable:
"If one of three API instances is terminated, the 5xx rate rises by less
than 0.1 percentage points because the load balancer and Auto Scaling
group replace it." Do not run experiments you already expect to fail; fix
the known weakness first.

### 44. What is the blast radius, and how do you limit it?

How much of the system, and how many users, an experiment can affect.
Limit it by environment (test, staging, then production), scope (one pod,
one instance, a small percentage of traffic), duration, stop conditions,
a tested abort, timing (working hours, off-peak), and announcing the
experiment.

### 45. What are stop conditions?

Guardrails that end an experiment automatically when a metric crosses a
threshold. AWS FIS uses CloudWatch alarms, up to five per experiment
template; with other tools, an alert on steady state and a person with a
tested abort command play the same role.

### 46. Which faults would you inject first for an API like TaskFlow?

Faults that really happen, ranked by frequency and impact: losing one
instance or pod, latency and failure in a non-critical dependency (such as
a notification service), a database primary failover, and later the loss
of a zone. Past incidents are the best source of experiments.

### 47. Compare the main chaos tools.

Chaos Monkey randomly terminates instances and containers in production
and requires Spinnaker. AWS Fault Injection Service is a managed service
with experiment templates and CloudWatch stop conditions. Azure Chaos
Studio is the Azure equivalent. Gremlin is a commercial platform.
LitmusChaos and Chaos Mesh are CNCF incubating projects for Kubernetes.
Toxiproxy is a TCP proxy for injecting network faults in tests and CI.

### 48. How does Toxiproxy work?

It is a TCP proxy placed between your code and a dependency, controlled
through an HTTP API (port 8474) or `toxiproxy-cli`. You create a proxy
(listen address and upstream) and add toxics such as `latency`, `timeout`,
`reset_peer`, `bandwidth`, or `packet_loss`, or disable the proxy to make
the dependency unreachable. It is ideal for integration tests that prove
timeouts and fallbacks work.

### 49. What is a game day, and how do you run one?

A planned exercise where a team injects a failure into a real system and
practises the response. It needs a written plan (scenario, hypothesis,
blast radius, abort rules), roles (facilitator, operators who are normally
on call, a scribe, a communications lead), a baseline, the injection, a
hot debrief, and a written blameless review within a week.

### 50. How should a team start with chaos engineering?

Small: a tabletop exercise, then fault-injection tests with Toxiproxy in
CI, then experiments under load in a performance environment, then a game
day in staging and production with stop conditions, and finally automated
small experiments in production. Climb to the next rung only when the
current one has become boring.

### 51. What do you do with the findings of an experiment or game day?

Record the outcome with evidence, turn every weakness into a tracked
action with an owner and a date, fix it, re-run the experiment, and
automate it as a regression test. Update runbooks, alerts, and dashboards
with what responders needed, and share the lessons with other teams.

### 52. When should you not run a chaos experiment?

When there is no monitoring of steady state, when you already know the
system will fail, when it has a single point of failure by design, during
an incident or freeze, or without a tested stop condition and rollback.

## Scenario-based questions

### 53. A load test passed at 300 requests per second, but production failed at 200 during a launch. What do you check?

**What to check first:** how the test differed from production: data
volume, endpoint mix, cache state, and workload model.

**How to confirm:** compare the failing endpoints and queries in
production with the test's request mix, and the test database's size with
production's.

**Likely causes and fixes:** a small dataset that fit in memory, a missing
expensive endpoint, warm caches, or a closed model that eased off. Use
production-sized data, the real mix and peak, an open model, and a
cold-cache test. See
[load testing fundamentals](load-testing-fundamentals.md).

### 54. k6 reports a p99 of 40 ms, but users complain about multi-second freezes. Why?

**What to check first:** the executor type and the run's maximum latency.

**How to confirm:** a closed executor with few VUs and no think time, a
maximum far above the p99, and server-side event-loop delay or GC spikes
at the same times.

**Likely causes and fixes:** coordinated omission: the closed loop
recorded each freeze once per VU. Re-run with an arrival-rate executor,
check `dropped_iterations`, and find the source of the freezes (a long
synchronous task or GC). See
[load testing fundamentals](load-testing-fundamentals.md).

### 55. Throughput plateaus at 180 requests per second while the API servers sit at 20% CPU. What is the bottleneck?

**What to check first:** the load generator's health and
`dropped_iterations`, then ELU and the connection pool.

**How to confirm:** if k6 drops iterations or its CPU is saturated, the
test is the limit; if pool checkout waits rise while ELU stays low, the
pool or the database is.

**Likely causes and fixes:** too few VUs or generator hosts, or requests
queueing for database connections because of slow queries. Fix the test
first, then use Little's law, the profiler, and `explain()`. See
[finding bottlenecks](finding-bottlenecks.md).

### 56. A k6 smoke test in CI fails on some runs and passes on others, with no code change. Why?

**What to check first:** which thresholds fail, and their margins.

**How to confirm:** latency thresholds fail by small amounts on shared
runners, while checks and errors stay clean.

**Likely causes and fixes:** noisy shared runners and tight latency
budgets. Keep PR smoke tests strict on correctness and loose on latency,
run latency budgets on dedicated runners or the performance environment,
and compare against a baseline rather than a hard number. See
[load testing with k6](load-testing-with-k6.md).

### 57. During a four-hour soak test, p99 and memory creep up after the third hour. What do you do?

**What to check first:** heap used, GC time, open handles and
connections, and disk usage over the run.

**How to confirm:** heap snapshots taken minutes apart show a growing
object type, or connection counts rise steadily.

**Likely causes and fixes:** a memory leak (an unbounded cache, listeners
added per request), a connection leak, or logs filling a disk. Fix the
leak, bound caches, and keep the soak test in the release checklist. See
[finding bottlenecks](finding-bottlenecks.md).

### 58. During a load test, ELU sits at 100% and every endpoint is slow, not just one. What now?

**What to check first:** a CPU profile of one instance under the same
load.

**How to confirm:** the profile shows one function dominating self time,
such as a deep copy or large JSON serialization in one handler.

**Likely causes and fixes:** synchronous CPU work blocking the event loop
for all requests. Optimize the hot function, paginate or project large
responses, or move the work to worker threads. See
[finding bottlenecks](finding-bottlenecks.md).

### 59. Raising `maxPoolSize` from 20 to 100 made p95 worse. Why?

**What to check first:** database CPU and query times before and after
the change.

**How to confirm:** the database's CPU and the duration of the slowest
queries rose with the extra concurrency.

**Likely causes and fixes:** the database was the bottleneck; more
connections meant more concurrent work on a saturated server. Revert, find
the slow queries with the profiler and `explain()`, and add the missing
index. See [finding bottlenecks](finding-bottlenecks.md).

### 60. A breakpoint test aborted at minute 40, but dashboards show latency degrading from minute 25. Which is the real limit?

**What to check first:** per-minute throughput and p95 from the run, not
the summary.

**How to confirm:** the time series shows throughput flattening and p95
rising at minute 25.

**Likely causes and fixes:** k6 thresholds are cumulative over the whole
test, so the healthy early samples delayed the abort. Read the knee from
the time series and treat `abortOnFail` as a safety stop. See
[load testing with k6](load-testing-with-k6.md).

### 61. The nightly k6 job is green, but its summary artifact is missing. What happened?

**What to check first:** the k6 log for "failed to handle the end-of-test
summary".

**How to confirm:** the `results/` directory did not exist when the run
ended.

**Likely causes and fixes:** k6 does not create directories, and a failed
`handleSummary()` write is logged while the exit code stays 0. Run
`mkdir -p results` before the test and fail the job if the artifact is
missing. See [load testing with k6](load-testing-with-k6.md).

### 62. After the CI runner picked up a new k6 version, load tests fail with unknown flags or executors. What changed?

**What to check first:** the k6 version in the job log and the release
notes.

**How to confirm:** the scripts use `externally-controlled`,
`--no-summary`, `k6 login`, or `k6 cloud script.js`, all removed in k6
2.0.

**Likely causes and fixes:** an unpinned upgrade across a major version.
Pin `k6-version` in `grafana/setup-k6-action`, migrate to
`--summary-mode=disabled`, `k6 cloud login`, and `k6 cloud run`, and
upgrade deliberately. See [load testing with k6](load-testing-with-k6.md).

### 63. A chaos experiment kills one API pod and a burst of 502 errors follows. What is wrong?

**What to check first:** how the pod shuts down and how fast the load
balancer and readiness checks react.

**How to confirm:** errors start when the pod receives SIGTERM and stop
when it is removed from the endpoints.

**Likely causes and fixes:** no graceful shutdown, slow readiness or
health checks, or no retries for idempotent requests. Drain connections on
SIGTERM, tune readiness probes and deregistration, and retry idempotent
requests with backoff. See
[chaos engineering and game days](chaos-engineering-and-game-days.md).

### 64. You inject 3 s of latency into the notification service, and `POST /tasks` takes 3 s. What does that tell you?

**What to check first:** whether the outbound call has a timeout.

**How to confirm:** the API's response time follows the injected delay
exactly.

**Likely causes and fixes:** a missing timeout, a timeout on a different
client, or one longer than the request budget. Add
`AbortSignal.timeout()` with a fallback for this non-critical call, and
keep the Toxiproxy test in CI. See
[chaos engineering and game days](chaos-engineering-and-game-days.md).

### 65. During a game day, the injected failure went unnoticed for 20 minutes. What do you fix?

**What to check first:** which alerts should have fired and where they
were routed.

**How to confirm:** the scribe's timeline shows no page; the alert rules
watch CPU rather than user-facing symptoms.

**Likely causes and fixes:** alerts on the wrong signals or the wrong
routing. Alert on SLO burn rates and symptoms, test paging in the next
game day, and add the dashboards responders needed. See
[chaos engineering and game days](chaos-engineering-and-game-days.md).

### 66. A chaos experiment in production caused a real outage. What do you change?

**What to check first:** the blast radius, the stop conditions, and
whether the same experiment had passed in a lower environment.

**How to confirm:** the experiment's scope and timeline, and whether the
stop condition fired.

**Likely causes and fixes:** too large a blast radius, a stop condition
that was missing or never tested, or skipping lower environments. Run a
blameless review, shrink the scope, test the abort, and climb back up the
ladder from staging. See
[chaos engineering and game days](chaos-engineering-and-game-days.md).

## Further learning

- [Performance and reliability testing overview](../performance-and-reliability-testing.md)
- [Load testing fundamentals](load-testing-fundamentals.md) ·
  [Load testing with k6](load-testing-with-k6.md) ·
  [Finding bottlenecks](finding-bottlenecks.md) ·
  [Chaos engineering and game days](chaos-engineering-and-game-days.md)
- [Grafana k6 documentation](https://grafana.com/docs/k6/latest/)
- [Brendan Gregg: The USE Method](https://www.brendangregg.com/usemethod.html)
- [Principles of Chaos Engineering](https://principlesofchaos.org/)
- [Google SRE book: Addressing Cascading Failures](https://sre.google/sre-book/addressing-cascading-failures/)
