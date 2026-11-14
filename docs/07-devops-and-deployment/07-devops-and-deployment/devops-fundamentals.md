# DevOps Fundamentals

DevOps is a way of building and running software in which the people who
write a change also deliver it, operate it, and learn from how it behaves
in production, supported by automation and shared measurements. It grew
out of the friction between development teams, rewarded for shipping
features, and operations teams, rewarded for keeping systems stable.
Instead of a hand-off between two groups with opposite goals, DevOps sets
up one short feedback loop that small changes travel around many times a
day.

## What DevOps provides

- **Faster delivery of small changes:** a fix moves from commit to
  production in hours instead of waiting for the next monthly release.
- **Fewer and smaller failures:** small batches are easier to review,
  test, and roll back. DORA's research keeps finding that delivery speed
  and stability rise together rather than trading off.
- **Fast feedback from production:** the team that built a change sees
  its errors, latency, and user impact directly, not through a ticket
  days later.
- **Shared ownership:** one team owns a service end to end, so problems
  are fixed where they start instead of bouncing between departments.
- **Measurable improvement:** delivery metrics show whether a change to
  the process actually helped.
- **Sustainable operations:** repetitive manual work is automated away,
  and on-call load is kept small enough for people to stay healthy.

DevOps also asks for things in return: investment in tests and
automation, a blameless culture, product teams willing to carry a pager,
and leaders who judge outcomes rather than activity.

## How a typical DevOps loop works

Follow one change to the TaskFlow API, the Express and MongoDB task
service used throughout this site:

1. **Plan small.** The team slices the feature so each piece can ship on
   its own within a day or two, hidden behind a feature flag if it is not
   ready for users.
2. **Integrate continuously.** A developer opens a small pull request,
   CI tests it, and it merges into `main` the same day.
3. **Deliver automatically.** The pipeline builds one artifact and
   deploys it through staging to production with no manual hand-off.
4. **Release progressively.** A canary or a flag exposes the change to a
   few users first, and an automatic rollback fires if error rates rise.
5. **Operate what you build.** The same team watches the dashboards,
   receives the pages, and fixes what breaks.
6. **Learn and adjust.** Incidents become blameless postmortems, metrics
   show where work waits, and the next change starts with those lessons.

![Diagram: on the left, before DevOps, a development team whose goal is to ship features and an operations team whose goal is to keep the system stable are separated by a wall; releases are thrown over the wall every few weeks and tickets and blame come back days later, giving big releases, slow feedback, and two goals in conflict; on the right, with DevOps, one team owns the service and takes each small change around a loop many times a day: plan, code, build and test, release, operate, observe, and back to plan, supported by a shared self-service platform for pipelines, infrastructure as code, and telemetry.](devops-fundamentals-overview.svg)

Each step has its own subject in this section:
[Git and GitHub](git-and-github.md), [CI/CD](ci-cd.md),
[deployment strategies](deployment-strategies.md), and
[monitoring and logging](monitoring-and-logging.md). This subject
explains the ideas and team practices that connect them.

## Practical example

```yaml
# .github/workflows/deliver.yml: every merge to main is tested, deployed, and recorded
name: Deliver
on:
  push:
    branches: [main]

permissions:
  contents: read

concurrency:
  group: deliver-production
  cancel-in-progress: false      # never stop a deploy halfway

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version-file: .nvmrc
          cache: npm
      - run: npm ci
      - run: npm test

  deploy:
    needs: test
    runs-on: ubuntu-latest
    environment: production      # GitHub records a deployment for every run
    steps:
      - uses: actions/checkout@v7
      - run: ./scripts/deploy.sh "$GITHUB_SHA"
      - run: ./scripts/smoke-test.sh https://api.example.com/healthz
```

Small as it is, this file encodes the core habits. Every merge to `main`
becomes its own small deployment instead of waiting for a release train.
Tests gate the deploy, and a smoke test checks the running service
afterwards. The `concurrency` group lets only one deployment run at a
time. The team that owns `deploy.sh` is the team that gets paged. The
`environment: production` key makes GitHub keep a deployment history,
which is raw material for the delivery metrics in
[measuring delivery performance](devops-fundamentals/measuring-delivery-performance.md).

## DevOps fundamentals topic map

**Foundations**

- [What is DevOps](devops-fundamentals/what-is-devops.md)
- [DevOps, SRE, and platform engineering](devops-fundamentals/devops-sre-and-platform-engineering.md)

**Measurement**

- [Measuring delivery performance](devops-fundamentals/measuring-delivery-performance.md)

**Teams and platforms**

- [Team practices and ownership](devops-fundamentals/team-practices-and-ownership.md)
- [Platform engineering and developer portals](devops-fundamentals/platform-engineering-and-developer-portals.md)

**Review**

- [DevOps fundamentals interview questions and answers](devops-fundamentals/interview-questions-and-answers.md) · [cheat sheet](devops-fundamentals/cheat-sheet.md)

## Developer perspective and common misconceptions

For a developer, DevOps means your work is not finished at merge. You
will deploy it, watch it, and support it, so build in what makes that
easy from the first commit: health checks, structured logs, metrics, a
feature flag for risky behavior, and a way to roll back. Before writing
code, ask "how will I know this works in production?".

- DevOps is not a job title or a team that sits between development and
  operations. Adding a "DevOps team" in the middle creates one more
  hand-off.
- DevOps is not a tool. Pipelines, containers, and dashboards support
  the practices; buying them does not create the practices.
- "You build it, you run it" does not mean developers do everything
  alone. Platforms, SREs, and enabling teams make ownership affordable.
- Going faster does not mean taking more risk. Small, frequent changes
  fail less often and are fixed sooner than large, rare ones.
- DevOps does not remove control. Peer review, automated checks, and an
  audit trail can replace slow approval boards and still satisfy
  auditors.
- Delivery metrics are for learning, not for ranking teams. Once a
  number becomes a target, people optimize the number.

## Further learning

- [DORA: Capabilities catalog](https://dora.dev/capabilities/)
- [IT Revolution: The Three Ways, by Gene Kim](https://itrevolution.com/articles/the-three-ways-principles-underpinning-devops/)
- [Google SRE Workbook: How SRE Relates to DevOps](https://sre.google/workbook/how-sre-relates/)
- [Team Topologies: Key concepts](https://teamtopologies.com/key-concepts)
- [DevOps fundamentals interview questions and answers](devops-fundamentals/interview-questions-and-answers.md)
