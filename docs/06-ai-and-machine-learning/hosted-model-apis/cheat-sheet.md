# Hosted Model APIs Cheat Sheet

Quick revision of the hosted model API lessons, for use before an
interview or a backend, streaming, or cost task.

## Key configuration

```ts
// src/ai/providers/openai.ts (excerpt): one client per process, explicit limits
export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // server-side only
  maxRetries: 0, // one router owns retries, backoff, budget, and fallback
  timeout: 20_000, // per attempt; the request budget is separate
});
```

```ts
// src/routes/summary-stream.ts (excerpt): SSE headers before the first token
res.status(200).set({
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  "X-Accel-Buffering": "no", // nginx must not buffer this response
});
res.flushHeaders();
```

```text
# /etc/nginx/conf.d/taskflow.conf (excerpt): the stream location
proxy_buffering off;       # pass each event through as it arrives
proxy_read_timeout 120s;   # longer than the longest silent gap
gzip off;                  # compression buffers output
```

## Decision guide

| If you need | Choose | Why |
|---|---|---|
| A call from the browser | Your backend calls the provider | Keys in the bundle are public |
| One provider, low volume | SDK retries at 1, a timeout, a budget | Simple and bounded |
| Fallback across models or providers | `maxRetries: 0` plus one router | One layer retries; no multiplication |
| Long answers for a waiting user | Streaming through an SSE relay | First words fast; Stop saves cost |
| Output validated before use | No token streaming | Only usable when complete |
| Large repeated prompt prefixes | Prompt caching, stable content first | Reads cost a fraction of input |
| Work nobody waits for | A batch API (or flex for minutes) | Half price, separate rate limits |
| Different needs per feature | Fast, standard, and deep tiers | Cost and latency match the task |
| Health data | Only routes with a BAA and the HIPAA setup | Fallbacks inherit the requirement |

## Numbers and defaults to remember

| Item | Value |
|---|---|
| OpenAI and Anthropic SDKs | 10 minutes per attempt, 2 retries, backoff 0.5 to 8 s with up to 25% jitter |
| Google Gen AI SDK | No retries unless `retryOptions` is set (then 5 attempts) |
| Retry | Timeouts, `408`, temporary `429`, `500`, `503`, `529`; never `400`, `413`, `422`, auth, or billing errors |
| Billing `429`s | OpenAI `credit_balance_exhausted` and spend-limit codes (type `insufficient_quota`); Anthropic `enforced_spend_limit_reached`, no `retry-after` |
| Stacked retries | Balancer 2 × app 3 × SDK 3 = 18 provider requests |
| Proxies | nginx `proxy_buffering on`, 4 or 8 KB buffers, `proxy_read_timeout` 60 s; ALB idle 60 s; heartbeat every 15 s |
| OpenAI caching | Automatic, 1,024-token minimum (GPT-5.6+), 30 min or 12 h; writes 1.25× or 2.5×, reads 0.1× (up to 95% off) |
| Anthropic caching | Top-level `cache_control` or up to 4 breakpoints; 5 min (refreshed) or 1 h; writes 1.25× or 2×, reads 0.1× (0.05× or 0.025× on newer models) |
| Gemini caching | Implicit on 2.5 and newer; explicit caches 1 h by default, not on Gemini 4 |
| Batch APIs | 50% off; OpenAI within 24 h; Anthropic mostly under 1 h, expires at 24 h; Gemini 24 h target |
| Model lifecycle fields | OpenAI `shutdown_date`; Anthropic `lifecycle`, `deprecated_at`, `retires_at` |
| 2026 changes | Assistants API off August 26; `/v1/prompts` off November 30; Anthropic API `2026-10-21` removed `temperature`, `top_p`, `top_k` |
| Cascade cost | 0.1 + 0.15 × 1.0 = 0.25 of always using the standard tier |

## Top mistakes

- **Putting the key in a `VITE_` variable.** Keep keys on the server and
  set a spend limit per environment.
- **Trusting SDK defaults.** Set `timeout` and `maxRetries`, and wrap each
  call in a total time budget.
- **Retrying every error.** Classify errors; retry only temporary ones,
  and move billing errors to another route.
- **Retrying in several layers.** Retry in one router with full jitter
  and set `maxRetries: 0` elsewhere.
- **Not aborting on disconnect.** Abort on response `close` and check
  `signal.aborted` after the OpenAI stream loop.
- **Buffering stream routes.** Send `X-Accel-Buffering: no`, keep gzip off,
  and send heartbeat comments.
- **Volatile text in a cached prefix.** Put dates, names, and retrieved
  chunks last, and log a prefix fingerprint.
- **Matching batch results by position.** Match by `custom_id`, read the
  error file, and resubmit only failed lines.

## Where to go deeper

- [Calling model APIs from a backend](calling-model-apis-from-a-backend.md)
- [Streaming responses end to end](streaming-responses-end-to-end.md)
- [Prompt caching and batch processing](prompt-caching-and-batch-processing.md)
- [Choosing models and providers](choosing-models-and-providers.md)
- [Interview questions and answers](interview-questions-and-answers.md)

Back to the [Hosted model APIs overview](../hosted-model-apis.md).
