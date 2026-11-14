# Performance and Reliability Testing

Performance testing puts a system under a controlled, realistic load and
measures how fast it responds, how much work it completes, and what breaks
first. Reliability testing goes further: it holds the load for hours,
injects failures on purpose (chaos engineering), and rehearses the human
response (game days). Together they replace "it should cope with the
launch" with evidence such as "TaskFlow API serves 120 requests per second
with p95 under 300 ms, loses one instance without user-visible errors, and
recovers on its own".

## What performance and reliability testing provides

- **Capacity numbers:** the throughput one instance sustains within the
  SLO, which feeds
  [capacity planning](../../05-application-architecture/scalability/capacity-planning.md)
  and autoscaling limits.
- **Regression protection:** a short load test with thresholds in CI fails
  the build when a change makes p95 latency or the error rate worse.
- **Bottleneck discovery:** load reveals the first resource to saturate
  (the event loop, a connection pool, the database, a downstream API)
  before users find it.
- **Proof that failure handling works:** timeouts, retries, failover, and
  autoscaling are only proven when you watch them work under load and
  under injected failure.
- **Practised people:** game days rehearse the incident response, so the
  first real outage is not the first time anyone opens the runbook.

None of this is free. Tests need a production-like environment, realistic
data, and someone who can read the results. A load test against the wrong
environment, or with an unrealistic workload model, produces confident and
wrong numbers.

## How a typical load test works

1. **Ask one question and set pass criteria from the SLO:** "Can TaskFlow
   API serve the expected weekday peak of 120 requests per second with p95
   under 300 ms and fewer than 0.1% errors?"
2. **Model the workload:** the endpoint mix and arrival rate from
   production metrics, think time between user actions, test users, and
   data volume.
3. **Prepare the environment:** production-sized instances and data, the
   same configuration, and a load generator with spare capacity of its own.
4. **Run a smoke test first** (one virtual user for a minute) to prove the
   script and the environment, then run the chosen load shape.
5. **Watch both sides:** client-side throughput, latency percentiles, and
   errors from the load tool; server-side saturation (CPU, event-loop delay,
   connection pools, database) from monitoring.
6. **Compare with thresholds and the last baseline.** When a limit is hit,
   find the bottleneck, change one thing, and run the same test again.
7. **Keep the script, the results, and the environment description** so the
   next run is comparable.

![Diagram: six small charts plot load against time, each with a dashed line at the expected production load. Smoke test: a tiny plateau far below it for a minute or two, asking whether the script works at all. Average-load test: a ramp up to the expected load, a 5 to 60 minute plateau on it, and a ramp down, asking whether the system meets its SLO at peak. Stress test: a ramp to the expected load and then to a plateau well above it, asking how the system copes above peak. Spike test: a sudden jump to several times the expected load and a sudden drop back, asking whether the system survives a surge. Soak test: the expected load held for hours, asking whether the system degrades over time. Breakpoint test: one steady ramp upward until a red cross marks the limit found, asking where exactly it breaks.](performance-and-reliability-testing-overview.svg)

## Practical example

An average-load test for TaskFlow API with Grafana k6 (version 2.x). The
arrival-rate executor starts a fixed number of requests per second, so slow
responses cannot quietly reduce the load:

```js
// perf/tasks-average-load.js: TaskFlow API at its expected weekday peak
import http from "k6/http";
import { check } from "k6";

export const options = {
  scenarios: {
    list_tasks: {
      executor: "ramping-arrival-rate", // open model: k6 starts N requests per second
      startRate: 10,
      timeUnit: "1s",
      preAllocatedVUs: 50,
      maxVUs: 200,
      stages: [
        { target: 120, duration: "5m" },  // ramp to the expected peak: 120 requests/s
        { target: 120, duration: "20m" }, // hold it
        { target: 0, duration: "2m" },    // ramp down
      ],
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.001"],                // fewer than 0.1% errors
    http_req_duration: ["p(95)<300", "p(99)<800"],  // latency SLO, in ms
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
k6 run -e BASE_URL=https://staging.taskflow.example.com \
  -e API_TOKEN="$PERF_TEST_TOKEN" perf/tasks-average-load.js
# exit code 0: every threshold passed; 99: at least one threshold failed
```

The thresholds turn the SLO into a pass or fail result, which is what lets
a pipeline gate on it. Each deep page below builds one piece of this:
choosing the shape, writing realistic scripts, explaining a failure, and
testing what happens when parts of the system break.

## Performance and reliability testing topic map

**Load testing**

- [Load testing fundamentals](performance-and-reliability-testing/load-testing-fundamentals.md)
- [Load testing with k6](performance-and-reliability-testing/load-testing-with-k6.md)

**Analysis**

- [Finding bottlenecks](performance-and-reliability-testing/finding-bottlenecks.md)

**Reliability**

- [Chaos engineering and game days](performance-and-reliability-testing/chaos-engineering-and-game-days.md)

**Review**

- [Performance and reliability testing interview questions and answers](performance-and-reliability-testing/interview-questions-and-answers.md) · [cheat sheet](performance-and-reliability-testing/cheat-sheet.md)

## Developer perspective and common misconceptions

Treat performance like any other requirement: write it down as a threshold
derived from the SLO, check it automatically, and run the same test again
after every change that could affect it. The theory this subject builds on
lives elsewhere on the site: latency, percentiles, and queueing basics in
[performance and latency](../../05-application-architecture/scalability/performance-and-latency.md),
targets in [SLIs, SLOs, and error budgets](monitoring-and-logging/slis-slos-and-error-budgets.md),
and the patterns that chaos experiments verify in
[resilience patterns across servers](load-balancing-and-multi-server/resilience-patterns-across-servers.md).

- A test on a laptop, or against a database with a hundred rows, does not
  predict production. Size, data volume, and configuration all matter.
- More virtual users is not more realism. A closed workload model slows
  down together with a slow server and hides the very problem you are
  looking for.
- An average that passes says nothing about the tail. Gate on p95 and p99
  latency and on the error rate.
- A test that ends without errors has not found the limit. Only stress and
  breakpoint tests tell you where the system breaks and how.
- Chaos engineering is not breaking things at random in production. It is
  a controlled experiment with a hypothesis, a small blast radius, and a
  way to stop.
- A passing result is valid for the version, data, configuration, and
  environment you tested, and for nothing else.

## Further learning

- [Grafana k6 documentation](https://grafana.com/docs/k6/latest/)
- [Google SRE book: Addressing Cascading Failures](https://sre.google/sre-book/addressing-cascading-failures/),
  including "Test Until Failure and Beyond"
- [Principles of Chaos Engineering](https://principlesofchaos.org/)
- [Capacity planning](../../05-application-architecture/scalability/capacity-planning.md)
  for turning test results into instance counts
- [Performance and reliability testing interview questions and answers](performance-and-reliability-testing/interview-questions-and-answers.md)
