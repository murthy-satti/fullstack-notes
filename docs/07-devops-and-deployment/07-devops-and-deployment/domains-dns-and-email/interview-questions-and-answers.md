# Domains, DNS and Email Interview Questions and Answers

These questions review domains and DNS records, connecting domains to
hosting, DNS migrations and troubleshooting, CDN setup and edge caching,
and email deliverability with SPF, DKIM, and DMARC. Try answering each
one before reading the answer.

## Domains and DNS records

### 1. What is the difference between a registrar, a registry, and a DNS host?

The registry operates a top-level domain: its database of names and the
TLD's nameservers. The registrar is the company you pay; it registers and
renews the name with the registry and sends it your nameservers and DS
records. The DNS host runs the authoritative nameservers that serve your
zone's records. One company can be registrar and DNS host, but the roles
stay separate.

### 2. What is a delegation, and where does it live?

The NS records for your domain in the parent zone (for `example.com`, in
the `.com` zone), plus glue addresses when the nameservers are inside the
zone. It tells resolvers which servers are authoritative. The `.com`
servers publish it with a 172,800-second (two-day) TTL, which is why
nameserver changes settle slowly.

### 3. What replaced WHOIS, and why does registration data matter to operators?

RDAP, which returns registration data as JSON over HTTPS; since
28 January 2025, gTLD registries and registrars must provide RDAP and
are mostly no longer required to run WHOIS. Operators use it to monitor
expiry dates and lock statuses, and must keep the registrant email real,
because renewal notices, transfer approvals, and verification requests go
there.

### 4. What happens when a generic TLD domain expires?

The registrar must send notices about a month and a week before expiry.
After expiry it interrupts DNS (often showing a parking page) while you
can still renew. Once deleted, the name enters a 30-day redemption grace
period with DNS off, where only the previous registrant can restore it,
usually for a fee. After a short pending-delete stage anyone can register
it.

### 5. How do you protect a production domain from hijacking or accidental changes?

Auto-renew with a valid payment method, a registrar transfer lock
(`clientTransferProhibited`, plus update and delete locks), a registry
lock for the most important domain, MFA on registrar and DNS accounts,
zone-scoped API tokens, and alerts on expiry dates, NS and DS changes, and
Certificate Transparency entries for your names.

### 6. What are the rules of a CNAME record?

A name with a CNAME can hold no other records, so the zone apex (which
needs SOA and NS) can never be a CNAME. MX and NS targets must not be
aliases. A CNAME applies to every query type, including TXT lookups. Each
hop in a chain can cost another lookup.

### 7. How do you point the apex at a CDN or hosting platform?

With a provider feature that resolves the target on the authoritative
side: a Route 53 alias record, Cloudflare's CNAME flattening (automatic
at the apex), or an ALIAS/ANAME record at other hosts. Alternatives are
the platform's documented static or anycast IPs, or making `www` the
canonical host and redirecting the apex to it.

### 8. What is the trade-off of CNAME flattening and alias records?

The DNS host resolves the target from its own servers, so a platform
that steers users by DNS sees the DNS host's location rather than the
user's resolver. That is why Netlify recommends a subdomain as the
primary domain with external DNS, and Vercel recommends `www` with a
CNAME.

### 9. What should a domain that never sends or receives email publish?

A null MX (`MX 0 .`, RFC 7505) so senders fail fast, `v=spf1 -all` so no
server is authorized to send, and `_dmarc` with `p=reject` so receivers
reject mail claiming to be from it. `example.com` itself publishes
exactly these records.

### 10. What does a CAA record do, and how does a CA find the relevant one?

It lists the certificate authorities allowed to issue for a name (`issue`,
`issuewild`, `iodef`). The CA looks at the exact name, then climbs toward
the root and uses the first name that has CAA records. No CAA anywhere
means any CA may issue; `issue ";"` means none may. Each CA has an
identifier, such as `letsencrypt.org` or `amazon.com` for ACM.

```text
example.com.  CAA  0 issue "letsencrypt.org"
example.com.  CAA  0 issuewild "letsencrypt.org"
```

### 11. What is negative caching?

Resolvers cache the answer that a name or record does not exist. Per RFC
2308 the duration is the smaller of the SOA record's TTL and the SOA
minimum field. A record created after someone looked it up can stay
invisible to that resolver until the negative entry expires.

### 12. How does TTL affect a change? Give an example.

A resolver may answer from cache until the TTL expires. With a TTL of
3600, a resolver that cached the record at 09:59:30 serves the old value
until 10:59:30 even if you change it at 10:00. Lowering the TTL helps
only if done at least one old TTL before the change.

### 13. What does DNSSEC protect, and what is its main operational risk?

It lets validating resolvers verify, through a chain of DS and DNSKEY
records from the root, that answers came from the zone owner unaltered.
It does not encrypt queries. The risk is a broken chain: if the DS at the
parent does not match the zone's key, validating resolvers return
SERVFAIL, and the cached DS (a day at `.com`) makes the outage outlive
the fix.

### 14. What is an SRV record, and where might a Node.js developer meet one?

It publishes priority, weight, port, and target host for a service under
`_service._proto.name`. MongoDB's `mongodb+srv://` connection strings
make the driver look up `_mongodb._tcp.<host>` SRV records for the members
and a TXT record for options such as `replicaSet`, and turn TLS on by
default.

## Connecting domains to hosting

### 15. Why do platforms recommend `www` as the canonical host?

`www` can be a plain CNAME, so the platform controls where it points and
can steer traffic by DNS for performance and DDoS mitigation; the apex
needs an A record or flattening. The apex then redirects to `www` with a
permanent redirect that browsers cache.

### 16. How do you attach a subdomain and the apex to Vercel or Netlify?

Subdomain: a CNAME to the target the dashboard shows (a project-specific
Vercel DNS name, or the site's `netlify.app` name). Apex: the A record
value Vercel shows or its nameservers; for Netlify an ALIAS, ANAME, or
flattened CNAME to `apex-loadbalancer.netlify.com`, or an A record as a
fallback. Always copy values from the dashboard.

### 17. What does CloudFront need before it serves a custom domain?

The name must be an alternate domain name on exactly one distribution,
covered by a trusted certificate (an ACM certificate in `us-east-1`), and
DNS must point at the distribution: a CNAME for subdomains, or Route 53
alias `A` and `AAAA` records, including at the apex.

### 18. Why should you never create A records with a load balancer's IP addresses?

Managed load balancers scale and replace nodes, so their IPs change; AWS
load balancers publish their DNS name with a 60-second TTL for exactly
this reason. Use an alias record or a CNAME to the load balancer's DNS
name.

### 19. What are verification records, and why must you keep them?

TXT or CNAME records that prove domain control to a platform or CA, such
as Vercel's `_vercel` TXT, Azure's `asuid` TXT, or ACM's validation
CNAMEs. Deleting them can block later renewals (ACM stops renewing when
its CNAME disappears) or let another account claim the domain. Record
which service owns each one.

### 20. How does a Route 53 alias record differ from a CNAME?

It can sit at the apex, answers with the current addresses of an AWS
resource (so it looks like an `A` or `AAAA` record to clients), only
matches the record type you created, is free for queries to AWS
resources, and takes its TTL from the target instead of your setting.

### 21. What changes when a Cloudflare record is switched from DNS-only to proxied?

DNS answers with Cloudflare anycast IPs and an automatic 300-second TTL,
TLS for visitors ends at Cloudflare with an edge certificate, caching,
WAF, and DDoS rules apply, the origin sees Cloudflare's addresses (the
visitor's is in `CF-Connecting-IP`), and only HTTP and HTTPS are carried.
Only A, AAAA, and CNAME records can be proxied; MX and TXT stay DNS-only.

### 22. What causes a redirect loop after enabling Cloudflare, and how do you fix it?

Flexible mode connects to the origin over plain HTTP; if the origin
redirects HTTP to HTTPS, every request loops. Switch to Full (strict)
with a valid origin certificate, so Cloudflare connects over HTTPS and
validates the origin.

### 23. How do DNS wildcards and TLS wildcards differ?

A DNS wildcard (`*.preview.example.com`) answers for any name below it
that does not exist, even several labels deep, but not for names that
exist, including names that exist only because something below them has
records. A TLS wildcard certificate covers exactly one label:
`pr-7.preview.example.com`, not `api.pr-7.preview.example.com`.

### 24. What is subdomain takeover, and how do you prevent it?

A DNS record (usually a CNAME) points at a cloud resource that was
deleted; an attacker creates a resource with the same provider name and
serves content, with a valid certificate, on your subdomain. Prevent it
by removing DNS records before deleting resources, keeping verification
records, and regularly checking that every CNAME target still exists and
belongs to you.

### 25. In what order should `example.com` redirect when you use HSTS preload?

`http://example.com` first redirects to `https://example.com` on the same
host, which serves the HSTS header (`max-age` of at least a year,
`includeSubDomains`, `preload`), and only then redirects to
`https://www.example.com`. Preloading forces HTTPS on every subdomain, so
audit them first.

## DNS migrations and troubleshooting

### 26. What does "DNS propagation" actually mean?

Nothing is pushed. The authoritative servers serve a change within
seconds; each resolver keeps its cached copy until that copy's TTL
expires, at different moments, so users see a mix of old and new answers
for up to one TTL (or up to the delegation TTL for nameserver changes).

### 27. How do you change a record with zero downtime?

Lower the TTL at least one old TTL ahead, prepare the new target fully,
test it with `curl --resolve` using the real hostname, change the record,
keep the old target serving until its traffic is gone, verify from
several resolvers over IPv4 and IPv6, then raise the TTL and decommission
the old target.

### 28. How do you move a zone to a new DNS provider safely?

Inventory every record (including MX, DKIM, DMARC, verification, CAA,
SRV, and subdomain delegations), translate provider-specific records
such as aliases, import, diff both providers' answers name by name,
handle DNSSEC first, change the nameservers at the registrar, and keep
both zones identical for at least the delegation TTL before deleting the
old one.

### 29. Why can't you quickly roll back a `.com` nameserver change?

Resolvers cache the delegation from the `.com` servers for up to two days
(172,800 seconds), and you cannot shorten that TTL. Whatever you publish
at the registry, some resolvers keep using the previous nameservers until
their cached delegation expires.

### 30. How do you handle DNSSEC when changing DNS providers?

Either remove the DS record at the registrar and wait at least a day for
cached copies to expire before moving (then sign at the new provider and
publish its DS), or use a multi-signer setup (RFC 8901) in which both
providers' keys are published. Never move while the DS points at keys
the new provider does not have.

### 31. How do you tell whether a problem is in the zone, the delegation, or caches?

Ask the authoritative server directly (`dig @ns1... name +norecurse`) to
check the zone, walk the delegation with `dig +trace`, and query several
public resolvers (`dig @1.1.1.1`, `@8.8.8.8`) to see cached answers and
their remaining TTL. Work outward from the zone.

### 32. What does it mean when `dig` returns SERVFAIL but `dig +cd` works?

`+cd` asks the resolver to skip DNSSEC validation. If the answer only
works without validation, the DNSSEC chain is broken, typically a DS that
does not match the zone's keys. `delv` and DNSViz show where the chain
breaks.

### 33. How do you test a new server before DNS points at it?

`curl --resolve api.example.com:443:198.51.100.40 https://api.example.com/healthz`
sends a real request to the new address with the real hostname in SNI
and `Host`, so certificate and virtual host problems appear before users
are switched.

### 34. How does DNS as code help a migration?

The zone lives in version control and changes go through review. Tools
like DNSControl can push the same records to the old and new providers
during the overlap (`SERVICE("new_dns", 0)` manages records without
delegating), and `dnscontrol preview` in CI shows each provider's changes
before `push`.

## CDN setup and edge caching

### 35. What is a cache key, and what belongs in it?

The request properties that decide whether two requests share a cached
object. Include every input that changes the response (path, meaningful
query parameters, headers the response really varies by) and nothing
else: drop tracking parameters and high-variety headers, and never key
shared content on session cookies or `Authorization`.

### 36. What is the difference between CloudFront's cache policy and origin request policy?

The cache policy defines what goes into the cache key; the origin request
policy defines extra values forwarded to the origin without being keyed.
If the origin varies its response on a value that is forwarded but not
keyed, CloudFront serves the first variant to everyone.

### 37. Why can a policy with a minimum TTL above zero leak private data?

CloudFront caches for at least the minimum TTL even when the origin sends
`no-cache`, `no-store`, or `private`; the managed `CachingOptimized`
policy has a one-second minimum. Attached to personalized API paths, it
can serve one user's response to another. Use `CachingDisabled` there.

### 38. What does an origin shield or tiered cache do? Give the arithmetic.

It adds a mid-tier cache near the origin that collapses misses from many
edge locations. With a 90% edge hit ratio and an 80% shield hit ratio on
the misses, the origin sees `0.10 × 0.20 = 2%` of requests. CloudFront
Origin Shield, Cloudflare Tiered Cache, Fastly shielding, Akamai Tiered
Distribution, and Bunny Origin Shield all do this.

### 39. How should you invalidate cached content?

Prefer versioned (hashed) URLs so only entry points need invalidating.
Purge groups by tag (Cloudflare `Cache-Tag`, Fastly `Surrogate-Key`,
CloudFront cache tags) when content changes, avoid purge-everything,
which turns every edge cold at once, and remember purges never reach
browsers.

### 40. How do you protect an origin that sits behind a CDN?

Use CloudFront origin access control for S3, allow only the CDN's
published ranges at the firewall or load balancer, require a secret
header that only the CDN adds, or connect through a tunnel. Otherwise
attackers bypass the cache and the WAF by hitting the origin directly.

### 41. How do you put an API behind a CDN safely?

Disable caching for everything except explicitly public `GET` endpoints,
forward `Authorization`, cookies, and query strings, cache public
responses with short `s-maxage`, never cache responses that depend on the
caller, check body size and timeout limits, and read the client IP from
the CDN's header.

### 42. When would you use CloudFront Functions instead of Lambda@Edge?

CloudFront Functions run sub-millisecond JavaScript on viewer requests
and responses only, without network access, at very high scale: redirects,
header changes, cache key normalization, token checks. Lambda@Edge
(Node.js or Python) adds origin-side events, network and body access, and
longer execution for heavier logic.

### 43. How do you keep edge image transformations under control?

Allow only a small set of widths and formats, reject others at the edge,
and include the allowed parameters in the cache key. Free-form parameters
let anyone create unlimited variants, and services such as Cloudflare
bill each unique transformation per month.

### 44. What do Cloudflare's `DYNAMIC` and `BYPASS` cache statuses mean?

`DYNAMIC` means the request was never eligible for caching under the
current rules, so it went straight to the origin. `BYPASS` means it was
eligible, but the origin's response was not cacheable (for example
because of its `Cache-Control` header).

## Email deliverability: SPF, DKIM and DMARC

### 45. Why does application email land in spam?

Mailbox providers decide on authentication (SPF, DKIM, DMARC with
alignment) and reputation: complaints, bounces, spam traps, engagement,
and the history of the domain and IPs. Authentication is required to be
eligible for the inbox; reputation decides the folder. Google asks for a
spam rate below 0.1% and never reaching 0.3%.

### 46. Why separate transactional and marketing email?

Marketing draws more complaints. Sending it from its own subdomain and
provider stream or IP pool keeps a campaign's complaints from pushing
password resets into spam. Note that Gmail still counts subdomains toward
the primary domain for its bulk-sender threshold.

### 47. What does SPF check, and what is the 10-lookup limit?

SPF checks the envelope `MAIL FROM` (Return-Path) domain against the
servers listed in its TXT record, not the visible From. RFC 7208 limits
an evaluation to 10 lookups from `include`, `a`, `mx`, `ptr`, `exists`,
and `redirect`, including nested includes; `ip4`, `ip6`, and `all` are
free. Exceeding it is a `permerror`, so SPF fails for every message.

### 48. How does DKIM work, and how are its keys rotated?

The sender signs selected headers and a body hash with a private key and
adds a `DKIM-Signature` with `d=` (domain) and `s=` (selector); the
receiver fetches the public key from `<selector>._domainkey.<domain>`.
Keys should be 2048-bit RSA (RFC 8301 requires at least 1024 and forbids
`rsa-sha1`). Rotate by publishing a new selector, switching signing, and
removing the old key later.

### 49. What does a message need to pass DMARC?

SPF or DKIM must pass, and the passing domain must align with the header
From domain: in relaxed mode (the default) it must share the
organizational domain, in strict mode it must match exactly. The policy
(`p=none`, `quarantine`, `reject`) says what to do when neither aligned
check passes.

### 50. Why can SPF and DKIM both pass while DMARC fails?

Because they passed for someone else's domain: the provider's default
Return-Path (for example `amazonses.com`) and DKIM signed with the
provider's domain. Neither aligns with `example.com`. Fix it with custom
DKIM for your domain and a custom MAIL FROM or Return-Path subdomain.

### 51. How do you roll out DMARC safely?

Publish `p=none` with `rua`, read aggregate reports for a few weeks,
inventory and fix every legitimate sender (aligned DKIM, custom
Return-Path, or its own subdomain), then move to `quarantine` and later
`reject`, optionally with `t=y` first. Advance only when reports are
clean, and keep reading them afterwards.

### 52. What changed when DMARC was updated in 2026?

RFC 9989 (May 2026) put DMARC on the Standards Track, obsoleting RFC 7489
and RFC 9091, and moved reporting to RFC 9990 and RFC 9991. It removed
`pct`, `rf`, and `ri`, added `t` (test mode, which applies the next
weaker policy), `np`, and `psd`, and replaced the Public Suffix List with
a DNS tree walk for finding the organizational domain. Receivers still on
RFC 7489 ignore the new tags.

### 53. What do Gmail, Yahoo, and Outlook.com require from bulk senders?

Gmail (close to 5,000+ messages a day to personal accounts, a permanent
status) and Yahoo require SPF and DKIM, DMARC of at least `p=none` with
alignment, one-click unsubscribe honored within about two days, and a
spam rate below 0.3%. Outlook.com requires SPF and DKIM to pass and an
aligned DMARC record for domains above 5,000 messages a day, enforced
since May 5, 2025 with `550 5.7.515` rejections.

### 54. What is one-click unsubscribe, and how do you implement it?

RFC 8058: the message carries `List-Unsubscribe` with an HTTPS URL and
`List-Unsubscribe-Post: List-Unsubscribe=One-Click`, both covered by
DKIM. The mail client sends a `POST` without cookies; the endpoint must
unsubscribe from a token in the URL and must not redirect. The `GET`
link should show a confirmation page, because link scanners follow links.

### 55. How should bounces and complaints be handled?

Suppress hard bounces and complaints immediately, retry soft bounces and
suppress after repeats, and keep your own suppression store per category
as well as the provider's. Watch rates: SES reviews accounts at 5%
bounces or 0.1% complaints. Gmail does not send complaint data to SES, so
watch Postmaster Tools too.

### 56. When is a dedicated IP worth it, and what is warm-up?

Only for high, steady volume: a dedicated IP carries your reputation
alone and needs regular sending (SES suggests around 1,000 emails a day
per mailbox provider). A new IP has no history, so volume must rise
gradually over weeks, starting with engaged recipients; SES's automatic
warm-up takes 45 days.

## Scenario-based questions

### 57. After moving DNS from the registrar to a new provider, the website works but nobody receives email. What do you do?

**What to check first:** the MX records at the new provider, queried
directly: `dig @<new-ns> example.com MX +norecurse`.

**How to confirm:** the old provider's export lists MX, SPF, DKIM, and
DMARC records that the new zone lacks; senders report bounces.

**Likely causes and fixes:** only web records were copied before the
nameserver change. Add the mail records immediately, then diff every name
and type between the providers. See
[DNS migrations and troubleshooting](dns-migrations-and-troubleshooting.md).

### 58. The whole product is unreachable and the domain now shows a parking page. The servers are healthy. What happened?

**What to check first:** the domain's registration status and expiry
date with an RDAP lookup.

**How to confirm:** RDAP shows an expiration date in the past and a
status such as `redemptionPeriod`; the A record points at the
registrar's parking IPs.

**Likely causes and fixes:** the domain expired because auto-renew was off,
the card failed, or notices went to a former employee. Renew or restore
it, move contacts to a role mailbox, and alert on expiry dates. See
[domains and DNS records](domains-and-dns-records.md).

### 59. After moving TaskFlow Web to a new platform, its certificate cannot be issued: the platform reports a CAA error. What do you change?

**What to check first:** `dig example.com CAA` and `dig app.example.com CAA`.

**How to confirm:** the relevant CAA set lists only the old platform's
CA, not the one the new platform uses.

**Likely causes and fixes:** CAA was never updated. Add the new CA's
identifier (keeping any still in use), and add a CAA review to the
hosting change checklist. See
[connecting domains to hosting](connecting-domains-to-hosting.md).

### 60. Right after a DNS provider change, some users get SERVFAIL while others resolve fine. Why?

**What to check first:** compare `dig example.com` and
`dig +cd example.com` through a validating resolver such as 8.8.8.8.

**How to confirm:** the answer works only with `+cd`; DNSViz shows the
parent's DS record matching no DNSKEY at the new provider.

**Likely causes and fixes:** the DS record still points at the old
provider's key. Remove it (or publish matching keys) and wait for the
cached DS to expire; next time remove DS a day before the move. See
[DNS migrations and troubleshooting](dns-migrations-and-troubleshooting.md).

### 61. An hour after switching `api.example.com` to a new load balancer, a third of requests still reach the old one. Is DNS broken?

**What to check first:** the record's TTL before the change and the
remaining TTL at public resolvers.

**How to confirm:** resolvers still hold the old address with a large
remaining TTL, or the old load balancer's traffic comes from a few
long-lived clients.

**Likely causes and fixes:** the TTL was not lowered beforehand, or clients
reuse old connections or cached lookups. Keep the old target serving,
restart long-lived workers or limit connection age, and lower TTLs a full
TTL ahead next time. See
[DNS migrations and troubleshooting](dns-migrations-and-troubleshooting.md).

### 62. After turning on Cloudflare's proxy, browsers show "too many redirects". What do you check?

**What to check first:** the zone's SSL/TLS encryption mode and the
origin's HTTP-to-HTTPS redirect.

**How to confirm:** `curl -sI` shows `301` responses to the same HTTPS URL
repeatedly, and the mode is Flexible.

**Likely causes and fixes:** Cloudflare fetches the origin over HTTP and
the origin redirects to HTTPS. Install a valid origin certificate and use
Full (strict). See
[connecting domains to hosting](connecting-domains-to-hosting.md).

### 63. A security researcher reports that `promo.example.com` serves a phishing page. Nobody on the team deployed it. What happened?

**What to check first:** `dig promo.example.com` and what its CNAME target
points to.

**How to confirm:** the CNAME targets a provider-assigned name for a
resource your account no longer owns; Certificate Transparency shows a
certificate you did not request.

**Likely causes and fixes:** subdomain takeover through a dangling CNAME.
Delete the record, treat it as a security incident (cookies scoped to the
parent domain may have leaked), audit all CNAMEs, and remove DNS before
deleting resources. See
[connecting domains to hosting](connecting-domains-to-hosting.md).

### 64. The platform shows "invalid configuration" for `www.example.com`, and some users reach an old server. What is wrong?

**What to check first:** all records at `www`:
`dig www.example.com CNAME`, `A`, and `AAAA`.

**How to confirm:** an old `AAAA` record or a stray `A` record still points
at the previous host; IPv6 users (`curl -6`) reach it.

**Likely causes and fixes:** leftover records from the previous host. Remove
them, use exactly the target the dashboard shows, and test over IPv4 and
IPv6. See [connecting domains to hosting](connecting-domains-to-hosting.md).

### 65. The CDN hit ratio for TaskFlow's public pages is 15%. How do you raise it?

**What to check first:** the cache key configuration and the variety of
query strings, cookies, and headers in requests.

**How to confirm:** CDN logs show many distinct keys per path that differ
only by `utm_*` parameters, a cookie, or `User-Agent`.

**Likely causes and fixes:** unnecessary inputs in the key or a
`Vary: User-Agent` from the origin. Remove them from the key, strip
tracking parameters at the edge, and add a shield or tiered cache. See
[CDN setup and edge caching](cdn-setup-and-edge-caching.md).

### 66. A user reports seeing another user's task list. Responses pass through CloudFront. What do you check?

**What to check first:** the cache behavior and cache policy that match
`/api/*`, and the response headers (`Age`, `X-Cache`).

**How to confirm:** the API path uses a policy with a minimum TTL above
zero, or the response lacks `private, no-store`, and `X-Cache` shows a
hit.

**Likely causes and fixes:** a personalized path is cached. Invalidate it,
attach `CachingDisabled` to API behaviors, send `private, no-store`, test
with two users, and handle it as a security incident. See
[CDN setup and edge caching](cdn-setup-and-edge-caching.md).

### 67. Every deploy is followed by a spike that overloads the origin for several minutes. Why?

**What to check first:** the deploy's invalidation paths and whether a
shield or tiered cache is enabled.

**How to confirm:** origin requests per second jump right after an
invalidation of `/*`.

**Likely causes and fixes:** purge-everything makes every edge miss at
once. Hash asset filenames, invalidate only entry points, and enable
Origin Shield or tiered caching. See
[CDN setup and edge caching](cdn-setup-and-edge-caching.md).

### 68. Password reset emails land in spam at Gmail but arrive fine elsewhere. Where do you look?

**What to check first:** the `Authentication-Results` header of a message
delivered to a Gmail test account, and Postmaster Tools.

**How to confirm:** `dmarc=fail`, or SPF and DKIM passing only for the
provider's domains; or a rising spam rate caused by marketing mail on the
same domain and IPs.

**Likely causes and fixes:** missing alignment or shared reputation. Set up
custom DKIM and a custom Return-Path for `example.com`, and move marketing
to its own subdomain and stream. See
[email deliverability: SPF, DKIM and DMARC](email-deliverability-spf-dkim-dmarc.md).

### 69. After the marketing team added a new tool, every message from `example.com` fails SPF. What happened?

**What to check first:** `dig +short example.com TXT` for SPF records.

**How to confirm:** headers show `spf=permerror`; there are two SPF
records, or counting nested includes gives more than 10 lookups.

**Likely causes and fixes:** a second SPF record or the lookup limit. Merge
into one record, remove unused mechanisms such as `a` and `mx`, and give
the tool its own subdomain with its own SPF. See
[email deliverability: SPF, DKIM and DMARC](email-deliverability-spf-dkim-dmarc.md).

### 70. Mail to hotmail.com and outlook.com addresses now bounces with `550 5.7.515`. What does it mean?

**What to check first:** your daily volume to Outlook.com addresses and
the SPF, DKIM, and DMARC results on those messages.

**How to confirm:** the domain sends more than 5,000 messages a day there,
and messages fail SPF or DKIM, or have no aligned DMARC record.

**Likely causes and fixes:** Outlook.com's high-volume sender requirements.
Make SPF and DKIM both pass for the sending domain and publish an
aligned DMARC record of at least `p=none`. See
[email deliverability: SPF, DKIM and DMARC](email-deliverability-spf-dkim-dmarc.md).

## Further learning

- [Domains, DNS and email overview](../domains-dns-and-email.md)
- [Domains and DNS records](domains-and-dns-records.md) ·
  [Connecting domains to hosting](connecting-domains-to-hosting.md) ·
  [DNS migrations and troubleshooting](dns-migrations-and-troubleshooting.md) ·
  [CDN setup and edge caching](cdn-setup-and-edge-caching.md) ·
  [Email deliverability: SPF, DKIM and DMARC](email-deliverability-spf-dkim-dmarc.md)
- [RFC 1034: Domain Names, Concepts and Facilities](https://www.rfc-editor.org/rfc/rfc1034)
- [Google: Email sender guidelines](https://support.google.com/a/answer/81126)
- [MDN: DNS](https://developer.mozilla.org/en-US/docs/Glossary/DNS)
