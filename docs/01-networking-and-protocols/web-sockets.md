# WebSockets

## Introduction

WebSocket enables two-way communication over a long-lived connection. Unlike
typical [HTTP](http-and-https.md), either endpoint can send messages at any
time after connection.

## Why does it exist?

WebSockets support timely updates for live dashboards, collaboration, chat,
and multiplayer games without repeated client polling.

## How does it work?

A connection begins with an HTTP handshake, then switches to WebSocket
framing. It carries text or binary messages in both directions. Browsers use
`ws://` or TLS-protected `wss://`. Applications should handle disconnections
and reconnect when appropriate.

WebSocket supplies framing, not application design. Applications still need
message formats, authorization, validation, and resource cleanup.

## Real-world example

A chat page opens `wss://` after sign-in. The server can push new messages to
the browser without waiting for another page request.

## Developer perspective

Use WebSockets for continuous two-way updates; for one-way updates, polling or
server-sent events may fit better. Authenticate connections and validate
messages, even over TLS.

## Practical example

To diagnose a WebSocket connection you control, open browser developer tools
and inspect the Network panel's handshake and connection status. This is a
read-only observation; do not send private data to public test services.

## Important terminology

- **Handshake:** HTTP-based negotiation that opens a WebSocket connection.
- **Frame:** protocol unit used to carry message data or control information.
- **Full-duplex:** both endpoints can send independently.
- **Heartbeat:** application-level check used to notice stale connections.

## Advantages and disadvantages

WebSockets enable two-way updates without repeated requests. Persistent
connections use server resources and can be harder to scale and monitor.

## Common misconceptions

- WebSocket switches protocols after the handshake; `wss://` protects
  transport, not application logic, and connections can still be interrupted.

## Revision questions

1. How does WebSocket differ from a typical HTTP exchange?
2. What does the `wss://` scheme indicate?
3. What application responsibilities remain after a connection is secure?

## Further Learning & References

- **Official standard — RFC Editor:** [RFC 6455, The WebSocket
  Protocol](https://www.rfc-editor.org/rfc/rfc6455) defines the handshake and
  framing.
- **Third-party explanation — MDN:** [The WebSocket
  API](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API)
  documents browser-side use and related interfaces.
