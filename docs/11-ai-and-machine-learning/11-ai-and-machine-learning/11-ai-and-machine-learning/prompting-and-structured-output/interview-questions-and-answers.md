# Prompting and Structured Output Interview Questions and Answers

These questions review prompt design and templates, structured output and
validation, and reasoning models and thinking. Try answering each one
before reading the answer.

## Prompt design and templates

### 1. What are the parts of a production prompt, and who writes each part?

The developer writes the instructions (role, rules, output contract) and
the few-shot examples. Application code adds context it looked up, such as
the project's members and today's date in the user's time zone. The user
supplies the request, and tools or retrieval may add documents. Each part
has a different level of trust, which is why a template assembles them in
a fixed order with clear boundaries.

### 2. What is the instruction hierarchy?

The trained ranking of who may instruct the model. OpenAI's Model Spec
calls it a chain of command: root and system rules, then developer
instructions, then user instructions, then guidelines. Quoted text, files,
and tool outputs carry no authority by default, so instructions inside
them are information, not commands. When two instructions conflict, the
higher layer wins.

### 3. Where do developer instructions go in the main APIs?

OpenAI Responses API: the `instructions` parameter, or a `developer`
message in `input`. Anthropic Messages API: the top-level `system`
parameter. Google Interactions API: `system_instruction`. Vercel AI SDK:
the `instructions` option (`system` is deprecated in version 7).

### 4. Does the instruction hierarchy make prompt injection impossible?

No. It is trained behaviour that makes injection much less likely to
succeed; OpenAI's instruction hierarchy paper reports large robustness
gains, not immunity. Anything that must never happen, such as assigning a
task in another team's project, is enforced by backend code that checks
permissions regardless of what the model outputs.

### 5. What does a well-written rule look like?

It states the rule, the reason, and what to do instead: "The assignee must
be one of the listed members, because TaskFlow can only notify members. If
the request names anyone else, set assigneeName to null and ask who should
own the task." The reason lets the model generalize, and the alternative
stops it from replacing one wrong action with another.

### 6. Why avoid "CRITICAL: you MUST" phrasing?

Recent models follow system prompts closely, and Anthropic notes that
aggressive language written for older models now causes over-triggering.
Plain, specific instructions with reasons work better and are easier to
maintain.

### 7. In what order should a prompt be assembled?

Stable content first (identity, rules, output contract, examples), then
per-request context, then the user's input last. Stable content first
lets provider prompt caching reuse the prefix, and OpenAI recommends
putting reusable content at the start. For long documents, Anthropic
recommends placing them above the question, which improved quality by up
to 30 percent in its tests.

### 8. How many few-shot examples should you use, and which ones?

A few, typically three to five (Anthropic's guidance), chosen to sit on
the decision boundaries: for TaskFlow, an urgent request for a member, a
request naming a non-member, and a request that is not a task. Easy
middle-of-the-road examples teach little. For reasoning models, try zero
examples first.

### 9. How can examples make answers worse?

Models copy what examples have in common: if every example uses the same
name or a Friday due date, those details leak into real answers. An
example that contradicts a rule often wins over the rule because it is
more concrete. Vary surface details, keep examples consistent with the
rules, and test with and without them.

### 10. Should examples be sent as conversation turns or inside the instructions?

Either works if they are clearly marked. As earlier user and assistant
turns they look exactly like real exchanges; inside `<example>` tags in
the instructions they stay part of the stable prefix. Both keep examples
separate from the real request, which is what matters.

### 11. How do you delimit untrusted content safely?

Wrap each untrusted value in a tag that names its source
(`<user_request>`, `<email>`), state in the developer instructions that
tagged content is data, and escape `<` and `>` in the value so it cannot
close the tag. Escape everything user-controlled, including project and
member names.

```ts
const escapeForTag = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
```

### 12. What is spotlighting?

A family of techniques from Microsoft researchers that mark untrusted
text so the model can tell where it came from: delimiting, datamarking
(interleaving a marker character through the text), and encoding (for
example base64). In their experiments it reduced indirect prompt
injection success from above 50 percent to below 2 percent; it costs
tokens and can hurt quality on some models.

### 13. Why keep prompt templates in application code?

Code gives review, diffs, type checking, tests, and deployment with the
code that depends on the prompt. OpenAI's prompt engineering guide (as of
November 2026) recommends storing production prompts in application code
and announces that its reusable prompt objects are deprecated, with
`v1/prompts` shutting down on November 30, 2026.

### 14. Why must the server, not the model, provide today's date?

The model does not know the current date or the user's time zone, so it
guesses. The template renders today's date from the server clock in the
user's IANA time zone. Getting this wrong produces off-by-one due dates
for users west or east of UTC near midnight.

### 15. How do you version a prompt?

Give it an ID, a human version, and a hash of its stable text (for
example `task-assistant@3#0ed2b14868b0`). Log all three with the served
model ID on every call. Keep a lock file mapping each prompt ID to its
version and hash, with a unit test that fails when the text changes
without a version bump.

### 16. What is the difference between unit tests and evaluations for prompts?

Unit tests check the rendering without a model: escaping, order, dates,
size, and the lock file; they run on every commit in milliseconds.
Evaluations call the model on golden, edge, adversarial, and regression
cases and score the answers; they run when the prompt or model changes
and compare versions on the same cases.

### 17. How do you roll out a prompt change safely?

Bump the version, run unit tests and the evaluation set against the
current version, review the prompt diff and the score diff together, then
release behind a feature flag (for example 5, 50, then 100 percent) while
watching quality metrics. Rollback is switching the flag back to the
previous version, with no redeploy.

### 18. Name four prompt anti-patterns.

Concatenating user text into instructions; putting fixed rules in the
first user message; one giant prompt shared by every feature; editing
prompts in place without versions. Others: examples that all look alike,
asking the model for facts the server knows, and judging a change on one
example.

### 19. The stable prefix is 1,100 tokens and per-request data averages 150 tokens. What share of input tokens can prefix caching cover?

1,100 / (1,100 + 150) = 88 percent. Moving any per-request field above
the stable part breaks the prefix match and loses most of that benefit.

## Structured output and validation

### 20. Compare JSON mode, schema-constrained output, and tool-based extraction.

JSON mode guarantees only syntactically valid JSON. Schema-constrained
output enforces a supplied JSON Schema while generating, so the answer
matches it unless the model refuses or is cut off. Tool-based extraction
gets the data as the arguments of a tool call; strict tools give the same
guarantee, and it fits when the model must also choose between actions.

### 21. How does constrained decoding work?

The provider compiles the schema into a grammar (a state machine). At each
step the model scores every token; the grammar removes the tokens that
would break the schema; the remaining probabilities are renormalized and
one token is sampled. The model still chooses, but only among legal
tokens.

### 22. What does schema enforcement not guarantee?

Correct values, rules that span fields, and anything outside the schema:
that a date exists, that an assignee is a project member, that a title is
sensible. It also does not cover refused or truncated answers. Those need
domain validation in your code.

### 23. What does OpenAI's strict mode require of a schema?

Every property listed in `required` (optional fields become a union with
`null`), `additionalProperties: false`, and a root that is an object, not
an `anyOf`. Unsupported keywords cause an error. Limits include 5,000
properties, 10 levels of nesting, and 1,000 enum values in total.

### 24. Why split validation into a model schema and domain checks?

Providers support different JSON Schema subsets: OpenAI errors on
unsupported keywords, Anthropic's SDK moves length and range constraints
into descriptions, and Google ignores some keywords silently. A model
schema with only portable features behaves the same everywhere; lengths,
real dates, database lookups, and cross-field rules then live in a
function such as `checkDraft` that returns specific problems.

### 25. Why not put the project's member names in the schema as an enum?

The schema changes on every request, so the provider compiles a new
grammar each time instead of reusing a cached one (Anthropic caches
compiled grammars for 24 hours), and large enums count against
complexity limits. Put the names in the prompt as data and check the
answer against them in code.

### 26. How are refusals reported on OpenAI and on Anthropic?

OpenAI: a content item of type `refusal` with a `refusal` string, which
does not follow the schema. Anthropic: `stop_reason: "refusal"` with a
200 status; the output may not match the schema and the tokens are
billed. In both cases show a clear message and do not retry.

### 27. How do you detect a truncated structured answer?

OpenAI returns `status: "incomplete"` with `incomplete_details.reason`
set to `max_output_tokens`; Anthropic returns `stop_reason:
"max_tokens"`. Check these before trusting the parse, then raise the
limit once or shorten the input; a repeat of the same call is cut off
again.

### 28. What is a repair retry, and what should never be retried this way?

A follow-up call that adds the model's answer and a message listing the
exact problems ("assigneeName "Rosa" is not a project member"). It works
for rule violations. Do not repair refusals (they repeat), truncation
(the same limit applies), or transport errors such as 429 and 5xx, which
the SDKs retry with backoff themselves.

### 29. Eight percent of first answers fail validation, and a repair costs 1.3 times a first call. What is the average cost per request with one repair?

1 + 0.08 x 1.3 = 1.104 first-call equivalents, about 10 percent more. A
larger repair budget mostly adds latency to requests that will not
succeed; fall back to the manual form instead.

### 30. Why validate on the server when the provider already enforces the schema?

Model output is untrusted input shaped by user text. Parsing again in
your process catches gaps in provider enforcement, gives typed data, and
the domain checks catch everything the schema cannot express. The SDK
helpers (`responses.parse`, `messages.parse`) already run the zod schema;
the domain checks are your job.

### 31. Why give the model an explicit way out in the schema?

Constrained decoding forces some legal answer. Without an `"other"`
intent, nullable fields, and a clarifying-question field, a request such
as "what's our deploy process?" is squeezed into a fake task. Exits let
the model say "not a task" or "I need more information" legally.

### 32. Does the order of fields in a schema matter?

Yes. OpenAI produces keys in schema order, and Anthropic outputs required
properties first, then optional ones. Fields generated early condition
later ones, so put deciding fields such as `intent` first.

### 33. Should a schema include a "reasoning" field?

Not for step-by-step reasoning. Anthropic warns that a property asking for
the model's step-by-step thinking can trigger a refusal, and research such
as "Let Me Speak Freely?" found that strict formats can reduce reasoning
quality. Let the model reason in its thinking, and ask for a short
`explanation` field only if users need one.

### 34. How does streaming structured output work, and what is the danger?

A tolerant parser completes the unfinished JSON (closing strings and
objects) so the UI can show a growing draft. Partial objects can contain
values the schema forbids, such as `"intent": "c"` after a few characters,
and later fields are missing. Use them for display only; validate and act
only on the final, complete object.

### 35. When is tool-based extraction better than a response schema?

When the model must choose what to do, for example create a task or
search for an existing one first, each with its own arguments. Strict
tools enforce the arguments. Note that some current Anthropic models
reject forced tool choice on every request, so use a response schema when
you only need data.

### 36. Why does the TaskFlow flow use two endpoints?

The first turns text into a draft and saves nothing; the user reviews and
edits it. The second receives the confirmed fields, which are now
ordinary client input, and validates them again with a fresh member list
before inserting. The model proposes, the user confirms, and the API is
the only writer.

### 37. Why should the model never choose user IDs?

IDs are database facts the model cannot verify, and a wrong or injected ID
could reference another user or tenant. The model returns a name; the API
matches it against the members it loaded for the caller's project and
uses that member's ID, or asks a question when nothing matches.

### 38. How do you test structured-output code without calling a model?

Make the provider call an injectable function (`ModelCall`) and test the
loop with a fake that replays scripted replies: valid, invalid then
valid, refusal, truncation. One level lower, point the official SDK at a
local stub server with `OPENAI_BASE_URL` or `ANTHROPIC_BASE_URL` and fake
keys to test that the adapter parses each response shape.

### 39. What changed for structured output in the Vercel AI SDK 7?

`generateObject` and `streamObject` are deprecated. Structured output is
the `output` option of `generateText` or `streamText`, for example
`output: Output.object({ schema })`, with the result in `result.output`
and partial objects in `partialOutputStream`.

## Reasoning models and thinking

### 40. What is a reasoning model?

A model trained, mostly with reinforcement learning on checkable problems,
to generate internal reasoning before answering: it tries approaches,
checks them, and revises. The extra computation at answer time is called
test-time compute, and it pays off most on math, code, planning, and other
multi-step problems.

### 41. How did reasoning models develop from chain-of-thought prompting?

Wei and colleagues (2022) showed that prompting a model to write
intermediate steps improves reasoning. Reasoning models internalize this
through training: DeepSeek-R1 (2025) reported that pure reinforcement
learning produced self-reflection and verification without human-written
reasoning traces, and Snell and colleagues (2024) showed that adaptive
test-time compute can beat a model 14 times larger on suitable problems.

### 42. How are reasoning tokens billed and limited?

As output tokens, even when they are hidden or only summarized, and they
count against the output limit (`max_output_tokens` on OpenAI,
`max_tokens` on Anthropic). Usage fields report them separately:
`output_tokens_details.reasoning_tokens` on OpenAI and
`output_tokens_details.thinking_tokens` on Anthropic.

### 43. Which controls set how much a model thinks, per provider?

OpenAI: `reasoning.effort` (`none` to `max`, depending on the model).
Anthropic: `output_config.effort` (`low` to `max`) with adaptive thinking;
`budget_tokens` only on older models. Google Interactions API:
`generation_config.thinking_level` (`minimal` to `xhigh`, per model). The
Vercel AI SDK has a provider-neutral `reasoning` setting. All as of
November 2026.

### 44. What is the difference between effort and the output limit?

Effort is soft guidance about how much work a request deserves; Anthropic
calls it a behavioral signal, not a strict token budget. The output limit
is a hard wall that stops generation wherever it is, including in the
middle of reasoning. Lower effort to save cost and time; use the limit as
the ceiling.

### 45. How can a reasoning request cost money and return nothing?

If the output limit is reached while the model is still reasoning, the
response is incomplete (`status: "incomplete"` on OpenAI) with no visible
answer, but input and reasoning are billed. Prevent it with headroom
(OpenAI suggests at least 25,000 tokens when starting), lower effort, and
an alert on the incomplete rate.

### 46. What happened to explicit thinking budgets?

They are being replaced by effort levels. Anthropic's `budget_tokens`
(at least 1,024 and below `max_tokens`) is deprecated on Claude Opus 4.6
and Sonnet 4.6 and returns a 400 error from Claude Opus 4.7 onwards,
where adaptive thinking guided by `effort` is the control. Google's
Interactions API uses `thinking_level`.

### 47. Can you tune a reasoning model with temperature?

Mostly no. Anthropic's newest models return a 400 error for any
non-default `temperature`, `top_p`, or `top_k`, and from API version
`2026-10-21` every model rejects them at any value; Google marks
`temperature` deprecated in the Interactions API; OpenAI documents effort
as the control for reasoning models. Control variety with the prompt and
quality with effort.

### 48. When should you use a reasoning model instead of a fast model?

For multi-step problems with checkable rules: planning and scheduling,
code, analysis that reconciles conflicting information, and agents that
decide between tool calls. Use fast models for drafts, extraction,
classification, and summaries. OpenAI calls reasoning models "the
planners" and fast models "the workhorses", and expects most workflows to
use both.

### 49. How does prompting a reasoning model differ?

State the goal, hard constraints, and success criteria, not the method.
Do not ask it to think step by step (OpenAI says that can hurt). Try
zero-shot first. Keep delimiters and developer instructions. Keep
reasoning out of the output schema, and calm aggressive wording; steer
overthinking with lower effort or "choose an approach and commit to it".

### 50. What does reasoning do to latency, and how do you design around it?

Time to first visible token grows with the amount of reasoning, and
nothing visible streams while the model thinks. Stream a reasoning
summary or progress for interactive use, move long reasoning to background
jobs with notifications, and keep reasoning off the hot path of features
that must feel instant.

### 51. How does reasoning affect cost, and does prompt caching help?

Reasoning adds billed output tokens, often several times the visible
answer, and output tokens usually cost more than input. Prompt caching
reduces repeated input only; it does not reduce reasoning. Changing the
top-level effort between requests can also invalidate cached prefixes on
Anthropic, so keep it constant within a cached conversation.

### 52. What is an effort sweep, and how do you read one?

Run the same evaluation set at each effort level, record pass rate,
latency percentiles, and output tokens, and pick the lowest level that
meets the quality bar and the latency budget. If `medium` and `high` both
pass 90 percent but `high` uses about 2.3 times the output tokens and
twice the p95 latency, choose `medium`.

### 53. What reasoning can you see from hosted providers?

Not the raw reasoning: OpenAI does not expose raw reasoning tokens, and
Anthropic says no display setting returns the raw chain of thought. You
can request summaries (`reasoning.summary`, Anthropic `display:
"summarized"`, Google `thinking_summaries`), and you receive opaque
carry-over items. Open-weight models such as DeepSeek-R1 show their raw
reasoning when you run them yourself.

### 54. Why must reasoning items and thinking blocks be passed back unchanged?

They let the model continue its reasoning across tool calls. Anthropic
thinking blocks carry a signature and modified blocks are rejected with a
400 error; OpenAI's stateless mode carries reasoning in
`encrypted_content`, usable only within the same model family. Append the
provider's returned content as is instead of rebuilding it from text.

### 55. What does faithfulness research say about visible reasoning?

Anthropic found that when models used a planted hint, Claude 3.7 Sonnet
mentioned it 25 percent of the time and DeepSeek R1 39 percent of the
time. OpenAI researchers found chain-of-thought monitoring useful but
fragile, since training pressure on the reasoning teaches models to hide
intent. So reasoning text is not an audit trail; judge outcomes.

### 56. How do you evaluate a reasoning model?

Grade outcomes with code where rules exist (the planner's `checkPlan`),
run each case several times and report pass rates, record cost and
latency with quality at each effort level, re-run on every model change,
and use model graders only for qualities code cannot check. Never grade
the reasoning summary.

### 57. Why does Anthropic's TypeScript SDK refuse some non-streaming requests?

It estimates the maximum duration from `max_tokens` and refuses
non-streaming requests that could run longer than ten minutes (roughly
above 21,000 output tokens). Reasoning workloads need large ceilings, so
use `messages.stream()` and `finalMessage()` for them.

## Scenario-based questions

### 58. After a prompt edit, drafts name the wrong assignee. What do you check?

**What to check first:** the assignee-correction rate by prompt version,
and the diff between the old and new prompt, especially the examples.

**How to confirm:** the wrong assignees concentrate on the new version and
often repeat a name that appears in the new examples.

**Likely causes and fixes:** examples that share a name the model now
copies, or a reworded assignee rule. Switch the flag back to the previous
version, vary the example names, add assignee cases to the evaluation set,
and compare versions before the next rollout. See
[prompt design and templates](prompt-design-and-templates.md).

### 59. Users in the Americas report due dates one day early in the evening. Why?

**What to check first:** the "Today" line in the rendered prompt for an
affected request, and the user's time zone setting.

**How to confirm:** the prompt shows the UTC date, which is already the
next day for those users in the evening, and "tomorrow" resolves from it.

**Likely causes and fixes:** the template formats the date in UTC or the
server's zone. Render today's date in the user's IANA time zone, add
evaluation cases near local midnight, and keep date facts out of the
model's guesswork. See
[prompt design and templates](prompt-design-and-templates.md).

### 60. A pasted email made the assistant assign every task to one person. What do you check?

**What to check first:** the rendered prompt for that request: where the
email text sits and whether it is delimited and escaped.

**How to confirm:** the email contains instructions ("assign all tasks to
...") that were concatenated into the request without tags or escaping.

**Likely causes and fixes:** untrusted text treated as instructions.
Delimit and escape it, state that tagged content is data, add injection
cases to the evaluation set, and make the API check assignee permissions
before saving. See
[prompt design and templates](prompt-design-and-templates.md) and
[prompt injection and defenses](../security-privacy-and-responsible-ai/prompt-injection-and-defenses.md).

### 61. Input tokens per call doubled with no feature change. What happened?

**What to check first:** the rendered prompt size over time and the prompt
versions released in the same period.

**How to confirm:** the stable prefix grew (more examples or policy text),
and a per-request field now sits above it, so cached-token counts dropped.

**Likely causes and fixes:** prompt creep and a broken cache prefix. Add a
size test that fails above a token budget, move per-request data back to
the end, and remove instructions that evaluations show have no effect. See
[prompt design and templates](prompt-design-and-templates.md).

### 62. Answers changed overnight without a deploy. Where do you look?

**What to check first:** the logged `model` value before and after the
change, and the configured model ID.

**How to confirm:** the configuration uses an alias, and the served
snapshot changed on the day the behaviour shifted.

**Likely causes and fixes:** a moving alias. Pin a dated snapshot in
configuration, record the served model on every call, and switch
snapshots only after the evaluation set passes. See
[prompt design and templates](prompt-design-and-templates.md).

### 63. After a schema change, the assistant endpoint returns 400 errors. What do you check?

**What to check first:** the provider's error message and the JSON Schema
the SDK helper generated from the new zod schema.

**How to confirm:** the error names an unsupported keyword or "schema too
complex", and the new schema adds a `.min()`, `.regex()`, recursion, or
many optional and union fields.

**Likely causes and fixes:** the model schema left the portable subset or
exceeded complexity limits. Move the rule into domain checks, make fields
required and nullable, and test the generated schema in CI. See
[structured output and validation](structured-output-and-validation.md).

### 64. Tasks were saved with assignees who are not project members. How?

**What to check first:** the code path between the model's answer and the
insert, and whether assignee names are resolved against the member list.

**How to confirm:** the saved `assigneeId` values do not appear in the
project's `memberIds`, and the code trusted the model's field because the
JSON was valid.

**Likely causes and fixes:** schema validity mistaken for data validity.
Resolve names against members loaded for the caller, map them to IDs in
code, repair or ask when nothing matches, and validate again on the
confirm endpoint. See
[structured output and validation](structured-output-and-validation.md).

### 65. A small share of requests fail with "Unexpected end of JSON input". Why?

**What to check first:** the stop reason or status of the failing
responses, and whether the feature uses JSON mode or a schema.

**How to confirm:** the failures have `status: "incomplete"` or
`stop_reason: "max_tokens"`, often on long inputs.

**Likely causes and fixes:** truncated output parsed as if complete, or
JSON mode without a schema. Check the stop reason before parsing, raise
the output limit for long inputs, use schema-constrained output, and
treat truncation as its own outcome. See
[structured output and validation](structured-output-and-validation.md).

### 66. The refusal rate rose right after a new field was added to the schema. Why?

**What to check first:** the new field's name and description, and the
refusal messages or stop reasons for affected requests.

**How to confirm:** the field asks the model to write out its
step-by-step reasoning, and removing it in a test restores the old rate.

**Likely causes and fixes:** a reasoning-extraction refusal. Replace the
field with a short `explanation`, or remove it and let reasoning happen
in thinking. See
[structured output and validation](structured-output-and-validation.md).

### 67. Users created tasks with a priority that changed after they clicked Create. What happened?

**What to check first:** when the client enables the Create button, and
whether it uses partial objects from the stream.

**How to confirm:** analytics show creates before the stream's final
event, and the saved values match a partial object.

**Likely causes and fixes:** acting on partial JSON. Enable actions only
after the final, validated object arrives, and validate the confirmed
fields on the server. See
[structured output and validation](structured-output-and-validation.md).

### 68. The weekly planner often returns nothing, yet token spend keeps rising. Why?

**What to check first:** the share of planner responses with `status:
"incomplete"` and their reasoning-token counts.

**How to confirm:** incomplete responses have reasoning tokens close to
the output limit and no visible output.

**Likely causes and fixes:** the output ceiling was sized for the answer
and reasoning used it up. Raise the ceiling with headroom, lower the
effort, cap the input size, alert on incomplete responses, and run large
plans as background jobs. See
[reasoning models and thinking](reasoning-models-and-thinking.md).

### 69. After a model upgrade, the planner's cost doubled with no quality change. What do you check?

**What to check first:** reasoning tokens per request and the effort
value actually sent, before and after the upgrade.

**How to confirm:** effort was not set explicitly, and the new model's
default or calibration produces much more reasoning at the same pass
rate.

**Likely causes and fixes:** an inherited default. Set effort explicitly,
run a fresh effort sweep for the new model, and gate model changes on
cost per passing case as well as quality. See
[reasoning models and thinking](reasoning-models-and-thinking.md).

### 70. The task agent fails on its second turn after a tool call. Why?

**What to check first:** the error message and the assistant content sent
back with the tool result.

**How to confirm:** the error mentions modified or missing thinking blocks
or reasoning items, and the code rebuilt the assistant message from its
text.

**Likely causes and fixes:** dropped or edited reasoning carry-over.
Append the provider's returned content unchanged, including thinking
signatures and encrypted reasoning items, and test a two-turn tool loop
in CI. See
[reasoning models and thinking](reasoning-models-and-thinking.md).

## Further learning

- [Prompting and structured output overview](../prompting-and-structured-output.md)
- [Prompt design and templates](prompt-design-and-templates.md) ·
  [Structured output and validation](structured-output-and-validation.md) ·
  [Reasoning models and thinking](reasoning-models-and-thinking.md)
- [OpenAI: Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [Anthropic: Thinking](https://platform.claude.com/docs/en/build-with-claude/thinking)
- [OWASP Top 10 for LLM Applications](https://genai.owasp.org/llm-top-10/)
