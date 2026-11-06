# HTML Audio and Video

The native `<audio>` and `<video>` elements let browsers play media without
requiring a custom player. Their controls, captions, and alternatives help
people use the content across devices and abilities.

## Sources and playback attributes

Both elements can use a `src` attribute or one or more nested `<source>`
elements.

| Attribute | Meaning |
|---|---|
| `controls` | Shows the browser's playback controls |
| `autoplay` | Requests automatic playback; browsers commonly restrict it |
| `muted` | Starts playback without sound; often required for autoplay eligibility |
| `loop` | Restarts playback when it ends |
| `preload` | Hint: `none`, `metadata`, or `auto`; the browser may choose differently |
| `poster` | Preview image for video before playback |
| `playsinline` | Allows inline playback on supported mobile browsers |

```html
<video controls width="640" poster="/media/lesson-preview.jpg">
  <source src="/media/lesson.webm" type="video/webm">
  <source src="/media/lesson.mp4" type="video/mp4">
  <track kind="captions" src="/media/lesson-en.vtt"
         srclang="en" label="English">
  Your browser does not support embedded video.
</video>
```

The browser can select a source format it supports. Fallback text is shown
when the element itself is unsupported; it is not a substitute for captions.

## Captions and alternatives

`<track>` provides timed text. Use `kind="captions"` for captions that
include relevant speech and sounds; use `kind="subtitles"` for translated
dialogue. The `src` points to a WebVTT file, `srclang` identifies its
language, and `label` gives the choice a readable name.

Provide a transcript or description when the media's information cannot be
understood from its audio or video alone. Avoid unexpected autoplay,
especially with sound.

## Developer perspective and misconceptions

`preload` is a hint, not a promise. `autoplay` may be blocked by browser
policy. Captions improve access but do not necessarily describe visual
information; provide an appropriate audio description or transcript when
needed.

## Check your understanding

1. Which element provides timed captions?
2. What is the purpose of a video `poster`?
3. Does `preload="auto"` force the browser to download the whole media file?

## Further learning

- [MDN: `<audio>`](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/audio)
- [MDN: `<video>`](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/video)
- [MDN: `<track>`](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/track)
