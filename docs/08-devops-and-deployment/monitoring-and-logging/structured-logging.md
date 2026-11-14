# Structured Logging

A log is a timestamped record of something that happened. A *structured*
log writes that record as data (usually one JSON object per line) instead
of a sentence, so machines can filter, group, and join it. This lesson
covers log levels, the fields every line needs, correlation IDs that tie a
request together across services, a production pino setup for TaskFlow API
with request logging and redaction, keeping secrets and personal data out
of logs, controlling volume and cost, and the pipeline that carries logs
from a container's stdout to a searchable store.

## Why it matters

During an incident, logs are where you go to answer "what exactly happened
to *this* request?". Plain text lines such as
`Error creating task for user 42` look readable, but you cannot reliably
filter them by user, count them by route, or find every line belonging to
one request across four services. Every team that grows past one server
eventually rewrites its logging to be structured, usually during a painful
incident.

Logs are also the most common place for data leaks and runaway costs. One
`console.log(req.headers)` can write every user's session token into a
system dozens of people can search, and a debug statement inside a loop
can double a logging bill overnight. Good logging is as much about what you
leave out as what you put in.

## Real-world usage

- **The Twelve-Factor App.** The
  [Logs](https://12factor.net/logs) factor says an app should treat logs as
  event streams and write them, unbuffered, to stdout, leaving routing and
  storage to the execution environment. This is exactly how container
  platforms collect logs today.
- **Stripe (canonical log lines).** Stripe's engineering post
  [Fast and flexible observability with canonical log lines](https://stripe.com/blog/canonical-log-lines)
  describes emitting one information-dense line per request at the end of
  the request, with the key facts (route, status, duration, user, rate
  limit decisions) as fields, so most questions can be answered by
  querying a single line type.
- **OWASP.** The
  [Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html)
  lists which security events to log and which data must never be logged
  directly (session identifiers, access tokens, passwords, encryption
  keys, and sensitive personal data), and recommends removing, masking,
  hashing, or encrypting such data.
- **Grafana Loki.** Loki's
  [label best practices](https://grafana.com/docs/loki/latest/get-started/labels/bp-labels/)
  explain that Loki indexes only labels, so labels must be few and low
  cardinality; high-cardinality values such as request IDs belong in the
  log line itself, where queries can still filter on them.

**Popular tools and providers:** pino, winston, and Bunyan for Node.js;
Fluent Bit, Fluentd, Vector, Logstash, and the OpenTelemetry Collector as
agents; Grafana Loki, Elasticsearch, OpenSearch, Amazon CloudWatch Logs,
Google Cloud Logging, Azure Monitor Logs, Datadog, and Splunk as stores.

## How it works

### From text lines to structured events

Compare the same event written two ways:

```text
2026-11-13 14:03:12 ERROR Failed to create task for user 42: duplicate key
```

```json
{"level":"error","time":"2026-11-13T14:03:12.481Z","service":"taskflow-api","env":"production","version":"1.42.0","reqId":"7f3a9c2e-0b1d-4d6e-9a51-2f0c8b6e1d44","trace_id":"4bf92f3577b34da6a3ce929d0e0e4736","span_id":"00f067aa0ba902b7","userId":"u_42","route":"/tasks","method":"POST","err":{"type":"MongoServerError","message":"E11000 duplicate key error","code":11000},"msg":"failed to create task"}
```

The text line needs a regular expression for every question, breaks when
someone rewords the message, and has no request or trace ID. The JSON line
can be filtered with `level="error" and route="/tasks"`, grouped by
`err.code`, and joined to the trace for that request. The message becomes
a short, stable description; the variable parts move into fields.

### Log levels and when to use each

pino uses numeric levels, with names that most loggers share:

| Level | pino value | Use it for | TaskFlow example |
|---|---|---|---|
| `fatal` | 60 | The process cannot continue and is about to exit | Cannot connect to MongoDB at startup after retries |
| `error` | 50 | A request or job failed and needs attention | Unhandled exception in `POST /tasks`; a job exhausted its retries |
| `warn` | 40 | Something unexpected that was handled, or a degraded mode | Retrying a timed-out call; serving from a fallback; deprecated API used |
| `info` | 30 | Normal, significant events | Request completed (one line each); server started; task reminder sent |
| `debug` | 20 | Detail for developers diagnosing a problem | Query filters used, cache hit or miss |
| `trace` | 10 | Very fine-grained flow | Entering and leaving functions |

Rules that keep levels meaningful:

- **Production runs at `info`.** `debug` is turned on temporarily, ideally
  for one service or component, and turned off again.
- **`error` means someone should look.** A `404` for a missing task or a
  `400` for invalid input is the client's mistake: log it at `info` or
  `warn` on the request line, not as `error`. Otherwise the error count
  becomes noise and real failures hide in it.
- **Log an error once, where it is handled.** Logging at every layer that
  rethrows produces five copies of one failure.
- **Level is not severity for alerting.** Alerts should come from metrics
  and SLOs; a spike of `error` lines is a useful signal, but paging on
  single log lines creates alert fatigue.

### The fields every line needs

| Field | Example | Why |
|---|---|---|
| `time` | `2026-11-13T14:03:12.481Z` | ISO 8601 in UTC with milliseconds; sortable and timezone-safe |
| `level` | `"error"` | Filtering; a string label is easier to query than `50` |
| `service` | `"taskflow-api"` | Which service wrote it (same value as `service.name` in traces and metrics) |
| `env` | `"production"` | Never mix staging and production lines by accident |
| `version` | `"1.42.0"` | Did this start with a release? |
| `msg` | `"failed to create task"` | Short, constant description of the event |
| `reqId` | UUID | Every line of one request, within and across services |
| `trace_id`, `span_id` | 32 and 16 hex characters | Jump from a log line to the distributed trace |
| Context | `route`, `method`, `status`, `duration_ms`, `userId`, `tenantId` | The dimensions you will filter by |
| `err` | `{ type, message, stack, code }` | Serialized errors, not `"[object Object]"` |

Keep field names consistent across services: if one service writes
`user_id` and another `userId`, every query has to handle both. Many teams
publish a small shared logging package. OpenTelemetry's
[log data model](https://opentelemetry.io/docs/specs/otel/logs/data-model/)
defines standard top-level fields (timestamp, severity, body, trace and
span IDs, resource, and attributes) that collectors can map JSON lines
onto.

### Correlation IDs

A **correlation ID** is a value attached to everything that happens because
of one request, so all of it can be found together.

- A **request ID** identifies one inbound HTTP request. It is generated at
  the edge (ingress or load balancer) or by the first service, returned to
  the client in an `X-Request-Id` response header (so a user or support
  agent can quote it), and passed to downstream calls.
- A **trace ID** comes from distributed tracing. It is carried in the W3C
  `traceparent` header and covers the whole tree of calls, including
  asynchronous work. With OpenTelemetry in place, the trace ID can serve as
  the correlation ID, and the request ID becomes a user-facing handle.

![Diagram: a sequence across Browser, Ingress, TaskFlow API, Notifications, and Queue worker. 1: the browser sends POST /tasks to the ingress. 2: the ingress adds X-Request-Id and traceparent, logs reqId=7f3a and trace_id=4bf9, and forwards to the API. The API logs the same two IDs. 3: the API calls POST /reminders on the notifications service with the same two headers, and that service logs the same IDs. 4: the API publishes a job with the IDs in the message headers. 5: the API returns 201 with X-Request-Id: 7f3a to the browser. Later the worker logs the same IDs. A log store query for trace_id="4bf9" returns lines from the ingress, API, notifications, and worker.](correlation-id-flow.svg)

Three details make correlation work in practice:

1. **Propagate on every hop**, including message queues: put the IDs in
   message headers or job metadata so the worker's lines join the same
   story.
2. **Do not pass the logger through every function.** In Node.js,
   `AsyncLocalStorage` keeps per-request context available to any code
   running for that request, including after `await`.
3. **Treat incoming IDs as untrusted input.** Accept an `X-Request-Id`
   only if it matches a strict pattern (length and characters), or only
   from your own edge. Otherwise a client can inject newlines, huge
   values, or another request's ID into your logs.

### Never log secrets or personal data

Logs are copied to agents, stores, backups, and laptops, and are readable
by far more people than the production database. Treat anything written to
a log as widely visible and long-lived.

Never log:

- Passwords, password reset tokens, API keys, OAuth access and refresh
  tokens, session cookies, and `Authorization` headers.
- Private keys, connection strings with embedded passwords, and webhook
  signing secrets.
- Full payment card numbers, CVVs, and bank account numbers.
- Health or other special-category data, and government identifiers.

Minimize personal data (names, email addresses, phone numbers, IP
addresses): log a stable internal user ID (`u_42`) rather than an email
address, and only keep IP addresses if you need them for security, with a
short retention period. Privacy laws such as the GDPR treat these as
personal data with rules on purpose and retention.

Defend in layers:

- **Do not log whole objects** such as `req`, `req.headers`, `req.body`, or
  third-party error objects. HTTP client errors (for example from axios)
  often contain the request configuration, including the `Authorization`
  header.
- **Redact at the source** with the logger's redaction feature (pino's
  `redact` option), which replaces values at known paths before
  serialization.
- **Scrub again in the pipeline** with agent rules that mask patterns such
  as `Bearer <token>` or card-number-like digit runs.
- **Restrict and audit access** to the log store, and set retention
  deliberately.
- **If a secret leaks, rotate it.** Deleting log lines is not enough; copies
  may already exist in archives and backups.

### Controlling volume and cost

Logging cost grows with traffic times bytes per request, so small habits
compound:

- **Levels per environment:** `debug` locally, `info` in production.
- **One canonical line per request** instead of five lines at each layer.
- **Skip noise:** health checks, readiness probes, and metrics scrapes can
  be thousands of requests an hour per instance; do not log them.
- **Sample successful requests, keep everything else:** log all errors,
  all slow requests, and a fraction of fast `2xx` requests.
- **Never log large payloads** (full task lists, file contents); log sizes
  and counts instead.
- **Watch for loops:** a log call inside a per-item loop or a retry loop is
  the classic cause of sudden volume spikes.

Worked example: TaskFlow API at 300 requests per second, 700 bytes per
request line.

```text
Before: 300 x 700 B = 210 KB/s = ~18.1 GB/day

After:
  health checks and /metrics scrapes removed: 10% of requests  -> 270 req/s
  errors (1%) and slow requests (2%) always kept: 3% of 270     -> 8.1 req/s
  fast 2xx lines sampled at 10%: 97% of 270 x 0.10             -> 26.2 req/s
  total 34.3 req/s x 700 B = ~24 KB/s = ~2.1 GB/day  (about 88% less)
```

Request counts and latency are still exact, because they come from
metrics, not from counting log lines. Sampling only works if your
dashboards do not depend on counting logs.

### Logging in containers

In containers, the application writes to **stdout and stderr** and nothing
else: no log files, no rotation logic, no shipping code.

- The container runtime captures the streams. On Kubernetes nodes, logs
  are written to files under `/var/log/pods/`, and the kubelet rotates them
  (its `containerLogMaxSize` and `containerLogMaxFiles` settings default to
  10 MiB and 5 files). `kubectl logs` reads those files.
- Docker's default `json-file` logging driver does **not rotate** logs
  unless you set `max-size` and `max-file`; unbounded log files are a
  classic cause of full disks. Docker's `local` driver rotates by default.
- Pretty-printing (for example `pino-pretty`) is for local development
  only. In production, emit raw JSON lines and let tools format them.
- Write logs synchronously or flush on shutdown. If the process crashes
  with logs still buffered in memory, the most important lines (the ones
  just before the crash) are lost. pino's default stdout destination is
  asynchronous; `logger.fatal()` always flushes synchronously, and
  `pino.destination({ sync: true })` makes every write synchronous.

### Aggregation pipelines

![Diagram: TaskFlow API writes pino JSON lines to stdout; the container runtime stores them in /var/log/pods, rotated by the kubelet; a log agent (Vector or Fluent Bit, one per node) tails the files and pushes to a log store (Loki, Elasticsearch, or CloudWatch Logs) with a hot tier of 14 to 30 days, indexed for fast queries, and an archive tier of a year or more in compressed object storage. Inside the agent, each line is parsed as JSON, enriched with pod metadata, redacted for secrets, and sampled or stripped of debug lines, then buffered on disk and retried until the store accepts the batch. From the store, engineers query with LogQL or KQL and alerts watch for error spikes. A red box lists what must never be logged: passwords, tokens, cookies, Authorization headers, card numbers.](log-pipeline.svg)

A typical pipeline has three stages:

1. **Agent** on each node (Fluent Bit, Vector, or the OpenTelemetry
   Collector, usually as a Kubernetes DaemonSet) tails container log
   files, parses JSON, adds metadata (namespace, pod, container, node),
   applies redaction and filtering, and buffers on disk so a store outage
   does not lose data.
2. **Optional aggregator** tier (another Vector or Collector deployment, or
   a queue such as Kafka) for heavy processing, fan-out to several
   destinations, or absorbing bursts.
3. **Store and query** layer that indexes, retains, and searches.

| Store | Indexing model | Strengths | Watch out for |
|---|---|---|---|
| Grafana Loki | Indexes only labels; scans compressed chunks for content | Cheap storage on object stores; fits Grafana and Prometheus-style labels | High-cardinality labels create too many streams; broad text searches scan a lot of data |
| Elasticsearch / OpenSearch | Full-text inverted index of fields | Fast, flexible search and aggregations | Index size, memory, and cluster operations cost; mapping explosions from inconsistent fields |
| Cloud logging (CloudWatch Logs, Cloud Logging) | Managed | No servers to run; IAM integration | Ingestion and query pricing; per-region and per-account setup |

Delivery is normally **at least once**: the agent retries until the store
acknowledges, so occasional duplicates are possible, and a long store
outage can fill the agent's buffer. Monitor agent buffer usage and dropped
records.

### Retention and querying

Retention is a cost and compliance decision, set per stream:

- **Hot, searchable:** 7 to 30 days for application logs, enough to
  investigate incidents and recent bugs.
- **Archive:** compressed objects in cheaper storage for months or years
  when audit or regulation requires it, restored to a searchable tier only
  when needed.
- **Security and audit logs** often have longer, legally defined retention
  and stricter access than application logs.

Example queries for the same question, "show TaskFlow errors on
`POST /tasks`":

```text
# Grafana Loki (LogQL): select streams by label, then parse and filter
{service="taskflow-api", env="production"} | json | level="error" | req_method="POST"

# LogQL metric query: error lines per minute, per environment
sum by (env) (count_over_time({service="taskflow-api"} | json | level="error" [1m]))

# Amazon CloudWatch Logs Insights
fields @timestamp, msg, reqId, trace_id
| filter level = "error" and req.method = "POST"
| sort @timestamp desc
| limit 50
```

LogQL's `json` parser flattens nested fields with underscores, so
`req.method` becomes `req_method`. Use queries like these to investigate;
for dashboards and alerts, prefer real metrics, which are cheaper and
exact.

## When to use and when not to use

| You want to know | Use | Not |
|---|---|---|
| What happened to request `7f3a`? | Logs filtered by request or trace ID | Metrics (they are aggregated) |
| How many requests failed in the last hour? | A metric counter | Counting log lines (sampled, slower, costlier) |
| Which service made the request slow? | A trace | Comparing timestamps across services' logs |
| Who changed a task's owner, and when? | An audit log with its own retention and access rules | Debug lines in the application log |
| What did the user send? | Log the shape (field names, sizes), not the content | Logging `req.body` |

Logs are the right tool for discrete, detailed events and for exploring
unanticipated questions. They are the wrong tool for counting, alerting on
rates, or storing business records: a log store is not a database or an
audit system unless it is designed and retained as one.

## Practical examples

### A production pino logger

```js
// src/logger.js
import pino from "pino";

const isProd = process.env.NODE_ENV === "production";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (isProd ? "info" : "debug"),
  // Fields added to every line. Replaces pino's default pid and hostname;
  // the log agent adds pod and node metadata instead.
  base: {
    service: "taskflow-api",
    env: process.env.NODE_ENV ?? "development",
    version: process.env.APP_VERSION ?? "dev",
  },
  timestamp: pino.stdTimeFunctions.isoTime, // "time":"2026-11-13T14:03:12.481Z"
  formatters: {
    level(label) {
      return { level: label }; // "error" instead of 50
    },
  },
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      'res.headers["set-cookie"]',
      "password",
      "token",
      "*.password",
      "*.token",
      "*.refreshToken",
    ],
    censor: "[REDACTED]",
  },
});
```

`redact` paths use dot notation with wildcards; `*.password` matches a
`password` key one level down in any logged object, such as
`{ body: { password } }`, so top-level keys (`password`, `token`) are
listed separately. Redaction is a safety net for known paths, not a
licence to log whole objects.

### Request logging with request IDs and request context

```js
// src/http-logger.js
import { randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import pinoHttp from "pino-http";
import { logger } from "./logger.js";

const SAFE_ID = /^[A-Za-z0-9-]{8,64}$/;
const SKIP = new Set(["/healthz", "/readyz", "/metrics"]);
const context = new AsyncLocalStorage();

export const httpLogger = pinoHttp({
  logger,
  quietReqLogger: true, // req.log binds only reqId, not the whole request
  genReqId(req, res) {
    const incoming = req.headers["x-request-id"];
    const id = typeof incoming === "string" && SAFE_ID.test(incoming) ? incoming : randomUUID();
    res.setHeader("X-Request-Id", id);
    return id;
  },
  customLogLevel(req, res, err) {
    if (err || res.statusCode >= 500) return "error";
    if (res.statusCode >= 400) return "warn";
    return "info";
  },
  autoLogging: { ignore: (req) => SKIP.has(req.url) },
});

// Makes the request's child logger available to any code running for it.
export function requestContext(req, res, next) {
  context.run({ log: req.log, requestId: req.id }, next);
}

export function getLog() {
  return context.getStore()?.log ?? logger;
}

export function getRequestId() {
  return context.getStore()?.requestId;
}
```

```js
// src/app.js
import express from "express";
import { httpLogger, requestContext } from "./http-logger.js";
import { tasksRouter } from "./tasks/router.js";

export const app = express();
app.use(httpLogger);      // first, so every request gets an ID and a completion line
app.use(requestContext);
app.use(express.json());
app.use("/tasks", tasksRouter);

// Error handler: attach the error to the request's completion line
// instead of logging a second, separate line.
app.use((err, req, res, next) => {
  res.err = err;
  res.status(500).json({ error: "Internal Server Error", requestId: req.id });
});
```

```js
// src/tasks/service.js: no logger parameter needed
import { getLog } from "../http-logger.js";

export async function createTask(db, userId, input) {
  const result = await db.collection("tasks").insertOne({ ...input, userId, createdAt: new Date() });
  getLog().info({ taskId: result.insertedId.toString(), userId }, "task created");
  return result.insertedId;
}
```

pino-http writes one completion line per request with `reqId`, the
serialized request (method, URL, headers after redaction) and response
(status), and `responseTime` in milliseconds. Returning `requestId` in the
error body lets a user quote it to support. When the OpenTelemetry Node.js
auto-instrumentation is loaded (see
[distributed tracing](distributed-tracing.md)), its pino instrumentation
adds `trace_id`, `span_id`, and `trace_flags` to every line written while a
span is active, with no code changes.

### Propagating the request ID downstream

Outgoing `fetch` calls get the `traceparent` header automatically from the
OpenTelemetry instrumentation; the request ID is passed explicitly.

```js
// src/clients/notifications.js
import { getRequestId, getLog } from "../http-logger.js";

export async function scheduleReminder(task) {
  const requestId = getRequestId();
  const res = await fetch("https://notifications.internal.example.com/reminders", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(requestId ? { "x-request-id": requestId } : {}),
    },
    body: JSON.stringify({ taskId: task.id, dueAt: task.dueAt }),
    signal: AbortSignal.timeout(2000),
  });
  if (!res.ok) {
    // Log the status, not the response body or the request headers.
    getLog().warn({ status: res.status, taskId: task.id }, "reminder scheduling failed");
  }
}
```

For queue jobs, store the request ID in the job's data or message headers
and bind it to the worker's child logger:
`logger.child({ reqId: job.data.requestId, jobId: job.id })`.

### Shipping logs with Vector on Kubernetes

```yaml
# vector.yaml (agent running as a DaemonSet)
sources:
  k8s:
    type: kubernetes_logs

transforms:
  parse:
    type: remap
    inputs: [k8s]
    source: |
      parsed, err = parse_json(.message)
      if err == null && is_object(parsed) {
        . = merge(., object!(parsed))
        del(.message)
      }
      # Label values must exist for every event, including non-JSON lines.
      if !exists(.service) { .service = "unknown" }
      if !exists(.env) { .env = "unknown" }
      # Second line of defence: mask bearer tokens that slipped through.
      if exists(.msg) {
        .msg = replace(string!(.msg), r'Bearer [A-Za-z0-9._~+/=-]+', "Bearer [REDACTED]")
      }

  drop_debug:
    type: filter
    inputs: [parse]
    condition: '.level != "debug" && .level != "trace"'

sinks:
  loki:
    type: loki
    inputs: [drop_debug]
    endpoint: http://loki.monitoring.svc.cluster.local:3100
    encoding:
      codec: json
    labels:
      namespace: "{{ kubernetes.pod_namespace }}"
      container: "{{ kubernetes.container_name }}"
      service: "{{ service }}"
      env: "{{ env }}"
```

Parts: the `kubernetes_logs` source tails node log files and attaches pod
metadata; the `remap` transform (Vector Remap Language) parses the JSON
line into fields and masks tokens; the `filter` drops debug lines; the Loki
sink uses only bounded values (namespace, container, service, environment)
as labels. `reqId` and `trace_id` stay inside the line, queryable with
`| json | trace_id="..."`.

### Bounded Docker logs on a single host

```yaml
# compose.yaml
services:
  api:
    image: ghcr.io/example/taskflow-api:1.42.0
    environment:
      NODE_ENV: production
      LOG_LEVEL: info
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "5"
```

Without `max-size`, the `json-file` driver keeps one ever-growing file per
container until the disk fills.

## Best practices

- Log JSON to stdout, one event per line, with ISO 8601 UTC timestamps.
- Use a short, constant `msg` and put variable data in fields.
- Include `service`, `env`, `version`, `reqId`, and `trace_id` on every
  line, with the same names in every service.
- Write one canonical completion line per request; log errors once, where
  they are handled.
- Validate incoming request IDs; generate one when missing; return it in
  `X-Request-Id`.
- Never log secrets; minimize personal data; redact at the source and in
  the pipeline; rotate anything that leaks.
- Run production at `info`; skip health-check noise; sample fast
  successes but keep all errors and slow requests.
- Keep log store labels low-cardinality; keep identifiers in the line.
- Set retention per stream and restrict access to the log store.
- Count and alert with metrics; use logs to explain.

## In production

- **An access token appears in the log store.**
  *Detect:* a secret-scanning rule on the log pipeline, or someone
  noticing `Authorization` values in search results. *Cause:* a handler
  logged a raw HTTP client error or `req.headers`, bypassing redaction
  paths. *Fix:* rotate the exposed credentials, purge affected streams
  where possible, log only selected fields from errors, and add pipeline
  masking rules plus a test that asserts redaction.
- **The last lines before a crash are missing.**
  *Detect:* the container restarted with an uncaught exception, but the
  log ends seconds earlier with nothing explaining it. *Cause:* logs were
  buffered asynchronously in-process and lost when the process died, or
  the crash happened before the logger was configured. *Fix:* write to
  stdout synchronously, flush on shutdown signals, and register
  `uncaughtException` handlers that log with `logger.fatal()` (which pino
  writes synchronously) before exiting.
- **Loki queries time out and ingestion is throttled.**
  *Detect:* Loki reports a very high number of active streams, and
  queries touching a few hours fail. *Cause:* a high-cardinality label
  such as `reqId`, `userId`, or the raw path was added in the agent
  config. *Fix:* remove the label, keep the value in the log line, and
  filter with `| json | reqId="..."`.
- **A node runs out of disk space.**
  *Detect:* disk usage alerts; `du` shows huge files under
  `/var/lib/docker/containers/`. *Cause:* the `json-file` driver without
  `max-size`, plus a chatty container. *Fix:* set rotation options (or use
  the `local` driver), lower the log level, and find the noisy source.
- **Stack traces arrive as dozens of separate entries.**
  *Detect:* in the log UI, each line of a stack trace is its own event,
  out of order with other lines. *Cause:* plain-text logging
  (`console.error(err)`) writes multi-line output. *Fix:* log errors
  through the JSON logger so the stack is one escaped string field.
- **Logs from different services cannot be correlated.**
  *Detect:* investigations rely on matching timestamps by eye. *Cause:*
  services use different ID fields, or the ID is not forwarded to
  downstream calls and queue messages. *Fix:* adopt a shared logging
  package with standard field names and propagate IDs on every hop.
- **Log timestamps from two services disagree by minutes.**
  *Detect:* a downstream service appears to log a call before the caller
  made it. *Cause:* local-time strings without offsets, or clock drift on
  a host without time synchronization. *Fix:* log UTC ISO 8601 times and
  run NTP or chrony on every host.

## Important terminology

- **Structured log:** A log record written as data with named fields,
  usually JSON.
- **Log level:** The importance of a record (`fatal` to `trace`), used for
  filtering.
- **Correlation ID:** A value attached to all work caused by one request.
- **Request ID:** A per-request correlation ID, often returned in
  `X-Request-Id`.
- **Canonical log line:** One information-dense line per request
  summarizing it.
- **Redaction:** Replacing sensitive values before they are written.
- **Log agent / shipper:** A process that collects, processes, and
  forwards logs (Fluent Bit, Vector).
- **Stream (Loki):** A unique set of labels; each stream is stored and
  indexed separately.
- **Retention:** How long logs are kept before deletion.
- **Sampling:** Keeping only a fraction of similar records to reduce
  volume.

## Common mistakes and misconceptions

- Logging sentences with values embedded instead of fields.
- `console.log` of whole objects such as `req`, `req.body`, or error
  objects from HTTP clients.
- Logging client errors (`400`, `404`) at `error` level.
- Logging the same error at every layer that rethrows it.
- Thinking redaction makes it safe to log everything.
- Using the log store for counting and alerting that metrics should do.
- Putting request IDs or user IDs into Loki labels or Elasticsearch index
  names.
- Writing log files inside containers instead of to stdout.
- Leaving `debug` on in production after an investigation.
- Trusting client-supplied request IDs without validation.

## Revision questions

1. Rewrite the line `User 42 failed login from 203.0.113.9 with password
   hunter2` as a safe structured log entry. What do you remove, and why?
2. When should a failed request be logged at `warn` rather than `error`?
3. What is the difference between a request ID and a trace ID, and when
   would you keep both?
4. How does `AsyncLocalStorage` help with request-scoped logging in
   Express?
5. A service at 400 requests per second logs 900 bytes per request.
   Health checks are 20% of requests. If you drop health-check logs and
   sample fast successes (95% of the remaining requests) at 10%, keeping
   everything else, what is the daily volume before and after?
   (Before: about 31.1 GB/day. After: 320 req/s, of which 16 are kept in
   full and 304 are sampled to 30.4, so 46.4 req/s, about 3.6 GB/day.)
6. Why should high-cardinality values not be Loki labels, and how do you
   still query them?
7. Why must applications in containers log to stdout, and what rotates the
   logs?
8. A token leaked into the logs. Why is deleting the log lines not enough?

## Further learning

- [pino documentation](https://getpino.io/)
- [pino redaction](https://getpino.io/#/docs/redaction)
- [pino-http](https://github.com/pinojs/pino-http)
- [Node.js: AsyncLocalStorage](https://nodejs.org/api/async_context.html)
- [Grafana Loki: LogQL](https://grafana.com/docs/loki/latest/query/)
- [Vector documentation](https://vector.dev/docs/)
- [Kubernetes: Logging architecture](https://kubernetes.io/docs/concepts/cluster-administration/logging/)
- Next: [metrics and dashboards](metrics-and-dashboards.md). Back to the
  [monitoring and logging overview](../monitoring-and-logging.md).
