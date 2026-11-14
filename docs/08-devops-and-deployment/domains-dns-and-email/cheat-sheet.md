# Domains, DNS and Email Cheat Sheet

Quick revision of the domains, DNS and email lessons, before an
interview or a DNS, CDN, or email change.

## Key commands

| Command | What it does |
|---|---|
| `dig @ns1.dns-host.example.net api.example.com +norecurse` | Asks the authoritative server what the zone really says |
| `dig +trace api.example.com` | Walks the delegation from the root down to your nameservers |
| `dig @1.1.1.1 api.example.com` | Shows a public resolver's cached answer and its remaining TTL |
| `dig +cd example.com` | Skips DNSSEC validation; an answer only with `+cd` means a broken chain |
| `dig +short example.com MX` (or `TXT`, `CAA`) | Checks mail, SPF, and certificate authority records |
| `curl --resolve api.example.com:443:198.51.100.40 https://api.example.com/healthz` | Tests a new target with the real hostname before DNS points at it |
| `curl -sI https://www.example.com/` | Shows redirects and cache headers (`age`, `x-cache`, `cf-cache-status`) |

## Key configuration

```text
; example.com zone (excerpt): web, API, mail, and certificates
www      300  IN  CNAME  taskflow-web.cdn.example.net.
api      60   IN  A      198.51.100.20
@             IN  MX     10 mx1.mail.example.net.
@             IN  TXT    "v=spf1 include:_spf.mail.example.net -all"
_dmarc        IN  TXT    "v=DMARC1; p=none; rua=mailto:dmarc-reports@example.com"
@             IN  CAA    0 issue "letsencrypt.org"
```

```text
; example.org zone (excerpt): a parked domain that sends and receives no mail
@        IN  MX   0 .
@        IN  TXT  "v=spf1 -all"
_dmarc   IN  TXT  "v=DMARC1; p=reject; sp=reject; adkim=s; aspf=s"
```

## Decision guide

| If you need | Choose | Why |
|---|---|---|
| A subdomain on a platform or CDN | A `CNAME` to the hostname the dashboard shows | The platform can change IPs and steer traffic |
| The apex on a platform or CDN | An alias, a flattened CNAME, the documented `A` record, or a redirect to `www` | A CNAME cannot sit at the apex |
| A load balancer | A Route 53 alias, or a CNAME to its DNS name | Its IPs change, so its DNS TTL is 60 s |
| A Workers custom domain or a Pages apex | Cloudflare nameservers | Both need the zone on Cloudflare |
| CDN and WAF on Cloudflare | Proxied web records, Full (strict), DNS-only mail | Flexible loops; MX and TXT are never proxied |
| Per-PR preview hostnames | A one-label wildcard and a DNS-01 wildcard certificate | TLS wildcards cover one label |
| A move to another DNS host | Inventory, diff, DS removed a day ahead, both zones identical | The `.com` delegation is cached for up to two days |
| Purging content shown on many URLs | Tags: `Cache-Tag`, `Surrogate-Key`, CloudFront cache tags | One precise purge, not purge-everything |
| Password resets and newsletters | Marketing on its own subdomain and stream; custom DKIM and Return-Path | Campaign complaints cannot sink resets |

## Numbers and defaults to remember

| Item | Value |
|---|---|
| TTLs | 60 to 300 s for names you may move; 3600 s for stable ones; 86400 s for NS and MX |
| Planned change | Lower the TTL one old TTL ahead; after a change, the worst case is one TTL |
| Negative caching | The smaller of the SOA record's TTL and its minimum field (RFC 2308) |
| `.com` delegation | NS cached for 172,800 s (2 days); DS for 86,400 s (1 day) |
| Cloudflare proxy | Automatic 300 s TTL (`ttl = 1`); `524` after the 125 s read timeout |
| Registration | 30-day redemption grace; 60-day transfer lock after registration, a transfer, or a registrant change |
| TXT and SPF | 255 bytes per string; one SPF record per name; max 10 lookups (nested count) and 2 void lookups |
| DKIM | RSA of at least 1024 bits, 2048 recommended; never `rsa-sha1` |
| DMARC (RFC 9989) | `adkim`, `aspf` default `r`; `sp` defaults to `p`; `t=y` applies one level weaker; no `pct`, `rf`, `ri` |
| Gmail and Yahoo | Spam rate under 0.3% (Google: aim under 0.1%); Gmail bulk: close to 5,000 a day, permanent; unsubscribe in 2 days |
| Outlook.com | Over 5,000 a day: SPF and DKIM pass plus aligned DMARC, or `550 5.7.515` |
| Amazon SES | Sandbox: 200 a day, 1 per second; review at 5% bounces or 0.1% complaints; 45-day IP warm-up |
| CloudFront | ACM certificate in `us-east-1`; `CachingOptimized` has a 1 s minimum TTL |
| Shield arithmetic | Origin share = edge miss x shield miss (0.10 x 0.20 = 2%) |

## Top mistakes

- **Moving nameservers to attach one subdomain.** Add a CNAME; a
  nameserver change moves every record, including MX and TXT.
- **Lowering the TTL when you make the change.** Lower it at least one
  old TTL before.
- **A CNAME at the apex or next to MX and TXT.** Use an alias, CNAME
  flattening, or the platform's documented `A` record.
- **Two SPF records, or more than 10 lookups.** Merge into one record,
  drop unused `a` and `mx`, and give senders their own subdomains.
- **Jumping to `p=reject` without reports.** Start at `p=none` with
  `rua` and align every sender first; RFC 9989 advises against
  `p=reject` where users post to mailing lists.
- **Flexible mode with an origin that redirects to HTTPS.** Use Full
  (strict) with a valid origin certificate.
- **A nonzero minimum TTL on personal API paths.** Use `CachingDisabled`
  and send `private, no-store`.
- **Deleting a cloud resource before its DNS record.** Remove the record
  first, or the subdomain can be taken over.

## Where to go deeper

- [Domains and DNS records](domains-and-dns-records.md)
- [Connecting domains to hosting](connecting-domains-to-hosting.md)
- [DNS migrations and troubleshooting](dns-migrations-and-troubleshooting.md)
- [CDN setup and edge caching](cdn-setup-and-edge-caching.md)
- [Email deliverability: SPF, DKIM and DMARC](email-deliverability-spf-dkim-dmarc.md)
- [Domains, DNS and email interview questions and answers](interview-questions-and-answers.md)

Back to the [domains, DNS and email overview](../domains-dns-and-email.md).
