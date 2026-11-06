# HTML Forms

Forms collect information from people and submit it for an application to
process. A search box, account sign-in, checkout, and feedback form all use
the same core HTML form model.

## Follow the form learning path

- [Form submission](form-submission.md): the `<form>` element, `action`,
  `method`, and how names become submitted data.
- [Input types and attributes](input-types-and-attributes.md): common
  `<input>` types, their behavior, and useful attributes.
- [Selects, checkboxes, and radios](selection-controls.md): choices and
  grouped controls.
- [Form validation](form-validation.md): labels, browser constraints, error
  feedback, and server-side validation.

## A small example

```html
<form action="/search" method="get">
  <label for="query">Search lessons</label>
  <input id="query" name="q" type="search">
  <button type="submit">Search</button>
</form>
```

The label gives the control an accessible name. The `name` determines the
key included in submission. The form’s `method` and `action` determine how
and where the browser sends the data.

## Developer perspective

Native controls provide keyboard interaction, mobile input hints, and
baseline validation. They improve usability but do not replace server-side
validation, authorization, or secure transport over HTTPS.

## Check your understanding

1. Which attribute determines the submitted key for a control?
2. Why should a server validate data even when an input has `required`?
3. Which lesson explains the difference between GET and POST?

## Further learning

- [MDN: Forms](https://developer.mozilla.org/en-US/docs/Learn_web_development/Extensions/Forms)
