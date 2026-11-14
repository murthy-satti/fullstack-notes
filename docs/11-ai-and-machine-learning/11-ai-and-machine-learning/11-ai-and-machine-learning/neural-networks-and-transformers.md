# Neural Networks and Transformers

## Introduction

A **neural network** is a mathematical model made of connected operations
with parameters adjusted during training. A **transformer** is a neural
network architecture that uses attention to process relationships among
items in a sequence or other structured input. Transformers underpin many
modern language models and are also used for images, audio, video, and
multimodal tasks.

## Neural-network basics

A network receives numeric inputs, applies parameterized operations and
nonlinear transformations through layers, then produces outputs. During
training, an objective (loss) measures how far predictions are from training
targets. An optimization algorithm calculates how to adjust parameters to
reduce that loss.

- **Forward pass:** compute a model output from an input.
- **Loss:** numeric training objective measuring some prediction error.
- **Backpropagation:** calculate how the loss changes with model parameters.
- **Optimizer:** update parameters using those calculated gradients.
- **Epoch:** one pass through the training dataset, in training setups that
  use epochs.

Inference uses the learned parameters to produce outputs; it usually does
not update them.

## Attention and the transformer idea

Attention lets a model compute which parts of an input are relevant to
processing another part. In a language sequence, the representation for a
token can incorporate information from other tokens. **Self-attention**
computes these relationships within the same sequence.

The transformer architecture commonly combines attention with feed-forward
layers, residual connections, normalization, and positional information.
Details differ across model architectures. The key idea is that attention
helps model long-range relationships and can be parallelized during training
more readily than recurrent sequence processing.

In a simplified self-attention operation, each input representation is
projected into a **query (Q)**, **key (K)**, and **value (V)**. Similarity
between a query and keys determines weights over the values. Multiple
**attention heads** learn different relationships in parallel and their
results are combined. This helps the model contextualize tokens, but the
weights are not a human-readable explanation of why an answer is true.

![A transformer processes token embeddings through attention and feed-forward layers, then produces representations or next-token scores.](transformer-overview.svg)

![Self-attention compares query and key representations to weight value information, then combines several attention heads.](attention-qkv-flow.svg)

The core operation from the original transformer paper is:

\[
\operatorname{Attention}(Q, K, V) =
\operatorname{softmax}\left(\frac{QK^\top}{\sqrt{d_k}}\right)V
\]

A few lines of NumPy show it for four tokens. Decoder-style models add a
**causal mask** so that each token can only use itself and earlier tokens:

```python
# attention.py: scaled dot-product self-attention with a causal mask, as in decoder-style models
import numpy as np

rng = np.random.default_rng(2)
tokens, d_model, d_k = 4, 8, 8  # 4 tokens, 8 numbers per token

x = rng.normal(size=(tokens, d_model))  # token embeddings with position information
W_q, W_k, W_v = (rng.normal(size=(d_model, d_k)) / np.sqrt(d_model) for _ in range(3))  # learned in training
Q, K, V = x @ W_q, x @ W_k, x @ W_v

scores = Q @ K.T / np.sqrt(d_k)  # (4, 4): query-key similarity for every pair of tokens
mask = np.triu(np.ones((tokens, tokens), dtype=bool), k=1)
scores[mask] = -np.inf  # causal mask: a token cannot look at later tokens

weights = np.exp(scores - scores.max(axis=-1, keepdims=True))
weights /= weights.sum(axis=-1, keepdims=True)  # softmax over each row
output = weights @ V  # (4, 8): one contextual vector per token

print(np.round(weights, 2))
print(output.shape)
```

Output from running it with NumPy 2.5:

```text
[[1.   0.   0.   0.  ]
 [0.39 0.61 0.   0.  ]
 [0.34 0.33 0.33 0.  ]
 [0.08 0.4  0.29 0.22]]
(4, 8)
```

Each row holds one token's attention weights and sums to 1; the zeros
above the diagonal are the mask. The score matrix has one entry for every
pair of tokens, which is where the quadratic cost in sequence length
comes from. A real model repeats this in every layer, with many heads and
vectors of thousands of numbers.

### Encoder, decoder, and encoder-decoder patterns

| Pattern | Broad behavior | Common use |
|---|---|---|
| Encoder-style | Build contextual representations of the input | Classification, search embeddings, extraction |
| Decoder-style | Generate an output sequence one token at a time | Chat, completion, code generation |
| Encoder-decoder | Encode an input and generate a related output | Translation, summarization, speech or text transformations |

These are useful architectural families, not a complete list of current
designs. Some systems combine components or use other architectures.

Encoder-style models are less visible than chat models but widely
deployed. When Google added BERT, an encoder-style transformer, to Search
in October 2019, it said BERT would help Search "better understand one in
10 searches in the U.S. in English"
([Google](https://blog.google/products/search/search-language-understanding-bert/)).
Embedding models for semantic search and RAG use the same idea: they
output one vector per input instead of generating text. Some are built on
encoder models such as BERT, others on decoder models adapted for
embeddings.

Vision transformers commonly split an image into patches and process them
as a sequence of representations. Audio models may use frames, learned
tokens, or other encodings. Their inputs and training objectives are
specialized; a text-only decoder cannot automatically process raw media.

## From text to model input

Text is split into **tokens**, which are converted to numeric identifiers
and then to learned **embeddings** (vectors). The model processes these
representations and produces output scores. A decoder-style language model
selects or samples a next token, appends it to the context, and repeats
until a stopping condition is met.

The output is generated token by token. This is why a long response takes
time, why context limits matter, and why the model can produce a plausible
continuation that is not factually grounded.

## Why use transformers?

Attention gives models a flexible way to relate different positions in an
input, and large-scale training can produce representations useful across
many tasks. Trade-offs include substantial compute and memory requirements,
quadratic attention cost in some common designs with sequence length,
latency for autoregressive generation, and difficult-to-predict behavior.
Modern systems use optimizations and architectures that change these costs;
do not assume one cost profile fits every model.

Refinements found in many current models:

| Refinement | What it changes | Source |
|---|---|---|
| Mixture of experts (MoE) | A router sends each token to a few expert feed-forward blocks, so only part of the parameters run per token. Mixtral 8x7B picks 2 of 8 experts per layer: 47B parameters, 13B active | [Mixtral paper](https://arxiv.org/abs/2401.04088) |
| Grouped-query attention (GQA) | Several query heads share one key-value head, which shrinks the KV cache that inference keeps per token | [GQA paper](https://arxiv.org/abs/2305.13245) |
| Rotary position embeddings (RoPE) | Encodes token positions by rotating query and key vectors | [RoFormer paper](https://arxiv.org/abs/2104.09864) |
| FlashAttention | Computes exact attention in tiles to cut GPU memory traffic | [FlashAttention paper](https://arxiv.org/abs/2205.14135) |

MoE explains why a model's total parameter count and its per-token compute
can differ widely. [Inference and decoding](inference-and-decoding.md)
covers the KV cache, and
[serving open models](deployment-cost-and-performance/serving-open-models.md)
covers what these choices mean for GPU memory.

## Full-stack developer perspective

You generally call an inference endpoint rather than implement
backpropagation or attention yourself. Knowing the high-level flow helps
explain prompt length, context windows, streaming responses, embeddings, and
latency. For a production feature, treat the model version and its input
format as dependencies that can change.

## Common misconceptions

- Attention is a model operation, not human attention or an explicit source
  citation.
- A transformer is an architecture, not a single model or product.
- An embedding is a learned numeric representation, not a guaranteed
  definition of meaning.
- Neural networks do not retrieve exact training examples on command like a
  database query.

## Further learning

- [Attention Is All You Need](https://arxiv.org/abs/1706.03762)
- [The Illustrated Transformer](https://jalammar.github.io/illustrated-transformer/)
- [Hugging Face: How do Transformers work?](https://huggingface.co/learn/llm-course/chapter1/4)
