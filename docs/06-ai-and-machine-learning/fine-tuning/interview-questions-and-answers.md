# Fine-Tuning Interview Questions and Answers

These questions review deciding when to fine-tune, LoRA and PEFT in
practice, preference tuning and reinforcement methods, and distillation.
Try answering each one before reading the answer.

## Deciding when to fine-tune

### 1. What is fine-tuning, and what does it change?

Fine-tuning continues training a pretrained model on a smaller,
task-specific dataset, which updates some or all of its weights. It
changes behavior: format, style, classification boundaries, tool-use
patterns, and how much prompting a task needs. It is not a reliable way to
add facts, citations, or permissions.

### 2. Why do prompting, structured output, and retrieval come before fine-tuning?

They are cheaper, faster to change, and easy to undo: a prompt change
ships in minutes, while fine-tuning needs a dataset, an evaluation set,
training runs, deployment, and retraining when the base model retires.
Many problems blamed on the model (invalid JSON, missing knowledge) are
solved by a schema or retrieval.

### 3. Why is fine-tuning a poor way to add knowledge?

Models learn new facts slowly through fine-tuning, and Gekhman et al.
(2024) found that once new facts are learned they increase the tendency to
hallucinate. Ovadia et al. (2023) found RAG consistently outperformed
unsupervised fine-tuning for knowledge injection. Weights also cannot
cite sources, follow document updates, or enforce per-user access.

### 4. What problems does fine-tuning solve well?

Consistent output formats and styles, stable classification with a house
taxonomy, tool-selection patterns on a fixed tool set, and compressing a
long few-shot prompt into the weights. The most common business case is
getting the same quality from a smaller, cheaper, faster model.

### 5. How do RAG and fine-tuning combine?

Retrieval supplies current, permission-filtered facts per request, and
fine-tuning teaches the model how to use them: answer only from the
passages, cite them in a fixed format, and say when the passages do not
contain the answer.

### 6. What does "evaluate first" mean in practice?

Build the held-out evaluation set and metrics before collecting training
data, score the best prompted baseline on it, and treat that baseline as
the contender to beat. Without a baseline, you cannot tell whether
training helped.

### 7. Why must the comparison be against the best prompted baseline, not a naive prompt?

A fine-tuned model that only beats a weak prompt may lose to a better
prompt that costs nothing to maintain. The decision is "is the tuned model
better than our best non-tuned option on the same test set", including
cost and latency.

### 8. What metrics would you use for a structured-output task such as a task parser?

JSON validity, schema validity, per-field accuracy, exact match of all
fields, and operational metrics such as input tokens and latency at the
50th and 95th percentile. Per-field accuracy shows which behavior is
wrong; exact match is the user-visible success rate.

### 9. How big should a test set be?

Big enough that one error barely moves the score. With 50 examples each
error is 2 percentage points, so small differences are noise; with a few
hundred, each error is worth well under 1 point.

### 10. How many training examples do you need?

Providers publish minimums that are floors, not targets; Google's
guidance for Gemini tuning on its Agent Platform (formerly Vertex AI) is
to start with 100 examples and scale to thousands if needed.
LIMA showed strong instruction following from 1,000 curated examples.
Consistency, coverage of edge cases, and correct labels matter more than
volume.

### 11. What is a group split, and why use it?

Assigning examples to train, validation, and test by a shared key such as
project, customer, or time period, for example by hashing the project ID.
It prevents near-duplicate phrasing from the same source appearing on both
sides of the split, which inflates scores.

### 12. What makes a good fine-tuning dataset?

Representative real inputs (with permission), edge cases and refusals,
consistent labels written to rules, no duplicates or leakage, minimal
personal data, and a documented source and right to use each example.

### 13. What are the risks of synthetic training data?

It inherits the generator's mistakes and biases, can be less varied than
real traffic, and may carry restrictions from the generator's terms.
Review a sample, label synthetic rows in metadata, and keep real examples
in the test set.

### 14. How do you reason about the cost of fine-tuning without exact prices?

In relative units: one-off cost (data work and training runs), any hosting
fee for the custom model, and per-request savings from fewer input tokens
and a smaller model. Break-even requests = one-off cost / saving per
request, then compare with real volume.

### 15. Which managed fine-tuning services exist as of November 2026?

Microsoft Foundry offers SFT, DPO, and reinforcement fine-tuning for
selected OpenAI and open models; Google Cloud's Gemini Enterprise Agent
Platform (formerly Vertex AI) offers SFT, preference tuning, and RL
fine-tuning for selected Gemini models; Amazon Bedrock offers SFT,
reinforcement fine-tuning, and distillation; Together AI offers LoRA and
full fine-tuning of open models. OpenAI is winding down self-serve
fine-tuning, and the Gemini developer API has no tuning.

### 16. Hosted fine-tuning or an open-weight model you train yourself?

Hosted services need little infrastructure but limit methods to what the
provider supports, keep the model on their platform, and can change.
Open-weight training gives any method, portability, and ownership of the
adapter (within the license), at the cost of running GPUs, serving, and
security yourself.

### 17. What should you check about a base model before building the dataset?

Which tuning methods the platform supports for it, its size against your
latency and cost targets, how close its prompted baseline already is, its
license or terms, and its retirement date. Read its ID from configuration
and record the exact version.

### 18. How do you roll out a fine-tuned model safely?

Behind a canary: a deterministic per-user bucket sends a small share of
traffic to the candidate, outputs are validated, invalid answers fall back
to the baseline, and the fallback rate is monitored before raising the
percentage.

## LoRA, QLoRA, and PEFT

### 19. Why does full fine-tuning need so much memory?

With Adam in mixed precision each parameter needs about 16 bytes: a 16-bit
weight and gradient (4 bytes) plus a 32-bit master weight and two moment
estimates (12 bytes). An 8B model needs about 128 GB before activations.

### 20. What is PEFT?

Parameter-efficient fine-tuning: methods that freeze the base model and
train a small number of new or selected parameters, so gradients and
optimizer state exist only for those. LoRA is the most widely used; others
include prompt tuning and IA3.

### 21. How does LoRA work?

For a frozen linear layer `W`, LoRA adds a trainable low-rank path:
`h = W x + (alpha / r) B A x`, with `A` of shape `r x d_in` and `B` of
shape `d_out x r`. Only `A` and `B` train, so a layer adds
`r x (d_in + d_out)` parameters instead of `d_in x d_out`.

### 22. Why is `B` initialized to zero?

So the adapter is a no-op at the start: the model initially behaves
exactly like the base model, and training moves away from it smoothly.
That is PEFT's default initialization.

### 23. How many parameters does rank 16 add to a 4,096 x 4,096 projection?

`16 x (4,096 + 4,096) = 131,072`, versus 16,777,216 weights in the layer,
under 1%.

### 24. What do rank and alpha control?

Rank sets the adapter's capacity. Alpha scales the update by `alpha / r`,
so changing rank with a fixed alpha changes the effective step size.
rsLoRA scales by `alpha / sqrt(r)` instead so higher ranks do not learn
more slowly.

### 25. Which layers should LoRA target?

All linear layers (`target_modules="all-linear"` in PEFT). The Thinking
Machines "LoRA Without Regret" study found attention-only LoRA
underperforms even when its rank is raised to match the parameter count.

### 26. What learning rate does LoRA need?

Higher than full fine-tuning: the same study found the optimal LoRA rate
about 10 times the full fine-tuning rate, and TRL's guide uses `2e-4` for
LoRA SFT. Using TRL's full fine-tuning default of `2e-5` often makes the
adapter barely change the model.

### 27. When does LoRA underperform full fine-tuning?

When the dataset exceeds the adapter's capacity, such as continued
pretraining on billions of tokens or very large instruction sets.
Biderman et al. (2024) found LoRA "learns less and forgets less": weaker
on the target domain at low ranks, but better at preserving other
abilities.

### 28. What is QLoRA?

LoRA on a frozen base stored in 4-bit, with 16-bit adapters. It adds the
NF4 data type, double quantization of the scaling constants, and paged
optimizers, and the paper fine-tuned a 65B model on a single 48 GB GPU
while matching 16-bit fine-tuning quality.

### 29. What does QLoRA cost compared with LoRA?

Speed: every forward pass dequantizes 4-bit blocks to the compute type, so
steps are slower than LoRA on a 16-bit base. Use it when memory is the
constraint.

### 30. How do you configure QLoRA in Transformers and TRL?

A `BitsAndBytesConfig` with `load_in_4bit=True`,
`bnb_4bit_quant_type="nf4"`, `bnb_4bit_use_double_quant=True`, and
`bnb_4bit_compute_dtype=torch.bfloat16`, passed to `SFTTrainer` as
`quantization_config` together with a `peft_config`.

```python
trainer = SFTTrainer(model=BASE_MODEL, args=args, train_dataset=train,
                     peft_config=LoraConfig(r=16, lora_alpha=32, target_modules="all-linear"),
                     quantization_config=BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_quant_type="nf4"))
```

### 31. Why use a prompt-completion dataset for SFT?

TRL then computes the loss only on the completion by default, so the
model is trained on the answer it must produce rather than on reproducing
the system prompt and user message.

### 32. What do TRL's `SFTConfig` defaults mean for a LoRA run?

`learning_rate=2e-5` is a full fine-tuning value (raise it for LoRA),
`max_length=1024` truncates longer examples from the end, and gradient
checkpointing is on to save memory.

### 33. Why does `max_length` matter so much for structured outputs?

Truncation cuts the end of an example, which in a prompt-completion pair
is the answer. The model then learns incomplete JSON. Measure token
lengths and set `max_length` above the longest example.

### 34. How do you choose the number of epochs?

Watch validation loss: when training loss keeps falling and validation
loss rises, the adapter is memorizing. Keep the best checkpoint
(`load_best_model_at_end=True` with `metric_for_best_model="eval_loss"`)
and judge it by task metrics on the test set.

### 35. What effective batch size suits LoRA?

Moderate: the TRL guide recommends an effective batch under 32, because
LoRA is less tolerant of large batches than full fine-tuning. Effective
batch = per-device batch x gradient accumulation steps x GPUs.

### 36. Name some LoRA variants and when to try them.

DoRA (`use_dora=True`) when plain LoRA lags full fine-tuning; rsLoRA for
high ranks; PiSSA, OLoRA, or LoftQ initializations for faster convergence
or quantized bases; `modules_to_save` when new token embeddings must be
learned. Start with plain LoRA.

### 37. What checks should an adapter pass before release?

Task metrics on the held-out test set, a general regression set for
forgetting, safety and refusal cases, and a smoke test that its outputs
differ from the base model's.

### 38. Merge an adapter or keep it separate?

Merge (`merge_and_unload()`) for a standalone model with no adapter
overhead. Keep it separate to serve many adapters on one base model in
memory, to swap or roll back by name, and to limit the adapter to the
feature it was trained for.

### 39. How does multi-LoRA serving work in vLLM?

Start the server with `--enable-lora`, register adapters with
`--lora-modules name=path`, and set `--max-lora-rank` to the highest
adapter rank. Clients select an adapter by putting its name in the
request's `model` field.

### 40. Why must an adapter be stored with its exact base model?

An adapter is a set of deltas for specific weight matrices. It only works
on the base model and revision it was trained on; on a similarly named
model it fails to load or silently produces poor output.

### 41. Why merge into a 16-bit base rather than the 4-bit one after QLoRA?

Merging into quantized weights adds rounding error to the result. Load
the base in 16-bit, merge there, and quantize the merged model afterward
if needed.

## Preference tuning and reinforcement methods

### 42. What does preference tuning add beyond SFT?

SFT teaches what a good answer looks like; preference tuning teaches
which of two plausible answers is better, from comparisons or ratings
that are cheaper to collect than perfect answers.

### 43. Describe the RLHF pipeline.

SFT on demonstrations; a reward model trained on human rankings (with the
Bradley-Terry model, `P(A beats B) = sigmoid(r(A) - r(B))`); then
reinforcement learning, usually PPO, to maximize the reward minus a KL
penalty that keeps the policy near the SFT model.

### 44. Why is the KL penalty needed?

The reward model is an imperfect proxy. Without a penalty for drifting
from the reference model, the policy finds answers that score well
without being good, which is reward hacking.

### 45. What does DPO change compared with RLHF?

It shows the RLHF objective has a closed-form optimal policy, so training
becomes a classification-style loss on preference pairs. No reward model,
no sampling during training, and only two models (policy and reference).

### 46. What does `beta` do in DPO?

It controls how far the policy may move from the reference model; TRL's
default is 0.1. Higher values keep the policy closer to the reference.

### 47. Compute a DPO loss.

With `beta = 0.1`, a chosen log-ratio of +2.0 and a rejected log-ratio of
-1.0, the margin is `0.1 x 3.0 = 0.3` and the loss is
`-log sigmoid(0.3) = 0.554`. At the start, both log-ratios are 0 and the
loss is `log 2 = 0.693`.

### 48. What are DPO's common failure modes?

Length bias when raters preferred longer answers; pairs collected from a
different model (off-policy) that do not fit your model; and falling
likelihoods of both chosen and rejected answers, which an added SFT term
(`loss_type=["sigmoid", "sft"]` in TRL) counters.

### 49. What are KTO, ORPO, and SimPO?

KTO learns from single answers labelled desirable or undesirable, such as
thumbs up or down. ORPO adds an odds-ratio penalty to the SFT loss so SFT
and alignment happen in one stage without a reference model. SimPO uses
the average log-probability as the reward, adds a target margin, and
needs no reference model.

### 50. What is RLVR, and what is GRPO?

Reinforcement learning with verifiable rewards uses a reward computed by
code, such as tests or schema and field checks, instead of a learned
reward model. GRPO samples a group of answers per prompt and uses each
answer's reward relative to the group mean (divided by the group's
standard deviation) as its advantage, so no value model is needed.

### 51. What happens when every answer in a GRPO group gets the same reward?

The advantages are all zero and the prompt teaches nothing. TRL logs the
share of such groups as `frac_reward_zero_std`; fix it with partial
credit, prompts of the right difficulty, or more sampling diversity.

### 52. How do you design a verifiable reward?

Make it as strict as the real requirement, give partial credit where it
helps learning (valid shape, then each correct field), and test it on
correct, partly correct, and adversarial answers before training.

## Distillation

### 53. What is distillation, and why use it?

Training a smaller student to imitate a larger teacher, usually to cut
cost and latency for a narrow task. DistilBERT, for example, kept 97% of
BERT's language understanding while being 40% smaller and 60% faster.

### 54. Compare logit, off-policy, and on-policy distillation.

Logit distillation matches the teacher's full probability distribution
and needs those probabilities and a shared vocabulary. Off-policy
distillation fine-tunes the student on teacher-written answers and works
with an API teacher. On-policy distillation (GKD, TRL's
`DistillationTrainer`) lets the student generate and the teacher grade
each token, which fixes the train-inference mismatch but needs an open
teacher with the same vocabulary.

### 55. What is the main weakness of off-policy distillation?

The student only learns from the teacher's clean answers and never
practices recovering from its own mistakes, so it can be brittle on real
inputs. Validated, real prompts and on-policy distillation reduce this.

### 56. Why validate teacher outputs before training a student?

The student inherits the teacher's mistakes. Keep only answers that pass
schema and evaluation checks, match gold labels where they exist, and
review a sample by hand.

### 57. What legal check comes before distilling a hosted model?

Its terms of service. Anthropic's commercial terms, for example, prohibit
accessing the services "to build a competing product or service,
including to train competing AI models." Open models you are licensed to
use, or your own models, avoid the question.

### 58. When is distillation worth it?

When the task is narrow and stable, volume is high or latency matters, and
the student reaches the quality bar on the same held-out evaluation. It
is rarely worth it for low-volume features or broad open-ended tasks.

## Scenario-based questions

### 59. A team wants to fine-tune a model on the product documentation so the assistant answers support questions. What do you recommend?

**What to check first:** whether the failure is missing or outdated
knowledge, and whether answers need citations or per-customer access.

**How to confirm:** give the model the relevant documentation page in the
prompt and see whether it answers correctly; if it does, the gap is
knowledge, not behavior.

**Likely causes and fixes:** a knowledge problem being treated as a
behavior problem. Use retrieval with citations and access filters; if the
answer style still needs work, fine-tune on answer format and citation
behavior, not on the documents. See
[when to fine-tune](when-to-fine-tune.md).

### 60. The fine-tuned parser scored 12 points above the baseline offline, but production fallbacks went up. What happened?

**What to check first:** how the training and test data were collected
compared with live requests.

**How to confirm:** score the tuned model on a fresh sample of real
requests labelled after the release; compare phrasing and length
distributions with the training set.

**Likely causes and fixes:** tidy, synthetic, or old training data, or
leakage that inflated the test score. Add real requests to training and
evaluation, split by group, and re-evaluate before raising the canary. See
[when to fine-tune](when-to-fine-tune.md).

### 61. A new evaluation set shows much lower scores than the original test set. Why?

**What to check first:** overlap between training and the original test
set.

**How to confirm:** search for near-duplicates and shared projects or
customers across the splits; check whether the test set was used to pick
hyperparameters.

**Likely causes and fixes:** leakage through near-duplicates or shared
groups, or tuning against the test set. Split by group, deduplicate on
normalized text, keep a separate validation set, and refresh the test set
periodically. See [when to fine-tune](when-to-fine-tune.md).

### 62. After switching to a tuned small model, the monthly bill went up. How do you investigate?

**What to check first:** hosting charges for the custom model deployment,
not just per-token costs.

**How to confirm:** break the bill down by deployment, hosting hours, and
training jobs; compare with request volume.

**Likely causes and fixes:** an hourly hosting fee or provisioned
capacity at low traffic, idle deployments, or repeated training runs.
Include hosting in the break-even calculation, use per-token deployments
for low volume, and delete unused deployments. See
[when to fine-tune](when-to-fine-tune.md).

### 63. Your LoRA adapter's outputs look identical to the base model's. What do you check?

**What to check first:** that the adapter is actually loaded and selected
for the request.

**How to confirm:** log the adapter name per request, compare outputs with
and without `PeftModel.from_pretrained`, and check the training logs for
the learning rate and validation loss.

**Likely causes and fixes:** a wrong adapter path, the base model's name
in the request instead of the adapter's, or a full fine-tuning learning
rate such as `2e-5`. Fix the loading, log adapter selection, and retrain
with a LoRA learning rate. See
[LoRA and PEFT in practice](lora-and-peft-in-practice.md).

### 64. Some JSON answers from the tuned model stop in the middle. What is the cause?

**What to check first:** whether truncated outputs correlate with long
requests.

**How to confirm:** measure token lengths of training examples against
`max_length`, and check `max_new_tokens` at inference.

**Likely causes and fixes:** training examples longer than `max_length`
were truncated from the end, so the model learned incomplete answers, or
generation stopped at a low `max_new_tokens`. Raise or respect the limits
and drop over-long examples. See
[LoRA and PEFT in practice](lora-and-peft-in-practice.md).

### 65. Training crashes with out-of-memory errors on the first steps. What do you change?

**What to check first:** the model's 16-bit size against GPU memory, then
batch size and `max_length`.

**How to confirm:** estimate weights plus adapter state before
activations, and test with batch size 1.

**Likely causes and fixes:** a base that barely fits, or batches and
sequences too large. Lower the per-device batch and raise gradient
accumulation, keep gradient checkpointing on, shorten `max_length`, or
switch to QLoRA. See
[LoRA and PEFT in practice](lora-and-peft-in-practice.md).

### 66. vLLM refuses to load a new adapter. Why?

**What to check first:** the adapter's rank and base model.

**How to confirm:** read `adapter_config.json` for `r` and the base model
name and compare with the server's `--max-lora-rank` and model.

**Likely causes and fixes:** a rank above `--max-lora-rank`, or an
adapter trained on a different base or revision. Raise the limit to the
highest rank in use and pin the base revision in training and serving.
See [LoRA and PEFT in practice](lora-and-peft-in-practice.md).

### 67. After merging the parser adapter into the base model, other features got worse. What happened?

**What to check first:** whether the merged model replaced the base for
every feature.

**How to confirm:** run the general regression set on the base and the
merged model.

**Likely causes and fixes:** the narrow task's weight changes now apply
everywhere. Serve the adapter only for the parser and keep the base for
other features, or add general examples to the training data. See
[LoRA and PEFT in practice](lora-and-peft-in-practice.md).

### 68. Summaries became noticeably longer after DPO. Why, and what do you do?

**What to check first:** the share of preference pairs where the chosen
answer is longer.

**How to confirm:** compare average length before and after, and inspect
pairs where length was the main difference.

**Likely causes and fixes:** raters preferred longer answers and DPO
learned length as the signal. Rebalance the pairs, add brevity to the
rubric, or try a length-normalized method such as SimPO. See
[preference tuning and distillation](preference-tuning-and-distillation.md).

### 69. GRPO's training reward keeps rising, but held-out exact match is falling. What is wrong?

**What to check first:** the highest-reward samples.

**How to confirm:** read them and score them with the evaluation script;
look for outputs that satisfy the reward function without being correct.

**Likely causes and fixes:** reward hacking through a loophole in the
verifier. Tighten the reward, test it on adversarial answers, add a KL
penalty or train for fewer steps, and select checkpoints by the
evaluation. See
[preference tuning and distillation](preference-tuning-and-distillation.md).

### 70. A GRPO run shows a flat reward and a high `frac_reward_zero_std`. How do you fix it?

**What to check first:** how often groups contain only perfect or only
failing answers.

**How to confirm:** sample prompts and generate several answers each at
the training temperature.

**Likely causes and fixes:** prompts too easy or too hard for the model,
or an all-or-nothing reward. Keep prompts the model sometimes solves, add
partial credit, and raise sampling diversity. See
[preference tuning and distillation](preference-tuning-and-distillation.md).

### 71. A distilled student fails many of the same cases as the teacher, plus others. What went wrong?

**What to check first:** whether teacher outputs were validated before
training.

**How to confirm:** score the teacher's training answers against gold
labels or the schema and evaluation checks.

**Likely causes and fixes:** the student learned the teacher's errors, and
off-policy training left it brittle on its own mistakes. Filter teacher
answers, keep only those matching gold labels where available, add real
prompts, and consider on-policy distillation. See
[preference tuning and distillation](preference-tuning-and-distillation.md).

### 72. The fine-tuned model must be retrained before a fixed date. How do you make that routine?

**What to check first:** the base model's retirement date and whether the
dataset, evaluation, and training configuration are versioned.

**How to confirm:** try retraining on a newer base from the stored
artifacts in a staging run.

**Likely causes and fixes:** hosted fine-tuned models usually follow
their base model's retirement schedule, and providers change their
offerings. Keep datasets in a provider-neutral chat JSONL format, keep
the evaluation runnable against any compatible endpoint, schedule
retraining before the deadline, and keep an open-weight fallback. See
[when to fine-tune](when-to-fine-tune.md).

## Further learning

- [Fine-tuning overview](../fine-tuning.md)
- [When to fine-tune](when-to-fine-tune.md) ·
  [LoRA and PEFT in practice](lora-and-peft-in-practice.md) ·
  [Preference tuning and distillation](preference-tuning-and-distillation.md)
- [Hugging Face TRL documentation](https://huggingface.co/docs/trl/index)
- [Hugging Face PEFT documentation](https://huggingface.co/docs/peft/index)
- [Microsoft Foundry: Fine-tuning overview](https://learn.microsoft.com/en-us/azure/foundry/fine-tuning/overview)
