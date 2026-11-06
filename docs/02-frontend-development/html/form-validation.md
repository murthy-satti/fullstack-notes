# HTML Form Validation

Form validation checks whether submitted values meet expected constraints.
HTML provides useful browser-side checks, while the application server must
validate every request independently.

## Native constraint attributes

| Attribute | Typical use |
|---|---|
| `required` | Require a value or selection |
| `type="email"` / `type="url"` | Check a browser-recognized value shape |
| `min` / `max` / `step` | Bound numeric or date/time values |
| `minlength` / `maxlength` | Set a text-length range |
| `pattern` | Match a supported text value against a regular expression |
| `novalidate` | Disable native checks for a form |

These constraints help the user correct mistakes before submission. Browser
messages and exact behavior may differ. A browser check does not prove that
the value is true, safe, authorized, or even sent by the intended page.

## Label errors clearly

Associate visible labels with controls through matching `for` and `id`
values, or by nesting the control inside its label. Explain what needs to
change and keep the error close to the affected field. Do not communicate
errors by color alone.

```html
<label for="age">Age</label>
<input id="age" name="age" type="number" min="13" max="120" required>
```

For custom validation, use the browser Constraint Validation API where it
fits, but ensure server responses also identify invalid fields in an
accessible way.

## Server-side validation

On the server, validate type, length, format, allowed values, and any
business rule. Separately check authorization and ownership. Normalize or
reject unexpected values before using them in database operations or other
systems.

## Developer perspective and misconceptions

- Client-side validation is a usability aid, not a security boundary.
- `pattern` does not sanitize a value or prevent malicious requests.
- An error should explain how to fix the problem, not only say “invalid.”
- Validation does not replace output encoding or parameterized database
  operations.

## Check your understanding

1. Why must the server repeat important validation?
2. What does `required` guarantee, and what does it not guarantee?
3. How can a form error be made easier to understand for assistive-technology
   users?

## Further learning

- [MDN: Constraint validation](https://developer.mozilla.org/en-US/docs/Web/HTML/Constraint_validation)
- [W3C WAI: Forms notifications](https://www.w3.org/WAI/tutorials/forms/notifications/)
