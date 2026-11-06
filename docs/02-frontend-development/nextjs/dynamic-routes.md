# Next.js Dynamic and Catch-All Routes

Dynamic segments let one route file handle many URLs. The URL provides
parameters such as a product identifier or article slug; these values are
input and must be validated before use.

## Dynamic segments

Square brackets define one variable path segment:

```text
app/
  products/
    [productId]/
      page.tsx
```

This route can match `/products/42`. In a current App Router setup where
`params` is asynchronous, a page can read it like this:

```tsx
type Props = { params: Promise<{ productId: string }> };

export default async function ProductPage({ params }: Props) {
  const { productId } = await params;
  return <h1>Product {productId}</h1>;
}
```

`params` typing and behavior are version-sensitive. Use the generated types
and documentation for the version installed in the project.

## Catch-all patterns

| Folder | Matches |
|---|---|
| `[...slug]` | One or more remaining path segments |
| `[[...slug]]` | Zero or more remaining path segments, including the base route |

For example, `app/docs/[...slug]/page.tsx` can match
`/docs/setup/linux`; the parameter represents multiple segments. Use a
catch-all for hierarchical content such as documentation, not as a shortcut
for validating arbitrary paths.

## Static parameters

`generateStaticParams` can return known parameter values for routes that
can be prepared ahead of time. This can improve reuse for public content,
but enumerating a very large or private data set may be inappropriate.

## Security and developer perspective

Treat every route parameter as untrusted. Validate its format, confirm the
requested record exists, and check authorization before returning protected
data. Escaping or type-checking a parameter alone does not grant access.

## Further learning

- [Next.js: Dynamic segments](https://nextjs.org/docs/app/building-your-application/routing/dynamic-routes)
- [Next.js: `generateStaticParams`](https://nextjs.org/docs/app/api-reference/functions/generate-static-params)
