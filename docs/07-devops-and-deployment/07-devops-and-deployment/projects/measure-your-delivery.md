# Measure Your Delivery

Compute the DORA metrics for your own TaskFlow work with a small script over
git history, deployment records, and the incidents from earlier projects.
Choose one metric to improve, write a one-page team charter, and record one
architecture decision as an ADR.

## Why this project helps

- Builds the habit of measuring delivery instead of guessing: throughput
  and stability, from data you already have.
- Improves **team practices**: ownership, on-call, and change approval are
  written down instead of assumed.
- Improves **decision memory**: an ADR explains why something was built a
  certain way long after the people who decided have moved on.
- DORA metrics and "how would you improve this team's delivery?" are common
  interview topics for senior and platform roles.

## What you need

- The repositories, pipelines, and deployment records from earlier projects
  (for example [Ship It Pipeline](ship-it-pipeline.md) and
  [Version Everything](version-everything.md)).
- The postmortems from [Observability Lab](observability-lab.md) and any
  other incidents you recorded.
- `git`, the GitHub CLI (`gh run list`) or your CI's API, and a scripting
  language you like.

## How to do it

1. Read [measuring delivery performance](../devops-fundamentals/measuring-delivery-performance.md)
   for the definitions and their pitfalls.
2. Export commits and merges with `git log`, deployments from your CI or
   deployment records, and incidents from your postmortems.
3. Compute deployment frequency and change lead time (commit to production)
   with a small script.
4. Compute change fail rate, failed deployment recovery time, and deployment
   rework rate from deployments linked to incidents and hotfixes.
5. Choose one metric to improve, explain why it matters most right now, and
   name one change you would try first.
6. Write a one-page charter covering ownership, on-call, and how changes are
   approved; see [team practices and ownership](../devops-fundamentals/team-practices-and-ownership.md).
7. Record one real decision from your projects (for example canary
   releases or a hosting choice) as an ADR with context, decision, and
   consequences.

## Done when

- A script prints all five metrics for a chosen period.
- Each metric's definition and data source are written next to its value.
- One metric is chosen for improvement, with a reason and a first step.
- A one-page charter exists covering ownership, on-call, and change
  approval.
- One ADR is committed to the repository.

## Stretch goals

- Track the metrics weekly and chart the trend.
- Compare your numbers with the ranges published in the latest DORA report.
- Sketch a golden path for a new service; see
  [platform engineering and developer portals](../devops-fundamentals/platform-engineering-and-developer-portals.md).

## Lessons to use

- [DevOps Fundamentals](../devops-fundamentals.md)
- [What is DevOps](../devops-fundamentals/what-is-devops.md)
- [Continuous integration fundamentals](../ci-cd/continuous-integration-fundamentals.md)

Back to [all projects](../projects.md).
