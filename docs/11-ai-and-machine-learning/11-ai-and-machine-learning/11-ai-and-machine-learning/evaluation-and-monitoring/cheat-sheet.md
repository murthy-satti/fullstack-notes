# Evaluation and Monitoring Cheat Sheet

Quick revision of the evaluation and monitoring lessons: use it before an
interview or before wiring evals and tracing into a TaskFlow feature.

## Key commands

| Command | What it does |
|---|---|
| `npx promptfoo eval -c evals/promptfoo/promptfooconfig.yaml` | Run every test against every provider, apply assertions |
| `--grader "openai:responses:$JUDGE_MODEL"` | Model that grades `llm-rubric` assertions |
| `-o results.json -o report.html` | Write results; repeatable (JSON, HTML, JUnit XML, ...) |
| `--repeat 3` | Run each test several times (nightly, flakiness) |
| `--filter-metadata critical=true` | Run only tests whose metadata matches (smoke suite) |
| `--filter-sample N` | Random sample of N tests on very large suites |
| `-j 4` / `--max-concurrency 4` | Stay under provider rate limits |
| `--no-cache`, `--no-share` | Fresh outputs; no shareable URL |
| `npx tsx scripts/dataset-manifest.ts check` | Fail CI if the eval set changed without a new version |
| `npx tsx evals/compare-runs.ts base.json results.json` | Paired gate: critical cases, drop, McNemar p |
| `otelcol-contrib validate --config=otel-collector.yaml` | Check a Collector file before deploying it |

## Key configuration

```yaml
# .github/workflows/llm-evals.yml (excerpt): let the paired gate decide, not the raw pass rate
env:
  CHAT_MODEL: ${{ vars.CHAT_MODEL }}      # model IDs in repository variables
  JUDGE_MODEL: ${{ vars.JUDGE_MODEL }}
  PROMPTFOO_PASS_RATE_THRESHOLD: "0"      # default 100: any failure exits with code 100
```

```yaml
# otel-collector.yaml (excerpt): mask content attributes and personal data in every service's spans
processors:
  redaction:
    allow_all_keys: true
    blocked_key_patterns: ['^gen_ai\.(input|output)\.messages$', '^gen_ai\.system_instructions$']
    blocked_values: ['[\w.+-]+@[\w-]+\.[\w.-]+', '\b(?:\d[ -]?){13,19}\b']
    summary: info
```

| GenAI attribute | Holds |
|---|---|
| `gen_ai.operation.name`, `gen_ai.provider.name` | Required on a model-call span (`chat <model>`, `CLIENT`) |
| `gen_ai.request.model` / `gen_ai.response.model` | Configured alias / dated snapshot that actually ran |
| `gen_ai.usage.input_tokens`, `.output_tokens`, `.cache_read.input_tokens` | Token usage |
| `gen_ai.prompt.name`, `gen_ai.prompt.version` | Which prompt produced the answer |
| `gen_ai.input.messages`, `gen_ai.output.messages` | Content: opt-in, off by default |

## Decision guide

| If you need | Choose | Why |
|---|---|---|
| Grade structured output | Code checks (schema, equality, properties) | Instant, free, deterministic |
| Grade faithfulness or completeness | Pointwise pass/fail judge per criterion, calibrated | Absolute numbers for gates and dashboards |
| Pick between two prompts | Pairwise judge in both orders | Cancels position bias; flip rate measures it |
| Gate a pull request | Critical cases + floors + paired McNemar test | Catches real regressions without blocking on noise |
| Catch model drift with no code change | Nightly full run, no cache, repeats | An alias can move without a pull request |
| Report reliability of a user-facing feature | pass^k or the mean pass rate | pass@k flatters |
| Trace LLM calls across vendors | Manual spans + OpenTelemetry Collector fan-out | One place for redaction, sampling, and backends |
| Debug with full prompts | Content capture in staging, redacted, short retention | Production keeps content out of telemetry |

## Numbers and defaults to remember

| Item | Value |
|---|---|
| Margin of error of a pass rate | `1.96 * sqrt(p * (1 - p) / n)`: +/- 8.3 points at n = 50, 5.9 at 100, 3.8 at 240, 2.9 at 400 (p = 0.9) |
| Rule of three | All n cases pass: true failure rate may still be about `3 / n` |
| Cohen's kappa | `(p_obs - p_exp) / (1 - p_exp)`; 0.61 to 0.80 is "substantial" |
| Rogan-Gladen correction | `p_true = (p_obs + TNR - 1) / (TPR + TNR - 1)` |
| McNemar (exact) | 16 regressions vs 3 fixes: p = 0.004; 7 vs 5: p = 0.77 |
| Starting set sizes | 20 to 50 cases (prototype), 100 to 300 (launch), 100 to 200 calibration labels |
| promptfoo exit code | 100 when the pass rate is below `PROMPTFOO_PASS_RATE_THRESHOLD` (default 100%) |
| GenAI conventions | Development status; moved to `semantic-conventions-genai` in semconv v1.42.0 (June 2026) |
| Attribute rename | `gen_ai.system` became `gen_ai.provider.name` in semconv v1.37 |
| Prometheus names | `gen_ai.client.token.usage` becomes `gen_ai_client_token_usage`; counters add `_total` |
| Sampling parameters | OpenAI Responses: `temperature`, no `seed`; Anthropic API `2026-10-21`: no `temperature`, `top_p`, `top_k` |

## Top mistakes

- **One overall score.** Report per-slice pass rates with Wilson intervals.
- **Editing released cases.** Retire them, add a new id, and check the
  manifest in CI.
- **Judging what code can check.** Move schema, dates, and length into code
  checks first.
- **An uncalibrated judge gating releases.** Measure TPR and TNR on held-out
  expert labels.
- **One-order pairwise comparisons.** Judge both orders and report the
  flip rate.
- **Gating on a raw pass-rate drop.** Use a paired test against the
  committed baseline.
- **Full prompts in production traces.** Keep capture off; redact at the
  source and in the Collector.
- **User IDs as metric labels.** Keep high-cardinality values on spans
  only.

## Where to go deeper

- [Building evaluation sets](building-evaluation-sets.md)
- [LLM-as-judge and automated evals](llm-as-judge-and-automated-evals.md)
- [Evals in CI and regression testing](evals-in-ci-and-regression-testing.md)
- [LLM observability and tracing](llm-observability-and-tracing.md)
- [Interview questions and answers](interview-questions-and-answers.md)

Back to the [Evaluation and monitoring overview](../evaluation-and-monitoring.md).
