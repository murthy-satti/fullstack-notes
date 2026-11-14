# Machine Learning Foundations Interview Questions and Answers

These questions review tabular ML and gradient boosting, model evaluation
and validation, time series and anomaly detection, and recommender
systems. Try answering each one before reading the answer.

## Tabular ML and gradient boosting

### 1. Why are gradient-boosted trees the default for tabular data?

They handle mixed numeric and categorical features, missing values,
thresholds, and interactions without scaling or manual feature crosses,
and they train in seconds. Benchmarks such as Grinsztajn and others (2022)
found tree models still beat deep learning on typical medium-sized tabular
datasets. Neural networks win on images, audio, and text, and their
embeddings can become features for a tree model.

### 2. Explain gradient boosting in a few steps.

Start from a constant prediction (the mean, or the log-odds of the
positive rate). Compute the gradient of the loss for every row at the
current predictions; for squared error that is the residual. Fit a small
tree to those gradients, add it scaled by the learning rate, and repeat
until the validation loss stops improving. The final model is the sum of
all trees.

### 3. What does the learning rate trade off, and how do you set the number of trees?

A smaller learning rate takes smaller steps, so it needs more trees but
usually generalizes better. The standard recipe is a small rate (0.01 to
0.1), a large `n_estimators`, and early stopping on a validation set, which
picks the number of trees automatically.

### 4. What is the difference between LightGBM's and XGBoost's tree growth?

LightGBM grows trees leaf-wise (best-first): it always splits the leaf with
the largest gain, controlled by `num_leaves`, which converges fast but can
overfit, so keep `num_leaves` below `2^max_depth` and raise
`min_child_samples`. XGBoost grows depth-wise by default (`max_depth`, 6 by
default), with a leaf-wise `grow_policy="lossguide"` option.

### 5. How do you pass validation data and early stopping in LightGBM 4.7 and XGBoost 3.4?

```python
# LightGBM 4.7: eval_X / eval_y (eval_set still works but is deprecated)
gbm.fit(X_tr, y_tr, eval_X=X_va, eval_y=y_va,
        callbacks=[lightgbm.early_stopping(100, verbose=False)])
# XGBoost: early stopping is a constructor argument
xgb = XGBClassifier(early_stopping_rounds=100, eval_metric="logloss", enable_categorical=True)
xgb.fit(X_tr, y_tr, eval_set=[(X_va, y_va)], verbose=False)
```

Both use the best iteration automatically when predicting.

### 6. How should categorical features be handled?

For linear models, one-hot encode them. LightGBM uses pandas `category`
columns natively; XGBoost does with `enable_categorical=True`. Fix the
category vocabulary at training time so unseen values become missing
instead of a code the model never saw. For high-cardinality IDs, prefer
point-in-time aggregates or cross-fitted target encoding.

### 7. What is a point-in-time feature?

A feature computed only from data that existed at the prediction time. For
TaskFlow's overdue-risk model, an assignee's late rate must use only tasks
completed before the new task was created, for example with
`pandas.merge_asof(..., allow_exact_matches=False)`. A late rate over all
tasks includes the row's own label and future outcomes.

### 8. What is data leakage? Give four kinds.

Information unavailable at prediction time reaching training or
evaluation. Target leakage (a field written after the event, such as an
export-time comment count), aggregate leakage (statistics that include the
label or the future), temporal leakage (random splits of time-ordered
data), group leakage (the same user or template on both sides), plus
preprocessing fitted on all rows and duplicates across splits.

### 9. How can you test a feature pipeline for leakage?

Change the future and check that nothing earlier moves. For example, flip
every label known after a date, rebuild the features, and assert that the
features of rows created before that date are identical. A leaky "late
rate over all tasks" fails immediately. Run the test in CI.

### 10. Why does the training set use tasks due before the cutoff rather than created before it?

Because a task created on 28 December and due on 20 January has no label on
1 January. Training only on rows whose label window has closed reproduces
what a real retraining run on the cutoff day could see; otherwise you train
on outcomes from the future or on wrongly defaulted labels.

### 11. Why keep a logistic regression baseline next to boosted trees?

It shows whether the extra complexity pays. On the TaskFlow data the linear
model reached ROC-AUC 0.715 against 0.724 for LightGBM; boosting won
modestly because it found thresholds and interactions automatically. On
some datasets the linear model wins, and you only know by measuring.

### 12. Split importance, gain importance, or permutation importance?

Split and gain importance are cheap but computed on training data and
biased towards high-cardinality features. Permutation importance shuffles
one column of the validation set and measures the metric drop, so it shows
what the model needs on unseen data, though correlated features share
credit. SHAP explains individual predictions. None of them proves
causation.

### 13. Why does the test score often come out below validation?

Validation was used for early stopping and tuning, so it is slightly
optimistic, and the test period may differ (drift, seasons). The test set
is touched once, and its number is the one to report.

## Model evaluation and validation

### 14. Why is accuracy misleading for rare events?

With 3% spam, predicting "not spam" for everyone scores 96.9% accuracy and
catches nothing. Accuracy is dominated by the majority class. Use
precision, recall, PR-AUC, or a cost at a chosen threshold, and always
report the base rate.

### 15. Define precision, recall, and F1, and compute them.

Precision = TP / (TP + FP); recall = TP / (TP + FN); F1 = 2TP / (2TP + FP +
FN). If a model flags 238 signups, 86 of them spam, and there are 186 spam
signups in total: precision 86 / 238 = 0.361, recall 86 / 186 = 0.462, F1
172 / 424 = 0.406.

### 16. What does ROC-AUC mean, and when does it mislead?

The probability that a random positive is scored above a random negative;
0.5 is random. It uses the false positive rate, whose denominator is all
negatives, so with rare positives many false alarms still look like a small
rate. The TaskFlow spam model scored ROC-AUC 0.90 but PR-AUC 0.37.

### 17. What is PR-AUC, and what is its baseline?

The area under the precision-recall curve, usually computed as average
precision. Its random baseline is the positive rate (0.031 for the spam
data), not 0.5. It reflects how useful the flags are when positives are
rare.

### 18. How do you choose a decision threshold?

On validation data, from costs or capacity, then report it once on the
test set. For calibrated probabilities, flag when `p > C_FP / (C_FP +
C_FN)`; with a miss costing 25 reviews that is 1/26 = 0.038. Alternatives:
fixed recall or precision, or the top k a review team can handle. Version
the threshold with the model.

### 19. MAE or RMSE?

MAE is the typical error in the target's units, robust to outliers, and
minimized by the median. RMSE squares errors, so large misses dominate; it
is minimized by the mean. In the task-hours example, 2% of forgotten tasks
made every model's RMSE about 21 while MAE still separated them (4.69 for
an L1-trained model against 5.60 for the user's estimate).

### 20. Why avoid MAPE in some cases?

It divides by the actual value, so it explodes near zero and is undefined
at zero, and it penalizes over-prediction more than under-prediction. Use
MAE, or MASE for comparing series of different scales.

### 21. What baselines should every model beat?

The majority class or class prior (classification), the mean or median
(regression), a domain rule (the user's own estimate), and the model
currently in production. scikit-learn's `DummyClassifier` and
`DummyRegressor` provide the trivial ones.

### 22. Which cross-validation splitter should you use?

`StratifiedKFold` for independent rows; `GroupKFold` or
`StratifiedGroupKFold` when users, workspaces, or documents repeat across
rows; `TimeSeriesSplit` when order matters. On session data with eight
rows per workspace, shuffled KFold reported ROC-AUC 0.958 and GroupKFold
0.725 on the same data.

### 23. What is nested cross-validation?

An inner cross-validation loop tunes hyperparameters, and an outer loop
estimates the performance of the whole tuning procedure. Without it, the
score of the folds you tuned on is optimistic. A separate untouched test
set serves the same purpose.

### 24. How do you know whether a difference between two models is real?

Use the same folds, look at the fold-to-fold spread, and compute a
bootstrap confidence interval on the test set. With 186 positives, the
spam model's test PR-AUC of 0.374 had a 95% interval of 0.300 to 0.456, so
a 0.01 gain is noise.

### 25. What is calibration, and how do you measure it?

Agreement between predicted probabilities and observed frequencies. Plot a
reliability diagram (`calibration_curve`), and compute the Brier score, log
loss, expected calibration error, and the mean prediction against the base
rate. It matters whenever a probability is used as a number: cost
thresholds, risk shown to users, expected value.

### 26. How do you calibrate a model in scikit-learn 1.9?

Fit `CalibratedClassifierCV` on held-out data. For an already-trained
model, wrap it in `FrozenEstimator`; the old `cv="prefit"` option is gone.
Methods: `"sigmoid"` (Platt), `"isotonic"` (needs more than about 1,000
samples), and `"temperature"` (added in 1.8). Calibration keeps the ranking,
so it fixes probabilities, not a weak model.

```python
# calibrate an already-trained model on held-out validation data
from sklearn.calibration import CalibratedClassifierCV
from sklearn.frozen import FrozenEstimator

calibrated = CalibratedClassifierCV(FrozenEstimator(model), method="isotonic").fit(X_va, y_va)
```

### 27. What do class weights and resampling do to probabilities?

They shift the decision boundary towards the rare class and inflate
predicted probabilities. With `scale_pos_weight` 31.3, the spam model's mean
prediction rose to 0.156 for a 3.1% spam rate while ROC-AUC stayed at 0.898.
Recalibrate afterwards, resample only training data, or simply move the
threshold.

## Time series and anomaly detection

### 28. What are trend, seasonality, and calendar effects?

Trend is a long-term change in level; seasonality is a pattern with a fixed
period (busy afternoons, quiet weekends); calendar effects are known events
such as holidays. Holidays are known in advance, so they belong in the
model as future inputs, not in the noise.

### 29. Why is the seasonal naive forecast so strong, and when does it fail?

For hourly traffic with a weekly cycle, the value 168 hours ago is the same
hour on the same weekday, which captures most of the pattern for free. It
fails when the calendar changes: it predicted a normal Monday on a
holiday, then copied the holiday dip into the following Monday.

### 30. What is the direct strategy, and what lags can it use?

It predicts every step of the horizon from information known at the
origin. To forecast a full week at once, every lag must be at least 168
hours old. The recursive alternative feeds predictions back as inputs and
compounds its errors.

### 31. Why predict a ratio instead of the raw value with tree models?

Trees cannot extrapolate beyond the target values seen in training, so a
growing series drifts out of range. Predicting this hour divided by its
four-week mean keeps the target stable and lets the level come from the
recent data.

### 32. How do you backtest a forecast?

From several rolling origins: train on everything before an origin,
forecast the real horizon, score it, move the origin, repeat. Average the
errors and inspect the worst origin. Every lag and window must end before
the origin. In the TaskFlow example, LightGBM averaged MAE 57.6 against
119.4 for seasonal naive, winning mostly in the holiday weeks.

### 33. What is MASE?

The MAE divided by the in-sample MAE of a naive forecast (seasonal naive for
seasonal data). Values below 1 mean better than the naive method, on any
scale. An MAE of 57.6 against an in-sample seasonal naive MAE of 80 gives
MASE 0.72.

### 34. How do you produce and check prediction intervals?

Train quantile models (LightGBM `objective="quantile"`, `alpha=0.1` and
`0.9` for an 80% interval) or use conformal methods on backtest errors.
Check coverage: about 80% of actual values should fall inside. The example
covered 72-82% per fold.

### 35. Point, contextual, and collective anomalies?

A point anomaly is extreme on its own (6% errors). A contextual anomaly is
normal at another time (afternoon traffic at 03:00). A collective or
multivariate anomaly only shows across metrics or periods (normal traffic
and errors, but latency triples at night).

### 36. Why does a rolling z-score raise false alarms on metrics with a daily cycle?

It compares each point with the previous hour, so every morning ramp and
evening drop looks unusual, and slow drifts become the new normal. In the
example it caught all four incidents but raised 19 false alarms in a week.

### 37. What is a seasonal robust z-score?

Compare each point with the median of the same time slot on normal days,
then divide the gap by a robust spread: the median absolute deviation,
scaled by 0.6745 and estimated per hour of the day. Medians resist past
incidents. It caught all four incidents with 5 false alarms.

### 38. How does an isolation forest work, and what are its pitfalls?

Random trees split random features at random values; anomalies, being few
and different, are isolated after few splits, so a short average path
means a high score. Each tree samples up to 256 points. Pitfalls:
`contamination` sets the alarm budget, raw seasonal metrics confuse it, and
scores saturate beyond the training range, so a forest fitted on a quiet
week missed a huge error spike that a forest refitted on the window
caught.

## Recommender systems

### 39. Explicit versus implicit feedback?

Explicit feedback is stated (ratings); implicit is behaviour (used,
opened, completed). Implicit data is plentiful but positive-only: an
unused item may be unwanted or simply unseen. So recommenders sample
negatives and evaluate by ranking, not accuracy.

### 40. Why do large recommenders use two stages?

Scoring every item with a rich model is too slow. Candidate generation
(two-tower plus ANN, item-item CF, popularity, content) cheaply finds a few
hundred items with high recall; a ranking model with many features orders
them; re-ranking applies rules such as permissions, diversity, and
freshness.

### 41. How does item-item collaborative filtering work?

Compute the cosine similarity between item columns of the user-item
matrix: items used by the same users are similar. Score each candidate by
its summed similarity to the user's history. It is explainable ("because
you used Sprint board") and easy to precompute, but blind to new items.

### 42. What does matrix factorization learn?

Low-dimensional user and item factors whose products approximate the
user-item matrix. The factors capture hidden patterns, such as a way of
working, that no item text describes. Methods include truncated SVD, ALS
weighted for implicit feedback, and BPR.

### 43. Strengths and weaknesses of content-based filtering?

It uses item features (text, tags, embeddings) and a user profile built
from used items, so it recommends new items from day one and explains
itself. But it finds only more of the same and cannot see quality or
patterns the text does not express. In the example it scored recall@10
0.077 against 0.113 for item-item CF, but was the only classic method with
any new-item recall.

### 44. What is a two-tower model, and why does it serve well?

A user tower and an item tower each produce an embedding; the score is
their dot product. Because the towers meet only at the dot product, item
embeddings are computed offline and stored in an ANN index, and only the
user embedding is computed per request.

### 45. What are in-batch negatives, and what bias do they introduce?

Each training pair uses the other items in the batch as negatives, with a
softmax over the batch. Popular items appear in many batches, so they are
over-penalized as negatives. Subtracting each item's log sampling frequency
from its logit (the logQ correction) removes the bias.

### 46. What is ID dropout, and why did it help?

Hiding the item ID embedding for a share of training examples (30% in the
example) so the content path learns to predict alone, which is what new
items need. It also regularized the model: recall@10 rose from 0.088 to
0.164 and new-item recall from 0.002 to 0.106, even though training loss
went up.

### 47. Why must the target item be removed from the user features in training?

Otherwise the user tower sees the answer in the history and learns to look
it up. At serving time the target is never in the history, so the model
fails. It is the recommender version of target leakage.

### 48. Which offline metrics do you use for a recommender?

Recall@k (held-out items found in the top k), NDCG@k (recall weighted by
position), MRR, and coverage, novelty, and diversity as guardrails. Split
by time (hold out each user's latest interactions), exclude already-used
items, and report cold-start segments separately.

### 49. Why do offline recommender gains often shrink online?

Exposure bias: logs only contain items the old system showed. Feedback
loops: models train on their own recommendations. And offline metrics may
not track adoption. Use temporal splits, keep exploration traffic, and
confirm with an A/B test on an agreed metric.

### 50. How do you handle cold start?

New items: content features or embeddings, ID dropout, and a guaranteed
exploration slot. New users: popular items for their context, an
onboarding question, and session signals from the first clicks. A new
system: popularity and rules first, with impression logging from day one.

## Scenario-based questions

### 51. The overdue-risk model scored ROC-AUC 0.89 offline and 0.54 on its first labelled weeks. What happened?

**What to check first:** the features with the highest importance, and when
each value is written.

**How to confirm:** score the validation set with the values the API knows
at creation time; if the score collapses, a feature came from the future.

**Likely causes and fixes:** target leakage, such as an export-time
`comment_count`, or an aggregate that includes the label. Rebuild features
point in time, add a leakage test, and retrain. See
[tabular ML and gradient boosting](tabular-ml-and-gradient-boosting.md).

### 52. The same task gets different scores in the notebook and in the API. Why?

**What to check first:** the logged online features against features
recomputed offline for the same task.

**How to confirm:** diff them column by column; look for time zones,
defaults, category codes, and missing-value handling.

**Likely causes and fixes:** training-serving skew from two feature
implementations. Use one feature module in both paths, log features at
prediction time, and compare daily. See
[tabular ML and gradient boosting](tabular-ml-and-gradient-boosting.md).

### 53. After retraining, the newest rows show a suspiciously low late rate. What is wrong?

**What to check first:** how labels are assigned to tasks that are not yet
due.

**How to confirm:** compare the label distribution by creation month;
recent months will look "better".

**Likely causes and fixes:** unfinished label windows defaulted to "on
time". Train only on rows whose label is final, for example tasks due
before the cutoff. See
[tabular ML and gradient boosting](tabular-ml-and-gradient-boosting.md).

### 54. The spam model's flags are mostly wrong and the review queue keeps growing. What do you do?

**What to check first:** precision at the current threshold on recent
labelled data, and the base rate.

**How to confirm:** recompute the confusion matrix for the last weeks;
compare with the validation numbers used to pick the threshold.

**Likely causes and fixes:** a threshold chosen with accuracy or ROC-AUC,
or a base-rate change. Choose the threshold from costs or review capacity,
and monitor precision weekly. See
[model evaluation and validation](model-evaluation-and-validation.md).

### 55. "80% risk" scores turn out to be spam far less than 80% of the time. Why?

**What to check first:** whether class weights or resampling were used, and
the mean prediction against the observed rate.

**How to confirm:** a reliability diagram and ECE on recent held-out data.

**Likely causes and fixes:** reweighting inflated the probabilities, or
drift since calibration. Calibrate with `CalibratedClassifierCV` on
held-out data (sigmoid, isotonic, or temperature) and monitor calibration.
See [model evaluation and validation](model-evaluation-and-validation.md).

### 56. A model won cross-validation by a wide margin but lost the A/B test. What went wrong?

**What to check first:** the cross-validation splitter and whether tuning
used the same folds that were reported.

**How to confirm:** rerun with `GroupKFold` by user or workspace, or
`TimeSeriesSplit`, and with a clean test set.

**Likely causes and fixes:** group or time leakage in the folds,
optimistic tuning, or an offline metric unrelated to the product goal. Use
the right splitter, nested CV or a held-out test set, and agree the online
metric in advance. See
[model evaluation and validation](model-evaluation-and-validation.md).

### 57. Task-duration MAE is stable, but users complain about wildly wrong estimates. Why?

**What to check first:** the distribution of absolute errors, not just its
mean.

**How to confirm:** p90 and p99 absolute error, and RMSE, by segment.

**Likely causes and fixes:** a heavy tail that MAE averages away, often
from mislabelled targets (tasks left open for weeks). Report percentiles
and RMSE next to MAE, and fix the label upstream. See
[model evaluation and validation](model-evaluation-and-validation.md).

### 58. The capacity forecast was badly wrong on a public holiday and the week after. What do you change?

**What to check first:** whether the model has holiday and "holiday last
week" features, and backtest errors around past holidays.

**How to confirm:** compare a seasonal naive forecast and the model on the
holiday week and the following week.

**Likely causes and fixes:** seasonal lags copying the wrong pattern.
Add holiday features from a regional calendar, a feature for holidays one
season ago, and a backtest origin on every holiday. See
[time series and anomaly detection](time-series-and-anomaly-detection.md).

### 59. The forecast stays too low for days after a successful launch. Why?

**What to check first:** the sign of recent errors and the features that
describe the level.

**How to confirm:** errors have the same sign every day since the launch.

**Likely causes and fixes:** lags and rolling means still describe the old
level. Model a ratio to a short recent level, add a changepoint feature,
or restart the history at the break. See
[time series and anomaly detection](time-series-and-anomaly-detection.md).

### 60. The anomaly detector pages the on-call engineer every morning. What do you fix?

**What to check first:** the time of day of the alerts and the baseline
the detector uses.

**How to confirm:** alerts cluster at the same hour on normal days.

**Likely causes and fixes:** a rolling or global baseline that ignores the
daily cycle. Use seasonal baselines per time slot with a spread estimated
per hour, a minimum duration, and route new detectors to tickets until the
false alarm rate is known. See
[time series and anomaly detection](time-series-and-anomaly-detection.md).

### 61. A huge error spike did not trigger the isolation forest. Why?

**What to check first:** what data the forest was fitted on and its
`contamination`.

**How to confirm:** compare the spike's score with the most extreme points
in the training data.

**Likely causes and fixes:** scores saturate beyond the training range, so
a forest fitted on a quiet week cannot rank a far-out spike above its own
edge cases. Refit on a sliding window, pair the forest with per-metric
robust z-scores, and replay past incidents in tests. See
[time series and anomaly detection](time-series-and-anomaly-detection.md).

### 62. Newly published templates never appear in recommendations. What do you do?

**What to check first:** whether the item side has content features, and
new-item recall offline.

**How to confirm:** count impressions for items published in the last
month; offline new-item recall near zero confirms it.

**Likely causes and fixes:** an ID-only model. Add content features to the
item tower, train with ID dropout, and reserve an exploration slot for
fresh items. See [recommender systems](recommender-systems.md).

### 63. Everyone sees the same few templates. How do you fix the popularity bias?

**What to check first:** catalog coverage and the share of impressions
going to the top 1% of items.

**How to confirm:** coverage fell after a model change, and the model was
trained with in-batch negatives but no frequency correction.

**Likely causes and fixes:** popularity bias reinforced by a feedback loop.
Apply the logQ correction, add diversity re-ranking and exploration, and
track coverage as a guardrail metric. See
[recommender systems](recommender-systems.md).

### 64. A user was recommended a document they cannot open. What failed?

**What to check first:** where permissions are applied in the
recommendation pipeline.

**How to confirm:** trace the request: the item came from a global
candidate source and no filter removed it.

**Likely causes and fixes:** candidate generation without permission
filtering. Filter by access rights in retrieval and again before
rendering, test that path, and audit logs for exposures. See
[recommender systems](recommender-systems.md).

## Further learning

- [Machine learning foundations overview](../machine-learning-foundations.md)
- [Tabular ML and gradient boosting](tabular-ml-and-gradient-boosting.md) ·
  [Model evaluation and validation](model-evaluation-and-validation.md) ·
  [Time series and anomaly detection](time-series-and-anomaly-detection.md) ·
  [Recommender systems](recommender-systems.md)
- [scikit-learn: Common pitfalls and data leakage](https://scikit-learn.org/stable/common_pitfalls.html)
- [scikit-learn: Metrics and scoring](https://scikit-learn.org/stable/modules/model_evaluation.html)
- [LightGBM: Parameters tuning](https://lightgbm.readthedocs.io/en/stable/Parameters-Tuning.html)
- [Google Machine Learning: Recommendation systems](https://developers.google.com/machine-learning/recommendation/overview/types)
