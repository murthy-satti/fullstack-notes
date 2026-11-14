# When to Fine-Tune

Fine-tuning is the most expensive way to change what a model does, and the
easiest to reach for too early. This lesson is about the decision: what
fine-tuning can and cannot change, why prompting, structured output, and
retrieval come first, how to measure a baseline before training anything,
how much and what kind of data you need, how to reason about cost and
latency, and how hosted fine-tuning services compare with training an
open-weight model yourself. The running example is the TaskFlow Assistant,
which turns a sentence such as "Fix the login page by Friday, it's urgent"
into a structured task.

The next lesson, [LoRA and PEFT in practice](lora-and-peft-in-practice.md),
shows how to train once the decision is made.

## Why it matters

A fine-tuning project is not one training run. It is a dataset that has to
be collected, cleaned, labelled, split, and kept current; an evaluation set
that has to exist before training starts; a training job; a new model
version to deploy, monitor, and eventually retrain when the base model is
retired. Teams that skip the decision step usually discover that a better
prompt, a JSON schema, or a retrieval fix would have solved the problem in
a day.

The most common mistake is trying to teach a model facts. Fine-tuning is
good at changing behavior (format, style, the boundaries of a
classification, when to call which tool), and poor at adding knowledge
that changes or must be cited. Research covered below shows that models
learn new facts slowly through fine-tuning and can become more likely to
make things up. Getting this decision right saves weeks of work and avoids
shipping a model that is confidently wrong.

There is also a vendor dimension. Hosted fine-tuning offerings change: as
of November 2026 one major provider is winding down its self-serve
fine-tuning platform and another has no tuning in its developer API. A
dataset and evaluation set you own survive those changes; a model you can
only run on one platform may not.

## Real-world usage

- **Microsoft Foundry (fine-tuning overview).** The
  [Fine-tuning in Microsoft Foundry](https://learn.microsoft.com/en-us/azure/foundry/fine-tuning/overview)
  page (October 2026) lists the reasons to fine-tune (accuracy on
  task-specific patterns, fewer prompt examples to cut token cost and
  latency, consistent style and schema, better tool use, and specializing
  a smaller model with teacher-generated examples) and states that
  fine-tuning "doesn't replace retrieval for current information or
  application-level safety controls."
- **Ovadia et al., 2023.**
  [Fine-Tuning or Retrieval? Comparing Knowledge Injection in LLMs](https://arxiv.org/abs/2312.05934)
  finds that "while unsupervised fine-tuning offers some improvement, RAG
  consistently outperforms it," for knowledge seen in pretraining and for
  entirely new knowledge.
- **Gekhman et al., 2024.**
  [Does Fine-Tuning LLMs on New Knowledge Encourage Hallucinations?](https://arxiv.org/abs/2405.05904)
  shows that examples introducing new facts are learned "significantly
  slower" and, once learned, "linearly increase the model's tendency to
  hallucinate". The authors conclude that models mostly acquire knowledge
  in pretraining, while fine-tuning teaches them to use it more
  efficiently.
- **LIMA, 2023.**
  [LIMA: Less Is More for Alignment](https://arxiv.org/abs/2305.11206)
  fine-tuned a 65B model on only 1,000 carefully curated prompts and
  responses and got strong instruction following, evidence that example
  quality matters more than raw volume.
- **LoRA Land (Predibase), 2024.**
  [LoRA Land](https://arxiv.org/abs/2405.00732) fine-tuned 310 models (10
  base models, 31 tasks) and reports that 4-bit LoRA fine-tuned models
  "outperform base models by 34 points and GPT-4 by 10 points on average"
  on those narrow tasks: the case for small specialized models.
- **OpenAI (deprecations page).** The
  [deprecations timeline](https://developers.openai.com/api/docs/deprecations)
  records that from May 7, 2026 organizations that had never fine-tuned
  could no longer start jobs, and that active customers lose the ability to
  create new jobs on January 6, 2027, while existing fine-tuned models keep
  serving until their base models are deprecated.

**Popular tools and providers:** Microsoft Foundry, Google Cloud's Gemini
Enterprise Agent Platform (formerly Vertex AI), Amazon Bedrock, and
Together AI for managed fine-tuning; Hugging Face TRL,
PEFT, and Transformers, Unsloth, Axolotl, and LLaMA-Factory for training
open-weight models yourself.

## How it works

### The customization ladder

Each step below is cheaper, faster to change, and easier to undo than the
one after it. Climb only when the step you are on has been measured and
found insufficient.

| Step | What changes | Fixes | Cost of a change |
|---|---|---|---|
| 1. Prompt and instructions | The text sent with each request | Unclear task, missing rules, wrong tone | Minutes; a code deploy |
| 2. Structured output | A JSON Schema the provider enforces | Invalid or incomplete JSON, wrong field types | Minutes |
| 3. Few-shot examples | Worked examples in the prompt | Edge cases, house conventions | Minutes; more input tokens per request |
| 4. Retrieval (RAG) | Documents fetched per request | Missing, private, or changing knowledge; citations | Days; an index to run |
| 5. Tools | Functions the model can call | Actions, live data, exact calculations | Days |
| 6. Fine-tuning | Model weights | Consistent behavior that the steps above cannot reach, or the same quality from a smaller, cheaper model | Weeks; a data and model pipeline |

For the TaskFlow Assistant, steps 1-3 handle almost everything: a system
prompt with the date rules, a schema for `title`, `due_date`, and
`priority` (see
[structured output and validation](../prompting-and-structured-output/structured-output-and-validation.md)),
and a handful of examples. Fine-tuning becomes interesting later, for
reasons the table hints at: the few-shot prompt has grown to thousands of
tokens, latency matters because the parser runs on every keystroke pause,
and a smaller model could do the job if it learned the conventions.

![Diagram: a decision flowchart that starts from a failing evaluation case. First diamond: is the failure about missing, private, or changing knowledge? Yes leads to a blue box "Use RAG or a tool". No leads to the second diamond: is the output invalid JSON or the wrong shape? Yes leads to "Enforce a schema with structured output". No leads to the third diamond: does a strong prompt with examples pass the evaluation? Yes leads to a green box "Ship the prompt; keep the eval". No leads to the fourth diamond: is the behavior gap consistent, the task stable, and are hundreds of good examples available? Yes leads to an orange box "Run a fine-tuning experiment against the prompt baseline"; no leads to a purple box "Collect data and improve the prompt first". A note says the high-volume case, where a prompt works but costs too much, also leads to the fine-tuning experiment with a smaller model.](ft-decision-flow.svg)

### What fine-tuning changes, and what it cannot

Supervised fine-tuning (SFT) shows the model many input and output pairs
and adjusts its weights so the outputs become more likely. That is a
powerful way to change *how* a model responds:

- **Format and schema habits:** always JSON, always this field order, never
  a chatty preamble.
- **Style and tone:** the voice of a product's help center, a terse
  changelog style.
- **Classification boundaries:** what counts as "high" priority in this
  product, which ticket goes to which queue.
- **Tool-use patterns:** which tool to call for which request, with
  correct arguments.
- **Compression:** behavior that needed a 3,000-token prompt can be learned
  so that a 200-token prompt produces it.

It is a poor way to change *what the model knows*:

- **Facts that change** (prices, policies, a project's current status)
  would need retraining on every change, and the old facts linger.
- **Citations and provenance** are impossible: weights do not remember
  which document a fact came from.
- **Permissions** cannot be enforced: a model trained on all customers'
  data can repeat any customer's data to anyone.
- **Exact recall** is not guaranteed: the model may or may not reproduce a
  training example on demand.

Those needs belong to retrieval and application code. The two
combine well: a model fine-tuned to answer from retrieved passages in a
fixed citation format is a common and sensible design.

### Evaluate first: the baseline is a contender

Before training, build the evaluation that will decide whether training
worked. For a parser like TaskFlow's, the metrics are concrete:

| Metric | Definition | Why it matters |
|---|---|---|
| JSON valid | Output parses as a JSON object | Anything else is a hard failure |
| Schema valid | Exactly the expected keys and types | The API rejects anything else |
| Field accuracy | Per field, matches the gold answer | Shows *which* behavior is wrong |
| Exact match | All fields correct | The user-visible success rate |
| Latency and input tokens | Per request, at the 50th and 95th percentile | The usual business reason to fine-tune |

Three rules make the numbers trustworthy:

1. **Hold out a test set that training never sees**, and do not tune
   prompts or hyperparameters against it; use a separate validation set
   for that.
2. **Score the best prompted baseline on the same test set.** The
   fine-tuned model has to beat it, not the naive prompt.
3. **Make the test set big enough to see a difference.** With 50 test
   examples, one error moves the score by 2 percentage points, so a
   "3-point improvement" may be noise; with a few hundred, each error is
   worth well under 1 point.

The section on [building evaluation sets](../evaluation-and-monitoring/building-evaluation-sets.md)
covers sampling and labeling in depth.

### Data needs

Providers publish their own minimums, and those minimums are floors, not
targets. Google's guidance for Gemini supervised tuning on its Agent
Platform is to
[start with 100 examples](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/tuning/supervised-tuning/prepare-data)
and scale to thousands if needed, and LIMA's 1,000 curated examples show
how far quality can go. What the examples contain matters more than how
many there are:

- **Representative inputs.** Real phrasing from real users (with
  permission), not only tidy sentences you wrote yourself. Include typos,
  mixed languages, and very short requests.
- **Edge cases and refusals.** Requests with no date, two tasks in one
  sentence, nonsense input, and the correct answer for each, including
  "cannot parse" if that is the intended behavior.
- **Consistent labels.** If two reviewers would label "by end of week"
  differently, write the rule down first. Inconsistent labels teach the
  model to be inconsistent.
- **No leakage.** Remove duplicates and near-duplicates, and split by a
  group such as project, customer, or time period so that similar examples
  never sit on both sides of the train and test line.
- **Minimal personal data.** Strip names, emails, and identifiers the task
  does not need, and confirm you have the right to use the data for
  training. See [AI data preparation and governance](../ai-data-preparation-and-governance.md).

Where do examples come from? Usually a mix: logged production requests
(where consent and policy allow), examples written by domain experts, and
synthetic examples generated by a strong model and then reviewed. Synthetic
data is useful for coverage but inherits the generator's mistakes, so
review a sample and label it as synthetic in the dataset metadata.

![Diagram: a left-to-right data pipeline. Three orange sources (consented production logs, expert-written examples, reviewed synthetic examples) feed a purple "Clean" stage that removes duplicates, strips personal data, and validates the gold answers. Next, a purple "Label and review" stage applies written labeling rules. Then a blue "Group split" stage hashes the project ID so each project lands in one split: train 80 percent, validation 10 percent, test 10 percent. The train and validation files go to a green "Train candidate" box; the test file goes to a green "Evaluate" box, which also scores the prompted baseline. A dashed arrow loops from Evaluate back to Label and review with the text "error analysis adds examples where the model fails".](ft-dataset-pipeline.svg)

### Cost and latency: reasoning in relative terms

Fine-tuning changes the cost structure of a feature: a one-off training
cost, sometimes a hosting fee for the custom model, and a different cost
per request. Exact prices change too often to be useful here, so reason in
relative units.

Suppose the prompted baseline sends a 3,000-token prompt (instructions plus
twenty examples) to a large model, and a fine-tuned small model needs a
300-token prompt. Assume, for illustration only, that the small model's
per-token price is one fifth of the large model's:

```text
Baseline per request:   3,000 tokens x 1.0 (large-model price)  = 3,000 units
Tuned per request:        300 tokens x 0.2 (small-model price)  =    60 units
Saving per request:                                             = 2,940 units

One-off training cost (data work + training runs), say 30,000,000 units
Break-even: 30,000,000 / 2,940 = about 10,200 requests
```

At ten thousand parser calls a day that pays back in a day; at a hundred a
day it takes over three months, before counting any hosting fee, the
engineering time, and the retraining you will need when the base model is
retired. Output tokens, which usually cost more per token than input,
barely change here because the JSON answer is short. The same arithmetic
explains when fine-tuning is *not* worth it: low volume, a task that
changes monthly, or a prompt that is already short.

Latency follows the same logic. Fewer input tokens shorten the time to the
first token, and a smaller model generates each token faster, which is why
"same quality from a smaller model" is the most common winning case.

### Hosted fine-tuning services and open models

There are two ways to fine-tune. A **hosted service** takes your dataset,
trains on its infrastructure, and serves the result behind its API. An
**open-weight model** is one whose weights you can download and train with
libraries such as Hugging Face TRL, then serve yourself or through a
provider that accepts custom weights.

The landscape as of November 2026 (check each provider's current page
before you plan around it):

| Provider | Methods offered | Notes |
|---|---|---|
| [Microsoft Foundry](https://learn.microsoft.com/en-us/azure/foundry/fine-tuning/overview) | SFT, DPO, and reinforcement fine-tuning (RFT), depending on the model | Covers selected OpenAI models and open models; OpenAI-compatible files and fine-tuning API; training tiers trade price against data residency |
| [Google Cloud Gemini Enterprise Agent Platform](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/tuning) (formerly Vertex AI, renamed April 2026) | SFT, preference tuning, and reinforcement learning fine-tuning (RLFT) for selected Gemini models | Google's developer [Gemini API has no tuning](https://aistudio.google.com/docs/model-tuning) since May 2025 |
| [Amazon Bedrock](https://docs.aws.amazon.com/bedrock/latest/userguide/custom-models.html) | SFT, RFT with reward functions in AWS Lambda, and distillation | Selected Amazon Nova, Meta Llama, and Anthropic Claude models; billed by training tokens and monthly model storage |
| [Together AI](https://docs.together.ai/docs/fine-tuning-overview) | LoRA (default) or full fine-tuning; SFT and DPO | Open models; serve on a dedicated endpoint or download the weights |
| [OpenAI](https://developers.openai.com/api/docs/deprecations) | Winding down | Closed to new organizations since May 7, 2026; new jobs end January 6, 2027 |

Self-hosting an open model with TRL inverts the trade-offs: you choose any
method, keep the weights (subject to the model's license), and can move
between clouds, but you also own the GPUs, the training scripts, the
serving stack, and the security of all of it. Mistral, for example, marks
its own hosted fine-tuning as deprecated in its
[documentation](https://docs.mistral.ai/capabilities/finetuning/), while
its open-weight models remain trainable with open tooling.

![Diagram: a side-by-side comparison. The left column, "Hosted fine-tuning service", lists in a blue panel: you upload JSONL; the provider trains and serves; methods limited to what the provider offers for that model; little infrastructure work; the model runs only on that platform; availability can change, with OpenAI's wind-down as the example. The right column, "Open-weight model you train", lists in an orange panel: you run TRL or a similar library; any method, including custom losses; you keep the adapter or weights, subject to the license; you run GPUs, serving, and security; portable between clouds and on-premises. A bottom bar says both need the same dataset, evaluation set, and versioning, which are the parts worth owning.](ft-hosted-vs-open.svg)

### Choosing a base model

Whichever route you take, the base model sets the ceiling:

- **Method support.** Not every model supports every method on every
  platform; Foundry's table, for example, lists SFT, DPO, and RFT per
  model. Check before you build the dataset in a method-specific format.
- **Size against latency and cost.** Start from the smallest model whose
  *prompted* baseline gets close to your target; fine-tuning closes gaps,
  it rarely creates capabilities from nothing.
- **License and terms.** Open-weight licenses differ in what they allow;
  hosted terms differ in how your training data is used and stored.
- **Lifecycle.** Hosted fine-tuned models usually follow their base
  model's retirement date, so a base model near the end of its life means
  an early retrain.
- **Configuration, not code.** Read the model ID from configuration, pick
  it from the provider's current supported-models list, and record the
  exact version you trained on.

## When to use and when not to use

| Situation | Fine-tune? | Do this instead or first |
|---|---|---|
| The model must answer from your changing documents | No | RAG with citations |
| Outputs are sometimes invalid JSON | No | Structured output with a schema |
| A long few-shot prompt works but is slow and costly at high volume | Yes, often | Fine-tune a smaller model on the same task |
| A stable classification with a house taxonomy and thousands of labelled examples | Yes | Compare against a prompted baseline first |
| A consistent tone or format that prompts keep drifting from | Maybe | Try stronger instructions and examples, then fine-tune |
| Tool selection errors on a fixed tool set | Maybe | Better tool descriptions first; fine-tune on traces |
| Per-user or per-tenant data | No | Retrieval with access control |
| A new task with no labelled data yet | Not yet | Collect and label data from the prompted version |
| Low request volume and no latency problem | Rarely | Keep the prompt |

## Practical examples

### Build a clean, leakage-free dataset

The script turns curated TaskFlow Assistant examples into the chat format
that both hosted services and TRL accept. It rejects duplicates, invalid
gold answers, and inputs with email addresses, and it splits by project so
that one project's phrasing never appears in both training and test data.

```python
# scripts/build_dataset.py
"""Turn curated TaskFlow Assistant examples into chat-format JSONL splits.

Input: one JSON object per line with id, project_id, today, text and gold.
Output: train.jsonl, validation.jsonl and test.jsonl in the output folder.
"""
import hashlib
import json
import re
import sys
from collections import Counter
from pathlib import Path

SYSTEM = (
    "You turn a TaskFlow user's request into one task. Reply with JSON only: "
    '{"title": string, "due_date": "YYYY-MM-DD" or null, '
    '"priority": "low" | "medium" | "high"}.'
)
EMAIL = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
DATE = re.compile(r"\d{4}-\d{2}-\d{2}")
PRIORITIES = {"low", "medium", "high"}


def normalize(text: str) -> str:
    """Lowercase and collapse whitespace so trivial variants count as duplicates."""
    return " ".join(text.lower().split())


def split_for(group_id: str) -> str:
    """Hash the project ID so every example from one project lands in one split."""
    bucket = int(hashlib.sha256(group_id.encode()).hexdigest(), 16) % 100
    if bucket < 80:
        return "train"
    return "validation" if bucket < 90 else "test"


def problems_in(example: dict) -> list[str]:
    gold = example["gold"]
    problems = []
    if set(gold) != {"title", "due_date", "priority"}:
        problems.append("unexpected gold keys")
    elif gold["priority"] not in PRIORITIES:
        problems.append("bad priority")
    elif gold["due_date"] is not None and not DATE.fullmatch(gold["due_date"]):
        problems.append("bad due_date")
    if EMAIL.search(example["text"]):
        problems.append("email address in input")  # minimize personal data
    return problems


def to_chat(example: dict) -> dict:
    return {
        "messages": [
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": f"Today is {example['today']}.\n{example['text']}"},
            {"role": "assistant", "content": json.dumps(example["gold"], separators=(",", ":"))},
        ]
    }


def main(source: str, out_dir: str) -> None:
    seen: set[str] = set()
    splits: dict[str, list[dict]] = {"train": [], "validation": [], "test": []}
    rejected: Counter = Counter()
    for line in Path(source).read_text(encoding="utf-8").splitlines():
        example = json.loads(line)
        key = normalize(example["text"])
        if key in seen:
            rejected["duplicate"] += 1
            continue
        seen.add(key)
        problems = problems_in(example)
        if problems:
            rejected.update(problems)
            continue
        splits[split_for(example["project_id"])].append(to_chat(example))

    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    for name, rows in splits.items():
        with open(out / f"{name}.jsonl", "w", encoding="utf-8") as f:
            for row in rows:
                f.write(json.dumps(row, ensure_ascii=False) + "\n")
        chars = sum(len(m["content"]) for row in rows for m in row["messages"])
        print(f"{name:<10} {len(rows):>3} examples  ~{chars // 4:>5} tokens (chars / 4)")
    print("rejected:", dict(rejected) or "none")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
```

Running it on a 67-line sample file produced:

```text
train       57 examples  ~ 4376 tokens (chars / 4)
validation   2 examples  ~  155 tokens (chars / 4)
test         5 examples  ~  387 tokens (chars / 4)
rejected: {'duplicate': 1, 'email address in input': 1, 'bad priority': 1}
```

Two lessons are visible in that output. Grouped splits are lumpy when
there are few groups (12 projects here), so check the split sizes and use
more groups or a different split key when one side is too small. And the
token count is only a rough estimate: four characters per token is a
rule of thumb for English, so use the provider's tokenizer or reported
counts for real budgeting.

### Score the baseline and the candidate the same way

The evaluation script reads the held-out split and one predictions file
per model, then reports each metric from the table above. It is plain
Python, so it runs in CI and works for hosted and self-hosted models alike.

```python
# scripts/eval_task_parser.py
"""Score task-parser outputs against the gold answers in a held-out split.

Usage: python scripts/eval_task_parser.py data/test.jsonl preds/baseline.jsonl preds/tuned.jsonl
Each predictions file has one {"index": n, "output": "<raw model text>"} per line,
where n is the line number of the example in the test file.
"""
import json
import sys
from pathlib import Path

FIELDS = ("title", "due_date", "priority")


def load_jsonl(path: str) -> list[dict]:
    return [json.loads(line) for line in Path(path).read_text(encoding="utf-8").splitlines() if line]


def parse(raw: str):
    try:
        value = json.loads(raw)
    except json.JSONDecodeError:
        return None
    return value if isinstance(value, dict) else None


def schema_ok(task: dict) -> bool:
    return (
        set(task) == set(FIELDS)
        and isinstance(task["title"], str)
        and task["title"].strip() != ""
        and (task["due_date"] is None or isinstance(task["due_date"], str))
        and task["priority"] in ("low", "medium", "high")
    )


def title_match(a: str, b: str) -> bool:
    return " ".join(a.lower().split()) == " ".join(b.lower().split())


def score(gold_rows: list[dict], predictions: list[dict]) -> dict:
    by_index = {p["index"]: p["output"] for p in predictions}
    totals = {"json_valid": 0, "schema_valid": 0, "exact": 0, **{f: 0 for f in FIELDS}}
    for i, row in enumerate(gold_rows):
        gold = json.loads(row["messages"][-1]["content"])
        task = parse(by_index.get(i, ""))
        if task is None:
            continue
        totals["json_valid"] += 1
        if not schema_ok(task):
            continue
        totals["schema_valid"] += 1
        hits = {
            "title": title_match(task["title"], gold["title"]),
            "due_date": task["due_date"] == gold["due_date"],
            "priority": task["priority"] == gold["priority"],
        }
        for field, hit in hits.items():
            totals[field] += hit
        totals["exact"] += all(hits.values())
    n = len(gold_rows)
    return {key: value / n for key, value in totals.items()}


def main(test_path: str, *prediction_paths: str) -> None:
    gold_rows = load_jsonl(test_path)
    columns = ("json_valid", "schema_valid", *FIELDS, "exact")
    print(f"{'model':<12}" + "".join(f"{c:>14}" for c in columns))
    for path in prediction_paths:
        result = score(gold_rows, load_jsonl(path))
        print(f"{Path(path).stem:<12}" + "".join(f"{result[c]:>14.0%}" for c in columns))
    print(f"(n = {len(gold_rows)} held-out examples)")


if __name__ == "__main__":
    main(sys.argv[1], *sys.argv[2:])
```

On two small sample prediction files (one imitating a chatty baseline that
sometimes misses relative dates, one imitating a tuned model), the output
was:

```text
model           json_valid  schema_valid         title      due_date      priority         exact
baseline               80%           80%           80%           60%           80%           60%
tuned                 100%          100%          100%           80%          100%           80%
(n = 5 held-out examples)
```

The table shows the shape of a real comparison, and the last line shows
why five examples prove nothing: every single example is worth 20 points.
Run the same script on a few hundred held-out examples before deciding.

### Start a managed fine-tuning job

Microsoft Foundry exposes an OpenAI-compatible files and fine-tuning API,
so the official `openai` Python SDK works against it with a different base
URL. The model ID and the training tier come from configuration.

```python
# scripts/start_finetune.py
"""Upload the splits and start a supervised fine-tuning job on Microsoft Foundry.

Environment:
  AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY  the Foundry resource (from your secret store)
  FINE_TUNING_MODEL          a base model ID that supports SFT (from Foundry's supported-models table)
  FINE_TUNING_TRAINING_TYPE  for example GlobalStandard, Standard, or Developer
"""
import os
import sys
import time

from openai import OpenAI

client = OpenAI(
    base_url=os.environ["AZURE_OPENAI_ENDPOINT"].rstrip("/") + "/openai/v1/",
    api_key=os.environ["AZURE_OPENAI_API_KEY"],
)


def upload(path: str) -> str:
    with open(path, "rb") as f:
        uploaded = client.files.create(file=f, purpose="fine-tune")
    client.files.wait_for_processing(uploaded.id)  # raises if processing fails
    return uploaded.id


def main(train_path: str, validation_path: str) -> None:
    job = client.fine_tuning.jobs.create(
        model=os.environ["FINE_TUNING_MODEL"],
        training_file=upload(train_path),
        validation_file=upload(validation_path),
        suffix="taskflow-parser",
        seed=42,  # makes reruns comparable
        method={
            "type": "supervised",
            "supervised": {"hyperparameters": {"n_epochs": "auto"}},
        },
        extra_body={"trainingType": os.environ["FINE_TUNING_TRAINING_TYPE"]},
    )
    print("created", job.id, job.status)

    while job.status not in ("succeeded", "failed", "cancelled"):
        time.sleep(60)
        job = client.fine_tuning.jobs.retrieve(job.id)
        print(time.strftime("%H:%M"), job.status)

    for event in client.fine_tuning.jobs.list_events(job.id, limit=10).data:
        print(" ", event.message)
    if job.status != "succeeded":
        sys.exit(f"job {job.id} ended as {job.status}: {job.error}")
    print("fine-tuned model:", job.fine_tuned_model)  # deploy it, then run the eval


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
```

Parts: `files.create` with `purpose="fine-tune"` uploads each JSONL file,
and `wait_for_processing` blocks until the service has validated it;
`method` selects supervised training (the same call takes `"dpo"` or
`"reinforcement"` for models that support them); `extra_body` carries
Foundry's `trainingType`, which is not part of the OpenAI schema; and the
loop polls until the job ends. The result is a model you then *deploy*
before calling it. Equivalents elsewhere: Google's Agent Platform starts
tuning jobs
with `client.tunings.tune` in the Google Gen AI SDK (or REST or the
console) from JSONL files in Cloud Storage, and Bedrock uses a model
customization job with data in Amazon S3; the dataset preparation and
evaluation steps are the same.

### Roll the tuned model out behind the baseline

The tuned model is a candidate until production traffic agrees. In the
TaskFlow API, a deterministic per-user bucket sends a small share of
requests to it, and any invalid answer falls back to the prompted
baseline instead of reaching the user.

```ts
// src/ai/taskParser.ts
import { createHash } from "node:crypto";
import OpenAI from "openai";
import { z } from "zod";

// Model IDs and endpoints come from configuration, never from code.
const client = new OpenAI({
  baseURL: process.env.AI_BASE_URL, // e.g. a Foundry resource's /openai/v1/ endpoint
  apiKey: process.env.AI_API_KEY,
});
const TUNED_MODEL = process.env.TASK_PARSER_MODEL; // fine-tuned deployment, optional
const BASE_MODEL = process.env.TASK_PARSER_BASE_MODEL ?? ""; // prompted baseline
const CANARY_PERCENT = Number(process.env.TASK_PARSER_CANARY_PERCENT ?? "0");

const TaskDraft = z.object({
  title: z.string().trim().min(1).max(200),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  priority: z.enum(["low", "medium", "high"]),
});
export type TaskDraft = z.infer<typeof TaskDraft>;

// The tuned model learned the format, so it needs only the short instruction.
const SHORT_SYSTEM =
  'Reply with JSON only: {"title": string, "due_date": "YYYY-MM-DD" or null, ' +
  '"priority": "low" | "medium" | "high"}.';
// The baseline needs rules and worked examples (shortened here).
const LONG_SYSTEM = `${SHORT_SYSTEM}
Rules: resolve relative dates from "Today is ..."; "urgent" or "asap" means high.
Example: "Today is 2026-11-16. Fix the login page by Friday" ->
{"title":"Fix the login page","due_date":"2026-11-20","priority":"medium"}`;

// Stable per-user bucket, so a user sees the same model on every request.
function bucket(userId: string): number {
  return createHash("sha256").update(userId).digest().readUInt16BE(0) % 100;
}

async function callModel(model: string, system: string, text: string, today: string) {
  const completion = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: `Today is ${today}.\n${text}` },
    ],
    temperature: 0,
    response_format: { type: "json_object" },
  });
  const raw = completion.choices[0]?.message.content ?? "";
  try {
    return TaskDraft.safeParse(JSON.parse(raw));
  } catch {
    return TaskDraft.safeParse(undefined); // not JSON: report as a failed parse
  }
}

export async function parseTask(text: string, today: string, userId: string) {
  const useTuned = TUNED_MODEL !== undefined && bucket(userId) < CANARY_PERCENT;
  if (useTuned) {
    const result = await callModel(TUNED_MODEL, SHORT_SYSTEM, text, today);
    if (result.success) return { draft: result.data, model: "tuned" as const };
    // Fall through: an invalid answer from the candidate must not reach the user.
  }
  const result = await callModel(BASE_MODEL, LONG_SYSTEM, text, today);
  if (!result.success) throw new Error("Could not turn the request into a task");
  return { draft: result.data, model: useTuned ? ("fallback" as const) : ("base" as const) };
}
```

Log the returned `model` label with each request: the fallback rate is the
single most useful production signal for a tuned model, and the canary
percentage is the rollback switch. The JSON mode shown keeps the example
portable across OpenAI-compatible endpoints; where the provider supports a
strict JSON Schema, prefer that, as the
[structured output lesson](../prompting-and-structured-output/structured-output-and-validation.md)
explains. Rolling out by percentage follows the same pattern as the
[canary releases](../../08-devops-and-deployment/deployment-strategies/rolling-blue-green-and-canary.md)
in the DevOps section.

## Best practices

- Write down the failing behavior and the metric that will prove it fixed
  before collecting any training data.
- Exhaust prompting, structured output, and retrieval first, and keep the
  best prompted version as the baseline to beat.
- Hold out a test set split by group (project, customer, time), and never
  tune against it.
- Prefer a few hundred consistent, reviewed examples over thousands of
  noisy ones; add data where error analysis shows failures.
- Strip personal data the task does not need, and confirm the right to
  train on every source.
- Read model IDs from configuration and record the exact base model
  version, dataset version, and job settings for every candidate.
- Roll out behind a canary with validation and a fallback, and watch the
  fallback rate.
- Plan for retraining: base models retire, tasks drift, and providers
  change what they offer.

## In production

- **The tuned model wins offline but loses in production.**
  *Detect:* offline exact match is well above the baseline, but the canary
  fallback rate is higher than the baseline's validation failure rate.
  *Cause:* training and test data came from tidy, synthetic, or old
  requests that do not match live traffic. *Fix:* sample live requests
  (with consent) into the evaluation set, retrain with real phrasing, and
  compare on the new set before raising the canary.
- **Answers become confidently wrong after training on product docs.**
  *Detect:* support reports invented features or outdated policies; a
  factual-QA eval drops below the base model. *Cause:* the team used
  fine-tuning to inject knowledge, which teaches the model to produce
  fact-shaped text it cannot ground. *Fix:* move the knowledge to RAG and
  restrict fine-tuning to answer format and citation behavior.
- **A big evaluation gain disappears on a fresh test set.**
  *Detect:* re-scoring on newly labelled data gives much lower numbers
  than the original test set. *Cause:* near-duplicate examples or the same
  projects appeared in both training and test data, or the test set was
  used to choose hyperparameters. *Fix:* split by group, deduplicate with
  normalized text, keep a separate validation set, and refresh the test
  set periodically.
- **The tuned model stops working on a known date.**
  *Detect:* the provider's deprecation notice, then errors for the
  fine-tuned model ID. *Cause:* hosted fine-tuned models usually follow
  their base model's retirement schedule. *Fix:* track base-model
  retirement dates, keep the dataset and evaluation versioned so a retrain
  on a newer base is routine, and test the retrained model before the
  deadline.
- **Costs rise after switching to the cheaper tuned model.**
  *Detect:* the bill grows even though tokens per request fell. *Cause:*
  a per-hour hosting fee or provisioned capacity for the custom model at
  low traffic, or repeated training experiments. *Fix:* include hosting in
  the break-even calculation, use per-token deployments for low volume,
  delete unused deployments, and cap the number of training runs.
- **Safety behavior regresses.**
  *Detect:* a red-team or refusal eval shows the tuned model now complies
  with requests the base refused. *Cause:* the training data contained no
  refusal examples, or a narrow format-only dataset eroded safety
  training. *Fix:* add refusal and edge-case examples, run the safety eval
  on every candidate, and keep application-level guardrails.
- **A provider change blocks retraining.**
  *Detect:* job creation fails with an access error, or a deprecation
  notice ends self-serve training. *Cause:* the hosted fine-tuning
  offering was restricted or withdrawn. *Fix:* keep datasets in a
  provider-neutral chat JSONL format, keep the evaluation runnable against
  any OpenAI-compatible endpoint, and keep an open-weight fallback plan.

## Important terminology

- **Fine-tuning:** Continuing training of a pretrained model on a smaller,
  task-specific dataset.
- **Supervised fine-tuning (SFT):** Fine-tuning on input and desired-output
  pairs.
- **Knowledge injection:** Trying to add facts to a model through
  training, usually better served by retrieval.
- **Baseline:** The best non-fine-tuned solution, scored on the same test
  set as each candidate.
- **Held-out test set:** Examples never used for training or tuning
  decisions.
- **Group split:** Assigning examples to splits by a shared key, such as
  project or customer, to prevent leakage.
- **Data leakage:** Information from test examples reaching training,
  which inflates scores.
- **Open-weight model:** A model whose weights can be downloaded and
  trained, under its license.
- **Managed (hosted) fine-tuning:** A provider service that trains and
  serves a custom model from your data.
- **Break-even volume:** The number of requests at which per-request
  savings repay the one-off cost of fine-tuning.

## Common mistakes and misconceptions

- Fine-tuning to add or update facts instead of using retrieval.
- Fine-tuning to fix invalid JSON that a schema would have prevented.
- Comparing the tuned model with a naive prompt instead of the best
  prompted baseline.
- Evaluating on a test set that shares near-duplicates or projects with
  the training data.
- Believing more data always helps; inconsistent labels make results
  worse.
- Treating fine-tuning as access control or as a way to make a model
  "remember" individual records.
- Ignoring hosting fees, retraining, and base-model retirement in the
  cost calculation.
- Hard-coding a model ID instead of reading it from configuration.

## Revision questions

1. Name three kinds of problems fine-tuning handles well and three it
   handles badly, with the alternative for each bad case.
2. Why must the prompted baseline be scored on the same held-out test set
   as the fine-tuned candidate?
3. Your test set has 40 examples and the candidate beats the baseline by
   5 points. How many examples is that, and what would you do next?
4. Explain a group split and the failure it prevents.
5. A baseline request costs 2,400 units and a tuned one 120 units, and the
   project costs 20,000,000 units. How many requests until break-even, and
   how long is that at 500 requests a day? (20,000,000 / 2,280 is about
   8,800 requests, about 18 days.)
6. Compare a hosted fine-tuning service with training an open-weight
   model yourself on control, effort, and portability.
7. What should you check about a base model before building a dataset for
   it?
8. Why does the canary design in the TypeScript example fall back to the
   baseline instead of returning the tuned model's invalid answer?

## Further learning

- [Microsoft Foundry: Fine-tuning overview](https://learn.microsoft.com/en-us/azure/foundry/fine-tuning/overview)
- [Microsoft Foundry: Supervised fine-tuning](https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/fine-tuning)
- [Google Cloud: Tune Gemini models](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/tune-models)
- [Amazon Bedrock: Customize your model](https://docs.aws.amazon.com/bedrock/latest/userguide/custom-models.html)
- [Hugging Face TRL: Dataset formats](https://huggingface.co/docs/trl/dataset_formats)
- Next: [LoRA and PEFT in practice](lora-and-peft-in-practice.md). Back to
  the [fine-tuning overview](../fine-tuning.md).
