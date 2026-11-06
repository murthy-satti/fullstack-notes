# JavaScript Strings and Type Conversion

Strings represent text. JavaScript also converts values between types, either
explicitly through code or implicitly through coercion. Understanding both
helps avoid surprising comparisons, formatting bugs, and invalid input.

## Creating strings

Single quotes, double quotes, and backticks create strings. Template
literals use backticks and can include expressions with `${...}`:

```js
const name = "Mina";
const greeting = `Hello, ${name}!`;
const multiline = `First line
Second line`;
```

Quoted strings can use escape sequences when a literal character would
otherwise end the string or be difficult to type:

| Escape | Meaning |
|---|---|
| `\n` | New line |
| `\t` | Horizontal tab |
| `\\` | Backslash |
| `\'` / `\"` | Quote characters |
| `` \` `` | Backtick inside a template literal |

```js
const report = "Name:\tMina\nStatus:\tReady";
```

Strings are immutable: methods return new strings rather than changing the
original value.

## Useful string operations

| API | Purpose |
|---|---|
| `length` | Number of UTF-16 code units; not always the number of visible characters |
| `includes(value)` | Test whether a substring occurs |
| `startsWith(value)`, `endsWith(value)` | Check a prefix or suffix |
| `slice(start, end)` | Return part of a string |
| `trim()` | Remove whitespace at both ends |
| `toLowerCase()`, `toUpperCase()` | Change letter casing |
| `replace(search, replacement)` | Replace a match; use `replaceAll` or a global regular expression for all matches |
| `split(separator)` | Produce an array of parts |

```js
const email = "  MINA@example.com ";
const normalized = email.trim().toLowerCase();
```

Do not treat `length` as a count of user-perceived characters for all
Unicode text. Emoji and combined characters may occupy multiple code units.

## Explicit conversion

Use conversion functions when the expected type is known:

```js
const quantity = Number("12");    // 12
const invalid = Number("twelve"); // NaN
const label = String(12);          // "12"
const enabled = Boolean("");       // false
```

`parseInt` and `parseFloat` parse a numeric prefix, and `parseInt` should
usually be given a radix such as `10`. Use `Number.isNaN(value)` to test for
the `NaN` value.

## Coercion and common pitfalls

The `+` operator can add numbers or concatenate strings. Loose equality
(`==`) converts values in ways that can be surprising; strict equality
(`===`) avoids most implicit conversion.

```js
"5" + 1;   // "51"
"5" - 1;   // 4
Number(""); // 0
Boolean("false"); // true: non-empty strings are truthy
```

Convert form values deliberately: input values are usually strings even
when the control looks numeric. Validate the result and handle `NaN`.

## Developer perspective and misconceptions

String conversion is not HTML escaping, URL encoding, or input validation.
Use context-appropriate APIs when inserting data into HTML, URLs, or SQL.

## Check your understanding

1. Why does `"5" + 1` differ from `"5" - 1`?
2. What does `Number("twelve")` produce?
3. Why is `Boolean("false")` true?
4. Does `string.length` always count visible characters?

## Further learning

- [MDN: Text formatting](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Text_formatting)
- [MDN: Type conversion](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Grammar_and_types#type_conversion)
- [ECMAScript: Abstract operations](https://tc39.es/ecma262/)
