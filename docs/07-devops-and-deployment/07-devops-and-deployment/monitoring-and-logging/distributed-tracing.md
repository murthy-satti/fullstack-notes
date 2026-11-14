# Distributed Tracing

A distributed trace records the path of one request through every process
it touches: the API, the services it calls, the database queries, and the
messages it leaves on a queue. Each step is a **span** with a start time,
a duration, and a link to the step that caused it. Put together, the spans
show where time was spent and where the request failed. This lesson covers
traces and spans, span attributes and events, how context crosses process
boundaries (the W3C `traceparent` header, field by field), OpenTelemetry's
API, SDK, auto-instrumentation for Node.js, and Collector, head and tail
sampling, linking logs to traces, and the main tracing backends.

## Why it matters

Metrics can tell you that `POST /tasks` got slower at 14:03. Logs can tell
you that one request took 412 ms. Neither tells you *which of the eleven
things that request did* took 308 of those milliseconds. In a single
process you would reach for a profiler; once a request crosses services, a
queue, and a database, a trace is the only view that shows the whole causal
chain with timings.

Tracing also exposes design problems that are otherwise invisible: calls
made one after another that could run in parallel, an N+1 pattern of
fifty tiny queries, a retry loop against a slow dependency, or a "fast"
endpoint that is fast only because it hands work to a worker that takes
seconds. As TaskFlow grows from one API into an API, an auth service, a
notifications service, and a queue worker, tracing turns "it's slow
somewhere" into a specific span.

## Real-world usage

- **Google (Dapper).** The paper
  [Dapper, a Large-Scale Distributed Systems Tracing Infrastructure](https://research.google/pubs/dapper-a-large-scale-distributed-systems-tracing-infrastructure/)
  (2010) describes Google's production tracing system: trees of spans
  linked by trace and span IDs, propagated automatically through shared
  RPC libraries, with sampling to keep overhead low. Most modern tracing
  systems follow its model.
- **W3C Trace Context.** The
  [Trace Context](https://www.w3.org/TR/trace-context/) specification is a
  W3C Recommendation that standardizes the `traceparent` and `tracestate`
  HTTP headers, so a trace can cross services instrumented by different
  tools and vendors without breaking.
- **Jaeger.** The [Jaeger documentation](https://www.jaegertracing.io/docs/)
  describes an open-source tracing platform originally built at Uber and
  now a graduated CNCF project. Its current major version is built on the
  OpenTelemetry Collector and accepts OTLP natively.
- **OpenTelemetry.** The
  [What is OpenTelemetry?](https://opentelemetry.io/docs/what-is-opentelemetry/)
  page explains that the project, formed from the merger of OpenTracing and
  OpenCensus, provides vendor-neutral APIs, SDKs, and the Collector for
  traces, metrics, and logs.

**Popular tools and providers:** OpenTelemetry, Jaeger, Grafana Tempo,
Zipkin, Honeycomb, Datadog APM, New Relic, Elastic APM, AWS X-Ray, Google
Cloud Trace, and Azure Application Insights.

## How it works

### Traces and spans

A **trace** is a tree of **spans** that share one **trace ID**. Each span
represents one operation and records:

| Field | Meaning | TaskFlow example |
|---|---|---|
| Trace ID | 16 random bytes shared by every span in the trace | `4bf92f3577b34da6a3ce929d0e0e4736` |
| Span ID | 8 random bytes identifying this span | `00f067aa0ba902b7` |
| Parent span ID | The span that caused this one (empty for the root) | The server span for `POST /tasks` |
| Name | A low-cardinality operation name | `POST /tasks`, `find tasks` |
| Kind | `SERVER`, `CLIENT`, `PRODUCER`, `CONSUMER`, or `INTERNAL` | `CLIENT` for the call to the auth service |
| Start and end time | Gives the duration | 44 ms to 352 ms |
| Status | `Unset`, `Ok`, or `Error` | `Error` when the handler throws |
| Attributes | Key-value details | `http.route="/tasks"`, `db.collection.name="tasks"` |
| Events | Timestamped notes inside the span | An exception with its stack trace |
| Links | References to spans in other traces | A batch consumer linking to each message's producer |

The service that produced a span is described by its **resource**
(`service.name="taskflow-api"`, `service.version="1.42.0"`), shared by all
spans from that process.

![Diagram: a waterfall for trace 4bf92f35, POST /tasks, 412 ms, 8 spans, on a 0 to 500 ms axis. The taskflow-api root span POST /tasks runs 0 to 412 ms. Its child authenticate runs 38 ms and contains a GET client span of 32 ms, whose child is the auth-service span GET /introspect of 26 ms. The next child, find tasks on MongoDB, takes 308 ms, 75% of the request, and is highlighted. insertOne tasks takes 16 ms and publish task.created takes 12 ms. The response is sent at 412 ms. Afterwards the worker's process task.created span runs for 75 ms, linked from the publish span. The legend marks service code, database calls, queue work, and where the time went.](trace-waterfall.svg)

Reading a waterfall:

- **Find the critical path:** the chain of spans that determines the end
  time. Shortening a span off the critical path does not make the request
  faster.
- **Look for the longest bar:** here, an unindexed `find` on the tasks
  collection takes 75% of the request.
- **Look for gaps:** time inside a parent not covered by any child is
  either CPU work in that service or something uninstrumented.
- **Look for staircases:** many short sequential spans (N+1 queries,
  sequential HTTP calls) that could be batched or run concurrently.
- **Remember async work:** the worker span runs after the response; it
  does not slow the user's request but it is part of the outcome.

### Attributes, events, and status

Attributes make spans searchable ("all traces where
`http.route="/tasks"` and `http.response.status_code=500`"). Use
OpenTelemetry **semantic conventions** for common attributes so every
backend understands them, and a project prefix (`taskflow.`) for your own.

Unlike metric labels, span attributes may have high cardinality: a task
ID or tenant ID on a span is fine and is often exactly what you need when
debugging. They must still never contain secrets or sensitive personal
data, because traces are stored and shared like logs.

**Events** are timestamped annotations inside a span ("cache miss",
"retrying after 503"). An exception is recorded as an event with the
exception type, message, and stack trace, and the span's **status** is set
to `Error` so the trace is easy to find.

### Context propagation

Spans become a tree only if each new span knows its parent. That knowledge
is the **span context** (trace ID, span ID, trace flags), and moving it
around is **context propagation**.

- **Inside a process**, OpenTelemetry keeps the active context in a
  context manager. In Node.js it is built on `AsyncLocalStorage`, so the
  active span follows the request through `await` and callbacks.
- **Across processes**, a **propagator** *injects* the context into the
  outgoing carrier (HTTP headers, message headers) and the receiver
  *extracts* it and starts a child span.

The default propagator uses the W3C `traceparent` header:

```text
traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01
             |  |                                |                |
             |  trace-id (16 bytes, 32 hex)      |                trace-flags
             version                             parent-id (8 bytes, 16 hex)
```

![Diagram: top, the traceparent header split into version 00 (always 00), trace-id 4bf92f3577b34da6a3ce929d0e0e4736 (16 bytes, the same for every span in the trace), parent-id 00f067aa0ba902b7 (8 bytes, the caller's span ID), and trace-flags 01 (sampled). Bottom, TaskFlow API has server span a1, client span b2, and producer span d4. Its HTTP call to the auth service carries traceparent 00-4bf9...-b2...-01; the auth service extracts it and starts span c3 with parent b2 in trace 4bf9. Its queue message header carries traceparent 00-4bf9...-d4...-01; the queue worker extracts it and starts consumer span e5 with parent d4 in trace 4bf9. The trace ID stays the same while the parent ID changes on every hop.](trace-context-propagation.svg)

Field by field:

1. **version** (`00`): the format version. Version `00` is the only one
   defined today; `ff` is invalid.
2. **trace-id** (32 lowercase hex characters): the ID of the whole trace,
   copied unchanged to every downstream span. All zeros is invalid.
3. **parent-id** (16 hex characters): the span ID of the span that made
   the call, usually the caller's `CLIENT` or `PRODUCER` span. The
   receiver's new span records it as its parent. All zeros is invalid.
4. **trace-flags** (2 hex characters, 8 bits): the lowest bit is the
   **sampled** flag. `01` means the caller recorded this trace, so the
   receiver should too; `00` means it did not.

Two companion headers exist. `tracestate` carries vendor-specific
key-value data alongside `traceparent`. `baggage` (a separate W3C
specification) carries application key-value pairs, such as a tenant ID,
to every downstream service. Baggage is sent in plain headers, including
to third parties you call, so never put secrets or personal data in it.

Context is lost whenever something in the chain does not propagate:
an uninstrumented HTTP client, a proxy that strips unknown headers, a
message queue whose producer does not write message headers, or work
scheduled with `setTimeout` outside the active context. A broken chain
shows up as several short, unconnected traces instead of one tree.

### OpenTelemetry: API, SDK, and instrumentation

OpenTelemetry deliberately separates three layers:

| Layer | Package examples (Node.js) | Role |
|---|---|---|
| **API** | `@opentelemetry/api` | Stable interfaces libraries call (`trace.getTracer`, `startActiveSpan`). Without an SDK it does nothing, at almost no cost. |
| **SDK** | `@opentelemetry/sdk-node` | The implementation: creates real spans, applies sampling, batches, and exports. Configured once by the application. |
| **Instrumentation** | `@opentelemetry/auto-instrumentations-node` | Patches popular libraries (`http`, Express, MongoDB driver, `undici`/`fetch`, pino, Redis clients) to create spans and propagate context automatically. |
| **Exporters** | `@opentelemetry/exporter-trace-otlp-proto` | Send spans using OTLP (the OpenTelemetry Protocol) over HTTP (port 4318) or gRPC (port 4317). |

The split matters: a library author depends only on the API, so their
library is traced when the application installs an SDK and costs nothing
when it does not.

Instrumentation must load **before** the libraries it patches, so it runs
from a separate file loaded with a Node.js flag, not imported halfway
through `server.js`. Most settings can be given as standard environment
variables: `OTEL_SERVICE_NAME`, `OTEL_RESOURCE_ATTRIBUTES`,
`OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_TRACES_SAMPLER`, and
`OTEL_TRACES_SAMPLER_ARG`.

### The OpenTelemetry Collector

![Diagram: TaskFlow API, Notifications, and Queue worker, each with the OTel SDK, send spans over OTLP to an OpenTelemetry Collector running as a gateway. Its otlp receiver listens on gRPC 4317 and HTTP 4318. Spans pass through the processors memory_limiter, attributes/scrub, tail_sampling, and batch in order. The exporters otlp/vendor and otlp/tempo send them to an optional vendor APM as a second copy and to Tempo or Jaeger for trace storage and UI. Tail sampling keeps every error trace, every trace slower than 1 s, and 10% of the rest.](otel-collector-pipeline.svg)

The **Collector** is a separate process that receives, processes, and
exports telemetry. A configuration defines:

- **Receivers:** how data comes in (`otlp`, also Prometheus scraping,
  Jaeger, Zipkin, log files).
- **Processors:** what happens in between (`memory_limiter` to avoid
  out-of-memory crashes, `batch`, `attributes` to delete or hash fields,
  `tail_sampling`, resource detection).
- **Exporters:** where data goes (OTLP to Tempo, Jaeger, or a vendor;
  Prometheus remote write; debug output).
- **Pipelines:** which receivers, processors, and exporters are wired
  together for each signal.

Common deployments are an **agent** (one Collector per node or as a
sidecar, close to the apps) and a **gateway** (a central, horizontally
scaled pool), often both. Benefits: applications send to one local
endpoint and never hold vendor credentials; retries and batching happen
outside the app; sensitive attributes are scrubbed in one place; and
switching or adding a backend is a config change, not a redeploy of every
service. Many components, including `tail_sampling`, ship in the
"contrib" distribution of the Collector rather than the core one.

### Sampling

Recording every span of every request is expensive: TaskFlow at 200
requests per second with 8 spans each produces 1,600 spans per second,
about 138 million per day. Sampling keeps a representative subset.

**Head sampling** decides when the trace starts, at the root span, and
passes the decision downstream through the sampled flag.

- `TraceIdRatioBased(0.1)` keeps 10% of traces, chosen from the trace ID
  so every service makes the same decision.
- `ParentBased` respects the caller's decision, so a trace is never half
  recorded. The usual configuration is `parentbased_traceidratio`.
- Cheap and simple, but blind: the decision is made before anyone knows
  whether the request will fail or be slow, so 90% of interesting traces
  are thrown away with the boring ones.

**Tail sampling** decides after the trace is complete, in the Collector.

- Policies such as "keep all traces with an error", "keep all traces
  slower than 1 s", "keep 10% of the rest".
- Keeps the traces you actually want, at the cost of buffering every span
  in memory for a decision window (for example 10 s) and sending 100% of
  spans from the apps to the Collector.
- Every span of a trace must reach the same Collector instance, so a
  multi-instance gateway needs a load-balancing layer keyed by trace ID
  (the Collector's `loadbalancing` exporter).

| | Head sampling | Tail sampling |
|---|---|---|
| Decision point | Root span, at request start | Collector, after the trace ends |
| Keeps all errors and slow traces | No (only at the sampled rate) | Yes, by policy |
| Cost in apps | Low (unsampled spans are not exported) | Higher (export everything) |
| Cost in the pipeline | Low | Memory for buffering; trace-aware load balancing |
| Typical use | Starting point; very high traffic | When rare failures matter more than volume |

Many teams combine them: a generous head-sampling rate in apps to bound
volume, tail sampling in the Collector to keep the interesting part.

### Linking traces with logs and metrics

- **Logs:** the OpenTelemetry pino instrumentation adds `trace_id` and
  `span_id` to every log line written inside an active span (see
  [structured logging](structured-logging.md)), and backends turn the
  value into a link to the trace.
- **Metrics:** exemplars attach a sample trace ID to a histogram bucket,
  so a spike on a latency graph links to a real slow trace. The Collector
  can also derive RED metrics from spans (the `spanmetrics` connector).
- **Errors:** error trackers record the trace ID with each exception.

Because sampling drops most traces, a log line's `trace_id` may point to a
trace that was not kept. Tail sampling that keeps all error traces makes
the error case reliable.

### Backends

| Backend | Storage model | Notes |
|---|---|---|
| Jaeger | Pluggable (Elasticsearch, OpenSearch, Cassandra, Badger, memory) | Open source, CNCF graduated; native OTLP; good local development UI |
| Grafana Tempo | Object storage (S3, GCS, Azure Blob); indexes little | Cheap at scale; TraceQL queries; integrates with Loki and Prometheus in Grafana |
| Zipkin | Pluggable | The original open-source Dapper-style tracer; simple and mature |
| Vendors (Datadog, Honeycomb, New Relic, cloud tracing services) | Managed | Rich analysis and correlation; priced by spans or hosts; accept OTLP |

Because the apps speak OTLP to a Collector, the backend is a deployment
choice you can change later.

## When to use and when not to use

| Situation | Tracing value |
|---|---|
| Requests cross several services, queues, or serverless functions | High: the only end-to-end view |
| Latency problems you cannot explain from per-service metrics | High |
| One monolith with one database | Moderate: still useful for DB and outbound calls, but a profiler and good logs go far |
| Batch jobs processing millions of records | Low per record; trace the job and its phases, not each record |
| You need exact counts (requests, errors) | Use metrics; traces are sampled |
| Debugging CPU hot spots inside one function | Use a profiler |

Start with auto-instrumentation: it covers HTTP, Express, MongoDB, and
outbound calls with no code. Add manual spans only around business
operations that matter (an import, a billing run) and around code the
auto-instrumentation cannot see.

## Practical examples

### Auto-instrumenting TaskFlow API

```bash
npm install @opentelemetry/api @opentelemetry/sdk-node \
  @opentelemetry/auto-instrumentations-node @opentelemetry/instrumentation \
  @opentelemetry/exporter-trace-otlp-proto \
  @opentelemetry/resources @opentelemetry/semantic-conventions
```

```js
// src/instrumentation.mjs
import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";

const sdk = new NodeSDK({
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]: "taskflow-api",
    [ATTR_SERVICE_VERSION]: process.env.APP_VERSION ?? "dev",
    "deployment.environment.name": process.env.NODE_ENV ?? "development",
  }),
  // Default endpoint is http://localhost:4318/v1/traces
  traceExporter: new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT ?? "http://otel-collector:4318/v1/traces",
  }),
  instrumentations: [
    getNodeAutoInstrumentations({
      // File-system spans are noisy and rarely useful in an API.
      "@opentelemetry/instrumentation-fs": { enabled: false },
    }),
  ],
});

sdk.start();

// Flush buffered spans on shutdown. Call this from the server's SIGTERM handler
// after server.close() has finished draining, or spans from the drain window are lost.
export const shutdownTracing = () => sdk.shutdown().catch(() => {});
```

```bash
# .env.production (sampling read by the SDK from standard variables)
OTEL_TRACES_SAMPLER=parentbased_traceidratio
OTEL_TRACES_SAMPLER_ARG=0.25
# The SDK also exports logs and metrics over OTLP by default. Logs already flow
# stdout -> Collector and metrics are scraped from /metrics, so turn those off.
OTEL_LOGS_EXPORTER=none
OTEL_METRICS_EXPORTER=none
```

```bash
# TaskFlow API is an ES module app, so the loader hook is required
node --experimental-loader=@opentelemetry/instrumentation/hook.mjs \
     --import ./src/instrumentation.mjs src/server.js
```

Parts: the resource names the service and version on every span; the
OTLP exporter sends batches to the Collector; the auto-instrumentations
create spans for incoming HTTP requests, Express routing, MongoDB
commands, outgoing `fetch` calls, and add trace IDs to pino logs;
`parentbased_traceidratio` keeps 25% of new traces and always follows the
caller's decision. `server.js` imports `shutdownTracing` and awaits it at
the end of its SIGTERM handler, once `server.close()` has finished. For a CommonJS app, `node --require ./instrumentation.js
app.js` is enough. The OpenTelemetry docs note that the ESM loader
mechanism is expected to change, so check the current guidance when
upgrading.

### Adding a manual span around a business operation

```js
// src/tasks/import.js
import { trace, SpanStatusCode } from "@opentelemetry/api";

const tracer = trace.getTracer("taskflow-api");

export async function importTasks(db, userId, rows) {
  return tracer.startActiveSpan("tasks.import", async (span) => {
    span.setAttribute("taskflow.import.rows", rows.length);
    try {
      const valid = rows.filter((r) => typeof r.title === "string" && r.title.length > 0);
      span.addEvent("validation complete", { "taskflow.import.invalid": rows.length - valid.length });

      const result = await db.collection("tasks").insertMany(
        valid.map((r) => ({ title: r.title, userId, createdAt: new Date() }))
      );
      span.setAttribute("taskflow.import.inserted", result.insertedCount);
      return result.insertedCount;
    } catch (err) {
      span.recordException(err);
      span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
      throw err;
    } finally {
      span.end(); // a span that is never ended is never exported
    }
  });
}
```

`startActiveSpan` makes the new span the active context, so the MongoDB
span created by auto-instrumentation inside it becomes its child.

### Propagating context through a queue by hand

If a queue library has no instrumentation, inject the context into the
message and extract it in the worker:

```js
// src/queue/trace-context.js
import { context, propagation, trace, SpanKind } from "@opentelemetry/api";

const tracer = trace.getTracer("taskflow-api");

// Producer: run inside the request's active span.
export function withTraceHeaders(payload) {
  const carrier = {};
  propagation.inject(context.active(), carrier); // adds traceparent (and tracestate)
  return { ...payload, traceHeaders: carrier };
}

// Consumer: continue the trace in the worker.
export function runWithJobContext(name, job, fn) {
  const parentContext = propagation.extract(context.active(), job.data.traceHeaders ?? {});
  return tracer.startActiveSpan(name, { kind: SpanKind.CONSUMER }, parentContext, async (span) => {
    try {
      return await fn();
    } finally {
      span.end();
    }
  });
}
```

```js
// usage
await queue.add("task.created", withTraceHeaders({ taskId: task.id }));
// in the worker:
await runWithJobContext("process task.created", job, () => sendNotifications(job.data.taskId));
```

Making the consumer span a **child** suits one message per request. When a
consumer processes a batch of messages from many traces, start a new trace
and add **links** to each message's context instead.

### A Collector gateway with tail sampling

```yaml
# otel-collector.yaml (contrib distribution)
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318

processors:
  memory_limiter:
    check_interval: 1s
    limit_percentage: 80
    spike_limit_percentage: 25
  attributes/scrub:
    actions:
      - key: http.request.header.authorization
        action: delete
      - key: user.email
        action: hash
  tail_sampling:
    decision_wait: 10s
    policies:
      - name: keep-errors
        type: status_code
        status_code:
          status_codes: [ERROR]
      - name: keep-slow
        type: latency
        latency:
          threshold_ms: 1000
      - name: sample-the-rest
        type: probabilistic
        probabilistic:
          sampling_percentage: 10
  batch: {}

exporters:
  otlp/tempo: # recent Collector releases log "otlp" as a deprecated alias of "otlp_grpc"; both work
    endpoint: tempo.monitoring.svc.cluster.local:4317
    tls:
      insecure: true # plaintext inside the cluster network only

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [memory_limiter, attributes/scrub, tail_sampling, batch]
      exporters: [otlp/tempo]
```

`memory_limiter` comes first so the Collector refuses data before it runs
out of memory; `batch` comes last so exports are efficient. A trace is
kept if *any* policy matches. When tail sampling decides, apps should send
all spans (sampler `parentbased_always_on`), otherwise the Collector only
sees the head-sampled fraction.

### Running Jaeger locally

```yaml
# compose.yaml (local development only)
services:
  jaeger:
    image: jaegertracing/jaeger:latest
    ports:
      - "16686:16686" # web UI
      - "4317:4317"   # OTLP gRPC
      - "4318:4318"   # OTLP HTTP
```

Point `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` at
`http://localhost:4318/v1/traces`, send a few requests to TaskFlow API,
and open `http://localhost:16686` to see the waterfall. Pin an explicit
image version outside a local experiment.

## Best practices

- Start with auto-instrumentation and W3C Trace Context everywhere;
  load instrumentation before any other module.
- Name spans by operation, with low cardinality (`GET /tasks/:id`, not
  `GET /tasks/6650f1...`); put IDs in attributes.
- Use semantic conventions for standard attributes and a prefix for
  custom ones.
- Record exceptions and set error status on failing spans; always end
  spans in `finally`.
- Propagate context through queues and background jobs.
- Send telemetry to a Collector, not straight to a vendor.
- Choose sampling deliberately: parent-based head sampling to bound cost,
  tail sampling to keep errors and slow traces.
- Scrub secrets and personal data from attributes, both in code and in
  the Collector.
- Put `trace_id` in every log line and use exemplars to connect metrics.

## In production

- **Traces stop at the API; downstream services appear as separate traces.**
  *Detect:* the auth service's spans have their own trace IDs and no
  parent. *Cause:* a hop does not propagate context: an uninstrumented HTTP
  client, a proxy or gateway that drops `traceparent`, or a different
  propagator configured in one service. *Fix:* use instrumented clients,
  allow the headers through proxies, and standardize on the W3C
  propagator.
- **No spans appear at all after deploying the instrumentation.**
  *Detect:* the trace backend is empty; with `OTEL_LOG_LEVEL=debug` the
  SDK logs export errors or shows no instrumented modules. *Cause:* the
  instrumentation file loads after `express` and the MongoDB driver (or the
  ESM loader hook is missing), or the exporter points at the wrong
  endpoint or port. *Fix:* load it with `--import` or `--require` before
  the app, add the loader hook for ESM, and check the Collector's receiver
  address.
- **The Collector is OOM-killed under load.**
  *Detect:* Collector restarts and gaps in all traces during traffic
  peaks. *Cause:* tail sampling buffering every span for the decision
  window without a memory limit, or a backend outage filling export
  queues. *Fix:* add `memory_limiter` first in the pipeline, size memory
  for spans per second times decision window, scale out with trace-ID load
  balancing, and alert on refused and dropped spans.
- **Error traces are missing when you need them.**
  *Detect:* a log line's `trace_id` returns "trace not found" for most
  failed requests. *Cause:* head sampling at a low rate discards 90% or
  more of traces before anyone knows they fail. *Fix:* tail sampling with
  an error policy, or a higher head rate for error-prone routes.
- **The tracing bill jumps after a new feature ships.**
  *Detect:* spans per second per service doubles at a deploy. *Cause:* a
  loop that creates a span per item (per task in a 5,000-task import) or a
  newly enabled noisy instrumentation such as file system calls. *Fix:*
  span the batch, not the item; record counts as attributes; disable
  noisy instrumentations.
- **Authorization tokens are visible in trace attributes.**
  *Detect:* a review of span attributes finds full headers or query
  strings. *Cause:* instrumentation configured to capture all request
  headers, or custom code adding them. *Fix:* capture an allow-list of
  headers, delete sensitive keys in the Collector, and rotate exposed
  tokens.

## Important terminology

- **Trace:** All spans for one request or transaction, sharing a trace ID.
- **Span:** One timed operation with a parent, attributes, events, and
  status.
- **Root span:** The first span of a trace, with no parent.
- **Span kind:** Whether a span is a server, client, producer, consumer, or
  internal operation.
- **Span context:** Trace ID, span ID, and trace flags; what is
  propagated.
- **Context propagation:** Passing span context within and between
  processes.
- **Propagator:** Code that injects and extracts context into carriers
  such as headers.
- **`traceparent`:** The W3C header carrying version, trace ID, parent ID,
  and flags.
- **Baggage:** Application key-value data propagated with the context.
- **OTLP:** The OpenTelemetry Protocol for exporting telemetry.
- **Collector:** OpenTelemetry's standalone pipeline for receiving,
  processing, and exporting telemetry.
- **Head / tail sampling:** Sampling decided at the start of a trace
  versus after it completes.
- **Critical path:** The chain of spans that determines total latency.

## Common mistakes and misconceptions

- Importing the tracing setup after the application code, so nothing is
  patched.
- Expecting traces to replace metrics: sampled traces cannot count
  requests accurately.
- Using IDs or full URLs as span names.
- Forgetting to end manual spans, or to propagate through queues.
- Head sampling at 1% and expecting to find the trace for a specific
  failed request.
- Putting secrets or personal data into attributes or baggage.
- Sending spans directly from every app to a vendor with embedded API
  keys instead of through a Collector.
- Believing tracing requires microservices; even a monolith benefits from
  database and outbound call spans.

## Revision questions

1. What are a trace, a span, and a span context? How does a span know its
   parent?
2. Decode `00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01`.
   Which part changes on each hop, and what does `01` mean?
3. Why does OpenTelemetry separate the API from the SDK?
4. A request crosses three services, but the trace shows only the first.
   List three places propagation could be breaking.
5. TaskFlow handles 300 requests per second with 10 spans per request and
   500 bytes per span. How many spans per day are stored with head sampling
   at 10%, and roughly how much data? (300 x 10 x 0.10 = 300 spans/s,
   about 25.9 million spans and about 13 GB per day.)
6. Compare head and tail sampling. Why does tail sampling need trace-aware
   load balancing?
7. What does the Collector add compared with exporting straight from each
   service?
8. How do you get from a slow request on a latency graph to its trace and
   its log lines?

## Further learning

- [OpenTelemetry: Traces](https://opentelemetry.io/docs/concepts/signals/traces/)
- [OpenTelemetry: Context propagation](https://opentelemetry.io/docs/concepts/context-propagation/)
- [OpenTelemetry: Node.js getting started](https://opentelemetry.io/docs/languages/js/getting-started/nodejs/)
- [OpenTelemetry: Sampling](https://opentelemetry.io/docs/concepts/sampling/)
- [OpenTelemetry Collector](https://opentelemetry.io/docs/collector/)
- [Tail sampling processor](https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/processor/tailsamplingprocessor)
- [W3C Trace Context](https://www.w3.org/TR/trace-context/)
- [Grafana Tempo documentation](https://grafana.com/docs/tempo/latest/)
- Next: [SLIs, SLOs, and error budgets](slis-slos-and-error-budgets.md).
  Back to the [monitoring and logging overview](../monitoring-and-logging.md).
