# Your Own Domain, Properly

Point a domain you own at TaskFlow with clean records: the apex and `www`
(one redirecting to the other), an `api` subdomain, and a CAA record. Put
a CDN in front of TaskFlow Web, rehearse a DNS provider move, and send
transactional email that passes SPF, DKIM, and DMARC at `p=reject`.

## Why this project helps

- Builds DNS and email skills that every production system depends on and
  few developers practice: records, TTLs, CDNs, and email authentication.
- Improves **performance**: a CDN with sensible cache rules serves the web
  app close to users and offloads the origin.
- Improves **deliverability and trust**: authenticated mail stops landing in
  spam and stops others from spoofing your domain.
- DNS migrations and "why is our email in spam?" come up in interviews and
  on real teams.

## What you need

- A domain from any registrar (a cheap TLD is fine) and a DNS provider.
- A CDN with a free plan, and a transactional email provider's free tier.
- `dig` on your laptop.
- Builds on [Production Server from Scratch](production-server-from-scratch.md)
  or any hosted TaskFlow from earlier projects.

## How to do it

1. Learn the record types and TTLs in
   [domains and DNS records](../domains-dns-and-email/domains-and-dns-records.md).
2. Point the apex and `www` at the frontend (ALIAS, ANAME, or flattening at
   the apex), redirect one to the other, and add `api` for the backend; see
   [connecting domains to hosting](../domains-dns-and-email/connecting-domains-to-hosting.md).
3. Add a CAA record naming your certificate authority, for example
   `0 issue "letsencrypt.org"`.
4. Put the CDN in front of TaskFlow Web with cache rules per path (long for
   hashed assets, short or none for HTML) and a purge step in the deploy
   pipeline; see [CDN setup and edge caching](../domains-dns-and-email/cdn-setup-and-edge-caching.md).
5. Rehearse a provider move: lower TTLs days ahead, copy every record
   (including MX and TXT), compare answers with `dig @<nameserver>`, then
   switch nameservers; see
   [DNS migrations and troubleshooting](../domains-dns-and-email/dns-migrations-and-troubleshooting.md).
6. Send transactional email through your provider with SPF and DKIM records
   and a DMARC record at `p=none` with reporting.
7. Read the DMARC reports, fix any sender that fails, then move to
   `p=quarantine` and finally `p=reject`; see
   [email deliverability](../domains-dns-and-email/email-deliverability-spf-dkim-dmarc.md).

## Done when

- `example.com` and `www.example.com` resolve, and one redirects to the
  other.
- `api.example.com` reaches the backend, and the CAA record is visible with
  `dig CAA`.
- CDN responses show cache hits for assets, and a deploy purges stale HTML.
- The rehearsed migration copied every record with no resolution gap.
- Test messages pass SPF, DKIM, and DMARC, and the policy is `p=reject`.

## Stretch goals

- Turn on DNSSEC at the registrar and DNS provider.
- Add MTA-STS for inbound mail.
- Serve a per-pull-request preview subdomain.

## Lessons to use

- [Domains, DNS and Email](../domains-dns-and-email.md)
- [DNS](../../../01-networking-and-protocols/dns.md) and
  [CDN](../../../06-servers-and-infrastructure/cdn.md)

Back to [all projects](../projects.md).
