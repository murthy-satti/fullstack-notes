# Language Models and Tokens

## Introduction

A **language model** assigns likelihoods to sequences of tokens and can
generate a continuation from a context. A **large language model (LLM)** is
a language model with a large number of learned parameters and broad
training. "Large" is relative; it does not specify a particular capability
or quality level.

## How next-token generation works

1. The input text is tokenized into token identifiers.
2. The model processes the token sequence and returns scores for possible
   next tokens.
3. A decoding strategy selects a token, such as the highest-scoring option
   or a sampled option.
4. The selected token is appended to the context, and generation repeats.
5. Generation stops at a configured limit or model stop condition.

![Text is split into tokens, passed through a language model, and generated one token at a time until a stop condition.](token-generation.svg)

![Instructions, conversation history, retrieved passages, and tool schemas all consume the available context before generation begins.](context-window-budget.svg)

This next-token objective can support many downstream behaviors after
training and instruction tuning, but the model is still generating based on
learned patterns and current context. It does not inherently verify a claim
against the world.

## Tokens and context windows

A token is a model-specific unit: it can represent a word, part of a word,
punctuation, or other text. Tokenization differs by model. A context window
is the limit on the combined input and generated content the model can
process in one request. It is usually measured in tokens, not pages or
characters.

The total input may include system instructions, conversation history,
retrieved passages, tool definitions, and the user's message. Output tokens
also consume budget. Long contexts can increase cost and latency, and
relevant material can still be overlooked.

## Sampling controls

- **Temperature:** changes how concentrated or varied token selection is
  for supported sampling methods. Lower is generally more predictable, not
  automatically more correct.
- **Top-p:** restricts sampling to a probability mass chosen by the
  parameter, where supported.
- **Maximum output tokens:** bounds generation length; it is not a
  guarantee that an answer will be complete.
- **Stop sequence:** stops output at configured tokens or strings when the
  interface supports them.

Provider parameters differ. Start with documented defaults and evaluate
changes on representative prompts rather than assuming a setting has a
universal effect.

## Why hallucinations happen

Language models are trained to produce likely continuations under an
objective. A question may be ambiguous, outside the model's useful
knowledge, or missing context. The model can still produce fluent text.
Retrieval, constrained output, tool use, calibrated refusal behavior, and
human review can reduce specific error types, but none guarantees truth.

## Real-world example

A note-taking assistant may summarize a meeting transcript. The transcript
is part of the context, but the model can omit a detail or invent a
connection. A reliable feature links summary bullets back to source
segments and lets the user correct them.

## Full-stack developer perspective

Count the full request, not just the visible user message, when estimating
cost and context size. Stream output for user experience when supported, but
do not treat partial streamed text as a completed or validated answer.
Record model and prompt versions for debugging while avoiding sensitive
content in logs.

## Important terminology

- **Tokenizer:** converts input text to tokens and generated tokens back to
  text.
- **Context window:** maximum input and output context a model can handle
  for one generation.
- **Logit:** unnormalized score the model assigns to a possible token.
- **Decoding:** method for choosing tokens from model output scores.
- **Instruction tuning:** additional training intended to make a pretrained
  model follow instructions more usefully.

## Common misconceptions

- A token is not always a whole word.
- A larger context window does not guarantee that all included details will
  be used correctly.
- Lower temperature does not make an answer factually verified.
- An LLM does not have a database-style, guaranteed lookup of every fact in
  its training data.

## Further learning

- [Hugging Face: Tokenizers](https://huggingface.co/docs/transformers/main/en/tokenizer_summary)
- [OpenAI: Tokens and tokenization](https://help.openai.com/en/articles/4936856-what-are-tokens-and-how-to-count-them)
- [Google Gemini API: Generate content](https://ai.google.dev/gemini-api/docs/text-generation)
