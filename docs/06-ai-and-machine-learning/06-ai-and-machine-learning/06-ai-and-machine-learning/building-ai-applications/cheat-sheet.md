# Building AI Applications Cheat Sheet

Quick revision after the building-AI-applications lessons, before an
interview or a build task.

## Key commands

| Command | What it does |
|---|---|
| `streamText({ model, instructions, messages, tools, stopWhen: isStepCount(5) })` | AI SDK 7: runs a capped tool loop and streams it |
| `result.toUIMessageStreamResponse()` | Streams the UI message format that `useChat` reads |
| `useChat({ id, transport: new DefaultChatTransport({ api: "/api/chat" }), throttle: 50 })` | React chat state: typed message `parts`, `status`, `stop`, `regenerate` |
| `fetch(url, { method: "POST", body, signal })` plus `res.body.getReader()` | Reads a POST event stream; aborting `signal` is Stop |
| react-markdown with `skipHtml`, its default `urlTransform`, and an `img` allowlist | Renders model markdown with no raw HTML, unsafe links, or leaky images |
| `createIndex({ conversationId: 1, seq: 1 }, { unique: true })` | Catches duplicate message sequence numbers |
| `createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })` | Deletes expired chats with a TTL index |
| `findOneAndUpdate(filter, { $set: { leaseOwner, leaseUntil }, $inc: { attempts: 1 } })` | Claims a job atomically with a lease |
| `npm ls mongodb` | Finds a second driver copy (the LangGraph MongoDB checkpointer wants driver 6) |
| `client.realtime.calls.create({ sdp, session })` | Server turns the browser's WebRTC offer into an OpenAI Realtime session |
| `conversation.item.truncate` with `audio_end_ms` | Tells the model how much of its reply the caller heard |
| `ai.live.connect({ model, config, callbacks })` | Opens a Google Live API session |

## Key configuration

```ts
// src/ai/summaryJobs.ts (excerpt): lease, attempts, and backoff
const LEASE_MS = 60_000;
const MAX_ATTEMPTS = 5;
const backoffMs = Math.min(2 ** job.attempts * 1_000, 5 * 60_000);
// claim: { status: "queued", availableAt <= now } or { status: "running", leaseUntil < now }
// checkpoint: save each partial and renew the lease, conditioned on leaseOwner
```

## Decision guide

| If you need | Choose | Why |
|---|---|---|
| One provider and a few model calls | The official provider SDK | Typed, thinnest layer |
| A React chat UI or many providers in TypeScript | Vercel AI SDK Core plus `useChat` | One call shape and a ready streaming UI protocol |
| A long-running agent with resume or approvals | LangGraph (or Mastra, OpenAI Agents SDK) | Checkpoints and interrupts |
| Retrieval over many document types | LlamaIndex, in Python | Python is active; TypeScript `@llamaindex/*` is deprecated |
| Full control of chat history | Resend history from your database | Portable, editable, deletable; you build the budget |
| Smaller requests on one provider | `previous_response_id` | Earlier input tokens are still billed |
| Voice in a browser or mobile app | WebRTC | Built for lossy networks |
| Server-to-model links or a phone media bridge | WebSocket | Frame-level control |
| A simple phone agent | SIP to the model provider | Standard call control, no frame bridging |
| The lowest voice latency | Speech-to-speech | One model, natural prosody |
| Strict moderation or your own components | Cascaded: speech to text, text model, text to speech | Text in the middle to log, moderate, and test |
| Users who pause mid-sentence | Semantic turn detection | Fixed silence cuts them off |

## Numbers and defaults to remember

| Item | Value |
|---|---|
| Input budget | `(window - reserved output) x (1 - margin)`: (128,000 - 4,000) x 0.95 = 117,800 |
| MongoDB document | 16 MiB limit; the TTL task runs every 60 seconds |
| Summary job | Lease 60 s; 5 attempts; backoff `2^attempts` s, at most 5 minutes |
| OpenAI stored responses | 30 days unless `store: false` |
| `openai` client | Retries twice by default |
| Streaming | 600 tokens at 50 tokens per second = 12 s; the first token is what users feel |
| Re-render batching | Every 30 to 50 ms (`throttle: 50`) |
| Agent loop cap | `isStepCount(5)` (AI SDK) or `maxTurns: 5` (OpenAI Agents SDK) |
| G.711 phone audio | 8,000 bytes per second; a 20 ms frame is 160 bytes |
| PCM16 at 16 kHz | 32,000 bytes per second, about 42,700 as base64 |
| Google Live API | 16 kHz in, 24 kHz out; audio-only sessions 15 minutes without compression |
| OpenAI Realtime audio | User 1 token per 100 ms, assistant 1 per 50 ms; the whole conversation is resent each response |
| Voice latency (illustrative) | Cascaded about 1.25 s, speech-to-speech about 0.9 s; the 500 ms end-of-turn wait dominates |

## Top mistakes

- **Dropping old turns without a summary.** Fold evicted turns into a
  rolling summary.
- **Cutting a tool call from its result.** Keep or evict them as one
  group.
- **Letting the request body or the model choose `userId`.** Filter
  every read by the verified session on the server.
- **`EventSource` for a POST chat, or trusting the end of the body.** Use
  `fetch` with a stream reader; a stream without `done` is an error.
- **A Stop button that only hides the stream.** Abort the request end to
  end and store the partial text as `partial`.
- **`dangerouslySetInnerHTML` or images from any host.** Use
  react-markdown with `skipHtml`, an image allowlist, and a CSP.
- **An agent loop with no cap.** Set `stopWhen` or `maxTurns` and
  authorize every tool call.
- **Keeping the full reply after a barge-in.** Stop playback and send
  `conversation.item.truncate` with the milliseconds heard.

## Where to go deeper

- [Conversation state and memory](conversation-state-and-memory.md)
- [Frontend patterns for AI features](frontend-patterns-for-ai-features.md)
- [AI frameworks and SDKs](ai-frameworks-and-sdks.md)
- [Realtime voice applications](realtime-voice-applications.md)
- [Building AI applications interview questions and answers](interview-questions-and-answers.md)

Back to the [Building AI applications overview](../building-ai-applications.md).
