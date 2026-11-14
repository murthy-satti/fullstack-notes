# Calling Model APIs from a Backend

TaskFlow Assistant turns "remind Sam to send the invoice on Friday" into a
draft task. The browser never talks to the model provider: it calls the
TaskFlow API, and the API calls the model. This lesson covers that
server-side call in depth: setting up the official SDKs with keys that
never leave the server, timeouts that respect a user who is waiting,
retries with backoff and `Retry-After`, the many kinds of `429`, an error
taxonomy the rest of the code can act on, idempotency for operations that
are not naturally idempotent, falling back across models and providers,
and per-user quotas that keep one account from spending everyone's
budget.

Streaming the answer token by token is covered in
[streaming responses end to end](streaming-responses-end-to-end.md);
choosing which models go into the fallback list is covered in
[choosing models and providers](choosing-models-and-providers.md).

## Why it matters

A model call is the slowest, most expensive, and least predictable
dependency most web backends have. A database query that takes 50 ms is
slow; a model call that takes 5 seconds is normal, and one that takes 40
seconds is not unusual for long outputs. Providers enforce rate limits per
minute on requests and tokens, shed load with `429`, `503`, or `529`
responses during busy periods, and occasionally retire a model your code
still names. Each of these turns into a visible failure unless the backend
handles it deliberately.

The defaults do not protect you. The official OpenAI and Anthropic SDKs
wait up to 10 minutes per attempt and retry twice, so one stuck request can
hold a connection and a user's spinner for half an hour. The Google Gen AI
SDK does not retry at all unless you configure it. A retry also costs
money: generation is not idempotent, so every retried request is billed
again. Getting timeouts, retries, quotas, and fallbacks right is the
difference between an assistant that degrades gracefully and one that
melts the budget during an incident.

## Real-world usage

- **OpenAI rate-limit guidance.** The
  [rate limits guide](https://developers.openai.com/api/docs/guides/rate-limits)
  tells clients to honor `Retry-After` when present, fall back to
  exponential backoff with jitter, cap both attempts and total retry time,
  never retry quota or billing errors, and disable SDK retries (or account
  for them) when the application manages its own.
- **Anthropic's error and rate-limit model.** The
  [errors reference](https://platform.claude.com/docs/en/api/errors) lists
  the error types, including `529 overloaded_error`, and warns that a
  streaming response can fail after a `200`. The
  [rate limits page](https://platform.claude.com/docs/en/api/rate-limits)
  explains token-bucket limits on requests, input tokens, and output
  tokens, and that the `429` returned when an organization reaches its
  monthly spend cap carries no `retry-after` header and does not clear by
  retrying.
- **Amazon on retry amplification.** Marc Brooker's
  [Timeouts, retries, and backoff with jitter](https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/)
  in the Amazon Builders' Library shows how three retries at each layer of
  a five-deep call stack multiply load on a failing database by 243, and
  why Amazon limits retries with a token bucket.
- **Google Gen AI SDK retries are opt-in.** The
  [JavaScript SDK](https://github.com/googleapis/js-genai) exposes
  `httpOptions.retryOptions` (attempts, initial delay, maximum delay,
  multiplier, jitter, status codes); without it, a failed request is
  returned to your code immediately.

**Popular tools and providers:** the official OpenAI, Anthropic, and
Google Gen AI SDKs; the Vercel AI SDK as a multi-provider layer; model
gateways such as [LiteLLM](https://github.com/BerriAI/litellm) and
[OpenRouter](https://openrouter.ai/docs); cloud-hosted access through
Microsoft Foundry (Azure OpenAI), Amazon Bedrock, and Google Cloud.

## How it works

![Diagram: a sequence with five lifelines: TaskFlow Web, the Express API, the AI router, the primary model at provider A, and the fallback model at provider B. The browser posts to the parse-task endpoint. Express authenticates the user, validates the input, claims the idempotency key, and reserves token quota in MongoDB, then passes a request with a 25-second budget to the AI router. Attempt 1 to the primary model returns 429 with retry-after 1 second; after waiting, attempt 2 returns 429 insufficient_quota, which retrying cannot fix, so the router calls the fallback model at provider B, which returns 200 with text and usage. Express settles the quota with the real token count, stores the result for replays, and returns the draft task to the browser.](backend-model-call-path.svg)

### Keys stay on the server

The provider key authorizes spending on your account, so it lives only in
the backend's environment or secret manager and is read once at startup.
A key in a Vite variable (`VITE_*`) is compiled into the JavaScript bundle
and is public, whatever the variable is called. The browser authenticates
to TaskFlow with its normal session; TaskFlow authorizes the user, decides
which model and prompt to use, and calls the provider with its own key.
Secret handling (managers, rotation, scoping) is covered in
[secrets management](../../08-devops-and-deployment/environment-variables/secrets-management.md).

Use separate keys (or projects) for development, staging, and production,
and set spend limits on each in the provider console. A leaked development
key then costs at most its own limit.

### One client per process, configured once

Create the SDK client once and reuse it: it keeps a connection pool, and
its options become your defaults. The defaults below were read from the
installed packages (`openai` 7.57, `@anthropic-ai/sdk` 1.8,
`@google/genai` 3.3, `ai` 7.0, November 2026):

| SDK | Default timeout | Default retries | Retries on |
|---|---|---|---|
| OpenAI (`openai`) | 10 minutes per attempt | 2 | Connection errors, `408`, `409`, `429`, `5xx`; honors `retry-after-ms`, `retry-after`, `x-should-retry` |
| Anthropic (`@anthropic-ai/sdk`) | 10 minutes per attempt | 2 | The same rules (the SDKs share a generator); `529` included as a `5xx` |
| Google Gen AI (`@google/genai`) | None set; `httpOptions.timeout` is per attempt | None unless `retryOptions` is set | With `retryOptions`: `408`, `429`, `5xx`, 5 attempts by default |
| Vercel AI SDK (`ai`) | Configurable `timeout` | `maxRetries` 2 | Retryable provider errors |

Both Stainless-generated SDKs (OpenAI and Anthropic) back off from 0.5
seconds, doubling to at most 8 seconds, with up to 25% jitter. Two more
details matter in practice. The Anthropic SDK refuses a non-streaming
request whose `max_tokens` implies more than 10 minutes of generation and
asks you to stream instead. And Node's own `fetch` has header and body
inactivity timeouts of its own, so a very long non-streaming call can fail
inside Node even when the SDK timeout is longer.

### Timeouts: per attempt and per request

There are two different numbers. The **attempt timeout** caps one HTTP
request to the provider. The **budget** caps everything a user waits for:
all attempts, all backoff sleeps, and any fallback. Only the budget
matches what the product promises ("the assistant answers within about 25
seconds or tells you it is busy").

![Diagram: two timelines on a 0 to 25 second axis. With a 25-second total budget, 15 seconds per attempt and two attempts per route: attempt 1 to the primary model returns 429 after 1 second, the router waits 2 seconds for Retry-After, attempt 2 gets no answer and is cut off at the 15-second attempt timeout, a short backoff follows, and the fallback model answers 200 at about 21.5 seconds, before the budget ends at 25 seconds with a 503. Below, with SDK defaults only, up to three attempts of 10 minutes each can make one request hang for more than 30 minutes.](retry-budget-timeline.svg)

Choose the attempt timeout from the output size, not from habit. A
non-streaming call has to generate the whole answer before the first byte
arrives, so its timeout must cover generation time at the model's output
speed for your `max_output_tokens`. For a 300-token task draft that is a
few seconds; for a 4,000-token report it can be a minute. When the answer
is long, stream it: the meaningful timeout then becomes time to first
token plus a maximum gap between chunks.

### Rate limits and the many kinds of 429

Providers limit each account (or project, or workspace) on several axes at
once: requests per minute, input tokens per minute, and output tokens per
minute, with some limits per model. Anthropic documents a token-bucket
algorithm, so capacity refills continuously instead of resetting at the
top of the minute, and counts only uncached input tokens against its
input-token limit. Every response carries headers describing where you
stand:

| Provider | Remaining capacity headers | When to retry |
|---|---|---|
| OpenAI | `x-ratelimit-limit-requests`, `x-ratelimit-remaining-requests`, `x-ratelimit-reset-requests`, and the same for `tokens` | `Retry-After` when present |
| Anthropic | `anthropic-ratelimit-requests-limit`, `-remaining`, `-reset`, and the same for tokens | `retry-after` when present |
| Gemini API | Quotas per project and model (requests and tokens per minute, requests per day) | `429 RESOURCE_EXHAUSTED`; back off |

A `429` does not always mean "slow down for a moment". OpenAI returns
`429` with codes such as `slow_down` (your rate rose too quickly; ramp up
gradually), plain rate limits, and billing-type errors such as
`credit_balance_exhausted` or the spend- and usage-limit codes
(`organization_spend_limit_exceeded`, `project_spend_limit_exceeded`,
`organization_usage_limit_exceeded`), whose error type is often
`insufficient_quota`. Anthropic returns a
`429` with `error.details.error_code` `enforced_spend_limit_reached` when
the monthly spend cap is reached, and that one has no `retry-after` and
lasts until the next month or a limit increase. Retrying billing errors
only adds load and noise; they belong to a different branch of the error
taxonomy.

### An error taxonomy the application can act on

The SDKs throw typed errors (`RateLimitError`, `InternalServerError`,
`APIConnectionTimeoutError`, and so on), but the rest of TaskFlow should
not care which provider produced them. Map every failure onto a small set
of kinds, each with two decisions attached: is it worth retrying the same
route, and could another model or provider succeed?

| Kind | Typical signal | Retry same route? | Try next route? | What the user sees |
|---|---|---|---|---|
| `aborted` | Your own `AbortSignal` fired (client left) | No | No | Nothing; they are gone |
| `timeout`, `network` | SDK timeout, connection reset, `408`, `504` | Yes | Yes | Spinner, then an answer or "busy" |
| `rate_limited` | `429` with a temporary code | Yes, after `Retry-After` | Yes | Same |
| `overloaded`, `server` | `500`, `503`, `529` | Yes, with backoff | Yes | Same |
| `quota_exhausted` | Quota, credit, or spend-cap `429`; `402` | No | Yes | Same; page the owner |
| `auth`, `not_found` | `401`, `403`; `404` for a retired model | No | Yes | Same; page the owner |
| `bad_request` | `400`, `413`, `422`: too long, invalid parameter | No | No | "Try shorter wording" |
| `incomplete` | Output hit the token limit or was filtered | No | No | Ask to narrow the request |

![Diagram: a flowchart for a failed provider call. If the caller aborted, stop and log. Otherwise, if the failure is temporary (timeouts, 429 rate limits, 5xx, 529), retry the same route after Retry-After or backoff inside the time budget; when attempts or the budget are used up, try the next route. If it is not temporary but another route could succeed (quota 429, 401, 403, a 404 for a retired model), try the next route, a fallback model or provider; if every route fails, return 503 with a retry message. If no route could help (400, 413, 422, incomplete output), fail fast with a 4xx so the request is fixed.](model-api-error-taxonomy.svg)

Two rules fall out of the table. A request that is wrong (too long, an
invalid parameter) fails the same way on every route, so falling back only
multiplies the cost of the failure. And a refusal or a truncated output is
not an error the network layer can fix: it needs a product decision, such
as asking the user to narrow the request.

### Retries with backoff and jitter

When a retry is appropriate, wait first. Exponential backoff doubles the
ceiling each attempt (`base x 2^(attempt-1)`, capped), and **full jitter**
picks a random delay between zero and that ceiling so thousands of clients
that failed together do not retry together. With a 500 ms base and a 4 s
cap, the ceilings are 0.5, 1, 2, 4, 4 seconds. A `Retry-After` header
overrides the computed delay; if it asks for longer than the request can
afford, do not sleep at all: move to the next route or fail.

Retry in exactly one layer. If the SDK retries twice and your code wraps
it in three attempts, a single user action becomes up to nine provider
requests, and during an outage that multiplication lands on a provider
that is already struggling. TaskFlow turns SDK retries off
(`maxRetries: 0`) and lets one function own retries, backoff, the budget,
and fallback, so the policy is visible in one place and in the logs.

### Idempotency: generation is not

Calling a model twice produces two different answers and two bills.
Neither the OpenAI nor the Anthropic SDK sends an idempotency header for
these requests (their request options accept an `idempotencyKey`, but the
clients define no header for it; checked in `openai` 7.57 and
`@anthropic-ai/sdk` 1.8), so the provider cannot de-duplicate a retry.
Idempotency has to be built where the side effects are: in TaskFlow.

The pattern is the one used for payments. TaskFlow Web generates an
`Idempotency-Key` (a UUID) for each user action and sends it with the
request. The API claims the key in MongoDB with a unique index before
calling the model, stores the result when it succeeds, and replays the
stored result if the same key arrives again (a double click, a mobile
client retrying after a dropped connection). Only the model call is
protected this way; anything the result triggers, such as an agent
creating tasks through tools, needs its own idempotency at the tool level,
as discussed in [tool calling in practice](../tool-calling-and-agents/tool-calling-in-practice.md).

### Fallback and routing across models and providers

A fallback list is an ordered set of routes: the primary model, a cheaper
or older model at the same provider, and optionally a model at a second
provider. Each route sits behind the same internal interface (`ChatRequest`
in, `ChatResult` out), so the router can move between them without the
calling code knowing. The provider-neutral adapter idea is introduced in
the [hosted model APIs overview](../hosted-model-apis.md); deciding which
models belong in the list, and in which tier, is covered in
[choosing models and providers](choosing-models-and-providers.md).

Fallback is not free. Another model follows instructions differently,
counts tokens differently, and may format JSON differently, so every route
in the list must pass the same evaluation set as the primary, as described
in [building evaluation sets](../evaluation-and-monitoring/building-evaluation-sets.md).
A second provider also means a second contract, data-processing terms, and
a second key to protect. Many teams keep the fallback within one provider
for ordinary errors and add a second provider only for features where
availability matters more than identical behavior.

A small **circuit breaker** per route avoids paying the attempt timeout on
every request while a route is down: after several consecutive failures,
skip the route for a cooldown period, then let traffic probe it again.

### Per-user quotas

Provider limits protect the provider, and spend limits protect your
account; neither protects one TaskFlow user from another. Without a
per-user limit, a script or a curious user can exhaust the organization's
tokens-per-minute limit and make the assistant fail for everyone, or run
up a large bill overnight. Three controls work together:

- **A token budget per user per day**, reserved before the call with an
  estimate and settled afterwards with the real usage the provider
  reports. Atomic updates in MongoDB make the check race-free.
- **A request rate limit** (per minute) and a **concurrency limit** (one or
  two in-flight assistant calls per user) in front of the route. These can
  live in Redis or the API gateway, like any other rate limit.
- **A stable user identifier for the provider.** OpenAI's
  `safety_identifier` parameter takes a hashed user id so the provider's
  abuse detection can act on one user instead of on your whole
  organization; hash it so no personal data leaves TaskFlow.

## When to use and when not to use

| Situation | Recommended approach |
|---|---|
| One provider, low volume, no fallback | Keep SDK retries (lower `maxRetries` to 1), set a sensible `timeout`, wrap the call in a budget |
| Fallback across models or providers | Disable SDK retries; one router owns retries, budget, and fallback |
| The result is shown to a waiting user | A budget of seconds, short attempts, fail with a clear message |
| The work can wait (nightly summaries, re-indexing) | No tight budget; use a queue with retries, or a batch API (see [prompt caching and batch processing](prompt-caching-and-batch-processing.md)) |
| Long outputs | Stream instead of raising the timeout |
| The action has side effects (creates tasks, sends mail) | Idempotency keys for the request and for each tool action |

Do not add a second provider "just in case" without evaluating it and
signing its data terms; an untested fallback that produces malformed tasks
during an incident is worse than a clear "busy" message. And do not retry
inside request handlers for background work: hand it to a job queue
instead, so retries survive restarts.

## Practical examples

### Configuration and the OpenAI adapter

```bash
# .env.example: placeholders only; real values live in the secret manager
OPENAI_API_KEY=<openai-key>
CHAT_MODEL=<model id from the provider's model list>
FALLBACK_MODEL=<a cheaper model id from the same list>
ANTHROPIC_API_KEY=<anthropic-key>
ANTHROPIC_FALLBACK_MODEL=<model id from the Anthropic models overview>
```

Pick model IDs from each provider's current model list (the OpenAI models
page, the Anthropic models overview, the Gemini models page) and change
them in configuration, never in code. A model retired by the provider then
needs a configuration change and an evaluation run, not a deploy.

```ts
// src/ai/types.ts
// The internal contract every provider adapter implements.
export interface ChatRequest {
  instructions: string;
  input: string;
  maxOutputTokens: number;
  userId: string;
  signal?: AbortSignal;
}

export interface ChatResult {
  text: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
}

export interface ModelRoute {
  name: string; // "primary", "fallback", ...
  provider: "openai" | "anthropic";
  model: string;
  call(req: ChatRequest, timeoutMs: number): Promise<ChatResult>;
}

// Raised by adapters when the model stopped early (output token limit, filter).
export class IncompleteOutputError extends Error {
  constructor(readonly reason: string) {
    super(`Model output incomplete: ${reason}`);
  }
}
```

```ts
// src/ai/providers/openai.ts
import { createHash } from "node:crypto";
import OpenAI from "openai";
import { IncompleteOutputError, type ModelRoute } from "../types.js";

// One client per process: it reuses HTTP connections. SDK retries are off
// because callWithFallback() owns retries, backoff and the time budget.
export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // server-side only, never sent to the browser
  maxRetries: 0,
  timeout: 20_000,
});

// A stable, non-reversible per-user id for the provider's abuse detection.
function safetyId(userId: string): string {
  return createHash("sha256").update(`taskflow:${userId}`).digest("hex").slice(0, 32);
}

export function openAIRoute(name: string, model: string, client: OpenAI = openai): ModelRoute {
  return {
    name,
    provider: "openai",
    model,
    async call(req, timeoutMs) {
      const response = await client.responses.create(
        {
          model,
          instructions: req.instructions,
          input: req.input,
          max_output_tokens: req.maxOutputTokens,
          safety_identifier: safetyId(req.userId),
          store: false, // do not keep application state on the provider side
        },
        { timeout: timeoutMs, signal: req.signal },
      );
      if (response.status === "incomplete") {
        throw new IncompleteOutputError(response.incomplete_details?.reason ?? "unknown");
      }
      return {
        text: response.output_text,
        provider: "openai",
        model: response.model,
        inputTokens: response.usage?.input_tokens ?? 0,
        outputTokens: response.usage?.output_tokens ?? 0,
        cachedTokens: response.usage?.input_tokens_details?.cached_tokens ?? 0,
      };
    },
  };
}
```

- The second argument to `responses.create` holds per-request options:
  `timeout` and `signal` override the client defaults for this attempt.
- `store: false` stops the Responses API from keeping the response as
  application state (it is kept for 30 days by default); retention is
  discussed in [choosing models and providers](choosing-models-and-providers.md).
- `response.output_text` is the SDK's convenience getter that joins the
  text parts of the output.
- A production prompt that must return JSON should use structured outputs
  rather than "reply with JSON" instructions; see
  [structured output and validation](../prompting-and-structured-output/structured-output-and-validation.md).

The Anthropic adapter implements the same interface; only the request
shape and the usage fields differ:

```ts
// src/ai/providers/anthropic.ts
import Anthropic from "@anthropic-ai/sdk";
import { IncompleteOutputError, type ModelRoute } from "../types.js";

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  maxRetries: 0,
  timeout: 20_000,
});

export function anthropicRoute(name: string, model: string, client: Anthropic = anthropic): ModelRoute {
  return {
    name,
    provider: "anthropic",
    model,
    async call(req, timeoutMs) {
      const message = await client.messages.create(
        {
          model,
          max_tokens: req.maxOutputTokens,
          system: req.instructions,
          messages: [{ role: "user", content: req.input }],
        },
        { timeout: timeoutMs, signal: req.signal },
      );
      if (message.stop_reason === "max_tokens" || message.stop_reason === "refusal") {
        throw new IncompleteOutputError(message.stop_reason);
      }
      const text = message.content
        .flatMap((block) => (block.type === "text" ? [block.text] : []))
        .join("");
      return {
        text,
        provider: "anthropic",
        model: message.model,
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
        cachedTokens: message.usage.cache_read_input_tokens ?? 0,
      };
    },
  };
}
```

The equivalents in the Google Gen AI SDK and the Vercel AI SDK, for
comparison:

```ts
// src/ai/providers/equivalents.ts
import { GoogleGenAI, ApiError } from "@google/genai";
import { generateText } from "ai";
import { openai as aiSdkOpenAI } from "@ai-sdk/openai";

// Google Gen AI SDK: retries are OFF unless retryOptions is set; timeout is per attempt.
const genai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: { timeout: 15_000, retryOptions: { attempts: 2 } },
});

export async function geminiDraft(text: string, signal: AbortSignal): Promise<string> {
  try {
    const response = await genai.models.generateContent({
      model: process.env.GEMINI_CHAT_MODEL!, // chosen from the Gemini models page
      contents: text,
      config: {
        systemInstruction: "Turn the user's text into one TaskFlow task as JSON.",
        maxOutputTokens: 300,
        abortSignal: signal,
      },
    });
    return response.text ?? "";
  } catch (err) {
    if (err instanceof ApiError) console.error("gemini_error", err.status, err.message);
    throw err;
  }
}

// Vercel AI SDK: one API over many providers; maxRetries defaults to 2.
export async function aiSdkDraft(text: string, signal: AbortSignal): Promise<string> {
  const { text: draft } = await generateText({
    model: aiSdkOpenAI(process.env.CHAT_MODEL!),
    instructions: "Turn the user's text into one TaskFlow task as JSON.",
    prompt: text,
    maxOutputTokens: 300,
    maxRetries: 0,
    abortSignal: signal,
  });
  return draft;
}
```

In AI SDK 7, `instructions` replaces the older `system` option (still
accepted but deprecated). Framework trade-offs are compared in
[AI frameworks and SDKs](../building-ai-applications/ai-frameworks-and-sdks.md).

### Classifying errors

```ts
// src/ai/errors.ts
// Map any provider SDK error onto one small taxonomy the rest of the app uses.
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { IncompleteOutputError } from "./types.js";

export type FailureKind =
  | "aborted" // our caller cancelled (client disconnected)
  | "timeout" | "network" // no usable response
  | "rate_limited" | "overloaded" | "server" // provider-side, temporary
  | "quota_exhausted" // billing, credits or spend cap: retrying cannot help
  | "auth" | "bad_request" | "not_found" | "incomplete" | "unknown";

export interface Failure {
  kind: FailureKind;
  retryable: boolean; // same route, after a delay
  tryNextRoute: boolean; // another model or provider may succeed
  retryAfterMs?: number;
  status?: number;
  requestId?: string | null;
}

// retry-after-ms (non-standard), then retry-after (seconds or an HTTP date).
export function parseRetryAfter(headers: Headers | undefined, now = Date.now()): number | undefined {
  const ms = Number(headers?.get("retry-after-ms"));
  if (Number.isFinite(ms) && ms > 0) return ms;
  const value = headers?.get("retry-after");
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, date - now);
}

// OpenAI: billing and spend-limit codes (error type often insufficient_quota).
// Anthropic: enforced_spend_limit_reached, billing_error.
const QUOTA_CODES = new Set([
  "insufficient_quota",
  "credit_balance_exhausted",
  "organization_spend_limit_exceeded",
  "project_spend_limit_exceeded",
  "organization_usage_limit_exceeded",
  "enforced_spend_limit_reached",
  "billing_error",
]);

export function classify(err: unknown): Failure {
  if (err instanceof IncompleteOutputError) {
    return { kind: "incomplete", retryable: false, tryNextRoute: false };
  }
  if (err instanceof OpenAI.APIUserAbortError || err instanceof Anthropic.APIUserAbortError) {
    return { kind: "aborted", retryable: false, tryNextRoute: false };
  }
  if (err instanceof OpenAI.APIConnectionTimeoutError || err instanceof Anthropic.APIConnectionTimeoutError) {
    return { kind: "timeout", retryable: true, tryNextRoute: true };
  }
  if (err instanceof OpenAI.APIConnectionError || err instanceof Anthropic.APIConnectionError) {
    return { kind: "network", retryable: true, tryNextRoute: true };
  }
  if (!(err instanceof OpenAI.APIError) && !(err instanceof Anthropic.APIError)) {
    return { kind: "unknown", retryable: false, tryNextRoute: false };
  }

  const status = err.status ?? 0;
  const requestId = err.requestID;
  const retryAfterMs = parseRetryAfter(err.headers);
  const codes = err instanceof OpenAI.APIError ? [err.code, err.type] : [err.errorCode, err.type];
  const base = { status, requestId, retryAfterMs };

  if (status === 429) {
    // A 429 is not always temporary: quota and spend-cap 429s never clear by retrying.
    if (codes.some((c) => c && QUOTA_CODES.has(c))) {
      return { ...base, kind: "quota_exhausted", retryable: false, tryNextRoute: true };
    }
    return { ...base, kind: "rate_limited", retryable: true, tryNextRoute: true };
  }
  if (status === 402) return { ...base, kind: "quota_exhausted", retryable: false, tryNextRoute: true };
  if (status === 503 || status === 529) return { ...base, kind: "overloaded", retryable: true, tryNextRoute: true };
  if (status === 408 || status === 504) return { ...base, kind: "timeout", retryable: true, tryNextRoute: true };
  if (status >= 500) return { ...base, kind: "server", retryable: true, tryNextRoute: true };
  if (status === 401 || status === 403) return { ...base, kind: "auth", retryable: false, tryNextRoute: true };
  if (status === 404) return { ...base, kind: "not_found", retryable: false, tryNextRoute: true };
  return { ...base, kind: "bad_request", retryable: false, tryNextRoute: false }; // 400, 413, 422 ...
}
```

- The abort and connection checks come first because those errors are
  subclasses of `APIError` in both SDKs.
- `requestID` (the provider's `x-request-id` or `request-id`) goes into
  every log line; it is what provider support asks for.
- Error codes evolve, so unknown `429` codes default to "temporary". Keep
  the list of billing codes in one place and review it when the providers'
  error pages change.

### Retries, budget, and fallback in one function

```ts
// src/ai/call-with-fallback.ts
// Retries with full-jitter backoff inside one time budget, then falls back
// to the next route. Every attempt is logged with its classification.
import { setTimeout as sleep } from "node:timers/promises";
import { classify, type Failure } from "./errors.js";
import type { ChatRequest, ChatResult, ModelRoute } from "./types.js";

export interface CallOptions {
  budgetMs: number; // total time the caller can wait, all attempts included
  attemptTimeoutMs: number; // cap for a single attempt
  maxAttemptsPerRoute: number;
  baseDelayMs: number;
  maxDelayMs: number;
  maxRetryAfterMs: number; // a longer Retry-After means: move to the next route
  log?: (entry: Record<string, unknown>) => void;
  random?: () => number; // injectable for tests
}

export class AllRoutesFailedError extends Error {
  constructor(readonly failures: Failure[]) {
    super(`All model routes failed: ${failures.map((f) => f.kind).join(", ")}`);
  }
}

// Full jitter: a random delay between 0 and the exponential ceiling.
export function backoffDelay(attempt: number, o: CallOptions): number {
  const ceiling = Math.min(o.maxDelayMs, o.baseDelayMs * 2 ** (attempt - 1));
  return Math.round((o.random ?? Math.random)() * ceiling);
}

// A tiny circuit breaker per route: skip a route that keeps failing.
const openUntil = new Map<string, number>();
const consecutiveFailures = new Map<string, number>();
const BREAKER_THRESHOLD = 5;
const BREAKER_COOLDOWN_MS = 30_000;

function recordResult(route: ModelRoute, ok: boolean, now: number): void {
  if (ok) {
    consecutiveFailures.delete(route.name);
    return;
  }
  const count = (consecutiveFailures.get(route.name) ?? 0) + 1;
  consecutiveFailures.set(route.name, count);
  if (count >= BREAKER_THRESHOLD) openUntil.set(route.name, now + BREAKER_COOLDOWN_MS);
}

export async function callWithFallback(
  routes: ModelRoute[],
  req: ChatRequest,
  o: CallOptions,
): Promise<ChatResult> {
  const deadline = Date.now() + o.budgetMs;
  const failures: Failure[] = [];

  for (const route of routes) {
    if ((openUntil.get(route.name) ?? 0) > Date.now()) continue; // breaker open

    for (let attempt = 1; attempt <= o.maxAttemptsPerRoute; attempt++) {
      const remaining = deadline - Date.now();
      if (remaining < 1_000) throw new AllRoutesFailedError(failures); // budget spent
      const started = Date.now();
      try {
        const result = await route.call(req, Math.min(o.attemptTimeoutMs, remaining));
        recordResult(route, true, Date.now());
        o.log?.({ route: route.name, model: route.model, attempt, ms: Date.now() - started, ok: true });
        return result;
      } catch (err) {
        const failure = classify(err);
        failures.push(failure);
        recordResult(route, false, Date.now());
        o.log?.({ route: route.name, model: route.model, attempt, ms: Date.now() - started, ok: false, ...failure });

        if (failure.kind === "aborted") throw err; // nobody is waiting any more
        if (!failure.retryable) {
          if (failure.tryNextRoute) break; // e.g. model not found, quota on this provider
          throw err; // e.g. a bad request fails the same way everywhere
        }
        if (attempt === o.maxAttemptsPerRoute) break;

        const delay = failure.retryAfterMs ?? backoffDelay(attempt, o);
        if (delay > o.maxRetryAfterMs || Date.now() + delay >= deadline) break;
        await sleep(delay, undefined, { signal: req.signal });
      }
    }
  }
  throw new AllRoutesFailedError(failures);
}
```

- The attempt timeout shrinks as the budget runs down
  (`Math.min(attemptTimeoutMs, remaining)`), so the last attempt cannot
  overrun the promise made to the user.
- `sleep(..., { signal })` from `node:timers/promises` wakes up early and
  rejects when the request is aborted, so a departed client does not keep
  a backoff timer alive.
- The breaker state is per process. With several API instances each one
  learns separately, which is usually fine; a shared breaker needs Redis.
- The structured log line per attempt (route, model, attempt, duration,
  kind, status, request id) is what makes incidents debuggable; LLM
  tracing is covered in
  [LLM observability and tracing](../evaluation-and-monitoring/llm-observability-and-tracing.md).

### Per-user token quota in MongoDB

```ts
// src/ai/quota.ts
// Per-user daily token budget in MongoDB: reserve before the call, settle after.
import { MongoServerError, type Collection } from "mongodb";

interface UsageDoc {
  userId: string;
  day: string; // UTC date, "2026-11-14"
  tokens: number;
  expiresAt: Date; // TTL index removes old days
}

export class TokenQuota {
  constructor(
    private readonly usage: Collection<UsageDoc>,
    private readonly dailyLimit: number,
  ) {}

  static async ensureIndexes(usage: Collection<UsageDoc>): Promise<void> {
    await usage.createIndex({ userId: 1, day: 1 }, { unique: true });
    await usage.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  }

  // Atomically add `estimate` only if the user stays within the limit.
  async reserve(userId: string, estimate: number, now = new Date()): Promise<boolean> {
    const day = now.toISOString().slice(0, 10);
    try {
      await this.usage.updateOne(
        { userId, day, tokens: { $lte: this.dailyLimit - estimate } },
        {
          $inc: { tokens: estimate },
          $setOnInsert: { expiresAt: new Date(now.getTime() + 2 * 86_400_000) },
        },
        { upsert: true },
      );
      return true;
    } catch (err) {
      // The filter did not match an existing document, so the upsert tried to
      // insert a second {userId, day}: the unique index means "over the limit".
      if (err instanceof MongoServerError && err.code === 11000) return false;
      throw err;
    }
  }

  // Replace the estimate with what the provider actually reported.
  async settle(userId: string, estimate: number, actual: number, now = new Date()): Promise<void> {
    const day = now.toISOString().slice(0, 10);
    await this.usage.updateOne({ userId, day }, { $inc: { tokens: actual - estimate } });
  }
}

// A deliberately rough pre-call estimate (characters / 4 plus the whole
// output allowance). It only has to be safe; settle() corrects it.
export function estimateTokens(text: string, maxOutputTokens: number): number {
  return Math.ceil(text.length / 4) + maxOutputTokens;
}
```

The reservation is a single conditional update, so two concurrent requests
from the same user cannot both slip under the limit. The trick is the
upsert: when the user's document exists but the filter does not match
(because the budget is used up), MongoDB tries to insert a new document
with the same `{ userId, day }`, and the unique index rejects it with a
duplicate-key error, which means "over the limit".

### The Express route with idempotency

```ts
// src/routes/assistant.ts
// POST /api/assistant/parse-task: natural language in, a draft task out.
import express, { type Request, type Response } from "express";
import type { Collection } from "mongodb";
import { AllRoutesFailedError, callWithFallback } from "../ai/call-with-fallback.js";
import { classify } from "../ai/errors.js";
import { estimateTokens, type TokenQuota } from "../ai/quota.js";
import type { ChatResult, ModelRoute } from "../ai/types.js";

interface AiRequestDoc {
  userId: string;
  key: string; // Idempotency-Key sent by TaskFlow Web, one per user action
  status: "pending" | "done";
  result?: ChatResult;
  createdAt: Date; // TTL index: keep for 24 hours
}

const INSTRUCTIONS =
  "Turn the user's text into one TaskFlow task. Reply with JSON only: " +
  '{"title": string, "dueDate": string | null, "priority": "low" | "normal" | "high"}.';
const MAX_INPUT_CHARS = 2_000;
const MAX_OUTPUT_TOKENS = 300;

export function assistantRouter(deps: {
  routes: ModelRoute[];
  quota: TokenQuota;
  aiRequests: Collection<AiRequestDoc>;
}): express.Router {
  const router = express.Router();

  router.post("/api/assistant/parse-task", async (req: Request, res: Response) => {
    const userId = res.locals.userId as string | undefined; // set by the auth middleware
    if (!userId) return res.status(401).json({ error: "Sign in to use the assistant." });

    const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
    if (!text || text.length > MAX_INPUT_CHARS) {
      return res.status(400).json({ error: `Send 1 to ${MAX_INPUT_CHARS} characters of text.` });
    }
    const key = req.get("Idempotency-Key");
    if (!key || key.length > 100) return res.status(400).json({ error: "Missing Idempotency-Key header." });

    // Idempotency: the first request with this key claims it; repeats get the stored result.
    const claim = await deps.aiRequests.findOneAndUpdate(
      { userId, key },
      { $setOnInsert: { userId, key, status: "pending", createdAt: new Date() } },
      { upsert: true, returnDocument: "before" },
    );
    if (claim?.status === "done") return res.json({ draft: claim.result?.text, replayed: true });
    if (claim?.status === "pending") return res.status(409).json({ error: "This request is still running." });

    const estimate = estimateTokens(INSTRUCTIONS + text, MAX_OUTPUT_TOKENS);
    if (!(await deps.quota.reserve(userId, estimate))) {
      await deps.aiRequests.deleteOne({ userId, key });
      return res.status(429).json({ error: "Daily assistant limit reached. It resets at 00:00 UTC." });
    }

    // Stop paying for work nobody will read: abort when the client goes away.
    const controller = new AbortController();
    res.on("close", () => {
      if (!res.writableFinished) controller.abort();
    });

    try {
      const result = await callWithFallback(
        deps.routes,
        { instructions: INSTRUCTIONS, input: text, maxOutputTokens: MAX_OUTPUT_TOKENS, userId, signal: controller.signal },
        { budgetMs: 25_000, attemptTimeoutMs: 15_000, maxAttemptsPerRoute: 2, baseDelayMs: 500, maxDelayMs: 4_000, maxRetryAfterMs: 5_000, log: (e) => console.log(JSON.stringify({ msg: "ai_attempt", userId, ...e })) },
      );
      await deps.quota.settle(userId, estimate, result.inputTokens + result.outputTokens);
      await deps.aiRequests.updateOne({ userId, key }, { $set: { status: "done", result } });
      return res.json({ draft: result.text, model: result.model });
    } catch (err) {
      await deps.quota.settle(userId, estimate, 0); // nothing was produced for the user
      await deps.aiRequests.deleteOne({ userId, key }); // allow a clean retry
      if (controller.signal.aborted) return; // the client has gone; nothing to send
      const kind = err instanceof AllRoutesFailedError ? err.failures.at(-1)?.kind : classify(err).kind;
      if (kind === "bad_request" || kind === "incomplete") {
        return res.status(422).json({ error: "The assistant could not handle this text. Try shorter wording." });
      }
      return res.status(503).json({ error: "The assistant is busy. Please try again in a minute." });
    }
  });

  return router;
}
```

- The route never forwards provider error messages to the browser; they
  can contain request details. It logs them and returns a short message.
- `findOneAndUpdate` with `upsert` and `returnDocument: "before"` returns
  `null` for the first claimant and the existing document for repeats, so
  exactly one request does the work.
- A failed call releases both the key and the reserved tokens, so the
  user's next attempt starts clean. The quota settlement counts tokens
  even when a fallback route served the request.
- The routes come from configuration:

```ts
// src/ai/routes-config.ts
// Model IDs come from configuration, never from code.
import { anthropicRoute } from "./providers/anthropic.js";
import { openAIRoute } from "./providers/openai.js";
import type { ModelRoute } from "./types.js";

export function buildRoutes(env: NodeJS.ProcessEnv = process.env): ModelRoute[] {
  if (!env.CHAT_MODEL) throw new Error("CHAT_MODEL is not set");
  const routes: ModelRoute[] = [openAIRoute("primary", env.CHAT_MODEL)];
  if (env.FALLBACK_MODEL) routes.push(openAIRoute("fallback", env.FALLBACK_MODEL));
  if (env.ANTHROPIC_API_KEY && env.ANTHROPIC_FALLBACK_MODEL) {
    routes.push(anthropicRoute("second-provider", env.ANTHROPIC_FALLBACK_MODEL));
  }
  return routes;
}
```

### Testing failure handling without an API key

Both SDKs accept a `baseURL`, so tests can point them at a local stub
server that returns exactly the responses you want to exercise: a `429`
with `retry-after: 1`, then a `429` with code `insufficient_quota`, then a
successful Anthropic-shaped message. The real SDK turns those responses
into its real error classes, and `classify()` and `callWithFallback()` run
unchanged. This is the attempt log from such a run (keys were dummy
values; no provider was called):

```text
route=primary          attempt=1 ok=false kind=rate_limited    status=429 retryAfterMs=1000
route=primary          attempt=2 ok=false kind=quota_exhausted status=429
route=second-provider  attempt=1 ok=true
elapsed: 1054 ms (includes the 1 s Retry-After wait)
```

The same approach covers the remaining branches: a `400` that must not be
retried or rerouted, a `529` that is retried and then exhausts the routes,
and an Express-level test that sends the same `Idempotency-Key` twice and
checks that the model was called once.

## Best practices

- Keep provider keys on the server, one key per environment, each with a
  spend limit.
- Create one SDK client per process and set `timeout` and `maxRetries`
  explicitly instead of inheriting 10-minute defaults.
- Give every user-facing call a total time budget and make attempt
  timeouts shrink with it.
- Retry in one layer only, with full-jitter backoff, honoring
  `Retry-After`, and never for bad requests or billing errors.
- Classify errors into a small provider-neutral taxonomy and log the kind,
  status, model, route, and provider request id for every attempt.
- Use idempotency keys for user actions and for every side effect a model
  result can trigger.
- Keep model IDs in configuration, and run the evaluation set against
  every route in the fallback list.
- Enforce per-user token budgets, request rates, and concurrency, and send
  a hashed user identifier to the provider.
- Stream long outputs instead of raising timeouts.

## In production

- **Requests hang for minutes during a provider incident.**
  *Detect:* p99 latency of the assistant endpoint jumps to minutes, open
  connections pile up, and attempt logs show few completions. *Cause:* SDK
  default timeouts (10 minutes) with default retries, and no total budget.
  *Fix:* set attempt timeouts from the expected output size, wrap calls in
  a budget, and return a clear "busy" response when it is spent.
- **A provider outage triggers a storm of retries.**
  *Detect:* provider request counts rise while successful completions fall;
  logs show several attempts per user action. *Cause:* SDK retries plus
  application retries plus client retries multiply each other. *Fix:*
  retry in one layer, set `maxRetries: 0` elsewhere, add a circuit breaker,
  and budget retries per request.
- **Every assistant call fails with 429 although traffic is normal.**
  *Detect:* error logs show `429` with `insufficient_quota`,
  `credit_balance_exhausted`, or `enforced_spend_limit_reached`, and no
  `retry-after`. *Cause:* a billing or spend cap, not a rate limit. *Fix:*
  stop retrying these codes, alert the account owner, fall back to another
  route if one is configured, and raise the limit.
- **One user's script degrades the assistant for everyone.**
  *Detect:* rate-limit headers show remaining tokens near zero, and usage
  by user is dominated by one account. *Cause:* no per-user quota or
  concurrency limit. *Fix:* reserve and settle per-user token budgets, add
  a per-minute rate limit and a concurrency cap, and send a hashed
  `safety_identifier`.
- **Users get two different drafts for one click.**
  *Detect:* two model calls with the same user and almost the same
  timestamp; duplicate tasks appear. *Cause:* double submits or client
  retries without idempotency. *Fix:* send an `Idempotency-Key` from TaskFlow
  Web, claim it with a unique index, and replay stored results.
- **The assistant breaks right after a routine deploy-free morning.**
  *Detect:* every request returns `404` for the model, or `400` mentioning
  the model name. *Cause:* the provider retired the model named in
  configuration. *Fix:* fall back on `not_found`, and check the configured
  models daily against each provider's models endpoint, which reports the
  lifecycle (OpenAI's `shutdown_date`; Anthropic's `lifecycle`,
  `deprecated_at`, and `retires_at`), so a replacement is evaluated weeks
  before the shutdown.
- **The fallback model produces malformed tasks.**
  *Detect:* JSON parse failures rise only for requests served by the
  fallback route. *Cause:* the fallback was never evaluated with the
  production prompt. *Fix:* run the same evaluation set against every
  route, and use structured outputs so the schema is enforced.

## Important terminology

- **Attempt timeout:** The maximum time one HTTP request to the provider
  may take.
- **Time budget:** The maximum total time a caller waits, across all
  attempts, backoff sleeps, and fallbacks.
- **Exponential backoff:** Waiting longer after each failed attempt,
  usually doubling up to a cap.
- **Full jitter:** Choosing a random delay between zero and the backoff
  ceiling so clients do not retry in lockstep.
- **Retry-After:** A response header telling the client how long to wait
  before retrying.
- **Rate limit:** A provider cap on requests or tokens per unit of time.
- **Quota or spend cap:** A billing limit; requests fail until credits are
  added or the limit is raised.
- **Idempotency key:** A client-generated identifier that lets the server
  recognize a repeated request and return the original result.
- **Route:** One model at one provider, behind the internal adapter
  interface.
- **Fallback:** Moving a request to the next route after the current one
  fails.
- **Circuit breaker:** A switch that stops sending requests to a failing
  route for a cooldown period.
- **Safety identifier:** A stable, hashed per-user id sent to the provider
  for abuse detection.

## Common mistakes and misconceptions

- Putting the provider key in a frontend environment variable and
  believing the name keeps it private.
- Trusting the SDK defaults and discovering the 10-minute timeout during
  an incident.
- Retrying every error, including `400` requests and billing `429`s.
- Stacking SDK retries, application retries, and client retries.
- Assuming the provider de-duplicates retried generation requests.
- Treating a fallback model as interchangeable without evaluating it.
- Hard-coding model IDs, so a model retirement requires a code change.
- Relying on the provider's organization-wide rate limit as the only
  protection against one abusive user.
- Forwarding raw provider error messages to the browser.

## Revision questions

1. Why must the provider key stay on the server, and what is wrong with a
   `VITE_OPENAI_KEY` variable?
2. What are the default timeout and retry settings of the OpenAI,
   Anthropic, and Google Gen AI SDKs, and why does each matter?
3. Explain the difference between an attempt timeout and a time budget,
   with an example of how they interact.
4. An SDK retries twice and your code wraps it in three attempts, behind a
   load balancer that retries once. How many provider requests can one
   user action produce in the worst case? (Two at the balancer x three in
   your code x three in the SDK = 18.)
5. Which `429` responses should not be retried, and how can code tell them
   apart from ordinary rate limits?
6. Why is calling a model not idempotent, and how does TaskFlow make the
   parse-task endpoint safe to retry?
7. What has to be true before a second provider is added to the fallback
   list?
8. Describe how the MongoDB reservation in `TokenQuota.reserve` stays
   correct when two requests from the same user arrive at once.

## Further learning

- [OpenAI: Rate limits](https://developers.openai.com/api/docs/guides/rate-limits)
- [OpenAI: Error codes](https://developers.openai.com/api/docs/guides/error-codes)
- [OpenAI Node SDK](https://github.com/openai/openai-node)
- [Anthropic: Errors](https://platform.claude.com/docs/en/api/errors)
- [Anthropic: Rate limits](https://platform.claude.com/docs/en/api/rate-limits)
- [Anthropic TypeScript SDK](https://github.com/anthropics/anthropic-sdk-typescript)
- [Gemini API: Rate limits](https://aistudio.google.com/docs/rate-limits)
- [Google Gen AI JavaScript SDK](https://github.com/googleapis/js-genai)
- [AI SDK documentation](https://ai-sdk.dev/docs/introduction)
- [Amazon Builders' Library: Timeouts, retries, and backoff with jitter](https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/)
- Next: [streaming responses end to end](streaming-responses-end-to-end.md). Back to the [hosted model APIs overview](../hosted-model-apis.md).
