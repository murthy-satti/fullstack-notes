# Next.js Layouts, Loading UI, and Error UI

The App Router uses special files to share page structure, show a pending
state, and handle errors or missing resources. Each behavior has its own
boundary and is explained in a focused lesson:

- [Layouts](layouts.md): root and nested shared UI, templates, and route
  structure.
- [Loading UI](loading-ui.md): `loading.tsx`, Suspense boundaries, and
  streaming.
- [Error and not-found UI](error-and-not-found-ui.md): `error.tsx`,
  `global-error.tsx`, and `not-found.tsx`.

## Remember

These files improve structure and recovery; they do not replace validation,
authorization, or monitoring. Handle expected outcomes such as invalid
input and missing records deliberately, and avoid displaying sensitive
server details to users.

## Further learning

- [Next.js: Routing](https://nextjs.org/docs/app/building-your-application/routing)
- [Next.js: Error handling](https://nextjs.org/docs/app/building-your-application/routing/error-handling)
