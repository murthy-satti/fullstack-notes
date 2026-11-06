# HTML Selects, Checkboxes, and Radio Buttons

Choice controls let people select one or more values from a known set.
Choose the control based on whether choices are independent, mutually
exclusive, or presented as a menu.

## Select menus

`<select>` contains `<option>` elements. Each option’s `value` is the
submitted value; its text is the label shown to the user. `<optgroup>`
organizes related options using its `label` attribute.

```html
<label for="topic">Topic</label>
<select id="topic" name="topic" required>
  <option value="">Choose a topic</option>
  <optgroup label="Frontend">
    <option value="html">HTML</option>
    <option value="css">CSS</option>
  </optgroup>
</select>
```

Useful `<select>` attributes include `name`, `required`, `disabled`,
`multiple`, and `size`. Use `multiple` when selecting several values is
appropriate and explain the interaction clearly.

## Checkboxes

Use checkboxes for independent on/off choices or when several options may
be selected. Give related controls meaningful labels. A checked checkbox
contributes its `value`; an unchecked checkbox is generally omitted.

```html
<label>
  <input type="checkbox" name="topics" value="html">
  HTML
</label>
```

## Radio buttons

Use radio buttons when exactly one option should be selected from a group.
Give options in the same group the same `name` and different `value`
attributes. A `<fieldset>` and `<legend>` can provide a group label.

```html
<fieldset>
  <legend>Preferred format</legend>
  <label><input type="radio" name="format" value="video"> Video</label>
  <label><input type="radio" name="format" value="text"> Text</label>
</fieldset>
```

## Developer perspective and common mistakes

Use a visible label for every choice and make groups understandable without
relying only on visual placement. Do not treat a selected value as trusted:
the server must validate that the value is allowed for the current user.

## Further learning

- [MDN: `<select>`](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/select)
- [MDN: Checkbox inputs](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input/checkbox)
- [MDN: Radio inputs](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input/radio)
