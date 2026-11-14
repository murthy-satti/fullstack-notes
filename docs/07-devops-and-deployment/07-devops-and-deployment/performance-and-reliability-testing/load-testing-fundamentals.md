# Load Testing Fundamentals

A load test sends realistic traffic to a system on purpose and measures
what happens: how fast it answers, how much it can do, and what fails
first. This lesson covers how to design one that answers a real question:
the main test types and their load shapes, open and closed workload models,
think time and pacing, realistic scenarios and test data, where to run
tests, what to measure on both sides of the wire, coordinated omission (the
measurement error that makes many load tests look far better than reality),
and Little's law for sizing a test.

The measurement basics (percentiles, tail latency, the utilization knee)
are covered in [performance and latency](../../../05-application-architecture/scalability/performance-and-latency.md)
and [capacity planning](../../../05-application-architecture/scalability/capacity-planning.md);
this page applies them to test design. The tool comes next, in
[load testing with k6](load-testing-with-k6.md).

## Why it matters

Most load-testing failures are design failures, not tool failures. A test
that runs 50 virtual users in a tight loop against a staging database with
a thousand rows will report excellent numbers, and the launch will still
fall over: production has millions of rows that no longer fit in memory, a
different mix of endpoints, and users who keep arriving whether or not the
site is slow. Capacity decisions (instance counts, database tiers,
autoscaling limits) are made from these numbers, so a wrong workload model
turns directly into a wrong plan.

A well-designed test is cheap insurance. It finds the limit on a Tuesday
afternoon in a performance environment instead of on launch day in front of
customers, it shows whether the system degrades gracefully or collapses,
and it gives every later change a baseline to be compared against.

## Real-world usage

- **Shopify.** In
  [Pummelling the Platform: Performance Testing Shopify](https://shopify.engineering/performance-testing-shopify)
  (2020), Shopify separates load tests (can a service handle a known level
  of traffic, such as 1 million requests per minute for 15 minutes) from
  stress tests (raise the load until the service fails). It turns browser
  sessions recorded as HAR files into load-test flows, shapes the traffic to
  match the extreme spikes of flash sales, and runs simulated sales against
  representative test shops dozens of times a day.
- **Google SRE.** The SRE book chapter
  [Addressing Cascading Failures](https://sre.google/sre-book/addressing-cascading-failures/)
  says to "load test components until they break", to test both gradual
  and impulse (sudden) load patterns because they can give different
  results, and to check whether a component returns to normal without human
  intervention once the load drops.
- **wrk2 and coordinated omission.** Gil Tene's
  [wrk2](https://github.com/giltene/wrk2) README explains why load
  generators that wait for each response before sending the next one
  "coordinate" with the server and skip measuring exactly the slow periods.
  wrk2 sends at a constant rate and measures latency from when each request
  should have been sent; in the README's example with a server pause, the
  corrected 99th percentile is about 200 times higher than the uncorrected
  one.
- **Grafana k6.** The k6 documentation on
  [open and closed models](https://grafana.com/docs/k6/latest/using-k6/scenarios/concepts/open-vs-closed/)
  notes that in a closed model the iteration rate depends on the target's
  response time, recommends the arrival-rate executors when you need a
  fixed rate, and names the problem coordinated omission.

**Popular tools and providers:** Grafana k6 and Grafana Cloud k6, Apache
JMeter, Gatling, Locust, Artillery, wrk2 for single-endpoint benchmarks,
and managed runners such as Azure Load Testing (JMeter and Locust scripts)
and Distributed Load Testing on AWS (JMeter, k6, and Locust).

## How it works

### Test types and their load shapes

Every load test is the same script driven by a different load shape, and
each shape answers a different question. The names below follow the k6
documentation's test-types guide; other tools use the same ideas.

| Type | Question it answers | Shape | Typical length | Passes when |
|---|---|---|---|---|
| **Smoke** | Do the script and the environment work? | 1-2 VUs or requests per second | 1-2 minutes | Zero errors, every check passes |
| **Average-load** | Does the system meet its SLO at the expected peak? | Ramp up, hold the expected peak, ramp down | 5-60 minutes at the plateau | p95, p99, and error-rate thresholds hold |
| **Stress** | How does it behave above the expected load? | Ramp to the peak, then step to 1.5-2 times it and hold | 5-60 minutes | It slows or sheds load with 429/503 instead of collapsing, and recovers afterwards |
| **Spike** | Does it survive a sudden surge, and recover? | Jump to several times normal in seconds, hold briefly, drop | A few minutes | No crash; autoscaling or load shedding reacts; latency returns to normal |
| **Soak** | Does it degrade over time? | Expected load held for hours | 2-12 hours | Latency, errors, memory, connections, and disk stay flat |
| **Breakpoint** | Where is the limit, and what breaks first? | One continuous ramp until thresholds fail | As long as needed | It records the highest throughput that met the SLO and the first resource to saturate |

The overview page draws all six shapes side by side. Two details make
them trustworthy:

- **Ramp up.** A cold system is slower than a warm one: JIT compilation,
  connection pools, caches, and autoscaling all need time. Ramping over a
  few minutes avoids measuring the start-up, and the steady part of the run
  (the plateau) is where you read the results.
- **Ramp down and keep watching.** Recovery is part of the answer. A system
  that is still slow five minutes after the load dropped has a queue,
  retry storm, or leak that the plateau alone would not show.

### Open and closed workload models

A **workload model** describes how new work arrives. It decides what your
numbers mean.

In a **closed model**, a fixed number of virtual users (VUs) each run a
loop: send a request, wait for the response, think, repeat. The arrival
rate is an output: `VUs / (response time + think time)`. When the server
slows down, every VU waits longer, so the test sends less. It models a
fixed population that waits for answers: a call-centre team on an internal
tool, a pool of 20 worker processes, a mobile app that retries only after a
response.

In an **open model**, new requests (or user sessions) arrive on a schedule,
for example 120 per second, whatever the server does. When the server slows
down, requests keep arriving and pile up in flight, exactly as they do on a
public website where thousands of independent users never coordinate with
each other. A **partially open** model combines both: sessions arrive at a
rate, and each session makes several requests with think time between
them.

![Diagram: the same slow period seen by two workload models. Left, the closed model: three virtual users each send a request, wait for the response, pause for think time, and repeat; while the server is slow their requests take much longer, so fewer new requests start, because load equals VUs divided by response time plus think time, and the test sends less exactly when the server struggles. Right, the open model: a new request starts at every tick of a fixed arrival schedule; the requests that arrive during the slow period all take longer, so four are in flight at once instead of one, because load equals the arrival rate you set, and requests pile up in flight as in production.](open-vs-closed-workload-models.svg)

| | Closed model | Open model |
|---|---|---|
| You set | The number of concurrent users (VUs) | The arrival rate (requests or sessions per second) |
| Throughput is | A result: VUs / (response + think time) | An input: fixed by the schedule |
| When the server slows | The test sends less; pressure drops | Requests queue, concurrency grows, timeouts appear |
| Realistic for | Fixed populations that wait for answers | Public APIs and websites with many independent users |
| k6 | `constant-vus`, `ramping-vus`, `per-vu-iterations`, `shared-iterations` | `constant-arrival-rate`, `ramping-arrival-rate` |
| Gatling | `constantConcurrentUsers`, `rampConcurrentUsers` | `constantUsersPerSec`, `rampUsersPerSec` |
| JMeter | Thread Group | Open Model Thread Group, or the Precise Throughput Timer |

For a question phrased as a rate ("can we serve 120 requests per second?")
use an open model. Use a closed model only when the real system has a fixed
population, and say so when you report the results.

### Think time and pacing

**Think time** is the pause between one user's actions: reading the task
board, typing a title. Without it, every VU becomes a request cannon and the
VU count stops meaning anything about real users; 50 VUs with no think time
can send more traffic than 5,000 people.

- **Randomize it.** Fixed sleeps make VUs march in lock-step and produce
  artificial waves; a range such as 2-6 seconds spreads them out.
- **Take it from production** where you can: the time between requests
  in a session, from logs or real-user monitoring.
- **Pacing** fixes the duration of a whole iteration ("start a session
  every 10 seconds per user") rather than the pause; it keeps per-user rates
  stable when response times vary, until a response takes longer than the
  pacing interval.
- **In an open model** a single-request iteration has no think time; the
  arrival rate already spaces the requests. Think time belongs inside
  multi-request sessions.

### Realistic scenarios and test data

A load test is only as realistic as its traffic and its data.

- **Use the production mix.** Count requests per route during the busiest
  hour (see the PromQL in the practical examples) and reproduce the
  proportions. A test that hammers only `GET /tasks` misses the expensive
  `POST /tasks` path and its index updates.
- **Use the peak, not the average.** Plan from the busiest five minutes of a
  typical busy day, plus known events; peak-to-average ratios of 2-5 are
  common (see [capacity planning](../../../05-application-architecture/scalability/capacity-planning.md)).
- **Use production-sized data.** With a hundred tasks every query is fast
  and every index fits in memory. Copy the real data volume and shape
  (anonymized or synthetic), including heavy users with thousands of tasks.
- **Vary the inputs.** Many test users and many task IDs, distributed
  like production, so caches and the database see realistic hit ratios
  instead of one hot document.
- **Handle writes.** Tests that create data change the dataset. Use a
  dedicated test tenant, clean up after each run, or restore a snapshot so
  runs stay comparable.
- **Authenticate realistically.** Log in at the rate real users do, not
  once per request, and not with one shared token if the server caches per
  token.
- **Stub what you do not own.** Never send load to a payment provider,
  email service, or partner API. Point those calls at sandboxes or stubs,
  and make sure no real email or charge can leave the test environment.

### Where to run load tests

| Environment | Good for | Watch out for |
|---|---|---|
| Laptop | Writing scripts, smoke runs | Numbers say nothing about capacity |
| CI runner with service containers | Short regression budgets, comparing a change with its base branch | Shared runners are noisy; use relative comparisons |
| Dedicated performance environment | Average-load, stress, spike, soak, breakpoint | Must match production sizes and configuration; reset data between runs |
| Shared staging | Occasional tests | Your test disturbs other teams, and theirs disturbs yours |
| Production | Final proof of the real path (CDN, load balancer, database) | Real users share the capacity: off-peak, small steps, marked traffic, an abort switch |

The **load generator** must never be the bottleneck. Watch its CPU,
memory, and network during every run; when its CPU stays above roughly
80%, its own scheduling delays leak into the latency you measure. Put it
close to the system (same region) to measure the service, or near users to
include the network, and say which you did. Very high rates need several
generator hosts or a managed cloud runner. Tell security teams and CDN or
DDoS-protection providers before you send heavy traffic from a few IP
addresses; otherwise the test may be blocked as an attack, or worse, it may
be measuring the rate limiter.

### What to measure

Measure from both sides, and compare them:

| Side | Signals | Why |
|---|---|---|
| Client (load tool) | Achieved throughput against the target, latency percentiles per endpoint, error rate by type, failed checks, dropped iterations | What users would experience, end to end |
| Server (application) | RED per route: request rate, errors, duration histograms | What the service itself saw |
| Server (resources) | USE: CPU and throttling, memory and GC, event-loop delay, connection pools, database CPU, I/O, and slow queries, queue depth | Which resource is saturating, and why |
| Generator | CPU, memory, network, dropped iterations | Whether the numbers can be trusted at all |

![Diagram: requests flow from a load generator (k6) to a load balancer, the TaskFlow API instances, and MongoDB. Above each component is what to watch: the generator's CPU below about 80 percent, dropped iterations equal to zero, and an achieved rate equal to the target; the balancer's request count, 5xx, latency, and rejected connections; the API's RED metrics per route, event-loop delay, CPU, heap, GC, and pool waiters; MongoDB's CPU, disk, cache hits, slow queries, connections, and locks. A bracket shows that k6 sees everything after the generator as end-to-end latency, errors, and throughput; a second bracket shows the app sees RED per route and USE per resource. A large gap between client and server latency means requests are queueing before the app or the generator is saturated.](load-test-measurement-points.svg)

A large gap between client-side and server-side latency means time is
being spent before the application: in the load balancer, a TCP backlog, a
connection pool in front of the app, or the generator itself. Read time
series, not only the end-of-test summary: a run whose summary passes can
still contain a two-minute meltdown in the middle. Percentiles must come
from histograms and must never be averaged across instances (see
[metrics and dashboards](../monitoring-and-logging/metrics-and-dashboards.md)).
Turning a saturated resource into a root cause is the subject of
[finding bottlenecks](finding-bottlenecks.md).

### Coordinated omission

Real users do not wait for each other. If the server freezes for half a
second, every user who arrives during that half second waits. A closed-loop
load generator behaves differently: each VU is stuck on its one outstanding
request, sends nothing else, and so records **one** slow sample per VU
instead of one per request that real users would have sent. The generator
has "coordinated" with the server and omitted the slow period from its
own measurements. The result is a p99 that looks excellent while users
suffer.

![Diagram: a 0 to 1,000 ms timeline in which the server pauses from 300 to 800 ms. Top, a closed loop with two VUs and no pauses: steady streams of short requests before and after, but during the pause each VU is stuck on one request, so only two slow samples are recorded. Bottom, an open model at 120 requests per second: about 60 requests arrive during the pause and each waits until it ends, so 60 slow samples are recorded, from 500 ms down to 8 ms, forming a triangle. A table of three local runs against a lab server pausing 500 ms every 5 seconds, 30 seconds per scenario: the closed loop sent 3,249 to 3,468 requests with p90 16 to 20 ms, p99 22 to 36 ms, and max 516 to 523 ms; the open model sent 3,600 to 3,601 requests with p90 60 to 68 ms, p99 468 to 475 ms, and max 510 to 558 ms.](coordinated-omission-timeline.svg)

The table in the diagram comes from the script in the practical examples,
run three times against a local stand-in server that froze for 500 ms
every 5 seconds. Both scenarios saw the same pauses (their maximum
latencies are similar), yet the closed loop reported a p99 of 22-36 ms and
the open model 468-475 ms. The closed loop also sent fewer requests than
the open model in the same 30 seconds (3,249-3,468 against 3,600), without
any error to warn you.

How to avoid it:

- **Use an open model** (k6's arrival-rate executors) when the question is
  about a rate.
- **Check that the planned load was delivered.** Compare achieved and
  intended throughput, and treat k6's `dropped_iterations` metric above
  zero as a failed test setup: k6 could not start iterations on time,
  usually because it ran out of pre-allocated VUs.
- **Distrust benchmark p99s from closed loops** with few connections and
  no think time; they measure the server when it is fast.
- **Correct where you cannot change the model.** wrk2 measures from the
  intended send time, and HdrHistogram can compensate when the expected
  interval between requests is known.

### Little's law for sizing a test

Little's law states that in a stable system the average number of items
inside equals the arrival rate times the time each one stays:
`L = λ × W`. The definition and its capacity uses are covered in
[performance and latency](../../../05-application-architecture/scalability/performance-and-latency.md);
here it sizes the test itself.

![Diagram: Little's law, L equals lambda times W, where L is how many are inside (VUs or requests in flight), lambda is the arrival rate, and W is the time each one stays. Closed model: lambda is the 120 requests per second target and W is 0.15 s of response plus 4.85 s of think time, 5.0 s, so L is 600 VUs; at 1.15 s W becomes 6.0 s and 600 VUs send only 100 requests per second, 17 percent less. Open model: lambda is fixed at 120 per second and W is the response time of a single request, so 18 requests are in flight at 0.15 s and 138 at 1.15 s, which means pre-allocating at least 138 VUs plus headroom.](littles-law-vu-sizing.svg)

Worked example. TaskFlow's busiest five minutes reach **120 requests per
second**, typical responses take **0.15 s**, and users pause about **4.85
s** between requests:

```text
Closed model (each VU iteration = 1 request + think time)
  W = 0.15 s + 4.85 s           = 5.0 s per iteration
  L = λ × W = 120/s × 5.0 s     = 600 VUs to offer 120 requests/s

  If responses slow to 1.15 s:
  W = 1.15 s + 4.85 s           = 6.0 s
  λ = L / W = 600 / 6.0 s       = 100 requests/s   (17% less load, silently)

Open model (each iteration = 1 request, no think time)
  in flight at 0.15 s: 120/s × 0.15 s = 18 requests
  in flight at 1.15 s: 120/s × 1.15 s = 138 requests
  -> pre-allocate at least 138 VUs (plus headroom) or k6 drops iterations
```

The k6 documentation gives the same rule for arrival-rate executors:
`preAllocatedVUs = median iteration duration × rate + a constant for
variance`. Size for the slowest latency you want to test honestly, not the
fastest.

### Baselines and comparing runs

A single number means little; a change against a baseline means a lot.

- Keep the script, data snapshot, environment sizes, and configuration
  under version control, and record the git SHA of the system under test.
- Warm up, then compare the same steady-state window of each run; exclude
  the ramps.
- Run important tests at least twice; differences smaller than the
  run-to-run spread are noise.
- Change one thing at a time between runs, or you will not know what
  helped.

## When to use and when not to use

| Your question | Test to run | Model |
|---|---|---|
| Does my script, or this new endpoint, work under load at all? | Smoke | Either, 1-2 VUs |
| Will the next release meet the SLO at the weekday peak? | Average-load | Open |
| What happens on Black Friday at twice the normal peak? | Stress | Open |
| Will a push notification to every user knock us over? | Spike | Open |
| Do memory, connections, or disk creep up over a day? | Soak | Open, at the expected load |
| How many requests per second can one instance take within the SLO? | Breakpoint | Open, ramping |
| Is a fixed pool of 20 workers fast enough for its queue? | Average-load | Closed (the real system is closed) |

Do not load test (yet) when:

- There is no agreed question or SLO. Write the pass criteria first.
- The target is a dependency you do not own, such as a third-party API.
- You want to know which function is slow. A profiler or a micro-benchmark
  answers that faster; see [finding bottlenecks](finding-bottlenecks.md).
- The environment is so unlike production that the numbers would only
  mislead. Fix the environment, or run relative comparisons only.

## Practical examples

### A test plan for TaskFlow API

```text
Test:        TaskFlow API average-load, release 2.14
Question:    Does the API meet its SLO at the expected weekday peak?
Pass:        p95 < 300 ms, p99 < 800 ms, errors < 0.1%, per scenario
             dropped_iterations = 0, generator CPU < 80%
Workload:    open model, 120 requests/s at the plateau
             GET /tasks 62%, GET /tasks/:id 23%, POST /tasks 9%,
             PATCH /tasks/:id 5%, POST /auth/login 1%
Shape:       5 min ramp, 20 min plateau, 2 min ramp down
Data:        perf environment restored from the nightly anonymized snapshot
             (2.1 million tasks, 40,000 users); 500 test users
Environment: same instance types and counts as production (3 API, M30 cluster),
             autoscaling pinned off, third-party email and payments stubbed
Watch:       Grafana "TaskFlow API" and "MongoDB" dashboards, k6 output
Baseline:    release 2.13 run of 2026-11-02
```

At 120 requests per second the mix becomes 74.4 requests/s for `GET
/tasks`, 27.6 for `GET /tasks/:id`, 10.8 for `POST /tasks`, 6.0 for `PATCH
/tasks/:id`, and 1.2 for logins. Autoscaling is pinned off so the test
measures fixed capacity; a separate spike test checks autoscaling.

### Deriving the workload from production metrics

With the request histogram from
[metrics and dashboards](../monitoring-and-logging/metrics-and-dashboards.md)
in Prometheus, two queries give the peak rate and the mix:

```text
# Peak request rate over the last 30 days (5-minute resolution)
max_over_time(sum(rate(http_request_duration_seconds_count{job="taskflow-api"}[5m]))[30d:5m])

# Share of each route during one busy hour (set the dashboard range to that hour)
sum by (method, route) (increase(http_request_duration_seconds_count{job="taskflow-api"}[1h]))
  / scalar(sum(increase(http_request_duration_seconds_count{job="taskflow-api"}[1h])))
```

The first query returns one number, the busiest five-minute rate. The
second returns the fraction of traffic per method and route template for
the selected hour. Use the same hour for think-time estimates from your
logs.

### Sizing the test with Little's law

```js
// perf/tools/size-test.js: turn production numbers into load-test settings
const peakRps = 120;            // busiest 5 minutes of the last 30 days, requests/s
const responseS = 0.15;         // typical response time at that load, seconds
const thinkS = 4.85;            // average pause between one user's requests, seconds
const degradedResponseS = 1.15; // a slow day we still want to test honestly

// Little's law: L = lambda x W
const closedVUs = peakRps * (responseS + thinkS);      // users needed in a closed model
const inFlight = peakRps * responseS;                  // requests in flight, open model
const inFlightDegraded = peakRps * degradedResponseS;  // ... when responses slow down
const closedRpsDegraded = closedVUs / (degradedResponseS + thinkS); // what the closed model really sends

const r = (n) => Math.round(n);
console.log(`closed model: ${r(closedVUs)} VUs to offer ${peakRps} requests/s`);
console.log(`open model: ${r(inFlight)} requests in flight at ${responseS} s, ${r(inFlightDegraded)} at ${degradedResponseS} s`);
console.log(`closed model at ${degradedResponseS} s: only ${r(closedRpsDegraded)} requests/s`);
```

```text
$ node perf/tools/size-test.js
closed model: 600 VUs to offer 120 requests/s
open model: 18 requests in flight at 0.15 s, 138 at 1.15 s
closed model at 1.15 s: only 100 requests/s
```

### One session with think time, as a closed or an open model

The same user journey (open the board, read it, open one task, read it)
can run as a fixed population or as arriving sessions:

```js
// perf/board-session.js: one user session with think time, as a closed or an open model
import http from "k6/http";
import { check, sleep } from "k6";

const BASE_URL = __ENV.BASE_URL;
const params = { headers: { Authorization: `Bearer ${__ENV.API_TOKEN}` } };

export const options = {
  scenarios: {
    // Closed: a fixed population of 400 users who read between clicks.
    team_users: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "5m", target: 400 },
        { duration: "20m", target: 400 },
        { duration: "2m", target: 0 },
      ],
      exec: "session",
    },
    // Open: 60 new sessions start every second, however slow the API gets.
    arriving_users: {
      executor: "ramping-arrival-rate",
      startRate: 0,
      timeUnit: "1s",
      preAllocatedVUs: 450, // 60 sessions/s x about 6.8 s per session = 408 busy VUs
      maxVUs: 700,
      stages: [
        { duration: "5m", target: 60 },
        { duration: "20m", target: 60 },
        { duration: "2m", target: 0 },
      ],
      exec: "session",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.001"],
    http_req_duration: ["p(95)<300"],
  },
};

export function session() {
  const list = http.get(`${BASE_URL}/tasks?status=open&limit=20`, params);
  check(list, { "list is 200": (r) => r.status === 200 });
  sleep(2 + Math.random() * 4); // reads the board for 2-6 s

  const tasks = list.json("tasks") ?? [];
  if (tasks.length > 0) {
    const task = tasks[Math.floor(Math.random() * tasks.length)];
    const res = http.get(`${BASE_URL}/tasks/${task.id}`, {
      ...params,
      tags: { name: "GET /tasks/:id" }, // one metric series for every task id
    });
    check(res, { "task is 200": (r) => r.status === 200 });
    sleep(1 + Math.random() * 3); // reads the task for 1-4 s
  }
}
```

```bash
# Run one scenario at a time (the --scenario flag needs k6 2.3 or later)
k6 run --scenario arriving_users -e BASE_URL=https://perf.taskflow.example.com \
  -e API_TOKEN="$PERF_TEST_TOKEN" perf/board-session.js
```

Each session makes two requests and lasts about 6.8 s (6.5 s of average
think time plus two responses), so both scenarios offer roughly 120
requests per second while the API is healthy: 400 VUs / 6.8 s is about 59
sessions per second, and the open scenario starts 60. The difference
appears when the API slows: the closed scenario backs off, the open one
does not. If the open scenario runs out of VUs, k6 logs a warning such as
`Insufficient VUs, reached 700 active VUs and cannot initialize more` and
counts the skipped sessions in `dropped_iterations`.

### Seeing coordinated omission for yourself

This script produced the numbers in the diagram above. Run it against a
local test server that blocks its event loop for 500 ms every 5 seconds:

```js
// perf/coordinated-omission-demo.js: one server, a closed and an open workload model
import http from "k6/http";

export const options = {
  scenarios: {
    closed: {
      executor: "constant-vus", // like a classic benchmark: 2 VUs, each waits for its response
      vus: 2,
      duration: "30s",
      exec: "request",
    },
    open: {
      executor: "constant-arrival-rate", // 120 new requests every second, whatever happens
      rate: 120,
      timeUnit: "1s",
      duration: "30s",
      preAllocatedVUs: 100, // Little's law: 120/s x 0.5 s stall = 60 in flight, plus headroom
      maxVUs: 150,
      startTime: "35s", // starts after the closed scenario has finished
      exec: "request",
    },
  },
  // Thresholds on tagged sub-metrics make the summary show each scenario separately.
  thresholds: {
    "http_req_duration{scenario:closed}": ["p(99)>=0"],
    "http_req_duration{scenario:open}": ["p(99)>=0"],
    "http_reqs{scenario:closed}": ["count>=0"],
    "http_reqs{scenario:open}": ["count>=0"],
  },
  summaryTrendStats: ["med", "p(90)", "p(99)", "max"],
};

const params = { headers: { Authorization: `Bearer ${__ENV.API_TOKEN}` } };

export function request() {
  http.get(`${__ENV.BASE_URL}/tasks?limit=20`, params);
}
```

```text
# Excerpt from one run (k6 2.4.0)
http_req_duration{scenario:closed}
✓ 'p(99)>=0' p(99)=22.43ms
http_req_duration{scenario:open}
✓ 'p(99)>=0' p(99)=475.16ms
http_reqs{scenario:closed}
✓ 'count>=0' count=3468
http_reqs{scenario:open}
✓ 'count>=0' count=3601
```

The always-true thresholds (`p(99)>=0`) are a common trick to make k6
print per-scenario numbers; they never fail. The two VUs of the closed
scenario saw the same pauses, but recorded only a handful of slow samples
and quietly sent fewer requests than the 3,600 the open scenario delivered.

## Best practices

- Write the question and the pass criteria, derived from the SLO, before
  writing the script.
- Use an open model for anything phrased as a rate; document it whenever
  you use a closed one.
- Take the endpoint mix, peak rate, and think time from production
  metrics and logs, not from guesses.
- Test against production-sized data in a production-like environment, and
  reset the data between runs.
- Run a smoke test before every bigger test.
- Ramp up, hold a steady plateau, ramp down, and keep watching recovery.
- Monitor the load generator and treat `dropped_iterations` above zero as
  an invalid run.
- Read time series on both sides, not only the summary.
- Size VUs with Little's law for the slowest latency you want to measure.
- Keep scripts, data, environment details, and results versioned, and
  compare against a baseline.
- Stub third parties and warn anyone who could mistake your test for an
  attack.

## In production

- **The test passed, but production failed at lower traffic.**
  *Detect:* an incident at a request rate below the tested one; the
  failing endpoint or query never appeared in the test results. *Cause:*
  an unrealistic test: small data that fit in memory, a missing endpoint in
  the mix, warm caches, or a closed model that eased off. *Fix:*
  production-sized data, the mix and peak from real metrics, an open model,
  and a test of the cold-cache case.
- **The load test shows a fine p99, yet users report multi-second
  freezes.**
  *Detect:* real-user monitoring or support tickets disagree with the
  test; the test's maximum latency is far above its p99. *Cause:*
  coordinated omission in a closed-loop test, or percentiles averaged over
  instances. *Fix:* rerun with an arrival-rate executor, check
  `dropped_iterations`, and compute percentiles from merged histograms.
- **Throughput plateaus below the target while the servers are idle.**
  *Detect:* achieved requests per second stay under the target, server CPU
  is low, and the generator's CPU is high or `dropped_iterations` grows.
  *Cause:* the generator is the bottleneck: too few VUs, too little CPU, or
  connection reuse disabled. *Fix:* pre-allocate more VUs, add generator
  hosts, and watch generator metrics in every run.
- **Identical runs differ by 30%.**
  *Detect:* p95 and throughput vary widely between back-to-back runs of
  the same commit. *Cause:* shared or noisy environments, autoscaling
  starting from different sizes, data growth from earlier runs, or no
  warm-up. *Fix:* a dedicated environment, data reset, fixed instance
  counts, a warm-up period, and at least two runs per comparison.
- **Latency creeps up after three hours of a soak test.**
  *Detect:* p99 and memory rise slowly while the load is flat; restarts
  "fix" it. *Cause:* a memory, connection, or file-handle leak, an
  unbounded cache, or a disk filling with logs. *Fix:* chart heap, handles,
  pool sizes, and disk during soaks, then find the leak with heap snapshots
  (see [finding bottlenecks](finding-bottlenecks.md)).
- **The test is blocked, or measures the wrong thing.**
  *Detect:* a sudden wall of 403 or 429 responses from the edge, not from
  the application. *Cause:* a WAF, rate limiter, or DDoS protection
  treating the generator's few IP addresses as an attack. *Fix:* agree on
  allow-listed sources with the security team and provider, or test behind
  the edge when the edge is not what you are measuring.

## Important terminology

- **Load test:** Sending controlled, realistic traffic to a system to
  measure its behaviour.
- **Smoke, average-load, stress, spike, soak, breakpoint test:** Load
  shapes that answer different questions, from "does it work" to "where
  does it break".
- **Virtual user (VU):** One simulated client running the test script in a
  loop.
- **Workload model:** How new work arrives in a test: closed, open, or
  partially open.
- **Closed model:** A fixed number of users who wait for each response; the
  arrival rate depends on response time.
- **Open model:** Work arrives at a set rate regardless of response time.
- **Think time:** The pause between one user's actions.
- **Pacing:** Fixing how often an iteration starts rather than how long
  the pause is.
- **Arrival rate:** New requests or sessions per second.
- **Coordinated omission:** Missing the slow periods because the load
  generator waits for the server before sending more.
- **Little's law:** `L = λ × W`; items in the system equal arrival rate
  times time in the system.
- **Dropped iterations:** Iterations an arrival-rate executor could not
  start on time, usually for lack of VUs.
- **Baseline:** A stored earlier result that later runs are compared with.

## Common mistakes and misconceptions

- "More VUs means more realistic." With no think time, a few VUs send more
  than thousands of real users; with a closed model, VUs hide slowness.
- Measuring the average latency, or the p99 of a closed-loop benchmark,
  and calling it the user experience.
- Testing against a tiny or unrealistic dataset.
- Treating the load generator as infinitely fast.
- Reading only the end-of-test summary and missing a meltdown mid-run.
- Running a single test once and drawing conclusions from small
  differences.
- Load testing a third-party API or a shared environment without
  permission.
- Starting with a stress or breakpoint test before a smoke test has shown
  the script works.
- Assuming a passing test still holds after the code, data, or
  infrastructure changed.

## Revision questions

1. Name six load-test types and the question each one answers.
2. What is the difference between an open and a closed workload model, and
   which fits a public API?
3. Why does a closed-loop load generator under-report tail latency? Explain
   coordinated omission with an example.
4. A test must offer 300 requests per second. Each user iteration makes one
   request with a 0.2 s response time and 2.8 s of think time. How many VUs
   does a closed model need? If responses slow to 1.2 s, what rate does
   that closed test actually send? How many VUs would an arrival-rate
   executor need at 1.2 s? (900 VUs; 900 / 4.0 = 225 requests/s; 300 x 1.2
   = 360 VUs.)
5. Where would you get a realistic endpoint mix and peak rate for a test?
6. Which signals tell you the load generator, not the system, limited a
   test?
7. Why should a soak test chart memory, connections, and disk, and not only
   latency?
8. Your client-side p95 is 900 ms but the application's own p95 is 120 ms.
   Where is the time going?

## Further learning

- [Grafana k6: Load test types](https://grafana.com/docs/k6/latest/testing-guides/test-types/)
- [Grafana k6: Open and closed models](https://grafana.com/docs/k6/latest/using-k6/scenarios/concepts/open-vs-closed/)
- [Grafana k6: Arrival-rate VU allocation](https://grafana.com/docs/k6/latest/using-k6/scenarios/concepts/arrival-rate-vu-allocation/)
- [wrk2 README: latency measurement and coordinated omission](https://github.com/giltene/wrk2)
- [Google SRE book: Handling Overload](https://sre.google/sre-book/handling-overload/)
- Next: [load testing with k6](load-testing-with-k6.md). Back to the
  [performance and reliability testing overview](../performance-and-reliability-testing.md).
