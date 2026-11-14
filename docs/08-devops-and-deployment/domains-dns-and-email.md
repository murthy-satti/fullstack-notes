# Domains, DNS and Email

A domain name such as `example.com` is the address people and other
systems use to reach everything you run: the website, the API, the mail
servers, and the email your application sends. You rent the name from a
registrar, the registry for its top-level domain points the internet at
your nameservers, and those nameservers publish the zone: records that
send `app.example.com` to a CDN, `api.example.com` to a load balancer,
inbound mail to a mail provider, and the policies that let mailbox
providers trust TaskFlow's email. When this is right nobody notices; when
it is wrong the site disappears, password-reset emails land in spam, or
certificate renewals start failing.

## What domains, DNS and email setup provide

- **A stable name that outlives servers:** moving TaskFlow API to a new
  load balancer or host means changing one record, not every client.
- **Routing per hostname:** each name (`app`, `api`, `www`, the apex)
  can point at a different service, provider, or region.
- **Proof of control:** verification records (TXT or CNAME) prove to
  hosting platforms and certificate authorities that you own the domain,
  and CAA records limit which authorities may issue certificates for it.
- **Email trust:** SPF, DKIM, and DMARC records tell receiving servers
  which senders may use your domain, so your mail can reach the inbox and
  spoofed mail can be rejected.
- **Edge delivery:** pointing a hostname at a CDN puts caching,
  compression, and protection in front of your origin.

These pieces also bring duties: renewing the domain, keeping an inventory
of records and their owners, planning TTLs before changes, and monitoring
both DNS answers and email reputation.

## How a typical domain setup works

1. You register `example.com` at a registrar and choose a DNS host (it can
   be the same company). The registrar sends the DNS host's nameservers to
   the `.com` registry.
2. The registry publishes the **delegation**: NS records for
   `example.com` in the `.com` zone, plus a DS record if DNSSEC is on.
3. In the DNS host you create the zone's records: `app` as a CNAME to the
   CDN, `api` as an address or alias for the load balancer, MX records for
   inbound mail, TXT records for SPF, DKIM, DMARC, and verification, and
   a CAA record for certificates.
4. A browser asks a recursive resolver for `app.example.com`. The resolver
   follows the root, the `.com` servers, and your nameservers, returns the
   answer, and caches it for the record's TTL.
5. The browser connects to the CDN edge, which serves TaskFlow Web from
   its cache or fetches from the origin. Mail servers sending to
   `@example.com` look up the MX records, and mailbox providers that
   receive TaskFlow's email check its SPF, DKIM, and DMARC records.

![Diagram: three separate roles at the top: the registrar, where you register example.com and set its nameservers; the .com registry, which publishes the delegation as NS records plus a DS record for DNSSEC; and the DNS host, which serves the authoritative example.com zone. The zone holds five kinds of records, each pointing at a different service: app.example.com is a CNAME to the CDN edge serving TaskFlow Web, api.example.com is an A or alias record for the load balancer in front of TaskFlow API, the MX records point to the mail provider that receives inbound mail, TXT records publish SPF, DKIM, and DMARC for the email sending service, and the CAA record names the certificate authority allowed to issue certificates.](domains-dns-and-email-overview.svg)

## Practical example

A zone excerpt for TaskFlow in standard zone-file format (the addresses
and provider names are documentation placeholders):

```text
; example.com zone (excerpt): one domain, several services
$TTL 3600
example.com.        IN  NS     ns1.dns-host.example.net.
example.com.        IN  NS     ns2.dns-host.example.net.
www.example.com.    300  IN  CNAME  taskflow-web.cdn.example.net.
app.example.com.    300  IN  CNAME  taskflow-web.cdn.example.net.
api.example.com.    60   IN  A      198.51.100.20
example.com.        IN  MX     10 mx1.mail.example.net.
example.com.        IN  MX     20 mx2.mail.example.net.
example.com.        IN  TXT    "v=spf1 include:_spf.mail.example.net -all"
_dmarc.example.com. IN  TXT    "v=DMARC1; p=none; rua=mailto:dmarc-reports@example.com"
example.com.        IN  CAA    0 issue "letsencrypt.org"
```

Each line answers one question: where the web app lives, where the API
lives, who receives mail, who may send mail as `example.com`, and which
certificate authority may issue certificates. The deep pages explain each
record type, how to choose TTLs, and why the apex (`example.com` itself)
cannot simply be a CNAME.

## Domains, DNS and email topic map

**Foundations**

- [Domains and DNS records](domains-dns-and-email/domains-and-dns-records.md)

**Web traffic**

- [Connecting domains to hosting](domains-dns-and-email/connecting-domains-to-hosting.md)
- [DNS migrations and troubleshooting](domains-dns-and-email/dns-migrations-and-troubleshooting.md)
- [CDN setup and edge caching](domains-dns-and-email/cdn-setup-and-edge-caching.md)

**Email**

- [Email deliverability: SPF, DKIM and DMARC](domains-dns-and-email/email-deliverability-spf-dkim-dmarc.md)

**Review**

- [Domains, DNS and email interview questions and answers](domains-dns-and-email/interview-questions-and-answers.md) · [cheat sheet](domains-dns-and-email/cheat-sheet.md)

## Developer perspective and common misconceptions

Treat DNS as production configuration. Keep the zone in code (Terraform
or DNSControl), review changes like any other deploy, lower TTLs before
planned changes, give every record an owner, and protect the registrar
account with MFA, a transfer lock, and auto-renewal. The protocol itself
(resolvers, root and TLD servers, record basics) is covered in
[DNS](../01-networking-and-protocols/dns.md) in the Networking section,
and routing users to regions with DNS is covered in
[global traffic management](load-balancing-and-multi-server/global-traffic-management.md).

- "Propagation" is not a push. Your change is live on the authoritative
  servers within seconds; resolvers keep serving their cached copy until
  its TTL runs out.
- The registrar and the DNS host are different roles. Changing
  nameservers moves the whole zone, so every record (including MX and
  TXT) must exist at the new host first.
- A CNAME cannot sit at the zone apex. Use an A or AAAA record, or a
  provider feature such as an alias record or CNAME flattening.
- DNS only says where to connect. TLS certificates, redirects, and which
  site a server shows for a hostname are configured on the host or CDN.
- SPF, DKIM, and DMARC do not guarantee the inbox; they make mail
  eligible for it. Complaint rates, list quality, and sending patterns
  decide the rest.

## Further learning

- [MDN: DNS](https://developer.mozilla.org/en-US/docs/Glossary/DNS)
- [ICANN: Registration Data Access Protocol (RDAP)](https://www.icann.org/rdap)
- [RFC 1034: Domain Names, Concepts and Facilities](https://www.rfc-editor.org/rfc/rfc1034)
- [Google: Email sender guidelines](https://support.google.com/a/answer/81126)
- [Domains, DNS and email interview questions and answers](domains-dns-and-email/interview-questions-and-answers.md)
