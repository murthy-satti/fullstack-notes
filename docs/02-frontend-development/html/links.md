# HTML Links

Links connect one resource to another. They let people navigate to another
page, jump to a section, start an email, or call a phone number.

## The `<a>` element and its attributes

An anchor becomes a link when it has an `href`.

| Attribute | Meaning |
|---|---|
| `href` | Destination URL, fragment, email address, or phone number |
| `target` | Browsing context; `_blank` requests another tab or window |
| `rel` | Describes the relationship to the destination; useful with `_blank` |
| `download` | Suggests downloading a permitted resource |
| `hreflang` | Language of the linked resource |
| `type` | Hint about the linked resource's media type |

```html
<a href="/lessons/html/images/">Learn about HTML images</a>
<a href="https://developer.mozilla.org/" target="_blank"
   rel="noopener noreferrer">Read MDN (opens in a new tab)</a>
<a href="#examples">Jump to examples</a>
<a href="mailto:hello@example.com">Email us</a>
```

For a new browsing context, `rel="noopener"` prevents the destination from
controlling the opener page in supporting browsers; `noreferrer` also
suppresses referrer information. Modern browsers generally imply `noopener`
for `_blank`, but stating the relationship explicitly is clear.

## Choose links or buttons

Use an anchor for navigation to a URL. Use a `<button>` for an action such
as submitting a form, opening a dialog, or changing the current interface.
Do not use `href="#"` as a substitute for a button.

## Developer perspective and common mistakes

Write link text that makes sense out of context, such as “Read the HTML
forms guide” rather than “click here.” Ensure keyboard focus is visible.
Check that internal links still resolve after moving pages.

## Check your understanding

1. Which attribute defines where a link navigates?
2. When should a button be used instead of an anchor?
3. Why is “click here” weak link text?

## Further learning

- [MDN: `<a>`](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/a)
- [W3C WAI: Link purpose](https://www.w3.org/WAI/WCAG22/Understanding/link-purpose-in-context.html)
