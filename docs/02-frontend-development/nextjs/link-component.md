# Next.js Link Component

`Link` from `next/link` is the primary way to navigate between internal
routes in a Next.js application. It renders an anchor, preserving browser
features such as opening a link in a new tab, copying its destination, and
keyboard navigation.

## Basic usage

```tsx
import Link from "next/link";

export function LessonLink() {
  return <Link href="/frontend/html">Learn HTML</Link>;
}
```

## Common props

| Prop | Meaning |
|---|---|
| `href` | Destination URL or route object |
| `prefetch` | Controls prefetch behavior where supported; defaults and production behavior are version-sensitive |
| `replace` | Replaces the current history entry instead of pushing one |
| `scroll` | Controls scroll restoration behavior for navigation |
| `target`, `rel` | Standard anchor behavior for opening external destinations |

Use a regular anchor for external links or downloads when framework
navigation is not useful. For `_blank`, include an appropriate `rel`, such
as `noopener noreferrer`. Never nest a button or another interactive
control inside a link.

## Developer perspective and misconceptions

Use descriptive link text that explains the destination. `Link` does not
replace accessibility or remove browser history; it enhances internal route
navigation. Do not enable prefetch indiscriminately without considering the
installed version and network cost.

## Further learning

- [Next.js: `Link`](https://nextjs.org/docs/app/api-reference/components/link)
