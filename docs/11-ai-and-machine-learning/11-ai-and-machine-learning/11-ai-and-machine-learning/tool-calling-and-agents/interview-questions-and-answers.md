# Tool Calling and Agents Interview Questions and Answers

These questions review tool calling in production, agent orchestration
patterns, computer use and browser agents, and agent protocols. Facts
about products and specifications are as of November 2026. Try answering
each one before reading the answer.

## Tool calling in practice

### 1. What actually happens when a model "calls a tool"?

The model returns a structured request: a tool name, arguments and an
ID (Claude's `tool_use` block, OpenAI's `function_call` item, Gemini's
`functionCall` part). Nothing runs on the provider's side for your own
tools. Your server validates the request, decides whether it is allowed,
runs it, and sends back a result matched to that ID. The call is a
request, not proof that anything happened.

### 2. What makes a good tool definition?

A clear name, a description written for the model (what the tool does,
when to use it and when not to, what each field means, what it returns),
and a tight input schema. Anthropic's guide calls detailed descriptions
the most important factor in tool performance. Prefer a few task-shaped
tools (`search_tasks`, `create_task`) over generic ones (`run_query`).

### 3. Where must tool results go in Claude's Messages API?

In the next `user` message, immediately after the assistant turn that
asked for them, with every `tool_result` block first in the content
array and any text after them. Each result carries the `tool_use_id` it
answers. A message between the two turns, or text before the results,
produces a 400 error.

### 4. What does strict tool use guarantee, and what does it not?

It constrains generation so the input always matches the schema: correct
types, required fields present, no extra properties. It does not check
meaning: whether an ID exists, belongs to this user, or a string is too
long. Anthropic's strict mode also rejects keywords such as `maxLength`
and `minimum`, so those limits must be enforced in your validator.

### 5. How does OpenAI's strict mode differ from Anthropic's?

OpenAI requires every property to be listed in `required` and
`additionalProperties: false` on every object; an optional field becomes
a union with `null`, such as `"type": ["string", "null"]`. Anthropic's
strict mode allows optional properties but limits optional and union
parameters per request. Code that serves both must convert `null` to
"absent" before validation.

### 6. Why validate tool input on the server if the schema was sent to the model?

Because the model's output is untrusted input. It is shaped by user text,
documents and earlier tool results, any of which may be wrong or
malicious. A server-side schema (zod, for example) enforces types and
limits, and the handler enforces business rules and permissions.

### 7. Where should the user's identity come from in a tool handler?

From the authenticated session on the server, passed as context to the
handler. Never accept `userId`, tenant or role as tool arguments. Every ID
the model supplies (`projectId`, `taskId`) is a claim to check against
that context.

### 8. Why return the same error for "not found" and "not yours"?

So the model, and anyone steering it, cannot probe which IDs exist in
other tenants' data. "No task 66a1... found. Use search_tasks first." is
both safe and actionable.

### 9. How should tool errors be reported to the model?

As results, not exceptions: `is_error: true` on Claude, an error text in
`function_call_output` on OpenAI, an `error` key in Gemini's
`functionResponse`. Write them as instructions: what went wrong and what
to try next. Log the real exception; do not put stack traces in results.
Claude typically retries an invalid call two to three times with
corrections.

### 10. What are parallel tool calls, and how do you handle them?

Several independent calls in one model turn, such as two searches. Run
them concurrently and return all results in one user message. Sending
each result as a separate message "teaches" Claude to stop making
parallel calls. Disable them with `disable_parallel_tool_use` inside
`tool_choice` (Anthropic) or `parallel_tool_calls: false` (OpenAI).

```ts
const results = await Promise.all(calls.map(async (call) => {
  const out = await execute(call.name, call.input, ctx);
  return { type: "tool_result" as const, tool_use_id: call.id,
    content: out.content, is_error: out.isError };
}));
messages.push({ role: "user", content: results });
```

### 11. Where do duplicate writes come from in an agent, and how do you prevent them?

The model repeats a call, a client retries after a timeout that hid a
success, a user double-clicks, or a worker restarts mid-step. Prevent them
with an idempotency key per write backed by a unique index, and by
fingerprinting proposals (user, tool and normalized input) so a repeated
call returns the same pending action.

### 12. How do you require confirmation before a write?

Make write tools propose instead of act: store a pending action, return
"needs confirmation" to the model, and show a confirmation card built
from the stored action. A separate endpoint, called only by the user's
click, claims the action atomically, re-validates and re-authorizes it,
and runs the idempotent write.

### 13. Why build the confirmation card from stored data instead of the model's message?

The model's text can be wrong or manipulated. If the card shows what the
model says while the server executes what was stored, a user can approve
something different from what they see. Render exactly the stored
action.

### 14. What does `tool_choice` do?

It lets the model decide (`auto`), forces a call (Anthropic `any` or a
named `tool`; OpenAI `required` or a named function), or forbids calls
(`none`). In November 2026, Anthropic's docs list several of the newest
Claude models that reject forced calls and recommend `auto` with strict
tool use instead.

### 15. How many tools should an agent have?

As few as the job needs. OpenAI's guide suggests fewer than 20 functions
at the start of a turn. Overlapping tools make choice harder and every
request longer. For large catalogs, use tool search or deferred loading,
or route requests to smaller tool sets.

### 16. How do you test a tool loop without calling a model?

Inject a scripted model that returns canned turns and records requests.
Assert the protocol: every `tool_use` gets a result, results come in one
message, writes stay pending until confirmed, the step budget stops a
loop that never ends. Test the model's tool choices separately, with
real models and an evaluation set.

## Agent orchestration patterns

### 17. What is the difference between a workflow and an agent?

In Anthropic's definitions, a workflow orchestrates models and tools
through predefined code paths; an agent lets the model direct its own
process and tool use. Workflows are cheaper, faster and easier to test;
agents suit open-ended tasks whose steps cannot be predicted.

### 18. Name the five workflow patterns from "Building effective agents".

Prompt chaining (fixed steps, with gates in code), routing (classify,
then hand to a specialist), parallelization (sectioning or voting),
orchestrator-workers (a lead model creates subtasks at run time), and
evaluator-optimizer (generate, critique, revise).

### 19. What is a gate in prompt chaining?

A check in code between steps that can stop the chain: for example,
validating extracted action items against a schema before proposing
tasks. On failure the chain sends the item to review instead of
guessing.

### 20. How should a router handle a label it does not recognize?

Fall back to a safe default, such as a general reply or a clarifying
question, and log it. Parse the label against an enum; never let an
unexpected label pick a handler by string matching.

### 21. When is orchestrator-workers better than fixed parallel steps?

When the subtasks depend on the input. "Plan the v3 launch" might need
three work streams for one project and two for another. If the split is
always the same, a fixed parallel workflow is cheaper and easier to
test.

### 22. When does evaluator-optimizer help, and what limits it?

When quality criteria are clear and checkable, and revision measurably
improves results. Cap the rounds, use a rubric, and calibrate the
evaluator against human labels; a vague evaluator approves everything.

### 23. What did Anthropic report about the cost of agents and multi-agent systems?

In its June 2025 post on its multi-agent research system, Anthropic
reported that agents used about 4 times the tokens of chat interactions
and multi-agent systems about 15 times. Multi-agent designs pay off only
for high-value tasks that split into independent parts.

### 24. When is a multi-agent design a poor fit?

When the parts need shared context or depend heavily on each other.
Anthropic's post names most coding tasks as an example. Start with one
agent and split only when context size or parallelism is the measured
bottleneck.

### 25. What is a handoff?

Transferring a conversation from one agent to another that owns a
domain, often with different tools and permissions; the OpenAI Agents
SDK has handoffs as a primitive. It differs from calling a subagent as a
tool, where the lead agent keeps control and receives a summary.

### 26. Why is a conversation transcript a poor record of a long-running process?

It grows with every step, does not say which side effects already
happened, and disappears with the process that held it. A durable run
needs explicit state: workflow version, next step, step outputs, status
and a revision number.

### 27. What is durable execution?

Running a workflow so that it survives crashes and restarts without
losing progress. Temporal rebuilds workflow state from a durable event
history; LangGraph saves graph state through checkpointers keyed by a
thread ID; a simple version checkpoints a run document after every step.

### 28. Why must steps in a durable run be idempotent?

A crash after a step's side effect but before its checkpoint means the
step runs again on retry. Execution is at least once; idempotency keys
(for example `runId:itemIndex` with a unique index) make the effect
happen once.

### 29. How do you stop two workers from advancing the same run?

Compare-and-set on a revision number: save only if the stored revision
is the one you loaded, and treat a failed save as "someone else moved
it".

```ts
const res = await runs.replaceOne({ _id: next._id, rev: next.rev - 1 }, next);
if (res.matchedCount !== 1) throw new Error("Run changed by another worker");
```

### 30. What budgets should an agent loop enforce?

Model calls (steps), tool calls, tokens, wall-clock time, and repeated
identical tool calls as a loop detector, plus per-user daily limits.
Persist usage with the run, so a resumed run does not get a fresh
budget.

### 31. How do you implement human-in-the-loop for a step that may wait days?

As a state: checkpoint, set the run to waiting, free the worker, and show
the person what will happen from stored data. An authenticated endpoint
validates the answer, records it in the run and resumes. Give the wait a
deadline and a default.

### 32. What is a "rainbow deployment" in the context of agents?

Keeping old and new versions running at once and shifting traffic
gradually, so updates do not break agents already mid-run. Anthropic
described using it for its research agents. The simpler equivalent is
pinning each run to the workflow version that started it.

## Computer use and browser agents

### 33. What is the difference between computer use and a browser agent?

Computer use operates a desktop through screenshots and mouse and
keyboard actions at coordinates. A browser agent operates web pages,
usually through the accessibility tree and element references as well
as screenshots. Anthropic offers both as client toolsets
(`computer_toolset_20260801` and `browser_toolset_20260801`).

### 34. Where do computer use actions actually run?

In your environment. The model returns actions; your executor performs
them in a browser or VM you control and returns results such as
screenshots. Anthropic's browser toolset documentation says nothing runs
on Anthropic's side.

### 35. How does a batch of browser actions differ from parallel tool calls?

Actions in a batch depend on each other (click a field, type, take a
screenshot), so they run in order, not concurrently, and stop at the
first failure. Every block still needs a result (the skipped ones get
an error saying they were not executed), and with Anthropic's toolsets
each result must echo the block's `toolset_name`.

### 36. How do you sandbox a browser agent?

A disposable container or VM per task, non-root, with no host mounts and
resource limits; a fresh browser profile with no saved logins; an egress
proxy that allows only the task's domains and blocks private ranges and
the metadata address; risky members off; human approval for
consequential actions; and full action logs.

### 37. Why check a URL both before and after navigation?

Redirects and DNS can take the browser somewhere the first check never
saw. Check the requested URL, check the final URL after redirects, and
enforce the same allowlist at the network layer, because a code check
alone can be bypassed.

### 38. How do web pages attack a browser agent?

Through indirect prompt injection: instructions in visible or hidden
text, image text, titles or URLs. A common goal is exfiltration, such as
getting the agent to put private data into a URL on the attacker's
server. Others are unwanted actions and corrupted results.

### 39. Which defenses reduce injection success, and which limit its damage?

Reducers: reading the rendered accessibility tree instead of raw HTML, a
system prompt that marks page content as data, provider classifiers and
model training. Limiters: no secrets in context, allowlists in code and
on the network, disabled members, and human approval. Design assuming
the reducers will sometimes fail.

### 40. How should an executor treat provider safety checks?

OpenAI's pending safety checks, Gemini's `require_confirmation` decisions
and Anthropic's injection classifiers are signals to pause and ask a
person. Their absence is not approval; your own allowlist and approval
rules apply to every action.

### 41. Why are browser agents expensive?

Each step is a model call, and screenshots are large inputs (Anthropic's
docs estimate roughly 1,000 to 1,800 input tokens each). Prefer structure
reads such as `read_page` and `get_page_text`, cap steps, and follow the
provider's guidance on screenshot history.

### 42. When should you use a recorded script instead of an agent?

When the flow is known and repeated. A Playwright script is faster,
cheaper, deterministic and testable. An agent can help explore a site or
write the script; it should not run the same flow every day.

## Agent protocols and interoperability

### 43. What problem does MCP solve, and what does A2A solve?

MCP connects an AI application to capabilities: tools, resources and
prompts offered by servers. A2A connects an agent to another agent that
plans and acts on its own, usually owned by someone else. They are
complementary, not competing.

### 44. Who governs MCP and A2A in November 2026?

Both are hosted by the Agentic AI Foundation (AAIF), a foundation under
the Linux Foundation formed on December 9, 2025 with MCP, goose and
AGENTS.md. A2A, launched by Google in April 2025, became a Linux
Foundation project in June 2025, reached 1.0 in March 2026, and joined
the AAIF in August 2026.

### 45. What changed in MCP's 2026-07-28 revision?

It became stateless: no `initialize` handshake and no protocol sessions;
each request carries its version and capabilities. Servers must implement
`server/discover`. Multi round-trip requests replace server-initiated
sampling and elicitation, tasks moved to an extension, and Roots,
Sampling, Logging, HTTP+SSE and Dynamic Client Registration were
deprecated.

### 46. What is an A2A Agent Card?

A JSON document describing an agent: name, description, provider,
version, supported interfaces (binding, URL, protocol version, in
preference order), capabilities, security schemes and skills. It is
usually served at `/.well-known/agent-card.json`, can be signed with JWS,
and can have an authenticated extended version.

### 47. What are the A2A 1.0 task states?

`SUBMITTED`, `WORKING`, `INPUT_REQUIRED`, `AUTH_REQUIRED`, and the
terminal states `COMPLETED`, `FAILED`, `CANCELED` and `REJECTED`. The two
"required" states pause the task until the client sends more input or
credentials on the same task.

### 48. How do you turn an OpenAPI document into tools safely?

Allowlist operations by `operationId`, combine path and query parameters
and the JSON body into one input schema, rewrite descriptions for the
model, keep the base URL and credentials on the server, encode path
parameters, validate input before building the request, and trim
responses.

### 49. What is token passthrough, and why is it forbidden in MCP?

Accepting a token that was not issued for your server, or forwarding a
received token to another API. It lets one leaked or misdirected token
work across services and bypasses each service's own checks. MCP's
security guidance says servers must not accept tokens not explicitly
issued for them; downstream calls use the server's own credentials or a
token exchange (RFC 8693).

### 50. How does an MCP client discover where to get a token?

The server answers an unauthenticated request with `401` and a
`WWW-Authenticate` header whose `resource_metadata` points to its
Protected Resource Metadata (RFC 9728). That document lists the
authorization servers. The client then uses authorization code with
PKCE and a `resource` parameter (RFC 8707) naming the server.

### 51. What should an MCP server check on every request?

That the bearer token is valid and unexpired, was issued by the expected
issuer, names this server as its audience, and carries the scope the
operation needs. Return `401` with the metadata challenge for a bad
token, and `403` with `error="insufficient_scope"` and the scope for a
missing scope.

### 52. Does being listed in a registry make an MCP server trustworthy?

No. The MCP Registry (in preview in November 2026) verifies namespaces
through DNS and stores metadata; it does not vouch for behavior. Review
the publisher and code, pin versions, grant least privilege, and alert
when tool lists or descriptions change.

## Scenario-based questions

### 53. After a release, Claude requests fail with "tool_use ids were found without tool_result blocks immediately after". What do you check?

**What to check first:** the messages sent on the failing request,
especially the turn after an assistant message with several `tool_use`
blocks.

**How to confirm:** count `tool_use` IDs in the assistant turn and
`tool_result` IDs in the next user message; look for a missing result or
a text block placed before the results.

**Likely causes and fixes:** a tool threw and its result was dropped, a
status message was inserted between the turns, or text was prepended to
the results. Answer every block, failures included, in one message with
results first, and add a scripted-model test. See
[tool calling in practice](tool-calling-in-practice.md).

### 54. Users report duplicate tasks created by the assistant. What do you check?

**What to check first:** whether duplicates share a run or conversation
ID and were created seconds apart.

**How to confirm:** trace the run: did the model call `create_task`
twice, did the client retry, or did a confirm request arrive twice?

**Likely causes and fixes:** writes executed directly from tool calls
with no idempotency key. Turn writes into fingerprinted proposals,
claim them atomically on confirm, and back the write with a unique
`idempotencyKey` index. See
[tool calling in practice](tool-calling-in-practice.md).

### 55. The assistant updated a task in another customer's workspace. What do you check?

**What to check first:** the tool handler's authorization path for
`update_task`.

**How to confirm:** the audit log shows the actor's project list did not
include the task's project; the handler read the ID from tool input and
never checked it.

**Likely causes and fixes:** trusting model-supplied IDs. Authorize every
ID against the session context at proposal and at confirmation, use one
"not found" message, and add cross-tenant tests. See
[tool calling in practice](tool-calling-in-practice.md).

### 56. Parallel tool calls stopped happening after a refactor, and latency rose. Why?

**What to check first:** how the loop appends tool results.

**How to confirm:** the history shows one user message per
`tool_result`, or `disable_parallel_tool_use` was set.

**Likely causes and fixes:** results split across messages teach the
model to avoid parallel calls. Return all results for a turn in one user
message and check `tool_choice` settings. See
[tool calling in practice](tool-calling-in-practice.md).

### 57. Agent runs restart from scratch after every deploy, repeating side effects. What do you change?

**What to check first:** where run state lives.

**How to confirm:** repeated model calls and writes for the same run ID
appear right after each deploy.

**Likely causes and fixes:** state held in process memory. Store a run
document, checkpoint after each step, make steps idempotent, pin runs to
their workflow version, and let workers resume runs that stopped mid-way.
See [agent orchestration patterns](agent-orchestration-patterns.md).

### 58. Token spend tripled after a "planner" feature shipped. Where do you look?

**What to check first:** tokens and steps per completed task, split by
request type.

**How to confirm:** traces show the orchestrator spawning subagents for
requests that one call used to handle.

**Likely causes and fixes:** orchestrator-workers used where routing or a
single call would do. Route simple requests away from the planner, cap
subagents and tokens per run, and alert on cost per completed task. See
[agent orchestration patterns](agent-orchestration-patterns.md).

### 59. Some agent runs end only when the time limit hits. What is going on?

**What to check first:** the last few tool calls of those runs.

**How to confirm:** the same tool is called with the same input again
and again, each returning a vague error.

**Likely causes and fixes:** an error message the model cannot act on,
and no loop guard. Return specific, fixable errors, add a repeat limit to
the budget, and alert when runs end by budget. See
[agent orchestration patterns](agent-orchestration-patterns.md).

### 60. Users approve a plan, but the run never continues. What do you check?

**What to check first:** the run document's status, step and workflow
version after approval.

**How to confirm:** the status stays `waiting`, or the step index points
past the end of the current step list.

**Likely causes and fixes:** the approval endpoint saved the answer but
nothing resumed the run, or a new deploy changed the step list. Resume
inside the approval request or a queue job, and keep old workflow
versions until their runs finish. See
[agent orchestration patterns](agent-orchestration-patterns.md).

### 61. The browser agent's logs show an attempt to open an unknown domain with data in the query string. What do you do?

**What to check first:** the page the agent had just read, and what data
was in its context.

**How to confirm:** the page text or a screenshot contains instructions
aimed at the agent; the executor and proxy logs show the request was
refused.

**Likely causes and fixes:** indirect prompt injection. Keep the
allowlist and proxy block, alert security, quarantine the source, check
that no secrets were in context, and add the page to injection tests.
See [computer use and browser agents](computer-use-and-browser-agents.md).

### 62. Browser agent runs take many minutes and cost far more than estimated. What do you check?

**What to check first:** steps per run and input tokens per step.

**How to confirm:** most input tokens are images, with a screenshot after
nearly every action.

**Likely causes and fixes:** screenshot-driven navigation on pages that
expose structure. Prefer `read_page` and element references, resize
screenshots, cap steps, and for known flows replace the agent with a
recorded script. See
[computer use and browser agents](computer-use-and-browser-agents.md).

### 63. An MCP client keeps redirecting users to sign in and never reaches the tools. What do you check?

**What to check first:** the server's `401` response and its
`WWW-Authenticate` header.

**How to confirm:** the header lacks `resource_metadata`, the metadata
URL returns 404, or the metadata's `resource` differs from the URL the
client calls, so tokens never match the audience.

**Likely causes and fixes:** incomplete Protected Resource Metadata
setup. Publish the metadata at the documented location, make `resource`
the server's canonical URI, and test with a reference client. See
[agent protocols and interoperability](agent-protocols-and-interoperability.md).

### 64. A token issued for your MCP server was accepted by the internal billing API. What failed?

**What to check first:** the audience and issuer checks in the billing
API, and whether the MCP server forwards tokens.

**How to confirm:** billing logs show requests whose token audience is
the MCP server, sent by the MCP server.

**Likely causes and fixes:** token passthrough plus missing audience
validation. Stop forwarding, use token exchange or service credentials
for downstream calls, and validate audience in every API. See
[agent protocols and interoperability](agent-protocols-and-interoperability.md).

### 65. After a partner upgraded their agent, your A2A calls fail. What do you check?

**What to check first:** the partner's current Agent Card and the
interface your client selected.

**How to confirm:** the card no longer lists the binding or protocol
version your client uses, or responses carry a version-not-supported
error.

**Likely causes and fixes:** a dropped interface or version. Select from
`supportedInterfaces` in preference order at run time, send the
`A2A-Version` header, revalidate cached cards with ETags, and agree on
deprecation windows with partners. See
[agent protocols and interoperability](agent-protocols-and-interoperability.md).

## Further learning

- [Tool calling and agents overview](../tool-calling-and-agents.md)
- [Tool calling in practice](tool-calling-in-practice.md) ·
  [Agent orchestration patterns](agent-orchestration-patterns.md) ·
  [Computer use and browser agents](computer-use-and-browser-agents.md) ·
  [Agent protocols and interoperability](agent-protocols-and-interoperability.md)
- [MCP and agent integrations](../mcp-and-agent-integrations.md)
- [Anthropic: Building effective agents](https://www.anthropic.com/engineering/building-effective-agents)
- [OpenAI: Function calling](https://developers.openai.com/api/docs/guides/function-calling)
- [OWASP Top 10 for LLM Applications](https://genai.owasp.org/llm-top-10/)
