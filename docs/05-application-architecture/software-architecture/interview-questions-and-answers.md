# Software Architecture Interview Questions and Answers

These questions review architecture fundamentals, monoliths and
microservices, code organization styles, design principles and patterns,
domain-driven design, event-driven systems, microservices patterns, and
serverless. Try to answer each question aloud before reading the answer.

## Architecture fundamentals

### 1. What is software architecture?

Software architecture is the set of significant, hard-to-change decisions
about a system: its main components and responsibilities, how they
communicate, who owns which data, how it is deployed, and the constraints it
follows. It is driven mostly by quality attributes rather than features.

### 2. What are quality attributes, and why do they drive architecture?

Quality attributes (non-functional requirements) describe how well a system
works: performance, scalability, availability, reliability, security,
maintainability, testability, observability, and cost. Many structures can
deliver the same features, so these attributes decide which structure fits.
They should be stated as measurable scenarios.

### 3. Give an example of an architectural trade-off.

Adding a cache improves read latency and reduces database load, but
introduces stale data, invalidation logic, and another system to operate.
Splitting into microservices enables independent deploys but adds network
failures and distributed data problems.

### 4. What is Conway's law?

Conway's law states that systems tend to mirror the communication structure
of the organizations that build them. Teams use it deliberately with the
inverse Conway maneuver: organizing teams around the boundaries they want the
architecture to have.

### 5. What is an architecture decision record?

An ADR is a short document stored with the code that records one
significant decision: its status, context, the decision, alternatives, and
consequences. ADRs preserve the reasoning behind decisions and are
superseded, not deleted, when decisions change.

### 6. What is the C4 model?

C4 is a way of drawing architecture at four zoom levels: system context
(the system and its users and external systems), containers (deployable
units such as apps and databases), components (inside one container), and
code. Each level targets a different audience.

## Monoliths and microservices

### 7. What are the advantages of a monolith?

A monolith is simple to develop, test, debug, deploy, and operate; calls
between features are fast and cannot fail over the network; and database
transactions can span features. It can scale horizontally by running
several stateless instances.

### 8. What is a modular monolith?

A single deployable application divided into modules with enforced
boundaries: each module exposes a small public API, owns its own tables, and
never reaches into another module's internals. It provides clear boundaries
without the operational cost of microservices and eases later extraction.

### 9. What are microservices?

Small services organized around business capabilities that are deployed
independently, own their data, communicate over the network, and are owned
by a single team. They enable independent releases and scaling for large
organizations.

### 10. What are the main costs of microservices?

Network calls that can fail or be slow, no cross-service transactions and
eventual consistency, many pipelines and deployments to operate, the need
for distributed tracing and centralized logging, harder integration testing,
added latency, and API versioning across teams.

### 11. What is a distributed monolith?

A set of services that are deployed separately but remain tightly coupled:
they must be released together, share a database, or depend on long chains
of synchronous calls. It has the costs of microservices without their
benefits.

### 12. How do you decide between a monolith and microservices?

Consider team size and the need for independent releases, how well the
domain boundaries are understood, differing scaling needs, operational
maturity, and consistency requirements. A common recommendation is to start
with a modular monolith and extract services when a concrete need appears.

### 13. What is the strangler fig pattern?

An incremental migration approach: place a routing layer in front of a
legacy system, build one capability at a time as a new component, route its
traffic to the new component, and retire the old system when nothing routes
to it. It avoids risky big-bang rewrites.

## Layered, hexagonal, and clean architecture

### 14. What is layered architecture, and what is its main weakness?

Code is organized into layers—presentation, business, data access—with
dependencies pointing down. Its weakness is that business logic depends on
the data access layer, tying business rules to the database technology and
making them harder to test in isolation.

### 15. Explain ports and adapters.

In hexagonal architecture, the application core defines ports: interfaces
for the use cases it offers (inbound) and the services it needs (outbound).
Adapters implement them for specific technologies—HTTP controllers drive the
core, while database repositories and API clients are driven by it.

### 16. What is the dependency rule in clean architecture?

Source code dependencies must point inward, toward entities and use cases.
Inner circles never reference frameworks, databases, or UI. When the core
needs infrastructure, it defines an interface that an outer layer
implements.

### 17. What is a composition root?

The single place, usually at application startup, where concrete
implementations are created and wired into the components that depend on
them. It keeps knowledge of infrastructure choices out of the business code.

### 18. When is hexagonal or clean architecture over-engineering?

For thin CRUD applications with few business rules, a single entry point,
and stable infrastructure. The extra interfaces, adapters, and mappers add
indirection without much benefit; simple layering is usually enough.

## Design principles

### 19. What are cohesion and coupling?

Cohesion is how closely the contents of a module belong together; coupling
is how much a module depends on others. Good designs have high cohesion and
low coupling, connecting modules through small, stable interfaces.

### 20. Explain the single responsibility principle.

A module should have one reason to change—one source of change such as a
particular business rule or stakeholder. Mixing tax calculation, PDF
rendering, and email delivery in one class gives it several reasons to change.

### 21. Explain the open/closed principle with an example.

Code should be open for extension but closed for modification. Instead of
editing a growing `if/else` for each payment method, register payment
handlers in a map (strategy pattern) so new methods are added without
changing existing code.

### 22. What is the Liskov substitution principle?

A subtype must be usable anywhere its base type is expected without breaking
correctness. A read-only storage class that inherits a `write` method and
throws when it is called violates it; the abstraction should be split
instead.

### 23. What is dependency inversion, and how does it help testing?

High-level business logic should depend on abstractions, not on low-level
details such as database drivers. Dependencies are injected from outside, so
tests can supply in-memory fakes and run without real infrastructure.

### 24. What is the difference between DRY and avoiding the wrong abstraction?

DRY means each piece of knowledge has one authoritative representation.
Code that merely looks similar may represent different knowledge; merging it
creates a wrong abstraction that grows flags and special cases. Duplicate
code is cheaper than the wrong abstraction.

### 25. What do YAGNI and KISS mean?

YAGNI ("you aren't gonna need it") means not building features or
abstractions for imagined future requirements. KISS ("keep it simple") means
choosing the simplest design that solves the actual problem.

## Design patterns

### 26. What is the repository pattern?

A repository provides a collection-like interface for one type of domain
object—`findById`, `save`—and hides how and where objects are stored.
Business code stays free of query syntax and can be tested with in-memory
repositories.

### 27. What is dependency injection?

Supplying a component's dependencies from outside instead of having it
create them. In Node.js, factory functions that receive dependencies as
parameters, wired in a composition root, are a simple and common form.

### 28. Compare the adapter, facade, and decorator patterns.

An adapter converts one interface into another your code expects. A facade
provides a simple interface over a complex subsystem. A decorator wraps an
object with the same interface to add behavior such as caching or logging.

### 29. Why is a Node.js module-level singleton risky?

It is hidden global state that tests can interfere with, it is hard to
replace with a fake, it is only single per process and resolved file path,
and creating it may cause side effects at import time. Creating the instance
once and injecting it is safer.

## Domain-driven design

### 30. What is a bounded context?

An explicit boundary within which one domain model and its language apply
consistently. The same word, such as "product," can have different meanings
and data in different contexts, such as catalog and shipping.

### 31. What is the ubiquitous language?

A shared vocabulary used by developers and domain experts in conversation,
documentation, and code within a bounded context. It reduces translation
errors between business requirements and implementation.

### 32. What is the difference between an entity and a value object?

An entity has an identity that persists as its attributes change, such as an
order or customer. A value object has no identity, is immutable, and is
defined by its values, such as money or an address.

### 33. What is an aggregate?

A cluster of entities and value objects treated as one unit for changes,
with a single aggregate root that outside code interacts with. The aggregate
enforces its invariants; aggregates should be small, reference each other by
ID, and change one per transaction.

### 34. What is an anticorruption layer?

A translation layer that converts another system's model into your bounded
context's model, so foreign concepts and naming do not leak into your domain.
It is common when integrating with legacy systems or third-party APIs.

### 35. What are core, supporting, and generic subdomains?

The core subdomain gives the business its competitive advantage and deserves
the most design effort. Supporting subdomains are necessary but not
differentiating. Generic subdomains are common problems, such as
authentication, best bought or reused.

## Event-driven architecture

### 36. What is the difference between an event and a command?

A command is a request for a specific action, handled by one receiver, and
can be rejected. An event is a fact that something already happened, named
in the past tense, and can have zero or many subscribers.

### 37. What is the difference between choreography and orchestration?

In choreography, services react to each other's events with no central
coordinator. In orchestration, a central orchestrator sends commands to
services and tracks the process state. Orchestration is easier to monitor
for complex flows; choreography is looser for simple reactions.

### 38. What is eventual consistency?

A model in which different copies of data may temporarily disagree after an
update but converge if no new updates occur. Systems using asynchronous
events must design for it with clear intermediate states, idempotency, and
handling of out-of-order events.

### 39. What is event sourcing?

Storing an entity's state as an append-only sequence of events and deriving
current state by replaying them. It provides a full audit trail and the
ability to rebuild views, at the cost of a more complex programming model and
long-term event schema management. Snapshots speed up replay.

### 40. What is CQRS?

Command Query Responsibility Segregation uses separate models for writing
data (enforcing business rules) and reading data (denormalized views
optimized for queries). Read models are often updated from events and are
eventually consistent.

### 41. How do you evolve event schemas safely?

Include a type and version in each event, make only backward-compatible
changes such as adding optional fields, have consumers ignore unknown
fields, introduce a new version for breaking changes, publish both versions
during migration, and validate compatibility with a schema registry.

## Microservices patterns

### 42. What does an API gateway do?

It is the single entry point for clients: routing requests to services,
authenticating, rate limiting, terminating TLS, aggregating responses, and
handling cross-cutting concerns. It should not contain business logic.

### 43. What is the backend-for-frontend pattern?

Each client type, such as mobile and web, gets its own backend layer that
aggregates and shapes data for that client's needs. It avoids a single
compromised API but can duplicate logic if business rules leak into BFFs.

### 44. What is a saga?

A way to implement a business transaction across services as a sequence of
local transactions, with compensating transactions that semantically undo
completed steps if a later step fails. Sagas are coordinated by choreography
or orchestration and must be idempotent.

### 45. What is the transactional outbox pattern?

A service writes its state change and the outgoing event to an outbox table
in the same local transaction. A relay process later publishes outbox rows to
the broker. This prevents lost or phantom events, with at-least-once
delivery handled by idempotent consumers.

### 46. What is a circuit breaker?

A wrapper around calls to a dependency that opens after too many failures,
failing fast for a cool-down period, then allows trial calls in a half-open
state before closing again. It prevents cascading failures and wasted
resources.

### 47. What is a service mesh?

A layer of proxy sidecars deployed next to every service and managed by a
control plane. It provides mutual TLS, retries, timeouts, traffic
management, and telemetry for service-to-service traffic without changing
application code, at the cost of operational complexity.

### 48. Why is distributed tracing important in microservices?

A request crosses many services, so per-service logs cannot show the full
picture. Tracing propagates a trace ID across calls and messages and records
timed spans, letting you see the whole request path and find slow or failing
steps.

## Serverless

### 49. What is a cold start, and how do you reduce it?

The added latency when a serverless platform must create a new execution
environment and initialize your code. Reduce it with small packages, lazy or
once-per-environment initialization, more memory, provisioned concurrency
for latency-critical paths, or by accepting it for asynchronous work.

### 50. When is serverless a poor choice?

For long-running or CPU-heavy jobs beyond time limits, latency-critical APIs
that cannot tolerate cold starts, steady high-volume traffic where always-on
compute is cheaper, workloads needing persistent in-process connections or
special hardware, and teams that must avoid provider lock-in.

## Scenario-based questions

These describe a symptom in a running system. A good answer moves from what
to look at first, to how to prove the cause, to the fix.

### 51. After splitting into microservices, every deploy needs five teams to coordinate — what went wrong?

**What to check first:** Whether the services share a database, call each
other in long synchronous chains, or share a library or contract whose
change forces everyone to release together.

**How to confirm:** Recent features each touched several repositories, and
the call graph shows long sync chains or tables used by several services.

**Likely causes and fixes:** The boundaries follow technical layers or
entities, not business capabilities, giving a distributed monolith. Redraw
them around bounded contexts, give each service its own data, make API
changes backward compatible (expand, then contract), and use events instead
of sync chains. Merge services that always change together. See
[Monoliths, modular monoliths, and microservices](monolith-modular-monolith-microservices.md#in-production)
and [Domain-driven design](domain-driven-design.md).

### 52. Customers get the same order-confirmation email two or three times — where do you look?

**What to check first:** Most queues deliver at least once, so check whether
the email consumer is idempotent and whether it marks a message done before
or after the send succeeds.

**How to confirm:** The same message ID is processed more than once in the
logs, often after a crash or a run longer than the visibility timeout.

**Likely causes and fixes:** At-least-once delivery with no deduplication, or
a handler slower than the visibility timeout, so the message reappears while
still in progress. Record processed message IDs under a unique key and skip
repeats, pass an idempotency key to the email provider if it supports one,
and set the timeout above the worst-case run time. See
[Event-driven architecture](event-driven-architecture.md#in-production) and
the SQS handler in [Serverless architecture](serverless-architecture.md).

### 53. Orders are saved, but the warehouse service sometimes never hears about them — why?

**What to check first:** How the event is published. Committing to the
database and then publishing to the broker as a separate step is a dual
write: a crash, deploy or broker error in between loses the event.

**How to confirm:** Compare order rows with published `OrderPlaced` events
for a time window, and match the missing IDs with broker errors or restarts.

**Likely causes and fixes:** The dual write. Use a transactional outbox:
write the event to an outbox table in the same transaction as the order, and
let a relay publish it. Change data capture (for example Debezium) on the
database's log is the alternative. Either can publish twice, so consumers
must handle duplicates. See
[Microservices patterns](microservices-patterns.md).

### 54. The outbox table keeps growing and events reach consumers minutes late — what do you check?

**What to check first:** The age of the oldest unpublished row, and whether
the relay is running at all or stuck retrying one bad row.

**How to confirm:** Query the count and oldest `created_at` of unpublished
rows, read the relay logs for one row failing repeatedly, and check the
query plan of the relay's "fetch next batch" query.

**Likely causes and fixes:** The relay is down, a poison row blocks every
batch, the "unpublished" column has no index, or several relay copies fight
over the same rows. Alert on outbox lag, index the column, claim batches
with `FOR UPDATE SKIP LOCKED`, move rows that keep failing aside, and delete
published rows on a schedule. See
[Microservices patterns](microservices-patterns.md#in-production).

### 55. A booking saga leaves some bookings stuck in "pending" forever — how do you debug it?

**What to check first:** The saga's stored state: the last step that
completed, and whether it waits on a reply that never came or on a failed
compensation.

**How to confirm:** Follow the booking's correlation ID through each
participant's logs and traces, and count sagas not updated for longer than
the slowest step should take.

**Likely causes and fixes:** A lost reply (the participant has no outbox), a
waiting step with no timeout, a compensation that failed and was never
retried, or a non-idempotent step that rejected its own retry. Give each step
a deadline and a retry, make steps and compensations idempotent, run a
sweeper that times out or resumes stale sagas, and alert on the stuck count.
See [Microservices patterns](microservices-patterns.md#in-production).

### 56. One slow downstream service makes the whole site time out, and retries make it worse — what went wrong?

**What to check first:** The timeout and retry settings on every outbound
call along the path: HTTP client, SDK, gateway and service code.

**How to confirm:** Traces show requests waiting on that one dependency,
pools sit at their limit, and the dependency gets far more requests than
users send.

**Likely causes and fixes:** Calls without timeouts pile up and exhaust
shared pools, and retries at several layers multiply: three layers trying
three times each send up to 27 requests per user action. Give each hop a
shorter timeout than its caller, retry in one layer only (idempotent calls,
with exponential backoff and jitter), add a circuit breaker with a fallback,
and give each dependency its own pool (a bulkhead). See
[Microservices patterns](microservices-patterns.md#in-production).

### 57. The p99 latency of a Lambda-backed API spikes after quiet periods and after each deploy — why?

**What to check first:** Whether the slow requests are cold starts. Lambda's
`REPORT` log line includes `Init Duration` only when a new execution
environment was initialized for that request.

**How to confirm:** Filter the logs for `Init Duration` and match those
request IDs with the slow ones. Measure the bundle size, and time the code
that runs at module load (SDK clients, config fetches, large imports).

**Likely causes and fixes:** New environments are created after idle periods,
after deploys and during scale-out, and a heavy package or slow
initialization makes each one expensive. Trim and bundle dependencies,
lazy-load what the hot path does not need, and try more memory, which also
adds CPU. Use provisioned concurrency for latency-critical endpoints. See
[Serverless architecture](serverless-architecture.md#in-production).

### 58. During a traffic spike the database hits its connection limit and Lambda invocations start failing — what is happening?

**What to check first:** Open database connections against the maximum,
next to the function's concurrent executions at the same moment.

**How to confirm:** Open connections roughly equal concurrent executions
times the connections each environment opens. Check whether the client is
created inside the handler, which connects on every invocation.

**Likely causes and fixes:** Every execution environment holds its own
connections, so scaling out to hundreds of environments multiplies them.
Create the client once outside the handler and reuse it, keep each
environment's pool to one or two connections, put a pooler such as RDS Proxy
in front of the database, and cap the function with reserved concurrency.
See [Serverless architecture](serverless-architecture.md#in-production).

### 59. Users still see their old profile details for minutes after saving changes — where do you look?

**What to check first:** Whether reads come from a cache, a read replica or
a read model built from events, rather than from the record just written.

**How to confirm:** For one user, compare the value in the primary database,
the cache and the API response. Check the cache TTL, whether the write path
clears the key, and the replica or projection lag.

**Likely causes and fixes:** A cache never invalidated on write, a long TTL,
replica lag, or an eventually consistent read model (CQRS) still catching
up. Delete or refresh the cache key after the write commits, shorten the TTL,
read a user's own recent writes from the primary or write model, and show the
saved value from the write response in the UI. See
[Design patterns for backends](design-patterns-for-backends.md#in-production)
and [Event-driven architecture](event-driven-architecture.md#in-production).

### 60. Some users cannot log in, though their accounts clearly exist — what do you suspect?

**What to check first:** How the identifier is stored compared with how it is
looked up. A classic cause is email case: `User@Example.com` is saved but
`user@example.com` is searched.

**How to confirm:** Search the users case-insensitively for the failing
address, and check every path that creates users (sign-up, invites, imports).

**Likely causes and fixes:** Some paths normalize the value and others do not,
so stored values differ in case or whitespace. Normalize in one place (the
repository or an `Email` value object), add a unique index on the normalized
value, and migrate existing rows, checking for accounts that clash once
normalized. See
[Design patterns for backends](design-patterns-for-backends.md#in-production)
and value objects in [Domain-driven design](domain-driven-design.md).

### 61. The API returns 500 when a client sends an order with no lines — what is wrong?

**What to check first:** How errors thrown by the domain reach the HTTP
response. If the error middleware turns every exception into a 500, a broken
business rule looks like a server bug.

**How to confirm:** Reproduce with an empty `lines` array and read the logged
stack trace. The domain's "An order needs at least one line" check throws,
and nothing between it and Express maps it to a client error.

**Likely causes and fixes:** Business-rule violations and real bugs share one
error type and one status code. Throw a dedicated `DomainError` from the
domain and translate it to 400 or 422 in the HTTP adapter. Keep 500 for
unexpected errors, and alert only on 5xx, so on-call is not paged for bad
input. See
[Layered, hexagonal, and clean architecture](layered-hexagonal-and-clean-architecture.md#in-production).

### 62. A producer team changed an event and two consumer services broke in production — how do you prevent it next time?

**What to check first:** Exactly what changed (a field added, renamed,
removed or retyped) and how consumers parse events: strict validation may
reject unknown fields.

**How to confirm:** Consumer errors or dead-letter messages start at the
producer's deploy time. Diff event payloads from before and after it.

**Likely causes and fixes:** A breaking change shipped without a new version,
or consumers that reject anything unexpected. Make only additive changes to
an existing event and have consumers ignore unknown fields (a tolerant
reader). For a breaking change, publish a new version alongside the old one
until every consumer moves, and check compatibility in CI with a schema
registry or contract tests. See
[Event-driven architecture](event-driven-architecture.md#in-production).

### 63. Loading one page triggers 40 calls between services and takes two seconds — what do you change?

**What to check first:** A distributed trace of the page request: how many
spans, which run one after another, and whether a call repeats per item.

**How to confirm:** The trace shows a long waterfall, often an N+1 pattern
across the network: one call for the list, then one call per item.

**Likely causes and fixes:** Services cut too fine (one per entity), so one
use case needs many of them. Add batch endpoints, run independent calls in
parallel, compose the response in a backend for frontend or gateway, or keep
a local copy of data a service reads often, updated by events. Merge
services that are always called and changed together. See
[Monoliths, modular monoliths, and microservices](monolith-modular-monolith-microservices.md#in-production)
and [Microservices patterns](microservices-patterns.md).

### 64. In a modular monolith, changes in billing keep breaking shipping — how do you stop the modules eroding?

**What to check first:** Whether shipping imports billing's internal files
or reads billing's tables instead of using billing's public interface.

**How to confirm:** A dependency checker (dependency-cruiser for Node.js,
Packwerk for Rails) lists the imports that cross module boundaries.

**Likely causes and fixes:** Nothing enforces the boundaries, so shortcuts
pile up under deadline pressure. Give each module a small public API, make
the allowed dependencies a rule that fails the build (a fitness function),
and let exactly one module own each table. Record today's violations as a
baseline, block new ones, and fix the rest step by step. See
[Architecture fundamentals](architecture-fundamentals.md#in-production),
[Design principles](design-principles.md) and
[Monoliths, modular monoliths, and microservices](monolith-modular-monolith-microservices.md#in-production).

### 65. Adding each new payment provider means editing the same `switch` in five files — what is broken?

**What to check first:** Whether every place that charges, refunds or
reports branches on `provider`, scattering knowledge of the providers.

**How to confirm:** The last provider change touched many files, and bugs
appear where one `switch` was missed (refunds work, reports do not).

**Likely causes and fixes:** The code is not open for extension (the
open/closed principle), and one decision is repeated everywhere, which breaks
DRY in its real sense: duplicated knowledge. Define one `PaymentProvider`
interface (charge, refund, report), implement it once per provider (the
strategy pattern), and pick the implementation in one place, such as a
factory. A new provider then means one new module. See
[Design principles](design-principles.md) and
[Design patterns for backends](design-patterns-for-backends.md).

## Further learning

- [Software architecture overview](../software-architecture.md)
- [Martin Fowler: Software architecture guide](https://martinfowler.com/architecture/)
- [microservices.io: Pattern language](https://microservices.io/patterns/)
- [Azure Architecture Center: Cloud design patterns](https://learn.microsoft.com/en-us/azure/architecture/patterns/)
