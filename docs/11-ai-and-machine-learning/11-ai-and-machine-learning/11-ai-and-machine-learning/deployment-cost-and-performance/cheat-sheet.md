# Deployment, Cost, and Performance Cheat Sheet

Quick revision of the deployment, cost, and performance lessons, for use
before an interview or a serving, latency, or cost task.

## Key commands

| Command | What it does |
|---|---|
| `vllm serve "$MODEL_ID" --served-model-name taskflow-chat --max-model-len 8192 --max-num-seqs 64` | OpenAI-compatible GPU server with a stable alias, capped context and concurrency |
| `--kv-cache-dtype fp8` / `--tensor-parallel-size 2` | FP8 KV cache (half the bytes per token) / split one model across 2 GPUs |
| `--max-num-batched-tokens <n>` | Tokens per step: trades a long prompt's TTFT against others' smooth streams |
| `--speculative-config '{"method": "ngram", "num_speculative_tokens": 4}'` | n-gram speculative decoding; benchmark at real load |
| `sglang serve "$MODEL_PATH" --port 30000` | SGLang server, strong on shared prefixes |
| `llama-server -hf "$GGUF_REPO:Q4_K_M" --host 127.0.0.1 --port 8080 -np 4 --metrics` | llama.cpp server with 4 slots and Prometheus metrics |
| `OLLAMA_NUM_PARALLEL=4 OLLAMA_CONTEXT_LENGTH=8192 ollama serve` | Ollama with parallel requests and a fixed context |
| `python scripts/vram_estimate.py --config config.json --params-b 8 --gpu-gib 24` | Weights, KV cache, and concurrency estimate |
| `llama-quantize model-bf16.gguf model-Q4_K_M.gguf Q4_K_M` | Quantize a GGUF file |

## Key configuration

```yaml
# k8s/vllm-chat-autoscaling.yaml (excerpt): scale vLLM on queue length with KEDA
spec:
  minReplicaCount: 1 # keep one warm replica for interactive traffic
  maxReplicaCount: 6 # no more than the GPU quota allows
  triggers:
    - type: prometheus
      metadata:
        serverAddress: http://prometheus-operated.monitoring.svc:9090
        query: sum(vllm:num_requests_waiting{namespace="taskflow", model_name="taskflow-chat"})
        threshold: "4" # average waiting requests per replica
```

## Decision guide

| If you need | Choose | Why |
|---|---|---|
| A new feature with uncertain demand | A hosted API | No idle GPUs; pay per token |
| Many users on data-center GPUs | vLLM or SGLang | Continuous batching, paged KV cache, prefix caching |
| A laptop, CPU, or edge device | Ollama or llama.cpp with GGUF | Minutes to set up, OpenAI-style API |
| To leave an existing TGI deployment | vLLM or SGLang | TGI is in maintenance mode and archived |
| A faster first token | A shorter, cacheable prompt, and streaming | Prefill grows with uncached input |
| A faster finish | Fewer output tokens, a smaller model | Decode dominates long answers |
| Cheaper work nobody waits for | A batch API or flex tier | Half the price, results within 24 hours |
| Cheaper easy requests | Per-feature routing, then a cascade | Most savings with no runtime logic |
| More concurrency on one GPU | FP8 KV cache, then 4-bit weights after evaluation | The cache, not the weights, sets concurrency |
| A model too large for one GPU | Quantize first; tensor parallelism if 16-bit is required | Splitting buys fit, not efficiency |
| Lowest cost per token | Hosted or serverless for spiky load, reserved GPUs for steady high load | Utilization decides |

## Numbers and defaults to remember

| Item | Value |
|---|---|
| KV cache per token | 2 × layers × KV heads × head_dim × bytes; 8B shape: 128 KiB, so 1 GiB per 8K conversation |
| 8B model on a 24 GB GPU | 14.9 GiB weights, about 4.7 conversations at 8K; 9.4 with an FP8 cache; 15.6 with 4-bit weights |
| End-to-end latency | TTFT + (output tokens − 1) × TPOT: 1.2 s + 399 × 0.025 s = 11.2 s |
| Speculative decoding | (1 − a^(k+1)) / (1 − a) tokens per pass: a = 0.7, k = 4 gives 2.77 |
| Decode bound | Steps/s ≤ bandwidth / bytes per step: 16 GB at 2 TB/s ≤ 125 |
| Self-hosted cost per token | G / (T × utilization): 10% utilization costs 8 times as much as 80% |
| Cascade cost | small + escalation × large: 1 + 0.3 × 10 = 4 units instead of 10 |
| Batch APIs | 50% off at OpenAI, Anthropic, and Google; up to 24 hours |
| Cached input | OpenAI up to 95% off (1,024-token minimum on recent models); Anthropic reads 0.1× (0.05× or 0.025× on some newer models), writes 1.25× (5 min) or 2× (1 h) |
| Defaults | vLLM port 8000, prefix caching on; SGLang 30000; Ollama 11434, `OLLAMA_NUM_PARALLEL=1`, queue 512; llama-server `127.0.0.1:9931` |
| vLLM `--api-key` | Covers only `/v1`, `/v2`, `/inference`, `/cohere` |
| KEDA `threshold: "4"` | 13 waiting requests → ceil(13 / 4) = 4 replicas |
| Spot GPUs | AWS gives a 2-minute interruption notice |

## Top mistakes

- **Scaling GPU servers on CPU.** Scale on `vllm:num_requests_waiting` or
  KV cache usage; scale out early and in slowly.
- **Leaving `--max-model-len` at the model maximum.** Cap it at what the
  feature needs; context is paid for in cache.
- **Relying on the engine's API key.** Keep the server internal behind a
  network policy and authenticate at a gateway.
- **Putting variable text at the top of a cached prompt.** Stable content
  first, and alert on the cache hit ratio.
- **Trimming the prompt when output length dominates.** Ask for the length
  the UI needs and set an output limit.
- **Putting tenant IDs in metric labels.** Label by feature, model, and
  token type; keep tenants in logs and a usage store.
- **Shipping a 4-bit model without evaluation.** Compare it with the
  original on your evaluation set and keep the original for rollback.
- **Scaling interactive model servers to zero.** Keep a warm replica;
  scale to zero only for batch work.

## Where to go deeper

- [Serving open models](serving-open-models.md)
- [Latency optimization](latency-optimization.md)
- [Cost optimization for LLM apps](cost-optimization-for-llm-apps.md)
- [GPU capacity and scaling](gpu-capacity-and-scaling.md)
- [Interview questions and answers](interview-questions-and-answers.md)

Back to the [Deployment, cost, and performance overview](../deployment-cost-and-performance.md).
