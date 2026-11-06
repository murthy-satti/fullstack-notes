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
