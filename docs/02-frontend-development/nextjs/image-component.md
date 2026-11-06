# Next.js Image Component

`Image` from `next/image` extends the browser image element with layout and
optimization features. It can help deliver appropriately sized images, but
developers still need good source assets, alternatives, and responsive
layout choices.

## Basic usage

```tsx
import Image from "next/image";

export function TrailImage() {
  return (
    <Image
      src="/trail.jpg"
      alt="A marked trail through a forest"
      width={1200}
      height={800}
      sizes="(max-width: 700px) 100vw, 700px"
    />
  );
}
```

## Important props

| Prop | Meaning |
|---|---|
| `src` | Local public path, static import, or allowed remote source |
| `alt` | Text alternative; use an empty string only for decorative images |
| `width`, `height` | Intrinsic dimensions used to determine aspect ratio |
| `fill` | Fills a positioned parent; the parent must provide suitable layout |
| `sizes` | Describes rendered width for responsive source selection |
| `quality` | Image quality hint within the supported optimizer range |
| `preload` | Preloads an important above-the-fold image in supported versions |
| `placeholder` | Optional loading placeholder behavior |
| `unoptimized` | Skips built-in optimization when appropriate |

Props and preload guidance can change across Next.js versions. Follow the
documentation for the version installed; older projects may use a
`priority` prop where newer versions provide `preload`.

## Remote images and layout

Configure allowed remote sources in `next.config` rather than accepting
arbitrary image URLs. When using `fill`, position the parent and give it a
meaningful size or aspect ratio. The default loader does not forward
request headers to the remote source, so authenticated remote images need
an intentional design.

## Developer perspective and misconceptions

Optimization does not fix a huge source image or poor `sizes` value. Always
provide an appropriate `alt` value; do not lazy-load the main image visible
immediately without a reason. Availability of the default optimizer
depends on the deployment platform.

## Further learning

- [Next.js: `Image`](https://nextjs.org/docs/app/api-reference/components/image)
- [Next.js: Image optimization](https://nextjs.org/docs/app/building-your-application/optimizing/images)
