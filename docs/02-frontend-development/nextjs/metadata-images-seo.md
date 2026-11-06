# Next.js Metadata, SEO, and Social Previews

Metadata describes a page to browsers, search engines, and link-preview
systems. Search engine optimization (SEO) also depends on useful content,
accessibility, performance, links, and correct indexing behavior; metadata
alone does not guarantee ranking.

## Metadata API

In the App Router, export a `metadata` object for static values or implement
`generateMetadata` when values depend on route data. Metadata exports belong
in Server Components; Client Components cannot export them.

```tsx
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "HTML Forms | Full Stack Notes",
  description: "Learn form elements, attributes, validation, and accessible labels.",
  alternates: {
    canonical: "https://notes.example.com/frontend/html/forms/",
  },
  openGraph: {
    title: "HTML Forms",
    description: "A practical guide to HTML forms.",
    images: ["/images/forms-preview.png"],
  },
};
```

For dynamic pages, `generateMetadata` can use validated route parameters and
the same trusted data source as the page. Avoid exposing private data in
metadata, which is sent to browsers and crawlers.

## Important metadata concepts

- **Title:** unique and descriptive page title; layouts can provide a
  template for child pages.
- **Description:** concise summary; search engines may choose other snippets.
- **Canonical URL:** preferred URL when equivalent content is reachable at
  multiple URLs.
- **Open Graph / social metadata:** controls previews on platforms that
  support it.
- **Robots directives:** guide indexing/crawling; they do not enforce access
  control or protect private pages.
- **`metadataBase`:** base URL used when resolving relative metadata URLs;
  configure a production origin deliberately.

## Practical dynamic metadata example

```tsx
import type { Metadata } from "next";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const article = await getPublicArticle(slug);
  return {
    title: `${article.title} | Learning Notes`,
    description: article.summary,
  };
}
```

`getPublicArticle` is illustrative. Handle missing content and authorization
according to the route's requirements. `params` typing and behavior depend on
the Next.js release.

## Images and SEO

Use descriptive image alt text, appropriate dimensions, and optimized
formats. Include structured data only when it accurately describes visible
page content and conforms to the relevant search documentation. Never use
hidden or misleading metadata to claim content that users cannot see.

## Developer checklist

- Give important pages distinct titles and accurate summaries.
- Set a correct production base URL and canonical URL strategy.
- Do not put secrets or private user details in metadata.
- Ensure pages intended to be private are protected by server-side
  authorization, not merely `noindex`.
- Test rendered head output, social previews, and mobile layouts.

## Common misconceptions

- A meta description is not a guaranteed search-result snippet.
- `noindex` does not prevent someone from directly visiting a URL.
- Server rendering and metadata do not guarantee search ranking.

## Check your understanding

1. When should `generateMetadata` be used instead of a static export?
2. What does a canonical URL communicate?
3. Why is `noindex` not an access-control feature?

## Further learning

- [Next.js: Metadata and OG images](https://nextjs.org/docs/app/building-your-application/optimizing/metadata)
- [Google Search Central: SEO starter guide](https://developers.google.com/search/docs/fundamentals/seo-starter-guide)
- [Open Graph protocol](https://ogp.me/)
