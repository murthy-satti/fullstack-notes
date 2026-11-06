# HTML Elements and Global Attributes

HTML is made from elements. An element can have a start tag, content, and an
end tag; some elements are void and have no end tag or child content. An
attribute adds configuration or information to an element.

## Element anatomy

```html
<a href="/lessons" class="primary-link">Browse lessons</a>
```

- `a` is the element name.
- `href` and `class` are attributes.
- The text is the element's content.

Attribute values should be quoted. HTML tag names and attribute names are
case-insensitive in HTML documents, but lowercase is the conventional style.
Void elements include `img`, `br`, `hr`, `input`, `meta`, `link`, `source`,
`track`, and `area`; do not write closing tags for them in HTML.

## Global attributes

Global attributes can be used on most HTML elements, subject to the rules
for each element.

| Attribute | Meaning | Example |
|---|---|---|
| `id` | Unique identifier in the document | `<section id="pricing">` |
| `class` | One or more CSS/JS classification tokens | `<p class="lead muted">` |
| `title` | Advisory text, often shown as a tooltip | `<abbr title="HyperText Markup Language">HTML</abbr>` |
| `lang` | Language of the element's text | `<html lang="en">` |
| `dir` | Text direction: `ltr`, `rtl`, or `auto` | `<p dir="auto">...</p>` |
| `hidden` | Indicates content is not currently relevant and should be hidden | `<div hidden>...</div>` |
| `tabindex` | Controls focusability and sequential focus order | `<div tabindex="0">...</div>` |
| `contenteditable` | Makes an element's content editable | `<p contenteditable="true">Draft</p>` |
| `data-*` | Stores custom data for scripts | `<button data-product-id="p7">Add</button>` |
| `style` | Inline CSS declarations | `<p style="color: navy">Text</p>` |
| `spellcheck` | Requests spell checking for editable text | `<textarea spellcheck="true"></textarea>` |
| `draggable` | Controls whether an element can be dragged | `<img draggable="false" ...>` |
| `autofocus` | Requests initial focus when a page or dialog opens | `<input autofocus>`; use sparingly |
| `inert` | Makes a subtree non-interactive and unavailable to assistive technology | `<div inert>...</div>` |
| `popover` | Declares an element as a popover target | `<div popover id="help">...</div>` |
| `translate` | Hints whether text should be translated | `<span translate="no">API</span>` |
| `accesskey` | Defines a keyboard shortcut hint | `<button accesskey="s">Save</button>` |

`aria-*` attributes add accessibility semantics when native HTML is not
sufficient. Use the correct native element first; ARIA does not add keyboard
behavior or validation by itself. Avoid positive `tabindex` values such as
`tabindex="3"` because they create a confusing focus order.

On inputs, `inputmode` hints which virtual keyboard to show and `enterkeyhint`
hints the action label for the Enter key. These are hints and do not validate
the entered value.

## Common attributes on important elements

| Element | Common attributes | Purpose |
|---|---|---|
| `a` | `href`, `target`, `rel`, `download` | Destination and navigation behavior |
| `img` | `src`, `alt`, `width`, `height`, `loading`, `srcset`, `sizes` | Image source, alternative, dimensions, and responsive loading |
| `form` | `action`, `method`, `enctype`, `autocomplete`, `novalidate` | Submission destination and behavior |
| `input` | `type`, `name`, `value`, `required`, `placeholder`, `autocomplete`, `min`, `max`, `pattern` | Form field type, submitted value, and constraints |
| `script` | `src`, `type`, `async`, `defer`, `integrity`, `crossorigin` | Script source, scheduling, and integrity |
| `link` | `rel`, `href`, `media`, `hreflang` | Relationship to an external resource |
| `button` | `type`, `disabled`, `name`, `value` | Button behavior and submitted value |

Attributes are element-specific: for example, `required` applies to supported
form controls but not to a heading. Check the element reference before using
an attribute.

## Boolean and enumerated attributes

Boolean attributes are true when present and false when absent. For example,
`<input required>` means the control is required; `required="false"` is still
present and therefore still true. Enumerated attributes accept one of a
defined set of values, such as `dir="ltr"` or `dir="rtl"`.

## Developer perspective and misconceptions

Use semantic elements and valid attributes instead of encoding behavior in
custom names. IDs should be unique within a document. The `style` attribute
works, but reusable design belongs in CSS. `data-*` is for application data,
not a replacement for accessible names or built-in semantics.

## Further learning

- [MDN: HTML attributes reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Attributes)
- [WHATWG: HTML syntax](https://html.spec.whatwg.org/multipage/syntax.html)
- [MDN: ARIA](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA)
