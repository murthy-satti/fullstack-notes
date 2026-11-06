# Content Delivery Networks (CDNs)

## Introduction

A content delivery network (CDN) is a distributed group of servers that delivers content closer to users. CDNs commonly cache public assets such as images, stylesheets, and scripts.

## Why does it exist?

When every request travels to one distant server, network delay and origin workload can rise. A CDN can serve cached content from a nearby point of presence, reducing repeated trips to the origin.

## How does it work?

A site's configuration sends requests through the CDN. On a cache hit, it returns the stored response; on a miss, it fetches from the origin and may cache the response. Cache headers, time-to-live settings, and invalidation control freshness.

## Real-world example

A user opening a product page may download the same images as other visitors. A CDN can return cached images without asking the web server each time. Personalized account details should not be cached publicly.

## Developer perspective

Decide which paths are safe to cache and for how long. Version static filenames, such as `app.a81f.js`, or arrange invalidation. Test cache hits and misses. Related: [DNS](domains-and-dns-configuration.md) and [reverse proxies](reverse-proxy.md).

## Practical example

For `/images/logo.svg`, configure a suitable cache lifetime. A new versioned filename lets browsers and CDN edges retain the old image safely.

## Important terminology

- **Origin:** the source server or storage for content.
- **Edge/point of presence:** a CDN location serving nearby users.
- **Cache hit/miss:** whether the requested response was already cached.
- **TTL:** how long a cached item may remain fresh.
- **Purge/invalidation:** removing cached content before expiry.

## Advantages and disadvantages

CDNs can reduce latency and origin traffic. They add configuration complexity; stale content and extra costs are possible. Dynamic or private responses may not benefit.

## Common misconceptions

A CDN does not automatically speed every page: cacheability and origin response time matter. It does not replace secure application code.

## Further Learning & References

- **Official Cloudflare documentation:** [What is a CDN?](https://www.cloudflare.com/learning/cdn/what-is-a-cdn/) explains CDN locations, caching, and delivery.
- **Official AWS documentation:** [What is Amazon CloudFront?](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/Introduction.html) describes AWS CDN distributions, origins, and caching.
