# Fine-Tuning Cheat Sheet

Quick revision after the fine-tuning lessons, before an interview or a
training project.

## Key commands

| Command | What it does |
|---|---|
| `pip install "transformers>=5.23" "peft>=0.21" "trl>=1.18" datasets accelerate` | Installs the training stack used in the lessons (plus PyTorch and a CUDA GPU) |
| `python scripts/build_dataset.py examples.jsonl data` | Deduplicates, validates gold answers, and group-splits into train, validation, and test |
| `python scripts/eval_task_parser.py data/test.jsonl preds/base.jsonl preds/tuned.jsonl` | Scores JSON validity, schema, per-field accuracy, and exact match per model |
| `python scripts/lora_params.py` | Counts LoRA parameters and training memory before you rent GPUs |
| `trainer.model.print_trainable_parameters()` | Confirms the adapter's share (about 0.5% of an 8B model at rank 16) |
| `PeftModel.from_pretrained(base, path).merge_and_unload()` | Folds the adapter into a 16-bit base for a standalone model |
| `vllm serve "$BASE_MODEL" --enable-lora --lora-modules name=path --max-lora-rank 16` | Serves adapters by name over one shared base model |
| `client.fine_tuning.jobs.create(..., method={"type": "supervised", ...})` | Starts a managed SFT job on Microsoft Foundry's OpenAI-compatible API |

## Key configuration

```python
# scripts/train_lora.py (excerpt): the starting point used in the lessons
peft_config = LoraConfig(r=16, lora_alpha=32, lora_dropout=0.05,
                         target_modules="all-linear", task_type="CAUSAL_LM")
args = SFTConfig(output_dir="runs/lora", learning_rate=2e-4, num_train_epochs=2,
                 warmup_steps=0.03, lr_scheduler_type="cosine",
                 per_device_train_batch_size=4, gradient_accumulation_steps=4,
                 max_length=1024, eval_strategy="steps", eval_steps=50,
                 load_best_model_at_end=True, metric_for_best_model="eval_loss")
# QLoRA: also pass quantization_config=BitsAndBytesConfig(load_in_4bit=True,
#   bnb_4bit_quant_type="nf4", bnb_4bit_use_double_quant=True,
#   bnb_4bit_compute_dtype=torch.bfloat16) to SFTTrainer
```

## Decision guide

| If you need | Choose | Why |
|---|---|---|
| Answers from changing or private documents | RAG with citations | Fine-tuning learns facts slowly and can raise hallucination |
| Valid JSON every time | Structured output with a schema | Fixes the shape without training |
| The same quality from a smaller model at high volume | SFT a small model with LoRA | Shorter prompts and faster tokens repay the one-off cost |
| A model you cannot download | The provider's managed fine-tuning | No weights, so no adapter of your own |
| A base that does not fit your GPU | QLoRA | 4-bit base, 16-bit adapter |
| Many features on one base model | Separate adapters, multi-LoRA serving | One base in memory, swap by name |
| Several valid answers, some better | DPO on pairs from your SFT model | Comparisons are cheaper than perfect answers |
| Only thumbs-up or thumbs-down feedback | KTO | Learns from unpaired binary labels |
| Quality that code can check | GRPO or managed reinforcement fine-tuning | Optimizes the real requirement |
| A large model that works but costs too much | Distillation into a smaller student | Keeps most quality on a narrow task |

## Numbers and defaults to remember

| Item | Value |
|---|---|
| Full fine-tuning with Adam | About 16 bytes per parameter: 8B model = 128 GB before activations |
| LoRA and QLoRA, 8B, rank 16 | About 16.7 GB and 4.7 GB; adapter file about 84 MB |
| LoRA parameters per layer | `r x (d_in + d_out)`: 131,072 for 4,096 x 4,096 at rank 16 (under 1%) |
| PEFT `LoraConfig` defaults | `r=8`, `lora_alpha=8`, `lora_dropout=0.0`; scale `alpha / r` |
| LoRA starting point | Rank 16, alpha 32, learning rate `2e-4`, effective batch under 32 |
| TRL guide ranks | 256 for SFT at post-training scale; 1-32 for RL |
| TRL `SFTConfig` | `learning_rate=2e-5`, `max_length=1024` (cuts the end), gradient checkpointing on |
| TRL DPO and GRPO | DPO `beta=0.1`, `learning_rate=1e-6`; GRPO 8 generations, `beta=0.0` |
| DPO loss at step 0 | `-log sigmoid(0) = log 2 = 0.693` |
| Test set of 50 examples | Each error moves the score 2 points |
| Data to start | About 100 examples (Google's guidance); LIMA: 1,000 curated |
| Break-even | One-off cost / saving per request, then divide by daily volume |
| Hosted availability | OpenAI: no new orgs since May 7, 2026, no new jobs from January 6, 2027; Gemini API: no tuning since May 2025 |

## Top mistakes

- **Fine-tuning to add facts.** Use retrieval; fine-tune behavior.
- **Beating only a naive prompt.** Compare with the best prompted
  baseline on the same held-out set.
- **Leaky splits.** Split by project or customer and deduplicate
  normalized text.
- **A full fine-tuning learning rate for LoRA.** Use about `2e-4`, and
  check that outputs differ from the base model.
- **Attention-only adapters.** Use `target_modules="all-linear"`.
- **`max_length` shorter than the examples.** Truncation cuts the answer;
  measure token lengths first.
- **Merging a QLoRA adapter into 4-bit weights.** Merge into the 16-bit
  base.
- **Distilling without checks.** Validate teacher outputs and confirm the
  teacher's terms allow it.

## Where to go deeper

- [When to fine-tune](when-to-fine-tune.md)
- [LoRA and PEFT in practice](lora-and-peft-in-practice.md)
- [Preference tuning and distillation](preference-tuning-and-distillation.md)
- [Fine-tuning interview questions and answers](interview-questions-and-answers.md)

Back to the [Fine-tuning overview](../fine-tuning.md).
