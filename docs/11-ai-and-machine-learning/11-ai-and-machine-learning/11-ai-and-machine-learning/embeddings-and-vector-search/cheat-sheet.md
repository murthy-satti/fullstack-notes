# Embeddings and Vector Search Cheat Sheet

Quick revision of the embeddings and vector search lessons, for the day
before an interview or a retrieval task.

## Key configuration

```sql
-- pgvector: the index (migration) and per-query settings (inside a transaction)
CREATE INDEX note_chunks_embedding_hnsw
  ON note_chunks USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

SET LOCAL hnsw.ef_search = 100;                 -- more candidates: higher recall, slower
SET LOCAL hnsw.iterative_scan = relaxed_order;  -- keep scanning when a filter is selective
SET LOCAL enable_indexscan = off;               -- exact search, to measure recall
```

```js
// src/search/mongo-vector-search.ts (excerpt): must be the first pipeline stage
{ $vectorSearch: {
    index: "note_chunks_vector", path: "embedding", queryVector,
    numCandidates: 200, limit: 10,     // at least 20 x limit, at most 10,000
    filter: { workspaceId },           // field indexed with type "filter"
} }
```

```text
cosine(a, b)  = dot(a, b) / (norm(a) * norm(b))
unit vectors:   cosine = dot product, and squared Euclidean distance = 2 - 2 * cosine
RRF(d)        = sum over result lists of weight / (k + rank), k = 60, ranks from 1
recall@k      = relevant found in top k / all relevant
MRR           = mean of 1 / rank of the first relevant result
nDCG@k        = DCG@k / ideal DCG@k, where DCG@k = sum of (2^grade - 1) / log2(position + 1)
```

| Operator or setting | Meaning |
|---|---|
| pgvector `<=>`, `<#>`, `<->` | Cosine distance (1 - cosine), negative inner product, Euclidean distance |
| MongoDB `similarity` | `cosine`, `dotProduct` (unit vectors only), or `euclidean` |
| MongoDB `exact: true` | Exact search; `numCandidates` is then omitted |
| FAISS `IndexFlatIP` after `normalize_L2` | Exact cosine search |
| FAISS `efSearch`, `nprobe` | HNSW candidate list size, IVF clusters scanned |

## Decision guide

| If you need | Choose | Why |
|---|---|---|
| A prototype over mostly English text | A hosted embedding model at its default size | Fastest start, nothing to operate |
| Text that must not leave your network | An open-weight model on your own hardware | Data stays local; you decide when to upgrade |
| Questions in several languages | A multilingual model, evaluated per language | Average scores hide weak languages |
| Millions of chunks in a memory-bound index | A Matryoshka model at 256 to 768 dimensions, or `int8` or binary with rescoring | Less memory for a small recall cost |
| Under about 100,000 chunks, or one small tenant | Exact search or a flat index | Recall 1.0 and fast enough |
| Vectors next to existing data | pgvector (PostgreSQL) or MongoDB Vector Search (TaskFlow) | One system to secure, back up, and filter |
| Many tenants and no database to run | A managed vector database with a namespace per tenant | Isolation and deletion handled by the service |
| Queries that mix language with IDs and names | Hybrid search with RRF | Keyword and vector search fail on different queries |
| Answers built from the top few chunks | Hybrid plus a reranker over 50 to 150 candidates | Cross-encoders order a short list best |

## Numbers and defaults to remember

- Raw `float32` storage is 4 bytes per dimension: one million vectors
  take 6.1 GB at 1,536 dimensions and 12.3 GB at 3,072. `int8` is a
  quarter of that, binary a thirty-second.
- pgvector: HNSW `m` 16, `ef_construction` 64, `hnsw.ef_search` 40;
  IVFFlat `lists` = rows / 1000 up to 1M rows, then sqrt(rows); start
  with sqrt(lists) probes (default 1); `hnsw.max_scan_tuples` 20,000.
  HNSW indexes up to 2,000 dimensions for `vector`, 4,000 for `halfvec`.
- MongoDB Vector Search: `numDimensions` up to 8,192; `numCandidates` at
  least 20 times `limit`, at most 10,000; the `flat` method suits
  prefilters matching under 5% of documents; scores run from 0 to 1.
- RRF with k = 60: rank 1 adds 1/61 (0.0164), rank 10 adds 1/70 (0.0143).
  Qdrant's RRF uses k = 2 with zero-based ranks, and Weaviate's default
  hybrid fusion is score-based.
- BM25 in Elasticsearch: `k1` 1.2 and `b` 0.75.
- Rerank shape: 50 to 150 candidates in, 5 to 20 out. Cohere's Rerank 5
  takes 32,768 tokens of query plus document; `maxTokensPerDoc` defaults
  to 4,096 (as of November 2026).
- Backfill time is tokens divided by the tokens-per-minute limit: 140
  million tokens at 1,000,000 per minute take at least 140 minutes.

## Top mistakes

- **Mixing two models or versions in one index.** Store an
  `embeddingVersion` with every vector and migrate through a second field
  and index.
- **Shortening vectors from a model not trained for it, or without
  re-normalizing.** Use a Matryoshka model, prefer the API's dimensions
  setting, and re-normalize after slicing.
- **A dot-product index over vectors that are not unit length.**
  Normalize at write and query time, or index with cosine.
- **Post-filtering a selective tenant filter.** Enable pgvector iterative
  scans, pre-filter on indexed fields, or give small tenants a flat index
  or partition.
- **Taking the tenant ID from the request body or a tool argument.**
  Derive it from the session and back it with row-level security or
  namespaces.
- **Adding BM25 scores and cosine similarities together.** Fuse by rank
  with RRF, or normalize the scores first.
- **Expecting a reranker to fix missing results.** Raise candidate
  recall first; a reranker only reorders what retrieval returned.
- **Reusing a similarity threshold after a model change.** Recalibrate
  it on labeled data for each model.

## Where to go deeper

- [Embedding models and dimensions](embedding-models-and-dimensions.md)
- [Vector databases and indexes](vector-databases-and-indexes.md)
- [Hybrid search and reranking](hybrid-search-and-reranking.md)
- [Embeddings and vector search interview questions and answers](interview-questions-and-answers.md)

Back to the [Embeddings and vector search overview](../embeddings-and-vector-search.md).
