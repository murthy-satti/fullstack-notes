# Deployment Strategies

A deployment strategy is the plan for replacing the running version of an
application with a new one: in what order instances change, how user
traffic moves from the old version to the new one, how you notice that
something is wrong, and how you get back to safety when it is. The same
build can be shipped with minutes of downtime or with none, to every user
at once or to 1% first; the strategy decides which.

## What deployment strategies provide

- **Less or no downtime:** rolling, blue-green, and canary deployments
  keep healthy instances serving while others change.
- **A smaller blast radius:** canary releases, rings, and feature flags
  expose a bad change to a small share of users before everyone.
- **Fast recovery:** keeping the previous version runnable (an old
  environment, an old image, a flag you can switch off) turns an outage
  into a short incident.
- **Separation of deploy and release:** code can reach production turned
  off and be released later, to chosen users, without another deploy.
- **Evidence:** each step is checked against health and business metrics
  before more traffic moves.

Every strategy also has costs: extra capacity, two versions running side
by side (so the database and APIs must work with both), more automation,
and more things to monitor.

## How a typical safe deployment works

A common path for a web API such as TaskFlow API:

1. CI builds one immutable artifact (a container image tagged with the
   commit) and runs the tests.
2. The artifact is deployed to **staging**, where smoke tests and checks
   run against production-like configuration.
3. A database migration that is **backward compatible** runs first, so
   both the old and the new code work against the schema.
4. The new version starts beside the old one and must pass its
   **readiness** check before receiving any traffic.
5. Traffic shifts gradually (for example 1%, 10%, 50%, 100%) while error
   rate and latency are compared with the old version.
6. If a check fails, traffic returns to the old version automatically; if
   all checks pass, the old version is retired after a bake period.

![Diagram: four rows read left to right over four steps. Recreate: v1 serves all traffic, then every v1 instance stops and nothing serves while v2 starts and warms up, then v2 serves all. Rolling: four v1 instances are replaced by v2 one batch at a time until all four are v2. Blue-green: v2 is deployed idle beside v1 and tested privately while v1 serves everything, then the router switches all traffic to v2 and v1 is kept for rollback. Canary: 1% of traffic goes to v2, then 10% once metrics look healthy, then 50%, then 100% when v2 is promoted.](deployment-strategies-overview.svg)

## Practical example

A canary rollout described declaratively with Argo Rollouts, a Kubernetes
controller that shifts traffic in steps and pauses between them:

```yaml
# k8s/taskflow-api-rollout.yaml (Argo Rollouts canary steps)
apiVersion: argoproj.io/v1alpha1
kind: Rollout
metadata:
  name: taskflow-api
spec:
  replicas: 10
  selector:
    matchLabels:
      app: taskflow-api
  template:
    metadata:
      labels:
        app: taskflow-api
    spec:
      containers:
        - name: api
          image: ghcr.io/example/taskflow-api:1.8.0
          ports:
            - containerPort: 3000
  strategy:
    canary:
      steps:
        - setWeight: 10          # 10% of pods run the new version
        - pause: { duration: 10m }
        - setWeight: 50
        - pause: { duration: 10m }
        # after the last step the rollout goes to 100%
```

Without a traffic router, Argo Rollouts approximates the weight by the
ratio of new to old pods; with a service mesh or gateway it can shift an
exact percentage of requests. The deep pages explain both.

## Deployment strategies topic map

**Foundations**

- [Environments and promotion](deployment-strategies/environments-and-promotion.md)
- [Deploying backend services](deployment-strategies/deploying-backend-services.md)

**Moving traffic safely**

- [Rolling, blue-green, and canary deployments](deployment-strategies/rolling-blue-green-and-canary.md)
- [Advanced deployment patterns](deployment-strategies/advanced-deployment-patterns.md)
- [Feature flags and progressive delivery](deployment-strategies/feature-flags-and-progressive-delivery.md)
- [Zero-downtime database migrations](deployment-strategies/zero-downtime-database-migrations.md)
- [Rollbacks and safe releases](deployment-strategies/rollbacks-and-safe-releases.md)

**Other kinds of software**

- [Deploying frontends and static sites](deployment-strategies/deploying-frontends-and-static-sites.md)
- [Releasing desktop and mobile apps](deployment-strategies/releasing-desktop-and-mobile-apps.md)

**Review**

- [Deployment strategies interview questions and answers](deployment-strategies/interview-questions-and-answers.md) · [cheat sheet](deployment-strategies/cheat-sheet.md)

## Developer perspective and common misconceptions

Choose the simplest strategy that meets your downtime and risk needs. A
small internal tool can accept a 20-second restart; a payment API cannot.
Whatever you choose, make every deploy repeatable from one script or
pipeline, keep the previous artifact ready, and decide in advance which
metrics mean "roll back".

- Zero-downtime deployment is not a property of the tool; it also needs
  graceful shutdown, readiness checks, and backward-compatible schema
  changes.
- Blue-green does not make database changes reversible. Both colors
  usually share one database.
- A canary only helps if someone, or something, compares its metrics with
  the baseline and acts on the difference.
- Rolling back code does not roll back data that the new code already
  wrote.
- Deploying is not releasing: with feature flags, new code can sit in
  production, switched off, for days.

## Further learning

- [Martin Fowler: BlueGreenDeployment](https://martinfowler.com/bliki/BlueGreenDeployment.html)
- [Google SRE Workbook: Canarying releases](https://sre.google/workbook/canarying-releases/)
- [AWS Builders' Library: Automating safe, hands-off deployments](https://aws.amazon.com/builders-library/automating-safe-hands-off-deployments/)
- [Argo Rollouts documentation](https://argo-rollouts.readthedocs.io/en/stable/)
- [Deployment strategies interview questions and answers](deployment-strategies/interview-questions-and-answers.md)
