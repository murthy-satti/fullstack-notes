# TCP and UDP

## Introduction

TCP (Transmission Control Protocol) and UDP (User Datagram Protocol) are
transport protocols carried over IP. They let programs communicate between
network endpoints and are identified in part by port numbers. Their different
delivery models suit different application needs.

## Why does it exist?

IP moves packets between addresses but does not manage a conversation between
applications or promise complete, ordered delivery. TCP adds a reliable
byte-stream service. UDP offers a lighter datagram service, leaving more
decisions to the application.

## How does it work?

TCP establishes a connection before application data is exchanged. It uses
sequence numbers, acknowledgements, retransmission, and flow and congestion
control to provide an ordered stream of bytes. The application reads that
stream; TCP does not preserve the boundaries of individual writes.

UDP sends independent datagrams without setting up a TCP-style connection.
It does not itself retransmit missing data or ensure ordering. A UDP
application can add such mechanisms when needed. DNS commonly uses UDP for
small queries, while other cases can use TCP; modern protocols may also build
reliable behavior over UDP.

## Real-world example

A file download typically benefits from TCP because missing bytes can be
resent and data is delivered in order. A live voice or game update may prefer
timely UDP datagrams: an old update that arrives late can be less useful than
the next one.

## Developer perspective

Choose a transport based on the application's requirements, not on a claim
that one is universally faster. TCP's recovery and ordering simplify many
applications but can add delay when data is lost. UDP avoids that built-in
recovery but shifts reliability, congestion safety, and security concerns to
the protocol using it. TCP and UDP ports are distinct namespaces.

## Practical example

On Linux, `ss -t -a` lists TCP sockets and `ss -u -a` lists UDP sockets.
These are read-only inspections of local socket state. An empty result for a
service does not prove it cannot be reached through a proxy, container, or
different machine.

## Important terminology

- **Connection:** TCP's established communication state between endpoints.
- **Byte stream:** ordered bytes with no built-in message boundaries.
- **Datagram:** one discrete UDP message.
- **Acknowledgement:** a signal that data was received.

## Advantages and disadvantages

TCP provides ordered reliability but maintains more state and may retransmit
data. UDP has low protocol overhead and supports application-specific timing,
but delivery is not guaranteed by UDP itself.

## Common misconceptions

- UDP is not inherently insecure; security depends on the application and
  protections used.
- UDP is not always faster in practice.
- TCP delivers a stream, not one preserved message per write operation.

## Revision questions

1. Which transport provides ordered reliable delivery by default?
2. What does UDP leave to the application?
3. Why can a late voice packet be less useful than a lost one?

## Further Learning & References

- **Official standard — RFC Editor:** [RFC 9293, Transmission Control
  Protocol](https://www.rfc-editor.org/rfc/rfc9293) defines TCP.
- **Official standard — RFC Editor:** [RFC 768, User Datagram
  Protocol](https://www.rfc-editor.org/rfc/rfc768) defines UDP's datagram
  format and checksum behavior.
- **Third-party explanation — Cloudflare Learning Center:** [What is the
  difference between TCP and UDP?](https://www.cloudflare.com/learning/ddos/glossary/tcp-ip/)
  offers a high-level explanation of network protocol roles.
