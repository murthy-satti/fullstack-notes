# MLOps and Model Lifecycle Interview Questions and Answers

These questions review experiment tracking and model registries, prompt
and model versioning for LLM features, and production monitoring and
drift. Try answering each one before reading the answer.

## Experiment tracking and model registry

### 1. What problem does experiment tracking solve?

It records every training run with its code version, data, parameters,
environment, metrics, and artifacts, so runs can be compared, explained,
and rebuilt. Without it, model history lives in notebooks and file
names, and nobody can say which data or code produced a model that is
misbehaving in production.

### 2. What must a run record to be reproducible?

The Git commit (and whether the tree was dirty), an immutable data
snapshot with a content digest, every hyperparameter and feature list,
the library and runtime versions, and the random seeds. Metrics make a
run comparable; these inputs make it reproducible.

### 3. What is the difference between a parameter, a metric, and a tag in MLflow?

A parameter is an input fixed for the run, such as `learning_rate`. A
metric is a measured result, optionally logged at many steps, such as
`test_roc_auc`. A tag is mutable descriptive metadata, such as
`git_dirty=True` or `owner=ml-team`. Keeping them separate makes runs
queryable.

### 4. What is a model registry, and how is it different from the tracking UI?

A registry holds named models with immutable, numbered versions and
records which version is approved for which purpose. The tracking UI
shows experiments; a good run there is not a release. The registry is
where promotion decisions, approvals, and rollbacks happen and are
audited.

### 5. What are MLflow model aliases, and why did they replace stages?

An alias is a movable, named pointer to one model version, such as
`@champion` or `@challenger`, loaded with
`models:/taskflow-priority@champion`. Stages (`Staging`, `Production`,
`Archived`) were a fixed list with one meaning per version; they were
deprecated in MLflow 2.9 and still warn in MLflow 3. Aliases and tags
express any workflow, including several production models.

### 6. Why should a deployment use a concrete version rather than the alias?

A server resolves an alias when it loads the model, so replicas that
start at different times can serve different versions, and logs cannot
say which version answered. The deploy step should resolve the alias
once, deploy `models:/name/<version>`, and record that version with
every prediction.

### 7. How does a rollback work with aliases?

Before promotion, record the old champion (for example in a `@previous`
alias). Rolling back moves `@champion` back to that version and
redeploys or reloads, with no retraining or rebuild. The version that
failed is tagged `rolled_back` so the history stays intact.

### 8. What belongs in a promotion gate?

Score the challenger and the champion on the same, newer holdout data
that neither trained on; compare overall and per slice; check the
signature, latency, and size; record the decision as tags; and move
aliases only if all checks pass. Online validation (shadow or canary)
follows before full traffic.

### 9. Why compare models on a later holdout instead of a random split?

A random split of the training period shares that period's patterns, so
it flatters models that memorize them. A later period resembles what
the model will see in production and exposes models that do not
generalize over time.

### 10. Why check slices and not only the overall metric?

An overall gain can hide a regression for one segment, such as one
project type, language, or customer size. In the lesson's example a
challenger lost 0.0211 AUC on marketing tasks; a gate with a 0.02 slice
budget rejected it.

### 11. What is a model signature, and why log one?

It is the declared input and output schema of a model. MLflow infers it
from a sample and the scoring server enforces it, returning HTTP 400
(`INVALID_PARAMETER_VALUE`) for requests that do not match. It turns
interface mismatches into clear errors instead of wrong predictions.

### 12. Why should preprocessing live inside the model artifact?

If encoding or feature transformations happen outside the artifact,
the serving code must reimplement them, which invites training-serving
skew. A pipeline (encoder plus model) logged as one artifact accepts
the raw values the API sends.

### 13. Name common causes of runs that cannot be reproduced.

Training from mutable tables, unseeded randomness (scikit-learn's
`HistGradientBoostingClassifier` enables early stopping with a random
validation split above 10,000 samples), unpinned library versions,
nondeterministic GPU kernels, and features computed differently in
training and serving.

### 14. Why does MLflow 3 save scikit-learn models with skops instead of pickle?

Loading a pickle can execute arbitrary code, so a tampered model file is
a code-execution risk. Skops refuses types it does not trust; when it
reports one, review that specific type and pass it in
`skops_trusted_types` rather than falling back to pickle.

### 15. How do Weights & Biases and MLflow compare?

Both track runs and version models. W&B is hosted (or self-managed),
with strong dashboards, sweeps, and artifact lineage; models are
artifacts linked into W&B Registry collections. MLflow is open source,
self-hosted or managed by several platforms, with registered models,
versions, and aliases. The concepts map one to one.

### 16. What should you check before adopting a hosted tracking service?

That metadata and models can be exported in bulk, that production does
not depend on the tracking UI to load models, and what happens if the
vendor changes. Neptune.ai's hosted service shut down in March 2026 and
deleted remaining data after a transition period.

## LLMOps: prompt and model versioning

### 17. What does "the model" mean for a feature built on a hosted LLM?

A combination of the prompt version, the provider's model ID, request
parameters, the output schema, tools, and any retrieval index. Changing
any one changes behavior, so all of them together are versioned as one
release.

### 18. Why keep production prompts in the repository?

They are reviewed in pull requests, typed, tested and evaluated in CI,
and released with the code that parses their output. OpenAI's own
guidance (2026) is to store production prompts in application code,
and its reusable prompt objects are being retired.

### 19. What rules make prompt versions safe?

A version is immutable: any text change is a new version. Old versions
stay in the build while a release refers to them, so rollback is a
configuration change. Inputs are typed parameters, and user text stays
separate from instructions.

### 20. How can CI detect a prompt edited in place?

Keep a lock file of hashes of each prompt version rendered with a fixed
sample input. CI recomputes the hashes: a new version adds a line the
developer commits; a changed hash for an existing version fails the
build.

### 21. What is a release fingerprint?

A hash of a release's effective parts: the prompt text, the resolved
model ID, and parameters. Logged with every request, it reveals changes
that bypassed the release process, such as a model variable changed in
one environment.

### 22. How should code choose a model ID?

It should not: each feature reads its model ID from configuration. To
choose a value, read the provider's models page and `models.list()`,
shortlist by capability, relative cost, and latency, run your
evaluation set, and configure a pinned version.

### 23. What is the difference between a pinned version and a moving alias?

A pinned version keeps fixed behavior until its retirement date. A
moving alias is repointed by the provider to newer models (Google
repoints its "latest" aliases with two weeks' notice). Aliases suit
prototypes; production should pin.

### 24. What should every LLM request log?

The release ID, prompt version, model requested and model reported by
the provider, fingerprint, latency, token counts, and the outcome of
output validation. These fields let you break down quality and cost by
release and answer "what changed?" during an incident.

### 25. Describe a release process for a prompt or model change.

A pull request adds a new release; CI runs type checks, the prompt
lock, and offline evaluations for the current and new release;
reviewers read the prompt and evaluation diffs; staging; optional
shadow traffic; a sticky canary or A/B test behind a flag; full
rollout; then retirement of the old release when nothing refers to it.

### 26. Why assign A/B variants per user rather than per request?

Per-request assignment shows one user two behaviors, which makes the
product inconsistent and contaminates both groups' outcomes. Hashing
`"<experiment>:<user id>"` gives a sticky bucket without storing
assignments, and changing the experiment key reshuffles users.

### 27. What metrics would you use for an A/B test of the task parser?

A primary metric tied to user value, such as the share of drafts saved
without edits, plus guardrails: p95 latency, error and schema-failure
rates, refusal rate, and cost per request. A win on the primary metric
does not ship if a guardrail regresses.

### 28. How many users per variant are needed to detect a lift from 62% to 64%?

With 5% two-sided significance and 80% power,
`n = (1.96 + 0.84)² × (0.62 × 0.38 + 0.64 × 0.36) / 0.02²`, about 9,144
users per variant. Smaller tests can only detect larger effects.

### 29. Why should you not stop an A/B test as soon as p < 0.05?

Checking repeatedly and stopping at the first significant result
inflates false positives. Fix the sample size and duration in advance
(full weeks), or use a sequential method designed for repeated looks.
LLM output varies between calls, which adds noise.

### 30. What is shadow testing, and what are its costs?

A sample of requests also runs the candidate in the background; its
output is logged and compared but never shown. It doubles model calls
for the sample, uses rate limit, and may send user data to a second
model or provider, so keep it small, time-boxed, read-only, and allowed
by your data policy.

### 31. List the ways to roll back an LLM feature.

Flip the rollout flag back to the previous release (seconds), use the
kill switch to fall back to a non-AI path (seconds), revert the model
configuration (minutes), or redeploy the previous build. Flags only
work if the old release and prompt are still in the build.

### 32. Why can a rollback fail for an LLM feature specifically?

The previous release's model may have been retired by the provider, or
the old prompt was deleted from the code. Also, outputs produced by the
bad release persist in the database and may need cleanup.

### 33. How much notice do providers give before retiring models?

As of November 2026: OpenAI states at least 6 months for generally
available models, 3 months for specialized variants and image models,
and about 2 weeks for previews; Anthropic at least 60 days for publicly
released models; Google at least 2 weeks for Gemini previews; Microsoft
Foundry a standard 18-month GA lifecycle with notices at least 60 days
ahead. Plan for the shortest notice you depend on.

### 34. Outline a migration off a deprecated model.

Inventory every use; shortlist candidates (including but not limited
to the recommended replacement); evaluate offline on your data with cost
and latency; adapt prompts and parameters as new releases; shadow, then
canary; switch; keep the old release as a rollback until shortly before
shutdown; remove its configuration.

### 35. Why is a recommended replacement model not a drop-in swap?

It may follow prompts differently, reject parameters the old model
accepted (Anthropic removed `temperature`, `top_p`, and `top_k` in API
version 2026-10-21), count tokens differently, or format structured
output differently. Each difference needs evaluation and often a new
prompt version.

### 36. How can you detect upcoming retirements automatically?

A daily job asks the provider about every configured model: OpenAI's
models endpoint returns `shutdown_date`, Anthropic's returns
`lifecycle` and `retires_at`, and Microsoft Foundry's Models API returns
`lifecycleStatus` and deprecation dates. The job fails CI or alerts
when a model is within your migration window.

### 37. Prompt registry service or prompts in code: how do you choose?

Code fits most teams: reviewed, tested, and released with the parsing
code. A registry (Langfuse, MLflow Prompt Registry, LangSmith) fits many
non-developer prompt authors, but needs the same review and evaluation
gates, or production behavior changes without them. A common hybrid
exports approved registry versions into the build.

### 38. How do platform auto-upgrades affect versioning?

Some platforms upgrade deployments to a new model version on a schedule
unless you opt out (Microsoft Foundry's `versionUpgradeOption`). That is
a model change you did not deploy: evaluate the new version before the
scheduled date and log the model the provider reports.

## Production monitoring and drift

### 39. Why do ML models need monitoring beyond service metrics?

A drifted model keeps returning confident predictions with HTTP 200, so
error and latency dashboards stay green while quality decays. Google's
Rules of ML calls this out as "Watch for silent failures". You must
monitor data, predictions, and performance as well.

### 40. Explain data drift, label shift, and concept drift.

Data drift: the input distribution P(X) changes. Label shift: the
outcome distribution P(Y) changes. Concept drift: the relationship
P(Y | X) changes, so the same input now has a different correct answer.
Input monitoring can detect the first two; only labels reveal concept
drift.

### 41. What is training-serving skew, and how is it different from drift?

Skew is a difference between features in training and serving caused
by different code or data paths, such as characters versus words. It is
a bug present from day one, often visible as many features "drifting"
at once after a deploy. Fix it by logging served features and reusing
feature code.

### 42. What does a prediction log contain, and why?

Request ID, timestamp, model version, the features as the model saw
them, and the score. It is the source for drift statistics, skew checks,
per-version analysis, and joining labels that arrive later.

### 43. How is PSI computed?

Cut bins at the reference quantiles, compute each bin's share in the
reference and current samples, and sum
`(current − reference) × ln(current / reference)`, with a small floor
for empty bins. Every bin adds a positive amount, whether it gained or
lost data.

### 44. What are the usual PSI thresholds, and how far should you trust them?

Below 0.10 little shift, 0.10 to 0.25 investigate, above 0.25
significant. They come from credit-scoring practice and are used
without reference to error rates, and PSI is biased upward on small
samples, so tune thresholds per feature after a baseline period.

### 45. Compute PSI for reference shares 0.5/0.5 and current 0.7/0.3.

`0.2 × ln(1.4) + (−0.2) × ln(0.6) = 0.067 + 0.102 ≈ 0.17`, in the
0.10 to 0.25 "investigate" band.

### 46. What does the two-sample KS test measure?

Its statistic D is the largest vertical gap between the two empirical
cumulative distribution functions; its p-value is the probability of a
gap that large if both samples came from the same distribution. It
works for continuous numeric features.

### 47. Why are p-values poor alert signals on large samples?

The p-value answers "is there any difference?", and with enough data
the answer is always yes. In the lesson, a 0.03 standard-deviation
shift had p = 0.087 at 1,000 rows and p = 7e-14 at 200,000 rows, while
PSI stayed near 0.001. Alert on effect sizes instead.

### 48. How many false alarms do you expect from daily tests on 7 features at 5%?

About `7 × 365 × 0.05 ≈ 128` a year from a stable system. Reduce them
with effect-size thresholds, persistence rules (for example two days
above 0.25), and weekly reports instead of pages.

### 49. Why check missing values separately from drift?

PSI and KS run on present values, so a field that goes missing can look
stable. In the lesson, `days_until_due` had PSI 0.007 while its null
share rose by 0.28. Monitor null shares, schemas, and vocabularies as
data-quality checks.

### 50. How do you monitor performance when labels arrive days later?

Join labels to the prediction log by request ID, report by prediction
week, show label coverage with each metric, add confidence intervals
(such as Wilson intervals), and slice by key segments. Do not judge a
week until enough of its labels have arrived.

### 51. What can you monitor before labels arrive?

Proxies: input drift, the score distribution, the share of predictions
above the threshold, and estimated performance such as NannyML's CBPE
from calibrated scores. CBPE does not work under concept drift, so
proxies only buy time until labels confirm.

### 52. What is a feedback loop in ML, and how do you break it?

The model's outputs influence its future training data: users keep
suggested priorities, so labels copy the model and errors confirm
themselves. Keep a small holdout without suggestions, prefer
outcome-based labels, log exposure, and evaluate on holdout data.

### 53. What retraining triggers exist, and which would you use?

On demand, on a schedule, on new training data, on performance
degradation, and on significant distribution change, as Google Cloud's
MLOps guide lists. Combine a schedule with performance and data-volume
triggers, and treat drift alone as a reason to investigate.

### 54. Why should a retraining trigger never promote a model?

Retraining can produce a worse model, especially on biased or old
labels. The trigger only starts the pipeline; the new version passes
the same holdout and slice gate and canary as any release.

## Scenario-based questions

### 55. Right after a deploy of the TaskFlow API, every feature of the priority model shows PSI above 0.5. What do you check?

**What to check first:** whether the API or a feature pipeline changed
in that deploy.

**How to confirm:** compare the served feature values in the prediction
log with values the training pipeline computes for the same tasks.

**Likely causes and fixes:** training-serving skew from a code change
(units, encoding, a renamed field), not real drift. Roll back or fix the
code path, add a skew check to CI, and reuse feature code between
training and serving. See
[production monitoring and drift](production-monitoring-and-drift.md).

### 56. Suggestion acceptance fell 6 points over two weeks, with no deploys and no input drift. What is going on?

**What to check first:** weekly precision and AUC by slice from labeled
predictions, and any process or product change in that period.

**How to confirm:** performance dropped for one segment while input PSI
stayed near zero; the business owner confirms a change in how that
segment is handled.

**Likely causes and fixes:** concept drift. Gather labels from after the
change, retrain on recent data, evaluate on recent weeks, and consider
disabling suggestions for the affected segment meanwhile. See
[production monitoring and drift](production-monitoring-and-drift.md).

### 57. Drift alerts fire every day and the team has started ignoring them. How do you fix the alerting?

**What to check first:** what the alerts are based on, the sample sizes,
and how many features are tested.

**How to confirm:** most alerts are p-values below 0.05 on large daily
samples, with tiny PSI values and no performance impact.

**Likely causes and fixes:** p-value alerts on large samples and
multiple testing. Alert on effect sizes with persistence rules, page
only for sustained large shifts, and move the rest to a weekly report.
See [production monitoring and drift](production-monitoring-and-drift.md).

### 58. During an incident, nobody can tell which model version produced a bad suggestion. What do you change?

**What to check first:** whether the prediction log records a model
version and how serving loads the model.

**How to confirm:** servers load `models:/taskflow-priority@champion`
at startup and log only the model name.

**Likely causes and fixes:** unresolved aliases. Resolve the alias in
the deploy step, deploy a concrete version, and log it with every
prediction. See
[experiment tracking and model registry](experiment-tracking-and-model-registry.md).

### 59. The same task gets different priority scores depending on which pod answers. Why?

**What to check first:** the model version loaded by each pod and when
each pod started.

**How to confirm:** pods started after the latest promotion report the
new version; older pods report the previous one.

**Likely causes and fixes:** an alias resolved at pod startup. Treat a
promotion as a deployment: resolve once and roll out like any release.
See
[experiment tracking and model registry](experiment-tracking-and-model-registry.md).

### 60. A new model version beats the champion offline but suggestion acceptance drops after release. What went wrong?

**What to check first:** what data and metric the offline comparison
used.

**How to confirm:** the gate used a random split of the training month
and overall AUC only, with no slices or online validation.

**Likely causes and fixes:** an unrepresentative comparison. Gate on a
later holdout with slice checks, add the business metric, and run a
canary before full traffic. See
[experiment tracking and model registry](experiment-tracking-and-model-registry.md).

### 61. An auditor asks you to rebuild the model that was in production in August, and the retrained model scores differently. What is missing?

**What to check first:** the run's recorded commit, data source, seeds,
and environment.

**How to confirm:** the run read a live table rather than a snapshot,
or did not log `random_state`, or the environment was not pinned.

**Likely causes and fixes:** incomplete run records. Train only from
dated snapshots with digests, log seeds and environments, and run a
scheduled reproducibility check. See
[experiment tracking and model registry](experiment-tracking-and-model-registry.md).

### 62. Task-parser quality dropped overnight with no code release. What do you check?

**What to check first:** the model reported in response logs and the
release fingerprints before and after.

**How to confirm:** the configured model is a moving alias that the
provider repointed, or a platform auto-upgrade ran, or a model variable
changed in one environment.

**Likely causes and fixes:** an unversioned model change. Pin versions,
manage model variables through reviewed configuration, alert on
fingerprint changes within a release, and evaluate auto-upgrades before
their date. See
[LLMOps: prompt and model versioning](llmops-prompt-and-model-versioning.md).

### 63. Requests to the meeting-summary feature started failing with "model not found" at midnight. What happened, and how do you prevent it next time?

**What to check first:** the provider's deprecation page and the
configured model's shutdown date.

**How to confirm:** the configured model's retirement date was
yesterday; errors began at that time.

**Likely causes and fixes:** a missed retirement. Switch the flag to a
release on a supported model or use the kill switch, then add a daily
lifecycle check that fails CI weeks before any shutdown. See
[LLMOps: prompt and model versioning](llmops-prompt-and-model-versioning.md).

### 64. After migrating to the provider's recommended replacement model, 3% of requests return HTTP 400. What do you check?

**What to check first:** the error messages and which parameters those
requests send.

**How to confirm:** the errors name a parameter, such as a sampling
parameter that the new model or API version rejects.

**Likely causes and fixes:** a parameter incompatibility. Remove or
replace the parameter in a new release, and run every migration through
a canary so such errors reach a small share of users first. See
[LLMOps: prompt and model versioning](llmops-prompt-and-model-versioning.md).

### 65. A prompt A/B test showed a significant win, but after full rollout the metric is back where it was. Why?

**What to check first:** how users were assigned, how long the test ran,
and when it was stopped.

**How to confirm:** assignment was per request, or the test ran only a
few days and stopped at the first significant result.

**Likely causes and fixes:** a flawed experiment. Assign per user, fix
the sample size and duration in advance (full weeks), and keep a small
holdback after rollout to confirm. See
[LLMOps: prompt and model versioning](llmops-prompt-and-model-versioning.md).

### 66. You tried to roll the task parser back to last month's release and it failed. Why might that be?

**What to check first:** whether the old prompt version is still in the
build and whether the old release's model is still served.

**How to confirm:** the old prompt was deleted when the new one shipped,
or the provider retired the old model.

**Likely causes and fixes:** a rollback target that no longer exists.
Keep old prompt versions while any release refers to them, check that
rollback targets use supported models, and rehearse rollbacks. See
[LLMOps: prompt and model versioning](llmops-prompt-and-model-versioning.md).

### 67. Each retrained priority model wins offline, yet users override suggestions more and more. What is happening?

**What to check first:** where training and evaluation labels come
from.

**How to confirm:** most labels are "kept the suggested priority", and
there is no group of tasks without suggestions to compare with.

**Likely causes and fixes:** a feedback loop. Create a small holdout
without suggestions, train and evaluate on holdout and outcome-based
labels, and log whether a suggestion was shown. See
[production monitoring and drift](production-monitoring-and-drift.md).

### 68. A required feature has been empty for a third of requests for weeks, and no alert fired. How did that happen?

**What to check first:** the null share of each feature in the
prediction log over time.

**How to confirm:** the null share rose when a client release stopped
sending the field, while that feature's PSI stayed low.

**Likely causes and fixes:** drift statistics ignore missing values and
no data-quality check existed. Alert on null shares of required features
and validate the schema at the API boundary. See
[production monitoring and drift](production-monitoring-and-drift.md).

## Further learning

- [MLflow: model registry](https://mlflow.org/docs/latest/ml/model-registry/)
- [Google: Rules of Machine Learning](https://developers.google.com/machine-learning/guides/rules-of-ml)
- [Google Cloud: MLOps continuous delivery and automation pipelines](https://docs.cloud.google.com/architecture/mlops-continuous-delivery-and-automation-pipelines-in-machine-learning)
- [OpenAI: deprecations](https://developers.openai.com/api/docs/deprecations)
- [Anthropic: model deprecations](https://platform.claude.com/docs/en/about-claude/model-deprecations)
- [Evidently: data drift methods](https://docs.evidentlyai.com/metrics/explainer_drift)
- Back to the [MLOps and model lifecycle overview](../mlops-and-model-lifecycle.md).
