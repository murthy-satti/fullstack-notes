# Monitoring and Logging Cheat Sheet

Quick revision after the monitoring and logging lessons, before an
interview or a task.

## Key commands

| Command | What it does |
|---|---|
| `promtool check rules prometheus/rules/*.yml` | Checks alert and recording rules in CI |
| `promtool test rules prometheus/tests/taskflow-alerts.test.yml` | Unit-tests alert rules with fake series |
| `amtool check-config alertmanager/alertmanager.yml` | Validates the Alertmanager config |
| `amtool config routes test --config.file=alertmanager/alertmanager.yml severity=page service=taskflow-api` | Shows which receiver these labels reach |
| `node --experimental-loader=@opentelemetry/instrumentation/hook.mjs --import ./src/instrumentation.mjs src/server.js` | Loads OpenTelemetry before an ES module app |
| `OTEL_LOG_LEVEL=debug` | SDK logs export errors and patched modules |
| `test -z "$(find dist -name '*.map')"` | Fails CI if source maps would ship |

```text
# PromQL: rate first, then sum
sum by (route) (rate(http_request_duration_seconds_count[5m]))
sum(rate(http_request_duration_seconds_count{status_code=~"5.."}[5m]))
  / sum(rate(http_request_duration_seconds_count[5m]))
histogram_quantile(0.95, sum by (le, route) (rate(http_request_duration_seconds_bucket[5m])))

# LogQL: select streams by label, parse JSON, then filter
{service="taskflow-api", env="production"} | json | level="error"
```

## Key configuration

```js
// src/logger.js
import pino from "pino";

export const logger = pino({
  base: { service: "taskflow-api", env: process.env.NODE_ENV, version: process.env.APP_VERSION },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: { level: (label) => ({ level: label }) },
  redact: { paths: ["req.headers.authorization", "req.headers.cookie", "*.password"], censor: "[REDACTED]" },
});
```

```bash
# .env.production (sampling read by the OpenTelemetry SDK)
OTEL_TRACES_SAMPLER=parentbased_traceidratio
OTEL_TRACES_SAMPLER_ARG=0.25
```

## Decision guide

| If you need | Choose | Why |
|---|---|---|
| What happened to one request | Logs by `reqId` or `trace_id` | Per-event detail |
| Exact counts, rates, alerts | Metrics | Cheap per series, never sampled |
| Where a slow request spent its time | A distributed trace | Causal chain with timings |
| Crashes grouped by release | An error tracker | Grouping, source maps, regressions |
| Proof users can reach you | Multi-region synthetic checks | Sees DNS, TLS, and CDN failures |
| Real users' page speed | RUM, Core Web Vitals at p75 | Real devices and networks |
| Cheap, simple sampling | Head sampling, `parentbased_traceidratio` | Decided at the root span |
| Every error and slow trace | Tail sampling in the Collector | Decides after the trace ends |
| Pages that match user pain | Multiwindow burn-rate SLO alerts | Few, symptom-based, actionable |
| Restart a stuck process | Liveness `/healthz`, no dependencies | A database blip must not restart pods |
| Stop traffic to an instance | Readiness `/readyz`, quick ping, `503` | Drains without restarting |

## Numbers and defaults to remember

| Item | Value |
|---|---|
| pino levels | fatal 60, error 50, warn 40, info 30, debug 20, trace 10 |
| Kubelet log rotation | 10 MiB x 5 files; Docker `json-file` needs `max-size` |
| Prometheus `scrape_interval` | 1 min default, 15-30 s common |
| `rate()` range | At least 4x the scrape interval; `[5m]` typical |
| prom-client default histogram | 11 buckets, 14 series per label set |
| `traceparent` | `00-<32 hex>-<16 hex>-<flags>`; `01` means sampled |
| OTLP ports | 4318 HTTP, 4317 gRPC; Jaeger UI 16686 |
| Error budget, 30 days | 99% 7 h 12 min; 99.9% 43 min 12 s; 99.99% about 4 min 19 s |
| Burn rate | Error ratio / (1 - SLO); budget lasts 30 / burn rate days |
| Burn-rate alerts | Page at 14.4 (1 h, 5 min) and 6 (6 h, 30 min); ticket at 1 (3 d, 6 h) |
| Budget policy | Under 50% extra review; under 25% freeze non-critical releases |
| Alertmanager defaults | `group_wait` 30 s, `group_interval` 5 min, `repeat_interval` 4 h |
| On-call load | At most about 2 incidents per 12-hour shift |
| Core Web Vitals, good | LCP 2.5 s, INP 200 ms, CLS 0.1 (poor: 4 s, 500 ms, 0.25) |
| Synthetic checks | Every 1-5 min; page when 2+ regions fail twice in a row |
| SEV1 updates | Status page within 15 min, then every 30 min |

## Top mistakes

- **Logging whole `req` objects or HTTP client errors.** Log selected
  fields, redact in pino and the pipeline, rotate leaked secrets.
- **Logging `400` and `404` as `error`.** Use `info` or `warn`; `error`
  means someone should look.
- **IDs or raw paths as metric or Loki labels.** Label by route template;
  keep IDs in log lines and span attributes.
- **Averaging percentiles or summing before `rate()`.** Use
  `sum(rate(x[5m]))`, and sum histogram buckets before the quantile.
- **Loading instrumentation after the app.** Load it first with `--import`
  or `--require`, plus the loader hook for ES modules.
- **Checking the database in liveness.** Keep `/healthz` dependency-free
  and check MongoDB in `/readyz`.
- **Paging on causes or once per pod.** Page on SLO burn, group by
  `alertname` and `service`, and inhibit dependent alerts.
- **Deploying source maps.** Upload them in CI, delete them from `dist/`,
  and fail the build if any remain.

## Where to go deeper

- [Observability fundamentals](observability-fundamentals.md)
- [Structured logging](structured-logging.md)
- [Metrics and dashboards](metrics-and-dashboards.md)
- [Distributed tracing](distributed-tracing.md)
- [SLIs, SLOs, and error budgets](slis-slos-and-error-budgets.md)
- [Alerting and on-call](alerting-and-on-call.md)
- [Error tracking and uptime monitoring](error-tracking-and-uptime-monitoring.md)
- [Incident response and postmortems](incident-response-and-postmortems.md)
- [Interview questions and answers](interview-questions-and-answers.md)

Back to the [monitoring and logging overview](../monitoring-and-logging.md).
