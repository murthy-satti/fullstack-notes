# Canary Release Lab

Release TaskFlow API the way large teams do: shift traffic to a new version
in steps, stop automatically when it misbehaves, expose a new endpoint to a
stable 10% of users with a feature flag, and rename a database field across
three deploys without downtime.

## Why this project helps

- Builds progressive delivery skills: canaries, automated analysis, feature
  flags, and backward-compatible schema changes.
- Improves **release safety**: a bad version reaches only a small share of
  users and is rolled back by the system, not by a tired human.
- Improves **deployment frequency**: separating deploy from release lets you
  ship small changes often.
- "How would you roll out a risky change?" is a standard interview question.

## What you need

- The Kubernetes setup from [TaskFlow on Kubernetes](taskflow-on-kubernetes.md),
  plus Argo Rollouts (or Gateway API routes with weights).
- Prometheus metrics for request errors, which the analysis reads (see
  [Observability Lab](observability-lab.md); basic request counters are
  enough).
- A feature flag SDK through OpenFeature, with a simple local provider.
- A load generator such as k6.

## How to do it

1. Read [rolling, blue-green, and canary](../deployment-strategies/rolling-blue-green-and-canary.md)
   and convert the API Deployment into an Argo Rollouts canary.
2. Define steps with `setWeight` of 5, 25, 50, and 100, with pauses between
   them, and send steady traffic with k6.
3. Add an AnalysisTemplate that queries the canary's error rate in
   Prometheus and fails above a threshold.
4. Ship a deliberately broken version (for example one endpoint returns
   500) and watch the rollout abort and return traffic to the stable version.
5. Add an OpenFeature flag for a new endpoint and enable it for 10% of users
   with stable bucketing (a hash of the user ID); see
   [feature flags and progressive delivery](../deployment-strategies/feature-flags-and-progressive-delivery.md).
6. Plan the field rename with expand and contract from
   [zero-downtime database migrations](../deployment-strategies/zero-downtime-database-migrations.md).
7. Deploy 1: add the new field and write both; backfill existing documents.
8. Deploy 2: read the new field. Deploy 3: stop writing the old field, then
   remove it once nothing reads it.

## Done when

- Traffic moves through 5%, 25%, 50%, and 100% with pauses you can see.
- The broken version is rolled back automatically within one analysis
  interval.
- The same user always gets the same flag decision, and about 10% of users
  see the new endpoint.
- The field is renamed across three deploys with no failed requests and no
  lost data.
- Each step and its rollback command are written down.

## Stretch goals

- Compare the canary against a blue-green switch for the same change.
- Add a kill switch flag that disables the new endpoint instantly.
- Practice a rollback that also needs a data fix; see
  [rollbacks and safe releases](../deployment-strategies/rollbacks-and-safe-releases.md).

## Lessons to use

- [Deployment Strategies](../deployment-strategies.md)
- [Environments and promotion](../deployment-strategies/environments-and-promotion.md)
- [Advanced deployment patterns](../deployment-strategies/advanced-deployment-patterns.md)

Back to [all projects](../projects.md).
