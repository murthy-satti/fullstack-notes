# Recommender Systems

A recommender system chooses, for one user at one moment, a short list
from a catalog too large to browse: the videos on a home page, the
products under "customers also bought", or, in TaskFlow, the project
templates offered when someone starts a new project. This lesson builds
that TaskFlow template recommender from simple to modern.

It covers implicit feedback, the two-stage retrieval and ranking
architecture, collaborative filtering (item-item similarity and matrix
factorization), content-based filtering, embedding-based retrieval with a
two-tower model trained from scratch in NumPy, offline evaluation with
recall@k and NDCG, and the cold-start problem for new items and new users.
Embedding models and vector indexes are covered in depth in
[vector databases and indexes](../embeddings-and-vector-search/vector-databases-and-indexes.md).

## Why it matters

Recommendations decide what users discover. For TaskFlow, a good template
suggestion gets a team productive in minutes and spreads the templates
that work; a bad one teaches users to ignore the panel. The same
techniques power "related tasks", "suggested assignees", and "docs you may
need" in the project-knowledge assistant.

Recommenders also fail in characteristic ways that are easy to miss
offline: they recommend only what is already popular, never surface new
items, trap users in more of the same, and train on their own output.
Knowing the mechanics (what each method can and cannot see) is how you
avoid shipping a system that looks accurate on a dashboard and feels stale
to users.

## Real-world usage

- **YouTube: two stages.** Covington, Adams, and Sargin,
  [Deep Neural Networks for YouTube Recommendations](https://research.google/pubs/deep-neural-networks-for-youtube-recommendations/)
  (RecSys 2016), describe one of the largest recommenders in industry,
  split according to the classic two-stage information retrieval
  dichotomy: a deep candidate generation model, then a separate deep
  ranking model.
- **YouTube: two-tower retrieval and sampling bias.** Yi and others,
  [Sampling-Bias-Corrected Neural Modeling for Large Corpus Item Recommendations](https://research.google/pubs/sampling-bias-corrected-neural-modeling-for-large-corpus-item-recommendations/)
  (RecSys 2019), train two-tower networks with in-batch negatives, show
  that the batch loss is biased against popular items under a power-law
  item distribution, correct it with streaming item-frequency estimates,
  and deploy the result to retrieve from tens of millions of videos.
- **Amazon.** Smith and Linden,
  [Two Decades of Recommender Systems at Amazon.com](https://www.amazon.science/publications/two-decades-of-recommender-systems-at-amazon-com)
  (IEEE Internet Computing, 2017), revisit their original article on
  Amazon's recommendations and how the approach changed as the store
  grew.
- **Implicit feedback.** Hu, Koren, and Volinsky,
  [Collaborative Filtering for Implicit Feedback Datasets](http://yifanhu.net/PUB/cf.pdf)
  (ICDM 2008), point out that clicks and views carry no negative feedback
  (a user who never watched a show may simply not know it) and treat
  observations as preferences with varying confidence, in a system that
  recommended television shows.
- **Cold start by design.** Volkovs, Yu, and Poutanen,
  [DropoutNet: Addressing Cold Start in Recommender Systems](https://papers.nips.cc/paper_files/paper/2017/hash/dbd22ba3bd0df8f385bdac3e9f8be207-Abstract.html)
  (NIPS 2017), show that neural recommenders can be trained explicitly for
  cold start by applying dropout to the preference inputs, so content
  features learn to stand in for missing history.

**Popular tools and providers:** scikit-learn and SciPy sparse matrices for
baselines, the `implicit` library (ALS and BPR), LightFM, TensorFlow
Recommenders and TorchRec for two-tower and ranking models, LightGBM's
`LGBMRanker` for learning to rank, FAISS, ScaNN, and vector databases for
approximate nearest-neighbour retrieval; managed options include Amazon
Personalize and Google Cloud's AI Commerce Search (formerly Vertex AI
Search for commerce), which covers product recommendations as well as
search.

## How it works

### Feedback: explicit and implicit

**Explicit feedback** (stars, thumbs) says what users think but is rare.
**Implicit feedback** (used, opened, starred, completed, dwell time) is
plentiful but one-sided: an unused template may be unwanted or simply
unseen. TaskFlow records "team created a project from this template", a
strong positive signal. Everything else is unknown, not negative, which is
why recommenders sample negatives and evaluate by ranking rather than by
classification accuracy.

### Two stages: retrieval, then ranking

A large catalog cannot be scored with an expensive model for every
request. Production recommenders work in stages:

![Diagram: the two-stage recommender architecture for TaskFlow templates. A catalog of 600 templates (millions in large systems) feeds four candidate generators in parallel: a two-tower model with approximate nearest-neighbour search over a user embedding, item-item collaborative filtering for templates used together, content similarity, and popular templates in the user's topics. They merge into a few hundred de-duplicated candidates. A ranking model with rich features such as recency, team, and context scores them; a re-ranking step removes templates already used, applies permissions, adds diversity and freshness, and shows the top 10. Impressions and clicks flow back as training data. Candidate generation is cheap with high recall; ranking is expensive and precise.](recsys-two-stage.svg)

| Stage | Job | Typical method | Measured by |
|---|---|---|---|
| Candidate generation (retrieval) | Find a few hundred plausible items fast | Two-tower plus ANN, item-item CF, popularity, content | Recall@k |
| Ranking | Order the candidates precisely | Gradient-boosted trees or neural rankers with many features | NDCG, AUC, online metrics |
| Re-ranking | Apply product rules | Filters, diversity, freshness, business constraints | Guardrail metrics |

Retrieval only needs to keep the right items in the candidate set;
ranking spends its feature budget on a few hundred items instead of the
whole catalog. For a catalog of 600 templates TaskFlow could score
everything, but the structure is the same at a million items.

### Collaborative filtering

**Collaborative filtering (CF)** recommends from behaviour alone: users who
used the same things in the past will want similar things next.

- **Item-item CF:** compute the similarity between items from the users
  who used both (cosine similarity between columns of the user-item
  matrix), then score each item by its summed similarity to the user's
  history. It is simple, explainable ("because you used Sprint board"), and
  easy to precompute.
- **Matrix factorization:** approximate the sparse user-item matrix as the
  product of a user-factor matrix and an item-factor matrix with a few
  dozen dimensions. Each factor captures a hidden pattern, such as "teams
  that run formal sprints", that no text describes. Methods include
  truncated SVD, alternating least squares weighted for implicit feedback,
  and BPR.

![Diagram: collaborative filtering compared with content-based filtering. Left, a user-item matrix with users Ana, Ben, Chen, and Dev and templates Sprint, Bug, Launch, SEO, and New. Ana and Ben both used Sprint and Bug, so Dev, who used Sprint, is offered Bug without reading any text; the New template has no usage yet, so collaborative filtering cannot rank it. Right, content-based filtering builds a user profile from the average text of the templates Dev used and compares it by cosine similarity with each item's text, including a brand-new Release checklist; it works for new items but finds more of the same and misses what text cannot express.](cf-vs-content.svg)

CF's blind spots are the reverse of its strengths: it knows nothing about
an item until people use it (**item cold start**), nothing about a user
without history (**user cold start**), and it amplifies whatever is
already popular.

### Content-based filtering

**Content-based filtering** describes items by their own features (title,
tags, topic, category, author, embeddings of the description) and builds
each user's profile from the items they used. Scoring is a similarity
between the profile and each item. It handles new items from day one and
can explain itself ("matches your engineering templates"), but it only
finds more of what the user already did, and it cannot see what the text
does not say: two "Sprint board" templates may differ completely in
quality.

**Hybrids** combine both: blend scores, use content features inside a
factorization model, or let a neural model learn from IDs and content
together. The two-tower model below is one such hybrid.

### Embedding-based retrieval and the two-tower model

A **two-tower model** has a user (query) tower and an item (candidate)
tower. Each maps its inputs to an embedding of the same size, and the
score is their dot product. Because the towers do not interact until that
dot product, item embeddings can be computed offline, stored in an
approximate nearest-neighbour index, and searched in milliseconds with the
user embedding computed at request time.

![Diagram: a two-tower retrieval model. The user tower takes the templates a user used, as a multi-hot vector, and their average text, and a linear layer produces a 32-number user embedding. The item tower takes a template's TF-IDF text plus a learned ID embedding and produces an item embedding of the same size. The score is the dot product. Training uses a softmax over each batch, so the other items in the batch act as negatives, subtracts the log of each item's frequency, and hides the ID embedding for 30 percent of examples. Offline, every item is embedded, new items from text alone, and loaded into an approximate nearest-neighbour index; at request time the user embedding is computed from fresh history and the index returns the top 100 candidates.](two-tower-model.svg)

Training details that matter:

- **In-batch negatives.** Each training example is a (user, item) pair
  that happened. The other items in the same batch serve as negatives, and
  a softmax over the batch is the loss. It is cheap and works well.
- **Sampling-bias correction.** Popular items appear in many batches, so
  they are used as negatives far more often than rare ones and get pushed
  down. Subtracting `log(frequency)` of each item from its logit during
  training (the "logQ correction") removes that bias.
- **ID embeddings and cold start.** A learned ID embedding per item
  captures what content cannot, but new items have none. Training some
  examples with the ID hidden (ID dropout) teaches the content path to
  carry the prediction alone, which is what new items need.
- **No leakage from the target.** The user features for a training pair
  must not include the target item itself.

Serving is a vector search: see
[vector databases and indexes](../embeddings-and-vector-search/vector-databases-and-indexes.md)
for HNSW and IVF indexes, recall trade-offs, and filtering. Text
embeddings from a modern embedding model can replace TF-IDF as item
features without changing the architecture.

### Ranking

The ranking stage scores a few hundred candidates with a richer model,
often gradient-boosted trees trained with a learning-to-rank objective
(LightGBM's `LGBMRanker` with `objective="lambdarank"`) or a neural model.
It can use features retrieval cannot afford: how recently the team used a
similar template, the project's size, the time of year, the candidate's
retrieval scores from each source, and its historical click rate in this
position. Labels come from logged impressions: shown and used, shown and
ignored.

### Evaluation

**Offline**, hold out each user's most recent interactions, recommend from
the rest, and check whether the held-out items appear near the top.

| Metric | Measures | Note |
|---|---|---|
| Recall@k | Share of held-out items found in the top k | The main retrieval metric |
| Precision@k | Share of the top k that were held-out items | Bounded by how many items are held out |
| NDCG@k | Recall weighted by position (higher is better) | Rewards putting hits at the top |
| MRR | Average of 1 / rank of the first hit | When one good item is enough |
| Coverage | Share of the catalog ever recommended | Low values mean popularity bias |
| Novelty and diversity | How unpopular or varied the lists are | Guardrails against "more of the same" |

![Diagram: how the recommenders were evaluated and how they scored. Each user's templates are ordered in time; the earlier ones are training data and the last two are the test. Recall at 10 is the share of the two held-out templates found in the top 10; new-item recall is the same for 60 templates absent from training. Results: most popular 0.019 and 0; item-item collaborative filtering 0.113 and 0; matrix factorization 0.106 and 0; content-based 0.077 and 0.079; a two-tower model relying on IDs only 0.088 and 0.002; and the two-tower model with ID dropout and popularity correction 0.164 and 0.106, best on both.](recsys-evaluation.svg)

Split by time, not at random: a random split lets the model see a user's
future to predict their past. Exclude items the user already has from the
candidates, compare everything against a popularity baseline, and report
cold-start segments separately.

**Online**, the real measure is behaviour: click-through and adoption rate
of recommended templates, projects that stay active, and longer-term
retention, compared in an A/B test. Offline gains often shrink online
because offline data only contains items the old system showed
(**exposure bias**), and a model trained on its own recommendations keeps
reinforcing them (**feedback loops**). Keep a small share of traffic for
exploration (random or diverse candidates) so the logs contain evidence
about items the current model would never show.

### Cold start

| Case | What is missing | Strategies |
|---|---|---|
| New item | Interaction history | Content features or embeddings, ID dropout in training, a guaranteed exploration slot, editorial picks |
| New user | History | Popular items in the user's context (team size, industry), an onboarding question ("what do you manage?"), session-based signals from the first clicks |
| New system | Everything | Popularity and rules first; log impressions from day one so a model has data later |

## When to use and when not to use

| Situation | Approach |
|---|---|
| A small catalog and little data | Popularity per segment, rules, and editorial lists |
| Plenty of interactions, mostly known items | Item-item CF or matrix factorization |
| Many new or long-tail items, rich item text | Content-based or a hybrid with content features |
| Large catalog, many signals, strict latency | Two-tower retrieval with ANN, then a ranking model |
| Recommendations with legal or safety impact | Transparent rules and human review; a model only as an input |
| Very few users or items | Do not build a recommender; a curated list is better |

## Practical examples

Tested with Python 3.12, NumPy 2.5, pandas 3.1.1, and scikit-learn 1.9.1
in November 2026. The data is synthetic: each simulated user has a
preference over 8 topics, visible in template titles, and over 6 hidden
"ways of working" that no text reveals, and template popularity follows a
long-tailed distribution.

### A synthetic template catalog and usage log

```python
# ml/make_interactions.py: synthetic TaskFlow template catalog and who used which template
from pathlib import Path

import numpy as np
import pandas as pd

rng = np.random.default_rng(42)
TOPICS = {
    "engineering": ["sprint", "bug", "release", "code review", "incident", "API"],
    "marketing": ["campaign", "content", "SEO", "launch", "newsletter", "social"],
    "sales": ["pipeline", "lead", "deal", "account", "quota", "demo"],
    "design": ["wireframe", "user research", "design review", "prototype", "brand", "UX"],
    "hr": ["onboarding", "hiring", "interview", "offboarding", "review cycle", "policy"],
    "finance": ["budget", "invoice", "expense", "forecast", "audit", "payroll"],
    "support": ["ticket", "escalation", "knowledge base", "SLA", "customer", "FAQ"],
    "operations": ["vendor", "inventory", "facilities", "procurement", "travel", "office"],
}
KINDS = ["template", "checklist", "board", "tracker", "playbook", "plan"]
names = list(TOPICS)

n_items, n_new, n_users = 600, 60, 2_000
item_topic = rng.integers(0, len(names), n_items)
item_style = rng.integers(0, 6, n_items)                          # hidden: way of working, not in the text
items = pd.DataFrame({
    "item": np.arange(n_items),
    "topic": [names[t] for t in item_topic],
    "title": [f"{rng.choice(TOPICS[names[t]])} {rng.choice(KINDS)}".capitalize() for t in item_topic],
    "is_new": np.arange(n_items) >= n_items - n_new,              # added after the training cutoff
})
popularity = rng.pareto(1.2, n_items) + 1                          # a long tail of rarely used items

rows = []
for user in range(n_users):
    taste = rng.dirichlet(np.full(len(names), 0.15))              # most users care about 1-2 topics
    style = rng.dirichlet(np.full(6, 0.2))                        # and work in one or two styles
    weights = taste[item_topic] * style[item_style] * popularity ** 0.7
    n_events = int(rng.integers(8, 40))
    chosen = rng.choice(n_items, size=n_events, replace=False, p=weights / weights.sum())
    old = chosen[~items["is_new"].to_numpy()[chosen]]
    new = chosen[items["is_new"].to_numpy()[chosen]]
    order = list(rng.permutation(old)) + list(new)                # new items can only come last
    for step, item in enumerate(order):
        rows.append((user, int(item), step))

events = pd.DataFrame(rows, columns=["user", "item", "step"])
Path("data").mkdir(exist_ok=True)
items.to_csv("data/items.csv", index=False)
events.to_csv("data/events.csv", index=False)
print(f"{len(items)} items ({n_new} new), {n_users} users, {len(events)} events")
print(items.sample(4, random_state=1)[["item", "topic", "title"]].to_string(index=False))
```

```text
$ python make_interactions.py
600 items (60 new), 2000 users, 47138 events
 item     topic             title
  446     sales   Quota checklist
  404    design     Brand tracker
  509 marketing Content checklist
  455        hr   Hiring playbook
```

### The split, item features, and the metrics

```python
# ml/rec_common.py: leave-last-two-out split, item text features, and top-k evaluation
import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer

items = pd.read_csv("data/items.csv")
events = pd.read_csv("data/events.csv")
n_users, n_items = events["user"].max() + 1, len(items)
is_new = items["is_new"].to_numpy()

last = events.groupby("user")["step"].transform("max")
test = events[events["step"] > last - 2]                        # each user's two most recent
train = events[(events["step"] <= last - 2) & ~is_new[events["item"]]]   # new items: unseen

X = np.zeros((n_users, n_items), dtype=np.float32)              # user x item, 1 = used
X[train["user"], train["item"]] = 1.0
truth = test.groupby("user")["item"].apply(set)

text = items["title"] + " " + items["topic"]                    # what a new template comes with
content = TfidfVectorizer().fit_transform(text).toarray().astype(np.float32)
content /= np.linalg.norm(content, axis=1, keepdims=True)


def evaluate(scores, k=10):
    """Recall@k and NDCG@k over each user's two held-out items, plus catalog coverage."""
    scores = np.where(X > 0, -np.inf, scores)                   # never re-recommend used items
    top = np.argsort(-scores, axis=1)[:, :k]
    recall, ndcg, cold_hits, cold_total = [], [], 0, 0
    for u, held in truth.items():
        ranked = list(top[u])
        hits = [1 if i in held else 0 for i in ranked]
        recall.append(sum(hits) / len(held))
        ideal = sum(1 / np.log2(r + 2) for r in range(len(held)))
        ndcg.append(sum(h / np.log2(r + 2) for r, h in enumerate(hits)) / ideal)
        for i in held:
            if is_new[i]:
                cold_total += 1
                cold_hits += i in ranked
    return {f"recall@{k}": np.mean(recall), f"NDCG@{k}": np.mean(ndcg),
            "coverage": len(np.unique(top)) / n_items, "new-item recall": cold_hits / cold_total}
```

Every user's two most recent templates are the test set. The 60 new
templates never appear in training: they model templates published after
the cutoff, the item cold-start case. Item features are TF-IDF vectors of
title and topic, normalized so dot products are cosine similarities.

### Popularity, collaborative filtering, and content-based filtering

```python
# ml/recommend.py: popularity, item-item collaborative filtering, matrix factorization, content-based
import numpy as np
from sklearn.decomposition import TruncatedSVD

from rec_common import X, content, evaluate, n_users, test, train

print(f"train events {len(train)}, test events {len(test)}, users {n_users}")
results = {}

popularity = X.sum(axis=0)                                       # how many users used each item
results["most popular"] = np.tile(popularity, (n_users, 1))

norms = np.linalg.norm(X, axis=0) + 1e-9
item_sim = (X.T @ X) / np.outer(norms, norms)                    # cosine between item columns
np.fill_diagonal(item_sim, 0)
results["item-item CF"] = X @ item_sim                           # sum of similarities to my items

svd = TruncatedSVD(n_components=32, random_state=0).fit(X)      # low-rank user and item factors
V = svd.components_.T                                            # item factors (n_items x 32)
results["matrix factorization"] = (X @ V) @ V.T

profile = X @ content                                            # the user's taste in text space
results["content-based"] = profile @ content.T

print(f"{'model':22} {'recall@10':>9} {'NDCG@10':>8} {'coverage':>8} {'new-item recall':>15}")
for name, scores in results.items():
    m = evaluate(scores)
    print(f"{name:22} {m['recall@10']:9.3f} {m['NDCG@10']:8.3f} {m['coverage']:8.2f} "
          f"{m['new-item recall']:15.3f}")
```

```text
$ python recommend.py
train events 41548, test events 4000, users 2000
model                  recall@10  NDCG@10 coverage new-item recall
most popular               0.019    0.013     0.03           0.000
item-item CF               0.113    0.081     0.90           0.000
matrix factorization       0.106    0.079     0.88           0.000
content-based              0.077    0.041     1.00           0.079
```

Reading the results:

- **Popularity** is a weak baseline here (recall@10 0.019) because users
  care about different topics, and it recommends the same 3% of the
  catalog to everyone.
- **Item-item CF and matrix factorization** are about six times better.
  They see the hidden "way of working" that no title reveals, because users
  who share it use the same templates.
- **Content-based** is weaker on known items (0.077) but is the only one of
  the four that ever recommends a new template (new-item recall 0.079).
- **Coverage** shows how much of the catalog each method uses; all but
  popularity spread recommendations widely.

The matrix factorization here is truncated SVD of the 0/1 matrix, a strong
and simple baseline; weighted ALS (the `implicit` library) usually does
better on real implicit data.

### A two-tower model in NumPy

The model is small enough to train with plain NumPy and hand-written
gradients, which makes every moving part visible. In production use
TensorFlow Recommenders, TorchRec, or PyTorch.

```python
# ml/two_tower.py: a small two-tower retrieval model in NumPy, trained with in-batch negatives
import argparse

import numpy as np

from rec_common import X, content, evaluate, n_items, train

parser = argparse.ArgumentParser()
parser.add_argument("--id-dropout", type=float, default=0.3)   # share of examples trained on text only
parser.add_argument("--no-logq", action="store_true")          # turn off the popularity correction
args = parser.parse_args()
ID_DROPOUT, LOGQ = args.id_dropout, not args.no_logq
D, BATCH, EPOCHS, LR = 32, 256, 15, 0.01
rng = np.random.default_rng(0)
n_words = content.shape[1]
pairs = train[["user", "item"]].to_numpy()
freq = np.bincount(pairs[:, 1], minlength=n_items) + 1
log_q = np.log(freq / freq.sum())                             # how often each item is a negative


def user_input(history):
    """User tower input: the items used (multi-hot) and their average text, both length-normalized."""
    n = np.maximum(history.sum(axis=1, keepdims=True), 1)
    return np.hstack([history / n, (history @ content) / n])


params = {"Wu": rng.normal(0, 0.05, (n_items + n_words, D)),   # user tower: one linear layer
          "Wi": rng.normal(0, 0.05, (n_words, D)),             # item tower: text ...
          "E": np.zeros((n_items, D))}                         # ... plus a learned ID embedding
moments = {k: (np.zeros_like(v), np.zeros_like(v)) for k, v in params.items()}
step = 0
for epoch in range(EPOCHS):
    order, total = rng.permutation(len(pairs)), 0.0
    for start in range(0, len(pairs), BATCH):
        u, i = pairs[order[start:start + BATCH]].T
        history = X[u].copy()
        history[np.arange(len(u)), i] = 0                     # leave the target out of the history
        keep_id = (rng.random(len(u)) >= ID_DROPOUT)[:, None]  # sometimes hide the ID: cold-start practice
        xu, xi = user_input(history), content[i]
        eu = xu @ params["Wu"]
        ei = xi @ params["Wi"] + keep_id * params["E"][i]
        logits = eu @ ei.T                                     # other items in the batch act as negatives
        if LOGQ:
            logits -= log_q[i][None, :]                        # correct for popular items' extra negatives
        logits -= logits.max(axis=1, keepdims=True)
        prob = np.exp(logits) / np.exp(logits).sum(axis=1, keepdims=True)
        total -= np.log(np.diag(prob) + 1e-12).sum()
        g = (prob - np.eye(len(u))) / len(u)                   # gradient of the softmax loss
        g_eu, g_ei = g @ ei, g.T @ eu
        grads = {"Wu": xu.T @ g_eu, "Wi": xi.T @ g_ei, "E": np.zeros_like(params["E"])}
        np.add.at(grads["E"], i, keep_id * g_ei)
        step += 1
        for k, (m, v) in moments.items():                      # Adam
            m[:] = 0.9 * m + 0.1 * grads[k]
            v[:] = 0.999 * v + 0.001 * grads[k] ** 2
            params[k] -= LR * (m / (1 - 0.9 ** step)) / (np.sqrt(v / (1 - 0.999 ** step)) + 1e-8)
    if epoch in (0, EPOCHS - 1):
        print(f"epoch {epoch + 1:2}: mean in-batch loss {total / len(pairs):.3f}")

user_emb = user_input(X) @ params["Wu"]                       # computed per request in production
item_emb = content @ params["Wi"] + params["E"]                # precomputed, indexed for ANN search
m = evaluate(user_emb @ item_emb.T)
print(f"two-tower: recall@10 {m['recall@10']:.3f}  NDCG@10 {m['NDCG@10']:.3f}  "
      f"coverage {m['coverage']:.2f}  new-item recall {m['new-item recall']:.3f}")
```

What each part does:

- **The user tower** sees the multi-hot list of templates used (the
  collaborative signal) and their average text (the content signal),
  through one linear layer. During training the target template is removed
  from the history so the model cannot simply look it up.
- **The item tower** maps the template's text through a linear layer and
  adds a learned ID embedding. New templates have an all-zero ID embedding,
  so their vectors come from text alone.
- **The loss** is a softmax over the batch, with gradients written out
  (`prob - I`), and Adam updates the three parameter matrices.
- **Serving** computes `item_emb` once for the whole catalog, ready for an
  ANN index, and only `user_emb` per request.

Three runs show what the two training details are worth:

```text
$ python two_tower.py --id-dropout 0 --no-logq
epoch  1: mean in-batch loss 4.778
epoch 15: mean in-batch loss 3.355
two-tower: recall@10 0.080  NDCG@10 0.050  coverage 0.92  new-item recall 0.001
```

```text
$ python two_tower.py --id-dropout 0
epoch  1: mean in-batch loss 4.805
epoch 15: mean in-batch loss 3.377
two-tower: recall@10 0.088  NDCG@10 0.060  coverage 0.93  new-item recall 0.002
```

```text
$ python two_tower.py
epoch  1: mean in-batch loss 4.893
epoch 15: mean in-batch loss 3.819
two-tower: recall@10 0.164  NDCG@10 0.099  coverage 1.00  new-item recall 0.106
```

- **Without ID dropout**, the model leans on per-item IDs, memorizes the
  training pairs, and generalizes worse than plain item-item CF; new
  templates, which have no trained ID, are almost never recommended.
- **The logQ correction** adds a little on its own (recall@10 0.080 to
  0.088).
- **With 30% ID dropout**, the text path has to work on its own for some
  examples. The result is the best model on both known items (0.164,
  against 0.113 for item-item CF) and new items (0.106, against 0.079 for
  content-based). Its training loss is higher; the metric that matters is
  better. That is a regularization lesson as much as a recommender one.

These numbers come from synthetic data with a known structure; on real
data, compare the same way against the same baselines before adopting a
more complex model.

## Best practices

- Start with popularity per segment and item-item CF; adopt anything more
  complex only when it beats them on the same split.
- Treat implicit feedback as positive-only; sample negatives and evaluate
  by ranking.
- Split by time, hold out each user's latest interactions, and exclude
  already-used items from the candidates.
- Report recall@k and NDCG@k with coverage, and report new-item and
  new-user segments separately.
- Use a two-stage design for large catalogs: high-recall retrieval from
  several sources, then a feature-rich ranker.
- In two-tower training, remove the target from the user features, correct
  for in-batch sampling bias, and train part of the time without IDs.
- Keep an exploration slot so new and long-tail items earn data.
- Log impressions with position and source, not just clicks; they are the
  ranker's training data.
- Apply permission filters before showing anything: never recommend a
  template or document the user cannot open.
- Confirm offline gains with an A/B test on adoption, not only
  click-through.

## In production

- **The same few templates are recommended to everyone.**
  *Detect:* catalog coverage and novelty fall; most clicks go to the top 1%
  of items. *Cause:* popularity bias from CF and in-batch training without
  correction, reinforced by a feedback loop. *Fix:* logQ correction,
  diversity re-ranking, an exploration share, and coverage as a guardrail
  metric.
- **New templates never get recommended.**
  *Detect:* new items have near-zero impressions for weeks; new-item recall
  offline is zero. *Cause:* ID-only models with no content path. *Fix:*
  content features in the item tower, ID dropout during training, and a
  guaranteed exploration slot for fresh items.
- **Offline recall rose but the A/B test is flat.**
  *Detect:* a new model wins offline and loses or ties online. *Cause:*
  exposure bias (logs only contain what the old model showed), a random
  instead of temporal split, or an offline metric unlinked to adoption.
  *Fix:* temporal splits, exploration traffic for unbiased data, and an
  agreed online success metric.
- **A user sees a recommendation for something they cannot access.**
  *Detect:* support tickets, or 403 responses after clicks on recommended
  items. *Cause:* candidates from a global index without permission
  filtering. *Fix:* filter by permissions in retrieval and again before
  rendering, and test that path (see
  [privacy, PII, and data retention](../security-privacy-and-responsible-ai/privacy-pii-and-data-retention.md)).
- **Recommendations go stale after a product change.**
  *Detect:* click-through drops after a catalog reorganization or a new
  feature. *Cause:* item embeddings and similarity tables computed before
  the change; retrieval index not rebuilt. *Fix:* scheduled retraining,
  index rebuilds tied to catalog changes, and freshness monitoring of
  embeddings.
- **Latency spikes on the home page.**
  *Detect:* p99 of the recommendation call grows with catalog size.
  *Cause:* scoring every item with the ranking model, or exact
  nearest-neighbour search. *Fix:* two stages, an ANN index, a candidate
  cap, and caching per user for a few minutes.

## Important terminology

- **Implicit feedback:** Behaviour such as use or clicks, positive-only.
- **Explicit feedback:** Ratings or votes stated by the user.
- **Candidate generation (retrieval):** Selecting a few hundred plausible
  items from the whole catalog.
- **Ranking:** Ordering the candidates with a richer model.
- **Collaborative filtering:** Recommending from patterns in many users'
  behaviour.
- **Item-item CF:** Scoring items by similarity to items the user used.
- **Matrix factorization:** Approximating the user-item matrix with
  low-dimensional user and item factors.
- **Content-based filtering:** Recommending items whose features match the
  user's profile.
- **Two-tower model:** Separate user and item networks whose embeddings
  meet in a dot product.
- **In-batch negatives:** Using the other items in a training batch as
  negative examples.
- **LogQ correction:** Subtracting each item's log sampling frequency from
  its logit to remove popularity bias.
- **Recall@k and NDCG@k:** The share of held-out items in the top k, and
  that share weighted by position.
- **Cold start:** Missing history for a new user or item.
- **Exposure bias:** Logs that only contain items the previous system
  chose to show.
- **Feedback loop:** A model trained on data shaped by its own earlier
  recommendations.

## Common mistakes and misconceptions

- Treating unused items as disliked.
- Evaluating with a random split, so the model sees each user's future.
- Recommending items the user already used and counting them as hits.
- Comparing a new model only against other complex models, not against
  popularity and item-item CF.
- Reporting average recall only, hiding that new items are never shown.
- Training two-tower models with the target item inside the user
  features.
- Ignoring permissions and privacy in candidate generation.
- Assuming offline gains will carry over to the A/B test.
- Judging a model by its training loss rather than the ranking metric.

## Revision questions

1. Why is implicit feedback "positive-only", and how does that change
   training and evaluation?
2. Why do large recommenders use separate retrieval and ranking stages?
3. A user has two held-out templates and one of them appears at rank 3 of
   the top 10. What are recall@10 and NDCG@10 for that user? (Recall 0.5;
   NDCG = (1 / log2(4)) / (1 + 1 / log2(3)) = 0.5 / 1.631 = 0.307.)
4. Why can item-item CF not recommend a template published yesterday, and
   what can?
5. What does the logQ correction fix in in-batch training?
6. Why did ID dropout improve the two-tower model on old items as well as
   new ones?
7. How would you recommend templates to a user who signed up five minutes
   ago?
8. Name two reasons an offline improvement might not appear in an A/B
   test.

## Further learning

- [Google Machine Learning: Recommendation systems](https://developers.google.com/machine-learning/recommendation/overview/types)
- [Google Machine Learning: Retrieval with deep neural networks](https://developers.google.com/machine-learning/recommendation/dnn/retrieval)
- [TensorFlow Recommenders: Building a retrieval model](https://www.tensorflow.org/recommenders/examples/basic_retrieval)
- [Collaborative Filtering for Implicit Feedback Datasets (Hu, Koren, Volinsky)](http://yifanhu.net/PUB/cf.pdf)
- [Sampling-Bias-Corrected Neural Modeling (Yi and others, 2019)](https://research.google/pubs/sampling-bias-corrected-neural-modeling-for-large-corpus-item-recommendations/)
- Next: [machine learning foundations interview questions and answers](interview-questions-and-answers.md). Back to the [machine learning foundations overview](../machine-learning-foundations.md).
