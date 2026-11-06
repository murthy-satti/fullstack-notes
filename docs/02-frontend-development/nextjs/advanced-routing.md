# Next.js Route Groups and Advanced Routing

The App Router has conventions that organize routes without necessarily
adding URL segments, and advanced patterns for composing multiple route
views. Learn static and dynamic routes first; advanced patterns add
navigation and fallback complexity.

## Route groups

Parentheses create a route group whose name is omitted from the URL:

```text
app/
  (marketing)/
    about/
      page.tsx             /about
  (account)/
    settings/
      page.tsx             /settings
```

Groups help organize teams or attach different layouts to parts of an
application. Avoid creating conflicting routes with the same resulting URL.

## Private folders

An underscore-prefixed folder, such as `_components/`, is used for
implementation organization rather than a route segment. Keep route
conventions and reusable UI easy to distinguish.

## Parallel routes

Named slots such as `@modal` let a layout render multiple route branches in
parallel. A dashboard can use slots for a main view and an independent
overlay. Provide appropriate default or fallback behavior for navigation
states.

## Intercepting routes

Conventions such as `(.)`, `(..)`, `(...)`, and `(..)(..)` can display a
route in the current layout context, often to support modal navigation while
preserving a direct URL for the full page. Exact route matching follows the
framework's documented segment rules.

## Developer perspective and trade-offs

These patterns can make rich interfaces feel natural, but add route state,
fallback, and testing requirements. Use them only when their UI behavior
benefits from the added complexity.

## Check your understanding

1. Does a route group name appear in its URL?
2. What UI problem can parallel routes help solve?
3. Why should advanced routing be tested for direct navigation as well as
   in-app clicks?

## Further learning

- [Next.js: Route groups](https://nextjs.org/docs/app/building-your-application/routing/route-groups)
- [Next.js: Parallel routes](https://nextjs.org/docs/app/building-your-application/routing/parallel-routes)
- [Next.js: Intercepting routes](https://nextjs.org/docs/app/building-your-application/routing/intercepting-routes)
