# MLOps and the Model Lifecycle

## Introduction

**MLOps** applies software delivery and operations practices to machine
learning systems. It covers reproducible data and training pipelines,
model and prompt versioning, evaluation gates, deployment, monitoring, and
retirement. For a full-stack AI feature, the lifecycle also includes
retrieval indexes, tool definitions, policy configuration, and application
code.

![A reproducible ML pipeline versions data and code, trains a candidate, evaluates it, registers an artifact, and releases it through controlled stages.](mlops-pipeline.svg)

## Lifecycle components

1. **Data pipeline:** ingest, validate, transform, and version inputs.
2. **Experiment tracking:** record code, configuration, data, model
   parameters, metrics, and artifacts.
3. **Evaluation gate:** compare a candidate with a baseline on a held-out
   suite; test safety, latency, and cost constraints as well as quality.
4. **Model registry:** store approved artifacts and metadata with
   reproducible identifiers.
5. **Deployment:** release through staged environments, shadow testing,
   canary traffic, or a rollback plan.
6. **Monitoring:** track system health and quality signals, investigate
   drift, and re-evaluate when data or model behavior changes.
7. **Retirement:** remove unsupported versions and clean up dependent
   indexes, endpoints, and credentials.

![A model release progresses from offline evaluation to shadow and canary traffic, then broad release or rollback based on monitored evidence.](model-release-rollout.svg)

## Version more than model weights

A reproducible AI feature may depend on:

- model provider, model identifier, and version;
- prompt and tool schemas;
- retrieval index and embedding-model version;
- data transformations and chunking configuration;
- safety policy and output validator;
- application code and evaluation set.

If one of these changes, compare system behavior before and after the
change. A provider alias that silently points to a new model can alter
quality, latency, or cost. Providers also retire model versions on
published schedules, so a pinned version eventually needs a planned
migration (see
[LLMOps: prompt and model versioning](mlops-and-model-lifecycle/llmops-prompt-and-model-versioning.md)).

## Monitoring

Track service availability, latency percentiles, timeouts, rate limits,
queue depth, resource use, and cost. Where appropriate and privacy-safe,
track task completion, user corrections, citation validity, refusal and
escalation rates, and evaluation results. Log identifiers and aggregate
signals rather than sensitive prompts by default.

Model quality is harder to monitor than CPU or HTTP status. Add sampled
human review, user feedback, offline regression suites, and privacy-aware
incident investigation. A change in model output may come from input
distribution, retrieval, prompt, provider version, or code.

Service health, dashboards, SLOs, and alerting work as for any API; see
[Monitoring and Logging](../../../07-devops-and-deployment/07-devops-and-deployment/monitoring-and-logging.md).
LLM evaluation sets and tracing are covered in
[Evaluation and Monitoring](evaluation-and-monitoring.md), and drift in
classic models in
[production monitoring and drift](mlops-and-model-lifecycle/production-monitoring-and-drift.md).

## Rollback and incidents

Keep a known-good version and a safe fallback. Define how to disable a
feature, revoke a key, rebuild an index, or route a task to human review.
Do not use a previous model blindly if its license, safety status, or data
dependencies differ. A rollback target can also disappear: providers
retire old model versions, so check that the version you would return to
is still served.

Model releases use the same mechanics as application releases: versioned
artifacts, staged rollouts, feature flags, and rehearsed rollbacks. See
[Release Engineering](../../../07-devops-and-deployment/07-devops-and-deployment/release-engineering.md)
and
[rollbacks and safe releases](../../../07-devops-and-deployment/07-devops-and-deployment/deployment-strategies/rollbacks-and-safe-releases.md).

## Go deeper

- [Experiment tracking and model registry](mlops-and-model-lifecycle/experiment-tracking-and-model-registry.md):
  record runs with MLflow, promote versions with registry aliases, and
  make training reproducible.
- [LLMOps: prompt and model versioning](mlops-and-model-lifecycle/llmops-prompt-and-model-versioning.md):
  prompts as code, release manifests, A/B tests, rollbacks, and migrating
  off deprecated provider models.
- [Production monitoring and drift](mlops-and-model-lifecycle/production-monitoring-and-drift.md):
  data and concept drift measured with PSI and the KS test, monitoring
  classic models, feedback loops, and retraining triggers.

**Review:** [interview questions and answers](mlops-and-model-lifecycle/interview-questions-and-answers.md) · [cheat sheet](mlops-and-model-lifecycle/cheat-sheet.md)

## Further learning

- [Google Cloud MLOps continuous delivery and automation](https://docs.cloud.google.com/architecture/mlops-continuous-delivery-and-automation-pipelines-in-machine-learning)
- [MLflow documentation](https://mlflow.org/docs/latest/)
- [NIST AI Risk Management Framework](https://www.nist.gov/itl/ai-risk-management-framework)
