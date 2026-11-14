# Deploying Microservices

Splitting TaskFlow into services (a tasks API, a notification service, a
search service, and the web app) only pays off if each one can be
changed, tested, and deployed on its own. That property, **independent
deployability**, is the real goal of a microservice architecture, and it
is easy to lose: one shared database, one breaking API change, or one
"release night" in which every service must deploy in a fixed order, and
you have all the cost of a distributed system with none of the
independence.

This lesson covers independent deployability as the goal, one pipeline
per service and clear ownership, contracts between services (OpenAPI,
AsyncAPI, and schema registries for events), backward-compatible changes
across services and event schemas, deployment ordering without lock-step
releases, per-service databases and migrations, environments and
ephemeral test environments, GitOps with one deployable unit per service,
observing a deploy across services, and when microservices make
deployment harder than a modular monolith. The architecture side
(boundaries, sagas, gateways) is covered in
[microservices patterns](../../05-application-architecture/software-architecture/microservices-patterns.md).

## Why it matters

- **Independent deployability is the payoff.** Teams choose microservices
  to ship without waiting for each other, to deploy small changes many
  times a day, and to limit the blast radius of a bad deploy. All three
  depend on deploying one service without coordinating with the others.
- **The distributed monolith is the common failure.** Services that must
  be released together, in order, during a window, are a monolith whose
  function calls now cross a network: slower, harder to debug, and still
  coupled.
- **More deployables multiply release work.** Ten services mean ten
  pipelines, ten sets of dashboards, and ten things that can be on the
  wrong version. Without shared templates and contracts, release
  engineering effort grows faster than the number of services.
- **Compatibility becomes a network problem.** In a monolith the compiler
  catches a renamed field; between services, nothing does unless contract
  checks run in CI.

## Real-world usage

- **The original definition.** James Lewis and Martin Fowler's
  [Microservices](https://martinfowler.com/articles/microservices.html)
  (2014) describes services that are "independently deployable by fully
  automated deployment machinery", each managing its own database, and
  recommends designing services as tolerant readers so that versioning is
  a last resort.
- **Amazon.** Clare Liguori's Builders' Library article
  [Automating safe, hands-off deployments](https://aws.amazon.com/builders-library/automating-safe-hands-off-deployments/)
  describes a typical microservice with several pipelines (application
  code, infrastructure, operating system patches, configuration and
  feature flags, operator tools), deploying multiple times a day, and
  stresses that new code must be backward compatible with both the
  current code and the service's dependencies.
- **Segment.** Alexandra Noonan's
  [Goodbye Microservices](https://segment.com/blog/goodbye-microservices/)
  (2018) describes more than 140 services whose shared libraries drifted
  apart, so that a change to a shared library meant testing and deploying
  every service; consolidating into one service removed the operational
  load.
- **Shopify.** Kirsten Westeinde's
  [Deconstructing the Monolith](https://shopify.engineering/deconstructing-monolith-designing-software-maximizes-developer-productivity)
  (2019) explains why Shopify chose a modular monolith, with components
  by business domain behind public interfaces, instead of splitting into
  services.
- **Event contracts.** Confluent's
  [schema evolution and compatibility](https://docs.confluent.io/platform/current/schema-registry/fundamentals/schema-evolution.html)
  documentation defines BACKWARD (the default), FORWARD, FULL, their
  transitive variants, and NONE, and states which side must be upgraded
  first for each.

**Popular tools and providers:** Argo CD and Flux for GitOps, Helm and
Kustomize, the Pact Broker and PactFlow, Confluent Schema Registry and
Apicurio Registry, OpenAPI and AsyncAPI with diff tools such as oasdiff,
Backstage for service ownership, OpenTelemetry for tracing by version,
and Spinnaker or Argo Rollouts for progressive delivery.

## How it works

### Independent deployability is the goal

A simple test: can the notification team deploy the notification service
on a Tuesday afternoon, without asking anyone, and without anything else
deploying? If yes, the conditions below hold:

| Condition | What breaks it |
|---|---|
| Its own pipeline and artifact | A shared build that produces every service's image at once |
| Its own data | Another service reading or writing its tables |
| Compatible contracts | A change that requires a consumer to deploy at the same moment |
| No shared runtime state | Shared in-process libraries with behaviour that must match across services |
| No deploy-time ordering | "Deploy search before tasks, or indexing breaks" |
| A rollback that touches only itself | A migration other services already depend on |

### One pipeline per service, owned by one team

Each service gets its own pipeline: test, contract checks, build one
image, deploy to staging, `can-i-deploy`, production with a canary, and
a record of what was deployed. Writing that pipeline ten times invites
drift, so most organizations keep **one reusable pipeline** (a GitHub
Actions reusable workflow, versioned like any other dependency) that each
service calls with a few inputs. The platform team improves the template;
services adopt new versions deliberately. Reusable workflows are
explained in
[GitHub Actions in depth](../ci-cd/github-actions-in-depth.md).

Ownership must be explicit and machine-readable: a team per service in a
service catalog (for example Backstage's `catalog-info.yaml`), the same
team in `CODEOWNERS`, and the same team in the alert routing. When a
deploy breaks something at night, "whose service is this?" must have one
answer.

### Contracts between services

Services talk through contracts, and each kind of contract has its own
tool for describing it and checking changes:

| Interaction | Contract | Breaking-change check |
|---|---|---|
| Synchronous HTTP | OpenAPI document in the provider's repository | Diff against the version in production (oasdiff or similar) in CI |
| Asynchronous events | AsyncAPI document plus a schema per event type | A schema registry rejects incompatible schemas under the topic's compatibility mode |
| gRPC and Protobuf | `.proto` files | Field-number and type rules (never reuse a field number; reserve deleted ones) |
| Any of the above, consumer's view | Consumer-driven contracts (Pact), for HTTP and messages | Provider verification against every deployed consumer version, and `can-i-deploy` |

Provider-side diffs catch changes that break the *documented* contract;
consumer-driven contracts catch changes that break what consumers
*actually use*, and they tell the provider which fields are safe to
remove. Mature setups use both.

![Diagram: a consumer pipeline for TaskFlow Web (test with unit and pact tests, publish the pact with the commit SHA as version, can-i-deploy to production, deploy taskflow-web, record-deployment) and a provider pipeline for the tasks API (unit tests, verify pacts from the main branch and every deployed or released consumer version, publish results, can-i-deploy to production, deploy tasks-api, record-deployment) both talk to a Pact Broker that holds pacts, verification results, and which version is deployed in which environment; each pipeline asks the broker before it deploys and tells it afterwards.](contract-tests-in-pipelines.svg)

The mechanics of Pact (publishing, verification selectors, `can-i-deploy`,
`record-deployment`) are shown with full workflows in
[keeping frontend and backend in sync](keeping-frontend-and-backend-in-sync.md);
between backend services they work the same way, with each service being
a consumer of some and a provider for others.

### Backward-compatible changes across services and event schemas

The rules for HTTP APIs carry over to service-to-service calls: add
fields instead of changing them, never repurpose a field, make new
request fields optional, and have consumers ignore unknown fields. Events
add two complications:

- **Events outlive deploys.** A Kafka topic with seven days of retention
  holds events written by last week's producer. A consumer that replays
  the topic (after a bug fix, or a new consumer starting from the
  beginning) reads every schema version still stored there.
- **Producers and consumers deploy at different times**, and which one
  may go first depends on the compatibility mode.

![Diagram: three compatibility modes side by side: BACKWARD, the Schema Registry default, where consumers on the new schema can read data written with the previous one, so consumers are upgraded first and producers then write the new version, allowing deleted fields and added fields with defaults; FORWARD, where consumers on the previous schema can read new data, so producers are upgraded first and consumers once old-format data has expired, allowing added fields and deleted optional fields; FULL, where both hold, so either side upgrades in any order and only optional fields are added or removed. A note says the transitive variants check against every earlier version, which matters when consumers replay old events from long-retention topics.](schema-compatibility-upgrade-order.svg)

For a change no compatibility mode allows (a new required field, a
changed meaning), publish a **new event version** next to the old one:

1. The producer publishes `task.assigned` v2 alongside v1 (same event ID
   in both, so consumers that read both can deduplicate).
2. Each consumer team moves to v2 on its own schedule.
3. When no consumer reads v1 (no consumer group's committed offsets on
   the v1 topic still move), the producer stops publishing it.

The event envelope (ID, type, version, source, time) is described in
[event-driven architecture](../../05-application-architecture/software-architecture/event-driven-architecture.md).

### Deployment ordering without lock-step releases

![Diagram: on the left, a lock-step release, a distributed monolith: release 14 on Thursday at 22:00 must deploy the tasks API, the notifier, search, and the web app in that order, all reading one shared database, so there is a deploy-order spreadsheet and a release window, one failing service blocks all four, rollback means rolling back all four, and teams wait for each other. On the right, independent deploys: each service with its own data deploys on its own days through the week, with contracts checked in CI by contract tests and a schema registry and every change backward compatible, so a failure stays in one service and teams ship on their own schedule.](lockstep-vs-independent-deploys.svg)

Lock-step releases have recognizable symptoms: a spreadsheet of deploy
order, a "release night", a version matrix that pins exact versions of
other services, and pull requests in several repositories that must merge
together. The cure is the same expand-and-contract sequence used between
frontend and backend, applied service by service:

1. The **provider** deploys support for the new behaviour, keeping the old
   (a new optional field, a new endpoint, a new event version).
2. Each **consumer** deploys its change whenever it is ready, possibly
   behind a flag.
3. The provider **removes** the old behaviour once contracts and usage
   show no consumer needs it.

Each step is one service, deployable alone, and `can-i-deploy` checks
each step against what is actually running. If a change truly cannot be
split this way, the two services probably belong together.

### Per-service databases and migrations

Each service owns its data store; other services get data through its API
or its events, never by reading its tables. A shared table is a hidden,
untested contract: a column rename in the tasks service breaks the
search service at runtime, and no contract test notices.

Migrations live in the service's repository and run in its pipeline,
following the rules in
[zero-downtime database migrations](../deployment-strategies/zero-downtime-database-migrations.md):
every migration must work with the previous version of the *same*
service, because both run side by side during its rolling deploy. Data
another service needs is copied through events into that service's own
store (the search index is built from task events), which is also what
lets each side change its schema independently.

### Environments and ephemeral test environments

A single shared staging environment becomes a bottleneck as services
multiply: teams queue for it, one broken service blocks everyone's
tests, and "it worked in staging" stops meaning much because staging
rarely matches the mix of versions in production. Options, in order of
cost:

- **Contract tests first.** They replace most cross-service integration
  testing and need no environment at all.
- **Ephemeral environments per pull request** that run the changed
  service and use the production versions of everything else (from
  images already in the registry). Previews are covered in
  [environments and promotion](../deployment-strategies/environments-and-promotion.md).
- **Shared baseline with request routing**: one environment runs the
  current version of every service, and a header on test requests routes
  calls for the service under test to its preview instance (service
  meshes and some platforms support this kind of header-based routing).
- **A small end-to-end suite** on the few journeys that matter most, run
  against staging and production, not a full regression suite.

### GitOps with one deployable unit per service

In a GitOps setup each service has its own directory in the deployment
repository, generated into its own Argo CD `Application` (for example by
an `ApplicationSet` with a Git directory generator). Promotion is a commit
that changes one service's image digest; history, review, and rollback
all happen per service. One `Application` that deploys every service
together recreates the lock-step release in YAML. The mechanics of Argo
CD and Flux are in
[immutable infrastructure and GitOps](../infrastructure-as-code/immutable-infrastructure-and-gitops.md).

### Observing a deploy across services

When several services deploy independently, "what changed?" needs data:

- **Every signal carries `service.version`.** With the OpenTelemetry
  resource attribute set from the image's version, metrics, logs, and
  traces can be split by version, so a canary of the notification service
  can be compared with its stable version directly.
- **Deploy markers on dashboards.** Each pipeline records a deployment
  event (service, version, environment, time); dashboards show them as
  annotations, so an error spike lines up with the deploy that caused it.
- **Traces by version.** A trace shows which version of each service
  handled each hop. If errors appear only on traces that pass through
  `search-service` 4.2.0, the culprit is found without a meeting.
- **The deployment history across services** answers "what changed in the
  last hour anywhere?", which is the first question of most incidents.

See [distributed tracing](../monitoring-and-logging/distributed-tracing.md)
for propagation and the resource attributes.

### When microservices make deployment harder

| Delivery concern | Modular monolith | Microservices |
|---|---|---|
| Deployables | One | One per service |
| Atomic change across modules | One commit, one deploy | Several deploys in a compatible order |
| Contract checks | The compiler and tests | Contract tests, schema registries, `can-i-deploy` |
| Rollback | One version | One service, if contracts hold |
| Local development | Run one process | Run several, or use stubs and shared environments |
| Independent scaling and release cadence | No | Yes |
| Blast radius of a bad deploy | Everything | One service, if isolation holds |

Signs that two services should be one: they are always deployed
together, they share a database, the same team owns both, or every
change to one needs a change to the other. Segment's and Shopify's posts
are public examples of teams deciding that a well-structured single
deployable served them better; the trade-offs are discussed in
[monolith, modular monolith, and microservices](../../05-application-architecture/software-architecture/monolith-modular-monolith-microservices.md).

## When to use and when not to use

| Situation | Approach |
|---|---|
| Several teams that need to ship independently | Microservices with one pipeline each, contracts in CI, `can-i-deploy` gates |
| One team, one product | A modular monolith with internal boundaries; split later if teams grow |
| Services that always change together | Merge them, or make the contract between them stable first |
| Event-driven integration | A schema registry with an explicit compatibility mode per topic, and new event versions for breaking changes |
| Shared staging is a bottleneck | Contract tests and per-pull-request environments before more shared environments |
| Kubernetes with Argo CD or Flux | One Application per service, promotion by digest, rollback per service |

## Practical examples

### One reusable pipeline that every service calls

```yaml
# .github/workflows/service-pipeline.yml (in the example/pipelines repository)
name: service-pipeline
on:
  workflow_call:
    inputs:
      service:
        type: string
        required: true              # image name and Pact participant, e.g. notification-service
    secrets:
      PACT_BROKER_TOKEN:
        required: true
      DEPLOY_REPO_TOKEN:
        required: true

permissions:
  contents: read

env:
  PACT_BROKER_BASE_URL: https://pact-broker.example.com

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
        with:
          persist-credentials: false
      - uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm test                   # unit tests, consumer pacts, provider verification
        env:
          PACT_BROKER_TOKEN: ${{ secrets.PACT_BROKER_TOKEN }}

  image:
    needs: test
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    outputs:
      digest: ${{ steps.push.outputs.digest }}
    steps:
      - uses: actions/checkout@v7
        with:
          persist-credentials: false
      - uses: docker/setup-buildx-action@v4
      - uses: docker/login-action@v4
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - id: push
        uses: docker/build-push-action@v7
        with:
          context: .
          push: true
          tags: ghcr.io/example/${{ inputs.service }}:sha-${{ github.sha }}
          build-args: |
            VERSION=sha-${{ github.sha }}

  promote:
    if: github.ref == 'refs/heads/main'
    needs: image
    runs-on: ubuntu-latest
    environment: production              # reviewers, if production needs them
    env:
      SERVICE: ${{ inputs.service }}
      DIGEST: ${{ needs.image.outputs.digest }}
      PACT_BROKER_TOKEN: ${{ secrets.PACT_BROKER_TOKEN }}
    steps:
      - name: Is this version compatible with everything in production?
        run: |
          docker run --rm -e PACT_BROKER_BASE_URL -e PACT_BROKER_TOKEN \
            pactfoundation/pact-cli:latest \
            pact-broker can-i-deploy --pacticipant "$SERVICE" \
            --version "$GITHUB_SHA" --to-environment production
      - name: Pin the new digest for this service only (GitOps)
        env:
          GH_TOKEN: ${{ secrets.DEPLOY_REPO_TOKEN }}
        run: |
          gh repo clone example/taskflow-deploy deploy -- --depth 1
          cd deploy
          yq -i '.images[0].digest = strenv(DIGEST)' "apps/$SERVICE/overlays/prod/kustomization.yaml"
          git config user.name "taskflow-release-bot"
          git config user.email "release-bot@example.com"
          git commit -am "deploy($SERVICE): $DIGEST"
          gh auth setup-git
          git push
```

```yaml
# .github/workflows/pipeline.yml (in the notification-service repository)
name: pipeline
on:
  push:
    branches: [main]
  pull_request:

jobs:
  pipeline:
    uses: example/pipelines/.github/workflows/service-pipeline.yml@v3
    with:
      service: notification-service
    secrets: inherit
    permissions:
      contents: read
      packages: write
```

- The caller pins the shared pipeline to `@v3`, so the platform team can
  publish `v4` without changing every service at once.
- Inputs reach shell scripts through `env`, never through `${{ }}` inside
  `run`, so a crafted input cannot inject commands.
- The promote job changes only this service's directory in the deploy
  repository; Argo CD syncs that one `Application`. After the sync is
  healthy (for example from an Argo CD notification), the pipeline or a
  webhook runs `record-deployment` so `can-i-deploy` knows what is live.

### Describe the event contract with AsyncAPI

```yaml
# asyncapi.yaml (tasks-api repository): the event contract other teams build against
asyncapi: 3.1.0
info:
  title: TaskFlow task events
  version: 2.1.0
channels:
  taskAssignedV2:
    address: taskflow.task.assigned.v2
    messages:
      taskAssigned:
        $ref: "#/components/messages/TaskAssignedV2"
operations:
  publishTaskAssigned:
    action: send
    channel:
      $ref: "#/channels/taskAssignedV2"
components:
  messages:
    TaskAssignedV2:
      name: task.assigned
      contentType: application/json
      payload:
        type: object
        required: [id, type, version, occurredAt, data]
        properties:
          id: { type: string, format: uuid }
          type: { const: task.assigned }
          version: { const: 2 }
          occurredAt: { type: string, format: date-time }
          data:
            type: object
            required: [taskId, assignee]
            properties:
              taskId: { type: string }
              assignee:
                type: object
                required: [id]
                properties:
                  id: { type: string }
                  team: { type: string }
              due:
                type: object
                properties:
                  date: { type: string, format: date }
                  timezone: { type: string }
```

The document lives next to the producer's code, is reviewed with it, and
is published to the service catalog, so consumer teams discover topics
and payloads without reading the producer's source.

### Let the schema registry refuse breaking changes

```bash
#!/usr/bin/env bash
# scripts/check-schema.sh: fail CI if a schema change would break a deployed reader
set -euo pipefail
REGISTRY="https://schema-registry.example.com"
SUBJECT="taskflow.task.assigned.v2-value"
CT="Content-Type: application/vnd.schemaregistry.v1+json"

# Once per subject: consumers may replay a week of history, so check every version
curl -fsS -X PUT "$REGISTRY/config/$SUBJECT" -H "$CT" \
  --data '{"compatibility": "BACKWARD_TRANSITIVE"}'

# On every pull request that touches the schema
jq -n --rawfile schema schemas/task-assigned-v2.schema.json \
  '{schemaType: "JSON", schema: $schema}' > /tmp/schema-request.json
curl -fsS -X POST "$REGISTRY/compatibility/subjects/$SUBJECT/versions/latest" \
  -H "$CT" --data @/tmp/schema-request.json | jq -e '.is_compatible == true'
```

`jq -e` exits non-zero when the registry answers `"is_compatible": false`,
which fails the pull request before the producer can deploy a schema
that the deployed consumers cannot read. (In practice the compatibility
setting is managed as configuration, not run on every build.)

### Publish two event versions during a migration

```js
// src/events/task-assigned.js (tasks-api): v1 and v2 until no consumer reads v1
import { randomUUID } from "node:crypto";
import { publish } from "./bus.js"; // a thin wrapper around the message broker client

export async function publishTaskAssigned(task, assignee) {
  const id = randomUUID();                 // the same ID in both versions: consumers dedupe
  const occurredAt = new Date().toISOString();
  const envelope = { id, type: "task.assigned", source: "tasks-api", occurredAt };

  await publish("taskflow.task.assigned.v2", task.id, {
    ...envelope,
    version: 2,
    data: { taskId: task.id, assignee: { id: assignee.id, team: assignee.teamId }, due: task.due },
  });
  await publish("taskflow.task.assigned.v1", task.id, {   // remove when v1 has no consumers
    ...envelope,
    version: 1,
    data: { taskId: task.id, assigneeId: assignee.id, dueDate: task.due?.date ?? null },
  });
}
```

Keying both messages by task ID keeps per-task ordering within each
topic. Two separate publishes are not atomic; if losing one of them is
unacceptable, write both to an outbox table in the same database
transaction as the change (the
[transactional outbox](../../05-application-architecture/message-queues/messaging-patterns.md)
pattern) and publish from there.

### One Argo CD Application per service

```yaml
# clusters/prod/taskflow-services.yaml: one Application per service directory
apiVersion: argoproj.io/v1alpha1
kind: ApplicationSet
metadata:
  name: taskflow-services-prod
  namespace: argocd
spec:
  goTemplate: true
  goTemplateOptions: ["missingkey=error"]
  generators:
    - git:
        repoURL: https://github.com/example/taskflow-deploy.git
        revision: main
        directories:
          - path: apps/*/overlays/prod
  template:
    metadata:
      name: "{{index .path.segments 1}}-prod"     # e.g. notification-service-prod
    spec:
      project: taskflow
      source:
        repoURL: https://github.com/example/taskflow-deploy.git
        targetRevision: main
        path: "{{.path.path}}"
      destination:
        server: https://kubernetes.default.svc
        namespace: "{{index .path.segments 1}}"
      syncPolicy:
        automated:
          prune: true
          selfHeal: true
        syncOptions:
          - CreateNamespace=true
```

Adding a service is adding a directory; each service syncs, fails, and
rolls back on its own, and the Argo CD history shows deploys per service.

## Best practices

- Treat independent deployability as a requirement and test it: any
  service, any day, alone.
- Give every service one owner, one pipeline (from a shared, versioned
  template), and one deployable artifact.
- Keep each service's data private; share data through APIs and events.
- Describe contracts (OpenAPI, AsyncAPI, schemas) next to the code, and
  check changes in CI against what is deployed, not just against the
  last commit.
- Choose a compatibility mode per event topic deliberately, and use the
  transitive modes where consumers replay history.
- Ship breaking changes as expand, migrate consumers, contract, with new
  event versions published alongside old ones.
- Gate production deploys with `can-i-deploy` and record every deploy.
- Promote per service in GitOps; never bundle all services into one
  release unit.
- Tag every signal with `service.version` and mark deploys on dashboards.
- Merge services that always deploy together.

## In production

- **Every release needs a deploy-order spreadsheet.**
  *Detect:* releases happen in windows; pull requests across repositories
  must merge together; rollbacks involve several teams. *Cause:* breaking
  contracts or a shared database couple the services. *Fix:* make each
  change backward compatible (expand, migrate, contract), move shared
  tables behind one owner's API, and gate deploys with `can-i-deploy`.
- **Search results go stale after a tasks deploy, with no errors.**
  *Detect:* the search service's consumer lag is zero but documents stop
  updating; its logs show events skipped as unparseable. *Cause:* the
  producer changed the event payload in a way the consumer's parser
  rejects, and the registry's compatibility mode was `NONE`. *Fix:* set
  `BACKWARD` or `FULL` (transitive where history is replayed), add
  contract tests for messages, and replay the skipped events after the
  fix.
- **A consumer crashes when it replays a topic from the beginning.**
  *Detect:* a new consumer, or one reset to an old offset, fails on events
  from weeks ago. *Cause:* compatibility was checked only against the
  latest schema, not every version still stored in the topic. *Fix:* use a
  `_TRANSITIVE` mode, and test consumers against samples of every stored
  version.
- **A rollback of one service breaks another.**
  *Detect:* errors in a dependent service immediately after rolling back.
  *Cause:* the dependent already relied on the new endpoint or field, so
  the rollback removed something in use. *Fix:* consumers adopt new
  provider features behind a flag, and `can-i-deploy` is run for
  rollbacks too.
- **Staging is always broken.**
  *Detect:* teams wait for staging; failures there are usually someone
  else's service. *Cause:* one shared environment for many independently
  deployed services. *Fix:* contract tests in each pipeline,
  per-pull-request environments that use production versions of the
  other services, and a small end-to-end suite.
- **Nobody can say which deploy caused an error spike.**
  *Detect:* incident time is spent asking every team what they shipped.
  *Cause:* no deploy markers and no version on telemetry. *Fix:* record
  every deploy as an event, annotate dashboards, and add `service.version`
  to every signal.

## Important terminology

- **Independent deployability:** the ability to deploy one service
  without deploying or coordinating with others.
- **Distributed monolith:** services that must be released together,
  combining the costs of distribution with monolith coupling.
- **Lock-step release:** deploying several services together in a fixed
  order.
- **Contract:** the agreed shape and behaviour of an interface between
  services.
- **Consumer-driven contract:** a contract derived from what consumers
  actually use.
- **Schema registry:** a service that stores event schemas and enforces a
  compatibility mode on changes.
- **Compatibility mode:** the rule (BACKWARD, FORWARD, FULL, transitive
  variants, NONE) a new schema must satisfy.
- **Event version:** a distinct, published shape of an event type, run
  side by side with older versions during migrations.
- **Ephemeral environment:** a short-lived environment created for one
  change.
- **ApplicationSet:** an Argo CD resource that generates one Application
  per item, such as one per service directory.
- **Deploy marker:** a recorded deploy event shown on dashboards.

## Common mistakes and misconceptions

- Equating "many services" with "independent services".
- Sharing a database between services "temporarily".
- Writing a separate, hand-made pipeline for every service.
- Checking only the producer's documented contract, not what consumers
  use.
- Leaving the schema registry's compatibility mode at `NONE`, or checking
  only against the latest version for replayed topics.
- Coordinating releases in a meeting instead of making changes
  compatible.
- Deploying all services from one GitOps Application.
- Splitting a system into services before the team or the product needs
  it.

## Revision questions

1. Define independent deployability and list four conditions it needs.
2. What are the symptoms of a distributed monolith, and how do you
   remove them?
3. Which contract checks would you run for an HTTP API, an event, and a
   gRPC interface?
4. Under the BACKWARD compatibility mode, which side deploys first, and
   which changes are allowed? What about FORWARD?
5. Why does a topic with 30 days of retention push you towards a
   transitive compatibility mode?
6. Plan the deploys needed to replace `assigneeId` with an `assignee`
   object in the `task.assigned` event without breaking any consumer.
7. Why should each service be its own Argo CD Application rather than
   part of one Application for the whole system?
8. Ten services each deploy about twice a day. Roughly how many
   production deploys happen per week, and what must the observability
   setup provide to make an error spike attributable? (About 100 on a
   five-day week; deploy markers and `service.version` on every signal.)

## Further learning

- [James Lewis and Martin Fowler: Microservices](https://martinfowler.com/articles/microservices.html)
- [AWS Builders' Library: Automating safe, hands-off deployments](https://aws.amazon.com/builders-library/automating-safe-hands-off-deployments/)
- [Confluent: Schema evolution and compatibility](https://docs.confluent.io/platform/current/schema-registry/fundamentals/schema-evolution.html)
- [AsyncAPI specification](https://www.asyncapi.com/docs/reference/specification/latest)
- [Pact: can-i-deploy](https://docs.pact.io/pact_broker/can_i_deploy)
- [Argo CD: Git generator for ApplicationSets](https://argo-cd.readthedocs.io/en/stable/operator-manual/applicationset/Generators-Git/)
- [Protocol Buffers: dos and don'ts](https://protobuf.dev/best-practices/dos-donts/)
- Next: [monorepo builds and deployments](monorepo-builds-and-deployments.md). Back to the [release engineering overview](../release-engineering.md).
