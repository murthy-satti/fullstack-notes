# HTML Form Submission

Form submission turns named control values into data and sends that data to
a destination. Knowing the browser’s submission model helps developers
choose appropriate methods and process requests safely.

## The `<form>` element

| Attribute | Purpose |
|---|---|
| `action` | URL that processes the submission; defaults to the current URL |
| `method` | `get` or `post`; controls how form data is sent |
| `enctype` | Encoding for the request body; use `multipart/form-data` for file uploads with POST |
| `autocomplete` | Hints whether browser autofill is appropriate |
| `novalidate` | Disables native constraint validation for this form |
| `target` | Browsing context where the response should be displayed |

GET is suitable for safe retrieval such as search. Form values are encoded
into the URL, making the result shareable and bookmarkable. Do not use GET
for passwords or state-changing actions. POST sends form data in the request
body, but HTTPS is still necessary to protect it in transit.

## How values are submitted

1. A user submits the form with a submit button or keyboard action.
2. The browser checks applicable native constraints unless validation is
   disabled.
3. Enabled controls with a `name` contribute name-value pairs.
4. The browser encodes the values according to the method and encoding type.
5. The browser sends the request to the form’s `action`.

Controls without a `name` are generally not included. Disabled controls are
not successful controls and are omitted. The server must treat all received
values as untrusted.

## Practical example

```html
<form action="/search" method="get">
  <label for="search-query">Search lessons</label>
  <input id="search-query" name="q" type="search">
  <button type="submit">Search</button>
</form>
```

A search for `HTTP basics` can produce a URL similar to
`/search?q=HTTP+basics`, which can be revisited or shared.

## Developer perspective and misconceptions

Use a server route or application handler to validate and process
submissions. `method="post"` does not encrypt data, and a hidden or disabled
control is not a security boundary. Protect state-changing requests against
cross-site request forgery where relevant to the application's
authentication model.

## Check your understanding

1. Why is GET useful for search forms?
2. What happens to a control that has a value but no `name`?
3. Does using POST make a request confidential without HTTPS?

## Further learning

- [MDN: `<form>`](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/form)
- [MDN: Sending form data](https://developer.mozilla.org/en-US/docs/Learn_web_development/Extensions/Forms/Sending_and_retrieving_form_data)
