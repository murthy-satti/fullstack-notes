# Document Ingestion and Chunking

Retrieval can only find what ingestion produced. This lesson covers the
indexing side of TaskFlow's project-knowledge Q&A in depth: getting clean,
structured text out of Markdown, HTML, and PDF files; the four common
chunking strategies (fixed-size, recursive, structure-aware, and semantic);
how overlap and metadata change what retrieval can match; and how to keep
the index in step with documents that are edited, moved, deleted, or
duplicated.

All the code is TypeScript from the TaskFlow API, and every chunker and
parser on this page was run on sample documents; the outputs shown are
from those runs. The previous lesson,
[building a RAG pipeline](building-a-rag-pipeline.md), shows where this
code plugs in.

## Why it matters

A chunk is the unit of retrieval: it is what gets embedded, ranked, sent
to the model, and quoted in a citation. If ingestion splits a table into
fragments, separates a heading from the paragraph it explains, or keeps a
PDF's running footer in every chunk, no embedding model or reranker can
repair it later.

Ingestion choices move retrieval quality measurably. In Anthropic's
[Contextual Retrieval](https://www.anthropic.com/research/contextual-retrieval)
experiments (September 2024), only the chunk text changed: prepending
50 to 100 tokens of chunk-specific context before embedding cut the top-20
retrieval failure rate from 5.7% to 3.7%, and adding a contextual BM25
index cut it to 2.9%.

Ingestion also sets a large part of the cost. Overlap multiplies the text
you embed and store: on TaskFlow's 1,404-character deploy runbook,
fixed-size chunks of 400 characters with 80 characters of overlap produced
1,724 characters of chunks, 23% more than the document. Re-embedding
unchanged text on every edit multiplies it again. Good ingestion embeds
each piece of text once, in a form that keeps its meaning.

## Real-world usage

- **Amazon Bedrock Knowledge Bases.** The
  [chunking documentation](https://docs.aws.amazon.com/bedrock/latest/userguide/kb-chunking.html)
  offers default chunking (about 300 tokens, honouring sentence
  boundaries), fixed-size chunking with an overlap percentage, no
  chunking, hierarchical chunking (small child chunks for matching,
  replaced by parent chunks for context), and semantic chunking tuned by a
  buffer size and a breakpoint percentile threshold. It notes that
  semantic chunking costs more because it calls a foundation model.
- **OpenAI vector stores.** The SDK typings for the vector store API
  (openai 7.x, November 2026) document the default strategy as 800-token
  chunks with 400 tokens of overlap, and a static strategy with chunks of
  100 to 4,096 tokens whose overlap may not exceed half the chunk size. See
  the [file search guide](https://developers.openai.com/api/docs/guides/tools-file-search).
- **Unstructured.** Its
  [chunking documentation](https://docs.unstructured.io/open-source/core-functionality/chunking)
  describes a `basic` strategy that packs document elements up to
  `max_characters` (500 by default) and a `by_title` strategy that also
  starts a new chunk at every section title, so no chunk spans two
  sections: the structure-aware approach of this lesson.
- **LangChain.** The JavaScript `RecursiveCharacterTextSplitter`
  ([splitter docs](https://docs.langchain.com/oss/javascript/integrations/splitters/index))
  defaults to 1,000 characters with 200 characters of overlap and tries
  the separators `"\n\n"`, `"\n"`, `" "`, and `""` in order, according to
  its installed source (version 1.0.2).

**Popular tools and providers:** Unstructured, Docling, Apache Tika,
pdf.js (and the `unpdf` wrapper), Mozilla Readability, cheerio, marked and
remark, LangChain text splitters, LlamaIndex node parsers, Amazon Textract,
and Azure AI Document Intelligence.

## How it works

### The ingestion pipeline

![Diagram: document events (created, edited, moved, deleted, permissions changed) start an eight-stage pipeline: fetch and detect the type by MIME type, size limit and file hash; parse to structured text using a Markdown syntax tree, the main content of HTML, or the PDF text layer; normalize Unicode, whitespace and running headers; chunk by structure with a size cap and tables kept whole; enrich metadata with breadcrumb, anchor, page and scope fields; hash and plan the sync, deciding per chunk whether to embed, keep or delete; embed new or changed chunks in batches; then write new chunks and delete stale ones last. Parse problems branch off stage two: scanned PDFs go to OCR, corrupt or oversized files go to a dead-letter queue with an alert. Stage seven calls the embedding API in batches and stage eight writes to the knowledge_chunks collection. A nightly reconciliation job compares live documents with indexed document IDs and feeds the sync step.](ingestion-pipeline-stages.svg)

Ingestion is a chain of small steps that run in a background worker, one
job per document version. Each step should be safe to retry: the job is
keyed by document ID and version, it embeds before it writes, and it
writes before it deletes. Two inputs feed it:

- **Events** from the source system: a document was created, edited,
  moved to another project, deleted, or had its permissions changed.
  Events make the index fresh within seconds.
- **Reconciliation**, a scheduled job that compares the documents that
  exist with the `docId`s in the index. Events get lost (a deploy drops a
  queue message, a bulk import bypasses hooks); reconciliation catches
  missed updates and orphaned chunks of deleted documents.

Files that fail to parse go to a dead-letter queue with an alert, never a
silent skip: a missing document is a retrieval failure nobody will notice
until a user complains.

### Parsing by format

Every format stores structure differently, and the parser's job is to
recover headings, lists, tables, and code as structure rather than flat
text:

| Format | Where structure lives | Typical problems | Approach |
|---|---|---|---|
| Markdown | Headings, lists, fences, tables, front matter | Few; front matter must not become content | Tokenize with a Markdown parser (marked, remark) |
| HTML | The DOM | Navigation, footers, cookie banners, scripts; content split across `div`s | Select `main` or `article`, drop known noise, convert headings and tables; Mozilla Readability for arbitrary pages |
| PDF (born digital) | Only positioned text on pages | Reading order, columns, running headers and footers, hyphenation, ligatures, tables flattened into lines | Extract the text layer (pdf.js, `unpdf`), clean it; layout-aware converters (Docling, Unstructured) for complex layouts |
| PDF (scanned) | None: pages are images | No text layer at all | OCR first, then treat as text; confidence scores matter |
| DOCX, PPTX | XML inside a ZIP | Styles instead of semantic headings | Convert to Markdown or HTML with a converter, then parse that |

Converting everything to one intermediate form, Markdown with `#`
headings, lets a single structure-aware chunker serve every format. The
HTML parser below does exactly that.

### Normalizing text

Normalization makes text comparable and removes artifacts, but anything
removed here is invisible to retrieval forever, so it stays conservative:

- **Unicode.** Stored text uses NFC, which only composes characters and
  changes nothing visible. NFKC also folds compatibility characters (the
  PDF ligature "ﬁ" becomes "fi") but changes meaning in places ("²" becomes
  "2"), so TaskFlow applies it to PDF text and to the folded form used for
  hashing and quote matching, not to everything. See
  [Unicode normalization forms](https://unicode.org/reports/tr15/).
- **Invisible characters:** zero-width spaces, byte-order marks, and
  non-breaking spaces break exact matching and deduplication.
- **Layout noise:** running headers, footers, and page numbers repeat on
  every PDF page and would otherwise appear in every chunk. A line that
  shows up on most pages (with digits masked, so "Page 2 of 9" equals
  "Page 7 of 9") is layout, not content.
- **Hyphenation:** words broken across lines ("deploy-" then "ment") are
  re-joined, but only lowercase-to-lowercase, so "Node-" then "RED" is left
  alone.

### Four chunking strategies

![Diagram: the deploy runbook drawn as a column of blocks (intro paragraph, Before you deploy section, Deploying section, bash code block, Rollbacks section, table, After the deploy section) with four columns showing where each chunker cuts. Fixed-size chunks of 400 characters with 80 overlap give 5 equal overlapping windows, one of which cuts through the code block. Recursive splitting at 400 with 80 overlap gives 5 chunks that break at paragraph and line boundaries, but chunk 2 ends with the Rollbacks heading, cut off from its section. Structure-aware chunking gives 6 chunks, one per section, with the code kept in the Deploying chunk and the table as its own chunk. Semantic chunking, shown schematically, breaks where the meaning of neighbouring sentences shifts, which can fall inside sections and needs embeddings.](chunking-strategies-compared.svg)

| Strategy | How it splits | Strengths | Weaknesses | Ingestion cost |
|---|---|---|---|---|
| Fixed-size | Every N characters or tokens, with overlap | Simple, predictable sizes | Cuts sentences, code, and tables anywhere | Lowest |
| Recursive | On the coarsest separator (paragraph, line, sentence, word) that keeps pieces under N, then merges up to N | Respects paragraphs; works on any text | Ignores document structure; a heading can end a chunk | Low |
| Structure-aware | At headings and block boundaries; code and tables kept whole; oversized blocks split safely | Chunks match sections; clean citations and anchors | Needs a parser per format; uneven sizes | Low |
| Semantic | Where embeddings of neighbouring sentences diverge most | Follows topic shifts in unstructured prose | One embedding call per sentence window; boundaries vary with the model | Higher |

**Fixed-size** chunking slides a window of `size` characters forward by
`size - overlap`. For a text of length `L` it produces
`1 + ceil((L - size) / (size - overlap))` chunks. For 10,000 characters
with `size = 1,000` and `overlap = 200`, that is `1 + ceil(9,000 / 800) =
13` chunks totalling 12,400 characters, 24% more text to embed and store
than the document itself. The overlap exists to soften the cuts: a
sentence split at one window's end appears whole in the next.

**Recursive** splitting tries the coarsest separator first (blank lines),
and only pieces that are still too long are split on a finer one (lines,
then sentence ends, then spaces, then raw characters). The pieces are then
merged back up to the size limit, carrying an overlap from the previous
chunk. It never cuts a word if a space exists, but it knows nothing about
headings.

**Structure-aware** chunking splits a Markdown document at its headings,
treats paragraphs, lists, code blocks, and tables as blocks, and packs
whole blocks into chunks up to the size limit. Code blocks and tables are
atomic; when one is larger than the limit on its own, a code block is
split by lines with its fences re-added, and a table is split by rows with
the header row repeated in every piece, so each piece is still a valid
table. Each chunk records its heading path (the breadcrumb). This is the
default for TaskFlow, because project docs are Markdown and sections are
how people write and cite them.

**Semantic** chunking splits text into sentences, embeds each sentence
together with `bufferSize` neighbours on each side, measures the cosine
distance between consecutive windows, and breaks where the distance is
above a percentile of all distances. The buffer smooths noise from single
short sentences; the percentile makes the threshold adapt to each
document. It is useful for long unstructured text such as meeting
transcripts, where there are no headings to follow, and it costs one
embedding per sentence window at ingestion.

### Chunk size and overlap

There is no universal best chunk size; there is a trade-off you measure:

- **Smaller chunks** match narrow questions precisely and waste less of
  the context budget, but lose surrounding context ("it" with no
  antecedent, a step without its prerequisite).
- **Larger chunks** carry context but dilute the embedding with several
  topics, rank lower for specific questions, and use more of the prompt.
- **Overlap** reduces boundary damage in fixed and recursive chunking at
  the price of duplicated text. Structure-aware chunks rarely need it,
  because their boundaries are meaningful.
- **Hard limits:** an embedding model has a maximum input length (8,192
  tokens per input for OpenAI's embedding models, according to the SDK
  typings). Chunks must stay well below it, measured in tokens, not
  characters.

Pick a starting size from the content (a section of a runbook, an FAQ
entry, a paragraph of a policy), then compare two or three sizes on the
evaluation set described in
[evaluating and debugging RAG](evaluating-and-debugging-rag.md). Parent-child
retrieval, which matches small chunks but returns their larger parent
section, is covered in [advanced RAG design](../advanced-rag-design.md).

### Metadata and contextual headers

Each chunk carries metadata for four jobs:

- **Authorization:** `tenantId` and `projectId`, copied from the document
  at ingestion and indexed as vector-search filter fields. When a
  document's permissions change, these fields are updated in place; the
  embedding does not change.
- **Citation:** `docTitle`, `headingPath`, `url` with the section anchor,
  and `page` for PDFs, so the answer can link to the exact place.
- **Freshness and ordering:** `updatedAt`, `ordinal`, and the document
  version.
- **Retrieval itself:** the breadcrumb is embedded with the text. The
  chunk "If the error rate stays above 1% for 3 minutes, the rollout stops"
  is embedded as "TaskFlow Deploy Runbook > Deploying > Rollbacks" followed
  by that text, so a question about rollbacks matches it even though the
  paragraph never says "deploy runbook".

The breadcrumb is a cheap, deterministic form of contextual retrieval.
Anthropic's version asks a model to write 50 to 100 tokens of context for
each chunk from the whole document, which helps more for prose without
headings but costs one model call per chunk at ingestion.

### Updates, deletes, and deduplication

![Diagram: re-ingesting an edited runbook. On the left, six stored chunks of version 1: intro a1f0, before you deploy b27c, deploying c3e1, rollbacks text d4a9, rollbacks table e5b2, after the deploy f60d. On the right, five chunks of version 2: intro edited a7c4, before you deploy b27c, deploying edited c8d2, rollbacks text d4a9, rollbacks table e5b2, and the removed section. In the middle, the sync plan keeps 3 chunks with matching IDs and hashes (b27c, d4a9, e5b2) with no embedding call, embeds 2 chunks whose text changed (a7c4, c8d2), and deletes 3 (a1f0, c3e1, f60d). The order of operations is: embed first while nothing is written, upsert the new chunks and update the order of kept ones, and delete the stale chunks last so the document never vanishes.](chunk-sync-plan.svg)

How chunks are identified decides how cheap updates are:

| Chunk ID scheme | On an edit near the top of a document | Notes |
|---|---|---|
| Positional, `docId#ordinal` | Every later chunk shifts and looks changed | Simple, but re-embeds most of the document |
| Content-addressed, `docId:hash(text)` | Only edited chunks get new IDs | Unchanged text keeps its ID and vector; order lives in `ordinal` |
| Random IDs per ingest | Everything is new | Forces delete-all and re-insert; avoid |

TaskFlow uses content-addressed IDs: the ID hashes the folded embedding
input (breadcrumb plus text) and the document ID. A second hash,
`contentHash`, also covers the embedding model and a `CHUNKER_VERSION`
string, so changing the model or the chunking rules marks every chunk as
changed and forces a clean re-embed, while an ordinary edit re-embeds only
what changed. The sync plan for a new version is then a set difference:

- **Keep** chunks whose ID and hash both match (no embedding call).
- **Embed** chunks that are new or whose hash differs.
- **Delete** stored chunks whose IDs no longer appear.

Deletion has more paths than editing:

- **Document deleted:** delete every chunk with that `docId`. The
  reconciliation job is the safety net for missed delete events.
- **Document moved or re-permissioned:** update `projectId` and other
  filter fields on its chunks; no re-embedding needed.
- **Erasure request:** chunks are only one copy. Cached answers, logs that
  stored retrieved text, evaluation sets, and backups need the same
  treatment; see
  [privacy and data retention](../security-privacy-and-responsible-ai/privacy-pii-and-data-retention.md).

Deduplication works at three levels. Identical chunks inside one document
(repeated boilerplate) collapse automatically because they share an ID.
Identical documents uploaded twice share a document-level hash and can be
skipped or linked. Near-duplicates, such as a copied runbook with a few
words changed, are found by comparing sets of word shingles (overlapping
5-word sequences) with Jaccard similarity; at scale, MinHash with
locality-sensitive hashing approximates the same comparison without
comparing every pair. Near-duplicates are worth handling because they
crowd the top `k` with near-identical chunks and can mix an old copy's
facts into answers.

## When to use and when not to use

| Content | Strategy | Why |
|---|---|---|
| Markdown docs, runbooks, wikis | Structure-aware, about one section per chunk | Sections are how the content is written and cited |
| HTML help pages | Main-content extraction, then structure-aware | Same structure once boilerplate is gone |
| Born-digital PDFs with simple layout | Text layer, cleanup, then recursive or structure-aware per page | Keeps page numbers exact for citations |
| PDFs with columns, complex tables, forms | A layout-aware converter, then structure-aware | Plain text extraction scrambles reading order and tables |
| Scanned documents | OCR, then the above | There is no text to extract |
| Transcripts, chat logs, long notes without headings | Semantic, or recursive by speaker turns | No structure to follow |
| Short records (FAQ entries, tickets, product rows) | One record per chunk, no splitting | Each record is already a unit of meaning |
| Source code | Language-aware splitting by function or class | Lines and characters do not respect code structure |

Do not tune chunk size by intuition or copy a number from a blog post;
compare candidates on your own questions. And do not chunk at query time:
chunking belongs to ingestion, where it is done once.

## Practical examples

### Parsing Markdown front matter

Docs in TaskFlow projects may start with YAML front matter. The title is
used in breadcrumbs; the rest must not leak into chunk text:

```ts
// src/ingest/parse-markdown.ts
// Separate YAML front matter (title, owner, audience) from the body.
import { normalizeText } from "./normalize.js";

export interface ParsedDoc { title: string; meta: Record<string, string>; body: string }

export function parseMarkdown(source: string, fallbackTitle: string): ParsedDoc {
  const meta: Record<string, string> = {};
  let body = source.replace(/^\uFEFF/, "");
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(body);
  if (match) {
    for (const line of match[1].split(/\r?\n/)) {
      const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
      if (kv) meta[kv[1]] = kv[2].replace(/^["']|["']$/g, "");
    }
    body = body.slice(match[0].length);
  }
  const h1 = /^# (.+)$/m.exec(body);
  return { title: meta.title ?? h1?.[1].trim() ?? fallbackTitle, meta, body: normalizeText(body) };
}
```

The line-based front matter reader handles flat `key: value` pairs, which
is all TaskFlow uses; use a YAML library if documents carry nested data.

### Normalizing text

```ts
// src/ingest/normalize.ts
// Clean extracted text before chunking. Keep it conservative: anything
// removed here is invisible to retrieval forever.
export function normalizeText(text: string): string {
  return text
    .normalize("NFC")
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, "") // zero-width characters
    .replace(/\u00A0/g, " ")                     // non-breaking spaces
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// A stricter form used only for comparing and hashing, never for display.
export function foldForMatching(text: string): string {
  return text.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}
```

Collapsing runs of spaces would mangle indentation inside code blocks;
TaskFlow accepts that for its docs, but a corpus of code samples should
normalize prose blocks only.

### Extracting the main content of an HTML page

```ts
// src/ingest/parse-html.ts
// Turn an HTML page into Markdown-like text: main content only, headings
// kept as "#" lines so the Markdown chunker can use the structure.
import * as cheerio from "cheerio";
import { normalizeText } from "./normalize.js";

const NOISE = "script, style, noscript, template, nav, header, footer, aside, form, [aria-hidden='true']";

export function htmlToMarkdown(html: string): { title: string; markdown: string } {
  const $ = cheerio.load(html);
  $(NOISE).remove();
  const main = $("main").first();
  const root = main.length ? main : $("article").first().length ? $("article").first() : $("body");
  const title = root.find("h1").first().text().trim() || $("title").text().trim();

  const lines: string[] = [];
  root.find("h1, h2, h3, h4, p, li, pre, table").each((_, el) => {
    const node = $(el);
    // Skip elements inside a block that is converted as a whole.
    if (node.parents("li, pre, table").length > 0) return;
    const tag = el.tagName.toLowerCase();
    const text = node.text().replace(/\s+/g, " ").trim();
    if (tag.startsWith("h")) lines.push(`${"#".repeat(Number(tag[1]))} ${text}`);
    else if (tag === "li") lines.push(`- ${text}`);
    else if (tag === "pre") lines.push("```\n" + node.text().trimEnd() + "\n```");
    else if (tag === "table") lines.push(tableToMarkdown($, node));
    else if (text) lines.push(text);
  });
  return { title, markdown: normalizeText(lines.join("\n\n")) };
}

function tableToMarkdown($: cheerio.CheerioAPI, table: cheerio.Cheerio<any>): string {
  const rows = table.find("tr").toArray().map((tr) =>
    $(tr).find("th, td").toArray().map((cell) => $(cell).text().replace(/\s+/g, " ").trim().replace(/\|/g, "\\|")));
  if (rows.length === 0) return "";
  const width = Math.max(...rows.map((r) => r.length));
  const line = (cells: string[]) => `| ${[...cells, ...Array(width - cells.length).fill("")].join(" | ")} |`;
  return [line(rows[0]), `|${" --- |".repeat(width)}`, ...rows.slice(1).map(line)].join("\n");
}
```

Run on an on-call guide page with a header, navigation, a sidebar, a
footer, and an analytics script, the output keeps only the content (output
from the run, then the chunk summary):

````text
HTML title: On-call Guide
--- markdown ---
# On-call Guide

The on-call engineer owns production incidents for one week, Monday 10:00 to Monday 10:00 UTC.

## Paging

Pages go to the primary on-call first. If nobody acknowledges within 5 minutes, the secondary is paged.

- Acknowledge every page, even false alarms.

- Open an incident channel for anything customer-facing.

## Escalation

| Severity | Response time | Escalate to |
| --- | --- | --- |
| SEV1 | 5 minutes | Engineering manager |
| SEV2 | 30 minutes | Team lead |

```
taskflow-cli incident open --severity SEV2
```
---
chunk [] 94 chars
chunk [Paging] 207 chars
chunk [Escalation] 191 chars
````

This works for pages you control, where `main` holds the content. For
arbitrary web pages, Mozilla's
[Readability](https://github.com/mozilla/readability) library (the one
behind Firefox Reader View) scores DOM nodes to find the article body.

### Extracting PDF text page by page

```ts
// src/ingest/parse-pdf.ts
// Extract the text layer of a PDF page by page, then remove running headers
// and footers and repair line-break hyphenation. Scanned PDFs have no text
// layer and need OCR instead.
import { extractText, getDocumentProxy } from "unpdf";
import { normalizeText } from "./normalize.js";

export async function pdfPages(data: Uint8Array): Promise<string[]> {
  const pdf = await getDocumentProxy(data);
  const { text } = await extractText(pdf, { mergePages: false });
  const pages = text.map((page) =>
    normalizeText(page.normalize("NFKC"))     // ligatures such as "ﬁ" become "fi"
      .replace(/(\p{Ll})-\n(\p{Ll})/gu, "$1$2")); // re-join "deploy-\nment"
  return removeRepeatedLines(pages);
}

// A line that appears on most pages ("TaskFlow Runbook", "Page 3 of 9") is
// layout, not content. Digits are masked so page numbers compare equal.
export function removeRepeatedLines(pages: string[], share = 0.6): string[] {
  if (pages.length < 3) return pages;
  const key = (line: string) => line.trim().replace(/\d+/g, "#");
  const counts = new Map<string, number>();
  for (const page of pages) {
    for (const line of new Set(page.split("\n").map(key))) {
      if (line) counts.set(line, (counts.get(line) ?? 0) + 1);
    }
  }
  const noise = new Set([...counts].filter(([, n]) => n >= pages.length * share).map(([line]) => line));
  return pages.map((page) => page.split("\n").filter((line) => !noise.has(key(line))).join("\n").trim());
}
```

To test it, the demo generated a three-page incident review with
`pdf-lib`: every page has a "TaskFlow Engineering - Confidential" header
and a "Page N of 3" footer, and page 1 breaks "deployment" across two
lines. The output from the run shows both the header and footer gone and
the word repaired:

```text
PDF page 1: "Incident review: search outage\nThe search service failed after a deployment changed the index settings."
PDF page 2: "Timeline\nAt 14:02 UTC alerts fired for search latency.\nAt 14:20 UTC the change was rolled back."
PDF page 3: "Actions\nAdd an index settings check to the pipeline.\nPage the search owner on latency alerts."
```

Keeping pages separate lets each chunk record its page number for
citations. A page that comes back empty, or nearly so, is the signal that
the PDF is scanned and needs OCR.

### Fixed-size and recursive splitters

```ts
// src/chunking/fixed.ts
// Fixed-size windows of `size` characters; each window starts
// `size - overlap` characters after the previous one.
export function fixedSizeChunks(text: string, size: number, overlap = 0): string[] {
  if (size <= 0 || overlap < 0 || overlap >= size) {
    throw new Error("need size > 0 and 0 <= overlap < size");
  }
  const chunks: string[] = [];
  for (let start = 0; start < text.length; start += size - overlap) {
    chunks.push(text.slice(start, start + size));
    if (start + size >= text.length) break;
  }
  return chunks;
}
```

```ts
// src/chunking/recursive.ts
// Split on the coarsest separator that yields pieces under maxChars, then
// merge neighbouring pieces back up to maxChars, carrying an overlap.
export const DEFAULT_SEPARATORS = ["\n\n", "\n", ". ", " ", ""];

export function recursiveSplit(
  text: string,
  maxChars: number,
  overlap = 0,
  separators: string[] = DEFAULT_SEPARATORS,
): string[] {
  if (overlap >= maxChars) throw new Error("overlap must be smaller than maxChars");
  return mergePieces(splitPieces(text, maxChars, separators), maxChars, overlap);
}

function splitPieces(text: string, maxChars: number, separators: string[]): string[] {
  if (text.length <= maxChars) return [text];
  const [separator, ...finer] = separators;
  if (separator === undefined || separator === "") {
    // Last resort: hard cuts every maxChars characters.
    const out: string[] = [];
    for (let i = 0; i < text.length; i += maxChars) out.push(text.slice(i, i + maxChars));
    return out;
  }
  const parts = text.split(separator);
  const pieces: string[] = [];
  parts.forEach((part, i) => {
    // Keep the separator so merged chunks read naturally.
    const piece = i < parts.length - 1 ? part + separator : part;
    if (piece.length <= maxChars) pieces.push(piece);
    else pieces.push(...splitPieces(piece, maxChars, finer));
  });
  return pieces.filter((p) => p.length > 0);
}

function mergePieces(pieces: string[], maxChars: number, overlap: number): string[] {
  const chunks: string[] = [];
  let current = "";
  for (const piece of pieces) {
    if (current && current.length + piece.length > maxChars) {
      chunks.push(current.trim());
      const carry = overlap > 0 ? wordTail(current, overlap) : "";
      current = carry.length + piece.length <= maxChars ? carry : "";
    }
    current += piece;
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

// The last `overlap` characters of a chunk, starting at a word boundary.
function wordTail(text: string, overlap: number): string {
  const tail = text.slice(-overlap);
  const space = tail.indexOf(" ");
  return space >= 0 ? tail.slice(space + 1) : tail;
}
```

The overlap is dropped when carrying it would push the next chunk over
the limit, so `maxChars` is a hard ceiling; a unit test checks it. With
LangChain the equivalent is
`new RecursiveCharacterTextSplitter({ chunkSize: 400, chunkOverlap: 80 })`
followed by `await splitter.splitText(text)`; the package needs
`@langchain/core` installed alongside it, and its `lengthFunction` option
lets you count tokens instead of characters.

### Structure-aware Markdown chunking

```ts
// src/chunking/markdown.ts
// Structure-aware chunking: split at headings, never inside a code block or
// table, and pack whole blocks into chunks of at most maxChars.
import { marked, type Token, type Tokens } from "marked";
import { recursiveSplit } from "./recursive.js";
import type { Chunk } from "./types.js";

export const CHUNKER_VERSION = "md-v3"; // bump when the rules change: forces re-embedding

interface Block { text: string; kind: "prose" | "code" | "table" }
interface Section { headingPath: string[]; anchor: string; blocks: Block[] }

export function slugify(heading: string): string {
  return heading.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, "").trim().replace(/\s+/g, "-");
}

export function markdownSections(markdown: string): Section[] {
  const sections: Section[] = [{ headingPath: [], anchor: "", blocks: [] }];
  const stack: { depth: number; text: string }[] = [];
  for (const token of marked.lexer(markdown) as Token[]) {
    if (token.type === "heading") {
      const heading = token as Tokens.Heading;
      if (heading.depth === 1) continue; // the H1 is the document title
      while (stack.length && stack[stack.length - 1].depth >= heading.depth) stack.pop();
      stack.push({ depth: heading.depth, text: heading.text });
      sections.push({ headingPath: stack.map((h) => h.text), anchor: slugify(heading.text), blocks: [] });
      continue;
    }
    if (token.type === "space") continue;
    const current = sections[sections.length - 1];
    if (token.type === "code") {
      const code = token as Tokens.Code;
      current.blocks.push({ kind: "code", text: "```" + (code.lang ?? "") + "\n" + code.text + "\n```" });
    } else if (token.type === "table") {
      current.blocks.push({ kind: "table", text: token.raw.trim() });
    } else {
      current.blocks.push({ kind: "prose", text: token.raw.trim() });
    }
  }
  return sections.filter((s) => s.blocks.length > 0);
}

// A block that is too big on its own is split without breaking its syntax.
function splitBlock(block: Block, maxChars: number): string[] {
  if (block.text.length <= maxChars) return [block.text];
  if (block.kind === "table") {
    const [header, divider, ...rows] = block.text.split("\n");
    const pieces: string[] = [];
    let current: string[] = [];
    for (const row of rows) {
      const size = [header, divider, ...current, row].join("\n").length;
      if (current.length && size > maxChars) { pieces.push([header, divider, ...current].join("\n")); current = []; }
      current.push(row);
    }
    if (current.length) pieces.push([header, divider, ...current].join("\n"));
    return pieces; // every piece repeats the header row
  }
  if (block.kind === "code") {
    const lines = block.text.split("\n");
    const fence = lines[0];
    const body = lines.slice(1, -1).join("\n");
    return recursiveSplit(body, maxChars - fence.length - 5, 0, ["\n\n", "\n", ""])
      .map((part) => `${fence}\n${part}\n\`\`\``);
  }
  return recursiveSplit(block.text, maxChars, Math.floor(maxChars * 0.1));
}

export function chunkMarkdown(markdown: string, maxChars = 1200): Chunk[] {
  const chunks: Chunk[] = [];
  for (const section of markdownSections(markdown)) {
    let current = "";
    const flush = () => {
      if (current.trim()) {
        chunks.push({ text: current.trim(), headingPath: section.headingPath, anchor: section.anchor, ordinal: chunks.length });
      }
      current = "";
    };
    for (const block of section.blocks) {
      for (const piece of splitBlock(block, maxChars)) {
        if (current && current.length + piece.length + 2 > maxChars) flush();
        current += (current ? "\n\n" : "") + piece;
      }
    }
    flush();
  }
  return chunks;
}

// The text that gets embedded: the chunk plus where it came from.
export function embeddingInput(docTitle: string, chunk: Chunk): string {
  const breadcrumb = [docTitle, ...chunk.headingPath].join(" > ");
  return `${breadcrumb}\n\n${chunk.text}`;
}
```

The `Chunk` type holds `text`, `headingPath`, `anchor`, `ordinal`, and an
optional `page`. The anchor must match how the docs site generates heading
IDs, or citation links will miss; reuse the site's slug function if it has
a different one. `CHUNKER_VERSION` feeds the content hash, so changing any
rule here re-embeds the corpus on the next ingestion.

### Semantic chunking

```ts
// src/chunking/semantic.ts
// Semantic chunking: start a new chunk where the meaning of neighbouring
// sentences changes most, measured with embeddings.
export type EmbedFn = (texts: string[]) => Promise<number[][]>;

export function splitSentences(text: string, locale = "en"): string[] {
  const segmenter = new Intl.Segmenter(locale, { granularity: "sentence" });
  return [...segmenter.segment(text)].map((s) => s.segment.trim()).filter(Boolean);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na === 0 || nb === 0 ? 0 : dot / Math.sqrt(na * nb);
}

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const rank = (p / 100) * (sorted.length - 1);
  const low = Math.floor(rank);
  const high = Math.ceil(rank);
  return sorted[low] + (sorted[high] - sorted[low]) * (rank - low);
}

export interface SemanticOptions {
  bufferSize: number;          // neighbours on each side embedded with a sentence
  breakpointPercentile: number; // split at distances above this percentile
  maxChars: number;            // hard cap, whatever the distances say
}

export async function semanticChunks(
  text: string,
  embed: EmbedFn,
  { bufferSize = 1, breakpointPercentile = 90, maxChars = 1500 }: Partial<SemanticOptions> = {},
): Promise<{ chunks: string[]; distances: number[]; threshold: number }> {
  const sentences = splitSentences(text);
  if (sentences.length < 3) return { chunks: [text.trim()], distances: [], threshold: 0 };

  const windows = sentences.map((_, i) =>
    sentences.slice(Math.max(0, i - bufferSize), i + bufferSize + 1).join(" "));
  const vectors = await embed(windows);
  const distances = vectors.slice(1).map((v, i) => 1 - cosineSimilarity(vectors[i], v));
  const threshold = percentile(distances, breakpointPercentile);

  const chunks: string[] = [];
  let current = [sentences[0]];
  for (let i = 1; i < sentences.length; i++) {
    const length = current.join(" ").length + 1 + sentences[i].length;
    if (distances[i - 1] > threshold || length > maxChars) {
      chunks.push(current.join(" "));
      current = [];
    }
    current.push(sentences[i]);
  }
  chunks.push(current.join(" "));
  return { chunks, distances, threshold };
}
```

`Intl.Segmenter` is built into Node and handles abbreviations better than
splitting on full stops. In production, `embed` is the batched
`embedTexts` from the pipeline lesson. To show the mechanics offline, the
demo used a deliberately crude stand-in that maps words to three
hand-made topics, so the boundaries are obvious (real models give noisier
distances, which is why the threshold is a percentile and the buffer
smooths each sentence with its neighbours). Output from the run on eight
sentences of meeting notes, with `bufferSize: 0` and the 70th percentile:

```text
semantic distances: 0.00 0.00 1.00 0.00 0.00 1.00 0.00
threshold (70th percentile): 0.20
  semantic 1: The deploy window moves to Tuesday mornings. Every deploy needs a green pipeline and release notes. A failed deploy rolls back to the previous image tag.
  semantic 2: The Pro plan invoice is sent on the first day of each month. Annual plans get a discount on every invoice. A failed card payment on an invoice is retried three times.
  semantic 3: Two new engineers start onboarding next week. Each new engineer gets an onboarding buddy for the first month.
```

### Comparing the strategies on one document

The demo ran the fixed, recursive, and structure-aware chunkers on the
1,404-character deploy runbook (a Markdown file with front matter, four
sections, a code block, and a table). Output from the run:

```text
fixed 400/80     chunks= 5 min=124 avg=345 max=400 total=1724
recursive 400/80 chunks= 5 min=225 avg=340 max=397 total=1702
markdown 400     chunks= 6 min=100 avg=216 max=306 total=1295

fixed chunk 2 ends with:      "llbacks\n\nIf the error rate stays above 1"
recursive chunk 2 ends with:  "ag=1.8.2\ngh run watch\n```\n\n### Rollbacks"
code block appears in 2 fixed chunks

structure-aware chunks:
  #0 [] # 100 chars, starts "This runbook describes how the T"
  #1 [Before you deploy] #before-you-deploy 199 chars, starts "Check that the CI pipeline is gr"
  #2 [Deploying] #deploying 306 chars, starts "Run the deploy workflow from the"
  #3 [Deploying > Rollbacks] #rollbacks 291 chars, starts "If the error rate stays above 1%"
  #4 [Deploying > Rollbacks] #rollbacks 251 chars, starts "| Situation | Action | Owner |\n|"
  #5 [After the deploy] #after-the-deploy 148 chars, starts "Watch the API dashboard for 30 m"

embedding input for chunk 3:
TaskFlow Deploy Runbook > Deploying > Rollbacks

If the error rate stays above 1% for 3 minutes, the rollout stops and rolls back automatically. To roll back by...
```

The fixed chunker cut a sentence in half and split the code block across
two chunks; the recursive chunker kept sentences whole but ended chunk 2
with the "Rollbacks" heading, separated from its own section. The
structure-aware chunks follow the sections, keep the table whole as its
own chunk, and total fewer characters because headings move into the
breadcrumb instead of the text.

### Planning re-ingestion

```ts
// src/ingest/sync.ts
// Decide what to embed, keep and delete when a document is (re)ingested.
import { createHash } from "node:crypto";
import { foldForMatching } from "./normalize.js";

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export interface PreparedChunk {
  _id: string;            // docId + hash of the embedding input
  contentHash: string;    // also covers the embedding model and chunker version
  embeddingInput: string; // breadcrumb + chunk text
  ordinal: number;
}

export function prepareChunk(
  docId: string, embeddingInput: string, ordinal: number,
  embeddingModel: string, chunkerVersion: string,
): PreparedChunk {
  return {
    _id: `${docId}:${sha256(foldForMatching(embeddingInput)).slice(0, 16)}`,
    contentHash: sha256([embeddingModel, chunkerVersion, embeddingInput].join("\u0000")),
    embeddingInput,
    ordinal,
  };
}

export interface SyncPlan { toEmbed: PreparedChunk[]; unchanged: PreparedChunk[]; toDelete: string[]; duplicates: number }

export function planSync(next: PreparedChunk[], stored: { _id: string; contentHash: string }[]): SyncPlan {
  // Identical chunks inside one document (repeated boilerplate) are kept once.
  const unique = new Map<string, PreparedChunk>();
  for (const chunk of next) if (!unique.has(chunk._id)) unique.set(chunk._id, chunk);

  const storedHash = new Map(stored.map((s) => [s._id, s.contentHash]));
  const chunks = [...unique.values()];
  return {
    toEmbed: chunks.filter((c) => storedHash.get(c._id) !== c.contentHash),
    unchanged: chunks.filter((c) => storedHash.get(c._id) === c.contentHash),
    toDelete: stored.filter((s) => !unique.has(s._id)).map((s) => s._id),
    duplicates: next.length - unique.size,
  };
}

// Near-duplicate documents: Jaccard similarity of 5-word shingles.
export function shingles(text: string, size = 5): Set<string> {
  const words = foldForMatching(text).split(" ").filter(Boolean);
  const out = new Set<string>();
  for (let i = 0; i + size <= words.length; i++) out.add(words.slice(i, i + size).join(" "));
  return out;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  let shared = 0;
  for (const s of a) if (b.has(s)) shared++;
  const union = a.size + b.size - shared;
  return union === 0 ? 1 : shared / union;
}
```

The demo edited the runbook (one sentence changed in "Deploying", the last
section removed, a sentence added to the intro), re-chunked it, and
planned the sync against version 1. It then simulated an embedding model
change and compared document similarity. Output from the run:

```text
v1 chunks: 6
v2 plan: embed 2, unchanged 3, delete 3, duplicates 0
re-embedded: "This runbook describes how the TaskFlow ", "Run the deploy workflow from the Actions"
model change: embed 6 of 6
near-duplicate check: v1 vs v2 0.80, v1 vs v1 with one word changed 0.96
```

Two embedding inputs instead of six on an ordinary edit; all six when the
model changes, as intended. A one-word change keeps 96% of the shingles,
so a threshold around 0.9 flags copies while treating a real revision
(0.80 here) as a different version.

The unit tests that pin these behaviours (output from the same run):

```text
ok 1 - fixed-size chunk count is 1 + ceil((L - size) / (size - overlap))
ok 2 - recursive splitting never exceeds the limit
ok 3 - markdown chunks keep code fences balanced and repeat table headers
ok 4 - semantic chunking breaks where the topic changes
ok 5 - sync plan embeds only changed chunks and deletes removed ones
```

## Best practices

- Convert every format to one intermediate structure (Markdown headings,
  blocks) and use one structure-aware chunker for all of it.
- Keep code blocks and tables atomic; when they must be split, keep their
  syntax valid and repeat table headers.
- Embed a breadcrumb (document title and heading path) with each chunk,
  and store the anchor and page for citations.
- Use content-addressed chunk IDs and a content hash that includes the
  embedding model and chunker version.
- Embed, then write, then delete; make every ingestion job idempotent and
  retryable.
- Run a reconciliation job against the source of truth; do not rely on
  events alone for deletions.
- Send parse failures to a dead-letter queue with an alert, and treat
  near-empty PDF pages as an OCR signal.
- Choose chunk sizes by comparing candidates on your evaluation set, and
  record the chosen settings with the evaluation results.

## In production

- **Questions about escalation return the right page but half a table.**
  *Detect:* answers list some severities but not others; the retrieved
  chunk ends mid-table.
  *Cause:* a fixed or recursive splitter cut the table, and the rows below
  the cut lost their header.
  *Fix:* switch to structure-aware chunking with atomic tables, or split
  tables by rows with the header repeated.
- **Every PDF chunk mentions "Confidential - Page 4".**
  *Detect:* the same footer text appears in a large share of chunks, and
  unrelated questions retrieve the same PDFs.
  *Cause:* running headers and footers were embedded with the content and
  dominate short chunks.
  *Fix:* remove lines that repeat across most pages, then re-ingest with a
  bumped `CHUNKER_VERSION`.
- **The embedding bill spikes after a small wording fix in a shared
  header.**
  *Detect:* embedding tokens per day jump while document counts are flat.
  *Cause:* positional chunk IDs, or a breadcrumb change, made every chunk
  of many documents look new.
  *Fix:* use content-addressed IDs; keep volatile data (edit dates,
  counters) out of the embedding input.
- **A deleted policy still appears in answers weeks later.**
  *Detect:* the reconciliation report shows indexed `docId`s that no
  longer exist in the source system.
  *Cause:* the delete event was lost and nothing compared the index with
  the source.
  *Fix:* run reconciliation nightly and alert on orphan counts above zero.
- **Scanned contracts are never found.**
  *Detect:* PDF documents with zero or near-zero chunks after ingestion.
  *Cause:* the files are images; the text layer is empty.
  *Fix:* route pages with little or no extracted text to OCR, and alert
  on documents that produce no chunks.
- **Two copies of the onboarding guide give conflicting answers.**
  *Detect:* the top results contain near-identical chunks from different
  documents with different numbers.
  *Cause:* the guide was copied into a second project and edited there.
  *Fix:* detect near-duplicates with shingle similarity at ingestion, mark
  one as canonical, and show the document date in citations.

## Important terminology

- **Ingestion:** fetching, parsing, cleaning, chunking, enriching, and
  embedding documents into an index.
- **Text layer:** the machine-readable text stored in a born-digital PDF;
  scanned PDFs have none.
- **Normalization (NFC, NFKC):** Unicode forms that make equivalent text
  compare equal; NFKC also folds compatibility characters.
- **Fixed-size chunking:** splitting every N characters or tokens.
- **Recursive splitting:** splitting on a hierarchy of separators, then
  merging pieces up to a size limit.
- **Structure-aware chunking:** splitting at headings and block
  boundaries, with atomic code and tables.
- **Semantic chunking:** splitting where embeddings of neighbouring
  sentences diverge most.
- **Overlap:** text repeated at the start of a chunk from the end of the
  previous one.
- **Breadcrumb:** the document title and heading path embedded and shown
  with a chunk.
- **Content-addressed ID:** an identifier derived from a hash of the
  content, stable while the content is unchanged.
- **Reconciliation:** a periodic comparison of the index with the source
  of truth to repair missed events.
- **Shingle:** an overlapping sequence of words used to measure
  near-duplicate similarity.

## Common mistakes and misconceptions

- **"Chunk size is a magic number."** It depends on the content and the
  questions; measure it.
- **"More overlap is always safer."** Overlap duplicates text, cost, and
  near-identical results; structure-aware chunks rarely need much.
- **"PDF extraction gives you the text."** It gives you positioned text
  fragments; reading order, columns, and tables need work or a layout-aware
  tool.
- **"Semantic chunking is the most advanced, so it is the best."** It is
  the most expensive and can ignore headings that already mark topics.
- **"Re-ingest everything on every change."** It wastes embedding calls
  and still misses deletions unless stale chunks are removed.
- **Embedding the heading path into the ID or hash of every chunk without
  thinking about renames.** Renaming a top-level heading then changes every
  chunk below it; decide whether that is what you want.
- **Normalizing away information,** such as applying NFKC to everything or
  collapsing whitespace inside code.

## Revision questions

1. Why does a structure-aware chunker treat code blocks and tables as
   atomic, and what does it do when one is larger than the size limit?
2. Calculation: a 25,000-character document is split into fixed-size
   chunks of 1,000 characters with 250 characters of overlap. How many
   chunks result, and roughly how many characters are embedded? *(Answer:
   `1 + ceil(24,000 / 750) = 33` chunks; 32 full chunks of 1,000 plus a
   last chunk of 1,000 characters (start 24,000), so about 33,000
   characters, 32% more than the document.)*
3. What does the breadcrumb add to a chunk's embedding, and why is it
   stored separately from the chunk text?
4. Compare positional and content-addressed chunk IDs when a paragraph is
   inserted at the top of a long document.
5. Why does `contentHash` include the embedding model and
   `CHUNKER_VERSION`?
6. Give two reasons a document can stay in the index after it was deleted
   at the source, and the mechanism that catches each.
7. When is semantic chunking worth its extra ingestion cost?
8. How would you detect that a PDF needs OCR during ingestion?

## Further learning

- [Amazon Bedrock: How content chunking works for knowledge bases](https://docs.aws.amazon.com/bedrock/latest/userguide/kb-chunking.html)
- [Unstructured: Chunking](https://docs.unstructured.io/open-source/core-functionality/chunking)
- [Anthropic: Contextual Retrieval](https://www.anthropic.com/research/contextual-retrieval)
- [Docling documentation](https://docling-project.github.io/docling/)
- [unpdf](https://github.com/unjs/unpdf) and [pdf.js](https://mozilla.github.io/pdf.js/)
- [marked](https://marked.js.org/) and [cheerio](https://cheerio.js.org/)
- [Embedding models and dimensions](../embeddings-and-vector-search/embedding-models-and-dimensions.md)
- Next: [evaluating and debugging RAG](evaluating-and-debugging-rag.md). Back to the [retrieval-augmented generation overview](../retrieval-augmented-generation.md).
