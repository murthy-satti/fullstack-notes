# Load Test and Break It

Write k6 tests for TaskFlow's main user journeys with thresholds, run a
short version in CI as a performance gate, push the load until latency
bends, find and fix the bottleneck, and finish with a small game day that
injects latency between the API and MongoDB.

## Why this project helps

- Builds performance engineering skills: realistic load tests, thresholds,
  profiling, and the USE method.
- Improves **capacity planning**: you learn where TaskFlow breaks and what
  limits it, before real users find out.
- Improves **release safety**: a CI threshold catches performance
  regressions like any failing test.
- Interviewers ask how you would find a bottleneck; you will have a real
  story with numbers.

## What you need

- k6 on your laptop and the Grafana k6 GitHub Actions (`setup-k6-action`
  and `run-k6-action`).
- Node's built-in profiler (`node --cpu-prof`) and system tools such as
  `top` and `vmstat`.
- Toxiproxy for fault injection.
- A test environment you own, from [Production Image](production-image.md)
  or [TaskFlow on Kubernetes](taskflow-on-kubernetes.md).

## How to do it

1. Pick the main journeys (sign in, list tasks, create a task) and the load
   model using [load testing fundamentals](../performance-and-reliability-testing/load-testing-fundamentals.md).
2. Write k6 scenarios with checks and thresholds on p95 latency and error
   rate; see [load testing with k6](../performance-and-reliability-testing/load-testing-with-k6.md).
3. Run a short version in CI so the job fails when a threshold is crossed.
4. Ramp the load in steps and plot latency against throughput to find where
   it bends upward.
5. Apply the USE method to CPU, memory, disk, network, and the database, and
   record a CPU profile with `node --cpu-prof` at peak load; see
   [finding bottlenecks](../performance-and-reliability-testing/finding-bottlenecks.md).
6. Fix the biggest bottleneck (for example a missing index or an N+1 query)
   and run the same test again to measure the gain.
7. Plan a game day: write your hypothesis, then add a latency toxic between
   the API and MongoDB with Toxiproxy; see
   [chaos engineering and game days](../performance-and-reliability-testing/chaos-engineering-and-game-days.md).
8. Compare what happened with what you expected, and turn the gaps into
   tasks.

## Done when

- k6 tests cover the main journeys with thresholds on p95 latency and error
  rate.
- CI fails when a threshold is crossed and passes when it is not.
- You know the throughput at which latency bends, and why.
- One bottleneck is fixed, with before and after numbers from the same test.
- The game day notes compare the hypothesis with the observed behavior.

## Stretch goals

- Run a soak test for an hour and look for memory growth.
- Use an arrival-rate executor and compare it with a fixed number of
  virtual users.
- Add timeouts and a circuit breaker where the game day showed a gap; see
  [resilience patterns across servers](../load-balancing-and-multi-server/resilience-patterns-across-servers.md).

## Lessons to use

- [Performance and Reliability Testing](../performance-and-reliability-testing.md)
- [Performance testing basics](../../10-security-and-testing/performance-testing.md)

Back to [all projects](../projects.md).
