# ObjectIds and Identifier Design

MongoDB requires each document to have a unique _id within its collection. If the client omits it, MongoDB drivers commonly generate an ObjectId. ObjectIds are 12-byte BSON values that include a timestamp component and additional bytes designed to make collisions very unlikely across processes.

The timestamp can help roughly order creation, but ObjectIds are not a strict global clock, sequence, or reliable business timestamp. Client clocks can differ and values can be generated before insertion. Store a separate BSON Date for event or creation time when that meaning matters.

Applications can use UUIDs, strings, or other supported BSON values as _id. Choose one stable type and format across references; type mismatches affect equality matching and index behavior. If an identifier is supplied by the client, validate its format and uniqueness. A unique index can enforce other business identifiers such as email or external order number.

See [BSON ObjectId](https://www.mongodb.com/docs/manual/reference/bson-types/#objectid) and [document structure](https://www.mongodb.com/docs/manual/core/document/).
