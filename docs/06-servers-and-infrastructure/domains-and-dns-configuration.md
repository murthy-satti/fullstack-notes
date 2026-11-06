# Domains and DNS Configuration

## Introduction

A domain name, such as `example.com`, is a human-readable name used to reach internet services. The Domain Name System (DNS) lets software look up records associated with a domain, such as addresses or mail servers.

## Why does it exist?

Names are easier to remember than numeric IP addresses. DNS lets an organization change hosting addresses without changing the domain name. Cached answers mean updates may take time to appear.

## How does it work?

A registrar manages a domain's registration. Its delegation points resolvers to authoritative nameservers, which publish records. A recursive resolver looks up an answer and may cache it for its time to live. Common records include **A** (IPv4), **AAAA** (IPv6), **CNAME** (alias), **MX** (mail), and **TXT** (verification or policy text).

## Real-world example

For `www.example.com`, an A record can point to a web server's IPv4 address, or a CNAME can point a subdomain to a provider hostname. Email uses MX records.

## Developer perspective

Resolvers cache DNS answers, so changes may not be immediate. Confirm the record type, hostname, destination, and TTL before changing production DNS. DNS directs clients to a service; the service decides its response. See [servers](servers.md), [CDN](cdn.md), and [SSL certificates](../07-devops-and-deployment/ssl-certificates.md).

## Practical example

To direct `api.example.com`, get the exact target and record type from the hosting provider. Add it in the DNS control panel and verify with a DNS lookup tool.

## Important terminology

- **Registrar:** company through which a domain is registered.
- **Authoritative nameserver:** source of published DNS records.
- **Resolver:** service that looks up DNS on a client's behalf.
- **TTL:** time a DNS answer can be cached.
- **Propagation:** informal term for caches updating after a change.

## Common misconceptions

Buying a domain does not create a website or mailbox. DNS helps clients find a service; it does not store a web page. Lowering a TTL does not instantly clear existing caches.

## Further Learning & References

- **Internet standard:** [RFC 1034: Domain Names—Concepts and Facilities](https://www.rfc-editor.org/rfc/rfc1034) describes DNS architecture and concepts.
- **Official Cloudflare learning resource:** [What is DNS?](https://www.cloudflare.com/learning/dns/what-is-dns/) provides a beginner-friendly lookup walkthrough and record overview.
- **Official AWS documentation:** [What is Amazon Route 53?](https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/Welcome.html) explains hosted zones, records, and AWS DNS routing.
