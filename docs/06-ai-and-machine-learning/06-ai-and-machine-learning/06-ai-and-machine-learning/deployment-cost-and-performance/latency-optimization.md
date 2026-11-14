# Latency Optimization

An LLM feature feels slow for one of two reasons: nothing appears for a
long time, or text appears and then takes ages to finish. Those are
different problems with different fixes. This lesson splits a request's
latency into its parts (network, queueing, prefill, and decode), defines
the metrics that separate them (time to first token, time per output token,
end-to-end latency), and works through the levers in order of how often
they matter: generating fewer tokens, sending fewer and more cacheable
input tokens, streaming, making fewer and parallel calls, choosing smaller
or faster models, placing compute near users, and, for self-hosted models,
speculative decoding and engine settings.

The running examples are TaskFlow's features: the Assistant that turns a
sentence into a task, project Q&A over documents, the agent that updates
tasks through tools, and meeting-notes summaries. Each has a different
latency profile, so each gets a different mix of fixes.

## Why it matters

Users judge an interactive feature by how quickly something useful appears.
A meeting summary that starts streaming after half a second feels fast even
if it finishes eight seconds later; a task-creation call that shows a
spinner for four seconds feels broken, even though it produced only fifty
tokens. Knowing which part of the request dominates tells you whether to
stream, trim the prompt, shorten the answer, or pick another model.

Latency also compounds. An agent that makes five sequential model calls,
each with a two-second answer, takes ten seconds before any tool result
reaches the user. A RAG answer that embeds the query, searches, reranks, and
then generates pays every step in series unless some run in parallel. And
tail latency matters more than the average: if 5% of Assistant calls take
twelve seconds, many users see one of them in a session.

Finally, latency and cost are coupled. Output tokens cost the most money
and the most time, so many latency fixes (shorter answers, smaller models,
cached prefixes) also cut the bill, which is covered in
[cost optimization for LLM apps](cost-optimization-for-llm-apps.md).

## Real-world usage

- **OpenAI latency guide.** The
  [latency optimization guide](https://developers.openai.com/api/docs/guides/latency-optimization)
  organizes the work into seven principles: "Process tokens faster.
  Generate fewer tokens. Use fewer input tokens. Make fewer requests.
  Parallelize. Make your users wait less." and "Don't default to an LLM."
  It notes that "a long prompt can delay the first token, especially when
  much of the input is new".
- **OpenAI prompt caching.** The
  [prompt caching guide](https://developers.openai.com/api/docs/guides/prompt-caching)
  lists among the benefits to "reduce the time spent processing input
  before the response starts", states that prompt caching is enabled by
  default for supported models, and that caches "cannot be reused across
  regional processing boundaries".
- **Speculative decoding.** Leviathan, Kalman, and Matias,
  [Fast Inference from Transformers via Speculative Decoding](https://arxiv.org/abs/2211.17192),
  show that a small draft model's guesses can be verified by the large
  model in parallel, reporting "a 2X-3X acceleration compared to the
  standard T5X implementation, with identical outputs".
- **vLLM speculative decoding.** The
  [vLLM guide](https://docs.vllm.ai/en/latest/features/speculative_decoding/)
  positions the feature for reducing "inter-token latency under
  medium-to-low QPS (queries per second), memory-bound workloads", and
  ranks model-based methods (EAGLE, MTP, draft models) above simpler n-gram
  and suffix methods for latency.
- **Disaggregated serving.** The DistServe paper,
  [Disaggregating Prefill and Decoding for Goodput-optimized Large Language Model Serving](https://arxiv.org/abs/2401.09670),
  shows that running prefill and decode on the same GPUs makes them
  interfere, and that separating them lets a system meet time-to-first-token
  and time-per-output-token targets at higher load.

**Popular tools and providers:** streaming in every provider SDK; prompt
caching at OpenAI, Anthropic, and Google; priority or fast service tiers at
hosted providers; regional and global endpoints at cloud AI platforms;
vLLM and SGLang for self-hosted speculative decoding and chunked prefill;
OpenTelemetry and Prometheus for measuring each stage.

## How it works

### Where the time goes

![Diagram: two to-scale timelines of the same meeting-notes summary; before optimization, about 0.1 s of network, 0.2 s of queueing, and 0.9 s of prefill for a long prompt put the first token at 1.2 s, then 399 more tokens at 40 tokens per second take 10 s, for 11.2 s in total; after optimization, a cached prefix and smaller context cut prefill to 0.3 s so the first token arrives at 0.6 s, and a five-bullet limit cuts output to 150 tokens, so decoding takes 3.7 s and the request ends at 4.3 s; decode time dominates both runs, and streaming lets the user read from the first token.](llm-latency-waterfall.svg)

One request to a model passes through these stages:

| Stage | What happens | Grows with | Typical lever |
|---|---|---|---|
| Network and TLS | Connect, send the prompt, receive bytes | Distance, new connections | Keep-alive, nearby region |
| Queueing | Wait for a provider or GPU slot | Load, rate limits, capacity | Capacity, priority tiers, fewer requests |
| Prefill | Process every input token, produce the first token | Input tokens not already cached | Shorter prompts, prompt caching |
| Decode | Generate the remaining tokens one by one | Output tokens (and reasoning tokens) | Fewer output tokens, faster models, speculative decoding |
| Application work | Retrieval, tool calls, validation, rendering | Number of sequential steps | Parallel calls, fewer round trips |

Two derived numbers describe most of it:

```text
TTFT  (time to first token)   = network + queue + prefill
TPOT  (time per output token) = average gap between tokens after the first
end-to-end latency            = TTFT + (output tokens - 1) x TPOT

Meeting summary, before: TTFT 1.2 s, 400 output tokens at 40 tokens/s (TPOT 25 ms)
  1.2 s + 399 x 0.025 s = 11.2 s
After: cached prefix and less context (TTFT 0.6 s), five bullets (150 tokens)
  0.6 s + 149 x 0.025 s = 4.3 s
```

The arithmetic explains the most common surprise: for answers longer than a
few sentences, decode time dominates. Halving the prompt improves TTFT;
halving the answer halves the whole request.

### The metrics to collect

| Metric | Measures | Where |
|---|---|---|
| TTFT | Time until the first token arrives | Client side, per request |
| TPOT, also called inter-token latency (ITL) | Smoothness of streaming | Client or engine metrics |
| Output tokens per second, per stream | How fast one user's text appears | Client side |
| Aggregate tokens per second | Throughput of a server or account | Engine metrics, provider dashboards |
| End-to-end latency | What the user waited in total | Client and backend traces |
| Queue time | Waiting before processing starts | Engine metrics (`vllm:request_queue_time_seconds`) |

Measure percentiles (p50, p95, p99), split by feature and by model, and
measure both at the client and at the server: a fast server with a slow
client connection or a blocking retrieval step still feels slow. Per-stream
speed and aggregate throughput move in opposite directions under load,
because a server that admits more concurrent streams gives each one a
smaller share of every decode step. Tracing each stage is covered in
[LLM observability and tracing](../evaluation-and-monitoring/llm-observability-and-tracing.md).

### Generate fewer tokens

Output tokens are the most expensive part of a request in time and money,
so start here:

- **Ask for the length the UI needs.** "Return five bullets" or "reply with
  one sentence" shortens answers more reliably than hoping.
- **Set an output limit** (`max_output_tokens` in OpenAI's Responses API,
  `max_tokens` in Chat Completions-style servers and the Anthropic Messages
  API). It caps the worst case, though a capped answer is truncated, so
  check the finish reason.
- **Keep structured output compact.** Task creation needs a small JSON
  object, not prose around it; short field names and no echoed input save
  tokens on every call (see
  [structured output and validation](../prompting-and-structured-output/structured-output-and-validation.md)).
- **Control reasoning.** Reasoning models generate hidden reasoning tokens
  before the answer; they cost time even though the user never sees them.
  Use a lower reasoning effort for simple tasks, as described in
  [reasoning models and thinking](../prompting-and-structured-output/reasoning-models-and-thinking.md).

### Send fewer, more cacheable input tokens

Prefill time grows with the input tokens that must be processed. Two
levers apply:

1. **Send less.** Retrieve fewer, better passages for project Q&A, trim old
   conversation turns, and strip markup the model does not need.
2. **Make the rest cacheable.** Hosted providers and self-hosted engines
   reuse the work for a prompt prefix they have seen recently. Put stable
   content first (instructions, tool definitions, shared documents) and the
   variable part last, and keep the stable part byte-for-byte identical. A
   timestamp in the first line of the system prompt defeats caching for
   every request.

Provider details differ and change; check the current documentation:

| Provider | How caching is triggered (November 2026) | How to see hits |
|---|---|---|
| OpenAI | Automatic for supported models; minimum 1,024 input tokens on recent models | `usage.input_tokens_details.cached_tokens` |
| Anthropic | A top-level `cache_control` field (automatic) or explicit breakpoints (up to 4); 5-minute default lifetime, optional 1 hour | `usage.cache_read_input_tokens` |
| Google Gemini API | Implicit caching on by default for Gemini 2.5 and newer; explicit caches on some models | `usageMetadata.cachedContentTokenCount` |
| vLLM, SGLang | Automatic prefix caching (vLLM default on) | `vllm:prefix_cache_hits`, `vllm:prefix_cache_queries` |

Caching affects cost as well as latency, which
[prompt caching and batch processing](../hosted-model-apis/prompt-caching-and-batch-processing.md)
covers in depth.

### Stream to cut perceived latency

Streaming sends tokens as they are generated (server-sent events for most
providers). It does not make the model faster; it moves the moment the user
sees something from the end of the request to the first token. For the
meeting summary above, that is 0.6 s instead of 4.3 s. Stream any answer a
person reads; do not bother for calls whose output is parsed as a whole,
such as task-creation JSON, unless you parse partial output deliberately.
The backend relay is covered in
[streaming responses end to end](../hosted-model-apis/streaming-responses-end-to-end.md)
and the UI side in
[frontend patterns for AI features](../building-ai-applications/frontend-patterns-for-ai-features.md).

### Make fewer requests, and run independent ones in parallel

![Diagram: two timelines for answering a project question; sequentially, a document search of 1.2 s, an open-tasks lookup of 0.8 s, a permission check of 0.3 s, and a streamed model call with a 0.6 s time to first token and 1.9 s of decoding take 4.8 s, with the first visible text at 2.9 s; in parallel, the three lookups start together and finish when the slowest, the 1.2 s search, ends, so the model call starts at 1.2 s, the first text appears at 1.8 s, and the answer ends at 3.7 s; only steps with no data dependency can overlap.](sequential-vs-parallel-calls.svg)

Every sequential step adds its full latency. Two habits remove most of it:

- **Combine steps** when one call has all the information it needs. A
  separate "rewrite the question" call before every search costs a whole
  round trip; folding it into the main call, or skipping it for short
  questions, often works as well.
- **Run independent work concurrently.** Retrieval, a user-profile lookup,
  and a permission check do not depend on each other, so they can start
  together. Bound the concurrency so a burst does not exhaust connection
  pools or provider rate limits.

Agents need special care: each tool round trip is another model call.
Allowing parallel tool calls, giving tools coarse operations ("create
these three tasks") instead of fine ones, and capping the number of steps
keep agent latency predictable (see
[agent orchestration patterns](../tool-calling-and-agents/agent-orchestration-patterns.md)).

### Smaller, faster models and tiers

A smaller model has fewer weights to read per token, so it decodes faster
and usually starts faster. For classification, routing, extraction, and
short task creation, a small model is often as accurate as a large one for
a fraction of the latency; measure it on an evaluation set before
switching. Routing between models is covered in
[cost optimization for LLM apps](cost-optimization-for-llm-apps.md).

Hosted providers also sell processing tiers. OpenAI's `service_tier`
parameter, for example, accepts `priority` (or `fast`) for faster, more
expensive processing and `flex` for slower, cheaper processing with
occasional unavailability. Use a fast tier only for the few
latency-critical paths that justify the price.

### Regional placement

Network distance adds a floor that no model change removes: light in fiber
covers about 200 km per millisecond, so a backend in Europe calling a model
endpoint in North America pays at least 50-60 ms per round trip before any
processing, and realistic routes add more. An agent that makes eight
sequential calls pays that eight times. Options:

- **Put the backend next to the model endpoint.** Most latency-sensitive
  traffic is backend-to-model, not browser-to-backend, and an agent
  multiplies it.
- **Use the provider's regional or global endpoints deliberately.** Azure's
  Microsoft Foundry offers global, data zone, and regional deployment
  types;
  Amazon Bedrock offers cross-Region inference profiles for a geography or
  globally; Google Cloud offers regional endpoints and a global endpoint
  that "provide higher availability and reliability than single regions";
  Anthropic's API lets you set `inference_geo` per request. Global options
  usually improve capacity and availability but do not guarantee where data
  is processed, so check data residency rules first.
- **Keep connections warm.** SDK clients reuse HTTP connections; creating a
  new client per request pays a fresh TCP and TLS handshake each time.
- **Self-hosted:** run GPUs in the region where the backend runs, and use
  [global traffic management](../../../../08-devops-and-deployment/08-devops-and-deployment/load-balancing-and-multi-server/global-traffic-management.md)
  when users are spread across continents.

### Speculative decoding

![Diagram: a small draft model proposes four tokens, "is", "due", "on", and "Monday"; the large target model checks all four in one forward pass, accepts "is", "due", and "on", rejects "Monday", and supplies its own token "Friday" in its place, so one target pass yields four tokens instead of one; with a per-token acceptance rate of 0.7 and four drafted tokens, the expected yield is about 2.8 tokens per target pass, and the output distribution matches the target model's.](speculative-decoding-steps.svg)

Decode is memory-bound: verifying several proposed tokens in one forward
pass costs about the same as generating one. Speculative decoding exploits
that. A cheap proposer (a small draft model, extra prediction heads, or an
n-gram lookup in the prompt) guesses the next k tokens; the target model
scores them all at once and keeps the longest prefix it agrees with, then
adds one token of its own. With the right acceptance rule the output
follows the target model's distribution, so quality does not change.

```text
Expected tokens per target pass, with acceptance rate a and k drafted tokens
(from Leviathan and colleagues):
  (1 - a^(k+1)) / (1 - a)

a = 0.7, k = 4:  (1 - 0.7^5) / 0.3 = (1 - 0.168) / 0.3 = 2.77 tokens per pass
a = 0.3, k = 4:  (1 - 0.3^5) / 0.7 = 1.42 tokens per pass, minus the drafting cost
```

It helps most when the server is lightly loaded (decode steps are not
already full of other users' work) and when the output is predictable, such
as code edits or answers that copy text from the prompt. Under heavy load
the extra verification work competes with other requests, which is why
vLLM recommends it for low to medium QPS. Hosted providers apply such
techniques internally; OpenAI exposes a related feature, Predicted Outputs,
for edits where most of the output is known in advance. It is supported
only on some model families, and rejected prediction tokens are still
billed as output.

### Engine settings for self-hosted models

On vLLM or SGLang, a few settings trade time to first token against
smoothness and throughput:

- **Chunked prefill and `--max-num-batched-tokens`.** Smaller chunks keep
  other users' streams smooth while a long prompt is read; larger chunks
  give that prompt a faster first token.
- **`--max-num-seqs`.** More concurrent sequences raise throughput and slow
  each stream; fewer do the opposite.
- **Prefix caching** (on by default in vLLM) shortens TTFT for shared
  prefixes.
- **Quantized weights and an FP8 cache** reduce the bytes read per decode
  step, which speeds up memory-bound decoding; see
  [GPU capacity and scaling](gpu-capacity-and-scaling.md).

## When to use and when not to use

| Symptom | Technique | Watch out for |
|---|---|---|
| Blank screen for seconds, then fast text | Shorter or cached prompt, streaming, a nearby region | Caching needs an identical prefix |
| Text starts fast but finishes slowly | Fewer output tokens, smaller or faster model | Truncated answers if limits are too tight |
| Agent takes many seconds before acting | Fewer steps, parallel tool calls, coarse tools | Parallel side effects need idempotency |
| Several independent lookups before the model call | Run them concurrently with a limit | Rate limits and connection pools |
| Only a few critical paths are too slow | A priority or fast tier for those paths | It costs more per token |
| Self-hosted, low load, predictable output | Speculative decoding | Gains shrink or reverse at high load |
| Self-hosted, many users, long prompts | Chunked prefill tuning, more replicas | Trading one user's TTFT for others' smoothness |
| Output parsed as a whole (task JSON) | Do not stream; shrink the output instead | Partial JSON is not useful to users |

## Practical examples

### Measuring TTFT and tokens per second

```ts
// scripts/measure-latency.ts
import { CHAT_MODEL, llm } from "../src/ai/llm-client.js";

interface Sample {
  ttftMs: number;
  totalMs: number;
  outputTokens: number;
  tokensPerSecond: number;
}

async function measureOnce(prompt: string): Promise<Sample> {
  const started = performance.now();
  let firstTokenAt: number | undefined;
  let outputTokens = 0;

  const stream = await llm.chat.completions.create({
    model: CHAT_MODEL,
    messages: [{ role: "user", content: prompt }],
    max_tokens: 300,
    stream: true,
    stream_options: { include_usage: true }, // the last chunk carries token usage
  });

  for await (const chunk of stream) {
    if (firstTokenAt === undefined && chunk.choices[0]?.delta?.content) {
      firstTokenAt = performance.now();
    }
    if (chunk.usage) outputTokens = chunk.usage.completion_tokens;
  }

  const ended = performance.now();
  const first = firstTokenAt ?? ended;
  const decodeSeconds = (ended - first) / 1000;
  return {
    ttftMs: first - started,
    totalMs: ended - started,
    outputTokens,
    tokensPerSecond: outputTokens > 1 && decodeSeconds > 0 ? (outputTokens - 1) / decodeSeconds : 0,
  };
}

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index] ?? Number.NaN;
}

const prompt =
  process.argv[2] ??
  "Summarize these meeting notes in five bullets: Ana will draft the release notes by Friday.";
const runs = Number(process.env.RUNS ?? 20);
const samples: Sample[] = [];
for (let i = 0; i < runs; i += 1) samples.push(await measureOnce(prompt));

for (const key of ["ttftMs", "totalMs", "tokensPerSecond"] as const) {
  const values = samples.map((s) => s[key]);
  console.log(
    `${key.padEnd(16)} p50=${percentile(values, 50).toFixed(0)} p95=${percentile(values, 95).toFixed(0)}`,
  );
}
```

```text
# Output from a run against a local OpenAI-compatible stub server configured
# for about 30 ms of prefill and 20 ms per token (Windows timers stretch the
# 20 ms sleeps); real numbers depend on the model, hardware, and load
ttftMs           p50=47 p95=49
totalMs          p50=635 p95=668
tokensPerSecond  p50=32 p95=33
```

- The first chunk with text marks TTFT; chunks before it can carry only a
  role or nothing.
- `stream_options.include_usage` makes OpenAI-compatible servers send a
  final chunk with token counts, so tokens per second uses real counts
  rather than chunk counts (one chunk can hold several tokens).
- The script runs requests one at a time, so it measures latency without
  load. Latency under concurrent load is a load test; see
  [load testing with k6](../../../../08-devops-and-deployment/08-devops-and-deployment/performance-and-reliability-testing/load-testing-with-k6.md).
- Point the same script at the hosted API and at a self-hosted server by
  changing `LLM_BASE_URL`, and compare like with like: same prompt, same
  output limit.

### Running independent calls in parallel with a limit

```ts
// src/ai/parallel.ts
// Run fn over items with at most `limit` calls in flight; keeps result order.
export async function mapWithLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;

  async function worker(): Promise<void> {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await fn(items[index] as T, index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}
```

```ts
// scripts/parallel-demo.ts
// Three independent lookups before a project Q&A answer, run two ways.
import { mapWithLimit } from "../src/ai/parallel.js";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const lookups = [
  { name: "search project docs", ms: 120 },
  { name: "list open tasks", ms: 80 },
  { name: "check permissions", ms: 30 },
];

let started = performance.now();
for (const lookup of lookups) await sleep(lookup.ms);
console.log(`sequential: ${Math.round(performance.now() - started)} ms`);

started = performance.now();
await mapWithLimit(lookups, 3, (lookup) => sleep(lookup.ms));
console.log(`parallel:   ${Math.round(performance.now() - started)} ms`);
```

```text
# Output from a local run
sequential: 257 ms
parallel:   135 ms
```

The parallel version finishes when the slowest lookup does. In real code
each lookup should also carry a timeout (`AbortSignal.timeout(ms)` passed to
`fetch` or the SDK call), so one slow dependency cannot stall the whole
answer.

### Laying out a prompt for caching and checking hits

```ts
// src/ai/project-qa.ts
import { CHAT_MODEL, llm } from "./llm-client.js";

// Stable for every request: identical text first, so the provider can reuse it.
const QA_INSTRUCTIONS = [
  "You answer questions about one TaskFlow project.",
  "Use only the passages provided. Cite passage ids like [p3].",
  "If the passages do not contain the answer, say so in one sentence.",
].join("\n");

export async function answerProjectQuestion(question: string, passages: string[]) {
  const response = await llm.responses.create({
    model: CHAT_MODEL,
    instructions: QA_INSTRUCTIONS, // stable prefix
    input: [
      { role: "user", content: `Passages:\n${passages.join("\n\n")}` },
      { role: "user", content: `Question: ${question}` }, // variable part last
    ],
    max_output_tokens: 300,
  });

  const cached = response.usage?.input_tokens_details.cached_tokens ?? 0;
  const input = response.usage?.input_tokens ?? 0;
  console.info({ feature: "project-qa", input, cached, hitRatio: input ? cached / input : 0 });
  return response.output_text;
}
```

This uses OpenAI's Responses API; vLLM also serves `/v1/responses`. Watch
the hit ratio per feature: a sudden drop after a deploy usually means
someone put changing text (a date, a request id, a shuffled list) into the
stable prefix. With Anthropic, mark the end of the stable part with a
`cache_control` breakpoint; with Gemini, implicit caching works the same
way for long, identical prefixes.

### Turning on speculative decoding in vLLM

```bash
# n-gram speculation: proposes tokens by matching earlier text in the prompt.
# Cheap to enable; best when answers copy from the input (edits, extraction).
vllm serve "$MODEL_ID" --served-model-name taskflow-chat \
  --speculative-config '{"method": "ngram", "num_speculative_tokens": 4, "prompt_lookup_min": 2, "prompt_lookup_max": 5}'

# Compare inter-token latency and acceptance before and after, at your real load
curl -s http://127.0.0.1:8000/metrics \
  | grep -E "^vllm:(inter_token_latency_seconds_(sum|count)|spec_decode_)"
```

Benchmark at the load you actually run. If acceptance is low or the server
is busy, speculation adds verification work without saving steps; switch
to a model-based method (EAGLE or MTP where the model supports it) or turn
it off.

## Best practices

- Measure TTFT, TPOT, and end-to-end latency per feature at p50 and p95
  before changing anything.
- Shorten outputs first: explicit length instructions, output limits, and
  compact structured output.
- Keep prompts lean and put stable content first; watch cache hit ratios
  after every deploy.
- Stream answers people read; do not stream output you parse as a whole.
- Remove sequential round trips, and run independent lookups concurrently
  with a limit and timeouts.
- Use a small model where an evaluation shows it is good enough.
- Place the backend near the model endpoint and reuse SDK clients.
- Reserve priority tiers for the few paths that need them.
- On self-hosted engines, tune chunked prefill and concurrency against
  measured TTFT and TPOT targets; try speculative decoding at low load.
- Budget latency per feature (for example "first text in 1 s, done in 6 s")
  and alert on p95, not the average.

## In production

- **The Assistant got slower after a prompt change, with no traffic
  change.** *Detect:* TTFT p50 doubled after a deploy; cached tokens per
  request fell to zero. *Cause:* a timestamp or per-user detail moved into
  the top of the instructions, so the prefix no longer matches. *Fix:* move
  variable content after the stable prefix and alert on cache hit ratio.
- **Meeting summaries take twenty seconds.** *Detect:* output tokens per
  request are far above the UI's needs; TTFT is normal. *Cause:* no length
  instruction or output limit, so the model writes long summaries. *Fix:*
  ask for a fixed format and length, set an output limit, and check the
  finish reason.
- **Agent runs feel stuck before the first visible action.** *Detect:*
  traces show five or more sequential model calls before the first tool
  result. *Cause:* fine-grained tools and a planning call on every step.
  *Fix:* coarser tools, parallel tool calls, a step cap, and streaming a
  status update early.
- **Latency is fine in tests but p95 explodes at peak.** *Detect:* queue
  time or provider rate-limit errors rise with traffic; per-request
  processing time is flat. *Cause:* capacity or quota exhaustion, made
  worse by retries. *Fix:* request higher limits or add replicas, cap
  concurrency per feature, and retry with backoff and jitter.
- **Self-hosted streams stutter whenever someone uploads a long
  document.** *Detect:* inter-token latency spikes coincide with long
  prompts. *Cause:* large prefill work shares decode steps with everyone.
  *Fix:* smaller prefill chunks (`--max-num-batched-tokens`), a separate
  pool for long-document work, or more replicas.
- **Speculative decoding made things slower.** *Detect:* higher
  inter-token latency at peak after enabling it; low acceptance metrics.
  *Cause:* busy server and unpredictable output, so verification work is
  wasted. *Fix:* disable it at high load or switch to a better-matched
  method; benchmark at real concurrency.

## Important terminology

- **TTFT (time to first token):** Time from sending a request to receiving
  the first output token.
- **TPOT / ITL (time per output token, inter-token latency):** The average
  gap between output tokens after the first.
- **End-to-end latency:** Total time until the last token and any
  application work finish.
- **Prefill:** Processing the input tokens; sets most of TTFT.
- **Decode:** Generating output tokens one at a time; sets most of the rest.
- **Prompt caching:** Reusing processed work for a repeated prompt prefix.
- **Streaming:** Sending tokens to the client as they are generated.
- **Speculative decoding:** Drafting several tokens cheaply and verifying
  them in one pass of the large model.
- **Acceptance rate:** The share of drafted tokens the target model keeps.
- **Service tier:** A provider option that trades price for speed or
  availability.
- **Tail latency:** High percentiles (p95, p99) of the latency
  distribution.

## Common mistakes and misconceptions

- Optimizing the prompt when the answer length is the real cost.
- Believing streaming makes generation faster.
- Reporting average latency instead of percentiles.
- Putting dates or request ids at the top of a cached prompt.
- Chaining calls that do not depend on each other.
- Assuming a bigger model is needed for every feature.
- Enabling speculative decoding without benchmarking at real load.
- Creating a new SDK client per request and paying new handshakes.

## Revision questions

1. Define TTFT and TPOT. Which stages of a request does each include?
2. A request has a TTFT of 0.8 s and generates 600 tokens at 50 tokens per
   second. What is its end-to-end latency, and what is it if the answer is
   cut to 200 tokens? (0.8 + 599 x 0.02 = 12.8 s; 0.8 + 199 x 0.02 = 4.8 s.)
3. Why does prompt caching need an identical prefix, and how should a
   prompt be laid out to benefit from it?
4. When does streaming help, and when is it pointless?
5. Three independent lookups take 400 ms, 250 ms, and 900 ms before a model
   call. What do you save by running them in parallel? (Sequential 1,550 ms;
   parallel 900 ms; saving 650 ms.)
6. Explain speculative decoding and why its output matches the target
   model. With an acceptance rate of 0.8 and 3 drafted tokens, how many
   tokens does one target pass yield on average? ((1 - 0.8^4) / 0.2 = 2.95.)
7. Why can speculative decoding hurt at high load?
8. How does regional placement affect an agent that makes many sequential
   model calls?

## Further learning

- [OpenAI: Latency optimization](https://developers.openai.com/api/docs/guides/latency-optimization)
- [OpenAI: Prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching)
- [OpenAI: Predicted Outputs](https://developers.openai.com/api/docs/guides/predicted-outputs)
- [Anthropic: Prompt caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)
- [Gemini API: Context caching](https://aistudio.google.com/docs/caching)
- [vLLM: Speculative decoding](https://docs.vllm.ai/en/latest/features/speculative_decoding/)
- [Chen and colleagues: Accelerating Large Language Model Decoding with Speculative Sampling](https://arxiv.org/abs/2302.01318)
- [Li and colleagues: EAGLE](https://arxiv.org/abs/2401.15077)
- Next: [cost optimization for LLM apps](cost-optimization-for-llm-apps.md). Back to the [deployment cost and performance overview](../deployment-cost-and-performance.md).
