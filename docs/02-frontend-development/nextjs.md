# Next.js

## Introduction

Next.js is a React framework for web applications. It adds structure and
features such as routing and server rendering. Pages can be rendered on a
server, in a browser, or with a combination suited to a route.

## Why does it exist?

React builds interfaces, while applications also need routing, data loading,
and rendering choices. Next.js provides conventions and integrated features
for these needs.

## How does it work?

In the App Router, files inside `app` define routes and UI boundaries. Server
Components are rendered on the server by default; Client Components support
browser interactivity and APIs. Next.js supports static and request-time
rendering, with behavior depending on version and route configuration.

## Real-world example

A product route can render information on the server and use a client
component for an interactive quantity selector.

## Developer perspective

Start with [React](react.md), then learn the routing and rendering model.
Decide which code needs browser interaction; never expose secrets in
client-side code.
Also understand [TypeScript](typescript.md) if the application uses typed
components.

## Practical example

```tsx
// app/about/page.tsx
export default function AboutPage() {
  return <main><h1>About this project</h1></main>;
}
```

This page file maps to `/about` in the App Router. Production routes may add
metadata, data loading, and error or loading UI.

## Important terminology

- **Route:** A URL and the UI or handler associated with it.
- **Server Component:** A component rendered in the server-oriented model.
- **Client Component:** A component marked for browser-side interactivity.
- **Rendering strategy:** Where and when page output is generated.

## Advantages and disadvantages

Next.js supplies routing and rendering conventions. Its server/client
boundaries add concepts to learn, and behavior can vary by version.

## Common misconceptions

- Next.js is not a replacement for learning React; it is built on React.
- Server rendering does not mean every component runs only on the server.
- Marking code for client execution does not make secrets safe to include.

## Revision questions

1. What responsibilities does Next.js add beyond React?
2. When might a component need client-side interactivity?
3. What route does `app/about/page.tsx` represent in the App Router?

## Further Learning & References

- **Official docs:** [Next.js App Router](https://nextjs.org/docs/app) covers routes, layouts, rendering, and server/client components.
- **Official docs:** [Next.js installation and setup](https://nextjs.org/docs/app/getting-started/installation) explains creating and running an App Router application.
