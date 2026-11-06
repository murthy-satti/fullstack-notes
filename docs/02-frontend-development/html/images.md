# HTML Images

Images communicate information, add illustration, or provide decoration.
HTML gives the browser image sources and gives assistive technology a text
alternative when appropriate.

## The `<img>` element

`<img>` is a void element. Its important attributes include:

| Attribute | Purpose |
|---|---|
| `src` | Image resource URL |
| `alt` | Text alternative; use `alt=""` for a decorative image |
| `width`, `height` | Intrinsic dimensions that help reserve layout space |
| `srcset` | Candidate images with width or density descriptors |
| `sizes` | Expected rendered width so the browser can select a candidate |
| `loading` | `lazy` can defer off-screen images; `eager` requests early loading |
| `decoding` | Hint about decoding behavior |
| `fetchpriority` | Priority hint for fetching; not a guarantee |

```html
<img src="/images/city-800.jpg"
     srcset="/images/city-400.jpg 400w, /images/city-800.jpg 800w"
     sizes="(max-width: 600px) 100vw, 800px"
     width="800" height="500"
     alt="City skyline beside a river at sunset"
     loading="lazy">
```

`srcset` describes available image candidates. `sizes` describes how wide
the image is expected to appear at different viewport sizes; the browser
uses both to choose a suitable resource.

## Art direction with `<picture>`

`<picture>` provides alternate sources, such as a crop for a narrow screen
or a supported image format. Put `<source>` elements before a fallback
`<img>`.

```html
<picture>
  <source media="(max-width: 600px)" srcset="/images/city-portrait.jpg">
  <source type="image/avif" srcset="/images/city.avif">
  <img src="/images/city.jpg" width="800" height="500"
       alt="City skyline beside a river at sunset">
</picture>
```

## Write useful alternatives

Describe the relevant information, not every visual detail. For decorative
images that add no information, use `alt=""` so assistive technology can
skip them. If an image is the only content inside a link, its alternative
should convey the link's purpose.

## Developer perspective and misconceptions

Set dimensions to reduce layout shifts. Lazy-load below-the-fold images
where useful, but avoid delaying the main image visible immediately. `alt`
text is not a caption, and `loading="lazy"` does not make an oversized image
small.

## Check your understanding

1. When is empty `alt` text appropriate?
2. How do `srcset` and `sizes` work together?
3. Why should image dimensions be specified?

## Further learning

- [MDN: Responsive images](https://developer.mozilla.org/en-US/docs/Web/HTML/Guides/Responsive_images)
- [MDN: `<img>`](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/img)
- [W3C WAI: Images](https://www.w3.org/WAI/tutorials/images/)
