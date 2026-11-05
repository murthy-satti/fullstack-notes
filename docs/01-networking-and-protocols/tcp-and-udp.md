# TCP and UDP

## Introduction

TCP (Transmission Control Protocol) and UDP (User Datagram Protocol) are
transport protocols carried over IP. They let programs communicate using
port numbers, with different delivery models for different needs.

## Why does it exist?

IP moves packets between addresses but does not promise complete, ordered
delivery. TCP adds a reliable byte stream; UDP offers datagrams and leaves
more decisions to the application.

## How does it work?

TCP establishes a connection and uses sequence numbers, acknowledgements,
retransmission, and flow and congestion control for an ordered byte stream.
It does not preserve the boundaries of individual writes.

UDP sends datagrams without a TCP-style connection; it does not retransmit
missing data or ensure ordering. Applications can add those mechanisms.
DNS commonly uses UDP for small queries, but can also use TCP.

## Real-world example

A file download benefits from TCP's ordered recovery. Live voice or game
updates may prefer timely UDP datagrams, where an old late update is less
useful than the next one.

## Developer perspective

Choose based on application requirements, not claims that one is universally
faster. TCP simplifies reliability but recovery can add delay. UDP shifts
reliability and congestion handling to the application. Their port spaces are
distinct.

## Practical example

On Linux, `ss -t -a` and `ss -u -a` inspect TCP and UDP sockets. An empty
local result does not prove a service cannot be reached through a proxy,
container, or another machine.

## Important terminology

- **Connection:** TCP communication state between endpoints.
- **Byte stream:** ordered bytes without message boundaries.
- **Datagram:** one discrete UDP message.
- **Acknowledgement:** a signal that data was received.

## Advantages and disadvantages

TCP provides ordered reliability but maintains state and may retransmit.
UDP has low overhead but does not guarantee delivery.

## Common misconceptions

- UDP is not inherently insecure or always faster; security depends on the
  application, and TCP delivers a stream rather than preserved messages.

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
- **Third-party explanation — Wikipedia:** [Transmission Control
  Protocol](https://en.wikipedia.org/wiki/Transmission_Control_Protocol) and
  [User Datagram Protocol](https://en.wikipedia.org/wiki/User_Datagram_Protocol)
  provide complementary overviews of each transport.
