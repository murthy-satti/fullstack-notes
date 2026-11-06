# Next.js

## Introduction

Next.js is an open-source React framework created by Vercel and first released
in 2016. It gives React applications conventions and tools for routing,
server-side code, rendering, and production builds. Next.js applications still
use React; Next.js adds a framework around it.

## Why does it exist?

React helps build user interfaces, but a production website also needs a
routing system, a way to load data, decisions about where pages render, and a
deployment strategy. Next.js integrates these concerns so a team can build
many kinds of web applications in one project.

## Next.js compared with React

| React by itself | Next.js |
|---|---|
| A UI library for building components | A framework built on React |
| Does not prescribe a built-in routing system | Provides file-system routing |
| Rendering and data-loading choices come from the app and its tools | Adds server and static rendering options, with behavior depending on route and configuration |
| Can be used in many environments | Provides conventions for web applications and supported deployments |

Neither is automatically faster or better for every project. Choose based on
the application's needs, the team's familiarity, hosting constraints, and how
the user experience should work.

## What Next.js adds

- **File-system routing:** folders and special files define URL routes.
- **Rendering choices:** pages can use static generation, request-time server
  rendering, client-side work, or a combination appropriate to the route.
- **Server-side endpoints:** Route Handlers can expose HTTP endpoints within
  the application.
- **Image and metadata tools:** the Image component and metadata APIs support
  image delivery and page descriptions, subject to configuration and hosting.
- **Production tooling:** the framework provides build and optimization
  features, including code splitting, while the actual result depends on how
  the application is structured.

These features help, but they do not automatically guarantee better SEO,
faster pages, or a secure API. Those outcomes still depend on implementation,
content, and deployment.

## How does it work?

In the App Router, files inside `app` define routes and UI boundaries. Server
Components are rendered on the server by default; Client Components support
browser interactivity and APIs. Next.js supports static and request-time
rendering, with behavior depending on version and route configuration.

## Real-world example

A product page can render its title and description as server-generated
content, while a small client component handles an interactive quantity
selector. This keeps the browser work focused on the parts that need it.

## Developer perspective

Learn [React](react.md) first, then study routes, rendering, and the boundary
between server and browser code. Never put secrets in client-side code.
Understand [TypeScript](typescript.md) if the project uses typed components.

The App Router has evolved over several releases. Check the version-specific
official documentation before copying a configuration or caching example
from an older tutorial.

## Practical example

The current recommended starter command creates a project using the current
stable release:

```bash
npx create-next-app@latest
```

In the project directory, start the development server:

```bash
cd my-app
npm run dev
```

By default, the local app is available at `http://localhost:3000`. To use
another port with the standard npm script, pass the argument through:

```bash
npm run dev -- --port 3001
```

The URL is local to your development machine; it is not a public production
address.

## Important terminology

- **React framework:** A system built on React that adds application-level
  conventions and capabilities.
- **App Router:** The routing system based on the `app` directory.
- **Server rendering:** Producing page output on the server rather than
  building the entire initial page in the browser.
- **Static generation:** Producing route output ahead of a user request when
  its data and configuration allow it.
- **Hydration:** Connecting browser-side React behavior to server-rendered
  markup when client interactivity is needed.

## Advantages and trade-offs

Next.js supplies routing, build tooling, and multiple rendering options in an
integrated framework. Server/client boundaries and caching introduce
additional concepts; teams also need to understand the behavior of the
specific framework version they deploy.

## Common misconceptions

- Next.js is not a competing UI library; it is built on React.
- Server rendering does not mean every component runs only on the server.
- Static generation, server rendering, and client-side rendering are not
  interchangeable terms.
- Server rendering does not guarantee a fixed speed improvement. Results
  depend on the route, server, network, assets, caching, and application code.
- A `"use client"` file is not a safe place for secrets.

## Explore the Next.js topics

- [Getting started and project structure](nextjs/getting-started.md)
- [App Router overview](nextjs/app-router.md), followed by
  [file-system routing](nextjs/file-system-routing.md),
  [dynamic routes](nextjs/dynamic-routes.md), and
  [route groups and advanced routing](nextjs/advanced-routing.md).
- [Rendering strategies overview](nextjs/rendering-strategies.md), then
  focused lessons on [client rendering](nextjs/client-side-rendering.md),
  [static rendering](nextjs/static-rendering.md),
  [server rendering](nextjs/server-side-rendering.md), and
  [ISR](nextjs/incremental-static-regeneration.md).
- [Layouts, loading, and errors overview](nextjs/layouts-loading-errors.md),
  followed by lessons on [layouts](nextjs/layouts.md),
  [loading UI](nextjs/loading-ui.md), and
  [error and not-found UI](nextjs/error-and-not-found-ui.md).
- [Server and Client Components](nextjs/server-and-client-components.md)
- [Data fetching and caching](nextjs/data-fetching-and-caching.md)
- [Forms and Server Actions](nextjs/forms-and-server-actions.md)
- [Route handlers and API endpoints](nextjs/route-handlers.md)
- [Cookies and sessions](nextjs/cookies-and-sessions.md)
- [Link and Image overview](nextjs/link-and-image-components.md), followed
  by focused lessons on the [Link](nextjs/link-component.md) and
  [Image](nextjs/image-component.md) components.
- [Hydration errors and troubleshooting](nextjs/hydration-errors.md)
- [Authentication and security](nextjs/authentication-and-security.md)
- [Metadata, images, and SEO](nextjs/metadata-images-seo.md)
- [Deployment and production](nextjs/deployment.md)

## Further Learning & References

- **Official docs:** [Next.js documentation](https://nextjs.org/docs) covers installation, routing, rendering, and deployment.
- **Official docs:** [Next.js App Router](https://nextjs.org/docs/app) documents the App Router and its features.
- **Review:** [Next.js Interview Questions and Answers](nextjs/interview-questions-and-answers.md).
