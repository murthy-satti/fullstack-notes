# Machine Learning Foundations Cheat Sheet

Quick revision after the machine learning foundations lessons, before an
interview or a task.

## Key configuration

LightGBM 4.7 and XGBoost 3.4 through the scikit-learn API, November 2026:

| Concept | LightGBM (default) | XGBoost (default) |
|---|---|---|
| Trees and learning rate | `n_estimators` (100), `learning_rate` (0.1) | `n_estimators` (100), `learning_rate` (0.3) |
| Tree size | `num_leaves` (31), leaf-wise growth | `max_depth` (6), depth-wise growth |
| Minimum leaf size | `min_child_samples` (20) | `min_child_weight` (1, a hessian sum) |
| Categorical columns | pandas `category` dtype, automatic | pandas `category` with `enable_categorical=True` |
| Validation data | `fit(..., eval_X=..., eval_y=...)`; `eval_set` deprecated | `fit(..., eval_set=[(X, y)])` |
| Early stopping | `callbacks=[lightgbm.early_stopping(100)]` | `early_stopping_rounds=100` in the constructor |

```python
# ml/train.py and ml/calibration.py (core lines)
gbm.fit(X_tr, y_tr, eval_X=X_va, eval_y=y_va, eval_metric="binary_logloss",
        callbacks=[lgb.early_stopping(100, verbose=False)])
# scikit-learn 1.9: no cv="prefit"; freeze the trained model
calibrated = CalibratedClassifierCV(FrozenEstimator(weighted), method="isotonic").fit(X_va, y_va)
```

| Splitter | Use when |
|---|---|
| `StratifiedKFold` | Independent rows, classification; keeps the class ratio per fold |
| `GroupKFold`, `StratifiedGroupKFold` | Several rows per user, workspace, or document |
| `TimeSeriesSplit` (`gap`) | Order matters: forecasts, drift; expanding window |

## Decision guide

| If you need | Choose | Why |
|---|---|---|
| Predictions from rows and columns | A linear baseline, then LightGBM or XGBoost | Trees handle missing values, categories, and interactions |
| A model that predicts the future | Time-based split, test set touched once | A random split grades it on months it trained around |
| A score with rare positives | PR-AUC, plus precision and recall at the threshold | Accuracy and ROC-AUC flatter rare-positive models |
| A decision threshold | Costs or capacity, chosen on validation | 0.5 is rarely right; the threshold is part of the model |
| Probabilities used as numbers | Calibration on held-out data | Class weights and resampling inflate scores |
| A one-week forecast with holidays | Seasonal naive, then LightGBM on 168 h+ lags and calendar features | Direct strategy; holidays are known in advance |
| Alerts on one seasonal metric | Seasonal robust z-score | Removes the daily cycle; medians ignore past incidents |
| Alerts where combinations matter | Isolation forest on deseasonalized z-scores | Sees unusual combinations directly |
| Recommendations from a large catalog | Two-tower, CF, and content candidates, then a ranker | Cheap high-recall stage, then a precise one |
| Recommendations for new items | Content features, ID dropout, an exploration slot | CF cannot rank items nobody has used |

## Numbers and defaults to remember

| Item | Value |
|---|---|
| Precision, recall, F1 | TP / (TP + FP), TP / (TP + FN), 2TP / (2TP + FP + FN) |
| ROC-AUC | Chance a random positive outranks a random negative; random = 0.5 |
| PR-AUC (average precision) | Random baseline = positive rate |
| Accuracy trap | Always "not spam" scores 0.969 and catches nothing |
| Cost threshold (calibrated) | Flag when p > C_FP / (C_FP + C_FN); a miss = 25 reviews gives 1 / 26 = 0.038 |
| Calibration methods | Sigmoid, isotonic (more than about 1,000 samples), temperature (added in 1.8) |
| Noise in a metric | Test PR-AUC 0.374, 95% bootstrap 0.300-0.456 with 186 positives |
| MAE and RMSE | MAE: typical error, minimized by the median; RMSE: dominated by large errors |
| MASE | MAE / in-sample seasonal naive MAE; below 1 beats it (0.72 in the backtest) |
| Seasonal lag | 168 hours for hourly data with a weekly cycle |
| 80% forecast interval | LightGBM `objective="quantile"`, `alpha` 0.1 and 0.9; check about 80% coverage |
| Robust z-score | 0.6745 x (x - median) / MAD, spread estimated per hour of the day |
| Isolation forest | Up to 256 samples per tree; `contamination` = alarm budget |
| NDCG@k | Sum of hit / log2(rank + 1) over the ideal; one of two hits, at rank 3: 0.5 / 1.631 = 0.307 |
| Two-tower training | In-batch softmax, logit gradient (softmax - I) / B, subtract log(item frequency), 30% ID dropout |

## Top mistakes

- **Building features with future data.** Compute them point in time
  (`merge_asof`, strictly earlier outcomes) and test that flipping future
  labels changes nothing.
- **Splitting at random when the model predicts the future.** Split by
  time and report the test set once.
- **Reporting accuracy or ROC-AUC alone on rare positives.** Add PR-AUC,
  the base rate, and precision and recall at the chosen threshold.
- **Keeping the 0.5 threshold.** Pick it from costs or capacity on
  validation, version it, and revisit it when the base rate changes.
- **Trusting `predict_proba` after class weights.** Recalibrate on held-out
  data with `FrozenEstimator` and `CalibratedClassifierCV`.
- **Shuffled KFold with several rows per entity.** Use `GroupKFold`; on the
  same sessions, KFold said 0.958 and GroupKFold 0.725.
- **A rolling z-score on a seasonal metric.** Compare each point with the
  same slot on normal days, using the median and MAD.
- **Judging recommenders on recall alone.** Report NDCG, coverage, and
  new-item recall, and correct in-batch popularity bias with logQ.

## Where to go deeper

- [Tabular ML and gradient boosting](tabular-ml-and-gradient-boosting.md)
- [Model evaluation and validation](model-evaluation-and-validation.md)
- [Time series and anomaly detection](time-series-and-anomaly-detection.md)
- [Recommender systems](recommender-systems.md)
- [Interview questions and answers](interview-questions-and-answers.md)

Back to the [Machine learning foundations overview](../machine-learning-foundations.md).
