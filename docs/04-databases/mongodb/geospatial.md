# Geospatial Queries

MongoDB supports geospatial data using GeoJSON objects and legacy coordinate pairs. GeoJSON uses longitude before latitude and stores geometry in a field such as location.

~~~javascript
db.places.createIndex({ location: "2dsphere" })
db.places.find({
  location: {
    $near: {
      $geometry: { type: "Point", coordinates: [77.5946, 12.9716] },
      $maxDistance: 5000
    }
  }
})
~~~

A 2dsphere index supports spherical geometry operations and GeoJSON. A 2d index supports legacy planar coordinate pairs. Operators include $near, $geoWithin, and $geoIntersects, with behavior depending on index type and geometry.

Validate coordinate order, coordinate ranges, and geometry shape at the application boundary. Geospatial queries can be expensive if the search region is broad; constrain them with additional predicates and limits when appropriate. See [geospatial queries](https://www.mongodb.com/docs/manual/geospatial-queries/) and [2dsphere indexes](https://www.mongodb.com/docs/manual/core/indexes/index-types/geospatial/2dsphere/).
