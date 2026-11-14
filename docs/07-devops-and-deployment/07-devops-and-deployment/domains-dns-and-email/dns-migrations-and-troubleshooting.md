# DNS Migrations and Troubleshooting

Sooner or later TaskFlow moves: the API to a new load balancer, the web
app to another platform, or the whole zone from the registrar's free DNS
to Route 53 or Cloudflare. This lesson turns DNS caching into a runbook
for changing records with zero downtime, moving a zone to a new provider
without losing mail or certificates, and handling DNSSEC during a move.
It then covers the tools for finding out what DNS is really answering
(`dig +trace`, asking authoritative servers directly, comparing public
resolvers) and a troubleshooting flow for the failures you will meet.

Record types and TTL basics are covered in
[domains and DNS records](domains-and-dns-records.md); moving traffic
between regions with health-checked DNS is covered in
[global traffic management](../load-balancing-and-multi-server/global-traffic-management.md).

## Why it matters

DNS changes are rare, so teams are out of practice, and they are
unforgiving: a wrong answer is cached by thousands of resolvers you do
not control, for as long as the TTL you set. A nameserver change that
forgets the MX records breaks inbound mail for days; a DNSSEC key that
does not match its DS record makes the whole domain unresolvable for
validating resolvers; and because the `.com` delegation is cached for
two days, there is no quick undo. The outages below show that when DNS
fails, everything behind it fails at once, including the tools you would
use to fix it.

## Real-world usage

- **Meta (October 2021).** In
  [More details about the October 4 outage](https://engineering.fb.com/2021/10/05/networking-traffic/outage-details/),
  Meta explains that when its backbone failed, its DNS servers withdrew
  their BGP route announcements because they could not reach the data
  centers. "The end result was that our DNS servers became unreachable
  even though they were still operational," which took every Meta service
  off the internet and slowed the recovery itself.
- **AWS (October 2025).** The
  [summary of the DynamoDB disruption in us-east-1](https://aws.amazon.com/message/101925/)
  describes a race condition in DynamoDB's DNS automation that left the
  regional endpoint with an empty DNS record, so clients could not
  connect. DNS was restored in under three hours, but cached answers had
  to expire before everyone recovered, and AWS disabled the automation
  worldwide until it was fixed.
- **Cloudflare 1.1.1.1 (July 2025).** The
  [incident report](https://blog.cloudflare.com/cloudflare-1-1-1-1-incident-on-july-14-2025/)
  explains how a configuration error withdrew the resolver's prefixes for
  62 minutes. Users whose devices relied only on 1.1.1.1 lost all name
  resolution: a reminder that resolvers are dependencies too, and that
  checking from several resolvers is part of every diagnosis.
- **Route 53 zone import.** The Route 53 guide on
  [importing a zone file](https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/resource-record-sets-creating-import.html)
  lists the rules that trip up migrations: at most 1,000 records per
  import, the SOA and apex NS records are ignored, names without a
  trailing dot get the zone appended (creating
  `mail.example.com.example.com`), and Route 53 cannot export zone files.

**Popular tools and providers:** `dig`, `delv`, `kdig`, `drill`,
`nslookup` and `Resolve-DnsName`, DNSViz, DNSControl and OctoDNS for DNS
as code, Terraform, and the cache flush pages of Google Public DNS and
Cloudflare's 1.1.1.1.

## How it works

### "Propagation" is cache expiry

Nothing is pushed anywhere when you change a record. The authoritative
servers serve the new data within seconds; every recursive resolver
keeps its cached copy until that copy's TTL runs out, then asks again.
Because each resolver cached the record at a different moment, users see
a mix of old and new answers until the last cached copy expires. Several
caches are involved:

| Cache | Controlled by | Typical lifetime |
|---|---|---|
| Record answers in recursive resolvers | The record's TTL | Your TTL, sometimes clamped by the resolver |
| "Does not exist" answers | SOA TTL and minimum (RFC 2308) | Often minutes to an hour |
| The delegation (NS records at the parent) | The TLD registry | 172,800 s (2 days) for `.com` |
| DS records at the parent | The TLD registry | 86,400 s (1 day) for `.com` |
| Operating system and browser caches | OS and browser | Short, but they exist |
| Application caches | The runtime and your code | Varies; long-lived processes may keep connections to old IPs |

Two consequences shape every runbook. A low TTL only helps if it was
lowered at least one *old* TTL before the change. And a nameserver
change cannot be rolled back quickly: whatever you publish at the
registry, many resolvers keep using the previous delegation for up to
two days.

### Changing a record with zero downtime

![Diagram: a timeline for moving api.example.com from an old to a new load balancer. Two days before, the TTL is lowered from 86400 to 300 seconds; for the next day, resolvers that cached the old answer still hold it for up to the old TTL. Before the change, the new target is tested with curl --resolve using the real hostname. At T0 the record is changed. During the next 300 seconds resolvers switch one by one as their cached copies expire, so both the old and new load balancers receive traffic; the old one must stay up and correct. After traffic on the old target falls to zero, plus a safety margin of a day for misbehaving caches, the TTL is raised back to 3600 and the old target is removed.](dns-record-change-timeline.svg)

1. **Lower the TTL early.** If the record's TTL is 86400, lower it to
   300 at least a day before the change (better two). Until the old TTL
   has passed, some resolvers still hold the long-lived copy.
2. **Prepare the new target fully.** It must serve the same hostname:
   certificate, virtual host or alternate domain name, firewall rules,
   and capacity.
3. **Test it before DNS points at it.** `curl --resolve` sends a real
   request with the real hostname (and SNI) to the new address.
4. **Change the record**, ideally through code review.
5. **Run old and new in parallel.** For at least one new TTL, and in
   practice until the old target's traffic reaches zero, both serve
   users. The old target must keep working (and keep its certificate).
6. **Verify** on the authoritative servers, on several public resolvers,
   over IPv4 and IPv6, and in your monitoring.
7. **Raise the TTL** again, then decommission the old target (and remove
   any DNS records that still point at it).

### Moving a zone to a new DNS provider

Changing nameservers moves *every* record at once, so the work is in
making the new provider an exact copy before anyone notices.

![Diagram: a nameserver migration from an old to a new DNS provider. Step 1, export or list every record at the old provider and import it into the new one, translating provider-specific records such as aliases. Step 2, compare the answers of both providers' nameservers for every name and type. Step 3, if DNSSEC is on, remove the DS record at the registrar and wait at least one day. Step 4, change the nameservers at the registrar. For up to two days afterwards, resolvers still holding the old .com delegation keep asking the old provider while others ask the new one, so both zones must stay identical: changes go to both, or are frozen. Step 5, after the delegation TTL plus a margin, query volume at the old provider falls to zero, the new provider can sign the zone and publish a new DS, and the old zone is deleted.](nameserver-migration-cutover.svg)

1. **Inventory everything.** Export a zone file where the old provider
   offers one, or list records through its API
   (`aws route53 list-resource-record-sets` for Route 53, which cannot
   export zone files). Include the records nobody remembers: DKIM selectors, the
   DMARC record, platform verification tokens, ACM validation CNAMEs,
   CAA, SRV, wildcards, and NS records that delegate subdomains to other
   providers.
2. **Translate provider-specific records.** Route 53 alias records,
   Cloudflare proxied records, and flattened CNAMEs have no standard zone
   file form. Recreate them with the new provider's equivalent.
3. **Import and compare.** Query the new provider's nameservers directly
   (`dig @<new-ns> ... +norecurse`) for every name and type and diff
   against the old ones (a script follows below).
4. **Handle DNSSEC first.** Either remove the DS record at the registrar
   and wait out the DS record's TTL, a day or more, before the move (the
   simple path; Route 53's domain-transfer guide asks for 24 hours), or
   use a multi-signer setup (RFC 8901) in
   which both providers' keys are published. Never change nameservers
   while a DS record points at keys the new provider does not have.
5. **Change the nameservers at the registrar.**
6. **Keep the old zone serving identical data** for at least two days
   (the `.com` delegation TTL) plus a margin; a week is common. Freeze
   changes, or apply each change to both providers, which DNS as code
   makes easy.
7. **Verify and finish.** `dig +trace` shows the new nameservers,
   query counts at the old provider fall to zero, the new provider signs
   the zone and you publish its DS, then delete the old zone.

Moving the *registration* to another registrar is a separate operation
that does not need to touch DNS; see
[domains and DNS records](domains-and-dns-records.md) for its rules.

### Asking the right server

Most DNS confusion comes from asking the wrong question. Separate three:

| Question | Command | Tells you |
|---|---|---|
| What does my zone say? | `dig @ns1.dns-host.example.net api.example.com +norecurse` | The authoritative truth, no caches involved |
| Where does the world look for my zone? | `dig +trace api.example.com` | The delegation at every level, from the root down |
| What are users getting right now? | `dig @1.1.1.1 api.example.com` (and `8.8.8.8`, `9.9.9.9`, your office resolver) | Cached answers and the TTL they have left |

Supporting tools:

- `dig +dnssec` shows signatures; `dig +cd` (checking disabled) asks a
  validating resolver to skip validation. An answer that fails normally
  but works with `+cd` is a DNSSEC problem. `delv` validates locally and
  explains why a chain fails, and DNSViz draws the chain.
- `dig -x 198.51.100.20` checks reverse DNS (PTR).
- On Windows, `Resolve-DnsName -Server 8.8.8.8 -Name api.example.com`
  and `nslookup api.example.com 8.8.8.8` do the same jobs;
  `ipconfig /flushdns` clears the local cache. On Linux with
  systemd-resolved, `resolvectl flush-caches`; on macOS,
  `sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder`.
- Google Public DNS and Cloudflare's 1.1.1.1 each have a page to flush a
  name from their own cache. That fixes those resolvers only; every other
  resolver still waits for its TTL.

### A troubleshooting flow

![Diagram: a flowchart for a name that does not resolve or resolves wrongly. First question: does an authoritative server return the right answer when asked directly with norecurse? If not, fix the zone: a typo, a record created under the zone name twice, a CNAME conflict, or a missing record. If yes, second question: does the delegation from the parent point at those servers, as dig +trace shows? If not, fix the nameservers at the registrar or the lame server. If yes, third question: do only validating resolvers return SERVFAIL while dig +cd works? If yes, it is DNSSEC: the DS record and the zone's keys disagree. If not, fourth question: do public resolvers still return the old answer with TTL remaining? If yes, wait for the TTL or flush public caches, and lower TTLs earlier next time. If not, DNS is fine and the problem is in another layer: TLS, the host's configuration, a firewall, or the application.](dns-troubleshooting-flowchart.svg)

Work from the source outward: first prove the zone is right, then the
delegation, then DNSSEC, then caches. Only when all four are clean is
the problem somewhere else; the
[troubleshooting lesson for Linux servers](../linux-server-operations/troubleshooting-cpu-memory-disk-and-network.md)
covers the network checks that come next.

### Failure patterns

| Symptom | Usual cause | How to confirm |
|---|---|---|
| Mail stops after a nameserver change | MX, SPF, or DKIM records were not copied | `dig @<new-ns> example.com MX +norecurse` is empty |
| The site works but certificate renewal fails | CAA does not list the CA, or an ACM validation CNAME was deleted | `dig example.com CAA`; the CA or ACM error message |
| The console refuses a record, or mail breaks after adding one | A CNAME at the apex or next to other records | The record list at that name |
| A record exists but nobody can find it | The zone name was appended: `_dmarc.example.com.example.com` | `dig` the doubled name |
| `SERVFAIL` for some users only | DNSSEC: DS and keys disagree | `dig +cd` works; DNSViz shows the break |
| A new subdomain is `NXDOMAIN` for some users | Negative caching of a lookup made before the record existed | The SOA minimum and TTL; it clears by itself |
| Half the answers old, half new, for days | Two delegated nameserver sets with different data | `dig @` each NS listed in `dig +trace` |
| Some clients use the old IP for hours | Long-lived processes or connection pools that resolved once | Client logs; restart or add connection max age |

## When to use and when not to use

| Change | Approach |
|---|---|
| Point one name at a new target | Lower the TTL early, test with `curl --resolve`, change, run old and new in parallel |
| Move a zone to another DNS provider | Full migration: inventory, translate, compare, DNSSEC first, keep both zones identical for the delegation TTL |
| Move only the registration | Registrar transfer; DNS does not change (move DNS first if the old registrar hosts it) |
| Survive a DNS provider outage | Two providers serving the same zone at all times, kept in sync by DNS as code, prepared in advance |
| Fail over between regions automatically | Health-checked DNS routing, covered in [global traffic management](../load-balancing-and-multi-server/global-traffic-management.md) |

When not to:

- Do not keep very low TTLs permanently "just in case". They add query
  volume and cost, and make your DNS provider's outages hit users
  sooner.
- Do not plan to "switch nameservers" during an outage: the delegation
  is cached for days. Redundant DNS must already be in place.
- Do not change nameservers, DNSSEC, and records in the same step;
  each one has its own cache and its own rollback.

## Practical examples

### Testing the new target before the switch

```bash
# Send a real request for api.example.com to the NEW load balancer's address
curl -sv --resolve api.example.com:443:198.51.100.40 \
  https://api.example.com/healthz -o /dev/null 2>&1 \
  | grep -E 'subject:|subjectAltName|HTTP/'
```

`--resolve host:port:address` overrides DNS for that one request, so TLS
uses the real server name and the request carries the real `Host`
header. A certificate or virtual host problem shows up here, not in
front of users.

### Walking the delegation with dig +trace

```text
; Example output of: dig +trace www.example.com (trimmed, documentation names)
.                    518400  IN  NS     a.root-servers.net.
com.                 172800  IN  NS     a.gtld-servers.net.
example.com.         172800  IN  NS     ns1.dns-host.example.net.
example.com.         172800  IN  NS     ns2.dns-host.example.net.
www.example.com.     300     IN  CNAME  taskflow-web.cdn.example.net.
```

Read it top to bottom: the root refers the resolver to the `.com`
servers, the `.com` servers refer it to your nameservers (this is the
delegation, cached for two days), and your nameservers answer. During a
nameserver migration the third block is what changes; if it still lists
the old provider, the registrar change has not happened or has not
reached the registry.

### What are different resolvers seeing?

```bash
for r in 1.1.1.1 8.8.8.8 9.9.9.9; do
  printf '%-8s ' "$r"
  dig +noall +answer @"$r" api.example.com A | awk '{print "ttl=" $2, $5}'
done
```

```text
; Example output a few minutes after a change
1.1.1.1  ttl=212 198.51.100.40
8.8.8.8  ttl=41 198.51.100.20
9.9.9.9  ttl=287 198.51.100.40
```

One resolver still serves the old address with 41 seconds left; it will
switch on its own. A remaining TTL far above the TTL you set means a
record or a resolver you did not expect is involved.

### Comparing two providers before a cutover

```bash
#!/usr/bin/env bash
# scripts/compare-zones.sh: diff answers from the old and new nameservers
# Usage: scripts/compare-zones.sh names.txt   (one fully qualified name per line)
set -euo pipefail
OLD_NS="ns1.old-dns.example.net"
NEW_NS="ns1.new-dns.example.net"
TYPES=(A AAAA CNAME MX TXT CAA SRV)   # apex NS and SOA differ by design

status=0
while read -r name; do
  [[ -z "$name" || "$name" == \#* ]] && continue
  for type in "${TYPES[@]}"; do
    old=$(dig +short +norecurse @"$OLD_NS" "$name" "$type" | sort)
    new=$(dig +short +norecurse @"$NEW_NS" "$name" "$type" | sort)
    if [[ "$old" != "$new" ]]; then
      printf 'DIFF %s %s\n  old: %s\n  new: %s\n' "$name" "$type" "${old:-<none>}" "${new:-<none>}"
      status=1
    fi
  done
done < "${1:?names file required}"
exit "$status"
```

Build `names.txt` from the old provider's export, including underscore
names such as `_dmarc.example.com` and `s1._domainkey.example.com`.
Expect real differences only where a provider-specific feature answers
differently by design (a proxied record returns the proxy's addresses);
every other `DIFF` is a missing or wrong record.

### One source of truth for both providers (DNSControl)

During the overlap, DNSControl can push the same records to the old and
the new provider. A `SERVICE()` with `0` as its second argument manages
records without listing that provider's nameservers in the delegation.

```js
// dns/dnsconfig.js: the same zone pushed to the old and the new provider
D("example.com", REGISTRAR("none"),
  SERVICE("old_dns"),     // currently delegated: serves real traffic
  SERVICE("new_dns", 0),  // kept identical, not delegated yet
  DefaultTTL(300),
  A("api", "198.51.100.20"),
  AAAA("api", "2001:db8::20"),
  CNAME("www", "taskflow-web.cdn.example.net."),
  MX("@", 10, "mx1.mail.example.net."),
  MX("@", 20, "mx2.mail.example.net."),
  TXT("@", "v=spf1 include:_spf.mail.example.net -all"),
  TXT("_dmarc", "v=DMARC1; p=none; rua=mailto:dmarc-reports@example.com"),
  CAA("@", "issue", "letsencrypt.org"),
);
```

```json
{
  "none": { "TYPE": "NONE" },
  "old_dns": {
    "TYPE": "ROUTE53",
    "KeyId": "$AWS_ACCESS_KEY_ID",
    "SecretKey": "$AWS_SECRET_ACCESS_KEY",
    "Token": "$AWS_SESSION_TOKEN"
  },
  "new_dns": {
    "TYPE": "CLOUDFLAREAPI",
    "accountid": "$CLOUDFLARE_ACCOUNT_ID",
    "apitoken": "$CLOUDFLARE_API_TOKEN"
  }
}
```

The second file is `dns/creds.json`; values starting with `$` are read
from environment variables, so no secret is committed.
`dnscontrol preview` prints the changes for each provider and
`dnscontrol push` applies them. On the cutover day you change the nameservers at the
registrar, swap the `0` to the old provider's `SERVICE()`, and after the
overlap remove it.

### Running DNS changes through CI

```yaml
# .github/workflows/dns.yml
name: DNS

on:
  pull_request:
    paths: ["dns/**"]
  push:
    branches: [main]
    paths: ["dns/**"]

permissions:
  contents: read
  id-token: write   # OIDC for AWS

concurrency:
  group: dns
  cancel-in-progress: false

jobs:
  dns:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7

      - uses: aws-actions/configure-aws-credentials@v6
        with:
          role-to-assume: arn:aws:iam::123456789012:role/taskflow-dns
          aws-region: us-east-1

      - name: Preview DNS changes
        run: |
          docker run --rm -v "$PWD/dns:/dns" \
            -e AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY -e AWS_SESSION_TOKEN \
            -e CLOUDFLARE_ACCOUNT_ID -e CLOUDFLARE_API_TOKEN \
            ghcr.io/dnscontrol/dnscontrol preview
        env:
          CLOUDFLARE_ACCOUNT_ID: ${{ vars.CLOUDFLARE_ACCOUNT_ID }}
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_DNS_TOKEN }}

      - name: Push DNS changes
        if: github.event_name == 'push'
        run: |
          docker run --rm -v "$PWD/dns:/dns" \
            -e AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY -e AWS_SESSION_TOKEN \
            -e CLOUDFLARE_ACCOUNT_ID -e CLOUDFLARE_API_TOKEN \
            ghcr.io/dnscontrol/dnscontrol push
        env:
          CLOUDFLARE_ACCOUNT_ID: ${{ vars.CLOUDFLARE_ACCOUNT_ID }}
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_DNS_TOKEN }}
```

- Pull requests get a preview, so reviewers see exactly which records
  change at each provider; only merges to `main` push.
- AWS credentials come from OIDC (`configure-aws-credentials` exports
  short-lived keys as environment variables); the Cloudflare token is
  scoped to DNS edits on this zone. Short-lived credentials and OIDC are
  covered in
  [pipeline and supply chain security](../ci-cd/pipeline-and-supply-chain-security.md).
- `concurrency` stops two pushes from racing each other.
- The image is shown untagged, as in DNSControl's documentation; in a
  real pipeline pin it to a release tag or digest so a new DNSControl
  version cannot change behaviour unreviewed.

## Best practices

- Manage zones as code and review every change; keep an export of each
  zone outside the provider.
- Lower TTLs at least one old TTL before planned changes, and raise them
  afterwards.
- Test new targets with `curl --resolve` before changing DNS.
- Keep old targets serving until their traffic is gone.
- For nameserver moves: inventory, translate, diff, handle DNSSEC first,
  and keep both zones identical for at least the delegation TTL.
- Diagnose from the source outward: authoritative answer, delegation,
  DNSSEC, caches, then other layers.
- Check from several resolvers and over IPv4 and IPv6.
- Prepare secondary DNS before you need it; it cannot be added in the
  middle of an outage.

## In production

- **Inbound mail disappears after moving DNS to a new provider.**
  *Detect:* senders' bounces or a drop in received mail;
  `dig @<new-ns> example.com MX +norecurse` returns nothing.
  *Cause:* only web records were copied before the nameserver change.
  *Fix:* add the MX, SPF, DKIM, and DMARC records at the new provider
  immediately; diff every name and type before future cutovers.
- **The domain returns SERVFAIL for many users right after a move.**
  *Detect:* validating resolvers fail, `dig +cd` succeeds, DNSViz shows a
  DS without a matching DNSKEY. *Cause:* the DS record at the registrar
  still points at the old provider's key. *Fix:* remove the DS (or add the
  new provider's key) and wait for the cached DS to expire; next time,
  remove DS a day before the move.
- **Half the users get old answers days after an edit.**
  *Detect:* `dig +trace` lists nameservers from two providers, and they
  answer differently. *Cause:* the old provider's zone is still delegated
  (or cached as delegated) and was not updated. *Fix:* apply the change to
  both providers until the old delegation has expired everywhere.
- **The cutover went fine, but the API still gets traffic on the old
  load balancer.** *Detect:* the old target's request count stays above
  zero long after the TTL. *Cause:* clients with connection pools or DNS
  caches that resolved once (long-running workers, mobile apps). *Fix:*
  keep the old target up longer, set a maximum connection age on clients,
  and restart long-lived workers.
- **A freshly created subdomain is NXDOMAIN for some people.**
  *Detect:* authoritative servers answer, some resolvers say the name
  does not exist. *Cause:* those resolvers looked it up before it existed
  and cached the negative answer. *Fix:* wait out the negative TTL (the SOA
  minimum), flush the public resolvers you can, and create records before
  announcing them.
- **Certificate renewals fail after the DNS move.**
  *Detect:* ACM shows renewal pending, or the ACME client reports a CAA
  or validation error. *Cause:* the ACM validation CNAME or a CAA entry was
  left behind. *Fix:* restore the record, and include underscore names in
  every inventory.

## Important terminology

- **Propagation:** The informal name for resolvers' caches expiring at
  different times after a change.
- **Delegation TTL:** How long resolvers cache the parent's NS records
  for your zone (two days at `.com`).
- **Negative caching:** Caching the answer that a name does not exist.
- **Authoritative answer:** An answer from a server that holds the zone,
  marked with the `aa` flag in `dig` output.
- **Lame delegation:** A nameserver listed in the delegation that does
  not actually serve the zone.
- **`dig +trace`:** Resolving a name step by step from the root, showing
  each delegation.
- **`--resolve` (curl):** Overriding DNS for one request to test a target
  with the real hostname.
- **Multi-signer DNSSEC:** Two providers serving one signed zone with both
  sets of keys published (RFC 8901).
- **DNS as code:** Managing zones in version-controlled files applied by
  tools such as DNSControl, OctoDNS, or Terraform.

## Common mistakes and misconceptions

- Believing "DNS propagation takes 48 hours" for every change; ordinary
  record changes take one TTL, while nameserver changes are bounded by
  the delegation TTL.
- Lowering the TTL at the same moment as the change.
- Copying only web records when changing nameservers, forgetting MX,
  TXT, DKIM, CAA, and validation records.
- Changing nameservers while a DS record points at the old provider's
  keys.
- Testing only from one's own laptop, whose resolver may have been
  flushed or may have just cached the new answer.
- Shutting down the old target as soon as DNS is changed.
- Expecting to switch DNS providers quickly during an outage.

## Revision questions

1. Why is "propagation" a misleading word? What actually happens after
   you change a record?
2. A record has a TTL of 86400. You plan to change it on Thursday at
   10:00. When must you lower the TTL, and to what? (By Wednesday 10:00 at
   the latest, so every cached copy of the long TTL has expired; 300
   seconds is typical.)
3. Why must the old zone stay identical for about two days after a `.com`
   nameserver change, and what sets that number?
4. Describe the safe order of steps for moving a DNSSEC-signed zone to a
   new provider.
5. Which three questions separate "zone wrong", "delegation wrong", and
   "caches stale", and which commands answer each?
6. A domain fails with SERVFAIL on 8.8.8.8 but resolves with `dig +cd`.
   What do you suspect, and what tool shows the broken link?
7. Why test a new target with `curl --resolve` rather than by editing
   DNS and waiting?
8. Your DNS provider is down. Why can you not simply switch the
   nameservers to another provider, and what should have been prepared?

## Further learning

- [RFC 2308: Negative Caching of DNS Queries](https://www.rfc-editor.org/rfc/rfc2308)
- [RFC 8901: Multi-Signer DNSSEC Models](https://www.rfc-editor.org/rfc/rfc8901)
- [Amazon Route 53: Making Route 53 the DNS service for an existing domain](https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/MigratingDNS.html)
- [DNSControl documentation](https://docs.dnscontrol.org/)
- [DNSViz](https://dnsviz.net/)
- [Google Public DNS: Flush cache](https://developers.google.com/speed/public-dns/cache)
- [Cloudflare 1.1.1.1: Purge cache](https://one.one.one.one/purge-cache/)
- Next: [CDN setup and edge caching](cdn-setup-and-edge-caching.md). Back to the [domains, DNS and email overview](../domains-dns-and-email.md).
