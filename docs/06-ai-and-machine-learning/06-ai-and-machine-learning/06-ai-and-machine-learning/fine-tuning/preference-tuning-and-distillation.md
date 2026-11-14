# Preference Tuning and Distillation

Supervised fine-tuning teaches a model what a good answer looks like.
Preference tuning teaches it which of two plausible answers is *better*,
and reinforcement methods let it improve against a score you can compute.
Distillation goes the other way: it moves the behavior of a large, slow
"teacher" model into a small, fast "student". This lesson covers the
classic RLHF pipeline, Direct Preference Optimization (DPO) and the newer
methods built on it, reinforcement learning with verifiable rewards such
as GRPO, and teacher-to-student distillation, with TRL code for the
TaskFlow Assistant's meeting-notes summaries and task parser. Code was
checked against `trl` 1.18 and `peft` 0.21 as of November 2026.

It builds on [LoRA and PEFT in practice](lora-and-peft-in-practice.md):
every method here can train a LoRA adapter instead of the full model.

## Why it matters

Many qualities users care about have no single correct answer. Two
summaries of the same meeting can both be accurate while one is clearly
more useful: it names owners, skips small talk, and stays short. Writing
the perfect summary for every training example is slow and subjective;
picking the better of two is fast and consistent. Preference methods turn
those cheap comparisons into training signal, which is how chat models
learned to be helpful in the first place.

Reinforcement methods go further when quality can be checked by code: a
parsed task either matches the expected fields or it does not, a SQL query
either returns the right rows or it does not. Training against such a
check can push a model past the examples you could write by hand.

Distillation addresses the bill. A large model may do the TaskFlow tasks
well but too slowly and expensively for every keystroke; a student a
fraction of its size, trained on the teacher's outputs, can often keep
most of the quality for that narrow task. Knowing which of these tools
fits, and their failure modes (length bias, reward hacking, inherited
mistakes), keeps a team from spending weeks on the wrong one.

## Real-world usage

- **InstructGPT (OpenAI), 2022.**
  [Training language models to follow instructions with human feedback](https://arxiv.org/abs/2203.02155)
  describes the three-stage pipeline (demonstrations for SFT, rankings for
  a reward model, reinforcement learning) and reports that outputs from
  the 1.3B InstructGPT model "are preferred to outputs from the 175B
  GPT-3, despite having 100x fewer parameters."
- **DPO (Stanford), 2023.**
  [Direct Preference Optimization](https://arxiv.org/abs/2305.18290)
  shows that the RLHF objective can be solved "with only a simple
  classification loss," which is "stable, performant, and computationally
  lightweight, eliminating the need for sampling from the LM during
  fine-tuning."
- **Tulu 3 (Allen Institute for AI), 2024.**
  [Tulu 3](https://arxiv.org/abs/2411.15124) publishes a fully open
  post-training recipe that combines SFT, DPO, and a method it calls
  Reinforcement Learning with Verifiable Rewards (RLVR), with data, code,
  and evaluations.
- **DeepSeekMath and DeepSeek-R1, 2024-2025.**
  [DeepSeekMath](https://arxiv.org/abs/2402.03300) introduced Group
  Relative Policy Optimization (GRPO), and
  [DeepSeek-R1](https://arxiv.org/abs/2501.12948) shows that reasoning
  abilities "can be incentivized through pure reinforcement learning" on
  verifiable tasks and that the resulting reasoning patterns "can be
  systematically harnessed to guide and enhance the reasoning capabilities
  of smaller models", that is, distilled.
- **DistilBERT (Hugging Face), 2019.**
  [DistilBERT](https://arxiv.org/abs/1910.01108) showed that distillation
  can "reduce the size of a BERT model by 40%, while retaining 97% of its
  language understanding capabilities and being 60% faster."
- **Amazon Bedrock Model Distillation.** Bedrock's
  [distillation](https://docs.aws.amazon.com/bedrock/latest/userguide/model-distillation.html)
  feature generates responses from a chosen teacher for your prompts and
  fine-tunes a smaller student on them, the off-policy distillation
  pattern described below, as a managed service.

**Popular tools and providers:** Hugging Face TRL (`DPOTrainer`,
`KTOTrainer`, `RewardTrainer`, `GRPOTrainer`, `RLOOTrainer`, and
`DistillationTrainer`), verl, and OpenRLHF for open models; Microsoft
Foundry (DPO and reinforcement fine-tuning), Google Cloud's Gemini
Enterprise Agent Platform, formerly Vertex AI (preference tuning and RL
fine-tuning), and Amazon Bedrock (reinforcement
fine-tuning and distillation) as managed services.

## How it works

### Where preference tuning fits

A typical post-training stack runs in this order:

1. **SFT** on demonstrations teaches the format and the task.
2. **Preference tuning** on comparisons teaches which of the model's own
   plausible answers people prefer.
3. **Reinforcement learning** against a reward model or a verifier
   improves further where quality can be scored.

Skipping step 1 rarely works: preference methods adjust the relative
likelihood of answers the model can already produce. If the model never
writes a three-bullet summary with owners, no amount of comparing two bad
summaries will teach it.

### RLHF: the classic pipeline

Reinforcement learning from human feedback (RLHF), as InstructGPT used it,
has three stages:

1. **Supervised fine-tuning** on human-written demonstrations.
2. **Reward modeling.** Labelers rank several model answers per prompt; a
   reward model learns a score so that preferred answers score higher.
   With the Bradley-Terry model, the probability that answer A beats
   answer B is `sigmoid(r(A) - r(B))`, and training maximizes that
   probability for the observed preferences.
3. **Policy optimization.** The SFT model (now the "policy") generates
   answers, the reward model scores them, and an RL algorithm, usually
   [PPO](https://arxiv.org/abs/1707.06347), updates the policy to raise
   the reward, minus a penalty `beta x KL(policy || reference)` that keeps
   it close to the SFT model.

The KL penalty is essential. A reward model is an imperfect proxy, and a
policy optimized hard against it finds answers that score well without
being good: **reward hacking**, such as very long or flattering answers.
Staying near the reference model limits how far it can drift. The cost is
complexity: PPO-based RLHF keeps four models busy (policy, frozen
reference, reward model, and a value model that estimates expected
reward), and it is sensitive to hyperparameters.

![Diagram: three stages left to right. Stage 1, an orange box of demonstrations (prompts with written answers) trains the SFT model. Stage 2, a purple box "Reward model": labelers rank two answers to the same prompt, A better than B, and the reward model learns scores so that sigmoid of r(A) minus r(B) is high. Stage 3, a blue loop: the policy, initialized from the SFT model, generates an answer; the reward model scores it; a frozen reference copy of the SFT model supplies a KL penalty; PPO updates the policy to maximize reward minus beta times KL. A red note warns that without the KL penalty the policy learns to game the reward model.](rlhf-pipeline.svg)

### DPO: preferences without the RL loop

DPO starts from the same objective (maximize reward, stay close to the
reference) and shows that the optimal policy can be written in closed
form, so the reward model and the RL loop disappear. What remains is a
loss over preference pairs `(prompt x, chosen y_w, rejected y_l)`:

```text
loss = -log sigmoid( beta * [ (log p(y_w|x) - log p_ref(y_w|x))
                            - (log p(y_l|x) - log p_ref(y_l|x)) ] )
```

In words: raise the policy's probability of the chosen answer relative to
the reference model, lower it for the rejected answer, and stop pushing
once the margin is comfortable. `beta` controls how strongly the policy
may move away from the reference; TRL's default is 0.1.

A worked example with `beta = 0.1`. At the start of training the policy
equals the reference, both log-ratios are 0, and the loss is
`-log sigmoid(0) = log 2 = 0.693`. Later, the chosen answer's log-ratio is
+2.0 and the rejected one's is -1.0:

```text
margin = 0.1 x (2.0 - (-1.0)) = 0.3
loss   = -log sigmoid(0.3) = -log 0.574 = 0.554
```

DPO needs only two models (policy and reference), no sampling during
training, and ordinary supervised-style batches. In TRL, if you pass no
reference model, the trainer uses the initial policy (the model as it was
before DPO started), which with a LoRA adapter costs no extra copy. TRL
logs `rewards/chosen`, `rewards/rejected`, `rewards/margins`, and
`rewards/accuracies` (how often the chosen answer wins); accuracy near
100% after a few steps usually means the pairs are too easy or the model
is memorizing.

Three known weaknesses shape how DPO is used:

- **Length bias.** If people preferred longer answers in the data, DPO
  learns "longer is better". Check how often the chosen answer is longer
  before training.
- **Off-policy data.** Pairs collected from a different model may
  describe answers your model would never produce. Pairs sampled from
  your own SFT model work better.
- **Falling likelihoods.** The probabilities of *both* chosen and rejected
  answers can decrease while their gap grows. Adding an SFT term on the
  chosen answers (TRL accepts `loss_type=["sigmoid", "sft"]` with
  `loss_weights`) keeps the chosen answers likely.

### Newer preference methods

DPO started a family of variants. TRL includes several, with different
maturity levels as of version 1.18:

| Method | Key idea | Data | In TRL |
|---|---|---|---|
| [IPO](https://arxiv.org/abs/2310.12036) | Replaces DPO's log-sigmoid with a squared loss to resist overfitting deterministic preferences | Pairs | `DPOConfig(loss_type="ipo")` |
| [KTO](https://arxiv.org/abs/2402.01306) | Learns from a binary "desirable or not" signal; "matches or exceeds" pairwise methods "at scales from 1B to 30B" | Single answers with a label, such as thumbs up or down | `KTOTrainer` (stable) |
| [ORPO](https://arxiv.org/abs/2403.07691) | Adds an odds-ratio penalty to the SFT loss, so SFT and preference alignment happen in one stage with no reference model | Pairs | `ORPOTrainer` (experimental) |
| [SimPO](https://arxiv.org/abs/2405.14734) | Uses the average log-probability as the implicit reward and adds a target margin; no reference model | Pairs | Experimental CPO trainer with `loss_type="simpo"` |

KTO deserves attention for products like TaskFlow: a thumbs-up or
thumbs-down on a single summary is far easier to collect than a careful
side-by-side comparison. "Experimental" in TRL means the API may change
between releases, so pin the version if you use those trainers.

### Reinforcement learning with verifiable rewards

When quality can be checked by code, the reward model can be replaced by
the check itself. Tulu 3 calls this RLVR; DeepSeek used it with GRPO to
train reasoning on math and code. For the TaskFlow parser the check is the
evaluation logic: valid JSON, the right keys, correct fields.

GRPO is the most common algorithm for this. For each prompt it samples a
group of answers (TRL's default is 8), scores each one, and uses the
score relative to the group as the advantage:

```text
advantage_i = (reward_i - mean(group rewards)) / std(group rewards)

rewards    1.00   0.75   0.25   0.00     mean 0.50, std 0.40
advantage  +1.26  +0.63  -0.63  -1.26    (population standard deviation)
```

Answers better than their siblings are reinforced and worse ones are
discouraged, without a value model, which saves memory compared with PPO.
Two consequences follow. If every answer in a group gets the same reward
(all perfect or all failing), the advantages are zero and the prompt
teaches nothing; TRL logs this as `frac_reward_zero_std`. And the policy
will exploit any gap in the reward function, so the verifier must be as
strict as the real requirement. TRL's GRPO defaults to `beta=0.0` (no KL
penalty against a reference model, so no reference copy in memory), and
TRL's [LoRA Without Regret guide](https://huggingface.co/docs/trl/lora_without_regret)
reports that RL needs very little adapter capacity (ranks of 1-32).

Managed services offer the same idea under the name reinforcement
fine-tuning: Microsoft Foundry scores samples with graders you define,
Amazon Bedrock calls reward functions you write in AWS Lambda, and
Google's Agent Platform trains a LoRA adapter "to maximize the reward."

![Diagram: a comparison of three methods in columns. PPO-based RLHF: data is prompts plus a reward model trained on rankings; models in memory are policy, reference, reward model, and value model; online, it samples during training; most complex. DPO: data is preference pairs of prompt, chosen, and rejected; models are policy and reference, or the initial policy when using LoRA; offline, no sampling; simple and stable, but sensitive to length bias and off-policy pairs. GRPO with verifiable rewards: data is prompts plus a reward function in code; models are the policy, and a reference only when beta is above zero; online, it samples a group of answers per prompt and uses relative advantages; needs a reward that cannot be gamed. A footer says to start with SFT, add DPO or KTO for preferences, and use GRPO when quality can be checked by code.](preference-methods-compared.svg)

### Distillation: teacher to student

Distillation trains a small student to imitate a large teacher. There are
three practical forms:

1. **Logit (classic) distillation.**
   [Hinton et al. (2015)](https://arxiv.org/abs/1503.02531) train the
   student to match the teacher's full probability distribution over
   outputs ("soft targets"), which carries more information than the
   single correct label. It needs the teacher's probabilities and, for
   language models, a shared vocabulary.
2. **Off-policy (sequence-level) distillation.** The teacher writes
   answers for a set of prompts, a validator filters them, and the student
   is fine-tuned on the result with ordinary SFT. This works with any
   teacher behind an API, which is why managed services offer it:
   Bedrock's distillation generates teacher responses and fine-tunes the
   student, and Foundry supports distillation "through teacher-generated
   SFT data". Zephyr applied the same idea to preferences, using a
   teacher's rankings for "distilled DPO" with no human annotation
   ([Tunstall et al., 2023](https://arxiv.org/abs/2310.16944)).
3. **On-policy distillation.** The student generates its own answers and
   the teacher's token distribution grades every token, as in
   [Generalized Knowledge Distillation](https://arxiv.org/abs/2306.13649).
   This fixes the mismatch of off-policy distillation, where the student
   only ever learns from the teacher's perfect paths and never from
   recovering after its own mistakes. TRL's `DistillationTrainer`
   implements it; the teacher must be an open model that "must share the
   student's vocabulary."

![Diagram: two rows. Top row, off-policy distillation: prompts flow to a large teacher model, which writes answers; a purple validator keeps only answers that pass the schema and evaluation checks; the kept pairs train a small student with SFT. A note says this works with an API teacher. Bottom row, on-policy distillation: the student writes its own answers to the prompts; the teacher, an open model with the same vocabulary, provides its probability for every token of the student's answer; the student is updated to match the teacher's distribution, and a dashed loop repeats the cycle so the student learns from its own mistakes. A note says teacher and student must share the same vocabulary. A red bar at the bottom says to check the teacher provider's terms, because some prohibit using outputs to train competing models.](distillation-paths.svg)

Two cautions apply to every form. The student inherits the teacher's
mistakes, so validate teacher outputs as strictly as you would human
labels. And check the teacher provider's terms: Anthropic's
[commercial terms](https://www.anthropic.com/legal/commercial-terms), for
example, prohibit accessing the services "to build a competing product
or service, including to train competing AI models." Distilling an open
model you are licensed to use, or your own fine-tuned model, avoids that
question.

### When distillation is worth it

The arithmetic is the same break-even reasoning as in
[when to fine-tune](when-to-fine-tune.md), with the teacher's labeling
cost added to the one-off side. In relative units, if the teacher costs
1.0 per request and the student 0.1, each request saves 0.9; generating
and validating 20,000 teacher answers costs 20,000, and training and
evaluation another 30,000, so the project breaks even after about
55,000 requests (50,000 / 0.9). Distillation is worth it when:

- the task is narrow and stable, so the student's smaller capacity is
  enough and you will not redo the work monthly;
- volume is high or latency matters (a student also runs on cheaper
  hardware or on-device);
- the student reaches your quality bar on the same held-out evaluation
  used for the teacher.

It is not worth it for low-volume features, for broad open-ended tasks
where the student's capacity limits quality, or when the teacher's terms
forbid it.

## When to use and when not to use

| Situation | Method | Why |
|---|---|---|
| A clear correct answer per input | SFT | Simplest; preference methods add nothing |
| Several valid answers, some better (summaries, tone) | DPO on pairs from your SFT model | Cheap comparisons become signal |
| Only thumbs up or down feedback | KTO | Works with unpaired binary labels |
| Quality can be checked by code (JSON fields, SQL results, tests) | GRPO or managed reinforcement fine-tuning | Optimizes the real requirement |
| A large model works, but cost or latency is too high | Distillation into a smaller student | Keeps most of the quality for a narrow task |
| No SFT baseline yet | SFT first | Preference methods refine existing behavior |
| Subjective quality with no reliable labels or checks | None yet | Build the evaluation and labeling guide first |

## Practical examples

### Build DPO pairs from summary comparisons

TaskFlow's meeting-notes feature can show two candidate summaries and let
users pick one. The script turns those logged choices into the
conversational preference format TRL and the managed DPO services expect,
drops ties and duplicates, and reports how often the chosen answer is
longer, an early warning for length bias.

```python
# scripts/build_pairs.py
"""Turn logged summary comparisons into DPO preference pairs and report label bias.

Each input line: {"prompt": [messages], "a": str, "b": str, "winner": "a" | "b" | "tie"}
Each output line: {"prompt": [messages], "chosen": [message], "rejected": [message]}
"""
import json
import sys
from pathlib import Path


def main(source: str, target: str) -> None:
    pairs, skipped, chosen_longer = [], {"tie": 0, "identical": 0, "duplicate": 0}, 0
    seen = set()
    for line in Path(source).read_text(encoding="utf-8").splitlines():
        row = json.loads(line)
        if row["winner"] == "tie":
            skipped["tie"] += 1
            continue
        chosen, rejected = (row["a"], row["b"]) if row["winner"] == "a" else (row["b"], row["a"])
        if chosen.strip() == rejected.strip():
            skipped["identical"] += 1
            continue
        key = (json.dumps(row["prompt"]), chosen, rejected)
        if key in seen:
            skipped["duplicate"] += 1
            continue
        seen.add(key)
        chosen_longer += len(chosen) > len(rejected)
        pairs.append({
            "prompt": row["prompt"],
            "chosen": [{"role": "assistant", "content": chosen}],
            "rejected": [{"role": "assistant", "content": rejected}],
        })

    with open(target, "w", encoding="utf-8") as f:
        for pair in pairs:
            f.write(json.dumps(pair, ensure_ascii=False) + "\n")
    print(f"pairs written: {len(pairs)}  skipped: {skipped}")
    # Preference data often rewards length; DPO will learn that bias if it is there.
    print(f"chosen answer is longer in {chosen_longer / max(len(pairs), 1):.0%} of pairs")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
```

On a 12-line sample file:

```text
pairs written: 8  skipped: {'tie': 2, 'identical': 1, 'duplicate': 1}
chosen answer is longer in 62% of pairs
```

A share well above half means raters lean toward longer summaries. Decide
whether that is a real preference or a rater habit before DPO amplifies
it; options include rebalancing pairs or adding a length rule to the
labeling guide.

### Train with DPO on top of the SFT model

DPO starts from the SFT model, here a merged SFT checkpoint whose path
comes from configuration, and trains a new LoRA adapter on the pairs.

```python
# scripts/train_dpo.py
"""Preference-tune the meeting-summary model with DPO and a fresh LoRA adapter."""
import os

from datasets import load_dataset
from peft import LoraConfig
from trl import DPOConfig, DPOTrainer

SFT_MODEL = os.environ["SFT_MODEL"]  # path or ID of the SFT model, from configuration

pairs = load_dataset("json", data_files="data/pairs.jsonl", split="train")
splits = pairs.train_test_split(test_size=0.1, seed=42)

args = DPOConfig(
    output_dir="runs/summary-dpo",
    beta=0.1,  # how far the policy may move from the reference
    loss_type=["sigmoid", "sft"],  # DPO plus an SFT term on the chosen answers
    loss_weights=[1.0, 0.2],
    learning_rate=1e-5,  # a LoRA value; TRL's default of 1e-6 suits full fine-tuning
    num_train_epochs=1,
    per_device_train_batch_size=4,
    gradient_accumulation_steps=4,
    max_length=1024,
    eval_strategy="steps",
    eval_steps=50,
    bf16=True,
    report_to="none",
)

trainer = DPOTrainer(
    model=SFT_MODEL,
    args=args,
    train_dataset=splits["train"],
    eval_dataset=splits["test"],
    peft_config=LoraConfig(r=16, lora_alpha=32, target_modules="all-linear", task_type="CAUSAL_LM"),
)
trainer.train()
trainer.save_model("adapters/summary-dpo")
```

Watch `rewards/margins` grow and `rewards/accuracies` rise on the
evaluation split, but judge the result with a summary evaluation (for
example a rubric scored by people or by an
[LLM judge](../evaluation-and-monitoring/llm-as-judge-and-automated-evals.md)),
not by the training metrics. The same pairs format, with `input`,
`preferred_output`, and `non_preferred_output` field names instead, is
what Microsoft Foundry's managed DPO expects.

### Write a verifiable reward

The reward function scores a parser answer between 0 and 1. TRL passes it
the completions plus every extra dataset column, so a `ground_truth`
column carries the gold task.

```python
# scripts/rewards.py
"""A verifiable reward for the TaskFlow task parser, usable by TRL's GRPOTrainer.

TRL calls reward functions with the generated completions plus every extra
dataset column as a keyword argument; here the dataset has a "ground_truth"
column holding the gold task as a JSON string.
"""
import json

FIELDS = ("title", "due_date", "priority")


def _text(completion) -> str:
    # Conversational datasets produce [{"role": "assistant", "content": ...}].
    return completion[0]["content"] if isinstance(completion, list) else completion


def task_reward(completions, ground_truth, **kwargs) -> list[float]:
    rewards = []
    for completion, gold_json in zip(completions, ground_truth):
        try:
            task = json.loads(_text(completion))
        except json.JSONDecodeError:
            rewards.append(0.0)  # not JSON at all
            continue
        if not isinstance(task, dict) or set(task) != set(FIELDS):
            rewards.append(0.1)  # JSON, wrong shape
            continue
        gold = json.loads(gold_json)
        title_ok = " ".join(str(task["title"]).lower().split()) == " ".join(gold["title"].lower().split())
        hits = [title_ok, task["due_date"] == gold["due_date"], task["priority"] == gold["priority"]]
        rewards.append(0.25 + 0.25 * sum(hits))  # 0.25 for valid shape, up to 1.0
    return rewards


if __name__ == "__main__":
    gold = json.dumps({"title": "Fix the login page", "due_date": "2026-11-20", "priority": "high"})
    samples = [
        '{"title": "Fix the login page", "due_date": "2026-11-20", "priority": "high"}',
        '{"title": "Fix login page", "due_date": "2026-11-20", "priority": "high"}',
        '{"title": "Fix the login page", "due_date": null}',
        "Sure! I created the task for you.",
        [{"role": "assistant", "content": '{"title": "fix the LOGIN page", "due_date": "2026-11-21", "priority": "high"}'}],
    ]
    for sample, reward in zip(samples, task_reward(samples, [gold] * len(samples))):
        print(f"{reward:.2f}  {str(sample)[:70]}")
```

Running the self-test:

```text
1.00  {"title": "Fix the login page", "due_date": "2026-11-20", "priority":
0.75  {"title": "Fix login page", "due_date": "2026-11-20", "priority": "hig
0.10  {"title": "Fix the login page", "due_date": null}
0.00  Sure! I created the task for you.
0.75  [{'role': 'assistant', 'content': '{"title": "fix the LOGIN page", "du
```

The partial credit is deliberate: if every early sample scored 0 or 1,
most groups would have identical rewards and teach nothing. Test a reward
function like this one on correct, partly correct, and adversarial
answers before training, exactly as the managed services advise for
graders.

### Train the parser with GRPO

The training script reuses the SFT splits: the prompt is the system and
user messages, and the gold answer becomes the `ground_truth` column.

```python
# scripts/train_grpo.py
"""Reinforcement fine-tuning of the task parser with GRPO and the verifiable reward."""
import os

from datasets import load_dataset
from peft import LoraConfig
from rewards import task_reward
from trl import GRPOConfig, GRPOTrainer

SFT_MODEL = os.environ["SFT_MODEL"]  # start from SFT so most samples are already valid JSON


def to_rl_row(row: dict) -> dict:
    *prompt, answer = row["messages"]
    return {"prompt": prompt, "ground_truth": answer["content"]}


train = load_dataset("json", data_files="data/train.jsonl", split="train")
train = train.map(to_rl_row, remove_columns=["messages"])

args = GRPOConfig(
    output_dir="runs/parser-grpo",
    num_generations=8,  # answers sampled per prompt; advantages are relative within the group
    max_completion_length=128,  # the JSON answer is short
    learning_rate=5e-5,  # the LoRA value used in TRL's LoRA Without Regret guide
    per_device_train_batch_size=8,
    gradient_accumulation_steps=4,  # 32 answers per step, a multiple of num_generations
    num_train_epochs=1,
    logging_steps=5,
    bf16=True,
    report_to="none",
)

trainer = GRPOTrainer(
    model=SFT_MODEL,
    reward_funcs=task_reward,
    args=args,
    train_dataset=train,
    peft_config=LoraConfig(r=8, lora_alpha=32, target_modules="all-linear", task_type="CAUSAL_LM"),
)
trainer.train()
trainer.save_model("adapters/parser-grpo")
```

Watch the logged `reward` rise and `frac_reward_zero_std` stay low. If
the reward climbs while the held-out evaluation does not improve, the
model has found a way to score without doing the task; tighten the reward
function. Generation dominates GRPO's run time, and TRL can hand sampling
to vLLM (`use_vllm=True`) to speed it up.

### Distill off-policy: let a teacher label prompts

This script asks a teacher model behind an OpenAI-compatible endpoint to
answer TaskFlow prompts and keeps only answers that pass validation. The
endpoint and model ID come from configuration; the output is ready for
the SFT scripts from the earlier lessons.

```python
# scripts/generate_teacher_data.py
"""Off-policy distillation, step 1: have a teacher model label prompts, keep only valid answers.

Environment: TEACHER_BASE_URL, TEACHER_API_KEY, TEACHER_MODEL (all from configuration).
Input: prompts.jsonl with {"messages": [system, user]} per line.
Output: SFT-ready chat JSONL with the teacher's answer appended as the assistant turn.
"""
import json
import os
import sys

from openai import OpenAI

client = OpenAI(base_url=os.environ["TEACHER_BASE_URL"], api_key=os.environ["TEACHER_API_KEY"])
TEACHER = os.environ["TEACHER_MODEL"]
FIELDS = {"title", "due_date", "priority"}


def valid(answer: str) -> bool:
    try:
        task = json.loads(answer)
    except json.JSONDecodeError:
        return False
    return isinstance(task, dict) and set(task) == FIELDS and task["priority"] in ("low", "medium", "high")


def main(prompts_path: str, out_path: str) -> None:
    kept = dropped = 0
    with open(prompts_path, encoding="utf-8") as src, open(out_path, "w", encoding="utf-8") as out:
        for line in src:
            messages = json.loads(line)["messages"]
            reply = client.chat.completions.create(model=TEACHER, messages=messages, temperature=0)
            answer = (reply.choices[0].message.content or "").strip()
            if not valid(answer):
                dropped += 1  # never train the student on answers that fail validation
                continue
            out.write(json.dumps({"messages": messages + [{"role": "assistant", "content": answer}]}) + "\n")
            kept += 1
    print(f"kept {kept}, dropped {dropped} invalid teacher answers")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
```

Against a local stub server that returns one non-JSON answer out of four,
the script printed `kept 3, dropped 1 invalid teacher answers`. For a real
run, also compare a sample of kept answers with human labels, because a
valid-looking answer can still have the wrong date; where gold labels
exist, keep only teacher answers that match them. For large prompt sets,
the provider's batch API (see
[prompt caching and batch processing](../hosted-model-apis/prompt-caching-and-batch-processing.md))
is usually cheaper than one request at a time.

### Distill on-policy with TRL

When the teacher is an open model you can load, TRL's
`DistillationTrainer` lets the student generate and the teacher grade
every token.

```python
# scripts/train_distill.py
"""On-policy distillation: the student writes answers, the teacher's token probabilities grade them."""
import os

from datasets import load_dataset
from peft import LoraConfig
from trl import DistillationConfig, DistillationTrainer

STUDENT_MODEL = os.environ["STUDENT_MODEL"]  # the small model you will serve
TEACHER_MODEL = os.environ["TEACHER_MODEL"]  # a larger open model with the same vocabulary

prompts = load_dataset("json", data_files="data/train.jsonl", split="train")
prompts = prompts.map(lambda row: {"prompt": row["messages"][:-1]}, remove_columns=["messages"])

args = DistillationConfig(
    output_dir="runs/parser-distill",
    beta=0.5,  # 0.0 forward KL, 0.5 Jensen-Shannon, 1.0 reverse KL (the default)
    max_completion_length=128,
    learning_rate=1e-5,
    per_device_train_batch_size=4,
    gradient_accumulation_steps=4,
    bf16=True,
    report_to="none",
)

trainer = DistillationTrainer(
    model=STUDENT_MODEL,
    teacher_model=TEACHER_MODEL,
    args=args,
    train_dataset=prompts,
    peft_config=LoraConfig(r=16, lora_alpha=32, target_modules="all-linear", task_type="CAUSAL_LM"),
)
trainer.train()
trainer.save_model("adapters/parser-distilled")
```

Teacher and student are both in memory during training, so this needs
more GPU memory than SFT; the payoff is a student that has practiced on
its own outputs. Evaluate the student with the same `eval_task_parser.py`
used for the teacher and the baseline.

## Best practices

- Run SFT first; use preference and reinforcement methods to refine
  behavior the model can already produce.
- Collect preference pairs from your own model's outputs, with a written
  rubric for raters, and check the data for length bias before training.
- Use KTO when you only have thumbs-up and thumbs-down feedback.
- Make reward functions strict, give partial credit where it helps
  learning, and test them on adversarial answers before training.
- Judge every method by the held-out task evaluation, not by training
  rewards or margins.
- Validate teacher outputs as strictly as human labels before distilling,
  and confirm the teacher's license or terms allow it.
- Keep a reference to the starting model's scores so regressions on
  other behavior are visible.
- Pin the TRL version when you use trainers marked experimental.

## In production

- **Summaries get longer after DPO.**
  *Detect:* average summary length jumps after the release; reviewers
  call them verbose. *Cause:* raters preferred longer answers, and DPO
  learned length as the signal. *Fix:* measure the chosen-longer share,
  rebalance pairs, add brevity to the rubric, or try a length-normalized
  method such as SimPO.
- **Training rewards climb but the evaluation gets worse.**
  *Detect:* GRPO's `reward` or DPO's `rewards/accuracies` rise while
  held-out exact match falls. *Cause:* reward hacking (the policy
  exploits a loophole in the verifier) or memorized preference pairs.
  *Fix:* inspect high-reward samples, close the loophole, add a KL penalty
  (`beta`) or fewer steps, and select checkpoints by the evaluation.
- **GRPO training does not move.**
  *Detect:* `frac_reward_zero_std` stays high and the reward is flat.
  *Cause:* prompts are so easy or so hard that every sampled answer gets
  the same reward. *Fix:* filter prompts to ones the model sometimes gets
  right, add partial credit, or raise sampling temperature.
- **Chosen answers become less likely during DPO.**
  *Detect:* `rewards/chosen` goes negative even though margins grow;
  output quality drops. *Cause:* DPO only pushes the gap, so both
  likelihoods can fall. *Fix:* add an SFT term
  (`loss_type=["sigmoid", "sft"]`), lower the learning rate, or use pairs
  sampled from the current model.
- **The distilled student repeats the teacher's errors.**
  *Detect:* the student fails the same evaluation cases as the teacher,
  plus more. *Cause:* unvalidated teacher outputs were used as labels.
  *Fix:* validate outputs, keep only answers that match gold labels where
  available, and review a sample by hand.
- **The student is good on test prompts but brittle on real traffic.**
  *Detect:* the canary shows more fallbacks than the offline evaluation
  predicted. *Cause:* off-policy distillation never showed the student
  how to recover from its own mistakes, and the prompts did not cover
  real phrasing. *Fix:* add real prompts and use on-policy distillation or
  a GRPO stage with the verifier.
- **Legal review blocks the distilled model.**
  *Detect:* a terms-of-service review flags the training data source.
  *Cause:* teacher outputs came from a provider whose terms prohibit
  training competing models. *Fix:* check terms before generating data,
  and prefer open teachers or models you own.

## Important terminology

- **Preference tuning:** Training from comparisons or ratings of model
  outputs rather than from target answers.
- **RLHF:** Reinforcement learning from human feedback: SFT, a reward
  model from rankings, then policy optimization.
- **Reward model:** A model that scores answers, trained so preferred
  answers score higher.
- **KL penalty:** A term that keeps the trained policy close to a
  reference model.
- **Reward hacking:** Finding outputs that score highly without meeting
  the real goal.
- **DPO:** Direct Preference Optimization, a classification-style loss on
  preference pairs with no separate reward model or RL loop.
- **KTO:** A preference method that learns from single answers labelled
  desirable or undesirable.
- **GRPO:** Group Relative Policy Optimization; scores a group of samples
  per prompt and uses within-group relative advantages.
- **RLVR:** Reinforcement learning with verifiable rewards computed by
  code.
- **Distillation:** Training a smaller student to imitate a larger
  teacher.
- **On-policy distillation:** The student generates and the teacher
  grades the student's own outputs token by token.

## Common mistakes and misconceptions

- Running DPO on a base model that cannot yet produce the desired answers.
- Treating `rewards/accuracies` or the GRPO reward curve as proof of
  better quality.
- Collecting preference pairs from a different model and expecting them
  to fit your model.
- Writing a lenient reward function and assuming the model will not find
  the loophole.
- Believing preference tuning adds knowledge; like SFT, it shapes
  behavior.
- Distilling from a teacher whose terms prohibit it.
- Assuming a distilled student matches the teacher on everything; it
  matches on the distribution it was trained on, at best.

## Revision questions

1. Describe the three stages of RLHF and why the KL penalty is needed.
2. What does DPO remove from the RLHF pipeline, and what does it keep?
3. With `beta = 0.2`, the chosen log-ratio is +1.0 and the rejected one is
   -1.5. What is the DPO margin and loss? (0.2 x 2.5 = 0.5; loss =
   -log sigmoid(0.5), about 0.474.)
4. When would you choose KTO over DPO?
5. A GRPO group gets rewards 1, 1, 1, 1. What are the advantages, and what
   does that mean for training?
6. Why does a verifiable reward need partial credit and adversarial
   testing?
7. Compare off-policy and on-policy distillation, including what each
   needs from the teacher.
8. Distillation costs 40,000 units one-off and saves 0.8 units per
   request. At 2,000 requests a day, when does it break even?
   (50,000 requests, 25 days.)

## Further learning

- [Hugging Face TRL: DPO Trainer](https://huggingface.co/docs/trl/dpo_trainer)
- [Hugging Face TRL: GRPO Trainer](https://huggingface.co/docs/trl/grpo_trainer)
- [Hugging Face TRL: KTO Trainer](https://huggingface.co/docs/trl/kto_trainer)
- [Hugging Face TRL: Distillation Trainer](https://huggingface.co/docs/trl/distillation_trainer)
- [Microsoft Foundry: Reinforcement fine-tuning](https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/reinforcement-fine-tuning)
- [Amazon Bedrock: Reinforcement fine-tuning](https://docs.aws.amazon.com/bedrock/latest/userguide/reinforcement-fine-tuning.html)
- Next: [fine-tuning interview questions and answers](interview-questions-and-answers.md).
  Back to the [fine-tuning overview](../fine-tuning.md).
