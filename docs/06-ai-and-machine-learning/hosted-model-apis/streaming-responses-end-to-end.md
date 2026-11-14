# Streaming Responses End to End

When a TaskFlow user opens a meeting and asks for a summary, the first
words should appear in well under a second, even though the whole summary
takes several seconds to generate. That is streaming: the model provider
sends text as it is produced, and every hop between the provider and the
browser passes it on immediately. This lesson follows one streamed answer
end to end: the provider's server-sent events, the SDK's stream, an
Express relay that re-encodes them for TaskFlow Web, the reverse proxy
that must not buffer them, and the browser code that reads them. It then
covers cancelling generation when the user leaves, backpressure, and what
to do when a stream fails halfway through.

Rendering streamed text in React (stop and regenerate buttons, scroll
behavior, partial markdown) is covered in
[frontend patterns for AI features](../building-ai-applications/frontend-patterns-for-ai-features.md);
this lesson owns the backend relay and the wire format.

## Why it matters

Two numbers describe a model response: **time to first token** (how long
until anything appears) and **total generation time** (how long until the
last token). Generation speed is bounded by the model, so a 600-token
summary takes the same total time whether it is streamed or not. What
streaming changes is perception and control: the user reads from the
first second instead of staring at a spinner, can stop a summary that is
going in the wrong direction, and a long answer never runs into a
non-streaming request timeout.

Streaming also moves failures to awkward places. The HTTP status `200` is
sent before the model has produced anything, so an error that happens
halfway cannot change the status code. A proxy that buffers responses
silently turns the stream back into one late response. A user who closes
the tab leaves the provider generating (and billing) tokens nobody will
read, unless the cancel travels back through every hop. Each of these is
invisible in a quick local test and obvious in production.

## Real-world usage

- **OpenAI streaming events.** The
  [streaming responses guide](https://developers.openai.com/api/docs/guides/streaming-responses)
  describes the Responses API's typed server-sent events, such as
  `response.created`, `response.output_text.delta`, `response.completed`,
  and `error`, which clients handle by type instead of parsing raw chunks.
- **Anthropic streaming events.** The
  [streaming messages page](https://platform.claude.com/docs/en/build-with-claude/streaming)
  documents the event flow (`message_start`, `content_block_delta`,
  `message_delta`, `message_stop`), `ping` events that can appear at any
  time, and error events such as `overloaded_error` that arrive inside a
  stream that started with `200`.
- **nginx buffering by default.** The
  [proxy module documentation](https://nginx.org/en/docs/http/ngx_http_proxy_module.html)
  shows `proxy_buffering on` as the default, explains that buffering can
  be switched off per response with an `X-Accel-Buffering: no` header, and
  that `proxy_read_timeout` (60 seconds by default) applies between two
  successive reads.
- **Compression and SSE.** The README of the Express
  [compression middleware](https://github.com/expressjs/compression)
  warns that it "does not work out of the box with server-sent events"
  because compression buffers output, and that `res.flush()` must be
  called to push data to the client.
- **The SSE format.** The HTML standard's
  [server-sent events section](https://html.spec.whatwg.org/multipage/server-sent-events.html)
  defines the `event:` and `data:` fields, blank-line-terminated messages,
  and comment lines starting with a colon.

**Popular tools and providers:** the streaming helpers in the OpenAI,
Anthropic, and Google Gen AI SDKs; the Vercel AI SDK (`streamText` and UI
message streams); nginx, cloud load balancers, and CDNs on the path;
`fetch` with `ReadableStream` in the browser.

## How it works

### Three streams in a row

A streamed answer passes through three different streams, and each one is
your responsibility to keep flowing:

1. **Provider to backend.** The provider sends server-sent events (SSE)
   over one long HTTP response. The SDK parses them into typed event
   objects and exposes them as an async iterator.
2. **Backend to proxy.** The Express route writes its own SSE events to
   its response as soon as each provider event arrives.
3. **Proxy to browser.** nginx, a load balancer, or a CDN forwards the
   bytes. TaskFlow Web reads them with `fetch` and a stream reader.

![Diagram: five hops from left to right: the model provider sending server-sent events, the SDK stream exposing event objects, the Express relay writing its own SSE events, nginx or a load balancer that must not buffer, and TaskFlow Web reading with fetch and a reader. Under each hop are its settings: typed JSON events with text deltas, completed or failed events, and mid-stream errors; an async iterator read with for await whose signal closes the upstream socket; flushHeaders, X-Accel-Buffering, heartbeat comments, and waiting for drain; proxy_buffering off, a read timeout longer than the longest gap, no gzip on the stream, and HTTP/1.1 upstream; and parsing event blocks, treating a missing done event as a cut-off stream, showing partial text, and aborting on Stop. A dashed arrow shows an abort travelling back from the browser to the provider. A red band warns that one buffering hop turns the stream back into one late response.](sse-relay-path.svg)

The relay re-encodes instead of piping the provider's bytes through. The
provider's events contain internal ids, reasoning summaries, tool-call
fragments, and usage fields the browser should not depend on, and their
format differs per provider. TaskFlow defines three events of its own:

| Event | Data | Meaning |
|---|---|---|
| `delta` | `{"text": "..."}` | Append this text |
| `done` | `{"status": "completed" or "incomplete", ...}` | The answer ended normally, or hit the output limit |
| `error` | `{"message": "...", "partial": true}` | Generation failed; any text shown so far is incomplete |

A small vocabulary like this survives a change of provider or model
without touching TaskFlow Web.

### What the providers send

| Provider and API | Text arrives in | End of answer | Errors inside the stream |
|---|---|---|---|
| OpenAI Responses (`stream: true`) | `response.output_text.delta` (`delta`) | `response.completed`, or `response.incomplete` with a reason such as `max_output_tokens` | `response.failed`, `error` |
| Anthropic Messages (`stream: true`) | `content_block_delta` with a `text_delta` | `message_delta` (with `stop_reason`), then `message_stop` | `error` events such as `overloaded_error`; `ping` events in between |
| Gemini (`generateContentStream`) | Each chunk's `text` | The iterator ends; check `finishReason` on the final chunk's candidate | Thrown by the iterator |

Usage (token counts) arrives at the end: in `response.completed` for
OpenAI and in the cumulative `usage` of `message_delta` for Anthropic.
Quotas and cost tracking from
[calling model APIs from a backend](calling-model-apis-from-a-backend.md)
must read it there, not from a non-streaming response object.

### The SSE wire format

SSE is plain text over a normal HTTP response with
`Content-Type: text/event-stream`. Each message is a set of `field: value`
lines ended by a blank line:

```text
event: delta
data: {"text":"Decision: ship v2 "}

: ping

event: done
data: {"status":"completed"}

```

- `event:` names the message type; without it the type is `message`.
- `data:` carries the payload. Several `data:` lines join with newlines,
  so encoding each payload as one line of JSON avoids framing bugs when
  the text itself contains newlines.
- A line starting with `:` is a comment. Comments are ideal heartbeats:
  they keep idle timers on proxies from firing and are ignored by parsers.

The browser's built-in `EventSource` only makes `GET` requests and cannot
send custom headers such as `Authorization`, and it reconnects
automatically, which would restart a paid generation. TaskFlow Web
therefore uses `fetch` with `POST` and reads the body as a stream.

### Headers, flushing, and compression

Four details decide whether the first byte leaves the server promptly:

- **`Content-Type: text/event-stream`** tells every hop what this is.
- **`Cache-Control: no-cache, no-transform`** stops caches from storing it
  and intermediaries from transforming (and buffering) it.
- **`X-Accel-Buffering: no`** asks nginx not to buffer this one response,
  even if buffering stays on for the rest of the site.
- **`res.flushHeaders()`** sends the status and headers immediately,
  before the first model token, so the browser knows the request was
  accepted.

Response compression is the classic hidden buffer. The `compression`
middleware collects output to compress it efficiently, so either exclude
stream routes from it or call `res.flush()` after every write. Validation,
authentication, and authorization must all happen before
`flushHeaders()`: once the `200` is out, failures can only be reported as
events.

### Proxies, load balancers, and timeouts

![Diagram: three rows on a 0 to 8 second axis with example timings. The provider emits small text chunks steadily from 0.6 seconds to about 6.9 seconds. With buffering off, the browser receives each chunk almost immediately, so the first token is visible at 0.6 seconds. With proxy buffering on, nothing arrives until a buffer fills at about 3.6 seconds, when a burst of text appears at once, and the rest arrives when the response ends at about 7 seconds. The caption notes that the model and its speed are the same; only the time the user first sees words changes.](buffered-vs-streamed-delivery.svg)

With `proxy_buffering on`, nginx reads the upstream response into buffers
of one memory page (4 or 8 KB, depending on the platform) and forwards
them as they fill or when the response ends. Small SSE events then arrive
in bursts. Turning buffering off for the stream location, or sending
`X-Accel-Buffering: no` from Express, restores token-by-token delivery.

Idle timeouts are the second trap. nginx closes an upstream connection
when nothing arrives for `proxy_read_timeout` (60 seconds by default,
measured between two reads, not for the whole response), and cloud load
balancers have their own idle timeouts (60 seconds by default on an AWS
Application Load Balancer, as covered in
[load balancers in depth](../../08-devops-and-deployment/load-balancing-and-multi-server/load-balancers-in-depth.md)).
A reasoning model can think silently for longer than that before its first
text token. A heartbeat comment every 15 seconds keeps every hop's idle
timer from firing without the browser seeing anything. Since nginx 1.29.7
`proxy_http_version` defaults to 1.1; on older versions set it explicitly,
because HTTP/1.0 upstream connections handle long responses poorly.

### Aborting when the client disconnects

![Diagram: a sequence with five lifelines: TaskFlow Web, nginx, the Express relay, the model provider, and MongoDB. Text deltas flow from the provider through Express and nginx to the browser as delta events. The user presses Stop or closes the tab and the browser closes its connection; nginx closes its upstream connection; Express sees its response emit close before it finished and calls controller.abort; the SDK closes the request to the provider, which stops generating; Express saves the partial summary in MongoDB with the status cancelled. The caption warns that without the abort the provider keeps generating output that is billed and never read.](client-disconnect-abort.svg)

A provider keeps generating as long as the connection to it is open, and
output tokens are billed whether or not anyone reads them. The cancel must
therefore travel back through every hop:

1. The browser aborts its `fetch` (Stop button) or the tab closes.
2. nginx, with the default `proxy_ignore_client_abort off`, closes its
   connection to Express.
3. Express emits `close` on the response before it finished. The route
   checks `res.writableFinished` to tell a disconnect from a normal end,
   and calls `controller.abort()`.
4. The SDK request was created with that `signal`, so the SDK closes its
   connection to the provider, and generation stops.

One SDK detail matters here. When the OpenAI SDK's stream is aborted, its
iterator ends quietly instead of throwing (the source comments say it
should "exit without throwing"), so code after the `for await` loop must
check `signal.aborted` to know whether the answer finished. The relay
below does exactly that and records the summary as `cancelled`.

The worked example shows why this matters for cost: if 1,000 users a day
close the tab 2 seconds into a 600-token summary that streams at 100
tokens per second, the remaining 400 tokens each add up to 400,000 output
tokens a day that are generated, billed, and thrown away when the abort is
not wired up.

### Backpressure

`res.write()` returns `false` when the socket's buffer is full, which
happens when a client on a slow mobile connection reads more slowly than
the model writes. Ignoring the return value keeps queueing data in the
Node process's memory. The relay awaits the `drain` event (or `close`, if
the client leaves) before writing more, which also slows how fast it
consumes the provider stream.

### Partial failures

Once streaming has started, failures fall into a few shapes, and each one
needs a deliberate response:

| What happened | How the relay sees it | What it sends | What it stores |
|---|---|---|---|
| Output limit reached | `response.incomplete` (`max_output_tokens`) or `stop_reason: "max_tokens"` | `done` with `status: "incomplete"` | Text, status `incomplete` |
| Provider error mid-stream | `response.failed`, `error`, or an Anthropic `error` event | `error` with `partial: true` | Text so far, status `failed` |
| Upstream connection dropped | The iterator throws | `error` with `partial: true` | Text so far, status `failed` |
| User left | Response `close` before finishing | Nothing (nobody is listening) | Text so far, status `cancelled` |
| A proxy cut the stream | Nothing on the server, or a write error | Nothing arrives | Depends where it was cut |

The browser applies one rule: an answer is complete only if a `done`
event arrived. A stream that ends without `done` was cut off somewhere,
however it ended, and the UI should say so and offer to try again.

Retrying a failed stream is not the same as retrying a normal request.
The user has already seen part of the answer, so a silent retry would
show different text, or the same text twice. The usual choices are:

- **Start over visibly.** Clear the partial text and generate again (a
  "Retry" button). Simple and honest.
- **Resume where it stopped.** OpenAI's background mode
  (`background: true`) keeps a response on the provider side for roughly
  10 minutes, and `responses.retrieve(id, { stream: true, starting_after:
  <sequence number> })` resumes the event stream after a dropped
  connection, as described in the
  [background mode guide](https://developers.openai.com/api/docs/guides/background).
  This requires storing the response id and the last sequence number, and
  it is a provider-specific feature.

Never store a partial answer as if it were complete: a summary saved with
status `completed` after a dropped connection is a silent data-quality
bug that resurfaces later as "the summary is missing the action items".

### Timeouts for streams

A total-time timeout makes little sense for a stream that legitimately
runs for a minute. Two other limits work better: **time to first byte**
(if the provider has not started within N seconds, fail or fall back
before anything was shown) and **maximum idle gap** (if no event arrives
for N seconds, the stream is stuck). Falling back to another model is
only safe before the first `delta` has been sent to the browser.

## When to use and when not to use

| Situation | Stream? | Why |
|---|---|---|
| Summaries, answers, drafts shown to a waiting user | Yes | First words in under a second; Stop saves cost |
| Long outputs (thousands of tokens) | Yes | Avoids long non-streaming timeouts |
| Structured output the server must validate before use | Usually no | The result is only usable once complete; stream progress events instead of tokens |
| Background jobs (nightly summaries, batch work) | No | Nobody is watching; use a queue or a batch API |
| Very short answers (a label, a yes or no) | No | The overhead buys nothing |
| A path through proxies you cannot configure | Test first | A buffering hop removes the benefit |

## Practical examples

### The Express relay

```ts
// src/routes/summary-stream.ts
// POST /api/meetings/:id/summary/stream: relay a model stream to the browser as SSE.
import express, { type Request, type Response } from "express";
import OpenAI from "openai";

export interface SummaryStore {
  loadNotes(userId: string, meetingId: string): Promise<string | null>;
  saveSummary(meetingId: string, text: string, status: "completed" | "incomplete" | "failed" | "cancelled"): Promise<void>;
}

const INSTRUCTIONS =
  "Summarize the meeting notes for the TaskFlow project team: decisions, owners, open questions.";
const HEARTBEAT_MS = 15_000;

// One SSE event. JSON keeps newlines inside the data out of the framing.
function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

// Respect backpressure: wait for "drain" when the socket buffer is full.
async function write(res: Response, chunk: string): Promise<void> {
  if (!res.write(chunk)) {
    await new Promise<void>((resolve) => {
      const done = () => {
        res.off("drain", done);
        res.off("close", done);
        resolve();
      };
      res.on("drain", done);
      res.on("close", done);
    });
  }
}

export function summaryStreamRouter(deps: { client: OpenAI; store: SummaryStore; model: string }): express.Router {
  const router = express.Router();

  router.post("/api/meetings/:id/summary/stream", async (req: Request, res: Response) => {
    const userId = res.locals.userId as string | undefined;
    const meetingId = String(req.params.id);
    if (!userId) return res.status(401).json({ error: "Sign in first." });
    const notes = await deps.store.loadNotes(userId, meetingId); // authorization happens here
    if (!notes) return res.status(404).json({ error: "Meeting not found." });

    // Errors before this point are normal JSON responses. After it, only SSE events.
    res.status(200).set({
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no", // tell nginx not to buffer this response
    });
    res.flushHeaders();

    const controller = new AbortController();
    res.on("close", () => {
      if (!res.writableFinished) controller.abort(); // the browser went away
    });
    const heartbeat = setInterval(() => res.write(": ping\n\n"), HEARTBEAT_MS);

    let text = "";
    let status: "completed" | "incomplete" | "failed" | "cancelled" = "failed";
    try {
      const stream = await deps.client.responses.create(
        { model: deps.model, instructions: INSTRUCTIONS, input: notes, max_output_tokens: 800, stream: true, store: false },
        { signal: controller.signal, timeout: 60_000 },
      );
      for await (const event of stream) {
        if (event.type === "response.output_text.delta") {
          text += event.delta;
          await write(res, sseEvent("delta", { text: event.delta }));
        } else if (event.type === "response.completed") {
          status = "completed";
          await write(res, sseEvent("done", { status, usage: event.response.usage }));
        } else if (event.type === "response.incomplete") {
          status = "incomplete";
          const reason = event.response.incomplete_details?.reason ?? "unknown";
          await write(res, sseEvent("done", { status, reason }));
        } else if (event.type === "response.failed" || event.type === "error") {
          await write(res, sseEvent("error", { message: "The summary stopped early.", partial: text.length > 0 }));
        }
      }
      // An aborted SDK stream ends the loop quietly instead of throwing.
      if (controller.signal.aborted && status !== "completed") status = "cancelled";
    } catch (err) {
      if (controller.signal.aborted) {
        status = "cancelled"; // client left; provider connection already closed by the SDK
      } else {
        console.error(JSON.stringify({ msg: "summary_stream_failed", meetingId, error: String(err) }));
        await write(res, sseEvent("error", { message: "The summary stopped early.", partial: text.length > 0 }));
      }
    } finally {
      clearInterval(heartbeat);
      await deps.store.saveSummary(meetingId, text, status); // never store a partial as completed
      res.end();
    }
  });

  return router;
}
```

- `loadNotes` takes the user id, so authorization happens before the
  `200` is committed; a user cannot stream another team's meeting.
- The `timeout` passed to the SDK covers waiting for the response to
  start; once events flow, the heartbeat and the proxies' idle timeouts
  take over.
- `store: false` and the meeting text: summaries of private notes are
  exactly the content whose retention matters; see
  [choosing models and providers](choosing-models-and-providers.md).
- The `finally` block runs for every outcome, so the status written to
  MongoDB always matches what the user actually received.

### The nginx location for the stream

```text
# /etc/nginx/conf.d/taskflow.conf (excerpt)
location /api/ {
    proxy_pass http://taskflow_api;
    proxy_http_version 1.1;          # default since nginx 1.29.7; explicit for older versions
    proxy_set_header Connection "";  # keep upstream connections reusable
    proxy_set_header Host $host;
}

location ~ ^/api/meetings/[^/]+/summary/stream$ {
    proxy_pass http://taskflow_api;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_set_header Host $host;
    proxy_buffering off;             # pass each event through as it arrives
    proxy_read_timeout 120s;         # longer than the longest silent gap; heartbeats every 15 s
    gzip off;                        # compression buffers output
}
```

The `X-Accel-Buffering: no` header from Express already disables
buffering for this response, so the dedicated location is belt and braces;
it also documents the stream route for whoever maintains the proxy. Other
nginx basics for TaskFlow are in
[running apps with systemd and nginx](../../08-devops-and-deployment/linux-server-operations/running-apps-with-systemd-and-nginx.md).

### Reading the stream in TaskFlow Web

```ts
// src/lib/read-sse.ts (TaskFlow Web)
// Parse a fetch() response body as server-sent events. EventSource cannot
// POST or send an Authorization header, so the web app reads the stream itself.
export interface SseMessage {
  event: string;
  data: string;
}

export async function* readSse(response: Response): AsyncGenerator<SseMessage> {
  if (!response.ok || !response.body) throw new Error(`Stream failed with HTTP ${response.status}`);
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    buffer += value.replace(/\r\n/g, "\n");
    let boundary: number;
    while ((boundary = buffer.indexOf("\n\n")) !== -1) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      let event = "message";
      const data: string[] = [];
      for (const line of block.split("\n")) {
        if (line.startsWith(":")) continue; // comment, e.g. a heartbeat
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
      }
      if (data.length > 0) yield { event, data: data.join("\n") };
    }
  }
}

// Usage: stream a summary; resolve with its final status, or throw if it broke.
export async function streamSummary(
  url: string,
  onText: (t: string) => void,
  signal: AbortSignal,
): Promise<"completed" | "incomplete"> {
  const response = await fetch(url, { method: "POST", signal });
  let status: "completed" | "incomplete" | undefined;
  for await (const msg of readSse(response)) {
    const payload = JSON.parse(msg.data);
    if (msg.event === "delta") onText(payload.text);
    else if (msg.event === "done") status = payload.status;
    else if (msg.event === "error") throw new Error(payload.message);
  }
  // No "done" event means a proxy or the network cut the stream.
  if (!status) throw new Error("The connection closed before the summary finished.");
  return status;
}
```

- `TextDecoderStream` decodes UTF-8 correctly even when a multi-byte
  character is split across two network chunks; decoding each chunk
  separately with `new TextDecoder().decode(chunk)` does not.
- The parser keeps incomplete blocks in `buffer`, because an event can be
  split anywhere between two reads.
- The `signal` comes from the Stop button's `AbortController`; aborting it
  starts the chain shown in the disconnect diagram.

### The same relay with other SDKs

```ts
// src/ai/stream-equivalents.ts
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import { pipeTextStreamToResponse, streamText, toTextStream } from "ai";
import { openai } from "@ai-sdk/openai";
import type { Response } from "express";

const anthropic = new Anthropic({ maxRetries: 0 });
const genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Anthropic: raw events; text arrives in content_block_delta events of type text_delta.
export async function* anthropicText(notes: string, signal: AbortSignal): AsyncGenerator<string> {
  const stream = await anthropic.messages.create(
    { model: process.env.ANTHROPIC_MODEL!, max_tokens: 800, messages: [{ role: "user", content: notes }], stream: true },
    { signal },
  );
  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") yield event.delta.text;
    if (event.type === "message_delta" && event.delta.stop_reason === "max_tokens") yield "\n[truncated]";
  }
}

// Gemini: each chunk is a partial GenerateContentResponse.
export async function* geminiText(notes: string, signal: AbortSignal): AsyncGenerator<string> {
  const stream = await genai.models.generateContentStream({
    model: process.env.GEMINI_CHAT_MODEL!,
    contents: notes,
    config: { maxOutputTokens: 800, abortSignal: signal },
  });
  for await (const chunk of stream) {
    if (chunk.text) yield chunk.text;
  }
}

// Vercel AI SDK: plain text stream piped straight into an Express response.
export async function aiSdkRelay(notes: string, res: Response, signal: AbortSignal): Promise<void> {
  const result = streamText({
    model: openai(process.env.CHAT_MODEL!),
    instructions: "Summarize the meeting notes: decisions, owners, open questions.",
    prompt: notes,
    abortSignal: signal,
  });
  await pipeTextStreamToResponse({ response: res, stream: toTextStream({ stream: result.stream }) });
}
```

The generator versions plug into the same relay loop: replace the OpenAI
event handling with `for await (const text of anthropicText(...))`. AI SDK
7's standalone `pipeTextStreamToResponse` helper writes plain text without
event framing (the older `result.pipeTextStreamToResponse()` method is
deprecated); the UI message stream (`toUIMessageStream` with
`pipeUIMessageStreamToResponse`) carries typed parts for the React hooks
covered in
[frontend patterns for AI features](../building-ai-applications/frontend-patterns-for-ai-features.md).

### Testing the relay without a provider

A stub server that speaks the provider's SSE format lets the real SDK,
the real relay, and the real parser run together locally. The stub reads
the scenario from the request and either streams normally, streams
slowly, drops the connection after two deltas, or ends with
`response.incomplete`. Results from a run of that test suite against the
code on this page (dummy keys, no provider called):

```text
normal      deltas arrived at 99, 143, 189, 234, 279, 325, 375 ms; saved "completed"
slow        browser aborted after 2 deltas; stub saw its connection close after
            4 events of 20; saved "cancelled" with the partial text
drop        stub destroyed the socket after 2 deltas; browser got an "error"
            event; saved "failed" with "Decision: ship v2 "
incomplete  stream ended with response.incomplete; browser resolved "incomplete"
parser      heartbeat comments, CRLF line endings, and an event split across
            two chunks all parsed correctly
```

The "slow" scenario is the important one: it proves that a closed browser
tab really closes the provider connection, which is otherwise hard to see
until the bill arrives.

## Best practices

- Re-encode provider events into a small event vocabulary of your own
  (`delta`, `done`, `error`).
- Authenticate, authorize, and validate before `flushHeaders()`; after
  the `200`, report problems only as events.
- Send `Cache-Control: no-cache, no-transform` and
  `X-Accel-Buffering: no`, and keep compression off stream routes.
- Send a heartbeat comment more often than the shortest idle timeout on
  the path.
- Pass an `AbortSignal` to the SDK and abort it when the response closes
  early; check the signal after the stream loop.
- Respect backpressure with `drain`.
- Treat an answer as complete only after a `done` event, and store partial
  results with an explicit status.
- Use time-to-first-byte and idle-gap limits instead of a total timeout,
  and fall back to another model only before the first token was sent.
- Test streaming through the real proxy chain, not only against
  `localhost`.

## In production

- **The whole summary appears at once after several seconds.**
  *Detect:* `curl -N` against the API directly streams, but through the
  public URL it does not; browser dev tools show one large chunk. *Cause:*
  proxy buffering, response compression, or a CDN that buffers.
  *Fix:* `X-Accel-Buffering: no` or `proxy_buffering off`, disable
  compression on the route, and check CDN settings for streaming.
- **Long answers stop at exactly 60 seconds.**
  *Detect:* streams end at the same duration; proxy logs show upstream
  timeouts; the browser receives no `done`. *Cause:* an idle or read
  timeout on nginx or the load balancer while the model was thinking.
  *Fix:* heartbeat comments every 15 seconds and timeouts longer than the
  longest silent gap.
- **Output token spend is much higher than tokens shown to users.**
  *Detect:* provider usage exceeds the sum of completed summaries; many
  summaries end as abandoned. *Cause:* client disconnects are not
  propagated, so generation continues. *Fix:* abort on response `close`,
  pass the signal to the SDK, and verify with a slow-stream test.
- **Saved summaries are missing their last section.**
  *Detect:* summaries stored as `completed` end mid-sentence. *Cause:* the
  code saved whatever text it had when the loop ended, without checking
  for a completion event. *Fix:* set the status only from `completed` or
  `incomplete` events and store everything else as `failed` or
  `cancelled`.
- **Node memory grows during busy hours.**
  *Detect:* heap usage rises with concurrent streams; slow mobile clients
  correlate with spikes. *Cause:* `res.write()` return values ignored, so
  output queues in memory. *Fix:* await `drain`, and cap concurrent
  streams per user.
- **Users see raw JSON or "undefined" when a stream fails.**
  *Detect:* error reports with fragments of event payloads in the UI.
  *Cause:* a mid-stream provider error was forwarded as a delta, or the
  client did not handle `error` events. *Fix:* map provider errors to an
  `error` event and handle it explicitly in the client.

## Important terminology

- **Server-sent events (SSE):** A text format for a stream of events over
  one long HTTP response.
- **Time to first token:** The delay between sending a request and
  receiving the first generated text.
- **Delta:** A small piece of newly generated text in a stream event.
- **Relay:** A backend route that consumes the provider's stream and
  writes its own stream to the client.
- **Heartbeat:** A periodic comment line that keeps idle connections from
  timing out.
- **Proxy buffering:** A proxy collecting response data before passing it
  on, which delays streamed events.
- **Backpressure:** Slowing the producer when the consumer cannot keep up,
  signalled in Node by `write()` returning `false`.
- **Partial failure:** A stream that ends with an error after some output
  was already delivered.
- **Background mode:** An OpenAI Responses option that runs a response
  asynchronously and allows resuming its event stream.

## Common mistakes and misconceptions

- Believing streaming makes the model faster; it changes when output is
  seen, not how long generation takes.
- Using `EventSource` for a `POST` endpoint with an `Authorization` header.
- Piping the provider's raw events to the browser.
- Forgetting that the `200` is sent before generation, then trying to
  return an error status mid-stream.
- Leaving compression or proxy buffering on for stream routes.
- Not aborting the provider request when the client disconnects.
- Saving a partial answer as complete.
- Retrying silently after some text was already shown.

## Revision questions

1. Which two latency numbers describe a model response, and which one
   does streaming improve?
2. Why does TaskFlow re-encode provider events instead of forwarding them?
3. List the headers the relay sends and what each one prevents.
4. Walk through what happens, hop by hop, when a user closes the tab
   mid-summary.
5. Why must code after an OpenAI SDK stream loop check `signal.aborted`?
6. A proxy has a 60-second idle timeout and a reasoning model can be
   silent for 90 seconds before its first token. What breaks, and what are
   two fixes?
7. An abandoned summary would have produced 600 tokens; users leave after
   about 150 tokens on average, 2,000 times a day. How many output tokens
   a day does aborting save? (2,000 x 450 = 900,000.)
8. How should TaskFlow Web decide whether a summary is complete, and what
   should it do if it is not?

## Further learning

- [OpenAI: Streaming API responses](https://developers.openai.com/api/docs/guides/streaming-responses)
- [OpenAI: Background mode](https://developers.openai.com/api/docs/guides/background)
- [Anthropic: Streaming messages](https://platform.claude.com/docs/en/build-with-claude/streaming)
- [Gemini API: Text generation](https://aistudio.google.com/docs/text-generation)
- [AI SDK: streamText reference](https://ai-sdk.dev/docs/reference/ai-sdk-core/stream-text)
- [HTML standard: Server-sent events](https://html.spec.whatwg.org/multipage/server-sent-events.html)
- [MDN: Using server-sent events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events)
- [nginx: ngx_http_proxy_module](https://nginx.org/en/docs/http/ngx_http_proxy_module.html)
- Next: [prompt caching and batch processing](prompt-caching-and-batch-processing.md). Back to the [hosted model APIs overview](../hosted-model-apis.md).
