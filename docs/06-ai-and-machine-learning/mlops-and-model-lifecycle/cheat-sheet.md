# MLOps and Model Lifecycle Cheat Sheet

Quick revision of the MLOps and model lifecycle lessons, for use before
an interview or a model release, migration, or monitoring task.

## Key commands

| Command | What it does |
|---|---|
| `mlflow server --backend-store-uri "postgresql://..." --artifacts-destination "s3://..." --allowed-hosts "mlflow.example.com"` | Team tracking server: database for metadata, object storage for artifacts |
| `export MLFLOW_TRACKING_URI="https://mlflow.example.com"` | Point training jobs at the server (default: local `mlflow.db`) |
| `mlflow models serve -m "models:/taskflow-priority@champion" --env-manager local -p 5001` | Serve a registered model over REST for a local test |
| `mlflow models build-docker` | Build a serving image for production |
| `python promote.py` / `python promote.py --rollback` | Lesson scripts: gate and move aliases / move `@champion` back |
| `node dist/scripts/check-prompt-lock.js` | Fail CI when a released prompt version was edited in place |
| `node dist/scripts/check-model-lifecycle.js` | Fail when a configured model is close to its shutdown date |

## Key configuration

```python
# promote_snippets.py (excerpt): MLflow 3 registry calls used in the lessons
mlflow.sklearn.log_model(sk_model=model, name="model", registered_model_name="taskflow-priority",
                         skops_trusted_types=[...])  # skops by default; trust reviewed types only
client.set_registered_model_alias("taskflow-priority", "champion", "2")
client.set_model_version_tag("taskflow-priority", "2", "validation_status", "approved")
model = mlflow.sklearn.load_model("models:/taskflow-priority/2")  # deploy a concrete version
```

```json
{
  "enabled": true,
  "experiment": "task-parser-2026-11",
  "splits": [
    { "release": "task-parser-2026-10-02", "percent": 90 },
    { "release": "task-parser-2026-11-10", "percent": 10 }
  ]
}
```

## Decision guide

| If you need | Choose | Why |
|---|---|---|
| To explore alone | Local MLflow with autologging and dated snapshots | Nothing to run; history from the first run |
| To share results in a team | Tracking server with a database, object storage, and SSO | One source of truth |
| To ship a model | Registry aliases, a CI promotion gate, concrete versions in deployments | Audit trail and rollback in seconds |
| Strict environment separation | One registered model or catalog per environment | Separate permissions and approvals |
| To version an LLM feature | Prompts in Git plus named releases (prompt, model ID, parameters, schema) | Reviewed, tested, rolled back like code |
| Many non-developer prompt authors | A prompt registry whose approved versions are exported into the build | Friendly editing, same gates |
| To compare releases online | Sticky per-user A/B test, sized in advance | Consistent product, valid statistics |
| To try a risky candidate safely | Shadow traffic on a small, read-only sample | Real inputs, nothing shown to users |
| Drift alerts people trust | PSI with persistence rules, plus null-share checks | p-values flag tiny shifts on big samples |
| To judge performance with late labels | Report by prediction week, with label coverage and Wilson intervals | Avoids false dips |
| To retrain | Schedule, data, and performance triggers that start training only | Every version still passes the gate |

## Numbers and defaults to remember

| Item | Value |
|---|---|
| MLflow stages | Deprecated since 2.9; use aliases and tags |
| Lesson gate | Overall AUC not lower; no slice drops more than 0.02 |
| Sticky bucket | SHA-256 of `"<experiment>:<user id>"`, first 4 bytes, modulo 10,000 |
| A/B sample size | 62% to 64% at 5% significance and 80% power: about 9,144 users per variant |
| Retirement notice (November 2026) | OpenAI GA 6 months, previews about 2 weeks; Anthropic 60 days; Gemini previews 2 weeks; Foundry GA lifecycle 18 months |
| Lifecycle fields | OpenAI `shutdown_date`; Anthropic `lifecycle`, `retires_at`; Foundry `lifecycleStatus` |
| PSI | Sum of (current − reference) × ln(current / reference); below 0.10 little shift, 0.10 to 0.25 investigate, above 0.25 significant |
| KS test | D = largest gap between two empirical CDFs; p-values shrink as samples grow |
| False alarms | 7 features × 365 days × 0.05 ≈ 128 a year |
| Lesson alert rules | Page: PSI above 0.25 two days running, or a required feature over 5% null; ticket: PSI above 0.10 for three days |

## Top mistakes

- **Deploying `@champion` directly.** Resolve the alias once and deploy
  and log a concrete version.
- **Gating on a random split of the training month.** Compare on a later
  holdout, overall and per slice.
- **Editing a prompt version in place.** Create a new version; enforce a
  lock file in CI.
- **Moving aliases such as "latest" in production.** Pin versions and run
  a daily lifecycle check.
- **Stopping an A/B test at the first p < 0.05.** Fix sample size and
  duration in advance, and assign per user.
- **Paging on p-values from large samples.** Alert on effect sizes with
  persistence; track null shares separately.
- **Letting a trigger promote a retrained model.** Triggers start
  training; the gate and canary decide.
- **Training on accepted suggestions only.** Keep a holdout without
  suggestions to break feedback loops.

## Where to go deeper

- [Experiment tracking and model registry](experiment-tracking-and-model-registry.md)
- [LLMOps: prompt and model versioning](llmops-prompt-and-model-versioning.md)
- [Production monitoring and drift](production-monitoring-and-drift.md)
- [Interview questions and answers](interview-questions-and-answers.md)

Back to the [MLOps and model lifecycle overview](../mlops-and-model-lifecycle.md).
