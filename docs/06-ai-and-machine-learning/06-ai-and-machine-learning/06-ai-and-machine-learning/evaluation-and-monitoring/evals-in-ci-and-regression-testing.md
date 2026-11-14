# Evals in CI and Regression Testing

An evaluation set and a set of graders are only useful if they run every
time something that affects the model's behavior changes: the prompt
template, the model ID, the retrieval settings, a tool definition, or
the code that parses the output. Running them by hand means they run
before the big release and are skipped for the "small" change that
breaks production. Running them in CI makes them a gate, like unit
tests, with one important difference: the system under test is not
deterministic, so a failing number is evidence, not proof.

This lesson wires the TaskFlow Assistant's evaluation set into GitHub
Actions. It compares eval tools (promptfoo in depth, plus DeepEval,
Braintrust, the OpenAI Evals API, and Inspect), shows how to
turn the versioned dataset and the code-based checks from the previous
lessons into a promptfoo suite, designs gates and thresholds that catch
real regressions without blocking on noise, handles nondeterminism with
repeats and paired comparisons, and keeps the bill under control with
caching and tiered runs.

## Why it matters

LLM regressions are quiet. A prompt edit that fixes one complaint
changes behavior on hundreds of other inputs, and nothing crashes: the
API still returns 200, the JSON still parses, and the drafts are just a
little more often wrong. Model updates are worse, because they change
behavior without any change in your repository. The only reliable way to
notice is to rerun the same cases and compare.

At the same time, a naive gate does harm. If the gate is "pass rate must
not drop", it fails on random fluctuation, people learn to rerun it until
it is green, and the gate becomes noise. If the gate calls a paid model
for 2,000 cases on every push, the eval bill outgrows the feature's. The
techniques in this lesson are what make an LLM gate both trustworthy and
affordable.

## Real-world usage

- **promptfoo.** The open-source (MIT) eval runner used in this lesson
  documents its CI use in
  [CI/CD integration](https://www.promptfoo.dev/docs/integrations/ci-cd/),
  including caching the promptfoo cache directory keyed on the prompt
  files and configuration, and publishes a
  [GitHub Action](https://github.com/promptfoo/promptfoo-action) that
  evaluates a pull request and posts a summary comment. On March 9, 2026,
  OpenAI announced that it would
  [acquire Promptfoo](https://openai.com/index/openai-to-acquire-promptfoo/)
  and said it would keep developing the open-source project; check the
  project's repository for its current status before you depend on it.
- **Error bars for evals.** Evan Miller's
  [Adding Error Bars to Evals](https://arxiv.org/abs/2411.00640) (2024)
  argues that evaluations are experiments and recommends standard errors,
  clustered standard errors for related questions, variance reduction by
  resampling, analysis of question-level paired differences when
  comparing two models, and power analysis to size an eval.
- **pass^k.** The tau-bench paper,
  [tau-bench](https://arxiv.org/abs/2406.12045) (2024), proposed the
  pass^k metric for the reliability of agent behavior over multiple
  trials: a task counts only if it succeeds in all k attempts, which is
  closer to what users experience than a single lucky run.
- **OpenAI.** [Evaluation best practices](https://developers.openai.com/api/docs/guides/evaluation-best-practices)
  recommends eval-driven development ("evaluate early and often"), scoped
  tests at every stage, and structuring evaluations for automated scoring.
- **DeepEval.** The [DeepEval quickstart](https://deepeval.com/docs/getting-started)
  shows the Python side of the same idea: DeepEval plugs into Pytest, so
  `deepeval test run` collects eval files and runs them like tests, which
  is what makes it easy to drop into an existing CI job.

**Popular tools and providers:** promptfoo, DeepEval, Braintrust, the
OpenAI Evals API, Inspect, LangSmith and Langfuse experiments,
and GitHub Actions or any CI system that can run Node.js or Python.

## How it works

### Where evals run

Evals run at several points, each with a different budget:

| Where | What runs | Budget | Purpose |
|---|---|---|---|
| Every commit | Unit tests: prompt rendering, parsers, code checks, judge plumbing with stubs | Seconds, free | Catch broken code, not model behavior |
| Pull request touching AI code | The test split with code checks and a few judge criteria, cached | Minutes, low | Block clear regressions before merge |
| Nightly on `main` | The full suite, no cache, several repeats per case, all judge criteria | Tens of minutes, moderate | Detect drift from model updates; measure flakiness |
| Before a model or provider switch | Full suite on old and new, paired comparison, human review of differences | Hours, planned | Decide the switch with evidence |
| Production | Code checks on all traffic, a judge on a sample, user feedback | Continuous | Catch what offline sets miss (see [LLM observability and tracing](llm-observability-and-tracing.md)) |

![Diagram: two lanes. The pull-request lane: a pull request that changes src/ai or evals passes a path filter, runs unit tests including the judge plumbing with stubs, checks the dataset manifest, restores the response cache keyed on the model and the prompt and dataset hashes, runs the promptfoo suite on the test split, and compares the results with the committed baseline. The gate either blocks the merge, when a critical case regressed or the drop is significant, or passes, and the results are uploaded as an artifact. Pull requests from forks skip the eval job because they get no secrets. The nightly lane on main: a schedule runs the full suite with no cache and three repeats per case, compares with the baseline to detect drift from model updates and to list flaky cases, and uploads the report. A reviewed pull request updates the baseline when a change in scores is intended.](eval-ci-pipeline.svg)

Keep unit tests and evals separate. Unit tests must be deterministic
and never call a model; they belong in `npm test`. Evals call models,
cost money, and are noisy; they get their own job, their own gate, and
their own schedule.

### Eval tools

All of these run cases, apply graders, and report scores; they differ in
language, where results live, and how much they assume about your app:

| Tool | Language and style | Where results live | Good fit |
|---|---|---|---|
| promptfoo | YAML config with JavaScript, TypeScript, or Python extensions; CLI | Local files and a local web viewer; optional sharing | Any stack; prompt and model comparisons; red teaming |
| DeepEval | Python, Pytest-style test files | Local, optional hosted platform | Python services and RAG pipelines |
| Braintrust | TypeScript or Python SDK (`Eval()` with data, task, scores), autoevals library | Hosted platform | Teams that want hosted experiment tracking |
| OpenAI Evals API | Hosted evals: data source config plus testing criteria (graders) | OpenAI platform | Apps already on the OpenAI platform |
| Inspect | Python framework from the UK AI Security Institute and Meridian Labs; `inspect eval` | Local logs and viewer | Capability and agentic evaluations |
| evalite | TypeScript, built on Vitest, local UI; deprecated and archived on November 9, 2026, with Langfuse as the maintainer's suggested replacement | Local | Existing suites only; plan a migration |
| LangSmith, Langfuse | SDKs that run experiments over hosted datasets | Their platforms | Teams already tracing with them |

A good rule is to keep the dataset and the checks in your repository,
in your own formats, and treat the tool as a runner. The case schema and
`checkDraft` from the earlier lessons stay the same whichever runner you
choose; only the glue changes.

### promptfoo in a TaskFlow repository

promptfoo reads a configuration with prompts, providers, and tests, runs
every test against every provider, applies each test's assertions, and
writes results. For an application feature, the most faithful setup
does not let promptfoo call the model directly. It uses a **custom
provider** that calls the same code path production uses, here
`draftTaskAsText` from
[prompt design and templates](../prompting-and-structured-output/prompt-design-and-templates.md),
so the eval exercises the real template, the real parameters, and the
real parsing.

The pieces:

| File | Role |
|---|---|
| `promptfooconfig.yaml` | Wires the provider, the test generator, and options together |
| `taskflow-provider.ts` | Calls the app's code for each case, with a response cache |
| `load-cases.ts` | Turns the versioned JSONL dataset into promptfoo tests, with metadata for filtering |
| `assert-draft.ts` | Reuses the code-based checks as a promptfoo `javascript` assertion |
| `llm-rubric` assertions | Judge criteria where code cannot decide, graded by the model given with `--grader` |

Exit codes make it CI-friendly. `promptfoo eval` exits with code 100
when the pass rate is below `PROMPTFOO_PASS_RATE_THRESHOLD` (default
100%, so any failure fails the job); setting the threshold to `0` leaves
the decision to a separate gate script, while errors such as a failed
provider call still fail the run. Useful flags for CI are `-o` (JSON,
HTML, JUnit XML, and other formats; repeatable), `--repeat`,
`-j`/`--max-concurrency`, `--filter-metadata`, `--filter-sample`,
`--no-cache`, and `--no-share`.

### Gates and thresholds

A gate turns a run into a merge decision. Four kinds of rules work well
together:

| Rule | Example for the Assistant | Why |
|---|---|---|
| Critical cases always pass | `late-evening-tz`, `injection-in-request` | Known incidents and security cases must never regress, whatever the average does |
| Absolute floors | Schema validity 100%; overall pass rate at least 88% | Catches a collapse, even without a baseline |
| Paired regression against the baseline | Fail if the pass rate drops more than 2 points and the paired test says the drop is unlikely to be chance | Compares like with like, case by case |
| Operational budgets | Median output tokens and p95 latency within 20% of the baseline | Quality changes often come with cost or latency changes |

The baseline is a committed results file for the current `main`
(`evals/baseline/task-assistant.json`). Comparing against a baseline on
the same dataset version, case by case, is much more sensitive than
comparing two pass rates: a change that fixes 5 cases and breaks 7 has
almost the same average, but the list of 7 regressions is exactly what a
reviewer needs. When a change in scores is intended (a new model, a
corrected label), update the baseline in the same reviewed pull request
that causes it, never automatically.

![Diagram: the regression gate as a flowchart. Start with the candidate results and the baseline on the same dataset version. First decision: did any critical case regress? If yes, block the merge. Second decision: did code checks such as schema validity fall below their floors? If yes, block. Third decision: did the pass rate drop more than 2 points? If no, pass. If yes, fourth decision: is the drop significant in the paired McNemar test, with p below 0.05? If yes, block and list the regressions; if no, pass with a warning that asks a reviewer to read the regressed cases. Example from a run of 240 paired cases: 16 regressions against 3 fixes, a drop from 90.8 to 85.4 percent, McNemar p of 0.004, so the gate fails.](regression-gate.svg)

### Handling nondeterminism

The same prompt, model, and input can give different outputs. Sources
of variation include sampling, provider-side batching and hardware
effects, silent model updates behind an alias, and timing in tool-using
agents. You cannot remove all of it, so design the evals to measure
through it:

- **Pin what you can.** Read a specific model snapshot from
  configuration rather than a moving alias, and record it with each run.
  Most behavior changes "with no code change" turn out to be a model
  alias that moved.
- **Do not rely on sampling parameters.** Setting a low temperature
  reduces variation where it is supported, but it is not a guarantee of
  identical outputs, and support differs by provider and API version:
  OpenAI's Responses API accepts `temperature` but has no `seed`
  parameter, and Anthropic's API version `2026-10-21` removed
  `temperature`, `top_p`, and `top_k` entirely (requests that send them
  get a 400 error). Check the current API reference instead of copying
  old settings.
- **Repeat cases and choose an aggregation deliberately.** With `k`
  runs per case, *pass@k* (at least one success) measures what is
  possible, *pass^k* (all succeed) measures reliability, and the mean
  pass rate estimates a typical single run. For a user-facing feature,
  pass^k or the mean is the honest number; pass@k flatters.
- **Know the noise band.** The 95% margin of a pass rate on `n`
  cases is about `1.96 * sqrt(p * (1 - p) / n)`. With 240 cases at 90%,
  that is plus or minus 3.8 points, so a run that scores 88.3% instead of
  90.8% has not regressed by itself.
- **Compare pairs, not averages.** When two versions run on the same
  cases, only the cases where they disagree carry information. McNemar's
  test asks whether the regressions and fixes are too unbalanced to be
  chance; it is far more sensitive than comparing two independent pass
  rates, which is the point Miller's paper makes about paired analysis.
- **Track flaky cases.** A case that passes on some repeats and fails on
  others is either ambiguous (fix the label or the guide) or sitting on a
  real weakness. List flaky cases in every nightly report; do not
  silently drop them.

![Diagram: two panels about nondeterminism. Left panel, one case run five times with outcomes pass, pass, fail, pass, pass: the mean pass rate is 80 percent, pass at 5, at least one success, is a pass, and pass hat 5, all five succeed, is a fail. Right panel, the noise band: the same suite of 240 cases at about 90 percent has a 95 percent margin of plus or minus 3.8 points, so two runs scoring 90.8 and 88.3 percent with no code change sit inside the band; a paired comparison of the same cases asks instead whether regressions and fixes are balanced, such as 16 regressions against 3 fixes, McNemar p equals 0.004, which is not chance. Measure through the noise: repeat, aggregate deliberately, and compare pairs.](eval-noise-and-repeats.svg)

### Controlling cost

Eval cost is the number of cases, times repeats, times calls per case
(the feature plus each judge criterion), times tokens per call. Every
lever reduces one of those factors:

| Lever | How | Trade-off |
|---|---|---|
| Path filters | Run evals only when `src/ai/**`, `evals/**`, or dependencies change | Model alias changes are invisible to it, so keep the nightly run |
| Response cache on pull requests | Cache outputs keyed on prompt hash, model, and input; reruns are nearly free | Cached outputs hide nondeterminism, so the nightly run disables the cache |
| Code checks first | Skip judge calls for cases whose code checks already failed | None; it is pure saving |
| Tiered suites | Critical and smoke cases on pull requests, the full suite nightly (`--filter-metadata`) | Some regressions are found the next morning instead of before merge |
| Sampling | `--filter-sample` with a fixed seed on very large suites | Wider confidence intervals |
| Cheaper judges | A smaller judge model once it is calibrated for a criterion | Needs re-calibration; see the [judge lesson](llm-as-judge-and-automated-evals.md) |
| Batch APIs | Nightly runs through a provider's batch endpoint | Slower turnaround; see [prompt caching and batch processing](../hosted-model-apis/prompt-caching-and-batch-processing.md) |
| Concurrency limits | `--max-concurrency` keeps runs under rate limits | Longer runs |

The broader cost picture for LLM features is in
[cost optimization for LLM apps](../deployment-cost-and-performance/cost-optimization-for-llm-apps.md).

### Secrets and safety in CI

Eval jobs need provider API keys, which makes them a target. Store keys
as encrypted secrets, scope them to the eval job, and use a separate key
with its own spending limit for evals so a runaway job cannot exhaust
production quota. Pull requests from forks do not receive secrets in
GitHub Actions, so the workflow skips the eval job for them instead of
failing. Keep model IDs in repository variables, not secrets, so they
are visible in logs and reviews. The general practices are in
[secrets management](../../../../08-devops-and-deployment/08-devops-and-deployment/environment-variables/secrets-management.md)
and [GitHub Actions in depth](../../../../08-devops-and-deployment/08-devops-and-deployment/ci-cd/github-actions-in-depth.md).

## When to use and when not to use

| Situation | Approach |
|---|---|
| Prompt, model, retrieval, or tool definition changes | Pull-request evals with a paired gate against the baseline |
| Provider or model upgrade | Full suite with repeats on both, paired comparison, and a human read of the differences |
| Nothing changed in the repository | Nightly runs to detect upstream model drift |
| Purely deterministic code around the model | Unit tests only; evals add cost without information |
| Tiny prototype with a handful of cases | Run evals locally before merging; add CI once the set has dozens of cases |
| Very large suites (thousands of cases) | Sampled or tiered pull-request runs, full runs nightly or before releases |

Do not gate merges on a single unrepeated run of a judge-graded
criterion with a tight threshold; it will block on noise. Do not let
evals call production systems with side effects (sending email,
creating real tasks); stub the side effects in the provider or point it
at a test project.

## Practical examples

### The promptfoo configuration

```yaml
# evals/promptfoo/promptfooconfig.yaml: TaskFlow Assistant regression suite
description: TaskFlow Assistant on the task-assistant dataset
prompts:
  - "{{request}}"            # the provider renders the real, versioned template itself
providers:
  - file://taskflow-provider.ts
tests:
  - path: file://load-cases.ts
    config:
      split: test
evaluateOptions:
  maxConcurrency: 4
```

The prompt entry exists because promptfoo requires one; the provider
ignores it and renders the real template. File paths in the
configuration are resolved relative to the configuration file.

### The provider: running the real code path

```ts
// evals/promptfoo/taskflow-provider.ts: run the real Assistant code path for each test case
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ApiProvider, CallApiContextParams, ProviderResponse } from "promptfoo";
import type { EvalCase } from "../case-schema.js";
import { draftTaskAsText } from "../../src/ai/assistant-client.js";
import { PROMPT_HASH, PROMPT_ID, PROMPT_VERSION } from "../../src/ai/prompts/task-assistant.js";

const CACHE_DIR = process.env.EVAL_CACHE_DIR ?? ".eval-cache";

export default class TaskAssistantProvider implements ApiProvider {
  id() {
    return `taskflow:${PROMPT_ID}@${PROMPT_VERSION}#${PROMPT_HASH}`;
  }

  async callApi(_prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
    const c = context?.vars.evalCase as unknown as EvalCase;
    // Same prompt, model, and input give the same cache key; a prompt or model change misses.
    const key = createHash("sha256")
      .update(JSON.stringify([PROMPT_HASH, process.env.CHAT_MODEL, c.request, c.members, c.now, c.tz]))
      .digest("hex");
    const file = join(CACHE_DIR, `${key}.json`);
    if (process.env.EVAL_NO_CACHE !== "1" && existsSync(file)) {
      return { output: JSON.parse(readFileSync(file, "utf8")).output, cached: true };
    }
    const started = Date.now();
    try {
      const output = await draftTaskAsText(
        { projectName: "Eval project", currentUser: c.members[0] ?? "Eval user", members: c.members, now: new Date(c.now), timeZone: c.tz },
        c.request,
      );
      mkdirSync(CACHE_DIR, { recursive: true });
      writeFileSync(file, JSON.stringify({ output }));
      return { output, latencyMs: Date.now() - started };
    } catch (err) {
      return { error: `assistant call failed: ${(err as Error).message}` };
    }
  }
}
```

The provider id includes the prompt's id, version, and hash, so every
result records exactly which template produced it. The cache key
includes the prompt hash and `CHAT_MODEL`, so editing the template or
switching the model invalidates the cache automatically; `EVAL_NO_CACHE=1`
turns it off for nightly runs. promptfoo's own disk cache covers its
built-in providers; a custom provider is responsible for its own, which
is why this one implements a small file cache.

### Loading the versioned dataset as tests

```ts
// evals/promptfoo/load-cases.ts: turn the versioned JSONL dataset into promptfoo test cases
import { readFileSync } from "node:fs";
import { parseCases } from "../case-schema.js";

const DATASET = new URL("../datasets/task-assistant/cases.jsonl", import.meta.url);

export default async function loadCases(config?: { split?: "dev" | "test" }) {
  const split = config?.split ?? "test";
  const cases = parseCases(readFileSync(DATASET, "utf8"), "cases.jsonl")
    .filter((c) => c.status === "active" && c.split === split);

  return cases.map((c) => ({
    description: c.id,
    vars: { request: c.request, evalCase: c },   // array vars would expand into extra tests, so pass the case whole
    metadata: { critical: String(c.critical), ...c.slices },     // for --filter-metadata and reports
    assert: [
      { type: "javascript", value: "file://assert-draft.ts", metric: "contract" },
      ...(c.expect.clarifyingQuestion === "present"
        ? [{
            type: "llm-rubric",
            metric: "clarifying-question",
            value: "The clarifyingQuestion asks who should own the task, and the draft does not assign it to anyone.",
          }]
        : []),
    ],
  }));
}
```

Two details matter. The case is passed as one object, because promptfoo
expands array-valued variables into one test per element: passing
`members` as an array would have multiplied the tests. And the slices and
the `critical` flag go into `metadata`, which makes
`--filter-metadata critical=true` a ready-made smoke suite and lets
reports group results by slice. The `llm-rubric` assertion is added only
to cases where code cannot judge the quality of the clarifying question.

### Reusing the code-based checks as an assertion

```ts
// evals/promptfoo/assert-draft.ts: a promptfoo assertion that applies the code-based checks
import type { AssertionValueFunctionContext, GradingResult } from "promptfoo";
import type { EvalCase } from "../case-schema.js";
import { checkDraft } from "../draft-checks.js";

export default function assertDraft(output: string, context: AssertionValueFunctionContext): GradingResult {
  const evalCase = context.vars.evalCase as unknown as EvalCase;
  const { pass, checks } = checkDraft(output, evalCase);
  const failed = checks.filter((x) => !x.pass);
  return {
    pass,
    score: (checks.length - failed.length) / checks.length,
    reason: pass ? `${checks.length} checks passed` : failed.map((x) => `${x.name}: ${x.detail}`).join("; "),
  };
}
```

`checkDraft` is the function from the
[LLM-as-judge lesson](llm-as-judge-and-automated-evals.md); the
assertion only adapts its result to promptfoo's `GradingResult` shape.

### Running it

A dry run in a scratch copy of the repository, with the Assistant client
replaced by a stub that returns canned drafts (including a deliberate
time-zone bug) and `llm-rubric` graded by a stub grader, so no API key is
needed:

```text
$ npx promptfoo eval -c evals/promptfoo/promptfooconfig.yaml --grader file://stub-grader.ts \
    -o results.json --no-progress-bar --no-share --no-table
Running 5 test cases (up to 4 at a time)...
✓ Eval complete (ID: eval-K1N-2026-11-14T15:16:32)

Results:
  ✓ 4 passed (80.00%)
  ✗ 1 failed (20.00%)
  0 errors (0%)
$ echo $?
100
```

The failure in `results.json` is `late-evening-tz` with the reason
`dueDate: got 2026-11-15, expected 2026-11-14`, the time-zone bug the
critical case exists to catch. In the same dry run, rerunning used the
response cache for every case; `--filter-metadata critical=true` ran
only the two critical cases; `PROMPTFOO_PASS_RATE_THRESHOLD=75` turned
the 80% run into exit code 0; and on the dev split the `llm-rubric`
assertion produced a separate `clarifying-question` metric next to
`contract`. In CI, `--grader "openai:responses:$JUDGE_MODEL"` replaces
the stub with a real judge model chosen from the provider's current
model list.

### The regression gate

The gate compares the candidate run with the committed baseline, case by
case. With `--repeat`, a case passes only if all its repeats pass
(pass^k), and cases whose repeats disagree are listed as flaky:

```ts
// evals/compare-runs.ts: paired comparison of a candidate eval run against the baseline
// Usage: npx tsx evals/compare-runs.ts evals/baseline/task-assistant.json results.json
import { readFileSync } from "node:fs";

interface Row { testCase: { description: string; metadata?: Record<string, string> }; success: boolean }
interface CaseResult { passes: number; runs: number; critical: boolean }

const MAX_DROP = 0.02;          // tolerated drop in pass rate, in absolute terms
const ALPHA = 0.05;             // significance level for the paired test

function load(file: string): Map<string, CaseResult> {
  const rows: Row[] = JSON.parse(readFileSync(file, "utf8")).results.results;
  const byCase = new Map<string, CaseResult>();
  for (const r of rows) {        // with --repeat N, each case appears N times
    const id = r.testCase.description;
    const c = byCase.get(id) ?? { passes: 0, runs: 0, critical: r.testCase.metadata?.critical === "true" };
    c.runs++;
    if (r.success) c.passes++;
    byCase.set(id, c);
  }
  return byCase;
}

/** Two-sided exact McNemar test: are regressions and fixes too unbalanced to be chance? */
function mcnemarP(regressions: number, fixes: number): number {
  const n = regressions + fixes;
  if (n === 0) return 1;
  const k = Math.min(regressions, fixes);
  let logC = 0, tail = 0;                       // sum of C(n, i) / 2^n for i = 0..k
  for (let i = 0; i <= k; i++) {
    if (i > 0) logC += Math.log(n - i + 1) - Math.log(i);
    tail += Math.exp(logC - n * Math.LN2);
  }
  return Math.min(1, 2 * tail);
}

const [baseFile, candFile] = process.argv.slice(2);
const base = load(baseFile), cand = load(candFile);
const shared = [...cand.keys()].filter((id) => base.has(id));
const passed = (c: CaseResult) => c.passes === c.runs;   // strict: every repeat must pass (pass^k)

const regressions = shared.filter((id) => passed(base.get(id)!) && !passed(cand.get(id)!));
const fixes = shared.filter((id) => !passed(base.get(id)!) && passed(cand.get(id)!));
const flaky = shared.filter((id) => { const c = cand.get(id)!; return c.passes > 0 && c.passes < c.runs; });
const rate = (m: Map<string, CaseResult>) => shared.filter((id) => passed(m.get(id)!)).length / shared.length;
const drop = rate(base) - rate(cand);
const p = mcnemarP(regressions.length, fixes.length);
const criticalRegressions = regressions.filter((id) => cand.get(id)!.critical);

console.log(`paired cases: ${shared.length}; pass rate ${(100 * rate(base)).toFixed(1)}% -> ${(100 * rate(cand)).toFixed(1)}%`);
console.log(`regressions: ${regressions.length} ${regressions.join(" ")}`);
console.log(`fixes: ${fixes.length} ${fixes.join(" ")}`);
console.log(`flaky (repeats disagree): ${flaky.length} ${flaky.join(" ")}`);
console.log(`McNemar exact p = ${p.toFixed(3)}`);

const reasons = [
  ...(criticalRegressions.length ? [`critical cases regressed: ${criticalRegressions.join(", ")}`] : []),
  ...(drop > MAX_DROP && p < ALPHA ? [`pass rate dropped ${(100 * drop).toFixed(1)} points (p = ${p.toFixed(3)})`] : []),
];
if (reasons.length) {
  console.log(`GATE: FAIL - ${reasons.join("; ")}`);
  process.exit(1);
}
console.log(drop > MAX_DROP ? "GATE: PASS with warning - drop is not significant; review the regressions" : "GATE: PASS");
```

Three candidate runs of a 240-case suite with three repeats each,
compared with the same baseline (generated result files, run through
the real script):

```text
$ npx tsx evals/compare-runs.ts evals/baseline/task-assistant.json runs/candidate-ok.json
paired cases: 240; pass rate 90.8% -> 90.0%
regressions: 7 case-013 case-014 case-015 case-016 case-023 case-024 case-025
fixes: 5 case-031 case-034 case-038 case-040 case-059
flaky (repeats disagree): 3 case-023 case-024 case-025
McNemar exact p = 0.774
GATE: PASS

$ npx tsx evals/compare-runs.ts evals/baseline/task-assistant.json runs/candidate-bad.json
paired cases: 240; pass rate 90.8% -> 85.4%
regressions: 16 case-013 case-014 case-015 case-016 case-017 case-018 case-019 case-020 case-021 case-022 case-023 case-024 case-025 case-026 case-035 case-036
fixes: 3 case-031 case-034 case-038
flaky (repeats disagree): 2 case-035 case-036
McNemar exact p = 0.004
GATE: FAIL - pass rate dropped 5.4 points (p = 0.004)

$ npx tsx evals/compare-runs.ts evals/baseline/task-assistant.json runs/candidate-critical.json
paired cases: 240; pass rate 90.8% -> 91.3%
regressions: 1 case-004
fixes: 2 case-031 case-034
flaky (repeats disagree): 0 
McNemar exact p = 1.000
GATE: FAIL - critical cases regressed: case-004
```

The first run is noise: seven regressions against five fixes, three of
them flaky, and a p-value of 0.774. The second is a real regression: 16
against 3 is very unlikely to be chance (`p = 0.004`). The third improves
the average but breaks a critical case, which no average-based gate would
catch. Note the effect of the strict rule in the first run: the three
flaky cases count as regressions, which is why flaky cases need their own
list and follow-up.

### The GitHub Actions workflow

```yaml
# .github/workflows/llm-evals.yml: LLM regression evals for the TaskFlow Assistant
name: LLM evals

on:
  pull_request:
    paths:
      - "src/ai/**"
      - "evals/**"
      - "package-lock.json"
  schedule:
    - cron: "17 3 * * *"                 # nightly: full suite, fresh samples, repeats
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: llm-evals-${{ github.ref }}
  cancel-in-progress: true

env:
  CHAT_MODEL: ${{ vars.CHAT_MODEL }}      # model IDs live in repository variables, not in code
  JUDGE_MODEL: ${{ vars.JUDGE_MODEL }}
  PROMPTFOO_DISABLE_TELEMETRY: "1"
  PROMPTFOO_PASS_RATE_THRESHOLD: "0"      # compare-runs.ts decides pass or fail, not the raw rate

jobs:
  pr-evals:
    # Pull requests from forks get no secrets, so they cannot call the model.
    if: github.event_name == 'pull_request' && github.event.pull_request.head.repo.full_name == github.repository
    runs-on: ubuntu-latest
    timeout-minutes: 20
    env:
      OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
      EVAL_CACHE_DIR: .eval-cache
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm test                                     # unit tests, including the judge plumbing
      - run: npx tsx scripts/dataset-manifest.ts check    # no silent edits to the eval set
      - uses: actions/cache@v6
        with:
          path: .eval-cache
          key: llm-evals-${{ vars.CHAT_MODEL }}-${{ hashFiles('src/ai/prompts/**', 'evals/datasets/**') }}
          restore-keys: llm-evals-${{ vars.CHAT_MODEL }}-
      - name: Run the eval suite
        run: >-
          npx promptfoo eval -c evals/promptfoo/promptfooconfig.yaml
          --grader "openai:responses:$JUDGE_MODEL"
          -o results.json -o report.html --no-progress-bar --no-share
      - name: Gate on the paired comparison with the baseline
        run: npx tsx evals/compare-runs.ts evals/baseline/task-assistant.json results.json
      - uses: actions/upload-artifact@v7
        if: always()
        with:
          name: llm-evals-pr-${{ github.event.pull_request.number }}
          path: |
            results.json
            report.html
          retention-days: 14

  nightly-evals:
    if: github.event_name != 'pull_request'
    runs-on: ubuntu-latest
    timeout-minutes: 60
    env:
      OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
      EVAL_NO_CACHE: "1"                                  # fresh outputs every night
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npx tsx scripts/dataset-manifest.ts check
      - name: Run the eval suite three times per case
        run: >-
          npx promptfoo eval -c evals/promptfoo/promptfooconfig.yaml
          --repeat 3 --max-concurrency 4
          --grader "openai:responses:$JUDGE_MODEL"
          -o nightly.json -o nightly.html --no-progress-bar --no-share
      - name: Compare with the baseline
        run: npx tsx evals/compare-runs.ts evals/baseline/task-assistant.json nightly.json
      - uses: actions/upload-artifact@v7
        if: always()
        with:
          name: llm-evals-nightly-${{ github.run_id }}
          path: |
            nightly.json
            nightly.html
          retention-days: 30
```

What each part does:

- **Triggers.** Pull requests run evals only when AI code, eval files,
  or dependencies change. The nightly schedule catches upstream model
  changes that no pull request would trigger.
- **Model IDs from variables.** `vars.CHAT_MODEL` and
  `vars.JUDGE_MODEL` are repository variables; changing a model is a
  reviewed settings change, recorded in every run's environment, and the
  cache key includes the model so old outputs are not reused.
- **Fork safety.** The `if` condition skips the eval job for forks, which
  have no access to secrets, instead of failing it.
- **Cache.** The response cache is restored before the run and saved
  after it, keyed on the model and the hash of the prompts and the
  dataset, so an unchanged pull request reruns at almost no cost.
- **Gate.** `PROMPTFOO_PASS_RATE_THRESHOLD: "0"` stops promptfoo from
  failing the job on its own, while provider errors still fail it; the
  paired comparison in `compare-runs.ts` makes the decision.
- **Artifacts.** The JSON and HTML reports are uploaded even when the
  gate fails, so reviewers can read the regressed cases.

`actionlint` 1.7.12 reports no problems for this workflow. The action
versions follow the rest of these notes; for the general workflow
syntax see [GitHub Actions in depth](../../../../08-devops-and-deployment/08-devops-and-deployment/ci-cd/github-actions-in-depth.md).

## Best practices

- Run evals in their own job, separate from deterministic unit tests.
- Exercise the production code path through a custom provider instead
  of re-implementing the prompt in the eval tool.
- Keep the dataset, checks, and baseline in the repository; treat the
  eval tool as a replaceable runner.
- Gate on critical cases, absolute floors, and a paired comparison with
  the baseline, not on a raw pass rate.
- Pin model snapshots in configuration and record them with every run.
- Use repeats and report pass^k or the mean, plus a list of flaky
  cases.
- Cache responses on pull requests and disable the cache nightly.
- Update the baseline only in reviewed pull requests that explain the
  change.
- Give evals their own API key with a spending limit, and skip them for
  forks.
- Upload reports as artifacts so failures are readable without rerunning.

## In production

- **The eval job fails on random pull requests.**
  *Detect:* the same commit passes on rerun; failures cluster on judge
  criteria. *Cause:* a raw pass-rate threshold tighter than the noise
  band, often with a single run per case. *Fix:* gate on the paired
  comparison with a significance test, add repeats to the nightly run,
  and quarantine flaky cases for relabeling.
- **Scores dropped overnight with no merged changes.**
  *Detect:* the nightly comparison fails while `main` has not changed.
  *Cause:* the model alias moved to a new snapshot, or the provider
  changed behavior. *Fix:* pin a snapshot in `CHAT_MODEL`, compare the old
  and new snapshots explicitly, and update the baseline only after
  review.
- **The eval bill exceeds the feature's bill.**
  *Detect:* the eval API key's usage grows with every push. *Cause:* no
  path filter, no cache, judge calls for every criterion on every case.
  *Fix:* add path filters and the response cache, short-circuit judges on
  code failures, tier the suites, and move broad runs to the nightly
  job.
- **Pull requests from contributors fail the eval job.**
  *Detect:* fork pull requests fail with authentication errors from the
  provider. *Cause:* forks get no secrets. *Fix:* skip the job for forks
  with an `if` condition and run evals after a maintainer merges or
  re-runs the change from a branch.
- **A regression shipped although CI was green.**
  *Detect:* an incident on a kind of request the suite covers poorly.
  *Cause:* a coverage gap, or a baseline that was updated to accept the
  regression. *Fix:* add the incident as a critical case, require a
  written reason for baseline updates, and review slice reports, not
  only the overall gate.
- **Eval results are not reproducible.**
  *Detect:* nobody can tell which prompt or dataset produced a score
  from last month. *Cause:* results were not tied to versions. *Fix:*
  include the prompt hash in the provider id, check the dataset manifest
  before every run, and keep artifacts long enough to compare.

## Important terminology

- **Eval suite:** The dataset, graders, and configuration that produce
  scores for one feature.
- **Custom provider:** A promptfoo provider that calls your own code
  instead of a model API directly.
- **Baseline:** The committed results of the current version, used for
  comparison.
- **Regression gate:** The rules that turn eval results into a merge
  decision.
- **Critical case:** A case that must pass on every run.
- **Paired comparison:** Comparing two versions case by case on the same
  inputs.
- **McNemar's test:** A test of whether paired binary changes
  (regressions and fixes) are balanced.
- **pass@k:** At least one success in k attempts.
- **pass^k:** Success in all k attempts.
- **Flaky case:** A case whose repeats disagree.
- **Noise band:** The range of scores expected from random variation
  alone.
- **Tiered suite:** Smaller suites on pull requests and the full suite
  on a schedule.

## Common mistakes and misconceptions

- Putting model-calling evals in `npm test`, so unit tests become slow,
  flaky, and expensive.
- Re-implementing the prompt in the eval tool, so the eval tests a copy
  of the feature.
- Gating on "pass rate must not drop" with a single run.
- Believing a low temperature makes outputs reproducible.
- Comparing two independent pass rates when the same cases were run on
  both versions.
- Updating the baseline automatically after every merge.
- Running the full judge suite on every push.
- Letting evals create real tasks or send real emails.

## Revision questions

1. Why should model-calling evals run in a separate CI job from unit
   tests, and what belongs in each?
2. What does a custom promptfoo provider give you that a built-in
   provider does not? Why does it need its own cache?
3. Describe four kinds of gate rules and what each one catches.
4. A suite has 400 cases at a 90% pass rate. What is the approximate 95%
   noise band, and would a run at 88.5% concern you on its own?
   (`1.96 * sqrt(0.09 / 400)`, about 2.9 points; 88.5% is inside it.)
5. A candidate has 9 regressions and 2 fixes against the baseline. Why
   is this stronger evidence than the change in pass rate alone, and
   which test would you use? (Paired: McNemar's exact test, p is about
   0.065, so borderline; look at the cases.)
6. Explain pass@k and pass^k. Which would you report for the TaskFlow
   Assistant, and why?
7. List five ways to reduce eval cost and the trade-off of each.
8. Scores dropped in last night's run and nothing was merged. What do you
   check first?

## Further learning

- [promptfoo: CI/CD integration](https://www.promptfoo.dev/docs/integrations/ci-cd/)
- [promptfoo: Test cases](https://www.promptfoo.dev/docs/configuration/test-cases/)
  and [custom providers](https://www.promptfoo.dev/docs/providers/custom-api/)
- [Evan Miller: Adding Error Bars to Evals](https://arxiv.org/abs/2411.00640)
- [DeepEval: Getting started](https://deepeval.com/docs/getting-started)
- [Braintrust: Evaluation quickstart](https://docs.braintrust.dev/evaluation-quickstart)
- [Inspect](https://inspect.aisi.org.uk/)
- [actionlint](https://github.com/rhysd/actionlint)
- Next: [LLM observability and tracing](llm-observability-and-tracing.md). Back to the [evaluation and monitoring overview](../evaluation-and-monitoring.md).
