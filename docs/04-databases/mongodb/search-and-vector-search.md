# MongoDB Search and Vector Search

MongoDB Search provides indexed full-text retrieval with analyzers, relevance scoring, facets, autocomplete, and other search operators. Search queries are expressed through aggregation stages and rely on a dedicated search index. It is distinct from ordinary B-tree indexes and the legacy $text operator.

Vector Search retrieves documents by similarity to an embedding. It supports approximate or exact nearest-neighbor modes depending on deployment and version. Hybrid retrieval combines lexical search, vector relevance, and metadata filters. Embeddings must be generated and versioned consistently with the model that produced them.

Design indexes for the fields and analyzers used by the search workload. Evaluate relevance with representative queries and data; do not assume vector similarity alone produces useful results. Search features, availability, and syntax vary between Atlas and self-managed releases, so check current deployment requirements.

See [MongoDB Search](https://www.mongodb.com/docs/atlas/atlas-search/) and [Vector Search](https://www.mongodb.com/docs/atlas/atlas-vector-search/).
