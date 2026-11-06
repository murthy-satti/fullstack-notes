# Networking and Protocols

This section explains how computers communicate and how information travels
between a client and a server across the Internet.

Think of a web request as several cooperating layers: a name is resolved to an
address, the network carries packets, a transport protocol manages delivery,
and an application protocol describes the request and response.

![A web request moves from a name lookup through network and transport layers to an application response.](network-journey.svg)

## One request, several layers

Imagine entering `https://example.com/products` in a browser. The browser
needs the server's address, a route to reach it, a transport for delivery,
protection for the connection, and an application protocol to request the
page. These jobs are related, but one layer's success does not prove that the
next layer is healthy.

![Application data is wrapped by transport, IP, and local network information as it is prepared for delivery.](network-encapsulation.svg)

| What you observe | What it tells you | What it does not prove |
|---|---|---|
| DNS returned an address | The name was resolved by that resolver | That the destination is reachable |
| A TCP connection opened | A TCP endpoint accepted that connection | That the HTTP request will succeed |
| HTTPS certificate is valid | The peer passed certificate checks for the host | That the site or its content is trustworthy |
| HTTP returned `200` | The response was successful by HTTP semantics | That a business operation did what you intended |

## Learning objectives

- Understand the Internet's basic building blocks and addressing.
- Follow the journey of a request through DNS, transport, and web protocols.
- Recognize the roles of encryption, persistent connections, and ports.

## Topics

- [Internet Fundamentals](internet-fundamentals.md)
- [IP Addressing](ip-addressing.md)
- [TCP and UDP](tcp-and-udp.md)
- [DNS](dns.md)
- [HTTP and HTTPS](http-and-https.md)
- [TLS and SSL](tls-and-ssl.md)
- [WebSockets](web-sockets.md)
- [Network Ports](network-ports.md)

Follow the topics in order for a first pass, then revisit the links between
lessons. For example, [HTTP and HTTPS](http-and-https.md) build on
[DNS](dns.md), [IP addressing](ip-addressing.md), [TCP and UDP](tcp-and-udp.md),
[TLS and SSL](tls-and-ssl.md), and [network ports](network-ports.md).

## Suggested learning path

1. Begin with [Internet Fundamentals](internet-fundamentals.md) to understand
   the network of networks and the layers involved.
2. Learn how [IP addressing](ip-addressing.md) and routers move packets.
3. Compare [TCP and UDP](tcp-and-udp.md), then see how
   [ports](network-ports.md) direct data to applications.
4. Follow a name lookup in [DNS](dns.md), then read
   [HTTP and HTTPS](http-and-https.md) and [TLS and SSL](tls-and-ssl.md).
5. Finish with [WebSockets](web-sockets.md), a useful alternative for ongoing
   two-way communication.

When diagnosing a problem, ask which step failed rather than treating
"the Internet is down" as one explanation. A name lookup issue, blocked
connection, invalid certificate, and application error have different causes
and different tools.
