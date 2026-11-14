# AI Regulation and Governance

AI features are now regulated in their own right, not only through
privacy and consumer law. The EU AI Act sorts AI systems by risk and
attaches duties to each level; US frameworks such as the NIST AI Risk
Management Framework describe how to manage AI risk voluntarily; and
some US states regulate automated decisions about people. For a team
building TaskFlow's Assistant, meeting summaries, and agent, the
practical questions are which rules apply to which feature, what
evidence to keep, and how to stop a harmless feature from drifting into
a regulated use.

This lesson explains the EU AI Act's roles, risk tiers, and timeline as
of November 2026 (including the 2026 Digital Omnibus changes), the
transparency duties that apply to chat assistants and generated content,
the NIST AI RMF and ISO/IEC 42001, recent US state laws, and how to run
governance as an engineering process with system cards checked in CI.

!!! warning "Not legal advice"
    This page summarizes public sources as of November 2026 so that
    engineers can ask the right questions. It is not legal advice. Laws,
    guidance, and dates change, and how they apply depends on your product
    and where you operate; confirm obligations with qualified counsel.

## Why it matters

Regulation decides what you may build, not only how you document it.
Under the EU AI Act, a TaskFlow feature that infers a team's mood from
meeting notes is a prohibited practice in the workplace, while a feature
that suggests who should get a task based on past performance falls into
a high-risk category with a full compliance regime. Both could be built
in an afternoon with the same API call. Engineers are often the first to
see that a feature has crossed a line, so they need the map.

The cost of getting it wrong is large. Fines under the AI Act reach
EUR 35 million or 7% of worldwide annual turnover for prohibited
practices, and customers increasingly ask for AI documentation in
procurement. Good governance is also good engineering: an inventory of AI
features, a system card per feature, evaluation evidence, and an
incident process make AI features easier to debug, review, and change.

## Real-world usage

- **European Commission.** The
  [AI Act policy page](https://digital-strategy.ec.europa.eu/en/policies/regulatory-framework-ai)
  (updated October 19, 2026) states that the Act entered into force on
  August 1, 2024, "became applicable on 2 August 2026, with some
  exceptions", and that the Digital Omnibus on AI, which entered into
  force on July 27, 2026, moved high-risk rules for Annex III areas to
  December 2, 2027 and for regulated products to August 2, 2028.
- **AI Office codes of practice.** The
  [General-Purpose AI Code of Practice](https://digital-strategy.ec.europa.eu/en/policies/contents-code-gpai)
  (July 10, 2025) has chapters on transparency, copyright, and safety and
  security; the
  [Code of Practice on transparency of AI-generated content](https://digital-strategy.ec.europa.eu/en/policies/code-practice-ai-generated-content)
  (final June 10, 2026) covers marking and labelling. The Commission and
  the AI Board assessed both as adequate voluntary tools for showing
  compliance.
- **NIST.** The [AI Risk Management Framework](https://www.nist.gov/itl/ai-risk-management-framework)
  (AI RMF 1.0, January 2023) is "intended for voluntary use", is
  organized around Govern, Map, Measure, and Manage, and has a
  [Generative AI Profile](https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-generative-artificial-intelligence)
  (NIST AI 600-1, July 2024). NIST says the framework "is being revised
  as part of the White House AI Action Plan".
- **Colorado.** [SB26-189](https://leg.colorado.gov/bills/sb26-189),
  signed May 14, 2026, repealed and re-enacted the 2024 Colorado AI Act
  as a law on automated decision-making technology used in consequential
  decisions such as employment, housing, and lending, with developer
  documentation duties starting January 1, 2027.
- **Model cards.** [Model Cards for Model Reporting](https://arxiv.org/abs/1810.03993)
  (Mitchell et al., 2018) proposed a short standard document for each
  model; [Hugging Face model cards](https://huggingface.co/docs/hub/model-cards)
  made the idea routine for published models.

**Popular tools and providers:** the EU
[AI Act Service Desk](https://ai-act-service-desk.ec.europa.eu/en), the
NIST AI RMF Playbook, ISO/IEC 42001 certification, Hugging Face model
cards, and provider-published model and system cards.

## How it works

### Roles under the EU AI Act

Duties attach to roles, so start by naming yours for each feature:

| Role | Who | TaskFlow example |
|---|---|---|
| Provider of a general-purpose AI model | Develops a model that many systems build on | The model vendor behind `CHAT_MODEL` |
| Provider of an AI system | Develops an AI system and places it on the market under its own name | TaskFlow, for the Assistant and meeting summaries |
| Deployer | Uses an AI system under its authority in a professional activity | A company that rolls out TaskFlow's Assistant to its staff |
| Affected person | Someone the system's output is about | An employee mentioned in a meeting summary |

Roles can shift along the value chain: a company that rebrands a
high-risk system or substantially modifies it can take on provider
duties. TaskFlow is usually a provider of AI systems built on someone
else's model, which means it depends on the model provider's
documentation and owns the documentation of its own features.

### Risk tiers

The Act regulates uses, not models. The same API call can be minimal
risk in one feature and prohibited in another.

![Diagram: a pyramid of four EU AI Act tiers matched with TaskFlow examples; prohibited practices under Article 5, such as inferring a team's mood or emotions from meeting notes; high-risk systems under Article 6 and Annexes I and III, such as suggesting who gets a task from past performance under Annex III point 4(b), applying from 2 December 2027; transparency duties under Article 50 from 2 August 2026, such as the Assistant chat saying it is an AI and generated content possibly needing marking; minimal risk with no new obligations, such as a comment spam filter or title autocomplete; a separate track for general-purpose AI models, whose providers document the model, publish a training-content summary and keep a copyright policy, documentation that TaskFlow relies on.](ai-act-risk-tiers.svg)

- **Prohibited practices (Article 5).** Banned since February 2, 2025.
  The list includes manipulative techniques that cause significant harm,
  social scoring, untargeted scraping of facial images, and, directly
  relevant to workplace software, AI systems "to infer emotions of a
  natural person in the areas of workplace and education institutions",
  except for medical or safety reasons. The Omnibus added bans on
  generating non-consensual intimate imagery of identifiable people and
  child sexual abuse material, applying from December 2, 2026.
- **High-risk systems (Article 6).** Two routes: AI that is a safety
  component of products covered by EU product law (Annex I), and AI used
  in eight sensitive areas (Annex III), such as biometrics, education,
  employment, and access to essential services. Annex III point 4(b)
  covers AI used "to allocate tasks based on individual behaviour or
  personal traits or characteristics or to monitor and evaluate the
  performance and behaviour" of workers, which is exactly where a
  task-management product can wander. Providers of high-risk systems
  need risk management, data governance, technical documentation,
  logging, instructions for deployers, human oversight, and accuracy and
  robustness (Articles 9 to 15), plus a quality management system,
  conformity assessment, registration, post-market monitoring, and
  serious-incident reporting. Deployers have their own duties (Article
  26), including informing workers before using such a system at work.
- **Transparency duties (Article 50).** Apply from August 2, 2026, and
  are covered below.
- **Minimal risk.** Everything else, such as spam filters and
  autocomplete, has no new obligations; voluntary codes apply.

General-purpose AI models have a separate track, applying since August
2, 2025: their providers document the model, give information to
downstream providers, keep a copyright policy, and publish a summary of
training content, with extra duties for models with systemic risk.

### The timeline after the Digital Omnibus

![Diagram: an EU AI Act timeline as of November 2026; entry into force on 1 August 2024; prohibited practices and AI literacy from 2 February 2025; general-purpose AI model duties, governance and fines from 2 August 2025; the Digital Omnibus in force on 27 July 2026, moving high-risk dates; general application including Article 50 transparency from 2 August 2026; new bans on non-consensual intimate deepfakes and CSAM from 2 December 2026; high-risk rules for Annex III areas from 2 December 2027; high-risk AI in regulated products under Annex I from 2 August 2028.](eu-ai-act-timeline.svg)

The Commission proposed the Digital Omnibus on AI on November 19, 2025,
reached political agreement on May 7, 2026, and the regulation entered
into force on July 27, 2026. Its main effect for builders is time: the
Annex III high-risk rules that were due on August 2, 2026 moved to
December 2, 2027, and the rules for AI in regulated products (Annex I)
now apply from August 2, 2028. The transparency duties still apply from
August 2, 2026; the only change is that generative systems already on the
market before that date have until December 2, 2026 to mark their output
under Article 50(2) (new Article 111(4)). It also softened the AI literacy
duty in Article 4, which has applied since February 2025: providers and
deployers must "take measures to support the development of AI literacy"
of their staff, without having to guarantee any specific level, while the
Commission and the Member States support those efforts (consolidated text
on the AI Act Service Desk, as at July 27, 2026).

Penalties are set as a fixed amount or a share of worldwide annual
turnover, whichever is higher (for SMEs, whichever is lower), according
to the Commission's
[enforcement page](https://digital-strategy.ec.europa.eu/en/policies/enforcement-ai-act):

| Breach | Maximum fine |
|---|---|
| Prohibited practices | EUR 35 million or 7% of turnover |
| Most other obligations, including transparency | EUR 15 million or 3% |
| Incorrect or misleading information to authorities | EUR 7.5 million or 1% |

### Transparency duties in practice

Article 50 has five parts that matter to application builders:

1. **People must know they are talking to an AI.** Providers design
   systems that interact with people so that users are "informed that
   they are interacting with an AI system", unless that is obvious to a
   reasonably observant person. The TaskFlow Assistant says so in its
   interface, not only in the terms of service.
2. **Synthetic content must be marked.** Providers of systems that
   generate audio, images, video, or text mark outputs "in a
   machine-readable format and detectable as artificially generated or
   manipulated", with exceptions for assistive editing that does not
   substantially change the input.
3. **Emotion recognition and biometric categorization** require
   informing the people exposed (and emotion inference at work is
   banned outright, as above).
4. **Deepfakes and public-interest text** must be disclosed by
   deployers; text that has undergone human review or editorial control,
   with a person taking editorial responsibility, is exempt.
5. **Timing and form.** The information must be clear and given at the
   latest at the first interaction or exposure.

For TaskFlow, part 1 is the clear duty: the Assistant and the agent show
that they are AI. For AI summaries, the safe engineering choice is to
label them in the UI, keep a machine-readable flag in the API response,
and follow the Commission's guidelines and the transparency code for
marking techniques, rather than guessing which outputs count as
"substantially" generated.

### Beyond the EU

| Framework | Binding? | What it gives you | TaskFlow use |
|---|---|---|---|
| EU AI Act | Law in the EU | Roles, risk tiers, duties, fines | Classify every feature; Article 50 for the Assistant |
| NIST AI RMF 1.0 and AI 600-1 | Voluntary | Govern, Map, Measure, Manage; generative AI risks and actions | The structure of the internal governance process |
| ISO/IEC 42001:2023 | Voluntary, certifiable | Requirements for an AI management system | Evidence for enterprise customers who ask for a certificate |
| Colorado SB26-189 | Law in Colorado | Notice, explanations, and human review for automated consequential decisions | May apply if TaskFlow features materially influence employment decisions about Colorado residents |
| California SB 53 | Law in California | Transparency duties for frontier model developers | Applies to model vendors, not to TaskFlow |

Privacy law runs alongside all of these: the GDPR applies to personal
data in prompts regardless of the AI Act (see
[privacy, PII, and data retention](privacy-pii-and-data-retention.md)).

### Governance as an engineering loop

The NIST AI RMF's four functions work well as a loop per feature, with
artifacts that live in the repository:

![Diagram: the NIST AI RMF functions as a loop; Govern in the middle holds policy, roles, the AI inventory and a review board and applies across the others; Map writes the system card with purpose, users, data, risk tier and applicable laws; an arrow labeled risks to test leads to Measure, which runs evaluation suites, red-team runs and privacy and bias checks; an arrow labeled results leads to Manage, which makes the launch decision and handles monitoring, incidents and retirement; changes and incidents lead back to Map; ISO/IEC 42001 certifies the management system around the loop.](ai-governance-loop.svg)

- **Govern:** an AI policy, named owners, an inventory of every AI
  feature, and a review step for new features or new uses.
- **Map:** a system card per feature: purpose, users, uses it must not
  be put to, data, model, risk tier, and applicable laws.
- **Measure:** evaluation suites, red-team results, and privacy checks,
  stored as evidence (see
  [evals in CI and regression testing](../evaluation-and-monitoring/evals-in-ci-and-regression-testing.md)).
- **Manage:** launch decisions, monitoring, incident handling, and
  retirement, with changes feeding back into the card.

### Model cards and system cards

A model card, as proposed by Mitchell et al., documents a trained model:
details, intended use, factors, metrics, evaluation and training data,
quantitative analyses, ethical considerations, and caveats. Model
providers publish model or system cards for their models; read them
before choosing a model, and link them from your own documentation.

TaskFlow does not train the models it uses, so its unit of documentation
is the AI feature: a system card that records what the feature is for,
what it must not be used for, which model and data it uses, how it was
evaluated, where people oversee it, and who to contact when it goes
wrong. The "not intended for" list matters most for regulation, because
it is where a team writes down, for example, that meeting summaries must
not be used to evaluate employees.

## When to use and when not to use

| Situation | What to do |
|---|---|
| Internal prototype on synthetic data | Inventory entry and a short card; no launch without review |
| Customer-facing assistant or generated content | Card, evals, Article 50 disclosure and labels, privacy review |
| Feature that ranks, scores, or allocates work to people | Treat as high-risk in the EU and as a consequential decision in Colorado; legal review before design, or redesign |
| Inferring emotions or mood of workers or students | Do not build it for EU workplaces or schools |
| Minimal-risk helpers such as autocomplete | Inventory entry and a lightweight card |

When not to add process:

- Do not run a full high-risk process for minimal-risk features; it
  slows teams down and teaches them to treat governance as paperwork.
- Do not write documentation that nobody checks; a card that CI does not
  read goes stale within a quarter.
- Do not rely on a vendor's compliance claims for your own feature; the
  model provider's documentation covers the model, not your use of it.

## Practical examples

### A system card as data

Keeping cards as JSON next to the code means they are reviewed in pull
requests, versioned with the feature, and checkable by machines:

```json
{
  "id": "meeting-summary",
  "name": "Meeting-notes summary",
  "owner": "ai-platform-team",
  "purpose": "Summarize a project's meeting notes into action items for members of that project.",
  "intendedUsers": "Members of the project the notes belong to",
  "notIntendedFor": [
    "Evaluating, ranking, or monitoring individual employees",
    "Inferring the emotions or mood of meeting participants"
  ],
  "riskTier": "transparency",
  "transparency": "The UI labels every summary as AI-generated and shows the notes it cites.",
  "model": {
    "provider": "openai",
    "configKey": "CHAT_MODEL",
    "changePolicy": "A new model ships only after the evaluation suite passes on it."
  },
  "data": {
    "inputs": ["meeting notes the user can read"],
    "personalData": "Names and contact details; emails and phone numbers are redacted before sending.",
    "providerRetention": "store=false; abuse-monitoring logs per the provider's terms",
    "residency": "EU workspaces use the EU project and base URL"
  },
  "evaluation": {
    "suite": "evals/meeting-summary",
    "lastRun": "2026-11-02",
    "metrics": { "actionItemRecall": 0.91, "unsupportedClaimRate": 0.02 }
  },
  "humanOversight": "Summaries stay drafts until a project member publishes them.",
  "limitations": [
    "Misses some action items phrased as questions",
    "Lower quality for notes that mix several languages"
  ],
  "incidentContact": "ai-incidents@taskflow.example.com",
  "reviewedOn": "2026-10-15"
}
```

The file lives at `governance/system-cards/meeting-summary.json`. The
model field names the configuration key, not a model ID, so the card
stays true when the model changes; the evaluation record says which
suite gates a model change.

### Checking cards in CI

```ts
// src/governance/check-system-cards.ts: fail CI when an AI feature's system card is missing, incomplete, or stale
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "use YYYY-MM-DD");

const SystemCard = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  owner: z.string().min(1),
  purpose: z.string().min(20),
  intendedUsers: z.string().min(1),
  notIntendedFor: z.array(z.string()).min(1, "list at least one use the feature must not be used for"),
  riskTier: z.enum(["prohibited", "high", "transparency", "minimal"]),
  transparency: z.string().min(1),
  model: z.object({ provider: z.string(), configKey: z.string(), changePolicy: z.string().min(1) }),
  data: z.object({
    inputs: z.array(z.string()).min(1),
    personalData: z.string(),
    providerRetention: z.string(),
    residency: z.string(),
  }),
  evaluation: z.object({ suite: z.string(), lastRun: isoDate, metrics: z.record(z.string(), z.number()) }),
  humanOversight: z.string().min(1).optional(),
  limitations: z.array(z.string()).min(1, "document at least one known limitation"),
  incidentContact: z.email(),
  reviewedOn: isoDate,
});
// The fields the policy rules need, checked even when other parts of the card are invalid
const PolicyView = SystemCard.pick({ riskTier: true, humanOversight: true, evaluation: true, reviewedOn: true });

const daysBetween = (from: string, to: Date) => Math.floor((to.getTime() - Date.parse(from)) / 86_400_000);

// Rules the schema cannot express: freshness, and duties that depend on the risk tier
export function policyProblems(card: z.infer<typeof PolicyView>, today: Date): string[] {
  const problems: string[] = [];
  if (card.riskTier === "prohibited") problems.push("risk tier 'prohibited': this feature must not ship");
  if (card.riskTier === "high" && !card.humanOversight) problems.push("high risk: humanOversight is required");
  if (card.riskTier === "high") problems.push("high risk: needs a conformity plan and legal sign-off before launch");
  if (Object.keys(card.evaluation.metrics).length === 0) problems.push("evaluation has no recorded metrics");
  if (daysBetween(card.evaluation.lastRun, today) > 90) problems.push(`evaluation is ${daysBetween(card.evaluation.lastRun, today)} days old (max 90)`);
  if (daysBetween(card.reviewedOn, today) > 180) problems.push(`review is ${daysBetween(card.reviewedOn, today)} days old (max 180)`);
  return problems;
}

export async function checkCards(dir: string, today: Date): Promise<number> {
  let failures = 0;
  for (const file of (await readdir(dir)).filter((f) => f.endsWith(".json")).sort()) {
    const raw: unknown = JSON.parse(await readFile(join(dir, file), "utf8"));
    const parsed = SystemCard.safeParse(raw);
    const problems = parsed.success ? [] : parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
    const view = PolicyView.safeParse(raw);
    if (view.success) problems.push(...policyProblems(view.data, today));
    console.log(`${problems.length === 0 ? "PASS" : "FAIL"} ${file}`);
    for (const p of problems) console.log(`  - ${p}`);
    if (problems.length > 0) failures += 1;
  }
  return failures;
}

// Usage: node dist/src/governance/check-system-cards.js governance/system-cards [YYYY-MM-DD]
if (process.argv[1]?.endsWith("check-system-cards.js")) {
  const [dir = "governance/system-cards", day] = process.argv.slice(2);
  const failures = await checkCards(dir, day ? new Date(`${day}T00:00:00Z`) : new Date());
  process.exitCode = failures > 0 ? 1 : 0;
}
```

The schema (zod) checks shape and required content; `policyProblems`
adds rules that depend on the risk tier and on dates, and runs even when
the schema fails, so one run reports everything. Running it on the
meeting-summary card and a proposed "workload insights" card, which
would suggest who takes a task based on past performance, printed:

```text
PASS meeting-summary.json
FAIL workload-insights.json
  - notIntendedFor: list at least one use the feature must not be used for
  - limitations: document at least one known limitation
  - high risk: humanOversight is required
  - high risk: needs a conformity plan and legal sign-off before launch
  - evaluation has no recorded metrics
  - evaluation is 178 days old (max 90)
  - review is 258 days old (max 180)
```

The process exited with code 1, which fails the build. The proposed
feature is the Annex III 4(b) case from above: the checker cannot decide
the legal question, but it forces the conversation before launch rather
than after.

### Running the check on every change and every week

```yaml
# .github/workflows/ai-governance.yml: block merges when an AI feature's system card is missing or stale
name: ai-governance
on:
  pull_request:
    paths:
      - "governance/system-cards/**"
      - "src/**"
  schedule:
    - cron: "0 6 * * 1" # weekly, so cards go stale in CI even when nobody edits them
jobs:
  system-cards:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npx tsc -p .
      - run: node dist/src/governance/check-system-cards.js governance/system-cards
```

The schedule matters as much as the pull-request trigger: evaluation
evidence and reviews age even when the code does not change. The
workflow passed `actionlint`; CI setup in general is covered in
[security in the delivery pipeline](../../../../08-devops-and-deployment/08-devops-and-deployment/devsecops-and-cloud-security/security-in-the-delivery-pipeline.md).

### Disclosing AI output in the API

Transparency is easier to keep consistent when the API carries it, so
every client (web, mobile, email digest) can show the same label:

```json
{
  "summary": "Action items: ship the export feature (note-12); fix the login bug (note-14).",
  "ai": {
    "generated": true,
    "feature": "meeting-summary",
    "label": "AI-generated summary. Check it against the notes before sharing.",
    "card": "https://app.taskflow.example.com/ai/meeting-summary"
  }
}
```

A UI test that fails when a component renders a response with
`ai.generated: true` but without the label catches the most common
transparency gap: a new surface, such as an email digest, that forgets
it (see [frontend patterns for AI features](../building-ai-applications/frontend-patterns-for-ai-features.md)).

## Best practices

- Keep an inventory of every AI feature, owned by a named team.
- Classify each feature's risk tier at design time, and again when its
  use changes.
- Write a system card per feature, including what it must not be used
  for, and check cards in CI on every change and on a schedule.
- Treat any feature that ranks, scores, monitors, or allocates work to
  people as a legal-review trigger.
- Show users that they are dealing with an AI, and carry an AI flag in
  API responses so every client can label output.
- Keep evaluation and red-team results as dated evidence, linked from
  the card.
- Track model providers' documentation, terms, and deprecations as part
  of vendor management.
- Run an incident process for AI failures: record, contain, fix, and
  update the card.
- Follow official sources (the Commission, the AI Act Service Desk,
  NIST, state legislatures) and date every claim in internal guidance.

## In production

- **An AI feature ships without anyone knowing.**
  *Detect:* a CI job that searches for model SDK imports finds a call
  site with no matching system card. *Cause:* a team added an AI helper
  inside an existing feature. *Fix:* fail the build when model clients
  are used outside registered features, and add the card.
- **A customer uses a feature for something it was not designed for.**
  *Detect:* support requests or usage analytics show workload
  suggestions being exported into performance reviews. *Cause:* the
  feature drifted into an Annex III 4(b) use. *Fix:* re-classify,
  restrict the export, update terms and the card's "not intended for"
  list, and get legal advice before continuing.
- **Evaluation evidence goes stale.**
  *Detect:* the weekly governance job fails with "evaluation is 120
  days old". *Cause:* model upgrades shipped without re-running the
  suite. *Fix:* make the evaluation run part of the model-change
  process, and record the result in the card automatically.
- **A new surface shows AI output without a label.**
  *Detect:* a UI review or an automated test finds an email digest with
  AI summaries and no disclosure. *Cause:* the label lived only in the
  web component. *Fix:* carry the AI flag in the API response and test
  every client against it.
- **The model provider changes terms or retires a model.**
  *Detect:* a provider deprecation notice, or a changed data-retention
  page. *Cause:* normal vendor change. *Fix:* treat provider changes as
  card review triggers, re-run evaluations on the replacement model, and
  update privacy documentation.
- **An AI summary states something false and damaging about a person.**
  *Detect:* a user report through the incident contact on the card.
  *Cause:* hallucination or a prompt-injected note. *Fix:* remove the
  output, preserve logs for the investigation, add the case to the
  evaluation set, and review whether the feature needs stronger human
  review before publishing.

## Important terminology

- **Provider:** Under the AI Act, whoever develops an AI system or model
  and places it on the market under its own name.
- **Deployer:** An organization using an AI system under its authority
  in a professional context.
- **General-purpose AI model:** A model that can serve many tasks and is
  integrated into many downstream systems.
- **High-risk AI system:** A system in Annex I products or Annex III
  areas, subject to requirements before and after it is placed on the
  market.
- **Prohibited practice:** A use banned outright under Article 5.
- **Transparency obligations:** Article 50 duties to tell people they are
  interacting with AI and to mark or disclose generated content.
- **Digital Omnibus on AI:** The 2026 amending regulation that moved the
  high-risk dates and added new prohibitions.
- **AI RMF:** NIST's voluntary AI Risk Management Framework, organized
  into Govern, Map, Measure, and Manage.
- **ISO/IEC 42001:** The international standard for AI management
  systems, which organizations can be certified against.
- **Model card / system card:** A short, structured document describing
  a model or an AI feature, its intended use, evaluation, and limits.

## Common mistakes and misconceptions

- "We only call an API, so the AI Act is the vendor's problem." The
  vendor covers its model; your feature and its use are yours.
- "The high-risk rules were delayed, so nothing applies yet."
  Prohibitions, AI literacy, and transparency duties already apply.
- "Our feature is fine because the model is general-purpose." Risk
  follows the use: allocating work by personal traits is high-risk
  whatever model does it.
- Writing the card once at launch and never updating it.
- Documenting what a feature does but not what it must not be used for.
- Treating NIST or ISO frameworks as law, or treating them as optional
  extras when a customer contract requires them.
- Relying on blog summaries of legal changes instead of the official
  sources, especially for dates.

## Revision questions

1. What is the difference between a provider and a deployer under the
   AI Act, and which is TaskFlow for its Assistant?
2. Which TaskFlow feature ideas would be prohibited, high-risk,
   transparency-only, or minimal risk? Give one each.
3. What did the 2026 Digital Omnibus change, and what did it leave in
   place?
4. A company with EUR 2 billion in worldwide annual turnover deploys a
   prohibited practice. What is the maximum fine? What is it for an SME
   with EUR 10 million in turnover?
5. What does Article 50 require of a chat assistant, and how would you
   make sure every client shows the disclosure?
6. Map the four NIST AI RMF functions to artifacts in a repository.
7. Why does a system card's "not intended for" list matter for
   compliance, and how can CI help keep it honest?
8. Which US state laws discussed here could apply to TaskFlow, and
   which apply only to model developers?

## Further learning

- [European Commission: AI Act policy page](https://digital-strategy.ec.europa.eu/en/policies/regulatory-framework-ai)
- [AI Act Service Desk (official text and guidance)](https://ai-act-service-desk.ec.europa.eu/en)
- [EUR-Lex: Regulation (EU) 2024/1689, the AI Act](https://eur-lex.europa.eu/eli/reg/2024/1689/oj)
- [NIST: AI Risk Management Framework](https://www.nist.gov/itl/ai-risk-management-framework)
- [ISO/IEC 42001: AI management systems](https://www.iso.org/standard/42001)
- [Model Cards for Model Reporting (arXiv)](https://arxiv.org/abs/1810.03993)
- [Datasheets for Datasets (arXiv)](https://arxiv.org/abs/1803.09010)
- Related: [AI data preparation and governance](../ai-data-preparation-and-governance.md),
  [LLMOps: prompt and model versioning](../mlops-and-model-lifecycle/llmops-prompt-and-model-versioning.md)
- Next: [interview questions and answers](interview-questions-and-answers.md). Back to the [AI security, privacy, and responsible use overview](../security-privacy-and-responsible-ai.md).
