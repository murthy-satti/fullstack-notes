# Next.js Data Fetching and Caching

Data fetching loads information for a route or component. Caching reuses
results so the application can avoid repeated work. Next.js caching defaults
and APIs have changed across releases and differ when Cache Components are
enabled, so first identify the project's version and configuration.

## Server-side fetching in the App Router

Server Components can call asynchronous functions directly. A fetch can call
an external API; a server-only data-access function can call a database.
Keep credentials and database clients out of Client Components.

```tsx
type Post = { id: string; title: string };

async function getPosts(): Promise<Post[]> {
  const response = await fetch("https://example.com/api/posts");
  if (!response.ok) {
    throw new Error(`Could not load posts: ${response.status}`);
  }
  return response.json();
}

export default async function PostsPage() {
  const posts = await getPosts();
  return (
    <ul>
      {posts.map((post) => <li key={post.id}>{post.title}</li>)}
    </ul>
  );
}
```

In real code, validate the response shape at runtime; a TypeScript return
type does not check remote JSON.

## Parallel and sequential work

If requests do not depend on one another, start them together:

```tsx
const [profile, recommendations] = await Promise.all([
  getProfile(userId),
  getRecommendations(userId),
]);
```

Sequential awaits are appropriate when the second request needs the first
result. They add latency if used unnecessarily. Consider how errors should
be handled when one of several parallel requests fails.

## Client-side fetching

Use a Client Component when fetching depends on browser interaction, such as
search-as-you-type or refreshing a live panel. Model loading, empty, success,
and error states. Handle cancellation or stale responses where users can
change requests quickly. For larger apps, a data-fetching library may offer
deduplication, retries, and cache coordination.

## Caching concepts

- **Request memoization/deduplication:** avoids repeating equivalent work
  during one render/request under supported conditions.
- **Data cache:** reuses fetched or computed data across requests when
  configured.
- **Full route/output cache:** reuses rendered route output where eligible.
- **Browser or CDN cache:** controlled by HTTP caching headers and hosting.
- **Revalidation:** marks data or output as needing refresh by time or event.

These are different caches with different lifetimes. Invalidating one does
not automatically clear every browser, CDN, or external cache.

### Version-sensitive `fetch` example

In the traditional App Router caching model, a fetch can specify a
revalidation interval:

```tsx
const response = await fetch("https://example.com/api/posts", {
  next: { revalidate: 3600 },
});
```

The exact meaning and defaults depend on Next.js version. Some newer
configurations use explicit cache directives such as `'use cache'` and
`cacheLife`; do not combine configurations without checking the current
[caching guide](https://nextjs.org/docs/app/building-your-application/caching).

## Private and personalized data

Before caching a result, decide whether different users may receive the same
value. Account details, permissions, billing data, and private messages must
not be accidentally served from a shared cache. Authenticate and authorize
on the server, and use request-specific/dynamic handling where required.

## Error, loading, and streaming behavior

Use route `loading.tsx`, Suspense boundaries, and error boundaries to present
useful intermediate and recovery UI. A boundary affects presentation; it
does not make the underlying fetch reliable or eliminate the need to handle
expected errors.

## Developer perspective and terminology

**Cache key** identifies which result is reused; **stale data** may no
longer reflect the source; **deduplication** avoids repeated equivalent
work; **revalidation** refreshes cached data or output.

## Common misconceptions

- A successful HTTP status does not guarantee response JSON has the expected
  shape.
- `fetch` behavior is not identical in browser and Next.js server contexts.
- Caching is not automatically safe for per-user data.
- ISR does not mean every cached page refreshes at an exact scheduled second.

## Further learning

- [Next.js: Fetching data](https://nextjs.org/docs/app/building-your-application/data-fetching)
- [Next.js: Caching](https://nextjs.org/docs/app/building-your-application/caching)
- [Next.js: Revalidating data](https://nextjs.org/docs/app/building-your-application/caching#revalidating)
