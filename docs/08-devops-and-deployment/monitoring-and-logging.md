# Monitoring and Logging

Monitoring and logging are how a team finds out what its software is doing
in production. The running application emits evidence (log lines, numeric
metrics, and traces of individual requests), a pipeline collects and stores
that evidence, and people and alert rules read it to answer two questions:
"Are users being hurt right now?" and "Why?". The broader property of a
system that lets you answer new questions without shipping new code is
called **observability**.

## What monitoring and logging provides

- **Detection:** alerts fire when users are affected, ideally before the
  first support ticket arrives.
- **Diagnosis:** logs, metrics, and traces narrow a symptom ("checkout is
  slow") down to a cause ("one MongoDB query lost its index").
- **Reliability targets you can measure:** service level objectives (SLOs)
  turn "the API should be fast and available" into numbers you track.
- **Safer releases:** comparing error rate and latency before and after a
  deploy tells you whether to continue or roll back.
- **Capacity planning:** saturation trends show when you will run out of
  CPU, memory, connections, or disk.
- **Audit and security evidence:** who did what, and when.

None of this comes for free. Every signal costs storage and attention, and
an alert that wakes someone up for nothing is worse than no alert.

## How a typical observability pipeline works

Follow TaskFlow API, the Express and MongoDB task service used throughout
this site, from a line of code to a person being paged:

1. **Instrument.** The API writes structured JSON logs to stdout with
   pino, exposes request counters and latency histograms at `/metrics`
   with prom-client, and records spans for each request with the
   OpenTelemetry SDK.
2. **Collect.** A log agent (Fluent Bit or Vector) tails container
   output, Prometheus scrapes `/metrics` every 15 seconds, and an
   OpenTelemetry Collector receives spans over OTLP, batches and samples
   them.
3. **Store.** Each signal lands in a store built for it: a log store
   (Loki, Elasticsearch), a time-series database (Prometheus, Mimir), and
   a trace store (Tempo, Jaeger), each with its own retention.
4. **Look.** Grafana dashboards show request rate, errors, and duration
   per service; a trace ID in a log line opens the matching trace.
5. **Alert.** Rules evaluate SLO burn rates; Alertmanager groups,
   deduplicates, and routes firing alerts, paging the on-call engineer
   with a runbook link only when users are affected.
6. **Learn.** After an incident, a blameless postmortem produces action
   items, often new or better signals.

![Diagram: TaskFlow API, instrumented with pino, prom-client, and the OpenTelemetry SDK, sends JSON logs from stdout to a log agent (Fluent Bit or Vector) and on to Loki or Elasticsearch; sends traces over OTLP to an OpenTelemetry Collector that batches, samples, and exports them to Tempo or Jaeger; and is scraped by Prometheus at GET /metrics, with samples stored in a metrics TSDB. All three stores feed Grafana for dashboards, exploration, and trace ID links. The metrics store feeds SLO burn-rate alert rules, which fire into Alertmanager to group, route, and deduplicate, and Alertmanager pages the on-call engineer with a runbook link, who then investigates in Grafana.](monitoring-and-logging-overview.svg)

## Practical example

A request handled by TaskFlow API produces evidence in all three signals.
The logger and the latency metric come from a few lines of setup;
pino-http and the OpenTelemetry pino instrumentation (covered in the deep
pages) add the request and trace fields to each log line:

```js
// src/observability.js
import pino from "pino";
import client from "prom-client";

export const logger = pino({
  base: { service: "taskflow-api", env: process.env.NODE_ENV },
  redact: ["req.headers.authorization", "req.headers.cookie"],
});

client.collectDefaultMetrics(); // process CPU, memory, event loop lag, GC
export const httpDuration = new client.Histogram({
  name: "http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  labelNames: ["method", "route", "status_code"],
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5],
});
```

```json
{"level":30,"time":1763030401123,"service":"taskflow-api","env":"production","reqId":"5b0c...","trace_id":"4bf92f3577b34da6a3ce929d0e0e4736","msg":"request completed","res":{"statusCode":201},"responseTime":38}
```

```text
# PromQL: 95th percentile latency per route over the last 5 minutes
histogram_quantile(0.95,
  sum by (le, route) (rate(http_request_duration_seconds_bucket[5m])))
```

The metric tells you that p95 latency on `POST /tasks` doubled; the
`trace_id` in the log line leads to a trace that shows which downstream
call got slower. Each deep page below builds one piece of this.

## Monitoring and logging topic map

**Foundations**

- [Observability fundamentals](monitoring-and-logging/observability-fundamentals.md)

**The signals**

- [Structured logging](monitoring-and-logging/structured-logging.md)
- [Metrics and dashboards](monitoring-and-logging/metrics-and-dashboards.md)
- [Distributed tracing](monitoring-and-logging/distributed-tracing.md)

**Reliability practice**

- [SLIs, SLOs, and error budgets](monitoring-and-logging/slis-slos-and-error-budgets.md)
- [Alerting and on-call](monitoring-and-logging/alerting-and-on-call.md)
- [Error tracking and uptime monitoring](monitoring-and-logging/error-tracking-and-uptime-monitoring.md)
- [Incident response and postmortems](monitoring-and-logging/incident-response-and-postmortems.md)

**Review**

- [Monitoring and logging interview questions and answers](monitoring-and-logging/interview-questions-and-answers.md) · [cheat sheet](monitoring-and-logging/cheat-sheet.md)

## Developer perspective and common misconceptions

Treat observability as a feature of the code you ship, not something an
operations team bolts on later. Every new endpoint should come with a
request id in its logs, a latency histogram, and a span, and every alert
should be tied to something a user would notice. The application-level
basics (log levels, what to log in a handler) are covered in
[logging and monitoring](../03-backend-development/backend-concepts/logging-and-monitoring.md)
in the Backend section; this subject covers the production pipeline around
them.

- More dashboards do not mean better monitoring. A few dashboards that
  follow the request path beat hundreds nobody opens.
- Logging everything is not observability. Unstructured, high-volume logs
  are expensive and hard to query; structure and correlation IDs matter
  more than volume.
- Averages hide pain. Track percentiles (p95, p99) from histograms.
- Alerting on CPU or memory usually pages people for things users never
  feel. Alert on symptoms such as error rate and latency.
- 100% availability is the wrong target; it is unachievable and blocks
  every change. Choose an SLO and spend the error budget deliberately.
- Monitoring does not end at the server. Users experience DNS,
  certificates, CDNs, and the browser too, so check from the outside as
  well.

## Further learning

- [Google SRE book: Monitoring Distributed Systems](https://sre.google/sre-book/monitoring-distributed-systems/)
- [OpenTelemetry documentation](https://opentelemetry.io/docs/)
- [Prometheus documentation: Overview](https://prometheus.io/docs/introduction/overview/)
- [The Twelve-Factor App: Logs](https://12factor.net/logs)
- [Monitoring and logging interview questions and answers](monitoring-and-logging/interview-questions-and-answers.md)
