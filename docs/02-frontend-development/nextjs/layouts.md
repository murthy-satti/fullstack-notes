# Next.js Layouts

A layout is shared UI around a route segment and its descendants. It is
useful for persistent elements such as site navigation, section menus, and
common page structure.

## Root and nested layouts

The root `app/layout.tsx` is required in the App Router and must provide the
document's `<html>` and `<body>` elements. Nested layouts wrap pages beneath
their folder.

```tsx
// app/layout.tsx
import type { ReactNode } from "react";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header>Learning notes</header>
        {children}
      </body>
    </html>
  );
}
```

Layouts can preserve shared UI during client navigation. A
`template.tsx` is similar but creates a new instance on navigation where
remount behavior is desired.

## Developer perspective

Keep shared structure in the closest appropriate layout. Avoid putting
request-specific secrets or user data into a shared cacheable layout
without understanding its rendering and caching behavior. Route groups can
organize distinct layouts without adding URL segments.

## Common misconceptions

- A layout does not create a page route by itself.
- A nested layout wraps its descendants, not unrelated routes.
- A layout and a template have different lifecycle behavior.

## Further learning

- [Next.js: Layouts and pages](https://nextjs.org/docs/app/building-your-application/routing/pages-and-layouts)
- [Next.js: Route groups](https://nextjs.org/docs/app/building-your-application/routing/route-groups)
