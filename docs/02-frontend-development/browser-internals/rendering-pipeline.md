# The Browser Rendering Pipeline

The rendering pipeline is the work a browser performs to turn downloaded
resources into pixels and keep the page updated as it changes.

## Why it matters

Understanding the pipeline helps explain blank screens, layout shifts, slow
interactions, and why some updates cost more than others. It also helps focus
optimization on measured user-visible work.

## How it works

1. The browser requests HTML and discovers linked stylesheets, scripts,
   images, fonts, and other resources.
2. It parses HTML into the DOM and CSS into style information. These tasks can
   proceed while resources are still arriving.
3. It calculates styles and layout: which rules apply, and where elements fit.
4. It paints visual details and composites layers into the displayed frame.
5. JavaScript, user input, animations, and new resources can trigger further
   work.

This is a useful mental model, not a strict sequence for every browser or
every update. Browsers optimize and overlap work. Some scripts and stylesheets
can delay rendering, depending on how they are loaded.

## Practical example

An image without reserved dimensions may load after the text and push content
down, causing layout shift. Declaring its intrinsic dimensions lets the
browser reserve space:

```html
<img src="/images/city.jpg" width="800" height="500" alt="City skyline">
```

## Developer perspective and terminology

Use the Performance panel to record a real interaction before changing code.
**Layout** calculates geometry; **paint** draws visual content; **compositing**
combines layers; **layout shift** is unexpected movement of visible content.

## Common misconceptions

- Every style change does not cause every rendering stage.
- The browser does not wait for every resource before showing anything.
- More JavaScript is not a universal solution to rendering problems.

## Further learning

- [MDN: How browsers work](https://developer.mozilla.org/en-US/docs/Web/Performance/How_browsers_work)
- [MDN: Critical rendering path](https://developer.mozilla.org/en-US/docs/Web/Performance/Guides/Critical_rendering_path)
