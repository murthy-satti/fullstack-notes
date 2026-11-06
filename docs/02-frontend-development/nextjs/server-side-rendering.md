# Server-Side Rendering in Next.js

Server-side rendering (SSR) produces HTML on the server in response to a
request. It can use request-specific information, but the browser may still
need JavaScript to make interactive components usable.

## Request lifecycle

1. A browser requests a route.
2. The server executes the route's required rendering and data work.
3. HTML is returned to the browser.
4. The browser displays the document and loads the client JavaScript needed
   for interactive components.

This is a simplified model. Streaming can send portions progressively, and
Next.js may combine server output, cached data, and Client Components.

## When it can help

SSR can be useful when output depends on request context or must reflect
fresh server-side data. It can provide meaningful HTML before client
JavaScript finishes, but the full response still depends on server work,
database latency, network transfer, and browser processing.

## Trade-offs and safe data access

Per-request work can increase server load and response latency. Keep
secrets on the server, validate request data, and authorize access before
returning user-specific content. Do not put private values in metadata or
shared caches.

## Developer perspective and misconceptions

- SSR does not guarantee faster interaction; hydration and JavaScript may
  still be required.
- SSR does not guarantee a search ranking or indexing outcome.
- Server-rendering a page does not mean all its components are Server
  Components.
- Rendering does not replace access control.

## Further learning

- [Next.js: Server rendering](https://nextjs.org/docs/app/building-your-application/rendering/server-components)
- [Next.js: Caching](https://nextjs.org/docs/app/building-your-application/caching)
