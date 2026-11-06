# Static Rendering in Next.js

Static rendering prepares a route's output so it can be reused for later
visitors rather than generating the entire response separately for each
request. It is well suited to public content that can safely be shared.

## How it works

1. The framework renders a route during a build or another supported
   prerendering process.
2. The resulting output can be served from a cache or content delivery
   network.
3. Each visitor receives reusable output until the framework's cache rules
   require an update.

In the App Router, whether a route can be statically rendered depends on its
data access, request-specific APIs, configuration, and Next.js version.
Use official docs for the project version rather than assuming every route
is static by default.

## Example: known public content

A public article or documentation page can be prepared from known content.
For dynamic paths, `generateStaticParams` can list identifiers to prepare
ahead of time. A large or unbounded set may be better handled with another
strategy.

## Benefits and trade-offs

Static output is reusable and can be served efficiently. It is not suitable
for embedding private per-user data in a shared response, and content may
become stale until revalidated or rebuilt.

## Developer perspective and misconceptions

Static rendering is different from static export: a static export has
additional deployment constraints and does not support every
server-dependent Next.js feature. Static does not mean “no JavaScript”;
client-side interaction can still be added.

## Further learning

- [Next.js: Static exports](https://nextjs.org/docs/app/guides/static-exports)
- [Next.js: `generateStaticParams`](https://nextjs.org/docs/app/api-reference/functions/generate-static-params)
