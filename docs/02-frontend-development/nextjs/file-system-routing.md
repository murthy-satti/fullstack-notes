# Next.js File-System Routing

In the App Router, folders under `app/` describe URL segments and
`page.tsx` supplies the UI for a route. Special files such as `layout.tsx`
and `route.ts` provide other route behavior.

## Static and nested routes

```text
app/
  page.tsx                 /
  about/
    page.tsx               /about
  products/
    page.tsx               /products
    reviews/
      page.tsx             /products/reviews
```

A folder name becomes a path segment. A route is made public by the
appropriate special file, usually `page.tsx`; a helper component can live
in the folder without becoming a route by itself.

## Common special files

| File | Purpose |
|---|---|
| `page.tsx` | UI for a route segment |
| `layout.tsx` | Shared UI around child segments |
| `template.tsx` | Shared wrapper that remounts on navigation |
| `loading.tsx` | Loading fallback for the segment |
| `error.tsx` | Error boundary UI |
| `not-found.tsx` | Missing-resource UI |
| `route.ts` | HTTP method handlers, not a rendered React page |

Use the convention appropriate to the feature; consult the installed
Next.js version because exact behavior evolves.

## Practical route example

```tsx
// app/about/page.tsx
export default function AboutPage() {
  return <main><h1>About these notes</h1></main>;
}
```

## Developer perspective and misconceptions

Organize route files around URLs and shared boundaries. Do not assume a
component folder is routable or that `route.ts` renders page UI. Pages
Router conventions such as `pages/about.tsx` are a different routing
system.

## Further learning

- [Next.js: Defining routes](https://nextjs.org/docs/app/building-your-application/routing/defining-routes)
- [Next.js: Project structure](https://nextjs.org/docs/app/getting-started/project-structure)
