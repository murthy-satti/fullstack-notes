# LLM Observability and Tracing

Offline evaluation tells you how a feature behaves on the cases you
thought of. Production tells you how it behaves on everything else.
LLM observability is the practice of recording enough about each model
call, tool call, and retrieval step to answer questions like "why did
the assistant create this task for the wrong date?", "which feature
doubled the token bill last week?", and "do users trust the new prompt
more than the old one?", without turning your tracing backend into a
copy of every user's private messages.

This lesson builds on the general observability practice in section
07, especially [distributed tracing](../../../../07-devops-and-deployment/07-devops-and-deployment/monitoring-and-logging/distributed-tracing.md)
and [metrics and dashboards](../../../../07-devops-and-deployment/07-devops-and-deployment/monitoring-and-logging/metrics-and-dashboards.md),
and covers only what is specific to LLM features: the OpenTelemetry
GenAI semantic conventions and their current status, tracing model
calls, tool calls, and retrieval in TaskFlow, the LLM-focused backends
Langfuse, LangSmith, and Arize Phoenix, keeping personal data out of
traces, token and cost dashboards, and the loop that turns user feedback
into evaluation cases.

## Why it matters

An LLM feature fails in ways that ordinary monitoring does not see. The
HTTP request succeeds, latency is normal, and the error rate is zero,
while the agent calls `create_task` twice, the Q&A answer cites a note
the user cannot open, or a prompt change quietly doubles the output
tokens. Seeing these needs telemetry that knows what a model call, a
tool call, and a retrieval step are, and that records tokens, models,
and prompt versions in a consistent way.

Cost is the second reason. Token usage is the main variable cost of an
LLM feature, and it moves with prompt edits, model switches, retries,
and agent loops. Without per-feature token metrics, the first sign of a
runaway agent is the monthly bill.

The third reason is the feedback loop. The cases that most improve an
evaluation set come from production: the request that confused the
assistant, the answer a user marked as wrong. Traces with stable IDs
connect a thumbs-down to the exact prompt version, model, retrieved
documents, and tool calls behind it, which turns a complaint into a
reproducible test case.

## Real-world usage

- **OpenTelemetry GenAI semantic conventions.** The conventions define
  span names, attributes, and metrics for model calls, embeddings,
  retrieval, tool execution, and agents. Their status is still
  *Development*. In core semantic conventions
  [v1.42.0](https://github.com/open-telemetry/semantic-conventions/releases/tag/v1.42.0)
  (released June 12, 2026) they moved to a dedicated repository,
  [semantic-conventions-genai](https://github.com/open-telemetry/semantic-conventions-genai),
  which had not published a release as of November 2026. The conventions
  say instrumentations "SHOULD NOT capture" instructions, inputs, and
  outputs by default, because they are considered sensitive.
- **Langfuse.** An open-source (MIT, except enterprise directories) LLM
  engineering platform for tracing, prompt management, and evaluation;
  ClickHouse announced it had acquired Langfuse on January 16, 2026
  ([announcement](https://langfuse.com/blog/joining-clickhouse)), and it
  remains available as a cloud service and for self-hosting. It accepts
  OpenTelemetry traces on its
  [OTLP endpoint](https://langfuse.com/integrations/native/opentelemetry)
  and maps `gen_ai.*` attributes to its own model.
- **LangSmith.** LangChain's platform traces any app through its SDK
  (`wrapOpenAI` and `traceable` in TypeScript, per its
  [tracing quickstart](https://docs.langchain.com/langsmith/observability-quickstart))
  and also accepts
  [OpenTelemetry traces](https://docs.langchain.com/langsmith/trace-with-opentelemetry)
  at its API URL plus `/otel`.
- **Arize Phoenix.** [Phoenix](https://arize.com/docs/phoenix) is
  "built on top of OpenTelemetry and is powered by OpenInference
  instrumentation", and adds evaluation, datasets, experiments, and
  prompt management. It is source-available under the Elastic License
  2.0 and can be self-hosted. Its
  [OpenInference](https://github.com/Arize-ai/openinference) conventions
  use their own attribute names (`openinference.span.kind`,
  `llm.token_count.prompt`) rather than `gen_ai.*`.
- **OpenTelemetry Collector.** The contrib distribution's
  [redaction processor](https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/processor/redactionprocessor)
  (beta for traces) masks attribute values that match patterns, and the
  [tail sampling processor](https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/processor/tailsamplingprocessor)
  (beta) keeps whole traces based on errors, latency, or a percentage.
  Both appear in the Collector configuration later in this lesson.

**Popular tools and providers:** Langfuse, LangSmith, Arize Phoenix,
Braintrust, OpenLLMetry instrumentations from Traceloop, the
OpenTelemetry Collector, and general-purpose backends such as Jaeger,
Grafana Tempo, and Prometheus for traces and metrics.

## How it works

### What LLM observability adds

Everything in ordinary observability still applies: request rates,
errors, latency percentiles, SLOs, and alerts. LLM features add a layer
on top:

| Question | Classic signal | LLM-specific signal |
|---|---|---|
| Is it up? | HTTP errors, latency | Provider errors and rate limits, `incomplete` responses, schema-validation failures |
| Is it fast? | Request latency | Time to first token, output tokens per call, number of model calls per request |
| What does it cost? | Instance hours | Input, cached, output, and reasoning tokens per feature and model |
| Is it correct? | Rarely observable | User feedback, edits to drafts, judge scores on sampled traces |
| What changed? | Deploy markers | Prompt version, model snapshot, retrieval index version on every span |
| Why did this request fail? | A trace through services | A trace through model calls, tool calls, and retrieval, with token counts and versions |

### Anatomy of a trace for an AI request

A TaskFlow agent request ("move the launch review to Friday and tell
Ana") becomes one trace. The HTTP server span is the root; inside it,
each model call, each tool execution, and each database call is a child
span, so the waterfall shows where time and tokens went:

![Diagram: a trace waterfall for one TaskFlow agent request on a time axis from 0 to 4 seconds. The root span, POST /api/agent, a SERVER span, lasts 4.1 seconds. First child: chat with the configured model, a CLIENT span from 0.1 to 1.5 seconds, with 1,250 input tokens of which 1,024 were cached and 64 output tokens; it returns a tool call. Second child: execute_tool update_task, an INTERNAL span from 1.55 to 1.8 seconds, which contains a MongoDB update span. Third child: execute_tool notify_member from 1.8 to 1.95 seconds. Fourth child: a second chat span from 2.0 to 4.0 seconds with 1,410 input and 180 output tokens, which writes the final answer. A panel lists the attributes of the first chat span: gen_ai.operation.name chat, gen_ai.provider.name openai, gen_ai.request.model from configuration, gen_ai.response.model with the dated snapshot, gen_ai.prompt.name task-agent, gen_ai.prompt.version 7, gen_ai.conversation.id, gen_ai.usage.input_tokens, gen_ai.usage.output_tokens, gen_ai.usage.cache_read.input_tokens, and taskflow.feature agent. The second model call takes half the request time, and the versions on every span say exactly what ran.](llm-trace-waterfall.svg)

The value is in the structure. "4.1 seconds" alone says the request was
slow; the waterfall says that the second model call took half of it,
that the first call reused 1,024 cached input tokens, and which prompt
version and model snapshot produced the answer. The same structure
works for project Q&A, where a `retrieval` span sits before the model
call and records which index was searched and how many documents came
back.

### The OpenTelemetry GenAI semantic conventions

The conventions give every tool the same vocabulary, so a trace produced
by your code can be read by Langfuse, Phoenix, LangSmith, or a general
tracing backend. The parts used most:

| Span | Name | Kind | Key attributes |
|---|---|---|---|
| Model call (inference) | `{gen_ai.operation.name} {gen_ai.request.model}`, for example `chat <model>` | `CLIENT` | Required: `gen_ai.operation.name`, `gen_ai.provider.name`; recommended: request and response model, `gen_ai.response.id`, token usage, finish reasons |
| Embeddings | `embeddings {gen_ai.request.model}` | `CLIENT` | `gen_ai.embeddings.dimension.count`, input tokens |
| Retrieval | `retrieval` | `INTERNAL` | `gen_ai.retrieval.top_k`, `gen_ai.data_source.id`; documents and query text are opt-in |
| Tool execution | `execute_tool {gen_ai.tool.name}` | `INTERNAL` | `gen_ai.tool.name`, `gen_ai.tool.call.id`, `gen_ai.tool.type`; arguments and results are opt-in |
| Agent invocation | `invoke_agent {gen_ai.agent.name}` | `CLIENT`, or `INTERNAL` in-process | `gen_ai.agent.name`, `gen_ai.agent.id`, `gen_ai.agent.version` |

Other details worth knowing:

- **Operation names** include `chat`, `generate_content`,
  `text_completion`, `embeddings`, `retrieval`, `execute_tool`,
  `create_agent`, `invoke_agent`, and `invoke_workflow`, among others.
- **Provider names** are well-known values such as `openai`,
  `anthropic`, `gcp.gemini`, `gcp.vertex_ai`, `aws.bedrock`, and
  `azure.ai.openai`. The attribute was called `gen_ai.system` before
  semantic conventions v1.37; older instrumentations still emit that
  name.
- **Usage** is recorded as `gen_ai.usage.input_tokens` and
  `gen_ai.usage.output_tokens`, with `gen_ai.usage.cache_read.input_tokens`
  and `gen_ai.usage.reasoning.output_tokens` when the provider reports
  them.
- **Prompt identity** has its own attributes, `gen_ai.prompt.name` and
  `gen_ai.prompt.version`, which are exactly what you need to compare two
  prompt versions in production.
- **Content** (`gen_ai.system_instructions`, `gen_ai.input.messages`,
  `gen_ai.output.messages`, `gen_ai.tool.definitions`) is *opt-in*. The
  conventions describe three patterns: record nothing (the default),
  record content on span attributes (for example in pre-production), or
  store content externally and record only a reference (`*_ref`
  attributes), which they recommend for production when volume or
  sensitivity is a concern.

Because the conventions are still in Development, names change between
versions, and instrumentations lag behind. Two practical consequences.
Older guidance (up to semantic conventions v1.41) asks instrumentations
to offer `OTEL_SEMCONV_STABILITY_OPT_IN=gen_ai_latest_experimental` to
emit the latest experimental attributes, so check what your library
emits by default. And metrics are in flux: the released conventions
define a `gen_ai.client.token.usage` histogram with a `gen_ai.token.type`
attribute (`input` or `output`) and a `gen_ai.client.operation.duration`
histogram, while the development version in the new repository replaces
the token histogram with per-category counters such as
`gen_ai.client.inference.usage.input_tokens`. This lesson's code uses the
released names; keep all attribute and metric names in one module so a
rename is a one-line change.

### Instrumenting the code

| Approach | Example | Strengths | Weaknesses |
|---|---|---|---|
| Manual spans around your own wrapper | `tracedResponse()` in this lesson | Exact control over attributes, prompt versions, and redaction | You maintain it |
| OpenTelemetry instrumentation libraries | OpenLLMetry (`@traceloop/instrumentation-openai`), OpenInference (`@arizeai/openinference-instrumentation-openai`) | Automatic for every call through the SDK | Each library follows its own conventions and version; content capture defaults vary |
| Vendor SDKs | Langfuse (`@langfuse/tracing`, built on OpenTelemetry), LangSmith (`wrapOpenAI`, `traceable`) | Rich features in that vendor's UI | Tighter coupling to one backend |

TaskFlow already calls every model through one function (the client in
[calling model APIs from a backend](../hosted-model-apis/calling-model-apis-from-a-backend.md)),
so a manual span in that function covers every feature with one change
and keeps redaction under the team's control. HTTP, Express, and MongoDB
spans still come from the standard Node.js auto-instrumentation set up in
the [distributed tracing lesson](../../../../07-devops-and-deployment/07-devops-and-deployment/monitoring-and-logging/distributed-tracing.md).

### Backends and the Collector

| Backend | License and hosting | Ingestion | Strengths |
|---|---|---|---|
| Langfuse | MIT core; cloud or self-hosted | OTLP at `/api/public/otel`, SDKs | Traces, prompts, datasets, scores, and evaluations in one open-source tool |
| LangSmith | Commercial; cloud or self-hosted | SDKs, OTLP at the API URL plus `/otel` | Deep integration with LangChain and LangGraph; datasets and experiments |
| Arize Phoenix | Elastic License 2.0; self-hosted | OTLP; OpenInference instrumentation | Evaluations and experiments next to traces |
| General tracing (Jaeger, Grafana Tempo) | Open source | OTLP | One place for all services; less LLM-specific UI |

Send telemetry from the app to an OpenTelemetry Collector rather than
directly to a vendor. The Collector is where you enforce policy for
every service at once: redact values that must not leave your network,
sample whole traces, and fan out to more than one backend (for example
Langfuse for the AI team and the general tracing system for everyone
else). Switching vendors then means editing one Collector file, not
every service. It also avoids version coupling: in November 2026,
Langfuse's own span processor (`@langfuse/otel` 6.1) still declared the
OpenTelemetry JS SDK 2 packages as peer dependencies, while
`@opentelemetry/sdk-node` 0.301 is built on SDK 3, so a TaskFlow service
on SDK 3 sends plain OTLP and lets the Collector deliver it to Langfuse's
endpoint.

### Keeping personal data out of traces

Prompts and answers are user data. A request to the Assistant can
contain a name, an email address, or a health detail, and the answer
repeats it. Telemetry backends usually have broader access, longer
retention, and weaker deletion workflows than the primary database, so
copying content into them by default creates exactly the risk that
privacy rules forbid. Use several layers:

![Diagram: four layers that keep personal data out of traces. In the TaskFlow API: content capture is off by default; when it is turned on, text passes through redactForTelemetry, which replaces emails, phone numbers, card numbers, and secret-looking keys before it reaches a span; users are recorded by a pseudonymous ID, never by email. In the OpenTelemetry Collector: the redaction processor masks the content attributes and any value that matches email or card patterns, and adds a count of masked values; tail sampling keeps errors, slow traces, and ten percent of the rest. Backends such as Langfuse and the general tracing system receive only redacted spans. When full content is genuinely needed, for example for a support investigation, it goes to a restricted content store with short retention and separate access control, and spans carry only a reference URI. Each layer assumes the one before it can fail.](pii-safe-telemetry.svg)

1. **Do not capture content by default.** Record token counts, models,
   versions, latencies, and IDs. They answer most operational questions.
2. **Redact at the source** when content is captured, before it reaches
   a span: emails, phone numbers, card numbers, and anything that looks
   like a key.
3. **Redact again in the Collector** as a safety net for every service,
   including ones that forgot step 2 or use an instrumentation library
   that captures more than you expected.
4. **Store full content separately when you truly need it,** in a store
   with its own access control and short retention, and put only a
   reference on the span, as the conventions recommend for production.
5. **Pseudonymize users** with an internal ID or an HMAC of the user ID,
   never an email address, and never put user IDs in metric labels.
6. **Set retention and access** for the tracing backend as you would for
   any database of user data, and include it in deletion requests.

The full privacy picture, including data retention and provider data
handling, is in
[privacy, PII, and data retention](../security-privacy-and-responsible-ai/privacy-pii-and-data-retention.md).

### Token and cost dashboards

Traces answer questions about one request; metrics answer questions
about all of them. Record token usage and duration as metrics with a few
low-cardinality attributes (feature, operation, provider, model), and
compute cost from tokens and a price table kept in configuration. Never
use user IDs, trace IDs, or prompt text as metric attributes: every
distinct value creates a new time series.

With the Collector's Prometheus exporter, OpenTelemetry names are
translated: dots become underscores, a unit in braces such as `{token}`
is dropped, seconds add `_seconds`, and counters add `_total`, so
`gen_ai.client.token.usage` becomes `gen_ai_client_token_usage` and the
duration histogram becomes `gen_ai_client_operation_duration_seconds`.
A useful first dashboard:

| Panel | Question it answers |
|---|---|
| Tokens per hour by feature and type | Which feature drives usage, and is it input or output? |
| Average output tokens per call | Did a prompt change make answers longer? |
| p95 latency by feature | Is the assistant getting slower? |
| Error share by feature | Are provider errors or rate limits rising? |
| Estimated cost per day by feature | Where does the money go? |
| Cost per successful task | Is the feature getting more or less efficient per user outcome? |
| Thumbs-down share by prompt version | Did the new prompt change how users judge answers? |

![Diagram: a sketch of a TaskFlow LLM dashboard with four panels, using illustrative data. Top left, tokens per hour by feature as stacked bars for the assistant, project Q&A, summaries, and the agent, where the agent grows fastest. Top right, p95 latency by feature as lines, with the agent highest at about 4 seconds. Bottom left, estimated cost per day by feature as bars, where project Q&A costs most because of long retrieved context. Bottom right, the thumbs-down share by prompt version, version 6 at 7 percent and version 7 at 4 percent. A note says the dashboard reads only low-cardinality labels: feature, operation, provider, model, and prompt version. Each panel answers one question; costs come from tokens times a price table kept in configuration.](token-cost-dashboard.svg)

Cost estimates multiply token counts by per-token prices from the
provider's current pricing page, kept in configuration rather than code
because prices change. Cached input tokens are usually billed at a lower
rate than uncached ones, and reasoning tokens are billed as output, so a
model with a long thinking phase can cost more per answer than its
per-token price suggests. Broader cost strategy is covered in
[cost optimization for LLM apps](../deployment-cost-and-performance/cost-optimization-for-llm-apps.md).

### The user-feedback loop

Explicit and implicit feedback are the cheapest quality signals in
production, but only if each one can be traced back to what produced it:

- **Explicit feedback:** thumbs up or down, a reason ("wrong",
  "incomplete", "unsafe"), an optional comment.
- **Implicit feedback:** the user edits the Assistant's draft before
  saving it, regenerates an answer, abandons the flow, or opens a support
  ticket.

The mechanism is simple: every AI response returns its trace ID, the UI
sends that ID back with the feedback, and the backend stores the
feedback in its own database and attaches it to the trace as a score.
From there, a weekly triage reads the thumbs-down and edited traces,
groups the failures, and turns the important ones into evaluation cases
(the sampling and labeling process from
[building evaluation sets](building-evaluation-sets.md)), which the CI
gate from [evals in CI](evals-in-ci-and-regression-testing.md) then
protects. Running a calibrated judge on a small sample of production
traces adds a third signal that does not depend on users speaking up.

![Diagram: the user-feedback loop as a cycle of six steps. One, TaskFlow returns an AI answer with its trace ID. Two, the user gives feedback: a thumbs up or down with a reason, or implicitly by editing the draft. Three, the backend stores the feedback with the user and the trace ID, and attaches a score to the trace in the tracing tool. Four, a weekly triage reads thumbs-down, edited drafts, and judge failures on sampled traces, and groups them into failure types. Five, the important failures become labeled evaluation cases in a new dataset version. Six, the CI gate runs them on every change, and the improved prompt is deployed, which brings the loop back to step one. Feedback is only useful when it can be traced to the prompt, model, and data that produced the answer.](feedback-loop.svg)

Feedback is biased: unhappy users click more than satisfied ones, and
some failures (a subtly wrong date) are never noticed. Treat feedback
rates as trends and triage signals, not as accuracy measurements, and
keep the offline evaluation set as the source of truth. Slow shifts in
inputs and outputs over months, and the model-lifecycle response to them,
are the subject of
[production monitoring and drift](../mlops-and-model-lifecycle/production-monitoring-and-drift.md).

## When to use and when not to use

| Situation | Approach |
|---|---|
| Any production LLM feature | Spans with GenAI attributes and token metrics, content off |
| Debugging a prompt in development or staging | Content capture on, redacted, short retention |
| Agents with tool calls | A span per model call and per tool execution; alert on calls per request |
| RAG features | A retrieval span with the index and counts; content opt-in |
| Teams that want an LLM-specific UI | Collector fan-out to Langfuse, LangSmith, or Phoenix, plus the general backend |
| Regulated or sensitive data | Content never in telemetry; references to a restricted store if needed |

Do not record full prompts and answers in production telemetry just
because a tool makes it easy, do not put high-cardinality values in
metric labels, and do not let the tracing vendor's SDK become the only
place your feedback data lives: keep your own copy.

## Practical examples

### Starting the SDK

The app sends traces and metrics over OTLP to the Collector. Load this
file before the app with `node --import`, so instrumentation is active
before Express and the MongoDB driver are imported:

```ts
// src/telemetry.ts: start OpenTelemetry before the app (node --import ./dist/telemetry.js dist/server.js)
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-proto";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";

const sdk = new NodeSDK({
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]: "taskflow-api",
    [ATTR_SERVICE_VERSION]: process.env.APP_VERSION ?? "dev",
  }),
  // Both exporters read OTEL_EXPORTER_OTLP_ENDPOINT: point it at your Collector, not at a vendor.
  traceExporter: new OTLPTraceExporter(),
  metricReaders: [
    new PeriodicExportingMetricReader({ exporter: new OTLPMetricExporter(), exportIntervalMillis: 30_000 }),
  ],
});
sdk.start();

process.on("SIGTERM", () => {
  sdk.shutdown().finally(() => process.exit(0));
});
```

This targets the OpenTelemetry JS SDK 3 line (`@opentelemetry/sdk-node`
0.301 and `@opentelemetry/api` 1.10 in November 2026). Add the HTTP,
Express, and MongoDB instrumentations through the `instrumentations`
option, as shown in the distributed tracing lesson.

### Attribute names in one module

```ts
// src/ai/genai-attributes.ts: GenAI attribute names in one place, because the conventions are still in Development
export const GEN_AI = {
  OPERATION_NAME: "gen_ai.operation.name",            // chat, embeddings, retrieval, execute_tool, invoke_agent
  PROVIDER_NAME: "gen_ai.provider.name",              // openai, anthropic, gcp.gemini, ...
  REQUEST_MODEL: "gen_ai.request.model",
  REQUEST_MAX_TOKENS: "gen_ai.request.max_tokens",
  RESPONSE_ID: "gen_ai.response.id",
  RESPONSE_MODEL: "gen_ai.response.model",
  RESPONSE_STATUS: "gen_ai.response.status",
  CONVERSATION_ID: "gen_ai.conversation.id",
  PROMPT_NAME: "gen_ai.prompt.name",
  PROMPT_VERSION: "gen_ai.prompt.version",
  USAGE_INPUT_TOKENS: "gen_ai.usage.input_tokens",
  USAGE_OUTPUT_TOKENS: "gen_ai.usage.output_tokens",
  USAGE_CACHE_READ_INPUT_TOKENS: "gen_ai.usage.cache_read.input_tokens",
  USAGE_REASONING_OUTPUT_TOKENS: "gen_ai.usage.reasoning.output_tokens",
  TOKEN_TYPE: "gen_ai.token.type",                    // metric attribute: input | output
  TOOL_NAME: "gen_ai.tool.name",
  TOOL_CALL_ID: "gen_ai.tool.call.id",
  TOOL_TYPE: "gen_ai.tool.type",
  RETRIEVAL_TOP_K: "gen_ai.retrieval.top_k",
  DATA_SOURCE_ID: "gen_ai.data_source.id",
  INPUT_MESSAGES: "gen_ai.input.messages",            // opt-in content
  OUTPUT_MESSAGES: "gen_ai.output.messages",          // opt-in content
  OPENAI_API_TYPE: "openai.api.type",                 // chat_completions | responses
  ERROR_TYPE: "error.type",
} as const;
```

The `@opentelemetry/semantic-conventions` package has an `incubating`
entry point with constants for unstable attributes, but its README
recommends copying unstable definitions into your own code base rather
than importing that entry point at runtime, because it may break in minor
versions. This module does exactly that.

### Tracing model, tool, and retrieval calls

```ts
// src/ai/traced-llm.ts: one span and two metrics per model call, following the GenAI conventions
import { metrics, SpanKind, SpanStatusCode, trace } from "@opentelemetry/api";
import type OpenAI from "openai";
import type { ResponseCreateParamsNonStreaming } from "openai/resources/responses/responses";
import { GEN_AI as A } from "./genai-attributes.js";
import { redactForTelemetry } from "./redact.js";

const tracer = trace.getTracer("taskflow-ai");
const meter = metrics.getMeter("taskflow-ai");
const tokenUsage = meter.createHistogram("gen_ai.client.token.usage", {
  unit: "{token}",
  description: "Number of input and output tokens used",
});
const duration = meter.createHistogram("gen_ai.client.operation.duration", {
  unit: "s",
  description: "GenAI operation duration",
});

// Off by default. Turn on only where telemetry storage is approved for user content (see the PII section).
const CAPTURE_CONTENT = process.env.GENAI_CAPTURE_CONTENT === "true";

export interface CallInfo {
  feature: string;          // task-assistant, project-qa, meeting-summary, agent
  promptName: string;
  promptVersion: string;
  conversationId?: string;
}

export async function tracedResponse(
  client: OpenAI,
  params: ResponseCreateParamsNonStreaming & { model: string },
  info: CallInfo,
) {
  // Low-cardinality attributes, shared by the span and the metrics.
  const common = {
    [A.OPERATION_NAME]: "chat",
    [A.PROVIDER_NAME]: "openai",
    [A.REQUEST_MODEL]: params.model,
    "taskflow.feature": info.feature,
  };
  return tracer.startActiveSpan(
    `chat ${params.model}`,
    {
      kind: SpanKind.CLIENT,
      attributes: {
        ...common,
        [A.OPENAI_API_TYPE]: "responses",
        [A.PROMPT_NAME]: info.promptName,
        [A.PROMPT_VERSION]: info.promptVersion,
        ...(info.conversationId ? { [A.CONVERSATION_ID]: info.conversationId } : {}),
        ...(params.max_output_tokens ? { [A.REQUEST_MAX_TOKENS]: params.max_output_tokens } : {}),
      },
    },
    async (span) => {
      const started = performance.now();
      let errorType: string | undefined;
      try {
        const response = await client.responses.create(params);
        const u = response.usage;
        span.setAttributes({
          [A.RESPONSE_ID]: response.id,
          [A.RESPONSE_MODEL]: response.model,
          [A.RESPONSE_STATUS]: response.status ?? "unknown",
          ...(u && {
            [A.USAGE_INPUT_TOKENS]: u.input_tokens,
            [A.USAGE_OUTPUT_TOKENS]: u.output_tokens,
            [A.USAGE_CACHE_READ_INPUT_TOKENS]: u.input_tokens_details.cached_tokens,
            [A.USAGE_REASONING_OUTPUT_TOKENS]: u.output_tokens_details.reasoning_tokens,
          }),
        });
        if (u) {
          tokenUsage.record(u.input_tokens, { ...common, [A.TOKEN_TYPE]: "input" });
          tokenUsage.record(u.output_tokens, { ...common, [A.TOKEN_TYPE]: "output" });
        }
        if (CAPTURE_CONTENT) {
          span.setAttribute(A.OUTPUT_MESSAGES, [
            { role: "assistant", parts: [{ type: "text", content: redactForTelemetry(response.output_text) }] },
          ]);
        }
        return response;
      } catch (err) {
        errorType = (err as { status?: number }).status ? String((err as { status: number }).status) : (err as Error).name;
        span.setAttribute(A.ERROR_TYPE, errorType);
        span.recordException(err as Error);
        span.setStatus({ code: SpanStatusCode.ERROR });
        throw err;
      } finally {
        duration.record((performance.now() - started) / 1000, { ...common, ...(errorType && { [A.ERROR_TYPE]: errorType }) });
        span.end();
      }
    },
  );
}

/** A tool execution inside the agent loop, as its own INTERNAL span. */
export function tracedTool<T>(name: string, callId: string, run: () => Promise<T>): Promise<T> {
  return tracer.startActiveSpan(
    `execute_tool ${name}`,
    { kind: SpanKind.INTERNAL, attributes: { [A.OPERATION_NAME]: "execute_tool", [A.TOOL_NAME]: name, [A.TOOL_CALL_ID]: callId, [A.TOOL_TYPE]: "function" } },
    async (span) => {
      try {
        return await run();
      } catch (err) {
        span.setAttribute(A.ERROR_TYPE, (err as Error).name);
        span.setStatus({ code: SpanStatusCode.ERROR });
        throw err;
      } finally {
        span.end();
      }
    },
  );
}

/** A retrieval step for project Q&A: record what was searched and how much came back, not the text. */
export function tracedRetrieval<T extends { id: string; score: number }[]>(source: string, topK: number, run: () => Promise<T>): Promise<T> {
  return tracer.startActiveSpan(
    "retrieval",
    { kind: SpanKind.INTERNAL, attributes: { [A.OPERATION_NAME]: "retrieval", [A.DATA_SOURCE_ID]: source, [A.RETRIEVAL_TOP_K]: topK } },
    async (span) => {
      try {
        const docs = await run();
        span.setAttributes({ "taskflow.retrieval.returned": docs.length, "taskflow.retrieval.top_score": docs[0]?.score ?? 0 });
        return docs;
      } finally {
        span.end();
      }
    },
  );
}
```

How the parts fit:

- **Span name and kind** follow the conventions: `chat <model>` as a
  `CLIENT` span for the model call, `execute_tool <name>` and
  `retrieval` as `INTERNAL` spans. `startActiveSpan` makes each one the
  parent of anything that runs inside it, such as the MongoDB call inside
  a tool.
- **The request model and the response model differ** on purpose: the
  request carries the configured ID (often an alias), the response the
  dated snapshot that actually ran, which is what you need when behavior
  changes "without a deploy".
- **Usage details** map the Responses API's `input_tokens_details.cached_tokens`
  and `output_tokens_details.reasoning_tokens` to the conventions'
  cache-read and reasoning attributes.
- **Errors** set `error.type` (the HTTP status from the SDK's error, or
  the error name), record the exception, and mark the span as an error,
  so tail sampling keeps the trace and the duration metric can be split
  by error.
- **Content** is recorded only when `GENAI_CAPTURE_CONTENT=true`, as a
  structured value after redaction. Structured attribute values are
  supported from `@opentelemetry/api` 1.10, whose `AnyValue` type allows
  maps and arrays.

Running the helpers against a fake client and an in-memory exporter,
for an agent request with one tool call, prints the spans they produce
(trimmed to one model call):

```text
POST /api/agent  [SERVER]
chat example-model  [CLIENT]  parent: POST /api/agent
    gen_ai.operation.name = "chat"
    gen_ai.provider.name = "openai"
    gen_ai.request.model = "example-model"
    taskflow.feature = "agent"
    openai.api.type = "responses"
    gen_ai.prompt.name = "task-agent"
    gen_ai.prompt.version = "7"
    gen_ai.conversation.id = "conv_42"
    gen_ai.response.id = "resp_demo_1"
    gen_ai.response.model = "example-model-2026-10-01"
    gen_ai.response.status = "completed"
    gen_ai.usage.input_tokens = 1250
    gen_ai.usage.output_tokens = 64
    gen_ai.usage.cache_read.input_tokens = 1024
    gen_ai.usage.reasoning.output_tokens = 0
execute_tool create_task  [INTERNAL]  parent: POST /api/agent
    gen_ai.operation.name = "execute_tool"
    gen_ai.tool.name = "create_task"
    gen_ai.tool.call.id = "call_1"
    gen_ai.tool.type = "function"
chat example-model  [CLIENT]  parent: POST /api/agent
```

With content capture turned on, the second model call's answer, which
mentioned an email address, was recorded with the address already
replaced:

```text
gen_ai.output.messages = [{"role":"assistant","parts":[{"type":"text","content":"Created 'Call the bank' for Nov 14. Questions: <email>"}]}]
```

Outside the Node SDK, spans nest only if a context manager is
registered; `NodeSDK` registers one automatically.

### Redacting content at the source

```ts
// src/ai/redact.ts: scrub obvious personal data before any text reaches telemetry
const PATTERNS: [RegExp, string][] = [
  [/[\w.+-]+@[\w-]+\.[\w.-]+/g, "<email>"],
  [/\+?\d[\d\s().-]{7,}\d/g, "<phone>"],
  [/\b(?:\d[ -]?){13,19}\b/g, "<card>"],
  [/\b(sk|pk|rk)[-_][A-Za-z0-9_-]{16,}\b/g, "<secret>"],
];

export function redactForTelemetry(text: string, maxLength = 2_000): string {
  let out = text;
  for (const [pattern, replacement] of PATTERNS) out = out.replace(pattern, replacement);
  return out.length > maxLength ? `${out.slice(0, maxLength)}...[truncated]` : out;
}
```

Pattern-based redaction catches structured identifiers, not names or
free-text personal details ("my diagnosis is ..."), which is why content
capture stays off by default and the Collector adds a second layer. The
truncation also protects backends from oversized attribute values.

### The Collector: redaction, sampling, and export

```yaml
# otel-collector.yaml: one Collector between TaskFlow and its tracing and metrics backends
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
    spike_limit_percentage: 20
  redaction:
    allow_all_keys: true                  # keep attribute keys, mask the values below
    blocked_key_patterns:                 # content is opt-in in the app; mask it here as well
      - '^gen_ai\.(input|output)\.messages$'
      - '^gen_ai\.system_instructions$'
      - '^gen_ai\.tool\.call\.(arguments|result)$'
      - '^gen_ai\.retrieval\.(documents|query\.text)$'
    blocked_values:
      - '[\w.+-]+@[\w-]+\.[\w.-]+'        # email addresses
      - '\b(?:\d[ -]?){13,19}\b'          # card-like numbers
    summary: info
  tail_sampling:
    decision_wait: 10s
    policies:
      - name: keep-errors
        type: status_code
        status_code: { status_codes: [ERROR] }
      - name: keep-slow
        type: latency
        latency: { threshold_ms: 8000 }
      - name: sample-the-rest
        type: probabilistic
        probabilistic: { sampling_percentage: 10 }

exporters:
  otlphttp/langfuse:
    endpoint: https://cloud.langfuse.com/api/public/otel
    headers:
      Authorization: "Basic ${env:LANGFUSE_AUTH}"   # base64 of public key and secret key
      x-langfuse-ingestion-version: "4"
  prometheus:
    endpoint: 0.0.0.0:8889

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [memory_limiter, redaction, tail_sampling]
      exporters: [otlphttp/langfuse]
    metrics:
      receivers: [otlp]
      processors: [memory_limiter]
      exporters: [prometheus]
```

What each part does:

- **`redaction`** keeps every attribute key (`allow_all_keys: true`) but
  masks the values of content attributes and any value that matches the
  email or card patterns. The processor fails closed when
  `allow_all_keys` is false, so an allow-list of keys is the stricter
  alternative for high-risk services.
- **`tail_sampling`** waits until a trace is complete, then keeps all
  errors, all traces slower than 8 seconds, and 10% of the rest. It needs
  every span of a trace to reach the same Collector instance, so a
  horizontally scaled deployment routes by trace ID first.
- **`otlphttp/langfuse`** sends traces to Langfuse's OTLP endpoint (the
  EU cloud region in this example; self-hosted instances use their own
  URL). The credentials come from an environment variable, never from
  the file.
- **`prometheus`** exposes the metrics for Prometheus to scrape.

`otelcol-contrib validate` (version 0.165.0) accepts this file. Sending a
test span through a local copy of the pipeline with a debug exporter
showed the redaction at work:

```text
Attributes:
     -> gen_ai.operation.name: Str(chat)
     -> gen_ai.output.messages: Str(****)
     -> taskflow.note: Str(contact ****, card ****)
     -> gen_ai.usage.input_tokens: Int(1250)
     -> redaction.masked.count: Int(2)
```

### Cost per call

```ts
// src/ai/cost.ts: estimated cost per call from token usage and a price table kept in configuration
import { metrics } from "@opentelemetry/api";
import type { ResponseUsage } from "openai/resources/responses/responses";
import { z } from "zod";

// LLM_PRICES holds the provider's current per-million-token prices, copied from its pricing page:
// {"<model id>": {"input": <price>, "cachedInput": <price>, "output": <price>}}
const Prices = z.record(z.string(), z.object({ input: z.number(), cachedInput: z.number(), output: z.number() }));
const PRICES = Prices.parse(JSON.parse(process.env.LLM_PRICES ?? "{}"));

const cost = metrics.getMeter("taskflow-ai").createCounter("taskflow.llm.cost", {
  unit: "{cost_unit}",
  description: "Estimated model cost in the billing currency of the price table",
});

export function recordCost(model: string, usage: ResponseUsage, feature: string): number | undefined {
  const p = PRICES[model];
  if (!p) return undefined;                            // unknown model: alert on this, do not guess
  const cached = usage.input_tokens_details.cached_tokens;
  const estimate =
    ((usage.input_tokens - cached) * p.input + cached * p.cachedInput + usage.output_tokens * p.output) / 1_000_000;
  cost.add(estimate, { "gen_ai.request.model": model, "taskflow.feature": feature });
  return estimate;
}
```

Call `recordCost(response.model, response.usage, feature)` after each
call. The price table is keyed by the model ID the provider returns, so
a model switch without a matching price shows up as a missing estimate
instead of a wrong one. Treat the result as an estimate and reconcile it
with the provider's usage reports.

Queries for the dashboard, using the metric names as the Collector's
Prometheus exporter produced them in a local test:

```text
# tokens per hour, by feature and type (input or output)
sum by (taskflow_feature, gen_ai_token_type) (increase(gen_ai_client_token_usage_sum[1h]))

# average output tokens per call, by feature
sum by (taskflow_feature) (increase(gen_ai_client_token_usage_sum{gen_ai_token_type="output"}[1h]))
  / sum by (taskflow_feature) (increase(gen_ai_client_token_usage_count{gen_ai_token_type="output"}[1h]))

# p95 model-call latency, by feature
histogram_quantile(0.95, sum by (le, taskflow_feature) (rate(gen_ai_client_operation_duration_seconds_bucket[5m])))

# share of model calls that failed, by feature
sum by (taskflow_feature) (rate(gen_ai_client_operation_duration_seconds_count{error_type!=""}[5m]))
  / sum by (taskflow_feature) (rate(gen_ai_client_operation_duration_seconds_count[5m]))

# estimated cost per day, by feature
sum by (taskflow_feature) (increase(taskflow_llm_cost_total[1d]))
```

Alerts follow the patterns in
[alerting and on-call](../../../../07-devops-and-deployment/07-devops-and-deployment/monitoring-and-logging/alerting-and-on-call.md):
page on error share and latency against the feature's SLO, and send a
ticket, not a page, when tokens per hour or cost per day jump well
above their usual level.

### The feedback endpoint

Every AI response includes the ID of the trace that produced it. Inside
the request handler, after the model call:

```ts
// src/routes/assistant.ts (excerpt): return the trace ID with the answer
import { trace } from "@opentelemetry/api";

const traceId = trace.getActiveSpan()?.spanContext().traceId;   // 32 lowercase hex characters
if (traceId) await feedbackStore.rememberTrace(req.user.id, traceId);   // so feedback can be checked later
res.json({ draft, traceId });
```

The UI sends the ID back with the user's rating, and this route stores
the feedback and attaches it to the trace as a score:

```ts
// src/routes/ai-feedback.ts: thumbs up or down on an AI answer, tied to the trace that produced it
import { LangfuseClient } from "@langfuse/client";
import { Router } from "express";
import { z } from "zod";

const Feedback = z.object({
  traceId: z.string().regex(/^[0-9a-f]{32}$/),          // returned with every AI answer
  feature: z.enum(["task-assistant", "project-qa", "meeting-summary", "agent"]),
  rating: z.enum(["up", "down"]),
  reason: z.enum(["wrong", "incomplete", "unsafe", "slow", "other"]).optional(),
  comment: z.string().max(1_000).optional(),
});
export type Feedback = z.infer<typeof Feedback>;

export interface FeedbackStore {
  rememberTrace(userId: string, traceId: string): Promise<void>;  // called when an answer is served
  ownsTrace(userId: string, traceId: string): Promise<boolean>;
  save(doc: Feedback & { userId: string; at: Date }): Promise<void>;
}

const langfuse = new LangfuseClient();   // reads LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY, LANGFUSE_BASE_URL

export function aiFeedbackRouter(store: FeedbackStore) {
  const router = Router();
  router.post("/api/ai/feedback", async (req, res) => {
    const parsed = Feedback.safeParse(req.body);
    const userId = (req as { user?: { id: string } }).user?.id;   // set by the auth middleware
    if (!userId) { res.status(401).end(); return; }
    if (!parsed.success) { res.status(400).json({ error: "invalid feedback" }); return; }
    const f = parsed.data;
    if (!(await store.ownsTrace(userId, f.traceId))) { res.status(404).end(); return; }

    await store.save({ ...f, userId, at: new Date() });            // your own copy, joinable with eval sets
    langfuse.score.create({
      id: `${f.traceId}-user-feedback`,     // idempotency key: a second click updates the score
      traceId: f.traceId,
      name: "user-feedback",
      value: f.rating === "up" ? 1 : 0,
      dataType: "BOOLEAN",
      ...(f.reason && { comment: f.reason }),   // free text stays in your database, not the trace tool
    });
    res.status(204).end();
  });
  return router;
}
```

Design choices worth copying:

- **Ownership check.** Users can only rate traces that were served to
  them, so nobody can flood another user's answers with feedback.
- **Your own copy first.** The feedback lives in TaskFlow's database,
  joinable with users and features and usable for building evaluation
  sets, whatever tracing tool you use next year.
- **A score on the trace.** Langfuse uses OpenTelemetry trace IDs (32
  lowercase hex characters) as its trace IDs, so the ID from the answer
  attaches the score to the right trace. `score.create` queues the score
  and sends it in batches; it never throws, so feedback never fails the
  request. The `id` makes a repeated click update the score rather than
  add a second one.
- **Free text stays home.** Comments can contain personal data; only the
  structured reason goes to the tracing tool.

## Best practices

- Wrap every model call in one traced function, and record the prompt
  name, prompt version, requested model, and returned model on every
  span.
- Follow the GenAI semantic conventions, keep the names in one module,
  and note which convention version your instrumentation emits.
- Keep content capture off in production; when you need it, redact at
  the source, redact again in the Collector, and prefer references to a
  restricted store.
- Send telemetry to a Collector and fan out from there, so vendors can
  change without code changes.
- Use tail sampling to keep every error and slow trace, and sample the
  rest.
- Record tokens and durations as metrics with low-cardinality labels
  only; compute cost from a price table in configuration.
- Return the trace ID with every AI response and attach feedback to it.
- Triage thumbs-down and edited outputs weekly and turn them into
  evaluation cases.
- Alert on error share and latency against SLOs, and ticket on token or
  cost anomalies.

## In production

- **The token bill doubled overnight.**
  *Detect:* tokens per hour for the agent feature jumped while request
  volume stayed flat; traces show many model calls per request. *Cause:*
  an agent loop that retries a failing tool, or a prompt change that
  made answers longer. *Fix:* cap model calls per request, alert on
  calls per request and tokens per hour, and compare output tokens by
  prompt version.
- **A user's email address appears in the tracing backend.**
  *Detect:* a privacy review or a search of span attributes finds raw
  emails. *Cause:* content capture turned on in production, or an
  instrumentation library that captures prompts by default. *Fix:* turn
  capture off, add the Collector redaction processor, purge the affected
  data per your incident process, and set retention on the backend.
- **Behavior changed with no deploy.**
  *Detect:* thumbs-down share rises; spans show a new
  `gen_ai.response.model` snapshot behind the same requested model.
  *Cause:* the provider moved the alias to a new snapshot. *Fix:* pin a
  snapshot in configuration, run the evaluation suite on old and new, and
  upgrade deliberately.
- **Dashboards stopped updating after a library upgrade.**
  *Detect:* token panels are empty while traffic continues; the metrics
  backend shows new metric or attribute names. *Cause:* the GenAI
  conventions changed names (for example `gen_ai.system` to
  `gen_ai.provider.name`, or the token histogram to counters) and the
  instrumentation followed. *Fix:* pin instrumentation versions, keep
  names in one module, and update queries in the same change as the
  upgrade.
- **Feedback cannot be matched to anything.**
  *Detect:* thumbs-down records exist, but nobody can find the trace,
  prompt version, or input behind them. *Cause:* responses did not
  return trace IDs, or traces were sampled away. *Fix:* return the trace
  ID with every answer and add a tail-sampling policy that keeps traces
  with negative feedback or errors.
- **The metrics backend runs out of memory.**
  *Detect:* active series grow without bound after an instrumentation
  change. *Cause:* a high-cardinality label such as a user ID, trace ID,
  or prompt text on a metric. *Fix:* remove the label, keep such values on
  spans only, and add a cardinality limit in the Collector or backend.

## Important terminology

- **LLM observability:** Telemetry that records model calls, tool calls,
  and retrieval with tokens, versions, and quality signals.
- **GenAI semantic conventions:** OpenTelemetry's names for spans,
  attributes, and metrics of generative AI operations.
- **Inference span:** The span for one model call, named
  `{operation} {model}`.
- **Content capture:** Recording prompts, instructions, and outputs in
  telemetry; opt-in by convention.
- **OTLP:** The OpenTelemetry protocol used to send traces, metrics, and
  logs.
- **OpenTelemetry Collector:** A service that receives, processes, and
  exports telemetry.
- **Redaction processor:** A Collector component that masks attribute
  values by key or pattern.
- **Tail sampling:** Deciding which traces to keep after they complete.
- **Cardinality:** The number of distinct label combinations of a metric.
- **Trace ID:** The identifier shared by all spans of one request.
- **Score:** A quality value attached to a trace, from a user, a judge,
  or a reviewer.
- **OpenInference:** Arize's conventions and instrumentations for AI
  tracing, used by Phoenix.

## Common mistakes and misconceptions

- Treating HTTP 200 and normal latency as proof that an AI feature
  works.
- Logging full prompts and answers in production because it is
  convenient for debugging.
- Recording the requested model but not the returned model snapshot.
- Putting user IDs or prompt text in metric labels.
- Assuming every tool uses the same attribute names (OpenInference and
  the GenAI conventions differ).
- Assuming the GenAI conventions are stable and will not rename
  anything.
- Collecting thumbs-down clicks without the trace ID that explains them.
- Treating feedback rates as accuracy rather than as triage signals.
- Sending telemetry straight to a vendor from every service, so a
  redaction rule has to be added in ten places.

## Revision questions

1. Which questions about an LLM feature can classic request metrics not
   answer, and which signals answer them?
2. Describe the spans of a TaskFlow agent request that calls two tools.
   What are their names and kinds under the GenAI conventions?
3. What is the status of the GenAI semantic conventions in November
   2026, and what changed in semantic conventions v1.42.0? How do you
   protect dashboards from renames?
4. Name the three content-capture patterns the conventions describe and
   when each fits.
5. Why should telemetry go through a Collector, and what do the
   redaction and tail sampling processors add?
6. A feature makes 40,000 model calls a day with 1,200 input tokens (900
   of them cached) and 150 output tokens each. How many uncached input,
   cached input, and output tokens is that per day, and which one would
   you reduce first if output tokens cost several times more than input?
   (12 million uncached, 36 million cached, 6 million output; output and
   uncached input usually dominate, so trim answer length and the
   uncached part of the prompt.)
7. Why must the feedback endpoint check that the trace belongs to the
   user, and why store feedback in your own database?
8. Dashboards went blank after an instrumentation upgrade while traffic
   continued. What happened, and how do you prevent it?

## Further learning

- [OpenTelemetry: GenAI semantic conventions repository](https://github.com/open-telemetry/semantic-conventions-genai)
- [OpenTelemetry: Prometheus and OpenMetrics compatibility](https://opentelemetry.io/docs/specs/otel/compatibility/prometheus_and_openmetrics/)
- [Langfuse: OpenTelemetry integration](https://langfuse.com/integrations/native/opentelemetry)
  and [scores via the SDK](https://langfuse.com/docs/evaluation/evaluation-methods/scores-via-sdk)
- [LangSmith: Trace with OpenTelemetry](https://docs.langchain.com/langsmith/trace-with-opentelemetry)
- [Arize Phoenix documentation](https://arize.com/docs/phoenix)
- [OpenTelemetry Collector: redaction processor](https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/processor/redactionprocessor)
- [OpenLLMetry for JavaScript](https://github.com/traceloop/openllmetry-js)
- Next: [evaluation and monitoring interview questions and answers](interview-questions-and-answers.md). Back to the [evaluation and monitoring overview](../evaluation-and-monitoring.md).
