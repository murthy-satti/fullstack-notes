# Domains and DNS Records

Every hostname TaskFlow uses, from `app.example.com` to the address its
password-reset emails come from, hangs off one registered domain and one
DNS zone. This lesson explains who does what in the domain system
(registrants, registrars, registries, and DNS hosts), how registration
data is published and protected, the domain lifecycle from registration
to expiry and transfer, every record type you will meet in practice, how
TTLs decide how long an answer lives, and what DNSSEC adds.

The resolution path itself (recursive resolvers, root and TLD servers,
caching) is covered in [DNS](../../01-networking-and-protocols/dns.md) in
the Networking section; this lesson builds on it from the operator's side.

## Why it matters

A domain is a single point of failure that most teams never test. If it
expires, the website, the API, inbound mail, and outbound mail all stop
at once. If someone takes over the registrar account, they control where
every name points and can pass the DNS checks certificate authorities use,
so they can obtain valid certificates for your domain. And DNS mistakes
have long tails: a wrong answer is cached by thousands of resolvers for
as long as its TTL allows, so a five-minute typo can mean an hour of
partial outage.

Records also carry security policy, not only addresses. CAA decides which
certificate authorities may issue for you, SPF and DMARC decide whether
mail claiming to be from you is accepted, and DNSSEC decides whether
validating resolvers trust your answers at all. Knowing each record's
exact rules is what separates a routine change from an incident.

## Real-world usage

- **ICANN and RDAP.** ICANN's
  [RDAP page](https://www.icann.org/rdap) explains that the Registration
  Data Access Protocol was created as the replacement for WHOIS and gives
  registration data in standardized formats. Since 28 January 2025, gTLD
  registries and registrars must provide RDAP and are, with few
  exceptions, no longer required to run WHOIS services.
- **Slack's DNSSEC rollout (2021).** In
  [The Case of the Recursive Resolvers](https://slack.engineering/what-happened-during-slacks-dnssec-rollout/),
  Slack describes how enabling DNSSEC on `slack.com` caused about 24
  hours of failures for less than 1% of users. A signing bug in how
  wildcard records were denied made some resolvers cache "nothing exists
  here", and when the team rolled back, the DS record was already cached:
  the `.com` zone asks resolvers to keep it for 24 hours, and the domain
  owner cannot shorten that.
- **Let's Encrypt and CAA.** The Let's Encrypt
  [CAA documentation](https://letsencrypt.org/docs/caa/) says it checks
  CAA records before every certificate it issues, follows CNAMEs while
  doing so, and supports the `accounturi` and `validationmethods`
  parameters that pin issuance to one ACME account or challenge type.
- **Route 53 alias records.** The Route 53 guide
  [Choosing between alias and non-alias records](https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/resource-record-sets-choosing-alias-non-alias.html)
  documents the provider-specific answer to the "no CNAME at the apex"
  rule: an alias record can sit at the zone apex, answers with the target
  resource's current IP addresses, and is not charged for queries to AWS
  resources.

**Popular tools and providers:** registrars such as Cloudflare Registrar,
Amazon Route 53 Domains, Namecheap, GoDaddy, and Gandi; DNS hosts such as
Amazon Route 53, Cloudflare DNS, Google Cloud DNS, Azure DNS, and
DNSimple; and tools such as `dig`, `delv`, `nslookup`, PowerShell's
`Resolve-DnsName`, ICANN's RDAP lookup, and DNSViz.

## How it works

### Registrant, registrar, registry, and DNS host

| Role | Who | What it does |
|---|---|---|
| Registrant | You (TaskFlow's company) | Holds the right to use `example.com`; its contact details receive renewal and transfer messages |
| Registrar | The company you pay | Registers the name with the registry, renews it, and sends your nameservers (and DS records) to the registry |
| Registry operator | The operator of `.com`, `.org`, a country code TLD, and so on | Keeps the database of names in its TLD and runs the TLD's nameservers, which publish the delegation |
| DNS host | Route 53, Cloudflare, your registrar's DNS, your own servers | Runs the authoritative nameservers that serve your zone's records |
| Recursive resolver | Your ISP, `1.1.1.1`, `8.8.8.8`, a corporate resolver | Looks up names for clients and caches the answers |

ICANN accredits registrars for generic TLDs (`.com`, `.org`, `.dev`,
`.app`, and over a thousand more), while country code TLDs (`.uk`, `.in`,
`.de`) are run by national registries with their own rules on who may
register and how transfers work. One company can be both your registrar
and your DNS host, but the two jobs stay separate: you can keep the
registration at one company and point the nameservers at another.

When you choose a domain, check the renewal price (not only the first
year), whether the TLD has residency or eligibility rules, and register
the variants you care about before launch. Never invent private
top-level domains for internal services; use a subdomain of a domain you
own, such as `internal.example.com`, so nobody else can ever register it.

### Registration data: WHOIS, RDAP, and privacy

Registries and registrars publish registration data: creation and
expiry dates, status codes, nameservers, and the registrar. RDAP returns
it as JSON over HTTPS, with a standard bootstrap file at IANA that tells
clients which server to ask for each TLD. Personal contact details are
usually redacted (data protection laws such as the GDPR pushed the
industry this way), and many registrars offer a privacy or proxy service
on top.

Two practical consequences:

- **The registrant email must be real and monitored.** Renewal notices,
  transfer approvals, and registrant verification emails go there. Some
  registries require the registrant to confirm the address, and an
  unverified contact can get the domain suspended. Use a role mailbox
  such as `domains@example.com`, never one person's inbox.
- **Monitor the expiry date like a certificate.** RDAP gives you the
  `expiration` event in machine-readable form, so a scheduled check can
  alert months ahead.

### Domain lifecycle, locks, and transfers

![Diagram: a domain lifecycle timeline. The domain is registered for one to ten years and renewed automatically if auto-renew and payment work. The registrar sends renewal notices about one month and about one week before expiry. At expiry, if not renewed, the registrar interrupts DNS resolution, often replacing the site with a parking page, while the registrant can still renew. After the registrar deletes the name, the registry holds it in a 30-day redemption grace period: DNS stays off, transfers are blocked, and only the previous registrant can restore it, usually for an extra fee. After a short pending-delete stage the name is released and anyone can register it. Below the timeline: transfers between registrars require an unlocked domain and an authorization code and are usually blocked for 60 days after registration, a previous transfer, or a change of registrant.](domain-lifecycle-timeline.svg)

ICANN's Expired Registration Recovery Policy sets the minimum rules for
generic TLDs: the registrar must send notices about a month and about a
week before expiry, interrupt the domain's DNS after it expires (while
still letting the registrant renew), and registries must offer a 30-day
redemption grace period after deletion. Registrars set their own prices
and exact windows inside those rules, so read yours before you need it.

Locks protect a domain from hijacking and mistakes. Their state shows up
as EPP status codes in RDAP:

| Status | Set by | Effect |
|---|---|---|
| `clientTransferProhibited` | Registrar (the "transfer lock" toggle) | Blocks transfers to another registrar |
| `clientUpdateProhibited` / `clientDeleteProhibited` | Registrar | Blocks changes to nameservers or contacts, and deletion |
| `serverTransferProhibited` and other `server*` codes | Registry | The same, enforced at the registry; with a registry lock, changes need an out-of-band verification |
| `redemptionPeriod`, `pendingDelete` | Registry | The domain is expired and being deleted |

Moving the registration to another registrar is a transfer: unlock the
domain, get the authorization (EPP) code from the old registrar, request
the transfer at the new one, and approve it. Typical rules, as listed in
the Route 53 transfer guide: no transfer within 60 days of registration
or a previous transfer, a 60-day lock after a change of registrant (some
registrars let you opt out before the change), and for most generic TLDs
the transfer adds a year to the registration. Two traps:

- If your old registrar also hosts your DNS for free, it may switch that
  DNS off when the transfer starts. Move DNS hosting first, then the
  registration.
- If the domain uses DNSSEC and the DNS host will change, remove the DS
  record first and wait at least a day for cached copies to expire.

### Record types

| Type | Holds | TaskFlow example |
|---|---|---|
| `A` | An IPv4 address | `api.example.com A 198.51.100.20` |
| `AAAA` | An IPv6 address | `api.example.com AAAA 2001:db8::20` |
| `CNAME` | Another name; the resolver restarts the lookup there | `app.example.com CNAME taskflow-web.cdn.example.net.` |
| `ALIAS` / `ANAME` / alias record | Provider feature: the DNS host resolves a target and answers with its addresses | `example.com` alias to a CDN distribution |
| `MX` | Priority and mail server hostname | `example.com MX 10 mx1.mail.example.net.` |
| `TXT` | Text strings: SPF, DMARC, DKIM keys, verification tokens | `_dmarc.example.com TXT "v=DMARC1; p=none; ..."` |
| `CAA` | Which certificate authorities may issue | `example.com CAA 0 issue "letsencrypt.org"` |
| `NS` | Nameservers for a zone (at the apex and at the parent) | `example.com NS ns1.dns-host.example.net.` |
| `SOA` | Zone metadata: primary server, contact, serial, timers | One per zone, managed by most providers |
| `SRV` | Priority, weight, port, and target for a service | `_mongodb._tcp.db.example.com SRV 0 0 27017 db-1.example.com.` |
| `PTR` | Reverse DNS: the name for an IP address | `20.100.51.198.in-addr.arpa PTR api.example.com.` |
| `HTTPS` / `SVCB` | Connection hints such as supported protocols | Covered in [DNS](../../01-networking-and-protocols/dns.md) |
| `DS`, `DNSKEY`, `RRSIG` | DNSSEC keys and signatures | See DNSSEC below |

#### A and AAAA

Address records are the end of every lookup. Publish `AAAA` alongside
`A` when the target supports IPv6, and point them only at addresses you
control for as long as the record exists: a static or reserved IP for a
VPS, never an address a provider can hand to someone else.

#### CNAME and its rules

A CNAME says "this name is an alias; ask for that one instead". The
rules come from the core DNS specifications (RFC 1034 and RFC 2181):

- **No other data at the same name.** A name with a CNAME cannot also
  have MX, TXT, or A records. This is why the zone apex, which must hold
  SOA and NS records, can never be a CNAME.
- **MX and NS targets must not be aliases.** Point them at names with
  real `A`/`AAAA` records.
- **A CNAME applies to every query type.** A TXT lookup for a CNAMEd name
  follows the alias, which surprises people adding verification records.
- **Chains cost time.** Each hop can be another lookup; keep chains short.

#### The apex problem: alias records and CNAME flattening

Hosting platforms and CDNs want you to point at a hostname they control,
so they can change IP addresses and steer traffic. Subdomains can do that
with a CNAME; the apex cannot. DNS hosts solve it with non-standard
features that resolve the target on the authoritative side:

- **Route 53 alias records** answer with the current addresses of an AWS
  resource (CloudFront, a load balancer, an S3 website, and others), can
  sit at the apex, and appear to clients as plain `A` or `AAAA` records.
- **Cloudflare CNAME flattening** happens automatically for a CNAME at
  the apex on all plans and for proxied records; paid plans can flatten
  every CNAME.
- **ALIAS and ANAME records** at other DNS hosts work the same way.

![Diagram: two lookups side by side. Left, www.example.com with a normal CNAME: the resolver asks the example.com nameservers, receives a CNAME to taskflow-web.cdn.example.net with a TTL of 300, asks the CDN's nameservers, and receives A records 203.0.113.50 and 203.0.113.51 chosen for the resolver's location. Right, the apex example.com with an alias or flattened CNAME: the resolver asks the example.com nameservers once; the DNS host has already resolved the CDN hostname itself and answers directly with A records, so the client never sees a CNAME and the apex can keep its SOA, NS, MX, and TXT records. Note: with flattening, the CDN's DNS sees the DNS host's resolver, not the user's, so DNS-based steering is less precise.](cname-vs-apex-flattening.svg)

Because the DNS host resolves the target from its own servers, a
platform that steers users by DNS no longer sees the user's resolver.
That is why Netlify recommends a subdomain such as `www` as the primary
domain when you use external DNS, and Vercel recommends `www` with a
CNAME so its CDN keeps more control over traffic. The apex then becomes
a redirect, as shown in
[connecting domains to hosting](connecting-domains-to-hosting.md).

#### MX: where mail for the domain goes

Each MX record has a preference (lower is tried first) and a hostname
that must have address records. Several MX records with different
preferences give fallbacks. A domain that should never receive mail
publishes a **null MX** (`MX 0 .`, RFC 7505) so senders fail fast instead
of retrying for days. `example.com` itself is a good model of a domain
that neither sends nor receives mail:

```text
$ dig +short example.com MX
0 .
$ dig +short example.com TXT
"v=spf1 -all"
$ dig +short _dmarc.example.com TXT
"v=DMARC1;p=reject;sp=reject;adkim=s;aspf=s"
```

These are the real answers for `example.com` in November 2026 (TXT
output trimmed to the SPF record): no mail exchanger, no authorized
sender, and a DMARC policy telling receivers to reject anything claiming
to come from it. Every parked or redirect-only domain you own should
publish the same three records so spammers cannot borrow it.

#### TXT: the general-purpose record

TXT records carry SPF (at the domain itself), DMARC (at `_dmarc`), DKIM
public keys (at `<selector>._domainkey`), and verification tokens from
platforms and certificate authorities. Details that matter:

- One TXT record can hold several strings of up to 255 bytes each;
  receivers join them without spaces. Long DKIM keys are split this way.
- A name can have many TXT records, but only **one** SPF record
  (`v=spf1 ...`). Two SPF records make every SPF check a permanent error.
- Some DNS consoles want quotes around the value, some add them, and some
  append the zone name to whatever you type in the name field. Always
  check the published result with `dig`.

SPF, DKIM, and DMARC are explained in depth in
[email deliverability: SPF, DKIM and DMARC](email-deliverability-spf-dkim-dmarc.md).

#### CAA: which CAs may issue

A CAA record (RFC 8659) lists the certificate authorities allowed to
issue for a name. Public CAs must check it before issuing.

```text
example.com.  CAA  0 issue "letsencrypt.org"
example.com.  CAA  0 issue "amazon.com"
example.com.  CAA  0 issuewild "letsencrypt.org"
example.com.  CAA  0 iodef "mailto:security@example.com"
```

- `issue` allows a CA for normal certificates; `issuewild` controls
  wildcard certificates, and when any `issuewild` record exists, `issue`
  records are ignored for wildcard requests.
- The CA looks for CAA at the exact name, then climbs toward the root and
  uses the first name that has any CAA records. A CAA set at
  `example.com` therefore governs `api.example.com` too, unless
  `api.example.com` has its own.
- No CAA records anywhere means any CA may issue. `issue ";"` means none
  may.
- Each CA documents its identifier: Let's Encrypt uses `letsencrypt.org`,
  and AWS Certificate Manager needs one of `amazon.com`,
  `amazontrust.com`, `awstrust.com`, or `amazonaws.com`. Cloudflare adds
  CAA records for its own CAs automatically once you create any CAA
  record, so its Universal SSL keeps renewing.
- `0 issue "letsencrypt.org; accounturi=<account-url>"` (RFC 8657)
  restricts issuance to one ACME account.

CAA is cheap protection, but it is also the classic cause of "renewal
suddenly fails after we moved hosting": the new platform's CA is not on
the list. Certificate issuance itself is covered in
[obtaining and renewing certificates](../ssl-certificates/obtaining-and-renewing-certificates.md).

#### NS and SOA

NS records appear twice: at the parent (the `.com` servers' delegation,
plus glue addresses when the nameservers are inside the zone) and at the
apex of your zone. They should match. The SOA record holds the primary
nameserver, a contact mailbox, a serial number, timers for secondary
servers, and the value used for **negative caching**: per RFC 2308, a
"no such name" answer is cached for the smaller of the SOA record's TTL
and its minimum field. Managed DNS hosts maintain SOA for you.

#### SRV and PTR

SRV records publish a service's priority, weight, port, and host under
`_service._protocol.name`. TaskFlow meets them through MongoDB: a
`mongodb+srv://db.example.com/` connection string makes the driver look
up `_mongodb._tcp.db.example.com` SRV records for the replica set members
and a TXT record on `db.example.com` for options such as `replicaSet` and
`authSource`, and it turns TLS on by default. Keep such internal names in
a private zone.

PTR records live in the reverse zones `in-addr.arpa` and `ip6.arpa`, which
belong to whoever owns the IP address. For a cloud server you set them
through the provider. Reverse DNS matters mostly for mail: Gmail requires
sending IPs to have a PTR record whose hostname resolves back to the same
IP.

### TTL: how long an answer lives

Every record has a TTL in seconds. A resolver that fetched the record may
answer from its cache until the TTL runs out, then must ask again.

| TTL | Good for | Trade-off |
|---|---|---|
| 60 to 300 s | Records you may change soon: `api`, `app`, anything before a migration | More queries, and an outage of your DNS host hurts sooner |
| 3600 s | Most stable records | A mistake lingers for up to an hour |
| 86400 s | NS, MX, and other rarely changed records | Changes take up to a day to reach everyone |

Worked example: `api.example.com` has a TTL of 3600. A resolver caches it
at 09:59:30, and you change the record at 10:00. That resolver keeps
returning the old address until 10:59:30, so the worst case is one full
TTL after the change, plus whatever applications cache on top. Lowering
the TTL helps only if you do it at least one old TTL before the change;
[DNS migrations and troubleshooting](dns-migrations-and-troubleshooting.md)
turns this into a runbook. Alias records inherit their TTL from the
target (AWS load balancers use 60 seconds), and Cloudflare proxied
records use an automatic TTL of 300 seconds.

### DNSSEC at a high level

DNSSEC adds signatures so a validating resolver can prove an answer came
from the zone owner and was not altered. It does not encrypt anything;
DNS over HTTPS or TLS does that, between client and resolver.

![Diagram: the DNSSEC chain of trust as a ladder. The root zone's key, which validating resolvers already trust, signs the root's DS record for .com. That DS record matches the .com zone's DNSKEY, which signs the .com zone's DS record for example.com. That DS record matches the example.com DNSKEY, which signs an RRSIG over each record set, such as the A records for api.example.com. A validating resolver checks every link from the trusted root key down to the RRSIG; if any link fails, for example a DS at the registry that no longer matches the zone's key after a DNS provider change, the resolver returns SERVFAIL instead of an answer, while non-validating resolvers still answer.](dnssec-chain-of-trust.svg)

- **DNSKEY** records hold the zone's public keys, **RRSIG** records hold
  signatures over each record set, and **NSEC** or **NSEC3** records
  prove that a name does not exist.
- The parent zone holds a **DS** record, a hash of your key, which you
  submit through the registrar. That link is what connects your zone to
  the chain of trust.
- If the DS at the parent and the key in your zone disagree, every
  validating resolver (and that includes the large public resolvers)
  returns `SERVFAIL`. Because the DS is cached for a day at `.com`, the
  failure outlives the fix, as Slack's incident showed.

Managed providers (Route 53, Cloudflare, Google Cloud DNS, Azure DNS)
sign the zone for you, but how much key work remains varies: Route 53,
for example, manages the zone-signing key while the key-signing key is a
customer managed key in AWS KMS that you own and rotate. Your other jobs
are publishing the DS at the registrar and planning provider migrations
around it. Enable DNSSEC for high-value domains when signing is automated
and your team has a written migration procedure.

## When to use and when not to use

| Need | Use | Avoid |
|---|---|---|
| Point a subdomain at a platform or CDN | `CNAME` to the hostname the platform gives you | Copying the platform's current IPs into `A` records |
| Point the apex at a platform, CDN, or load balancer | Alias record, flattened CNAME, the platform's documented static IPs, or a redirect to `www` | A CNAME at the apex |
| A VPS with a fixed address | `A` and `AAAA` to a reserved static IP | Ephemeral IPs that change on restart |
| A load balancer | Alias or `CNAME` to its DNS name | `A` records to its current IPs (they change) |
| A domain that sends and receives no mail | Null MX, `v=spf1 -all`, DMARC `p=reject` | Leaving it without email records |
| Restrict certificate issuance | `CAA` listing every CA you actually use | Forgetting the CA of a new hosting platform |
| Discovering a service's hosts and ports | `SRV` (for example MongoDB's `+srv` strings) | Hard-coding host lists in many clients |
| High-value domain integrity | DNSSEC with provider-managed signing | DNSSEC without a migration plan |

Do not use DNS round robin as load balancing or failover: resolvers
cache answers and DNS does not know whether a server is healthy. Use a
load balancer or health-checked DNS routing instead (see
[load balancing](../../07-servers-and-infrastructure/load-balancing.md)
and [global traffic management](../load-balancing-and-multi-server/global-traffic-management.md)).
Avoid wildcard records unless you need them: they make typos resolve and
hide missing records.

## Practical examples

### A complete zone for TaskFlow

```text
; example.com zone file (BIND format); documentation addresses only
$ORIGIN example.com.
$TTL 3600
@       IN SOA  ns1.dns-host.example.net. hostmaster.example.com. (
                2026111301 ; serial (YYYYMMDDnn)
                7200       ; refresh
                3600       ; retry
                1209600    ; expire
                300 )      ; minimum: negative-caching TTL
@       IN NS     ns1.dns-host.example.net.
@       IN NS     ns2.dns-host.example.net.

; Web: www is the primary site; the apex redirects to it
@       300  IN A      203.0.113.10        ; redirect service
@       300  IN AAAA   2001:db8::10
www     300  IN CNAME  taskflow-web.cdn.example.net.
app     300  IN CNAME  taskflow-web.cdn.example.net.

; API behind a load balancer with fixed addresses
api     60   IN A      198.51.100.20
api     60   IN AAAA   2001:db8::20

; Inbound mail and sender policy
@       IN MX     10 mx1.mail.example.net.
@       IN MX     20 mx2.mail.example.net.
@       IN TXT    "v=spf1 include:_spf.mail.example.net -all"
_dmarc  IN TXT    "v=DMARC1; p=none; rua=mailto:dmarc-reports@example.com"

; Certificates
@       IN CAA    0 issue "letsencrypt.org"
@       IN CAA    0 iodef "mailto:security@example.com"
```

- `$ORIGIN` makes unqualified names relative: `www` means
  `www.example.com.`. A name **with** a trailing dot is absolute; a name
  without one gets the origin appended, which is the source of records
  such as `mx1.example.com.example.com`.
- Record-level TTLs override `$TTL`: names you may change soon get 60 to
  300 seconds.
- The SOA minimum (300) bounds how long resolvers remember that a name
  does not exist, which matters when you create a record someone already
  looked up.

### Querying records with dig and Resolve-DnsName

```bash
dig +short api.example.com A                 # just the answer
dig +noall +answer app.example.com           # answer section with TTLs; shows the CNAME chain
dig +short example.com MX
dig +short _dmarc.example.com TXT
dig +short example.com CAA
dig example.com SOA +multiline               # serial and timers, readable
dig @ns1.dns-host.example.net api.example.com A +norecurse   # ask the authoritative server directly
```

```text
; Example output of: dig +noall +answer app.example.com
app.example.com.                300  IN  CNAME  taskflow-web.cdn.example.net.
taskflow-web.cdn.example.net.    60  IN  A      203.0.113.50
taskflow-web.cdn.example.net.    60  IN  A      203.0.113.51
```

The TTL column counts down in a resolver's cache: run the command twice a
few seconds apart and a cached answer shows a smaller number. On Windows:

```bash
Resolve-DnsName -Name app.example.com -Type A -Server 1.1.1.1
Resolve-DnsName -Name example.com -Type MX
nslookup -type=TXT _dmarc.example.com
```

### Checking registration data with RDAP

```bash
# The IANA bootstrap file says which RDAP server serves each TLD
curl -s https://data.iana.org/rdap/dns.json | jq -r '.services[] | select(.[0][] == "com") | .[1][]'

# Ask that server about the domain, keep the fields worth monitoring
curl -s https://rdap.verisign.com/com/v1/domain/example.com \
  | jq '{name: .ldhName, status, events: [.events[] | {(.eventAction): .eventDate}], dnssec: .secureDNS.delegationSigned}'
```

```text
{
  "name": "EXAMPLE.COM",
  "status": ["client delete prohibited", "client transfer prohibited", "client update prohibited"],
  "events": [
    { "registration": "1995-08-14T04:00:00Z" },
    { "expiration": "2027-08-13T04:00:00Z" },
    ...
  ],
  "dnssec": true
}
```

This is the real (trimmed) answer for `example.com` in November 2026: all
three client locks are on, the delegation is signed, and the expiry date
is machine-readable. A scheduled job that alerts when `expiration` is
less than 60 days away, for every domain you own, prevents the most
embarrassing outage in this lesson.

### Managing core records in Terraform (Route 53)

```hcl
# infra/dns/records.tf: core records for example.com in Route 53
terraform {
  required_version = ">= 1.6"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

provider "aws" {
  region = "us-east-1"
}

resource "aws_route53_zone" "main" {
  name = "example.com"
}

resource "aws_route53_record" "mx" {
  zone_id = aws_route53_zone.main.zone_id
  name    = "example.com"
  type    = "MX"
  ttl     = 3600
  records = ["10 mx1.mail.example.net.", "20 mx2.mail.example.net."]
}

# All TXT strings for one name live in ONE record set
resource "aws_route53_record" "apex_txt" {
  zone_id = aws_route53_zone.main.zone_id
  name    = "example.com"
  type    = "TXT"
  ttl     = 3600
  records = [
    "v=spf1 include:_spf.mail.example.net -all",
    "example-site-verification=<token>",
  ]
}

resource "aws_route53_record" "caa" {
  zone_id = aws_route53_zone.main.zone_id
  name    = "example.com"
  type    = "CAA"
  ttl     = 3600
  records = [
    "0 issue \"letsencrypt.org\"",
    "0 issue \"amazon.com\"",
    "0 issuewild \"letsencrypt.org\"",
    "0 iodef \"mailto:security@example.com\"",
  ]
}

output "nameservers" {
  value = aws_route53_zone.main.name_servers # give these to the registrar
}
```

- Route 53 stores one record set per name and type, so the SPF record
  and a verification token must share the `apex_txt` resource; a second
  resource for the same name and type fails.
- The `nameservers` output is what you enter at the registrar to delegate
  the domain to this zone.
- Keeping records in code gives you review, history, and a quick way to
  rebuild the zone at another provider.

### Locking down a domain

- Turn on auto-renew, keep a valid payment method, and register important
  domains for several years.
- Enable the registrar's transfer lock, and a registry lock for the main
  production domain if your registrar offers it.
- Protect the registrar and DNS accounts with MFA (security keys if
  possible), few administrators, and API tokens scoped to one zone.
- Use a role mailbox for registrant and technical contacts.
- Alert on expiry dates (RDAP), on unexpected NS or DS changes, and on
  certificates issued for your names (Certificate Transparency
  monitoring).

## Best practices

- Separate the questions "who registers the domain" and "who hosts DNS",
  and document both, with account owners.
- Manage zones as code and review every change.
- Point names at hostnames the platform controls (CNAME or alias), not at
  IP addresses you copied.
- Choose TTLs per record: short for names you may move, long for stable
  ones, and lower them a full TTL before planned changes.
- Publish null MX, `v=spf1 -all`, and DMARC `p=reject` on domains that
  send no mail.
- Keep CAA in sync with every CA your platforms use.
- Keep internal names in private zones and out of public DNS.
- Enable DNSSEC only with provider-managed signing and a migration plan.
- Verify every change with `dig` against the authoritative servers and at
  least one public resolver.

## In production

- **The whole product is down, and DNS returns a parking page.**
  *Detect:* RDAP shows an `expiration` date in the past and a status such
  as `redemptionPeriod`; the `A` record now points at the registrar's
  parking IPs. *Cause:* auto-renew was off, the card expired, or the
  renewal notices went to a former employee. *Fix:* renew immediately (or
  restore during redemption, usually with a fee), move contacts to a role
  mailbox, and add expiry alerts.
- **Certificate renewal fails with "CAA record prevents issuance".**
  *Detect:* the ACME client or the platform reports a CAA error;
  `dig example.com CAA` lists only another CA. *Cause:* a new hosting
  platform or CDN uses a CA missing from the CAA set. *Fix:* add that
  CA's identifier, and make CAA review part of every hosting change.
- **Some users get SERVFAIL, others resolve fine.**
  *Detect:* `dig example.com` returns `SERVFAIL` through a validating
  resolver but works with `dig +cd`; DNSViz shows a broken chain. *Cause:*
  the DS record at the registry does not match the zone's keys, often
  after a DNS provider change. *Fix:* publish the matching DNSKEY or
  remove the DS, then wait out the DS TTL; plan DNSSEC into migrations.
- **Mail stops arriving after a new record is added at the apex.**
  *Detect:* MX lookups now return a CNAME, or the DNS console silently
  replaced records. *Cause:* a CNAME was created at a name that also had
  MX and TXT records. *Fix:* use the provider's alias or flattening
  feature at the apex and restore the mail records.
- **A verification record "exists" but the platform cannot see it.**
  *Detect:* `dig _dmarc.example.com TXT` is empty, while
  `dig _dmarc.example.com.example.com TXT` returns the value. *Cause:*
  the console appended the zone name to a fully qualified name. *Fix:*
  enter the relative name (`_dmarc`) or add a trailing dot, and verify
  with `dig`.
- **Changed records keep returning old values for hours.**
  *Detect:* `dig @<authoritative>` shows the new value; public resolvers
  show the old one with a large remaining TTL. *Cause:* the old TTL was
  long and was not lowered beforehand. *Fix:* wait it out (flush the
  public resolvers' caches where they offer it) and lower TTLs a full TTL
  ahead next time.

## Important terminology

- **Registrant:** The holder of a domain registration.
- **Registrar:** The company that registers and renews domains with the
  registry for you.
- **Registry:** The operator of a TLD's database and nameservers.
- **Delegation:** NS records in the parent zone that point a domain at
  its authoritative nameservers.
- **Authoritative nameserver:** A server that holds a zone's records and
  answers for them.
- **Zone apex:** The domain's own name (`example.com`), which holds the
  SOA and NS records.
- **TTL:** How many seconds a resolver may cache an answer.
- **Negative caching:** Caching the fact that a name or record does not
  exist.
- **RDAP:** The JSON-over-HTTPS protocol for registration data that
  replaced WHOIS.
- **EPP status code:** A registry status such as
  `clientTransferProhibited` that shows locks and lifecycle state.
- **Redemption grace period:** A 30-day window after deletion when only
  the previous registrant can restore a gTLD domain.
- **CNAME flattening / alias record:** A DNS host feature that resolves a
  target hostname and answers with its addresses, allowed at the apex.
- **CAA:** A record listing the certificate authorities allowed to issue
  for a name.
- **DS record:** The parent zone's hash of a child zone's DNSSEC key.

## Common mistakes and misconceptions

- Treating the registrar and the DNS host as the same thing, and losing
  records when changing nameservers.
- Putting a CNAME at the apex, or next to MX and TXT records.
- Publishing two SPF records at one name.
- Copying a platform's current IP addresses into `A` records instead of
  using its hostname.
- Believing a low TTL helps a change that is already live; it must be
  lowered beforehand.
- Thinking DNSSEC encrypts DNS. It signs answers; encryption is DoH or
  DoT.
- Assuming a domain renews itself with a lapsed card or a dead contact
  email.
- Leaving CAA records unchanged when moving to a platform that uses a
  different CA.

## Revision questions

1. Describe the roles of the registrant, registrar, registry, and DNS
   host for `example.com`, and what each controls.
2. Why can the zone apex not be a CNAME, and what are three ways to point
   the apex at a CDN?
3. What three records should a domain that sends and receives no email
   publish, and why?
4. `api.example.com` has a TTL of 14400 seconds. You change it at 09:00,
   and a resolver cached it at 08:59. Until what time can that resolver
   serve the old address? (Until about 12:59, four hours after it cached
   the record.)
5. A CAA set at `example.com` lists only `letsencrypt.org`. Can AWS
   Certificate Manager issue a certificate for `api.example.com`? What
   would you change?
6. What happens to a validating resolver's answers if the DS record at
   the registry no longer matches the zone's key, and why does the fix
   take time?
7. Which EPP status codes would you expect on a well-protected production
   domain, and what does each block?
8. Why should a `mongodb+srv://` hostname's SRV and TXT records live in a
   private zone?

## Further learning

- [RFC 1035: Domain Names, Implementation and Specification](https://www.rfc-editor.org/rfc/rfc1035)
- [RFC 8659: DNS Certification Authority Authorization (CAA) Resource Record](https://www.rfc-editor.org/rfc/rfc8659)
- [RFC 7505: A "Null MX" No Service Resource Record](https://www.rfc-editor.org/rfc/rfc7505)
- [ICANN: Expired Registration Recovery Policy](https://www.icann.org/resources/pages/errp-2013-02-28-en)
- [IANA: Root Zone Database](https://www.iana.org/domains/root/db)
- [Amazon Route 53: Transferring registration for a domain to Route 53](https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/domain-transfer-to-route-53.html)
- [Cloudflare: CNAME flattening](https://developers.cloudflare.com/dns/cname-flattening/)
- Next: [connecting domains to hosting](connecting-domains-to-hosting.md). Back to the [domains, DNS and email overview](../domains-dns-and-email.md).
