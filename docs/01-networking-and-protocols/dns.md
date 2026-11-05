# DNS

## Introduction

The Domain Name System (DNS) is a distributed naming system. It lets people
use names such as `example.com` while network software uses IP addresses to
deliver packets. DNS can also publish other information about a domain.

## Why does it exist?

Numeric addresses are awkward to remember and may change as services move.
DNS separates a stable, human-readable name from the current network
configuration. It is often called the Internet's directory, but it is a
distributed hierarchy rather than one central database.

## How does it work?

A device usually asks a recursive resolver, often supplied by an ISP or
configured by an organization. If the answer is not cached, the resolver
follows DNS delegation from the root to a top-level domain and then to the
domain's authoritative name server. That server provides records such as an
`A` record for IPv4, an `AAAA` record for IPv6, or a `CNAME` alias. The
resolver caches answers according to their time-to-live (TTL).

DNS lookups commonly use port 53 over UDP or TCP. The precise choice depends
on the query and response; it is not correct that DNS always uses UDP.
Traditional DNS is not encrypted by default, while DNS-over-HTTPS and
DNS-over-TLS wrap queries in encrypted transports.

## Real-world example

For `https://www.example.com/`, the browser first needs an address for the
hostname. It may receive an address from a recent cache, or its resolver may
contact DNS servers. The browser then connects to the returned address. See
[IP addressing](ip-addressing.md) and [HTTP and HTTPS](http-and-https.md).

## Developer perspective

DNS changes take time to appear everywhere because resolvers cache records
until TTL expiry. Debugging should distinguish a bad DNS answer from an
unreachable server or an application error. Multiple answers can support
load distribution, but DNS alone does not guarantee health-aware routing.

## Practical example

Run `nslookup example.com` or `dig example.com` to request DNS information
from the configured resolver. These commands perform a query and display its
answer; they do not change DNS records. A cached answer may differ from what
another resolver currently sees.

## Important terminology

- **Resolver:** service that looks up DNS data for a client.
- **Authoritative server:** source of records for a DNS zone.
- **Record:** typed data, such as `A`, `AAAA`, `MX`, or `CNAME`.
- **TTL:** how long a response may be cached.

## Advantages and disadvantages

DNS scales through delegation and caching, and lets services change addresses
without changing every link. Cached information can be stale during changes,
and resolution adds a dependency that can fail independently of the website.

## Common misconceptions

- DNS is not a single server or a permanent address book.
- A DNS response does not prove that the destination server is healthy.
- Changing a record does not instantly clear every resolver's cache.

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
