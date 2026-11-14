# Monitoring and Logging Interview Questions and Answers

These questions review observability fundamentals, structured logging,
metrics and dashboards, distributed tracing, SLOs and error budgets,
alerting and on-call, error tracking and uptime monitoring, and incident
response. Try answering each one before reading the answer.

## Observability fundamentals

### 1. What is the difference between monitoring and observability?

Monitoring checks known conditions you defined in advance ("is the error
rate above 1%?") and produces dashboards and alerts. Observability is how
well you can answer new questions about the system from its telemetry
without shipping new code, which requires rich, high-cardinality context
on logs and spans. Monitoring detects known failure modes; observability
helps explain novel ones.

### 2. What are the main telemetry signals, and what question does each answer?

Logs record discrete events ("what happened to this request?"). Metrics
are numeric time series ("how much, how fast, is it getting worse?").
Traces follow one request across services ("where did the time go or
fail?"). Profiles sample CPU and memory by function ("which code is
expensive?"). Change events record deploys and config changes ("what
changed?").

### 3. Why are metrics cheap at high traffic while logs are not?

Metric cost depends on the number of time series (label combinations),
not on how many events are counted: a counter incremented a million times
is still one series. Log cost grows with every request, multiplied by
bytes per line. That is why identifiers go in logs and spans, and metrics
keep small, bounded label sets.

### 4. What are Google's four golden signals?

Latency (time to serve requests, with successes and failures measured
separately), traffic (demand, such as requests per second), errors (rate
of failed requests, including wrong answers and policy violations such as
too-slow responses), and saturation (how full the most constrained
resource is). They come from the "Monitoring Distributed Systems" chapter
of the Google SRE book.

### 5. Compare the RED and USE methods.

RED (rate, errors, duration) is applied to every service or endpoint and
describes health as users experience it. USE (utilization, saturation,
errors) is applied to every resource (CPU, memory, disks, connection
pools, the Node.js event loop) and finds bottlenecks. RED tells you a
service is unhealthy; USE tells you which resource is the cause.

### 6. What is the difference between white-box and black-box monitoring?

White-box monitoring uses internal telemetry (metrics, logs, traces) and
explains causes and early warnings. Black-box monitoring tests external
behaviour as a user would, such as an HTTPS probe from several regions,
and catches failures outside the code, like an expired certificate or a
DNS error. Use both: black-box confirms user impact, white-box explains it.

### 7. Why should every signal carry `service.name` and `service.version`?

Shared identity lets you join signals: filter logs, traces, and metrics
for the same service, and split errors and latency by release. "Did the
deploy cause this?" becomes one query instead of an investigation.

## Structured logging

### 8. Why log JSON instead of plain text?

JSON lines are machine-parseable records with named fields, so you can
filter by `level`, `route`, or `userId`, group by error code, and join on
`trace_id` without fragile regular expressions. The message stays short
and constant while variable data moves into fields.

### 9. Which fields should every log line include?

An ISO 8601 UTC timestamp, level, service, environment, version, a short
message, request ID, trace and span IDs, and contextual fields such as
route, method, status, duration, and a pseudonymous user ID. Errors are
serialized as objects with type, message, stack, and code.

### 10. When should a failed request be logged at `error` versus `warn` or `info`?

`error` means someone should look: server-side failures and unhandled
exceptions. Client errors such as a `400` for invalid input or a `404` for
a missing task are expected behaviour; log them at `info` or `warn` on the
request line. Otherwise real errors drown in noise.

### 11. What is a correlation ID, and how is it propagated?

A value attached to all work caused by one request. A request ID is
generated (or validated and accepted) at the edge, returned in
`X-Request-Id`, passed on outgoing HTTP calls and queue messages, and
logged on every line. With tracing, the W3C trace ID plays the same role
across services.

### 12. How does `AsyncLocalStorage` help with request logging in Node.js?

It keeps per-request context (such as the request's child logger and ID)
available to any code running for that request, including after `await`,
so service functions can log with the request ID without passing a
logger through every function signature.

### 13. How do you keep secrets and personal data out of logs?

Never log whole objects such as `req`, headers, bodies, or HTTP client
errors; use the logger's redaction (pino `redact`) for known paths; mask
patterns again in the log pipeline; log pseudonymous IDs instead of
emails; restrict access and set retention. If a secret leaks, rotate it,
because copies may already exist in archives.

### 14. Why must containerized applications log to stdout?

The platform captures stdout and stderr, stores them on the node with
rotation (the kubelet rotates container logs), and an agent ships them.
The app needs no log files, rotation, or shipping code, which is the
Twelve-Factor approach. Writing files inside a container loses logs on
restart and can fill disks.

### 15. How can you cut log volume without losing what matters?

Run production at `info`, skip health-check and metrics-scrape logs, log
one canonical line per request, never log large payloads, and sample fast
successful requests while keeping all errors and slow requests. Counts
should come from metrics, so sampling logs does not break dashboards.

### 16. Why should high-cardinality values not be Loki labels?

Loki indexes only labels, and every unique label set is a separate
stream. Request or user IDs as labels create huge numbers of tiny streams
that overload ingestion and queries. Keep them in the log line and filter
with `| json | reqId="..."`.

## Metrics and dashboards

### 17. Describe the four Prometheus metric types.

A counter only increases (resets on restart) and counts events. A gauge
goes up and down for current state. A histogram counts observations into
cumulative buckets plus `_sum` and `_count`, and can be aggregated across
instances. A summary computes quantiles in the client, which cannot be
aggregated across instances.

### 18. Why does Prometheus pull metrics, and when do you push?

Pulling lets Prometheus know which targets should exist (`up == 0` shows
a dead target), keeps targets simple, and lets you inspect any `/metrics`
endpoint by hand. Short-lived batch jobs that may finish between scrapes
push to a Pushgateway, ideally a success timestamp, and nothing else
should.

### 19. What is cardinality, and how does it explode?

The number of distinct series a metric produces: the product of the value
counts of its labels. 5 methods x 40 routes x 10 statuses x 14 histogram
series x 10 pods is 280,000 series; adding a `user_id` label with 50,000
users multiplies that by 50,000. Raw URL paths, IDs, and free-text labels
are the usual causes.

### 20. Why can't you average percentiles?

A percentile depends on the whole distribution. If pod A's p99 is 100 ms
over 900 requests and pod B's is 2 s over 100 requests, the average of
1,050 ms describes no request, and the true combined p99 is 2 s. Combine
the raw data first: sum histogram buckets across pods, then compute the
quantile.

### 21. How does `histogram_quantile` work, and what limits its accuracy?

It takes cumulative bucket rates, finds the bucket containing the target
rank, and linearly interpolates inside it. Accuracy depends on the bucket
layout; if the quantile falls in the `+Inf` bucket, the result is the
highest finite boundary. Put bucket boundaries at important thresholds
such as the SLO latency target.

### 22. What does `rate()` do, and why apply it before `sum()`?

It computes the per-second average increase of a counter over a range,
handling counter resets. Summing raw counters first hides resets from
individual pods and produces huge spikes, so the correct form is
`sum(rate(x[5m]))`, never `rate(sum(x)[5m:])`.

### 23. How long should the range in `rate(x[...])` be?

Several times the scrape interval, commonly at least four, so each window
has enough samples. With a 15 s scrape interval, `[1m]` is a practical
minimum and `[5m]` is typical for dashboards and alerts.

### 24. Why are averages misleading for latency?

Latency distributions are skewed. An average of 96 ms can hide that 1 in
50 requests takes 2 seconds, and it barely moves when the tail worsens.
Percentiles (p50, p95, p99) or "fraction of requests under 300 ms" show
what users actually experience.

### 25. How would you label an Express request-duration histogram?

With `method`, the route template from `req.baseUrl + req.route.path`
(such as `/tasks/:id`, or a single value like `unmatched` for 404s), and
`status_code`. Never the raw URL, user ID, or request ID.

### 26. What makes a good service dashboard?

The same RED layout for every service (rate, error ratio, latency
percentiles, SLO status) at the top, details by route and version below,
dependency and saturation panels after that, deploy annotations, units
and threshold lines on every panel, template variables instead of copies,
and the JSON kept in version control.

### 27. What are recording rules for?

They evaluate expensive PromQL expressions on a schedule and store the
results as new series, so dashboards and alerts read precomputed values.
They are named `level:metric:operations`, for example
`job_route:http_requests:rate5m`.

## Distributed tracing

### 28. What are a trace, a span, and a span context?

A trace is a tree of spans sharing one trace ID for a single request. A
span is one timed operation with a name, kind, parent, attributes,
events, and status. The span context (trace ID, span ID, trace flags) is
what is propagated so the next span can name its parent.

### 29. Explain the W3C `traceparent` header field by field.

`00-<trace-id>-<parent-id>-<flags>`: the version (`00`), a 16-byte trace ID
as 32 hex characters shared by every span, the 8-byte span ID of the
calling span as 16 hex characters, and trace flags where the lowest bit
means sampled (`01`). The trace ID stays the same on every hop; the
parent ID changes.

### 30. How does context propagation work inside and between processes?

Inside a Node.js process, OpenTelemetry's context manager (built on
`AsyncLocalStorage`) keeps the active span across `await`. Between
processes, a propagator injects the context into HTTP or message headers
and the receiver extracts it to start a child span. Any hop that does not
do this breaks the trace.

### 31. Why does OpenTelemetry separate the API from the SDK?

Libraries depend only on the stable, lightweight API, which does nothing
without an SDK. The application installs and configures the SDK
(sampling, exporters). This lets libraries be instrumented once and cost
almost nothing when tracing is not enabled.

### 32. Why must instrumentation load before the application code?

Auto-instrumentation works by patching modules such as `http`, Express,
and the MongoDB driver when they are loaded. If they are imported first,
they are not patched and no spans appear. Load it with `--require` or
`--import` (plus the loader hook for ES modules).

### 33. What does the OpenTelemetry Collector add?

A separate pipeline of receivers, processors, and exporters. Apps send
OTLP to one endpoint; the Collector batches, retries, limits memory,
scrubs sensitive attributes, applies tail sampling, and exports to one or
more backends. Changing vendors becomes a config change and apps never
hold vendor credentials.

### 34. Compare head sampling and tail sampling.

Head sampling decides at the root span (for example parent-based 10%),
which is cheap but drops most error and slow traces. Tail sampling decides
in the Collector after the trace completes, keeping all errors and slow
traces plus a share of the rest, at the cost of buffering spans and
routing every span of a trace to the same Collector instance.

### 35. How do you link logs, metrics, and traces?

Log the trace and span IDs on every line (OpenTelemetry's pino
instrumentation does this), attach exemplars (sample trace IDs) to
histogram buckets, record the trace ID in error-tracker events, and use
the same service resource attributes everywhere.

## SLIs, SLOs, and error budgets

### 36. Define SLI, SLO, SLA, and error budget.

An SLI is a measurement, usually good events over valid events. An SLO is
a target for it over a window (99.9% over 30 days). An SLA is a contract
with consequences such as service credits. The error budget is `1 - SLO`,
the failure the SLO allows. SLAs should be looser than internal SLOs.

### 37. How much downtime does 99.9% allow in 30 days? And 99.99%?

30 days is 43,200 minutes. 99.9% allows 0.1%, which is 43.2 minutes
(43 min 12 s); 99.99% allows 4.32 minutes (about 4 min 19 s); 99% allows 7
hours 12 minutes.

### 38. What makes a good SLI?

It reflects what users experience (availability, latency, freshness,
correctness), is measured as close to users as practical (load balancer
or synthetic checks, not only inside the app), has a clear definition of
valid events, and uses latency thresholds rather than averages.

### 39. What is burn rate?

Observed error ratio divided by the error budget ratio. A burn rate of 1
uses exactly the whole budget over the window; 14.4 on a 30-day window
uses 2% of the budget per hour and exhausts it in about two days.

### 40. Explain multiwindow, multi-burn-rate alerting.

Alert when both a long and a short window exceed a burn-rate threshold.
The SRE Workbook suggests paging at 14.4 over 1 hour and 5 minutes, and
at 6 over 6 hours and 30 minutes, and opening a ticket at 1 over 3 days
and 6 hours. The long window proves the burn is significant; the short one
(one-twelfth of it) makes the alert resolve quickly after a fix.

### 41. What is an error budget policy?

An agreed document that states what happens as the budget is consumed,
such as extra review below 50% and a freeze on non-critical releases below
25% or when exhausted, with exceptions for security fixes. It turns the
SLO into decisions without debates.

## Alerting and on-call

### 42. Why alert on symptoms rather than causes?

Symptoms (errors, latency, failed journeys) always matter to users and
are few. Causes (CPU, restarts, replica lag) are many, change with the
architecture, and often hurt nobody. Causes belong on dashboards, in
tickets, and in runbooks as diagnosis steps.

### 43. What qualities should every paging alert have?

It should be urgent, actionable (the responder can do something), require
human judgement (otherwise automate it), and be novel (not a duplicate of
another page). It needs a runbook link and a dashboard.

### 44. What do Alertmanager grouping, inhibition, and silences do?

Grouping combines related alerts (by alertname and service) into one
notification. Inhibition suppresses alerts while a related, more
important alert fires, such as all TaskFlow alerts while "API down" is
paging. Silences are time-limited manual mutes for maintenance, with an
author and a comment.

### 45. What is a dead man's switch in alerting?

An always-firing alert (often called Watchdog) sent to an external
service, which pages if it stops arriving. It proves the whole chain from
Prometheus through Alertmanager to the receiver works, which the system
cannot verify about itself.

### 46. What makes an on-call rotation healthy?

Enough people (commonly six to eight or more), primary and secondary
roles, written handoffs, a clear escalation policy, a low and declining
number of pages (at most about two incidents per 12-hour shift), a high
actionable rate, compensation, and recovery time after bad nights.

## Error tracking and uptime monitoring

### 47. What does an error tracker provide beyond logs?

Grouping of identical exceptions into issues with counts and affected
users, readable stack traces with source context, breadcrumbs, release
and environment tracking, regression detection, and a triage workflow,
all linked to traces and logs.

### 48. Why upload source maps but never serve them publicly?

Without maps, minified stacks are unreadable; with them, the tracker can
symbolicate to original files and lines. Public maps expose your original
source code, comments, internal routes, and unreleased features. Upload
them privately in CI for each release, then delete them from the build
output.

### 49. What are the Core Web Vitals and their thresholds?

LCP (loading) should be 2.5 s or less, INP (responsiveness) 200 ms or
less, and CLS (visual stability) 0.1 or less, evaluated at the 75th
percentile of page loads. INP replaced First Input Delay in March 2024.

### 50. What is the difference between `/healthz` and `/readyz`?

Liveness (`/healthz`) answers "is the process alive?" and must not check
dependencies; failure restarts the container. Readiness (`/readyz`)
answers "can it serve traffic now?" and may check required dependencies
with a short timeout; failure removes the instance from load balancing.
Checking the database in liveness causes mass restarts during a database
blip.

### 51. How do you avoid false alarms from synthetic checks?

Probe from several regions outside your infrastructure and alert only
when two or more regions fail on consecutive runs. Check real journeys
(API health, login and create task), not just a static home page.

## Incident response and postmortems

### 52. What are the phases of the incident lifecycle?

Detect, triage (declare, set severity, assign roles), mitigate (stop user
impact), resolve (fix the cause and verify), and learn (postmortem and
action items). Measure time to detect, acknowledge, mitigate, and resolve.

### 53. What does the incident commander do, and what do they not do?

The IC coordinates: sets priorities, assigns work, makes decisions,
tracks the overall state, and hands off explicitly. The IC does not debug
or change production, because coordination collapses when the coordinator
is heads-down in a terminal.

### 54. Why mitigate before finding the root cause?

Users are hurt while you investigate. Rolling back, turning off a flag,
failing over, or shedding load stops the damage quickly, and the root
cause can then be found calmly, after preserving evidence such as logs
and heap snapshots.

### 55. What makes a postmortem blameless, and why does it matter?

It analyses how the system (tools, defaults, processes) allowed the
failure and assumes people acted reasonably with what they knew. Blame
makes people hide details, and the details are what make the analysis
useful. Accountability remains: owners must complete action items.

### 56. What are the limits of the 5 whys?

It produces one linear chain while incidents usually have several
contributing factors, different people reach different answers, and it
often stops at "human error". Use it alongside a contributing-factors
analysis across technical, detection, response, and process categories.

## Scenario-based questions

### 57. Dashboards are green, but customers report that TaskFlow is down. What do you check?

**What to check first:** external synthetic checks and a request from
outside your network to the public URL; certificate expiry and DNS
records.

**How to confirm:** `curl -v https://api.example.com/healthz` from
outside; ingress or load balancer logs show few or no requests compared
with normal.

**Likely causes and fixes:** a failure before requests reach the app (DNS
change, expired certificate, CDN or load balancer misconfiguration).
Fix the edge issue, then add multi-region black-box probes and measure
SLIs at the edge. See
[observability fundamentals](observability-fundamentals.md).

### 58. After a deploy, Prometheus memory doubles and it starts restarting. What happened?

**What to check first:** `prometheus_tsdb_head_series` over time and the
TSDB status page's top metrics by series count.

**How to confirm:** the series count jumps at the deploy time and one
metric, such as `http_request_duration_seconds`, has a label with
thousands of values.

**Likely causes and fixes:** a new unbounded label, usually the raw path
instead of the route template, or an ID. Fix the instrumentation, drop the
label with `metric_relabel_configs` as a stopgap, and review new labels in
code review. See [metrics and dashboards](metrics-and-dashboards.md).

### 59. Average latency is 90 ms and stable, yet users complain that task lists are slow. How do you investigate?

**What to check first:** p95 and p99 from the duration histogram per
route, not the average.

**How to confirm:** p99 for `GET /tasks` is several seconds, and slow
traces share an attribute such as very large task counts or one tenant.

**Likely causes and fixes:** a tail problem hidden by the mean, often an
unindexed query or unbounded result size for heavy users. Add the index or
pagination, and set SLOs on percentiles or thresholds. See
[metrics and dashboards](metrics-and-dashboards.md).

### 60. Traces show the API span but downstream services appear as separate, parentless traces. Why?

**What to check first:** whether outgoing requests carry a `traceparent`
header and whether the downstream service uses the W3C propagator.

**How to confirm:** capture a request at the downstream service; the
header is missing or stripped by a proxy, or a different propagation
format is configured.

**Likely causes and fixes:** an uninstrumented HTTP client, a gateway that
drops unknown headers, or mismatched propagators. Use instrumented clients,
allow trace headers through proxies, and standardize on W3C Trace Context.
See [distributed tracing](distributed-tracing.md).

### 61. You deployed OpenTelemetry to TaskFlow API but no spans arrive. What do you check?

**What to check first:** how the instrumentation is loaded and the
exporter endpoint.

**How to confirm:** set `OTEL_LOG_LEVEL=debug`; logs show export errors,
or show that Express and MongoDB were never patched.

**Likely causes and fixes:** the instrumentation file is imported after
the app modules, the ES module loader hook is missing, or the OTLP
endpoint or port (4318 for HTTP, 4317 for gRPC) is wrong. Load it with
`--import` or `--require` before the app and verify the Collector address.
See [distributed tracing](distributed-tracing.md).

### 62. The on-call engineer got 40 pages in two minutes during a database failover. How do you fix the alerting?

**What to check first:** the alert rules that fired and Alertmanager's
`group_by` and inhibit rules.

**How to confirm:** the pages are one per pod or per instance, all for the
same underlying problem.

**Likely causes and fixes:** grouping by `instance`, per-pod cause alerts,
and no inhibition. Group by `alertname` and `service`, inhibit dependent
alerts while "database down" fires, and page on service-level SLO burn
instead. See [alerting and on-call](alerting-and-on-call.md).

### 63. A burn-rate alert pages every night for a few minutes and resolves on its own. What is wrong?

**What to check first:** request volume during those minutes and the
number of failed requests behind the error ratio.

**How to confirm:** at night only a few dozen requests arrive, so two or
three failures exceed the 1.44% threshold.

**Likely causes and fixes:** low traffic makes ratios noisy. Require a
minimum count of failed requests, add steady synthetic traffic, or use
longer windows for low-traffic services. See
[SLIs, SLOs, and error budgets](slis-slos-and-error-budgets.md).

### 64. During a 10-minute MongoDB failover, every TaskFlow pod restarted and the outage lasted 25 minutes. Why?

**What to check first:** the liveness probe endpoint and what it checks.

**How to confirm:** pod restart counts jump on all pods at the same time,
and `/healthz` runs a database query.

**Likely causes and fixes:** a liveness probe with a dependency check, so a
database problem kills healthy processes and restarts add time. Make
`/healthz` dependency-free and move the database ping to `/readyz`. See
[error tracking and uptime monitoring](error-tracking-and-uptime-monitoring.md).

### 65. Frontend error reports show only `main.3f9a.js:1:4821` frames after the latest release. How do you fix it?

**What to check first:** whether source maps were uploaded for this
release and whether the SDK's release name matches the uploaded one.

**How to confirm:** the tracker's release page shows no artifacts, or
artifacts under a different release string.

**Likely causes and fixes:** the upload step failed or ran with a
different version variable. Upload in the same CI job that builds, use one
release variable for both, fail the build if the upload fails, and keep
deleting maps from `dist/`. See
[error tracking and uptime monitoring](error-tracking-and-uptime-monitoring.md).

### 66. A security review finds access tokens in the log store. What do you do?

**What to check first:** which service and log statement wrote them, and
how long they have been stored.

**How to confirm:** search for the token pattern; it appears inside a
serialized HTTP client error or a headers object.

**Likely causes and fixes:** logging whole request or error objects that
bypassed redaction paths. Rotate the exposed tokens, purge or restrict
the affected streams, log selected fields only, add pipeline masking and a
redaction test. See [structured logging](structured-logging.md).

### 67. Log ingestion costs doubled overnight with no traffic increase. How do you find the cause?

**What to check first:** ingestion volume by service and by log level.

**How to confirm:** one service's `debug` lines or one message dominate,
starting at a deploy time.

**Likely causes and fixes:** debug level left on in production, or a log
statement inside a loop. Restore `info`, remove the noisy statement, sample
high-volume success logs, and alert on ingestion per service. See
[structured logging](structured-logging.md).

### 68. During a SEV1, five engineers debug in parallel, two of them restart the same service, and customers learn about it from social media. What changes do you make?

**What to check first:** whether an incident commander and a
communications lead were assigned, and where the discussion happened.

**How to confirm:** the incident channel has no recorded decisions, and
the first status update came long after the first page.

**Likely causes and fixes:** an unmanaged incident. Declare early, assign
an IC who does not debug, keep one channel and document, have a comms
lead post an initial status within minutes and update on a cadence. See
[incident response and postmortems](incident-response-and-postmortems.md).

### 69. Postmortems keep listing the same contributing factor, and the incident repeats. What is going wrong?

**What to check first:** the status of action items from earlier
postmortems.

**How to confirm:** the earlier items are vague ("improve monitoring"),
unowned, or still open past their due dates.

**Likely causes and fixes:** action items are not concrete, owned, or
tracked. Write specific, verifiable items with one owner and a due date
in the normal backlog, review completion regularly, and treat overdue
high-priority items as accepted risk that leadership must sign off. See
[incident response and postmortems](incident-response-and-postmortems.md).

### 70. Users report slow page loads in TaskFlow Web, but API latency is fine. How do you investigate?

**What to check first:** real-user Core Web Vitals (LCP and INP at p75) by
route, device type, and release.

**How to confirm:** LCP or INP regressed with a specific frontend release,
or only on mobile devices.

**Likely causes and fixes:** a larger bundle, render-blocking resources,
or heavy main-thread work in the browser. Fix the frontend regression and
track Web Vitals per release like backend latency. See
[error tracking and uptime monitoring](error-tracking-and-uptime-monitoring.md).

## Further learning

- [Monitoring and logging overview](../monitoring-and-logging.md)
- [Observability fundamentals](observability-fundamentals.md) ·
  [Structured logging](structured-logging.md) ·
  [Metrics and dashboards](metrics-and-dashboards.md) ·
  [Distributed tracing](distributed-tracing.md) ·
  [SLIs, SLOs, and error budgets](slis-slos-and-error-budgets.md) ·
  [Alerting and on-call](alerting-and-on-call.md) ·
  [Error tracking and uptime monitoring](error-tracking-and-uptime-monitoring.md) ·
  [Incident response and postmortems](incident-response-and-postmortems.md)
- [Google SRE book: Monitoring Distributed Systems](https://sre.google/sre-book/monitoring-distributed-systems/)
- [Google SRE Workbook: Alerting on SLOs](https://sre.google/workbook/alerting-on-slos/)
- [OpenTelemetry documentation](https://opentelemetry.io/docs/)
