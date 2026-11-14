# Connecting Domains to Hosting

Attaching `www.example.com` to TaskFlow Web or `api.example.com` to
TaskFlow API is where DNS, hosting, TLS, and redirects meet. This lesson
covers choosing a canonical host (apex or `www`), the exact records for
Vercel, Netlify, CloudFront, a load balancer, and a single server, the
verification records platforms ask for, wildcard and per-pull-request
preview subdomains, redirects between the apex and `www`, certificates
for custom domains, Route 53 alias records, what Cloudflare's proxy (the
"orange cloud") changes, and how a forgotten record lets someone else
take over a subdomain.

Choosing a host and understanding its bill is covered in
[hosting websites and frontends](../hosting-and-platforms/hosting-websites-and-frontends.md);
deploying files onto it safely is covered in
[deploying frontends and static sites](../deployment-strategies/deploying-frontends-and-static-sites.md).

## Why it matters

The platform's dashboard says "invalid configuration", the apex works
but `www` shows a certificate warning, enabling a CDN creates an
infinite redirect loop, or moving nameservers to a hosting platform
silently deletes the company's mail records: these are the everyday
failures of domain hookups, and each one is visible to every user at
once. The mechanics are small (a CNAME here, an alias there), but each
platform has its own rules for the apex, verification, certificates, and
wildcards, and the defaults are not always safe.

There is also a security side. A DNS record that points at a deleted
cloud resource can be claimed by a stranger, who then serves content,
and can obtain a valid certificate, on your subdomain.

## Real-world usage

- **Vercel recommends `www`.** Vercel's
  [deploying and redirecting domains](https://vercel.com/docs/domains/working-with-domains/deploying-and-redirecting)
  guide recommends `www` as the primary domain with a CNAME, plus a
  redirect from the apex, because a CNAME avoids hard-coding IP addresses
  and lets Vercel steer traffic for reliability and DDoS mitigation; it
  notes the apex can still use an A record served over anycast.
- **Netlify and the apex.** Netlify's
  [external DNS guide](https://docs.netlify.com/manage/domains/configure-domains/configure-external-dns/)
  points apex domains at `apex-loadbalancer.netlify.com` with an ALIAS,
  ANAME, or flattened CNAME (or an A record as a fallback), explains that
  the apex then cannot use direct DNS routing on its CDN, and recommends
  a subdomain as the primary domain.
- **Microsoft on dangling DNS.** Microsoft's guide
  [Prevent dangling DNS entries and avoid subdomain takeover](https://learn.microsoft.com/en-us/azure/security/fundamentals/subdomain-takeover)
  walks through the takeover sequence (a CNAME left pointing at a deleted
  resource, then claimed by an attacker) and lists the risks: lost
  control of content, harvested cookies, phishing, and valid certificates
  for the attacker.
- **Cloudflare proxy status.** Cloudflare's
  [proxy status](https://developers.cloudflare.com/dns/proxy-status/)
  documentation explains that proxied records answer with Cloudflare's
  anycast addresses instead of the origin's, that only A, AAAA, and CNAME
  records can be proxied, and that proxied records use an automatic TTL
  of 300 seconds.

**Popular tools and providers:** Vercel, Netlify, Cloudflare (DNS,
proxy, Pages, Workers), Amazon Route 53 with CloudFront, Elastic Load
Balancing, and AWS Certificate Manager, Azure DNS with Front Door, Google
Cloud DNS with Cloud Load Balancing, and Caddy or nginx with certbot on a
single server.

## How it works

### Choose one canonical host

Pick the address users and search engines should see, then send every
other variant there with a permanent redirect.

| | `www.example.com` canonical | `example.com` (apex) canonical |
|---|---|---|
| DNS record | A plain CNAME to the platform | Alias, flattened CNAME, or the platform's documented IPs |
| Traffic steering | The platform's DNS sees the user's resolver | Depends on anycast or on your DNS host's features |
| Recommended by | Vercel, and Netlify when you use external DNS | Fine on Cloudflare, Route 53 alias, or anycast platforms |
| The other name | Apex redirects to `www` | `www` redirects to the apex |

Whichever you choose, use it everywhere: in links, OAuth redirect URIs,
CORS allow lists, cookie settings, sitemaps, and the `site_url` of
static site generators. Keep APIs on their own name (`api.example.com`)
and never put a redirect in front of an API, because many HTTP clients
do not follow redirects for `POST` requests the way browsers do.

![Diagram: two request paths. Top, a visitor types www.example.com: DNS answers with a CNAME to the platform hostname, the platform's DNS returns the address of an edge near the visitor's resolver, and the edge serves TaskFlow Web over HTTPS. Bottom, a visitor types example.com: the apex has an alias or A record pointing at a redirect service, the HTTP request to http://example.com is first redirected to https://example.com on the same host, as HSTS preload requires, and the HTTPS response is a 308 permanent redirect to https://www.example.com with the path kept, which browsers cache. Both paths end at the same canonical site.](apex-and-www-routing.svg)

### Pointing names at common hosts

| Host | Subdomain (`www`, `app`) | Apex | Watch out for |
|---|---|---|---|
| Vercel | CNAME to the project-specific `vercel-dns` hostname shown in the project's Domains settings | A record with the value the dashboard shows, or Vercel's nameservers | Wildcards need Vercel's nameservers or an NS delegation of `_acme-challenge` to Vercel; a `_vercel` TXT record proves access when the domain is used by another account |
| Netlify | CNAME to the site's `netlify.app` hostname | ALIAS, ANAME, or flattened CNAME to `apex-loadbalancer.netlify.com`, or an A record fallback | Adding either the apex or `www` adds both; prefer a subdomain as primary with external DNS |
| CloudFront | CNAME to the distribution's name, such as `d111111abcdef8.cloudfront.net` | Route 53 alias `A` and `AAAA` (and optionally `HTTPS`) records; without Route 53, CloudFront's Anycast static IPs | The name must be an alternate domain name on exactly one distribution, covered by an ACM certificate in `us-east-1` |
| AWS load balancer | CNAME to the load balancer's DNS name | Route 53 alias | Never `A` records to its IPs: they change, which is why its DNS TTL is 60 seconds |
| Single server (VPS) | `A` and `AAAA` to a reserved static IP | The same | The web server must also be configured for the name, and needs its own certificate |
| Cloudflare Pages / Workers | Pages: CNAME from any DNS host | Requires Cloudflare nameservers | Workers custom domains require Cloudflare nameservers |

Always copy the exact values from the platform's dashboard: several
providers now issue per-project targets, and old blog posts contain
retired IP addresses. Details for Cloudflare's products are in the
[hosting lesson](../hosting-and-platforms/hosting-websites-and-frontends.md).

### Verification records

Before a platform serves your domain or a CA signs a certificate, it
asks for proof that you control DNS. Common forms:

| Purpose | Typical record |
|---|---|
| Hosting platform ownership | TXT at the apex or at a label such as `_vercel.example.com` |
| Azure App Service custom domain | TXT at `asuid.<subdomain>` holding the verification ID |
| AWS Certificate Manager DNS validation | CNAME from an underscore name to an `acm-validations.aws` target |
| ACME DNS-01 challenge | TXT at `_acme-challenge.<name>` (or a CNAME delegating it) |
| Email sending services | DKIM CNAMEs or TXT keys, plus SPF and return-path records |

Two rules: keep a verification record for as long as the service uses
it (ACM renewals stop working when the validation CNAME is deleted, as
[obtaining and renewing certificates](../ssl-certificates/obtaining-and-renewing-certificates.md)
explains), and record which service each one belongs to, so a later
cleanup does not guess.

### Certificates for custom domains

![Diagram: onboarding a custom domain as a sequence between you, the DNS host, the hosting platform, and the certificate authority. 1, you add app.example.com in the platform's dashboard. 2, the platform shows the records to create: a CNAME to its hostname and, if needed, a verification TXT. 3, you create them at the DNS host. 4, the platform polls DNS until both records resolve. 5, the platform requests a certificate for app.example.com from the CA. 6, the CA checks CAA, then validates control through the platform, for example with an HTTP-01 request that now reaches the platform through the CNAME. 7, the CA issues the certificate. 8, the platform serves app.example.com over HTTPS and renews the certificate automatically. A note says wildcard names need DNS-01, so the platform needs your nameservers or a delegated _acme-challenge record.](custom-domain-onboarding.svg)

Most platforms issue and renew certificates themselves once DNS points
at them. What can still go wrong is on your side:

- **CAA** must allow the platform's CA. Check it before moving a domain
  (see [domains and DNS records](domains-and-dns-records.md)).
- **Wildcards** need the DNS-01 challenge, so the platform needs your
  nameservers or a delegated `_acme-challenge` name.
- **CloudFront** needs an ACM certificate in `us-east-1` that covers
  every alternate domain name, and checks that it does before accepting
  the name.
- **Cloudflare's Universal SSL** covers the apex and first-level
  subdomains only; `pr-42.preview.example.com` needs Advanced Certificate
  Manager (Total TLS or an advanced certificate) or an uploaded
  certificate.

Termination choices and debugging are covered in
[TLS termination and troubleshooting](../ssl-certificates/tls-termination-and-troubleshooting.md).

### Wildcard subdomains and per-pull-request previews

A wildcard record such as
`*.preview.example.com CNAME preview-ingress.example.net.` sends every
preview hostname to one ingress or platform, so each pull request can
get `pr-42.preview.example.com` without a DNS change. Three subtleties:

- **DNS wildcards match only names that do not exist.** Per RFC 4592,
  `*.preview.example.com` answers for `pr-42.preview.example.com`, and
  even for deeper names whose parents do not exist, but not for a name
  that has records of its own. A name also "exists" when something below
  it has records: create `_acme-challenge.pr-42.preview.example.com` and
  the wildcard stops answering for `pr-42.preview.example.com` itself.
- **TLS wildcards cover exactly one label.** `*.preview.example.com`
  covers `pr-42.preview.example.com` but not
  `api.pr-42.preview.example.com`. Name previews with one label, such as
  `pr-42-api.preview.example.com`.
- **Previews are public by default.** Protect them with the platform's
  deployment protection or an identity proxy, keep them out of search
  engines, and point them at a staging API.

Platforms also offer this ready-made: Vercel's Preview Deployment Suffix
(Pro and Enterprise plans) replaces `vercel.app` with your domain in
preview URLs. The preview lifecycle itself is covered in
[environments and promotion](../deployment-strategies/environments-and-promotion.md).

### Redirects between the apex and www

- Use a permanent redirect: `301`, or `308` when the method and body
  must be preserved. Redirect in one hop and keep the path and query.
- Do it where it is cheapest: the platform's domain redirect setting, a
  Cloudflare redirect rule, an nginx `return 301`, or a CloudFront
  Function. A redirect service still needs a valid certificate for the
  name it redirects from.
- With HSTS preload, the order is fixed by the preload rules: redirect
  `http://example.com` to `https://example.com` first (same host), serve
  the HSTS header there with `max-age` of at least 31536000,
  `includeSubDomains`, and `preload`, then redirect to
  `https://www.example.com`. Preloading forces HTTPS on every subdomain
  and is slow to undo, so audit all subdomains first.

### Route 53 alias records

An alias record is Route 53's way to point a name at an AWS resource:

- It works at the zone apex, which a CNAME cannot.
- Route 53 answers with the resource's current addresses, so a
  load balancer can change IPs without any DNS change on your side.
- Queries to alias records that target AWS resources are not charged.
- You cannot set the TTL for an AWS target; Route 53 uses the resource's
  default (60 seconds for Elastic Load Balancing).
- To `dig`, an alias looks like an ordinary `A` or `AAAA` record. Create
  both when the target serves IPv6 (CloudFront with IPv6 enabled, a
  dual-stack load balancer).
- `evaluate_target_health` lets Route 53 skip unhealthy targets in
  routing policies such as failover, covered in
  [global traffic management](../load-balancing-and-multi-server/global-traffic-management.md).

### Cloudflare's proxy: what the orange cloud changes

![Diagram: two columns comparing a DNS-only record and a proxied record for www.example.com. DNS only, the grey cloud: DNS returns the origin's address 203.0.113.10, the browser connects straight to the origin, which terminates TLS with its own certificate and sees the real client IP; nothing filters or caches traffic; the TTL is whatever you set. Proxied, the orange cloud: DNS returns Cloudflare anycast addresses with an automatic 300-second TTL, the browser connects to the nearest Cloudflare location, which terminates TLS with an edge certificate, applies caching, WAF, and DDoS rules, and connects to the origin according to the SSL mode, where Full (strict) validates the origin certificate; the origin sees the visitor's IP in the CF-Connecting-IP header. A note says MX and TXT records are always DNS-only, only HTTP and HTTPS traffic is proxied, and a DNS-only record on the same server reveals the origin's IP.](cloudflare-proxied-vs-dns-only.svg)

| | DNS only (grey cloud) | Proxied (orange cloud) |
|---|---|---|
| DNS answer | Your origin's IP | Cloudflare anycast IPs |
| TTL | The value you set | Automatic (300 seconds) |
| TLS for visitors | Your origin's certificate | Cloudflare's edge certificate |
| Origin connection | Direct from the visitor | From Cloudflare, per the SSL/TLS mode |
| Caching, WAF, DDoS protection | None from Cloudflare | Applied |
| Visitor IP at the origin | The TCP source address | `CF-Connecting-IP` header (and `X-Forwarded-For`) |
| Protocols | Anything | HTTP and HTTPS on supported ports; other TCP or UDP needs Spectrum |
| Record types | All | Only A, AAAA, and CNAME; MX and TXT are always DNS-only |

Consequences to plan for:

- **Use Full (strict) mode.** Flexible mode connects to the origin over
  plain HTTP; if the origin redirects HTTP to HTTPS, every request loops.
  Full (strict) validates the origin's certificate (a free Cloudflare
  origin certificate works). Cloudflare's Automatic SSL/TLS setting picks
  the most secure mode the origin supports.
- **Log the right client IP.** Behind the proxy every TCP connection
  comes from Cloudflare; read `CF-Connecting-IP` (and only trust it from
  Cloudflare's address ranges).
- **Know the limits.** Request bodies are capped per plan (larger uploads
  get `413`), and an origin that does not answer within the proxy read
  timeout (125 seconds by default) produces `524`. Upload large files
  directly to object storage and move long work to background jobs.
- **Hide the origin.** A DNS-only record on the same server, an old
  record, or historical DNS data can reveal the origin's IP. Allow only
  Cloudflare's ranges (or use a tunnel), and rotate the IP if it leaked.
  Edge protection in depth is covered in
  [edge protection, WAF, DDoS and bots](../devsecops-and-cloud-security/edge-protection-waf-ddos-and-bots.md).
- **Keep mail DNS-only.** An MX target such as `mail.example.com` must
  resolve to the mail server, not to Cloudflare.

Moving nameservers to Cloudflare (a full setup) is a DNS migration; the
partial (CNAME) setup that keeps your current DNS host is available only
on Business and Enterprise plans.

### Subdomain takeover

The sequence Microsoft describes is short:

1. You create a cloud resource (a web app, a bucket website, a CDN
   endpoint) and a CNAME such as `promo.example.com` pointing at its
   provider-assigned name.
2. The campaign ends; someone deletes the resource but not the CNAME.
3. An attacker notices the dangling name, creates a resource with the
   same provider-assigned name in their own account, and now serves
   content on `promo.example.com`, with a valid certificate.

Cookies scoped to `example.com` are sent to the attacker's page, and a
dangling MX record can even receive your mail. Prevention is procedural:
remove or repoint DNS **before** deleting a resource, keep platform
verification records (they stop other accounts from attaching your
name), and regularly check that every CNAME target still exists and
belongs to you.

## When to use and when not to use

| Situation | Recommended setup |
|---|---|
| TaskFlow Web on Vercel or Netlify, DNS elsewhere | `www` CNAME as canonical; apex alias or flattened CNAME, or the documented A record; apex redirects to `www` |
| TaskFlow Web on S3 and CloudFront, DNS in Route 53 | Alias `A` and `AAAA` for the apex and `www`; redirect the non-canonical name with a CloudFront Function |
| TaskFlow API behind a load balancer | `api` alias or CNAME to the load balancer; no redirects |
| One VPS | `A` and `AAAA` to a reserved IP; Caddy or nginx with certbot |
| A CDN, WAF, and DDoS protection in front of everything | Cloudflare full setup with proxied web records and DNS-only mail records |
| Preview environment per pull request | Wildcard record plus a wildcard certificate via DNS-01, or the platform's preview domain feature |

When not to:

- Do not move a domain's nameservers to a hosting platform just to
  attach one subdomain; a CNAME is enough, and a nameserver change moves
  every record, including mail.
- Do not proxy non-HTTP services (SSH, SMTP, databases) through an HTTP
  proxy; keep those records DNS-only or use a dedicated product.
- Do not use `A` records to a platform's IPs unless the platform
  documents them as stable for that purpose.

## Practical examples

### TaskFlow Web and API in Route 53 (Terraform)

This attaches the apex and `www` to the CloudFront distribution from
[hosting websites and frontends](../hosting-and-platforms/hosting-websites-and-frontends.md)
and `api` to an Application Load Balancer.

```hcl
# infra/web/dns.tf: alias records for TaskFlow Web and TaskFlow API
data "aws_route53_zone" "main" {
  name = "example.com"
}

locals {
  web_names = toset(["example.com", "www.example.com"])
}

# IPv4 and IPv6 aliases to CloudFront for both web names
resource "aws_route53_record" "web" {
  for_each = { for pair in setproduct(local.web_names, ["A", "AAAA"]) : "${pair[0]}-${pair[1]}" => pair }

  zone_id = data.aws_route53_zone.main.zone_id
  name    = each.value[0]
  type    = each.value[1]

  alias {
    name                   = aws_cloudfront_distribution.web.domain_name
    zone_id                = aws_cloudfront_distribution.web.hosted_zone_id
    evaluate_target_health = false
  }
}

# API: alias to the load balancer; Route 53 follows its changing IPs
resource "aws_route53_record" "api" {
  for_each = toset(["A", "AAAA"]) # AAAA requires a dual-stack load balancer

  zone_id = data.aws_route53_zone.main.zone_id
  name    = "api.example.com"
  type    = each.value

  alias {
    name                   = aws_lb.api.dns_name
    zone_id                = aws_lb.api.zone_id
    evaluate_target_health = true
  }
}
```

- `setproduct` creates four records (two names times two types) from one
  resource block, keyed like `www.example.com-AAAA`.
- The distribution must list both names as aliases (its `aliases`
  argument) and carry an ACM certificate from `us-east-1` that covers
  them, or CloudFront rejects the names.
- The `zone_id` inside `alias` is the target's hosted zone (CloudFront's
  or the load balancer's), not your own zone.

### The same site on Cloudflare (Terraform, provider v5)

```hcl
# infra/cloudflare/dns.tf: proxied web records, DNS-only mail
terraform {
  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.0"
    }
  }
}

provider "cloudflare" {} # reads CLOUDFLARE_API_TOKEN from the environment

variable "zone_id" {
  type = string
}

resource "cloudflare_dns_record" "www" {
  zone_id = var.zone_id
  name    = "www.example.com"
  type    = "CNAME"
  content = "taskflow-web.cdn.example.net"
  ttl     = 1 # 1 means automatic; proxied records always use it
  proxied = true
}

resource "cloudflare_dns_record" "apex" {
  zone_id = var.zone_id
  name    = "example.com"
  type    = "CNAME" # flattened automatically at the apex
  content = "taskflow-web.cdn.example.net"
  ttl     = 1
  proxied = true
}

resource "cloudflare_dns_record" "mx" {
  zone_id  = var.zone_id
  name     = "example.com"
  type     = "MX"
  content  = "mx1.mail.example.net"
  priority = 10
  ttl      = 3600
  proxied  = false # MX records are never proxied
}
```

Create the API token with permission to edit DNS for this one zone only.
In version 5 of the provider the resource is `cloudflare_dns_record` and
`ttl` is required; older configurations use `cloudflare_record`.

### Redirects and HSTS on a single server (nginx)

```nginx
# /etc/nginx/conf.d/example.com.conf
server {
    listen 80;
    listen [::]:80;
    server_name example.com www.example.com;
    return 301 https://$host$request_uri;   # HTTPS on the same host first
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name example.com;
    ssl_certificate     /etc/letsencrypt/live/example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    return 308 https://www.example.com$request_uri;   # one hop to the canonical host
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name www.example.com;
    ssl_certificate     /etc/letsencrypt/live/example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    root /srv/taskflow-web/current;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

The certificate must cover both names
(`certbot certonly ... -d example.com -d www.example.com`). Add `preload`
to the HSTS header only after every subdomain serves HTTPS. Running
TaskFlow behind nginx on one server end to end is covered in
[running apps with systemd and nginx](../linux-server-operations/running-apps-with-systemd-and-nginx.md).

### Verifying a hookup from the command line

```bash
dig +short www.example.com CNAME            # the platform hostname you expect
dig +short example.com A                    # alias, flattened, or redirect IPs
dig +short example.com AAAA                 # a stale AAAA sends IPv6 users elsewhere

curl -sI http://example.com    | grep -iE '^(HTTP|location)'
curl -sI https://example.com   | grep -iE '^(HTTP|location|strict-transport-security)'
curl -sI https://www.example.com | grep -iE '^(HTTP|server|age)'

openssl s_client -connect www.example.com:443 -servername www.example.com </dev/null 2>/dev/null \
  | openssl x509 -noout -subject -ext subjectAltName
```

```text
; Example output for a healthy setup
HTTP/1.1 301 Moved Permanently
Location: https://example.com/
HTTP/2 308
location: https://www.example.com/
strict-transport-security: max-age=31536000; includeSubDomains
HTTP/2 200
X509v3 Subject Alternative Name:
    DNS:example.com, DNS:www.example.com
```

Check from IPv4 and IPv6 (`curl -4`, `curl -6`) as well: a forgotten
`AAAA` record is a common reason why "it works for me" while some users
reach an old server.

### Decommissioning without leaving a dangling record

1. Find every record that points at the resource:
   `dig +short promo.example.com CNAME`, and search the zone (in code)
   for the provider-assigned name.
2. Delete or repoint those records, and wait for their TTL.
3. Only then delete the resource.
4. Remove its verification records and any CAA entry no other service
   needs.
5. Watch Certificate Transparency logs for certificates issued for your
   names that you did not request.

## Best practices

- Pick one canonical host, redirect everything else to it in one hop,
  and use it consistently in configuration.
- Point names at platform hostnames (CNAME or alias), not copied IPs.
- Copy record values from the platform's dashboard, every time.
- Attach subdomains with CNAMEs; move nameservers only when you mean to
  move all DNS.
- Check CAA, IPv6 (`AAAA`), and verification records as part of every
  hosting change.
- Use Full (strict) with Cloudflare, read `CF-Connecting-IP`, and lock
  the origin to the proxy.
- Name previews with a single label under one wildcard, and protect
  them.
- Remove DNS records before deleting the resources they point to.

## In production

- **The platform dashboard says "invalid configuration".**
  *Detect:* `dig` shows extra `A` or `AAAA` records next to the CNAME, or
  a different target from the one in the dashboard. *Cause:* leftover
  records from the previous host, or values copied from old
  documentation. *Fix:* remove conflicting records and use the exact
  values the platform shows.
- **Browsers report too many redirects after enabling Cloudflare.**
  *Detect:* `curl -sI` shows a `301` to the same HTTPS URL again and
  again; the SSL/TLS mode is Flexible. *Cause:* Cloudflare fetches the
  origin over HTTP, and the origin redirects HTTP to HTTPS. *Fix:* switch
  to Full (strict) with a valid origin certificate.
- **The apex shows a certificate error while `www` works.**
  *Detect:* `openssl s_client` for the apex shows a certificate without
  `example.com` in its SAN list, or the platform shows the apex pending.
  *Cause:* the apex was never added to the platform or certificate, CAA
  blocks the CA, or an old `AAAA` points elsewhere. *Fix:* add the apex,
  fix CAA, remove stale records, and re-check over IPv4 and IPv6.
- **The origin is attacked directly although Cloudflare is in front.**
  *Detect:* origin logs show traffic from addresses outside Cloudflare's
  ranges. *Cause:* the origin IP leaked through a DNS-only record or old
  DNS data. *Fix:* firewall the origin to Cloudflare's ranges or use a
  tunnel, then rotate the IP.
- **A forgotten subdomain serves a scam page.**
  *Detect:* a Certificate Transparency alert for `promo.example.com`, or
  `dig` shows a CNAME to a resource you no longer own. *Cause:* a
  dangling CNAME was claimed by someone else. *Fix:* delete the record,
  treat it as a security incident (cookies scoped to the parent domain
  may have leaked), and add DNS removal to the decommissioning checklist.
- **Large uploads fail with 413, long reports with 524, after
  proxying.** *Detect:* Cloudflare-branded error responses in the browser
  and logs. *Cause:* the plan's request body limit and the proxy read
  timeout. *Fix:* upload directly to object storage with presigned URLs,
  and run long work asynchronously.

## Important terminology

- **Canonical host:** The one hostname users should see; the others
  redirect to it.
- **Alternate domain name:** CloudFront's term for a custom domain
  attached to a distribution.
- **Alias record:** Route 53's apex-capable pointer to an AWS resource.
- **Verification record:** A TXT or CNAME record that proves domain
  control to a platform or CA.
- **Wildcard record:** A record such as `*.preview.example.com` that
  answers for names that do not otherwise exist.
- **Proxied record:** A Cloudflare record answered with Cloudflare's
  addresses so traffic passes through its network.
- **SSL/TLS mode:** Cloudflare's setting for how it connects to the
  origin (Off, Flexible, Full, Full (strict), Strict).
- **HSTS preload:** A browser-shipped list of domains that are only ever
  contacted over HTTPS.
- **Dangling DNS record:** A record pointing at a resource that no longer
  exists or that you no longer own.
- **Subdomain takeover:** Claiming a dangling target to serve content on
  someone else's subdomain.

## Common mistakes and misconceptions

- Changing nameservers to a platform to attach one subdomain, and losing
  mail and verification records.
- Using `A` records to load balancer or platform IPs that can change.
- Forgetting the apex, or `www`, when adding a domain to a platform or a
  certificate.
- Leaving an old `AAAA` record that sends IPv6 users to a retired
  server.
- Running Cloudflare in Flexible mode with an origin that redirects to
  HTTPS.
- Assuming the proxy hides the origin while a DNS-only record on the same
  IP exists.
- Expecting `*.preview.example.com` to cover two-level names, in DNS or
  in TLS.
- Deleting cloud resources before their DNS records.

## Revision questions

1. Why do Vercel and Netlify recommend `www` as the canonical host when
   DNS is hosted elsewhere?
2. Which records would you create to put the apex and `www` of
   `example.com` on CloudFront with Route 53, and why both `A` and
   `AAAA`?
3. Why should an API hostname never sit behind an apex-to-`www`-style
   redirect?
4. A preview environment uses `*.preview.example.com`. Which of these get
   an answer and a valid wildcard certificate:
   `pr-7.preview.example.com`, `api.pr-7.preview.example.com`,
   `preview.example.com`? (DNS answers the first and, if nothing else
   exists, the second; the certificate covers only the first; the third
   is not matched by either wildcard.)
5. List four things that change when a Cloudflare record goes from
   DNS-only to proxied.
6. Explain the redirect loop caused by Flexible mode, and the fix.
7. Describe the subdomain takeover sequence and three controls that
   prevent it.
8. HSTS preload requires a specific redirect order for `example.com`.
   What is it, and why?

## Further learning

- [Vercel: Adding and configuring a custom domain](https://vercel.com/docs/domains/working-with-domains/add-a-domain)
- [Netlify: Configure external DNS for a custom domain](https://docs.netlify.com/manage/domains/configure-domains/configure-external-dns/)
- [Amazon CloudFront: Use custom URLs by adding alternate domain names](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/CNAMEs.html)
- [Cloudflare: Encryption modes](https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/)
- [Cloudflare: Proxied records limitations](https://developers.cloudflare.com/dns/proxy-status/limitations/)
- [HSTS preload list submission requirements](https://hstspreload.org/)
- [RFC 4592: The Role of Wildcards in the Domain Name System](https://www.rfc-editor.org/rfc/rfc4592)
- Next: [DNS migrations and troubleshooting](dns-migrations-and-troubleshooting.md). Back to the [domains, DNS and email overview](../domains-dns-and-email.md).
