# CDN Setup and Edge Caching

A content delivery network puts servers between TaskFlow's users and its
origins: the S3 bucket holding TaskFlow Web and the load balancer in front
of TaskFlow API. This lesson is the operator's view: configuring origins
and protecting them, designing cache keys, writing cache rules per path,
purging, origin shields and tiered caches, compression, image
optimization at the edge, putting an API behind a CDN, edge functions at
a high level, and how CloudFront, Cloudflare, Fastly, Akamai, and Bunny
differ.

The HTTP caching theory (`Cache-Control` directives, freshness,
revalidation with `ETag`, shared versus private caches) is covered in
[HTTP and CDN caching](../../../05-application-architecture/caching/http-and-cdn-caching.md),
and deploying hashed assets with the right headers and invalidations in
[deploying frontends and static sites](../deployment-strategies/deploying-frontends-and-static-sites.md).
This lesson assumes both.

## Why it matters

A well-configured CDN serves most requests from a location a few
milliseconds from the user, absorbs traffic spikes, terminates TLS close
to users, and leaves the origin handling a small fraction of the load.
A badly configured one has a 20% hit ratio, serves one user's account
page to another, floods the origin after every purge, or keeps showing
yesterday's site. Because the CDN sits in front of everything, its
configuration is production code: a wrong rule is wrong for every user
in every region at once, and the CDN itself becomes a dependency whose
outage is your outage.

## Real-world usage

- **Fastly (June 2021).** Fastly's
  [summary of the June 8 outage](https://www.fastly.com/blog/summary-of-june-8-outage)
  explains how a valid customer configuration change triggered a latent
  software bug that made 85% of its network return errors. Monitoring
  detected it within a minute and 95% of the network recovered within 49
  minutes, but every site behind those servers was down meanwhile.
- **CloudFront Origin Shield.** The
  [Origin Shield documentation](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/origin-shield.html)
  describes an extra caching layer through which all requests from
  CloudFront's caches pass, consolidating misses for the same object into
  as few as one origin request, at an extra charge.
- **Cloudflare Tiered Cache.** Cloudflare's
  [Tiered Cache documentation](https://developers.cloudflare.com/cache/how-to/tiered-cache/)
  explains that lower-tier data centers ask an upper tier before going to
  the origin, and that Smart Tiered Cache, available on all plans, picks
  the closest upper tier for each origin from latency data.
- **Fastly Instant Purge.** Fastly's post
  [Fastly Instant Purge: under 150ms for over a decade](https://www.fastly.com/blog/fastly-instant-purge-under-150ms-for-over-a-decade)
  explains why purges that reach every location in about 150
  milliseconds on average let publishers cache content until it changes
  and purge on publish.

**Popular tools and providers:** Amazon CloudFront, Cloudflare, Fastly,
Akamai, Bunny CDN, Google Cloud CDN, and Azure Front Door; `curl -I`,
CDN logs and analytics, and WebPageTest for checking behaviour.

## How it works

### The path of a request

An edge location receives the request, computes the **cache key**, and
looks it up. On a hit it answers immediately. On a miss it asks the next
tier (a regional cache or origin shield), and only if that misses too
does it ask the origin, storing the response on the way back according
to the response headers and the CDN's rules. Even uncacheable requests
benefit: TLS ends close to the user and the CDN reuses warm connections
to the origin.

![Diagram: users in three regions send 1,000,000 requests to their nearest edge locations. The edges answer 90% from cache and send 100,000 misses on to a single origin shield placed near the origin. The shield answers 80% of those from its own cache, merging simultaneous misses for the same object, and sends only 20,000 requests, 2% of the total, to the origin: TaskFlow Web's S3 bucket or the API load balancer. Responses flow back through the shield and the edges, each storing a copy according to its cache rules.](cdn-tiered-request-path.svg)

The arithmetic is worth doing for your own traffic. With an edge hit
ratio of 90% and a shield hit ratio of 80% on the remaining misses, the
origin sees `0.10 × 0.20 = 2%` of requests: 20,000 out of a million.
Without the shield, every edge location fetches each object separately,
so a new release's assets hit the origin once per location instead of
once in total.

### Origins and how to protect them

An origin is wherever the CDN fetches from on a miss: an S3 bucket, a
load balancer, a single server, or another platform. Configure:

- **HTTPS to the origin**, with a certificate that matches the name the
  CDN connects to. A mismatch shows up as `502` errors at the edge.
- **The `Host` header.** Either forward the viewer's `Host` (the origin
  must accept every public name) or let the CDN send the origin's own
  name. CloudFront's managed policy `AllViewerExceptHostHeader` exists
  for origins such as API Gateway and Lambda function URLs that expect
  their own name.
- **Timeouts and failover.** Know the CDN's origin read timeout
  (Cloudflare's proxy read timeout is 125 seconds by default and returns
  `524` when exceeded) and use origin failover groups where offered.
- **Origin lock-down.** If the origin is reachable directly, attackers
  and scrapers bypass the CDN's cache and protections. Use CloudFront's
  origin access control for S3, allow only the CDN's published address
  ranges at the load balancer or firewall, require a secret header that
  only the CDN adds, or connect through a tunnel. Edge security as a
  whole is covered in
  [edge protection, WAF, DDoS and bots](../devsecops-and-cloud-security/edge-protection-waf-ddos-and-bots.md).
- **The client's IP.** The origin sees the CDN's addresses; read the
  client IP from the CDN's header (`CF-Connecting-IP`, `X-Forwarded-For`,
  or CloudFront's viewer address header), and trust it only from the
  CDN.

### Cache keys: what makes two requests the same

![Diagram: the anatomy of a cache key for GET https://www.example.com/api/public/templates?page=2&utm_source=newsletter with Accept-Encoding br, Accept-Language en, a session Cookie, and an Authorization header. The host, the path, the page parameter, and the normalized encoding go into the cache key. The utm_source parameter is dropped from the key so newsletter links share the same entry. Accept-Language is forwarded to the origin but kept out of the key, which is only safe if the response does not depend on it. The Cookie and Authorization headers never go into a shared cache key; requests that need them bypass the cache. A warning says a value the origin uses but the key ignores serves the wrong content, and a value in the key the origin ignores only lowers the hit ratio.](cdn-cache-key-anatomy.svg)

The key decides correctness and hit ratio at the same time:

- **Include every input that changes the response**: path, the query
  parameters that matter, and headers such as `Accept-Language` only if
  the response really varies by them.
- **Exclude everything else**: tracking parameters (`utm_*`, `gclid`),
  parameter order, and high-variety headers such as `User-Agent`. Each
  unnecessary input splits one popular object into many rarely hit ones.
- **Never use session cookies or `Authorization` in a shared cache key**
  for content that differs per user; route those requests around the
  cache instead.

CloudFront separates two policies, and confusing them causes bugs: the
**cache policy** lists what goes into the key, while the **origin
request policy** lists extra values forwarded to the origin *without*
being in the key. If the origin varies its response on a value that is
forwarded but not keyed, the CDN serves the first variant to everyone.

### Cache rules per path

One distribution usually needs several behaviors. For TaskFlow:

| Path | At the edge | Headers or policy | Key |
|---|---|---|---|
| `/assets/*` | Cache for a year | `public, max-age=31536000, immutable` | Path only |
| `/` and `/index.html` | Store, revalidate every time | `no-cache` | Path only |
| `/images/*` | Cache, resize at the edge | `public, max-age=2592000` | Path plus allowed width and format |
| `/api/public/*` | Cache briefly, shared | `public, max-age=0, s-maxage=60, stale-while-revalidate=300` | Path and query |
| `/api/*` | Never cache | `private, no-store`; caching disabled at the CDN | Not cached |

![Diagram: requests arriving at the edge are routed by path pattern, most specific first. /assets/* goes to the S3 origin with a one-year immutable cache. /index.html and / go to S3 with no-cache, so the edge revalidates each time. /images/* goes to an image resizing step and is cached per allowed width and format. /api/public/* goes to the API load balancer with a 60-second shared cache and stale-while-revalidate. Everything else under /api/* goes to the load balancer with caching disabled and the Authorization header forwarded. A note says CloudFront evaluates ordered behaviors top to bottom, so /api/public/* must come before /api/*.](cdn-cache-behaviors-by-path.svg)

The CDN's own settings can override the origin's headers, which is the
source of nasty surprises. CloudFront's managed `CachingOptimized`
policy has a minimum TTL of one second, and AWS warns that a minimum
TTL above zero makes CloudFront cache responses for at least that long
*even if* the origin sends `no-cache`, `no-store`, or `private`. Never
attach such a policy to personalized API paths; use `CachingDisabled`
there.

### Headers the CDN reads and writes

| Header | Role |
|---|---|
| `Cache-Control` | Freshness for all caches; `s-maxage` targets shared caches like CDNs |
| `CDN-Cache-Control` / `Surrogate-Control` | Instructions for the CDN only (RFC 9213 and Fastly's equivalent), so browser and edge TTLs can differ |
| `Vary` | Request headers the response depends on; every value becomes a separate variant |
| `Cache-Tag` (Cloudflare), `Surrogate-Key` (Fastly), a configured header (CloudFront) | Tags for purging groups of objects |
| `Age` | Seconds the response has spent in a shared cache |
| `CF-Cache-Status`, `X-Cache` | The CDN's hit or miss verdict, useful in debugging |

Cloudflare's `CF-Cache-Status` values are worth memorizing: `HIT`,
`MISS`, `EXPIRED`, `STALE` (served because the origin was unreachable),
`UPDATING`, `REVALIDATED`, `BYPASS` (the origin response was not
cacheable), and `DYNAMIC` (the request was never eligible for caching).

### Purging and invalidation

- **Version URLs instead of purging** wherever possible; then only entry
  points (`/index.html`) need invalidating after a deploy.
- **Purge by tag** for content that appears on many URLs: tag responses
  (`Cache-Tag: template-42`) and purge the tag when the template
  changes. Cloudflare offers purge by URL, tag, prefix, hostname, and
  everything on all plans, with rate limits per plan; Fastly purges
  surrogate keys in about 150 ms on average and supports soft purges that
  mark content stale instead of deleting it; CloudFront invalidates by
  path and, when the distribution has a cache tag configuration, by tag,
  with the first 1,000 paths each month free and a wildcard counting as
  one path; Akamai's Fast Purge completes in seconds.
- **Avoid purging everything.** Every edge then misses at once and the
  origin takes the full load; tiered caching softens this but does not
  remove it.
- **Purges do not reach browsers.** Anything a browser cached with a long
  `max-age` stays there.

### Origin shield and tiered caching

| Provider | Mid-tier feature | Notes |
|---|---|---|
| CloudFront | Regional edge caches, plus Origin Shield | Choose the Origin Shield Region with the lowest latency to the origin; extra charge per request |
| Cloudflare | Tiered Cache | Smart topology on all plans; regional and custom topologies on Enterprise |
| Fastly | Shielding | Pick a shield POP near the backend; shield hits and edge misses are both counted in statistics |
| Akamai | Tiered Distribution | Interim parent servers near the origin, for cacheable content |
| Bunny | Origin Shield (and Perma-Cache) | Origin Shield at no extra cost |

A shield matters most for origins that are expensive per request (image
processing, video packaging, small servers) and for global audiences,
where many edge locations would otherwise miss separately. It adds a hop
on misses, so it helps little for content that is rarely requested or
never cacheable.

### Compression

Let the CDN compress text at the edge. On CloudFront, enable
"compress objects automatically" and both Gzip and Brotli in the cache
policy; CloudFront then compresses responses between 1,000 and
10,000,000 bytes with a compressible `Content-Type` and a `Content-Length`
header, prefers Brotli when the browser accepts both, and never
recompresses a response that already has `Content-Encoding`. Do not
compress images, video, or archives again; they are already compressed.

### Images at the edge

Image services resize and convert images on request and cache each
variant: Cloudflare Images transformations, Fastly Image Optimizer,
Akamai Image and Video Manager, Bunny Optimizer, and on AWS the
Dynamic Image Transformation for Amazon CloudFront solution (formerly
Serverless Image Handler), which you deploy into your account. Two rules
keep them cheap and safe:

- **Allow only a few sizes and formats.** Free-form width parameters let
  anyone create unlimited variants, and Cloudflare, for example, bills
  each unique transformation per month.
- **Key on the parameters you allow**, and let the service choose AVIF or
  WebP from the browser's `Accept` header rather than adding
  `Vary: Accept` yourself.

Large media files and video belong in object storage and a video
service, as covered in
[video storage and streaming](../hosting-and-platforms/video-storage-and-streaming.md).

### A CDN in front of an API

Even with caching disabled, putting TaskFlow API behind a CDN gives TLS
termination near users, connection reuse to the origin, a WAF, and DDoS
absorption. Rules for doing it safely:

- Disable caching for everything except explicitly public `GET`
  endpoints, and forward `Authorization`, cookies, and the query string
  to the origin.
- Cache public endpoints with `s-maxage` and short TTLs, never responses
  that set cookies or depend on the caller's identity.
- Check the CDN's limits: request body size, the origin timeout, and
  WebSocket support for real-time features.
- Make sure rate limiting and logging use the real client IP from the
  CDN's header.

### Edge functions

Most CDNs run small programs at the edge:

| Product | Runtime | Typical use |
|---|---|---|
| CloudFront Functions | JavaScript, viewer request and response only, sub-millisecond, no network access | Redirects, header changes, cache key normalization, token checks |
| Lambda@Edge | Node.js or Python, also origin request and response, network access | Heavier logic, calling other services, reading request bodies |
| Cloudflare Workers | JavaScript and WebAssembly in V8 isolates | Full request handling, APIs, rewriting, A/B routing |
| Fastly Compute | WebAssembly | Programmable routing and caching |
| Akamai EdgeWorkers | JavaScript | Custom logic inside Akamai's delivery |
| Bunny Edge Scripting | JavaScript | Middleware and small apps on Bunny's network |

Use them for logic that depends only on the request: redirects, header
rules, key normalization, bucketing users for experiments, and verifying
signed tokens. Keep business logic that needs the database at the
origin; a function far from its data is slower, not faster.

### Choosing a provider

| Provider | Strengths | Fits |
|---|---|---|
| CloudFront | Deep AWS integration (S3 origin access control, ACM, WAF, Route 53 alias), Origin Shield, cache tags, flat-rate plans | Origins already in AWS |
| Cloudflare | DNS, proxy, WAF, and CDN in one place; Tiered Cache and all purge types on every plan; static asset requests on Workers free | Small teams to large sites, especially when DNS moves to Cloudflare |
| Fastly | Instant purge with surrogate keys, VCL and Compute programmability, shielding | Content that changes often and must be purged precisely |
| Akamai | Very large network, Tiered Distribution, Fast Purge, media delivery products | Large enterprises and media |
| Bunny | Low prices, Origin Shield at no extra cost, Perma-Cache, Optimizer | Cost-sensitive delivery, video, small teams |

Pricing changes often and is compared in
[hosting websites and frontends](../hosting-and-platforms/hosting-websites-and-frontends.md).

## When to use and when not to use

Use a CDN when:

- Users are spread across regions or the site has heavy static assets.
- Traffic is spiky (launches, campaigns) and the origin should not see
  the spikes.
- You want TLS, WAF, and DDoS protection at the edge, even for an API.

Think twice, or keep it simple, when:

- Every response is personalized and uncacheable, and users are close to
  a single region: a CDN still helps with TLS and protection, but not
  with load.
- The team cannot yet explain its cache keys and headers; start with
  hashed assets and `no-cache` HTML, and cache API responses later.
- Data must not leave a jurisdiction and the CDN cannot restrict where it
  caches.

| Content | Strategy |
|---|---|
| Hashed static assets | Cache for a year at edge and browser; never purge |
| HTML entry points | `no-cache`; invalidate after deploys if the CDN stores it |
| Public, slowly changing API data | `s-maxage` plus `stale-while-revalidate`, tag purges on change |
| Images | Edge resizing with an allowlist of sizes |
| Per-user data | Bypass the cache; `private, no-store` |

## Practical examples

### CloudFront in front of TaskFlow Web and API (Terraform)

This extends the distribution from
[hosting websites and frontends](../hosting-and-platforms/hosting-websites-and-frontends.md)
with an API origin and per-path behaviors. Only the parts that change are
shown.

```hcl
# infra/web/cdn-api.tf: API origin, origin shield, and per-path behaviors
data "aws_cloudfront_cache_policy" "disabled" {
  name = "Managed-CachingDisabled"
}

data "aws_cloudfront_origin_request_policy" "all_viewer_except_host" {
  name = "Managed-AllViewerExceptHostHeader"
}

# Public API responses: honor the origin's s-maxage, never key on cookies
resource "aws_cloudfront_cache_policy" "public_api" {
  name        = "taskflow-public-api"
  min_ttl     = 0
  default_ttl = 0
  max_ttl     = 300

  parameters_in_cache_key_and_forwarded_to_origin {
    enable_accept_encoding_brotli = true
    enable_accept_encoding_gzip   = true

    cookies_config {
      cookie_behavior = "none"
    }
    headers_config {
      header_behavior = "none"
    }
    query_strings_config {
      query_string_behavior = "all"
    }
  }
}

resource "aws_cloudfront_distribution" "web" {
  # ... default origin (S3), default_cache_behavior, viewer_certificate as before ...

  origin {
    origin_id   = "api-alb"
    domain_name = "origin-api.example.com" # a name on the load balancer's certificate

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }

    origin_shield {
      enabled              = true
      origin_shield_region = "us-east-1" # the Region closest to the origin
    }

    custom_header {
      name  = "X-Origin-Verify"
      value = var.origin_verify_secret # the load balancer rejects requests without it
    }
  }

  # Most specific pattern first: CloudFront evaluates ordered behaviors in order
  ordered_cache_behavior {
    path_pattern             = "/api/public/*"
    target_origin_id         = "api-alb"
    viewer_protocol_policy   = "https-only"
    allowed_methods          = ["GET", "HEAD", "OPTIONS"]
    cached_methods           = ["GET", "HEAD"]
    compress                 = true
    cache_policy_id          = aws_cloudfront_cache_policy.public_api.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.all_viewer_except_host.id
  }

  ordered_cache_behavior {
    path_pattern             = "/api/*"
    target_origin_id         = "api-alb"
    viewer_protocol_policy   = "https-only"
    allowed_methods          = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods           = ["GET", "HEAD"]
    compress                 = true
    cache_policy_id          = data.aws_cloudfront_cache_policy.disabled.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.all_viewer_except_host.id
  }
}
```

- `max_ttl = 300` caps how long the origin can ask the CDN to keep a
  public API response; `min_ttl = 0` means `no-store` from the origin is
  respected.
- `AllViewerExceptHostHeader` forwards headers, cookies, and query
  strings, but sends `Host: origin-api.example.com`, which matches the
  load balancer's certificate.
- The secret header plus a load balancer rule that rejects requests
  without it (and a security group allowing only CloudFront's managed
  prefix list) keeps clients from bypassing the CDN. Store the secret in
  a secrets manager and rotate it.

### Tagging API responses for purges (Express)

```js
// src/routes/public-templates.js: cacheable at the CDN, purgeable by tag
import express from "express";
import { Templates } from "../models/templates.js";

export const router = express.Router();

router.get("/api/public/templates/:id", async (req, res) => {
  const template = await Templates.findById(req.params.id);
  if (!template) return res.status(404).json({ error: "not found" });

  // Browsers revalidate; the CDN may serve it for 60 s, and stale for 300 s while refreshing
  res.set("Cache-Control", "public, max-age=0, s-maxage=60, stale-while-revalidate=300");
  // Cloudflare reads Cache-Tag (comma-separated); Fastly uses Surrogate-Key (space-separated);
  // CloudFront reads whichever header name its cache tag configuration specifies
  res.set("Cache-Tag", `template-${template.id},templates`);
  res.json(template);
});
```

```bash
# Purge one template everywhere after it changes (Cloudflare API)
curl -s -X POST "https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/purge_cache" \
  -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
  -H "Content-Type: application/json" \
  --data '{"tags":["template-42"]}'

# CloudFront equivalents: a path, and a tag (needs a cache tag configuration)
aws cloudfront create-invalidation --distribution-id "$DIST_ID" --paths "/index.html"
aws cloudfront create-invalidation --distribution-id "$DIST_ID" --paths "#template-42"
```

Purge from the code path that changes the data (after the database
commit), not by hand, and keep the TTL as a safety net if a purge is
lost.

### Normalizing the cache key with a CloudFront Function

```js
// cloudfront/strip-tracking-params.js: viewer-request function
// For behaviors whose cache key includes all query strings
function handler(event) {
  var request = event.request;
  var query = request.querystring;
  for (var name in query) {
    if (name.indexOf("utm_") === 0 || name === "gclid" || name === "fbclid") {
      delete query[name];
    }
  }
  return request;
}
```

Newsletter links with `?utm_source=...` now share one cache entry with
everyone else. Associate the function with the viewer request event of
the `/api/public/*` behavior.

### Checking what the CDN did

```bash
curl -sI https://www.example.com/assets/index-B7x9q2Lc.js \
  | grep -iE '^(cache-control|age|x-cache|cf-cache-status)'
curl -sI https://www.example.com/api/tasks -H "Authorization: Bearer <token>" \
  | grep -iE '^(cache-control|age|x-cache|cf-cache-status)'
```

```text
; Example output (CloudFront)
cache-control: public, max-age=31536000, immutable
age: 5321
x-cache: Hit from cloudfront

cache-control: private, no-store
x-cache: Miss from cloudfront
```

The asset was served from cache and has been there for about 90
minutes; the personal API response was fetched from the origin, as it
must be. An `Age` header on a personalized response is an incident.

## Best practices

- Hash asset filenames and cache them for a year; serve HTML with
  `no-cache`.
- Send an explicit `Cache-Control` header on every response, including
  errors.
- Keep cache keys minimal but complete; strip tracking parameters and
  never key shared content on cookies or `Authorization`.
- Disable caching for personalized paths at the CDN, not only in headers,
  and never attach a minimum TTL above zero to them.
- Purge by tag from code after data changes; avoid purge-everything.
- Enable a shield or tiered cache for global audiences and expensive
  origins.
- Lock the origin so only the CDN can reach it, and log the real client
  IP from the CDN's header.
- Allowlist image sizes and formats for edge transformations.
- Treat the CDN as a dependency: monitor hit ratio, error rates, and
  origin load, and know your fallback if it fails.

## In production

- **The hit ratio is stuck at 20%.**
  *Detect:* CDN analytics show many distinct keys for the same path,
  differing by `utm_*` parameters, cookies, or `User-Agent`. *Cause:*
  unnecessary inputs in the cache key, or `Vary: User-Agent` from the
  origin. *Fix:* remove them from the key, normalize query strings, and
  stop sending high-variety `Vary` headers.
- **One user sees another user's data.**
  *Detect:* responses for a personal endpoint carry an `Age` header or a
  `HIT` status. *Cause:* the path uses a cache policy with a minimum TTL
  above zero, or the origin forgot `private, no-store`. *Fix:* treat it as
  a security incident: purge, switch the behavior to `CachingDisabled`,
  add `private, no-store`, and test that two users get different
  responses.
- **The origin falls over right after a deploy.**
  *Detect:* origin requests per second spike just after an invalidation
  of `/*`. *Cause:* purge-everything turned every edge cold at once.
  *Fix:* hash assets, invalidate only entry points, and enable a shield or
  tiered cache.
- **The edge returns 502 for the API.**
  *Detect:* CDN logs show origin TLS or connection errors; the origin
  sees no requests. *Cause:* the origin certificate does not match the
  origin domain name the CDN uses, or the origin firewall blocks the
  CDN's ranges. *Fix:* align the origin name and certificate (or the
  `Host` policy) and allow the CDN's published ranges.
- **The image bill grows every month.**
  *Detect:* unique transformations far exceed the number of images times
  the sizes you use. *Cause:* free-form width and quality parameters,
  sometimes abused by bots. *Fix:* allowlist sizes and formats and reject
  others at the edge.
- **The whole site is down while the origin is healthy.**
  *Detect:* errors come from the CDN's own error pages in many regions;
  the provider's status page reports an incident. *Cause:* a CDN outage,
  as in Fastly's 2021 incident. *Fix:* for critical sites, keep a tested
  fallback (a second CDN or a direct origin path behind a short-TTL DNS
  record) and practice switching.

## Important terminology

- **Edge location (PoP):** A CDN site that serves users nearby.
- **Origin:** The server or bucket the CDN fetches from on a miss.
- **Cache key:** The request properties that identify a cached object.
- **Cache behavior / cache rule:** The settings applied to a path
  pattern.
- **Cache policy and origin request policy:** CloudFront's split between
  values in the key and values only forwarded to the origin.
- **Origin shield / tiered cache:** A mid-tier cache that collapses edge
  misses before they reach the origin.
- **Request collapsing:** Merging simultaneous misses for the same object
  into one origin request.
- **Purge (invalidation):** Removing objects from CDN caches before they
  expire.
- **Surrogate key / cache tag:** A label on cached objects used to purge
  them as a group.
- **Soft purge:** Marking objects stale instead of deleting them, so they
  can still be served while refreshing.
- **Edge function:** Code that runs at CDN locations on requests or
  responses.

## Common mistakes and misconceptions

- Assuming a CDN speeds up everything; uncacheable responses gain only
  TLS and connection benefits.
- Including cookies, `User-Agent`, or tracking parameters in the cache
  key.
- Forwarding a header to the origin that changes the response without
  putting it in the key.
- Attaching a policy with a nonzero minimum TTL to personalized paths.
- Purging everything after each deploy instead of versioning assets.
- Leaving the origin open to direct traffic.
- Believing a purge clears browsers' caches.
- Letting arbitrary image sizes be generated on demand.

## Revision questions

1. Walk through what happens to a request on an edge miss with an origin
   shield enabled.
2. With an edge hit ratio of 95% and a shield hit ratio of 60%, what
   fraction of 20 million daily requests reaches the origin? (0.05 ×
   0.40 = 2%, so 400,000 requests.)
3. What is the difference between CloudFront's cache policy and origin
   request policy, and what goes wrong if you confuse them?
4. Why can a cache policy with a one-second minimum TTL leak personal
   data even when the origin sends `no-store`?
5. Design cache rules for `/assets/*`, `/index.html`, `/api/public/*`,
   and `/api/*` for TaskFlow, including the order of the behaviors.
6. When would you purge by tag instead of by URL, and what do Cloudflare,
   Fastly, and CloudFront call the tag header?
7. What does an edge function do well, and what should stay at the
   origin?
8. How would you keep TaskFlow Web available if its CDN had a global
   outage?

## Further learning

- [Amazon CloudFront: Control the cache key with a policy](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/controlling-the-cache-key.html)
- [Amazon CloudFront: Use managed cache policies](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-managed-cache-policies.html)
- [Amazon CloudFront: Differences between CloudFront Functions and Lambda@Edge](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/edge-functions-choosing.html)
- [Cloudflare: Purge cache](https://developers.cloudflare.com/cache/how-to/purge-cache/)
- [Cloudflare: Cloudflare cache responses](https://developers.cloudflare.com/cache/concepts/cache-responses/)
- [Fastly: Working with surrogate keys](https://www.fastly.com/documentation/guides/full-site-delivery/purging/working-with-surrogate-keys/)
- [Fastly: Shielding](https://www.fastly.com/documentation/guides/getting-started/hosts/shielding/)
- [RFC 9213: Targeted HTTP Cache Control](https://www.rfc-editor.org/rfc/rfc9213)
- Next: [email deliverability: SPF, DKIM and DMARC](email-deliverability-spf-dkim-dmarc.md). Back to the [domains, DNS and email overview](../domains-dns-and-email.md).
