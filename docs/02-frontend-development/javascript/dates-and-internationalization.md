# JavaScript Dates and Internationalization

JavaScript's `Date` object represents an instant in time as milliseconds
from the Unix epoch. Formatting that instant for people is a separate task;
the `Intl` APIs provide locale-aware formatting.

## Create and inspect dates

```js
const now = new Date();
const launch = new Date("2026-11-06T09:00:00Z");

console.log(launch.getTime()); // milliseconds since the epoch
console.log(launch.toISOString()); // standardized UTC representation
```

Prefer ISO date-time strings with an explicit timezone when parsing. Date
strings without timezone information can be interpreted as local time
depending on their form; avoid ambiguous input. `Date` stores an instant,
not a timezone or the user's calendar preferences.

## Locale-aware formatting

```js
const formatted = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kolkata",
}).format(launch);
```

`toLocaleString()` is a convenient instance method that also formats
according to locale and options:

```js
launch.toLocaleString("en-IN", {
  dateStyle: "long",
  timeZone: "Asia/Kolkata",
});
```

Available locale data and default locale vary by environment. Supply a
locale and timezone when predictable user-facing output is important.

## Date arithmetic and common pitfalls

Date getters such as `getFullYear()` use local time; `getUTCFullYear()` uses
UTC. Month indexes in several `Date` constructors and methods start at zero.
Daylight-saving changes and timezone offsets make manual arithmetic in
fixed numbers of milliseconds error-prone for calendar operations.

For complex calendar and timezone calculations, use a well-maintained
date-time library or carefully scoped `Intl` APIs rather than assuming a
date is just a formatted string.

## Developer perspective and misconceptions

- A `Date` is not stored as a human-readable formatted string.
- An ISO timestamp ending in `Z` is in UTC.
- `toLocaleString()` output can differ by locale and runtime.
- A date without timezone context can be interpreted differently than
  intended.

## Check your understanding

1. What does a `Date` object's numeric value represent?
2. Why should a timestamp include timezone context?
3. How can `Intl.DateTimeFormat` help?
4. Do locale-formatted strings have a single universal output?

## Further learning

- [MDN: Date](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date)
- [MDN: `Intl.DateTimeFormat`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat)
- [MDN: `Date.prototype.toLocaleString`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/toLocaleString)
