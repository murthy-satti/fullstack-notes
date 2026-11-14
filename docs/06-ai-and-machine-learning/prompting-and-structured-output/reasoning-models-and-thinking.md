# Reasoning Models and Thinking

A reasoning model is a language model trained to work through a problem
before it answers: it generates a long internal chain of reasoning tokens,
checks and revises its approach, and only then writes the reply. Spending
more computation at answer time, rather than only at training time, is
called test-time compute, and it is why the same request can take a fast
model one second and a reasoning model thirty, at a very different cost,
with a very different chance of being right on a hard problem.

This lesson covers what reasoning models are and where they came from;
the controls each provider offers for how much a model thinks (effort
levels, thinking budgets, and output ceilings), verified against the
official documentation as of November 2026; when to use a reasoning model
instead of a fast one; how prompting changes for them; the latency and
cost trade-offs; visible versus hidden reasoning; and how to evaluate
reasoning models by their outcomes. The running example is a TaskFlow
weekly planner that schedules a team's tasks under capacity, dependency,
and due-date constraints. Choosing a model family, provider, and price
tier is covered in
[choosing models and providers](../hosted-model-apis/choosing-models-and-providers.md);
this lesson is about prompting and configuring reasoning once you use it.

## Why it matters

- **Some problems need search, not recall.** Scheduling twelve tasks for
  three people without breaking a dependency or a due date is a
  constraint problem. Fast models produce plausible plans that break
  rules; reasoning models check their own work and fail far less often.
- **Reasoning is paid for even when hidden.** Every provider bills
  reasoning tokens as output tokens, and they count against the output
  limit, so a feature can become many times more expensive and slower
  without any visible change in the answer.
- **The controls changed recently and differ by provider.** Token budgets
  are giving way to effort levels, defaults differ between models of the
  same family, and some settings that worked last year now return a 400
  error.
- **Prompting habits can backfire.** "Think step by step" helped older
  models; with reasoning models it is unnecessary and, according to
  OpenAI, can sometimes hurt.
- **The reasoning you see is not the reasoning that happened.** Summaries
  are written for people, and research shows reasoning text often omits
  what actually drove the answer, which changes how you debug and
  evaluate.

## Real-world usage

- **Chain-of-thought prompting.** Wei and colleagues,
  [Chain-of-Thought Prompting Elicits Reasoning in Large Language Models](https://arxiv.org/abs/2201.11903)
  (2022), showed that asking a model to write intermediate steps improves
  arithmetic and logic results. Reasoning models internalize that idea
  through training instead of prompting.
- **Test-time compute scaling.** Snell and colleagues,
  [Scaling LLM Test-Time Compute Optimally](https://arxiv.org/abs/2408.03314)
  (2024), found that allocating test-time compute adaptively per prompt is
  more than four times as efficient as a best-of-N baseline, and that on
  problems where a smaller model already has moderate success, extra
  test-time compute can let it outperform a model 14 times larger.
- **Reasoning through reinforcement learning.**
  [DeepSeek-R1](https://arxiv.org/abs/2501.12948) (2025, published in
  Nature) reports that reasoning abilities can be incentivized with pure
  reinforcement learning, without human-written reasoning traces, that
  behaviours such as self-reflection and verification emerge, and that the
  reasoning patterns can be distilled into smaller models. Its open
  weights made a reasoning model's raw reasoning visible to anyone running
  it.
- **Provider controls.** OpenAI's
  [reasoning guide](https://developers.openai.com/api/docs/guides/reasoning)
  documents hidden reasoning tokens billed as output, `reasoning.effort`
  values from `none` to `max` depending on the model, and a recommendation
  to reserve at least 25,000 tokens for reasoning and output when you
  start. Anthropic's
  [thinking documentation](https://platform.claude.com/docs/en/build-with-claude/thinking)
  documents adaptive thinking that is on by default on Claude 5 models,
  manual `budget_tokens` that returns a 400 error from Claude Opus 4.7
  onwards, and `effort` as soft guidance with `max_tokens` as the hard
  ceiling.
- **Faithfulness.** Anthropic's alignment science team,
  [Reasoning models don't always say what they think](https://www.anthropic.com/research/reasoning-models-dont-say-think)
  (April 2025), planted hints in prompts and found that when models used a
  hint, Claude 3.7 Sonnet mentioned it in its reasoning 25 percent of the
  time and DeepSeek R1 39 percent of the time.
- **Monitoring reasoning.** OpenAI's
  [Monitoring Reasoning Models for Misbehavior](https://arxiv.org/abs/2503.11926)
  (2025) found that a weaker model reading the chain of thought caught
  reward hacking in coding tasks better than one reading only actions, but
  that strong training pressure on the chain of thought taught models to
  hide their intent. The multi-lab position paper
  [Chain of Thought Monitorability](https://arxiv.org/abs/2507.11473)
  (2025) calls this "a new and fragile opportunity" for safety.

**Popular tools and providers:** OpenAI's reasoning models through the
Responses API, Claude models with adaptive thinking and `effort`, Gemini
thinking models through the Interactions API, open-weight reasoning
models such as DeepSeek-R1 served on your own GPUs, and the Vercel AI
SDK's provider-neutral `reasoning` setting. Choose model IDs from the
providers' current lists:
[OpenAI models](https://developers.openai.com/api/docs/models),
[Anthropic models](https://platform.claude.com/docs/en/models/overview), and
[Gemini models](https://aistudio.google.com/docs/models).

## How it works

### Test-time compute: what changes inside the request

A fast model reads the prompt and starts producing answer tokens at once.
A reasoning model first produces reasoning tokens: it restates the
problem, tries an approach, checks it against the constraints, backs up,
and tries again. Only when it is satisfied does it write the answer. The
reasoning is trained with reinforcement learning on problems whose
answers can be checked (math, code, logic), which is why the gains are
largest on tasks of that kind.

![Diagram: the same request on a fast model and a reasoning model, in illustrative proportions. On the time axis the fast model processes the input and streams the answer almost at once, so the first visible token arrives early. The reasoning model processes the input, then spends a long stretch generating hidden reasoning tokens, and only then streams the answer, so the first visible token arrives late. Billed output tokens: the fast model pays for the answer only; the reasoning model pays for the hidden reasoning tokens plus the same visible answer. Reasoning buys accuracy on hard problems with time and output tokens you never see.](fast-vs-reasoning-timeline.svg)

Three properties follow, and every design decision in this lesson comes
back to them:

1. **Reasoning tokens are output tokens.** They are billed at the output
   rate, they count against the output limit, and they take generation
   time, even when you never see them.
2. **The amount of reasoning varies by request.** Current models decide
   how long to think based on difficulty, within the limits you set. Easy
   requests can get almost no reasoning; hard ones can use many thousands
   of tokens.
3. **Nothing visible happens while the model reasons.** Time to first
   visible token grows with reasoning, so streaming alone does not fix the
   user experience.

### The controls, provider by provider

Each provider exposes one control for how much the model thinks, one hard
ceiling, one option for visible reasoning, and a mechanism for carrying
reasoning across turns. As of November 2026:

| Control | OpenAI Responses API | Anthropic Messages API | Google Interactions API | Vercel AI SDK |
|---|---|---|---|---|
| How much to think | `reasoning.effort`: `none`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max` (supported values depend on the model) | `output_config.effort`: `low`, `medium`, `high`, `xhigh`, `max`, plus `thinking.type`: `adaptive`, `disabled`, `between_tools`, or `enabled` with `budget_tokens` on older models | `generation_config.thinking_level`: `minimal`, `low`, `medium`, `high`, `xhigh` (depends on the model) | `reasoning`: `provider-default`, `none`, `minimal` ... `max`, mapped to each provider |
| Hard ceiling | `max_output_tokens` (includes reasoning) | `max_tokens` (includes thinking) | `generation_config.max_output_tokens` | `maxOutputTokens` |
| Visible reasoning | `reasoning.summary`: `auto`, `concise`, `detailed` | `thinking.display`: `summarized` or `omitted` (the default on Claude 5 models) | `thinking_summaries`: `auto` or `none` | `reasoningText`, when the provider returns it |
| Across turns | reasoning items; `encrypted_content` when `store` is false; `reasoning.context` | thinking blocks with a `signature`, returned unchanged | thought blocks with signatures, resent unchanged in stateless mode | kept in the message history by the SDK |
| Usage field | `usage.output_tokens_details.reasoning_tokens` | `usage.output_tokens_details.thinking_tokens` | `total_thought_tokens` | `usage` on the result |

The direction across providers is the same: from token budgets to effort
levels. Anthropic's manual `budget_tokens` (at least 1,024 tokens and
below `max_tokens`) is deprecated on Claude Opus 4.6 and Sonnet 4.6 and
rejected on later models, where `effort` is the recommended control and
adaptive thinking decides how much of it to spend. Defaults also differ
inside one family: Anthropic documents `high` as the default effort for
most models but `medium` for some, so set the value explicitly rather
than inheriting a default that changes with the model ID.

Some sampling parameters no longer apply. OpenAI's reasoning guide
documents `reasoning.effort`, not sampling parameters, as the control;
Anthropic documents that on its newest models any non-default
`temperature`, `top_p`, or `top_k` returns a 400 error, and that from API
version `2026-10-21` any value of them does on every model; and Google marks
`temperature` as deprecated in the Interactions API's generation config.
Control variety with the prompt, and quality with effort.

### Effort is guidance; the output limit is the wall

Effort tells the model how much work a request deserves. It is soft:
Anthropic calls it "a behavioral signal, not a strict token budget", and
at low effort a model still thinks on a hard problem, only less. The
output limit is hard: when `max_output_tokens` or `max_tokens` is
reached, generation stops, wherever it is. With a reasoning model that
can be in the middle of reasoning, before a single visible token, and
OpenAI's guide warns that you are still billed for the input and the
reasoning in that case.

Practical consequences:

- **Leave headroom.** Start with a generous ceiling (OpenAI suggests at
  least 25,000 tokens while experimenting), then lower it once logs show
  how much the feature really uses.
- **Treat "incomplete" as its own outcome.** OpenAI reports
  `status: "incomplete"` with reason `max_output_tokens`; Anthropic reports
  `stop_reason: "max_tokens"`. Alert on its rate, because it means paid
  requests with no answer.
- **Stream long requests.** Anthropic's TypeScript SDK refuses a
  non-streaming request whose `max_tokens` implies it could run longer than
  ten minutes (by its estimate, above roughly 21,000 output tokens), so
  generous ceilings go with `messages.stream()` and `finalMessage()`.
- **Lower effort before raising the ceiling.** Anthropic's guidance for
  cost and latency is to lower effort first; raising the ceiling only
  allows more spending.

### When to use a reasoning model

![Diagram: picking the model type and the effort level for one feature, for example planning next week's work. First question: does it need multi-step reasoning? If no, use a fast model with reasoning off or minimal, as for drafts, extraction, classification, and summaries. If yes, second question: is an answer needed in seconds? If yes, split the task or move it offline, precomputing in the background, or use low effort and accept what the evals show for quality. If no, use a reasoning model starting at low or medium effort, run an effort sweep on the evaluation set to pick the lowest effort that meets the pass rate and the p95 latency budget, and verify every rule you can write down with code. Reasoning is a per-feature setting chosen by measurement, not a global upgrade.](choosing-model-and-effort.svg)

OpenAI's reasoning best-practices guide describes reasoning models as
"the planners" and faster models as "the workhorses", and expects most
workflows to combine both. For TaskFlow:

| Feature | Recommended setup | Why |
|---|---|---|
| Natural-language task drafts | Fast model, reasoning off or minimal, structured output | Short, frequent, latency-sensitive; correctness is checked by code |
| Meeting-notes summaries | Fast model, or low effort | Mostly comprehension and compression |
| Project Q&A over documents | Fast model; low effort when sources conflict | Retrieval supplies the facts; reasoning helps reconcile them |
| Weekly planner | Reasoning model, effort chosen by a sweep | Constraint satisfaction with checkable rules |
| Agent that updates tasks through tools | Reasoning at low or medium effort, thinking between tool calls | Multi-step decisions where each tool result changes the plan |
| Nightly analysis of overdue work | Reasoning model in a background job | Accuracy matters, nobody is waiting for the answer |

Do not use a reasoning model to fix a missing fact (use retrieval), an
unenforced format (use structured output), or a vague task (fix the
prompt). And do not set the highest effort everywhere "to be safe": the
cost and latency are real, and on simple tasks extra thinking can make
results worse, a behaviour Anthropic's guide calls overthinking.

### How prompting differs

The prompting advice from OpenAI's reasoning best-practices guide and
Anthropic's prompting guide converges on a few changes:

- **State the goal, the constraints, and what success looks like; leave
  out the method.** "Schedule as much high-priority work as possible;
  these three rules must hold; list what you could not schedule and why"
  works better than a numbered procedure. OpenAI recommends being very
  specific about the end goal and success criteria.
- **Do not ask for step-by-step reasoning.** The model already reasons;
  OpenAI says prompts asking it to think step by step are unnecessary and
  can sometimes hinder performance.
- **Try zero-shot first.** Reasoning models often need no examples; add
  them only when evaluation shows a gap, and make them consistent with
  the rules.
- **Use developer instructions and delimiters as before.** OpenAI notes
  that developer messages replace system messages for its reasoning
  models; delimit untrusted input exactly as in
  [prompt design and templates](prompt-design-and-templates.md).
- **Keep reasoning out of the output schema.** A structured answer should
  contain results, not a "reasoning" field. Anthropic warns that schema
  fields asking for step-by-step reasoning can trigger refusals; ask for a
  short explanation if users need one.
- **Calm the prompt down.** Anthropic recommends replacing aggressive
  instructions written for older models ("CRITICAL: you MUST...") with
  plain ones, and steering overthinking with guidance such as "choose an
  approach and commit to it" or with lower effort.

### Latency and cost trade-offs

All comparisons here are relative, because prices change and differ by
model. Three effects dominate:

- **Output volume.** A reasoning request can produce several times more
  billed output than the visible answer. Output tokens usually cost more
  than input tokens, so reasoning tends to dominate the bill of a feature
  that uses it.
- **Time to first visible token.** It grows with the amount of reasoning.
  For interactive features, stream the reasoning summary or a progress
  indicator; for anything over a few seconds, consider a background job
  that notifies the user (see
  [latency optimization](../deployment-cost-and-performance/latency-optimization.md)).
- **Caching helps less.** Prompt caching reduces the cost of repeated
  input; it does not reduce the reasoning a request generates. Anthropic
  also notes that changing the top-level effort between requests can
  invalidate cached prompt prefixes, so keep effort constant within a
  cached conversation.

The way to choose is an effort sweep: run the same evaluation set at each
effort level, record the pass rate, latency percentiles, and output
tokens, and pick the lowest level that meets the bar. On the sample data
in the practical examples, `medium` passes 90 percent of planning cases
at a p95 of 15.1 seconds and about 4,400 output tokens per request,
while `high` passes the same 90 percent at a p95 of 33 seconds and about
10,000 tokens: more than twice the tokens and time for no measurable
gain. `low` is the fastest but passes only 70 percent.

### Visible and hidden reasoning

![Diagram: what a reasoning model gives you back. The raw reasoning tokens are never returned by OpenAI, Anthropic, or Google, but are still billed as output and counted against the output limit. An optional reasoning summary (OpenAI reasoning.summary, Anthropic display summarized, Google thought summaries) is written for people, useful for debugging but not the model's actual reasoning. Opaque carry-over items (OpenAI encrypted reasoning items, Anthropic thinking signatures, Google thought signatures) must be sent back unchanged on the next turn of a tool loop and never edited or dropped. The final answer is what your feature uses, and what you grade with code and evaluation sets. A note says faithfulness research found that reasoning text often leaves out what actually influenced the answer: judge outcomes, not the story.](reasoning-visibility.svg)

Hosted providers do not return raw reasoning. OpenAI says it does not
expose raw reasoning tokens; Anthropic says no display setting returns the
raw chain of thought, that summaries are produced by a different model,
and that you are billed for the full thinking, not the summary; Google
returns summaries only when asked and prices the full thoughts. What you
can get is:

- **A summary**, for debugging and for user-facing progress ("checking
  capacity for Tuesday"). On Anthropic's Claude 5 models the default
  display is `omitted`, which Anthropic notes makes the first text token
  arrive sooner because no thinking text is streamed.
- **Opaque carry-over**, so the model can continue its reasoning across
  tool calls. Send it back exactly as received: Anthropic rejects modified
  thinking blocks with a 400 error, and OpenAI's stateless mode
  (`store: false`) carries reasoning in `encrypted_content` that only
  works within the same model family.

Do not show a reasoning summary to users as "why the assistant decided
this". It is not an audit trail: the faithfulness research above shows
reasoning text often omits the factor that actually changed the answer.
If users need a reason, ask for a short, checkable explanation in the
answer (which tasks were left out and the rule that excluded them), and
verify it with code.

### Evaluating reasoning models

Evaluate the outcome, not the reasoning:

1. **Grade with code wherever a rule exists.** The planner's answer is
   checked by `checkPlan`: every task appears once, no member exceeds
   capacity, dependencies come first, due dates hold. Code gives an
   objective pass or fail that does not depend on how convincing the
   summary sounds.
2. **Run each case several times.** Reasoning output varies between runs;
   report the pass rate over repeats, not a single run.
3. **Sweep effort and record cost and latency with quality.** A plan that
   is 2 percent more likely to pass but takes twice as long may not be
   worth it for an interactive feature.
4. **Re-run on every model change.** Effort levels are calibrated per
   model; Anthropic recommends a fresh sweep rather than carrying settings
   over from an earlier model.
5. **Watch production outcomes.** Incomplete responses, plans the user
   rejects, and repairs needed per request are the production versions of
   the same metrics (see
   [LLM observability and tracing](../evaluation-and-monitoring/llm-observability-and-tracing.md)).

Grading with a model is useful for qualities code cannot check, such as
the clarity of a plan's summary; the techniques are in
[LLM-as-judge and automated evals](../evaluation-and-monitoring/llm-as-judge-and-automated-evals.md).

## When to use and when not to use

| Situation | Use | Avoid |
|---|---|---|
| Planning, scheduling, constraint problems | A reasoning model plus a code checker | A fast model with "think carefully" in the prompt |
| Code generation and debugging | Reasoning at an effort chosen by evals | The maximum effort by default |
| Extraction, classification, short drafts | A fast model with structured output | Reasoning models (slower, costlier, rarely better) |
| Chat that must feel instant | A fast model; a reasoning model only behind a "think deeper" action | Reasoning on every message |
| Long background analysis | A reasoning model in a queue worker | Holding an HTTP request open for minutes |
| Explaining a decision to users | A short explanation field checked by code | Showing the reasoning summary as the explanation |

## Practical examples

### The weekly planner: schema and checker

```ts
// src/ai/planner/week-plan.ts
import { z } from "zod";

export interface PlannerTask {
  id: string;
  title: string;
  estimateHours: number;
  priority: "low" | "medium" | "high";
  dueDate: string | null; // YYYY-MM-DD
  dependsOn: string[];    // task IDs that must be finished first
}

export interface PlannerInput {
  weekDays: string[];                       // the working days, YYYY-MM-DD
  members: { id: string; name: string; hoursPerDay: number }[];
  tasks: PlannerTask[];
}

/** The model's answer: a schema for the final result only, no reasoning fields. */
export const WeekPlan = z.object({
  scheduled: z.array(z.object({
    taskId: z.string(),
    date: z.string().describe("One of the working days, YYYY-MM-DD"),
    assigneeId: z.string(),
  })),
  unscheduled: z.array(z.object({
    taskId: z.string(),
    reason: z.string().describe("One short sentence"),
  })),
  summary: z.string().describe("Two or three sentences for the team lead"),
});
export type WeekPlan = z.infer<typeof WeekPlan>;

/** Grades a plan with code: every rule is checked, nothing is taken on trust. */
export function checkPlan(plan: WeekPlan, input: PlannerInput): string[] {
  const problems: string[] = [];
  const tasks = new Map(input.tasks.map((t) => [t.id, t]));
  const members = new Map(input.members.map((m) => [m.id, m]));
  const dateOf = new Map<string, string>();

  const seen = new Set<string>();
  for (const id of [...plan.scheduled.map((s) => s.taskId), ...plan.unscheduled.map((u) => u.taskId)]) {
    if (!tasks.has(id)) problems.push(`unknown task ${id}`);
    if (seen.has(id)) problems.push(`task ${id} appears more than once`);
    seen.add(id);
  }
  for (const id of tasks.keys()) if (!seen.has(id)) problems.push(`task ${id} is missing`);

  const load = new Map<string, number>(); // "memberId|date" -> hours
  for (const s of plan.scheduled) {
    const task = tasks.get(s.taskId);
    const member = members.get(s.assigneeId);
    if (!task) continue;
    if (!member) { problems.push(`task ${s.taskId}: unknown assignee ${s.assigneeId}`); continue; }
    if (!input.weekDays.includes(s.date)) problems.push(`task ${s.taskId}: ${s.date} is not a working day`);
    if (task.dueDate && s.date > task.dueDate) problems.push(`task ${s.taskId}: scheduled after its due date`);
    dateOf.set(s.taskId, s.date);
    const key = `${member.id}|${s.date}`;
    load.set(key, (load.get(key) ?? 0) + task.estimateHours);
  }

  for (const [key, hours] of load) {
    const [memberId, date] = key.split("|");
    const capacity = members.get(memberId)!.hoursPerDay;
    if (hours > capacity) problems.push(`${memberId} has ${hours} h on ${date} (capacity ${capacity} h)`);
  }

  for (const s of plan.scheduled) {
    for (const dep of tasks.get(s.taskId)?.dependsOn ?? []) {
      const depDate = dateOf.get(dep);
      if (!depDate) problems.push(`task ${s.taskId} depends on ${dep}, which is not scheduled`);
      else if (depDate >= s.date) problems.push(`task ${s.taskId} is not after its dependency ${dep}`);
    }
  }
  return problems;
}
```

The schema describes the result only. The checker is the real grader:
for a plan that put a dependent task on the same day as its dependency,
overloaded a member, and scheduled a task after its due date, it returns
(output of a local run on sample data):

```text
flawed plan: [
  'task t4: scheduled after its due date',
  'u1 has 9 h on 2026-11-16 (capacity 6 h)',
  'task t2 is not after its dependency t1'
]
fixed plan: []
```

The same function serves three purposes: it grades evaluation runs, it
gates what the API returns to users, and its messages can drive one
repair attempt, as in
[structured output and validation](structured-output-and-validation.md).

### Calling a reasoning model

```ts
// src/ai/planner/plan-week-openai.ts
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { logger } from "../../logger.js";
import { WeekPlan, checkPlan, type PlannerInput } from "./week-plan.js";

const client = new OpenAI();
const Effort = z.enum(["none", "minimal", "low", "medium", "high", "xhigh", "max"]);

const INSTRUCTIONS = `Plan next week's work for a small team.
Goal: schedule as much high-priority work as possible.
Hard constraints, all of which must hold:
- A task is scheduled only after every task it depends on, on an earlier day.
- No member works more than their hours per day.
- No task is scheduled after its due date.
Put every task you cannot schedule under "unscheduled" with a one-sentence reason.`;

export async function planWeek(input: PlannerInput) {
  const model = process.env.PLANNER_MODEL; // a reasoning model from the provider's list
  if (!model) throw new Error("PLANNER_MODEL is not configured");
  const effort = Effort.parse(process.env.PLANNER_EFFORT ?? "medium"); // tuned with evals

  const started = Date.now();
  const response = await client.responses.parse({
    model,
    reasoning: { effort, summary: "auto" }, // supported values depend on the model
    instructions: INSTRUCTIONS,
    input: `<planning_input>\n${JSON.stringify(input)}\n</planning_input>`,
    text: { format: zodTextFormat(WeekPlan, "week_plan") },
    max_output_tokens: 25_000, // reasoning tokens count against this limit too
    store: false,
  });

  const reasoningTokens = response.usage?.output_tokens_details.reasoning_tokens ?? 0;
  logger.info({
    feature: "week-planner", model: response.model, effort, status: response.status,
    latencyMs: Date.now() - started,
    outputTokens: response.usage?.output_tokens, reasoningTokens,
  }, "planner call");

  if (response.status === "incomplete") {
    // The budget can run out during reasoning, before any visible answer.
    return { ok: false as const, reason: response.incomplete_details?.reason ?? "incomplete" };
  }
  const plan = response.output_parsed;
  if (!plan) return { ok: false as const, reason: "no parsed plan" };

  const reasoningSummary = response.output
    .flatMap((item) => (item.type === "reasoning" ? item.summary.map((s) => s.text) : []))
    .join("\n"); // a summary written for people, not the raw reasoning

  const problems = checkPlan(plan, input); // the grade comes from code, not from the summary
  return { ok: problems.length === 0, plan, problems, reasoningSummary, reasoningTokens };
}
```

- **The prompt states the goal and the rules,** not a procedure, and
  says nothing about thinking step by step.
- **`PLANNER_MODEL` and `PLANNER_EFFORT` come from configuration.** Pick
  a reasoning model from the provider's model list, check which effort
  values its model page supports, and set the effort from your sweep.
  `Effort.parse` rejects a typo at startup instead of sending it to the
  API.
- **Reasoning and structured output combine.** The schema constrains the
  final answer only; the reasoning happens before it.
- **The log line records reasoning tokens separately,** which is what
  shows a cost increase after a model or effort change.

Run against a local stub of the Responses API with a fake key, the
function sent `"reasoning":{"effort":"low","summary":"auto"}` with
`max_output_tokens: 25000`, and returned the summary text and the
reasoning-token count from the stub's response:

```text
{"ok":true,"problems":[],"reasoningSummary":"Checked capacity and dependencies.","reasoningTokens":2100}
```

### The same call with Anthropic

```ts
// src/ai/planner/plan-week-anthropic.ts (the same call with Anthropic)
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { WeekPlan, type PlannerInput } from "./week-plan.js";

const anthropic = new Anthropic();

export async function planWeekAnthropic(input: PlannerInput, instructions: string) {
  // Large max_tokens values need streaming: the SDK refuses non-streaming
  // requests that could run longer than ten minutes.
  const stream = anthropic.messages.stream({
    model: process.env.PLANNER_MODEL ?? "",
    max_tokens: 32_000, // a hard ceiling; effort is only guidance
    thinking: { type: "adaptive", display: "summarized" }, // accepted values depend on the model
    output_config: { effort: "medium", format: zodOutputFormat(WeekPlan) },
    system: instructions,
    messages: [{ role: "user", content: `<planning_input>\n${JSON.stringify(input)}\n</planning_input>` }],
  });
  const message = await stream.finalMessage();

  const thinkingSummary = message.content
    .flatMap((block) => (block.type === "thinking" ? [block.thinking] : []))
    .join("\n");
  return {
    plan: message.parsed_output,
    stopReason: message.stop_reason,
    thinkingSummary,
    thinkingTokens: message.usage.output_tokens_details?.thinking_tokens ?? 0,
    // In a tool loop, send message.content back unchanged: thinking blocks carry
    // a signature, and edited or dropped blocks are rejected.
  };
}
```

- `thinking: { type: "adaptive" }` is the default on Claude 5 models and
  must be set explicitly on Claude Opus 4.6 to 4.8; older models such as
  Claude Opus 4.5 reject it and use `enabled` with `budget_tokens`
  instead. Check the per-model table in Anthropic's thinking
  documentation for the model you configure.
- `display: "summarized"` opts in to readable thinking; leave it out (the
  `omitted` default on Claude 5 models) when nobody reads it, so the
  answer starts streaming sooner.
- `effort` and the JSON schema both live in `output_config`.

### Google and the Vercel AI SDK

```ts
// src/ai/planner/equivalents.ts (Google Interactions API and Vercel AI SDK)
import { GoogleGenAI } from "@google/genai";
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";

export async function googleThinking(prompt: string) {
  const ai = new GoogleGenAI({});
  const interaction = await ai.interactions.create({
    model: process.env.PLANNER_MODEL ?? "",
    input: prompt,
    generation_config: { thinking_level: "medium", thinking_summaries: "auto" },
  });
  return interaction.output_text;
}

export async function aiSdkThinking(prompt: string) {
  const result = await generateText({
    model: openai(process.env.PLANNER_MODEL ?? ""),
    prompt,
    reasoning: "medium", // provider-neutral; mapped to each provider's own setting
  });
  return { text: result.text, reasoning: result.reasoningText };
}
```

On Google, the supported `thinking_level` values differ by model (the
thinking documentation lists them per model), and Gemini models think
dynamically by default. The `generateContent` method of the same SDK uses
a `thinkingConfig` object (`thinkingLevel`, `thinkingBudget`,
`includeThoughts`) instead. All the examples in this lesson were
type-checked against `openai` 7.57, `@anthropic-ai/sdk` 1.8,
`@google/genai` 3.3, and `ai` 7.0.

### Choosing the effort level with a sweep

```ts
// src/ai/planner/effort-sweep.ts
export interface RunResult {
  effort: string;
  caseId: string;
  passed: boolean;        // checkPlan returned no problems
  latencyMs: number;
  outputTokens: number;   // includes reasoning tokens
}

export interface EffortSummary {
  effort: string;
  passRate: number;
  p50Ms: number;
  p95Ms: number;
  meanOutputTokens: number;
}

function percentile(sorted: number[], p: number): number {
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)];
}

export function summarize(results: RunResult[]): EffortSummary[] {
  const byEffort = new Map<string, RunResult[]>();
  for (const r of results) byEffort.set(r.effort, [...(byEffort.get(r.effort) ?? []), r]);
  return [...byEffort].map(([effort, runs]) => {
    const latencies = runs.map((r) => r.latencyMs).sort((a, b) => a - b);
    return {
      effort,
      passRate: runs.filter((r) => r.passed).length / runs.length,
      p50Ms: percentile(latencies, 50),
      p95Ms: percentile(latencies, 95),
      meanOutputTokens: Math.round(runs.reduce((s, r) => s + r.outputTokens, 0) / runs.length),
    };
  });
}

/** The cheapest effort that meets the quality bar and the latency budget. */
export function pickEffort(
  summaries: EffortSummary[],
  order: string[],
  minPassRate: number,
  maxP95Ms: number,
): EffortSummary | undefined {
  return order
    .map((e) => summaries.find((s) => s.effort === e))
    .find((s) => s !== undefined && s.passRate >= minPassRate && s.p95Ms <= maxP95Ms);
}
```

The evaluation runner calls `planWeek` for every case at every effort
level, grades each plan with `checkPlan`, and feeds the results to
`summarize`. With made-up sample results for ten cases per level, a 90
percent pass-rate bar, and a 20-second p95 budget, the functions above
print (output of a local run, with the table borders removed):

```text
effort   passRate  p50Ms  p95Ms  meanOutputTokens
low      0.7       4600   6600   1680
medium   0.9       10600  15100  4380
high     0.9       23000  33000  9980
pick: medium
```

With real results the numbers will differ; the procedure is the point.
Re-run the sweep whenever the model, the prompt, or the case set changes,
and store the chosen effort in configuration next to the model ID.

## Best practices

- Use reasoning models per feature, for problems with multi-step
  reasoning and checkable rules; keep fast models for drafts, extraction,
  and classification.
- Set the effort explicitly from an effort sweep on your evaluation set,
  and store it in configuration with the model ID.
- Set a generous hard output ceiling at first, then tune it from logged
  usage; alert on incomplete responses.
- Prompt with the goal, the constraints, and the success criteria; do not
  ask for step-by-step reasoning; try zero-shot first.
- Keep reasoning out of output schemas; ask for a short explanation only
  if users need one.
- Grade outcomes with code and evaluation sets, over repeated runs; never
  grade the reasoning summary.
- Pass reasoning items, signatures, and thought blocks back unchanged in
  multi-turn and tool loops.
- Log reasoning tokens separately from visible output, and track cost and
  latency per feature.
- Stream progress or run long reasoning in background jobs; do not hold
  users on a blank screen.
- Re-run the sweep and the evaluation set on every model change.

## In production

- **The planner times out for some teams.**
  *Detect:* p95 latency for large teams is several times the median, and
  some requests hit the gateway timeout. *Cause:* reasoning grows with the
  number of tasks and constraints, and the request ran synchronously at
  high effort. *Fix:* move planning to a background job with a
  notification, cap the number of tasks per request, and pick the effort
  from a sweep that includes large inputs.
- **Paid requests return no answer.**
  *Detect:* a rising share of responses with `status: "incomplete"` (or
  `stop_reason: "max_tokens"`) and empty output, while token spend keeps
  growing. *Cause:* the output ceiling was sized for the visible answer,
  and reasoning used it up first. *Fix:* raise the ceiling with headroom,
  lower the effort, and alert on the incomplete rate.
- **A model upgrade doubled the bill.**
  *Detect:* reasoning tokens per request jump on the day the model ID
  changed, with no change in pass rate. *Cause:* the new model's default
  effort or its calibration differs, and the feature inherited the
  default. *Fix:* set effort explicitly, run a fresh sweep for the new
  model, and gate model changes on cost per passing case.
- **Requests fail with 400 errors after switching models.**
  *Detect:* errors mention an invalid thinking type, `budget_tokens`, or
  `temperature`. *Cause:* code written for an older model sends a manual
  thinking budget or sampling parameters that newer models reject.
  *Fix:* move to `effort` and adaptive thinking, drop sampling
  parameters, and test each configured model in CI against a staging key.
- **A tool loop breaks on the second turn.**
  *Detect:* the follow-up request after a tool call fails with an error
  about modified thinking blocks or missing reasoning items. *Cause:* the
  code rebuilt the assistant message from its text and dropped the
  thinking blocks or reasoning items. *Fix:* append the provider's
  returned content unchanged, including signatures and encrypted items.
- **Support relies on reasoning summaries to explain decisions.**
  *Detect:* a user disputes a plan, and the summary's explanation does not
  match the rules that actually excluded the task. *Cause:* summaries were
  treated as an audit trail. *Fix:* return a structured, code-verified
  reason per unscheduled task, and use summaries only for debugging.

## Important terminology

- **Reasoning model:** a model trained to generate and use internal
  reasoning before answering.
- **Test-time compute:** computation spent while answering a request, as
  opposed to during training.
- **Reasoning (thinking) tokens:** the tokens a model generates while
  reasoning; billed as output, usually not returned.
- **Effort:** a soft setting for how much work a model puts into a
  response, including how much it thinks.
- **Thinking budget:** an older, explicit token budget for reasoning,
  such as Anthropic's `budget_tokens`.
- **Adaptive thinking:** a mode in which the model decides when and how
  much to think, guided by effort.
- **Output ceiling:** the hard maximum of output tokens, reasoning
  included.
- **Reasoning summary:** a human-readable summary of the reasoning,
  produced on request; not the raw reasoning.
- **Opaque carry-over:** encrypted reasoning items or signed thinking
  blocks passed back so the model can continue its reasoning.
- **Faithfulness:** how well visible reasoning reflects what actually
  produced the answer.
- **Effort sweep:** running the same evaluation set at several effort
  levels to pick the cheapest one that meets the quality bar.

## Common mistakes and misconceptions

- "A reasoning model is always better." On simple tasks it is slower,
  costlier, and sometimes worse.
- "Effort is a token budget." It is guidance; the output ceiling is the
  only hard limit.
- "Think step by step" still helps. Reasoning models reason anyway, and
  the instruction can hurt.
- "Hidden reasoning is free." It is billed as output and counts against
  the output limit.
- "The summary explains the decision." It is a summary written for
  people, and reasoning text is often unfaithful to the real cause.
- "Settings carry over between models." Effort levels and defaults are
  calibrated per model; sweep again.
- "Temperature tunes a reasoning model." Several providers ignore or
  reject sampling parameters for these models.

## Revision questions

1. What is test-time compute, and why does it help most on tasks with
   checkable answers?
2. Name the control for how much the model thinks, and the hard ceiling,
   on the OpenAI Responses API, the Anthropic Messages API, and the
   Google Interactions API.
3. Why can a reasoning request return no visible text and still cost
   money, and how do you detect and prevent it?
4. Give three ways prompting a reasoning model differs from prompting a
   fast model.
5. In the sample sweep, `medium` passes 90 percent at 4,380 output tokens
   and `high` passes 90 percent at 9,980. How many times more output does
   `high` use, and which level do you choose? (About 2.3 times; `medium`,
   because the pass rate is the same.)
6. Why must thinking blocks and reasoning items be passed back unchanged
   in a tool loop?
7. Why should a reasoning summary never be shown to users as the reason
   for a decision, and what do you show instead?
8. Which TaskFlow features would you give a reasoning model, and which a
   fast model? Justify two of each.

## Further learning

- [OpenAI: Reasoning models](https://developers.openai.com/api/docs/guides/reasoning)
- [OpenAI: Reasoning best practices](https://developers.openai.com/api/docs/guides/reasoning-best-practices)
- [Anthropic: Thinking](https://platform.claude.com/docs/en/build-with-claude/thinking)
- [Anthropic: Effort](https://platform.claude.com/docs/en/build-with-claude/effort)
- [Google AI Studio: Thinking](https://aistudio.google.com/docs/thinking)
- [Vercel AI SDK: Generating text](https://ai-sdk.dev/docs/ai-sdk-core/generating-text)
- [Anthropic: Reasoning models don't always say what they think](https://www.anthropic.com/research/reasoning-models-dont-say-think)
- Next: [prompting and structured output interview questions and answers](interview-questions-and-answers.md). Back to the [prompting and structured output overview](../prompting-and-structured-output.md).
