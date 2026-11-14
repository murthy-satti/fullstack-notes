# Deployment Strategies Interview Questions and Answers

These questions review environments and promotion, deploying backend
services, rolling, blue-green, and canary deployments, advanced patterns,
feature flags, zero-downtime migrations, rollbacks, frontend deploys, and
client app releases. Try answering each one before reading the answer.

## Environments and promotion

### 1. Why should you build an artifact once and promote it, instead of building per environment?

Rebuilding can produce a different artifact: dependency resolution, base
image tags, and build-time variables can change between builds, so what
reaches production would not be what was tested. Building once and
promoting the same image by digest keeps a chain of evidence from test to
production; only configuration changes per environment.

### 2. What is environment parity, and where does it usually break?

Parity means environments differ only where they must. It breaks in
backing service versions, topology (standalone database locally, replica
set in production), data volume, instance count, third-party sandboxes,
edge configuration (CDN, TLS), configuration values, and flag states.
Aim for the same kinds of things everywhere and accept differences in
size.

### 3. What is a preview environment, and what must it get right?

A short-lived copy of the application per pull request, with its own URL,
namespace, and seeded database, destroyed when the pull request closes.
It needs isolation, synthetic data, sandbox-only credentials (none for
fork pull requests), access control, and reliable teardown, including a
TTL reaper for missed close events.

### 4. What is the difference between deploying and releasing?

Deploying installs a version in an environment; releasing exposes new
behavior to users. Feature flags decouple them, so code can reach
production switched off and be released later, gradually, without
another deploy.

### 5. Why can heavy manual approval gates increase risk?

Slow approvals make teams batch changes into bigger releases, which are
harder to test, debug, and roll back. DORA's research associates
heavyweight external change approval with worse delivery performance;
peer review plus automated checks works better, with manual gates kept
for genuinely high-risk steps.

## Deploying backend services

### 6. What is the difference between liveness and readiness probes?

Liveness answers "is this process stuck beyond repair?" and failing it
restarts the process. Readiness answers "should this instance receive
traffic now?" and failing it removes the instance from load balancing.
Liveness must not check dependencies; otherwise a database outage
restarts every instance.

### 7. Describe a graceful shutdown for a Node API.

On `SIGTERM` (or PM2's `SIGINT`): set a draining flag so readiness
returns 503, wait a few seconds for load balancers to stop routing, call
`server.close()`, keep closing idle keep-alive connections, wait for
in-flight requests, close the database client and consumers, and exit 0.
A forced exit before the platform's `SIGKILL` covers hangs.

### 8. Why can `server.close()` take as long as the keep-alive timeout?

`close()` calls back only when all connections are closed. Since Node 19
it closes connections that are idle at that moment, but a connection that
becomes idle afterwards stays open until `keepAliveTimeout`. Calling
`server.closeIdleConnections()` repeatedly while draining fixes it.

### 9. Why set Node's keep-alive timeout above the load balancer's idle timeout?

If Node closes an idle connection (5 seconds by default) at the moment
the load balancer reuses it (AWS ALB keeps idle connections 60 seconds by
default), the request fails with a 502. With Node's timeout longer, the
load balancer always closes first.

### 10. What is the difference between `pm2 restart` and `pm2 reload`?

`restart` stops and starts all processes, leaving a gap. `reload` in
cluster mode replaces workers one at a time, starting a new worker and
waiting until it is ready (optionally until it calls
`process.send("ready")`) before stopping the old one. In fork mode with
one process, reload behaves like restart.

### 11. Why is `git pull` not a deploy for a compiled binary?

The code is embedded in the binary at build time. Pulling changes the
source but not the running program, so the old code serves (including old
routes) until you rebuild and restart. Expose the commit at `/version` and
verify it after every deploy.

### 12. Where should database migrations run in a deploy?

Once, as a separate pipeline step or job before the rollout, not on every
instance's startup. The migration must be compatible with the old code
still running, and destructive steps belong to a later release.

## Rolling, blue-green, and canary

### 13. Compare recreate and rolling deployments.

Recreate stops everything and starts the new version: simple, no version
mixing, but downtime. Rolling replaces instances in batches with no
downtime, but both versions serve traffic during the rollout and there is
no metric gate or automatic rollback by default.

### 14. What do `maxSurge` and `maxUnavailable` control?

How far above (surge) or below (unavailable) the desired replica count a
Kubernetes rolling update may go. `maxSurge: 1, maxUnavailable: 0` adds
one new pod at a time and removes an old one only after the new one is
ready, keeping full capacity.

### 15. How does blue-green deployment work, and what is its main limitation?

Two full environments run; one is live. The new version goes to the idle
one, is warmed and tested privately, and the router switches to it;
switching back is the rollback. The limitation is the shared database:
the schema must work for both versions, and blue-green does nothing to
undo data changes. It also exposes everyone at the switch.

### 16. What makes a canary release effective?

A small, representative share of traffic, a baseline running at the same
time for comparison, user-facing metrics (errors, latency, saturation,
business events), enough traffic for statistics, step-by-step increases
with soak times, and automated abort when analysis fails.

### 17. Why compare a canary with a baseline running at the same time?

Traffic and behavior vary by time of day and day of week, so comparing
with yesterday mixes the change with unrelated variation. A simultaneous
baseline (ideally a fresh one of the same size, as Kayenta does) isolates
the effect of the change.

### 18. A service handles 200 requests per second with a 0.2% error rate. Can a 1% canary for 10 minutes detect the error rate doubling?

The canary sees 1,200 requests; 2.4 errors are expected if healthy and
4.8 if doubled, a difference smaller than the noise (about
`sqrt(2.4) ≈ 1.5`). Detecting the doubling at three standard deviations
needs about 4,500 requests: 37 minutes at 1%, under 4 minutes at 10%. A
5% failure, by contrast, shows up as about 60 errors immediately.

### 19. How do the main traffic-shifting mechanisms compare?

Load balancer weights, Gateway API routes, and service meshes split
precisely per request and roll back in seconds. Replica ratios are coarse.
DNS weights are imprecise and slow because resolvers and clients cache
beyond the TTL. Platform features (Cloud Run revisions, Lambda aliases)
are precise but platform-specific.

### 20. How does a canary differ from an A/B test?

A canary checks whether a new version is safe, using technical metrics,
over minutes to hours, ending in promotion or rollback. An A/B test
compares product variants on user behavior with sticky assignment and a
pre-planned sample size, over days or weeks, ending with the winner
shipped. Canaries use traffic routing; A/B tests usually use flags inside
one version.

### 21. What state-related problems appear when two versions run side by side?

In-memory sessions lost on switches, users bouncing between versions
without stickiness, long-lived connections staying on the old version,
cache entries in new formats crashing old code, queue messages one
version cannot parse, scheduled jobs running twice, and schema changes
that only one version understands.

## Advanced deployment patterns

### 22. What is red/black deployment?

Netflix's and Spinnaker's name for blue-green with immutable server
groups: a new group is created, enabled in the load balancer, and the old
group is disabled but kept running for fast rollback, then destroyed after
a bake. Spinnaker 1.30 and later call it blue/green.

### 23. When would you use a rainbow deployment?

When long-lived connections (WebSockets, streams) take hours to drain.
Each release gets its own Deployment; new connections go to the newest,
old versions keep their existing connections and are deleted when nearly
empty. Several versions run at once, so compatibility must hold across
all of them.

### 24. What are the risks of shadow (mirrored) traffic?

Side effects (writes, emails, payments, events) happening twice, doubled
load on shared dependencies, noisy response comparisons, and proxy
resources tied up by slow mirrors. Mirror only read paths, sandbox the
shadow's dependencies, and start with a small percentage.

### 25. What is the "one box, then one AZ, then one region" progression?

A staged production rollout described in the Amazon Builders' Library: a
single host first, then a low-traffic region one Availability Zone at a
time, then a high-traffic region, then more regions in parallel, each with
bake time and automatic rollback on alarms. A failure therefore reaches a
small, fault-isolated slice first.

### 26. How do cells reduce blast radius, and what is their weak point?

Each cell is an independent copy of the stack serving a fixed subset of
customers, so a bad deploy or failure in one cell affects only `1/N` of
customers. The weak point is anything shared: the cell router and global
control plane must be changed with the same staged caution.

### 27. How can an API serve clients pinned to old versions without branching all its code?

The core builds only the newest response shape; each breaking change adds
a small transform that converts a response to the previous version's
shape. Requests pinned to an old version pass through the transforms in
reverse. Stripe describes this with "version change modules". Usage per
version tells you when an old version can be retired.

## Feature flags and progressive delivery

### 28. What are the four kinds of feature flags?

Release flags (hide unfinished work, short-lived), experiment flags (A/B
tests), ops flags or kill switches (turn off fragile or expensive
functionality, long-lived), and permission flags (features per plan or
group, long-lived).

### 29. How do you implement a sticky percentage rollout?

Hash a stable identifier together with the flag key (for example SHA-256
of `"new-task-board:user-16"`), take the result modulo 10,000 as a bucket,
and enable the flag when the bucket is below the percentage times 100.
The same user always gets the same answer, raising the percentage only
adds users, and different flags select different users.

### 30. Why include the flag key in the hash?

Without it, every flag selects the same users for its first 10%, so the
same customers always receive every new feature (and every new bug)
first. Including the key makes rollouts independent.

### 31. Should flags be evaluated server-side or client-side?

Server-side SDKs keep rules in memory and evaluate locally, keeping
targeting rules private. Client apps should receive only the evaluated
values for the current user, not the full rule set, and should bootstrap
values to avoid UI flicker.

### 32. What is flag debt, and how do you control it?

Flags and dead code paths left after their purpose ended: untested paths,
confusing combinations, and the risk of reactivating old behavior, as in
the Knight Capital incident. Control it with an owner and expiry date per
flag, CI that fails on expired flags, stale-flag reports, removal as part
of done, and never reusing keys.

### 33. What does OpenFeature standardize?

A vendor-neutral evaluation API (typed `get...Value` calls with a key,
default, and context), the evaluation context with a `targetingKey`,
providers that connect to flag systems, hooks, and domains. Call sites
stay the same when you change vendors.

### 34. What should happen when the flag service is unreachable?

The SDK keeps serving the last known rules; if it never loaded rules, it
returns the default value passed in the code, which must be the safe, old
behavior. Flag evaluation must never block requests on a network call.

## Zero-downtime database migrations

### 35. Why must a migration be compatible with the code already running?

The migration runs before the new code rolls out, and during the rollout
old and new versions share the schema. A rollback runs the old code
again. Any change that only the new code understands breaks the old
instances still serving traffic.

### 36. Explain expand and contract with a column rename.

Add the new column (expand); deploy code that writes both and reads the
old; backfill old rows in batches; deploy code that reads the new and
still writes both; deploy code that uses only the new column; later drop
the old column (contract). Each step changes either schema or code, so
each deploy can be undone by one step.

### 37. How should a large backfill be run?

In small batches by primary-key range (keyset pagination), each committed
separately, with pauses and throttling on replication lag, idempotent
(only rows that still need it) and resumable, never overwriting values the
dual-writing application already set, and verified afterwards.

### 38. Why can a fast `ALTER TABLE` still cause an outage?

It needs an `ACCESS EXCLUSIVE` lock. If a long query holds a conflicting
lock, the `ALTER` waits, and every later query on the table queues behind
it. Setting a short `lock_timeout` makes the migration fail and retry
instead of blocking the application.

### 39. How do you add `NOT NULL` to a large PostgreSQL table safely?

Add `CHECK (col IS NOT NULL) NOT VALID` (brief lock), run `VALIDATE
CONSTRAINT` (scans without blocking reads or writes), then `SET NOT NULL`,
which on PostgreSQL 12+ uses the validated constraint and skips the scan,
and drop the check.

### 40. What are the caveats of `CREATE INDEX CONCURRENTLY`?

It is slower, cannot run in a transaction block, and on failure leaves an
invalid index that `IF NOT EXISTS` will silently skip. Drop the invalid
index concurrently and build again.

### 41. How do MongoDB index builds affect a live collection?

Since 4.2, builds hold an exclusive lock only briefly at the start and
end, allowing reads and writes in between, and since 4.4 replica set
members build simultaneously and commit by quorum. Builds still consume
resources, so run large ones off-peak and watch replication lag.

### 42. Why do teams roll forward rather than run down migrations?

Down migrations cannot restore dropped data, may destroy data written in
the new shape, and are rarely tested. Expand steps rarely need undoing,
contract steps happen after stability is proven, and true data recovery
uses backups.

## Rollbacks and safe releases

### 43. When do you roll back and when do you roll forward?

Roll back when a release correlates with the problem and rollback is
safe: restore service first, diagnose later. Roll forward when the new
version wrote data the old one cannot read, when there are irreversible
side effects, or when a tiny, certain fix ships faster than a rollback.
Turning off a flag is the fastest option when it applies.

### 44. What makes a rollback possible?

A retained immutable artifact, a still-valid configuration for the old
version, a schema and data the old version can read, compatible messages
and caches, a plan for irreversible side effects, compatible clients, and
practice.

### 45. What is the prepare-then-activate technique?

For a data format change, first deploy a version that reads both formats
but writes the old one (prepare); once it is everywhere, deploy the
version that writes the new format (activate). Any rollback then leaves
servers able to read everything written.

### 46. How long should a release bake?

Long enough to include a traffic peak and scheduled jobs and to reveal
slow failures such as memory leaks. Amazon's pipelines bake at least an
hour after the first host and at least 12 hours after the first region;
Microsoft's guidance suggests about a day per tier.

### 47. What are the DORA instability metrics?

Change fail rate (the share of deployments requiring immediate
intervention) and deployment rework rate (the share of unplanned
deployments caused by production incidents); since 2024 DORA groups
failed deployment recovery time with throughput. With 120 deploys and 9
needing a rollback or hotfix, the change fail rate is 7.5%.

### 48. What are the trade-offs of change freezes?

They reduce change during high-risk periods but cause a backlog that ships
as a large, risky batch afterwards. Keep them short, allow small low-risk
changes, keep an emergency path, and release the backlog gradually.

## Deploying frontends and static sites

### 49. What cache headers should a built SPA use?

Content-hashed assets: `public, max-age=31536000, immutable`, because the
name changes when content changes. HTML entry points: `no-cache`, so
browsers revalidate on every load and pick up new asset names.
Unhashed files: a short `max-age`.

### 50. In what order should a static deploy upload files?

New hashed assets first, then the entry point (`index.html`) last, then
invalidate only the entry point at the CDN. Delete old assets days later,
so open tabs from the previous version can still load their chunks.

### 51. Does a CDN purge fix stale content in users' browsers?

No. A purge clears CDN edge caches only. Browsers keep anything cached
with a long `max-age` until it expires, which is why HTML must not get a
long `max-age`.

### 52. How do you configure SPA fallback routing correctly?

Serve `index.html` with status 200 for page routes that have no file, but
keep real 404s for missing assets (paths under `/assets/` or with a file
extension). Otherwise a missing script returns HTML and fails with a MIME
type error.

### 53. Why can one frontend build not always be promoted across environments?

Values such as `import.meta.env.VITE_API_URL` are inlined at build time,
so the build contains one environment's values. Either build per
environment or fetch runtime configuration at startup.

## Releasing desktop and mobile apps

### 54. Why can a mobile or desktop release not be rolled back?

Installed copies are on users' devices. Halting a staged rollout stops new
installs, but existing ones stay until users install a newer version.
The fix is to halt, disable the feature remotely, and ship a fix forward.

### 55. What do code signing, timestamping, and notarization do?

Signing identifies the publisher and proves the binary is unchanged.
Timestamping keeps the signature valid after the certificate expires.
Notarization (macOS) is Apple's automated check of Developer ID software,
whose ticket Gatekeeper verifies before first launch.

### 56. How does a secure auto-update system work?

The app asks an update endpoint (with version, platform, channel, and
install ID), receives a manifest with the version, URL, and signature,
downloads the file, verifies the signature with a public key embedded in
the app, installs, and reports its new version. The server controls
channels, rollout percentage, and halts.

### 57. How do Apple and Google stage mobile releases?

Apple's phased release offers an update to 1%, 2%, 5%, 10%, 20%, 50%, and
100% of automatic-update users over 7 days, with pauses up to 30 days.
Google Play's staged rollout uses a percentage you raise manually and can
halt; users who already received it keep it.

### 58. How do you keep old clients working as the API evolves?

Send client version on every call, only add fields, make clients ignore
unknown fields, version breaking changes, ship server support before
clients that use it, keep remote switches for client features, and enforce
a minimum version only for emergencies after checking who it affects.

## Scenario-based questions

### 59. Every deploy of the API causes a burst of 502 errors for about 20 seconds. How do you fix it?

**What to check first:** whether instances drain before stopping and
receive traffic only when ready.

**How to confirm:** load balancer logs show 502s from targets being
deregistered or just started; app logs show no `SIGTERM` handling, or
readiness that returns 200 before the database connects.

**Likely causes and fixes:** no graceful shutdown, readiness that lies, or
`npm start` as PID 1 swallowing `SIGTERM`. Add readiness checks, a drain
delay before `server.close()`, idle-connection sweeping, and exec-form
`CMD`. See [deploying backend services](deploying-backend-services.md).

### 60. Occasional 502s appear at low traffic, unrelated to deploys. What is happening?

**What to check first:** the app's keep-alive timeout compared with the
load balancer's idle timeout.

**How to confirm:** 502s cluster after idle periods; load balancer logs
show target connection resets on reused connections.

**Likely causes and fixes:** Node closes idle connections after 5 seconds
while the load balancer reuses them for up to 60. Set
`server.keepAliveTimeout` above the proxy's idle timeout. See
[deploying backend services](deploying-backend-services.md).

### 61. A rolling deploy completed, all pods were Ready, and the error rate went to 30%. Why did nothing stop it?

**What to check first:** what the readiness probe checks and whether any
metric gate exists.

**How to confirm:** the probe returns 200 without exercising real
dependencies; the rollout had no analysis step.

**Likely causes and fixes:** rolling updates only gate on readiness and do
not roll back automatically. Add canary analysis or a post-deploy metric
watch with automatic `rollout undo`. See
[rolling, blue-green, and canary](rolling-blue-green-and-canary.md).

### 62. The rollback of a bad release took 25 minutes. How do you make it faster next time?

**What to check first:** how traffic was shifted back and whether the old
version was still running.

**How to confirm:** the switch used DNS and clients cached it, or the blue
environment had been scaled to zero and had to start cold.

**Likely causes and fixes:** use load balancer or mesh weights instead of
DNS, keep the previous version warm during the bake period, and automate
the rollback decision on alarms. See
[rollbacks and safe releases](rollbacks-and-safe-releases.md).

### 63. The deploy pipeline ran a migration and the whole API froze for 40 seconds. Why?

**What to check first:** `pg_stat_activity` during the migration and the
locks involved.

**How to confirm:** many sessions waited on a lock behind an `ALTER TABLE`,
which itself waited for a long-running report query.

**Likely causes and fixes:** the lock queue. Set `lock_timeout` for
migrations and retry, cancel long queries first, and run risky DDL
off-peak. See [zero-downtime database migrations](zero-downtime-database-migrations.md).

### 64. Right after deploying v2, the still-running v1 pods started throwing "column does not exist". What happened?

**What to check first:** the migration that ran with this release.

**How to confirm:** it renamed or dropped a column v1 still uses.

**Likely causes and fixes:** a contract step shipped with the code change.
Restore the column (or roll forward with a compatibility view), then
redo the change with expand and contract. See
[zero-downtime database migrations](zero-downtime-database-migrations.md).

### 65. The same handful of customers report every new feature's bugs first. Why?

**What to check first:** how percentage rollouts choose users.

**How to confirm:** the bucketing hashes only the user ID, so each flag's
first 10% is the same set of users.

**Likely causes and fixes:** include the flag key (or a per-flag salt) in
the hashed value. See
[feature flags and progressive delivery](feature-flags-and-progressive-delivery.md).

### 66. A flag nobody had touched for a year was switched on and reactivated retired behavior. How do you prevent this?

**What to check first:** the flag's history, owner, and the code it
guards.

**How to confirm:** the flag reached 100% (or was abandoned) long ago and
its old code path was never removed, or the key was reused.

**Likely causes and fixes:** flag debt. Enforce owners and expiry dates in
CI, delete flags and dead code after rollout, and never reuse keys. See
[feature flags and progressive delivery](feature-flags-and-progressive-delivery.md).

### 67. After a frontend deploy, some users see a blank page. How do you fix it?

**What to check first:** the browser console and the HTML response's
`Cache-Control` and referenced asset names.

**How to confirm:** 404s for `index-<hash>.js`; the new HTML was uploaded
before its assets, or old assets were deleted while old HTML was cached.

**Likely causes and fixes:** upload assets first and HTML last, keep old
assets for days, serve HTML with `no-cache`, and reload once on preload
errors. See [deploying frontends and static sites](deploying-frontends-and-static-sites.md).

### 68. The desktop app's 1.9.0 release crashes on startup for some users. What do you do?

**What to check first:** crash-free sessions by release and the share of
installs on 1.9.0.

**How to confirm:** crash reports cluster on 1.9.0 with one stack trace.

**Likely causes and fixes:** halt the rollout in the update server,
disable the failing feature by remote flag for 1.9.0 if possible, and ship
1.9.1 through the stages quickly. Installed copies cannot be recalled. See
[releasing desktop and mobile apps](releasing-desktop-and-mobile-apps.md).

### 69. A server change broke older mobile app versions. How do you prevent a repeat?

**What to check first:** API errors by client version since the deploy.

**How to confirm:** a field was removed or a parameter made required
that old versions do not send.

**Likely causes and fixes:** revert the change, keep APIs compatible with
every supported client version, run contract tests per version, and only
raise the minimum version after usage drops. See
[releasing desktop and mobile apps](releasing-desktop-and-mobile-apps.md).

### 70. Staging passed, production failed on the same image digest. Where do you look?

**What to check first:** the effective configuration of both
environments and differences in scale or data.

**How to confirm:** a variable, flag state, or dependency version differs,
or a query is slow only on production-sized data.

**Likely causes and fixes:** configuration drift or parity gaps. Validate
configuration at startup, keep it versioned, and load-test staging with
production-sized synthetic data. See
[environments and promotion](environments-and-promotion.md).

## Further learning

- [Deployment strategies overview](../deployment-strategies.md)
- [Environments and promotion](environments-and-promotion.md) ·
  [Deploying backend services](deploying-backend-services.md) ·
  [Rolling, blue-green, and canary](rolling-blue-green-and-canary.md) ·
  [Advanced deployment patterns](advanced-deployment-patterns.md) ·
  [Feature flags and progressive delivery](feature-flags-and-progressive-delivery.md) ·
  [Zero-downtime database migrations](zero-downtime-database-migrations.md) ·
  [Rollbacks and safe releases](rollbacks-and-safe-releases.md) ·
  [Deploying frontends and static sites](deploying-frontends-and-static-sites.md) ·
  [Releasing desktop and mobile apps](releasing-desktop-and-mobile-apps.md)
- [Google SRE Workbook: Canarying releases](https://sre.google/workbook/canarying-releases/)
- [Amazon Builders' Library: Automating safe, hands-off deployments](https://aws.amazon.com/builders-library/automating-safe-hands-off-deployments/)
