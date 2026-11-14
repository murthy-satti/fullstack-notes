# Prompting and Structured Output Cheat Sheet

Quick revision after the prompting and structured output lessons, before
an interview or a task.

## Key configuration

Parameter names as of November 2026:

| Concept | OpenAI Responses | Anthropic Messages | Google Interactions | Vercel AI SDK 7 |
|---|---|---|---|---|
| Developer instructions | `instructions` | `system` | `system_instruction` | `instructions` |
| Output cap | `max_output_tokens` | `max_tokens` (required) | `generation_config.max_output_tokens` | `maxOutputTokens` |
| JSON Schema | `text.format` (`json_schema`, `strict`) | `output_config.format` | `response_format` (`text`, `application/json`) | `output: Output.object({ schema })` |
| Thinking control | `reasoning.effort` | `output_config.effort` | `generation_config.thinking_level` | `reasoning` |
| Refusal | `refusal` content item | `stop_reason: "refusal"` | no parsable output | `finishReason: "content-filter"` |
| Truncated | `status: "incomplete"` | `stop_reason: "max_tokens"` | `status: "incomplete"` | `finishReason: "length"` |

```ts
// src/ai/providers/openai-draft.ts (core of the call)
const response = await client.responses.parse({
  model, // from process.env.CHAT_MODEL, chosen from the provider's model list
  instructions,
  input: messages,
  text: { format: zodTextFormat(TaskDraftOutput, "task_draft") },
  max_output_tokens: 1_000,
  store: false,
});
// Check status and refusal items before trusting response.output_parsed.
```

## Decision guide

| If you need | Choose | Why |
|---|---|---|
| Data for code to use | Schema-constrained output plus domain checks | The shape is enforced while decoding; values are not |
| The model to pick between actions | Strict tools, permission checks before running | Arguments match the schema; the action is still checked |
| A model without schema support | Constrained decoding in the serving stack, or JSON mode plus validation | JSON mode guarantees syntax only |
| User text or documents in the prompt | Delimit, label, and escape them | Concatenated text can rewrite your rules |
| Per-request lists (members, prices) | Prompt data plus code checks, not enums | Changing schemas defeat the grammar cache |
| Drafts, extraction, classification | A fast model, reasoning off or minimal | Short, frequent, checked by code |
| Planning under hard constraints | A reasoning model, effort from a sweep, a code checker | Pays off only on multi-step problems |
| A fix for a rule violation | One repair with the exact problems | Never repair refusals or truncation |

## Numbers and defaults to remember

| Item | Value |
|---|---|
| OpenAI strict schema limits | 5,000 properties, 10 nesting levels, 1,000 enum values |
| Anthropic strict limits per request | 20 strict tools, 24 optional parameters, 16 union-type parameters |
| Anthropic grammar cache | 24 hours since last use; first request with a new schema is slower |
| Anthropic refusal | Status 200, `stop_reason: "refusal"`, tokens billed |
| Few-shot examples | 3 to 5 (Anthropic's guidance); each costs tokens on every call |
| Cacheable share of input | stable / (stable + per-request), e.g. 1,100 / 1,250 = 88% |
| Repair cost | 1 + failure rate x repair cost, e.g. 1 + 0.08 x 1.3 = 1.104 |
| OpenAI SDK retries | 2 automatic retries for 429 and 5xx |
| Reasoning headroom | OpenAI: reserve at least 25,000 tokens when starting |
| Anthropic default effort | `high` on most models, `medium` on some |
| Anthropic `budget_tokens` | Deprecated on Opus 4.6 and Sonnet 4.6, 400 error on newer models |
| Anthropic non-streaming limit | SDK refuses calls that could exceed 10 minutes (about 21,000 output tokens) |
| Sampling parameters | Anthropic API `2026-10-21` rejects `temperature`, `top_p`, `top_k` |
| OpenAI stored prompts | `v1/prompts` shuts down on November 30, 2026; keep prompts in code |

## Top mistakes

- **Concatenating user text into instructions.** Delimit, label, and
  escape every untrusted value, and enforce permissions in code.
- **Trusting valid JSON.** Run domain checks (real dates, real members)
  and map names to IDs in code.
- **Parsing before checking the stop reason.** Handle truncation and
  refusals first, and never repair them.
- **Putting every rule in the schema.** Keep the model schema portable;
  lengths, ranges, and lookups belong in domain checks.
- **Acting on partial JSON from a stream.** Use partial objects for
  display only; validate the final object.
- **Editing prompts without a version.** Log `id@version#hash` with the
  served model and add a lock-file test.
- **Prompting reasoning models like old ones.** Drop "think step by step"
  and sampling parameters; set effort from a sweep.
- **Hard-coding model IDs or inheriting defaults.** Read the model and
  effort from configuration and pin dated snapshots.

## Where to go deeper

- [Prompt design and templates](prompt-design-and-templates.md)
- [Structured output and validation](structured-output-and-validation.md)
- [Reasoning models and thinking](reasoning-models-and-thinking.md)
- [Interview questions and answers](interview-questions-and-answers.md)

Back to the [Prompting and structured output overview](../prompting-and-structured-output.md).
