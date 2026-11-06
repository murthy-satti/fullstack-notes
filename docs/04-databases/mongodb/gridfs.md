# GridFS and Large Files

BSON documents have a 16 MiB size limit. GridFS stores a file as metadata and chunks in collections, allowing a driver to stream content larger than one document. Drivers provide upload and download APIs.

GridFS can fit applications that need file metadata queries or want content managed through MongoDB's access model. Object storage is often a better choice for large media delivery, lifecycle management, and cost. Compare network, backup, and operational costs before choosing.

A file spans multiple documents, so it does not behave as one atomic document update. Failed uploads can leave partial chunks that need cleanup. Define versioning and deletion rules, and store metadata such as owner, content type, size, and checksum deliberately. Never trust user-supplied filenames or MIME types for access control or content safety.

See the [GridFS manual](https://www.mongodb.com/docs/manual/core/gridfs/).
