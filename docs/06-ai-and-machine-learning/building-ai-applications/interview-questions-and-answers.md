# Building AI Applications Interview Questions and Answers

These questions review conversation state and memory, frontend patterns
for AI features, AI frameworks and SDKs, and realtime voice applications.
Try answering each one before reading the answer.

## Conversation state and memory

### 1. Does a model remember earlier API requests?

No. Each request is stateless: the model sees only what that request
contains. Memory is state your application stores and sends back (history,
summaries, saved facts), or state a provider holds for you through
features such as `previous_response_id` or a conversation object.

### 2. Where can conversation history live, and which should own it?

In your database (you resend it), with the provider (chained response IDs
or conversation objects), or in a framework checkpointer. For any chat a
user can see, export, or delete, your own database should be the source
of truth; provider state can be an optimization stored next to it.

### 3. How do you compute the input budget for a request?

Take the model's context window from its documentation, subtract the
output tokens you will request, and keep a safety margin:

```text
input budget = (context window - reserved output) x (1 - margin)
(128,000 - 4,000) x 0.95 = 117,800 tokens
```

Without reserving output, a long prompt can leave no room for the answer.

### 4. In what order do you fill the budget?

Fixed parts first (instructions, tool definitions, saved memories, the
rolling summary, the new message), then pinned turns, then the newest
turns until the next one would not fit. Everything older is evicted and
folded into the summary rather than silently dropped.

### 5. Why must a tool call and its result be kept or evicted together?

A tool result is only valid immediately after the assistant turn that
requested it; sending one without the other is rejected by most APIs or
confuses the model. Budgeting code groups each assistant turn with its
tool results and treats the group as one unit.

### 6. Why does resending full history get expensive?

Turn *n* carries roughly *n* turns of history, so total input grows with
the square of the conversation length. At 500 tokens per exchange, 40
turns send 410,000 input tokens in total; capping history at 6,000 tokens
sends about 207,000. Chaining with `previous_response_id` does not avoid
this, because earlier input tokens are still billed.

### 7. What is a rolling summary, and what can go wrong with it?

A stored summary of evicted turns, updated by a background job and saved
with the last sequence number it covers (`throughSeq`). Risks are drift
(details lost or distorted across re-summaries) and races (an older run
overwriting a newer summary). Keep identifiers verbatim, keep raw turns
searchable, and only accept a summary whose `throughSeq` is newer.

### 8. When is server-side compaction a good fit, and when is it not?

It suits agent loops whose history no user reads and that stay on one
provider: the provider shrinks the context automatically past a
threshold. Its output is opaque, so you cannot show it, test it for
drift, or move it to another provider; keep your own summary when the
user owns the conversation.

### 9. What kinds of long-term memory are there, and where does each belong?

Profile facts with a known shape (time zone, preferred view) belong in
structured fields. Free-form facts ("prefers due dates on Fridays") suit a
searchable store with embeddings. Episodic memory is past conversation
summaries. Procedural memory, such as team conventions, belongs in
instructions that people edit.

### 10. How do you keep one user's memories away from another user?

Every memory document carries owner fields, the vector index declares
them as filter fields, and every query adds the owner filter from the
authenticated session in server code, never from the request body or
model output. Add automated tests that query with one user's session and
assert another user's data never appears.

### 11. Why is a stored memory a prompt-injection risk?

Memories are user-influenced text that is replayed into future prompts. A
planted "memory" such as an instruction to email data elsewhere persists
across sessions. Insert memories as labeled data, filter what gets saved,
show users their memories, and let them delete any of them.

### 12. Why store messages in their own collection rather than an array in the conversation document?

A MongoDB document is limited to 16 mebibytes, which long chats with tool
output can approach; every append would rewrite a growing document; and
a streamed reply is easier to update as its own small document. A unique
index on `{ conversationId, seq }` keeps ordering safe.

### 13. How do you make a long AI job resumable?

Return `202 Accepted` with a job ID, make submission idempotent, claim jobs
with a time-limited lease using one atomic update, save a checkpoint after
each step (conditioned on still holding the lease), retry failed steps
with backoff up to a limit, and let any worker claim a job whose lease
expired. Steps run at least once, so make them safe to repeat.

## Frontend patterns for AI features

### 14. Why does streaming matter if the total time is the same?

Perceived speed. A 600-token answer at about 50 tokens per second takes 12
seconds; if the first words arrive after a second, the user reads for 11
of those seconds instead of watching a spinner.

### 15. Why use `fetch` with a stream reader instead of `EventSource` for chat?

`EventSource` only sends GET requests without a body or custom headers, but
a chat turn is a POST with a JSON body. `fetch` exposes the response body
as a `ReadableStream` you can read and parse yourself.

### 16. What must an SSE parser handle?

Network chunks split events, and even multi-byte characters, at arbitrary
points. Buffer decoded text until a blank line ends an event, decode bytes
with `TextDecoder` in streaming mode, skip comment lines used as
keep-alives, and join multi-line `data` fields.

### 17. What does a correct Stop button do?

It aborts the request with an `AbortController`, which closes the
connection; the backend must notice and cancel the provider request, or
generation and billing continue. The UI keeps the partial text and labels
it incomplete, because the user often has what they needed.

### 18. How should regenerate work?

Drop or page past the last answer and request a new one for the same user
message, with a flag so the server does not store the user message twice.
Record which answer the user kept; a regeneration is an implicit thumbs
down on the first.

### 19. What is optimistic UI in a chat, and what must never be optimistic?

Showing the user's message immediately, marked as sending, before the
server confirms it. If the request never reaches the server, the message
stays visible as "not sent" with its text intact for retry. Assistant
content is never faked.

### 20. Why treat a stream that ends without a `done` event as an error?

A proxy timeout or deploy can close the connection cleanly, and the body
simply ends. Without a terminal event the answer may be truncated, so the
UI marks it interrupted and offers retry instead of presenting it as
complete.

### 21. How do you keep long streamed answers from freezing the page?

Batch updates (apply text every 30 to 50 ms; the AI SDK's `useChat` has a
`throttle` option), memoize finished markdown blocks so only the growing
one re-renders, and use a streaming-aware renderer or plain text while
streaming to avoid flicker from half-written syntax.

### 22. Why is rendering model markdown a security issue?

Model output is untrusted; it can carry instructions planted in retrieved
content. Raw HTML becomes script execution, `javascript:` links run code,
and an image URL can carry private data to another server as soon as the
browser loads it (OWASP LLM05, improper output handling).

### 23. How does react-markdown keep output safe, and what do you add?

It builds React elements instead of setting `innerHTML`, does not render
raw HTML unless you add a raw-HTML plugin (`skipHtml` drops it entirely),
and its default `urlTransform` removes unsafe protocols. You add component
overrides: links with `rel="noopener noreferrer nofollow"` and images only
from hosts you control, plus a Content-Security-Policy as a second layer.

### 24. How should a citations UI work?

The server sends sources as structured data with server-built URLs; the
model cites with markers such as `[S2]`; the UI turns known markers into
numbered links to a sources panel with snippets, and removes and counts
markers whose IDs were never retrieved, because those citations are
invented.

### 25. What makes thumbs-up and thumbs-down feedback useful for evaluation?

Context attached by the server: the model ID, prompt version, and trace ID
of the exact answer. Votes are idempotent per user and message. Sampled
thumbs-down cases go to a review queue, and reviewed cases, with personal
data removed, become eval set entries that run in CI.

### 26. How do you make a streaming chat accessible?

Do not make the growing message a live region. Announce state changes
("Assistant is responding", "Response complete") through one
`role="status"` element, set `aria-busy` on the streaming message, keep
focus in the input, make Stop reachable by keyboard, give icon buttons
accessible names, and respect reduced motion.

## AI frameworks and SDKs

### 27. What layers sit between your code and a model provider?

Provider HTTP APIs; official provider SDKs; unified model APIs such as the
Vercel AI SDK; orchestration frameworks such as LangGraph, LangChain, and
LlamaIndex; and agent SDKs that run the tool loop. Each layer up saves
code and adds abstraction you must understand when debugging.

### 28. What do official provider SDKs give you, and what do they not?

Typed requests and responses, streaming helpers, structured-output helpers,
built-in retries (the `openai` client retries twice by default), and day-one
access to new features. They do not give a common shape: OpenAI, Anthropic,
and Google differ in message formats, tool definitions, and events.

### 29. What are the parts of the Vercel AI SDK?

AI SDK Core (`generateText`, `streamText`, `tool()`, `Output.object()`,
`stopWhen`) gives one call shape; provider packages adapt it to each API;
AI SDK UI (`useChat`) consumes its streaming protocol. Provider-specific
settings pass through `providerOptions`.

### 30. What does LangGraph add over a plain agent loop?

A graph runtime with checkpointers that save state after each step: durable
execution (resume after a crash), human-in-the-loop interrupts, and
inspectable history per thread. LangChain v1's `createAgent` is built on
it. Use it when the workflow itself must survive restarts or wait for a
person.

### 31. When is LlamaIndex a good choice?

When retrieval over many document types is the core of the product:
loaders, chunking, indexes, and query engines come ready-made. As of
November 2026 its Python package is the most active; the TypeScript
`@llamaindex/*` packages are marked deprecated on npm, which matters
for a Node backend.

### 32. What do agent SDKs such as the OpenAI Agents SDK provide?

The agent loop (call the model, run requested tools, feed results back,
repeat), handoffs between agents, guardrails, sessions, and tracing. The
OpenAI Agents SDK was still pre-1.0 in November 2026, so expect breaking
changes; in Node.js it traces runs by default.

### 33. Where does framework lock-in actually live?

In what the library owns: stored message and checkpoint formats, prompts
assembled inside library classes, tool definitions written against its
helpers, tracing wired to one vendor, and provider features exposed only
partially. Swapping imports is the easy part.

### 34. How do you limit lock-in?

Put AI behind a small interface your team owns (for example
`parseTask()` and `answerQuestion()`), keep prompts and zod schemas in your
repository, keep conversations in your database, and run evals against the
interface. Adapters for an SDK or framework then become replaceable.

### 35. Why cap agent loops, and how?

A confused model can call tools repeatedly, burning tokens and time. Set a
step or turn limit (`stopWhen: isStepCount(5)` in the AI SDK, `maxTurns`
in the OpenAI Agents SDK), return clear tool errors, and alert on steps
per run.

### 36. Why can adding a framework package break your types?

Frameworks bring their own versions of shared libraries. In November 2026
the LangGraph MongoDB checkpointer depended on the 6.x MongoDB driver, so an
app on driver 7 got two copies and a "MongoClient is not assignable" error.
Check `npm ls <package>` and align versions.

### 37. What maturity signals do you check before adopting a framework?

Release activity and recency, 1.0 status and how often majors arrive, the
language it is primarily developed in, the size of its dependency tree,
whether successors or merges have been announced, and how easy it is to see
the exact requests it sends.

### 38. What does Anthropic recommend about frameworks?

To start with the LLM APIs directly, since many patterns take a few lines
of code, and, when using a framework, to understand the underlying code,
because abstractions can obscure prompts and responses and make debugging
harder.

## Realtime voice applications

### 39. Compare a cascaded pipeline with a speech-to-speech model.

Cascaded (speech-to-text, a text model, text-to-speech) lets you choose each
component and gives text to log and moderate, but adds latency per hop and
loses tone of voice, and is usually cheaper per minute. Speech-to-speech is
faster and more natural, handles interruptions in the session, but costs
more and is harder to inspect.

### 40. When do you use WebRTC, WebSocket, or SIP?

WebRTC for browsers and mobile clients: UDP media with jitter buffering and
echo cancellation. WebSocket between your server and the model, or for
phone media bridges. SIP when a telephony provider routes calls directly to
a model API that accepts them.

### 41. How do you keep the provider key out of the browser in a voice app?

Create the session on the server: the browser posts its WebRTC offer, the
server calls the provider with the real key and returns the answer (the
unified interface), or the server mints a short-lived client secret the
browser uses once.

### 42. What are the audio format numbers to remember?

G.711 phone audio is 8,000 one-byte samples per second, so a 20 ms frame
is 160 bytes. 16-bit PCM at 16 kHz is 32,000 bytes per second, about
42,700 as base64. The Google Live API takes 16 kHz PCM in and sends 24 kHz
out; the OpenAI Realtime API also accepts `audio/pcmu` and `audio/pcma`.

### 43. What dominates voice latency, and what do you do about it?

Often the end-of-turn wait. Tune turn detection first, then stream every
stage, start speech on the first sentence, keep tools off the critical
path with a spoken acknowledgment, deploy close to users and the provider,
and keep the session prefix stable for caching.

### 44. How does silence-based turn detection trade speed for accuracy?

The turn ends after `silence_duration_ms` of quiet, and that time is added
to every reply: with 500 ms, a user who stops at 200 ms is answered no
earlier than 700 ms. Too short cuts people off mid-thought; semantic turn
detection waits longer when the words sound incomplete.

### 45. What are the steps of barge-in handling?

Detect the user's speech, stop playback and discard queued audio
immediately, truncate the stored reply to what was actually heard
(`conversation.item.truncate` with `audio_end_ms`), and cancel the rest of
the generation.

### 46. Why truncate the history after an interruption?

Otherwise the conversation records the full reply, and the model's next
answer assumes the user heard parts they never did, such as a
confirmation question.

### 47. What causes false barge-ins, and how do you reduce them?

Echo of the assistant's own voice into the microphone, and backchannels
such as "uh-huh" or coughs. Keep echo cancellation on, prefer headsets,
raise the VAD threshold, and require a minimum speech duration.

### 48. What are the two generic ways to connect phone calls to a voice model?

Media streaming, where the telephony provider sends audio frames over a
WebSocket to your server, which bridges them to the model with full
control; and SIP, where calls go to a model API that accepts SIP and your
server accepts, configures, transfers, and ends them through webhooks and
API calls.

### 49. What obligations does a phone assistant carry?

Disclosing that it is an AI, consent for recording or transcription as
the caller's jurisdiction requires, transfer to a person, keypad input,
and never handling emergency calls with a bot; plus maximum call lengths
and idle timeouts.

### 50. Why do later minutes of a voice call cost more?

The whole conversation is processed for every reply, so input grows each
turn. In the OpenAI Realtime API, user audio counts as 1 token per 100 ms
and assistant audio as 1 per 50 ms; a 30-turn call with 5-second user and
8-second assistant turns sends about 97,650 input tokens against 4,800
output tokens.

## Scenario-based questions

### 51. Long TaskFlow chats start failing with "context length exceeded". What do you check?

**What to check first:** the token count of failing requests and how the
budget is computed for the model in use.

**How to confirm:** the failures cluster on long conversations or after a
large paste, and the configured window does not match the current model.

**Likely causes and fixes:** no budget, a budget for a different model, or
one oversized message. Read the window per model from configuration,
reserve output tokens, count exactly near the limit, and truncate oversized
messages. See [conversation state and memory](conversation-state-and-memory.md).

### 52. The assistant forgets a decision made earlier in a long chat. What happened?

**What to check first:** whether the decision is in the stored summary or
only in raw messages.

**How to confirm:** the turn was evicted, and the summary either dropped it
or was never updated (summarizer lag).

**Likely causes and fixes:** summary drift or a stalled summarizer. Keep
decisions in a fixed summary section, alert on summarizer lag, and add
long-chat recall cases to the eval set. See
[conversation state and memory](conversation-state-and-memory.md).

### 53. A user reports seeing another user's saved preference. How do you respond?

**What to check first:** the code path that read memories, and whether the
owner filter came from the session.

**How to confirm:** reproduce with two test users; inspect the vector index
for filter fields and the query for the owner filter.

**Likely causes and fixes:** a missing filter field or owner condition, or
an owner ID taken from the request. Treat it as a security incident, fix
the index and the repository layer, and add cross-user tests. See
[conversation state and memory](conversation-state-and-memory.md).

### 54. Meeting summaries are generated twice and users get duplicate notifications. Why?

**What to check first:** job documents with two completion writes and the
lease duration compared with the slowest model call.

**How to confirm:** logs show two workers processing the same job ID after
a lease expired mid-step.

**Likely causes and fixes:** writes not conditioned on the lease owner, or
no lease renewal. Condition every write on `leaseOwner`, renew after each
step, and make the final write idempotent. See
[conversation state and memory](conversation-state-and-memory.md).

### 55. Answers sometimes look complete but end mid-sentence. What do you check?

**What to check first:** client telemetry for streams without a `done`
event.

**How to confirm:** truncations line up with deploys or proxy timeouts.

**Likely causes and fixes:** the UI treats the end of the body as success.
Require the terminal event, mark other endings as interrupted with Retry,
and raise the proxy's streaming timeouts. See
[frontend patterns for AI features](frontend-patterns-for-ai-features.md).

### 56. Users press Stop, but token usage does not drop. Why?

**What to check first:** provider usage for messages stored as stopped.

**How to confirm:** stopped messages show full-length output token counts.

**Likely causes and fixes:** the relay does not cancel the upstream request
when the browser disconnects. Propagate the abort to the provider call and
record stops in telemetry. See
[frontend patterns for AI features](frontend-patterns-for-ai-features.md).

### 57. A security review finds that an assistant answer made the browser load an image from an unknown host. What now?

**What to check first:** CSP violation reports and proxy logs for image
requests, and how markdown images are rendered.

**How to confirm:** a retrieved document contains injected text telling the
model to emit an image URL with data in the query string.

**Likely causes and fixes:** images rendered from any host. Allowlist image
hosts in the renderer, add `img-src` to the CSP, and add the injection case
to the eval set. See
[frontend patterns for AI features](frontend-patterns-for-ai-features.md).

### 58. Thousands of thumbs-down votes, but quality never improves. What is missing?

**What to check first:** what a feedback record contains and whether anyone
reviews it.

**How to confirm:** records lack model, prompt version, or trace ID, and no
eval cases were added from feedback.

**Likely causes and fixes:** feedback is collected but not connected. Attach
context on the server, sample thumbs-down votes into a review queue, and
turn reviewed cases into eval set entries that run in CI. See
[frontend patterns for AI features](frontend-patterns-for-ai-features.md).

### 59. After a minor framework upgrade, answers change though prompts did not. How do you investigate?

**What to check first:** the dependency diff and the outgoing requests
before and after.

**How to confirm:** the framework changed a default prompt, parsing rule, or
retry setting.

**Likely causes and fixes:** unpinned versions and no upgrade gate. Pin
versions, log requests at your adapter boundary, and require the eval suite
to pass on upgrade branches. See [AI frameworks and SDKs](ai-frameworks-and-sdks.md).

### 60. An agent's cost per request spikes overnight. What do you look at?

**What to check first:** steps per run and token usage per step in traces.

**How to confirm:** some runs show dozens of repeated tool calls.

**Likely causes and fixes:** no step limit, or a tool error the model keeps
retrying. Set `stopWhen` or `maxTurns`, return clear tool errors, and alert
on steps per run. See [AI frameworks and SDKs](ai-frameworks-and-sdks.md).

### 61. Adding a checkpointer package produces "MongoClient is not assignable to MongoClient". Why?

**What to check first:** `npm ls mongodb`.

**How to confirm:** two driver versions are installed, one nested under the
framework package.

**Likely causes and fixes:** the package depends on a different major
version of the driver. Align the app's driver with the package, or keep the
framework's connection separate until it supports your version. See
[AI frameworks and SDKs](ai-frameworks-and-sdks.md).

### 62. In the browser voice mode, the assistant keeps interrupting itself. What do you check?

**What to check first:** `speech_started` events that arrive while the
assistant is speaking, and the microphone constraints.

**How to confirm:** recordings show the assistant's own voice in the input,
with no user speech.

**Likely causes and fixes:** echo without echo cancellation. Keep
`echoCancellation` on, suggest headsets, raise the VAD threshold, and
require a minimum speech duration. See
[realtime voice applications](realtime-voice-applications.md).

### 63. Phone callers hear fast, garbled speech, while the browser sounds fine. Why?

**What to check first:** the declared audio formats on both sides of the
phone bridge.

**How to confirm:** a known test tone played through the bridge comes out at
the wrong pitch or speed.

**Likely causes and fixes:** a sample-rate or encoding mismatch, such as
24 kHz PCM sent to an 8 kHz mu-law line. Declare formats explicitly, use
G.711 end to end where the API supports it, otherwise resample with
filtering, and keep a tone test in CI. See
[realtime voice applications](realtime-voice-applications.md).

### 64. Voice replies take over two seconds. Where does the time go?

**What to check first:** per-stage timings from the end of the user's
speech to the first audio played.

**How to confirm:** the end-of-turn wait or a synchronous tool call takes
most of the time.

**Likely causes and fixes:** a conservative silence setting, a tool on the
critical path, or a distant region. Tune turn detection (or use semantic
detection), speak an acknowledgment while tools run, and move the voice
server closer to users and the provider. See
[realtime voice applications](realtime-voice-applications.md).

## Further learning

- [Building AI applications overview](../building-ai-applications.md)
- [Conversation state and memory](conversation-state-and-memory.md) ·
  [Frontend patterns for AI features](frontend-patterns-for-ai-features.md) ·
  [AI frameworks and SDKs](ai-frameworks-and-sdks.md) ·
  [Realtime voice applications](realtime-voice-applications.md)
- [OpenAI API documentation](https://developers.openai.com/api/docs)
- [AI SDK documentation](https://ai-sdk.dev/docs/introduction)
- [OWASP Top 10 for LLM Applications](https://genai.owasp.org/llm-top-10/)
