# Tool Calling and Agents Cheat Sheet

Quick revision of the tool calling and agents lessons, for a last look
before an interview or before wiring tools into TaskFlow's assistant.

## Key configuration

| | Anthropic Messages API | OpenAI Responses API | Gemini (`@google/genai`) |
|---|---|---|---|
| Schema field | `input_schema` | `parameters` | `parametersJsonSchema` |
| Model asks | `tool_use` block with `id` | `function_call` item with `call_id` | `functionCall` part with `id` |
| You answer | `tool_result` blocks first in the next user message | `function_call_output` with `call_id` and `output` | `functionResponse` parts |
| Errors | `is_error: true` | Error text in `output` | An `error` key instead of `output` |

| Setting | Anthropic | OpenAI |
|---|---|---|
| Strict schemas | `strict: true`; optional fields allowed | `strict: true`; every property in `required`, optional means `["string", "null"]` |
| One call per turn | `disable_parallel_tool_use: true` inside `tool_choice` | `parallel_tool_calls: false` |
| Force a call | `any` or `tool` (some newest models return 400: use `auto` with strict) | `required` or a named function |

```ts
// mcp-server/verify-token.ts (excerpt): only tokens issued for this server
({ payload } = await jwtVerify(token, keys,
  { issuer: ISSUER, audience: RESOURCE, algorithms: ["ES256"],
    requiredClaims: ["exp", "sub"] }));
```

## Decision guide

| If you need | Choose | Why |
|---|---|---|
| Live per-user data and a few dependent steps | Tool calling with narrow, task-shaped tools | The server checks every call |
| A request that always maps to one operation | Structured output, then call the function from code | No loop to bound |
| Predictable steps | A workflow: chaining with gates, routing, parallelization | Cheaper and easier to test than an agent |
| Subtasks that depend on the input | Orchestrator-workers | The lead model creates subtasks at run time |
| Clear, checkable quality criteria | Evaluator-optimizer with capped rounds | Revision against a rubric measurably helps |
| Open-ended work with unpredictable steps | An agent with budgets | The model directs its own tool use |
| Runs that wait days or survive deploys | A durable run (run document, checkpoints) or Temporal or LangGraph | Resumes after crashes without repeating side effects |
| A known, repeated web flow | A recorded Playwright script | Fast, deterministic, testable |
| Dynamic pages or an unknown site | A sandboxed browser agent | Works from the accessibility tree and element refs |
| A desktop app with nothing to read | Computer use | Screenshots plus mouse and keyboard |
| Your tools in many AI hosts | An MCP server | One implementation serves every client |
| Delegating a goal to another company's agent | A2A | The remote agent plans; tasks have states and artifacts |
| A plain HTTP API | Allowlisted tools generated from OpenAPI | Schemas stay in sync with the API |

## Numbers and defaults to remember

| Item | Value |
|---|---|
| Anthropic tool name | `^[a-zA-Z0-9_-]{1,128}$` |
| Anthropic strict limits | 20 strict tools, 24 optional and 16 union-typed parameters per request; no `minLength`, `maxLength`, `minimum`, `maximum`, `multipleOf` |
| OpenAI tool count | Fewer than 20 functions at the start of a turn (soft); tool search for more |
| Invalid calls | Claude retries 2 to 3 times with corrections |
| TaskFlow assistant loop | 6 steps, 12 tool calls, 5,000 ms per tool, results capped at 4,000 characters |
| Pending write proposal | Expires after 15 minutes; confirm claims it atomically |
| Agent token cost (Anthropic, June 2025) | About 4 times chat; multi-agent about 15 times |
| Screenshot | Roughly 1,000 to 1,800 input tokens each |
| Anthropic toolsets | `computer_toolset_20260801`: 17 members; `browser_toolset_20260801`: 27 default plus 4 opt-in |
| Gemini computer use | Coordinates on a normalized 1000 by 1000 grid |
| MCP revision | `2026-07-28`: stateless, `server/discover`, multi round-trip requests; deprecations last at least 12 months |
| A2A | 1.0 since March 2026; card at `/.well-known/agent-card.json`; `A2A-Version` header |
| A2A task states | `SUBMITTED`, `WORKING`, `INPUT_REQUIRED`, `AUTH_REQUIRED`; ends `COMPLETED`, `FAILED`, `CANCELED`, `REJECTED` |
| Auth errors | `401` with `resource_metadata`; `403` with `error="insufficient_scope"` and the scope |

## Top mistakes

- **Results split across messages, or text before them.** Send one user
  message per turn with every `tool_result` first, matched by ID.
- **Trusting model-supplied IDs.** Take the user from the session, check
  every ID against it, and use one "not found" message for both cases.
- **Writes run straight from a tool call.** Propose, let the user confirm,
  claim atomically, and write with an idempotency key on a unique index.
- **The transcript as the only state.** Keep a run document with a
  revision check, checkpoint each step, and make every step idempotent.
- **A step limit as the only budget.** Also cap tool calls, tokens, time
  and repeated identical calls, and persist usage with the run.
- **A browser agent on a normal machine.** Use a disposable non-root
  sandbox, a fresh profile, an egress proxy, URL checks before and after
  navigation, and stop a batch at the first failure.
- **Adding `::ffff:0:0/96` to a Node `BlockList`.** It already checks
  IPv4-mapped addresses against the IPv4 rules; that subnet blocks every
  IPv4 address.
- **Token passthrough.** Check issuer, audience, expiry and scope, and
  call downstream APIs with your own credentials or a token exchange.

## Where to go deeper

- [Tool calling in practice](tool-calling-in-practice.md)
- [Agent orchestration patterns](agent-orchestration-patterns.md)
- [Computer use and browser agents](computer-use-and-browser-agents.md)
- [Agent protocols and interoperability](agent-protocols-and-interoperability.md)
- [Tool calling and agents interview questions and answers](interview-questions-and-answers.md)
- [MCP and agent integrations](../mcp-and-agent-integrations.md)

Back to the [Tool calling and agents overview](../tool-calling-and-agents.md).
