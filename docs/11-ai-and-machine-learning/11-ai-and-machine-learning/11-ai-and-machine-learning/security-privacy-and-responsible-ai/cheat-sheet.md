# AI Security, Privacy, and Responsible Use Cheat Sheet

A one-page recap of this subject's lessons, for revision before an
interview or before shipping an AI feature. Facts are as of November 2026.

## Key configuration

```text
# Response headers on every page that renders model output
Content-Security-Policy: default-src 'self'; img-src 'self' https://cdn.taskflow.example.com; frame-src 'none'; object-src 'none'; base-uri 'none'; report-uri /csp-reports; report-to csp
Reporting-Endpoints: csp="/csp-reports"
```

```bash
# .env for the TaskFlow API: traces carry timings and token counts, not prompt text
OTEL_INSTRUMENTATION_GENAI_CAPTURE_CONTENT=NO_CONTENT
```

```ts
// src/security/tool-gate.ts (core rule): a third capability needs a person
const after = new Set([...session.capabilities, ...tool.adds]);
if (after.size === 3) return { kind: "confirm", reason: "untrusted input, private data, and an external action" };
```

| Setting | Where | Why |
|---|---|---|
| `store: false` | OpenAI Responses calls | No stored copy of the response on the provider side |
| `maxRetries: 0`, deadline, fail mode | Moderation call inside a guard | The guard, not SDK retries, owns the latency budget |
| Strip `U+E0000-E007F`, `U+FE00-FE0F`, `U+200B-200D`, `U+2060` | Before text reaches the model or a confirmation | Invisible characters hide instructions and smuggle data |
| No tools | Summaries of untrusted notes | A reader that cannot act cannot be steered into acting |
| `ai.generated: true` plus a label | API responses with AI output | Article 50 disclosure on every client |

## Decision guide

| If you need | Choose | Why |
|---|---|---|
| A summary of shared notes | Labeled data, no tools, output filter, CSP `img-src` | Removes the external-communication leg |
| An agent that reads shared content and acts | Rule of Two gate, confirmation, plan-then-execute or Dual LLM | Bounds what a successful injection can do |
| To catch obvious attacks | Prompt Shields, Llama Prompt Guard 2, or Bedrock's prompt attack filter, as a signal | Detection lowers the rate; it is not a boundary |
| To screen traffic to any provider | Bedrock `ApplyGuardrail` or Model Armor | Runs without invoking a foundation model |
| A nuanced written policy | gpt-oss-safeguard, for appeals and offline labeling | Reasons over your policy, but slower and costlier |
| Classifiers inside your network | Llama Guard 4, ShieldGemma, Granite Guardian | You host and update them |
| A guardrail framework | NeMo Guardrails or Guardrails AI | LLM Guard was archived in July 2026 |
| Contact details in the output | Placeholders with restore for allowed types | The provider and logs see placeholders only |
| Cards, IBANs, secrets in notes | Mask and never restore; warn the user | Restoring payment data or keys has no upside |
| Health, legal, or HR content | Zero retention, matching residency, legal review | Highest-risk data needs contracts, not defaults |
| A feature that allocates or scores work | Treat as EU high-risk (Annex III 4(b)); redesign or get legal review | Rules apply from December 2, 2027 |

## Numbers and defaults to remember

| Item | Value |
|---|---|
| OWASP Top 10 for LLM Applications 2026 | Published August 2026; LLM01 Prompt Injection, LLM03 Excessive Agency, LLM08 Hidden Context Exposure, LLM10 Improper Output Handling |
| Detector bypass odds | `1 - p^n`; p = 0.95, n = 20 gives 64% |
| Base-rate example | 0.5% violations, 96% recall, 1% false positives: precision 0.32 |
| Llama Prompt Guard 2 | 86M (multilingual) and 22M (English), 512-token window |
| Azure Prompt Shields | A prompt plus up to five documents; document attacks off by default in Foundry |
| Azure text severity | 0-7, or 0, 2, 4, 6 when trimmed |
| Gemini adjustable filters | Off by default for Gemini 2.5 and later |
| OpenAI API | Abuse logs up to 30 days; Responses stored at least 30 days unless `store: false` |
| Anthropic API | Deleted within 30 days; flagged content up to 2 years |
| Google durable cache | Deleted within 24 hours |
| EU AI Act | Bans and AI literacy February 2, 2025; GPAI duties August 2, 2025; Article 50 August 2, 2026; new bans December 2, 2026; Annex III December 2, 2027; Annex I August 2, 2028 |
| AI Act maximum fines | EUR 35M or 7% (prohibited); EUR 15M or 3%; EUR 7.5M or 1% |
| System card checker | Evaluation at most 90 days old; review at most 180 days |

## Top mistakes

- **Treating the system prompt as a boundary.** Enforce identity,
  permissions, and tenant filters in code; assume the prompt leaks.
- **Using a detector as the only control.** Remove a leg of the lethal
  trifecta or require confirmation; log detector verdicts.
- **Rendering model Markdown as-is.** Allowlist image and link hosts,
  handle reference-style syntax, and back the filter with CSP `img-src`.
- **Letting the model or chat text approve actions.** Store pending
  actions on the server and accept approval only from a UI control.
- **One moderation threshold for every category and language.** Tune
  each on labeled data and re-run the sweep when the provider's model
  changes.
- **Logging prompts "temporarily".** Log metadata and keyed-hash user ids;
  keep content capture at `NO_CONTENT`.
- **Assuming zero retention covers everything.** Stateful features and
  flagged content are outside it; set `store: false`.
- **Letting a feature drift into a high-risk use.** Keep a "not intended
  for" list in the system card and check cards in CI.

## Where to go deeper

- [Prompt injection and defenses](prompt-injection-and-defenses.md)
- [Guardrails and content moderation](guardrails-and-content-moderation.md)
- [Privacy, PII, and data retention](privacy-pii-and-data-retention.md)
- [AI regulation and governance](ai-regulation-and-governance.md)
- [Interview questions and answers](interview-questions-and-answers.md)

Back to the [Security, privacy, and responsible AI overview](../security-privacy-and-responsible-ai.md).
