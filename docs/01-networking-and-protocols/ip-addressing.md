# IP Addressing

## Introduction

An Internet Protocol (IP) address is a numeric address used to deliver packets
to a network interface. IPv4 addresses are 32 bits, commonly written as four
decimal numbers such as `192.0.2.25`. IPv6 addresses are 128 bits and are
usually written as colon-separated hexadecimal groups, for example
`2001:db8::25`.

## Why does it exist?

Routers need destination information to forward packets. IP addresses provide
that information and allow networks to be divided into smaller ranges. They
are not names for websites; the [DNS](dns.md) system can map a human-readable
name to one or more IP addresses.

## How does it work?

An IP packet includes source and destination addresses. Routers examine the
destination and choose a next hop based on routing tables. A prefix such as
`192.0.2.0/24` describes a range: the `/24` marks how many leading bits form
the network prefix. IP is connectionless and does not promise that a packet
will arrive, arrive once, or arrive in order; transport protocols may provide
additional behavior.

Private-use ranges are intended for internal networks and are not globally
routed in the same way as public addresses. Network address translation
(NAT) commonly lets multiple private devices share a public IPv4 address.
IPv6's much larger address space reduces the need for that particular
workaround, though networks may still use translation.

## Real-world example

Your laptop might receive a private IPv4 address from a home router. When it
visits a public site, the router forwards packets and may translate their
source address. The site sees a public address associated with the connection,
not necessarily the laptop's private address.

## Developer perspective

Applications should not assume an address is permanent or uniquely identifies
a user. Servers may have several addresses, addresses may change, and proxies
or NAT can place many users behind one public address. Use DNS names for
service discovery when appropriate; use IP addresses for network-level
diagnosis.

## Practical example

On Linux, `ip address` lists local interface addresses and `ip route` displays
the routing table. These commands inspect configuration without changing it.
An address beginning with `127.` is IPv4 loopback; `::1` is IPv6 loopback.

## Important terminology

- **Interface:** a network attachment such as Wi-Fi or Ethernet.
- **Prefix/subnet:** a set of addresses grouped by shared leading bits.
- **Loopback:** an address used by a device to communicate with itself.
- **NAT:** translation of network addresses, often at a router.

## Advantages and disadvantages

IP is scalable and independent of application meaning. Its best-effort
delivery means applications must handle loss or use suitable transport
services. IPv4's limited address space led to extensive sharing and translation;
IPv6 offers a far larger address space but must coexist with IPv4 during
deployment.

## Common misconceptions

- An IP address is not a permanent identity for a person or device.
- An IP packet alone does not guarantee delivery.
- A private address can still reach the Internet through a gateway.

## Revision questions

1. How do IPv4 and IPv6 address sizes differ?
2. What does `/24` represent in a network prefix?
3. Why might a server see a different address from a laptop's local address?

## Further Learning & References

- **Official standard — RFC Editor:** [RFC 791, Internet Protocol](https://www.rfc-editor.org/rfc/rfc791)
  defines IPv4 packet delivery.
- **Official standard — RFC Editor:** [RFC 8200, Internet Protocol,
  Version 6](https://www.rfc-editor.org/rfc/rfc8200) specifies IPv6.
- **Third-party explanation — MDN:** [What is a URL?](https://developer.mozilla.org/en-US/docs/Learn/Common_questions/Web_mechanics/What_is_a_URL)
  explains how names and network destinations fit into web addresses.
