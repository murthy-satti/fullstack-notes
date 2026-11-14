# Deployment Strategies Cheat Sheet

Quick revision of the deployment strategies lessons, for use before an
interview or a release task.

## Key commands

| Command | What it does |
|---|---|
| `kubectl set image deployment/taskflow-api api=ghcr.io/example/taskflow-api:1.8.1` | Start a rolling update |
| `kubectl rollout status deployment/taskflow-api --timeout=5m` | Wait for the rollout, with a timeout |
| `kubectl rollout undo deployment/taskflow-api` | Roll back to the previous ReplicaSet |
| `kubectl patch service taskflow-api -p '{"spec":{"selector":{"app":"taskflow-api","color":"green"}}}'` | Blue-green: point the live Service at green |
| `pm2 reload ecosystem.config.cjs --env production --update-env` | Replace cluster workers one at a time |
| `npx migrate-mongo up` | Apply migrations once, as their own pipeline step |
| `aws s3 sync dist/assets "$BUCKET/assets" --cache-control "public, max-age=31536000, immutable"` | Upload hashed assets first |
| `aws s3 cp dist/index.html "$BUCKET/index.html" --cache-control "no-cache"` | Upload the entry point last |
| `aws cloudfront create-invalidation --distribution-id "$DISTRIBUTION_ID" --paths "/index.html" "/"` | Invalidate only the entry points |

## Key configuration

```yaml
# k8s/taskflow-api-deployment.yaml (excerpt)
spec:
  progressDeadlineSeconds: 300   # mark the rollout failed after 5 min
  strategy:
    rollingUpdate: { maxSurge: 1, maxUnavailable: 0 }
  template:
    spec:
      terminationGracePeriodSeconds: 30
      containers:
        - name: api
          readinessProbe: { httpGet: { path: /readyz, port: 3000 } }
          livenessProbe: { httpGet: { path: /livez, port: 3000 } }
```

## Decision guide

| If you need | Choose | Why |
|---|---|---|
| A dev or test environment, an internal tool | Recreate | Simplest; short downtime is acceptable |
| Zero downtime for a stateless API | Rolling, with honest readiness probes | Kubernetes default; only surge capacity |
| Instant rollback, budget for double capacity | Blue-green | Switch back while blue still runs |
| High traffic, costly bad releases | Canary with automated analysis | 1% first; grows only while metrics stay healthy |
| Safety on a low-traffic service | Blue-green or rolling plus strong tests | A 1% canary sees too few requests to judge |
| Many users or many regions | Rings or waves with bake times | Each stage limits the blast radius |
| Code in production before launch, a kill switch | A feature flag | Release and undo without a deploy |
| A product answer ("does it convert better?") | A/B test behind flags | Sticky per user, business metrics, days to weeks |
| A column rename or type change | Expand and contract over several releases | Old and new code work at every step |
| Recovery from a bad app release | Halt the rollout, flag off, ship a fix | Installed copies cannot be rolled back |

## Numbers and defaults to remember

| Item | Value |
|---|---|
| Kubernetes grace period | 30 s by default: `SIGTERM`, wait, then `SIGKILL` |
| `progressDeadlineSeconds` | 600 by default; marks the rollout failed, does not undo it |
| Shutdown budget | Drain (5 s) + longest request (~10 s) + cleanup (~2 s) < app deadline (25 s) < grace period (30 s) |
| Node `server.keepAliveTimeout` | 5 s by default; set above the proxy idle timeout (ALB: 60 s), for example 65 s |
| PM2 `kill_timeout` | About 1.6 s by default; raise it above the drain time |
| Canary sample size | To see 0.2% errors double to 0.4% at 3 standard deviations: at least 4,500 requests |
| Bake times (Amazon) | At least 1 h after the one box, 12 h after the first Region |
| Error budget | 99.9% a month allows 43.2 min of full outage |
| Flag bucketing | `SHA-256("<flag key>:<user id>")`, first 4 bytes mod 10,000 |
| DORA metrics | Change lead time, deployment frequency, failed deployment recovery time, change fail rate, deployment rework rate |
| PostgreSQL migration | `SET lock_timeout = '2s'`, `SET statement_timeout = '30s'` |
| `Cache-Control` | Hashed assets `public, max-age=31536000, immutable`; `index.html` `no-cache` |
| Apple phased release | 7 days: 1%, 2%, 5%, 10%, 20%, 50%, then 100% |

## Top mistakes

- **Treating a rolling update as safe by default.** Gate it on honest
  readiness probes and metrics, or it rolls a bad version to everyone.
- **Checking the database in the liveness probe.** Ping it in readiness
  only; restarting every instance during an outage fixes nothing.
- **Shipping a rename or drop with the code that needs it.** Expand and
  contract over several releases; drop in the contract step.
- **Running a canary nobody compares.** Compare it with the live
  baseline automatically, with a minimum request count.
- **Using DNS for canaries or fast rollbacks.** Use load balancer,
  gateway, or mesh weights; resolvers cache beyond the TTL.
- **Waiting for a root cause before rolling back.** Roll back first and
  investigate with the old version running.
- **Caching `index.html` for a long time.** Serve it `no-cache`, cache
  hashed assets for a year, and upload assets before `index.html`.
- **Leaving release flags in the code.** Remove them within days of
  100%, fail CI on expired flags, and never reuse a key.

## Where to go deeper

- [Environments and promotion](environments-and-promotion.md)
- [Deploying backend services](deploying-backend-services.md)
- [Rolling, blue-green, and canary deployments](rolling-blue-green-and-canary.md)
- [Advanced deployment patterns](advanced-deployment-patterns.md)
- [Feature flags and progressive delivery](feature-flags-and-progressive-delivery.md)
- [Zero-downtime database migrations](zero-downtime-database-migrations.md)
- [Rollbacks and safe releases](rollbacks-and-safe-releases.md)
- [Deploying frontends and static sites](deploying-frontends-and-static-sites.md)
- [Releasing desktop and mobile apps](releasing-desktop-and-mobile-apps.md)
- [Interview questions and answers](interview-questions-and-answers.md)

Back to the [deployment strategies overview](../deployment-strategies.md).
