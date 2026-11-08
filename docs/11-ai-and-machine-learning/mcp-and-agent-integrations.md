# Model Context Protocol and Agent Integrations

## Introduction

**Model Context Protocol (MCP)** is an open protocol for connecting AI
applications to external tools and context sources through a common
client-server model. An MCP server can expose capabilities such as tools,
resources, or prompts. MCP standardizes parts of the connection; it does
not make a server trustworthy or decide whether a user may perform an
action.

![An AI host contains an MCP client that connects to a server exposing tools and resources; the host remains responsible for consent and authorization.](mcp-client-server-flow.svg)

![A tool request crosses the host's policy boundary before MCP invocation; a returned result is treated as untrusted context.](mcp-tool-authorization-flow.svg)

## Main concepts

- **Host:** the AI application that manages the user's session and model
  interaction.
- **Client:** the protocol component in the host that connects to a
  particular server.
- **Server:** a process or service that advertises capabilities.
- **Tools:** operations the model may request through the host.
- **Resources:** data the host may retrieve through the protocol.
- **Prompts:** reusable prompt templates or workflows provided by a
  server.

The exact protocol version, transports, and capability details evolve.
Consult the current MCP specification when implementing a client or server.

## Tool use through a host

1. The host connects to a configured server and discovers supported
   capabilities.
2. The application decides which capabilities are appropriate for the
   current user and task.
3. The model may propose a tool call with structured arguments.
4. The host validates the request, checks authorization, and obtains any
   required user confirmation.
5. The host invokes the tool and returns a bounded result to the model.
6. The application validates and presents the final answer or action.

## MCP and custom tool calling

| Choice | Advantages | Considerations |
|---|---|---|
| Provider-specific function calling | Direct integration with one model API | Tied to that provider's tool format |
| Application-defined tools | Full control over exposed operations | Each integration needs custom schemas and maintenance |
| MCP | Common protocol for capability discovery and integrations | Requires client/server lifecycle, version, security, and compatibility management |

MCP can improve interoperability; it does not replace application
authorization, business rules, audit logging, or user confirmation.

## Security checklist

- Trust only reviewed, explicitly configured servers.
- Authenticate remote connections and protect transport credentials.
- Use least privilege for each server and tool.
- Validate all arguments and outputs against schemas and business rules.
- Treat resource contents and tool results as untrusted input.
- Require confirmation for destructive, financial, or external actions.
- Record useful audit events without retaining unnecessary sensitive data.
- Set network, time, size, and call-count limits.
- Review dependencies and update protocol implementations.

## Agent design

An agent is a model-directed control loop that can select tools, inspect
results, and continue. Keep the loop bounded by allowed tools, step count,
time, token budget, and user permissions. Prefer a deterministic workflow
when the task has a known sequence. Make state, retries, and side effects
explicit and idempotent.

## Further learning

- [Model Context Protocol documentation](https://modelcontextprotocol.io/)
- [Model Context Protocol specification](https://modelcontextprotocol.io/specification/)
- [OWASP Top 10 for LLM Applications](https://genai.owasp.org/llm-top-10/)
