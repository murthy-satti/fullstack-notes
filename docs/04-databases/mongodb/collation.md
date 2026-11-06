# Collation and String Comparison

Collation defines language-aware string comparison rules, including case and accent handling. Without an explicit collation, MongoDB uses simple binary comparison. Collation can be specified on a collection or on supported operations and indexes.

~~~javascript
db.users.createIndex(
  { displayName: 1 },
  { collation: { locale: "en", strength: 2 } }
)
db.users.find({ displayName: "ada" })
  .collation({ locale: "en", strength: 2 })
~~~

An operation's collation must be compatible with an index for the index to support string comparisons. A collection default collation can affect operations that do not specify one. Collation is not equivalent to normalizing stored strings; consider product requirements around case folding, accents, and locale sorting.

Use consistent collation across index creation and query execution. Test with representative Unicode values and check explain output. See [collation](https://www.mongodb.com/docs/manual/reference/collation/).
