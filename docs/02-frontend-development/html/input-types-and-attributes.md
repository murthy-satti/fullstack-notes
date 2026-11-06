# HTML Input Types and Attributes

`<input>` creates many kinds of form controls. Its `type` changes the
expected value, browser interface, validation behavior, and sometimes the
mobile keyboard.

## Common input types

| Type | Typical purpose |
|---|---|
| `text`, `search` | General text or a search query |
| `email`, `url`, `tel` | Address/contact input with browser hints |
| `password` | Conceals entered characters visually; does not encrypt or store them securely |
| `number`, `range` | Numeric value or approximate slider selection |
| `date`, `time`, `datetime-local`, `month`, `week` | Date and time values; UI varies by browser |
| `checkbox`, `radio` | Independent choices or one choice from a named group |
| `file` | Select one or more files |
| `hidden` | Submit a non-visible value; not trusted for authorization |
| `submit`, `button`, `reset` | Button-like controls; a `<button>` is often more flexible |
| `color` | Choose a color value |

## Useful attributes

| Attribute | Meaning |
|---|---|
| `name` | Key used when the value is submitted |
| `value` | Initial or current value depending on the type and state |
| `required` | Requires a value before native validation succeeds |
| `placeholder` | Short hint; does not replace a visible label |
| `autocomplete` | Describes the expected value to support browser autofill |
| `min`, `max`, `step` | Constraints for supported numeric/date inputs |
| `minlength`, `maxlength` | Text length constraints |
| `pattern` | Regular-expression constraint for supported text inputs |
| `checked` | Initial checked state for a checkbox or radio |
| `multiple` | Allows multiple values or files for supported types |
| `accept` | Suggests file types in the picker; not a security validation |
| `disabled` | Prevents use and omits the control from submission |
| `readonly` | Prevents editing while generally including the value in submission |

## Practical example

```html
<label for="account-email">Email</label>
<input id="account-email" name="email" type="email"
       autocomplete="email" required>
```

The `id` connects the label to the control, while `name` supplies the
submitted key. The browser can provide a suitable keyboard and basic
validation for the email type.

## Developer perspective and misconceptions

Select types that fit the data rather than using `text` for every field.
Use `autocomplete` tokens for common information. `accept`, `pattern`, and
`required` improve the browser experience but do not replace validation on
the server.

## Further learning

- [MDN: `<input>`](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input)
- [MDN: Input types](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input#input_types)
