# Next.js Interview Questions and Answers

These questions review Next.js routing, rendering, server/client
boundaries, and production concerns. Framework APIs change over time;
verify version-specific behavior against the documentation for your
project.

## Framework and routing

### 1. What is Next.js?

Next.js is a React framework that provides application conventions and
features such as routing, rendering options, server-side capabilities, and
production build tooling.

### 2. What is the App Router?

The App Router uses the `app/` directory and special file conventions.
Folders represent route segments, `page.tsx` provides route UI, and other
files define layouts, loading UI, errors, or route handlers.

### 3. What is a dynamic route?

A dynamic route uses a bracketed segment, such as `app/products/[id]/page.tsx`,
to match variable path values. Treat route parameters as untrusted input
and validate and authorize before returning data.

### 4. What is a route group?

A folder such as `(marketing)` organizes routes or layouts without adding
the group name to the URL.

### 5. What is the difference between `page.tsx` and `route.ts`?

`page.tsx` defines rendered route UI. `route.ts` defines HTTP method
handlers for an endpoint; it is not a React page.

## Rendering and components

### 6. What is the difference between SSR, static rendering, and CSR?

SSR creates output on the server for a request. Static rendering prepares
reusable output ahead of requests under the route's supported configuration.
CSR builds or updates UI in the browser. A Next.js route can combine these
approaches; exact behavior depends on framework version and route setup.

### 7. What is ISR?

Incremental Static Regeneration reuses static output while allowing it to
be refreshed through supported time-based or on-demand revalidation
mechanisms. It is not necessarily a scheduled rebuild at an exact time.

### 8. What is the difference between Server and Client Components?

Server Components execute as part of server rendering and can keep
server-only code out of the browser bundle. Client Components enable
interactivity and browser APIs. The `"use client"` directive marks a client
boundary; it does not make secrets safe to expose in props or bundled
code.

### 9. What is hydration?

Hydration attaches client-side React behavior to server-rendered HTML for
interactive components. A hydration error can occur when the initial
client render does not match the server-rendered markup.

### 10. What are `layout.tsx` and `loading.tsx`?

`layout.tsx` provides shared UI around a route segment and its descendants.
`loading.tsx` provides a loading fallback for eligible work within a
segment, often through a Suspense boundary.

### 11. What is the purpose of `error.tsx`?

`error.tsx` defines a segment-level error boundary UI. In the App Router it
must be a Client Component. It should provide safe recovery UI and must not
expose sensitive server details.

## Data and production

### 12. How does a Next.js Route Handler differ from a Server Action?

A Route Handler implements HTTP methods at a route. A Server Action is a
server-side function invoked through supported React/Next.js mechanisms,
often for mutations. Both require validation and authorization.

### 13. How should cookies be used for sessions?

Session cookies should be issued and configured server-side with appropriate
attributes such as `HttpOnly`, `Secure`, and `SameSite`. Authentication
must also validate the session and authorize each protected operation.

### 14. What does the Next.js `Link` component do?

`Link` provides framework-aware navigation between application routes and
renders an anchor so browser navigation, keyboard use, and link semantics
remain available.

### 15. What does the Next.js `Image` component provide?

`Image` adds image layout and optimization features. It still needs
appropriate alternative text, dimensions or layout, responsive `sizes`,
and deliberate configuration for remote images.

### 16. Does metadata guarantee good SEO?

No. Metadata helps describe pages, but useful content, crawlability,
performance, accessibility, and correct indexing behavior also matter.
Metadata does not enforce access control.

### 17. How should Next.js API input be secured?

Validate all input on the server, authenticate and authorize the caller,
avoid exposing secrets to Client Components, and use safe database and
output-handling practices. A hidden button or client-side check is not
authorization.

## Further learning

- [Next.js overview](../nextjs.md)
- [Next.js documentation](https://nextjs.org/docs)
- [Next.js App Router](https://nextjs.org/docs/app)

## Scenario questions

### 18. A page renders correctly in the browser, but hydration reports different markup. What do you investigate?

Find the first mismatching element in the error and compare the server output with the initial client render. Common causes include reading browser-only values during render, locale- or time-dependent output, random IDs, and invalid HTML nesting. Make the initial render deterministic; move browser-only reads into an appropriate client effect or provide the same stable input to both renders. Suppressing a warning does not fix divergent UI.

### 19. A secret is available in a Client Component because it was passed as a prop. Is it safe?

No. Props passed to a Client Component are serialized for the browser and should be treated as public. Keep secrets and privileged operations in server-only code, expose only the minimum result needed by the interface, and use server-side authorization for every protected operation. A variable name or hidden UI does not make data secret.

### 20. A user sees stale product data after an administrator updates it. Where do you look?

Trace the data path and identify which layer is caching: the data-fetching request, route output, client-side router cache, CDN, or application cache. Check the framework version and route configuration because caching defaults and controls vary. Choose an explicit freshness policy, then invalidate or revalidate the relevant tag, path, or cache entry after a successful update. Verify both the updated page and other pages that share the data.

### 21. A Route Handler returns private data to any visitor who knows the URL. What is missing?

The handler must authenticate the caller and authorize access to the specific resource on the server. Validate route parameters and request bodies, then check ownership or permission before reading or changing data. Client-side route guards and hidden links are only interface behavior and cannot enforce access control.

### 22. A page is unexpectedly rendered dynamically and response latency increases. How do you diagnose it?

Inspect the route's data dependencies and runtime configuration for request-specific inputs such as cookies, headers, or uncached data access. Check build and runtime diagnostics for the framework version in use, then confirm with response headers and representative production measurements. Decide whether the page truly needs per-request data; if not, restructure the data flow and caching policy deliberately. Do not force static rendering if it would serve user-specific information to other users.

### 23. A form mutation works through the UI but can be triggered by a crafted request. What should protect it?

Treat every Server Action and Route Handler as an externally reachable mutation boundary. Validate the input, authenticate the caller, authorize the requested operation and resource, and apply CSRF protections appropriate to the authentication design and framework configuration. UI visibility, TypeScript types, and server-only execution do not prove that a caller is allowed to perform the action.

## Further learning
