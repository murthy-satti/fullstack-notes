# WebSockets

## Introduction

WebSocket is a protocol for two-way communication between a client and server
over one long-lived connection. Unlike the usual request-then-response pattern
of [HTTP](http-and-https.md), either side can send a message whenever it has
one, once the connection is established.

## Why does it exist?

Some applications need timely updates without repeatedly asking the server
whether anything changed. WebSockets support interactive features such as
live dashboards, collaborative tools, chat, and multiplayer game updates.

## How does it work?

A WebSocket connection typically begins with an HTTP opening handshake. If
the server agrees, the protocol switches from HTTP to WebSocket framing. The
connection can then carry text or binary messages in both directions. The
browser API commonly uses `ws://` for an unencrypted connection and `wss://`
for a TLS-protected one. A connection remains open until one side closes it
or the network fails; applications should handle disconnections and reconnect
when appropriate.

WebSocket provides message framing, not a complete application design. The
application must decide message formats, authorization, validation, limits,
and what to do when messages fail. The server must also manage many open
connections and clean up resources.

## Real-world example

A chat page opens a `wss://` connection after the user signs in. When another
person sends a message, the server can push the new message to the connected
browser without waiting for another page request.

## Developer perspective

Use WebSockets when continuous two-way updates are valuable. For simpler
one-way updates, ordinary HTTP polling or server-sent events may be a better
fit. Authenticate the connection, authorize each action, validate message
contents, and do not trust data merely because it arrived over TLS.

## Practical example

In a browser developer console on a page you control, this read-only snippet
can connect to a public echo service and send a harmless test string:
`const ws = new WebSocket("wss://echo.websocket.events"); ws.onopen = () => ws.send("hello"); ws.onmessage = e => console.log(e.data);`
The connection is temporary; close it with `ws.close()`. Do not send secrets
to a public echo service.

## Important terminology

- **Handshake:** HTTP-based negotiation that opens a WebSocket connection.
- **Frame:** protocol unit used to carry message data or control information.
- **Full-duplex:** both endpoints can send independently.
- **Heartbeat:** application-level check used to notice stale connections.

## Advantages and disadvantages

WebSockets enable low-latency, two-way updates without repeated HTTP request
setup. Persistent connections consume server resources and can be harder to
scale, monitor, and secure than short-lived requests.

## Common misconceptions

- WebSocket is not simply HTTP with a special message body; it changes
  protocols after the opening handshake.
- A secure `wss://` connection protects transport, not application logic.
- A browser connection can still be interrupted by proxies, sleep, or network
  changes.

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
