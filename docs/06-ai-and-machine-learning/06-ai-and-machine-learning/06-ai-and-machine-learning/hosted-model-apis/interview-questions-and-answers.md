# Hosted Model APIs Interview Questions and Answers

These questions review calling model APIs from a backend, streaming
responses end to end, prompt caching and batch processing, and choosing
models and providers. Try answering each one before reading the answer.

## Calling model APIs from a backend

### 1. Why should the browser never call a model provider directly with your API key?

The key authorizes spending on your account, and anything shipped to the
browser is public: a key in a Vite variable is compiled into the bundle
whatever its name. The browser should call your backend with its normal
session; the backend authorizes the user, chooses the model and prompt,
enforces quotas, and calls the provider with a server-side key.

### 2. What timeout and retry defaults do the official SDKs ship with?

As of November 2026, the OpenAI and Anthropic SDKs wait up to 10 minutes
per attempt and retry twice, with backoff from 0.5 seconds up to 8
seconds and some jitter. The Google Gen AI SDK does not retry unless
`httpOptions.retryOptions` is set, and its `timeout` applies per attempt.
Set these explicitly instead of inheriting them.

### 3. What is the difference between an attempt timeout and a time budget?

The attempt timeout caps a single HTTP request to the provider. The time
budget caps everything the caller waits for: every attempt, every backoff
sleep, and any fallback. Only the budget matches the product promise, so
attempt timeouts should shrink as the budget runs down.

### 4. Which errors should be retried, and which should not?

Retry temporary failures: timeouts, connection errors, `408`, rate-limit
`429`s, `500`, `503`, and Anthropic's `529` overloaded. Do not retry bad
requests (`400`, `413`, `422`), authentication errors, or billing and
quota `429`s; they fail the same way again. Some non-retryable errors (a
`404` for a retired model, a quota error at one provider) can still go to
another route.

### 5. How can code tell a temporary 429 from one that will not clear?

By the error code and headers. OpenAI uses codes such as
`credit_balance_exhausted` and `organization_spend_limit_exceeded` (often
with the error type `insufficient_quota`) for billing problems and
`slow_down` for ramping too fast. Anthropic's spend-cap `429` carries
`error.details.error_code` `enforced_spend_limit_reached` and no
`retry-after` header. Ordinary rate limits usually come with `Retry-After`.

### 6. What is full jitter, and why use it?

Exponential backoff sets a ceiling that doubles with each attempt, capped
at a maximum; full jitter waits a random time between zero and that
ceiling. Clients that failed together then retry at different moments
instead of in a synchronized wave that hits the provider again.

```ts
const ceiling = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
const delay = Math.random() * ceiling;
```

### 7. Why should retries happen in only one layer?

Because layers multiply. SDK retries inside application retries inside a
proxy or client retry turn one user action into many provider requests,
exactly when the provider is struggling. Amazon's Builders' Library
example: three retries at each of five layers multiplies load on the
failing component by 243. Pick one layer, usually the application, and set
`maxRetries: 0` in the SDK.

### 8. Is calling a model idempotent? How do you make an endpoint safe to retry?

No: each call produces a different answer and a new bill, and the OpenAI
and Anthropic SDKs send no idempotency header for generation requests. The
client sends an `Idempotency-Key` per user action; the backend claims it
with a unique index before calling the model, stores the result, and
replays it for repeats. Side effects triggered by the result need their
own idempotency.

### 9. What is an error taxonomy, and why define one?

A small, provider-neutral set of failure kinds (aborted, timeout,
rate_limited, overloaded, quota_exhausted, auth, not_found, bad_request,
incomplete), each with two decisions attached: retry the same route, and
try another route. The rest of the application acts on the kind, logs
it, and shows a fitting message, without knowing provider-specific error
classes.

### 10. How do fallback routes work, and what makes them safe?

An ordered list of routes (primary model, a cheaper model at the same
provider, optionally another provider) behind one adapter interface. The
router moves to the next route after non-retryable route failures or after
retries are exhausted. It is safe only if every route passes the same
evaluation set and is covered by the same data terms as the primary.

### 11. What does a circuit breaker add to fallback?

It stops paying the attempt timeout on every request while a route is
down. After several consecutive failures, the route is skipped for a
cooldown period, then probed again. Without it, every request waits for
the broken route to time out before falling back.

### 12. Why do you need per-user quotas when providers already rate-limit?

Provider limits apply to your whole account, so one user's script can use
the shared tokens-per-minute budget and break the feature for everyone,
or run up a large bill. Per-user daily token budgets, per-minute request
limits, and concurrency caps protect fairness and cost; a hashed
`safety_identifier` lets the provider's abuse detection target one user.

### 13. How can a token quota be enforced atomically in MongoDB?

Reserve an estimate with one conditional update: filter on
`{ userId, day, tokens: { $lte: limit - estimate } }`, `$inc` the tokens,
and upsert. If the user is over the limit, the filter does not match, the
upsert tries to insert a duplicate `{ userId, day }`, and the unique index
rejects it. After the call, settle the difference between the estimate
and the real usage.

### 14. Why abort the provider call when the client disconnects?

Nobody will read the answer, but the provider keeps generating and
billing until the connection closes. Listening for the response `close`
event (when the response did not finish) and aborting an
`AbortController` whose `signal` was passed to the SDK closes the provider
request.

## Streaming responses end to end

### 15. What does streaming improve, and what does it not?

It improves time to first token and perceived speed, lets users stop a
bad answer, and avoids long non-streaming timeouts. It does not make total
generation faster: the model produces tokens at the same rate either way.

### 16. Describe the three streams in a streamed answer.

Provider to backend: server-sent events parsed by the SDK into typed
events. Backend to proxy: the relay writes its own SSE events as each
provider event arrives. Proxy to browser: nginx, the load balancer, or the
CDN passes bytes through, and the browser reads them with `fetch` and a
stream reader. Any hop that buffers delays everything.

### 17. Why re-encode provider events instead of piping them to the browser?

Provider events contain internal ids, tool-call fragments, reasoning
summaries, and usage fields, and differ by provider. A small vocabulary of
your own (`delta`, `done`, `error`) keeps the browser independent of the
provider and model, and keeps internals private.

### 18. What does the SSE wire format look like?

Plain text with `Content-Type: text/event-stream`. Each message is
`event:` and `data:` lines ended by a blank line; lines starting with `:`
are comments, which make good heartbeats.

```text
event: delta
data: {"text":"Decision: ship v2 "}

: ping

```

### 19. Why does TaskFlow Web use fetch instead of EventSource?

`EventSource` only makes `GET` requests, cannot send custom headers such
as `Authorization`, and reconnects automatically, which would restart a
paid generation. `fetch` with `POST` and a `ReadableStream` reader gives
full control, at the cost of parsing events yourself.

### 20. Which response headers does the relay send, and why?

`Content-Type: text/event-stream`; `Cache-Control: no-cache, no-transform`
so caches do not store it and intermediaries do not transform (and
buffer) it; `X-Accel-Buffering: no` so nginx does not buffer this
response; then `res.flushHeaders()` so the status and headers leave
before the first token.

### 21. How does nginx break streaming, and how do you fix it?

`proxy_buffering` is on by default, so nginx collects the upstream
response in page-sized buffers (4 or 8 KB) and sends text in bursts or at
the end. Turn it off for the stream location or send
`X-Accel-Buffering: no`. Also set `proxy_read_timeout` longer than the
longest silent gap (it defaults to 60 seconds between reads) and keep gzip
off the route.

### 22. Why send heartbeat comments?

Proxies and load balancers close connections that stay idle too long
(nginx's read timeout and an AWS ALB's idle timeout both default to 60
seconds). A reasoning model can be silent longer than that before its
first token. A `: ping` comment every 15 seconds resets idle timers and is
ignored by SSE parsers.

### 23. How does a cancel travel from the browser to the provider?

The browser aborts its `fetch`; nginx (with the default
`proxy_ignore_client_abort off`) closes its upstream connection; Express
emits `close` on the response before it finished; the route calls
`controller.abort()`; the SDK, created with that `signal`, closes its
request to the provider, and generation stops.

### 24. What is the trap in checking for an aborted OpenAI stream?

When the OpenAI SDK's stream is aborted, the `for await` loop ends quietly
instead of throwing. Code after the loop must check `signal.aborted`;
otherwise it treats a cancelled answer as if the stream had ended
normally.

### 25. What is backpressure in a streaming relay, and how is it handled?

When a client reads slowly, `res.write()` returns `false` because the
socket buffer is full. Ignoring it queues data in Node's memory. The relay
waits for `drain` (or `close`) before writing more, which also slows how
fast it reads from the provider.

### 26. How should partial failures be reported once the 200 is sent?

As events. An output limit becomes `done` with `status: "incomplete"`; a
provider error event or a dropped upstream connection becomes `error`
with `partial: true`; a client disconnect is recorded as `cancelled`. The
stored status must match what happened, and a stream with no `done`
event is incomplete by definition.

### 27. Can you retry a stream that failed halfway?

Not silently: the user has seen part of the answer. Either start over
visibly (clear and regenerate), or resume where it stopped if the
provider supports it, such as OpenAI's background mode with
`responses.retrieve(id, { stream: true, starting_after })`. Falling back
to another model is only safe before the first token was sent.

## Prompt caching and batch processing

### 28. What does a prompt cache store, and why only prefixes?

The provider keeps the processed state of a prompt prefix for a while, so
a later request starting with exactly the same tokens skips that work and
pays a reduced rate for it. Processing runs from the beginning of the
prompt, so only an identical beginning can be reused; one changed token
invalidates everything after it.

### 29. How does OpenAI's caching work on current models?

Caching is automatic. On GPT-5.6 and later, implicit mode (the default)
places a breakpoint at the end of the latest eligible message, while
explicit mode caches only blocks marked with `prompt_cache_breakpoint`, up
to four writes per request. `prompt_cache_options.ttl` is `"30m"` or
`"12h"`, the minimum prefix is 1,024 tokens, and usage reports
`cached_tokens` and `cache_write_tokens`.

### 30. How does Anthropic's caching differ?

It is opt-in: a top-level `cache_control` field turns on automatic
caching (the breakpoint moves forward with the conversation), and
`cache_control` on individual blocks sets explicit breakpoints, up to four
per request. Entries live 5 minutes, refreshed on each read, or 1 hour at
a higher write price; the prefix order is tools, then system, then
messages.

### 31. What are Gemini's two caching mechanisms?

Implicit caching is on by default for Gemini 2.5 and newer models, with
savings when requests hit but no guarantee. Explicit caching creates a
cache object with a TTL (1 hour by default) that requests reference via
`cachedContent`; savings are guaranteed and storage is billed for the
lifetime. Explicit caching is not available for Gemini 4 models or the
Interactions API.

### 32. How should a prompt be ordered for caching?

From most stable to least stable: tool definitions, instructions, shared
reference material (versioned), the append-only conversation, and finally
the new input and anything per-request (dates, user names, retrieved
chunks).

### 33. Name three things that silently break prompt caching.

A timestamp or request id in the instructions; non-deterministic
serialization, such as tools or JSON keys in a different order; and
rewriting earlier conversation turns. Per-user content early in the prompt
also splits the cache per user.

### 34. How do you know whether caching works?

Read the usage fields on every response (cached and cache-write tokens)
and track the hit ratio, `cached / input`. Log a hash of the stable prefix
too: if it differs between two requests that should match, something
volatile is in the prefix. On Anthropic, both cache fields at zero mean
the prompt was not cached, often because it is below the model's minimum.

### 35. Work through the value of caching for a reused prefix.

With a write multiplier of 1.25 and a read multiplier of 0.1, a
20,000-token prefix used by 50 questions of 300 tokens costs
`25,000 + 49 x 2,000 + 15,000 = 138,000` input-token equivalents, against
`50 x 20,300 = 1,015,000` without caching: about 14% of the uncached cost.

### 36. Why can a burst of parallel requests all miss the cache?

On Anthropic, a new cache entry only becomes available after the first
response starts. Parallel requests with the same new prefix all write
instead of read. Send one request first and release the rest after it
starts streaming; OpenAI also offers a `prewarm` option.

### 37. When are long cache lifetimes (1 hour, 12 hours) worth it?

Only when the same prefix is reused across gaps longer than the default
lifetime, such as project documents queried all day, or batch jobs with
shared context. Long-lifetime writes cost more, so a prefix read once or
twice loses money.

### 38. What do batch APIs trade, and what do they cost relatively?

They accept many requests at once and return results within a window (up
to 24 hours; Anthropic says most batches finish within an hour) at about
half the interactive price, with separate, higher rate limits. The trade
is latency: the window, not the typical case, is the promise.

### 39. How do you process batch results correctly?

Match each result to its request by `custom_id`, because output order is
not guaranteed. Read both the output file and the error file (OpenAI);
each line can succeed or fail on its own, and expired or cancelled
batches still return what finished. Resubmit only the failed lines, and
make submission idempotent per job and day.

### 40. What is a flex service tier, and when would you use it?

A cheaper tier for ordinary synchronous requests with slower and less
guaranteed processing: OpenAI's Flex processing is priced at Batch API
rates and can return uncharged `429` resource-unavailable errors, and
Gemini's Flex inference offers a 50% reduction with best-effort
availability. It suits work that should finish within minutes, such as
evaluation runs in CI.

## Choosing models and providers

### 41. What goes on a task card, and why write one?

Input size, output format, latency budget, volume, cost of a mistake, and
data sensitivity for one feature. It turns "which model is best?" into
measurable requirements and usually shows that different features need
different tiers.

### 42. What are the dimensions of a model decision matrix?

Capability (measured on your own cases), latency (time to first token and
p95), cost (per successful task, in relative terms), context size (input
and maximum output), and data policy (training use, retention, zero
retention, BAA, region).

### 43. Why compare cost per passing case instead of price per token?

A cheap model that fails often costs extra through retries, escalations,
and human fixes. Dividing the total cost of an evaluation run by the
passing cases captures quality and price together.

### 44. Why not choose models from public leaderboards?

Leaderboards measure other tasks, prompts, and formats. Two models with
similar scores can differ sharply on your JSON schema, citations, or tool
calls. Leaderboards can shortlist; your evaluation set decides.

### 45. What are model tiers, and how are features routed to them?

Two or three classes of model (fast, standard, deep) chosen for different
cost, latency, and quality profiles. A table from feature to tier is the
simplest router: parsing on the fast tier, Q&A and summaries on the
standard tier, agent planning on the deep tier.

### 46. What is a cascade, and when does it work?

Try the cheaper tier, validate the output, and escalate only if
validation fails. If the fast tier costs 0.1 of the standard tier and
passes 85% of the time, the average cost is `0.1 + 0.15 = 0.25` of always
using the standard tier. It works only when a validator can detect bad
output, such as schema or citation checks.

### 47. How do you evaluate candidate models fairly?

Apply hard constraints first, then run the same versioned evaluation set
with the same graders against every candidate, report pass rate, p50 and
p95 latency, and cost per passing case, and give each candidate a short
prompt-tuning pass so a prompt written for one model does not understate
another.

### 48. Where does provider lock-in really come from?

Rarely from the model ID, which is configuration. It comes from the API
shape, prompts tuned to one model, provider-only features (stored state,
hosted prompts, batch formats, caching modes), API version changes, and
contracts such as BAAs and data-processing agreements.

### 49. Give recent examples of provider features changing under applications.

OpenAI's Assistants API shut down on August 26, 2026; reusable prompt
objects (`/v1/prompts`) shut down on November 30, 2026, with the advice to
keep prompts in application code; OpenAI's Evals dashboard became
read-only on the same date. Anthropic's API version `2026-10-21` removed
`temperature`, `top_p`, and `top_k`.

### 50. How do you keep a model choice from becoming an outage?

Keep model IDs in configuration, check the providers' lifecycle fields
daily (OpenAI's `shutdown_date`; Anthropic's `lifecycle`,
`deprecated_at`, `retires_at`), warn weeks ahead, and keep a
pre-evaluated replacement ready. Pin dated model versions where offered,
because an alias can change behavior underneath you.

### 51. When would you pick an open-weight model over a closed hosted one?

When data must stay on infrastructure you control, a model version must
stay frozen for a long time, or steady high volume makes owned capacity
cheaper than per-token prices. The cost is GPU operations, scaling, and
monitoring; closed hosted models usually lead on the hardest tasks and
need no operations.

### 52. Does the provider's data policy depend on how you use it?

Yes. Gemini's unpaid services (AI Studio, the free quota) use content to
improve Google's products, paid services do not; OpenAI's Responses API
keeps application state for 30 days unless `store: false`; zero-retention
arrangements need approval or a contract. Read the terms for the exact
tier and feature.

### 53. What must be true of a fallback for a feature that handles health data?

The fallback provider needs a signed BAA and the HIPAA-ready
configuration it requires (for example Anthropic's HIPAA readiness in the
Console, OpenAI's BAA-eligible endpoints, or Google Cloud's BAA for
covered products), and it must pass the feature's evaluation set.
Otherwise it is not an allowed route for that feature.

## Scenario-based questions

### 54. During a provider incident, assistant requests hang for minutes and API servers run out of connections. What do you check?

**What to check first:** the SDK client options (timeout and retries)
and whether calls have a total time budget.

**How to confirm:** attempt logs show few completions and very long
durations; the client still uses the 10-minute default timeout with two
retries.

**Likely causes and fixes:** SDK defaults and no budget. Set attempt
timeouts from the expected output size, wrap calls in a budget, fall back
or fail with a clear "busy" message, and add a circuit breaker. See
[calling model APIs from a backend](calling-model-apis-from-a-backend.md).

### 55. Every assistant request fails with 429, but traffic is normal. What is going on?

**What to check first:** the error code and headers on the `429`
responses.

**How to confirm:** codes such as `insufficient_quota`,
`credit_balance_exhausted`, or `enforced_spend_limit_reached`, and no
`retry-after` header.

**Likely causes and fixes:** a billing limit or spend cap, not a rate
limit. Stop retrying those codes, alert the account owner, fall back to
another route if one is configured and allowed, and raise the limit. See
[calling model APIs from a backend](calling-model-apis-from-a-backend.md).

### 56. After an outage the provider's dashboard shows many times more requests than user actions. Why?

**What to check first:** how many layers retry: the SDK, application
code, the API gateway, and the client.

**How to confirm:** attempt logs show several provider calls per user
action, each layer retrying independently.

**Likely causes and fixes:** stacked retries multiply load. Retry in one
layer with full jitter and a budget, set `maxRetries: 0` elsewhere, and
add a breaker. See
[calling model APIs from a backend](calling-model-apis-from-a-backend.md).

### 57. Users report duplicate tasks after clicking "Create with assistant" once. What do you check?

**What to check first:** whether requests carry an `Idempotency-Key` and
whether the server de-duplicates it.

**How to confirm:** two model calls with the same user and nearly the
same timestamp; two task inserts.

**Likely causes and fixes:** double submits or client retries without
idempotency. Generate a key per user action, claim it with a unique index,
replay stored results, and make task creation itself idempotent. See
[calling model APIs from a backend](calling-model-apis-from-a-backend.md).

### 58. Summaries appear all at once after several seconds in production, but stream locally. Why?

**What to check first:** response headers and the proxy configuration on
the production path.

**How to confirm:** `curl -N` against the API server directly streams;
through the public URL it does not.

**Likely causes and fixes:** nginx proxy buffering, response compression,
or a buffering CDN. Send `X-Accel-Buffering: no` or set
`proxy_buffering off`, exclude the route from compression, and check CDN
streaming settings. See
[streaming responses end to end](streaming-responses-end-to-end.md).

### 59. Long answers always stop at about 60 seconds. What do you check?

**What to check first:** idle and read timeouts on nginx and the load
balancer, and whether the relay sends heartbeats.

**How to confirm:** streams end at the same duration without a `done`
event; proxy logs show upstream timeouts.

**Likely causes and fixes:** a silent gap (often a reasoning model before
its first token) exceeds a 60-second idle timeout. Send `: ping` comments
every 15 seconds and raise timeouts above the longest gap. See
[streaming responses end to end](streaming-responses-end-to-end.md).

### 60. Output token spend is far higher than the text users actually receive. Why?

**What to check first:** whether client disconnects abort the provider
request.

**How to confirm:** many summaries end as abandoned in logs, yet the
provider reports full-length outputs; a slow-stream test shows the
provider connection staying open after the browser leaves.

**Likely causes and fixes:** no abort propagation. Abort an
`AbortController` on early response `close`, pass its `signal` to the SDK,
and check `signal.aborted` after the stream loop. See
[streaming responses end to end](streaming-responses-end-to-end.md).

### 61. Stored meeting summaries sometimes end mid-sentence but are marked complete. Why?

**What to check first:** how the relay decides the final status.

**How to confirm:** the code saves whatever text exists when the loop
ends; failed or cancelled streams were saved as `completed`.

**Likely causes and fixes:** status not derived from completion events.
Set `completed` or `incomplete` only from the provider's completion
events and store everything else as `failed` or `cancelled`; the client
treats a stream without `done` as cut off. See
[streaming responses end to end](streaming-responses-end-to-end.md).

### 62. Prompt caching was enabled weeks ago, but costs did not change. What do you check?

**What to check first:** the cached-token fields in usage and the prefix
fingerprint in logs.

**How to confirm:** cached tokens are always zero and the fingerprint
differs on every request.

**Likely causes and fixes:** volatile content in the prefix (current
time, user name, request id) or non-deterministic serialization, or a
prompt below the model's minimum. Move volatile content to the end,
stabilize serialization, and check the minimum. See
[prompt caching and batch processing](prompt-caching-and-batch-processing.md).

### 63. Some projects did not get their nightly digest. What do you check?

**What to check first:** the batch's final status and request counts,
and how results are matched.

**How to confirm:** the batch completed or expired with failures; the
collector read only the output file or matched by position.

**Likely causes and fixes:** line-level failures and partial results
ignored. Read the output and error files, match by `custom_id`, and
resubmit the failed lines. See
[prompt caching and batch processing](prompt-caching-and-batch-processing.md).

### 64. Answer quality dropped this week with no code changes. What do you check?

**What to check first:** the configured model IDs and the nightly
evaluation results.

**How to confirm:** the configuration uses an alias, the provider updated
the model behind it, and evaluation scores fell on the same day.

**Likely causes and fixes:** an unpinned model changed. Pin dated model
versions where offered, run the evaluation set nightly, and treat model
changes like deploys with a decision record. See
[choosing models and providers](choosing-models-and-providers.md).

### 65. After an SDK upgrade, every Anthropic request returns 400. Why?

**What to check first:** the error message and the request parameters.

**How to confirm:** the error names `temperature` (or `top_p`, `top_k`),
and the upgraded SDK sends the `2026-10-21` API version.

**Likely causes and fixes:** that API version removed the sampling
parameters. Remove them, rely on prompts and output validation, and pin
SDK upgrades behind the evaluation set. See
[choosing models and providers](choosing-models-and-providers.md).

### 66. An audit finds health data processed by a fallback provider. What happened?

**What to check first:** routing logs for the affected feature and the
fallback list it uses.

**How to confirm:** PHI-bearing requests were served by a route whose
provider has no BAA or HIPAA-ready configuration.

**Likely causes and fixes:** one fallback list shared by all features.
Keep fallback lists per data class, add a test that fails if a non-BAA
route can serve a PHI feature, and follow the incident process. See
[choosing models and providers](choosing-models-and-providers.md).

## Further learning

- [Hosted model APIs overview](../hosted-model-apis.md)
- [Calling model APIs from a backend](calling-model-apis-from-a-backend.md) ·
  [Streaming responses end to end](streaming-responses-end-to-end.md) ·
  [Prompt caching and batch processing](prompt-caching-and-batch-processing.md) ·
  [Choosing models and providers](choosing-models-and-providers.md)
- [OpenAI API documentation](https://developers.openai.com/api/docs)
- [Claude Developer Platform documentation](https://platform.claude.com/docs)
- [Gemini API documentation](https://aistudio.google.com/docs)
