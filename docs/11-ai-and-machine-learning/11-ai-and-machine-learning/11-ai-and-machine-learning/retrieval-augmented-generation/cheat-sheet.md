# Retrieval-Augmented Generation Cheat Sheet

Quick revision of the RAG lessons, for a last look before an interview or
before building TaskFlow's project-knowledge Q&A.

## Key configuration

```ini
# .env.example: models and limits come from configuration, never from code
CHAT_MODEL=
EMBEDDING_MODEL=
EMBEDDING_DIMENSIONS=
RAG_TOP_K=8
RAG_MIN_SCORE=0
RAG_MAX_CONTEXT_TOKENS=6000
```

```ts
// scripts/create-vector-index.ts (excerpt): every filter field is indexed as "filter"
await chunks.createSearchIndex({
  name: "knowledge_chunks_vector",
  type: "vectorSearch",
  definition: {
    fields: [
      { type: "vector", path: "embedding", numDimensions: Number(process.env.EMBEDDING_DIMENSIONS), similarity: "cosine" },
      { type: "filter", path: "tenantId" },
      { type: "filter", path: "projectId" },
    ],
  },
});
```

```ts
// src/rag/retrieve.ts (excerpt): the authorization pre-filter goes inside $vectorSearch
{
  $vectorSearch: {
    index, path: "embedding", queryVector, limit: k,
    numCandidates: Math.min(10_000, k * 20),
    filter: { $and: [{ tenantId: { $eq: scope.tenantId } }, { projectId: { $in: scope.projectIds } }] },
  },
}
```

## Decision guide

| If you need | Choose | Why |
|---|---|---|
| Answers from private, changing docs with per-user access and citations | Your own pipeline: pre-filtered vector search plus validated citations | You control scope, chunking, and validation |
| A prototype over documents everyone may read | A managed pipeline (OpenAI file search, Bedrock Knowledge Bases, Google Cloud RAG Engine) | Parsing, chunking, and indexing are done for you |
| A corpus that fits easily in the context window | Send it all, with prompt caching | No retrieval step to tune or get wrong |
| A list of matching documents | Plain keyword, vector, or hybrid search | Cheaper, faster, nothing to hallucinate |
| Chunks for Markdown docs and runbooks | Structure-aware chunking, one section per chunk | Matches how people write and cite |
| Chunks for transcripts without headings | Semantic, or recursive by speaker turn | No structure to follow |
| Exact IDs and error codes are missed | Hybrid search | Keyword search finds exact terms |
| recall@50 is high but recall@8 is low | A reranker | The evidence is found but ranked too low |

## Numbers and defaults to remember

| Item | Value |
|---|---|
| MongoDB `numCandidates` | At least `limit`, at most 10,000; start at 20 times `limit` |
| `vectorSearchScore` | 0 to 1, model-specific: tune any cut-off on your own eval set |
| OpenAI embeddings request | Up to 2,048 inputs and 300,000 tokens; 8,192 tokens per input |
| OpenAI file search chunking | 800-token chunks, 400 overlap by default; static 100 to 4,096 tokens |
| Other splitter defaults | LangChain JS recursive: 1,000 characters, 200 overlap; Bedrock: about 300 tokens; Unstructured `basic`: 500 characters |
| Fixed-size chunk count | `1 + ceil((L - size) / (size - overlap))`; 10,000 at 1,000/200 gives 13 chunks, 24% more text |
| Token estimate | About 4 characters per token for English; 8 chunks of 1,000 characters is about 2,300 tokens of sources |
| Citation quote | At least 12 characters after folding, and found in the cited source |
| OpenAI Responses `store` | Defaults to true, kept at least 30 days; send `store: false` for private docs |
| Contextual Retrieval (Anthropic, 2024) | Top-20 failures 5.7% to 3.7% (embeddings), 2.9% (plus BM25), 1.9% (plus reranking) |
| nDCG | DCG sums (2^gain - 1) / log2(rank + 1); divide by the ideal ordering |
| CI gate | Fail on any metric below baseline minus tolerance (0.02), or any leaked chunk |

## Top mistakes

- **Authorization as a `$match` after `$vectorSearch`.** Put the scope in
  the `filter` option, index filter fields, and re-check the results.
- **Changing `EMBEDDING_MODEL` without re-indexing.** Build a new index or
  field alongside the old one and switch when it is complete.
- **Trusting the model's citations.** Check that each source was sent, each
  quote exists in it, and every `[Sn]` marker is backed; otherwise withhold.
- **Upserting new chunks but never deleting old ones.** Plan embed, keep,
  and delete on every ingest, and run a nightly reconciliation.
- **Splitting tables and code blocks mid-way.** Use structure-aware
  chunking; split oversized tables by rows with the header repeated.
- **Raising `k` to fix quality.** Compare recall at `k` with recall at 50,
  and add a reranker; more chunks add cost and latency.
- **Labeling golden sources by chunk ID.** Use section keys such as
  `deploy-runbook#rollbacks`, which survive re-chunking.
- **Testing only answerable questions.** Add unanswerable, out-of-scope, and
  injection cases, and treat any scope leak as a failure.

## Where to go deeper

- [Building a RAG pipeline](building-a-rag-pipeline.md)
- [Document ingestion and chunking](document-ingestion-and-chunking.md)
- [Evaluating and debugging RAG](evaluating-and-debugging-rag.md)
- [Retrieval-augmented generation interview questions and answers](interview-questions-and-answers.md)
- [Advanced RAG design](../advanced-rag-design.md)

Back to the [Retrieval-augmented generation overview](../retrieval-augmented-generation.md).
