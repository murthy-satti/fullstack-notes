# Chaos Engineering and Game Days

A load test proves the system is fast enough while everything works.
Chaos engineering asks the next question: what happens when parts of it
fail? It runs controlled experiments that inject real faults (a killed
instance, a slow dependency, a lost zone) and checks whether users still
get what they need. A game day rehearses the human side: the people who
would handle the failure practise detecting, diagnosing, and recovering
from it while everyone is awake and watching.

This lesson covers the principles of chaos engineering, steady state and
hypotheses, blast radius and safety controls, which faults to inject and
the tools that inject them (Chaos Monkey, AWS Fault Injection Service,
Gremlin, LitmusChaos, Chaos Mesh, Toxiproxy, and others), how to start
small, how to run a game day, and what to do with the findings. The
patterns that experiments verify (timeouts, retries, circuit breakers,
load shedding) are explained in
[resilience patterns across servers](../load-balancing-and-multi-server/resilience-patterns-across-servers.md),
and restore and failover drills for data in
[restore testing and runbooks](../backups/restore-testing-and-runbooks.md).

## Why it matters

Resilience features are code paths that run only when something fails:
the timeout that fires, the retry that backs off, the failover that
promotes a replica, the autoscaling that replaces an instance. Code that
rarely runs rots quietly. A configuration change disables a health check,
a new dependency is added without a timeout, a runbook refers to a
dashboard that no longer exists, and nobody finds out until the real
failure, usually at night.

Distributed systems also fail in combinations nobody designed for: a slow
dependency fills a connection pool, which fails health checks, which
removes healthy instances from the load balancer. Experiments surface these
interactions in daylight, with a small blast radius and people ready to
stop. And because incidents are handled by people, practising the response
is as important as testing the software.

## Real-world usage

- **Principles of Chaos Engineering.** The community statement at
  [principlesofchaos.org](https://principlesofchaos.org/) defines chaos
  engineering as "the discipline of experimenting on a system in order to
  build confidence in the system's capability to withstand turbulent
  conditions in production", and describes the experiment: define steady
  state as a measurable output, hypothesize that it continues in a control
  and an experimental group, introduce real-world events, and try to
  disprove the hypothesis. Its advanced principles add running in
  production, automating experiments, and minimizing the blast radius.
- **Netflix.** [Chaos Monkey](https://github.com/Netflix/chaosmonkey)
  "randomly terminates virtual machine instances and containers that run
  inside of your production environment", so that engineers build services
  that survive it; it requires the Spinnaker delivery platform. It was
  part of the [Simian Army](https://netflixtechblog.com/the-netflix-simian-army-16e57fbab116)
  (2011), whose repository was archived in 2021; Chaos Monkey now lives on
  as a standalone service. Netflix later described its Chaos Automation
  Platform in
  [A Platform for Automating Chaos Experiments](https://arxiv.org/abs/1702.05849),
  which runs failure-injection experiments in production to verify that
  failures in non-critical services do not cause outages. How Netflix's
  wider architecture is built is covered in
  [how top companies run at scale](../load-balancing-and-multi-server/how-top-companies-run-at-scale.md).
- **Google DiRT.** In
  [Building resilient systems to weather the unexpected](https://cloud.google.com/blog/products/management-tools/sre-principles-in-practice-for-business-continuity)
  (2020), Google's Ben Treynor Sloss describes Disaster Recovery Testing
  (DiRT), "a regular, coordinated set of both real and fictitious incidents
  and outages across the company", that tests "everything from our
  technical systems to processes and people". It uses capacity that is not
  needed at the time, and stops a test before that capacity is needed if
  engineers cannot find the fix quickly.
- **AWS Well-Architected.** The Reliability Pillar's
  [REL12-BP04 Test resiliency using chaos engineering](https://docs.aws.amazon.com/wellarchitected/latest/framework/rel_testing_resiliency_failure_injection_resiliency.html)
  gives a hypothesis template, recommends stop conditions as guardrails
  and running experiments as part of CI/CD, and warns not to run an
  experiment you already know will fail;
  [REL12-BP05 Conduct game days regularly](https://docs.aws.amazon.com/wellarchitected/latest/framework/rel_testing_resiliency_game_days_resiliency.html)
  lists anti-patterns such as documenting procedures but never exercising
  them.
- **Shopify.** The [Toxiproxy](https://github.com/Shopify/toxiproxy) README
  says Shopify has used it "in all development and test environments"
  since October 2014, to prove with tests that applications do not have
  single points of failure.

**Popular tools and providers:** Netflix Chaos Monkey, AWS Fault Injection
Service, Azure Chaos Studio, Gremlin, LitmusChaos, Chaos Mesh, Chaos
Toolkit, and Toxiproxy.

## How it works

### The principles in practice

| Principle | What it means for TaskFlow API |
|---|---|
| Build a hypothesis around steady state | Define "working" as user-visible outputs: task creation success rate, p99 of `GET /tasks`, not CPU or pod counts |
| Vary real-world events | Inject what actually happens: instances die, MongoDB elects a new primary, the notification service slows down, a zone degrades |
| Run experiments in production | The real system is the only fully accurate test bed, but only after the same experiment has passed in lower environments |
| Automate experiments to run continuously | An experiment that passed becomes a regression test in CI or a scheduled job |
| Minimize the blast radius | One pod, one instance, 1% of traffic, a few minutes, with an abort that works |

### Steady state and the hypothesis

**Steady state** is a measurable output that shows the system is healthy
from the user's point of view, usually an SLI from
[SLIs, SLOs, and error budgets](../monitoring-and-logging/slis-slos-and-error-budgets.md):
request success rate, a latency percentile, tasks saved per minute. Measure
it before the experiment; if the system is not in steady state, do not
start.

A **hypothesis** says what will happen and why, and must be falsifiable.
AWS's template works well: *If [specific fault] occurs, the [workload]
will [mitigation] to maintain [business or technical metric].* For
TaskFlow:

- If one of three API instances is terminated, the load balancer stops
  routing to it within 30 seconds and the Auto Scaling group replaces it,
  so the 5xx rate rises by less than 0.1 percentage points.
- If the notification service responds 3 seconds slower, `POST /tasks`
  still succeeds in under 1 second, because the call has a 300 ms timeout
  and failed notifications are retried later.
- If the MongoDB primary steps down, writes fail for less than 20 seconds
  and the driver's retryable writes absorb most of them.

An experiment either supports the hypothesis (confidence grows) or
disproves it (you found a weakness, which is the valuable outcome).
Experiments you already expect to fail are not experiments: fix the known
weakness first.

![Diagram: the chaos experiment loop. One, define steady state as a metric users feel, such as p99 and errors. Two, a hypothesis: if X fails, steady state holds because of Y. Three, limit the blast radius to one pod or 1 percent of traffic, with stop conditions ready. Four, inject the fault: kill, delay, drop, stress, exhaust. Five, observe and compare with the control and the steady state; if a stop condition is hit, halt, restore, and learn. Six, learn and fix with a blameless review. Seven, automate the experiment as a regression test, then widen the scope, and start the next experiment.](chaos-experiment-loop.svg)

### Blast radius and safety controls

The **blast radius** is how much of the system, and how many users, an
experiment can affect. Keep it small and make it smaller when in doubt:

- **Where:** a local test, then a staging or performance environment, then
  production.
- **What:** one pod or instance, a small percentage of traffic, one zone;
  never everything at once.
- **How long:** minutes, with the fault removed automatically at the end
  (Toxiproxy toxics are removed by the test, Chaos Mesh faults have a
  `duration`, FIS actions restart or replace what they stopped).
- **Stop conditions:** automatic guardrails that end the experiment when
  a metric crosses a threshold. AWS FIS ties them to CloudWatch alarms (up
  to five per experiment template); in other tools, an alert on the
  steady-state metric plus a person with a tested abort command.
- **When:** working hours, off-peak, with the owning team watching and
  support informed; never during an incident or a release freeze.
- **Rollback:** know how to restore the system to a known-good state, and
  check it is there at the end.

![Diagram: a ladder of five rungs read from the bottom, each with its risk to users and the condition for climbing. Rung 1, local and CI: Toxiproxy in integration tests makes dependencies slow or unavailable; no risk; climb when the test passes on every build. Rung 2, a performance or staging environment: pod kills and network delay under a k6 load test; no users at risk; climb when the hypothesis held twice and the stop conditions were tested. Rung 3, a production canary: one pod or 1 percent of traffic, off-peak, with an abort switch ready; a few users briefly at risk; climb when alerts fired and the SLO did not burn. Rung 4, a production game day: stop the instances in one zone with the team watching; one zone at risk; climb when runbooks worked and the fixes shipped. Rung 5, continuous: small automated experiments on a schedule or per release, with small, ongoing risk.](blast-radius-ladder.svg)

### What to inject

Choose faults from your own history (postmortems, near misses) and from
the dependencies on your architecture diagram, ranked by how often they
happen and how much they would hurt.

| Fault | Real event it models | What it verifies | Typical tools |
|---|---|---|---|
| Kill an instance, container, or pod | Hardware failure, OOM kill, a bad node | Redundancy, health checks, rescheduling, graceful shutdown | Chaos Monkey, FIS (`aws:ec2:terminate-instances`, `aws:eks:pod-delete`), Chaos Mesh `PodChaos` |
| Add latency to a dependency | A slow database, network congestion, a struggling service | Timeouts, connection pools, bulkheads, user-facing fallbacks | Toxiproxy `latency`, Chaos Mesh `NetworkChaos`, FIS network-latency actions for ECS and EKS |
| Make a dependency unavailable or reset connections | A crashed service, a firewall change | Fallbacks, circuit breakers, retries with backoff, error messages | Toxiproxy `down`, `reset_peer`, `timeout`; Chaos Mesh partition |
| Drop packets | A flaky network | Retries, idempotency | Toxiproxy `packet_loss`, Chaos Mesh `loss` |
| Stress CPU or memory | Noisy neighbours, a runaway process | Autoscaling, resource limits, load shedding | FIS CPU stress through Systems Manager, Chaos Mesh `StressChaos`, LitmusChaos `pod-cpu-hog` |
| Throttle cloud API calls | Provider throttling during an event | Backoff in automation and SDK calls | FIS `aws:fis:inject-api-throttle-error` |
| Fail over the database | A primary crash or maintenance | Driver reconnection, retryable writes, timeouts | FIS RDS and Aurora failover actions; `rs.stepDown()` on a MongoDB replica set in staging |
| Lose a zone | A data-centre or power event | Capacity in the remaining zones, failover runbooks | Several faults combined in one experiment, as a game day |

### Tools

| Tool | What it is | Where it injects | Status in November 2026 |
|---|---|---|---|
| **Chaos Monkey** | Netflix's open-source instance and container killer | Production fleets managed with Spinnaker | Open source, lifecycle marked active; requires Spinnaker |
| **AWS Fault Injection Service (FIS)** | Managed service: experiment templates with actions, targets, and stop conditions | EC2, ECS, EKS, RDS, networking, API faults; can run Chaos Mesh and Litmus resources on EKS | Generally available; renamed from AWS Fault Injection Simulator in 2023 |
| **Azure Chaos Studio** | Managed chaos service for Azure | Service-direct and agent-based faults; Scenarios such as a zone outage | Workspaces and Scenarios in public preview, replacing classic Experiments |
| **Gremlin** | Commercial reliability platform | Services, hosts, and containers; Failure Flags for application-level and serverless faults | Commercial, with reliability scoring and GameDays |
| **LitmusChaos** | Kubernetes-native chaos platform with a hub of experiments | Pods, nodes, applications in Kubernetes | CNCF incubating project since January 2022 |
| **Chaos Mesh** | Kubernetes chaos platform driven by custom resources | `PodChaos`, `NetworkChaos`, `StressChaos`, and more | CNCF incubating project since February 2022 |
| **Toxiproxy** | A TCP proxy controlled over HTTP, built for tests | Any TCP connection your code makes (databases, caches, HTTP services) | Open source (MIT) from Shopify; release 2.13.0 added optional API tokens |

For a team on one cloud account, the managed service of that cloud is the
easiest start; for Kubernetes, LitmusChaos or Chaos Mesh; for code-level
and CI experiments, Toxiproxy. Costs follow the same split: open-source
tools are the cheapest to adopt but cost the time to run and secure them;
a managed service such as AWS FIS bills for the minutes its actions run,
so short, targeted experiments stay cheap; commercial platforms add a
subscription on top, which buys support, a fault catalogue, and safety
features.

### Starting small

A sensible order for a team that has never done this:

1. **Tabletop exercise.** Walk through "the notification service is down"
   on paper with the people who would respond. It costs an hour and finds
   gaps in alerts and runbooks.
2. **Fault-injection tests in CI.** Toxiproxy in integration tests proves
   that timeouts and fallbacks behave as designed, on every build.
3. **Experiments in a performance environment under load.** Combine a k6
   load test with pod kills or network delay; this is where most
   surprises appear (see [load testing with k6](load-testing-with-k6.md)).
4. **A game day in staging, then production**, with stop conditions and a
   tested abort.
5. **Automate the experiments that passed** and run them on a schedule or
   with releases, widening the scope slowly.

### Game days

A **game day** is a planned exercise in which a team injects a failure
into a real system and practises the full response. It tests what
automated experiments cannot: whether alerts reach the right person,
whether dashboards answer the questions people ask, whether the runbook
works when followed by someone who did not write it, and whether
communication with stakeholders happens.

![Diagram: a game day timeline. Before: weeks ahead, write the scenario and hypothesis, assign roles, notify stakeholders, and check access. During: at T minus 30 minutes a briefing on goals, roles, and abort rules; at T zero a baseline confirming steady state; at T plus 5 the fault is injected; from T plus 5 to T plus 45 the team detects, responds, and notes every timestamp; at T plus 50 the fault ends and steady state is confirmed. After: a hot debrief at T plus 60 asking what surprised people, and within a week a written review with action items and runbook updates. Roles: a facilitator who runs the plan and calls the abort, operators who respond as when on call, a scribe who timestamps everything, and a communications lead who keeps stakeholders informed.](game-day-timeline.svg)

Good game days share a few traits:

- **A written plan:** scenario, hypothesis, success criteria, blast
  radius, abort conditions, and who does what.
- **Real roles:** the facilitator injects and can abort; the operators are
  the people normally on call, not the system's authors; a scribe records
  timestamps (time to detect, time to mitigate) for the review.
- **Announced, not secret,** at least for the first ones; surprise drills
  come later, when the basics work.
- **A blameless review** within a week, using the same format as an
  incident postmortem (see
  [incident response and postmortems](../monitoring-and-logging/incident-response-and-postmortems.md)).

Data-recovery drills (restoring a database to a point in time, failing
over to another region) follow the same format and are covered in
[restore testing and runbooks](../backups/restore-testing-and-runbooks.md).

### What to do with findings

An experiment or game day is wasted if nothing changes afterwards:

- **Record the outcome:** hypothesis supported or disproved, with the
  evidence (graphs, timestamps, logs).
- **Turn every weakness into a tracked action** with an owner and a date:
  a missing timeout, an alert that did not fire, a runbook step that was
  wrong, a dashboard that was missing.
- **Re-run the experiment after the fix**, then automate it so the
  weakness cannot return unnoticed.
- **Update runbooks, alerts, and dashboards** with what the responders
  actually needed.
- **Share the results** beyond the team; other services often have the
  same weakness.
- **Track coverage over time:** which critical dependencies and failure
  modes have a passing experiment, and how recently.

## When to use and when not to use

| Situation | Approach |
|---|---|
| A new dependency or resilience pattern (timeout, fallback, retry) | A Toxiproxy test in CI |
| Before a big launch or seasonal peak | A game day in the performance environment under a k6 load |
| After a major architecture change (new region, new database) | Experiments in staging, then a production game day |
| Mature service with SLOs, good observability, tested aborts | Small automated experiments in production |
| On-call team new to a service | A tabletop exercise, then a game day |

Do not run chaos experiments (yet) when:

- There is no monitoring that shows steady state; you could not tell
  whether the experiment hurt users. Fix observability first.
- You already know the system will fail; fix the known weakness instead.
- The system has a single point of failure by design; an experiment only
  causes an outage.
- An incident is in progress, a release freeze is on, or the owning team
  is unavailable.
- There is no stop condition or rollback you have tested.

## Practical examples

### An experiment card

```text
Experiment:   Slow notification service, TaskFlow API (staging)
Owner:        TaskFlow team; facilitator on duty this week
Steady state: POST /tasks success rate > 99.9%, p95 < 300 ms (k6 at 120 requests/s)
Hypothesis:   If the notification service responds 3 s slower, POST /tasks still
              succeeds in under 1 s, because the call has a 300 ms timeout and
              deferred notifications are retried later.
Fault:        Toxiproxy latency toxic, 3000 ms, on the notifications proxy
Blast radius: staging only; one service; 10 minutes
Stop if:      POST /tasks success rate < 99% for 1 minute, or p95 > 2 s
Abort:        toxiproxy-cli toxic remove --toxicName latency_downstream notifications
Result:       (filled in afterwards: supported or disproved, with graphs and timestamps)
Follow-ups:   (actions with owners and dates)
```

### A non-critical call with a timeout and a fallback

The hypothesis above depends on code like this:

```js
// src/notifications.js: a non-critical call with a short timeout and a fallback
const NOTIFY_URL = process.env.NOTIFY_URL ?? "http://localhost:4000/notifications";

export async function notifyTaskCreated(task, { timeoutMs = 300, log = console } = {}) {
  try {
    const res = await fetch(NOTIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "task.created", taskId: task.id }),
      signal: AbortSignal.timeout(timeoutMs), // never wait longer than this
    });
    if (!res.ok) throw new Error(`notification service returned ${res.status}`);
    return "sent";
  } catch (err) {
    // Non-critical: the task is already saved; a background job retries deferred notifications.
    log.warn({ err: err.message, taskId: task.id }, "notification deferred");
    return "deferred";
  }
}
```

`AbortSignal.timeout()` bounds the wait, and the `catch` turns any failure
(a timeout, a refused connection, a 5xx) into a logged, deferred
notification instead of a failed request. A more robust design writes the
notification to a queue or an outbox in the same transaction as the task
(see [messaging fundamentals](../../../05-application-architecture/message-queues/messaging-fundamentals.md));
the experiment is what tells you whether the simpler version is enough.

### A chaos test with Toxiproxy

Toxiproxy sits between the API and the notification service. The API is
started with `NOTIFY_URL=http://127.0.0.1:4100/notifications`, the proxy
listens on port 4100 and forwards to the real service on port 4000, and
the test changes the network between them through Toxiproxy's HTTP API on
port 8474:

```js
// test/chaos/notifications.test.js: creating a task survives a slow or dead notification service
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

const TOXIPROXY = process.env.TOXIPROXY_URL ?? "http://localhost:8474";
const API = process.env.BASE_URL ?? "http://localhost:3000";

async function toxiproxy(path, method = "GET", body) {
  const res = await fetch(`${TOXIPROXY}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`toxiproxy ${method} ${path}: HTTP ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

async function createTask(title) {
  const started = performance.now();
  const res = await fetch(`${API}/tasks`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${process.env.API_TOKEN}` },
    body: JSON.stringify({ title }),
  });
  await res.arrayBuffer(); // read the body so the timing includes it
  return { status: res.status, ms: performance.now() - started };
}

before(async () => {
  // The API under test runs with NOTIFY_URL=http://127.0.0.1:4100/notifications.
  await toxiproxy("/populate", "POST", [
    { name: "notifications", listen: "127.0.0.1:4100", upstream: "127.0.0.1:4000" },
  ]);
});

after(async () => {
  await toxiproxy("/reset", "POST"); // remove every toxic and re-enable every proxy
});

test("steady state: a task is created in under 500 ms", async () => {
  const { status, ms } = await createTask("steady state");
  assert.equal(status, 201);
  assert.ok(ms < 500, `took ${ms.toFixed(0)} ms`);
});

test("notification service 3 s slower: still created in under 1 s", async () => {
  await toxiproxy("/proxies/notifications/toxics", "POST", {
    name: "slow_notifications",
    type: "latency",
    stream: "downstream",
    attributes: { latency: 3000 },
  });
  try {
    const { status, ms } = await createTask("slow dependency");
    assert.equal(status, 201);
    assert.ok(ms < 1000, `took ${ms.toFixed(0)} ms`);
  } finally {
    await toxiproxy("/proxies/notifications/toxics/slow_notifications", "DELETE");
  }
});

test("notification service down: still created", async () => {
  await toxiproxy("/proxies/notifications", "PATCH", { enabled: false });
  try {
    const { status } = await createTask("dependency down");
    assert.equal(status, 201);
  } finally {
    await toxiproxy("/proxies/notifications", "PATCH", { enabled: true });
  }
});
```

```text
$ node --test test/chaos/
✔ steady state: a task is created in under 500 ms (64.3956ms)
✔ notification service 3 s slower: still created in under 1 s (366.6143ms)
✔ notification service down: still created (46.5578ms)
ℹ tests 3
ℹ pass 3
ℹ fail 0
```

The output is from a local run against a stand-in API that uses the
`notifyTaskCreated()` function above: with 3 seconds of injected latency
the task was still created in about 370 ms, which is the 300 ms timeout
plus normal work. Details worth copying:

- `/populate` creates the proxy, or leaves it alone if it already exists
  with the same addresses, so the test can run repeatedly.
- A latency toxic on the `downstream` stream delays the service's
  responses; one on `upstream` delays requests.
- Proxy updates use `PATCH`: Toxiproxy 2.13 logs that updating a proxy
  with `POST` is deprecated.
- `finally` blocks and `POST /reset` remove the faults even when an
  assertion fails, so one failed test does not poison the next.
- The Toxiproxy API is unauthenticated by default and can proxy to any
  address: keep it on localhost or a private test network, or start it
  with `TOXIPROXY_AUTH_TOKEN` set.

### Exploring by hand with toxiproxy-cli

```bash
toxiproxy-server &                      # API on localhost:8474
toxiproxy-cli create --listen localhost:4100 --upstream localhost:4000 notifications
toxiproxy-cli toxic add --type latency --attribute latency=1000 notifications
toxiproxy-cli inspect notifications     # shows latency_downstream, latency=1000
toxiproxy-cli toxic remove --toxicName latency_downstream notifications
toxiproxy-cli toggle notifications      # disabled: new connections are refused
toxiproxy-cli toggle notifications      # enabled again
```

A toxic added without `--toxicName` is named `<type>_<stream>`, here
`latency_downstream`; a toxic is applied to the downstream stream unless
you pass `--upstream`. In a local check, a request through the proxy took
about 1,035 ms with the 1,000 ms latency toxic, and a disabled proxy
refused connections outright, which is how a crashed service looks to its
callers.

### Kubernetes: Chaos Mesh experiments for TaskFlow

```yaml
# k8s/chaos/taskflow-api-pod-kill.yaml: kill one TaskFlow API pod
apiVersion: chaos-mesh.org/v1alpha1
kind: PodChaos
metadata:
  name: taskflow-api-pod-kill
  namespace: taskflow-staging
spec:
  action: pod-kill
  mode: one                         # one random pod that matches the selector
  selector:
    namespaces:
      - taskflow-staging
    labelSelectors:
      app.kubernetes.io/name: taskflow-api
```

```yaml
# k8s/chaos/taskflow-mongodb-delay.yaml: 200 ms extra latency from the API to MongoDB for 5 minutes
apiVersion: chaos-mesh.org/v1alpha1
kind: NetworkChaos
metadata:
  name: taskflow-api-mongodb-delay
  namespace: taskflow-staging
spec:
  action: delay
  mode: all
  selector:
    namespaces:
      - taskflow-staging
    labelSelectors:
      app.kubernetes.io/name: taskflow-api
  direction: to
  target:
    mode: all
    selector:
      namespaces:
        - taskflow-staging
      labelSelectors:
        app.kubernetes.io/name: mongodb
  delay:
    latency: "200ms"
    jitter: "50ms"
    correlation: "25"
  duration: "5m"
```

`kubectl apply -f` starts an experiment and `kubectl delete -f` ends it
early. `mode` chooses how many matching pods are affected (`one`, `all`,
`fixed`, `fixed-percent`, or `random-max-percent`), and `direction` with
`target` limits the delay to traffic between the API and the database. For
a database outside the cluster, such as a managed MongoDB service,
`externalTargets` takes IP addresses or domain names instead of a pod
`target`. The pod kill expects the Deployment's other replicas, readiness
probes, and graceful shutdown (see
[health probes and rolling updates](../kubernetes/health-probes-and-rolling-updates.md))
to keep the 5xx rate flat.

### AWS: a Fault Injection Service experiment

An experiment template for TaskFlow's EC2 fleet, saved as
`fis/taskflow-terminate-one-instance.json`. It terminates one running API
instance in one zone and stops automatically if the 5xx alarm goes off:

```json
{
  "description": "Terminate one TaskFlow API instance in us-east-1a; the Auto Scaling group should replace it",
  "targets": {
    "taskflowApi": {
      "resourceType": "aws:ec2:instance",
      "resourceTags": { "app": "taskflow-api", "env": "production" },
      "filters": [
        { "path": "Placement.AvailabilityZone", "values": ["us-east-1a"] },
        { "path": "State.Name", "values": ["running"] }
      ],
      "selectionMode": "COUNT(1)"
    }
  },
  "actions": {
    "terminateOneInstance": {
      "actionId": "aws:ec2:terminate-instances",
      "description": "lose one API instance",
      "targets": { "Instances": "taskflowApi" }
    }
  },
  "stopConditions": [
    {
      "source": "aws:cloudwatch:alarm",
      "value": "arn:aws:cloudwatch:us-east-1:111122223333:alarm:taskflow-api-5xx-rate"
    }
  ],
  "roleArn": "arn:aws:iam::111122223333:role/fis-taskflow-experiments",
  "tags": { "Name": "taskflow-terminate-one-instance" }
}
```

```bash
aws fis create-experiment-template --cli-input-json file://fis/taskflow-terminate-one-instance.json
aws fis start-experiment --experiment-template-id <template-id>
aws fis get-experiment --id <experiment-id>    # state: initiating, running, completed, stopped, failed ...
aws fis stop-experiment --id <experiment-id>   # the manual abort switch
```

The template follows the shape of AWS's own examples: targets found by
tags and filters, `selectionMode` to limit them (`COUNT(1)`, `PERCENT(25)`,
or `ALL`), actions that reference targets by name, and CloudWatch alarms as
stop conditions. The IAM role in `roleArn` must allow FIS to terminate
instances, and nothing else; keep it as narrow as the experiment. Account
`111122223333` is the placeholder AWS uses in its documentation.

### A game day plan

```text
Game day:     TaskFlow API loses a zone (staging), Thursday 14:00-16:00 UTC
Scenario:     Terminate every API instance in one of three zones; MongoDB primary unaffected
Hypothesis:   Requests keep succeeding (5xx < 1% for at most 2 minutes) because the load
              balancer routes to the two healthy zones and autoscaling restores capacity in
              under 10 minutes; the on-call engineer is paged and follows the "zone loss"
              runbook.
Load:         k6 average-load test at 120 requests/s, started at 13:45
Stop if:      5xx > 5% for 2 minutes, p95 > 2 s for 5 minutes, or the facilitator calls it
Roles:        facilitator (injects, can abort), operators (this week's on-call pair),
              scribe (timestamps), comms lead (status channel)
Schedule:     13:30 briefing; 13:45 load starts; 14:00 baseline check; 14:05 inject;
              14:05-14:45 respond and observe; 14:50 restore and verify; 15:00 hot debrief
Measure:      time to detect, time to mitigate, peak 5xx rate, time until capacity restored
Afterwards:   written review within a week; every surprise becomes an action with an owner
```

## Best practices

- Start with a hypothesis about steady state that users would notice, and
  measure steady state before injecting anything.
- Begin where failure costs nothing (tests, CI, staging) and widen the
  blast radius only after the smaller experiment has become boring.
- Always have stop conditions and a tested abort; know how to restore a
  known-good state.
- Inject faults that really happen, ranked by frequency and impact; reuse
  your postmortems.
- Run experiments under realistic load; many weaknesses appear only when
  pools and queues are busy.
- Announce experiments and game days, and involve the people who would
  respond for real.
- Treat every disproved hypothesis as a success: it found a weakness
  before users did.
- Automate experiments that passed and re-run them after changes.
- Keep chaos tooling locked down: its APIs and roles can break production
  on purpose.

## In production

- **An experiment caused a real outage.**
  *Detect:* the steady-state metric fell beyond the expected range and
  users reported errors during the experiment. *Cause:* the blast radius
  was too large, or stop conditions were missing or never tested. *Fix:*
  run a blameless review, shrink the scope, test the stop condition in a
  dry run, and climb back up the ladder from a lower environment.
- **Nobody noticed the injected failure.**
  *Detect:* the game day scribe records no alert and no human reaction
  while the fault was active. *Cause:* alerts on the wrong signals, or
  routed to the wrong place. *Fix:* alert on SLO burn and symptoms, test
  paging during the next game day, and add the missing dashboard panels
  (see [alerting and on-call](../monitoring-and-logging/alerting-and-on-call.md)).
- **A timeout exists, but requests still hang.**
  *Detect:* with latency injected, the API's response time equals the
  dependency's delay. *Cause:* the timeout is set on a different client,
  is longer than the request budget, or wraps only part of the call (DNS
  and connect excluded). *Fix:* set an explicit timeout on every outbound
  call and verify it with a Toxiproxy test in CI.
- **Killing one instance causes a burst of errors.**
  *Detect:* 5xx spikes for tens of seconds after a pod or instance is
  terminated. *Cause:* no graceful shutdown, health checks that react too
  slowly, or clients without retries for idempotent requests. *Fix:*
  handle SIGTERM by draining connections, tune readiness and load-balancer
  health checks, and retry idempotent requests with backoff.
- **The experiment would not stop.**
  *Detect:* the fault remains after the abort command, or a proxy stays
  in place after the test run. *Cause:* a cleanup step that depended on
  the test passing, or an abort path that was never exercised. *Fix:*
  remove faults in `finally` blocks and `after` hooks, give every fault a
  duration, and practise the abort before the real run.
- **Findings were recorded but never fixed.**
  *Detect:* the same weakness appears in the next game day. *Cause:* no
  owners, no dates, no tracking. *Fix:* treat game-day findings like
  postmortem actions, with owners and due dates, and re-run the
  experiment to close them.

## Important terminology

- **Chaos engineering:** Experimenting on a system to build confidence
  that it withstands turbulent conditions.
- **Steady state:** A measurable, user-visible output that shows normal
  behaviour.
- **Hypothesis:** A falsifiable statement of what will happen to steady
  state when a fault occurs, and why.
- **Blast radius:** How much of the system, and how many users, an
  experiment can affect.
- **Stop condition:** A guardrail that ends an experiment automatically
  when a metric crosses a threshold.
- **Fault injection:** Deliberately introducing a failure such as latency,
  errors, or termination.
- **Control group / experimental group:** Comparable parts of the system
  with and without the fault.
- **Game day:** A planned exercise in which a team handles an injected
  failure as it would a real incident.
- **Tabletop exercise:** A discussion-only walk-through of a failure
  scenario.
- **Toxic:** A Toxiproxy fault, such as latency or a reset connection.
- **Experiment template:** In AWS FIS, the blueprint of actions, targets,
  and stop conditions.

## Common mistakes and misconceptions

- "Chaos engineering means breaking production at random." It means
  controlled experiments with hypotheses, small blast radiuses, and stop
  buttons.
- Starting in production before the same experiment has passed in lower
  environments.
- Running experiments without observability, so nobody can tell whether
  users were hurt.
- Injecting faults you already know the system cannot handle.
- Measuring infrastructure (CPU, pod counts) instead of the user-facing
  steady state.
- Treating a passed experiment as permanent; systems change, so re-run
  them.
- Running game days with the system's authors as responders, which tests
  memory instead of runbooks.
- Collecting findings without owners and dates.

## Revision questions

1. Define steady state for TaskFlow API and write a hypothesis for "the
   MongoDB primary steps down".
2. What controls keep the blast radius of an experiment small? Name at
   least four.
3. Why should a chaos experiment usually run under load?
4. When should you not run a chaos experiment?
5. Which tool would you use to test a timeout in CI, to kill pods in
   Kubernetes, and to terminate an EC2 instance with an automatic stop
   condition?
6. An experiment injects 3 s of latency into a dependency that is called
   with a 300 ms timeout and no retries, on an endpoint whose SLO is p95
   under 1 s. If the rest of the request takes 40 ms, what latency do you
   expect, and what would it mean if you measured 3 s? (About 340 ms; a 3 s
   result means the timeout is not applied to that call.)
7. What roles does a game day need, and why should the responders not be
   the system's authors?
8. What should happen to a finding from a game day?

## Further learning

- [Principles of Chaos Engineering](https://principlesofchaos.org/)
- [AWS Well-Architected: REL12-BP04 Test resiliency using chaos engineering](https://docs.aws.amazon.com/wellarchitected/latest/framework/rel_testing_resiliency_failure_injection_resiliency.html)
- [AWS Fault Injection Service user guide](https://docs.aws.amazon.com/fis/latest/userguide/what-is.html)
- [Chaos Mesh documentation](https://chaos-mesh.org/docs/simulate-pod-chaos-on-kubernetes/)
- [LitmusChaos documentation](https://docs.litmuschaos.io/docs/introduction/what-is-litmus)
- [Toxiproxy on GitHub](https://github.com/Shopify/toxiproxy)
- [Google SRE book: Addressing Cascading Failures](https://sre.google/sre-book/addressing-cascading-failures/)
- Next: [performance and reliability testing interview questions and answers](interview-questions-and-answers.md).
  Back to the [performance and reliability testing overview](../performance-and-reliability-testing.md).
