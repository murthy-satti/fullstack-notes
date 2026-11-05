# IP Addressing

## Introduction

An Internet Protocol (IP) address is a numeric destination for packets.
IPv4 addresses are 32 bits, commonly written as `192.0.2.25`; IPv6 addresses
are 128 bits, as in `2001:db8::25`.

## Why does it exist?

Routers need destination information to forward packets, and IP addresses
also let networks be divided into ranges. They are not website names; [DNS](dns.md)
can map a name to one or more addresses.

## How does it work?

An IP packet includes source and destination addresses. Routers choose a next
hop using routing tables. A prefix such as `192.0.2.0/24` marks a range; `/24`
means 24 leading network bits. IP is connectionless and does not promise
delivery or ordering.

Private-use ranges are intended for internal networks. Network address
translation (NAT) often lets multiple private devices share a public IPv4
address. IPv6's larger address space reduces the need for that workaround.

## Real-world example

Your laptop may have a private address from a home router. The router can
translate it when forwarding traffic to a public site, which sees the public
connection address instead.

## Developer perspective

Do not assume an address is permanent or identifies a user. Servers may have
several addresses, and NAT can place many users behind one public address.
Use DNS names for service discovery and IP addresses for network diagnosis.

## Practical example

On Linux, `ip address` lists local addresses and `ip route` displays routes;
both are read-only. `127.0.0.1` and `::1` are loopback addresses.

## Important terminology

- **Interface:** network attachment such as Wi-Fi or Ethernet.
- **Prefix/subnet:** addresses grouped by shared leading bits.
- **Loopback:** address used by a device to communicate with itself.
- **NAT:** translation of network addresses, often at a router.

## Advantages and disadvantages

IP is scalable and independent of application meaning, but its best-effort
delivery requires applications to handle loss or use a suitable transport.
IPv6 offers more addresses, but must coexist with IPv4 during deployment.

## Common misconceptions

- An IP address is not a permanent identity, and a private address can reach
  the Internet through a gateway.

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
