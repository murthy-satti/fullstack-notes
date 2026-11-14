# Deployment Cost and Performance Interview Questions and Answers

Questions and answers on serving open models, latency, cost, and GPU
capacity, grouped by lesson, followed by production scenarios. Answers are
short enough to say aloud; follow the links for depth.

## Serving open models

### 1. Why does a dedicated serving engine outperform calling a model's `generate` function once per request?

Decoding produces one token per forward pass, and each pass reads all the
weights from GPU memory, so a single sequence leaves the GPU's arithmetic
units mostly idle. An engine such as vLLM or SGLang runs many sequences in
the same pass (continuous batching), reusing every weight read for all of
them, and manages the KV cache efficiently so more sequences fit. The same
GPU serves many times more users.

### 2. What are prefill and decode, and why do they behave differently?

Prefill processes the whole prompt in one parallel pass, fills the KV cache,
and produces the first token; it is compute-bound. Decode then generates one
token per step; it is memory-bandwidth-bound because each step moves the
weights and the sequence's cache for little arithmetic. Prefill mostly sets
time to first token, decode sets the rest of the latency.

### 3. What is the KV cache, and how do you size it per token?

The stored attention keys and values for every token of every active
sequence, so attention does not recompute the history at each step.
Bytes per token = 2 x layers x KV heads x head dimension x bytes per value.
For 32 layers, 8 KV heads, head dimension 128, and 16-bit values, that is
128 KiB per token, or 1 GiB for an 8,192-token conversation.

### 4. What problem does PagedAttention solve?

Older servers reserved one contiguous slab of cache per request, sized for
the maximum length, wasting most of it; the vLLM paper measured that only
20-38% of cache memory held real tokens. PagedAttention splits the cache into
fixed-size blocks (16 tokens by default in the paper) mapped through
per-sequence block tables, allocates blocks as tokens arrive, and lets
sequences share prefix blocks. Waste drops to part of one block per sequence.

### 5. What is continuous batching, and how does it differ from static batching?

Static batching runs a batch until its longest sequence finishes, so short
sequences leave idle slots and new requests wait. Continuous batching
(iteration-level scheduling, introduced by Orca) decides at every decode
step: finished sequences leave, waiting requests join, and the batch stays
full. Throughput rises and queueing falls.

### 6. What is chunked prefill, and what does vLLM's `--max-num-batched-tokens` trade?

Chunked prefill splits a long prompt's prefill into pieces mixed into decode
steps, so one huge prompt does not freeze everyone's streaming.
`--max-num-batched-tokens` caps the tokens processed per step: smaller
values keep other streams smooth, larger values give long prompts a faster
first token.

### 7. What is preemption in a serving engine, and what does frequent preemption mean?

When the KV cache fills, the engine pauses a running sequence, frees its
blocks, and later recomputes or reloads them. Occasional preemption during
bursts is normal; a steady rate means the server admits more concurrent work
than its memory holds. Fix it with fewer concurrent sequences, shorter
context caps, output limits, cache quantization, or more replicas.

### 8. How does prefix caching work, and how should prompts be laid out for it?

The engine keeps KV blocks of finished requests keyed by a hash of their
tokens; a new prompt that starts with the same tokens reuses them and skips
that prefill. vLLM enables it by default, and SGLang's RadixAttention is
built around it. Put stable content first (instructions, tool definitions,
shared documents) and variable content last, byte-for-byte identical across
requests.

### 9. When would you choose vLLM, SGLang, llama.cpp, or Ollama?

vLLM or SGLang for multi-user serving on data-center GPUs; SGLang is
especially strong with shared prefixes (agents, multi-turn chat). llama.cpp
for CPUs, Apple silicon, single GPUs, and edge devices with GGUF models.
Ollama for developer laptops and quick prototypes, accepting less control.
Benchmark with your own prompts and concurrency before deciding.

### 10. What is the status of Text Generation Inference, and what should a team using it do?

Its README says it is in maintenance mode and recommends vLLM, SGLang, or
local engines such as llama.cpp and MLX; as of November 2026 the repository
is archived, with the last release in December 2025. Existing users should
plan a migration and benchmark the replacement on their workload; new
projects should not start on it.

### 11. What does "OpenAI-compatible" guarantee, and what does it not?

It guarantees routes and request and response shapes for common fields
(`/v1/chat/completions`, `/v1/models`, often `/v1/responses` and
`/v1/embeddings`), so the official SDKs work by changing the base URL. It
does not guarantee identical behavior for tool calling, structured output,
reasoning output, or every sampling parameter; those depend on the engine
and the model's chat template, so test the features you use.

### 12. How do you secure a self-hosted model server?

Keep it internal: a ClusterIP Service, no public IP, and a network policy
that admits only the backend. Do not rely on the engine's API key: vLLM's
`--api-key` covers only routes under `/v1`, `/v2`, `/inference`, and
`/cohere`, leaving others such as `/invocations` open. Authenticate at a
gateway, log access, and audit exposed ports.

### 13. What does a model server on Kubernetes need that a web API does not?

A GPU request (`nvidia.com/gpu`) with the device plugin or GPU operator,
tolerations for tainted GPU nodes, a startup probe sized for minutes of
weight loading, a persistent or node-local model cache, a memory-backed
`/dev/shm` volume, the Hugging Face token from a Secret, and autoscaling on
queue metrics rather than CPU.

### 14. Why give a deployment a served-model alias?

`--served-model-name taskflow-chat` decouples the application from the
underlying model ID. Configuration says `CHAT_MODEL=taskflow-chat`; swapping
the model behind it is an infrastructure change with no code release, and
metrics carry the alias in their `model_name` label.

### 15. How do you prove a new deployment serves the right model correctly?

A `/health` check only proves the process is up. A smoke test after each
deploy lists `/v1/models` to confirm the alias is served, sends a short real
request through the same client code, and checks the output is plausible
(for example, that owners named in meeting notes appear in the summary).

## Latency optimization

### 16. Define TTFT, TPOT, and end-to-end latency, and how they relate.

TTFT is time to first token (network, queue, and prefill). TPOT, or
inter-token latency, is the average gap between later tokens. End-to-end
latency is approximately TTFT + (output tokens - 1) x TPOT, plus
application work.

### 17. Why does output length usually dominate latency? Give an example.

Each output token is a sequential decode step. With a TTFT of 1.2 s and 40
tokens per second, 400 output tokens take 1.2 + 399 x 0.025 = 11.2 s; cutting
output to 150 tokens gives about 4.9 s even with no other change. Prompt
changes mostly move TTFT; output changes move everything.

### 18. How does prompt length affect latency?

Prefill time grows with the number of input tokens that must be processed,
so long prompts delay the first token, especially when most of the input is
new. Send fewer, better retrieved passages, trim conversation history, strip
unneeded markup, and make the stable part cacheable.

### 19. How does prompt caching reduce latency, and what breaks it?

The provider or engine reuses the processed prefix of a prompt it has seen
recently, skipping that prefill. It requires an identical prefix and a
minimum length (1,024 tokens on recent OpenAI models; it varies elsewhere).
A timestamp, request id, or shuffled list near the top of the prompt makes
every request a miss. Monitor cached tokens per request after each deploy.

### 20. When should you stream, and when is it pointless?

Stream any answer a person reads: the first text appears at TTFT instead of
at the end. Streaming does not make generation faster. For output parsed as
a whole, such as task-creation JSON, streaming adds complexity without
helping the user; shrink the output instead.

### 21. How do you measure TTFT correctly in code?

Start a timer before the request, record the time of the first chunk that
contains text (earlier chunks may carry only a role), and record the end.
Request usage in the stream (`stream_options.include_usage` on
OpenAI-compatible servers) so tokens per second uses real token counts, not
chunk counts.

### 22. Which latency statistics should you report?

Percentiles (p50, p95, p99) per feature and model, for TTFT, TPOT, and
end-to-end latency, measured at the client and at the server. Averages hide
the slow tail that users notice, and a fast server can still feel slow
behind blocking retrieval or a slow client connection.

### 23. Why do per-stream speed and aggregate throughput move in opposite directions?

More concurrent sequences per decode step raise total tokens per second for
the server but give each stream a smaller share of each step, so every user
sees slower text. Engine settings such as maximum concurrent sequences set
the balance.

### 24. How do you reduce an agent's latency?

Fewer sequential model calls: coarser tools ("create these three tasks"),
parallel tool calls, combining planning with acting, a cap on steps, and
streaming an early status update. Each removed round trip saves a full
model call plus network time.

### 25. How do you parallelize independent calls safely?

Start lookups that do not depend on each other together (document search,
open tasks, permission check) with a concurrency limit and a timeout on each,
so one slow dependency cannot stall the answer or exhaust connection pools
and rate limits. The combined wait becomes the slowest lookup instead of the
sum.

### 26. How does speculative decoding work, and why does it not change output quality?

A cheap proposer (a draft model, extra prediction heads, or n-gram lookup)
guesses several tokens; the target model checks them all in one forward
pass, keeps the longest agreed prefix, and adds one token of its own. With
the right acceptance rule the output follows the target model's
distribution, so quality is unchanged; the gain comes from verifying several
tokens for roughly the cost of one memory-bound step.

### 27. With acceptance rate a and k drafted tokens, how many tokens does one target pass yield?

(1 - a^(k+1)) / (1 - a), from Leviathan and colleagues. For a = 0.7 and k = 4:
(1 - 0.168) / 0.3 = 2.77 tokens per pass; for a = 0.3 it is only 1.42, before
paying for the drafting.

### 28. When does speculative decoding hurt?

At high load, decode steps are already full of other users' work, so extra
verification competes with them; and with unpredictable output, acceptance
is low and drafted tokens are wasted. vLLM positions it for low to medium
QPS; benchmark at real concurrency and disable or switch methods if
inter-token latency worsens.

### 29. How does regional placement affect latency?

Light in fiber covers about 200 km per millisecond, so cross-continent calls
add tens of milliseconds per round trip, multiplied by every sequential call
an agent makes. Put the backend next to the model endpoint, reuse
connections, and use regional or global endpoints deliberately, checking
that global routing still meets data residency rules.

### 30. What are provider service tiers, and when are they worth it?

Options that trade price for speed or availability, such as OpenAI's
`service_tier` values `priority` (or `fast`) for faster processing at a
higher price and `flex` for cheaper, slower processing with occasional
unavailability. Use fast tiers only on the few latency-critical paths and
flex or batch for work nobody waits for.

## Cost optimization for LLM apps

### 31. What makes up the cost of one model request?

Uncached input tokens at the input price, cached input at a much lower
price, cache writes where a provider charges for them, output tokens
(including hidden reasoning tokens) at a higher price, and tool fees. Output
usually costs several times as much per token as input.

### 32. Why track cost per completed task instead of cost per request?

Retries, validation failures, and abandoned requests bill without producing
an outcome. Dividing spend by successful outcomes (tasks created, answers
shown) shows the real unit cost and exposes failures that per-request
averages hide.

### 33. Why estimate tokens before a call and record usage after it?

Before the call, a local tokenizer estimate enforces budgets cheaply: trim
history, cap context, check a tenant's quota. After the call, the provider's
usage object is what you are billed for, including cached and reasoning
tokens no local count can predict. Different providers tokenize differently,
so estimates need a margin or the provider's counting endpoint.

### 34. How do providers' usage objects differ?

OpenAI's `input_tokens` and Chat Completions' `prompt_tokens` include cached
tokens, reported as a subset; Anthropic's `input_tokens` counts only tokens
after the last cache breakpoint, with cache reads and writes reported
separately; Gemini's `promptTokenCount` includes cached content, and
thinking tokens come separately. Normalize them once so dashboards compare
like with like.

### 35. Compare provider prompt caching, an exact response cache, and a semantic cache.

Prompt caching reuses a processed prefix, saves most of its input cost, and
is low risk. An exact response cache reuses the whole answer for identical
requests and saves the whole call but can leak data or serve stale answers
if keyed badly. A semantic cache reuses answers to similar questions and
risks wrong answers for questions that differ in a detail.

### 36. What must a response cache key include?

The model, the prompt version, the full input, the tenant and permission
scope, and the version of any data the answer depends on. Missing tenant or
permission scope can serve one customer's answer to another.

### 37. When should work go through a batch API, and what does it trade?

When nobody waits for it: nightly summaries, backfills after prompt changes,
evaluation runs, data enrichment. OpenAI, Anthropic, and Google price batch
work at half the interactive rate as of November 2026, in exchange for
asynchronous completion within 24 hours, so the application must poll,
reconcile results by id, and retry failed lines.

### 38. What routing patterns reduce cost?

Per-feature routing (each feature configured with a model size), a cascade
(small model first, escalate on invalid or unsure output), and a learned
router that predicts which model a query needs, as in RouteLLM. Start with
per-feature routing; it captures most of the savings with no runtime logic.

### 39. When does a cascade stop paying off?

Expected cost = small + escalation rate x large. With a small model at 1 unit
and a large one at 10, 30% escalation costs 4 units versus 10, but 90%
escalation costs 10 units and adds latency to most requests. Track the
escalation rate per feature and route features that usually escalate
straight to the large model.

### 40. What is distillation, and when is it worth it?

Training a small model to reproduce a large model's outputs on one narrow,
high-volume task, such as extracting tasks from sentences. It cuts cost and
latency per request but needs reviewed training data, an evaluation set, a
training pipeline, retraining as the task changes, and a check of the
provider's terms on training with its outputs.

### 41. How do output caps and context trimming save money?

Output caps bound the most expensive tokens; ask for the length the UI
needs and set `max_output_tokens` or `max_tokens`, checking the finish
reason for truncation. Context trimming keeps recent turns verbatim and
summarizes or drops older ones, and retrieval caps send fewer, reranked
passages.

### 42. Why do an agent's input tokens grow roughly with the square of its steps?

Each step re-sends the whole conversation so far, which grows by each step's
output and tool results. The total input over n steps is a sum of growing
contexts, roughly proportional to n squared, unless the prefix is cached or
old tool results are truncated.

### 43. How do you track cost per feature without overloading metrics?

Route every model call through one wrapper that takes a feature name,
normalizes usage, and increments counters labeled only by feature, model,
and token type. Tenant ids go to structured logs and a per-tenant usage
store, never to metric labels, and no prompt text is recorded.

### 44. When is self-hosting cheaper than a hosted API?

Cost per token = GPU-hour cost / (tokens per hour at full load x
utilization). At 10% utilization a GPU's tokens cost eight times what they
cost at 80%. Self-hosting wins only when sustained utilization pushes that
below the API's price for a model of similar quality, after engineering and
on-call time.

### 45. Why can reasoning models cost far more than expected?

They generate hidden reasoning tokens billed as output before the visible
answer, often far more tokens than the answer itself. Use the lowest
reasoning effort that passes evaluation, route simple features to
non-reasoning models, and include reasoning tokens in dashboards.

## GPU capacity and scaling

### 46. What occupies GPU memory when serving a model?

The weights (parameters x bytes per parameter), the KV cache for active
tokens, runtime memory (activations, CUDA graphs, workspace), and whatever
headroom the engine leaves. Weights are fixed per replica; the remaining
memory becomes cache, and the cache sets concurrency.

### 47. Estimate how many 8K-token conversations an 8B model serves on a 24 GB GPU.

Weights in 16-bit take about 14.9 GiB. Using 90% of 24 GiB (21.6 GiB) and
about 2 GiB of runtime leaves about 4.7 GiB of cache. At 128 KiB per token,
an 8K conversation needs 1 GiB, so about 4.7 full conversations. With 4-bit
weights, the cache grows to about 15.6 GiB; with an FP8 cache instead,
concurrency doubles to about 9.4.

### 48. How does grouped-query attention change serving capacity?

Several query heads share one key-value head, so the cache stores fewer KV
heads per layer. A model with 8 KV heads instead of 32 needs a quarter of the
cache per token, quadrupling the conversations that fit in the same memory.

### 49. Why is decoding limited by memory bandwidth, and what bound does that give?

Each step reads the weights and caches from memory for little arithmetic.
Steps per second at batch size 1 are at most bandwidth / bytes read per step:
16 GB of weights on a GPU with 2 TB/s gives at most about 125 steps per
second; the same model in 4-bit (about 4.3 GB) allows about 465.

### 50. Compare FP8, INT8, GPTQ, AWQ, and GGUF.

FP8 (8-bit floating point) runs fast on GPUs with FP8 support, usually with a
small quality loss. INT8 (W8A8 or weight-only, as in LLM.int8()) halves
weight memory on most GPUs. GPTQ and AWQ are post-training 4-bit
weight methods served by vLLM and SGLang, produced with GPTQModel or LLM
Compressor. GGUF is llama.cpp's single-file format with its own quant types
(Q8_0, Q5_K_M, Q4_K_M) for CPUs, Apple silicon, and GPUs.

### 51. Why quantize the KV cache separately from the weights?

The cache, not the weights, sets concurrency. An FP8 cache (`--kv-cache-dtype
fp8` in vLLM) halves bytes per token and roughly doubles concurrency at a
small quality cost, independent of the weight format, so it is often the
first lever to try.

### 52. What changed in the quantization tooling recently?

AutoAWQ is officially deprecated and was adopted into the vLLM project's LLM
Compressor; the AutoGPTQ repository is archived, and vLLM's documentation
lists GPTQModel instead. Use maintained tools and check that the engine
version supports the exact format before deploying.

### 53. Compare tensor, pipeline, and data parallelism for serving.

Tensor parallelism splits each layer across GPUs in one server and needs
fast GPU links. Pipeline parallelism puts different layers on different
GPUs or nodes, reaching larger models at the cost of inter-stage latency.
Data parallelism adds whole replicas for throughput once a replica fits.
Splitting buys fit, not efficiency; a quantized one-GPU replica scaled out
often serves more users per GPU.

### 54. Which metrics should drive autoscaling of a vLLM deployment, and why not CPU?

Requests waiting (`vllm:num_requests_waiting`), KV cache usage
(`vllm:kv_cache_usage_perc`), or measured TTFT p95. CPU usage says nothing
about GPU work, and GPU utilization saturates long before users suffer; queue
length shows waiting users directly.

### 55. How does a KEDA Prometheus trigger with `threshold: "4"` scale a deployment?

KEDA feeds the query result to a Horizontal Pod Autoscaler with an
average-value target of 4 per replica, so 13 waiting requests ask for
ceil(13 / 4) = 4 replicas, within the minimum and maximum replica counts and
the scaling behavior policies.

### 56. What steps make up a model replica's cold start, and how do you shorten each?

Provisioning a GPU node (keep warm nodes or reserve capacity), pulling a
multi-gigabyte image (pre-pull or bake it into the node image), downloading
weights (persistent or node-local model cache), loading them onto the GPU
(fast local disk or a streaming loader such as vLLM's `runai_streamer`), and
warm-up (unavoidable; cover it with a startup probe). Cold paths can take
many minutes against one or two on a warm path.

### 57. When is scaling a model server to zero appropriate?

For batch or internal workloads where waiting minutes for a cold start is
acceptable, and on serverless GPU platforms that bill per second. Interactive
features such as the TaskFlow Assistant need at least one warm replica.

### 58. Where do spot GPUs fit?

Batch inference, evaluation runs, and extra replicas above a reserved
baseline. The provider can reclaim them at short notice (AWS gives a
two-minute warning; Google Cloud's default for Spot VMs is shorter), so
interactive capacity must not depend on them alone.

### 59. Compare hosted GPU options by relative cost.

Per-token APIs for open models have no idle cost and the least operations
work, and cost more per token than your own busy GPUs at sustained volume.
Serverless GPU containers bill per second and scale to zero, with cold
starts. Managed endpoints add management on top of instance prices. GPU VMs
and Kubernetes node pools are cheapest per GPU-hour, especially reserved or
spot, but you pay while idle and run everything.

### 60. How would you choose GPU capacity for a newly adopted open model?

Read the model's shape from its config, compute weights and per-token cache
for the formats you consider, estimate concurrency from real context
lengths, and pick the smallest GPU and format that meets it. Then evaluate
quality of any quantized format, load the model, compare the engine's
reported KV cache size with the estimate, and load-test TTFT and TPOT at
expected concurrency before committing to reservations.

## Scenario-based questions

### 61. After a prompt change, the Assistant's time to first token doubled with no traffic change. What do you do?

**What to check first:** cached input tokens per request before and after
the deploy, and the first lines of the new prompt template.

**How to confirm:** compare `cached_tokens` (or `cache_read_input_tokens`)
across releases; diff the rendered prompt for content that changes per
request, such as a date, user name, or request id.

**Likely causes and fixes:** variable text moved into the stable prefix,
breaking prompt caching; move it after the stable content, add a test that
the prefix is identical across requests, and alert on cache hit ratio. See
[latency optimization](latency-optimization.md).

### 62. A self-hosted vLLM server shows rising TTFT while GPU utilization looks normal.

**What to check first:** `vllm:num_requests_waiting`,
`vllm:request_queue_time_seconds`, and `vllm:kv_cache_usage_perc`.

**How to confirm:** queue time grows with traffic while per-token decode
speed stays flat; the cache sits near full.

**Likely causes and fixes:** more concurrent requests than cache and
`--max-num-seqs` admit, so requests queue. Add replicas and autoscale on
queue length, lower `--max-model-len`, or use an FP8 cache or quantized
weights. See [serving open models](serving-open-models.md).

### 63. The model bill doubled while traffic stayed flat.

**What to check first:** token counts per request by feature and token type,
annotated with recent releases.

**How to confirm:** find the feature whose input or output tokens per
request jumped, and the release that changed its prompt, retrieval settings,
model, or reasoning effort.

**Likely causes and fixes:** more retrieved passages, a longer template, a
broken cache prefix, longer answers from a new model, or higher reasoning
effort. Revert or cap the change, add prompt-size checks to CI, and alert on
tokens per request. See
[cost optimization for LLM apps](cost-optimization-for-llm-apps.md).

### 64. Under bursts, self-hosted latency becomes erratic and throughput drops.

**What to check first:** `vllm:num_preemptions` and cache usage during the
bursts.

**How to confirm:** preemptions rise exactly when cache usage hits 100%,
often during long-document requests.

**Likely causes and fixes:** admitted sequences outgrow the cache, so the
engine evicts and recomputes them. Lower `--max-num-seqs`, cap output and
context per feature, isolate long-document traffic on separate replicas,
and add capacity. See [GPU capacity and scaling](gpu-capacity-and-scaling.md).

### 65. Model server pods restart in a loop after a model upgrade.

**What to check first:** pod events and the last log lines before each
restart.

**How to confirm:** liveness probe failures during weight loading, or a CUDA
out-of-memory error while allocating the cache.

**Likely causes and fixes:** no startup probe or one shorter than the new
cold start; or the larger model plus its default context no longer fits.
Add a startup probe sized from a measured cold start, set `--max-model-len`,
recompute memory, and use a quantized format or a larger GPU. See
[serving open models](serving-open-models.md).

### 66. Tool calls work against the hosted API but fail against the self-hosted model.

**What to check first:** the raw responses from both backends for the same
request, and the engine's tool-calling configuration for that model.

**How to confirm:** the self-hosted response returns tool calls as plain
text or in another shape; the chat template or tool parser differs.

**Likely causes and fixes:** "OpenAI-compatible" does not mean identical
behavior. Enable the engine's tool parser for the model family, test with
the model's chat template, and keep an evaluation set that runs against
every backend. See [serving open models](serving-open-models.md).

### 67. Meeting summaries take twenty seconds, but TTFT is under a second.

**What to check first:** output tokens per summary and the finish reason.

**How to confirm:** summaries average hundreds of tokens more than the UI
shows, and the prompt sets no length.

**Likely causes and fixes:** decode time from long outputs. Ask for a fixed
format and length, set an output limit, stream the answer, and consider a
faster model for summaries. See [latency optimization](latency-optimization.md).

### 68. Users say the task agent "thinks" for a long time before doing anything.

**What to check first:** traces of one agent run: the number of sequential
model calls and tool calls before the first visible action.

**How to confirm:** several planning calls run in series before the first
tool result; each adds a full round trip.

**Likely causes and fixes:** fine-grained tools, a planning call on every
step, and no parallel tool calls. Use coarser tools, allow parallel calls,
cap steps, and stream a status update early. See
[latency optimization](latency-optimization.md).

### 69. A small-model-first cascade was added to save money, but costs did not fall.

**What to check first:** the escalation rate per feature.

**How to confirm:** most requests escalate; cost per request is close to
always using the large model, and latency rose.

**Likely causes and fixes:** the small model is not good enough for that
feature, or the confidence threshold is miscalibrated. Evaluate per feature,
route that feature straight to the large model, calibrate the threshold on
an evaluation set, or distill a better small model. See
[cost optimization for LLM apps](cost-optimization-for-llm-apps.md).

### 70. Autoscaling created new model server pods that stay Pending.

**What to check first:** pod events and the GPU node pool's size and quota.

**How to confirm:** events show "Insufficient nvidia.com/gpu"; the node
autoscaler cannot add nodes because of quota or regional capacity.

**Likely causes and fixes:** `maxReplicaCount` exceeds what the cluster and
quota can supply. Align it with real capacity, request quota ahead of
launches, reserve capacity, or allow another GPU type or region. See
[GPU capacity and scaling](gpu-capacity-and-scaling.md).

### 71. Every weekday morning, users wait minutes for answers.

**What to check first:** queue length and replica readiness times around
the morning ramp.

**How to confirm:** the queue grows at the same time each day, and new
replicas become ready many minutes after scaling starts.

**Likely causes and fixes:** reactive scaling with a long cold start.
Scale up on a schedule before the peak, raise the minimum replicas during
working hours, pre-pull images, and cache weights near the GPUs. See
[GPU capacity and scaling](gpu-capacity-and-scaling.md).

### 72. Answer quality dropped after switching to a 4-bit model to save money.

**What to check first:** evaluation scores of the original and quantized
models on the same set, by feature.

**How to confirm:** the drop concentrates in specific tasks, often
structured output or long context, and reproduces offline.

**Likely causes and fixes:** quantization error affects this model on these
tasks. Try an 8-bit or FP8 format, another 4-bit method or checkpoint, or
keep 16-bit for the affected feature; never ship a quantized model without
running the evaluation set. See
[GPU capacity and scaling](gpu-capacity-and-scaling.md).

### 73. A customer saw another customer's task names in an answer.

**What to check first:** any response cache in the path and how its key is
built.

**How to confirm:** the same cache key is produced for two tenants with the
same question; cache hit logs show the entry crossing tenants.

**Likely causes and fixes:** the key omits the tenant and permission scope.
Purge the cache, add tenant, permission scope, model, prompt version, and
data version to the key, add a test that two tenants never share entries,
and treat it as a security incident. See
[cost optimization for LLM apps](cost-optimization-for-llm-apps.md).

### 74. Speculative decoding was enabled, and peak-hour streaming got slower.

**What to check first:** inter-token latency and speculation acceptance
metrics, at peak and off-peak.

**How to confirm:** acceptance is low and the slowdown appears only under
high load.

**Likely causes and fixes:** a busy server with unpredictable output, so
verification work is wasted. Disable it at high load, switch to a
model-based method if the model supports one, and benchmark at real
concurrency. See [latency optimization](latency-optimization.md).

## Further learning

- [vLLM documentation](https://docs.vllm.ai/en/latest/)
- [SGLang documentation](https://docs.sglang.io/)
- [OpenAI: Latency optimization](https://developers.openai.com/api/docs/guides/latency-optimization)
- [OpenAI: Cost optimization](https://developers.openai.com/api/docs/guides/cost-optimization)
- [Anthropic: Prompt caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)
- [KEDA: Prometheus scaler](https://keda.sh/docs/latest/scalers/prometheus/)
- [Kwon and colleagues: PagedAttention](https://arxiv.org/abs/2309.06180)
- Back to the [deployment cost and performance overview](../deployment-cost-and-performance.md).
