# HTML Document Structure

HTML is a tree of nested elements. A well-formed document gives browsers a
predictable starting point and makes content understandable to people and
assistive technology.

## Why use a document structure?

Browsers can recover from many markup mistakes, but relying on recovery can
produce surprising results. A consistent structure also gives search engines,
accessibility tools, and other developers clearer information.

## How it works

- `<!doctype html>` selects modern HTML parsing behavior.
- `<html lang="en">` is the root and declares the document language.
- `<head>` contains metadata and links to resources; it is not visible page
  content.
- `<body>` contains the page's content and controls.
- Elements nest to express relationships. An element should not be placed
  inside another element where HTML does not allow it.

## Important head elements

| Element | Purpose | Common attributes |
|---|---|---|
| `<title>` | Browser-tab and document title | Text content; one clear title per document |
| `<meta charset="utf-8">` | Declares character encoding | `charset`; place near the start of `head` |
| `<meta name="viewport">` | Configures mobile viewport behavior | `name`, `content` |
| `<meta name="description">` | Summary that may be used in search snippets | `name`, `content` |
| `<link rel="stylesheet">` | Links an external stylesheet | `rel`, `href`, optional `media` |
| `<link rel="icon">` | Links a site icon | `rel`, `href`, optional `type`, `sizes` |
| `<base>` | Sets base URL/target for relative links | `href`, `target`; use carefully because it changes all relative URLs |
| `<script>` | Embeds or loads JavaScript | `src`, `type`, `defer`, `async`, `integrity`, `crossorigin` |

`defer` runs a classic external script after parsing while preserving script
order. `async` runs it when available without preserving order. Module
scripts have different default loading behavior. Use the strategy that
matches dependencies and consult current browser documentation.

## Practical example

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="description" content="Simple recipes and cooking notes.">
    <title>Recipe notes</title>
    <link rel="stylesheet" href="/styles/site.css">
  </head>
  <body>
    <header><a href="/">Recipe notes</a></header>
    <main>
      <h1>Vegetable soup</h1>
      <p>A simple weeknight recipe.</p>
    </main>
  </body>
</html>
```

The viewport declaration helps a mobile browser use the device width when
laying out the page. A meaningful title identifies the page in browser tabs,
history, and search results.

## Developer perspective and terminology

Use one clear page-level heading, meaningful section headings, and landmarks
such as `header`, `nav`, `main`, and `footer` when they match the content.
**Element** means a named part of the document; an **attribute** configures an
element; the **DOM** is the browser's parsed, in-memory representation.

## Common misconceptions

- HTML is not a visual layout language; use CSS for presentation.
- Browsers accepting malformed markup does not mean the structure is correct.
- `head` and `header` are different: one contains document metadata, the
  other is content within the page.
- `async` and `defer` have different scheduling behavior; neither should be
  added blindly to a script that depends on parsing order.

## Further learning

- [MDN: Basic HTML syntax](https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Structuring_content/Basic_HTML_syntax)
- [WHATWG: HTML syntax](https://html.spec.whatwg.org/multipage/syntax.html)
