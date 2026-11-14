# Release Engineering Interview Questions and Answers

These questions review versioning patterns, keeping frontend and backend
in sync, update mechanisms and updaters, release trains and release
management, deploying microservices, and monorepo builds and deployments.
Try answering each one before reading the answer.

## Versioning patterns

### 1. Why does one product need several version numbers?

Different things change at different times and are read by different
audiences: an SDK's consumers ask "is upgrading safe?" (SemVer), the
deploy pipeline asks "which exact build?" (commit SHA and digest), the
migration tool asks "which order?" (migration IDs), stores ask "is it
newer?" (an integer build number), and event consumers ask "which payload
shape?" (an event version). One number cannot answer all of them.

### 2. Compare SemVer, CalVer, build numbers, commit SHAs, and digests.

SemVer orders versions and signals compatibility. CalVer orders by date
but says nothing about compatibility. A CI build number orders builds
within one workflow. A commit SHA identifies the source exactly but does
not order anything, and a content digest identifies the exact artifact.
Pipelines record several of them because no single one gives ordering,
identity, and meaning together.

### 3. What is SemVer build metadata, and why can it not order builds?

It is the part after `+`, as in `2.4.1+build.873.g3f2a1c`. SemVer
ignores it for precedence, so `2.4.1+build.873` and `2.4.1+build.874`
are equal to an updater or package manager. Some systems also drop or
reject it: Docker tags cannot contain `+`, and the `semver` package's
`valid()` returns `2.4.1`. Use it for traceability, not ordering.

### 4. How should development builds between releases be versioned?

As pre-releases of the *next* version, for example `2.4.2-dev.5` (five
commits after `v2.4.1`). A name like `2.4.1-dev.5` is a pre-release of
2.4.1 and sorts *before* the release it was built after, so updaters
treat a newer build as older. With the next-version scheme, precedence
matches build order: `2.4.1 < 2.4.2-dev.5 < 2.4.2-rc.1 < 2.4.2`.

### 5. What are display versions and build numbers on Android and iOS?

Android has `versionName` (any string, shown to users) and `versionCode`
(a positive integer, at most 2,100,000,000, never reused on Google Play,
and used by the system to block downgrades). Apple has
`CFBundleShortVersionString` (three integers, user-visible) and
`CFBundleVersion` (the build, one to three integers); App Store Connect
identifies a build by bundle ID, version, and build string together.

### 6. How do you produce monotonic build numbers in CI, and what goes wrong?

Common sources are the CI run number plus an offset, a timestamp, a
commit count, or a value derived from SemVer. Traps: run numbers restart
when the build moves to another workflow, commit counts differ between
branches and are 1 in a shallow clone, and long timestamps overflow
store limits (`YYMMDDHHmm` exceeds Android's 2,100,000,000). Whatever the
source, it must never go backwards.

### 7. Where should a running service expose its version, and how is it set?

In image tags and OCI labels, a `GET /version` endpoint, an
`X-App-Version` response header, the startup log, the OpenTelemetry
`service.version` attribute, and the error tracker's release name. CI
computes the version once and passes it to every step as a build
argument; computing it at runtime from Git fails because containers
have no `.git` directory.

### 8. Why must versions never be compared as strings?

Because `"1.10.0" < "1.9.0"` and `"rc.10" < "rc.2"` as strings. Use a
SemVer library (`semver.compare`, `semver.gt`) and compare build numbers
as integers. Also know that `semver.satisfies("2.4.2-dev.5", ">=2.4.1")`
is false unless `includePrerelease` is set.

## Keeping frontend and backend in sync

### 9. What is version skew, and why can you not avoid it?

Skew is two interdependent components running different versions at the
same time. A rolling deploy serves old and new versions side by side for
minutes, open browser tabs keep old JavaScript for hours, and installed
apps keep old builds for months. At 50% new pods, 20 requests from one
page all reach the same version with probability `2 x 0.5^20`, about two
in a million.

### 10. What is the difference between backward and forward compatibility here?

A backward-compatible server works with older clients: it accepts their
request shapes and keeps the fields they read. A forward-compatible
client keeps working against a newer server: it ignores unknown fields
and treats unknown enum values safely. During a rollout a new client can
also hit an old server, so it must not depend on new server features
until they are deployed everywhere.

### 11. Which changes look additive but still break clients?

A new enum value (clients with exhaustive switches or strict
validation), a new required request field, tightened validation, a
repurposed field (same name, new meaning or unit), new response fields
for clients that reject unknown fields, and changed defaults such as
sort order or page size.

### 12. In what order do you deploy a breaking API change?

Expand the server so it accepts and returns both the old and the new
shape; switch the clients; wait while measuring usage of the old shape
(old tabs reload, app users update, the minimum version rises); then
contract the server. Reversing the first two steps breaks new clients on
old pods, and contracting early breaks old clients still in use.

### 13. Compare API versioning strategies.

Path versions (`/v2`) are easy to route, log, and cache but version the
whole API at once. Header versions (dated, like GitHub's
`X-GitHub-Api-Version`) allow fine-grained changes but need `Vary` for
caches and are easy to forget. Media-type versions fit content
negotiation but are awkward for tools. Account pinning (Stripe) never
breaks a client by default but requires transforms for every version.
GraphQL avoids versions by adding fields and deprecating old ones with
`@deprecated`, removing them when usage stops.

### 14. Why do single-page apps hit chunk-load errors after a deploy?

An open tab's `index.html` references hashed route chunks from its own
build. If the deploy deleted those files, the next lazy navigation fails
("Failed to fetch dynamically imported module" in Vite apps,
`ChunkLoadError` in webpack apps). Keep old assets for days, serve HTML
with `no-cache`, reload once on a missing chunk with a loop guard, and
prompt long-open tabs to update.

### 15. How does a long-open tab learn that a new version is deployed?

By polling a `version.json` served with `no-cache` (on an interval and
when the tab becomes visible), by comparing a version header on API
responses with its own build, or through a waiting service worker. It
then prompts the user or turns the next navigation into a full page
load. Builds are compared for inequality, so a rollback also moves tabs.

### 16. What does platform skew protection do, and where does it stop?

It routes requests from an open page to the deployment that served it.
On Vercel the deployment ID travels as `?dpl=`, an `x-deployment-id`
header, or a `__vdpl` cookie, depending on the framework. Full-page
navigations always get the latest deployment, some frameworks pin only
framework-managed requests, and pinning ends at the maximum age (12 hours
by default on Pro). It does not protect a separately deployed API or
installed apps.

### 17. How do you enforce a minimum supported client version?

Clients send their platform and version on every request. The API keeps
a minimum and a recommended version per platform in configuration,
returns a documented error (often `426` with a code such as
`client_update_required`) below the minimum, adds a soft
`X-Client-Update` header below the recommended one, exempts the
endpoints the update screen needs, and never blocks requests whose
version it cannot parse. For browser clients on another origin, CORS must
allow the custom request headers and expose `X-App-Version` and
`X-Client-Update` with `Access-Control-Expose-Headers`.

### 18. How do consumer-driven contract tests protect old clients?

Each consumer records the requests it makes and the fields it uses. The
provider verifies the pacts of the consumers' main branch and of every
deployed or released version, and `can-i-deploy` checks a version
against what is in the target environment. Mobile and desktop versions
recorded with `record-release` stay in the verification set until
support ends, so the API cannot drop a field a supported app reads.

### 19. How do you size the support window for installed clients?

From the update decay curve. If 25% of an old version's users update
each week, `0.75^n` remain after `n` weeks, so falling below 2% takes 14
weeks. Publish the policy (which releases, how long), measure the version
distribution, and raise the floor only when the remaining share is small
and the update path works on every supported OS.

## Update mechanisms and updaters

### 20. Static manifest on a CDN or dynamic update server?

A static manifest (`latest.yml`, a Sparkle appcast, Tauri JSON) is
cheap, cacheable, and highly available, but gives everyone the same
answer, so rollout logic lives in the client and halts wait for caches. A
dynamic server decides per request from version, platform, channel,
install ID, and tenant, enabling instant halts, cohorts, tenant pinning,
and forced updates, at the cost of running a highly available service.

### 21. Describe the service worker update lifecycle.

On navigation (or a push or sync event if no check happened in 24
hours), the browser fetches `sw.js`, ignoring the HTTP cache by default,
and installs it if it is byte-different. The new worker installs
(precaching), then *waits* while the old worker controls open pages,
then activates (cleaning old caches) and controls new page loads. The
wait keeps one version per set of pages.

### 22. When is `skipWaiting()` safe, and what is the usual alternative?

It is safe only when the new worker works with pages already open. It
makes the new worker active immediately, and with `clients.claim()` it
controls pages built from old code, which can break them. The usual
pattern: detect the waiting worker, show "Update available", on click
post a message so it calls `skipWaiting()`, and reload once on
`controllerchange`.

### 23. Why verify update signatures when downloads already use HTTPS?

HTTPS protects the connection, not the content of a compromised bucket,
CDN, or update server. The app verifies a signature with a public key
built into it before installing. TUF's security model also lists
rollback attacks (older files), indefinite freeze attacks (stale files
forever), and mix-and-match attacks, which need version checks and signed
metadata with expiry.

### 24. How do you rotate an update-signing key safely?

Ship the app with the current public key and a backup key from the first
release. To rotate, publish an update signed with the old key that adds
the new public key; switch signing only after that update reaches every
supported install. Keep private keys in an HSM or signing service, and
test the update path from the oldest supported version.

### 25. Compare full, delta, and block-based updates.

Full packages are simple and large. Binary deltas (Sparkle's `.delta`
files) are tiny but generated per source version, and a mismatched delta
falls back to the full download. Block-based updates (electron-updater's
blockmap, MSIX's 64 KB blocks) download only changed blocks from any
older version. For 1,000,000 installs of a 150 MB app, cutting the
average download to 15 MB saves 135 TB per release.

### 26. What is the difference between bucketing installs and throttling requests?

Bucketing hashes the install ID with the release version, so a 10%
rollout means a fixed 10% of installs, and raising it only adds installs.
Throttling requests (Balrog's `backgroundRate` is a percentage of
requests) is a dice roll per check: a client checking six times a day at
10% is offered the release within a day with probability
`1 - 0.9^6 = 47%`.

### 27. A bad desktop release reached 20% of installs. What do you do?

Halt it, disable the broken feature with a remote flag if possible, and
roll forward: offer the fix immediately to every install on the bad
version (they are already affected) and ramp everyone else normally.
Avoid downgrades, because the bad version may have migrated local data
that older code cannot read.

### 28. What mechanisms exist for forced and optional updates?

Optional: background download, install on quit or restart
(electron-updater's default). Recommended: a banner or Android's flexible
flow. Required: MSIX `UpdateBlocksActivation`, Sparkle critical updates,
Android's immediate flow, or a server-side minimum version. Force only
for security fixes and versions the API can no longer serve.

### 29. What can over-the-air JavaScript updates change, and what limits them?

They replace the JavaScript bundle and assets of a React Native app,
delivered only to builds with a matching runtime version; native code
needs a store build. Apple's license agreement allows downloaded
interpreted code only if it does not change the app's primary purpose,
bypass OS security, or create a storefront, and Google Play forbids
downloading executable code outside Play except code running in an
interpreter such as JavaScript. Microsoft retired App Center, including
CodePush, on March 31, 2025.

### 30. How do you keep an update service available?

Make clients fail open with short timeouts; jitter check times (2 million
installs every four hours average 139 requests per second, but a morning
launch peak can reach thousands); return cheap `204` answers; keep
artifacts immutable on a CDN; and keep a static manifest as a fallback.

### 31. Which telemetry shows that an update rollout is healthy?

The funnel per target version (offered, downloaded, verified, installed,
healthy first launch), crash-free sessions of the new version against
the old, the version distribution of active installs, and time to reach
50% and 90%. A spike in verification failures usually means a key or
file problem, not a code bug.

## Release trains and release management

### 32. When is a release train better than continuous deployment?

When releases cannot reach users continuously: mobile apps behind store
review, desktop and on-premises software, browsers, and public API
changes that need notice. Web services usually deploy continuously and
use trains only for client apps or versioned API changes. Trains cost
lead time: with a two-week train and a week each of stabilization and
rollout, a change takes two to four weeks to reach everyone. Public
examples: Chrome ships a milestone every two weeks since Chrome 153
(September 2026), Firefox moved to two-week releases from Firefox 155,
and Rust releases every six weeks.

### 33. Describe the parts of a release train.

A fixed cadence; a cut that creates `release/<version>` from `main`;
stabilization in which only fixes enter and each produces a release
candidate for beta users; a go/no-go decision on agreed numbers; a
phased rollout that promotes the last candidate's build; and support
with hotfixes. A feature that misses the cut takes the next train or
ships dark behind a flag.

### 34. What are the rules for release branches?

Branch from `main` at the cut and never merge back; fix on `main` first,
then cherry-pick with `-x`; accept only fixes; protect `release/*` with
rulesets; and promote candidate builds instead of rebuilding. Fixing
only the branch brings the bug back in the next release cut from `main`.

### 35. Walk through a hotfix for a bug in 2.4.0 and in the LTS line 2.3.

Decide whether a rollback or flag is faster. Otherwise fix on `main`
with a test, cherry-pick into `release/2.4` and `release/2.3` (adapting
the older one), tag `v2.4.1` and `v2.3.7`, build each once, ship through
a shortened but still staged rollout, communicate, and follow up with a
postmortem.

### 36. How do release notes differ from changelogs?

A changelog lists every notable change per version for developers and
is generated from commits or labels. Release notes are written for
users and customers: what changed for them, upgrade steps, known issues,
and deprecations, in the app, the store listing, or email.

### 37. What should a long-term support policy state, and what does it cost?

Which versions are supported, for how long, which fixes qualify
(security only or critical bugs too), and the end-of-life dates.
Examples: Kubernetes maintains three minor releases; GitLab backports
security fixes to the previous two monthly releases; Node.js 24 is in
maintenance until April 2028. Each supported line multiplies backports:
monthly releases with three supported lines turn 12 security fixes into
36 patch releases a year.

### 38. What do the `Deprecation` and `Sunset` headers communicate?

`Deprecation` (RFC 9745) says a resource is or will be deprecated, as a
structured date such as `@1796083200`; it does not change behaviour.
`Sunset` (RFC 8594) gives the HTTP date after which the resource is
likely to stop responding. A `Link` with `rel="deprecation"` points to
details, and the sunset must not be earlier than the deprecation.

### 39. What is a brownout, and why run one?

A short, announced, scheduled period (an hour, then a day) in which a
deprecated endpoint fails exactly as it will after the sunset. Clients
that ignored every notice discover the dependency while there is still
time, and usage numbers usually drop sharply after each one.

### 40. What belongs in a go/no-go decision?

Agreed criteria with numbers and sources: open release blockers,
crash-free sessions of the candidate against the current release with a
minimum sample, API error rates by client version, reviewed migrations,
flag defaults, a rollback or roll-forward plan, and communication ready.
Missing data counts as no-go, and the decision is recorded with its
evidence.

## Deploying microservices

### 41. What is independent deployability, and how do you test for it?

The ability to deploy one service without deploying or coordinating with
any other. Test it literally: can the owning team deploy it on a Tuesday
afternoon, alone? That requires its own pipeline and artifact, its own
data, backward-compatible contracts, no deploy ordering, and a rollback
that touches only itself.

### 42. What is a distributed monolith?

Services that must be released together, in order, during a window,
usually because of shared databases or breaking contracts. Symptoms: a
deploy-order spreadsheet, release nights, version matrices pinning
other services, and multi-repository pull requests that must merge
together. It combines the costs of distribution with monolith coupling.

### 43. Which contract checks fit HTTP, events, and gRPC?

HTTP: an OpenAPI document diffed against production for breaking
changes. Events: an AsyncAPI document and a schema registry enforcing a
compatibility mode. gRPC: Protobuf rules (never reuse or retype a field
number, reserve deleted ones). Consumer-driven contracts (Pact) cover
what consumers actually use, for HTTP and messages, with `can-i-deploy`
as the gate.

### 44. Explain schema registry compatibility modes.

BACKWARD (Confluent's default): consumers on the new schema read data
written with the previous one, so consumers upgrade first; fields may be
deleted and added only with defaults. FORWARD: old consumers read new
data, so producers upgrade first. FULL: both, in any order, with only
optional fields added or removed. Transitive variants check every
earlier version, which matters when consumers replay long-retention
topics.

### 45. How do you make a breaking change to an event?

Publish a new event version alongside the old one with the same event
ID, so consumers can deduplicate; let each consumer move on its own
schedule; stop publishing the old version when no consumer group still
reads it. Use a transactional outbox if both publishes must succeed
together.

### 46. How should GitOps be structured for many services?

One Argo CD or Flux application per service (for example generated by
an ApplicationSet from one directory per service), promotion as a commit
that changes one service's digest, and rollback per service. A single
application for every service recreates the lock-step release.

### 47. How do you find which service's deploy caused an error spike?

Record every deploy as an event and show deploy markers on dashboards,
put `service.version` on every metric, log, and trace, and split errors
by version. Traces show which version handled each hop, so errors that
appear only through `search-service` 4.2.0 point straight at it.

### 48. When is a modular monolith the better delivery choice?

When one team owns the system, services always change and deploy
together, or they share a database. One deployable gives atomic changes,
one rollback, and compiler-checked boundaries. Segment consolidated more
than 140 services into one, and Shopify chose a modular monolith with
enforced component boundaries.

## Monorepo builds and deployments

### 49. How does affected detection work?

The tool builds a project graph from declared workspace dependencies,
maps changed files to projects, and selects those projects plus all
their dependents. Nx (`nx affected -t build`) selects tasks whose inputs
changed; Turborepo (`turbo run build --affected`) selects whole packages
by default; Bazel queries reverse dependencies with `rdeps`. Changes to
global inputs such as the lockfile affect everything.

### 50. Which base commit should affected detection use?

For pull requests, the merge base with the target branch. For deploys on
`main`, the last successfully deployed commit: with `HEAD^1`, a change
whose deploy failed is skipped forever by the next run. The checkout must
include history (`fetch-depth: 0`), or every package looks changed.

### 51. How does a remote build cache work, and what are its risks?

A task's hash covers its files, dependency hashes, declared environment
variables, configuration, and resolved dependencies; outputs and logs are
stored under that hash and restored on a hit. Risks: undeclared inputs
cause wrong hits (a staging bundle served to production), and writable
caches can be poisoned, so only CI writes and entries are signed
(Turborepo's HMAC signatures, Bazel's read-only clients).

### 52. Why are path filters a poor fit for required checks in a monorepo?

A workflow skipped by `paths` leaves its checks pending, which blocks
merging, and the filter does not follow the dependency graph. Use an
always-running workflow that decides inside it what to run (affected
detection), and keep path filters for non-required workflows such as
per-app deploys.

### 53. One deploy workflow per app, or one matrix?

Per-app workflows give clear triggers, environments, approvals, and
ownership, and a shared reusable workflow removes duplication. One
workflow with a computed matrix (or `turbo run deploy --affected`)
avoids duplication and handles required checks easily, but mixes
credentials and approvals for every app in one place.

### 54. How do you version shared packages in a monorepo?

Internal-only packages use `workspace:*` and have no meaningful version.
Published packages need SemVer: fixed versioning keeps a group on one
version, linked versioning aligns changed packages to the group's highest
version, and independent versioning lets each move alone. Changesets
records bumps in files, `changeset version` applies them, and
`changeset publish` publishes and tags.

### 55. Does an atomic commit across the API and the web app make the release atomic?

No. The commit is reviewed and tested together, but the API and web app
deploy separately, old tabs and installed apps keep running, and
published client packages live in customers' lockfiles. Wire changes
still need expand, migrate, contract.

### 56. How do you keep dependencies consistent across a monorepo?

Define workspaces, keep one version per external dependency (pnpm
catalogs define a range once and packages reference it with `catalog:`),
group dependency updates so one pull request upgrades a library
everywhere, and detect duplicates with `pnpm why` before they reach
bundles.

## Scenario-based questions

### 57. Users on an old desktop build start failing after an API deploy. What do you do?

**What to check first:** errors by `X-Client-Version` before and after the
deploy, and the diff of the API's request and response shapes.

**How to confirm:** failures come only from versions older than a certain
release, start at the deploy time, and show parsing or validation errors
for one endpoint.

**Likely causes and fixes:** a removed or renamed field, a new enum value
or required field, or tightened validation. Roll the API back or restore
the old shape (expand), add contract tests for every supported desktop
release with `record-release` and `deployedOrReleased`, and remove the
field only after usage reaches zero. See
[keeping frontend and backend in sync](keeping-frontend-and-backend-in-sync.md).

### 58. A deploy causes `ChunkLoadError` for users with open tabs. How do you fix it?

**What to check first:** whether old hashed assets still exist on the
host, and the `Cache-Control` header of `index.html`.

**How to confirm:** the errors come only from sessions that started
before the deploy, and the failing URLs are chunk names from the previous
build that now return 404.

**Likely causes and fixes:** the deploy deleted the previous build's
assets (a sync with delete), or a cached `index.html` references old
chunks. Keep old assets for days, serve HTML with `no-cache`, reload once
on a missing chunk with a loop guard, and prompt long-open tabs to
reload. See
[keeping frontend and backend in sync](keeping-frontend-and-backend-in-sync.md).

### 59. For a few minutes during every deploy, the newest web build gets `400` errors. Why?

**What to check first:** the timing (only while the API rollout runs) and
which client builds see the errors.

**How to confirm:** the failing requests contain a new field, and they
fail only when served by API pods still on the old version.

**Likely causes and fixes:** the web app started sending a new field
before every API pod accepted it. Deploy the API change first (expand),
keep the client behaviour behind a flag until the API rollout completes,
and make the pipeline enforce server-first ordering. See
[keeping frontend and backend in sync](keeping-frontend-and-backend-in-sync.md).

### 60. Users on 1.9.4 are never offered the 1.10.0 desktop update. What happened?

**What to check first:** the update server's or client's version
comparison and the manifest content.

**How to confirm:** the check for `1.9.4` returns "no update" while
`1.9.4` and `1.10.0` are both in the manifest; a unit test comparing them
fails.

**Likely causes and fixes:** versions compared as strings, so
`"1.10.0" < "1.9.4"`. Compare with a SemVer library, and add tests with
two-digit minor versions and pre-releases. See
[versioning patterns](versioning-patterns.md).

### 61. The Play Console rejects the Android upload on release day. What do you check?

**What to check first:** the `versionCode` of the bundle and of the last
upload, including uploads to test tracks.

**How to confirm:** the code was already used, or the new scheme produces
a value above 2,100,000,000.

**Likely causes and fixes:** a hand-edited build number, a pipeline re-run
that reused the number, a CI migration that restarted the run counter, or
a timestamp scheme that overflowed. Derive codes from CI with an offset
above every code ever shipped, and never reuse one. See
[versioning patterns](versioning-patterns.md).

### 62. A new desktop release is offered to thousands of installs but installed by none. Why?

**What to check first:** the update funnel: offered, downloaded,
verified, installed.

**How to confirm:** downloads complete but `verify_ok` stays at zero, and
client logs show signature failures.

**Likely causes and fixes:** the release was signed with a different key
than the one built into the app, or the manifest carries a signature
path instead of its content. Halt, re-sign or fix the manifest, add a CI
check that verifies each artifact against the shipped public key, and
keep the signing key in one managed place. See
[update mechanisms and updaters](update-mechanisms-and-updaters.md).

### 63. A halted desktop rollout keeps gaining installs for an hour. Why?

**What to check first:** the `Cache-Control` of the manifest and the CDN's
cached copy.

**How to confirm:** the CDN still serves the previous manifest content,
and new installs of the halted version stop exactly when it expires.

**Likely causes and fixes:** the manifest was cached with a long lifetime.
Serve manifests with `no-cache` or a short `max-age`, purge them on every
change, or move the decision to a dynamic update server. See
[update mechanisms and updaters](update-mechanisms-and-updaters.md).

### 64. A "10%" update rollout reached most active users within three days. Why?

**What to check first:** how the server decides who gets the update.

**How to confirm:** the code or configuration rolls a random number per
request, and frequent checkers dominate the new version's population.

**Likely causes and fixes:** per-request throttling instead of bucketing:
with 10% per request and six checks a day, `1 - 0.9^18` is 85% after
three days. Bucket by a hash of install ID and release so the percentage
means a share of installs. See
[update mechanisms and updaters](update-mechanisms-and-updaters.md).

### 65. After raising the minimum app version, old clients show a blank screen instead of an update prompt. What went wrong?

**What to check first:** responses to the requests the update screen
makes (configuration, links, token refresh).

**How to confirm:** those requests also receive the
`client_update_required` error, so the screen cannot render.

**Likely causes and fixes:** the version gate covers every path. Exempt
the endpoints the update flow needs, test the floor change with the
oldest supported build before applying it, and keep the floor in
configuration so it can be lowered again quickly. See
[keeping frontend and backend in sync](keeping-frontend-and-backend-in-sync.md).

### 66. A bug fixed two weeks ago is back in the new release. How did that happen?

**What to check first:** where the fix was committed: the release branch,
`main`, or both.

**How to confirm:** the fix commit exists only on the old release branch,
and no commit on `main` references it.

**Likely causes and fixes:** a branch-only hotfix; the new release was cut
from `main`, which never had it. Apply the fix on `main`, require fixes on
`main` first with `cherry-pick -x` into branches, and check that every
release-branch commit references its `main` source. See
[release trains and release management](release-trains-and-release-management.md).

### 67. Customers break on the API v1 sunset date despite months of notice. What should have happened?

**What to check first:** v1 traffic by API client in the weeks before the
sunset, and how the deprecation was communicated.

**How to confirm:** several clients were still calling v1 the day before;
responses carried `Deprecation` and `Sunset` headers that nobody watched.

**Likely causes and fixes:** notices without measurement or contact. Count
usage per client, contact the remaining users directly, run announced
brownouts before the deadline, and keep the sunset date no earlier than
the deprecation date. See
[release trains and release management](release-trains-and-release-management.md).

### 68. Search results stop updating after a tasks-service deploy, with no errors in tasks. What do you check?

**What to check first:** the search consumer's logs and lag, and the
event schema change in the tasks deploy.

**How to confirm:** the consumer skips events as unparseable since the
deploy, and the registry's compatibility mode for the topic is `NONE`.

**Likely causes and fixes:** an incompatible event change slipped through.
Set `BACKWARD` or `FULL` (transitive for replayed topics), publish
breaking changes as a new event version alongside the old one, add
message contract tests, and replay the skipped events after the fix. See
[deploying microservices](deploying-microservices.md).

### 69. A change merged to the monorepo's `main` last week never reached production. Why?

**What to check first:** the deploy runs for that commit and for the
commits after it, and the base each run used.

**How to confirm:** the change's own deploy failed, and the next run
compared with `HEAD^1`, saw only unrelated files, and deployed nothing.

**Likely causes and fixes:** the wrong base for affected detection. Use
the last successfully deployed commit as the base (`TURBO_SCM_BASE`, or
`nx-set-shas`), fetch enough history, and alert on failed deploy runs.
See [monorepo builds and deployments](monorepo-builds-and-deployments.md).

### 70. After a deploy, the production web app calls the staging API. The build log shows a cache hit. Explain.

**What to check first:** the task's declared inputs and environment
variables, and the cache key of the restored build.

**How to confirm:** `VITE_API_URL` differs between the staging and
production builds, but it is not part of the task's hash.

**Likely causes and fixes:** an undeclared input, so the staging artifact
was restored for production. Declare environment variables in the task
configuration (for example `VITE_*`), clear the affected cache entries,
and move per-environment values to runtime configuration. See
[monorepo builds and deployments](monorepo-builds-and-deployments.md).

## Further learning

- [Release engineering overview](../release-engineering.md)
- [Versioning patterns](versioning-patterns.md) ·
  [Keeping frontend and backend in sync](keeping-frontend-and-backend-in-sync.md) ·
  [Update mechanisms and updaters](update-mechanisms-and-updaters.md) ·
  [Release trains and release management](release-trains-and-release-management.md) ·
  [Deploying microservices](deploying-microservices.md) ·
  [Monorepo builds and deployments](monorepo-builds-and-deployments.md)
- [Google SRE book: Release Engineering](https://sre.google/sre-book/release-engineering/)
- [Malte Ubl: Version skew](https://www.industrialempathy.com/posts/version-skew/)
- [The Update Framework: security](https://theupdateframework.io/docs/security/)
