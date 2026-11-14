# Cost Optimization for LLM Apps

An LLM feature has a meter attached to every request. Hosted models bill
by tokens (input, cached input, output, and hidden reasoning tokens) and by
some tool calls; self-hosted models bill by the GPU-hour whether or not
anyone is using them. This lesson shows how to account for that spend
precisely, how to find the feature and the token type that dominate it, and
how to reduce it with caching, batching, routing to smaller models,
distillation, output limits, and context trimming, without breaking quality.

All costs here are relative. Prices change often and differ by provider and
model, so the examples use units where one uncached input token costs 1, and
you multiply by your provider's current price list when you need money.
The running examples are TaskFlow's Assistant (task creation with
structured output), project Q&A over documents, the task agent, and
meeting-notes summaries.

## Why it matters

Usage-based pricing scales with traffic times tokens, and both grow
quietly. A prompt template gains a paragraph, retrieval returns eight
passages instead of four, an agent takes two extra steps, a model upgrade
produces longer answers, and the monthly bill doubles without a single
traffic change. Output tokens usually cost several times as much as input
tokens (five times at several providers' list prices in November 2026), and
reasoning models add hidden output tokens on top. Retries and validation
failures bill again for the same user action.

Cost is also a product decision. A feature that costs more per request than
the user pays per month cannot ship to everyone. Knowing the cost per
completed task, per feature and per tenant, is what lets a team set limits,
price plans, and choose where to spend engineering effort. And many cost
fixes (shorter outputs, smaller models, cached prefixes) make the feature
faster too, as described in [latency optimization](latency-optimization.md).

## Real-world usage

- **OpenAI Batch API.** The
  [Batch guide](https://developers.openai.com/api/docs/guides/batch)
  offers a "50% cost discount compared to synchronous APIs", a separate
  pool of higher rate limits, and completion "within 24 hours (and often
  more quickly)". The
  [flex processing guide](https://developers.openai.com/api/docs/guides/flex-processing)
  offers batch-level prices on ordinary requests "in exchange for slower
  response times and occasional resource unavailability".
- **OpenAI and Anthropic prompt caching.** OpenAI's
  [prompt caching guide](https://developers.openai.com/api/docs/guides/prompt-caching)
  describes cached input tokens "discounted up to 95%". Anthropic's
  [prompt caching documentation](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)
  prices 5-minute cache writes at 1.25 times the base input price, 1-hour
  writes at 2 times, and cache reads at 0.1 times (0.05 or 0.025 times on
  some newer models), and its
  [batch processing guide](https://platform.claude.com/docs/en/build-with-claude/batch-processing)
  offers "a 50 percent discount on all usage" that stacks with caching.
- **FrugalGPT.** Chen, Zaharia, and Zou,
  [FrugalGPT](https://arxiv.org/abs/2305.05176), route each query through a
  cascade of models from cheap to expensive and report matching the best
  single model's performance "with up to 98% cost reduction" on their
  benchmarks.
- **RouteLLM.** Ong and colleagues,
  [RouteLLM: Learning to Route LLMs with Preference Data](https://arxiv.org/abs/2406.18665),
  train routers that choose between a strong and a weak model per query and
  report reducing costs "by over 2 times in certain cases" without hurting
  response quality.
- **Gemini Batch API.** Google's
  [Batch API guide](https://aistudio.google.com/docs/batch-api) prices
  batch requests "at 50% of the standard interactive API cost" with a
  24-hour target turnaround.

**Popular tools and providers:** provider usage dashboards and usage APIs,
batch APIs and flex tiers, prompt caching, token counting endpoints
(OpenAI `responses.inputTokens.count`, Anthropic `messages.countTokens`,
Google `models.countTokens`), local tokenizers such as `gpt-tokenizer`,
Prometheus and OpenTelemetry for per-feature metrics, and AI gateways that
add budgets and routing in front of several providers.

## How it works

### The cost of one request

Every provider's bill reduces to the same shape:

```text
request cost = uncached input tokens x input price
             + cached input tokens   x cached-input price   (much cheaper)
             + cache-write tokens    x cache-write price    (some providers charge extra)
             + output tokens         x output price         (includes reasoning tokens)
             + tool and other fees   (web search, images, audio, ...)

Relative units used in this lesson: input 1, cached input 0.1, output 5

TaskFlow Assistant (task creation): 2,000 input tokens, 1,800 of them a cached
system prompt and tool schema; 80 output tokens
  uncached: 200 x 1 = 200;  cached: 1,800 x 0.1 = 180;  output: 80 x 5 = 400
  = 780 units  (2,400 units without caching)

Project Q&A: 150 cached instruction tokens, 8 passages x 500 tokens, 300 output tokens
  150 x 0.1 + 4,000 x 1 + 300 x 5 = 15 + 4,000 + 1,500 = 5,515 units
  with the top 4 passages instead of 8:  15 + 2,000 + 1,500 = 3,515 units

Meeting summary: 6,000 input tokens of notes (never repeated, so never cached),
400 output tokens
  6,000 x 1 + 400 x 5 = 8,000 units;  with a five-bullet limit (150 tokens): 6,750
```

Then account for what the user actually gets. If 4% of Assistant calls fail
validation and are retried once, and 2% hit a timeout and are retried, the
cost per **completed** task is about 6% higher than the cost per request.
Agents are worse: every step re-sends the growing conversation, so input
tokens grow roughly with the square of the number of steps unless the
history is cached or trimmed.

### Where the money goes: per feature, not per request

![Diagram: horizontal stacked bars of monthly cost in millions of relative units, where one unit is one uncached input token; task creation, at 300,000 requests, costs 234 million units: 60 uncached input, 54 cached input, and 120 output; meeting summaries, at 20,000 requests, cost 160 million: 120 uncached input and 40 output; project Q&A, at 100,000 requests, costs about 552 million: 400 uncached input, 1.5 cached input, and 150 output; a note says that retrieving the top 4 passages instead of 8 cuts Q&A by 200 million units, the largest single saving.](cost-per-feature-breakdown.svg)

Multiplying cost per request by volume changes the picture. Task creation
is cheap per request but frequent; summaries are expensive per request but
rare; project Q&A combines high volume with long retrieved context and
dominates the bill. The highest-value change is often a boring one (fewer,
better passages) rather than a model switch. You only see that if usage is
recorded per feature, which the practical examples show how to do.

### Counting tokens: estimate before, record after

Two different numbers matter:

- **Before the call**, estimate input size to enforce budgets: trim history,
  cap retrieved context, or refuse a request that would exceed a tenant's
  quota. A local tokenizer such as `gpt-tokenizer` (OpenAI's `o200k_base`
  encoding by default) is fast and free; other providers tokenize
  differently, so treat it as an estimate with a margin, or call the
  provider's token counting endpoint when precision matters.
- **After the call**, record the `usage` object the provider returns. That
  is what you are billed for, including cached and reasoning tokens that no
  local count can predict.

The usage fields differ by provider, and so does their arithmetic:

| Provider | Input | Cached input | Output |
|---|---|---|---|
| OpenAI Responses | `input_tokens` (includes cached and cache-write tokens) | `input_tokens_details.cached_tokens` | `output_tokens` (includes `output_tokens_details.reasoning_tokens`) |
| OpenAI-style Chat Completions | `prompt_tokens` (includes cached) | `prompt_tokens_details.cached_tokens` | `completion_tokens` (includes reasoning) |
| Anthropic Messages | `input_tokens` (only tokens after the last cache breakpoint) | `cache_read_input_tokens`; writes in `cache_creation_input_tokens` | `output_tokens` |
| Google Gen AI | `promptTokenCount` (includes cached) | `cachedContentTokenCount` | `candidatesTokenCount` plus `thoughtsTokenCount` |

Normalize them once, in one module, so dashboards do not mix "input
including cache" with "input excluding cache".

### Caching

Three kinds of caching cut cost, with very different risks:

| Cache | What is reused | Saves | Main risk |
|---|---|---|---|
| Provider prompt caching | Processed prefix of the prompt | Most of the input price of the cached part | Low; needs an identical prefix |
| Exact response cache (yours) | The whole answer for an identical request | The entire call | Serving one tenant's answer to another; stale answers |
| Semantic cache (yours) | An answer to a similar earlier question | The entire call | Wrong answers for questions that look alike but differ |

Prompt caching is nearly free to adopt: put stable content first and
measure hit ratios. An exact response cache fits deterministic,
non-personal calls, such as classifying a support ticket or summarizing a
public changelog; its key must include the model, the prompt version, the
tenant and permission scope, the full input, and the data version (see
[cache fundamentals](../../../../05-application-architecture/caching/cache-fundamentals.md)).
Semantic caching needs an evaluation of false hits before it is trusted,
and should never cross tenant or permission boundaries.

### Batching and flex tiers

Work nobody waits for should not pay interactive prices. Nightly meeting
summaries for inactive projects, re-summarizing a backlog after a prompt
change, evaluation runs, and data enrichment can all go through a batch
API: OpenAI, Anthropic, and Google all price batch requests at half the
interactive rate as of November 2026, in exchange for asynchronous results
within 24 hours. OpenAI's flex tier applies similar pricing to individual
requests that can tolerate slow responses and occasional unavailability.
For self-hosted models the equivalent is filling the GPU: an offline job
that keeps continuous batching saturated lowers the cost of every token
the GPU produces.

### Routing to smaller models

![Diagram: a cascade router for TaskFlow; each request first goes to a decision on whether the feature is a known simple task; known simple tasks go to the small model, and its output is validated; valid and confident results are returned at a relative cost of 1; invalid or low-confidence results escalate to the large model at a relative cost of 10 more, and its result is validated and returned, or the request fails clearly; features known to be hard skip straight to the large model; with 30% of requests escalating, the expected cost is 1 + 0.3 x 10 = 4 units instead of 10, and escalated requests pay extra latency; the escalation rate is tracked as a metric.](model-routing-cascade.svg)

Many requests do not need the largest model. Three routing patterns, from
simple to sophisticated:

1. **Per-feature routing.** Each feature has a configured model: a small
   model for task creation and ticket classification, a large one for
   multi-step agent work. This is configuration, not code, and captures most
   of the savings.
2. **Cascade.** Try the small model first, validate the result (schema
   checks, a confidence field, or a cheap verifier), and escalate to the
   large model only on failure. FrugalGPT studies this pattern.
3. **Learned router.** A classifier predicts which model a query needs, as
   in RouteLLM. It needs training data and monitoring, so start with the
   first two.

The arithmetic of a cascade decides whether it pays:

```text
small model = 1 unit, large model = 10 units per request

always large:                          10 units
cascade, 30% escalate:   1 + 0.3 x 10 = 4 units   (60% cheaper)
cascade, 85% escalate:   1 + 0.85 x 10 = 9.5 units, and escalated requests are slower
```

A cascade only helps when most requests succeed on the small model, so
track the escalation rate per feature, and evaluate quality on the same
evaluation set as the large model (see
[building evaluation sets](../evaluation-and-monitoring/building-evaluation-sets.md)).

### Distillation

When one narrow, high-volume task (task extraction from a sentence, ticket
labeling) runs on a large model, you can **distill** it: collect the large
model's outputs on real inputs, review them, and fine-tune a small model to
reproduce them. The small model then serves the task at a fraction of the
cost and latency, and can often be self-hosted. It costs an evaluation set,
a training pipeline, and ongoing retraining when the task changes; check the
provider's terms on training with its outputs before you start. The method
is covered in
[preference tuning and distillation](../fine-tuning/preference-tuning-and-distillation.md),
and the decision in [when to fine-tune](../fine-tuning/when-to-fine-tune.md).

### Limits: output caps, context trimming, and step caps

- **Output caps.** Set an output limit per feature (`max_output_tokens`,
  `max_tokens`) and ask for the length the UI needs. For reasoning models,
  choose the lowest reasoning effort that passes evaluation.
- **Context trimming.** Keep the last few conversation turns verbatim and
  replace older ones with a running summary, or drop them; see
  [conversation state and memory](../building-ai-applications/conversation-state-and-memory.md).
- **Retrieval caps.** Fewer, reranked passages usually answer as well as
  many raw ones, at a fraction of the input cost.
- **Agent step caps and tool output limits.** Cap the number of steps,
  truncate large tool results before they go back into the context, and stop
  runaway loops.
- **Per-tenant quotas.** Enforce token budgets per tenant and plan, and
  degrade gracefully (a smaller model, a shorter answer, a clear message)
  instead of failing silently.

### Self-hosting economics

A self-hosted GPU costs the same per hour at 5% load and at 95% load, so its
cost per token depends on utilization:

```text
G = cost of one GPU-hour (relative units), T = tokens per hour at full load
cost per token = G / (T x utilization)

T = 7.2 million tokens per hour (2,000 tokens/s across all streams)
  80% utilization: G / 5.76 million tokens
  10% utilization: G / 0.72 million tokens  -> 8 times the cost per token
```

Self-hosting is cheaper than a hosted API only when sustained utilization
is high enough that `G / (T x utilization)` falls below the API's price per
token for a model of similar quality, after adding engineering and on-call
time. Spiky or low traffic usually favors hosted APIs; steady, high volume,
or strict data-control requirements favor self-hosting. GPU options and
their relative costs are in
[GPU capacity and scaling](gpu-capacity-and-scaling.md).

### Per-feature cost tracking

![Diagram: every TaskFlow model call goes through one wrapper that records feature, model, prompt version, and a hashed tenant id; the provider response's usage object is normalized into uncached input, cached input, cache writes, output, and reasoning tokens; the normalized usage feeds three places: Prometheus counters labeled by feature, model, and token type without tenant labels, structured logs and trace attributes such as gen_ai.usage.input_tokens without prompt text, and a per-tenant daily usage store; a budget check reads the tenant store before each call and either allows it, switches to a smaller model, or rejects it with a clear message; dashboards show cost per feature per day and cost per completed task.](per-feature-cost-tracking.svg)

Cost tracking works when it is impossible to bypass:

- **One wrapper for every model call**, taking a `feature` name, so no code
  path calls an SDK directly.
- **Labels with low cardinality** in metrics (feature, model, token type).
  Tenant ids go to logs and a usage store, not to Prometheus labels, where
  thousands of tenants would explode the series count.
- **No prompt content in cost records.** Usage numbers and ids are enough;
  prompts may hold personal data (see
  [privacy, PII, and data retention](../security-privacy-and-responsible-ai/privacy-pii-and-data-retention.md)).
- **Outcomes next to costs.** Record whether the task completed (task
  created, answer accepted) so you can compute cost per completed task,
  not just cost per call.
- **Trace attributes.** OpenTelemetry's GenAI semantic conventions define
  attributes such as `gen_ai.request.model`, `gen_ai.usage.input_tokens`,
  and `gen_ai.usage.output_tokens`; they are still marked Development, so
  pin the version you follow (see
  [LLM observability and tracing](../evaluation-and-monitoring/llm-observability-and-tracing.md)).

## When to use and when not to use

| Situation | Technique | Watch out for |
|---|---|---|
| Long, repeated instructions or documents | Prompt caching | Variable text at the top of the prompt |
| Identical, non-personal requests | Exact response cache | Key must include tenant, model, prompt and data versions |
| Work nobody waits for | Batch API or flex tier | Results arrive later; design for asynchronous completion |
| Most requests are easy | Per-feature routing or a cascade | Escalation rate and quality must be measured |
| One narrow task at high volume | Distillation to a small model | Training pipeline, evaluation, provider terms |
| Long answers or chats | Output caps, history trimming | Truncated answers, lost context |
| Retrieval-heavy features | Fewer, reranked passages | Recall drops if you cut too far |
| Steady high volume, data control needs | Self-hosting | Utilization; idle GPUs are expensive |
| Spiky, low volume | Hosted APIs | Rate limits and provider dependency |

## Practical examples

### Estimating tokens and trimming history before the call

```ts
// src/ai/token-budget.ts
import { countTokens } from "gpt-tokenizer"; // o200k_base by default: an estimate for other providers

export interface ChatTurn {
  role: "system" | "user" | "assistant";
  content: string;
}

// Keep the system prompt and as many of the newest turns as fit the budget.
export function fitToBudget(turns: ChatTurn[], budgetTokens: number): ChatTurn[] {
  const [system, ...rest] = turns;
  if (!system || system.role !== "system") throw new Error("first turn must be the system prompt");

  let used = countTokens(system.content);
  const kept: ChatTurn[] = [];
  for (let i = rest.length - 1; i >= 0; i -= 1) {
    const turn = rest[i] as ChatTurn;
    const cost = countTokens(turn.content) + 4; // small allowance for message framing
    if (used + cost > budgetTokens) break;
    used += cost;
    kept.unshift(turn);
  }
  return [system, ...kept];
}
```

```ts
// scripts/token-budget-demo.ts
import { countTokens } from "gpt-tokenizer";
import { fitToBudget, type ChatTurn } from "../src/ai/token-budget.js";

const turns: ChatTurn[] = [
  { role: "system", content: "You are TaskFlow Assistant. Turn requests into tasks." },
  ...Array.from({ length: 30 }, (_, i): ChatTurn => ({
    role: i % 2 === 0 ? "user" : "assistant",
    content: `Turn ${i}: please move the launch checklist task to next week and notify the design team.`,
  })),
];

const all = turns.reduce((sum, t) => sum + countTokens(t.content), 0);
const trimmed = fitToBudget(turns, 300);
const kept = trimmed.reduce((sum, t) => sum + countTokens(t.content), 0);
console.log(`all turns: ${turns.length} turns, ${all} tokens`);
console.log(`trimmed:   ${trimmed.length} turns, ${kept} tokens (budget 300)`);
```

```text
# Output from a local run
all turns: 31 turns, 581 tokens
trimmed:   13 turns, 239 tokens (budget 300)
```

In production, replace the dropped turns with a short running summary
rather than discarding them, and keep the budget per feature in
configuration.

### Normalizing usage and computing relative cost

```ts
// src/ai/usage.ts
import type Anthropic from "@anthropic-ai/sdk";
import type { GenerateContentResponseUsageMetadata } from "@google/genai";
import type OpenAI from "openai";

export interface NormalizedUsage {
  uncachedInput: number;
  cachedInput: number;
  cacheWrite: number;
  output: number; // includes reasoning tokens
  reasoning: number; // informational subset of output
}

export function fromOpenAIResponses(u: OpenAI.Responses.ResponseUsage): NormalizedUsage {
  const cached = u.input_tokens_details.cached_tokens;
  const writes = u.input_tokens_details.cache_write_tokens ?? 0;
  return {
    uncachedInput: Math.max(0, u.input_tokens - cached - writes),
    cachedInput: cached,
    cacheWrite: writes,
    output: u.output_tokens,
    reasoning: u.output_tokens_details.reasoning_tokens,
  };
}

export function fromChatCompletions(u: OpenAI.CompletionUsage): NormalizedUsage {
  const cached = u.prompt_tokens_details?.cached_tokens ?? 0;
  return {
    uncachedInput: u.prompt_tokens - cached,
    cachedInput: cached,
    cacheWrite: 0,
    output: u.completion_tokens,
    reasoning: u.completion_tokens_details?.reasoning_tokens ?? 0,
  };
}

export function fromAnthropic(u: Anthropic.Messages.Usage): NormalizedUsage {
  return {
    uncachedInput: u.input_tokens, // Anthropic reports cache reads and writes separately
    cachedInput: u.cache_read_input_tokens ?? 0,
    cacheWrite: u.cache_creation_input_tokens ?? 0,
    output: u.output_tokens,
    reasoning: 0,
  };
}

export function fromGemini(u: GenerateContentResponseUsageMetadata): NormalizedUsage {
  const cached = u.cachedContentTokenCount ?? 0;
  const thoughts = u.thoughtsTokenCount ?? 0;
  return {
    uncachedInput: (u.promptTokenCount ?? 0) - cached,
    cachedInput: cached,
    cacheWrite: 0,
    output: (u.candidatesTokenCount ?? 0) + thoughts,
    reasoning: thoughts,
  };
}

// Prices per million tokens, loaded from configuration and kept in sync with
// the provider's price list. Relative units work for comparisons.
export interface ModelPrice {
  input: number;
  cachedInput: number;
  cacheWrite: number;
  output: number;
}

export function loadPrices(json = process.env.MODEL_PRICES_JSON ?? "{}"): Map<string, ModelPrice> {
  return new Map(Object.entries(JSON.parse(json) as Record<string, ModelPrice>));
}

export function costOf(usage: NormalizedUsage, price: ModelPrice): number {
  return (
    (usage.uncachedInput * price.input +
      usage.cachedInput * price.cachedInput +
      usage.cacheWrite * price.cacheWrite +
      usage.output * price.output) /
    1_000_000
  );
}
```

```ts
// scripts/usage-demo.ts
import { costOf, fromAnthropic, fromOpenAIResponses, loadPrices } from "../src/ai/usage.js";

// Relative prices per million tokens: input 1, cached 0.1, cache write 1.25, output 5
const prices = loadPrices(
  JSON.stringify({ "taskflow-large": { input: 1, cachedInput: 0.1, cacheWrite: 1.25, output: 5 } }),
);
const price = prices.get("taskflow-large");
if (!price) throw new Error("no price configured");

// Usage shaped like the provider responses for the same Assistant call
const openai = fromOpenAIResponses({
  input_tokens: 2_000,
  input_tokens_details: { cached_tokens: 1_800, cache_write_tokens: 0 },
  output_tokens: 80,
  output_tokens_details: { reasoning_tokens: 0 },
  total_tokens: 2_080,
});
const anthropic = fromAnthropic({
  input_tokens: 200,
  cache_read_input_tokens: 1_800,
  cache_creation_input_tokens: 0,
  output_tokens: 80,
  cache_creation: null,
  inference_geo: null,
  output_tokens_details: null,
  server_tool_use: null,
  service_tier: "standard",
  speed: null,
});

for (const [name, usage] of Object.entries({ openai, anthropic })) {
  const units = costOf(usage, price) * 1_000_000;
  console.log(`${name.padEnd(9)} ${JSON.stringify(usage)} -> ${units} units`);
}
```

```text
# Output from a local run
openai    {"uncachedInput":200,"cachedInput":1800,"cacheWrite":0,"output":80,"reasoning":0} -> 780 units
anthropic {"uncachedInput":200,"cachedInput":1800,"cacheWrite":0,"output":80,"reasoning":0} -> 780 units
```

The two providers report the same call differently (OpenAI's
`input_tokens` includes the cached 1,800; Anthropic's excludes them), and
the normalized records agree. The price table lives in configuration, keyed
by the configured model alias, so no real prices or model IDs are
hard-coded.

### Recording cost per feature

```ts
// src/ai/cost-tracking.ts
import { Counter } from "prom-client";
import { costOf, type ModelPrice, type NormalizedUsage } from "./usage.js";

const tokens = new Counter({
  name: "taskflow_llm_tokens_total",
  help: "Model tokens by feature, model, and token type",
  labelNames: ["feature", "model", "type"] as const,
});
const cost = new Counter({
  name: "taskflow_llm_cost_units_total",
  help: "Model cost in price-table units by feature and model",
  labelNames: ["feature", "model"] as const,
});

export interface LlmCallRecord {
  feature: "assistant" | "project-qa" | "agent" | "meeting-summary";
  model: string;
  promptVersion: string;
  tenantHash: string; // hashed tenant id: logs and usage store only, never a metric label
  usage: NormalizedUsage;
  completed: boolean; // did the user get the outcome (task created, answer shown)?
}

export function recordLlmCall(record: LlmCallRecord, price: ModelPrice | undefined): void {
  const { feature, model, usage } = record;
  tokens.inc({ feature, model, type: "input_uncached" }, usage.uncachedInput);
  tokens.inc({ feature, model, type: "input_cached" }, usage.cachedInput);
  tokens.inc({ feature, model, type: "cache_write" }, usage.cacheWrite);
  tokens.inc({ feature, model, type: "output" }, usage.output);
  const units = price ? costOf(usage, price) : 0;
  cost.inc({ feature, model }, units);

  // One structured line per call: ids and numbers, never prompt or answer text
  console.info(
    JSON.stringify({
      event: "llm_usage",
      feature,
      model,
      promptVersion: record.promptVersion,
      tenantHash: record.tenantHash,
      ...usage,
      costUnits: units,
      completed: record.completed,
    }),
  );
}
```

```text
# PromQL: daily cost per feature, and cost per completed Assistant task
sum by (feature) (increase(taskflow_llm_cost_units_total[1d]))

sum(increase(taskflow_llm_cost_units_total{feature="assistant"}[1d]))
  / sum(increase(taskflow_assistant_tasks_created_total[1d]))
```

The second query divides cost by outcomes (a counter the Assistant
increments when a task is actually created), so retries and validation
failures show up as a higher cost per task. Per-tenant totals come from the
structured log lines or a daily usage collection in MongoDB, which also
feeds quota checks before each call. Metrics and dashboards are covered in
[metrics and dashboards](../../../../07-devops-and-deployment/07-devops-and-deployment/monitoring-and-logging/metrics-and-dashboards.md).

### A cascade for task creation

```ts
// src/ai/cascade.ts
export interface TaskDraft {
  title: string;
  dueDate: string | null;
  confidence: number; // the model's own 0-1 estimate, requested in the schema
}

export type Complete = (model: string, prompt: string) => Promise<string>;

function parseDraft(text: string): TaskDraft | null {
  try {
    const value = JSON.parse(text) as Partial<TaskDraft>;
    if (typeof value.title !== "string" || value.title.trim() === "") return null;
    if (value.dueDate !== null && typeof value.dueDate !== "string") return null;
    if (typeof value.confidence !== "number") return null;
    return { title: value.title, dueDate: value.dueDate ?? null, confidence: value.confidence };
  } catch {
    return null;
  }
}

// Try the small model; escalate when its output is invalid or unsure.
export async function draftTask(
  sentence: string,
  complete: Complete,
  models = { small: process.env.SMALL_MODEL ?? "", large: process.env.CHAT_MODEL ?? "" },
  minConfidence = 0.7,
): Promise<{ draft: TaskDraft; escalated: boolean }> {
  const prompt = `Extract a task as JSON {title, dueDate (ISO date or null), confidence}: ${sentence}`;

  const small = parseDraft(await complete(models.small, prompt));
  if (small && small.confidence >= minConfidence) return { draft: small, escalated: false };

  const large = parseDraft(await complete(models.large, prompt));
  if (!large) throw new Error("both models returned invalid task drafts");
  return { draft: large, escalated: true };
}
```

```ts
// scripts/cascade-demo.ts
import { draftTask, type Complete } from "../src/ai/cascade.js";

// A fake client: the small model is unsure about relative dates
const fake: Complete = async (model, prompt) =>
  model === "small" && /next/.test(prompt)
    ? JSON.stringify({ title: "Plan launch", dueDate: null, confidence: 0.4 })
    : JSON.stringify({ title: "Plan launch", dueDate: "2026-11-20", confidence: 0.9 });

const models = { small: "small", large: "large" };
for (const sentence of ["Plan the launch by 2026-11-20", "Plan the launch next Friday"]) {
  const { draft, escalated } = await draftTask(sentence, fake, models);
  console.log(`${escalated ? "large" : "small"}: ${JSON.stringify(draft)}`);
}
```

```text
# Output from a local run
small: {"title":"Plan launch","dueDate":"2026-11-20","confidence":0.9}
large: {"title":"Plan launch","dueDate":"2026-11-20","confidence":0.9}
```

The injected `complete` function keeps the router testable; in production
it wraps the provider SDK with structured output (see
[structured output and validation](../prompting-and-structured-output/structured-output-and-validation.md)).
Self-reported confidence is a weak signal, so calibrate the threshold on an
evaluation set and track the escalation rate per feature.

### Moving nightly summaries to the Batch API

```ts
// scripts/submit-summary-batch.ts
import { createReadStream, writeFileSync } from "node:fs";
import { CHAT_MODEL, llm } from "../src/ai/llm-client.js";

interface PendingNote {
  meetingId: string;
  notes: string;
}

export async function submitSummaryBatch(pending: PendingNote[]): Promise<string> {
  const lines = pending.map((note) =>
    JSON.stringify({
      custom_id: `meeting-${note.meetingId}`, // maps each result back to its meeting
      method: "POST",
      url: "/v1/responses",
      body: {
        model: CHAT_MODEL,
        instructions: "Summarize meeting notes in at most five bullets, then list action items.",
        input: note.notes,
        max_output_tokens: 400,
      },
    }),
  );
  const path = "/tmp/summary-batch.jsonl";
  writeFileSync(path, lines.join("\n") + "\n");

  const file = await llm.files.create({ file: createReadStream(path), purpose: "batch" });
  const batch = await llm.batches.create({
    input_file_id: file.id,
    endpoint: "/v1/responses",
    completion_window: "24h",
  });
  return batch.id; // store it; a scheduled job polls llm.batches.retrieve(id) and saves results
}
```

Each line is an ordinary request body, so the same prompt and limits apply
at half the price. The scheduled poller downloads the output file when the
batch completes, matches results by `custom_id`, and retries only the lines
that failed. Anthropic's Message Batches and Google's Batch API follow the
same shape with their own request formats.

## Best practices

- Record normalized usage for every model call, labeled by feature and
  model, with outcomes next to costs.
- Report cost per completed task per feature, not only total spend.
- Start optimization with the feature that dominates spend; it is often
  retrieval context, not the model.
- Put stable prompt content first and track cache hit ratios.
- Send asynchronous work through batch APIs or flex tiers.
- Route by feature first; add a cascade where evaluation shows a small
  model handles most cases.
- Cap outputs, retrieved context, conversation history, and agent steps.
- Keep price tables in configuration and update them when prices change.
- Enforce per-tenant budgets before the call and degrade gracefully.
- Self-host only when sustained utilization beats hosted per-token prices.

## In production

- **The bill doubled while traffic was flat.**
  *Detect:* input tokens per request rose after a release; cost by feature
  points at one feature. *Cause:* a prompt template or retrieval change
  added context to every call, or a cached prefix stopped matching. *Fix:*
  per-feature token dashboards with release annotations, a prompt-size
  check in CI, and cache hit ratio alerts.
- **One tenant consumed a large share of monthly spend.**
  *Detect:* per-tenant usage store shows one tenant far above its plan.
  *Cause:* an automated integration looping on the agent endpoint. *Fix:*
  per-tenant token quotas checked before each call, rate limits, and step
  caps on agents.
- **Reasoning model costs exceed estimates by a wide margin.**
  *Detect:* output tokens per call far above visible answer length;
  `reasoning_tokens` large. *Cause:* hidden reasoning billed as output, at a
  high default effort. *Fix:* lower reasoning effort for simple features,
  route them to non-reasoning models, and include reasoning tokens in
  dashboards.
- **The cascade saved nothing.**
  *Detect:* escalation rate above 70%; latency up. *Cause:* the small model
  is not good enough for this feature, or the confidence threshold is too
  strict. *Fix:* evaluate per feature, route that feature directly to the
  large model, or distill a better small model.
- **A response cache returned another customer's data.**
  *Detect:* support report of foreign task names in an answer. *Cause:* the
  cache key omitted the tenant and permission scope. *Fix:* include tenant,
  permission scope, model, prompt version, and data version in the key;
  purge the cache; add a test that two tenants never share entries.
- **The batch job silently left meetings without summaries.**
  *Detect:* summaries missing for some meetings; batch status shows partial
  failures or expiry. *Cause:* failed lines were never retried, or the
  batch expired after 24 hours. *Fix:* reconcile by `custom_id`, retry
  failed lines, and alert when a batch expires.

## Important terminology

- **Input, cached input, and output tokens:** The token classes providers
  bill at different rates.
- **Reasoning tokens:** Hidden tokens a reasoning model generates before
  answering; billed as output.
- **Cost per completed task:** Spend divided by successful user outcomes,
  including retries and failures.
- **Prompt caching:** Provider-side reuse of a repeated prompt prefix at a
  discounted input price.
- **Response cache:** Your own store of full answers for identical requests.
- **Semantic cache:** Reusing answers for similar, not identical, requests.
- **Batch API:** Asynchronous, discounted processing of many requests.
- **Cascade:** Trying a cheap model first and escalating on failure.
- **Router:** Logic or a model that picks which model handles a request.
- **Distillation:** Training a small model to imitate a large model on a
  task.
- **Utilization:** The share of a GPU's capacity actually used; drives
  self-hosted cost per token.

## Common mistakes and misconceptions

- Tracking total spend but not spend per feature and per completed task.
- Assuming input tokens dominate; output and reasoning tokens often do.
- Comparing providers' "input tokens" without normalizing cache accounting.
- Putting tenant ids in metric labels.
- Caching full responses without tenant and permission scope in the key.
- Running offline jobs at interactive prices.
- Building a learned router before trying per-feature routing.
- Believing self-hosting is cheaper regardless of utilization.

## Revision questions

1. Write the cost of a request in terms of token classes and prices. Which
   class does each provider's usage object report, and how do they differ?
2. A feature sends 3,000 input tokens (2,500 cached) and receives 200
   output tokens. In units of input 1, cached 0.1, output 5, what does one
   call cost, and what without caching? (500 + 250 + 1,000 = 1,750; 3,000 +
   1,000 = 4,000.)
3. Why should you estimate tokens before a call and record usage after it?
4. Compare provider prompt caching, an exact response cache, and a semantic
   cache.
5. A cascade escalates 40% of requests from a small model (1 unit) to a
   large one (10 units). What is the expected cost per request, and when
   does a cascade stop paying off? (1 + 0.4 x 10 = 5 units; when escalation
   approaches 90%, the cascade costs as much as always using the large
   model.)
6. Which TaskFlow work belongs in a batch API, and what does it trade away?
7. Why must tenant ids stay out of Prometheus labels, and where should
   per-tenant usage go instead?
8. A GPU sustains 3.6 million tokens per hour at full load. How does its
   cost per token change between 60% and 15% utilization? (It becomes 4
   times higher.)

## Further learning

- [OpenAI: Cost optimization](https://developers.openai.com/api/docs/guides/cost-optimization)
- [OpenAI: Batch API](https://developers.openai.com/api/docs/guides/batch)
- [OpenAI: Flex processing](https://developers.openai.com/api/docs/guides/flex-processing)
- [Anthropic: Batch processing](https://platform.claude.com/docs/en/build-with-claude/batch-processing)
- [Gemini API: Batch API](https://aistudio.google.com/docs/batch-api)
- [OpenTelemetry GenAI semantic conventions](https://github.com/open-telemetry/semantic-conventions-genai)
- [gpt-tokenizer](https://github.com/niieani/gpt-tokenizer)
- [Prompt caching and batch processing](../hosted-model-apis/prompt-caching-and-batch-processing.md)
  and [choosing models and providers](../hosted-model-apis/choosing-models-and-providers.md)
- Next: [GPU capacity and scaling](gpu-capacity-and-scaling.md). Back to the [deployment cost and performance overview](../deployment-cost-and-performance.md).
