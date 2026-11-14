# Tabular ML and Gradient Boosting

Most machine learning in a business application works on tables: one row
per task, user, invoice, or event, and one column per fact about it. This
lesson builds a real tabular model for TaskFlow: predicting, at the moment a
task is created, how likely it is to miss its due date, so the web app can
flag at-risk work and TaskFlow Assistant can suggest a realistic deadline.

It covers framing a tabular problem, feature engineering, honest train,
validation, and test splits, how gradient-boosted decision trees work,
LightGBM and XGBoost through their scikit-learn APIs, a linear baseline to
compare against, feature importance, and data leakage: the mistake that
makes a model look excellent offline and fail in production. Metrics are
used here and explained in depth in
[model evaluation and validation](model-evaluation-and-validation.md).

## Why it matters

Tabular prediction is where classic machine learning still pays its way:
churn risk, fraud review queues, delivery estimates, lead scoring, and
"which tasks will slip". A language model is the wrong tool for most of
these. A gradient-boosted tree model trains in seconds on a laptop, answers
in well under a millisecond, costs almost nothing to serve, and is usually
the most accurate option on rows-and-columns data.

The hard part is not the algorithm. It is deciding what one row means,
which facts are really known at prediction time, and how to split the data
so the offline score predicts the production score. Get those wrong and the
model is confidently useless: the leaky example on this page scores ROC-AUC
0.888 offline and 0.535, barely better than a coin, on the inputs it would
really receive.

## Real-world usage

- **Tree models win on typical tabular data.** Grinsztajn, Oyallon, and
  Varoquaux,
  [Why do tree-based models still outperform deep learning on typical tabular data?](https://arxiv.org/abs/2207.08815)
  (2022), benchmark 45 datasets and find that tree-based models such as
  XGBoost and random forests remain state of the art on medium-sized data
  (about 10,000 samples), partly because neural networks struggle with
  uninformative features and irregular functions.
- **XGBoost.** Chen and Guestrin,
  [XGBoost: A Scalable Tree Boosting System](https://arxiv.org/abs/1603.02754)
  (KDD 2016), report that 17 of the 29 winning solutions published on
  Kaggle's blog during 2015 used XGBoost, and that every team in the top 10
  of KDD Cup 2015 used it.
- **LightGBM.** Ke and others,
  [LightGBM: A Highly Efficient Gradient Boosting Decision Tree](https://papers.nips.cc/paper_files/paper/2017/hash/6449f44a102fde848669bdd9eb6b76fa-Abstract.html)
  (NeurIPS 2017), introduce gradient-based one-side sampling and exclusive
  feature bundling, and report training up to over 20 times faster than
  conventional gradient boosting at almost the same accuracy.
- **Leakage is common, even in published research.** Kapoor and Narayanan,
  [Leakage and the Reproducibility Crisis in ML-based Science](https://arxiv.org/abs/2207.07048)
  (2022), found leakage-related errors in 17 scientific fields, affecting 329
  papers, and describe 8 types of leakage, from textbook errors to open
  research problems.
- **scikit-learn.** The
  [common pitfalls guide](https://scikit-learn.org/stable/common_pitfalls.html)
  defines data leakage as using information that would not be available at
  prediction time, and recommends pipelines so that preprocessing is fitted
  on training data only.

**Popular tools and providers:** LightGBM, XGBoost, CatBoost, scikit-learn
(`HistGradientBoostingClassifier`, pipelines, metrics), pandas and Polars,
Optuna for tuning, SHAP for explanations; managed options include BigQuery
ML boosted tree models (built on XGBoost), the built-in XGBoost algorithm in
Amazon SageMaker AI, and automated ML in Azure Machine Learning.

## How it works

### Framing a tabular problem

Before any code, write down four things:

| Question | TaskFlow overdue-risk answer |
|---|---|
| What is one row? | One task, at the moment it is created |
| When is the prediction made? | When `POST /tasks` succeeds (the prediction time) |
| What is the label? | `late = 1` if the task was completed after `due_at` |
| When is the label known? | After the due date passes or the task is completed |

The prediction time decides everything else. A feature is usable only if
the API knows its value at that moment. The label time decides how fresh
the training data can be: a task due in 30 days cannot be labelled until 30
days after it was created.

The positive rate matters too. In the synthetic history used on this page,
31% of tasks finish late. That is balanced enough for plain log loss;
rare-event problems (2% fraud, 0.5% churn) need the techniques in
[model evaluation and validation](model-evaluation-and-validation.md).

### Feature engineering

A **feature** is a column the model learns from. Tree models are forgiving
(no scaling, missing values allowed), but the features still decide most of
the accuracy.

| Feature type | TaskFlow examples | How to prepare it |
|---|---|---|
| Numeric | `estimate_hours`, `days_to_due`, `n_subtasks` | Trees use raw values; linear models need scaling, and logs for skewed values |
| Ratios and domain logic | `pressure` = estimate / (6 working hours x days to due) | Encode what experts already know; often the strongest features |
| Categorical | `priority`, `source`, `team` | One-hot for linear models; native categorical support in LightGBM, XGBoost, and scikit-learn |
| Dates | created weekday, December, days to due | Calendar parts, durations, and holidays, never the raw timestamp |
| History aggregates | assignee's late rate before this task | Computed **point in time**: only from outcomes known before the prediction |
| High-cardinality IDs | `assignee` (320 people) | Rarely raw; use history aggregates or carefully cross-fitted target encoding |
| Text | title, description | Length and flags, or embeddings (see [embedding models and dimensions](../embeddings-and-vector-search/embedding-models-and-dimensions.md)) |

History aggregates deserve special care. "This person finishes 40% of their
tasks late" is a powerful feature, and it leaks the label unless it is
computed only from tasks that finished before the current task was created.
The practical example builds it with `pandas.merge_asof` and tests it.

Two more rules for categorical features:

- **Fix the vocabulary at training time.** Categories seen in production
  but not in training (a new team) must map to "unknown", not crash or
  silently become another category.
- **Shrink small groups.** A person with two finished tasks has a late rate
  of 0%, 50%, or 100%. Blending towards the global rate (here with a weight
  of 10 tasks) keeps those noisy values from dominating.

### Train, validation, and test splits

Each split has one job:

| Split | Job | Touched |
|---|---|---|
| Training | Fit the trees (or the coefficients) | Every run |
| Validation | Early stopping, tuning, threshold choice, model choice | Many times |
| Test | One final, unbiased estimate of production performance | Once, at the end |

The split must mirror how the model is used. TaskFlow predicts the future
from the past, so the split is by time, and the training set contains only
tasks whose labels were known at the cutoff (due before 1 January 2026).
Tasks created before the cutoff but due after it are left out; in a real
retraining run on 1 January, their outcomes would not exist yet.

![Diagram: the TaskFlow task history from January 2025 to June 2026 split by time. Training holds 15,252 tasks due before 1 January 2026, whose outcomes were known at the cutoff, and fits the trees. A small block of 649 tasks created before the cutoff but due after it is left out. Validation holds 4,018 tasks from January to March 2026 and is used for early stopping; test holds 4,081 tasks from April to June 2026 and is used once. Below, a random 80/20 split scatters validation rows across every month, so the model is graded on months it trained around. With the same features, the random split estimated ROC-AUC 0.723 while the time split scored 0.713 on the next quarter.](tabular-time-split.svg)

| Split strategy | Use when | Risk if misused |
|---|---|---|
| Random (`train_test_split`) | Rows are independent and the world does not change | Optimistic on time-ordered data |
| Time-based | Predicting the future from the past | Fewer training rows; seasons can be missing |
| Group (`GroupKFold`, `GroupShuffleSplit`) | Many rows per user, team, or document | Without it, the model memorizes entities |
| Stratified | Rare classes in small datasets | Does not fix time or group leakage |

Cross-validation with these splitters (`TimeSeriesSplit`, `GroupKFold`) is
covered in [model evaluation and validation](model-evaluation-and-validation.md).

### How gradient boosting works

A **decision tree** splits rows with questions such as "is pressure above
0.5?" and predicts a value per leaf. One deep tree overfits; one shallow
tree underfits. **Gradient boosting** builds an additive model from many
shallow trees, each one trained to fix the errors of the trees before it:

1. Start with a constant prediction: the mean (regression) or the log-odds
   of the positive rate (classification).
2. Compute, for every row, the gradient of the loss at the current
   prediction. For squared error that is simply the residual.
3. Fit a small tree to those gradients (gradient-boosting libraries also use
   the second derivative to set each leaf's value).
4. Add the tree, multiplied by the **learning rate**, to the model.
5. Repeat until the validation loss stops improving (**early stopping**).

![Diagram: gradient boosting by hand on three tasks, predicting hours to finish with a learning rate of 0.5. Task A was estimated at 1 hour and took 2, task B estimated 4 and took 6, task C estimated 8 and took 10. Round 0 predicts the mean, 6, leaving residuals of minus 4, 0, and plus 4 and a squared error of 32. Tree 1 splits on an estimate below 2 hours, outputs minus 4 for A and plus 2 for B and C; adding half of it gives predictions 4, 7, and 7 and a squared error of 14. Tree 2 splits on an estimate below 6 hours, outputs minus 1.5 for A and B and plus 3 for C; adding half of it gives 3.25, 6.25, and 8.5 and a squared error of 3.875. The final model is 6 plus 0.5 times tree 1 plus 0.5 times tree 2.](gradient-boosting-rounds.svg)

Several implementation details make modern libraries fast and accurate:

- **Histograms.** Feature values are bucketed into bins (255 by default in
  LightGBM, `max_bin`), so finding the best split scans bins, not rows.
- **Tree growth.** LightGBM grows trees **leaf-wise** (best-first, controlled
  by `num_leaves`); XGBoost grows **depth-wise** by default (`max_depth`),
  with a leaf-wise `grow_policy="lossguide"` option.
- **Missing values.** Both learn a default direction for missing values at
  every split, so `NaN` needs no imputation.
- **Regularization.** Minimum rows per leaf, L1 and L2 penalties on leaf
  values, row and column subsampling, and a small learning rate all trade a
  little training fit for better generalization.

A smaller learning rate needs more trees but usually generalizes better, so
the standard recipe is a small rate (0.01 to 0.1), a large `n_estimators`,
and early stopping on the validation set.

### LightGBM and XGBoost through the scikit-learn API

Both libraries ship scikit-learn estimators (`LGBMClassifier`,
`XGBClassifier`), so they work with `fit`, `predict_proba`, pipelines, and
`permutation_importance`. The parameter names differ:

| Concept | LightGBM 4.7 (default) | XGBoost 3.4 (default) |
|---|---|---|
| Number of trees | `n_estimators` (100) | `n_estimators` (100) |
| Learning rate | `learning_rate` (0.1) | `learning_rate` (0.3) |
| Tree size | `num_leaves` (31), `max_depth` (-1, no limit) | `max_depth` (6), `max_leaves` |
| Minimum leaf size | `min_child_samples` (20) | `min_child_weight` (1, a hessian sum) |
| Row subsampling | `subsample` (1.0) with `subsample_freq` (0, off) | `subsample` (1) |
| Column subsampling | `colsample_bytree` (1.0) | `colsample_bytree` (1) |
| L2 penalty | `reg_lambda` (0.0) | `reg_lambda` (1) |
| Categorical columns | pandas `category` dtype, used automatically | pandas `category` with `enable_categorical=True` |
| Validation data | `fit(..., eval_X=..., eval_y=...)` | `fit(..., eval_set=[(X, y)])` |
| Early stopping | `callbacks=[lightgbm.early_stopping(100)]` | `early_stopping_rounds=100` in the constructor |

Two version notes, current in November 2026. LightGBM 4.7.0 added
`eval_X` and `eval_y` and deprecated `eval_set`, which still works with a
warning. XGBoost has taken `early_stopping_rounds` in the constructor since
1.6, and after early stopping its `predict` methods use the best iteration
automatically, as LightGBM's do.

LightGBM's tuning guide gives the key rule for leaf-wise trees:
`num_leaves` is the main complexity control, keep it below `2^max_depth`,
and raise `min_child_samples` (alias `min_data_in_leaf`) to fight
overfitting on large data.

### Data leakage

**Data leakage** is any path by which information that would not exist at
prediction time reaches training or evaluation. It inflates offline scores
and is invisible until production.

| Kind | TaskFlow example | Prevention |
|---|---|---|
| Target leakage | `comment_count` from the export: late tasks stay open longer and collect comments | Only features known at prediction time; snapshot features when predicting |
| Aggregate leakage | Assignee's late rate over all tasks, including this one and later ones | Point-in-time aggregates (`merge_asof`, strictly earlier outcomes) |
| Temporal leakage | Random split of time-ordered data | Time-based splits; train only on labels known at the cutoff |
| Group leakage | The same recurring task template in training and test | Group splits by template, user, or team |
| Preprocessing leakage | Scaler, encoder, or feature selection fitted on all rows | Fit inside a pipeline, on training data only |
| Duplicate leakage | Imported or copied tasks present in both splits | De-duplicate before splitting |

![Diagram: a timeline for one TaskFlow task: it is created, which is when the model predicts, then it reaches its due date, is completed late, and is finally exported. Everything after creation is unknown when the model predicts. Safe features are known at creation: estimate, priority, days to due and team, the assignee's open tasks right now, and the late rate of tasks finished before creation. Leaky features come from the future: comment_count taken from the export, a late rate over all tasks including later ones, and random rows from the test months in training. Validation ROC-AUC with the same LightGBM settings: honest features with a time split 0.713; adding the export-time comment_count 0.888 offline, but 0.535 when the same model gets creation-time inputs; adding the all-tasks late rate 0.751; honest features with a random split 0.723.](leakage-timeline.svg)

The warning signs are recognizable: a score far above what the domain
suggests is possible, one feature dominating importance, a feature whose
name describes something that happens after the event, and a large gap
between validation and the first weeks of production.

### Feature importance and explanations

Feature importance answers "what does the model rely on?", which is the
fastest way to spot leakage and to explain the model to product owners.

- **Split and gain importance** (`feature_importances_`, with
  `importance_type="split"` by default in LightGBM or `"gain"`) are cheap
  but computed on training data and biased towards features with many
  distinct values.
- **Permutation importance** (`sklearn.inspection.permutation_importance`)
  shuffles one column of the validation set and measures how much the
  metric drops. It reflects what the model needs on unseen data, but
  correlated features share credit.
- **SHAP values** explain individual predictions as additive
  contributions, which suits "why was this task flagged?" in the UI.

Importance shows reliance, not causation. A model that leans on `team` may
be learning workload, not anything about the team.

## When to use and when not to use

| Situation | Use | Notes |
|---|---|---|
| Rows and columns, thousands to millions of rows | Gradient-boosted trees | The default first serious model |
| Few hundred rows | Regularized linear model or small trees | Boosting overfits; cross-validate carefully |
| Decisions that must be explained line by line (credit, hiring) | Linear models, GAMs, or monotone constraints | Check the regulations that apply first |
| Images, audio, free text | Deep learning or embeddings | Embeddings can become features of a tree model |
| A rule already captures the business logic | The rule | Learn only what rules cannot express |
| Labels arrive months later and the world keeps changing | Boosting plus frequent retraining and monitoring | See [production monitoring and drift](../mlops-and-model-lifecycle/production-monitoring-and-drift.md) |

Do not reach for boosting (yet) when there is no agreed label, when the
label is not known until long after the decision, or when a baseline has
not been measured.

## Practical examples

The code runs in a Python virtual environment and was tested with Python
3.12, scikit-learn 1.9.1, pandas 3.1.1, LightGBM 4.7.0, and XGBoost 3.4.1
in November 2026. All data is synthetic.

```bash
cd ml
python -m venv .venv && source .venv/bin/activate
pip install scikit-learn pandas lightgbm xgboost pytest
python make_tasks.py && python train.py && python leakage.py && pytest -q
```

On PyPI, the CPU-only `xgboost-cpu` package is a much smaller download than
`xgboost` and provides the same `xgboost` module.

### A synthetic TaskFlow task history

```python
# ml/make_tasks.py: a synthetic TaskFlow task history (no real data), saved as CSV
from pathlib import Path

import numpy as np
import pandas as pd

rng = np.random.default_rng(7)
n = 24_000
created = pd.Timestamp("2025-01-01") + pd.to_timedelta(
    np.sort(rng.uniform(0, 546, n)), unit="D").floor("min")

team = rng.integers(0, 40, n)
assignee = team * 8 + rng.integers(0, 8, n)              # 8 people per team
skill = rng.normal(0, 0.8, 320)                          # hidden: how often each person runs late
priority = rng.choice(["low", "medium", "high", "urgent"], n, p=[0.25, 0.45, 0.22, 0.08])
days_to_due = np.where(priority == "urgent", rng.integers(1, 4, n), rng.integers(1, 31, n))
estimate_hours = np.round(rng.lognormal(1.3, 0.7, n), 1)
n_subtasks = rng.poisson(1.5, n)
has_description = rng.random(n) < 0.7
source = rng.choice(["web", "api", "assistant"], n, p=[0.6, 0.25, 0.15])
december = created.month == 12
open_tasks = rng.poisson(4 + 3 * december)               # assignee's open tasks at creation
month = (created.year - 2025) * 12 + created.month - 1
crunch = rng.normal(0, 0.7, (40, 18))[team, month]       # hidden: busy months per team

pressure = estimate_hours / (6 * days_to_due)            # share of the working time it needs
logit = (-2.2 + 2.2 * (pressure > 0.5) + 1.2 * np.clip(pressure, 0, 0.5)   # a threshold effect
         + 0.9 * (days_to_due > 21)                                        # long deadlines drift
         + 0.8 * ((priority == "low") & (days_to_due > 14))                # interactions
         + 1.0 * ((priority == "urgent") & (estimate_hours > 4))
         + 0.08 * open_tasks + skill[assignee] + crunch + 0.12 * n_subtasks - 0.35 * has_description
         + 0.25 * (created.day_of_week == 4)                               # created on a Friday
         + 0.6 * december + 0.3 * (created >= "2026-02-01"))               # season and drift
late = rng.random(n) < 1 / (1 + np.exp(-logit))

due_at = created + pd.to_timedelta(days_to_due, unit="D")
delay_days = np.where(late, rng.exponential(4, n) + 0.1, -rng.uniform(0, 1, n) * days_to_due)
completed_at = (due_at + pd.to_timedelta(delay_days, unit="D")).floor("min")
days_open = (completed_at - created).days.to_numpy()
comment_count = rng.poisson(0.5 + 0.35 * days_open)      # counted at export time, not at creation

tasks = pd.DataFrame({
    "task_id": np.arange(1, n + 1), "created_at": created, "due_at": due_at,
    "completed_at": completed_at, "team": "team-" + pd.Series(team).astype(str),
    "assignee": "user-" + pd.Series(assignee).astype(str), "priority": priority,
    "estimate_hours": estimate_hours, "days_to_due": days_to_due, "n_subtasks": n_subtasks,
    "has_description": has_description, "source": source, "assignee_open_tasks": open_tasks,
    "comment_count": comment_count, "late": late.astype(int),
})
Path("data").mkdir(exist_ok=True)
tasks.to_csv("data/tasks.csv", index=False)
print(tasks.shape, f"late rate {tasks['late'].mean():.3f}")
by_quarter = tasks.groupby(tasks["created_at"].dt.to_period("Q"))["late"].mean()
print("late rate by quarter:", ", ".join(f"{q} {r:.3f}" for q, r in by_quarter.items()))
```

```text
$ python make_tasks.py
(24000, 15) late rate 0.310
late rate by quarter: 2025Q1 0.299, 2025Q2 0.286, 2025Q3 0.295, 2025Q4 0.335, 2026Q1 0.332, 2026Q2 0.314
```

The generator hides structure a real history would have: people who are
usually late, busy months per team, a deadline-pressure threshold,
interactions (low priority with a long deadline), a December effect, and a
small drift from February 2026. Because the true rules are known, you can
check what each model finds. `comment_count` is deliberately recorded at
export time, which makes it a trap.

### Point-in-time features

```python
# ml/features.py: features known when a task is created, computed point in time
import pandas as pd

NUMERIC = ["estimate_hours", "days_to_due", "pressure", "n_subtasks", "assignee_open_tasks",
           "done_before", "assignee_late_rate", "created_weekday"]
CATEGORICAL = ["priority", "source", "team"]


def load_tasks(path="data/tasks.csv"):
    return pd.read_csv(path, parse_dates=["created_at", "due_at", "completed_at"])


def add_history(tasks, m=10):
    """Each assignee's late rate over tasks that finished BEFORE this task was created."""
    done = tasks[["assignee", "completed_at", "late"]].sort_values("completed_at")
    done["done_before"] = done.groupby("assignee").cumcount() + 1
    done["late_before"] = done.groupby("assignee")["late"].cumsum()
    done["global_rate"] = done["late"].expanding().mean()
    left = tasks[["task_id", "created_at", "assignee"]].sort_values("created_at")
    asof = dict(left_on="created_at", right_on="completed_at", direction="backward",
                allow_exact_matches=False)                     # strictly earlier outcomes only
    person = pd.merge_asof(left, done[["assignee", "completed_at", "done_before", "late_before"]],
                           by="assignee", **asof)
    overall = pd.merge_asof(left, done[["completed_at", "global_rate"]], **asof)
    hist = person[["task_id", "done_before", "late_before"]].assign(
        global_rate=overall["global_rate"].to_numpy())
    hist = hist.fillna({"done_before": 0, "late_before": 0, "global_rate": 0.3})  # 0.3: a neutral start
    # Shrink towards the global rate so a person with two finished tasks is not 0% or 100% late.
    hist["assignee_late_rate"] = (hist["late_before"] + m * hist["global_rate"]) / (hist["done_before"] + m)
    return tasks.merge(hist[["task_id", "done_before", "assignee_late_rate"]], on="task_id")


def build_features(tasks):
    t = add_history(tasks)
    t["pressure"] = t["estimate_hours"] / (6 * t["days_to_due"])   # share of working hours needed
    t["created_weekday"] = t["created_at"].dt.day_of_week
    return t


def time_split(tasks, cutoff="2026-01-01", test_start="2026-04-01"):
    cutoff, test_start = pd.Timestamp(cutoff), pd.Timestamp(test_start)
    train = tasks[tasks["due_at"] < cutoff]                    # labels already known at the cutoff
    val = tasks[(tasks["created_at"] >= cutoff) & (tasks["created_at"] < test_start)]
    test = tasks[tasks["created_at"] >= test_start]
    return train, val, test


def to_xy(df, train, features):
    X = df[features].copy()
    for col in CATEGORICAL:
        if col in features:   # the training categories only: unseen values become missing
            X[col] = pd.Categorical(X[col], categories=sorted(train[col].unique()))
    return X, df["late"]
```

What each part does:

- **`add_history`** sorts finished tasks by completion time and keeps
  running counts per assignee. `merge_asof` then attaches, to each new task,
  the counts from the last completion **strictly before** its creation
  (`allow_exact_matches=False`). The global rate is computed the same way,
  so even the shrinkage prior uses no future data.
- **`time_split`** trains only on tasks due before the cutoff, so every
  training label already existed on the cutoff day.
- **`to_xy`** converts categorical columns to the pandas `category` dtype
  with the training vocabulary. A team created after the cutoff becomes
  missing, which LightGBM and XGBoost handle, instead of a new code the
  model never saw.
- Pandas 3 deprecates `DatetimeIndex.dayofweek`; `day_of_week` is the
  current name.

### A leakage test for features

```python
# ml/test_features.py: a point-in-time feature must not change when the future changes
import numpy as np
import pandas as pd

from features import build_features, load_tasks


def test_history_features_ignore_the_future():
    tasks = load_tasks()
    cut = pd.Timestamp("2025-09-01")
    future = tasks["completed_at"] >= cut
    flipped = tasks.assign(late=np.where(future, 1 - tasks["late"], tasks["late"]))

    before = build_features(tasks).set_index("task_id")
    after = build_features(flipped).set_index("task_id")
    created_before_cut = before["created_at"] < cut
    for col in ["done_before", "assignee_late_rate"]:
        pd.testing.assert_series_equal(before.loc[created_before_cut, col],
                                       after.loc[created_before_cut, col])
```

```text
$ pytest -q test_features.py
.                                                                        [100%]
1 passed in 0.83s
```

The test flips every label that became known after 1 September 2025 and
checks that no feature of a task created before that date moves. A leaky
"late rate over all tasks" fails it immediately: in a check against this
dataset it changed for 10,628 of the 10,715 earlier tasks. Run tests like
this in CI next to the training code.

### Baselines, LightGBM, and XGBoost on the same split

```python
# ml/train.py: time-based splits, two baselines, LightGBM, and XGBoost on the same features
import lightgbm as lgb
from sklearn.compose import make_column_transformer
from sklearn.dummy import DummyClassifier
from sklearn.inspection import permutation_importance
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, log_loss, roc_auc_score
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from xgboost import XGBClassifier

from features import CATEGORICAL, NUMERIC, build_features, load_tasks, time_split, to_xy

tasks = build_features(load_tasks())
train, val, test = time_split(tasks)
print(f"train {len(train)}, validation {len(val)}, test {len(test)}, "
      f"left out {len(tasks) - len(train) - len(val) - len(test)}")

FEATURES = NUMERIC + CATEGORICAL
(X_tr, y_tr), (X_va, y_va), (X_te, y_te) = (to_xy(d, train, FEATURES) for d in (train, val, test))

prior = DummyClassifier(strategy="prior").fit(X_tr, y_tr)
linear = make_pipeline(
    make_column_transformer((StandardScaler(), NUMERIC),
                            (OneHotEncoder(handle_unknown="ignore"), CATEGORICAL)),
    LogisticRegression(max_iter=1000),
).fit(X_tr, y_tr)

gbm = lgb.LGBMClassifier(n_estimators=2000, learning_rate=0.03, num_leaves=31,
                         min_child_samples=40, subsample=0.8, subsample_freq=1,
                         colsample_bytree=0.8, reg_lambda=1.0, random_state=42, verbose=-1)
gbm.fit(X_tr, y_tr, eval_X=X_va, eval_y=y_va, eval_metric="binary_logloss",
        callbacks=[lgb.early_stopping(100, verbose=False)])   # pandas category columns = categorical

xgb = XGBClassifier(n_estimators=2000, learning_rate=0.03, max_depth=5, min_child_weight=5,
                    subsample=0.8, colsample_bytree=0.8, reg_lambda=1.0, tree_method="hist",
                    enable_categorical=True, early_stopping_rounds=100, eval_metric="logloss",
                    random_state=42)
xgb.fit(X_tr, y_tr, eval_set=[(X_va, y_va)], verbose=False)
print(f"best iterations: LightGBM {gbm.best_iteration_}, XGBoost {xgb.best_iteration}")


def report(name, model, X, y):
    p = model.predict_proba(X)[:, 1]
    print(f"{name:31} ROC-AUC {roc_auc_score(y, p):.3f}   PR-AUC {average_precision_score(y, p):.3f}"
          f"   log loss {log_loss(y, p):.3f}")


for name, model in [("prior", prior), ("logistic regression", linear),
                    ("LightGBM", gbm), ("XGBoost", xgb)]:
    report(f"validation {name}", model, X_va, y_va)
report("test LightGBM (once)", gbm, X_te, y_te)

imp = permutation_importance(gbm, X_va, y_va, scoring="roc_auc", n_repeats=5, random_state=0)
ranked = sorted(zip(FEATURES, imp.importances_mean), key=lambda kv: -kv[1])
print("permutation importance (drop in validation ROC-AUC):")
print("  " + ", ".join(f"{name} {value:.3f}" for name, value in ranked[:6]))
```

```text
$ python train.py
train 15252, validation 4018, test 4081, left out 649
best iterations: LightGBM 154, XGBoost 147
validation prior                ROC-AUC 0.500   PR-AUC 0.332   log loss 0.638
validation logistic regression  ROC-AUC 0.715   PR-AUC 0.558   log loss 0.580
validation LightGBM             ROC-AUC 0.724   PR-AUC 0.590   log loss 0.561
validation XGBoost              ROC-AUC 0.725   PR-AUC 0.589   log loss 0.562
test LightGBM (once)            ROC-AUC 0.712   PR-AUC 0.531   log loss 0.559
permutation importance (drop in validation ROC-AUC):
  assignee_late_rate 0.089, pressure 0.041, days_to_due 0.041, priority 0.011, team 0.007, assignee_open_tasks 0.006
```

Reading the results:

- **The prior baseline** predicts the training late rate for everyone. Its
  ROC-AUC is 0.5 by definition and its PR-AUC equals the positive rate
  (0.332); every real model must beat those numbers.
- **Logistic regression is a strong baseline.** It reaches 0.715. Boosting
  adds a modest but consistent gain (PR-AUC 0.590 against 0.558) because it
  finds the pressure threshold and the priority-deadline interactions
  without hand-made features. On some datasets the linear model wins; you
  only know because you measured it.
- **LightGBM and XGBoost tie.** With equivalent settings, the choice is
  about ecosystem, speed, and team familiarity, not accuracy.
- **Early stopping chose about 150 trees** out of 2,000, at a learning rate
  of 0.03.
- **The test score is lower** than validation (0.712 against 0.724).
  Validation was used for early stopping, so it is slightly optimistic, and
  the test quarter differs from the validation quarter. The test number is
  the one to report.
- **Permutation importance** ranks the point-in-time assignee history
  first, then deadline pressure, matching how the data was generated. No
  single feature dominates suspiciously.

### Measuring what leakage does

```python
# ml/leakage.py: the same LightGBM model with an honest setup and three leaky ones
import lightgbm as lgb
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import train_test_split

from features import CATEGORICAL, NUMERIC, build_features, load_tasks, time_split, to_xy

HONEST = NUMERIC + CATEGORICAL


def auc(train, val, features, scored=None):
    """Fit on train, return validation ROC-AUC; `scored` replaces the inputs at prediction time."""
    X_tr, y_tr = to_xy(train, train, features)
    X_va, y_va = to_xy(val if scored is None else scored, train, features)
    model = lgb.LGBMClassifier(n_estimators=150, learning_rate=0.05, random_state=42, verbose=-1)
    model.fit(X_tr, y_tr)
    return roc_auc_score(val["late"], model.predict_proba(X_va)[:, 1])


tasks = build_features(load_tasks())
train, val, _ = time_split(tasks)
print(f"honest features, time split          {auc(train, val, HONEST):.3f}")

# 1. Target leakage: comment_count is the value at export time, after the task finished.
with_comments = HONEST + ["comment_count"]
print(f"+ comment_count from the export      {auc(train, val, with_comments):.3f}")
print(f"  same model, creation-time inputs   "
      f"{auc(train, val, with_comments, scored=val.assign(comment_count=0)):.3f}")

# 2. Leaky aggregate: each person's late rate over ALL their tasks, this one and future ones included.
tasks["late_rate_all"] = tasks.groupby("assignee")["late"].transform("mean")
train, val, _ = time_split(tasks)
print(f"+ late rate over all tasks           {auc(train, val, HONEST + ['late_rate_all']):.3f}")

# 3. A random split mixes months: the model is tested on the past it was trained around.
rand_train, rand_val = train_test_split(tasks, test_size=0.2, random_state=42)
print(f"honest features, random split        {auc(rand_train, rand_val, HONEST):.3f}")
```

```text
$ python leakage.py
honest features, time split          0.713
+ comment_count from the export      0.888
  same model, creation-time inputs   0.535
+ late rate over all tasks           0.751
honest features, random split        0.723
```

Each line is a mistake that happens in real projects:

- **Target leakage** looks spectacular (0.888) and collapses to 0.535 when
  the model receives what the API knows at creation: zero comments. The
  model learned "many comments means late", which is a consequence of
  lateness, not a predictor.
- **The all-tasks late rate** includes the row's own label and future
  outcomes, adding 0.038 of fake ROC-AUC.
- **The random split** estimates 0.723 where the honest time split gets
  0.713. The gap is small here because the synthetic rows are almost
  independent; with real drift, seasonality, and correlated rows it is
  often much larger.

## Best practices

- Write down the prediction time and the label time before choosing
  features; reject every feature not known at prediction time.
- Build history features point in time, and test them by changing the
  future and checking nothing earlier moves.
- Split the way the model will be used: by time for forecasts of the
  future, by group when entities repeat.
- Keep the test set for one final estimate; tune and early-stop on
  validation only.
- Always train a prior baseline and a regularized linear model next to the
  boosted trees, and report all three.
- Use a small learning rate, many trees, and early stopping; tune
  `num_leaves` or `max_depth` and the minimum leaf size first.
- Fix categorical vocabularies at training time and handle unseen values
  explicitly.
- Fit every preprocessing step inside a pipeline, on training data only.
- Check permutation importance on validation data; investigate any feature
  that dominates.
- Store the feature code with the model version, and compute features in
  production with the same code as in training.

## In production

- **The model was excellent offline and mediocre from day one.**
  *Detect:* production ROC-AUC or precision on the first labelled weeks is
  far below validation; one feature dominates importance. *Cause:* target
  leakage, such as a field measured after the prediction time or an
  aggregate that includes the label. *Fix:* audit every feature against the
  prediction time, rebuild aggregates point in time, add a leakage test, and
  retrain.
- **Predictions differ between the training notebook and the API.**
  *Detect:* the same task scored offline and online gets different
  probabilities; logged online features differ from recomputed ones.
  *Cause:* training-serving skew: features computed twice with different
  code, time zones, or defaults. *Fix:* one feature module used by both
  paths, logged features at prediction time, and a daily comparison job.
- **A new team breaks the model.**
  *Detect:* errors or odd scores for tasks from a team created after
  training. *Cause:* an unseen category mapped to an arbitrary code, or an
  encoder that raises on unknown values. *Fix:* fix the vocabulary at
  training time, map unknowns to missing or "other", and test the path.
- **Accuracy decays month by month.**
  *Detect:* rolling precision and calibration on newly labelled tasks drift
  down; input distributions shift. *Cause:* data or concept drift, such as
  a new workflow or seasonal load. *Fix:* monitor inputs and outcomes,
  retrain on a schedule with a time-based validation gate (see
  [production monitoring and drift](../mlops-and-model-lifecycle/production-monitoring-and-drift.md)).
- **Retraining quietly uses unfinished labels.**
  *Detect:* the newest training rows show a lower late rate than older
  ones. *Cause:* tasks not yet due are labelled "on time" by default.
  *Fix:* train only on rows whose label window has closed, as `time_split`
  does with the due date.
- **The model is slow or large in the API.**
  *Detect:* p99 latency or memory grows after deployment. *Cause:*
  thousands of deep trees, or rebuilding a pandas frame per request.
  *Fix:* early stopping, fewer leaves, batch scoring where possible, and
  predicting from a NumPy array or the native booster in the hot path.

## Important terminology

- **Tabular data:** Rows of entities with columns of typed facts.
- **Feature:** An input column the model learns from.
- **Label (target):** The value the model learns to predict.
- **Prediction time:** The moment the model is asked; features must be
  known then.
- **Point-in-time feature:** A feature computed only from data that existed
  at the prediction time.
- **Gradient boosting:** An additive model of trees, each fitted to the
  gradient of the loss at the current predictions.
- **Learning rate (shrinkage):** The factor applied to each new tree.
- **Early stopping:** Stopping training when the validation metric stops
  improving.
- **Leaf-wise growth:** Splitting the leaf with the best gain next
  (LightGBM); depth-wise growth splits level by level (XGBoost default).
- **Data leakage:** Information unavailable at prediction time reaching
  training or evaluation.
- **Target encoding:** Replacing a category with a statistic of the label;
  must be cross-fitted or point in time.
- **Permutation importance:** The drop in a metric when one feature's
  values are shuffled.
- **Training-serving skew:** Features computed differently in training and
  in production.

## Common mistakes and misconceptions

- "Deep learning is always better." On typical tabular data, boosted trees
  are usually stronger and far cheaper.
- Splitting time-ordered data randomly and trusting the score.
- Computing history aggregates over the whole dataset.
- Using columns from an export without asking when each value was written.
- Tuning on the test set, or looking at it after every change.
- Skipping the baseline, so nobody knows whether the model adds anything.
- Scaling or encoding all rows before splitting.
- Treating feature importance as causation.
- Training on rows whose labels are not final yet.

## Revision questions

1. What are the prediction time and the label time for TaskFlow's
   overdue-risk model, and why does each matter?
2. Why does `time_split` train only on tasks due before the cutoff instead
   of tasks created before it?
3. Explain gradient boosting in four steps. What does the learning rate
   trade off?
4. In the three-task example, round 1 predicts 4, 7, and 7 for actual hours
   2, 6, and 10. Tree 2 outputs -1.5, -1.5, and +3 and the learning rate is
   0.5. What are the new predictions and the squared error? (3.25, 6.25,
   8.5; 1.5625 + 0.0625 + 2.25 = 3.875.)
5. Name four kinds of data leakage and one prevention for each.
6. A feature gives ROC-AUC 0.89 offline, but the model scores 0.54 in
   production. What do you check first?
7. Map these LightGBM parameters to XGBoost: `num_leaves`,
   `min_child_samples`, `eval_X`, and early stopping.
8. Why can permutation importance spread credit between two correlated
   features?

## Further learning

- [LightGBM: Python API and LGBMClassifier](https://lightgbm.readthedocs.io/en/stable/pythonapi/lightgbm.LGBMClassifier.html)
- [LightGBM: Parameters tuning](https://lightgbm.readthedocs.io/en/stable/Parameters-Tuning.html)
- [XGBoost: Parameters](https://xgboost.readthedocs.io/en/stable/parameter.html)
  and [categorical data](https://xgboost.readthedocs.io/en/stable/tutorials/categorical.html)
- [scikit-learn: Common pitfalls and data leakage](https://scikit-learn.org/stable/common_pitfalls.html)
- [scikit-learn: Gradient boosting ensembles](https://scikit-learn.org/stable/modules/ensemble.html)
- [Google Machine Learning Crash Course: Overfitting](https://developers.google.com/machine-learning/crash-course/overfitting/overfitting)
- Next: [model evaluation and validation](model-evaluation-and-validation.md). Back to the [machine learning foundations overview](../machine-learning-foundations.md).
