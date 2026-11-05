# Browser Internals

## Introduction

A browser is more than a window that displays files. It requests resources,
interprets HTML and CSS, runs JavaScript, and presents an interactive page.
Understanding this process helps explain loading delays, layout changes, and
why some code affects responsiveness.

## Why does it exist?

Browsers turn web standards into a consistent interactive experience across
devices. Knowing their main responsibilities helps developers build pages that
load predictably, work with different input methods, and avoid unnecessary
work on the main thread.

## How does it work?

The browser requests a document and related resources. It parses HTML into a
DOM and CSS into a CSSOM, combines those inputs to calculate layout, then
paints and composites visible content. JavaScript can react to events and may
change the DOM or styles, which can require further layout or painting.
Browsers perform many tasks concurrently, but some work can delay rendering.

## Real-world example

If a page downloads a large image above the fold, that image may delay the
user's perception of loading. If a script repeatedly changes layout-related
styles while measuring elements, it can trigger expensive rendering work.
Optimizing images and batching updates can improve the experience.

## Developer perspective

Think about the critical resources needed for the first useful view. Use
semantic markup and efficient assets, avoid long main-thread tasks, and
measure before optimizing. The [HTML](html.md), [CSS](css.md), and
[JavaScript](javascript.md) lessons cover the inputs involved.

## Practical example

To keep an image from causing a large layout shift, reserve its space:

```html
<img src="/images/city.jpg" width="800" height="500" alt="City skyline at dusk">
```

The dimensions let the browser calculate a space before the image has loaded.
The alternative text communicates the image's relevant content.

## Important terminology

- **DOM:** Tree of parsed HTML nodes.
- **CSSOM:** Representation of parsed CSS rules.
- **Layout:** Calculation of element sizes and positions.
- **Paint:** Drawing visual details such as text, borders, and backgrounds.
- **Main thread:** A browser execution context that handles many script and UI tasks.

## Common misconceptions

- The browser does not simply display HTML source; it parses and renders it.
- Every style change does not necessarily trigger every rendering stage, but
  some changes can require layout or paint.
- Adding more JavaScript is not always faster than a browser-provided feature.

## Revision questions

1. What are the DOM and CSSOM used for?
2. How do layout and paint differ?
3. Why can reserving image dimensions improve loading stability?

## Further Learning & References

- **Reference:** [MDN: How browsers work](https://developer.mozilla.org/en-US/docs/Web/Performance/How_browsers_work) explains parsing, rendering, and the critical rendering path.
- **Reference:** [MDN: Critical rendering path](https://developer.mozilla.org/en-US/docs/Web/Performance/Guides/Critical_rendering_path) describes how browsers prioritize resources and build a page for rendering.
