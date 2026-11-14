# Evaluation and Monitoring Interview Questions and Answers

These questions review how to build evaluation sets, grade outputs with
code and LLM judges, run evals as regression tests in CI, and observe
LLM features in production with traces, metrics, and user feedback. Try
answering each one before reading the answer.

## Building evaluation sets

### 1. What is an evaluation set, and how is it different from a benchmark?

A fixed, versioned list of cases for one feature, each with an input
exactly as the feature receives it and an expectation a correct output
must satisfy. A public benchmark measures general model ability on
someone else's task; an evaluation set measures your feature, with your
prompts, tools, and data, on the inputs your users send.

### 2. What are the parts of a good evaluation case?

The input (for the TaskFlow Assistant: request, project members, server
time, time zone), the expectation (only the keys that matter, such as
`dueDate` and `intent`), and metadata: a stable id, slice tags, the
split, a `critical` flag, the source and a trace or incident reference,
who labeled it, the dataset version that added it, and its status.

### 3. Why should expectations often be partial?

Many outputs are correct for the same input: "Call the bank" and "Phone
the bank" are both fine titles. Pinning one exact value makes good
outputs fail and trains people to ignore the eval. Check what the case
is about, and leave other qualities to other cases or to a rubric.

### 4. What kinds of expectations can a case hold?

Reference values (exact `dueDate`), properties every output must satisfy
(assignee is a member or `null`), a reference answer plus criteria
(cite note X and state the launch date), criteria only (a rubric for a
summary), and pairwise preferences between two outputs. Prefer the first
two; they are graded by code.

### 5. Where do good cases come from?

Hand-written cases from the spec before launch; sampled production
traces; failure signals such as thumbs-down, edited drafts, and retries;
incidents and bug reports; and synthetic variations to fill thin slices.
Each source covers a gap the others leave. Reading real traces (error
analysis) finds most of the useful ones.

### 6. How do you sample cases from production responsibly?

Use only traffic you may reuse (consent and policy), scrub personal data
before anything is stored, keep the trace ID rather than the raw request,
deduplicate on normalized and scrubbed text, and stratify: take failure
signals first, fill every slice to a minimum, then add random traffic.
Repeat the sampling regularly as traffic changes.

### 7. Why is random sampling of production traffic not enough?

It mirrors traffic, so a slice that is 0.5% of requests gets one case in
200, which measures nothing. Rare but important inputs (injection
attempts, other languages, late-evening time zones) need deliberate
minimum counts, often filled with hand-written or synthetic cases
because production contains too few of them.

### 8. What is leakage in an evaluation set?

Anything that lets the system see the answer or lets tuning inflate the
test score: a production request that is also a few-shot example in the
prompt, the same or a near-duplicate request in both the dev and test
splits, or test cases copied into prompt instructions.

### 9. How do you make labels trustworthy?

Write a labeling guide that answers ambiguous questions with product
sign-off, prefer pass/fail with a written reason, use domain experts for
domain judgments, double-label a share of every round, measure agreement,
and adjudicate every disagreement, updating the guide when a rule was
unclear.

### 10. How do you compute Cohen's kappa, and why not raw agreement?

`kappa = (p_observed - p_expected) / (1 - p_expected)`, where
`p_expected` is the agreement two labelers would reach by chance given
how often each uses each label. Raw agreement overstates consistency
when one label dominates: with 75% passing outputs, random guessing
already agrees most of the time. Example: 85% raw agreement with
`p_expected = 0.60` is a kappa of 0.63.

### 11. Why report scores per slice, and how many cases does a slice need?

One overall score hides concentrated failures. The 95% margin of a pass
rate is about `1.96 * sqrt(p * (1 - p) / n)`: plus or minus 8 points for
50 cases at 90%, 6 for 100, 3 for 400. If all `n` cases pass, the true
failure rate can still be about `3 / n` (the rule of three), so 12 out of
12 proves little. Report intervals and add cases where slices matter.

### 12. How do you version an evaluation set?

Keep it in the repository as JSONL, release immutable versions with
semantic numbers, never edit a released case (retire it with a reason and
add a new id), record a manifest with the content hash and counts, check
it in CI before every run, and store `dataset@version` with every result.

## LLM-as-judge and automated evals

### 13. Why should code-based checks come before an LLM judge?

They are instant, free, deterministic, and exact for anything a program
can decide: JSON validity, schema, field equality, membership, date
rules, length, citations that exist, tool-call arguments. Every check
moved from a judge to code removes cost and noise. A judge is for what
remains: faithfulness, completeness, usefulness.

### 14. What is the grader ladder?

Code checks, then reference comparison, then an LLM judge, then human
review. Each rung up handles more nuance but costs more, is slower, and
varies more. Push every check as low as it can go, and use humans mainly
for calibration labels and hard cases.

### 15. What makes a good rubric?

One criterion per judgment, binary verdicts, PASS and FAIL definitions
with real examples, reasoning before the verdict in a structured output,
graded text treated as data inside escaped tags, and code-checkable
criteria such as length kept out of the judge.

### 16. Why prefer pass/fail over a 1-to-10 scale?

People and models apply binary criteria much more consistently, the
result is easier to act on, and agreement with human labels is easier to
measure. A scale mixes several qualities into one number and drifts. If
a scale is truly needed, define every point.

### 17. Compare pointwise, pairwise, and reference-guided judging.

Pointwise grades one output against criteria and gives absolute numbers
for thresholds and monitoring. Pairwise picks the better of two outputs,
which is easier and more consistent but needs two versions and is
exposed to position bias. Reference-guided compares an output with a
labeled answer, which anchors the judge but needs references.

### 18. What is position bias, and how do you counter it?

A judge's verdict depends on which answer it sees first. Judge both
orders, score a flip as a tie, and report the flip rate. In a simulation
where the judge picked the first slot 30% of the time, one fixed order
reported a 32% win rate for a prompt that was truly better 54% of the
time; both orders brought it back near 51%.

### 19. What are verbosity bias and self-preference?

Verbosity bias: judges favor longer answers even when length adds
nothing; counter it with criteria that say length is not a merit, a
length check in code, and comparisons at similar lengths. Self-preference:
judges favor text from their own model family; use a judge from a
different family or calibrate for it.

### 20. How do you calibrate a judge?

Collect 100 to 200 real outputs with enough failures, have experts label
them with critiques, develop the judge prompt on one part and measure it
on a held-out part, and look at the confusion matrix: true positive rate,
true negative rate, and kappa. Re-calibrate when the judge model, prompt,
or rubric changes.

### 21. Why is accuracy a misleading summary of a judge?

If 85% of outputs are good, a judge that passes everything is 85%
accurate and catches nothing. The true negative rate (the share of
expert-failed outputs the judge fails) shows whether the judge catches
problems; a judge with 87% accuracy and a TNR of 64% misses about a third
of real failures.

### 22. How can you correct a judge's observed pass rate?

With known error rates, the Rogan-Gladen estimator gives
`p_true = (p_obs + TNR - 1) / (TPR + TNR - 1)`. With TPR 0.964, TNR
0.639, and an observed 88.0%, the estimate is 86.0%. It is unstable when
TPR + TNR is close to 1, and only as good as the calibration sample.

### 23. What is criteria drift?

The finding by Shankar and colleagues that people need criteria to grade
outputs, but grading outputs is what helps them define the criteria.
Rubrics and labels change during labeling and calibration; when a judge
and experts keep disagreeing on the same cases, fix the criterion rather
than tuning the judge to an unclear label.

### 24. How do you get structured verdicts from a judge model?

Use the provider's structured output support so the verdict is always
parseable: in the OpenAI SDK, `client.responses.parse()` with
`zodTextFormat(schema, "verdict")` and read `output_parsed`; in the
Anthropic SDK, `client.messages.parse()` with
`output_config: { format: zodOutputFormat(schema) }`; in the Google Gen
AI SDK, `responseMimeType: "application/json"` with `responseJsonSchema`.
Read the judge model ID from configuration.

### 25. How do you test judge code without paying for API calls?

Make the grader an injected function and test the plumbing with a stub:
every criterion is graded, one failing criterion fails the output, and
graded text cannot close its data tags. The tests check wiring;
calibration measures judgment.

## Evals in CI and regression testing

### 26. Why keep model-calling evals out of `npm test`?

Unit tests must be fast, free, and deterministic; evals call models, cost
money, and are noisy. Mixing them makes unit tests flaky and expensive.
Give evals their own job, gate, and schedule, and keep unit tests for
rendering, parsing, checks, and judge plumbing with stubs.

### 27. Where in the delivery process should evals run?

Unit tests on every commit; a cached eval suite on pull requests that
touch AI code; the full suite nightly without a cache and with repeats to
catch model drift and flakiness; a full paired comparison before a model
or provider switch; and code checks, sampled judges, and feedback in
production.

### 28. Name some eval tools and when you would use each.

promptfoo (YAML config with JavaScript, TypeScript, or Python extensions,
any stack), DeepEval (Pytest-style, Python), Braintrust (hosted, `Eval()`
plus autoevals), the OpenAI Evals API (hosted graders), Inspect (Python
framework from the UK AI Security Institute and Meridian Labs, for
capability and agentic evals). evalite (TypeScript on Vitest) was
deprecated in November 2026. Keep the dataset and checks in your
repository and treat the tool as a runner.

### 29. Why use a custom provider in promptfoo for an application feature?

It runs the same code path production uses (template, parameters,
parsing) instead of a copy of the prompt in YAML, so the eval tests what
ships. Its id can include the prompt version and hash, so every result
records which template produced it. A custom provider handles its own
response caching.

### 30. How does promptfoo signal failure to CI?

`promptfoo eval` exits with code 100 when the pass rate is below
`PROMPTFOO_PASS_RATE_THRESHOLD` (default 100%) and with an error code
when providers fail. Setting the threshold to 0 leaves the decision to a
separate gate script that compares with a baseline.

### 31. Why can't you pass an array as a promptfoo test variable for one case?

promptfoo expands array-valued variables into one test per element, so a
`members` array would multiply the tests. Pass the case as a single
object and read it in the provider and assertions.

### 32. What rules should a regression gate include?

Critical cases must always pass; absolute floors (schema validity 100%,
a minimum overall pass rate); a paired comparison with the committed
baseline that fails only if the drop exceeds a tolerance and is
statistically significant; and budgets for tokens and latency.

### 33. Why compare runs case by case instead of comparing pass rates?

Only the cases where the versions disagree carry information. A change
that fixes 5 cases and breaks 7 barely moves the average but produces a
list of 7 regressions to read. McNemar's test on regressions and fixes is
far more sensitive than comparing two independent rates.

### 34. Compute a McNemar test example.

16 regressions and 3 fixes: under "no real change", each discordant case
is a coin flip, so the two-sided exact p-value is
`2 * P(X <= 3)` for `X ~ Binomial(19, 0.5)`, about 0.004. That is very
unlikely to be chance, so the gate fails. With 7 regressions and 5 fixes,
p is about 0.77: noise.

### 35. Where does nondeterminism come from, and how do you handle it?

Sampling, provider-side batching and hardware effects, model aliases that
move, and timing in agents. Pin model snapshots in configuration, do not
rely on sampling parameters, repeat cases, aggregate deliberately, know
the noise band, compare pairs, and track flaky cases.

### 36. Does temperature 0 make LLM evals reproducible?

No. It reduces variation where supported but does not guarantee identical
outputs, and support differs by API: OpenAI's Responses API accepts
`temperature` but has no `seed`, and Anthropic's API version `2026-10-21`
removed `temperature`, `top_p`, and `top_k` (requests that send them get a
400 error). Design the evals to measure through the noise instead.

### 37. Explain pass@k and pass^k.

With k runs per case, pass@k counts a case if at least one run succeeds
(what is possible); pass^k counts it only if all runs succeed
(reliability), a metric proposed in the tau-bench paper. For user-facing
features, report pass^k or the mean pass rate; pass@k flatters.

### 38. How do you control the cost of evals?

Path filters, a response cache on pull requests (disabled nightly), code
checks before judges, tiered suites (critical cases on pull requests,
everything nightly), sampling with a fixed seed, cheaper calibrated
judges, batch APIs for nightly runs, and concurrency limits. Give evals a
separate API key with a spending limit.

### 39. How do you handle secrets and forks in an eval workflow?

Store provider keys as secrets scoped to the eval job, keep model IDs in
repository variables, and skip the eval job for pull requests from forks,
which receive no secrets, instead of letting it fail. Never let evals
trigger real side effects such as sending email.

## LLM observability and tracing

### 40. What does LLM observability add to ordinary observability?

Model-aware signals: tokens (input, cached, output, reasoning) per
feature and model, model calls per request, prompt versions and model
snapshots on every span, provider errors and incomplete responses,
schema-validation failures, and quality signals such as user feedback and
judge scores on sampled traces.

### 41. What do the OpenTelemetry GenAI semantic conventions define, and what is their status?

Span names, attributes, and metrics for model calls, embeddings,
retrieval, tool execution, and agents. As of November 2026 they are in
Development status. In core semantic conventions v1.42.0 (June 2026)
they moved to the dedicated `semantic-conventions-genai` repository,
which had not yet published a release.

### 42. How is a model-call span named, and which attributes are required?

`{gen_ai.operation.name} {gen_ai.request.model}`, for example
`chat <model>`, as a `CLIENT` span. `gen_ai.operation.name` and
`gen_ai.provider.name` are required; request and response model,
response id, token usage, and finish reasons are recommended. Tool
execution is `execute_tool {tool name}` and retrieval is `retrieval`,
both `INTERNAL`.

### 43. Why record both the requested and the returned model?

The request often uses an alias; the response names the dated snapshot
that actually ran. When behavior changes without a deploy, comparing
`gen_ai.response.model` before and after shows whether the provider moved
the alias.

### 44. Should prompts and answers be recorded in traces?

Not by default. The conventions say instrumentations should not capture
instructions, inputs, and outputs by default because they are sensitive,
and describe three patterns: record nothing, record content on spans
(for example in pre-production), or store content externally and record
only a reference, which they recommend for production.

### 45. How do you keep personal data out of traces?

Content off by default; redact at the source when it is captured; redact
again in the Collector with the redaction processor; store full content
separately with its own access control and short retention when truly
needed; pseudonymize user IDs; and set retention and deletion for the
tracing backend like any database of user data.

### 46. Why route telemetry through an OpenTelemetry Collector?

It enforces policy for every service in one place (redaction, sampling),
fans out to several backends, and lets you change vendors by editing one
file instead of every service. Tail sampling there keeps every error and
slow trace while sampling the rest.

### 47. What is the catch with tail sampling?

It decides after a trace completes, so all spans of a trace must reach
the same Collector instance; a scaled deployment needs routing by trace
ID first. It also holds traces in memory while waiting, which needs
capacity planning.

### 48. Compare Langfuse, LangSmith, and Arize Phoenix.

Langfuse: open source (MIT core), owned by ClickHouse since January 2026,
cloud or self-hosted, OTLP endpoint, traces plus prompts, datasets, and
scores. LangSmith: LangChain's commercial platform, SDK tracing with
`wrapOpenAI` and `traceable`, also accepts OTLP. Phoenix: Elastic License
2.0, self-hosted, built on OpenTelemetry and OpenInference, with
evaluations and experiments next to traces.

### 49. What is OpenInference, and why does it matter when mixing tools?

Arize's conventions and instrumentations used by Phoenix. They use their
own attribute names, such as `openinference.span.kind` and
`llm.token_count.prompt`, rather than `gen_ai.*`, so dashboards and
queries built for one convention do not automatically work with spans
from the other.

### 50. How do you build token and cost dashboards safely?

Record token usage and duration as metrics with low-cardinality labels
(feature, operation, provider, model, prompt version), compute cost from
token counts and a price table in configuration, and never use user IDs,
trace IDs, or prompt text as labels. Through a Prometheus exporter,
`gen_ai.client.token.usage` becomes `gen_ai_client_token_usage`.

### 51. Why can a reasoning model cost more than its per-token price suggests?

Reasoning tokens are billed as output tokens, so a long thinking phase
adds output tokens the user never sees. Cached input tokens usually cost
less than uncached ones. Track reasoning and cached tokens separately to
see where the money goes.

### 52. How do you connect user feedback to what produced an answer?

Return the trace ID with every AI response, send it back with the
feedback, check that the trace belongs to the user, store the feedback in
your own database, and attach it to the trace as a score. The trace then
shows the prompt version, model, retrieval, and tool calls behind the
complaint.

### 53. Why is user feedback not an accuracy measurement?

It is biased: unhappy users click more, and some errors (a subtly wrong
date) are never noticed. Use feedback rates as trends and triage signals,
turn triaged failures into evaluation cases, and keep the offline set as
the source of truth.

## Scenario-based questions

### 54. The eval suite's pass rate rose for five releases, but thumbs-down rates are flat. What is going on?

**What to check first:** whether prompts mention test cases, how old the
test split is, and how its slices compare with current traffic.

**How to confirm:** score a fresh sample of recent production traces with
the same checks; compare with the test split's score.

**Likely causes and fixes:** overfitting to the test cases, or a set that
no longer reflects traffic. Refresh the test split from production,
remove test material from prompts, and keep a dev split for iteration.
See [building evaluation sets](building-evaluation-sets.md).

### 55. The overall score clears the target, but a customer in Los Angeles keeps getting tasks due a day late. Why didn't the eval catch it?

**What to check first:** the per-slice report for late-evening and time
zone slices.

**How to confirm:** count active cases with relative dates late in the
evening in western time zones; check their pass rate and interval.

**Likely causes and fixes:** a coverage gap: too few cases to move the
score, and the date computed from UTC. Add the incident as a critical
case, fill the slice, and add a code check that compares against the
user's local date. See [building evaluation sets](building-evaluation-sets.md).

### 56. Two engineers report 91% and 87% for the same prompt on the same day. Who is right?

**What to check first:** the dataset version, hash, and case counts in
each result.

**How to confirm:** run the manifest check on both checkouts; diff the
cases files.

**Likely causes and fixes:** different datasets: someone edited labels
without a version bump. Release a proper version, run the manifest check
in CI before every eval, and compare only runs with the same
`dataset@version`. See [building evaluation sets](building-evaluation-sets.md).

### 57. The judge reports a 95% pass rate on summaries, but support tickets about wrong summaries keep coming. What do you do?

**What to check first:** the judge's calibration results, especially its
true negative rate.

**How to confirm:** have experts label a fresh production sample and
compare with the judge's verdicts.

**Likely causes and fixes:** a lenient judge that misses real failures.
Sharpen FAIL definitions with examples from the missed cases, measure on
held-out labels, and report corrected rates meanwhile. See
[LLM-as-judge and automated evals](llm-as-judge-and-automated-evals.md).

### 58. A pairwise eval says the new summary prompt wins 70% of comparisons, but users like it less. Why?

**What to check first:** whether the comparison ran in both orders and
how output lengths differ.

**How to confirm:** rerun with both orders, report the flip rate, and
compare win rates on length-matched pairs.

**Likely causes and fixes:** position or verbosity bias. Judge both
orders, add a length check, and tell the judge that length is not a
merit. See [LLM-as-judge and automated evals](llm-as-judge-and-automated-evals.md).

### 59. Judge scores dropped five points overnight, but nothing in the app changed. What happened?

**What to check first:** the judge model ID and the judge prompt version
recorded with each run.

**How to confirm:** rerun yesterday's outputs through today's judge; if
the verdicts change, the judge changed.

**Likely causes and fixes:** a judge model alias moved, or the judge
prompt was edited. Pin the judge model in configuration, version the
judge prompt with the rubric, and re-calibrate before accepting a new
baseline. See [LLM-as-judge and automated evals](llm-as-judge-and-automated-evals.md).

### 60. The eval job fails on about one pull request in five, and reruns pass. How do you fix the gate?

**What to check first:** the gate rule and the number of runs per case.

**How to confirm:** run the same commit several times and look at the
spread of pass rates and which cases flip.

**Likely causes and fixes:** a raw pass-rate threshold tighter than the
noise band. Gate on a paired comparison with a significance test, add
repeats nightly, and list flaky cases for relabeling. See
[evals in CI and regression testing](evals-in-ci-and-regression-testing.md).

### 61. The nightly eval failed although nothing was merged. Where do you look?

**What to check first:** `gen_ai.response.model` in the nightly results
compared with the previous night.

**How to confirm:** run the old and new snapshots side by side on the
suite and compare case by case.

**Likely causes and fixes:** upstream model drift behind an alias. Pin a
snapshot, compare explicitly, and update the baseline only in a reviewed
pull request. See
[evals in CI and regression testing](evals-in-ci-and-regression-testing.md).

### 62. The monthly bill for the eval API key is higher than for the feature itself. What do you change?

**What to check first:** how often evals run, cache hit rates, and judge
calls per case.

**How to confirm:** break down tokens by job type and by grader in the
eval reports.

**Likely causes and fixes:** no path filters, no cache, and judges on
every criterion for every case. Add path filters and the response cache,
short-circuit judges on code failures, tier suites, and move broad runs
to the nightly job. See
[evals in CI and regression testing](evals-in-ci-and-regression-testing.md).

### 63. Token usage for the agent doubled overnight with flat traffic. How do you find the cause?

**What to check first:** model calls per request and output tokens per
call, by prompt version.

**How to confirm:** open traces with the most model calls and look at the
tool spans between them.

**Likely causes and fixes:** an agent loop retrying a failing tool, or a
prompt change that lengthened answers. Cap calls per request, fix the
tool, alert on calls per request and tokens per hour, and compare output
tokens across prompt versions. See
[LLM observability and tracing](llm-observability-and-tracing.md).

### 64. A privacy review finds customer email addresses in the tracing backend. What do you do?

**What to check first:** which spans and attributes contain them, and
whether content capture or an instrumentation library put them there.

**How to confirm:** search the backend for email patterns by service and
attribute; check the instrumentation's content-capture settings.

**Likely causes and fixes:** content captured in production without
redaction. Turn capture off, add the Collector redaction processor, purge
the data through your incident process, and set retention on the
backend. See [LLM observability and tracing](llm-observability-and-tracing.md).

### 65. After upgrading an instrumentation library, the token dashboard went blank. Why?

**What to check first:** the metric and attribute names the new version
emits.

**How to confirm:** list metric names in the backend before and after the
upgrade.

**Likely causes and fixes:** the GenAI conventions changed names (for
example `gen_ai.system` to `gen_ai.provider.name`, or the token histogram
to counters) and the library followed. Pin instrumentation versions, keep
names in one module, and update queries with the upgrade. See
[LLM observability and tracing](llm-observability-and-tracing.md).

### 66. Thumbs-down reports pile up, but nobody can reproduce them. What is missing?

**What to check first:** whether responses return trace IDs and whether
those traces were kept by sampling.

**How to confirm:** take a recent thumbs-down record and try to find its
trace, prompt version, and input.

**Likely causes and fixes:** no trace ID in responses, or traces sampled
away. Return the trace ID with every answer, store it with the feedback,
and keep traces with errors or negative feedback. Then triage weekly and
turn failures into evaluation cases. See
[LLM observability and tracing](llm-observability-and-tracing.md).

## Further learning

- [Evaluation and monitoring overview](../evaluation-and-monitoring.md)
- [Building evaluation sets](building-evaluation-sets.md) ·
  [LLM-as-judge and automated evals](llm-as-judge-and-automated-evals.md) ·
  [Evals in CI and regression testing](evals-in-ci-and-regression-testing.md) ·
  [LLM observability and tracing](llm-observability-and-tracing.md)
- [OpenAI: Evaluation best practices](https://developers.openai.com/api/docs/guides/evaluation-best-practices)
- [Anthropic: Define success criteria and build evaluations](https://platform.claude.com/docs/en/test-and-evaluate/develop-tests)
- [OpenTelemetry GenAI semantic conventions](https://github.com/open-telemetry/semantic-conventions-genai)
