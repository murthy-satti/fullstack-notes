# Next.js App Router

The App Router is Next.js's file-system-based application router. It uses
folders and convention-named files to define URL segments, page UI, layouts,
loading states, errors, and HTTP handlers.

## Follow the routing lessons

- [File-system routing](file-system-routing.md): static and nested routes,
  route files, and how folders map to URLs.
- [Dynamic and catch-all routes](dynamic-routes.md): URL parameters and
  routes that match variable segments.
- [Route groups and advanced routing](advanced-routing.md): organize routes
  without changing URLs and learn parallel or intercepted route patterns.

## A minimal route tree

```text
app/
  layout.tsx
  page.tsx
  about/
    page.tsx
```

In this example, `app/page.tsx` provides `/`, while
`app/about/page.tsx` provides `/about`. A route becomes renderable through
the appropriate special file; a folder alone is not necessarily a public
route.

## App Router and Pages Router

Next.js also supports the older Pages Router in many projects. The App
Router uses `app/`, `page.tsx`, and `route.ts`; the Pages Router uses
`pages/`, page files, and `pages/api/` for API Routes. Their data-fetching
and rendering APIs differ. Identify the router used by a route before
following a tutorial.

## Developer perspective and misconceptions

Route parameters are untrusted input. Validate them before using them in
queries, file access, or authorization decisions. A route handler is an HTTP
endpoint, not a React page.

## Further learning

- [Next.js: Getting started](https://nextjs.org/docs/app/getting-started)
- [Next.js: Project structure](https://nextjs.org/docs/app/getting-started/project-structure)
