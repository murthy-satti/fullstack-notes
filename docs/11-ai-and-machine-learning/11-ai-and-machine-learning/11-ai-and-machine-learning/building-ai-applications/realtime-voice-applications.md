# Realtime Voice Applications

TaskFlow's voice mode lets a user say "add a task to send the Q3 deck by
Friday" in the web app, or call a phone number and ask what is due today.
Voice looks like chat with a microphone, but it is a different
engineering problem: audio streams both ways at the same time, replies
must start within about a second, people interrupt, phones carry
low-quality audio, and every extra minute of conversation costs more than
the last.

This lesson covers realtime speech APIs over WebRTC and WebSocket, the
choice between a cascaded speech-to-text, text model, and text-to-speech
pipeline and a single speech-to-speech model, the latency budget,
turn-taking and barge-in, a generic overview of connecting phone calls,
and the relative costs. Speech recognition and synthesis as model tasks
are introduced in [speech and multimodal AI](../speech-and-multimodal-ai.md).

## Why it matters

- **Silence reads as failure.** In a chat window a spinner is tolerable;
  on a call, two seconds of silence makes people say "hello?" and talk
  over the reply. Every stage of the pipeline has to stream.
- **Interruptions are normal.** People cut in to correct a date or skip a
  long answer. A system that keeps talking, or that later assumes the
  caller heard the whole reply, feels broken.
- **Audio fails in new ways.** Echo makes the assistant interrupt itself,
  background noise starts false turns, and a sample-rate mismatch turns
  speech into noise.
- **Cost grows with time, not just words.** Realtime speech APIs bill audio
  by duration, and the conversation so far is processed again for every
  reply, so the tenth minute of a call costs more than the first.
- **Phones bring obligations.** Disclosing that the caller is talking to an
  AI, getting consent before recording, transferring to a person, and never
  handling emergency calls with a bot are product requirements, not
  extras.

## Real-world usage

- **OpenAI Realtime API.** The
  [Realtime API guide](https://developers.openai.com/api/docs/guides/realtime)
  documents WebRTC for browsers and mobile apps and WebSocket for
  server-to-server use; a separate guide covers SIP for telephony. Its
  [WebRTC guide](https://developers.openai.com/api/docs/guides/voice-webrtc?voice-api=realtime)
  describes a "unified interface", where your server creates the session
  from the browser's connection offer, and ephemeral keys as the
  alternative.
- **Interruptions, documented.** OpenAI's
  [realtime conversations guide](https://developers.openai.com/api/docs/guides/realtime-conversations)
  says that when the user interrupts, the client should stop playback
  immediately, discard queued audio, and send `conversation.item.truncate`
  with the number of milliseconds the user actually heard.
- **Google Live API.** The
  [Live API overview](https://aistudio.google.com/docs/live-api) specifies
  16-bit PCM input at 16 kHz and output at 24 kHz over a stateful
  WebSocket, and recommends ephemeral tokens for client connections; its
  [session management guide](https://aistudio.google.com/docs/live-api/session-management)
  limits audio-only sessions to 15 minutes without context compression and
  offers session resumption.
- **Cost behavior.** OpenAI's
  [voice cost optimization guide](https://developers.openai.com/api/docs/guides/voice-latency-cost?voice-api=realtime)
  states that user audio counts as 1 token per 100 ms and assistant audio
  as 1 token per 50 ms, and that the entire conversation is sent to the
  model for each response, so later turns cost more.
- **Open-source pipelines.** [Pipecat](https://docs.pipecat.ai/overview/introduction)
  describes itself as an open source ecosystem for building voice and
  multimodal AI agents, the kind of framework teams use to assemble
  cascaded pipelines from interchangeable speech and model providers.

**Popular tools and providers:** the OpenAI Realtime API, the Google Live
API, Pipecat, LiveKit Agents, the AI SDK's experimental realtime hook,
streaming speech-to-text and text-to-speech services from cloud and
speech vendors, browser WebRTC, and telephony providers that offer phone
numbers, SIP trunks, and media streaming.

## How it works

### Two architectures

![Diagram: top, a cascaded pipeline where microphone audio passes through turn detection, speech to text, a text model with tool calls, and text to speech to the speaker, which lets you choose each component and gives text in the middle to log, moderate, and test, but every hop adds latency and the tone of voice is lost; bottom, speech-to-speech where microphone audio goes to one realtime model with audio in and out and built-in turn detection, tools, and interruptions, giving the lowest latency and natural prosody, but audio tokens cost more than text, there are fewer component choices, and it is harder to inspect.](cascaded-vs-speech-to-speech.svg)

| | Cascaded (STT, text model, TTS) | Speech-to-speech (realtime model) |
|---|---|---|
| Latency | Sum of three streaming stages | Lowest: one model hears and speaks |
| Component choice | Any STT, any text model, any voice | One provider's model and voices |
| Understanding tone | Lost: the model sees a transcript | Kept: hesitation and emphasis reach the model |
| Inspecting and moderating | Easy: text between every stage | Harder: work from transcripts of audio |
| Interruptions | You coordinate STT, model, and TTS | Built in to the session |
| Relative cost | Usually lower per minute; text tokens are cheap | Higher: audio tokens cost more than text |

Many products mix them: speech-to-speech for the conversation, plus a
separate transcription stream for logs, captions, and moderation.

### Transports: WebRTC, WebSocket, and SIP

| Transport | Typical use | Audio | What you handle |
|---|---|---|---|
| WebRTC | Browser and mobile clients | Media tracks; the browser handles codecs, jitter, and echo cancellation | Session creation on your server, a data channel for events |
| WebSocket | Your server to the model | Base64 audio chunks inside JSON events | Buffering, playback position, interruptions, reconnects |
| SIP | Phone calls routed to the model provider | Telephony codecs such as G.711 | Accepting, transferring, and ending calls from your server |

WebRTC runs over UDP with built-in jitter buffering and packet-loss
handling, which suits unreliable mobile networks. A WebSocket runs over
TCP, so one lost packet delays everything behind it; that is fine between
data centers and poor on a phone's cellular connection. Whatever the
transport, the provider API key stays on your server: either the server
creates the session from the browser's offer (the unified interface used
in the examples), or it mints a short-lived client secret that the browser
uses once.

### Audio formats and the numbers behind them

Phone networks carry G.711 audio: 8,000 samples per second, one byte per
sample (mu-law in North America and Japan, A-law elsewhere), so one second
is 8,000 bytes and a 20 ms frame is 160 bytes. Speech models usually want
16-bit PCM at 16 kHz or 24 kHz: one second at 16 kHz is 32,000 bytes, and
base64 inside JSON adds a third, about 42,700 bytes per second. Some
realtime APIs accept G.711 directly (`audio/pcmu` and `audio/pcma` in the
OpenAI Realtime API), which avoids transcoding phone audio; others need it
decoded and resampled, in both directions.

Mismatched rates are a classic bug: 24 kHz audio played as 16 kHz sounds
slow and deep, and 8 kHz audio sent as 16 kHz sounds fast and garbled.

### The latency budget

![Diagram: an example budget from the moment the user stops talking, with illustrative values; the cascaded pipeline spends 500 ms waiting for the end of the turn, 150 ms for the final transcript, 350 ms for the text model's first token, 150 ms for the first synthesized audio, and 100 ms for network and playout, so the reply is heard after about 1.25 seconds; speech-to-speech spends the same 500 ms end-of-turn wait, 300 ms to the model's first audio, and 100 ms for network and playout, about 0.9 seconds; the end-of-turn wait is the largest single item.](voice-latency-budget.svg)

Measure from the moment the user stops talking to the moment they hear the
first syllable of the reply. The values in the diagram are an
illustration, not a benchmark, but the shape is typical: the wait for the
end of the turn is often the largest single item, so tuning turn detection
pays off before buying a faster model. Other levers:

- **Stream every stage.** Feed partial transcripts forward, start speech
  synthesis on the first sentence of the reply, and play audio as it
  arrives.
- **Keep tools off the critical path.** If a lookup takes a second, have
  the assistant say a short acknowledgment ("Let me check your tasks")
  while the tool runs.
- **Make the first sentence short.** Instruct the model to lead with the
  answer; a long preamble delays the useful part.
- **Stay close and warm.** Run the voice server near your users and the
  provider region, and reuse connections.
- **Keep the session prefix stable.** Changing instructions or tools in the
  middle of a session lowers prompt-cache hits, which costs latency and
  money.

General latency techniques are covered in
[latency optimization](../deployment-cost-and-performance/latency-optimization.md).

### Turn-taking

Turn detection decides when the user has finished. Three approaches:

- **Voice activity detection (VAD):** detect speech in the audio and end
  the turn after a set amount of silence. Realtime APIs offer it on the
  server, for example `server_vad` with `silence_duration_ms` in the
  OpenAI Realtime API. A short silence setting replies faster but cuts
  people off when they pause to think; a long one feels sluggish.
- **Semantic turn detection:** a model judges whether the utterance sounds
  complete, so "my task is to..." waits longer than "add a task for
  Friday." The OpenAI Realtime API calls this `semantic_vad`, with an
  `eagerness` setting from `low` to `high`.
- **Push-to-talk:** the user holds a button. It has no false turns and
  suits noisy places, at the cost of a less natural feel.

The energy-based detector in the examples shows the cost of the silence
setting in its real test output: the user stops talking at 200 ms, and
with a 500 ms silence threshold the turn ends at 700 ms. Every millisecond
of that threshold is added to every reply.

### Barge-in

![Diagram: four lifelines for the caller, the playback side, your server, and the realtime model; the model streams reply audio for item_1 to your server, which queues 1,000 ms of frames on the playback side, and the caller has heard 640 ms when they start talking; their audio streams to the model, which emits speech_started; your server tells the playback side to clear the 360 ms not yet played and sends a truncate for item_1 at 640 ms; the model cancels the reply and the stored reply ends where the caller stopped hearing it.](barge-in-sequence.svg)

Barge-in means the user can interrupt the assistant. Handling it well
takes four steps, in this order:

1. **Detect** the user's speech while the assistant is talking (the
   `speech_started` event in server VAD).
2. **Stop the audio now.** Clear the playback queue on the device or phone
   line; every queued millisecond the user still hears makes the system
   feel deaf.
3. **Correct the history.** Tell the model how much of its reply was
   actually heard (`conversation.item.truncate` with `audio_end_ms`), so
   the stored reply ends there and the next answer does not refer to
   things the user never heard.
4. **Cancel generation** of the rest of the reply. With `server_vad`, the
   `interrupt_response` setting lets the server cancel automatically.

Over WebRTC the provider knows what was played and handles much of this;
over WebSocket and phone bridges, your server must track playback, which
is what `PlaybackTracker` in the examples does. Two side problems need
care: **echo**, where the assistant's own voice leaks into the microphone
and triggers barge-in (keep the browser's echo cancellation on and use
headsets where you can), and **backchannels**, where "uh-huh" or a cough
interrupts a reply that should continue (raise the VAD threshold or
require a minimum speech duration).

### Tools in a voice session

A voice assistant uses the same tools as the chat agent (create task,
list tasks due), with voice-specific rules: confirm before any write
("Create 'Send the Q3 deck', due Friday?"), read results as short
sentences rather than lists, and speak dates and IDs naturally. Run tools
on the server: the session can be created by the server, and a server can
attach to the same call by its ID over WebSocket to execute tools and
watch events, so the browser never holds business logic or credentials.
Tool safety is covered in
[tool calling in practice](../tool-calling-and-agents/tool-calling-in-practice.md).

### Connecting phone calls

![Diagram: a caller on the phone network dials a number at a telephony provider that offers phone numbers, carriers, a call control API, and webhooks for call events; option A, media streaming, sends the call's audio frames over a WebSocket to your voice server, which bridges them to a realtime API over WebSocket with 8 kHz phone audio and handles tools, transfers, and logging; option B, SIP to the model provider, routes the call over a SIP trunk to a realtime API that accepts SIP calls and sends a webhook to your server, which accepts and controls the call; in every case the application must support transfer to a person, keypad input, recording and AI notices, and hang-up, and no emergency calls go to a bot.](telephony-integration.svg)

A phone call reaches your application through a telephony provider that
owns the phone numbers and the connection to the public network. There
are two generic integration patterns:

- **Media streaming.** The provider opens a WebSocket to your voice server
  and sends the call's audio as small frames (typically 20 ms of 8 kHz
  G.711), and plays audio frames you send back. Your server bridges them
  to the model and has full control: logging, tools, and custom
  interruption logic. Each provider has its own message format; the
  example uses a neutral one.
- **SIP.** The provider routes the call over a SIP trunk to a model API
  that accepts SIP directly. The API notifies your server with a webhook,
  your server accepts the call and configures the session, and it can
  later transfer the call (SIP REFER) or hang up. Less audio plumbing,
  less control of individual frames.

Both patterns need the same call control: transfer to a person on request
or when the assistant is stuck, keypad (DTMF) input for numbers and menus,
an AI disclosure and, where recording or transcription happens, consent
that follows the laws where the caller is. Emergency numbers must never
reach a bot. Calls also outlive sessions: provider sessions have duration
limits (15 minutes for audio-only Live API sessions without compression),
so long calls need session resumption or a planned handover.

### Relative costs

- **Speech-to-speech audio costs more than text.** A cascaded pipeline pays
  for transcription by duration, the text model by (cheaper) text tokens,
  and synthesis by characters; for long calls it is usually the cheaper
  option, and the slower one.
- **The assistant's voice is denser.** In the OpenAI Realtime API,
  assistant audio counts as 1 token per 50 ms, twice the rate of user
  audio (1 token per 100 ms).
- **Every reply re-reads the conversation.** Input therefore grows with
  each turn, and the tenth minute costs more than the first. A 30-turn call
  where the user speaks 5 seconds (50 tokens) and the assistant 8 seconds
  (160 tokens) per turn adds 210 tokens of history per turn; summing
  210 x (1 + 2 + ... + 30) = 97,650 input tokens across the call, against
  30 x 160 = 4,800 output tokens. Input dominates, so cached prefixes,
  shorter sessions, and truncating or summarizing old turns matter more
  than shorter answers.
- **Silence is mostly free with server VAD**, which filters empty input
  audio, but streaming silence into a manually managed buffer is not.
- **Phones add their own charges:** per-minute telephony costs on top of
  model costs, so a stuck call that never hangs up is expensive. Set
  maximum call durations and idle timeouts.

Cost control in general is covered in
[cost optimization for LLM apps](../deployment-cost-and-performance/cost-optimization-for-llm-apps.md).

## When to use and when not to use

| Choice | Use when | Avoid when |
|---|---|---|
| A voice interface at all | Hands-busy or eyes-busy use, phone support, accessibility | Dense information users must scan or compare: show it on screen |
| Speech-to-speech | Natural conversation where speed matters most | You must inspect or moderate text before it is spoken, or use a specific voice vendor |
| Cascaded pipeline | Component choice, strict moderation, long calls on a budget | Interruption-heavy conversation where every 300 ms matters |
| WebRTC | Browser and mobile clients | Server-to-server bridges |
| WebSocket | Your server to the model, phone media bridges | End-user devices on lossy networks |
| SIP to the model provider | Simple phone agents with standard call control | You need frame-level control or a different model per call stage |
| Semantic turn detection | Users who pause mid-sentence (dictating tasks) | Very short commands where fixed silence is fine |

## Practical examples

The examples type-check against `openai` 7.57, `@google/genai` 3.3, and
`ws`; the audio utilities ran under test, with real output shown. Model
IDs and voices come from configuration: choose a realtime-capable model
from the provider's current model list.

### Create a browser voice session on the server

```ts
// src/voice/voiceRoutes.ts
import express, { Router } from "express";
import OpenAI from "openai";

const client = new OpenAI(); // the real API key never leaves the server

const INSTRUCTIONS = `You are TaskFlow's voice assistant. Keep answers to one or two short
sentences. Read dates as words. Ask before creating or changing a task.`;

export function voiceRoutes() {
  const router = Router();

  // The browser posts its WebRTC SDP offer; we create the session and return the answer.
  router.post("/voice/session", express.text({ type: "application/sdp", limit: "20kb" }), async (req, res) => {
    const answer = await client.realtime.calls.create({
      sdp: req.body as string,
      session: {
        type: "realtime",
        model: process.env.REALTIME_MODEL!, // a realtime model ID from the provider's model list
        instructions: INSTRUCTIONS,
        audio: {
          input: {
            turn_detection: { type: "semantic_vad", eagerness: "auto" },
            transcription: { model: process.env.TRANSCRIPTION_MODEL }, // enables user transcript events
          },
          output: { voice: process.env.REALTIME_VOICE },
        },
      },
    });
    res.type("application/sdp").send(await answer.text());
  });

  return router;
}
```

Put this route behind the same authentication and per-user rate limits
as the chat API: each session is a billable, long-lived connection.

### Connect from the browser with WebRTC

```ts
// src/web/voice/voiceClient.ts
export interface VoiceCallbacks {
  onUserSpeaking(): void;
  onTranscript(role: "user" | "assistant", text: string): void;
  onEnded(reason: string): void;
}

export async function startVoiceSession(cb: VoiceCallbacks) {
  // Echo cancellation keeps the assistant's own voice from triggering barge-in.
  const mic = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });

  const pc = new RTCPeerConnection();
  const speaker = new Audio();
  speaker.autoplay = true;
  pc.ontrack = (e) => { speaker.srcObject = e.streams[0]; };
  pc.addTrack(mic.getTracks()[0], mic);

  const events = pc.createDataChannel("oai-events"); // JSON events in both directions
  events.onmessage = (msg) => {
    const event = JSON.parse(msg.data);
    if (event.type === "input_audio_buffer.speech_started") cb.onUserSpeaking();
    if (event.type === "conversation.item.input_audio_transcription.completed") cb.onTranscript("user", event.transcript);
    if (event.type === "response.output_audio_transcript.done") cb.onTranscript("assistant", event.transcript);
    if (event.type === "error") cb.onEnded(event.error?.message ?? "error");
  };

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  const res = await fetch("/api/voice/session", {
    method: "POST",
    headers: { "Content-Type": "application/sdp" },
    body: offer.sdp,
  });
  if (!res.ok) throw new Error(`Voice session failed: ${res.status}`);
  await pc.setRemoteDescription({ type: "answer", sdp: await res.text() });

  pc.onconnectionstatechange = () => {
    if (pc.connectionState === "failed" || pc.connectionState === "disconnected") cb.onEnded(pc.connectionState);
  };

  return {
    // Push-to-talk style manual interruption, for example a Stop button.
    interrupt: () => events.send(JSON.stringify({ type: "response.cancel" })),
    hangUp: () => { mic.getTracks().forEach((t) => t.stop()); pc.close(); },
  };
}
```

The transcripts feed the visible conversation and accessibility captions,
and the UI shows a clear listening, thinking, and speaking state. Browsers
only grant microphone access on secure (HTTPS) pages after a user gesture,
so start the session from a button.

### Track turns and playback

These two small classes make turn-taking and barge-in concrete. The VAD
is deliberately simple; production systems use the provider's VAD or a
model-based detector.

```ts
// src/voice/turns.ts

// A minimal energy-based end-of-turn detector, to show what server VAD settings
// mean. Production systems use model-based VAD or semantic turn detection.
export class EnergyVad {
  private speaking = false;
  private silentMs = 0;

  constructor(private readonly threshold = 500,        // RMS level that counts as speech
              private readonly silenceDurationMs = 500) {} // pause that ends a turn

  // Feed one frame; returns an event when the user starts or stops speaking.
  push(frame: Int16Array, frameMs: number): "speech_started" | "speech_stopped" | null {
    let sum = 0;
    for (const s of frame) sum += s * s;
    const rms = Math.sqrt(sum / frame.length);
    if (rms >= this.threshold) {
      this.silentMs = 0;
      if (!this.speaking) { this.speaking = true; return "speech_started"; }
      return null;
    }
    if (!this.speaking) return null;
    this.silentMs += frameMs;
    if (this.silentMs >= this.silenceDurationMs) { this.speaking = false; return "speech_stopped"; }
    return null;
  }
}

// Tracks how much of each assistant reply the caller has actually heard, so an
// interruption can cut the stored reply at that point (barge-in).
export class PlaybackTracker {
  private itemId: string | null = null;
  private sentMs = 0;
  private playedMs = 0;

  audioSent(itemId: string, ms: number) {
    if (itemId !== this.itemId) { this.itemId = itemId; this.sentMs = 0; this.playedMs = 0; }
    this.sentMs += ms;
  }

  // Called when the playback side confirms progress (for example a mark that came back).
  played(ms: number) { this.playedMs = Math.min(this.sentMs, this.playedMs + ms); }

  // On interruption: what to keep, and how much queued audio to discard.
  interrupt() {
    if (!this.itemId) return null;
    const result = { itemId: this.itemId, audioEndMs: this.playedMs, discardedMs: this.sentMs - this.playedMs };
    this.itemId = null;
    return result;
  }
}
```

Real test output: ten loud 20 ms frames followed by silence, and a reply
interrupted after 640 ms of 1,000 ms sent:

```text
[ 'speech_started@20ms', 'speech_stopped@700ms' ]
{ itemId: 'item_1', audioEndMs: 640, discardedMs: 360 }
```

### Bridge phone calls over a media WebSocket

The telephony provider connects to this server for each call. Because the
OpenAI Realtime API accepts mu-law in both directions, no transcoding is
needed:

```ts
// src/voice/phoneBridge.ts
import type { WebSocket } from "ws";
import OpenAI from "openai";
import { OpenAIRealtimeWS } from "openai/realtime/ws";
import { PlaybackTracker } from "./turns.js";

// Messages on the telephony media WebSocket. Every provider names these
// differently; this neutral shape stands in for yours.
type PhoneIn =
  | { type: "start"; callId: string }
  | { type: "audio"; payload: string }   // base64 mu-law, 8 kHz, 20 ms
  | { type: "played"; ms: number }       // playback progress reported by the phone side
  | { type: "stop" };
type PhoneOut = { type: "audio"; payload: string } | { type: "clear" };

const client = new OpenAI();
const FRAME_MS = 20;

export function bridgeCall(phone: WebSocket) {
  const model = new OpenAIRealtimeWS({ model: process.env.REALTIME_MODEL! }, client);
  const playback = new PlaybackTracker();
  const toPhone = (m: PhoneOut) => phone.send(JSON.stringify(m));

  model.socket.on("open", () => {
    model.send({
      type: "session.update",
      session: {
        type: "realtime",
        instructions: "You are TaskFlow's phone assistant. Be brief. Offer a transfer to a person.",
        audio: {
          // Phone audio in and out: no transcoding needed with mu-law on both sides.
          input: { format: { type: "audio/pcmu" }, turn_detection: { type: "server_vad", silence_duration_ms: 500 } },
          output: { format: { type: "audio/pcmu" }, voice: process.env.REALTIME_VOICE },
        },
      },
    });
  });

  model.on("response.output_audio.delta", (e) => {
    toPhone({ type: "audio", payload: e.delta });
    playback.audioSent(e.item_id, (Buffer.from(e.delta, "base64").length / 8_000) * 1_000);
  });

  // Barge-in: the caller started talking over the assistant.
  model.on("input_audio_buffer.speech_started", () => {
    const cut = playback.interrupt();
    if (!cut) return;
    toPhone({ type: "clear" }); // drop audio queued on the phone side
    model.send({ type: "conversation.item.truncate", item_id: cut.itemId, content_index: 0, audio_end_ms: cut.audioEndMs });
  });

  model.on("error", (err) => console.error(JSON.stringify({ msg: "realtime error", error: err.message })));

  phone.on("message", (raw) => {
    const msg = JSON.parse(raw.toString()) as PhoneIn;
    if (msg.type === "audio") model.send({ type: "input_audio_buffer.append", audio: msg.payload });
    else if (msg.type === "played") playback.played(msg.ms);
    else if (msg.type === "stop") model.close();
  });
  phone.on("close", () => model.close());
  return { frameMs: FRAME_MS };
}
```

The duration of each chunk comes straight from the format: mu-law is
8,000 bytes per second, so bytes divided by 8 is milliseconds. A
production bridge also records call events with the call ID, enforces a
maximum call length, and implements the transfer tool through the
provider's call control API.

### Convert phone audio for PCM-only models

When the model needs 16-bit PCM (the Live API wants 16 kHz in and sends
24 kHz out), the bridge decodes mu-law and resamples:

```ts
// src/voice/audio.ts
// Phone audio is G.711 mu-law: 8,000 samples per second, 1 byte per sample.
// Many speech models want 16-bit PCM at 16 kHz or 24 kHz instead.

const BIAS = 0x84;
const CLIP = 32_635;

export function muLawDecode(bytes: Uint8Array): Int16Array {
  const out = new Int16Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    const u = ~bytes[i] & 0xff;
    const exponent = (u >> 4) & 0x07;
    const sample = ((((u & 0x0f) << 3) + BIAS) << exponent) - BIAS;
    out[i] = u & 0x80 ? -sample : sample;
  }
  return out;
}

export function muLawEncode(samples: Int16Array): Uint8Array {
  const out = new Uint8Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    let s = samples[i];
    const sign = s < 0 ? 0x80 : 0;
    if (s < 0) s = -s;
    s = Math.min(s, CLIP) + BIAS;
    let exponent = 7;
    for (let mask = 0x4000; (s & mask) === 0 && exponent > 0; mask >>= 1) exponent--;
    const mantissa = (s >> (exponent + 3)) & 0x0f;
    out[i] = ~(sign | (exponent << 4) | mantissa) & 0xff;
  }
  return out;
}

// Linear interpolation is enough for speech going UP in rate (8 -> 16 kHz).
// Going DOWN (24 -> 8 kHz) needs a low-pass filter first, or high frequencies alias.
export function resampleLinear(input: Int16Array, fromRate: number, toRate: number): Int16Array {
  const outLength = Math.round((input.length * toRate) / fromRate);
  const out = new Int16Array(outLength);
  for (let i = 0; i < outLength; i++) {
    const pos = (i * fromRate) / toRate;
    const left = Math.floor(pos);
    const right = Math.min(left + 1, input.length - 1);
    const frac = pos - left;
    out[i] = Math.round(input[left] * (1 - frac) + input[right] * frac);
  }
  return out;
}

export const frameSamples = (rateHz: number, frameMs: number) => (rateHz * frameMs) / 1000;
```

Real test output: a 20 ms phone frame is 160 samples, which becomes 320
samples at 16 kHz and 480 at 24 kHz, and a mu-law round trip of a
speech-level tone stays within about 2.4% of the original samples:

```text
{ worstRelativeError: '0.0238', bytesPerSecond: 8000 }
ok 1 - a 20 ms phone frame: 160 bytes of mu-law, 320 samples at 16 kHz
ok 2 - mu-law round trip keeps speech-level samples within a few percent
```

Mu-law is lossy by design (it spends its bits where speech is), so never
decode, process, and re-encode audio more often than the pipeline needs.

### The same session with the Google Live API

```ts
// src/voice/liveGoogle.ts (the equivalent session with the Google Gen AI SDK)
import { GoogleGenAI, Modality } from "@google/genai";

const ai = new GoogleGenAI({}); // GEMINI_API_KEY on the server

export async function openLiveSession(onAudio: (pcm24k: string) => void, onInterrupted: () => void) {
  const session = await ai.live.connect({
    model: process.env.LIVE_MODEL!, // a Live API model ID from Google's model list
    config: {
      responseModalities: [Modality.AUDIO],
      systemInstruction: "You are TaskFlow's voice assistant. Be brief.",
    },
    callbacks: {
      onmessage: (message) => {
        if (message.serverContent?.interrupted) onInterrupted(); // the user talked over the model
        for (const part of message.serverContent?.modelTurn?.parts ?? []) {
          if (part.inlineData?.data) onAudio(part.inlineData.data); // base64 PCM16, 24 kHz
        }
      },
      onerror: (e) => console.error(JSON.stringify({ msg: "live error", error: e.message })),
      onclose: () => undefined,
    },
  });
  return {
    // Input must be 16-bit PCM at 16 kHz: decode and resample phone audio first.
    sendAudio: (pcm16k: string) => session.sendRealtimeInput({ audio: { data: pcm16k, mimeType: "audio/pcm;rate=16000" } }),
    close: () => session.close(),
  };
}
```

The shape is the same (connect, stream audio in, play audio out, react to
interruptions), but the formats and event names differ. In React apps, the
AI SDK also ships an `experimental_useRealtime` hook (experimental as of
November 2026) that wraps browser capture and playback for realtime
providers.

## Best practices

- Keep provider keys on the server; create sessions server-side or issue
  short-lived client secrets.
- Use WebRTC for end-user devices and WebSocket for server bridges.
- Measure mouth-to-ear latency per stage, and tune turn detection before
  changing models.
- Stream every stage, keep tools off the critical path, and lead replies
  with the answer.
- Implement barge-in fully: stop playback, truncate history to what was
  heard, cancel generation.
- Keep echo cancellation on, and tune VAD thresholds against real
  recordings, including noisy ones.
- Confirm every write action aloud, and offer transfer to a person at any
  time.
- Disclose the AI, handle recording consent, and keep emergency calls away
  from bots.
- Cap call length and idle time, keep the session prefix stable, and
  summarize or truncate long sessions to control cost.
- Store transcripts with the same ownership, retention, and deletion rules
  as chat messages.

## In production

- **The assistant keeps interrupting itself.**
  *Detect:* `speech_started` events while the assistant is speaking with
  no user speech in recordings; replies cut off mid-sentence. *Cause:*
  speaker output leaking into the microphone without echo cancellation.
  *Fix:* keep `echoCancellation` on, prefer headsets, raise the VAD
  threshold, and require a minimum speech duration before barge-in.
- **Users complain they get cut off mid-sentence.**
  *Detect:* short user turns followed by "no, I wasn't finished";
  transcripts that end mid-clause. *Cause:* a silence threshold too short
  for how people dictate tasks. *Fix:* lengthen `silence_duration_ms` or
  switch to semantic turn detection with lower eagerness, and evaluate
  with recorded calls.
- **Replies take two seconds or more.**
  *Detect:* per-stage timings show a long end-of-turn wait or a tool call
  before the first audio. *Cause:* a conservative VAD, a synchronous tool
  on the critical path, or a distant region. *Fix:* tune turn detection,
  speak an acknowledgment while tools run, and move the voice server
  closer to users and the provider.
- **Callers hear fast, garbled, or deep, slow speech.**
  *Detect:* audio sounds wrong only on one path (phone but not browser).
  *Cause:* a sample-rate or encoding mismatch, such as 24 kHz PCM sent to
  an 8 kHz mu-law line. *Fix:* declare formats explicitly on both sides,
  resample with filtering when going down in rate, and add an automated
  test that plays a known tone through the bridge.
- **Long calls drop at the same point.**
  *Detect:* disconnects clustered at a fixed duration. *Cause:* a provider
  session limit, such as 15 minutes for audio-only Live API sessions
  without compression. *Fix:* enable context compression or session
  resumption, or hand over to a new session with a summary.
- **Voice costs grow faster than call volume.**
  *Detect:* cost per call minute rises with call length; a few long or
  stuck calls dominate spend. *Cause:* the whole conversation is processed
  for every reply, plus calls that never hang up. *Fix:* cap call
  duration, add idle timeouts, keep instructions stable for caching, and
  truncate or summarize old turns.
- **The conversation log is missing what the user said.**
  *Detect:* assistant transcripts are stored but user turns are empty.
  *Cause:* input transcription was never enabled in the session. *Fix:*
  configure input transcription and store both sides with the call ID.

## Important terminology

- **Realtime speech API:** A model API that streams audio in and out over a
  long-lived connection.
- **Cascaded pipeline:** Speech-to-text, a text model, and text-to-speech
  chained together.
- **Speech-to-speech model:** One model that takes audio in and produces
  audio out.
- **WebRTC:** The browser standard for real-time media over UDP, with
  jitter buffering and echo cancellation.
- **SDP offer and answer:** The messages two WebRTC peers exchange to agree
  on media formats and network paths.
- **Voice activity detection (VAD):** Detecting when speech starts and
  stops in an audio stream.
- **Semantic turn detection:** Ending a turn when the words sound complete,
  not only after a fixed silence.
- **Barge-in:** The user interrupting the assistant while it speaks.
- **Mouth-to-ear latency:** Time from the user finishing speaking to
  hearing the first audio of the reply.
- **G.711 (mu-law, A-law):** The 8 kHz, 8-bit telephony audio encodings.
- **SIP trunk:** A connection that carries phone calls between a telephony
  provider and another system over SIP.
- **DTMF:** The tones produced by phone keypad presses.

## Common mistakes and misconceptions

- Putting the provider API key in the browser instead of creating sessions
  on the server.
- Using a WebSocket from mobile clients on lossy networks.
- Blaming the model for latency that comes from the end-of-turn wait.
- Stopping playback on interruption but leaving the full reply in the
  history, so the model assumes the user heard it.
- Turning off echo cancellation, then fighting self-interruptions with
  VAD tweaks.
- Sending audio at the wrong sample rate or encoding.
- Letting the assistant act on spoken commands without confirming writes.
- Forgetting AI disclosure, recording consent, transfer to a person, or
  emergency-call handling on phone lines.
- Estimating voice cost from output length, when input grows with every
  turn.

## Revision questions

1. Compare a cascaded pipeline with a speech-to-speech model on latency,
   control, moderation, and relative cost.
2. Why is WebRTC preferred for browsers and mobile clients, and a
   WebSocket for server-to-server bridges?
3. How many bytes per second does 16 kHz 16-bit PCM need, and how many as
   base64 in JSON? How many bytes is a 20 ms G.711 frame? (Answer: 32,000;
   about 42,700; 160.)
4. Using the example budget, which single change would cut the most
   latency, and what is the trade-off?
5. List the four steps of barge-in handling and explain why truncating the
   history matters.
6. A 20-turn call has user turns of 4 seconds and assistant turns of 6
   seconds, with all audio kept in the conversation. Estimate total input
   and output audio tokens using 1 token per 100 ms for the user and 1
   per 50 ms for the assistant. (Answer: 40 + 120 = 160 tokens of history
   per turn; input about 160 x 210 = 33,600 tokens; output 20 x 120 =
   2,400 tokens.)
7. Describe the media-streaming and SIP patterns for phone calls and what
   your server controls in each.
8. Which obligations does a phone voice assistant carry that a chat
   assistant does not?

## Further learning

- [OpenAI: Realtime API](https://developers.openai.com/api/docs/guides/realtime)
- [OpenAI: Realtime conversations](https://developers.openai.com/api/docs/guides/realtime-conversations)
- [OpenAI: Voice cost optimization](https://developers.openai.com/api/docs/guides/voice-latency-cost?voice-api=realtime)
- [Google: Live API](https://aistudio.google.com/docs/live-api) and
  [session management](https://aistudio.google.com/docs/live-api/session-management)
- [MDN: WebRTC API](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API)
- [Pipecat documentation](https://docs.pipecat.ai/overview/introduction)
- [LiveKit Agents](https://docs.livekit.io/agents/)
- Next: [interview questions and answers](interview-questions-and-answers.md). Back to the [building AI applications overview](../building-ai-applications.md).
