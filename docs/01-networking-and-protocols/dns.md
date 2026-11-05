# DNS

## Introduction

The Domain Name System (DNS) is a distributed naming system. It maps names
such as `example.com` to IP addresses and publishes other domain information.

## Why does it exist?

Numeric addresses are awkward to remember and may change as services move.
DNS separates a human-readable name from network configuration. It is a
distributed hierarchy, not one central database.

## How does it work?

A device asks a recursive resolver. If its cache has no answer, the resolver
follows delegation from the root through a top-level domain to an
authoritative server. Records include `A` (IPv4), `AAAA` (IPv6), and `CNAME`
(alias). A time-to-live (TTL) limits caching.

DNS commonly uses port 53 over UDP or TCP; it does not always use UDP.
Traditional DNS is not encrypted by default. DNS-over-HTTPS and
DNS-over-TLS encrypt queries in transport.

## Real-world example

For `https://www.example.com/`, the browser needs an address for the hostname.
It may use a cache or ask its resolver, then connect to the returned address.
See
[IP addressing](ip-addressing.md) and [HTTP and HTTPS](http-and-https.md).

## Developer perspective

Resolver caches mean DNS changes can take time to appear. Distinguish an
incorrect answer from an unreachable server or application error. Multiple
answers can distribute load, but do not guarantee health-aware routing.

## Practical example

Run `nslookup example.com` or `dig example.com` to query the configured
resolver. These display an answer without changing records; another resolver
may return a different cached answer.

## Important terminology

- **Resolver:** service that looks up DNS data for a client.
- **Authoritative server:** source of records for a zone.
- **Record:** typed data, such as `A`, `AAAA`, `MX`, or `CNAME`.
- **TTL:** how long a response may be cached.

## Advantages and disadvantages

Delegation and caching help DNS scale and let services change addresses.
Caches can be stale, and DNS can fail independently of the website.

## Common misconceptions

- A DNS response does not prove the server is healthy, and a record change
  does not instantly clear every resolver's cache.

## Revision questions

1. What is the difference between a recursive resolver and an authoritative
   server?
2. What does a TTL control?
3. Why might two devices temporarily get different DNS answers?

## Further Learning & References

- **Official standard — RFC Editor:** [RFC 1034, Domain Names—Concepts and
  Facilities](https://www.rfc-editor.org/rfc/rfc1034) explains DNS design.
- **Official standard — RFC Editor:** [RFC 1035, Domain Names—Implementation
  and Specification](https://www.rfc-editor.org/rfc/rfc1035) describes
  message formats and basic record handling.
- **Third-party explanation — Cloudflare Learning Center:** [What is
  DNS?](https://www.cloudflare.com/learning/dns/what-is-dns/) gives a concise
  overview of resolution and record types.
