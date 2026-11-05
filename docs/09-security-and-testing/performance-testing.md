# Performance Testing

## Introduction

Performance testing measures application behavior under workloads. It helps teams understand response time, throughput, resource use, and stability, find bottlenecks, and verify service expectations.

## Why does it exist?

An application may slow down or fail when many people use it at once. Slow pages frustrate users; overloaded services affect reliability and costs. Testing helps detect regressions.

## How does it work?

Start with a question and representative actions, data sizes, arrival rates, and duration. Measure a baseline, then vary load while observing latency percentiles, throughput, errors, CPU, memory, and dependencies. A load test checks expected demand; a stress test explores limits; a soak test looks for problems over time. Test only in an authorized environment.

## Real-world example

A team expects a ticketing site to handle a launch-day surge. It models browsing, search, and checkout. Results may show that search queries dominate database time, suggesting indexing or caching work.

## Developer perspective

Define success criteria, such as a p95 response-time limit at a request rate and an acceptable error rate. Document test data and conditions. Repeat tests and account for network noise, caches, and shared infrastructure.

## Practical example

For a local service, use a load-testing tool to send a modest, gradually increasing set of requests to a test endpoint. Record p50 and p95 latency plus status codes, then compare with a baseline commit. Stop if the test causes unexpected load or errors in shared services.

## Important terminology

- **Latency:** time taken for a request to complete.
- **Throughput:** completed work per unit of time.
- **Percentile:** a value below which a stated fraction of observations fall; p95 covers 95%.
- **Load, stress, soak:** tests of expected demand, capacity limits, and sustained operation.

## Advantages and disadvantages

Performance tests provide evidence for capacity and can expose bottlenecks early. Real systems are complex, and simulated workloads may not match production. Testing consumes resources and can disturb shared environments, so scope and authorization matter.

## Common misconceptions

- Average latency can hide slow experiences; inspect percentiles and errors.
- More virtual users do not automatically mean a more realistic test.
- A passing result today does not guarantee future capacity.

## Revision questions

1. Why are percentiles useful alongside averages?
2. How do load, stress, and soak tests differ?
3. What should a test plan specify before it runs?

## Further Learning & References

- **Official documentation:** [Grafana k6 documentation](https://grafana.com/docs/k6/latest/) explains load-test scripts, execution, and performance metrics.
- **Third-party explanation:** [Google web.dev: Web Vitals](https://web.dev/articles/vitals) explains user-facing web performance measurements and their thresholds.
- Continue with [Testing Fundamentals](testing-fundamentals.md).
