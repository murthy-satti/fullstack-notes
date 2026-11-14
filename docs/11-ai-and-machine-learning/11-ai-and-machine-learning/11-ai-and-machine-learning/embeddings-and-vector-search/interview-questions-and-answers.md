# Embeddings and Vector Search Interview Questions and Answers

These questions review embedding models and dimensions, vector databases
and indexes, filtering and tenant isolation, hybrid search and reranking,
and retrieval metrics. Try answering each one before reading the answer.

## Embedding models

### 1. What is an embedding, and why is it useful for search?

An embedding is a fixed-length vector produced by a model so that inputs
with related meaning end up close together. Search becomes "find the
stored vectors nearest to the query vector", which matches paraphrases
and even other languages that share no keywords with the query. It
complements keyword search rather than replacing it.

### 2. How does an embedding model turn text into one vector?

Usually a transformer encoder tokenizes the input, produces a vector per
token, and pools them (often by averaging) into one vector with a fixed
number of dimensions, whatever the input length. Training pulls related
pairs together and pushes unrelated ones apart, so distance approximates
relatedness for the tasks it was trained on.

### 3. Why can't you compare vectors from two different embedding models?

Each model defines its own coordinate system. A cosine between vectors
from two models is a number without meaning, so mixing them in one index
silently degrades results. Store the model, version, and dimension
setting with every vector. The only exceptions are spaces a provider
explicitly documents as shared, such as Cohere's Embed 5 Pro and Fast or
Voyage's 4 series (as of November 2026).

### 4. What is asymmetric retrieval, and how do providers handle it?

Queries are short needs; documents are long answers. Many models embed
them differently: Cohere requires `inputType` (`search_query` or
`search_document`), Voyage takes `input_type`, Gemini uses task types or
task prefixes, Qwen3 Embedding expects an instruction before queries, and
sentence-transformers offers `encode_query` and `encode_document`.
OpenAI's text-embedding-3 models use the same call for both. Using the
wrong mode lowers recall without any error.

### 5. How would you choose between a hosted embedding API and an open-weight model?

Hosted APIs are fastest to adopt, often strong and multilingual, and bill
per token, but text leaves your network and the provider retires models
on its schedule. Open models need serving hardware and operations, are
cheaper at steady high volume, keep data local, and can be fine-tuned.
Shortlist two or three candidates and compare them on your own labeled
questions with recall@10.

### 6. Where should the embedding model ID live in an application?

In configuration (for example `EMBEDDING_MODEL` and `EMBEDDING_DIMENSIONS`),
never hard-coded. The evaluation, the dual-write migration, and rollback
all need to switch it without a code change, and every stored vector
should record the version that made it.

### 7. What do embedding dimensions cost?

Storage, memory, and compute all scale with dimensions. A `float32` value
is 4 bytes, so one million 1,536-dimension vectors need about 6.1 GB raw
and 3,072-dimension vectors about 12.3 GB, before index overhead. Distance
calculations scale too: 3,072 dimensions mean roughly three times the
arithmetic of 1,024.

### 8. What is Matryoshka Representation Learning?

A training method (Kusupati et al., 2022) that makes every prefix of an
embedding a useful embedding by itself, like nested dolls. You can keep
only the first 256 or 768 values of a 3,072-dimension vector and lose
quality gradually rather than suddenly. The paper reports up to 14 times
smaller embeddings at the same accuracy for ImageNet-1K classification.

### 9. How do you shorten an embedding safely?

Either ask the API for fewer dimensions (OpenAI's `dimensions`, Gemini's
`outputDimensionality`, Voyage's `output_dimension`) or slice the vector
yourself and re-normalize, because a prefix of a unit vector is shorter
than 1. It only works for Matryoshka-trained models; slicing an ordinary
model's vector discards information and can wreck results.

```ts
// Slice, then restore unit length
const short = normalize(vector.slice(0, 256));
```

### 10. When do dot product, cosine similarity, and Euclidean distance give the same ranking?

When all vectors are unit length. Then cosine equals the dot product, and
squared Euclidean distance equals `2 - 2 * cosine`, so all three sort
results identically. OpenAI documents that its embeddings are normalized
to length 1, which is why it notes that cosine can be computed with a dot
product.

### 11. What goes wrong if you use a dot-product index with vectors that are not normalized?

Longer vectors get higher scores regardless of direction, so long chunks
crowd the top of every result list. In the lesson's demo, a long,
partly related note scored 2.32 on raw dot product against 0.955 for the
note that actually matched, while cosine ranked them 0.842 and 0.997.
Normalize at write and query time or use cosine.

### 12. Can you set a fixed similarity threshold such as 0.8?

Only per model, after calibration on labeled data. Score distributions
differ widely between models, so a threshold that works for one model
returns far too much or too little with another. Prefer top-k plus a
reranker, and recalibrate any threshold after every model change.

### 13. What is a multilingual embedding model, and what should you check before relying on it?

A model trained so that texts with the same meaning in different
languages map close together, enabling cross-lingual retrieval. Check
that the family is not English-only, evaluate each language your users
write in (benchmarks such as MMTEB publish per-language results), and
remember that keyword search needs per-language analyzers.

### 14. Why do embedding models have input limits, and what do you do about them?

Models accept a maximum number of tokens per input (8,192 for OpenAI's
embedding models; 32,000 for Voyage's 4 series; 128,000 for Cohere's
Embed 5, as of November 2026). Longer text is cut or rejected, so
documents are chunked before embedding, and very long chunks also dilute
relevance.

### 15. What are `int8` and binary embeddings?

Quantized representations that store each dimension in 1 byte or 1 bit
instead of 4 bytes, cutting storage to a quarter or a thirty-second.
Recall drops somewhat; the usual remedy is two-stage retrieval: search the
compact copy with a larger candidate count, then rescore the best
candidates with full-precision vectors.

### 16. Are embeddings safe to store with weaker controls than the source text?

No. Research (Morris et al., 2023) recovered 92% of 32-token inputs
exactly from their embeddings and recovered full names from clinical
notes. Treat vectors as sensitive as the text: same access controls,
encryption, retention, and deletion.

### 17. Why must you re-embed when you change the model, and how do you do it without downtime?

Old and new vectors live in different spaces, so every stored vector must
be recomputed and the two must never share an index. Use a parallel
migration: add a second field and index, dual-write new and edited chunks,
backfill the rest in resumable batches, compare recall on an evaluation
set, cut over through configuration (canary first), keep the old field
for a rollback window, then drop it.

### 18. How long does a re-embedding backfill take?

Estimate tokens and divide by your rate limit. For example, 600,000 chunks
of 300 tokens are 180 million tokens; at 2,000,000 tokens per minute that
is at least 90 minutes of embedding time, plus retries and writes. Make
the job resumable and log progress.

## Vector databases and indexes

### 19. Why do vector databases use approximate nearest-neighbor search?

Exact search compares the query with every vector, about `N x d` work per
query, which grows linearly with the collection. ANN indexes examine only
a promising neighborhood and answer far faster, at the price of
occasionally missing a true neighbor. The miss rate is a setting you
choose.

### 20. What is recall@k for an ANN index, and how do you measure it?

The share of the true top-k neighbors (from an exact scan) that the index
returns. Take a few hundred representative queries, compute exact results
(in PostgreSQL, `SET LOCAL enable_indexscan = off` inside a transaction),
run them through the index at several settings, and compare. Recall 0.95
at k = 10 means 9.5 of the 10 true neighbors on average.

### 21. How does an HNSW index search?

It builds layered proximity graphs: each vector gets a random maximum
layer with exponentially decaying probability, so upper layers are sparse
with long links. A search starts at the top, moves greedily toward the
query, drops a layer, repeats, and finally explores the bottom layer with
a candidate list of size `ef_search` before returning the best k.

### 22. What do `m`, `ef_construction`, and `ef_search` control in pgvector?

`m` (default 16) is links per node: higher means better recall, more
memory, slower builds. `ef_construction` (default 64) is the candidate
list while building: a better graph at the cost of build time.
`hnsw.ef_search` (default 40) is the candidate list while searching:
higher recall at higher latency.

### 23. How does an IVF index work, and how can it miss a neighbor?

It runs k-means to find `lists` centroids, files every vector under its
nearest centroid, and at query time scans only the nearest `probes`
lists. A true neighbor just across a cluster boundary is missed unless
its cluster is probed. More probes raise recall and latency together.

### 24. What does pgvector recommend for IVFFlat settings?

Create the index after loading data, start with `rows / 1000` lists up to
one million rows and `sqrt(rows)` above that, and start with
`sqrt(lists)` probes (the default is 1). Rebuild when the data
distribution drifts, because the clusters reflect the data at build time.

### 25. Compare HNSW and IVF.

HNSW usually reaches higher recall at the same latency, needs no
training, accepts inserts immediately, and can be created on an empty
table, but it uses more memory and builds slowly. IVF builds fast, uses
less memory, and combines with product quantization for huge
collections, but needs representative data and periodic rebuilds. In the
lesson's measured run, HNSW took 38.4 s to build and IVFFlat 2.1 s.

### 26. Describe the recall-latency trade-off you measured.

On 50,000 clustered 128-dimension vectors in pgvector (PGlite), an exact
scan took 29.6 ms at recall 1.0. HNSW went from recall 0.647 at 1.5 ms
(`ef_search` 10) to 0.851 at 1.7 ms (40) and 0.963 at 5.1 ms (320).
IVFFlat with 50 lists went from 0.464 at 1.6 ms (1 probe) to 0.747 at
4.0 ms (8 probes). Recall climbs fast, then flattens while latency keeps
rising, so tune to a target.

### 27. How would you choose `ef_search` for production?

Pick a recall target (for example 0.95 recall@10), measure recall and
latency percentiles on representative queries at several values, choose
the cheapest setting that meets the target, and re-check as the
collection grows. Supabase's benchmark needed `ef_search` 100 for 0.98
accuracy@10 and 250 for 0.99 on its data.

### 28. What is product quantization?

A compression method that splits each vector into sub-vectors and replaces
each with the ID of its nearest centroid from a small codebook, so a
vector becomes a short code (Meta's FAISS post describes 20-byte codes).
Distances are approximated from the codes. It is how billion-scale
indexes fit in memory, usually combined with IVF (IVF-PQ).

### 29. How much memory does an HNSW index need?

Raw vectors plus graph links. For 10 million 768-dimension `float32`
vectors: 3,072 bytes each, about 30.7 GB, plus roughly 256 bytes of links
per vector at `M` = 32 (FAISS's estimate is `M x 2 x 4` bytes), about
2.6 GB more. The graph should stay in RAM, so plan for both.

### 30. When is exact search the right choice?

For small collections (tens of thousands of chunks), for small tenants
selected by a filter, and for measuring recall. It is simple and has
recall 1.0. pgvector does it without an index, MongoDB with
`exact: true`, FAISS with `IndexFlatIP` or `IndexFlatL2`.

### 31. When would you use pgvector rather than a dedicated vector database?

When PostgreSQL already holds the data: vectors sit next to relational
rows, filters are SQL, row-level security and backups already exist, and
there is no second system to sync. Choose a dedicated database when you
need billions of vectors, very heavy filtering, or thousands of strictly
isolated tenants beyond what the database handles well.

### 32. What does MongoDB Vector Search offer a MongoDB application such as TaskFlow?

Chunks stay next to notes, a `vectorSearch` index defines vector fields
(`numDimensions` up to 8,192; `cosine`, `dotProduct`, or `euclidean`;
optional `scalar` or `binary` quantization; `hnsw` or `flat`) and
`filter` fields, and the `$vectorSearch` aggregation stage queries them
with pre-filters. `$rankFusion` (MongoDB 8.0 and later) adds hybrid
search.

### 33. Write a `$vectorSearch` stage for one workspace.

```js
{ $vectorSearch: {
    index: "note_chunks_vector",
    path: "embedding",
    queryVector,
    numCandidates: 200,      // at least 20x limit; at most 10,000
    limit: 10,
    filter: { workspaceId }, // field indexed with type "filter"
} }
```

It must be the first stage of the pipeline; project the score with
`{ $meta: "vectorSearchScore" }`, which is normalized to 0 to 1.

### 34. What is FAISS, and why is it not a vector database?

FAISS is Meta's C++ and Python library of exact and approximate indexes
(flat, HNSW, IVF, PQ, on CPU and GPU). It returns positions of nearest
vectors, but storage, IDs, metadata filtering, replication, and access
control are yours to build, so it suits batch jobs and custom services
better than a multi-tenant API.

### 35. Which pgvector operator matches cosine similarity, and what does it return?

`<=>` returns cosine distance, which is `1 - cosine similarity`, and needs
an index built with `vector_cosine_ops`. `<#>` returns the negative inner
product (because PostgreSQL index scans order ascending), and `<->` is
Euclidean distance.

### 36. Why are vector indexes sometimes eventually consistent, and what do you do about it?

Some systems update the vector index asynchronously; MongoDB Vector
Search follows the collection's change stream in a separate search
process, so a just-written chunk may not be searchable for a moment.
Monitor ingestion lag, show indexing status where it matters, and avoid
read-your-write assumptions in tests.

## Filtering and tenant isolation

### 37. What is the difference between pre-filtering and post-filtering?

Post-filtering finds the nearest candidates first and then drops those
that fail the filter, which can leave few or none when the filter is
selective. Pre-filtering restricts the candidate set first and searches
only within it. Iterative or filter-aware scans sit between them: they
keep searching until enough matching results appear.

### 38. Why did a selective filter return zero rows from an HNSW index?

With `ef_search` at 40 and iterative scans off, pgvector took the 40
nearest candidates from the whole table; none belonged to a workspace
holding 0.2% of the rows, so the query returned nothing. Setting
`hnsw.iterative_scan = relaxed_order` returned 10 rows, and a B-tree index
on the filter column let PostgreSQL run an exact scan for that workspace.

### 39. What are pgvector's iterative index scans?

A pgvector 0.8 feature: with `hnsw.iterative_scan` set to `strict_order`
or `relaxed_order`, the index keeps scanning until enough rows pass the
filter, up to `hnsw.max_scan_tuples` (default 20,000). Relaxed order can
return slightly unordered rows, so wrap the query in a materialized CTE
and sort again outside it.

### 40. What are the options for isolating tenants in vector search?

From most shared to most isolated: one index with a mandatory tenant
filter (plus row-level security in PostgreSQL), a partition or shard per
tenant (PostgreSQL partitions, Weaviate tenants, Milvus partition key), a
namespace or collection per tenant (Pinecone namespaces), and a database
or cluster per tenant. Isolation, cost, and operational effort rise
together.

### 41. Where must the tenant ID come from?

From the authenticated session in server code, never from the request
body and never from a language model's tool arguments, which an attacker
can influence through prompt injection. Retrieval tools get the tenant
injected by the application.

### 42. How does PostgreSQL row-level security help with vector search?

A policy such as `USING (workspace_id = current_setting('app.workspace_id')::bigint)`
filters every query for the application role. Set the value per
transaction with `set_config('app.workspace_id', $1, true)`. Because
`current_setting` raises an error when the setting is missing, a
forgotten setting fails closed. Superusers and table owners bypass it, so
connect as a dedicated role.

### 43. Why does Pinecone recommend one namespace per tenant?

On serverless indexes each namespace is stored separately, so tenants are
physically isolated, a query only pays for the namespace it reads, and
deleting a tenant is nearly instant. A shared namespace with a metadata
filter scans every tenant's data on each query.

### 44. How do you test tenant isolation in retrieval?

Keep automated tests that search as tenant A for content that exists only
in tenant B and expect nothing, for every retrieval path (vector, keyword,
hybrid, reranked), plus tests that a missing tenant context fails rather
than returning everything.

## Hybrid search and reranking

### 45. What does keyword search catch that vector search misses?

Exact strings that carry little meaning: ticket and order numbers, error
codes, versions, names, rare terms, and quotations. Embeddings blur these
details into the gist, while BM25 gives a rare token such as `tf-1432` a
high weight in the one document that contains it.

### 46. Explain BM25.

BM25 sums, over query terms in a document, the term's inverse document
frequency times a saturating function of its frequency, discounted by
document length:

```text
IDF * f * (k1 + 1) / (f + k1 * (1 - b + b * docLength / avgDocLength))
```

`k1` controls term-frequency saturation and `b` length normalization;
Elasticsearch defaults them to 1.2 and 0.75.

### 47. Why is the text analyzer so important for hybrid search?

It decides what a term is. In the lesson's PostgreSQL run, the `english`
configuration split `TF-1432` into `tf` and `-1432`, so another ticket
matched on `tf`; without stop-word removal, "how" made a postmortem guide
the top BM25 hit. Index identifiers in an exactly matched field and check
stemming and stop words per language.

### 48. Why not just add the BM25 score and the cosine similarity?

They are on unrelated scales: BM25 is unbounded and varies by query,
cosine lies between -1 and 1. One retriever dominates the sum. Either
fuse by rank (RRF) or normalize scores first (min-max, or mean and
standard deviation as in Qdrant's DBSF) and weight them.

### 49. How does reciprocal rank fusion work?

Each document scores `sum of weight / (k + rank)` over the lists it
appears in, with ranks starting at 1 and `k` commonly 60 (Cormack et al.,
2009). Rank 1 adds 1/61 and rank 10 adds 1/70, so appearing in both lists
matters more than topping one. It needs no score calibration.

### 50. Compute RRF: document A is 3rd in BM25 and 7th in vector search; document B is 1st in vector search only. Which wins with k = 60?

A: 1/63 + 1/67 = 0.01587 + 0.01493 = 0.0308. B: 1/61 = 0.0164. A wins,
because being found by both retrievers outweighs a single first place.

### 51. Do all products use the same RRF defaults?

No. Elasticsearch's `rank_constant` defaults to 60 and MongoDB's
`$rankFusion` uses 60. As of November 2026, Qdrant's RRF uses `k = 2` with
zero-based ranks unless configured, and Weaviate's default hybrid fusion
is `relativeScoreFusion`, a score-based method. Check before comparing
systems.

### 52. How many candidates should each retriever return before fusion?

Typically 20 to 100 each; Microsoft's Azure AI Search experiments used
the top 50 from keyword and vector search. Fusion and reranking can only
reorder what the legs returned, so too few candidates caps recall.

### 53. What is the difference between a bi-encoder and a cross-encoder?

A bi-encoder embeds the query and documents separately, so document
vectors are computed once and searched quickly, but the model never sees
both texts together. A cross-encoder reads the query and one document as
a single input and outputs a relevance score: more accurate, but one
model call per pair, so it is used only to rerank a short list.

### 54. When should you add a reranker, and when not?

Add one when only the top few results matter (RAG context, a results
page, an agent picking a document) and candidates are broad. Skip it when
the candidate set is already small and precise, the latency budget is
tight, or candidate recall is the real problem, because a reranker cannot
recover a document retrieval never returned.

### 55. What are typical reranking shapes and limits?

Retrieve 50 to 150 candidates, rerank, keep 5 to 20 (Anthropic's
experiment: 150 in, 20 out). As of November 2026, Cohere's Rerank 5
models accept 32,768 tokens of query plus document and Voyage's rerankers
up to 1,000 documents per request; long chunks are truncated or split,
so chunk to fit.

### 56. How do you keep a reranker from hurting availability and latency?

Give it a short timeout and few retries, fall back to the fused order on
failure, cap candidate count and chunk length, and monitor latency and
fallback rate. Results reference candidates by index, so IDs and tenant
checks stay in your code.

### 57. What evidence shows that hybrid search and reranking help?

Anthropic reported that contextual embeddings plus contextual BM25 cut
retrieval failures (1 minus recall@20) by 49%, and adding reranking by
67%. Microsoft reported NDCG@3 of 40.6 for keyword, 43.8 for vector, 48.4
for hybrid with RRF, and 60.1 with its semantic reranker. BEIR found BM25
a robust baseline and rerankers best zero-shot, at high computational
cost.

## Retrieval metrics and evaluation

### 58. Define recall@k, MRR, and nDCG@k.

Recall@k is relevant results in the top k divided by all relevant
results. MRR is the mean over queries of 1 divided by the rank of the
first relevant result. nDCG@k sums each result's gain (often
`2^grade - 1`) divided by `log2(position + 1)` and divides by the same sum
for the ideal ordering, so 1.0 means perfect order.

### 59. Which metric fits which stage?

Recall@k with a large k (50 to 150) for candidate generation, because
anything missed there is lost. nDCG@k or MRR with a small k for the final
order the model or user sees. Precision@k shows how much noise reaches
the context window.

### 60. Two lists have the same recall@3. How can one be much better?

Recall ignores order. In the lesson's example both lists had recall@3 of
0.667, but the fused list put both answers first: MRR 1.0 against 0.5 and
nDCG@3 0.958 against 0.664.

### 61. Compute recall@3 and reciprocal rank for grades 0, 3, 0, 1, 3 at positions 1 to 5, with three relevant documents in total.

The top 3 contain one relevant document (position 2), so recall@3 is 1/3
= 0.333. The first relevant result is at position 2, so the reciprocal
rank is 0.5.

### 62. How would you build a retrieval evaluation set for TaskFlow?

Collect 100 to 300 queries from logs and support tickets, including
ID-heavy, name, multilingual, and no-answer queries. Have people who know
the content grade the chunks that answer each (3 answers it, 1 related),
record the workspace for tenant checks, version the set, and run every
configuration over it, reporting metrics per query type.

### 63. Why is a strong offline metric not enough?

The evaluation set can drift from real traffic (new features, languages,
more ID searches), and retrieval quality is not answer quality. Refresh
the set from recent logs, segment by query type, and pair offline metrics
with online signals and end-to-end RAG evaluation.

## Scenario-based questions

### 64. After switching to a new embedding model, answer quality dropped sharply but nothing errors. What do you check?

**What to check first:** the `embeddingVersion` values stored in the index
and the model used for query embeddings.

**How to confirm:** count chunks per version and run the evaluation set
against the index, comparing recall@10 with the previous release.

**Likely causes and fixes:** queries embedded with the new model are
being compared with documents embedded by the old one, or one index holds
both spaces. Roll the query path back, finish the backfill into a
separate field and index, evaluate, then cut over. See
[embedding models and dimensions](embedding-models-and-dimensions.md).

### 65. You shortened vectors from 1,536 to 512 dimensions to save memory and recall collapsed. Why?

**What to check first:** whether the model supports Matryoshka shortening
and whether the shortened vectors were re-normalized.

**How to confirm:** check the norms of stored vectors and measure recall
at several sizes on the evaluation set.

**Likely causes and fixes:** the model was not trained for truncation, or
sliced vectors were left shorter than unit length in a dot-product index.
Use the API's dimensions parameter or re-normalize, and choose a
Matryoshka model if you need small vectors. See
[embedding models and dimensions](embedding-models-and-dimensions.md).

### 66. The same few long documents appear at the top of almost every search. What is wrong?

**What to check first:** the index metric and whether vectors are unit
length.

**How to confirm:** compute the norms of the top-ranked vectors and
re-rank a sample with cosine similarity.

**Likely causes and fixes:** a dot-product index over vectors that are not
normalized, so length wins over direction. Normalize at write and query
time, or switch the index to cosine. See
[embedding models and dimensions](embedding-models-and-dimensions.md).

### 67. Users in small workspaces get zero or two results while large workspaces work fine. What is happening?

**What to check first:** how the tenant filter is applied (post-filter,
pre-filter, or iterative scan) and the candidate settings.

**How to confirm:** run the same query with a larger `ef_search` or
`numCandidates`, or with exact search, and see whether results appear.

**Likely causes and fixes:** post-filtering of a small ANN candidate list.
Enable pgvector iterative scans, index the filter field for
pre-filtering, raise `numCandidates`, or use a flat index, partition, or
namespace for small tenants. See
[vector databases and indexes](vector-databases-and-indexes.md).

### 68. A customer reports seeing another company's note in an AI answer. What do you do?

**What to check first:** the retrieval logs for that request: which query
ran, with which tenant filter, against which index.

**How to confirm:** reproduce with the same inputs and run cross-tenant
tests on every retrieval path, including hybrid and reranked ones.

**Likely causes and fixes:** a path without the tenant filter (often the
keyword leg), a tenant taken from the request body or tool arguments, or
a stale copy in a second store. Fix the path, take the tenant from the
session, add row-level security or namespaces, and treat it as a security
incident. See [vector databases and indexes](vector-databases-and-indexes.md).

### 69. Recall@10 on your monitoring queries has slipped every month for half a year with no code changes. Why?

**What to check first:** collection size growth and the ANN settings
(`ef_search`, `probes`, `numCandidates`).

**How to confirm:** compare index results with exact search on the same
queries now and against the original measurements.

**Likely causes and fixes:** settings tuned for a smaller collection, or
IVF clusters built on old data. Retune to the recall target, rebuild IVF
indexes, and schedule recall checks. See
[vector databases and indexes](vector-databases-and-indexes.md).

### 70. Vector search p99 latency jumped and the database server is swapping. What do you do?

**What to check first:** index size against available memory.

**How to confirm:** compare the HNSW index size (vectors plus graph) with
RAM, and watch disk reads during queries.

**Likely causes and fixes:** the graph no longer fits in memory. Add
memory, store `halfvec` or quantized vectors with rescoring, shorten
dimensions with a Matryoshka model, or move to a disk-based index. See
[vector databases and indexes](vector-databases-and-indexes.md).

### 71. A note saved a few seconds ago does not show up in search. Is it a bug?

**What to check first:** whether the vector index is updated
asynchronously and how long ingestion takes.

**How to confirm:** measure the delay between the write and the first
successful search, and check the ingestion queue or change-stream lag.

**Likely causes and fixes:** eventual consistency (MongoDB Vector Search
follows the change stream) or a delayed embedding job. Monitor lag, show
indexing status, and do not assume read-your-write in tests. See
[vector databases and indexes](vector-databases-and-indexes.md).

### 72. Searching for "TF-1432" returns a different ticket first. How do you fix it?

**What to check first:** what the text analyzer does to the identifier and
whether a keyword leg runs at all.

**How to confirm:** inspect the parsed query (in PostgreSQL,
`plainto_tsquery('english', 'TF-1432')`) and the tokens stored for the
document.

**Likely causes and fixes:** the analyzer split the ID into `tf` and
`-1432`, so other tickets matched on `tf`, or only vector search runs.
Index identifiers in an exactly matched field, route ID-shaped queries to
exact lookup, and keep BM25 in a hybrid pipeline. See
[hybrid search and reranking](hybrid-search-and-reranking.md).

### 73. After enabling hybrid search, long conversational questions got worse results than vector-only. Why?

**What to check first:** per-query-type metrics and the keyword leg's
results for those queries.

**How to confirm:** compare nDCG for vector-only, keyword-only, and hybrid
on conversational queries, and look at the fused ranks.

**Likely causes and fixes:** a noisy keyword leg (OR queries, missing stop
words) pushes good semantic hits down through fusion. Tune the analyzer,
lower the keyword weight for conversational queries, or rerank the fused
candidates. See [hybrid search and reranking](hybrid-search-and-reranking.md).

### 74. Answer latency doubled after you added a reranker. What do you look at?

**What to check first:** the rerank span in traces, candidate count, and
average candidate length.

**How to confirm:** plot rerank latency against candidates per request
and check timeouts and fallback rate.

**Likely causes and fixes:** too many or too long candidates per request.
Rerank fewer candidates, trim chunks to the model's limit, set a timeout
with a fallback to fused order, and cache repeated queries. See
[hybrid search and reranking](hybrid-search-and-reranking.md).

### 75. Answers miss facts that appear near the end of long chunks, even though the right chunks are retrieved. Why?

**What to check first:** chunk lengths against the reranker's and the
embedding model's token limits.

**How to confirm:** find the token position of the missed facts and the
truncation settings (Cohere's `maxTokensPerDoc` defaults to 4,096).

**Likely causes and fixes:** truncation inside the reranker or embedding
model. Chunk to fit the limits, keep headings with each chunk, and check
the provider's truncation behavior. See
[hybrid search and reranking](hybrid-search-and-reranking.md).

### 76. The assistant now says "I found nothing relevant" far more often after a model change. What happened?

**What to check first:** any fixed similarity or relevance threshold in
the retrieval path.

**How to confirm:** plot score distributions for relevant and irrelevant
results under the old and new models on labeled data.

**Likely causes and fixes:** a threshold calibrated for the old model.
Recalibrate per model on labeled data or rely on top-k plus a reranker
with a calibrated score. See
[embedding models and dimensions](embedding-models-and-dimensions.md).

### 77. Offline nDCG is stable but user thumbs-down on answers keeps rising. What do you do?

**What to check first:** how recent the evaluation set is and how today's
query mix compares with it.

**How to confirm:** sample recent queries, label them, and compare
metrics with the existing set, broken down by query type.

**Likely causes and fixes:** the evaluation set no longer reflects
traffic (new features, languages, ID searches), or the failures are in
generation rather than retrieval. Refresh the set, report per segment,
and evaluate end-to-end answers as in
[evaluating and debugging RAG](../retrieval-augmented-generation/evaluating-and-debugging-rag.md).
See [hybrid search and reranking](hybrid-search-and-reranking.md).

## Further learning

- [Embedding models and dimensions](embedding-models-and-dimensions.md) ·
  [Vector databases and indexes](vector-databases-and-indexes.md) ·
  [Hybrid search and reranking](hybrid-search-and-reranking.md)
- [OpenAI: Embeddings guide](https://developers.openai.com/api/docs/guides/embeddings)
- [pgvector README](https://github.com/pgvector/pgvector)
- [MongoDB: Vector Search stage](https://www.mongodb.com/docs/vector-search/query/aggregation-stages/vector-search-stage/)
- [Elasticsearch: Reciprocal rank fusion](https://www.elastic.co/docs/reference/elasticsearch/rest-apis/reciprocal-rank-fusion)
- Back to the [embeddings and vector search overview](../embeddings-and-vector-search.md).
