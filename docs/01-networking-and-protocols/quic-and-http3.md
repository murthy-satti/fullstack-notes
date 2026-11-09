# QUIC and HTTP/3

## Introduction

QUIC is a secure transport protocol that runs over UDP. HTTP/3 is HTTP
mapped onto QUIC. Together they provide a modern option for web connections,
alongside HTTP/1.1 and HTTP/2 deployments that commonly use TCP.

## Why do they exist?

With TCP, loss affecting one connection can delay delivery of later bytes
in that same ordered stream. HTTP/2 multiplexes requests over a TCP
connection, but TCP still delivers one ordered byte stream. QUIC supports
independent streams, so loss affecting one stream need not block delivery
on every other stream. QUIC also integrates its security handshake and can
resume connections efficiently.

## How does it work?

1. A client and server exchange QUIC packets over UDP. Web servers commonly
   accept HTTP/3 on UDP port 443.
2. QUIC performs a TLS 1.3-based handshake and derives keys to protect
   transport and application data. QUIC does not use a separate TLS record
   layer in the same way as HTTPS over TCP.
3. HTTP/3 sends request and response data over QUIC streams.
4. QUIC detects loss, retransmits needed data, and applies congestion
   control. It provides reliable streams while retaining UDP as its
   underlying datagram transport.
5. A connection can use connection identifiers to survive some client
   address changes, such as moving between Wi-Fi and cellular, when the
   network and peer permit it.

| Stack | Typical transport | Security | Multiplexing behavior |
|---|---|---|---|
| HTTP/1.1 | TCP | TLS for HTTPS | Multiple requests can reuse a connection, but request scheduling differs |
| HTTP/2 | TCP | TLS in typical browser use | Multiple HTTP streams share one TCP byte stream |
| HTTP/3 | QUIC over UDP | TLS 1.3 integrated into QUIC | Independent QUIC streams reduce transport-level blocking between streams |

QUIC still needs congestion control and can still experience loss, latency,
or server overload. Clients can learn about HTTP/3 through mechanisms such
as an HTTP `Alt-Svc` response header or DNS HTTPS records. Support and
deployment vary, and services commonly retain TCP-based HTTP versions for
compatibility. If UDP is blocked or QUIC setup fails, clients can try a
TCP-based HTTP version.

## Real-world example

A video site or government portal may deliver HTTP/3 to a compatible
browser. If a network blocks or degrades UDP, the browser can try a TCP-based
HTTP version. The site still uses familiar HTTP methods and semantics; the
transport below HTTP differs.

## Developer perspective

Application developers normally use browser, server, proxy, and CDN
implementations rather than implementing QUIC directly. It is useful to
understand HTTP/3 when diagnosing why a service behaves differently over
UDP versus TCP, interpreting browser DevTools, or configuring network
firewalls and load balancers.

## Practical example

In browser DevTools, inspect a request's protocol column when available to
see whether it used `h2` or `h3`. A protocol label may be absent or hidden
depending on the browser and tooling. Compare requests to services you
control; do not assume every server enables HTTP/3.

## Important terminology

- **QUIC:** secure, multiplexed transport protocol over UDP.
- **HTTP/3:** HTTP semantics and messaging over QUIC.
- **Stream:** independent ordered sequence of data within a QUIC connection.
- **Head-of-line blocking:** delay where missing data prevents later data
  from being delivered; QUIC limits cross-stream transport blocking.
- **Connection migration:** ability to continue a QUIC connection after
  certain network address changes.
- **Congestion control:** behavior that adjusts sending rate to network
  conditions.

## Advantages and disadvantages

QUIC can reduce connection setup delay and avoid TCP-level blocking across
independent streams. It introduces a newer transport stack and may be
handled differently by middleboxes or networks that restrict UDP. It does
not remove the effects of congestion or poor connectivity.

## Common misconceptions

- QUIC uses UDP, but it is not simply unreliable application data; QUIC
  implements reliability and congestion control.
- HTTP/3 is not a replacement for HTTP semantics; it changes how HTTP is
  transported.
- HTTP/3 still uses TLS-based security.
- UDP is not automatically faster in every network or workload.

## Further learning

- [RFC 9000: QUIC Transport](https://www.rfc-editor.org/rfc/rfc9000)
- [RFC 9001: Using TLS to Secure QUIC](https://www.rfc-editor.org/rfc/rfc9001)
- [RFC 9114: HTTP/3](https://www.rfc-editor.org/rfc/rfc9114)
- [RFC 9460: SVCB and HTTPS DNS records](https://www.rfc-editor.org/rfc/rfc9460)
- [MDN: HTTP/3](https://developer.mozilla.org/en-US/docs/Glossary/HTTP_3)
