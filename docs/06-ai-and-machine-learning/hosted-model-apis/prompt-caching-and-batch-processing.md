# Prompt Caching and Batch Processing

Two provider features cut the cost of model calls without changing the
model or the answer. **Prompt caching** lets the provider reuse the work
it already did on a prompt prefix it has seen recently, so TaskFlow's
project-knowledge Q&A does not pay full price for the same 20,000 tokens
of project documents on every question. **Batch processing** accepts a
file of requests, runs them asynchronously within a day, and charges
much less, which suits TaskFlow's nightly project digests and evaluation
runs. This lesson explains how each provider implements caching
(automatic prefix caching versus explicit cache breakpoints), how to
structure prompts so the cache actually hits, how batch APIs work, and
when to use each one.

Costs on this page are relative ("cheaper", "a fraction of the input
price"); provider price lists change and are linked at the end. Wider
cost strategy is covered in
[cost optimization for LLM apps](../deployment-cost-and-performance/cost-optimization-for-llm-apps.md).

## Why it matters

For many applications, input tokens dominate the bill. A retrieval
question sends instructions, tool definitions, retrieved documents, and
the conversation so far, often thousands of tokens, to get a few hundred
tokens back. Agents are worse: every step resends the whole growing
transcript. Most of that input is identical from one request to the next.
Prompt caching turns that repetition into savings and also shortens time
to first token, because the provider skips recomputing the cached prefix.

Caching only works if the prefix is byte-for-byte identical. One
timestamp in the instructions, one reordered tool definition, or one
rewritten earlier turn makes every request a miss, and nothing in the
response tells you so unless you read the usage fields. Teams regularly
"enable caching" and see no change because of a single volatile line.

Batch APIs address a different waste: paying interactive prices and
competing for interactive rate limits with work nobody is waiting for.
Nightly summaries, backfills, re-classification of old tasks, and
evaluation runs can all wait hours. Moving them to a batch API makes them
substantially cheaper and keeps them from eating the rate limit the
TaskFlow Assistant needs during the day.

## Real-world usage

- **Anthropic prompt caching.** The
  [prompt caching guide](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)
  offers automatic caching (one top-level `cache_control` field) and
  explicit breakpoints on content blocks, a 5-minute lifetime refreshed on
  every use or a 1-hour lifetime at a higher write price, cache reads at a
  small fraction of the input price, and a prefix that always runs tools,
  then system, then messages.
- **OpenAI prompt caching.** The
  [prompt caching guide](https://developers.openai.com/api/docs/guides/prompt-caching)
  describes caching that works with no code changes, plus implicit and
  explicit breakpoint modes, 30-minute and 12-hour lifetimes, and a
  1,024-token minimum on GPT-5.6 and later models. It includes a
  break-even formula for deciding whether to pad a short prefix up to the
  minimum.
- **Gemini context caching.** The
  [caching page](https://aistudio.google.com/docs/caching) explains that
  implicit caching is on by default for Gemini 2.5 and newer models with
  no guaranteed savings, while explicit caches (on Gemini 3 and 2.5 models
  through `generateContent`) guarantee the discount but add a storage
  charge for their lifetime.
- **Batch APIs at about half price.** OpenAI's
  [Batch API guide](https://developers.openai.com/api/docs/guides/batch)
  (a 50% discount, separate higher rate limits, completion within 24
  hours), Anthropic's
  [batch processing guide](https://platform.claude.com/docs/en/build-with-claude/batch-processing)
  (50% off, most batches done within an hour, discounts that stack with
  caching), and Gemini's
  [Batch API page](https://aistudio.google.com/docs/batch-api) (50% of the
  standard cost, a 24-hour target) describe the same trade: wait longer,
  pay less.

**Popular tools and providers:** prompt caching and batch APIs at OpenAI,
Anthropic, and Google; cheaper slower service tiers such as OpenAI's Flex
processing and Gemini's Flex inference; job schedulers (cron, BullMQ, a
cloud scheduler) that submit and collect batches.

## How it works

### What a prompt cache saves

Before a model generates anything, it processes the whole input. For a
long prompt that processing is a large share of the time and cost. A
prompt cache keeps the processed state of a prompt **prefix** for a while,
so a later request that starts with exactly the same tokens skips that
work for the shared part and pays a reduced rate for it. The rest of the
request (everything after the longest cached prefix) is processed
normally.

Three properties follow from "prefix" and "exactly":

- Only the beginning of a prompt can be reused. A shared paragraph in the
  middle of two different prompts saves nothing.
- Any change in the prefix, even one character, makes everything after it
  a miss.
- Caches are scoped: OpenAI caches are not shared across organizations or
  across regional processing boundaries, Anthropic caches are isolated
  per organization and, on the Claude API, per workspace, and Gemini
  explicit caches are objects in your project.

### Automatic prefix caching versus explicit breakpoints

![Diagram: a grid comparing prompt caching at OpenAI, Anthropic, and Gemini in November 2026 across six rows. How it is turned on: OpenAI automatically; Anthropic with cache_control, top-level for automatic caching or per block; Gemini implicitly by default, or explicitly through a cache object. Breakpoints: OpenAI implicit, with GPT-5.6 and later adding explicit breakpoints and up to four cache writes; Anthropic up to four per request, with automatic caching using one slot; Gemini chosen for you, or the whole explicit cache object. Lifetime: OpenAI 30 minutes by default or 12 hours; Anthropic 5 minutes refreshed on use, or 1 hour; Gemini explicit caches live for the TTL you set, 1 hour by default. Minimum prefix: OpenAI 1,024 tokens on GPT-5.6 and later; Anthropic 512 to 4,096 tokens and Gemini 2,048 to 4,096 tokens depending on the model. Usage fields: cached_tokens and cache_write_tokens; cache_read_input_tokens and cache_creation_input_tokens; cachedContentTokenCount. Relative cost: writes above the input price and reads far below it at OpenAI and Anthropic; discounted hits and storage per hour for Gemini explicit caches.](provider-caching-mechanics.svg)

The providers agree on the idea and differ on who decides what is cached.
The details below were checked against each provider's documentation in
November 2026; minimums and multipliers vary by model, so check the
table for the model you configure.

**OpenAI** caches automatically. On GPT-5.6 and later models,
`prompt_cache_options.mode` selects how breakpoints are placed:

- **Implicit** (the default): OpenAI places a breakpoint at the end of the
  latest eligible message (a user message, the last of a run of tool
  results, or the initial developer messages) and can reuse prefixes that
  end at up to 20 earlier message boundaries.
- **Explicit**: only content blocks you mark with
  `prompt_cache_breakpoint` are written to the cache, up to four writes per
  request. Content after the last breakpoint is billed as ordinary input
  with no write charge. With no breakpoints, the request is not cached.

You can mix the two: in implicit mode, up to three explicit breakpoints are
written alongside the implicit one. `prompt_cache_options.ttl` sets the
minimum lifetime, `"30m"` (the default) or `"12h"`; a 12-hour write costs
more than a 30-minute write, and reads cost the same for both. Breakpoints
cannot go in the top-level `instructions` field, so reusable instructions
belong in a developer message. `prompt_cache_key` groups related requests;
on models before GPT-5.6 it helps route them to the same cache, and on
newer models it mainly keeps cache accounting separate per customer.
Usage reports `input_tokens_details.cached_tokens` and
`input_tokens_details.cache_write_tokens`.

**Anthropic** caches only when asked:

- **Automatic caching**: one top-level `cache_control` field. The API puts
  the breakpoint on the last cacheable block and moves it forward as the
  conversation grows, which suits multi-turn chat.
- **Explicit breakpoints**: `cache_control` on individual blocks (a tool
  definition, a system block, a message block), up to four per request,
  with automatic caching using one of the four slots.

The default lifetime is 5 minutes, refreshed for free each time the entry
is read, and measured from the start of the request; `ttl: "1h"` keeps it
longer at a higher write price. Writes cost somewhat more than ordinary
input, reads cost a small fraction of it. When looking for a cached
prefix, the API checks at most 20 blocks back from each breakpoint. A
prompt shorter than the model's minimum (512 to 4,096 tokens depending on
the model) is processed without caching and without an error; usage then
shows both `cache_creation_input_tokens` and `cache_read_input_tokens` as
zero. A new entry only becomes available once the first response has
started, so a burst of parallel requests with the same new prefix all
miss: send one first and the rest after its response begins. Cached reads
also do not count against Anthropic's input-tokens-per-minute limit,
which raises effective throughput.

**Gemini** offers two mechanisms:

- **Implicit caching** is enabled by default on Gemini 2.5 and newer
  models. Savings are passed on automatically when a request hits, but
  there is no guarantee. Google's advice is to put large, common content at
  the beginning and send requests with similar prefixes close together.
- **Explicit caching** creates a cache object (`caches.create`) holding
  system instructions and content with a TTL (1 hour by default), which
  requests then reference with `cachedContent`. Savings are guaranteed,
  and storage is billed for the lifetime. It is available for Gemini 3 and
  2.5 models through `generateContent`, but not for Gemini 4 models or the
  Interactions API, which support implicit caching only.

### Structuring prompts so the cache hits

![Diagram: on the left, the parts of a project Q and A request in the order they are sent: tool definitions and instructions, both stable for the whole deployment; the project documents at version 12, stable per project, with an explicit 12-hour breakpoint at the end; the conversation history, which grows by appending and has an implicit or automatic breakpoint; and the new question, which changes on every request. A bracket marks the first four parts as the cacheable prefix. On the right: editing a tool schema makes everything miss; editing the instructions invalidates them and all later parts; a new docs version invalidates the documents and later parts; appending a turn invalidates nothing; the new question is the only part processed at full price. A red box warns that putting the current time in the instructions changes the first block on every request, so nothing is ever reused.](prompt-prefix-layout.svg)

The rule is to order the prompt from most stable to least stable, and to
keep anything volatile out of the stable part:

1. **Tools and instructions first**, identical for every request. Build
   tool definitions in a fixed order from code, and serialize JSON
   deterministically: the same object with keys in a different order is a
   different prefix.
2. **Shared reference material next**: for TaskFlow, the project's
   glossary and documents. Include a version identifier and change it only
   when the documents change, so a whole project's questions share one
   cache entry until then.
3. **The conversation, append-only.** Each turn adds to the end, so the
   previous request is a prefix of the next one. Rewriting or summarizing
   earlier turns saves context but invalidates the cache from that point;
   do it rarely and deliberately.
4. **The new question, and anything per-request, last**: the current
   time, the user's name, retrieved chunks that differ per question.

Two caveats. Retrieval-augmented prompts put different chunks in every
request, so only what comes before the chunks is cacheable; keep stable
material ahead of them. And per-user content in the prefix (a user's
profile, permissions text) splits the cache per user, which is fine when
each user sends many requests in a short time and wasteful otherwise.

### Measuring whether the cache works

Usage fields are the only reliable signal. TaskFlow logs, for every
request, the input tokens, the cached tokens, the cache-write tokens, and
a short hash of the stable part of the prompt. The hit ratio is
`cached_tokens / input_tokens`. A healthy project Q&A route might show
80% or more after the first question in a session; a ratio stuck at zero
means the prefix changes, the prompt is below the minimum, or requests
are too far apart for the cache lifetime. A prefix hash that differs
between two requests that should match points straight at the volatile
content.

A worked example of what caching is worth, using the multipliers in
OpenAI's guide for GPT-5.6 and later (30-minute writes at 1.25 times the
uncached input rate, reads at 0.1 times): a 20,000-token prefix is used by
50 questions of 300 tokens within half an hour.

- Without caching: 50 x 20,300 = 1,015,000 input-token equivalents.
- With caching: one write (20,000 x 1.25 = 25,000), 49 reads
  (49 x 20,000 x 0.1 = 98,000), and the questions (50 x 300 = 15,000):
  138,000 equivalents, about 14% of the uncached cost.

The same guide gives a break-even rule for padding a short prefix up to
the minimum cacheable length: with minimum `M`, read multiplier `r`, write
multiplier `w`, and `N` requests, expanding pays off when the original
prefix is longer than `M x (r + (w - r) / N)`. With `M = 1,024`,
`r = 0.1`, `w = 1.25`, and `N = 10`, that is 220.2 tokens, so a prefix of
221 tokens or more is worth expanding.

### Batch APIs: asynchronous, cheaper, slower

![Diagram: the life of a batch job. Top row: build a JSONL file with one request per line and a custom_id on each, upload it with purpose batch, and create the batch with an endpoint and a 24-hour completion window. Middle row: the batch moves through validating, in_progress, finalizing, and completed. Failure states below: failed for an invalid input file, expired when 24 hours pass, and cancelled after cancelling. Completed, expired, and cancelled batches all lead to output and error files, partial for expired or cancelled batches. Bottom row: download the output and error files, match each result by custom_id because the order is not guaranteed, and retry or report the failed lines in a later batch or with normal requests.](batch-job-lifecycle.svg)

A batch API takes many independent requests at once and promises results
within a window instead of seconds. In exchange it charges roughly half
the interactive price and draws on separate, higher rate limits, so a
large job does not compete with interactive traffic.

| | OpenAI Batch API | Anthropic Message Batches | Gemini Batch API |
|---|---|---|---|
| Relative price | 50% discount | 50% discount, stacks with caching | 50% of the standard cost |
| Turnaround | Within 24 hours, often sooner | Most within 1 hour; expires after 24 hours | 24-hour target, usually faster |
| Input | Uploaded JSONL file (purpose `batch`), up to 50,000 requests or 200 MB | Requests in the create call, up to 100,000 or 256 MB | Inline requests (under 20 MB) or an uploaded JSONL file (up to 2 GB) |
| Matching results | `custom_id` per line | `custom_id` per request | A key per request |
| Results | Output file plus an error file | Streamed JSONL results, available for 29 days | Inline responses or an output file |

Four rules make batch jobs dependable:

- **Match by `custom_id`.** Output order is not guaranteed, so every
  request carries an identifier that maps back to the record it belongs
  to (TaskFlow uses the project id).
- **Handle partial results.** A batch that expires or is cancelled still
  returns the requests that finished. Each line can succeed or fail on its
  own; the failed ones go into the next batch or are retried as normal
  requests.
- **Collect in a separate job.** Submission records the batch id;
  a scheduled job polls status and processes results. Neither should block
  a web request.
- **Make submission idempotent.** Record "digest batch for 2026-11-14
  submitted as batch X" before or atomically with submitting, so a
  restarted scheduler does not pay for the same night twice.

Caching and batching combine. Anthropic's guide recommends the 1-hour
cache lifetime for batches with shared context, because batch requests
run over longer periods than 5 minutes. Gemini's batch mode supports
context caching too.

A middle ground exists for work that should finish within minutes rather
than hours: **cheaper, slower service tiers** for ordinary synchronous
requests. OpenAI's Flex processing (`service_tier: "flex"`, in beta for
some models) is priced at Batch API rates with slower responses and
occasional `429` "resource unavailable" errors that are not charged.
Gemini's Flex inference (`serviceTier: FLEX`, in preview) offers a 50%
reduction with variable latency and best-effort availability.

## When to use and when not to use

| Workload | Caching | Batch or flex | Why |
|---|---|---|---|
| Project Q&A with large shared docs | Yes, explicit breakpoint after the docs | No | Users wait; the prefix repeats |
| Multi-turn assistant or agent loop | Yes, automatic or implicit | No | Each turn's prompt extends the last |
| Nightly digests for every project | Little to share | Batch | Nobody waits; half the price |
| Re-classifying 200,000 old tasks | Shared instructions only | Batch | Large, independent, not urgent |
| Evaluation runs in CI or nightly | Shared instructions | Batch (nightly) or flex (CI) | Cost matters more than latency |
| One-off short prompts | No | No | Below the cache minimum; nothing repeats |
| A prefix reused once every few hours | Probably not | Depends | Writes cost more than plain input; the entry expires before reuse |

Avoid the 1-hour or 12-hour lifetimes unless reuse really spans that
long: the write premium is wasted if the entry is read only once or
twice. Avoid batch APIs for anything a user is waiting for, even if most
batches finish within an hour; the promise is the window, not the
typical case.

## Practical examples

### A cache-friendly request for project Q&A

```ts
// src/ai/project-qa.ts
// Project-knowledge Q&A with a cache-friendly prompt: stable content first,
// the user's question last, and nothing volatile in the prefix.
import { createHash } from "node:crypto";
import OpenAI from "openai";

export interface ProjectContext {
  projectId: string;
  docsVersion: string; // changes only when the project's docs change
  docs: string; // glossary, conventions, current docs (thousands of tokens)
}
export interface Turn {
  role: "user" | "assistant";
  text: string;
}

const INSTRUCTIONS = [
  "You answer questions about one TaskFlow project using only the project documents.",
  "Cite the document title for every claim. If the documents do not say, answer 'Not documented.'",
].join("\n");

export function buildRequest(model: string, ctx: ProjectContext, history: Turn[], question: string) {
  const request = {
    model,
    max_output_tokens: 600,
    store: false,
    prompt_cache_key: `project:${ctx.projectId}`, // groups related requests (helps older models route)
    prompt_cache_options: { mode: "implicit", ttl: "30m" }, // GPT-5.6 and later
    input: [
      // 1. Stable for every request in the deployment.
      { role: "developer", content: [{ type: "input_text", text: INSTRUCTIONS }] },
      // 2. Stable per project and docs version; reused all day, so cache it longer.
      {
        role: "developer",
        content: [
          {
            type: "input_text",
            text: `Project documents (version ${ctx.docsVersion}):\n${ctx.docs}`,
            prompt_cache_breakpoint: { mode: "explicit", ttl: "12h" },
          },
        ],
      },
      // 3. Grows by appending; the implicit breakpoint follows the latest user message.
      ...history.map((t) => ({ role: t.role, content: t.text })),
      // 4. Changes every request: always last.
      { role: "user", content: question },
    ],
  } satisfies OpenAI.Responses.ResponseCreateParamsNonStreaming;
  return request;
}

// Hash of everything before the conversation: log it with each request.
// If it changes between two requests that should share a cache, something
// volatile (a timestamp, a random id, reordered JSON) leaked into the prefix.
export function prefixFingerprint(req: ReturnType<typeof buildRequest>): string {
  const stable = JSON.stringify([req.model, req.input[0], req.input[1]]);
  return createHash("sha256").update(stable).digest("hex").slice(0, 12);
}

// Share of input tokens served from cache, from the usage the provider returns.
export function cacheHitRatio(usage: OpenAI.Responses.ResponseUsage | undefined): number {
  if (!usage || usage.input_tokens === 0) return 0;
  return usage.input_tokens_details.cached_tokens / usage.input_tokens;
}
```

- The documents get an explicit 12-hour breakpoint because the same
  project's questions arrive all day; the conversation relies on the
  implicit 30-minute breakpoint because sessions are short.
- `satisfies` checks the object against the SDK's request type without
  widening it, so a misspelled cache option fails the type check.
- `prompt_cache_options` applies to GPT-5.6 and later models. For an older
  model in `CHAT_MODEL`, drop it and the breakpoint, and rely on automatic
  caching plus `prompt_cache_key`.
- The function never puts the date, the user's name, or retrieved chunks
  before the conversation. If the assistant needs today's date, it goes
  into the final user message.

### The Anthropic and Gemini equivalents

```ts
// src/ai/cache-equivalents.ts
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";

const anthropic = new Anthropic();
const genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Anthropic: an explicit 1-hour breakpoint after the project documents, plus
// top-level automatic caching that moves its breakpoint along the conversation.
export async function anthropicAnswer(docs: string, history: Anthropic.MessageParam[], question: string) {
  const message = await anthropic.messages.create({
    model: process.env.ANTHROPIC_MODEL!,
    max_tokens: 600,
    cache_control: { type: "ephemeral" }, // automatic: last cacheable block, 5-minute TTL
    system: [
      { type: "text", text: "Answer questions about one TaskFlow project using only its documents." },
      { type: "text", text: docs, cache_control: { type: "ephemeral", ttl: "1h" } },
    ],
    messages: [...history, { role: "user", content: question }],
  });
  const u = message.usage;
  console.log({ cacheWrite: u.cache_creation_input_tokens, cacheRead: u.cache_read_input_tokens, uncached: u.input_tokens });
  return message;
}

// Gemini: implicit caching needs no code. Explicit caching creates a cache
// object (Gemini 3 and 2.5 models through generateContent) and references it.
export async function geminiWithExplicitCache(docs: string, question: string) {
  const model = process.env.GEMINI_CHAT_MODEL!;
  const cache = await genai.caches.create({
    model,
    config: {
      displayName: "taskflow-project-docs",
      systemInstruction: "Answer questions about one TaskFlow project using only its documents.",
      contents: [{ role: "user", parts: [{ text: docs }] }],
      ttl: "3600s", // the default is 1 hour; storage is billed for the TTL
    },
  });
  const response = await genai.models.generateContent({
    model,
    contents: question,
    config: { cachedContent: cache.name },
  });
  console.log({ cachedTokens: response.usageMetadata?.cachedContentTokenCount });
  return response.text;
}
```

- In the Anthropic request, the order is fixed by the API: tools, then
  system, then messages. Putting the documents in `system` with their own
  breakpoint keeps them cached even while the automatic breakpoint moves
  along the messages.
- In Anthropic usage, `input_tokens` counts only the tokens after the
  last breakpoint; add the three fields to get the full prompt size.
- A real application creates one Gemini cache per project and docs
  version, stores its name, and deletes or lets it expire when the
  documents change, rather than creating a cache per question as this
  short example does.

### Nightly digests with the Batch API

```ts
// src/jobs/nightly-digests.ts
// Nightly "what happened in your project today" digests through the Batch API:
// one JSONL line per project, submitted at night, collected by a later job.
import OpenAI, { toFile } from "openai";

export interface DigestInput {
  projectId: string;
  activity: string; // the day's task changes and comments, as text
}

interface BatchLine {
  custom_id: string; // how results are matched back: output order is not guaranteed
  method: "POST";
  url: "/v1/responses";
  body: OpenAI.Responses.ResponseCreateParamsNonStreaming;
}

const DIGEST_INSTRUCTIONS =
  "Write a short digest of today's activity in this TaskFlow project: completed work, new blockers, overdue tasks.";

export function buildBatchFile(model: string, inputs: DigestInput[]): string {
  return inputs
    .map((input): BatchLine => ({
      custom_id: input.projectId, // unique within the batch; the day is in the batch metadata
      method: "POST",
      url: "/v1/responses",
      body: { model, instructions: DIGEST_INSTRUCTIONS, input: input.activity, max_output_tokens: 400, store: false },
    }))
    .map((line) => JSON.stringify(line))
    .join("\n");
}

export async function submitDigestBatch(client: OpenAI, jsonl: string, day: string): Promise<string> {
  const file = await client.files.create({
    file: await toFile(Buffer.from(jsonl, "utf8"), `digests-${day}.jsonl`),
    purpose: "batch",
  });
  const batch = await client.batches.create({
    input_file_id: file.id,
    endpoint: "/v1/responses",
    completion_window: "24h",
    metadata: { job: "nightly-digests", day },
  });
  return batch.id; // store it; a later job collects the results
}

export interface DigestResult {
  projectId: string;
  text?: string;
  error?: string;
}

// Called by a scheduled job every few minutes until the batch is final.
export async function collectDigestBatch(client: OpenAI, batchId: string): Promise<DigestResult[] | null> {
  const batch = await client.batches.retrieve(batchId);
  if (["validating", "in_progress", "finalizing", "cancelling"].includes(batch.status)) return null; // not yet
  if (batch.status === "failed") throw new Error(`Batch ${batchId} failed validation`);

  const results: DigestResult[] = [];
  // "completed", "expired" and "cancelled" batches can all have partial output.
  for (const fileId of [batch.output_file_id, batch.error_file_id]) {
    if (!fileId) continue;
    const body = await (await client.files.content(fileId)).text();
    for (const line of body.split("\n").filter(Boolean)) results.push(parseResultLine(line));
  }
  return results;
}

export function parseResultLine(line: string): DigestResult {
  const row = JSON.parse(line) as {
    custom_id: string;
    response: { status_code: number; body: OpenAI.Responses.Response } | null;
    error: { code: string; message: string } | null;
  };
  const projectId = row.custom_id;
  if (row.error || !row.response || row.response.status_code !== 200) {
    return { projectId, error: row.error?.message ?? `HTTP ${row.response?.status_code}` };
  }
  // output_text is an SDK convenience getter; raw JSON needs the output items.
  const text = row.response.body.output
    .flatMap((item) => (item.type === "message" ? item.content : []))
    .flatMap((part) => (part.type === "output_text" ? [part.text] : []))
    .join("");
  return { projectId, text };
}
```

- Each line of the input file is a complete request with its own
  `custom_id`, HTTP method, endpoint path, and body. The whole file must
  target the endpoint given to `batches.create`.
- `toFile` turns an in-memory buffer into an upload; for very large jobs,
  write the JSONL to disk and stream it instead.
- Results arrive in two files: the output file holds lines with an HTTP
  status and body (a `429` or `500` on one line is possible), and the
  error file holds lines that could not be processed at all. Both are
  parsed into the same result shape.
- The collector returns `null` while the batch is running, so a scheduler
  can call it every few minutes without special cases.

The Anthropic version sends the requests directly in the create call and
streams results back:

```ts
// src/jobs/nightly-digests-anthropic.ts
import Anthropic from "@anthropic-ai/sdk";
import type { DigestInput, DigestResult } from "./nightly-digests.js";

const anthropic = new Anthropic();

export async function submit(inputs: DigestInput[]): Promise<string> {
  const batch = await anthropic.messages.batches.create({
    requests: inputs.map((input) => ({
      custom_id: input.projectId, // results come back in any order
      params: {
        model: process.env.ANTHROPIC_MODEL!,
        max_tokens: 400,
        system: "Write a short digest of today's activity in this TaskFlow project.",
        messages: [{ role: "user", content: input.activity }],
      },
    })),
  });
  return batch.id;
}

export async function collect(batchId: string): Promise<DigestResult[] | null> {
  const batch = await anthropic.messages.batches.retrieve(batchId);
  if (batch.processing_status !== "ended") return null;
  const results: DigestResult[] = [];
  for await (const row of await anthropic.messages.batches.results(batchId)) {
    if (row.result.type === "succeeded") {
      const text = row.result.message.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
      results.push({ projectId: row.custom_id, text });
    } else {
      results.push({ projectId: row.custom_id, error: row.result.type }); // errored, canceled, or expired
    }
  }
  return results;
}
```

### Testing both features without a provider

The pure parts run locally: the prefix fingerprint stays the same across
conversation turns and changes when the documents' version changes, and
the hit ratio of a usage object with 9,600 cached tokens out of 12,000 is
0.8. The batch flow runs against a stub server that implements the
files and batches endpoints, with the real OpenAI SDK. Output of that test
run (no provider called):

```text
fingerprint  426c41d51fa2 for turn 1 and turn 3; different for docs v13
batch        uploaded 3 lines with purpose "batch"; batch_1 created
poll 1       in_progress -> collector returned null
poll 2       completed -> 3 results matched by custom_id:
             p1  text: "Done: 3 tasks."
             p2  error: "HTTP 429"            (line-level failure in the output file)
             p3  error: "max_output_tokens too large"  (from the error file)
```

## Best practices

- Order prompts from most stable to least stable: tools, instructions,
  shared documents, conversation, then the new input.
- Keep timestamps, user names, request ids, and retrieved chunks out of
  the cached prefix.
- Serialize tool definitions and JSON deterministically, and version
  shared documents.
- Keep conversations append-only; summarize old turns rarely and on
  purpose.
- Log cached and cache-write tokens and a prefix fingerprint for every
  request; alert when the hit ratio drops.
- Choose cache lifetimes from measured reuse intervals; long lifetimes
  cost more to write.
- Send the first request with a new prefix before a parallel burst on
  providers where entries appear only after the first response starts.
- Move work nobody waits for to batch APIs, match results by
  `custom_id`, retry only failed lines, and make submission idempotent.
- Consider flex service tiers for work that should finish in minutes and
  can tolerate slower responses and occasional capacity errors.

## In production

- **Caching was enabled but the bill did not change.**
  *Detect:* `cached_tokens` (or `cache_read_input_tokens`) stays at zero;
  the prefix fingerprint differs on every request. *Cause:* a volatile
  value (current time, request id, user name) or non-deterministic JSON
  in the prefix. *Fix:* move volatile content to the end, sort and
  stabilize serialization, and add the fingerprint to logs.
- **The hit ratio collapsed after a deploy.**
  *Detect:* cached tokens drop to zero at the deploy time for every route.
  *Cause:* a changed tool schema or instruction text invalidated every
  cached prefix (expected once), or a new field was added to the start of
  the prompt (a lasting regression). *Fix:* expect one cold period after
  prompt changes; if it persists, compare fingerprints before and after.
- **Costs rose after switching to the 1-hour (or 12-hour) cache.**
  *Detect:* cache-write tokens are high and reads per write are low.
  *Cause:* entries are written at the higher long-lifetime rate but rarely
  reused. *Fix:* measure reuse intervals per route and use the default
  lifetime unless reuse spans it.
- **A burst of identical requests all miss the cache.**
  *Detect:* parallel requests at the same moment each show cache writes.
  *Cause:* the entry becomes available only after the first response
  starts. *Fix:* send one request first (or pre-warm where the provider
  supports it) and release the rest after it starts.
- **Some projects never get their nightly digest.**
  *Detect:* the batch ended with fewer successes than lines; failed lines
  are not retried. *Cause:* line-level errors or an expired batch, with
  results matched by position or only the output file read. *Fix:* read
  both files, match by `custom_id`, and resubmit failed lines.
- **The nightly batch ran twice.**
  *Detect:* two batches with the same metadata day; doubled batch spend.
  *Cause:* the scheduler retried submission after a timeout without
  checking for an existing batch. *Fix:* record the submission per day
  with a unique key before submitting, and look it up on retry.
- **The explicit Gemini cache bill keeps growing.**
  *Detect:* storage charges for caches nobody uses. *Cause:* caches created
  per request or per user with long TTLs. *Fix:* one cache per shared
  context and version, short TTLs, and deletion when the content changes.

## Important terminology

- **Prompt caching:** Reusing the provider's processed state for an
  identical prompt prefix across requests.
- **Prefix:** The beginning of a prompt, up to a cache breakpoint.
- **Cache breakpoint:** The position up to which a prefix is written to
  the cache.
- **Automatic (implicit) caching:** Caching where the provider chooses
  what to cache with little or no configuration.
- **Explicit caching:** Caching where the developer marks breakpoints or
  creates cache objects.
- **Cache write:** Storing a new prefix, usually billed above the normal
  input rate.
- **Cache read (hit):** Reusing a stored prefix, billed at a fraction of
  the input rate.
- **TTL:** How long a cache entry or batch result remains available.
- **Batch API:** An asynchronous interface that processes many requests
  within a window at a lower price.
- **custom_id:** The identifier that matches each batch result to its
  request.
- **Flex tier:** A cheaper service tier for synchronous requests with
  slower and less guaranteed processing.

## Common mistakes and misconceptions

- Assuming caching works because it was "turned on", without reading the
  usage fields.
- Putting the date or user details in the system prompt.
- Expecting a shared paragraph in the middle of prompts to be cached.
- Rewriting earlier conversation turns on every request.
- Using long cache lifetimes for prefixes that are rarely reused.
- Firing a burst of parallel requests with a brand-new prefix.
- Matching batch results by position instead of `custom_id`.
- Ignoring the error file and line-level failures of a batch.
- Using a batch API for anything a user is waiting for.

## Revision questions

1. Why can a prompt cache only reuse a prefix, and what does that imply
   for the order of a prompt?
2. Compare OpenAI's implicit and explicit modes with Anthropic's automatic
   and explicit caching. Who decides where the breakpoint goes in each?
3. A request shows `cache_creation_input_tokens: 0` and
   `cache_read_input_tokens: 0` although `cache_control` is set. Give two
   possible reasons.
4. Using a write multiplier of 1.25 and a read multiplier of 0.1, what is
   the relative input cost of reusing a 10,000-token prefix for 20
   requests with 500-token questions, compared with no caching?
   (Cached: 12,500 + 19 x 1,000 + 10,000 = 41,500; uncached:
   20 x 10,500 = 210,000; about 20%.)
5. Where should TaskFlow put today's date if the assistant needs it, and
   why?
6. Which TaskFlow workloads belong in a batch API, and which do not?
7. How do you make nightly batch submission safe against a scheduler that
   retries?
8. When would you choose a flex service tier over a batch API?

## Further learning

- [OpenAI: Prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching)
- [OpenAI: Batch API](https://developers.openai.com/api/docs/guides/batch)
- [OpenAI: Flex processing](https://developers.openai.com/api/docs/guides/flex-processing)
- [Anthropic: Prompt caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)
- [Anthropic: Batch processing](https://platform.claude.com/docs/en/build-with-claude/batch-processing)
- [Gemini API: Context caching](https://aistudio.google.com/docs/caching)
- [Gemini API: Batch API](https://aistudio.google.com/docs/batch-api)
- [Gemini API: Flex inference](https://aistudio.google.com/docs/flex-inference)
- Next: [choosing models and providers](choosing-models-and-providers.md). Back to the [hosted model APIs overview](../hosted-model-apis.md).
