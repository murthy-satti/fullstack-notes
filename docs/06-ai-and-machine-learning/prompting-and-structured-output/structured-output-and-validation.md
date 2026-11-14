# Structured Output and Validation

When application code consumes a model's answer, prose is the wrong
format. TaskFlow Assistant does not need a friendly paragraph about a task;
it needs a title, a due date, a priority from a fixed list, an assignee
who really is a project member, and a few tags, in a shape the API can
check and store. Structured output is the set of techniques that make a
model return data instead of text, and validation is the code that decides
whether that data may be used.

This lesson covers JSON mode, schema-constrained output, and tool-based
extraction and what each one guarantees; how constrained decoding works;
designing schemas that every provider can enforce; validating with zod in
two layers (shape, then business rules); repair retries; refusals,
truncation, and other invalid outputs; streaming partial JSON; and an
end-to-end natural-language task creation flow for TaskFlow in
TypeScript. It builds on the prompt template from
[prompt design and templates](prompt-design-and-templates.md).

## Why it matters

- **Free-form text breaks parsers.** Without constraints, a model that
  usually returns clean JSON will sometimes wrap it in a code fence, add a
  friendly sentence, or rename a field. At thousands of calls a day,
  "sometimes" means a steady trickle of failed requests.
- **Valid JSON is not valid data.** A schema can force `priority` to be
  one of three strings; it cannot know that "Rosa" is not a member of the
  project or that 30 February does not exist. Those checks belong to your
  code.
- **Model output is untrusted input.** It was shaped by user text, and it
  must pass the same validation as a request from the browser before it
  touches the database.
- **Failures need a plan.** Refusals, truncated answers, and rule
  violations each need a different response. Retrying all of them blindly
  wastes money and sometimes repeats a refusal.
- **Users must stay in control.** For actions with consequences, the
  model proposes and the user confirms. Structured output is what makes a
  reviewable draft possible.

## Real-world usage

- **OpenAI Structured Outputs.** The
  [Structured Outputs guide](https://developers.openai.com/api/docs/guides/structured-outputs)
  calls it the evolution of JSON mode and states that only Structured
  Outputs ensures schema adherence. In strict mode every field must be
  required (optional fields are emulated with a union with `null`),
  `additionalProperties` must be `false`, outputs follow the key order of
  the schema, and a schema may have up to 5,000 properties, 10 levels of
  nesting, and 1,000 enum values. A refusal arrives as a separate
  `refusal` content item that does not follow the schema.
- **Anthropic structured outputs.** The
  [structured outputs documentation](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)
  (stable, with the schema in `output_config.format`) describes compiling
  the schema into a grammar for constrained decoding, extra latency on the
  first request with a new schema, compiled grammars cached for 24 hours,
  limits of 20 strict tools, 24 optional parameters, and 16 union-type
  parameters per request, and outputs that can still break the schema on
  a refusal or when `max_tokens` cuts them off.
- **Google Gemini.** The
  [structured output documentation](https://aistudio.google.com/docs/structured-output)
  for the Interactions API takes a JSON Schema in `response_format`,
  ignores keywords such as `minLength`, `maxLength`, and `uniqueItems`
  instead of enforcing them, says streamed chunks are valid partial JSON
  strings, and tells developers to validate values in application code.
- **Constrained decoding research.** Willard and Louf,
  [Efficient Guided Generation for Large Language Models](https://arxiv.org/abs/2307.09702)
  (2023), the paper behind the Outlines library, reformulates guided
  generation as transitions of a finite-state machine with a precomputed
  index over the vocabulary, which is what makes per-token masking cheap.
- **Format costs.** Tam and colleagues,
  [Let Me Speak Freely?](https://arxiv.org/abs/2408.02442) (2024), report
  a significant decline in reasoning ability under format restrictions,
  with stricter formats hurting more, which is a reason to keep schemas
  small and to let reasoning happen before or outside the structured
  answer.

**Popular tools and providers:** zod for TypeScript and Pydantic for
Python schemas; the structured-output helpers in the OpenAI and Anthropic
SDKs; `Output.object` in the Vercel AI SDK; Instructor for validated
extraction with retries; and Outlines, XGrammar, llguidance, and
[vLLM structured outputs](https://docs.vllm.ai/en/latest/features/structured_outputs/)
for self-hosted models.

## How it works

### Three ways to ask for structure

![Diagram: three columns compare JSON mode, schema-constrained output, and tool-based extraction. JSON mode is requested with a JSON response type and the word JSON in the prompt; it guarantees only syntactically valid JSON, not key names, types, required fields, or allowed values, so its shape is not enforced and it suits only older models. Schema-constrained output sends a JSON Schema with the request in strict mode; the output matches the schema unless the model refuses or is cut off, but correct values and cross-field rules are not guaranteed; the shape is enforced during decoding and it is the default for extraction. Tool-based extraction defines a tool whose parameters are the schema and the model calls it; arguments match the schema when the tool is strict, but the model may not call the tool and values may be wrong; the shape is enforced for strict tools, and it fits when the model must also choose between actions. Constrained decoding fixes the shape; your validator still checks the values.](structured-output-approaches.svg)

**JSON mode** is the oldest technique: the API promises syntactically
valid JSON and nothing more. OpenAI's guide adds two sharp edges: the
request fails if the word "JSON" does not appear in the context, and a
model that was not told to produce JSON may emit an endless stream of
whitespace until it hits the token limit.

**Schema-constrained output** (OpenAI calls it Structured Outputs,
Anthropic calls it structured outputs or JSON outputs, Google calls it
structured output) sends a JSON Schema with the request, and the provider
enforces it while the answer is generated. This is the default choice for
extracting data.

**Tool-based extraction** declares a function whose parameters are the
schema and lets the model call it. Before schema-constrained output
existed it was the standard workaround, and it is still the right tool
when the model must choose between several actions (create a task, or
search existing tasks first). Strict tool definitions give the arguments
the same guarantee as schema-constrained output. Forcing one specific
tool is not always available: as of November 2026, Anthropic documents
that some of its newest models reject forced tool choice on every request
(older models reject it only with manual extended thinking), so prefer
`output_config.format` when you only want data.

| What you send | OpenAI Responses API | Anthropic Messages API | Google Interactions API | Vercel AI SDK |
|---|---|---|---|---|
| A JSON Schema | `text.format: { type: "json_schema", strict: true, schema }` | `output_config.format: { type: "json_schema", schema }` | `response_format: { type: "text", mime_type: "application/json", schema }` | `output: Output.object({ schema })` |
| From a zod schema | `zodTextFormat(schema, name)` | `zodOutputFormat(schema)` | `z.toJSONSchema(schema)` | the zod schema itself |
| Parsed result | `response.output_parsed` | `message.parsed_output` | parse `output_text` yourself | `result.output` |
| Refusal signal | a `refusal` content item | `stop_reason: "refusal"` | no parsable output; validate | `finishReason: "content-filter"`, or no output |
| Truncation signal | `status: "incomplete"`, reason `max_output_tokens` | `stop_reason: "max_tokens"` | `status: "incomplete"` | `finishReason: "length"`; `NoOutputGeneratedError` |

### How constrained decoding works

A language model produces one token at a time by scoring every token in
its vocabulary and sampling one (see
[inference and decoding](../inference-and-decoding.md)). Constrained
decoding inserts one step: before sampling, the provider asks a grammar
compiled from your schema which tokens are allowed next, and sets the
probability of every other token to zero.

![Diagram: one decoding step with a schema. The JSON Schema says priority is low, medium, or high, and the provider compiles it once into a grammar, a state machine, which it caches; the first request with a new schema can be slower while it compiles. The output so far ends with the opening quote of the priority value. The model scores the next token: high 30 percent, urgent 25 percent, medium 18 percent, ASAP 15 percent, low 12 percent. The grammar allows high, medium, and low and blocks urgent and ASAP. The remaining scores are renormalized to high 50, medium 30, and low 20 percent, and one is sampled. After high is picked, the grammar expects a comma or a closing brace. The model still chooses; the grammar only removes choices the schema forbids.](constrained-decoding-mask.svg)

Four consequences follow from the mechanism:

- **The shape is guaranteed only while generation runs to completion.**
  If the model refuses, or the output token limit cuts the answer off,
  the text that exists may not match the schema. Check the stop reason
  before you trust the parse.
- **Values are still the model's choice.** In the diagram the model
  wanted "urgent"; the grammar turned that into "high", which happens to
  be right. In other cases the forced choice is a guess, which is why
  `null`, `"other"`, and clarifying-question fields matter: they give the
  model a legal way to say "I don't know".
- **Compilation costs time.** The grammar is built the first time a
  schema is seen and then cached (for 24 hours since last use on
  Anthropic). A schema that changes on every request, for example one
  that embeds the member list as an enum, never benefits from the cache
  and can hit complexity limits. Pass dynamic lists in the prompt and
  check them in code instead.
- **The grammar covers the answer, not the thinking.** Anthropic's
  documentation notes that grammars do not apply to thinking, so a model
  can reason freely and still produce a schema-valid final answer. It also
  warns that a schema property asking for step-by-step reasoning can
  trigger a refusal; ask for a short explanation field instead, or let
  the reasoning happen in thinking.

### Designing schemas every provider can enforce

Providers support different subsets of JSON Schema. OpenAI rejects a
strict schema that uses an unsupported keyword; Anthropic rejects
numeric and string-length constraints with a 400 error unless its SDK
moves them into descriptions; Google ignores some keywords silently. The
portable design is two layers:

1. **A model schema** with only what everyone enforces: objects, strings,
   enums, arrays, booleans, numbers, and `null` unions, every key
   required, no extra properties, and a `describe()` text for every field
   that has rules the schema cannot express.
2. **Domain checks** in your code for everything else: lengths, real
   dates, ranges, existence in the database, and rules that span fields.

You can see why the split matters by printing what the SDK helpers send.
For a zod field `z.iso.date().nullable()`, `zodTextFormat` in the OpenAI
SDK (version 7) passes `"format": "date"` plus a 200-character regular
expression straight through, and `.min(1).max(120)` arrives as
`minLength` and `maxLength`, while Anthropic's `zodOutputFormat` moves the
same constraints into the field description and enforces them only when
it validates the response. A model schema built from plain
`z.string().nullable()` fields with clear descriptions behaves the same
everywhere.

A few more rules from the provider guides:

- **Required plus nullable beats optional.** Strict modes want every key
  present; "not mentioned" becomes `null`, which is also easier to handle
  than a missing key.
- **Give the model an exit.** An `intent` enum with an `"other"` value
  and a nullable `clarifyingQuestion` stop the schema from forcing a fake
  task out of "what's our deploy process?".
- **Keep it flat and small.** Each optional parameter and union roughly
  doubles part of the grammar on Anthropic, and stricter formats cost
  reasoning quality. Split very large extractions into several calls.
- **Order fields deliberately.** Outputs follow schema order on OpenAI,
  and on Anthropic required properties come first. Put fields the model
  should decide first, such as `intent`, at the top.
- **Compare enums case-insensitively when the provider says so.**
  Anthropic documents that the capitalization of enum values is not
  guaranteed; lowercase single-word enums avoid the issue.

### Validation in two layers

Even with a provider guarantee, parse and validate the output again in
your process. The SDK helpers do part of this: `responses.parse` and
`messages.parse` run the zod schema on the result. That catches the
provider-specific gaps (keywords that were dropped or ignored) and gives
you typed data.

Then run the domain checks. For a TaskFlow draft they are: the title is
1 to 120 characters, the due date is a real `YYYY-MM-DD` date that is not
before today in the user's time zone, the assignee name matches exactly
one project member (which also converts the name to a user ID), and there
are at most five tags of up to 30 characters. The output of this step is
not "valid" or "invalid" but a list of specific problems, because those
messages drive the repair step.

### Repair retries

![Diagram: the loop around a structured-output call. Step 1 calls the model with the schema and messages. A decision checks how it stopped: a refusal is explained to the user and never repaired; output cut off by the token limit fails fast or is retried with a higher limit. A complete answer goes to step 2, where zod parses the JSON again, and step 3, which checks business rules: a real date, a real member, and at most five tags. If there are no problems the draft is returned for review and nothing is saved until the user confirms. If there are problems and a repair attempt is left, step 4 adds the answer and the exact problems to the messages and calls again. With no repair left, the feature falls back to the manual form prefilled with the fields that passed. Retry only what a retry can fix: rule violations, never refusals or truncation.](validate-and-repair-loop.svg)

A repair retry sends the conversation back with two extra messages: the
model's own answer, and a user message listing exactly what was wrong
("assigneeName "Rosa" is not a project member"). Models fix specific,
named problems far more reliably than they respond to "try again".

Keep the budget small. Each repair re-sends the whole conversation plus
the bad answer, so it costs more than the first call. If 8 percent of
first answers break a rule and a repair costs about 1.3 times a first
call, the feature uses about 1 + 0.08 x 1.3 = 1.10 times the tokens of a
no-repair design, which is fine; a budget of three or four repairs mostly
adds latency to requests that are not going to succeed. When the budget
runs out, fall back to the normal form, prefilled with whatever passed.

What not to repair:

- **Refusals.** Re-asking the same question usually produces the same
  refusal and spends money doing it. Show a clear message.
- **Truncation.** The answer did not fit in `max_output_tokens`. Raise
  the limit once if the task legitimately needs it, or shorten the
  request; repeating the same call will be cut off again.
- **Transport errors.** Rate limits (429) and server errors (5xx) are not
  model mistakes. The official SDKs already retry them with backoff
  (OpenAI's client retries twice by default); handle them in the client
  layer, not in the repair loop.

### Refusals, truncation, and the other invalid outputs

| Case | How it shows up | Matches the schema? | What to do |
|---|---|---|---|
| Refusal | OpenAI: `refusal` content item. Anthropic: `stop_reason: "refusal"` (status 200, tokens billed) | Not necessarily | Show a clear message; log the category; never repair |
| Cut off by the token limit | OpenAI: `status: "incomplete"`, reason `max_output_tokens`. Anthropic: `stop_reason: "max_tokens"` | No | Raise the limit once or shorten the input |
| Schema-valid but wrong | A non-member assignee, a date in the past, a made-up tag | Yes | Domain checks, then one repair |
| Ignored constraint | Google drops `maxLength`; the title has 300 characters | Yes, by the provider's reading | Domain checks |
| Enum casing drift | Anthropic: an enum value differing only in capitalization | Nearly | Case-insensitive comparison; lowercase enums |
| JSON mode runaway | Endless whitespace until the token limit | No | Use schema-constrained output |

### Streaming and partial JSON

Streaming a structured answer lets the UI fill a draft card while the
model is still writing it. Each event carries a fragment of the JSON
text, so the client needs a parser that can complete an unfinished
document: close the open string, close the open objects, and return what
exists so far. The Vercel AI SDK exposes that as `partialOutputStream` on
`streamText`, and its `parsePartialJson` helper shows what happens to a
growing prefix of one answer (output of a local run with `ai` 7):

```text
 12 repaired-parse   {"intent":"c"}
 40 repaired-parse   {"intent":"create_task","title":"Send th"}
 62 repaired-parse   {"intent":"create_task","title":"Send the Q3 numbers"}
 75 repaired-parse   {"intent":"create_task","title":"Send the Q3 numbers","dueDate":"2026-11-20"}
 95 successful-parse {"intent":"create_task","title":"Send the Q3 numbers","dueDate":"2026-11-20","priority":"high"}
```

The first line is the lesson: after 12 characters the partial object
contains `"intent": "c"`, a value the enum does not allow, and later
fields are simply missing. Partial objects are for display only. Never
validate, save, or act on them; wait for the final, complete object and
run the full validation then. Relaying the stream from the API to the
browser is covered in
[streaming responses end to end](../hosted-model-apis/streaming-responses-end-to-end.md),
and rendering it in [frontend patterns for AI features](../building-ai-applications/frontend-patterns-for-ai-features.md).

### End to end: natural-language task creation

![Diagram: a sequence across TaskFlow Web, TaskFlow API, the model provider, and MongoDB. Web sends POST task-drafts with the text. The API finds the project and its members in MongoDB, checking that the caller is a member, and gets the members back. The API renders the prompt with the user's local date and escaped text, sends instructions, messages, and the schema to the model provider, and receives draft JSON in the schema's shape. The API checks the rules, repairs once if needed, and returns the draft and any question to Web, unsaved. The user reviews and confirms; Web sends POST tasks/from-draft; the API validates again and calls insertOne on MongoDB, then returns 201 with the id. The model proposes, the user confirms, and the API validates twice and is the only writer.](nl-task-creation-sequence.svg)

The flow has two endpoints on purpose. The first turns text into a draft
and saves nothing; the second receives the fields the user confirmed
(possibly edited) and validates them again with the same domain checks,
because by then they are ordinary client input. The model never writes to
the database, never chooses a user ID (the API maps the name to an ID
from the member list it loaded), and never sees a project the caller is
not a member of.

## When to use and when not to use

| Situation | Use | Avoid |
|---|---|---|
| Extracting fields from text for code to use | Schema-constrained output plus domain checks | Parsing prose with regular expressions |
| The model must choose between actions | Strict tools, with permission checks before running any of them | One giant schema with a field per action |
| Classification into fixed labels | An enum field, including an `"other"` label | Free text compared with string matching |
| Long, open-ended writing (summaries, emails) | Plain text, or a small schema around the text (`summary`, `sources`) | Forcing paragraphs into deeply nested JSON |
| Hard reasoning followed by a decision | A reasoning model, with the schema only for the final answer | Schema fields that ask for step-by-step reasoning |
| Older or self-hosted models without schema support | Constrained decoding in the serving stack (Outlines, XGrammar, vLLM), or JSON mode plus validation | Trusting JSON mode alone |

Structured output is the right default whenever code consumes the answer.
It is the wrong tool when the value of the output is the prose itself, or
when the schema would encode business rules that change daily (member
lists, prices): keep those in the prompt as data and in code as checks.

## Practical examples

### The model schema and the business rules

```ts
// src/ai/schemas/task-draft.ts
import { z } from "zod";

/**
 * What the model must return. Only features every provider can enforce:
 * types, enums, nullable fields, no length or range limits.
 */
export const TaskDraftOutput = z.object({
  intent: z.enum(["create_task", "other"]),
  title: z.string().describe("Short imperative title, at most 120 characters"),
  dueDate: z.string().nullable()
    .describe("Due date as YYYY-MM-DD in the user's time zone, or null"),
  priority: z.enum(["low", "medium", "high"]),
  assigneeName: z.string().nullable()
    .describe("Exactly one name from the member list, or null"),
  tags: z.array(z.string()).describe("At most 5 short lowercase tags"),
  clarifyingQuestion: z.string().nullable()
    .describe("One question when the request is ambiguous, otherwise null"),
});
export type TaskDraftOutput = z.infer<typeof TaskDraftOutput>;

export interface Member {
  id: string;
  name: string;
}

export interface ValidDraft {
  title: string;
  dueDate: string | null;
  priority: "low" | "medium" | "high";
  assigneeId: string | null;
  tags: string[];
}

export type DraftCheck =
  | { ok: true; value: ValidDraft }
  | { ok: false; problems: string[] };

const IsoDate = z.iso.date();

/** Rules the schema cannot express: lengths, real dates, real members. */
export function checkDraft(
  draft: TaskDraftOutput,
  ctx: { members: Member[]; today: string }, // today: YYYY-MM-DD in the user's zone
): DraftCheck {
  const problems: string[] = [];

  const title = draft.title.trim();
  if (title.length === 0 || title.length > 120) {
    problems.push("title must be between 1 and 120 characters");
  }

  if (draft.dueDate !== null) {
    if (!IsoDate.safeParse(draft.dueDate).success) {
      problems.push(`dueDate "${draft.dueDate}" is not a valid YYYY-MM-DD date`);
    } else if (draft.dueDate < ctx.today) { // ISO dates sort as strings
      problems.push(`dueDate ${draft.dueDate} is before today (${ctx.today})`);
    }
  }

  let assigneeId: string | null = null;
  if (draft.assigneeName !== null) {
    const wanted = draft.assigneeName.trim().toLowerCase();
    const member = ctx.members.find((m) => m.name.toLowerCase() === wanted);
    if (member) assigneeId = member.id;
    else problems.push(`assigneeName "${draft.assigneeName}" is not a project member`);
  }

  const tags = [...new Set(draft.tags.map((t) => t.trim().toLowerCase()).filter(Boolean))];
  if (tags.length > 5) problems.push("use at most 5 tags");
  if (tags.some((t) => t.length > 30)) problems.push("each tag must be at most 30 characters");

  if (problems.length > 0) return { ok: false, problems };
  return {
    ok: true,
    value: { title, dueDate: draft.dueDate, priority: draft.priority, assigneeId, tags },
  };
}
```

- **`TaskDraftOutput`** is the model schema. Every key is required,
  "unknown" is `null`, and every rule the schema cannot express is in a
  `describe()` text that the SDK helpers send as the field description.
- **`checkDraft`** is the domain layer. `z.iso.date()` rejects impossible
  dates such as `2026-02-30`, plain string comparison works for
  `YYYY-MM-DD` dates, and the member lookup turns a name into an ID, so
  the model never supplies an ID.
- Problems are full sentences that name the field and the value, because
  they are fed back to the model verbatim in a repair.

### A provider-neutral repair loop

```ts
// src/ai/draft-with-repair.ts
import type { ChatMessage } from "./prompts/task-assistant.js";
import { checkDraft, type Member, type TaskDraftOutput, type ValidDraft } from "./schemas/task-draft.js";

/** What any provider adapter returns for one structured-output call. */
export type ModelReply =
  | { kind: "parsed"; value: TaskDraftOutput }
  | { kind: "refusal"; message: string }
  | { kind: "incomplete"; reason: string };

export type ModelCall = (messages: ChatMessage[]) => Promise<ModelReply>;

export type DraftResult =
  | { kind: "draft"; draft: ValidDraft; question: string | null; attempts: number }
  | { kind: "not_a_task" }
  | { kind: "refused"; message: string }
  | { kind: "failed"; reason: string; problems: string[] };

export async function draftWithRepair(
  call: ModelCall,
  messages: ChatMessage[],
  ctx: { members: Member[]; today: string },
  maxAttempts = 2, // one call plus one repair; more rarely helps and doubles cost
): Promise<DraftResult> {
  let turns = [...messages];
  let problems: string[] = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const reply = await call(turns);
    if (reply.kind === "refusal") return { kind: "refused", message: reply.message };
    if (reply.kind === "incomplete") {
      return { kind: "failed", reason: `incomplete: ${reply.reason}`, problems: [] };
    }

    const draft = reply.value;
    if (draft.intent === "other") return { kind: "not_a_task" };

    const checked = checkDraft(draft, ctx);
    if (checked.ok) {
      return { kind: "draft", draft: checked.value, question: draft.clarifyingQuestion, attempts: attempt };
    }

    // Repair: show the model its own answer and exactly what is wrong with it.
    problems = checked.problems;
    turns = [
      ...turns,
      { role: "assistant", content: JSON.stringify(draft) },
      {
        role: "user",
        content: `That draft breaks these rules:\n- ${problems.join("\n- ")}\n` +
          "Return a corrected draft. Use null for anything you cannot fill correctly.",
      },
    ];
  }
  return { kind: "failed", reason: "validation", problems };
}
```

The loop knows nothing about providers. Each adapter turns one call into
a `ModelReply`, so the repair policy, the result types, and the tests are
written once, and switching providers changes one import.

### The OpenAI adapter, and the equivalents

```ts
// src/ai/providers/openai-draft.ts
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { ModelCall } from "../draft-with-repair.js";
import { TaskDraftOutput } from "../schemas/task-draft.js";

const client = new OpenAI(); // retries 429 and 5xx responses itself (maxRetries: 2)

export function openAIDraftCall(instructions: string): ModelCall {
  const model = process.env.CHAT_MODEL;
  if (!model) throw new Error("CHAT_MODEL is not configured");

  return async (messages) => {
    const response = await client.responses.parse({
      model,
      instructions,
      input: messages,
      text: { format: zodTextFormat(TaskDraftOutput, "task_draft") }, // strict JSON schema
      max_output_tokens: 1_000,
      store: false,
    });

    if (response.status === "incomplete") {
      return { kind: "incomplete", reason: response.incomplete_details?.reason ?? "unknown" };
    }
    for (const item of response.output) {
      if (item.type !== "message") continue;
      for (const part of item.content) {
        if (part.type === "refusal") return { kind: "refusal", message: part.refusal };
      }
    }
    if (!response.output_parsed) {
      return { kind: "incomplete", reason: "no parsed output" };
    }
    return { kind: "parsed", value: response.output_parsed };
  };
}
```

`zodTextFormat` converts the zod schema into a strict `json_schema`
format named `task_draft`; `responses.parse` sends it, parses the answer
with the same zod schema, and exposes the result as `output_parsed`. The
order of the checks matters: truncation first, then refusals, then the
parsed value. Choose `CHAT_MODEL` from the provider's current model list,
picking a model whose documentation lists structured output support.

Anthropic's SDK has the same shape with different names:

```ts
// src/ai/providers/anthropic-draft.ts
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { ModelCall } from "../draft-with-repair.js";
import { TaskDraftOutput } from "../schemas/task-draft.js";

const anthropic = new Anthropic();

export function anthropicDraftCall(instructions: string): ModelCall {
  const model = process.env.CHAT_MODEL ?? "";
  return async (messages) => {
    const message = await anthropic.messages.parse({
      model,
      max_tokens: 1_000,
      system: instructions,
      messages,
      output_config: { format: zodOutputFormat(TaskDraftOutput) },
    });
    if (message.stop_reason === "refusal") return { kind: "refusal", message: "refused" };
    if (message.stop_reason === "max_tokens") return { kind: "incomplete", reason: "max_tokens" };
    if (!message.parsed_output) return { kind: "incomplete", reason: "no parsed output" };
    return { kind: "parsed", value: message.parsed_output };
  };
}
```

With the Vercel AI SDK, structured output is the `output` option of
`generateText` (`generateObject` is deprecated in version 7), and the
provider package decides how the schema is sent:

```ts
// src/ai/providers/ai-sdk-draft.ts
import { generateText, NoOutputGeneratedError, Output } from "ai";
import { openai } from "@ai-sdk/openai";
import type { ModelCall } from "../draft-with-repair.js";
import { TaskDraftOutput } from "../schemas/task-draft.js";

export function aiSdkDraftCall(instructions: string): ModelCall {
  const model = openai(process.env.CHAT_MODEL ?? ""); // or anthropic(...), google(...)
  return async (messages) => {
    try {
      const result = await generateText({
        model,
        instructions,
        messages,
        output: Output.object({ schema: TaskDraftOutput, name: "task_draft" }),
        maxOutputTokens: 1_000,
      });
      return { kind: "parsed", value: result.output };
    } catch (error) {
      if (NoOutputGeneratedError.isInstance(error)) {
        return { kind: "incomplete", reason: error.message };
      }
      throw error;
    }
  };
}
```

Google's Interactions API takes the converted JSON Schema in
`response_format`; since it ignores some keywords, the result is always
parsed with zod:

```ts
// src/ai/providers/google-draft.ts (single-turn sketch with the Interactions API)
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { TaskDraftOutput } from "../schemas/task-draft.js";

const ai = new GoogleGenAI({}); // reads GEMINI_API_KEY

export async function googleDraft(instructions: string, request: string) {
  const interaction = await ai.interactions.create({
    model: process.env.CHAT_MODEL ?? "",
    system_instruction: instructions,
    input: request,
    response_format: {
      type: "text",
      mime_type: "application/json",
      schema: z.toJSONSchema(TaskDraftOutput),
    },
  });
  // Google ignores some keywords (minLength, uniqueItems, ...): always validate.
  return TaskDraftOutput.safeParse(JSON.parse(interaction.output_text ?? "null"));
}
```

All four adapters were type-checked against the current SDK typings
(`openai` 7.57, `@anthropic-ai/sdk` 1.8, `ai` 7.0, `@google/genai` 3.3).

### The Express routes

```ts
// src/routes/assistant.ts
import { Router, type Request, type Response } from "express";
import { ObjectId, type Db } from "mongodb";
import { z } from "zod";
import { draftWithRepair } from "../ai/draft-with-repair.js";
import { openAIDraftCall } from "../ai/providers/openai-draft.js";
import { renderTaskAssistantPrompt } from "../ai/prompts/task-assistant.js";
import { checkDraft, type Member } from "../ai/schemas/task-draft.js";
import { logger } from "../logger.js";

interface ProjectDoc { _id: ObjectId; name: string; memberIds: ObjectId[] }
interface UserDoc { _id: ObjectId; name: string; timeZone: string }
interface CurrentUser { id: string; name: string; timeZone: string } // set by auth middleware

const DraftRequest = z.object({ text: z.string().trim().min(1).max(2_000) });

// What the client sends back after the user reviewed (and maybe edited) the draft.
const ConfirmedDraft = z.object({
  title: z.string().trim().min(1).max(120),
  dueDate: z.iso.date().nullable(),
  priority: z.enum(["low", "medium", "high"]),
  assigneeName: z.string().nullable(),
  tags: z.array(z.string().trim().toLowerCase().min(1).max(30)).max(5),
});

function todayIn(timeZone: string, now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
}

export function assistantRouter(db: Db): Router {
  const router = Router();
  const projects = db.collection<ProjectDoc>("projects");
  const users = db.collection<UserDoc>("users");

  async function loadProject(req: Request, res: Response) {
    const user = res.locals.user as CurrentUser;
    if (!ObjectId.isValid(String(req.params.projectId))) return null;
    const project = await projects.findOne({
      _id: new ObjectId(String(req.params.projectId)),
      memberIds: new ObjectId(user.id), // only members may use the assistant here
    });
    if (!project) return null;
    const docs = await users
      .find({ _id: { $in: project.memberIds } }, { projection: { name: 1 } })
      .toArray();
    const members: Member[] = docs.map((d) => ({ id: d._id.toHexString(), name: d.name }));
    return { user, project, members };
  }

  // 1. Natural language in, reviewed draft out. Nothing is saved here.
  router.post("/projects/:projectId/assistant/task-drafts", async (req, res) => {
    const body = DraftRequest.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: "text must be 1 to 2,000 characters" });
      return;
    }
    const loaded = await loadProject(req, res);
    if (!loaded) {
      res.status(404).json({ error: "project not found" });
      return;
    }
    const { user, project, members } = loaded;

    const prompt = renderTaskAssistantPrompt({
      projectName: project.name,
      currentUser: user.name,
      members: members.map((m) => m.name),
      now: new Date(),
      timeZone: user.timeZone,
    }, body.data.text);

    const started = Date.now();
    const result = await draftWithRepair(
      openAIDraftCall(prompt.instructions),
      prompt.messages,
      { members, today: todayIn(user.timeZone) },
    );
    logger.info({
      feature: "task-assistant", outcome: result.kind,
      prompt: `${prompt.id}@${prompt.version}#${prompt.hash}`,
      latencyMs: Date.now() - started,
    }, "task draft");

    switch (result.kind) {
      case "draft": {
        const assignee = members.find((m) => m.id === result.draft.assigneeId);
        res.json({
          draft: { ...result.draft, assigneeName: assignee?.name ?? null },
          question: result.question,
          promptVersion: `${prompt.id}@${prompt.version}`,
        });
        return;
      }
      case "not_a_task":
        res.status(422).json({ error: "That does not look like a task. Try describing the work." });
        return;
      case "refused":
        res.status(422).json({ error: "The assistant cannot help with that request." });
        return;
      case "failed":
        res.status(502).json({ error: "Could not build a draft. Please fill in the form instead." });
    }
  });

  // 2. The user confirmed the draft: validate again, as for any client input.
  router.post("/projects/:projectId/tasks/from-draft", async (req, res) => {
    const body = ConfirmedDraft.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: z.prettifyError(body.error) });
      return;
    }
    const loaded = await loadProject(req, res);
    if (!loaded) {
      res.status(404).json({ error: "project not found" });
      return;
    }
    const { user, project, members } = loaded;

    const checked = checkDraft(
      { intent: "create_task", clarifyingQuestion: null, ...body.data },
      { members, today: todayIn(user.timeZone) },
    );
    if (!checked.ok) {
      res.status(422).json({ errors: checked.problems });
      return;
    }

    const { insertedId } = await db.collection("tasks").insertOne({
      projectId: project._id,
      title: checked.value.title,
      dueDate: checked.value.dueDate,
      priority: checked.value.priority,
      assigneeId: checked.value.assigneeId ? new ObjectId(checked.value.assigneeId) : null,
      tags: checked.value.tags,
      status: "open",
      createdBy: new ObjectId(user.id),
      createdAt: new Date(),
      source: "assistant",
    });
    res.status(201).json({ id: insertedId.toHexString() });
  });

  return router;
}
```

- **Authorization comes first.** `loadProject` only finds projects whose
  `memberIds` contain the caller, so neither the prompt nor the draft can
  reach another team's project, and the member list the model sees is the
  real one.
- **The first route saves nothing.** It returns the draft, an optional
  clarifying question, and the prompt version for the client to send back
  with feedback. Errors are mapped to messages a user can act on, and the
  failure path points to the normal form.
- **The second route trusts nothing.** `ConfirmedDraft` is the HTTP
  contract (strict lengths and a real date), and `checkDraft` runs again
  with a fresh member list, because a member may have left the project
  between the two requests.
- Express 5 forwards rejected promises from async handlers to the error
  middleware, so a provider outage becomes a 500 handled in one place.

### Testing the loop without calling a model

```ts
// src/ai/draft-with-repair.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { draftWithRepair, type ModelCall, type ModelReply } from "./draft-with-repair.js";
import type { TaskDraftOutput } from "./schemas/task-draft.js";

const ctx = {
  members: [{ id: "u1", name: "Priya Shah" }, { id: "u2", name: "Ben Cho" }],
  today: "2026-11-13",
};
const base: TaskDraftOutput = {
  intent: "create_task", title: "Send the invoice", dueDate: "2026-11-14",
  priority: "high", assigneeName: "Priya Shah", tags: ["billing"], clarifyingQuestion: null,
};

/** A fake model that replays scripted replies and records what it was sent. */
function scripted(...replies: ModelReply[]) {
  const seen: string[] = [];
  const call: ModelCall = async (messages) => {
    seen.push(messages.at(-1)!.content);
    const next = replies.shift();
    if (!next) throw new Error("no more scripted replies");
    return next;
  };
  return { call, seen };
}

test("a valid first answer needs one call", async () => {
  const { call } = scripted({ kind: "parsed", value: base });
  const result = await draftWithRepair(call, [{ role: "user", content: "..." }], ctx);
  assert.equal(result.kind, "draft");
  assert.equal(result.kind === "draft" && result.draft.assigneeId, "u1");
});

test("a rule violation triggers one repair with the exact problem", async () => {
  const { call, seen } = scripted(
    { kind: "parsed", value: { ...base, assigneeName: "Rosa" } },
    { kind: "parsed", value: { ...base, assigneeName: null, clarifyingQuestion: "Who owns it?" } },
  );
  const result = await draftWithRepair(call, [{ role: "user", content: "..." }], ctx);
  assert.match(seen[1], /assigneeName "Rosa" is not a project member/);
  assert.deepEqual(
    result.kind === "draft" && [result.attempts, result.draft.assigneeId, result.question],
    [2, null, "Who owns it?"],
  );
});

test("it gives up after the repair budget and reports the problems", async () => {
  const bad: ModelReply = { kind: "parsed", value: { ...base, dueDate: "2026-02-30" } };
  const { call } = scripted(bad, bad);
  const result = await draftWithRepair(call, [{ role: "user", content: "..." }], ctx);
  assert.equal(result.kind, "failed");
  assert.match(result.kind === "failed" ? result.problems[0] : "", /not a valid YYYY-MM-DD/);
});

test("refusals and truncation are never repaired", async () => {
  for (const reply of [
    { kind: "refusal", message: "no" },
    { kind: "incomplete", reason: "max_output_tokens" },
  ] satisfies ModelReply[]) {
    const { call, seen } = scripted(reply);
    const result = await draftWithRepair(call, [{ role: "user", content: "..." }], ctx);
    assert.notEqual(result.kind, "draft");
    assert.equal(seen.length, 1);
  }
});
```

Compiled with `tsc` and run with `node --test`, all four tests pass. The
adapters can be tested the same way one level lower: point the SDK at a
local stub server (both official SDKs read `OPENAI_BASE_URL` and
`ANTHROPIC_BASE_URL`) that returns canned API responses. Run against such
a stub with fake keys, the adapters above produce:

```text
openai ok {"kind":"parsed","value":{"intent":"create_task","title":"Send the invoice",...}}
openai refusal {"kind":"refusal","message":"I can't help with that."}
openai incomplete {"kind":"incomplete","reason":"max_output_tokens"}
openai request text.format: json_schema task_draft strict=true
anthropic ok {"kind":"parsed","value":{"intent":"create_task","title":"Send the invoice",...}}
anthropic refusal {"kind":"refusal","message":"refused"}
```

That proves the parsing of each response shape, including the ones that
are hard to trigger on purpose with a real model, and it costs nothing to
run in CI. Whether the model fills the fields well is a separate question
for the evaluation set described in
[building evaluation sets](../evaluation-and-monitoring/building-evaluation-sets.md).

### Streaming a live preview

```ts
// src/ai/stream-draft-preview.ts
import { streamText, Output } from "ai";
import { openai } from "@ai-sdk/openai";
import type { RenderedPrompt } from "./prompts/task-assistant.js";
import { TaskDraftOutput } from "./schemas/task-draft.js";

/** Yields growing partial drafts for a live preview, then the validated draft. */
export async function* streamDraftPreview(prompt: RenderedPrompt) {
  const result = streamText({
    model: openai(process.env.CHAT_MODEL ?? ""),
    instructions: prompt.instructions,
    messages: prompt.messages,
    output: Output.object({ schema: TaskDraftOutput }),
  });

  for await (const partial of result.partialOutputStream) {
    yield { done: false as const, partial }; // display only: fields may still change
  }
  yield { done: true as const, draft: await result.output }; // complete and schema-checked
}
```

The generator yields partial drafts for the card that fills in as the
user watches, and one final event with the complete object, which is then
passed through `checkDraft` exactly as in the non-streaming route.

## Best practices

- Use schema-constrained output whenever code consumes the answer; use
  JSON mode only where nothing better exists.
- Keep the model schema to the portable subset, with every key required,
  `null` for unknown, and a description for every rule.
- Give the model legal exits: an `"other"` intent, nullable fields, and a
  clarifying-question field.
- Validate twice: parse with the schema in your process, then run domain
  checks that return specific problems.
- Check the stop reason before the parse: truncation and refusals first.
- Repair once with the exact problems; never repair refusals or
  truncation; leave transport retries to the SDK.
- Fall back to the manual form, prefilled, when the budget runs out.
- Keep dynamic values (member lists, catalogues) out of the schema, in the
  prompt as data and in code as checks.
- Show partial objects for display only; act only on complete, validated
  data.
- Let the model propose and the user confirm; validate the confirmed data
  again on the server.
- Log the outcome kind (draft, repaired, refused, failed) with the prompt
  version and model, and watch the rates.

## In production

- **A spike of 400 errors after a schema change.**
  *Detect:* the assistant endpoint's error rate jumps right after a
  deploy, and provider errors mention unsupported schema keywords or a
  schema too complex to compile. *Cause:* a new zod rule (`.min()`,
  `.regex()`, a recursive type) reached the provider's strict schema
  subset, or optional fields and unions pushed the grammar over a limit.
  *Fix:* move the rule into `checkDraft`, keep the model schema portable,
  and add a CI test that sends the schema to a provider sandbox or checks
  it against the documented limits.
- **Drafts assigned to people who are not in the project.**
  *Detect:* the second endpoint rejects many confirmed drafts with
  "not a project member", or worse, tasks show unknown assignees.
  *Cause:* the assignee field was trusted because the JSON was valid.
  *Fix:* resolve names against the member list loaded for the caller, map
  them to IDs in code, and repair or ask when there is no match.
- **The first request of the day is slow.**
  *Detect:* p99 latency spikes for the first calls after a deploy or a
  quiet period, while later calls are fast. *Cause:* the provider compiles
  a grammar the first time it sees a schema, and the cache expired or the
  schema changed. *Fix:* keep the schema stable (no per-request enums),
  and send one warm-up request after deploying a new schema.
- **Refusal rate climbs after adding a field.**
  *Detect:* the share of `refused` outcomes rises for the new prompt
  version. *Cause:* a new `reasoning` field asked the model to write out
  its step-by-step thinking, which some providers treat as reasoning
  extraction. *Fix:* replace it with a short `explanation` field or remove
  it, and keep reasoning in the model's thinking.
- **Users see half-filled drafts that later change.**
  *Detect:* support tickets about a priority that "switched by itself",
  and analytics show actions taken before the stream ended. *Cause:* the
  client acted on partial objects from the stream. *Fix:* disable the
  Create button until the final event arrives, and validate only the
  complete object.
- **Costs double after a model change.**
  *Detect:* tokens per draft rise and the `attempts` metric shows most
  requests need a repair. *Cause:* the new model often returns dates in
  another format or names that differ in case, so `checkDraft` fails and
  every request pays for two calls. *Fix:* run the evaluation set before
  switching models, tighten the field descriptions, and track the repair
  rate as a release gate.

## Important terminology

- **JSON mode:** an API option that guarantees syntactically valid JSON
  but not any particular shape.
- **Schema-constrained output (Structured Outputs):** generation that the
  provider constrains to a supplied JSON Schema.
- **Constrained decoding:** masking tokens the grammar does not allow
  before each sampling step.
- **Grammar:** a state machine compiled from a schema that says which
  tokens may come next.
- **Strict mode:** a schema setting that requires every key and forbids
  extra properties, in exchange for guaranteed adherence.
- **Tool-based extraction:** getting structured data by letting the model
  call a function whose parameters are the schema.
- **Domain validation:** checks that need knowledge outside the schema,
  such as real dates and database lookups.
- **Repair retry:** a follow-up call that shows the model its answer and
  the exact problems with it.
- **Refusal:** a model's decision not to answer, which may not follow the
  schema.
- **Partial JSON:** an unfinished JSON document from a stream, completed
  by a tolerant parser for display.

## Common mistakes and misconceptions

- "Valid JSON means valid data." The schema guarantees shape, not truth.
- "With structured outputs, I do not need to validate." Truncation,
  refusals, ignored keywords, and business rules all still need checks.
- "Put every rule in the schema." Provider subsets differ, and complex
  schemas cost latency, limits, and reasoning quality.
- "Retry until it works." Repairs help with named rule violations; they do
  not fix refusals or truncation, and each one costs more than the first
  call.
- "The model can pick the user ID." IDs come from your database, mapped by
  your code from names the model returns.
- "Partial objects are early results." They can contain values the schema
  forbids and are missing later fields.
- "JSON mode is good enough." It guarantees syntax only, and it can run
  away with whitespace when the prompt does not ask for JSON.

## Revision questions

1. What does JSON mode guarantee, what does schema-constrained output add,
   and what does neither guarantee?
2. Explain constrained decoding with the `priority` example. Why is a
   forced choice not necessarily a correct choice?
3. Why does the TaskFlow model schema use `z.string().nullable()` for the
   due date instead of `z.iso.date()`, and where is the date checked?
4. List the stop reasons you check before trusting a parsed result on
   OpenAI and on Anthropic, and what you do for each.
5. Ten percent of first answers fail `checkDraft`, and a repair costs 1.4
   times a first call. How many first-call equivalents does the average
   request cost with a budget of one repair? (1 + 0.1 x 1.4 = 1.14.)
6. Why must partial objects from a stream never be saved, even when every
   field present looks valid?
7. Why does the task creation flow have two endpoints, and why does the
   second one validate again?
8. When is tool-based extraction a better choice than a response schema?

## Further learning

- [OpenAI: Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [Anthropic: Structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)
- [Google AI Studio: Structured output](https://aistudio.google.com/docs/structured-output)
- [Vercel AI SDK: Generating structured data](https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data)
- [Zod: JSON Schema](https://zod.dev/json-schema)
- [Willard and Louf: Efficient Guided Generation for Large Language Models](https://arxiv.org/abs/2307.09702)
- Next: [reasoning models and thinking](reasoning-models-and-thinking.md). Back to the [prompting and structured output overview](../prompting-and-structured-output.md).
