# Incremental Static Regeneration (ISR)

Incremental Static Regeneration is a way to reuse statically generated route
output while allowing it to be refreshed without rebuilding the entire site.
It is useful for public pages that need both fast cached delivery and
eventual freshness.

This lesson describes the App Router ISR model **without Cache Components**.
Projects using the `cacheComponents` option follow a different caching model
and should use the current
[ISR with Cache Components guide](https://nextjs.org/docs/app/guides/incremental-static-regeneration-cache-components).

## The basic lifecycle

1. Next.js generates or caches a route's output.
2. Requests receive the cached result while it is valid.
3. A time-based policy or an explicit invalidation marks data or route output
   for refresh.
4. Regeneration happens according to the framework's cache strategy.
5. A subsequent response can use the refreshed result.

Do not assume the first request after a timer always waits for regeneration.
Stale-while-revalidate behavior, errors, and cache coordination vary by
version and hosting platform.

## Time-based revalidation

With the traditional App Router data-cache model, a fetch can specify a
revalidation interval in seconds:

```tsx
const response = await fetch("https://example.com/api/articles", {
  next: { revalidate: 3600 },
});
```

In route-segment configurations supported by the project version, a route can
also declare an interval:

```ts
export const revalidate = 3600;
```

An interval is a freshness threshold, not a precise scheduled timer that
rebuilds output when no one is requesting it. Confirm the current caching
model and whether the selected deployment adapter supports the configuration.
Some newer Next.js modes use explicit cache directives or different
revalidation APIs.

## Event-based or on-demand revalidation

When content changes—for example, a CMS publishes an article—the application
can invalidate a matching route or cache tag from a trusted server-side
workflow. In the App Router, APIs such as `revalidatePath` and
`revalidateTag` are used for this purpose; signatures and semantics can vary
between framework releases.

```ts
async function getArticles() {
  const response = await fetch("https://example.com/api/articles", {
    next: { tags: ["articles"] },
  });
  return response.json();
}
```

The tag must be attached to cached data before it can be invalidated. For
cached functions in configurations that support Cache Components, follow the
current `cacheTag` and `'use cache'` documentation instead of assuming
`fetch` tags apply unchanged.

```tsx
// Illustrative Route Handler: verify the webhook before invalidating.
import { revalidatePath, revalidateTag } from "next/cache";

export async function POST(request: Request) {
  // Verify a trusted webhook signature and validate its payload first.
  revalidatePath("/articles");
  revalidateTag("articles", "max");
  return Response.json({ revalidated: true });
}
```

This is deliberately incomplete as a webhook implementation: do not expose
an unauthenticated endpoint that lets anyone trigger work or influence
content. Use the version's official API signature and an actual signature
verification mechanism. In current APIs, `revalidateTag(tag, "max")`
marks tagged cached data stale using stale-while-revalidate semantics: a
request can receive stale content while fresh data is generated. It does not
eagerly regenerate every matching page at the moment the webhook arrives.
In current releases, `updateTag` is intended for read-your-own-writes flows
from Server Actions; confirm its availability and semantics in the installed
version. Do not select an immediate-expiration policy without understanding
the latency and stale-data trade-off.

## Common patterns

- **Time-based:** refresh when data becomes old enough under the configured
  cache rules.
- **Event-based:** refresh after a trusted event such as a CMS publish.
- **Path-based:** invalidate a route or route subtree.
- **Tag-based:** associate cached data with a tag and invalidate related
  cached entries.

These patterns may be combined. Do not mix examples from older Pages Router
ISR APIs with App Router cache APIs without checking the version.

The Pages Router uses a different model, commonly `getStaticProps` with its
`revalidate` return value and `res.revalidate(path)` for on-demand ISR.
Pages Router examples do not belong in an App Router route without
translation.

## When ISR is a good fit

Use it for public product catalogs, articles, documentation, or other
content that can be shared and may tolerate a defined freshness window. It
is usually not the right approach for personalized dashboards or data that
must be immediately consistent for every user.

## Important caveats

- Static output must not leak user-specific information.
- A webhook must be authenticated and its input validated.
- Revalidation can fail; decide how the site and monitoring should handle it.
- Cache invalidation does not automatically clear every browser, CDN, or
  external cache.
- Static export does not support all server-backed ISR behaviors.

## Check your understanding

1. How does time-based revalidation differ from event-based invalidation?
2. Why is a time interval not necessarily an exact regeneration timer?
3. What must a CMS webhook do before it calls a revalidation API?

## Further learning

- [Next.js: Revalidating data](https://nextjs.org/docs/app/building-your-application/caching#revalidating)
- [Next.js: `revalidatePath`](https://nextjs.org/docs/app/api-reference/functions/revalidatePath)
- [Next.js: `revalidateTag`](https://nextjs.org/docs/app/api-reference/functions/revalidateTag)
- [Next.js: ISR guide](https://nextjs.org/docs/app/guides/incremental-static-regeneration)
