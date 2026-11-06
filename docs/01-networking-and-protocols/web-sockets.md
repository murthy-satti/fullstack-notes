# WebSockets

## Introduction

WebSocket enables two-way communication over a long-lived connection. After
the connection is established, either endpoint can send messages without
waiting for the other to make a new request. Standard URLs use `ws://`;
`wss://` uses TLS.

## Why does it exist?

Ordinary web requests are usually initiated by the client. A page that needs
frequent server updates could repeatedly poll, but that adds requests and
delays. WebSockets are useful for chat, collaboration, live dashboards, and
multiplayer features where both sides need timely updates.

## How does it work?

1. The browser connects to a server and negotiates a WebSocket connection.
   The classic WebSocket opening uses an HTTP/1.1 upgrade handshake.
2. If the server accepts, both sides switch to the WebSocket framing
   protocol.
3. The client and server send text or binary messages independently.
4. Either side can close the connection. The application must decide whether
   and how to reconnect.

![A browser begins with an HTTP handshake, upgrades to a WebSocket, then exchanges messages in both directions until the connection closes.](websocket-lifecycle.svg)

![Polling repeatedly asks for updates; an open WebSocket connection allows the server to push updates when ready.](websocket-vs-polling.svg)

WebSocket provides framing, not application meaning. The application still
needs a message format, authorization rules, validation, error handling, and
resource cleanup. With `wss://`, TLS protects the connection in transit.

### Choosing between live-update approaches

| Approach | How updates arrive | Often a good fit |
|---|---|---|
| Repeated polling | Browser asks again at intervals | Infrequent updates or simple prototypes |
| Server-Sent Events | Server streams one-way text events to browser | Live feeds where the browser mainly receives updates |
| WebSocket | Both sides send over one long-lived connection | Chat, collaboration, and interactive sessions |

WebSockets also have control frames, including Ping, Pong, and Close. They
help manage the connection, but applications still need a clear policy for
stale clients. A heartbeat can detect a connection that appears open but is
no longer responsive.

Reconnection should use a bounded delay that grows between attempts, often
with random variation (jitter), rather than retrying continuously. After a
reconnect, the app may need to authenticate again and request missed updates;
the WebSocket protocol itself does not provide durable message history.

## Real-world example

A signed-in chat page opens a `wss://` connection. When a new message arrives,
the server can push it to the browser without waiting for the browser to poll
again. The app still needs to decide who may join each conversation.

## Developer perspective

Use WebSockets for ongoing two-way communication. For one-way server updates,
polling or Server-Sent Events may be simpler. Account for reconnects,
timeouts, load balancing, and authentication. Validate every message and
check the browser `Origin` where appropriate; a secure transport does not
replace authorization.

## Practical example

For an application you control, open browser developer tools and inspect the
Network panel when its live feature connects. Look for the handshake,
connection status, frames, and close reason. This observes traffic without
sending test messages to a third-party service.

## Important terminology

- **Handshake:** negotiation that opens a WebSocket connection.
- **Frame:** protocol unit carrying data or control information.
- **Full-duplex:** both endpoints can send independently.
- **Heartbeat:** periodic application or protocol check that helps notice a
  stale connection.
- **Close frame:** signal used to end a WebSocket connection.
- **Server-Sent Events (SSE):** a browser API for receiving a stream of
  server-to-client events over HTTP.
- **Jitter:** a small random variation in retry delays to prevent many
  clients reconnecting at exactly the same time.

## Advantages and disadvantages

WebSockets enable server push and two-way messages without repeated HTTP
requests. Persistent connections consume resources and require careful
handling during restarts, reconnections, and horizontal scaling.

## Common misconceptions

- WebSocket starts with an HTTP-based handshake, then uses WebSocket frames.
- `wss://` protects transport but does not validate application permissions.
- A persistent connection can still be interrupted by networks or servers.

## Revision questions

1. How does WebSocket differ from a typical request-response exchange?
2. What does `wss://` indicate?
3. Which application responsibilities remain after a connection is secure?
4. When might Server-Sent Events be simpler?
5. Why should a reconnect strategy avoid retrying in a tight loop?

## Further Learning & References

- **Official documentation — MDN:** [The WebSocket API](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API) explains browser-side connections and message events.
- **Official standard — RFC Editor:** [RFC 6455, The WebSocket Protocol](https://www.rfc-editor.org/rfc/rfc6455) specifies the opening handshake and framing.
