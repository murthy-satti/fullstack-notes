# Next.js API Routes and Route Handlers

Next.js has two API conventions because it has two routers. The App Router
uses `route.ts`; the Pages Router uses files under `pages/api/`. They both
create server-side HTTP endpoints, but their APIs and project conventions
differ.

## App Router: `app/api/.../route.ts`

```text
app/
  api/
    health/
      route.ts       -> /api/health
```

Export functions named for HTTP methods. Standard `Request` and `Response`
work for basic handlers; Next.js also provides request/response helpers.

```ts
// app/api/health/route.ts
export function GET() {
  return Response.json({ status: "ok" });
}
```

A dynamic handler can read a path parameter and validate it. Parameter
typing is version-sensitive in current Next.js releases.

```ts
// app/api/products/[id]/route.ts
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  if (!/^[a-z0-9-]+$/i.test(id)) {
    return Response.json({ error: "Invalid product id" }, { status: 400 });
  }
  return Response.json({ id });
}
```

The example validates only a simple identifier format; production code must
load the resource and apply authorization before returning protected data.

## Pages Router: `pages/api/...`

```text
pages/
  api/
    health.ts       -> /api/health
```

Pages Router API routes commonly use a default handler receiving request and
response objects, then branch on the HTTP method. This differs from App
Router named method exports. Do not mix the two handler signatures.

## HTTP methods and status codes

| Method | Common use |
|---|---|
| `GET` | Read a resource; should not change server state |
| `POST` | Create or submit an operation |
| `PUT` | Replace a resource representation |
| `PATCH` | Partially update a resource |
| `DELETE` | Remove a resource |

Return appropriate status codes, validate content type and body size, and
handle unsupported methods. Do not expose stack traces or sensitive server
details in responses.

## Security checklist

- Authenticate the caller and authorize the requested resource/action.
- Validate and constrain path parameters, query values, headers, and body.
- Treat webhook requests as untrusted until their signatures are verified.
- Consider CSRF for cookie-authenticated state-changing requests.
- Configure CORS only when browser cross-origin access is needed.
- Rate limit or otherwise protect expensive/public operations where needed.
- Avoid logging passwords, tokens, or unnecessary personal data.

## Developer perspective and terminology

An API endpoint is a contract, not just a function. **Request body** carries
submitted data; **status code** communicates broad outcome; **webhook** is a
request from another system; **authorization** checks permission after
identity is established.

## Common misconceptions

- `route.ts` is an HTTP handler; `page.tsx` is a UI route.
- An API route is not protected automatically.
- CORS is not authentication and does not prevent non-browser clients from
  calling an endpoint.
- HTTP method names do not enforce that a handler is safe; the code must
  implement the intended semantics.

## Further learning

- [Next.js: Route Handlers](https://nextjs.org/docs/app/building-your-application/routing/route-handlers)
- [Next.js: Pages Router API Routes](https://nextjs.org/docs/pages/building-your-application/routing/api-routes)
- [MDN: HTTP request methods](https://developer.mozilla.org/en-US/docs/Web/HTTP/Methods)
