# Privacy, PII, and Data Retention

Every call to a hosted model copies data out of your system. The meeting
notes TaskFlow summarizes contain names, email addresses, phone numbers,
and sometimes things nobody meant to paste, such as card numbers or API
keys. Those notes travel to the model provider, and from there into
abuse-monitoring logs, caches, and stored state, while your own system
adds copies in logs, traces, vector stores, and evaluation sets.

This lesson shows how to map those copies, how to minimize and redact
personal data before it leaves the API (with redaction code that was run
and tested), what the major providers say about retention, training, and
zero-retention options as of November 2026, how to keep logs and traces
free of content, how to erase one user's data everywhere, and how data
residency works in practice. It describes engineering controls; what the
law requires of your product depends on where you operate, so confirm
obligations with your privacy or legal team.

## Why it matters

Privacy law and customer contracts turn these copies into obligations.
The EU's [General Data Protection Regulation](https://eur-lex.europa.eu/eli/reg/2016/679/oj)
requires personal data to be "limited to what is necessary" (data
minimisation, Article 5), kept no longer than needed (storage
limitation), and erased on request in many cases (Article 17). Enterprise
customers ask the same questions in security reviews: which providers see
our data, is it used for training, how long is it kept, where is it
processed, and can you delete it?

The technical risk is just as concrete. Prompts often contain more than
the feature needs, logs keep content long after the request, and
derived copies such as embeddings and cached answers are easy to forget
when a user asks to be deleted. A secret pasted into a note and sent to
a provider is a leaked secret. Answering these questions well is mostly
a matter of design: send less, keep less, and know where every copy is.

## Real-world usage

- **OpenAI.** The [data controls guide](https://developers.openai.com/api/docs/guides/your-data)
  states that data sent to the API "is not used to train or improve
  OpenAI models" unless you opt in, that abuse-monitoring logs are kept
  "for up to 30 days", and that Zero Data Retention and Modified Abuse
  Monitoring require prior approval. Stored responses are kept for at
  least 30 days unless `store: false`; files, vector stores, and
  conversations are kept until you delete them. The
  [data residency guide](https://developers.openai.com/api/docs/guides/data-residency)
  lists ten regions; a project's region is chosen when it is created.
- **Anthropic.** The [API and data retention page](https://platform.claude.com/docs/en/manage-claude/api-and-data-retention)
  says retained data "is never used for model training without your
  express permission" and offers ZDR by agreement. Anthropic's
  [privacy center](https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data)
  says inputs and outputs are deleted "within 30 days", except, for
  example, content flagged for policy violations (up to two years).
- **Google.** The [Gemini API terms](https://aistudio.google.com/docs/terms)
  (effective March 23, 2026) separate unpaid services, where content may
  be used to improve products and read by human reviewers, from paid
  services, where Google "doesn't use your prompts" or responses to
  improve products. Apps offered to users in the EEA, Switzerland, or
  the UK must use paid services. Google Cloud's Gemini Enterprise Agent
  Platform (the new name of the Vertex AI Platform) describes the steps
  to reach
  [zero data retention](https://docs.cloud.google.com/gemini-enterprise-agent-platform/resources/zero-data-retention).
- **Microsoft and AWS.** Azure's [data privacy page](https://learn.microsoft.com/en-us/azure/foundry/responsible-ai/openai/data-privacy)
  says prompts and completions are not available to OpenAI and are not
  used to improve the models, and explains how deployment types change
  where processing happens. Amazon Bedrock's
  [data retention settings](https://docs.aws.amazon.com/bedrock/latest/userguide/data-retention.html)
  let an account or project choose a retention mode per Region,
  including `none` for zero data retention.

**Popular tools and providers:** Microsoft Presidio, Amazon Bedrock
Guardrails sensitive-information filters, Google Cloud Model Armor with
Sensitive Data Protection, OpenTelemetry's GenAI content-capture
settings, and provider zero-retention and data-residency programs.

## How it works

### Map where the data goes

Start with an inventory. For each AI feature, list every place a copy of
the user's text can land, how long it stays, and how you would delete it.

![Diagram: a user's meeting note goes to the TaskFlow API, which sends copies to eight places; at the model provider, abuse-monitoring logs kept up to 30 days by default and removed by ZDR or MAM, stored state such as responses, files and vector stores kept until you delete them, and a short-lived prompt cache; in your own systems, an answer cache with a short TTL, app logs that should hold metadata rather than text, traces with content capture off by default, a vector store of note chunks deleted by source id, and evaluation and feedback sets deleted by user id.](ai-data-copies-map.svg)

| Copy | Who controls it | Typical lifetime | How it is deleted |
|---|---|---|---|
| Provider abuse logs | Provider | Up to about 30 days | Expires; ZDR or modified monitoring prevents it |
| Provider stored state | You, through the API | Until deleted | Delete calls for responses, files, vector stores |
| Provider prompt cache | Provider | Minutes to about a day | Expires; some providers let you turn it off |
| Answer cache | You | Minutes to hours | TTL, plus delete by user key |
| App logs and traces | You | Your retention setting | TTL; keep content out of them |
| Vector store chunks | You | Until the source changes | Delete by source document id |
| Evaluation and feedback sets | You | Often forever, by accident | Delete by user id; prefer synthetic data |

### Minimize before you redact

The cheapest protection is not sending data at all. The meeting-notes
summary needs the text of the notes, not the author's email address, the
attendee list, or the workspace billing contact. Build prompts from the
fields a feature needs, refer to people by role or internal id where the
output allows it, and truncate long histories. Minimization also makes
prompts shorter, so it saves tokens and latency.

### Redact what must be sent

When personal data has to be in the text, there are three common
treatments:

| Treatment | Example | Use when |
|---|---|---|
| Masking | `[EMAIL]` | The model never needs to tell values apart |
| Pseudonymization with placeholders | `[EMAIL_1]`, `[EMAIL_2]` | The model must keep track of who is who, and you restore values afterwards |
| Generalization | "a customer in Berlin" instead of a street address | Analytics or prompts where exact values add nothing |

Detection methods differ in what they catch:

- **Patterns with checksums** find structured data reliably: emails,
  phone numbers, IP addresses, card numbers (Luhn check digit), IBANs
  (mod-97 checksum), and secret-key formats. They are fast and run in
  your process.
- **Named-entity recognition** finds names, places, and organizations,
  which patterns cannot. Microsoft's
  [Presidio](https://microsoft.github.io/presidio/) combines both.
- **Provider filters** such as Bedrock Guardrails' sensitive-information
  filters and Model Armor's Sensitive Data Protection mask data inside
  the provider's pipeline, which helps for output but means the input has
  already left your system.

Pseudonymized text is still personal data under the GDPR (Recital 26),
because you hold the key that maps placeholders back to people. Its
value is that the provider, the logs, and the traces see placeholders;
it does not take the feature out of scope.

![Diagram: the original note with a phone number, an email address and a card number is redacted into placeholders PHONE_1, EMAIL_1 and CARD_1, and each placeholder and value is written to a vault kept in the API's memory for this request; the model provider sees placeholders only; its output, an action to email EMAIL_1 about the charge on CARD_1, is restored using the vault for the email and phone types only, so the user sees the real email address while the card stays masked; cards, IBANs and secrets are mask-only types.](pii-redaction-roundtrip.svg)

### What providers keep, and for how long

Provider policies change, so read the linked pages and your contract
before relying on this summary, which reflects their published
documentation as of November 2026:

| Provider | Training on API data | Retention of prompts and outputs | Zero-retention option | Residency controls |
|---|---|---|---|---|
| OpenAI API | No, unless you opt in | Abuse logs up to 30 days; stored responses at least 30 days unless `store: false`; stateful objects until deleted | ZDR or Modified Abuse Monitoring, after approval | Regional projects and base URLs; processing in some regions, storage only in others |
| Anthropic API | Not without express permission | Deleted within 30 days by default; flagged content up to 2 years | ZDR by agreement; some models require 30-day retention | See Anthropic's documentation |
| Gemini API | Unpaid: may be used, with human review. Paid: no | Paid: logged "for a limited period" for abuse | Not offered in the API terms; Google's enterprise platform documents ZDR | Data "may be stored transiently or cached in any country" |
| Gemini Enterprise Agent Platform (Vertex AI) | Not without prior permission | Cache deleted within 24 hours; abuse logging may apply | Disable caching, set `store` to false, avoid storing features; abuse logging does not apply under a Cloud Master Agreement | See Google's location documentation |
| Azure (models sold by Azure) | No | Flagged content in a per-geography abuse store; stateful features until deleted | Modified abuse monitoring through a Limited Access application | Standard (geography), DataZone (US or EU), Global |
| Amazon Bedrock | Providers cannot access prompts or logs | Per-Region retention mode: `none`, `default`, or `aws_review` | `none` mode, enforceable with service control policies | Per Region; cross-region inference changes where data is processed |

Three patterns stand out. Zero retention applies to stateless calls only:
anything you ask the provider to store (files, vector stores, batches,
conversations) stays until you delete it. Zero retention usually needs
approval or a contract, and some models are excluded from it (Anthropic
lists models that require 30-day retention, and Bedrock models that
require `aws_review` are unavailable in `none` mode). And content flagged
for abuse can be kept longer even under zero-retention arrangements.

### Logging and tracing without content

Logs and traces are the copies teams forget. They are replicated to log
platforms, kept for months, and read by more people than the database.
Log what a call did, not what it said:

| Log this | Keep out of default logs |
|---|---|
| Request id, trace id, feature name | Prompt text and completions |
| Model, token counts, latency, cost estimate | Retrieved chunks and note text |
| Guardrail decisions and policy version | Tool arguments containing personal data |
| Provider response id (for deletion and support) | Raw user ids where a pseudonym will do |

The OpenTelemetry
[GenAI semantic conventions](https://github.com/open-telemetry/semantic-conventions-genai/blob/main/docs/gen-ai/gen-ai-spans.md)
(still marked Development) make content capture "gated by an explicit
user opt-in". Instrumentations that support it read
`OTEL_INSTRUMENTATION_GENAI_CAPTURE_CONTENT`, whose default is
`NO_CONTENT`; the other values capture content on spans, events, or
both. The conventions also describe an upload hook that stores content
elsewhere and records only a reference, which lets you keep a small,
access-controlled, short-lived content store for debugging while traces
stay clean. Logging practice in general is covered in
[structured logging](../../../../07-devops-and-deployment/07-devops-and-deployment/monitoring-and-logging/structured-logging.md),
and LLM tracing in
[LLM observability and tracing](../evaluation-and-monitoring/llm-observability-and-tracing.md).

### Erasing one user's data

A deletion request is a job, not a query. It needs the inventory above,
an index of provider-side objects created for the user, retries, and a
date by which every copy is gone.

![Diagram: five steps; 1, the erasure request for user 17 is recorded with a due date; 2, source data such as notes and tasks is deleted from the database; 3, derived data is deleted: vector chunks by source id, cached answers, and evaluation and feedback rows; 4, provider objects such as responses, files and vector stores are deleted through the API, where a 404 counts as done and failures are retried; 5, copies with a fixed lifetime expire on their own, app logs after 30 days, provider abuse logs after up to 30 days and backups after 35 days, so the job is complete on day 35 and an audit record is written; notes explain that a backup restore must re-apply recorded deletions and that fine-tuned weights cannot forget one user.](erasure-request-flow.svg)

Two copies need special care. Backups expire on their own schedule, so a
restore must re-apply the deletions recorded since the backup was taken
(see [backups](../../../../07-devops-and-deployment/07-devops-and-deployment/backups.md)). Fine-tuned
model weights cannot forget one person's examples; keep personal data
out of fine-tuning sets, or plan to retrain without it (see
[when to fine-tune](../fine-tuning/when-to-fine-tune.md)).

### Data residency

Residency questions are about two things: where data is stored and where
it is processed, and providers treat them separately.

- **OpenAI** offers ten regions for storage; inference runs in-region
  only in some of them (as of November 2026: the US, Europe, Australia,
  Japan, India, and the UAE). The region is fixed when a project is
  created, and requests go to a regional base URL such as
  `https://eu.api.openai.com/v1`. Some endpoints, such as files and
  vector stores, have no regional processing.
- **Azure** deployment types decide processing location: standard
  deployments stay in the resource's geography, DataZone deployments
  within the US or the EU, and Global deployments anywhere the model is
  deployed, while stored data stays in the resource's geography.
- **Amazon Bedrock** processes requests in the Region you call, unless
  cross-region inference routes them elsewhere; retained data is then
  stored in the destination Region.
- **Your own stores** count too. A vector database, log platform, or
  backup bucket in another region undoes a careful provider choice.

## When to use and when not to use

| Data in the prompt | Minimum treatment |
|---|---|
| Task titles and notes with occasional names | Minimize fields; no content in logs; paid or enterprise API tier |
| Contact details the output must refer to | Placeholders with restore for allowed types |
| Card numbers, bank details, secrets | Mask, never restore; consider blocking the request and warning the user |
| Health, legal, or HR content | Zero-retention arrangement, residency matched to the customer, legal review |
| Data from users in a regulated region | Provider region and your own stores in that region; documented transfers |

When not to over-engineer:

- Do not redact data the model needs to do the job; a summary full of
  placeholders the user cannot resolve is a broken feature.
- Do not pay for zero retention on features that send no personal or
  confidential data; spend the effort on minimization instead.
- Do not build a custom NER pipeline before measuring what your traffic
  contains; structured patterns often cover most of the risk.
- Do not keep a "debug copy" of every prompt "just in case"; sample,
  redact, and expire it.

## Practical examples

All code below is TypeScript for the TaskFlow API. It was type-checked
with `tsc`, and the redaction and erasure code was run with the Node test
runner; sample values use `example.com` addresses, the fictional
555-01xx phone range, documentation IP addresses, and published test
card and IBAN numbers.

### A redactor with placeholders and checksums

```ts
// src/privacy/redact.ts: replace personal data with numbered placeholders before text leaves the API
export type PiiType = "SECRET" | "EMAIL" | "IBAN" | "CARD" | "PHONE" | "IP";

// One vault per request: placeholder -> original value. It stays on the server.
export interface Vault {
  values: Map<string, string>;
  byValue: Map<string, string>;            // "TYPE:value" -> placeholder, so repeats reuse one placeholder
  counters: Partial<Record<PiiType, number>>;
}

export const createVault = (): Vault => ({ values: new Map(), byValue: new Map(), counters: {} });

// Card numbers carry a Luhn check digit; testing it removes most false positives.
export function luhnValid(raw: string): boolean {
  const digits = raw.replace(/[ -]/g, "");
  if (!/^\d{13,19}$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let n = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
  }
  return sum % 10 === 0;
}

// IBANs carry a mod-97 checksum: move the first four characters to the end, letters become 10-35.
export function ibanValid(raw: string): boolean {
  const s = raw.replace(/ /g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(s)) return false;
  let remainder = 0;
  for (const ch of s.slice(4) + s.slice(0, 4)) {
    const value = ch >= "A" && ch <= "Z" ? String(ch.charCodeAt(0) - 55) : ch;
    for (const digit of value) remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
}

interface Detector {
  type: PiiType;
  pattern: RegExp;
  valid?: (match: string) => boolean;
}

// Order matters: specific patterns run before general ones that could match parts of them.
const DETECTORS: Detector[] = [
  { type: "SECRET", pattern: /\b(?:sk|pk|rk)[-_][A-Za-z0-9_-]{16,}|\bAKIA[0-9A-Z]{16}\b/g },
  { type: "EMAIL", pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g },
  { type: "IBAN", pattern: /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){2,7}(?: ?[A-Z0-9]{1,3})?\b/g, valid: ibanValid },
  { type: "CARD", pattern: /\b\d(?:[ -]?\d){12,18}\b/g, valid: luhnValid },
  { type: "PHONE", pattern: /(?<![\w+])(?:\+\d{1,3}(?:[ .-]?\d{2,4}){2,4}|(?:\(\d{3}\)[ .-]?|\d{3}[ .-])\d{3}[ .-]\d{4})\b/g },
  { type: "IP", pattern: /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g },
];

const PLACEHOLDER = /\[([A-Z]+)_(\d+)\]/g;

export function redact(text: string, vault: Vault = createVault()): { text: string; vault: Vault } {
  // Text that already looks like a placeholder is neutralized, so restore() cannot be tricked.
  let out = text.replace(PLACEHOLDER, "($1_$2)");
  for (const detector of DETECTORS) {
    out = out.replace(detector.pattern, (match) => {
      if (detector.valid && !detector.valid(match)) return match;
      const key = `${detector.type}:${match}`;
      let placeholder = vault.byValue.get(key);
      if (placeholder === undefined) {
        const n = (vault.counters[detector.type] ?? 0) + 1;
        vault.counters[detector.type] = n;
        placeholder = `[${detector.type}_${n}]`;
        vault.byValue.set(key, placeholder);
        vault.values.set(placeholder, match);
      }
      return placeholder;
    });
  }
  return { text: out, vault };
}

// Put original values back, but only for the types this screen may show.
export function restore(text: string, vault: Vault, allow: PiiType[]): string {
  return text.replace(PLACEHOLDER, (placeholder: string, type: string) => {
    if (!allow.includes(type as PiiType)) return placeholder;
    return vault.values.get(placeholder) ?? placeholder;
  });
}
```

Key decisions in this code:

- **Checksums before replacement.** A 16-digit invoice number that fails
  the Luhn check stays as it is, which keeps false positives down.
- **Detector order.** Secrets and emails run first, so later patterns
  cannot match pieces of them; cards run before phone numbers for the
  same reason.
- **Consistent placeholders.** The same value gets the same placeholder
  across all notes in a request, so the model can tell that two notes
  mention the same person.
- **Placeholder injection.** Text that already looks like `[EMAIL_1]` is
  rewritten to `(EMAIL_1)` first, so nobody can type a placeholder to
  make `restore` reveal a value.
- **Restore by type.** The caller decides which types a screen may show;
  cards, IBANs, and secrets are never restored.

### The redactor in action

```ts
// test/privacy.test.ts (excerpt): run with node --test
const NOTE =
  "Call Lee at +1 202 555 0199 or lee@example.com. Card 4111 1111 1111 1111 was charged twice; " +
  "refund to GB82 WEST 1234 5698 7654 32. Server 203.0.113.7 logged it. " +
  "Order 2026-000123 is unrelated. Key sk-EXAMPLE-NOT-A-REAL-KEY-000 was pasted by mistake.";

test("personal data becomes numbered placeholders; ordinary numbers stay", () => {
  const { text } = redact(NOTE);
  assert.equal(
    text,
    "Call Lee at [PHONE_1] or [EMAIL_1]. Card [CARD_1] was charged twice; refund to [IBAN_1]. " +
      "Server [IP_1] logged it. Order 2026-000123 is unrelated. Key [SECRET_1] was pasted by mistake.",
  );
});

test("restore brings back only the allowed types", () => {
  const { vault } = redact(NOTE);
  const modelOutput = "Email [EMAIL_1] and call [PHONE_1]; do not repeat [CARD_1].";
  assert.equal(
    restore(modelOutput, vault, ["EMAIL", "PHONE"]),
    "Email lee@example.com and call +1 202 555 0199; do not repeat [CARD_1].",
  );
});

test("names are not detected by patterns (use NER for them)", () => {
  assert.equal(redact("Lee Chen approved the budget.").text, "Lee Chen approved the budget.");
});
```

All seven privacy tests passed on Node 22.12, including checksum
rejection of a mistyped card and IBAN, placeholder reuse across notes,
and the placeholder-injection case. The last test above documents a
limit rather than a feature: patterns do not find names, so a feature
that must hide names needs named-entity recognition as well.

### Summarizing with redaction and a residency base URL

```ts
// src/privacy/summarize-private.ts: redact notes, summarize them, and restore only what the user may see
import OpenAI from "openai";
import { createVault, redact, restore } from "./redact.js";

const client = new OpenAI({
  // A project created in a residency region uses that region's base URL, for example the EU one.
  baseURL: process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
});

export async function summarizeMeetingNotes(notes: string[]) {
  const model = process.env.CHAT_MODEL; // pick from the provider's current model list
  if (!model) throw new Error("CHAT_MODEL is not set");

  const vault = createVault(); // shared across notes, so one person keeps one placeholder
  const redacted = notes.map((note) => redact(note, vault).text);

  const response = await client.responses.create({
    model,
    instructions:
      "Summarize the meeting notes as action items. Keep placeholders such as [EMAIL_1] exactly as written.",
    input: redacted.join("\n---\n"),
    store: false, // no stored copy of the response on the provider side
  });

  // Contact details may be shown to the signed-in user; cards, IBANs, and secrets never come back.
  return restore(response.output_text, vault, ["EMAIL", "PHONE"]);
}
```

`store: false` matters on the Responses API: without it, OpenAI keeps the
response for at least 30 days so it can be retrieved later. The base URL
comes from configuration, so the same code serves a global project and an
EU-resident one (`https://eu.api.openai.com/v1`), each with its own API
key. With Anthropic or Gemini the shape is the same: redact before
building the request and restore after reading the text, because
redaction does not depend on the provider.

### Logging an AI call without its content

```ts
// src/privacy/log-ai-call.ts: log what an AI call did, never what it said
import { createHmac } from "node:crypto";

export interface AiCallRecord {
  feature: string;             // "meeting_summary", "assistant", ...
  model: string;
  requestId: string;           // joins the log line to the trace
  providerResponseId?: string; // lets support find the provider-side object, and delete it
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  guard: string;               // the guardrail decision, for example "allow"
}

// A keyed hash keeps raw user ids out of log tools, yet lets you find one user's lines for deletion.
export function pseudonym(userId: string, key = process.env.LOG_PSEUDONYM_KEY): string {
  if (!key) throw new Error("LOG_PSEUDONYM_KEY is not set");
  return createHmac("sha256", key).update(userId).digest("hex").slice(0, 16);
}

export function logAiCall(userId: string, record: AiCallRecord): void {
  console.info(JSON.stringify({ event: "ai_call", user: pseudonym(userId), ...record }));
}
```

A run with a throwaway key printed:

```text
{"event":"ai_call","user":"64fbfb527c8100d9","feature":"meeting_summary","model":"example-model","requestId":"req_8f2c","inputTokens":1840,"outputTokens":212,"latencyMs":2310,"guard":"allow"}
```

The key lives in the secrets manager
([secrets management](../../../../07-devops-and-deployment/07-devops-and-deployment/environment-variables/secrets-management.md)).
For tracing, keep content capture off explicitly, so a library default or
a copied configuration cannot turn it on:

```bash
# .env for the TaskFlow API: traces carry timings and token counts, not prompt text
OTEL_SERVICE_NAME=taskflow-api
OTEL_INSTRUMENTATION_GENAI_CAPTURE_CONTENT=NO_CONTENT
```

Older instrumentation libraries used other variable names for the same
switch, so check the one your tracing library reads.

### Erasing a user's AI data

```ts
// src/privacy/erase-user.ts: delete one user's AI data everywhere TaskFlow keeps a copy
import OpenAI from "openai";

// Every provider-side object we create is recorded with its owner, so it can be found again.
export interface ProviderObject {
  kind: "response" | "file" | "vector_store" | "conversation";
  id: string;
}

export interface ErasureDeps {
  listProviderObjects(userId: string): Promise<ProviderObject[]>;
  forgetProviderObjects(userId: string): Promise<void>;
  deleteVectorsBySource(userId: string): Promise<number>;   // chunks embedded from the user's notes
  deleteCachedAnswers(userId: string): Promise<number>;
  deleteFeedbackAndEvalRows(userId: string): Promise<number>;
  deleteProviderObject(object: ProviderObject): Promise<void>;
}

export interface ErasureReport {
  userId: string;
  providerDeleted: number;
  providerAlreadyGone: number;
  failures: string[];
  vectors: number;
  cache: number;
  evalRows: number;
}

const isNotFound = (err: unknown) => err instanceof OpenAI.NotFoundError;

// Idempotent: running it twice is safe, and objects that are already gone count as done.
export async function eraseUserAiData(userId: string, deps: ErasureDeps): Promise<ErasureReport> {
  const report: ErasureReport = { userId, providerDeleted: 0, providerAlreadyGone: 0, failures: [], vectors: 0, cache: 0, evalRows: 0 };

  for (const object of await deps.listProviderObjects(userId)) {
    try {
      await deps.deleteProviderObject(object);
      report.providerDeleted += 1;
    } catch (err) {
      if (isNotFound(err)) report.providerAlreadyGone += 1;
      else report.failures.push(`${object.kind}:${object.id}`);
    }
  }
  report.vectors = await deps.deleteVectorsBySource(userId);
  report.cache = await deps.deleteCachedAnswers(userId);
  report.evalRows = await deps.deleteFeedbackAndEvalRows(userId);

  // Keep the index of provider objects until every delete succeeded, so a retry can finish the job.
  if (report.failures.length === 0) await deps.forgetProviderObjects(userId);
  return report;
}

// The provider half of the dependencies, using the OpenAI SDK's delete endpoints
export function openAiDeleter(client: OpenAI) {
  return async (object: ProviderObject): Promise<void> => {
    switch (object.kind) {
      case "response": await client.responses.delete(object.id); break;
      case "file": await client.files.delete(object.id); break;
      case "vector_store": await client.vectorStores.delete(object.id); break;
      case "conversation": await client.conversations.delete(object.id); break;
    }
  };
}
```

The test runs the job twice against fakes: the first run hits a 404 (the
response was already gone, which counts as done) and a simulated outage
on one file, so it keeps the index; the second run finishes and clears
it. The index of provider objects is the piece most teams lack: without
recording each response, file, and vector store id against its owner
when you create it, there is nothing to delete later. Run the job from a
queue with retries, and record completion in an audit log that holds ids
and dates, not content.

## Best practices

- Keep an inventory of every copy of AI data, with an owner, a lifetime,
  and a deletion path.
- Minimize prompts to the fields a feature needs before thinking about
  redaction.
- Redact structured personal data with checksummed patterns, add NER
  where names matter, and never restore secrets or payment data.
- Use paid or enterprise API tiers for user data, set `store: false` (or
  the provider's equivalent) when you do not need stored state, and
  request zero retention where the data justifies it.
- Record every provider-side object id against its user when you create
  it.
- Log metadata, not content; pseudonymize user ids in logs; keep tracing
  content capture off by default.
- Keep evaluation and fine-tuning sets free of real personal data, or
  track their provenance so you can remove a user's rows.
- Choose provider regions and your own storage regions together, and
  document where processing happens.
- Re-read provider data policies when you adopt a new model; retention
  terms can differ by model.

## In production

- **A customer's security review finds prompts in the log platform.**
  *Detect:* a search for a known test email finds full prompts in
  application logs. *Cause:* a debug log line left in the AI client
  wrapper, or tracing content capture switched on in one environment.
  *Fix:* remove the line, set content capture to `NO_CONTENT`
  explicitly, purge the affected log indexes, and add a CI check that
  fails on logging calls with prompt variables.
- **A deleted user's text still appears in answers.**
  *Detect:* project Q&A cites a note that no longer exists. *Cause:* the
  erasure job deleted the note but not its vector chunks or the cached
  answer. *Fix:* delete chunks by source id and cache entries by user as
  part of the job, and add a test that queries for the deleted content.
- **An API key pasted into a note is now at the provider.**
  *Detect:* a secret scanner on outgoing prompts, or the redactor's
  `SECRET` count, fires. *Cause:* users paste credentials into notes.
  *Fix:* revoke and rotate the key immediately, keep the redactor's
  secret patterns in front of every model call, and warn users when a
  note contains one.
- **Residency drifts after a model upgrade.**
  *Detect:* a review finds requests going to the global endpoint, or a
  new model available only in another region. *Cause:* the base URL or
  deployment type was copied from an example during the upgrade.
  *Fix:* configure the base URL and deployment type per tenant region,
  and alert when a request goes to an unexpected endpoint.
- **Requests fail after switching to zero data retention.**
  *Detect:* errors on file uploads or stored conversations right after
  the change. *Cause:* those features are stateful and not covered by
  zero retention (on Bedrock, `store=true` is rejected in `none` mode).
  *Fix:* move state into your own database, pass context explicitly, and
  set `store: false` everywhere.
- **Placeholders leak into the UI.**
  *Detect:* users see `[EMAIL_2]` in summaries. *Cause:* the model
  invented or altered a placeholder, or a restore call used the wrong
  vault. *Fix:* keep one vault per request, instruct the model to copy
  placeholders exactly, and render unknown placeholders as "(hidden)".

## Important terminology

- **PII (personally identifiable information):** Data that identifies a
  person, directly or in combination with other data. GDPR's broader
  term is "personal data".
- **Data minimisation:** Using only the personal data a purpose needs.
- **Redaction / masking:** Removing or replacing sensitive values.
- **Pseudonymization:** Replacing identifiers with placeholders that can
  be mapped back with separately held information.
- **Zero data retention (ZDR):** A provider arrangement under which
  prompts and outputs are not stored after the response, with documented
  exceptions.
- **Abuse monitoring:** A provider's retention and review of traffic to
  detect policy violations.
- **Data residency:** Keeping data storage, processing, or both within a
  chosen geography.
- **Right to erasure:** A person's right, under laws such as the GDPR, to
  have their personal data deleted in many circumstances.
- **Content capture:** Recording prompts and completions in telemetry,
  off by default in the OpenTelemetry GenAI conventions.

## Common mistakes and misconceptions

- "We use the API, so nothing is stored." Abuse logs, stored responses,
  files, and caches exist unless you change settings or agreements.
- "Zero data retention means nothing is ever kept." Stateful features
  and flagged content are outside it.
- "Pseudonymized data is anonymous." Not while you hold the mapping.
- "Free tier for prototypes is fine with real data." Unpaid tiers may use
  content for product improvement with human review.
- Deleting the source note but forgetting embeddings, caches, eval sets,
  and provider objects.
- Logging full prompts "temporarily" and keeping them for a year.
- Choosing an EU model region while the vector store and logs stay in
  the US.
- Fine-tuning on raw production conversations without a way to remove
  one person's data.

## Revision questions

1. List the copies of a meeting-notes summary request, and say who
   deletes each one and how.
2. Why does the redactor validate card numbers with the Luhn check, and
   what goes wrong without it?
3. When would you use placeholders with restore instead of plain
   masking? Which types should never be restored?
4. What does zero data retention not cover, on at least two providers?
5. A user asks for erasure on March 1. App logs keep 14 days, traces 30
   days, provider abuse logs up to 30 days, and backups 35 days. On what
   date is the last copy gone, and which copies need an active delete?
6. How does OpenTelemetry's GenAI convention keep prompt text out of
   traces by default, and how can a team still debug with content?
7. A customer requires EU residency. Which settings and which of your
   own systems must you check?

## Further learning

- [OpenAI: Data controls in the OpenAI platform](https://developers.openai.com/api/docs/guides/your-data)
- [OpenAI: Data residency](https://developers.openai.com/api/docs/guides/data-residency)
- [Anthropic: API and data retention](https://platform.claude.com/docs/en/manage-claude/api-and-data-retention)
- [Google: Zero data retention on Gemini Enterprise Agent Platform](https://docs.cloud.google.com/gemini-enterprise-agent-platform/resources/zero-data-retention)
- [Microsoft: Data, privacy, and security for models sold by Azure](https://learn.microsoft.com/en-us/azure/foundry/responsible-ai/openai/data-privacy)
- [Microsoft Presidio](https://microsoft.github.io/presidio/)
- Related: [AI data preparation and governance](../ai-data-preparation-and-governance.md),
  [building a RAG pipeline](../retrieval-augmented-generation/building-a-rag-pipeline.md)
- Next: [AI regulation and governance](ai-regulation-and-governance.md). Back to the [AI security, privacy, and responsible use overview](../security-privacy-and-responsible-ai.md).
