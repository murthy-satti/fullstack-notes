# HTML Embedded Content

Embedded content places another resource inside a page. The common
`<iframe>` element embeds a separate browsing context, often for a map,
video, or another web document.

## The `<iframe>` element

| Attribute | Meaning |
|---|---|
| `src` | URL of the document to embed |
| `title` | Accessible name explaining the embedded content |
| `width`, `height` | Initial dimensions of the frame |
| `loading` | `lazy` can defer loading until the frame is near the viewport |
| `sandbox` | Applies restrictions to the embedded document |
| `allow` | Permissions policy features that may be available to the frame |
| `referrerpolicy` | Controls referrer information sent with the request |

```html
<iframe
  src="https://www.youtube-nocookie.com/embed/VIDEO_ID"
  title="Introduction to HTML forms"
  width="560"
  height="315"
  loading="lazy"
  referrerpolicy="strict-origin-when-cross-origin"
  allowfullscreen>
</iframe>
```

Provide a useful `title`; otherwise people using assistive technology may
not know what the frame contains. Use a responsive wrapper or CSS sizing
when a fixed width does not fit smaller screens.

## Security and privacy

An iframe loads a separate document and can make network requests. Embed
only trusted sources. The `sandbox` attribute can restrict capabilities;
add only the permissions the content needs. Combining
`allow-scripts` and `allow-same-origin` for same-origin untrusted content
can undermine sandbox restrictions, so understand the trust boundary before
using those tokens.

## Developer perspective and misconceptions

An iframe title is not a caption for the content inside it; it identifies
the frame. `loading="lazy"` is a loading hint and may not defer a frame in
every situation. Embedding a page does not make its content part of the
parent document's DOM.

## Check your understanding

1. Why should an iframe have a descriptive `title`?
2. What does `sandbox` help control?
3. Is iframe content part of the parent page's DOM?

## Further learning

- [MDN: `<iframe>`](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/iframe)
- [MDN: iframe sandbox](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/iframe#sandbox)
