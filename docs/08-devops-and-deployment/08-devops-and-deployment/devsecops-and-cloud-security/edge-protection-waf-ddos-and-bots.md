# Edge Protection: WAF, DDoS, and Bots

The edge is the first place a request meets your infrastructure: a CDN, a
global load balancer, or the provider network in front of a regional load
balancer. It is also the cheapest place to stop bad traffic, because the
provider's capacity is far larger than yours and nothing has reached your
servers yet. This lesson explains what attacks look like at each layer and
how edge services stop them.

It covers the three kinds of DDoS attack (volumetric, protocol, and
application layer), managed protection from AWS Shield, Cloudflare, Google
Cloud Armor, and Azure DDoS Protection, web application firewall (WAF)
rules from managed rule groups and the OWASP Core Rule Set, rate limiting,
bot management, origin cloaking, and example rules for TaskFlow API.
Setting up a CDN itself is covered in
[CDN setup and edge caching](../domains-dns-and-email/cdn-setup-and-edge-caching.md),
routing users to the right region in
[global traffic management](../load-balancing-and-multi-server/global-traffic-management.md),
and per-user rate limits inside the application in
[rate limiting and throttling](../../../03-backend-development/backend-concepts/rate-limiting-and-throttling.md).

## Why it matters

Attacks at the edge are fast and large. Cloudflare reported a 31.4 Tbps
attack in late 2025 that lasted 35 seconds: over before anyone could open a
dashboard, let alone change a rule. Protection against floods therefore has
to be automatic and always on.

Application-layer attacks are cheaper for the attacker and harder to spot,
because each request looks legitimate. A few thousand bots requesting
TaskFlow's search endpoint can exhaust the database without saturating any
link. The same edge that absorbs floods can also run WAF rules that block
exploit payloads (for example, the Log4Shell `${jndi:` strings that filled
logs in December 2021) while the team patches, and bot controls that stop
credential stuffing on the login page.

Cost matters too. Autoscaling can absorb a flood, but every extra request
that reaches the origin is compute, database load, and data transfer you pay
for. Requests stopped or cached at the edge cost you the least.

## Real-world usage

- **GitHub, 2018.** GitHub's
  [February 28th DDoS incident report](https://github.blog/news-insights/company-news/ddos-incident-report/)
  describes a memcached amplification attack that peaked at 1.35 Tbps and
  126.9 million packets per second, with an amplification factor of up to
  51,000x. GitHub moved its traffic to its DDoS mitigation provider's edge
  and was fully available again about ten minutes after the attack began.
- **Google Cloud, 2023.** Google's post
  [Google mitigated the largest DDoS attack to date, peaking above 398 million rps](https://cloud.google.com/blog/products/identity-security/google-cloud-mitigated-largest-ddos-attack-peaking-above-398-million-rps)
  explains the HTTP/2 "Rapid Reset" technique (CVE-2023-44487), which was
  7.5 times larger than the previous record of 46 million requests per
  second, and how global load balancing and edge capacity kept customers'
  services up.
- **Cloudflare, 2025.** The
  [2025 Q4 DDoS threat report](https://blog.cloudflare.com/ddos-threat-report-2025-q4/)
  describes a record 31.4 Tbps attack lasting 35 seconds from the
  Aisuru-Kimwolf botnet, 47.1 million DDoS attacks over 2025, and autonomous
  detection and mitigation without human involvement.
- **OWASP Core Rule Set.** The
  [OWASP CRS](https://coreruleset.org/) is the open-source rule set behind
  many WAFs: Google Cloud Armor's preconfigured rules are based on it, Azure
  WAF offers CRS 3.2 next to its own Default Rule Set, and Cloudflare offers
  an implementation as a managed ruleset. Its anomaly-scoring model is the
  standard way to tune false positives.

**Popular tools and providers:** AWS Shield Standard and Advanced, AWS WAF
with AWS Managed Rules, Bot Control, and fraud control rule groups, Amazon
CloudFront; Cloudflare DDoS protection, WAF, rate limiting rules, and bot
products; Google Cloud Armor Standard and Enterprise with Adaptive
Protection; Azure DDoS Protection and Azure WAF on Application Gateway and
Front Door; Akamai and Fastly; ModSecurity (now an OWASP project) and
Coraza running the OWASP CRS.

## How it works

### DDoS attacks by layer

| Type | Examples | What it exhausts | Where it is stopped |
|---|---|---|---|
| Volumetric (layer 3) | UDP floods, amplification through open DNS, NTP, or memcached servers | Bandwidth of links and routers | Provider backbone and anycast edge, with scrubbing |
| Protocol (layers 3 and 4) | SYN floods, fragmented packets | Connection tables in servers, load balancers, and firewalls | Edge network and load balancers (SYN cookies and proxies) |
| Application (layer 7) | HTTP floods, HTTP/2 Rapid Reset, expensive endpoints such as search, slow-request attacks | Application servers, databases, worker pools | WAF, rate limits, bot management, caching, and a resilient application |

Volumetric and protocol attacks are measured in bits and packets per
second, and only a large network can absorb them, which is why they are
handled by the provider. Application attacks are measured in requests per
second and look like real traffic, so they need rules that understand
HTTP and your application.

### Managed DDoS protection

Every major provider protects its own edge, and offers a paid tier with
more help:

| Provider | Included at no extra charge | Paid tier adds |
|---|---|---|
| AWS | Shield Standard: automatic protection against common layer 3 and 4 attacks for all AWS customers | Shield Advanced: protection for EC2 Elastic IPs, load balancers, CloudFront, Global Accelerator, and Route 53, automatic application-layer mitigation through AWS WAF, the Shield Response Team (with a Business or Enterprise support plan), and DDoS cost protection; a large fixed monthly subscription with a one-year commitment, plus data transfer fees |
| Cloudflare | Unmetered DDoS protection for layers 3 to 7 on all plans | Higher plans add WAF features, more rate limiting rules, bot management, and support |
| Google Cloud | Always-on layer 3 and 4 protection for applications behind its load balancers; Cloud Armor Standard is pay-as-you-go | Cloud Armor Enterprise (pay-as-you-go or annual): Adaptive Protection, threat intelligence, named IP lists; DDoS response support and bill protection on the annual option |
| Azure | DDoS infrastructure protection for every service with a public IP | DDoS IP Protection per protected IP, or DDoS Network Protection with rapid response support, cost protection, and a WAF discount |

The relative cost decides the choice. The included tiers cost nothing extra
and cover most attacks most applications will see. The premium tiers are a
large fixed subscription, worth it when an outage costs more than the
subscription or when expert help during an attack is needed; a small team
behind a CDN usually starts with the included protection plus a WAF.

### The edge as a pipeline

![Diagram: all requests from users, bots, and attackers pass six layers in turn; the anycast edge network absorbs volumetric floods and drops SYN floods and UDP amplification; IP reputation and geo rules block known-bad and anonymizer addresses; WAF managed rule groups and the OWASP CRS block injection and exploit payloads; rate-based rules per IP, path, or key limit floods and password guessing; bot management scores and challenges scripts and headless browsers; the edge cache serves cacheable responses with no origin load; what remains reaches the origin, which accepts traffic from the edge only, and the arrows narrow at each step.](edge-request-pipeline.svg)

Order matters for both cost and accuracy. Cheap checks (IP reputation,
rate limits) run before expensive ones, and the WAF should see a request
before the cache serves anything personalized. Each layer also labels or
logs what it saw, so later layers and humans can act on it.

### WAF rules: managed groups, custom rules, and the OWASP CRS

A web application firewall inspects layer-7 requests (method, path, query
string, headers, cookies, and the body up to a size limit) and applies
rules in priority order. Each rule has an action: **allow**, **block**,
**count** (log only), or **challenge** with a CAPTCHA or a silent browser
check.

- **Managed rule groups** are maintained by the provider or a vendor. In
  AWS WAF, the core rule set (`AWSManagedRulesCommonRuleSet`) covers common
  OWASP-style attacks, known bad inputs
  (`AWSManagedRulesKnownBadInputsRuleSet`) includes rules for Log4j JNDI
  lookups in headers, query strings, bodies, and paths, the Amazon IP
  reputation list blocks addresses AWS threat intelligence has seen
  attacking, and paid groups add Bot Control, account takeover prevention
  (ATP), account creation fraud prevention (ACFP), and an anti-DDoS group.
  Cloudflare offers its Managed Ruleset, an OWASP Core Ruleset
  implementation, and a Free Managed Ruleset on every plan; Azure WAF
  offers its Default Rule Set (DRS 2.2 is the latest) and CRS 3.2.
- **Custom rules** encode what only you know: TaskFlow's login path, its
  bulk import endpoint that accepts large bodies, the countries it never
  serves, the header its mobile app sends.

The **OWASP Core Rule Set** works by **anomaly scoring** rather than by
blocking on the first match:

![Diagram: request A, POST /api/tasks/search with the body {"q": "x' OR 1=1--"}, matches CRS rule 942100, SQL injection via libinjection, severity CRITICAL, adding 5 points at paranoia level 1; the inbound anomaly score of 5 reaches the default threshold of 5 and the request is blocked with a 403 by rule 949110; request B, GET /api/tasks from a script with no User-Agent header, matches rule 920320 at paranoia level 2, severity NOTICE, adding 2 points; its score of 2 stays below the threshold, so it is allowed and logged; paranoia level 1 is the default with few false positives, and levels 2 to 4 add stricter rules that need more exclusions.](crs-anomaly-scoring.svg)

- Each matching rule adds points by severity: CRITICAL 5, ERROR 4,
  WARNING 3, NOTICE 2.
- After all request rules run, the total is compared with the **inbound
  anomaly score threshold** (5 by default, so a single critical match
  blocks); responses have their own outbound threshold (4 by default).
- The **paranoia level** (1 to 4) selects how many rules run. Level 1, the
  default, is designed to rarely cause false positives; each higher level
  adds stricter rules and more tuning work. CRS 4 separates the blocking
  paranoia level from an optional higher detection level, so stricter
  rules can be observed in the logs before they are allowed to block.

CRS 4 is the current major version (the project publishes both a latest and
a long-term-support release), and CRS 3.3 has reached end of life. Engines
include ModSecurity, which moved to OWASP in 2024 as its original sponsor
ended commercial support, and Coraza.

### Tuning a WAF without breaking the application

A WAF that blocks real users is worse than none, because it gets switched
off. The safe rollout is the same everywhere:

1. **Deploy in count or detection mode** (AWS WAF `count`,
   ModSecurity `SecRuleEngine DetectionOnly`) and send logs to a central
   store.
2. **Read what would have been blocked** for a representative period,
   including releases and batch jobs.
3. **Fix false positives narrowly:** override one rule to `count` instead
   of disabling a group, scope a rule away from one path, or exclude one
   field. AWS WAF labels make this precise: a managed rule can be set to
   count, and a later custom rule can block requests carrying its label
   except on the one endpoint that needs it.
4. **Switch to blocking**, keep watching the block rate, and alert on
   sudden changes after deploys.

Know the inspection limits. WAFs inspect only the first part of large
request bodies and offer an "oversize handling" choice for the rest, and
AWS's core rule set blocks request bodies over 8 KB by default. Redact
sensitive fields such as the `Authorization` header from WAF logs.

### Rate limiting at the edge

Rate limits at the edge stop floods and brute force before they reach the
application; rate limits in the application enforce business rules per
user or API key. Use both.

- **Choose the key.** Per IP is the default, but many users can share one
  address (offices, mobile carriers using carrier-grade NAT), and attackers
  spread across thousands. Better keys include IP plus path, an API key or
  session header, or a TLS fingerprint where the provider supports it.
- **Know the counting model.** AWS WAF rate-based rules look back over a
  window of 60, 120, 300 (the default), or 600 seconds, accept a minimum
  limit of 10, and enforce limits approximately. Cloudflare counts per data
  center, so a client spread across locations can exceed the configured
  rate. Google Cloud Armor offers **throttle** (limit the rate) and
  **rate-based ban** (block a client for a period after it exceeds the
  threshold).
- **Limit the expensive paths most tightly:** login, password reset,
  signup, search, and exports.

A worked example shows why per-IP limits alone do not stop credential
stuffing:

```text
limit on POST /api/auth/login:   10 requests per minute per IP
one attacker IP:                 at most 10 guesses per minute    (blocked beyond)
2,000 IPs from a botnet:         2,000 x 10 = 20,000 guesses per minute
                                 = 1,200,000 guesses per hour, none of them rate limited

and the other side of the same limit:
an office of 300 people behind one NAT address shares the same 10 requests per minute
```

Distributed attacks need signals beyond the address: bot detection, login
failure rates per account, breached-password checks, and MFA.

### Bot management

Not all automation is bad. Search engine crawlers, uptime monitors, and
partners' integrations are wanted; credential stuffers, scrapers, fake
account creators, and inventory hoarders are not; AI crawlers are a policy
decision. Bot management classifies traffic using IP reputation, TLS and
HTTP fingerprints (JA3 and JA4), behavior over time, JavaScript detections
in browsers, and machine-learning models, then allows, challenges, or
blocks it.

- **AWS WAF:** Bot Control (common and targeted protection levels), ATP for
  login pages, and ACFP for signup pages, with CAPTCHA and challenge
  actions.
- **Cloudflare:** Bot Fight Mode on the Free plan, Super Bot Fight Mode on
  Pro and Business, and Bot Management for Enterprise, which exposes a bot
  score from 1 (almost certainly automated) to 99 (almost certainly human)
  and a verified-bot flag that custom rules can use.
- **Google Cloud Armor:** bot management with reCAPTCHA assessments and
  rate limiting based on reCAPTCHA exemption tokens.
- **Azure WAF:** Bot Manager rule sets that classify good, bad, and unknown
  bots.

Challenges work only for browsers. Mobile apps and API clients cannot solve
a JavaScript challenge, so API endpoints need other signals: API keys,
signed requests, attestation where available, and per-key rate limits.

### Origin cloaking: making the edge the only way in

![Diagram: users send HTTPS to the CDN edge, which applies the WAF, DDoS protection, rate limits, and bot controls and forwards to the origin load balancer with a secret header; the origin's guards are a security group that allows only the edge's managed IP list and a listener rule that requires the secret header; an attacker who found the origin's IP and sends a direct request is dropped by the security group or gets a fixed 403; the best option is no public origin at all, with a CloudFront VPC origin or Cloudflare Tunnel; origin addresses leak through old DNS records, unproxied subdomains, mail headers, and certificate logs, so assume they are known.](origin-cloaking.svg)

Every protection at the edge is optional for an attacker who can reach the
origin directly. Origin addresses leak through old DNS records, subdomains
that are not proxied, mail servers on the same host, and certificate
transparency logs, so assume the address is known and make it useless:

- **Network allowlist:** on AWS, allow the origin load balancer's security
  group to accept traffic only from the managed prefix list
  `com.amazonaws.global.cloudfront.origin-facing`. With Cloudflare,
  allow only Cloudflare's published address ranges.
- **Shared secret:** CloudFront adds a custom header with a random value,
  and the load balancer's listener forwards only requests that carry it,
  answering everything else with a fixed 403. Rotate the value like any
  secret. Cloudflare's Authenticated Origin Pulls use mutual TLS instead.
- **No public origin at all:** CloudFront VPC origins can serve from an
  internal load balancer in private subnets, and Cloudflare Tunnel connects
  outbound from the origin, which then needs no inbound ports.

For S3 origins, origin access control lets only the CloudFront
distribution read the bucket.

### Responding to an attack

1. **Confirm and classify:** is it volumetric (provider dashboards and
   network metrics), protocol, or application layer (request rate by path,
   status codes, origin latency)?
2. **Let automation work, then tighten:** lower rate limits on the targeted
   path, raise challenge levels (as a last resort, Cloudflare's Under Attack
   mode shows every visitor an interstitial check page and blocks
   suspicious traffic), block abusive autonomous systems
   or countries you do not serve, and cache what can be cached.
3. **Protect the expensive dependencies:** shed load on non-essential
   endpoints, cap autoscaling so a flood does not become a bill, and use
   the resilience patterns in
   [resilience patterns across servers](../load-balancing-and-multi-server/resilience-patterns-across-servers.md).
4. **Escalate:** contact the provider's response team if you have one, and
   run the incident as described in
   [incident response and postmortems](../monitoring-and-logging/incident-response-and-postmortems.md).

## When to use and when not to use

| Situation | Reasonable protection | Usually not needed yet |
|---|---|---|
| Static site or SPA on a CDN | Included DDoS protection, CDN caching, origin access control | A WAF with custom tuning |
| Public API with logins (TaskFlow) | Included DDoS protection, WAF with managed rules in front of the API, rate limits on auth paths, origin cloaking | Premium DDoS tier, unless outages are very costly |
| High-value target (payments, elections, gaming, large retail) | Premium DDoS tier with response team, bot management, Adaptive Protection or equivalent | Nothing: these are the services attackers pick |
| Internal tools | Identity-aware proxy, no public exposure at all | A public WAF configuration |
| API used only by mobile apps | Per-key and per-account rate limits, signed or attested requests | JavaScript challenges, which mobile clients cannot pass |

Do not put a WAF in blocking mode without a count-mode period, do not rely
on per-IP limits as the only login protection, and do not leave the origin
reachable around the edge.

## Practical examples

### A web ACL for TaskFlow API

```hcl
# infra/waf.tf: regional web ACL in front of the TaskFlow API load balancer
resource "aws_wafv2_web_acl" "api" {
  name        = "taskflow-api"
  description = "Edge rules for TaskFlow API"
  scope       = "REGIONAL"

  default_action {
    allow {}
  }

  # 1. Addresses that AWS threat intelligence has seen attacking
  rule {
    name     = "aws-ip-reputation"
    priority = 10
    override_action {
      none {}
    }
    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesAmazonIpReputationList"
        vendor_name = "AWS"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "aws-ip-reputation"
      sampled_requests_enabled   = true
    }
  }

  # 2. Core rule set; its 8 KB body rule only counts here, rule 4 decides instead
  rule {
    name     = "aws-common"
    priority = 20
    override_action {
      none {}
    }
    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"
        rule_action_override {
          name = "SizeRestrictions_BODY"
          action_to_use {
            count {}
          }
        }
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "aws-common"
      sampled_requests_enabled   = true
    }
  }

  # 3. Known bad inputs, including Log4j JNDI lookups
  rule {
    name     = "aws-known-bad-inputs"
    priority = 30
    override_action {
      none {}
    }
    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesKnownBadInputsRuleSet"
        vendor_name = "AWS"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "aws-known-bad-inputs"
      sampled_requests_enabled   = true
    }
  }

  # 4. Large bodies are blocked everywhere except the bulk import endpoint
  rule {
    name     = "large-body-except-import"
    priority = 40
    action {
      block {}
    }
    statement {
      and_statement {
        statement {
          label_match_statement {
            scope = "LABEL"
            key   = "awswaf:managed:aws:core-rule-set:SizeRestrictions_Body"
          }
        }
        statement {
          not_statement {
            statement {
              byte_match_statement {
                search_string         = "/api/tasks/import"
                positional_constraint = "STARTS_WITH"
                field_to_match {
                  uri_path {}
                }
                text_transformation {
                  priority = 0
                  type     = "NONE"
                }
              }
            }
          }
        }
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "large-body-except-import"
      sampled_requests_enabled   = true
    }
  }

  # 5. Password guessing: at most 100 login requests per IP in 5 minutes
  rule {
    name     = "login-rate-limit"
    priority = 50
    action {
      block {}
    }
    statement {
      rate_based_statement {
        limit                 = 100
        evaluation_window_sec = 300
        aggregate_key_type    = "IP"
        scope_down_statement {
          byte_match_statement {
            search_string         = "/api/auth/login"
            positional_constraint = "EXACTLY"
            field_to_match {
              uri_path {}
            }
            text_transformation {
              priority = 0
              type     = "NONE"
            }
          }
        }
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "login-rate-limit"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "taskflow-api"
    sampled_requests_enabled   = true
  }
}

resource "aws_wafv2_web_acl_association" "api" {
  resource_arn = aws_lb.api.arn
  web_acl_arn  = aws_wafv2_web_acl.api.arn
}
```

- Rules run in `priority` order, lowest first. `override_action { none {} }`
  keeps each managed group's own actions; managed groups cannot be nested
  inside other statements, which is why they sit at the top level.
- Rule 2 changes one managed rule to `count`. The rule still adds its label
  (`awswaf:managed:aws:core-rule-set:SizeRestrictions_Body`), and rule 4
  blocks labeled requests except on the import endpoint: one exception,
  everything else still protected.
- Rule 5 counts login requests per client IP over a 5-minute window and
  blocks an IP above 100 until its rate falls again.
- For a CloudFront distribution the same web ACL would use
  `scope = "CLOUDFRONT"`, be created in `us-east-1`, and be attached to the
  distribution instead of the load balancer.

### Logging WAF decisions without leaking credentials

```hcl
# infra/waf-logging.tf
resource "aws_cloudwatch_log_group" "waf" {
  name              = "aws-waf-logs-taskflow-api"   # the aws-waf-logs- prefix is required
  retention_in_days = 90
}

resource "aws_wafv2_web_acl_logging_configuration" "api" {
  resource_arn            = aws_wafv2_web_acl.api.arn
  log_destination_configs = [aws_cloudwatch_log_group.waf.arn]

  redacted_fields {
    single_header {
      name = "authorization"
    }
  }
}
```

The logs show which rule matched each request and what action it took,
which is exactly what the count-mode period needs. Redacting the
`Authorization` header keeps bearer tokens out of the log store.

### A login rate limit on Cloudflare

```json
{
  "description": "Login attempts per client IP",
  "expression": "(http.request.uri.path eq \"/api/auth/login\")",
  "action": "block",
  "ratelimit": {
    "characteristics": ["cf.colo.id", "ip.src"],
    "period": 60,
    "requests_per_period": 10,
    "mitigation_timeout": 600
  }
}
```

This is the body of a rule in the zone's `http_ratelimit` phase, created
through Cloudflare's Rulesets API. `cf.colo.id` is always part of the key,
so the count is per data center. A 60-second period with a 10-minute
mitigation timeout needs the Pro plan or higher; the Free plan allows only
10-second periods.

### A bot rule for the login page on Cloudflare

```text
# Cloudflare WAF custom rule: expression (action: Managed Challenge)
(http.request.uri.path eq "/api/auth/login" and cf.bot_management.score lt 30 and not cf.bot_management.verified_bot)
```

Requests to the login page that Bot Management scores as likely automated
(below 30), and that do not come from a verified bot, get a Managed
Challenge instead of reaching the API. Bot scores in custom rules require
Enterprise Bot Management; Pro and Business plans use Super Bot Fight Mode
settings instead.

### Running the OWASP CRS yourself

```text
# crs-setup.conf (excerpt): block at paranoia level 1 with the default thresholds
SecAction \
    "id:900000,\
    phase:1,\
    pass,\
    t:none,\
    nolog,\
    setvar:tx.blocking_paranoia_level=1"

SecAction \
    "id:900110,\
    phase:1,\
    pass,\
    t:none,\
    nolog,\
    setvar:tx.inbound_anomaly_score_threshold=5,\
    setvar:tx.outbound_anomaly_score_threshold=4"
```

These are the CRS defaults made explicit, which documents the decision.
Start the engine with `SecRuleEngine DetectionOnly`, tune exclusions from
the audit log, then switch to `SecRuleEngine On`. To observe paranoia level
2 rules without blocking on them, set `tx.detection_paranoia_level=2` while
keeping the blocking level at 1.

### Locking the origin to CloudFront

```hcl
# infra/origin-lockdown.tf
data "aws_ec2_managed_prefix_list" "cloudfront" {
  name = "com.amazonaws.global.cloudfront.origin-facing"
}

resource "aws_vpc_security_group_ingress_rule" "alb_from_cloudfront" {
  security_group_id = aws_security_group.alb.id
  prefix_list_id    = data.aws_ec2_managed_prefix_list.cloudfront.id
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
  description       = "HTTPS from CloudFront origin-facing servers only"
}
```

Combine this with the secret origin header and a listener rule that
answers requests without it with a fixed 403. The CloudFront prefix list
counts heavily against the security group rules quota, which AWS documents
as the prefix list's weight. When the load balancer can be internal, a
CloudFront VPC origin removes the public endpoint altogether.

## Best practices

- Keep the provider's included DDoS protection on everything, put a CDN or
  global load balancer in front of public services, and cache aggressively.
- Run a WAF with managed rule groups in front of every public API; add
  custom rules for your own sensitive paths.
- Roll out WAF rules in count mode first, fix false positives narrowly,
  then block; review logs after every major release.
- Rate-limit authentication, signup, password reset, search, and export
  endpoints at the edge, and per user or key in the application.
- Combine rate limits with bot management and account-level protections
  for logins; per-IP limits alone do not stop distributed attacks.
- Make the edge the only way in: allowlist the edge's addresses, require a
  secret header or mTLS, or remove the public origin entirely.
- Cap autoscaling and alert on unusual traffic, so an attack does not turn
  into an unbounded bill.
- Keep a runbook for attacks, including who can change edge rules and how
  to reach the provider's response team.

## In production

- **The site is down, but servers show normal CPU.**
  *Detect:* edge dashboards show a spike in packets or bits per second,
  and the load balancer reports connection errors. *Cause:* a volumetric or
  protocol attack saturating a component in front of the servers, often an
  origin exposed outside the CDN. *Fix:* make sure traffic flows through
  the protected edge, cloak the origin, and engage the provider's response
  team if you have a premium tier.
- **The database is overloaded by search requests from thousands of IPs.**
  *Detect:* request rate on `/api/tasks/search` jumps while other paths
  are flat; each IP sends only a few requests. *Cause:* a distributed
  layer-7 attack on an expensive endpoint. *Fix:* add a rate limit keyed
  on a better identity than IP, challenge suspected bots, cache common
  queries, and shed load on search while protecting core paths.
- **Mobile app users get 403 after a WAF change.**
  *Detect:* 403 responses from the edge rise right after a deploy; WAF
  logs show a challenge or a rule such as a missing User-Agent check
  matching the app's requests. *Cause:* a rule or challenge that assumes a
  browser. *Fix:* return the rule to count, scope it away from API paths,
  and identify app traffic with keys or signed requests.
- **Large task imports fail with 403.**
  *Detect:* WAF logs show `SizeRestrictions_BODY` blocking `POST
  /api/tasks/import`. *Cause:* the core rule set blocks bodies over 8 KB.
  *Fix:* override that rule to count and re-block by label except on the
  import path, as in the example above.
- **Attackers bypass the WAF entirely.**
  *Detect:* origin access logs show requests whose source addresses are
  not the CDN's, and they never appear in WAF logs. *Cause:* the origin is
  reachable directly. *Fix:* restrict the origin to the edge's prefix list
  and a secret header, or move it behind a VPC origin or tunnel.
- **Credential stuffing continues despite a login rate limit.**
  *Detect:* login failures are high across many accounts while each IP
  stays under the limit. *Cause:* a botnet spreading attempts across
  thousands of addresses. *Fix:* add bot detection or account takeover
  protection on the login path, per-account failure throttling, breached
  password checks, and MFA.

## Important terminology

- **DDoS:** Distributed denial of service; overwhelming a target with
  traffic from many sources.
- **Volumetric, protocol, and application-layer attacks:** Attacks that
  exhaust bandwidth, connection state, or application resources.
- **Amplification:** Spoofed requests to open servers that send much
  larger responses to the victim.
- **Anycast:** Announcing the same address from many locations so traffic
  goes to the nearest one and attacks are spread out.
- **WAF:** A web application firewall that inspects and filters HTTP
  requests.
- **Managed rule group:** A rule set maintained by a provider or vendor.
- **OWASP CRS:** The open-source Core Rule Set for WAF engines.
- **Anomaly scoring:** Adding points per matched rule and blocking above a
  threshold.
- **Paranoia level:** The CRS setting that selects how strict the active
  rules are.
- **Rate-based rule:** A rule that acts on clients exceeding a request rate.
- **Bot score:** A per-request estimate of how likely the client is
  automated.
- **Origin cloaking:** Making the origin unreachable except through the
  edge.
- **Credential stuffing:** Trying leaked username and password pairs at
  scale.

## Common mistakes and misconceptions

- Assuming autoscaling is DDoS protection; it absorbs load by spending
  money and still fails behind exhausted dependencies.
- Turning on a WAF in blocking mode on day one and switching it off after
  the first false positive.
- Disabling a whole managed rule group to fix one false positive.
- Relying on per-IP rate limits against distributed bots, or blocking
  whole offices that share one address.
- Leaving the origin reachable directly, so the edge is optional.
- Serving JavaScript challenges to API clients that cannot solve them.
- Treating the WAF as a replacement for fixing vulnerabilities; it buys
  time while you patch.

## Revision questions

1. Explain volumetric, protocol, and application-layer DDoS attacks, and
   which part of the stack stops each.
2. What does AWS Shield Standard include, and when would you pay for
   Shield Advanced or an equivalent premium tier?
3. Using the CRS defaults, will a request matching one CRITICAL rule and
   one NOTICE rule be blocked? What about a request matching only two
   NOTICE rules? (5 + 2 = 7, at or above 5, so blocked; 2 + 2 = 4, below 5,
   so allowed and logged.)
4. A login rate limit allows 10 requests per minute per IP. How many
   guesses per hour can a botnet of 2,000 addresses make without hitting
   it, and what else would you add? (2,000 x 10 x 60 = 1,200,000; bot
   detection, per-account throttling, breached-password checks, and MFA.)
5. How would you roll out a new managed rule group without breaking real
   users?
6. Why can a mobile API not rely on JavaScript challenges, and what can it
   use instead?
7. List three ways to make sure attackers cannot bypass the CDN and reach
   the origin directly.
8. Why does Cloudflare's per-data-center counting matter when you choose a
   rate limit?

## Further learning

- [AWS WAF, AWS Firewall Manager, and AWS Shield Advanced: How AWS Shield works](https://docs.aws.amazon.com/waf/latest/developerguide/ddos-overview.html)
- [AWS WAF: AWS Managed Rules rule groups list](https://docs.aws.amazon.com/waf/latest/developerguide/aws-managed-rule-groups-list.html)
- [Cloudflare: DDoS protection](https://developers.cloudflare.com/ddos-protection/)
  and [rate limiting rules](https://developers.cloudflare.com/waf/rate-limiting-rules/)
- [Google Cloud Armor overview](https://docs.cloud.google.com/armor/docs/cloud-armor-overview)
- [Azure DDoS Protection tier comparison](https://learn.microsoft.com/en-us/azure/ddos-protection/ddos-protection-sku-comparison)
- [OWASP CRS documentation: anomaly scoring](https://coreruleset.org/docs/2-how-crs-works/2-1-anomaly_scoring/)
- [Amazon CloudFront: Restrict access to Application Load Balancers](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/restrict-access-to-load-balancer.html)
- Next: [vulnerability and patch management](vulnerability-and-patch-management.md). Back to the [DevSecOps and cloud security overview](../devsecops-and-cloud-security.md).
