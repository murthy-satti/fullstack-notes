# Experiment Tracking and Model Registry

Training a model is an experiment: you change data, features, code, and
hyperparameters, and compare the results. **Experiment tracking** records
every run with everything needed to explain and rebuild it. A **model
registry** turns the runs you want to keep into named, versioned models,
and records which version is approved for production. Together they
answer the two questions every production model eventually faces: "what
exactly is running?" and "how do we get back to what was running
yesterday?"

This lesson builds both for a classic model in TaskFlow: a **priority
suggestion model** that predicts whether a new task is urgent. It uses
MLflow 3 for tracking and the registry (code verified with MLflow 3.18
and scikit-learn 1.9, November 2026), shows promotion gates built on
registry aliases, and covers reproducibility and the main alternatives.
Versioning prompts and hosted LLMs is the subject of the next lesson.

## Why it matters

Without tracking, model work lives in notebooks, file names such as
`model_final_v3_fixed.pkl`, and memory. When a model misbehaves, nobody
can say which data it saw, which code trained it, or why it was chosen.
When a better model appears, nobody can prove it is better on the same
data. And when a release goes wrong, there is no clean way back.

Tracking and a registry give a model the same properties a release
pipeline gives application code: a unique identity for every build, an
audit trail from production back to source, a review step before
release, and a rollback that takes seconds. They also make work
cumulative: a new teammate can find last quarter's best run, see its
parameters and data, and start from there instead of from scratch.

## Real-world usage

- **Google (hidden technical debt).**
  [Hidden Technical Debt in Machine Learning Systems](https://papers.nips.cc/paper_files/paper/2015/hash/86df7dcfd896fcaf2674f757a2463eba-Abstract.html)
  (NeurIPS 2015) argues that the model code is a small part of a real ML
  system and names debts such as configuration debt and reproducibility
  debt. Recording configuration, data, and code per run is the practical
  answer to both.
- **The NeurIPS reproducibility program.**
  [Improving Reproducibility in Machine Learning Research](https://jmlr.org/papers/v22/20-303.html)
  (JMLR, 2021) reports on a conference program that added a code
  submission policy, a reproducibility challenge, and a checklist. The
  research community treats reproducibility as a process to design, not
  something that happens by itself.
- **Databricks Unity Catalog.** The
  [model lifecycle documentation](https://docs.databricks.com/aws/en/machine-learning/manage-model-lifecycle/)
  states that "Stages are not supported for models in Unity Catalog" and
  uses aliases such as `Champion` to mark the version that serves
  production, plus catalogs to separate environments: the same direction
  MLflow took when it deprecated stages.
- **Neptune.ai's shutdown.** After agreeing to be acquired by OpenAI, Neptune
  [wound down its hosted service](https://docs.neptune.ai/transition_hub)
  after a transition period ending on March 5, 2026, and stated that
  remaining hosted data would be irreversibly deleted; customers had to
  export to tools such as MLflow or Weights & Biases. Experiment metadata
  is an asset: keep it exportable.
- **Google Cloud's MLOps guide.**
  [MLOps: continuous delivery and automation pipelines](https://docs.cloud.google.com/architecture/mlops-continuous-delivery-and-automation-pipelines-in-machine-learning)
  makes metadata management and model validation part of its level 1
  maturity: "You make sure that the new model produces better
  performance than the current model before promoting it to production."

**Popular tools and providers:** MLflow (open source, a Linux Foundation
project), Weights & Biases (part of CoreWeave), Comet, ClearML, Aim,
TensorBoard (training curves only), DVC (data and model versioning with
Git, now stewarded by lakeFS), Metaflow, Kubeflow, and the managed
registries in Databricks, Amazon SageMaker AI, Azure Machine Learning,
and Google Cloud's Gemini Enterprise Agent Platform (formerly Vertex AI).

## How it works

### What a training run must record

A run is reproducible only if it records its inputs, and comparable only
if it records its outputs in a consistent way.

| Category | What to record | How (MLflow) |
|---|---|---|
| Code | Git commit, and whether the tree was dirty | Automatic `mlflow.source.git.commit` tag; your own `git_dirty` tag |
| Data | Immutable snapshot location and a content digest | `mlflow.log_input(mlflow.data.from_pandas(...))` |
| Configuration | Every hyperparameter, feature list, and threshold | `mlflow.log_params()` |
| Environment | Library versions, Python version | Captured with the model: `requirements.txt`, `python_env.yaml` |
| Randomness | Seeds for splits, sampling, and early stopping | A logged parameter such as `random_state` |
| Results | Metrics on named datasets, plots, reports | `mlflow.log_metrics()`, artifacts |
| Model | The fitted artifact, its input and output signature, an input example | `mlflow.sklearn.log_model()` |
| Lineage | Which run produced which registered version | `registered_model_name` or `mlflow.register_model()` |

![Diagram: four inputs feed one MLflow run in the taskflow-priority experiment: code (git commit 3d75f43 and a git_dirty tag), data (the snapshot tasks-2026-10.parquet with dataset digests), configuration (learning_rate, random_state, and the other parameters), and environment (Python 3.12.6 and scikit-learn 1.9.1); the run produces metrics (ROC AUC 0.698, average precision 0.422), a logged model with an m- identifier containing model.skops and MLmodel, and a signature with an input example mapping seven columns to two probabilities; registered_model_name makes the logged model version 1 of the registered model taskflow-priority.](run-record-anatomy.svg)

Parameters, metrics, and tags are different things. A **parameter** is
an input fixed for the run (`learning_rate=0.05`). A **metric** is a
number measured by the run, optionally at many steps
(`test_roc_auc=0.698`). A **tag** is free-form metadata you can change
later (`git_dirty=True`, `owner=ml-team`). Keeping them separate is what
makes "show me every run with `max_leaf_nodes=31`, sorted by AUC" a
query instead of an archaeology project.

### MLflow 3 building blocks

| Concept | What it is | Identifier |
|---|---|---|
| Experiment | A named group of runs for one problem | `taskflow-priority` |
| Run | One execution of training code | Run ID, such as `3819fc3b...` |
| Dataset input | A dataset logged against a run, with source and digest | Name plus digest, such as `f9096fbd` |
| Logged model | A model artifact created by a run (new in MLflow 3) | `models:/m-<id>` |
| Registered model | A named model in the registry | `taskflow-priority` |
| Model version | An immutable, numbered version of a registered model | `models:/taskflow-priority/2` |
| Alias | A movable, named pointer to one version | `models:/taskflow-priority@champion` |

With no configuration, MLflow 3.18 stores everything in a SQLite file,
`mlflow.db`, in the current directory, which is fine for one person.
A team runs a tracking server with a database for metadata and object
storage for artifacts, and every training job points at it with the
`MLFLOW_TRACKING_URI` environment variable:

```bash
mlflow server \
  --backend-store-uri "postgresql://mlflow:<password>@db.example.com:5432/mlflow" \
  --artifacts-destination "s3://example-mlflow-artifacts" \
  --host 0.0.0.0 --port 5000 \
  --allowed-hosts "mlflow.example.com"

export MLFLOW_TRACKING_URI="https://mlflow.example.com"
```

Put the server behind your single sign-on proxy (or MLflow's
`--app-name basic-auth` option) and TLS. The tracking server holds
model files, which are executable artifacts, and dataset references, so
treat write access to it like write access to a deployment pipeline.

### The registry: versions, aliases, and tags

A registered model collects **versions**. Each version points at one
model artifact and never changes. What changes is metadata around it:

- **Aliases** are named, movable pointers: `@champion` is the version
  production serves, `@challenger` the one under evaluation,
  `@previous` the last champion. MLflow's documentation describes an
  alias as "a mutable, named reference to a particular version of a
  registered model". An alias points at exactly one version at a time.
- **Tags** record facts about a version: `validation_status=approved`,
  `holdout_auc=0.7181`, the ticket that approved it.

![Diagram: top panel after three promotion attempts: versions 1, 2 and 3 of taskflow-priority; version 1 is approved and carries @previous, version 2 is approved and carries @champion, version 3 is rejected and carries @challenger, and serving loads v2; bottom panel after running the rollback: @champion and @previous both point at version 1, version 2 is tagged rolled_back, version 3 stays rejected with @challenger, and serving loads v1; set_registered_model_alias(name, alias, version) moves a pointer and every version stays immutable.](registry-aliases.svg)

Older MLflow code uses **stages** (`Staging`, `Production`,
`Archived`) with `transition_model_version_stage()`. Stages were
deprecated in MLflow 2.9; in MLflow 3.18 those calls still work but warn
that "Model registry stages will be removed in a future major release".
Aliases replaced them because stages were a fixed list, allowed only one
meaning per version, and could not express two models in production for
different purposes. Use aliases and tags in new code.

| URI | Resolves to | Use it for |
|---|---|---|
| `models:/taskflow-priority/2` | Exactly version 2, forever | Deployments, audits, reproducing an incident |
| `models:/taskflow-priority@champion` | Whatever version the alias points at now | The deploy step that decides what to ship |
| `models:/m-4aa69ab4...` | One logged model, before or without registration | Comparing candidates inside the experiment |
| `runs:/<run id>/model` | The model artifact logged by a run (older style) | Legacy code |

An alias is resolved when something loads the model. A long-running
server that loaded `@champion` at startup keeps serving that version
until it reloads, and replicas that start at different times can
disagree. The safer pattern: the deploy step resolves the alias to a
concrete version once, deploys `models:/taskflow-priority/<version>`,
and records that version in logs and prediction records. Rollback is
then "move the alias back and rerun the deploy", or a switch to a
still-running previous deployment.

### Promotion gates

Registering a version is cheap; promoting it is a decision. A gate turns
the decision into code that runs the same way every time:

1. **Register** the new version and point `@challenger` at it.
2. **Score both models on the same data**, ideally a holdout from a
   later period that neither model trained on. A random split of the
   training month flatters models that memorize that month.
3. **Compare overall and per slice.** An overall gain can hide a
   regression for one project type, tenant, or language.
4. **Check the contract:** the input signature still matches what the
   API sends, latency and model size are within budget.
5. **Record the decision** as tags on the version, then move the
   aliases (`@previous` to the old champion, `@champion` to the new
   version), or tag it rejected.
6. **Validate online:** shadow traffic or a canary before full traffic,
   exactly as for application releases.

![Diagram: train and log the run, register version N, set @challenger, then score both models on a newer holdout overall and per slice; a decision asks whether overall AUC is not lower and no slice drops by more than 0.02; if no, version N is tagged rejected and the champion keeps serving; if yes, @previous moves to the old champion and @champion to version N, then online validation with shadow or canary traffic either leads to serving all traffic or, if metrics are worse, a rollback that sets @champion back to @previous.](promotion-gate-flow.svg)

Google's [Rules of Machine Learning](https://developers.google.com/machine-learning/guides/rules-of-ml)
put the offline part bluntly as Rule #9, "Detect problems before
exporting models", and recommend measuring the delta between models
(Rule #24) before running live experiments. The online part reuses the
release machinery in section 07: see
[rolling, blue-green, and canary deployments](../../../../07-devops-and-deployment/07-devops-and-deployment/deployment-strategies/rolling-blue-green-and-canary.md)
and
[feature flags and progressive delivery](../../../../07-devops-and-deployment/07-devops-and-deployment/deployment-strategies/feature-flags-and-progressive-delivery.md).

### Environments and registries

| Approach | How it works | Good for |
|---|---|---|
| One registry, aliases per purpose | `@staging`, `@champion` on the same registered model | Small teams, one deployment target |
| One registered model per environment | Copy a validated version into `prod.ml.taskflow_priority` (Unity Catalog style) with `copy_model_version()` | Separate permissions and audit per environment |
| Separate tracking servers per environment | Production registry only accepts versions promoted by CI | Strict separation, regulated domains |

Whichever you choose, production should load models only through a
reference that a reviewed process set, never from a path on someone's
laptop.

### Reproducibility

Reproducibility comes in levels:

- **Bit-identical:** the same code, data, environment, and seed produce
  the same model bytes or predictions. Achievable for many CPU models.
- **Statistically equivalent:** results differ slightly (GPU kernels,
  thread scheduling) but metrics stay within a known tolerance.
- **Process-reproducible:** anyone can rerun the pipeline from the
  recorded inputs, even if the output is not identical.

Common causes of runs that cannot be reproduced:

- **Mutable data.** Training on `SELECT * FROM tasks` reads a different
  table every day. Train from dated snapshots and log their digests.
- **Hidden randomness.** Scikit-learn's `HistGradientBoostingClassifier`
  turns on early stopping automatically when there are more than 10,000
  samples, and early stopping takes a random validation split. Without a
  fixed `random_state`, two runs on the same data differ.
- **Unpinned environments.** A minor library upgrade can change
  defaults. The model's `requirements.txt` pins what it was trained with.
- **Training-serving skew.** Features computed by different code in
  training and serving. Google's rules recommend logging features at
  serving time (Rule #29) and re-using code between the two pipelines
  (Rule #32).

The `check_repro.py` example below retrains twice with seed 42 and once
with seed 7 and compares fingerprints of the predictions:

```text
seed 42, run 1: 9029a5f0d8955fc5
seed 42, run 2: 9029a5f0d8955fc5
seed 7:         6f8e725d8d658436
```

Same seed, same predictions; a different seed changes both the split and
the early-stopping validation set.

### Model files are code

A serialized model is executed when it is loaded. Python's `pickle`
format can run arbitrary code during loading, so a tampered model file
is a remote-code-execution risk. MLflow 3.18 therefore saves
scikit-learn models with **skops** by default (outside Databricks),
which refuses to load types it does not trust. Logging a
`HistGradientBoostingClassifier` without extra settings fails with:

```text
mlflow.exceptions.MlflowException: The saved sklearn model references untrusted types.
... Untrusted types found in the file:
['sklearn.ensemble._hist_gradient_boosting.predictor.TreePredictor'].
```

The fix is to review and trust that specific type when logging
(`skops_trusted_types=[...]` in the example below), not to switch back
to pickle. The same reasoning applies to the registry: whoever can
write a model version can run code on your servers.

### Weights & Biases and other trackers

| Tool | Hosting | Registry concept | Notes |
|---|---|---|---|
| MLflow | Self-hosted, or managed by Databricks, SageMaker AI, Azure ML | Registered models, versions, aliases, tags | Open source; also a prompt registry for LLM work |
| Weights & Biases | Hosted (multi-tenant, dedicated) or self-managed | W&B Registry: collections of artifact versions | Strong experiment dashboards, sweeps, artifacts lineage |
| Comet | Hosted or self-hosted | Model registry | Experiment management; Opik for LLM evaluation |
| ClearML | Open source, self-hosted or hosted | Model repository | Also orchestration and data management |
| DVC | Git plus your storage | Models as versioned files and Git tags | No server needed; good for small teams |
| Cloud registries | Databricks, SageMaker AI, Gemini Enterprise Agent Platform | Versions plus aliases, labels, or approval status | Integrated with the provider's serving |

The concepts transfer directly. In W&B, a run logs metrics and an
**artifact**; linking the artifact to a registry collection is the
equivalent of registering a version (verified offline with the `wandb`
0.31 SDK):

```python
# train_wandb.py (excerpt): the same run tracked in Weights & Biases
import wandb

run = wandb.init(project="taskflow-priority", job_type="train", config=params)
run.log({"test/roc_auc": metrics["test_roc_auc"]})

artifact = wandb.Artifact(name="taskflow-priority-model", type="model",
                          metadata={"git_commit": commit, **metrics})
artifact.add_file("model.skops")
logged = run.log_artifact(artifact, aliases=["candidate"])
run.link_artifact(logged, target_path="wandb-registry-model/taskflow-priority")
run.finish()
```

Artifact versions are numbered `v0`, `v1`, and so on; the default
**Models** registry is addressed as `wandb-registry-model`. Whatever the
tool, check two things before adopting it: that metadata can be
exported in bulk, and that production can load models without the
tracking UI being up.

## When to use and when not to use

Use experiment tracking whenever you train or fine-tune anything you
might compare, ship, or need to explain later; it is cheap from the
first run. Add a registry as soon as a model is served to users or
consumed by another team.

You may not need them (yet) when:

- You only call hosted LLM APIs with no training: version prompts and
  model IDs instead (next lesson).
- A one-off analysis will never be rerun or deployed.
- A rule or heuristic does the job; there is no model to track.

| Situation | Recommended setup |
|---|---|
| One data scientist exploring | Local MLflow (`mlflow.db`), autologging, dated data snapshots |
| A team sharing results | Tracking server with a database and object storage, SSO |
| A model served in production | Registry with aliases, a promotion gate in CI, concrete versions in deployments |
| Several environments or regulated data | Per-environment registered models or catalogs, approvals recorded as tags |
| Already on Databricks, SageMaker AI, or Google Cloud | The managed MLflow or registry of that platform |
| Prompt-only LLM features | Prompts and model IDs versioned in Git, release manifests |

## Practical examples

The scripts below form a complete loop: create dated snapshots, train
and register, gate and promote, roll back, serve, and check
reproducibility. They run as shown with Python 3.12, MLflow 3.18,
pandas 3.1, and scikit-learn 1.9; the outputs are from real runs.

### Dated data snapshots

```python
# make_dataset.py: write immutable, dated snapshots of synthetic TaskFlow tasks
import os

import numpy as np
import pandas as pd

PROJECT_TYPES = np.array(["engineering", "marketing", "support", "operations"])


def make_tasks(n: int, seed: int) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    has_due = rng.random(n) < 0.7
    days_until_due = np.where(has_due, rng.gamma(2.0, 3.0, n).round(1), np.nan)
    project = rng.choice(PROJECT_TYPES, n, p=[0.4, 0.2, 0.25, 0.15])
    df = pd.DataFrame({
        "title_length": rng.integers(2, 26, n),
        "has_due_date": has_due,
        "days_until_due": days_until_due,
        "assignee_open_tasks": rng.poisson(8, n),
        "project_type": project,
        "mentions_blocker": rng.random(n) < 0.08,
        "created_hour": rng.integers(0, 24, n),
    })
    due_soon = np.nan_to_num(days_until_due, nan=99.0) <= 2
    logit = (-2.2 + 2.4 * df["mentions_blocker"] + 1.6 * due_soon
             + 0.7 * (project == "support") + 0.04 * df["assignee_open_tasks"]
             - 0.03 * df["title_length"] + rng.normal(0, 0.8, n))
    df["is_urgent"] = rng.random(n) < 1 / (1 + np.exp(-logit))
    return df


if __name__ == "__main__":
    os.makedirs("data", exist_ok=True)
    make_tasks(20_000, seed=202610).to_parquet("data/tasks-2026-10.parquet", index=False)
    make_tasks(5_000, seed=202611).to_parquet("data/tasks-holdout-2026-11.parquet", index=False)
    print("wrote data/tasks-2026-10.parquet and data/tasks-holdout-2026-11.parquet")
```

In a real system these files come from an export job that writes a new,
dated file and never overwrites an old one. The November file plays the
role of fresh labeled data that no candidate has trained on.

### Tracking and registering a training run

```python
# train.py: train the TaskFlow priority model and record the run in MLflow
import argparse
import subprocess

import mlflow
import pandas as pd
from mlflow.models import infer_signature
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.metrics import average_precision_score, roc_auc_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder

DATA = "data/tasks-2026-10.parquet"  # an immutable, dated snapshot
FEATURES = ["title_length", "has_due_date", "days_until_due", "assignee_open_tasks",
            "project_type", "mentions_blocker", "created_hour"]
TARGET = "is_urgent"
MODEL_NAME = "taskflow-priority"


def git_is_dirty() -> bool:
    out = subprocess.run(["git", "status", "--porcelain"], capture_output=True, text=True)
    return out.returncode != 0 or out.stdout.strip() != ""


def build_model(params: dict) -> Pipeline:
    encode = ColumnTransformer(
        [("project", OneHotEncoder(handle_unknown="ignore", sparse_output=False), ["project_type"])],
        remainder="passthrough",
    )
    return Pipeline([("encode", encode), ("clf", HistGradientBoostingClassifier(**params))])


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--learning-rate", type=float, default=0.05)
    parser.add_argument("--max-iter", type=int, default=300)
    parser.add_argument("--max-leaf-nodes", type=int, default=31)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()
    params = {"learning_rate": args.learning_rate, "max_iter": args.max_iter,
              "max_leaf_nodes": args.max_leaf_nodes, "random_state": args.seed}

    df = pd.read_parquet(DATA)
    train, test = train_test_split(df, test_size=0.2, random_state=args.seed, stratify=df[TARGET])

    mlflow.set_experiment("taskflow-priority")
    with mlflow.start_run(run_name=f"hgb-lr{args.learning_rate}-it{args.max_iter}") as run:
        mlflow.set_tag("git_dirty", git_is_dirty())
        mlflow.log_params(params)
        mlflow.log_input(mlflow.data.from_pandas(train, source=DATA, name="tasks-2026-10-train",
                                                 targets=TARGET), context="training")
        mlflow.log_input(mlflow.data.from_pandas(test, source=DATA, name="tasks-2026-10-test",
                                                 targets=TARGET), context="evaluation")

        model = build_model(params).fit(train[FEATURES], train[TARGET])
        scores = model.predict_proba(test[FEATURES])[:, 1]
        metrics = {"test_roc_auc": roc_auc_score(test[TARGET], scores),
                   "test_avg_precision": average_precision_score(test[TARGET], scores)}
        mlflow.log_metrics(metrics)

        sample = train[FEATURES].head(5)
        info = mlflow.sklearn.log_model(
            sk_model=model,
            name="model",
            signature=infer_signature(sample, model.predict_proba(sample)),
            input_example=sample,
            pyfunc_predict_fn="predict_proba",
            # MLflow saves scikit-learn models with skops (not pickle) by default;
            # this type is one we created ourselves, so we trust it explicitly
            skops_trusted_types=["sklearn.ensemble._hist_gradient_boosting.predictor.TreePredictor"],
            registered_model_name=MODEL_NAME,
        )
        print(f"run {run.info.run_id}: {metrics}")
        print(f"registered {MODEL_NAME} version {info.registered_model_version} ({info.model_uri})")


if __name__ == "__main__":
    main()
```

What each part does:

- `build_model()` puts the encoder inside the pipeline, so the logged
  model accepts the raw string `project_type` that the API sends. A
  model that needs preprocessing outside its artifact invites
  training-serving skew.
- `log_input()` records both splits with a digest of their contents, so
  a later run on changed data shows a different digest.
- `name="model"` is the MLflow 3 parameter (it replaces
  `artifact_path`). `pyfunc_predict_fn="predict_proba"` makes the
  generic Python-function interface, and therefore the scoring server,
  return probabilities instead of class labels.
- The signature, inferred from a sample, documents the input columns
  and types; the scoring server rejects requests that do not match it.
  MLflow warns that integer columns cannot hold missing values, so
  declare such columns as floats if they can ever be empty.

Three runs with different parameters:

```bash
python make_dataset.py
python train.py
python train.py --learning-rate 0.1 --max-iter 150 --max-leaf-nodes 15
python train.py --learning-rate 0.2 --max-iter 400 --max-leaf-nodes 63
```

```text
Successfully registered model 'taskflow-priority'.
Created version '1' of model 'taskflow-priority'.
run 3819fc3bf0af4757a27510f33efe4bb3: {'test_roc_auc': 0.6978518369001219, 'test_avg_precision': 0.4223588447725203}
registered taskflow-priority version 1 (models:/m-4aa69ab4c5cb44088f3741cbf0f287b6)
```

Inside a Git repository MLflow also tags the run with
`mlflow.source.git.commit` and `mlflow.source.git.branch`. The run above
was tagged `git_dirty=True` because the generated `data/` folder and
`mlflow.db` were not ignored; add them to `.gitignore` so the flag means
what it says, and make CI refuse to register models from dirty trees.

### A promotion gate with aliases

```python
# promote.py: gate the newest version against the champion, then move aliases
import sys

import mlflow
import pandas as pd
from mlflow import MlflowClient
from mlflow.exceptions import MlflowException
from sklearn.metrics import roc_auc_score

NAME = "taskflow-priority"
HOLDOUT = "data/tasks-holdout-2026-11.parquet"  # newer labeled data, never trained on
MIN_GAIN = 0.0         # the challenger must not be worse overall
MAX_SLICE_DROP = 0.02  # and no project type may lose more than 0.02 AUC

client = MlflowClient()


def auc_by_slice(model_uri: str, df: pd.DataFrame) -> dict[str, float]:
    model = mlflow.sklearn.load_model(model_uri)
    df = df.assign(score=model.predict_proba(df.drop(columns="is_urgent"))[:, 1])
    result = {"overall": roc_auc_score(df["is_urgent"], df["score"])}
    for name, part in df.groupby("project_type"):
        result[name] = roc_auc_score(part["is_urgent"], part["score"])
    return result


def alias_version(alias: str) -> str | None:
    try:
        return client.get_model_version_by_alias(NAME, alias).version
    except MlflowException:
        return None


def promote() -> None:
    newest = max(client.search_model_versions(f"name='{NAME}'"), key=lambda v: int(v.version))
    champion = alias_version("champion")
    if champion == newest.version or "validation_status" in newest.tags:
        print(f"version {newest.version} was already evaluated")
        return
    client.set_registered_model_alias(NAME, "challenger", newest.version)
    holdout = pd.read_parquet(HOLDOUT)
    new = auc_by_slice(f"models:/{NAME}@challenger", holdout)
    client.set_model_version_tag(NAME, newest.version, "holdout_auc", f"{new['overall']:.4f}")

    if champion is not None:
        old = auc_by_slice(f"models:/{NAME}@champion", holdout)
        drops = {k: old[k] - new[k] for k in new if k != "overall"}
        worst = max(drops, key=drops.get)
        print(f"champion v{champion} AUC {old['overall']:.4f}, "
              f"challenger v{newest.version} AUC {new['overall']:.4f}, "
              f"worst slice {worst} {-drops[worst]:+.4f}")
        if new["overall"] - old["overall"] < MIN_GAIN or drops[worst] > MAX_SLICE_DROP:
            client.set_model_version_tag(NAME, newest.version, "validation_status", "rejected")
            print(f"rejected version {newest.version}; champion stays v{champion}")
            return
        client.set_registered_model_alias(NAME, "previous", champion)

    client.set_model_version_tag(NAME, newest.version, "validation_status", "approved")
    client.set_registered_model_alias(NAME, "champion", newest.version)
    print(f"champion -> version {newest.version}")


def rollback() -> None:
    previous = alias_version("previous")
    if previous is None:
        sys.exit("no previous champion recorded")
    current = alias_version("champion")
    client.set_registered_model_alias(NAME, "champion", previous)
    client.set_model_version_tag(NAME, current, "validation_status", "rolled_back")
    print(f"champion -> version {previous} (rolled back from {current})")


if __name__ == "__main__":
    rollback() if sys.argv[1:] == ["--rollback"] else promote()
```

Running the gate after each training run (in CI this is one job after
the training job):

```text
$ python promote.py          # after version 1: no champion yet
champion -> version 1
$ python promote.py          # after version 2
champion v1 AUC 0.7166, challenger v2 AUC 0.7181, worst slice operations -0.0087
champion -> version 2
$ python promote.py          # after version 3
champion v2 AUC 0.7181, challenger v3 AUC 0.7054, worst slice marketing -0.0211
rejected version 3; champion stays v2
$ python promote.py --rollback
champion -> version 1 (rolled back from 2)
```

Version 3 had the highest learning rate and the most leaves; it lost
overall and lost 0.0211 AUC on marketing tasks, just over the 0.02
budget. The gate caught a model that a single overall number would
already have rejected, and would have caught a slice regression even if
the overall AUC had improved. After the rollback, `MlflowClient` shows
(output trimmed):

```text
aliases: {'challenger': 3, 'champion': 1, 'previous': 1}
v1 tags: {'holdout_auc': '0.7166', 'validation_status': 'approved'}
v2 tags: {'holdout_auc': '0.7181', 'validation_status': 'rolled_back'}
v3 tags: {'holdout_auc': '0.7054', 'validation_status': 'rejected'}
```

Two design choices matter here. The holdout is a later month, so the
comparison resembles production rather than the training distribution.
And every decision is written to the version as a tag, so the registry
itself is the audit log of what was promoted, rejected, and rolled back.

### Serving the champion and calling it from the API

MLflow can serve any registered model behind a REST endpoint. For a
local test:

```bash
mlflow models serve -m "models:/taskflow-priority@champion" \
  --env-manager local -h 127.0.0.1 -p 5001
```

```bash
curl -s http://127.0.0.1:5001/invocations \
  -H "Content-Type: application/json" \
  -d '{"dataframe_split": {
        "columns": ["title_length", "has_due_date", "days_until_due", "assignee_open_tasks",
                    "project_type", "mentions_blocker", "created_hour"],
        "data": [[6, true, 1.5, 12, "support", true, 9],
                 [14, false, null, 3, "marketing", false, 16]]}}'
```

```json
{"predictions": [[0.16951282202088336, 0.8304871779791166], [0.8809417979634918, 0.11905820203650815]]}
```

Each row is `[P(not urgent), P(urgent)]`: the short "blocker" support
task due tomorrow scores 0.83, the long marketing task with no due date
0.12. A request that omits columns gets HTTP 400 with
`INVALID_PARAMETER_VALUE` and a message that it "Failed to enforce
schema", which is the signature doing its job. In production, build the
image with `mlflow models build-docker` or your own Dockerfile, deploy a
concrete version, and put it behind the same health checks and
autoscaling as any service.

The TaskFlow API (Node.js) treats the suggestion as optional, with a
short timeout:

```ts
// src/ml/priorityClient.ts: ask the model server for a priority suggestion
export interface TaskFeatures {
  title_length: number;
  has_due_date: boolean;
  days_until_due: number | null;
  assignee_open_tasks: number;
  project_type: string;
  mentions_blocker: boolean;
  created_hour: number;
}

const COLUMNS = [
  "title_length", "has_due_date", "days_until_due", "assignee_open_tasks",
  "project_type", "mentions_blocker", "created_hour",
] as const satisfies readonly (keyof TaskFeatures)[];

export async function urgentProbability(task: TaskFeatures): Promise<number | null> {
  try {
    const res = await fetch(`${process.env.PRIORITY_MODEL_URL}/invocations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dataframe_split: { columns: COLUMNS, data: [COLUMNS.map((c) => task[c])] },
      }),
      signal: AbortSignal.timeout(300),
    });
    if (!res.ok) return null;
    const { predictions } = (await res.json()) as { predictions: number[][] };
    return predictions[0]?.[1] ?? null; // [P(not urgent), P(urgent)]
  } catch {
    return null; // a missing suggestion must never block task creation
  }
}
```

The column list is checked against `TaskFeatures` at compile time, so a
renamed field fails the build instead of the signature check at runtime.

### Checking reproducibility

```python
# check_repro.py: retrain from the same snapshot and compare prediction fingerprints
import hashlib

import pandas as pd
from sklearn.model_selection import train_test_split

from train import DATA, FEATURES, TARGET, build_model


def fingerprint(seed: int) -> str:
    df = pd.read_parquet(DATA)
    train, test = train_test_split(df, test_size=0.2, random_state=seed, stratify=df[TARGET])
    params = {"learning_rate": 0.05, "max_iter": 300, "max_leaf_nodes": 31, "random_state": seed}
    model = build_model(params).fit(train[FEATURES], train[TARGET])
    scores = model.predict_proba(test[FEATURES])[:, 1].round(12)
    return hashlib.sha256(scores.tobytes()).hexdigest()[:16]


print("seed 42, run 1:", fingerprint(42))
print("seed 42, run 2:", fingerprint(42))
print("seed 7:        ", fingerprint(7))
```

Run it in CI on a schedule: if two runs with the same seed ever differ,
something nondeterministic (a library upgrade, a data file that
changed in place) has crept in, and you want to know before an
incident review asks you to rebuild last month's model.

## Best practices

- Track from the first experiment; adding tracking later loses the runs
  that explain early decisions.
- Train only from immutable, dated data snapshots, and log their
  digests with every run.
- Log parameters, metrics, and tags consistently, with shared names
  across the team (`test_roc_auc`, not `auc`, `AUC`, and `roc`).
- Keep preprocessing inside the model artifact, and log a signature and
  input example with every model.
- Register only through CI from a clean Git tree; humans approve, they
  do not upload files.
- Use aliases and tags, not stages; deploy concrete versions resolved
  from an alias, and record the version with every prediction.
- Gate promotion on a newer holdout, overall and per slice, and record
  the decision on the version.
- Treat model files and the registry as part of your supply chain:
  skops or another safe format, restricted write access, and review of
  trusted types.
- Make sure experiment metadata and models can be exported in bulk.

## In production

- **The API serves a model nobody can identify.**
  *Detect:* an incident review asks "which model produced this
  suggestion?" and the logs only say `taskflow-priority`. *Cause:*
  serving loads `@champion` at startup and nothing records the resolved
  version. *Fix:* resolve the alias in the deploy step, deploy
  `models:/taskflow-priority/<version>`, and log the version in every
  prediction record.
- **Replicas disagree after a promotion.**
  *Detect:* the same input gets different scores depending on which pod
  answers. *Cause:* pods that restarted after the alias moved loaded
  the new version; older pods still serve the old one. *Fix:* treat a
  promotion as a deployment: resolve once, roll out like any release,
  and do not rely on restarts to pick up alias changes.
- **A better model in the experiment UI is worse in production.**
  *Detect:* offline AUC rose but acceptance of suggestions fell after
  the release. *Cause:* the comparison used a random split of the
  training month, or a different metric than the product cares about.
  *Fix:* gate on a later holdout, add slice checks and the business
  metric, and validate online with a canary before full traffic.
- **A rollback target cannot be loaded.**
  *Detect:* `load_model("models:/taskflow-priority/1")` fails during an
  incident. *Cause:* artifacts were cleaned up by a storage lifecycle
  rule, or the old environment no longer installs. *Fix:* protect
  artifacts of every version that was ever a champion, pin
  environments, and rehearse rollbacks.
- **A run cannot be reproduced for an audit.**
  *Detect:* retraining from the recorded commit gives different
  metrics. *Cause:* training read a live table, or the seed was not
  fixed. *Fix:* dated snapshots with digests, logged seeds, and a
  scheduled reproducibility check.
- **Logging a model fails after an MLflow upgrade.**
  *Detect:* `MlflowException: The saved sklearn model references
  untrusted types`. *Cause:* MLflow 3 saves scikit-learn models with
  skops, which rejects types that are not explicitly trusted. *Fix:*
  review the reported type and pass it in `skops_trusted_types`; do not
  fall back to pickle.

## Important terminology

- **Experiment:** A named group of runs for one modeling problem.
- **Run:** One execution of training code, with its parameters,
  metrics, tags, inputs, and artifacts.
- **Parameter / metric / tag:** A fixed input of a run / a measured
  result / mutable descriptive metadata.
- **Dataset digest:** A hash of a dataset's contents, used to detect
  that "the same file" changed.
- **Logged model:** In MLflow 3, a model artifact created by a run,
  addressed as `models:/m-<id>`.
- **Registered model / model version:** A named model in the registry /
  one immutable, numbered version of it.
- **Alias:** A movable name, such as `@champion`, that points at one
  model version.
- **Model signature:** The declared input and output schema of a model,
  enforced at serving time.
- **Champion / challenger:** The current production model and the
  candidate being compared with it.
- **Training-serving skew:** A difference between how features are
  computed for training and for serving.

## Common mistakes and misconceptions

- Treating the experiment UI as the registry: a run with good metrics is
  not an approved release.
- Comparing a new model with the champion on different data, or on the
  training month's random split.
- Thinking an alias change updates running servers instantly; servers
  resolve aliases when they load the model.
- Using stages in new code because old tutorials do; they are
  deprecated.
- Logging metrics but not data digests, environments, or seeds, and
  calling the run reproducible.
- Keeping preprocessing in a notebook or the API instead of in the
  model artifact.
- Loading model files from untrusted sources with pickle.
- Assuming a hosted tracking service will always be there; plan exports.

## Revision questions

1. What must a training run record to be reproducible, and what to be
   comparable with other runs?
2. Explain the difference between a model version and an alias. Why
   did MLflow deprecate stages in favor of aliases?
3. Why should the deploy step resolve `@champion` to a concrete version
   instead of letting every server load the alias at startup?
4. A gate allows a slice to lose at most 0.02 AUC. The champion scores
   0.731 on marketing tasks and the challenger 0.709, while the
   challenger is 0.004 better overall. Does it pass? What should happen
   next?
5. Two training runs with identical code and data give different
   models. List three likely causes and how to check each.
6. Why does MLflow 3 save scikit-learn models with skops by default, and
   what should you do when it reports an untrusted type?
7. Your team uses a hosted tracker. What would you check so that a
   vendor shutdown would not lose your model history?

## Further learning

- [MLflow: tracking](https://mlflow.org/docs/latest/ml/tracking/)
- [MLflow: model registry](https://mlflow.org/docs/latest/ml/model-registry/)
- [Databricks: manage model lifecycle in Unity Catalog](https://docs.databricks.com/aws/en/machine-learning/manage-model-lifecycle/)
- [W&B Registry](https://docs.coreweave.com/products/registry)
- [Google: Rules of Machine Learning](https://developers.google.com/machine-learning/guides/rules-of-ml)
- [Google Cloud: MLOps continuous delivery and automation pipelines](https://docs.cloud.google.com/architecture/mlops-continuous-delivery-and-automation-pipelines-in-machine-learning)
- Next: [LLMOps: prompt and model versioning](llmops-prompt-and-model-versioning.md). Back to the
  [MLOps and model lifecycle overview](../mlops-and-model-lifecycle.md).
