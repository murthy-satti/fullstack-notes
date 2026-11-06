# gRPC

## Introduction

gRPC is a remote procedure call (RPC) framework for communication between
services. It commonly uses HTTP/2 for transport and Protocol Buffers
(Protobuf) to define service methods and structured messages. It is often
used for service-to-service communication rather than direct human browsing.

## Why does it exist?

Distributed services need an explicit contract for calling operations and
exchanging structured data. gRPC can generate client and server code from a
service definition, support multiple programming languages, and stream
messages in either direction.

## How does it work?

1. Developers define messages and service methods in a `.proto` schema.
2. Code generators create typed client and server interfaces for supported
   languages.
3. A client calls a generated method; the gRPC library encodes the request,
   commonly as Protobuf.
4. The request travels over HTTP/2, typically protected by TLS outside a
   trusted local development environment.
5. The server invokes the matching handler and returns a response, status,
   and optional metadata.

gRPC supports unary calls, server streaming, client streaming, and
bidirectional streaming. These describe message-flow patterns; applications
still need timeouts, retries appropriate to the operation, authorization,
and error handling.

| Call type | Message flow | Example |
|---|---|---|
| Unary | One request, one response | Look up a product |
| Server streaming | One request, many responses | Stream status updates |
| Client streaming | Many requests, one response | Send a sequence of measurements |
| Bidirectional streaming | Both sides send multiple messages | Interactive service session |

Browser use has additional constraints: browser JavaScript generally uses
gRPC-Web or a compatible gateway rather than native gRPC directly, depending
on the server and deployment.

## Real-world example

A government portal may expose HTTPS APIs to a browser while its internal
services use gRPC between an identity service and a case-management service.
A bank can use the same pattern inside a controlled service environment.
Those are architectural choices, not a special financial or government
network protocol.

## Developer perspective

gRPC can be a good fit for typed internal APIs and streaming communication
between services. Consider client-language support, browser compatibility,
observability, schema evolution, and operational tooling. For public browser
APIs, ordinary HTTP with JSON may be easier to inspect and integrate.

## Practical example

Read a service's `.proto` definition and identify its messages, method
signatures, and streaming type. In a project you control, use its generated
client rather than hand-constructing binary Protobuf data.

## Important terminology

- **RPC:** a programming model that invokes an operation on a remote service.
- **Protocol Buffers:** schema-based binary serialization format commonly
  used with gRPC.
- **Service definition:** schema describing gRPC methods and message types.
- **Metadata:** request or response information carried outside the main
  message body.
- **Streaming RPC:** RPC where one or both sides send multiple messages.

## Advantages and disadvantages

gRPC offers generated interfaces, compact structured messages, and streaming
patterns. It can be less convenient to inspect manually than JSON APIs and
requires compatible tooling, HTTP/2 support, schema management, and browser
adaptation in some deployments.

## Common misconceptions

- gRPC is not itself a replacement for IP, TCP, or TLS; it uses lower layers
  such as HTTP/2 and a transport.
- Protobuf is a data serialization format, not a network transport.
- Retries can duplicate a non-idempotent operation unless the API handles
  that case.
- gRPC is not automatically more secure than a REST-style HTTP API; security
  still depends on transport configuration and application authorization.

## Further learning

- [gRPC: Core concepts](https://grpc.io/docs/what-is-grpc/core-concepts/)
- [gRPC: Introduction to Protocol Buffers](https://protobuf.dev/overview/)
- [RFC 9113: HTTP/2](https://www.rfc-editor.org/rfc/rfc9113)
