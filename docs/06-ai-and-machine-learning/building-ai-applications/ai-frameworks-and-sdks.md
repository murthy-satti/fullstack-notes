# AI Frameworks and SDKs

Every AI feature in TaskFlow ends in an HTTP call to a model provider. The
question is how many layers of library code sit between your code and
that call. You can use a provider's official SDK directly, a unified
toolkit such as the Vercel AI SDK, an orchestration framework such as
LangChain and LangGraph or LlamaIndex, or an agent SDK that runs the
whole tool-calling loop for you.

This lesson explains what each option does, when it fits, what lock-in it
creates, and how mature it is, then implements the same TaskFlow
Assistant features with each one. Versions and dates are as of November
2026; this ecosystem changes quickly, so recheck them before you choose.

## Why it matters

- **The choice outlives the model.** You will change models several
  times; changing frameworks means rewriting prompts, tools, state, and
  tests.
- **Upgrades are frequent.** The AI SDK shipped major versions 5, 6, and
  7 on 2025-07-31, 2025-12-22, and 2026-06-25; the official `openai`
  package went from version 5 to 7 between May 2025 and July 2026. Each
  major version is a migration to plan.
- **Abstractions hide the prompt.** When an answer is wrong, you need to
  see the exact request that was sent. Every layer that builds prompts
  for you is a layer to debug through.
- **Dependencies collide.** Frameworks bring their own versions of shared
  libraries. In November 2026 the LangGraph MongoDB checkpointer depends
  on the 6.x MongoDB driver, so an app already on driver 7 ends up with
  two drivers and a type error (shown in the examples).
- **Too little structure costs too.** Hand-rolling durable agent state,
  tool loops, retries, and streaming protocols for the third time is
  slower and buggier than using a well-tested library.

## Real-world usage

- **Anthropic on frameworks.**
  [Building effective agents](https://www.anthropic.com/research/building-effective-agents)
  recommends that developers start by using LLM APIs directly, because
  frameworks "often create extra layers of abstraction that can obscure
  the underlying prompts and responses, making them harder to debug", and
  advises understanding the underlying code if you do use one.
- **Vercel AI SDK.** The
  [introduction](https://ai-sdk.dev/docs/introduction) describes the AI SDK
  as a TypeScript toolkit for building AI applications and agents with
  React, Next.js, Vue, Svelte, and Node.js, with one API across model
  providers.
- **LangChain and LangGraph.** The
  [LangChain overview](https://docs.langchain.com/oss/javascript/langchain/overview)
  states that LangChain's agents are built on top of LangGraph, to take
  advantage of its durable execution, human-in-the-loop support, and
  persistence.
- **Microsoft Agent Framework.** The
  [overview](https://learn.microsoft.com/en-us/agent-framework/overview/)
  calls it the direct successor of Semantic Kernel and AutoGen, built by
  the same teams: a reminder that frameworks merge and get replaced.

**Popular tools and providers:** the official `openai`,
`@anthropic-ai/sdk`, and `@google/genai` packages; the Vercel AI SDK;
LangChain and LangGraph; LlamaIndex; Mastra; the OpenAI Agents SDK; Google
Agent Development Kit (ADK); the Claude Agent SDK; Microsoft Agent
Framework; and, in Python, Pydantic AI, Haystack, DSPy, and CrewAI.

## How it works

### The layers

![Diagram: five layers from bottom to top; provider HTTP APIs such as Responses, Messages, generateContent, and realtime speech APIs are the actual contract; official provider SDKs (openai, Anthropic, Google Gen AI) are typed wrappers for one vendor; a unified model API (Vercel AI SDK Core and UI, LangChain chat models) gives one call shape across providers; frameworks (LangGraph, LangChain createAgent, Mastra, LlamaIndex, and in Python Pydantic AI, Haystack, DSPy) add graphs, memory, and retrieval; agent SDKs (OpenAI Agents SDK, Google ADK, Claude Agent SDK, Microsoft Agent Framework) run the agent loop with tools and handoffs; moving up gives more built in, moving down more control.](framework-layers.svg)

Each layer up saves code and adds concepts. A good rule is to use the
lowest layer that covers today's need, and to keep whatever you choose
behind an interface you own.

### Official provider SDKs

The official SDKs (`openai`, `@anthropic-ai/sdk`, `@google/genai`, each
also published for Python) are thin, typed wrappers over one provider's
HTTP API. They give you request and response types generated from the
API specification, streaming helpers, structured-output helpers that
validate against a zod schema, automatic retries for network errors and
5xx responses (the `openai` client retries twice by default), and
pagination. New provider features appear here first, often on the day
they launch.

What they do not give you: a common shape across providers. The same
task-parsing call is `client.responses.parse()` with OpenAI,
`client.messages.parse()` with Anthropic, and
`ai.models.generateContent()` with Google, each with different message
formats, tool definitions, and streaming events. If TaskFlow uses one
provider, that does not matter. Calling the Responses, Messages, and
Gemini APIs from a backend is covered in
[calling model APIs from a backend](../hosted-model-apis/calling-model-apis-from-a-backend.md).

### The Vercel AI SDK

The AI SDK has three parts. **AI SDK Core** (`generateText`,
`streamText`, typed `tool()` definitions, structured output through
`Output.object()`, and multi-step tool loops capped by `stopWhen`) gives
one call shape for every provider. **Provider packages**
(`@ai-sdk/openai`, `@ai-sdk/anthropic`, `@ai-sdk/google`, and many more)
translate that shape to each API. **AI SDK UI** (`useChat` for React and
equivalents for other frameworks) consumes a streaming protocol that the
server side produces with one call.

Strengths: switching providers is a configuration change, the
server-to-UI streaming protocol is solved, and provider-specific options
still pass through `providerOptions`. Costs: a message format of its own
(`UIMessage` with typed `parts`), a fast major-version cadence, and an
extra layer between you and each provider's newest features. Major
versions have arrived roughly every five to six months; the current major
is 7 (AI SDK 7.0.0 shipped on 2026-06-25, with `@ai-sdk/react` 4).

### LangChain and LangGraph

**LangGraph** is a low-level runtime for stateful workflows: you declare
state, nodes, and edges, and it runs the graph with **checkpointers**
that save state after each step. That gives durable execution (resume
after a crash), human-in-the-loop interrupts (pause for approval, resume
later), and history you can inspect. **LangChain** v1 sits on top: its
`createAgent()` builds a standard tool-calling agent on LangGraph, with
middleware for guardrails, retries, and summarization. Both reached 1.0
in October 2025 (JavaScript and Python), and as of November 2026 the
JavaScript packages are `langchain` 1.6 and `@langchain/langgraph` 1.7.

Use LangGraph when the workflow itself is the product: multi-step agents
that must survive restarts, wait for a person, or branch. Costs: a large
dependency tree, framework-specific state and message types, and version
alignment across many `@langchain/*` packages. LangSmith, the company's
tracing and evaluation service, is separate and optional.

### LlamaIndex

LlamaIndex is a data framework for retrieval: document loaders, node
parsers (chunking), index types, retrievers, query engines that combine
retrieval and generation, and workflow and agent components on top. The
Python package is the primary one and very active (`llama-index` 0.14.26
was published on 2026-11-13). The TypeScript packages are much quieter:
the `llamaindex` umbrella package was last published in December 2025,
and the last `@llamaindex/*` releases (March 2026) are marked on npm as
deprecated and no longer maintained, as of November 2026. For a
Node backend that is a strong warning sign; for a Python data
service, LlamaIndex is a strong default for document-heavy retrieval.
Retrieval design itself is covered in
[building a RAG pipeline](../retrieval-augmented-generation/building-a-rag-pipeline.md).

### Agent SDKs and other frameworks

Agent SDKs run the tool-calling loop for you: the model asks for a tool,
the SDK executes your function, feeds the result back, and repeats until
the model answers or a turn limit is hit. Most add handoffs between
agents, guardrails, sessions, and tracing.

- **OpenAI Agents SDK** (`@openai/agents` 0.22 for JavaScript,
  `openai-agents` 0.24 for Python): agents, tools, handoffs, guardrails,
  and built-in tracing. Still pre-1.0, so expect breaking changes.
- **Google Agent Development Kit** (`google-adk` 2.14 for Python,
  `@google/adk` 2.5 for TypeScript): multi-agent systems with Google
  Cloud deployment options; the TypeScript package reached 1.0 in April
  2026.
- **Claude Agent SDK** (`@anthropic-ai/claude-agent-sdk` 0.3): the agent
  harness behind Claude Code, with file, shell, and search tools, for
  agents that work on codebases and files.
- **Mastra** (`@mastra/core` 1.83, 1.0 in January 2026): a TypeScript
  framework with agents, workflows, memory, and evals in one package.
- **Microsoft Agent Framework** (Python and .NET, with Go in preview; 1.0
  in April 2026): the
  successor of Semantic Kernel and AutoGen.
- **Python-first options:** Pydantic AI (typed agents, 1.0 in September
  2025), Haystack (pipelines for search and RAG), DSPy (optimizing prompts
  as programs), and CrewAI (role-based multi-agent crews).

How agents are orchestrated, and how to keep their tools safe, is covered
in [agent orchestration patterns](../tool-calling-and-agents/agent-orchestration-patterns.md)
and [tool calling in practice](../tool-calling-and-agents/tool-calling-in-practice.md).

### Comparison

| Option | What it does | Use when | Lock-in | Maturity (November 2026) |
|---|---|---|---|---|
| Official provider SDK | Typed client for one provider | One provider, few calls; newest features first | Provider API shapes in your code | Stable; frequent majors (`openai` 7, `@anthropic-ai/sdk` 1, `@google/genai` 3) |
| Vercel AI SDK | One API for many providers, streaming UI hooks | TypeScript apps, React chat UIs, provider switching | `UIMessage` format; yearly-plus majors | Version 7; widely used, fast cadence |
| LangChain `createAgent` | Standard tool-calling agent with middleware | A conventional agent quickly, in JS or Python | Framework message and tool types | 1.x since October 2025 |
| LangGraph | Stateful graphs with checkpoints and interrupts | Durable, resumable, human-in-the-loop workflows | Graph and checkpoint schemas | 1.x since October 2025 |
| LlamaIndex | Loaders, chunking, indexes, query engines | Document-heavy retrieval, especially in Python | Index and node abstractions | Python very active (0.14); TypeScript `@llamaindex/*` deprecated |
| OpenAI Agents SDK | Agent loop, handoffs, guardrails, tracing | Agents mainly on OpenAI models | Agent and tracing model | Pre-1.0 (0.22 JS, 0.24 Python) |
| Mastra | TypeScript agents, workflows, memory, evals | An all-in-one TypeScript agent stack | Mastra workflow and memory formats | 1.x since January 2026 |
| Google ADK | Multi-agent systems, Google Cloud deployment | Teams on Google Cloud | ADK agent model | Python 2.x; TypeScript 2.x |

### Where lock-in really lives

Swapping an import is easy. What is hard to move is everything a library
owns on your behalf:

- **Message and state formats:** conversations stored as framework
  objects, or checkpoint documents only the framework can read.
- **Prompts built inside library classes**, which you cannot see, diff,
  or version alongside your code.
- **Tool definitions** written against one framework's helper.
- **Tracing and evaluation** wired to one vendor's service.
- **Provider-only features** (server-side conversation state, hosted
  file search) that an abstraction exposes partially or not at all.

![Diagram: TaskFlow features (task creation, project Q and A, meeting summaries, the task agent) all call one TaskFlow AI service, an interface the team owns with parseTask, answerQuestion, summarizeNote, and runAgent, which owns prompts, schemas, validation, and tracing; behind it an AI SDK adapter reaches OpenAI, Anthropic, Google, or a local model, a LangGraph adapter is used only for the agent workflow, and a fake adapter serves tests with no network; TaskFlow owns prompts, schemas, conversation data, eval sets, and traces, while SDKs, frameworks, and providers are replaceable.](adapter-boundary.svg)

The defense is architectural: TaskFlow's routes and jobs call a small
`AiService` interface. Prompts live in TaskFlow's repository, schemas are
zod (which exports standard JSON Schema), conversations live in TaskFlow's
MongoDB collections (see
[conversation state and memory](conversation-state-and-memory.md)), and
evals run against the interface, not the framework. A different adapter
can then replace the AI SDK, or LangGraph can run only the one workflow
that needs it.

### Choosing

![Diagram: four questions in order; one provider and a few model calls leads to the official provider SDK; a React chat UI or many providers in TypeScript leads to the Vercel AI SDK; a long-running agent with resume or approvals leads to LangGraph, or Mastra or the OpenAI Agents SDK; retrieval over many document types as the core leads to LlamaIndex, whose Python package is the most active; if none apply, use the provider SDK behind your own interface and adopt a framework when a concrete need appears.](framework-decision.svg)

For TaskFlow the outcome is mixed, which is normal: the AI SDK for the
chat assistant and structured task creation (React UI, provider
flexibility), LangGraph for the meeting-summary and task agent workflows
that must resume and pause for approval, and the official SDKs for
features only one provider offers.

## When to use and when not to use

| Approach | Use when | Avoid when |
|---|---|---|
| Official SDK only | One provider; you want every new feature immediately and the clearest debugging | You must support several providers with one code path |
| Vercel AI SDK | TypeScript backends and React UIs, several providers, streaming chat | You need a provider feature it does not expose yet (use the official SDK for that call) |
| LangChain `createAgent` | A conventional tool-calling agent with middleware, quickly | A single model call: the agent machinery is overhead |
| LangGraph | Durable multi-step workflows, approvals, resumability | Linear request-response features |
| LlamaIndex | Retrieval over many document types, especially in Python | A small, fixed corpus your own pipeline already handles |
| Agent SDKs | Multi-agent handoffs and tracing on one provider ecosystem | Strict provider neutrality, or when you need full control of every request |
| Your own thin layer | Always, around whichever library you pick | Never skip it for a product you will maintain for years |

## Practical examples

All examples implement TaskFlow Assistant features. They type-check
against the package versions named above; model IDs come from
configuration (choose them from each provider's current model list).

### One schema, three official SDKs

The schema and instructions are shared, so only the client call changes:

```ts
// src/ai/taskDraft.ts
import { z } from "zod";

// The TaskFlow Assistant turns "remind Sam to send the Q3 deck by Friday" into this shape.
export const TaskDraft = z.object({
  title: z.string(),
  dueDate: z.string().nullable().describe("ISO 8601 date, or null if no date was given"),
  priority: z.enum(["low", "medium", "high"]),
  assigneeName: z.string().nullable(),
});
export type TaskDraft = z.infer<typeof TaskDraft>;

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

export const instructions = (today: string) =>
  `Turn the user's request into one TaskFlow task. Today is ${today}. ` +
  "Resolve relative dates. Use null for anything the user did not say.";
```

The OpenAI SDK, in full:

```ts
// src/ai/parseTask.openai.ts
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { TaskDraft, instructions, requireEnv } from "./taskDraft.js";

const client = new OpenAI(); // OPENAI_API_KEY from the environment

export async function parseTask(text: string, today: string): Promise<TaskDraft | null> {
  const response = await client.responses.parse({
    model: requireEnv("CHAT_MODEL"),
    instructions: instructions(today),
    input: text,
    text: { format: zodTextFormat(TaskDraft, "task_draft") },
  });
  return response.output_parsed; // validated against the schema, or null on refusal
}
```

The Anthropic and Google equivalents:

```ts
// src/ai/parseTask.others.ts
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { TaskDraft, instructions, requireEnv } from "./taskDraft.js";

const anthropic = new Anthropic(); // ANTHROPIC_API_KEY
const google = new GoogleGenAI({}); // GEMINI_API_KEY

export async function parseTaskAnthropic(text: string, today: string) {
  const message = await anthropic.messages.parse({
    model: requireEnv("ANTHROPIC_CHAT_MODEL"),
    max_tokens: 1_024,
    system: instructions(today),
    messages: [{ role: "user", content: text }],
    output_config: { format: zodOutputFormat(TaskDraft) },
  });
  return message.parsed_output;
}

export async function parseTaskGoogle(text: string, today: string) {
  const response = await google.models.generateContent({
    model: requireEnv("GEMINI_CHAT_MODEL"),
    contents: text,
    config: {
      systemInstruction: instructions(today),
      responseMimeType: "application/json",
      responseJsonSchema: z.toJSONSchema(TaskDraft),
    },
  });
  return TaskDraft.parse(JSON.parse(response.text ?? "null")); // validate yourself
}
```

Three providers, three request shapes, three ways to get the parsed
result. Structured output in depth is covered in
[structured output and validation](../prompting-and-structured-output/structured-output-and-validation.md).

### The AI SDK: one shape, tools, and streaming

```ts
// src/ai/assistant.aisdk.ts
import type { Response } from "express";
import { convertToModelMessages, generateText, isStepCount, Output, streamText, tool, type UIMessage } from "ai";
import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { TaskDraft, instructions, requireEnv } from "./taskDraft.js";

// Switching provider is a configuration change, not a rewrite.
const model = process.env.CHAT_PROVIDER === "anthropic"
  ? anthropic(requireEnv("ANTHROPIC_CHAT_MODEL"))
  : openai(requireEnv("CHAT_MODEL"));

export async function parseTask(text: string, today: string) {
  const { output } = await generateText({
    model,
    instructions: instructions(today),
    prompt: text,
    output: Output.object({ schema: TaskDraft }),
  });
  return output;
}

// The agent: the model may call createTask, then answers. Streams to useChat.
export async function chat(uiMessages: UIMessage[], userId: string, res: Response) {
  const result = streamText({
    model,
    instructions: "You are TaskFlow Assistant. Create tasks only when the user asks.",
    messages: await convertToModelMessages(uiMessages),
    tools: {
      createTask: tool({
        description: "Create a task in the user's current project",
        inputSchema: TaskDraft,
        execute: async (draft) => ({ id: await saveTask(userId, draft), status: "created" }),
      }),
    },
    stopWhen: isStepCount(5), // cap tool-call loops
  });
  result.pipeUIMessageStreamToResponse(res); // Express; return result.toUIMessageStreamResponse() in fetch-style servers
}

declare function saveTask(userId: string, draft: z.infer<typeof TaskDraft>): Promise<string>;
```

`stopWhen: isStepCount(5)` matters: without a cap, a confused model can
call tools in a loop. The `chat` handler pairs with the `useChat`
component in
[frontend patterns for AI features](frontend-patterns-for-ai-features.md);
`userId` comes from the authenticated session, never from the model.

### A LangChain agent

```ts
// src/ai/assistant.langchain.ts
import { createAgent, tool } from "langchain";
import { ChatOpenAI } from "@langchain/openai";
import { TaskDraft, requireEnv } from "./taskDraft.js";

const createTask = tool(
  async (draft) => JSON.stringify({ id: await saveTask(draft), status: "created" }),
  { name: "create_task", description: "Create a task in the user's current project", schema: TaskDraft },
);

const agent = createAgent({
  model: new ChatOpenAI({ model: requireEnv("CHAT_MODEL") }),
  tools: [createTask],
  systemPrompt: "You are TaskFlow Assistant. Create tasks only when the user asks.",
});

export async function ask(text: string) {
  const result = await agent.invoke({ messages: [{ role: "user", content: text }] });
  return result.messages.at(-1)?.text; // the final assistant message
}

declare function saveTask(draft: TaskDraft): Promise<string>;
```

The same zod schema defines the tool; the agent loop, message types, and
middleware hooks now belong to LangChain.

### A resumable LangGraph workflow with a MongoDB checkpointer

The meeting-summary job from
[conversation state and memory](conversation-state-and-memory.md), as a
graph. The checkpointer saves state after each node per `thread_id`, so
a crashed run resumes from the last completed node:

```ts
// src/ai/meetingSummary.langgraph.ts
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { MongoDBSaver } from "@langchain/langgraph-checkpoint-mongodb";
import { MongoClient } from "mongodb";

const State = Annotation.Root({
  transcript: Annotation<string>(),
  chunks: Annotation<string[]>(),
  partials: Annotation<string[]>({ reducer: (a, b) => a.concat(b), default: () => [] }),
  summary: Annotation<string>(),
});

const mongo = new MongoClient(process.env.MONGODB_URI ?? "mongodb://localhost:27017");

// Each node's output is checkpointed per thread, so a crashed run resumes
// from the last completed node instead of starting over.
export const meetingSummary = new StateGraph(State)
  .addNode("split", async (s) => ({ chunks: splitIntoChunks(s.transcript) }))
  .addNode("summarizeChunks", async (s) => ({ partials: await Promise.all(s.chunks.map(summarizeChunk)) }))
  .addNode("combine", async (s) => ({ summary: await combineSummaries(s.partials) }))
  .addEdge(START, "split")
  .addEdge("split", "summarizeChunks")
  .addEdge("summarizeChunks", "combine")
  .addEdge("combine", END)
  .compile({ checkpointer: new MongoDBSaver({ client: mongo }) });

export async function summarizeNote(noteId: string, transcript: string) {
  const final = await meetingSummary.invoke({ transcript }, { configurable: { thread_id: `note-${noteId}` } });
  return final.summary;
}

declare function splitIntoChunks(text: string): string[];
declare function summarizeChunk(chunk: string): Promise<string>;
declare function combineSummaries(partials: string[]): Promise<string>;
```

Note the granularity: here a checkpoint covers the whole
`summarizeChunks` node, so a crash inside it redoes every chunk. The
hand-written job in the memory lesson checkpoints per chunk. Durable
frameworks only save what you model as separate steps.

This file type-checks in a project on the 6.x MongoDB driver. In a
project on driver 7, TypeScript reports that the `MongoClient` type is not
assignable, because `@langchain/langgraph-checkpoint-mongodb` 1.5.1
depends on `mongodb` `^6.21.0` and npm installs a second copy of the
driver for it. Check `npm ls mongodb` when you add the package, and align
the versions.

### Project Q&A with LlamaIndex

!!! warning "Deprecated TypeScript packages"
    As of November 2026 npm marks the TypeScript `@llamaindex/*` packages
    as deprecated and no longer maintained, with the last release in March
    2026. The example shows the API for reading existing code; for a new
    TypeScript backend prefer a maintained option above, or use LlamaIndex
    from Python.

```ts
// src/ai/projectQa.llamaindex.ts
import { Document, Settings, VectorStoreIndex } from "llamaindex";
import { openai, OpenAIEmbedding } from "@llamaindex/openai";
import { requireEnv } from "./taskDraft.js";

Settings.llm = openai({ model: requireEnv("CHAT_MODEL") });
Settings.embedModel = new OpenAIEmbedding({ model: requireEnv("EMBEDDING_MODEL") });

export async function buildIndex(notes: { id: string; title: string; text: string }[]) {
  const documents = notes.map((n) => new Document({ id_: n.id, text: n.text, metadata: { title: n.title } }));
  return VectorStoreIndex.fromDocuments(documents); // chunks, embeds, and stores in memory
}

export async function askProject(index: VectorStoreIndex, question: string) {
  const engine = index.asQueryEngine({ similarityTopK: 4 });
  const response = await engine.query({ query: question });
  return {
    answer: response.toString(),
    sources: (response.sourceNodes ?? []).map((s) => ({ title: s.node.metadata.title, score: s.score })),
  };
}
```

A dozen lines give chunking, embedding, retrieval, and answer synthesis,
which is the appeal. The in-memory index is for prototypes: production
needs a persistent vector store, per-user filtering, and the citation
contract from the frontend lesson, and you should check where the
framework's default prompts come from before relying on them.

### The OpenAI Agents SDK

```ts
// src/ai/assistant.openai-agents.ts
import { Agent, run, tool } from "@openai/agents";
import { TaskDraft, requireEnv } from "./taskDraft.js";

const createTask = tool({
  name: "create_task",
  description: "Create a task in the user's current project",
  parameters: TaskDraft,
  execute: async (draft) => ({ id: await saveTask(draft), status: "created" }),
});

const assistant = new Agent({
  name: "TaskFlow Assistant",
  instructions: "Create tasks only when the user asks.",
  model: requireEnv("CHAT_MODEL"),
  tools: [createTask],
});

export async function ask(text: string) {
  const result = await run(assistant, text, { maxTurns: 5 });
  return result.finalOutput;
}

declare function saveTask(draft: TaskDraft): Promise<string>;
```

`maxTurns` plays the role of `stopWhen`. In server runtimes such as
Node.js the SDK traces runs by default (it is off in browsers and when
`NODE_ENV=test`); decide where those traces go before you send customer
data through it.

### Keep every option behind one interface

```ts
// src/ai/aiService.ts
import type { TaskDraft } from "./taskDraft.js";
import { parseTask as parseWithAiSdk } from "./assistant.aisdk.js";

// The only AI surface the rest of TaskFlow imports. Routes and jobs never
// touch an SDK or framework type directly.
export interface AiService {
  parseTask(text: string, today: string): Promise<TaskDraft | null>;
}

export const aiSdkService: AiService = {
  parseTask: (text, today) => parseWithAiSdk(text, today),
};

// Deterministic stand-in for unit tests and local development without keys.
export function fakeAiService(canned: Record<string, TaskDraft>): AiService {
  return { parseTask: async (text) => canned[text] ?? null };
}
```

Route tests use `fakeAiService`, so they run without network or keys,
and the eval suite runs the real adapters against the same interface. If
the AI SDK is replaced next year, only the adapter file changes.

## Best practices

- Start with the official SDK or the AI SDK; add an orchestration
  framework when a concrete need appears (durable state, approvals,
  complex retrieval), not in advance.
- Put every library behind your own small interface; keep prompts,
  schemas, conversation data, and evals in your codebase and database.
- Define schemas once in zod and reuse them for structured output, tool
  inputs, and API validation.
- Cap every agent loop (`stopWhen`, `maxTurns`) and authorize every tool
  call on the server.
- Log the exact request and response at the boundary you own, whatever
  the framework logs.
- Pin versions, read changelogs before major upgrades, and run your eval
  suite on the upgrade branch.
- Check `npm ls` for duplicated shared dependencies (database drivers,
  zod) when adding a framework package.
- Weigh maturity: release activity, 1.0 status, and the language a
  library is primarily developed in.

## In production

- **A minor framework upgrade changes answers.**
  *Detect:* eval scores drop or users report different behavior after a
  dependency bump with no prompt change. *Cause:* the framework changed
  a default prompt, parsing rule, or retry behavior. *Fix:* pin versions,
  diff the outgoing requests before and after, and gate upgrades on the
  eval suite (see
  [evals in CI and regression testing](../evaluation-and-monitoring/evals-in-ci-and-regression-testing.md)).
- **TypeScript rejects a client from the same library you already use.**
  *Detect:* errors such as "Type MongoClient is not assignable to type
  MongoClient", naming two `node_modules` paths. *Cause:* a framework
  package depends on another major version of a shared library, so npm
  installed two copies. *Fix:* run `npm ls <package>`, align versions,
  or keep the framework's connection separate until it supports yours.
- **Nobody can tell what was sent to the model.**
  *Detect:* debugging a bad answer requires reading framework source.
  *Cause:* prompts are assembled inside library classes and only final
  outputs are logged. *Fix:* log the provider request at your adapter
  boundary, or enable the framework's tracing and send it to your
  observability stack (see
  [LLM observability and tracing](../evaluation-and-monitoring/llm-observability-and-tracing.md)).
- **An agent spins in a tool-call loop and the bill spikes.**
  *Detect:* runs with dozens of steps and rising token usage per
  request. *Cause:* no step limit, or a tool whose errors the model keeps
  retrying. *Fix:* set `stopWhen` or `maxTurns`, return clear tool
  errors, and alert on steps per run.
- **A provider feature is missing from the abstraction.**
  *Detect:* a new parameter is documented by the provider but rejected
  or ignored by the unified API. *Cause:* abstraction layers lag provider
  releases. *Fix:* pass it through `providerOptions` where supported, or
  call the official SDK for that one feature behind the same interface.
- **A dependency stops receiving releases.**
  *Detect:* no publishes for months while its upstream APIs change; open
  issues pile up. *Cause:* the maintainers shifted focus (for example to
  another language or a successor project). *Fix:* track release
  activity as a risk, keep the library behind an adapter, and plan the
  migration before a breaking API change forces it.

## Important terminology

- **Official SDK:** A provider-maintained client library for its own API.
- **Unified model API:** A library that exposes one call shape across
  several providers.
- **Provider package (adapter):** The part of a unified library that
  translates its calls to one provider's API.
- **Orchestration framework:** A library for multi-step LLM workflows,
  with state, tools, memory, or retrieval.
- **Checkpointer:** A storage backend that saves workflow state after each
  step so runs can resume.
- **Durable execution:** Running a workflow so that it survives crashes
  and restarts without losing completed steps.
- **Human-in-the-loop interrupt:** A pause in a workflow until a person
  approves or edits something.
- **Agent loop:** Call the model, run requested tools, return results,
  and repeat until the model answers or a limit is reached.
- **Handoff:** One agent passing control of a conversation to another.
- **Lock-in:** The cost of leaving a library, mostly in data formats,
  prompts, and code shapes it owns.

## Common mistakes and misconceptions

- Adopting an agent framework for a feature that is one model call.
- Believing a unified API removes all provider differences; capabilities,
  limits, and behavior still differ by model.
- Letting a framework own the conversation store, so the data can only be
  read through that framework.
- Upgrading framework majors without running evals.
- Assuming 1.0 means stable forever: frameworks merge, get renamed, or
  get replaced by successors.
- Ignoring duplicated shared dependencies until they fail at runtime.
- Treating tracing defaults as harmless; they may send prompts and
  outputs to a third-party service.

## Revision questions

1. Name the five layers between your code and a model provider, with one
   example of each.
2. What does the AI SDK give a TypeScript team that the official SDKs do
   not, and what does it cost?
3. When is LangGraph worth its complexity? Give two TaskFlow features
   where it is and one where it is not.
4. Where does lock-in actually live, and how does an `AiService`
   interface reduce it?
5. The AI SDK released majors on 2025-07-31, 2025-12-22, and 2026-06-25.
   What is the average gap, and how many major upgrades per year should
   you plan for? (Answer: 144 and 185 days, about 165 days on average, so
   roughly two per year.)
6. Why did adding the LangGraph MongoDB checkpointer to a project on
   driver 7 cause a type error, and how do you fix it?
7. What maturity signals would you check before adopting a framework?
8. What must be true of every agent loop in production, whichever SDK
   runs it?

## Further learning

- [OpenAI: Libraries and SDKs](https://developers.openai.com/api/docs/libraries)
- [AI SDK documentation](https://ai-sdk.dev/docs/introduction)
- [LangChain (JavaScript)](https://docs.langchain.com/oss/javascript/langchain/overview)
  and [LangGraph (JavaScript)](https://docs.langchain.com/oss/javascript/langgraph/overview)
- [LlamaIndex (Python)](https://developers.llamaindex.ai/python/framework/)
  and [LlamaIndex.TS](https://developers.llamaindex.ai/typescript/framework/)
- [OpenAI Agents SDK (JavaScript)](https://openai.github.io/openai-agents-js/)
- [Mastra documentation](https://mastra.ai/docs)
- [Google Agent Development Kit](https://adk.dev/)
- [Claude Agent SDK](https://code.claude.com/docs/en/agent-sdk/overview)
- [Microsoft Agent Framework](https://learn.microsoft.com/en-us/agent-framework/overview/)
- [Anthropic: Building effective agents](https://www.anthropic.com/research/building-effective-agents)
- Next: [realtime voice applications](realtime-voice-applications.md). Back to the [building AI applications overview](../building-ai-applications.md).
