# ICMP and Network Diagnostics

## Introduction

Internet Control Message Protocol (ICMP) carries control and diagnostic
messages associated with IP. ICMP is not a transport protocol like TCP or
UDP, and it does not carry ordinary application requests such as HTTP.
IPv6 has ICMPv6, which also supports important local-network functions.

## Why does it exist?

IP routers and hosts need a way to report certain delivery problems and
provide diagnostic signals. ICMP can report that a destination is
unreachable, that a packet's time-to-live expired, or that a packet is too
large for a path.

## How does it work?

ICMP messages are carried inside IP packets. Common uses include:

| Use | Example | What it can tell you |
|---|---|---|
| Echo request/reply | `ping` | Whether an endpoint responds to this diagnostic exchange |
| Time exceeded | `traceroute`/`tracert` | A hop's packet lifetime expired; a router may send a response |
| Destination unreachable | Network or host unreachable message | A device reports it cannot deliver the packet for a stated reason |
| Packet Too Big (ICMPv6) | Path MTU discovery | A sender should reduce packet size for the path |

Routers decrease an IP packet's Time to Live (IPv4 TTL) or Hop Limit (IPv6)
as it is forwarded. Diagnostic tools can send packets with increasing
limits. When a limit reaches zero, a router may return a time-exceeded
message, helping the tool infer part of the path. Some routers or firewalls
do not return these messages, so a missing hop is not proof that traffic
stopped there.

ICMPv6 is more than a ping mechanism: IPv6 Neighbor Discovery relies on it.
Blocking all ICMPv6 can therefore break normal IPv6 behavior, including
neighbor discovery or path-MTU handling.

## Real-world example

A developer may use `ping` to see whether a server responds to ICMP echo,
then use an HTTPS request to test the actual web service. A government
portal may block echo requests while continuing to serve pages normally.
Likewise, a successful ping to a bank host does not show that login or
payment APIs work.

## Developer perspective

Use diagnostics to answer a specific question. `ping` tests ICMP echo
behavior, not DNS, TLS, or HTTP. `tracert` and `traceroute` attempt to show
responding hops, not necessarily every router or the exact forward and
return paths. A complete application check should test the application
protocol as well.

## Practical example

On Windows:

```powershell
ping example.com
tracert example.com
```

On Linux, use `ping example.com` and `traceroute example.com` or
`tracepath example.com` if installed. Run diagnostics only for systems you
are permitted to test. Firewalls and network policies can limit the output.

## Important terminology

- **ICMP:** control and diagnostic messaging for IPv4.
- **ICMPv6:** control messaging for IPv6, including messages used by NDP.
- **Echo request/reply:** messages used by the common ping diagnostic.
- **TTL/Hop Limit:** IP field limiting how many router hops a packet can
  traverse.
- **Path MTU:** largest packet size that can travel across a path without
  fragmentation at a constrained link.

## Advantages and disadvantages

ICMP provides useful feedback for network operation and troubleshooting. Its
messages may be filtered, rate-limited, or deprioritized, so diagnostics can
be incomplete and should not be treated as definitive service health checks.

## Common misconceptions

- A failed ping does not prove a website is down.
- A successful ping does not prove that the web server or application works.
- `traceroute` does not guarantee that every hop will reply.
- ICMP is not the same as TCP or UDP and does not carry HTTP requests.

## Further learning

- [RFC 792: Internet Control Message Protocol](https://www.rfc-editor.org/rfc/rfc792)
- [RFC 4443: Internet Control Message Protocol (ICMPv6)](https://www.rfc-editor.org/rfc/rfc4443)
- [RFC 8201: Path MTU Discovery for IP version 6](https://www.rfc-editor.org/rfc/rfc8201)
