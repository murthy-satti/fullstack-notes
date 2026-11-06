# HTML Tables

Tables represent data with meaningful row and column relationships. They
are useful for schedules, comparison data, and reports, but not for general
page layout.

## Table elements

| Element | Purpose |
|---|---|
| `<table>` | Contains tabular data |
| `<caption>` | Gives the table a concise title or purpose |
| `<thead>` | Groups header rows |
| `<tbody>` | Groups the main data rows |
| `<tfoot>` | Groups summary or footer rows |
| `<tr>` | Creates a row |
| `<th>` | Header cell; `scope` can identify a row or column header |
| `<td>` | Data cell |

```html
<table>
  <caption>Weekly study plan</caption>
  <thead>
    <tr>
      <th scope="col">Day</th>
      <th scope="col">Topic</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <th scope="row">Monday</th>
      <td>HTML forms</td>
    </tr>
  </tbody>
</table>
```

Use `scope="col"` or `scope="row"` for straightforward header
relationships. Complex tables may need `id` and `headers` associations or,
preferably, a simpler structure.

## Developer perspective and common mistakes

Tables should retain understandable headers on small screens; a wrapper with
horizontal scrolling may be appropriate for wide data. Do not use tables
to position unrelated interface regions. CSS Grid and Flexbox are layout
tools.

## Further learning

- [MDN: `<table>`](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/table)
- [W3C WAI: Tables](https://www.w3.org/WAI/tutorials/tables/)
