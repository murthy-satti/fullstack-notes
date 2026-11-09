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

## Full stack developer guide

Use the [Full Stack Developer Practical Guide](full-stack-practical-guide.md) for topic priorities, a request walkthrough, troubleshooting practice, protocol comparisons, and a glossary.

## Learning objectives

- Understand the Internet's basic building blocks and addressing.
- Follow the journey of a request through DNS, transport, and web protocols.
- Explain how a device joins a local network and finds its next-hop router.
- Recognize the roles of encryption, persistent connections, and ports.
- Choose troubleshooting tools based on which network layer may have failed.

## Topics

- [Internet Fundamentals](internet-fundamentals.md)
- [IP Addressing](ip-addressing.md)
- [Ethernet and Wi-Fi](ethernet-and-wifi.md)
- [ARP and IPv6 Neighbor Discovery](arp-and-neighbor-discovery.md)
- [DHCP](dhcp.md)
- [ICMP and Network Diagnostics](icmp.md)
- [TCP and UDP](tcp-and-udp.md)
- [DNS](dns.md)
- [HTTP and HTTPS](http-and-https.md)
- [TLS and SSL](tls-and-ssl.md)
- [QUIC and HTTP/3](quic-and-http3.md)
- [WebSockets](web-sockets.md)
- [Email Protocols](email-protocols.md)
- [SSH and SFTP](ssh-and-sftp.md)
- [VPNs and Tunneling](vpn-and-tunneling.md)
- [NTP and Network Time Synchronization](ntp-and-time-synchronization.md)
- [MQTT](mqtt.md)
- [gRPC](grpc.md)
- [Network Ports](network-ports.md)

## How protocols appear in real services

Most public websites use the same Internet building blocks. The business may
have additional identity checks, security controls, or private connections,
but a familiar website URL does not imply a special transport protocol.

| Service example | Common network path | Why these protocols fit |
|---|---|---|
| Shopping, news, or video website | DNS, Wi-Fi or Ethernet, IP, TCP or QUIC, TLS, HTTP; often a CDN | HTTP delivers pages and APIs; TLS protects data in transit; a CDN can serve content closer to users |
| Online banking website or app | Usually the same DNS, IP, TLS, and HTTPS foundation; may also use MFA and risk checks | Standard web protocols interoperate with browsers; authentication, authorization, fraud controls, and payment processing are additional application/system responsibilities |
| Crypto exchange or wallet interface | HTTPS for pages and API calls; WebSockets may stream prices; a blockchain network uses its own peer and transaction rules | A web interface and a blockchain are different protocol layers; using HTTPS does not mean a blockchain transaction is sent as an ordinary web page |
| Government service portal | Usually DNS, IP, TLS, and HTTPS; some internal services may use private networks or additional identity systems | Common web standards support public access; identity proofing, accessibility, audit, and policy requirements sit above the basic transport |
| Email service | DNS records to locate mail servers; SMTP to send mail; IMAP or POP3 for mailbox access; TLS commonly protects connections | Email needs separate protocols for delivery between mail servers and access by a user's mail client |
| Remote server administration | IP routing followed by SSH, commonly over TCP port 22 | SSH provides an authenticated encrypted terminal and related secure functions; access should be restricted to authorized administrators |

These are typical patterns, not guarantees about any particular provider.
Financial, cryptocurrency, and government systems may also use private
networks, specialized payment or identity systems, or organization-specific
controls that are not visible from the public website. Never infer that a
service is secure or trustworthy solely because it uses HTTPS.

## Suggested learning path

1. Begin with [Internet Fundamentals](internet-fundamentals.md), then learn
   [IP addressing](ip-addressing.md).
2. See how a device joins a network with [Ethernet and Wi-Fi](ethernet-and-wifi.md),
   gets configuration through [DHCP](dhcp.md), and finds a local next hop with
   [ARP and IPv6 Neighbor Discovery](arp-and-neighbor-discovery.md).
3. Compare [TCP and UDP](tcp-and-udp.md), then learn how
   [ports](network-ports.md) direct data to applications.
4. Follow name resolution in [DNS](dns.md), then study
   [TLS and SSL](tls-and-ssl.md) and [HTTP and HTTPS](http-and-https.md).
   Continue with [QUIC and HTTP/3](quic-and-http3.md) to understand the modern
   UDP-based web transport.
5. Explore other application protocols: [WebSockets](web-sockets.md) for
   interactive communication, [Email Protocols](email-protocols.md) for mail,
   [SSH and SFTP](ssh-and-sftp.md) for remote access, [MQTT](mqtt.md) for
   device messaging, and [gRPC](grpc.md) for service-to-service APIs.
6. Learn how [VPNs and Tunneling](vpn-and-tunneling.md) connect private
   networks and why [NTP](ntp-and-time-synchronization.md) matters to
   distributed systems.
7. Use [ICMP and Network Diagnostics](icmp.md) to understand common
   troubleshooting signals.

When diagnosing a problem, ask which step failed rather than treating
"the Internet is down" as one explanation. A name lookup issue, blocked
connection, invalid certificate, and application error have different causes
and different tools. A [ping](icmp.md) response, for example, is not required
for an HTTPS service to work.
