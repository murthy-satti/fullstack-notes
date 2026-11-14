# LoRA and PEFT in Practice

Low-Rank Adaptation (LoRA) is the default way to fine-tune open-weight
language models today. Instead of updating billions of weights, it freezes
the base model and trains a pair of small matrices next to selected layers,
producing an "adapter" of tens of megabytes. This lesson explains why full
fine-tuning is so memory-hungry, how LoRA and QLoRA work, how rank, alpha,
and target modules interact, and how to train, evaluate, merge, and serve
an adapter for the TaskFlow Assistant's task parser with the Hugging Face
PEFT and TRL libraries. Code was checked against the installed packages
as of November 2026: `peft` 0.21, `trl` 1.18, and `transformers` 5.23.

The previous lesson, [when to fine-tune](when-to-fine-tune.md), built the
dataset and the evaluation script used here.

## Why it matters

Full fine-tuning updates every weight, so the optimizer must keep
gradients and its own statistics for every weight too. For an 8-billion
parameter model that is well over 100 GB of accelerator memory before a
single activation is stored, which means several data-center GPUs for a
job that only teaches the model to emit tidy JSON. Each fine-tuned copy is
also a full-size model to store and serve.

LoRA changes both sides of that equation. Training needs memory for the
frozen weights plus a fraction of a percent of trainable parameters, so a
single GPU is often enough, and with QLoRA even a large model can fit. The
result is a small adapter file: many adapters can share one base model in
memory, one per feature or customer, and a bad adapter can be rolled back
by switching a name. Knowing the knobs (rank, alpha, which layers,
learning rate) is the difference between an adapter that matches full
fine-tuning and one that quietly learns nothing.

## Real-world usage

- **LoRA paper (Microsoft), 2021.**
  [LoRA: Low-Rank Adaptation of Large Language Models](https://arxiv.org/abs/2106.09685)
  reports that, compared with fully fine-tuning GPT-3 175B with Adam,
  LoRA "can reduce the number of trainable parameters by 10,000 times and
  the GPU memory requirement by 3 times," performs on par in quality, and
  adds "no additional inference latency" because the update can be merged
  into the weights.
- **QLoRA, 2023.**
  [QLoRA: Efficient Finetuning of Quantized LLMs](https://arxiv.org/abs/2305.14314)
  backpropagates through a frozen 4-bit base model into LoRA adapters,
  which "reduces memory usage enough to finetune a 65B parameter model on a
  single 48GB GPU while preserving full 16-bit finetuning task
  performance," using the NF4 data type, double quantization, and paged
  optimizers.
- **Apple Intelligence, 2024.** Apple's
  [foundation models overview](https://machinelearning.apple.com/research/introducing-apple-foundation-models)
  describes LoRA adapters for features such as summarization that "can be
  dynamically loaded, temporarily cached in memory, and swapped," and notes
  that a rank-16 adapter for its roughly 3-billion-parameter on-device
  model "typically require[s] 10s of megabytes."
- **Thinking Machines, "LoRA Without Regret", 2025.** The
  [study](https://thinkingmachines.ai/blog/lora/) finds that LoRA matches
  full fine-tuning on small and medium post-training datasets when applied
  to all layers (especially the MLP layers), with a learning rate about 10
  times higher than full fine-tuning's, and that LoRA is "less tolerant of
  large batch sizes." Hugging Face reproduced the settings in TRL's
  [LoRA Without Regret guide](https://huggingface.co/docs/trl/lora_without_regret).
- **Biderman et al., 2024.**
  [LoRA Learns Less and Forgets Less](https://arxiv.org/abs/2405.09673)
  finds that on large code and math datasets standard low-rank LoRA
  "substantially underperforms full finetuning," but "better maintains the
  base model's performance on tasks outside the target domain": the
  capacity trade-off behind choosing a rank.

**Popular tools and providers:** Hugging Face PEFT, TRL, Transformers, and
bitsandbytes; Unsloth, Axolotl, and LLaMA-Factory as training front ends;
vLLM and LoRAX for serving many adapters on one base model. (PyTorch's
torchtune is no longer actively maintained, according to its repository.)

## How it works

### Why full fine-tuning is heavy

Training with the Adam optimizer in mixed precision keeps, for every
weight, a 16-bit copy of the weight (2 bytes), a 16-bit gradient (2
bytes), and in 32-bit a master copy plus Adam's two moment estimates (12
bytes): about 16 bytes per parameter, the figure analyzed in the
[ZeRO paper](https://arxiv.org/abs/1910.02054). Activations come on top
and grow with batch size and sequence length.

```text
8B parameters x 16 bytes = 128 GB   (full fine-tuning, before activations)
8B parameters x  2 bytes =  16 GB   (the same model, frozen, in 16-bit)
8B parameters x 0.5 byte =   4 GB   (frozen in 4-bit, as QLoRA stores it)
```

If only a small set of new parameters is trainable, the 14 bytes per
parameter of gradient and optimizer state apply only to them. That is the
whole idea of parameter-efficient fine-tuning (PEFT).

### The LoRA update

A linear layer computes `h = W x`, where `W` has shape
`d_out x d_in`. LoRA freezes `W` and adds a low-rank path:

```text
h = W x + (alpha / r) * B (A x)

A: r x d_in    (trainable, random init)
B: d_out x r   (trainable, initialized to zero)
r: the rank, much smaller than d_in and d_out (for example 16)
```

Because `B` starts at zero, the adapter is a no-op before training: the
model behaves exactly like the base model at step 0, which keeps early
training stable (PEFT's default initialization). The trainable weights
per layer are `r x (d_in + d_out)` instead of `d_in x d_out`. For a
4096 x 4096 projection at rank 16, that is 131,072 weights instead of
16,777,216, under 1%.

The bet behind LoRA is that the *change* a fine-tuning task needs has low
"intrinsic rank": a narrow behavior can be expressed as a small number of
directions in weight space. That bet holds well for format, style, and
task behavior, and less well for absorbing large amounts of new
knowledge, which is where a higher rank or full fine-tuning helps.

![Diagram: on the left, an input vector x enters two paths. The upper path is a large blue square labelled "W, frozen, 4096 by 4096, 16.8 million weights". The lower path goes through a narrow orange box "A, 16 by 4096, trainable" and then a tall orange box "B, 4096 by 16, trainable, starts at zero", together 131 thousand weights, followed by a purple circle "times alpha over r". Both paths meet at a plus sign that outputs h. Below, a note says that after training, B times A times alpha over r can be added into W once, so the merged model has no extra latency, or kept separate as an adapter file that can be swapped.](lora-low-rank-update.svg)

### Rank, alpha, and scaling

- **Rank `r`** sets capacity. Small ranks (8-32) suit narrow tasks such as
  the TaskFlow parser; TRL's guide recommends rank 256 for SFT at
  "post-training scale" and 1-32 for reinforcement learning, which needs
  very little capacity.
- **Alpha** scales the update by `alpha / r`. Changing `r` while keeping
  `alpha` fixed changes the effective step size, which is why ranks and
  learning rates interact. A common habit is `alpha = 2r` or a fixed alpha
  such as 16 or 32; PEFT's defaults are `r=8` and `lora_alpha=8`.
- **rsLoRA** (`use_rslora=True` in PEFT) scales by `alpha / sqrt(r)`
  instead, from
  [Kalajdzievski (2023)](https://arxiv.org/abs/2312.03732), which keeps
  higher ranks from learning more slowly.
- **Dropout** on the LoRA path (`lora_dropout`, default 0.0) is a mild
  regularizer for small datasets.

### Which layers to adapt

Early LoRA work often adapted only the attention query and value
projections. Current evidence favors adapting every linear layer: the
Thinking Machines study found attention-only LoRA underperforms even when
its rank is raised to match the parameter count. In PEFT,
`target_modules="all-linear"` selects every linear layer except the output
head. The parameter cost for an 8B-class decoder (32 layers, hidden size
4,096, MLP size 14,336, 8 key-value heads) is small either way:

| Rank | Attention only | All linear | Share of 8B |
|---:|---:|---:|---:|
| 8 | 6,815,744 | 20,971,520 | 0.26% |
| 16 | 13,631,488 | 41,943,040 | 0.52% |
| 64 | 54,525,952 | 167,772,160 | 2.10% |
| 256 | 218,103,808 | 671,088,640 | 8.39% |

The numbers come from the parameter calculator in the practical examples.

### QLoRA: a 4-bit base under a 16-bit adapter

QLoRA keeps LoRA's trainable matrices in 16-bit but stores the frozen base
in 4-bit, with three tricks from the paper:

1. **NF4 (4-bit NormalFloat)**, a data type whose 16 levels are spaced for
   normally distributed weights, losing less information than plain 4-bit
   integers.
2. **Double quantization**, which quantizes the per-block scaling
   constants themselves to save a little more memory.
3. **Paged optimizers**, which move optimizer state to CPU memory during
   spikes instead of crashing with out-of-memory errors.

During the forward pass each 4-bit block is dequantized to the compute
type (usually bfloat16) on the fly, so QLoRA trades some speed for memory.
In Transformers this is a `BitsAndBytesConfig` with `load_in_4bit=True`,
`bnb_4bit_quant_type="nf4"`, `bnb_4bit_use_double_quant=True`, and
`bnb_4bit_compute_dtype=torch.bfloat16`; the bitsandbytes library has the
most complete support on NVIDIA GPUs.

![Diagram: three horizontal bars on a shared scale of gigabytes for an 8B model with a rank-16 adapter, before activations. Full fine-tuning: a red bar of 128 GB made of 16 GB of 16-bit weights and 112 GB of gradients, master weights, and Adam state. LoRA on a 16-bit base: a blue bar of about 16.7 GB, almost all frozen weights, with a thin orange sliver of 0.7 GB for the adapter and its optimizer state. QLoRA on a 4-bit base: a green bar of about 4.7 GB, 4 GB of 4-bit weights plus the same 0.7 GB sliver. A note says activations add more memory and grow with batch size and sequence length.](lora-memory-comparison.svg)

### Variants worth knowing

PEFT implements dozens of methods; a few matter in practice:

| Option | What it changes | When to try it |
|---|---|---|
| `use_dora=True` | DoRA splits each weight into magnitude and direction and applies LoRA to the direction ([Liu et al., 2024](https://arxiv.org/abs/2402.09353)) | When plain LoRA lags full fine-tuning; slower to train |
| `use_rslora=True` | Rank-stabilized scaling `alpha / sqrt(r)` | High ranks |
| `init_lora_weights="pissa"` and others | Initializes A and B from the base weights (PiSSA, OLoRA, LoftQ, and more) instead of zeros | Faster convergence; LoftQ pairs with quantized bases |
| `modules_to_save=[...]` | Trains and saves full copies of chosen modules | New tokens whose embeddings must be learned |

Start with plain LoRA on all linear layers; reach for variants only when
evaluation shows a gap.

### Training with TRL

TRL's `SFTTrainer` handles tokenization, chat templates, loss masking,
and the PEFT wrapping. Three behaviors matter for a task like TaskFlow's:

- **Dataset format.** A *prompt-completion* dataset, where `prompt` holds
  the system and user messages and `completion` holds the assistant
  answer, computes the loss on the completion only by default
  (`completion_only_loss=None` means "decide from the dataset"). The model
  is graded on the JSON it writes, not on reproducing your system prompt.
- **PEFT integration.** Passing `peft_config=LoraConfig(...)` wraps the
  model; passing `quantization_config=BitsAndBytesConfig(...)` as well
  loads the base in 4-bit, which together is QLoRA.
- **Defaults.** TRL's `SFTConfig` defaults to `learning_rate=2e-5`, a
  full-fine-tuning value, `max_length=1024` with truncation from the end,
  and gradient checkpointing on. For LoRA, raise the learning rate.

### Hyperparameters

| Setting | Starting point | Why |
|---|---|---|
| `r` | 16 for a narrow task; up to 256 for large SFT datasets | Capacity must match the dataset |
| `lora_alpha` | 32 (with `r=16`) | Sets the update scale `alpha / r` |
| `target_modules` | `"all-linear"` | Attention-only adapters underperform |
| `learning_rate` | `2e-4` | About 10x a full fine-tuning rate; TRL's guide uses it for SFT |
| Effective batch size | 16 (`per_device_train_batch_size` x `gradient_accumulation_steps` x GPUs) | LoRA prefers effective batches under 32 |
| `num_train_epochs` | 1-3 | Watch validation loss; small datasets overfit fast |
| `warmup_steps` | `0.03` (a float below 1 is a fraction of all steps) | Transformers 5 replaced `warmup_ratio` with this |
| `lr_scheduler_type` | `"cosine"` | Smooth decay after warmup |
| `max_length` | Longer than your longest example | Truncation cuts the end, which is the answer |

Change one setting at a time and compare on the validation set. The
learning rate matters most: too low and the adapter barely moves (its
output looks like the base model's); too high and validation loss climbs
after a few hundred steps.

### Evaluating an adapter

Training loss falling is necessary, not sufficient. Use four checks:

1. **Task metrics on the held-out test set**, with the same
   `eval_task_parser.py` used for the baseline: JSON validity, field
   accuracy, exact match.
2. **Validation loss per checkpoint.** When training loss keeps falling
   but validation loss rises, the adapter is memorizing; keep the best
   checkpoint (`load_best_model_at_end=True`).
3. **A regression set of general tasks** the product still relies on
   (summaries, other prompts), to catch forgetting. LoRA forgets less than
   full fine-tuning, but not nothing.
4. **Safety and refusal cases**, because a narrow dataset with no
   refusals can erode refusal behavior.

The [evals in CI lesson](../evaluation-and-monitoring/evals-in-ci-and-regression-testing.md)
shows how to run these checks automatically on every new adapter.

### Serving: separate adapters or a merged model

An adapter can be **merged** into the base (`merge_and_unload()` adds
`(alpha/r) B A` into `W`), producing an ordinary model with no extra
latency, or **kept separate**, so one base model in GPU memory serves
many adapters. vLLM supports the second pattern: start it with
`--enable-lora` and `--lora-modules name=path`, and clients select an
adapter by passing its name as the `model` in an OpenAI-compatible
request. Serving at scale is covered in
[serving open models](../deployment-cost-and-performance/serving-open-models.md).

![Diagram: a left-to-right pipeline. An orange "train.jsonl and validation.jsonl" box feeds a purple "SFTTrainer with LoraConfig" box, which outputs a small orange "adapter, about 84 MB" file. The adapter passes three green evaluation gates in a column: task metrics on the test set, general regression set, and safety cases; a red arrow from the gates goes back to training labelled "fails: adjust data or settings". On the right, a blue "vLLM server" box holds one base model in GPU memory with three adapters attached: taskflow-parser, meeting-summary, and parser-v2 as a canary. The TaskFlow API chooses an adapter by putting its name in the request's model field. A dashed alternative path shows "merge_and_unload: one standalone model".](lora-train-eval-serve.svg)

## When to use and when not to use

| Situation | Choice | Why |
|---|---|---|
| Narrow task behavior on an open model | LoRA, `r` 8-32, all linear layers | Small, fast, matches full fine-tuning at this scale |
| Large instruction dataset (hundreds of thousands of examples) | LoRA with a high rank, or full fine-tuning | Low ranks run out of capacity |
| Continued pretraining on billions of domain tokens | Full fine-tuning | LoRA "learns less" at this scale |
| A large model that does not fit on available GPUs | QLoRA | 4-bit base, 16-bit adapter |
| Many features or tenants sharing one base model | Separate adapters with multi-LoRA serving | One base in memory; swap by name |
| Lowest possible latency for one task | Merge the adapter | No adapter overhead at inference |
| A hosted model you cannot download | The provider's fine-tuning service | No weights, so no LoRA of your own |

## Practical examples

### Count parameters and memory before you train

This calculator reproduces the table above and the memory estimate, so
you can plug in your own model's dimensions from its `config.json`.

```python
# scripts/lora_params.py
"""Count LoRA parameters and estimate training memory for an 8B-class decoder."""
LAYERS, HIDDEN, MLP, KV_OUT = 32, 4096, 14336, 1024  # 8 KV heads x 128 dims
TOTAL_PARAMS = 8.0e9
LINEAR = {  # module name: (in_features, out_features), per decoder layer
    "q_proj": (HIDDEN, HIDDEN),
    "k_proj": (HIDDEN, KV_OUT),
    "v_proj": (HIDDEN, KV_OUT),
    "o_proj": (HIDDEN, HIDDEN),
    "gate_proj": (HIDDEN, MLP),
    "up_proj": (HIDDEN, MLP),
    "down_proj": (MLP, HIDDEN),
}
ATTENTION = {"q_proj", "k_proj", "v_proj", "o_proj"}


def lora_params(rank: int, modules: set[str]) -> int:
    """A LoRA pair adds A (rank x in) and B (out x rank): rank * (in + out) weights."""
    return LAYERS * sum(rank * (i + o) for name, (i, o) in LINEAR.items() if name in modules)


def gb(n_bytes: float) -> str:
    return f"{n_bytes / 1e9:,.1f} GB"


print(f"{'rank':>4} {'attention only':>16} {'all linear':>14} {'% of model':>11}")
for rank in (8, 16, 64, 256):
    attn, every = lora_params(rank, ATTENTION), lora_params(rank, set(LINEAR))
    print(f"{rank:>4} {attn:>16,} {every:>14,} {every / TOTAL_PARAMS:>10.2%}")

adapter = lora_params(16, set(LINEAR))
print("\nMemory before activations (r=16, all linear, Adam):")
print("full fine-tuning, mixed precision:", gb(TOTAL_PARAMS * 16))  # 2 + 2 + 12 bytes per weight
print("LoRA on a 16-bit base:           ", gb(TOTAL_PARAMS * 2 + adapter * 16))
print("QLoRA on a 4-bit base:           ", gb(TOTAL_PARAMS * 0.5 + adapter * 16))
print("adapter file in 16-bit:          ", f"{adapter * 2 / 1e6:,.0f} MB")
```

Output:

```text
rank   attention only     all linear  % of model
   8        6,815,744     20,971,520      0.26%
  16       13,631,488     41,943,040      0.52%
  64       54,525,952    167,772,160      2.10%
 256      218,103,808    671,088,640      8.39%

Memory before activations (r=16, all linear, Adam):
full fine-tuning, mixed precision: 128.0 GB
LoRA on a 16-bit base:            16.7 GB
QLoRA on a 4-bit base:            4.7 GB
adapter file in 16-bit:           84 MB
```

### Train a LoRA adapter with TRL

The script turns the chat-format splits from the previous lesson into
prompt-completion rows and trains an adapter. The base model comes from
the `BASE_MODEL` environment variable: choose an instruct model whose
license fits your use, whose prompted baseline is already close, and that
fits your hardware.

```bash
# requirements: a CUDA GPU; versions as checked for this lesson
pip install "torch>=2.6" "transformers>=5.23" "peft>=0.21" "trl>=1.18" datasets accelerate
```

```python
# scripts/train_lora.py
"""Train a LoRA adapter for the TaskFlow task parser with TRL's SFTTrainer."""
import os

from datasets import load_dataset
from peft import LoraConfig
from trl import SFTConfig, SFTTrainer

BASE_MODEL = os.environ["BASE_MODEL"]  # a Hub model ID or local path, from configuration


def to_prompt_completion(row: dict) -> dict:
    *prompt, answer = row["messages"]  # system + user messages, then the gold answer
    return {"prompt": prompt, "completion": [answer]}


data = load_dataset(
    "json", data_files={"train": "data/train.jsonl", "validation": "data/validation.jsonl"}
)
data = data.map(to_prompt_completion, remove_columns=["messages"])

peft_config = LoraConfig(
    r=16,
    lora_alpha=32,
    lora_dropout=0.05,
    target_modules="all-linear",
    task_type="CAUSAL_LM",
)

args = SFTConfig(
    output_dir="runs/taskflow-parser-lora",
    num_train_epochs=2,
    learning_rate=2e-4,
    lr_scheduler_type="cosine",
    warmup_steps=0.03,
    per_device_train_batch_size=4,
    gradient_accumulation_steps=4,  # effective batch size 16 on one GPU
    max_length=1024,
    eval_strategy="steps",
    eval_steps=50,
    save_steps=50,
    load_best_model_at_end=True,
    metric_for_best_model="eval_loss",
    bf16=True,
    report_to="none",
    seed=42,
)

trainer = SFTTrainer(
    model=BASE_MODEL,
    args=args,
    train_dataset=data["train"],
    eval_dataset=data["validation"],
    peft_config=peft_config,
)
trainer.model.print_trainable_parameters()
trainer.train()
trainer.save_model("adapters/taskflow-parser")  # writes the adapter weights and config only
```

Parts: `to_prompt_completion` makes the loss cover only the assistant's
JSON; `LoraConfig` adapts every linear layer at rank 16 with scale
`32 / 16 = 2`; `SFTConfig` raises the learning rate to a LoRA value,
evaluates and checkpoints every 50 steps, and restores the checkpoint with
the lowest validation loss at the end; `print_trainable_parameters()`
should report roughly half a percent for an 8B-class model; and
`save_model` writes `adapter_model.safetensors` plus
`adapter_config.json`, which records the base model it belongs to.

### Switch to QLoRA when the model does not fit

Only the model loading changes. TRL applies the quantization when it
loads the model from the ID, and the LoRA layers stay in 16-bit.

```python
# scripts/train_qlora.py: the same as train_lora.py except for these lines
import torch
from transformers import BitsAndBytesConfig

quantization_config = BitsAndBytesConfig(
    load_in_4bit=True,
    bnb_4bit_quant_type="nf4",
    bnb_4bit_use_double_quant=True,
    bnb_4bit_compute_dtype=torch.bfloat16,
)

trainer = SFTTrainer(
    model=BASE_MODEL,
    args=args,
    train_dataset=data["train"],
    eval_dataset=data["validation"],
    peft_config=peft_config,
    quantization_config=quantization_config,  # requires the bitsandbytes package
)
```

Expect slower steps than LoRA on a 16-bit base, because every forward pass
dequantizes the weights. Use QLoRA when memory is the constraint, not by
default.

### Generate predictions and compare with the base model

To evaluate, load the base model, attach the adapter, and write the
predictions file that `eval_task_parser.py` expects. Running the same
script with `none` instead of an adapter path produces the base model's
predictions.

```python
# scripts/predict.py
"""Write test-set predictions for the base model, optionally with a LoRA adapter."""
import json
import os
import sys

import torch
from peft import PeftModel
from transformers import AutoModelForCausalLM, AutoTokenizer

BASE_MODEL = os.environ["BASE_MODEL"]
adapter_dir, test_path, out_path = sys.argv[1], sys.argv[2], sys.argv[3]

tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL)
model = AutoModelForCausalLM.from_pretrained(BASE_MODEL, dtype=torch.bfloat16, device_map="auto")
if adapter_dir != "none":
    model = PeftModel.from_pretrained(model, adapter_dir)
model.eval()

with open(test_path, encoding="utf-8") as src, open(out_path, "w", encoding="utf-8") as out:
    for index, line in enumerate(src):
        messages = json.loads(line)["messages"][:-1]  # drop the gold answer
        inputs = tokenizer.apply_chat_template(
            messages, add_generation_prompt=True, return_tensors="pt"
        ).to(model.device)
        with torch.no_grad():
            output = model.generate(**inputs, max_new_tokens=128, do_sample=False)
        new_tokens = output[0][inputs["input_ids"].shape[1]:]
        text = tokenizer.decode(new_tokens, skip_special_tokens=True).strip()
        out.write(json.dumps({"index": index, "output": text}) + "\n")
```

```bash
python scripts/predict.py none data/test.jsonl preds/base.jsonl
python scripts/predict.py adapters/taskflow-parser data/test.jsonl preds/lora.jsonl
python scripts/eval_task_parser.py data/test.jsonl preds/base.jsonl preds/lora.jsonl
```

`apply_chat_template` uses the same chat template the trainer used, which
matters: a model trained with one template and served with another often
ignores what it learned. In Transformers 5 it returns a dictionary of
tensors by default, hence `**inputs`. Greedy decoding (`do_sample=False`)
makes runs repeatable.

### Merge the adapter, or serve it next to the base model

Merging gives a standalone model for runtimes that do not support
adapters. Merge into the 16-bit base, never into a 4-bit one.

```python
# scripts/merge_adapter.py
"""Fold the LoRA update into the base weights and save a standalone model."""
import os

import torch
from peft import PeftModel
from transformers import AutoModelForCausalLM, AutoTokenizer

BASE_MODEL = os.environ["BASE_MODEL"]

base = AutoModelForCausalLM.from_pretrained(BASE_MODEL, dtype=torch.bfloat16)
merged = PeftModel.from_pretrained(base, "adapters/taskflow-parser").merge_and_unload()
merged.save_pretrained("models/taskflow-parser-merged")
AutoTokenizer.from_pretrained(BASE_MODEL).save_pretrained("models/taskflow-parser-merged")
```

To keep adapters separate, start vLLM with the base model and register
each adapter under a name:

```bash
# one base model in GPU memory, adapters selected per request by name
vllm serve "$BASE_MODEL" \
  --enable-lora \
  --lora-modules taskflow-parser=./adapters/taskflow-parser \
  --max-lora-rank 16

curl -s http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model": "taskflow-parser", "temperature": 0,
       "messages": [{"role": "user", "content": "Today is 2026-11-16.\nFix the login page by Friday"}]}'
```

The TaskFlow API code from the previous lesson works unchanged: set
`AI_BASE_URL` to the vLLM server's `/v1` URL and `TASK_PARSER_MODEL` to
`taskflow-parser`. `--max-lora-rank` must be at least the highest rank
among the adapters; setting it much higher wastes memory. vLLM can also
load adapters at runtime through an API, but its documentation warns that
this is for trusted, isolated environments only.

## Best practices

- Count trainable parameters and memory before renting hardware.
- Start with plain LoRA on all linear layers, rank 16, alpha 32, and a
  learning rate around `2e-4`; change one setting at a time.
- Use a prompt-completion dataset so the loss covers only the answer.
- Set `max_length` above your longest example and check how many examples
  would be truncated.
- Keep the best checkpoint by validation loss, and judge it by task
  metrics on the held-out test set.
- Run a general regression set and a safety set on every adapter.
- Store the adapter with the exact base model ID and revision it was
  trained on; an adapter only works on that base.
- Merge into a 16-bit base when you need a standalone model, and keep
  adapters separate when several features share one base.

## In production

- **The tuned model answers exactly like the base model.**
  *Detect:* predictions are identical with and without the adapter;
  validation loss barely moved. *Cause:* the adapter was never loaded (a
  wrong path or a missing `PeftModel.from_pretrained`), the request used
  the base model's name instead of the adapter's, or the learning rate was
  a full fine-tuning value such as `2e-5`. *Fix:* log which adapter served
  each request, assert that outputs differ on a smoke test, and use a LoRA
  learning rate.
- **JSON answers are cut off in the middle.**
  *Detect:* truncated outputs cluster on long requests; the training data
  has examples longer than `max_length`. *Cause:* truncation dropped the
  end of long examples, so the model learned incomplete answers. *Fix:*
  measure token lengths, raise `max_length` or drop over-long examples, and
  set `max_new_tokens` high enough at inference.
- **Validation loss rises while training loss keeps falling.**
  *Detect:* the curves diverge after the first epoch; test exact match
  drops for later checkpoints. *Cause:* overfitting a small dataset with
  too many epochs or too high a rank. *Fix:* keep the best checkpoint,
  reduce epochs, add data, or lower the rank and learning rate.
- **The server refuses to load the adapter.**
  *Detect:* vLLM startup or load errors mentioning rank or shapes. *Cause:*
  the adapter rank exceeds `--max-lora-rank`, or the adapter was trained
  on a different base model or revision. *Fix:* set `--max-lora-rank` to
  the highest adapter rank, and pin the base model revision in both
  training and serving.
- **Quality drops after merging a QLoRA adapter.**
  *Detect:* the merged model scores lower than the base plus adapter.
  *Cause:* the adapter was merged into the quantized 4-bit weights, adding
  rounding error. *Fix:* load the base in 16-bit, merge there, and
  re-quantize the merged model for serving if needed.
- **Other features get worse after the adapter ships.**
  *Detect:* the general regression set or user feedback shows weaker
  summaries or chat after a merged model replaced the base. *Cause:* the
  merged weights now carry the narrow task everywhere. *Fix:* serve the
  adapter only for its feature (keep the base for everything else) or mix
  general examples into the training data.
- **Training crashes with out-of-memory errors.**
  *Detect:* CUDA out-of-memory at the first steps or on long batches.
  *Cause:* batch size and `max_length` too large for the GPU, or a base
  model that does not fit in 16-bit. *Fix:* lower the per-device batch and
  raise gradient accumulation, keep gradient checkpointing on (TRL's
  default), shorten `max_length`, or switch to QLoRA.

## Important terminology

- **PEFT (parameter-efficient fine-tuning):** Methods that train a small
  number of parameters while the base model stays frozen.
- **LoRA:** Adds a trainable low-rank update `(alpha/r) B A` beside frozen
  linear layers.
- **Adapter:** The saved LoRA weights and configuration, usable only with
  their base model.
- **Rank (`r`):** The inner dimension of the LoRA matrices; sets capacity.
- **Alpha:** The scale numerator; the update is multiplied by
  `alpha / r` (or `alpha / sqrt(r)` with rsLoRA).
- **Target modules:** The layers that receive adapters; `all-linear` in
  PEFT covers every linear layer except the output head.
- **QLoRA:** LoRA on a frozen base stored in 4-bit NF4, with double
  quantization and paged optimizers.
- **Merging:** Adding the LoRA update into the base weights to produce a
  standalone model.
- **Multi-LoRA serving:** One base model in memory serving many adapters
  chosen per request.
- **Completion-only loss:** Computing the training loss only on the
  answer tokens, not the prompt.

## Common mistakes and misconceptions

- Using a full fine-tuning learning rate for LoRA and concluding that LoRA
  does not work.
- Adapting only attention projections and compensating with a higher rank.
- Believing a higher rank is always better; capacity should match the
  dataset, and higher ranks overfit small ones.
- Training on the whole conversation, so the model spends capacity
  learning to repeat the system prompt.
- Loading an adapter onto a different base model, or a different revision
  of the same one.
- Merging a QLoRA adapter into 4-bit weights.
- Judging an adapter by training loss instead of held-out task metrics.
- Assuming QLoRA is free; it is slower per step than LoRA on a 16-bit base.

## Revision questions

1. Why does full fine-tuning with Adam need about 16 bytes per parameter,
   and which of those bytes does LoRA avoid?
2. Write the LoRA forward pass and explain why `B` is initialized to zero.
3. A layer maps 4,096 inputs to 14,336 outputs. How many LoRA parameters
   does rank 32 add, and what fraction of the layer is that?
   (32 x (4,096 + 14,336) = 589,824, about 1% of 58,720,256.)
4. What does `alpha / r` control, and what happens if you double `r`
   without changing alpha?
5. Explain the three QLoRA techniques and the speed cost.
6. Why does a prompt-completion dataset produce a better task parser than
   training on full conversations?
7. When would you merge an adapter, and when keep it separate?
8. Your adapter's outputs are identical to the base model's. List three
   possible causes.

## Further learning

- [Hugging Face PEFT: LoRA developer guide](https://huggingface.co/docs/peft/developer_guides/lora)
- [Hugging Face PEFT: LoRA configuration reference](https://huggingface.co/docs/peft/package_reference/lora)
- [Hugging Face TRL: SFT Trainer](https://huggingface.co/docs/trl/sft_trainer)
- [Hugging Face TRL: PEFT integration](https://huggingface.co/docs/trl/peft_integration)
- [Hugging Face Transformers: bitsandbytes quantization](https://huggingface.co/docs/transformers/quantization/bitsandbytes)
- [vLLM: LoRA adapters](https://docs.vllm.ai/en/latest/features/lora.html)
- Next: [preference tuning and distillation](preference-tuning-and-distillation.md).
  Back to the [fine-tuning overview](../fine-tuning.md).
