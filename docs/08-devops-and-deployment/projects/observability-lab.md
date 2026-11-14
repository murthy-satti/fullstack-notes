# Observability Lab

Instrument TaskFlow API with structured logs, metrics, and traces, define
SLOs with a dashboard and a burn-rate alert, then break something on
purpose, follow the alert to the cause, and write a blameless postmortem.

## Why this project helps

- Builds the three signals every on-call engineer relies on: logs, metrics,
  and traces, connected by a request ID.
- Improves **detection and recovery time**: you find problems from alerts
  and traces instead of from users.
- Improves **prioritization**: SLOs and error budgets turn "is this bad?"
  into a number.
- "Walk me through debugging a latency spike" is a staple interview
  question; you will have done it end to end.

## What you need

- pino and pino-http for logs, prom-client for metrics, and the
  OpenTelemetry Node.js SDK with auto-instrumentations for traces.
- A local stack: Prometheus, Grafana, Alertmanager, and a trace backend such
  as Jaeger or Grafana Tempo (Docker Compose is enough).
- Builds on [Production Image](production-image.md).

## How to do it

1. Read [observability fundamentals](../monitoring-and-logging/observability-fundamentals.md)
   and decide which questions each signal must answer.
2. Emit JSON logs with pino-http and a request ID on every line; see
   [structured logging](../monitoring-and-logging/structured-logging.md).
3. Expose request rate, errors, and duration with prom-client and scrape
   them with Prometheus; see
   [metrics and dashboards](../monitoring-and-logging/metrics-and-dashboards.md).
4. Start the OpenTelemetry SDK before the app so traces follow requests into
   MongoDB, and put the trace ID in the logs; see
   [distributed tracing](../monitoring-and-logging/distributed-tracing.md).
5. Define an availability SLO and a latency SLO and build a Grafana
   dashboard for them; see
   [SLIs, SLOs, and error budgets](../monitoring-and-logging/slis-slos-and-error-budgets.md).
6. Add a multiwindow burn-rate alert in Prometheus with a runbook link in
   its annotations, routed through Alertmanager; see
   [alerting and on-call](../monitoring-and-logging/alerting-and-on-call.md).
7. Break something on purpose (a slow query or an error in one route), and
   go from the alert to the trace and the log line that explain it.
8. Write a blameless postmortem with a timeline and action items using
   [incident response and postmortems](../monitoring-and-logging/incident-response-and-postmortems.md).

## Done when

- Every log line is JSON and carries a request ID and trace ID.
- The dashboard shows request rate, error rate, latency percentiles, and
  remaining error budget.
- A trace shows the HTTP request and the MongoDB calls inside it.
- The burn-rate alert fires during the incident and links to a runbook.
- A postmortem names the trigger, the root causes, and owned action items.

## Stretch goals

- Add error tracking and an external uptime check; see
  [error tracking and uptime monitoring](../monitoring-and-logging/error-tracking-and-uptime-monitoring.md).
- Sample traces by tail latency instead of at random.

## Lessons to use

- [Monitoring and Logging](../monitoring-and-logging.md)
- [Logging and monitoring in the backend](../../03-backend-development/backend-concepts/logging-and-monitoring.md)

Back to [all projects](../projects.md).
