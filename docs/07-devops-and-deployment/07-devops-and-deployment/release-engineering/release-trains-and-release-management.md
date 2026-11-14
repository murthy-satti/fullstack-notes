# Release Trains and Release Management

Continuous deployment answers "how does a change reach production?"
Release management answers the questions around it: when does a version
ship, what is in it, who decides it is ready, how a fix reaches versions
that already shipped, how long each version is supported, and how a
feature is retired without breaking the people who still use it. Teams
that ship to app stores, to customers' own servers, or to millions of
installed browsers cannot avoid these questions; teams that deploy a web
service continuously still face them for their public API.

This lesson covers continuous release versus release trains (fixed
cadence, cut-off, stabilization), release branches and cherry-picked
fixes, the hotfix process end to end, release notes versus changelogs,
long-term support and several supported versions, deprecation and sunset
policies with the `Deprecation` and `Sunset` HTTP headers, release
checklists and go/no-go decisions, and coordinating one release across
web, API, and mobile. Branch mechanics are in
[branching strategies](../git-and-github/branching-strategies.md), and
version numbers and changelog automation in
[versioning, tags, and releases](../git-and-github/versioning-tags-and-releases.md).

## Why it matters

- **Releases without a schedule grow.** "One more feature" delays the
  release, the delay attracts more features, and the eventual release is
  large, late, and risky. A fixed cadence keeps each release small.
- **Not everything can ship continuously.** App store review, customers
  who install software on their own servers, regulated approvals, and
  browsers on billions of devices all need versions that are prepared,
  stabilized, and shipped on a known date.
- **Shipped versions need fixes.** A security fix may have to reach the
  current release and every supported older one, quickly and without
  dragging in unrelated changes.
- **Retiring things is part of releasing.** Without a deprecation policy,
  old endpoints either break customers when removed or are never removed
  and cost you forever.
- **Lead time is set by the cadence.** With a two-week train, a change
  merged right after a cut waits two weeks for the next cut, a week of
  stabilization, and about a week of rollout: up to four weeks to reach
  everyone, three on average.

## Real-world usage

- **Chrome.** Chrome moved to
  [four-week milestones](https://blog.chromium.org/2021/03/speeding-up-release-cycle.html)
  starting with Chrome 94 in 2021, alongside an Extended Stable channel
  with a new milestone every eight weeks. Google then announced a
  [two-week release cycle](https://developer.chrome.com/blog/chrome-two-week-release)
  that started with the stable release of Chrome 153 on September 8,
  2026, while Extended Stable keeps its eight-week cycle. The Chromium
  [release cycle](https://chromium.googlesource.com/chromium/src/+/HEAD/docs/process/release_cycle.md)
  document describes a milestone branch that is stabilized for three
  weeks, with weekly refreshes for security fixes once it is stable.
- **Firefox.** Firefox ships through Nightly, Beta, Release, and ESR
  channels, and Mozilla's
  [support blog](https://blog.mozilla.org/sumo/2026/08/19/firefox-new-release-cadence-and-what-to-expect/)
  announced a move to a two-week release cycle starting with Firefox 155
  on September 1, 2026. Mozilla's
  [What Train Is It Now?](https://whattrainisitnow.com/calendar/) page
  publishes the schedule.
- **Rust.** The Rust book's chapter on
  [release channels](https://doc.rust-lang.org/book/appendix-07-nightly-rust.html)
  describes the train model directly: nightly builds every night, a beta
  branch every six weeks, fixes landing on main and backported to beta,
  and a stable release six weeks after each beta; a feature that misses
  one train simply takes the next.
- **Kubernetes.** The
  [Kubernetes release cycle](https://kubernetes.io/releases/release/)
  produces about three releases a year, with an enhancements freeze about
  four weeks in and a code freeze around week 12 after which only
  critical fixes merge; the project maintains the three most recent minor
  releases with about a year of patch support each.
- **Meta.** Chuck Rossi's
  [Rapid release at massive scale](https://engineering.fb.com/2017/08/31/web/rapid-release-at-massive-scale/)
  (2017) describes facebook.com moving from a weekly release branch with
  daily cherry-picks to continuous push from master in tiers (employees,
  2% of production, then everyone), while mobile apps kept a weekly
  branch-and-cherry-pick train with daily release candidates for beta
  users.
- **Google.** The SRE book's
  [Release Engineering](https://sre.google/sre-book/release-engineering/)
  chapter states the branch rule most teams follow: branch from the
  mainline at a specific revision, never merge the branch back, and
  submit fixes to the mainline first, then cherry-pick them into the
  branch.
- **GitLab.** GitLab's
  [maintenance policy](https://docs.gitlab.com/policy/maintenance/)
  ships a monthly minor release on the third Thursday, patch releases
  twice a month, and backports security fixes to the previous two monthly
  releases as well as the current one.

**Popular tools and providers:** release-please, semantic-release, and
Changesets for versions and notes; GitHub milestones, rulesets for
`release/*` branches, and backport automation; feature flag services to
keep unfinished work dark; fastlane, App Store Connect, and the Play
Console for mobile trains; and status pages and changelog sites for
release communication.

## How it works

### Continuous release versus release trains

| | Continuous deployment | Release train | Feature-based release |
|---|---|---|---|
| A release happens | On every merge that passes the pipeline | On a fixed schedule (weekly, every two weeks, monthly) | "When it is ready" |
| Unfinished features | Hidden behind flags | Hidden behind flags, or they miss the train | Delay the release |
| Size of a release | One change | One cadence's worth of changes | Unbounded |
| Predictability for users and support | High frequency, low ceremony | Known dates | Low |
| Fits | Web services and web apps you host | Mobile apps, desktop apps, on-premises software, browsers, platforms | Rarely a good choice |

The train metaphor is precise. The train leaves on schedule whether or
not your feature is aboard; if it misses the train, it takes the next
one. That removes the pressure to rush a half-finished change into a
release, and it turns the release date from a negotiation into a fact.
Trains and continuous deployment combine well: TaskFlow's API deploys
continuously, while its mobile apps and the public API's versioned
changes follow trains.

### Anatomy of a train

![Diagram: three overlapping two-week trains over six weeks: 2026.11.1 collects commits on main in weeks 1 and 2, is cut at the end of week 2, stabilizes with release candidates in week 3, rolls out in phases in week 4, and is then supported with hotfixes only; 2026.11.2 collects commits in weeks 3 and 4, is cut, stabilizes in week 5, and rolls out in week 6; 2026.12.1 collects commits in weeks 5 and 6. A note says a train leaves every two weeks, a feature that misses the cut rides the next train or ships dark behind a flag, and in week 5 three versions are active at once.](release-train-timeline.svg)

- **Cadence:** the fixed interval between trains, for example every
  second Monday.
- **Cut (branch point):** the moment the release branch is created from
  `main`. Everything merged before it is aboard; everything after waits.
- **Stabilization:** a period in which only fixes enter the branch. Each
  fix produces a release candidate (`2026.11.2-rc.2`) that goes to beta
  testers, TestFlight, or Play testing tracks.
- **Go/no-go:** a decision, based on agreed numbers, that the last
  candidate becomes the release. The candidate build is promoted, never
  rebuilt.
- **Rollout:** a phased release to users, gated on crash-free sessions
  and error rates.
- **Support:** after release, the branch receives only hotfixes until it
  goes out of support.

With overlapping trains, several versions are always active: one rolling
out or supported, one stabilizing, one in development on `main`. The
cost of a train is lead time (the two to four weeks computed above); the
benefits are predictability and a stabilization period that catches
problems before users do.

### Release branches and cherry-picks

The rules that keep release branches healthy:

1. **Branch from `main` at the cut; never merge the branch back.** The
   branch is a stabilizing copy, not a place for development.
2. **Fix on `main` first, then cherry-pick.** If a fix is made only on the
   branch, the next release, cut from `main`, brings the bug back. The
   exception is a fix for code that no longer exists on `main`; then the
   branch gets its own reviewed change, linked to the issue.
3. **Use `git cherry-pick -x`.** It appends "(cherry picked from commit
   ...)" to the message, so anyone can trace the backport to its source.
4. **Only fixes enter a stabilizing branch.** Every change is reviewed
   against the question "would we hold the release for this?"
5. **Protect `release/*` branches** with a ruleset: pull requests only,
   required checks, and a release owner's approval.

Squash merging (one commit per pull request on `main`) makes backports
simple: there is exactly one commit to pick. A label such as
`backport:release/2.4` on the pull request lets automation open the
backport pull request (example below).

### The hotfix process end to end

![Diagram: main, release/2.4 (cut from main, tagged v2.4.0), and the long-term support line release/2.3 (tagged v2.3.6); a bug is reported in 2.4.0 and also present in 2.3.6; the fix is merged to main first, then cherry-picked with -x into release/2.4, where it is tagged v2.4.1, and into release/2.3, adapted where the old code diverged, where it is tagged v2.3.7; each branch is built once and shipped through a shortened rollout. Never fix only the branch, because the next release from main would bring the bug back.](hotfix-cherry-pick-flow.svg)

1. **Decide** whether this is a hotfix at all: severity, number of users
   affected, and whether a rollback, a feature flag, or a server-side
   change solves it faster.
2. **Fix on `main`** through a normal, reviewed pull request with a test
   that reproduces the bug.
3. **Backport** to every supported branch that has the bug, adapting the
   change where an older line diverged.
4. **Build and verify** each patch release from its branch: tag
   `v2.4.1`, build once, run the release pipeline, and smoke-test it.
5. **Ship fast, but still in stages.** Shorten bake times rather than
   skipping them; for mobile, request an expedited review and use the
   fastest phased rollout you can tolerate.
6. **Communicate:** release notes, a status page update, and notes to
   customers on older supported lines.
7. **Follow up** with a postmortem when the bug reached users (see
   [incident response and postmortems](../monitoring-and-logging/incident-response-and-postmortems.md)).

For hosted services, rolling back to the previous version is usually
faster than a hotfix; for installed software it is not an option, which
is why client hotfixes go through this whole sequence.

### Release notes versus changelogs

| | Changelog | Release notes |
|---|---|---|
| Audience | Developers and integrators | Users, customers, support staff |
| Content | Every notable change per version, grouped by type | What changed for the reader, upgrade steps, known issues, deprecations |
| Produced by | Generated from Conventional Commits or pull request labels | Written or edited by a person, often from the same labels |
| Where | `CHANGELOG.md`, GitHub Releases | In-app "what's new", store listings, a docs page, email |

Generate the changelog (see the Git lesson), and write release notes for
humans. Deprecations and breaking changes belong in both.

### Long-term support and several supported versions

Supporting several versions at once is sometimes unavoidable: enterprises
upgrade slowly, on-premises installs lag, and mobile users stay on old
builds. Public projects show the common shapes:

- **The last N releases:** Kubernetes maintains release branches for the
  three most recent minor versions, each with about a year of patches.
- **Current plus recent, for security only:** GitLab backports security
  fixes to the previous two monthly releases.
- **Designated long-term support lines:** until Node.js 26, even-numbered
  Node.js releases became LTS lines, actively supported for 12 months and
  maintained for another 18; Node.js 24 entered maintenance in October
  2026 with support until April 2028. The project's
  [release schedule](https://github.com/nodejs/release) changes from
  Node.js 27: one new release line a year, and every line becomes LTS.

Every supported line multiplies work. With monthly releases, a policy of
"current plus the two previous for security" turns each security fix
into three backports, three patch releases, and three test runs on three
toolchains. Twelve such fixes a year are 36 patch releases. That is why
an LTS policy states exactly which versions, for how long, and which
fixes qualify (security only, or also critical bugs), and announces each
end-of-life date in advance.

### Deprecation and sunset policies

![Diagram: a timeline for retiring TaskFlow API v1: v2 released on 2026-11-01; v1 deprecated on 2026-12-01, after which every v1 response carries Deprecation: @1796083200, Sunset: Wed, 30 Jun 2027 23:59:59 GMT, and a Link header with rel deprecation; a one-hour brownout on 2027-03-16 and a one-day brownout on 2027-05-18; sunset on 2027-06-30 with 410 Gone. A line shows the share of API traffic on v1 falling from 45% to 40%, 12%, 3%, and 0.4%. A note says the Sunset date must not be earlier than the Deprecation date.](deprecation-timeline.svg)

A deprecation policy turns "we will remove this" into a predictable
process:

1. **Announce** with a date: docs, changelog, release notes, email to the
   owners of clients that still use it.
2. **Mark responses.** RFC 9745 defines the
   [`Deprecation` header](https://www.rfc-editor.org/rfc/rfc9745.html),
   whose value is a structured-field date such as `@1796083200` (seconds
   since 1970); deprecation itself changes nothing about how the resource
   behaves. A `Link` header with `rel="deprecation"` points to the
   migration guide. RFC 8594 defines the
   [`Sunset` header](https://www.rfc-editor.org/rfc/rfc8594.html), an
   HTTP date after which the resource is likely to become unresponsive,
   and RFC 9745 requires the sunset not to be earlier than the
   deprecation.
3. **Measure** who still calls it, per API client, and contact them.
4. **Brown out** before the deadline: announced, short, scheduled periods
   (an hour, then a day) in which the deprecated endpoint fails exactly
   as it will after the sunset. Clients that ignored every notice find
   out while there is still time.
5. **Remove** at the sunset date: return `410 Gone` with a pointer to the
   replacement, then delete the code.

Public policies give a sense of scale: GitHub supports a previous REST
API version for at least 24 months after a new one; Kubernetes keeps
serving a deprecated beta API for 9 months or 3 minor releases after the
deprecation (whichever is longer) and never removes a GA API within a
major version; GraphQL
marks fields `@deprecated(reason: "...")` and removes them when usage
stops. For installed clients, the equivalent is the minimum supported
version described in
[keeping frontend and backend in sync](keeping-frontend-and-backend-in-sync.md).

### Release checklists and go/no-go

A checklist makes the release independent of who runs it; the go/no-go
decision makes it independent of who argues loudest. Useful criteria,
each with a number and a source:

| Criterion | Example threshold | Source |
|---|---|---|
| Open release blockers | 0 | The issue tracker's `release-blocker` label |
| Crash-free sessions of the candidate | Not worse than the current release by more than 0.1 percentage points, with at least 2,000 beta sessions | Crash reporting |
| API error rate from the candidate's clients | Not above the current release's | Metrics by client version |
| Migrations | Reviewed and backward compatible with the previous version | The migration pull requests |
| Feature flags | Default states agreed for every new flag | The flag service |
| Rollback or roll-forward plan | Written, with an owner | The release document |
| Support and communication | Release notes, support briefing, status page text ready | The release document |
| Store metadata (mobile) | Screenshots, "what's new", phased release enabled | App Store Connect, Play Console |

Typical roles in the meeting are the release captain (runs the train for
this cycle), engineering owners of risky changes, QA, product, support,
and the on-call engineer. The decision is recorded with the numbers
behind it. The checklist for an individual risky deploy is in
[rollbacks and safe releases](../deployment-strategies/rollbacks-and-safe-releases.md).

### Coordinating a release across web, API, and mobile

A feature that touches TaskFlow's API, web app, and mobile apps follows
the compatibility order from the previous lessons, laid over the train
calendar:

| When | What | Why this order |
|---|---|---|
| Monday, week 1 | Database migration (expand) and API 2.5.0 with the new endpoint, behind a flag | Servers learn new things first |
| Tuesday, week 1 | TaskFlow Web with the feature, flag off | The web app can ship any day |
| Monday, week 2 | Mobile train cut: iOS and Android 3.4.0 with the feature, flag off | Store review needs time; the client must not depend on the flag being on |
| Week 2 to 3 | Stabilization, TestFlight and Play testing; submit for review | The candidate is verified against production APIs |
| Week 3 | Phased rollout of 3.4.0 | Crash-free sessions gate each step |
| Week 4 | Turn the flag on for web and for app versions 3.4.0 and later | Both sides are ready |
| Later | Remove the flag and any old code paths | Contract step |

One person, the release captain, owns this calendar and a single release
document that lists the versions, the flags, the go/no-go numbers, and
who to call. Rotating the role spreads the knowledge and keeps the
process honest.

## When to use and when not to use

| Context | Recommended cadence and process |
|---|---|
| Hosted web service and web app | Continuous deployment; flags for unfinished work; trains only for public API version changes |
| Mobile apps | Weekly or two-week trains with a cut, stabilization on test tracks, and phased rollout |
| Desktop apps with an updater | Trains plus a beta channel; staged rollouts on the update server |
| On-premises or self-hosted product | Monthly or quarterly trains, an LTS line, documented upgrade paths |
| Public API | Continuous additive changes; breaking changes only through versioning and a published deprecation policy |
| Small team, one product, few users | Release from `main` with tags; skip trains and LTS until customers need them |

Avoid long-lived release branches for hosted services (roll back
instead), stabilization periods longer than the cadence (they overlap
until nothing ships), and LTS promises nobody has budgeted for.

## Practical examples

### Cut a train and tag release candidates

```bash
#!/usr/bin/env bash
# scripts/cut-release.sh: cut the train branch and tag its first candidate
# usage: cut-release.sh 2026.11.2
set -euo pipefail
TRAIN="$1"

git fetch origin --tags
git switch -c "release/$TRAIN" origin/main
git push -u origin "release/$TRAIN"

git tag -a "v$TRAIN-rc.1" -m "TaskFlow $TRAIN release candidate 1"
git push origin "v$TRAIN-rc.1"
# CI builds the candidate once from the tag and ships it to beta testers.
# Later fixes arrive as cherry-picks and produce rc.2, rc.3, ...
# After go/no-go, tag the SAME commit as the final release (no rebuild):
#   git tag -a "v$TRAIN" -m "TaskFlow $TRAIN" "v$TRAIN-rc.3^{commit}"
```

`2026.11.2` is CalVer that is also valid SemVer (and a valid display
version on both stores), and `-rc.N` pre-releases sort before the final
release. Tagging the release on the last candidate's commit means the
binary users get is the one beta testers already ran.

### Automate backports with a label

```yaml
# .github/workflows/backport.yml: label a merged PR "backport:release/2.4" to backport it
name: backport
on:
  pull_request:
    types: [closed]

permissions:
  contents: read

jobs:
  backport:
    if: github.event.pull_request.merged == true
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
    steps:
      - uses: actions/checkout@v7
        with:
          fetch-depth: 0                               # all branches for cherry-pick
          token: ${{ secrets.RELEASE_BOT_TOKEN }}      # App token: CI runs on the new PRs
      - name: Cherry-pick into every labelled release branch
        env:
          GH_TOKEN: ${{ secrets.RELEASE_BOT_TOKEN }}
          LABELS: ${{ toJSON(github.event.pull_request.labels.*.name) }}
          MERGE_SHA: ${{ github.event.pull_request.merge_commit_sha }}
          PR_NUMBER: ${{ github.event.pull_request.number }}
          PR_TITLE: ${{ github.event.pull_request.title }}
        run: |
          git config user.name "taskflow-release-bot"
          git config user.email "release-bot@example.com"
          for target in $(jq -r '.[] | select(startswith("backport:")) | sub("^backport:"; "")' <<<"$LABELS"); do
            branch="backport/$PR_NUMBER-to-${target//\//-}"
            git switch -c "$branch" "origin/$target"
            if git cherry-pick -x "$MERGE_SHA"; then
              git push origin "$branch"
              gh pr create --base "$target" --head "$branch" \
                --title "[$target] $PR_TITLE" \
                --body "Backport of #$PR_NUMBER to \`$target\`."
            else
              git cherry-pick --abort
              gh pr comment "$PR_NUMBER" \
                --body "Automatic backport to \`$target\` failed. Please cherry-pick it by hand."
            fi
            git switch --detach "$MERGE_SHA"
          done
```

- It assumes squash merging, so `merge_commit_sha` is the single commit
  to pick; a true merge commit would need `cherry-pick -m 1`.
- Pull request titles and labels arrive through environment variables,
  never pasted into the script with `${{ }}`, which would allow script
  injection (see
  [pipeline and supply chain security](../ci-cd/pipeline-and-supply-chain-security.md)).
- Pull requests opened with the default `GITHUB_TOKEN` do not trigger
  other workflows, so the bot uses a GitHub App or fine-grained token and
  the backport pull request gets the normal checks and reviews.

### Announce deprecation with headers, brownouts, and a sunset

```js
// src/middleware/deprecate-v1.js: mark, measure, brown out, and finally retire /v1
import client from "prom-client";

const DEPRECATED_AT = Date.parse("2026-12-01T00:00:00Z");
const SUNSET_AT = Date.parse("2027-06-30T23:59:59Z");
const GUIDE = "https://docs.example.com/taskflow/v1-migration";
const BROWNOUTS = [
  ["2027-03-16T14:00:00Z", "2027-03-16T15:00:00Z"],   // announced: one hour
  ["2027-05-18T00:00:00Z", "2027-05-19T00:00:00Z"],   // announced: one day
].map(([from, to]) => [Date.parse(from), Date.parse(to)]);

const v1Requests = new client.Counter({
  name: "taskflow_api_v1_requests_total",
  help: "Requests to the deprecated v1 API, by API client",
  labelNames: ["client_id"], // registered API clients, a bounded set
});

const inBrownout = (t) => BROWNOUTS.some(([from, to]) => t >= from && t < to);

export function deprecateV1(req, res, next) {
  const now = Date.now();
  v1Requests.inc({ client_id: req.auth?.clientId ?? "anonymous" });

  if (now > SUNSET_AT || inBrownout(now)) {
    return res.status(410).json({
      error: "api_version_retired",
      message: "TaskFlow API v1 is retired (sunset 2027-06-30). Use /v2.",
      documentation: GUIDE,
    });
  }
  res.set("Deprecation", `@${Math.floor(DEPRECATED_AT / 1000)}`); // RFC 9745: @1796083200
  res.set("Sunset", new Date(SUNSET_AT).toUTCString());           // Wed, 30 Jun 2027 23:59:59 GMT
  res.set("Link", `<${GUIDE}>; rel="deprecation"`);
  next();
}

// src/app.js: app.use("/v1", deprecateV1, v1Router);
```

The counter, broken down by `client_id`, is the list of customers to
contact before each brownout; the brownouts return exactly the response
clients will get after the sunset, so nothing about the final removal is
a surprise.

### A go/no-go check that reads the numbers

```js
// scripts/go-no-go.mjs: print the go/no-go criteria; exit 1 on no-go
// usage: node scripts/go-no-go.mjs <candidate> <current>   e.g. 2026.11.2-rc.3 2026.11.1
import { execFileSync } from "node:child_process";

const [candidate, current] = process.argv.slice(2);
const PROM = process.env.PROMETHEUS_URL ?? "https://prometheus.example.com";

async function promValue(expr) {
  const res = await fetch(`${PROM}/api/v1/query?query=${encodeURIComponent(expr)}`);
  if (!res.ok) throw new Error(`Prometheus returned ${res.status}`);
  const { data } = await res.json();
  return data.result.length ? Number(data.result[0].value[1]) : NaN; // NaN fails every check
}

const sessions = (v) =>
  promValue(`sum(increase(taskflow_app_sessions_total{version="${v}"}[48h]))`);
const crashFree = (v) =>
  promValue(
    `1 - sum(increase(taskflow_app_crashed_sessions_total{version="${v}"}[48h]))` +
      ` / sum(increase(taskflow_app_sessions_total{version="${v}"}[48h]))`,
  );

const blockers = JSON.parse(
  execFileSync("gh", ["issue", "list", "--label", "release-blocker",
    "--milestone", candidate.split("-")[0], "--state", "open", "--json", "number,title"],
    { encoding: "utf8" }),
);
const [candSessions, candCrashFree, curCrashFree] = await Promise.all([
  sessions(candidate), crashFree(candidate), crashFree(current),
]);

const checks = [
  ["no open release blockers", blockers.length === 0, `${blockers.length} open`],
  ["at least 2,000 beta sessions", candSessions >= 2000, String(candSessions)],
  ["crash-free sessions within 0.1 pp of the current release",
    candCrashFree >= curCrashFree - 0.001,
    `${(candCrashFree * 100).toFixed(2)}% vs ${(curCrashFree * 100).toFixed(2)}%`],
];

for (const [name, ok, detail] of checks) {
  console.log(`${ok ? "GO   " : "NO-GO"}  ${name}: ${detail}`);
}
process.exit(checks.every(([, ok]) => ok) ? 0 : 1);
```

The metric names stand for whatever your crash reporting exports. The
important properties are that missing data counts as no-go (a `NaN`
comparison is always false), and that the output is pasted into the
release document, so the decision is recorded with its evidence.

## Best practices

- Pick a cadence and keep it; move features to the next train instead of
  moving the train.
- Hide unfinished work behind flags so the train can always leave.
- Cut release branches from `main`, accept only fixes, fix on `main`
  first, and cherry-pick with `-x`.
- Promote the last release candidate's build; never rebuild the final
  release.
- Ship hotfixes through the same pipeline with shorter stages, not
  around it.
- Write release notes for people and generate changelogs for tools.
- Publish which versions are supported, for how long, and which fixes
  each receives, and budget for the backports that implies.
- Deprecate with dates: announce, mark responses with `Deprecation`,
  `Sunset`, and a `Link`, measure usage per client, brown out, then
  remove.
- Decide go/no-go on agreed numbers, record them, and rotate the release
  captain role.

## In production

- **A fixed bug comes back in the next release.**
  *Detect:* a regression report for a bug closed weeks ago, right after a
  new train ships. *Cause:* the fix was made only on the release branch,
  not on `main`. *Fix:* re-apply it on `main`, add a check that every
  commit on a release branch references a `main` commit (the `-x` line),
  and make "fix on main first" part of the hotfix checklist.
- **The release slips every cycle.**
  *Detect:* the cut date moves for "one more feature"; releases grow and
  the stabilization period lengthens. *Cause:* features are not
  independently releasable, so the release waits for them. *Fix:* fix the
  cut date, put unfinished work behind flags, and let features ride the
  next train.
- **The final release behaves differently from the candidate testers
  approved.**
  *Detect:* different checksums or image digests for the RC and the
  release; issues that never appeared in beta. *Cause:* the release was
  rebuilt from the branch with newer dependencies or a different base
  image. *Fix:* tag and promote the candidate's artifacts; never rebuild a
  release.
- **A security fix takes weeks to reach older supported versions.**
  *Detect:* the fix ships on the current line but older lines stay
  vulnerable; backport pull requests pile up. *Cause:* old branches no
  longer build, or nobody owns them. *Fix:* keep CI green on every
  supported branch, automate backports, and reduce the number of
  supported lines to what you can actually maintain.
- **Customers break on the sunset date despite months of notice.**
  *Detect:* a burst of `410` responses and support tickets on the sunset
  day. *Cause:* notices went to documentation nobody read, and nobody
  measured usage per client. *Fix:* count usage by client, contact the
  heavy users directly, and run brownouts before the deadline.
- **Two hotfixes collide on the same release branch.**
  *Detect:* a patch release contains a half-tested second fix; the
  release notes do not match the change. *Cause:* several people
  cherry-picked into the branch without coordination. *Fix:* one release
  captain owns each branch's patch releases, and every backport goes
  through a reviewed pull request.

## Important terminology

- **Release train:** releases on a fixed schedule, carrying whatever is
  ready at the cut.
- **Cadence:** the interval between releases.
- **Cut (branch point):** the moment a release branch is created from
  `main`.
- **Stabilization:** the period in which only fixes enter the release
  branch.
- **Release candidate (RC):** a build that becomes the release if it
  passes go/no-go.
- **Go/no-go:** the recorded decision to ship a candidate, based on agreed
  criteria.
- **Cherry-pick:** applying one commit's change to another branch.
- **Backport:** a fix carried from `main` to an older supported branch.
- **Hotfix:** an urgent fix released outside the normal cadence.
- **LTS (long-term support):** a release line supported for a longer,
  published period.
- **Deprecation:** an announcement that something will be removed; it does
  not change behaviour.
- **Sunset:** the date after which a deprecated resource stops working.
- **Brownout:** a scheduled, temporary disablement that rehearses the
  sunset.
- **Release captain:** the person who runs a release cycle.

## Common mistakes and misconceptions

- Treating the train as a deadline to rush features into, instead of a
  schedule features can miss.
- Fixing bugs only on the release branch.
- Merging release branches back into `main`.
- Rebuilding the final release instead of promoting the tested candidate.
- Supporting every old version "just in case", with no end-of-life dates.
- Announcing a deprecation without measuring who still uses the API.
- Removing an endpoint on the sunset date without brownouts or contact
  with remaining users.
- Running go/no-go meetings on opinions rather than numbers.
- Confusing changelogs (for tools and developers) with release notes (for
  people).

## Revision questions

1. When is a release train a better choice than continuous deployment,
   and how do the two combine in one product?
2. With a two-week train, one week of stabilization, and a one-week
   rollout, what are the shortest, longest, and average times from merge
   to full rollout? (About 2, 4, and 3 weeks.)
3. State the rules for release branches and explain why fixes land on
   `main` first.
4. Walk through a hotfix for a bug present in 2.4.0 and in the LTS line
   2.3.
5. What do the `Deprecation`, `Sunset`, and `Link: rel="deprecation"`
   headers each communicate, and what ordering rule applies to their
   dates?
6. Why run brownouts before a sunset?
7. A product releases monthly and supports the current release plus the
   two previous ones for security. How many patch releases do 12 security
   fixes a year require? (36.)
8. Which criteria would you put in a go/no-go check for a mobile release,
   and where does each number come from?

## Further learning

- [Google SRE book: Release Engineering](https://sre.google/sre-book/release-engineering/)
- [Rust book: How Rust is made and nightly Rust](https://doc.rust-lang.org/book/appendix-07-nightly-rust.html)
- [Chromium: Release cycle](https://chromium.googlesource.com/chromium/src/+/HEAD/docs/process/release_cycle.md)
- [Kubernetes: Release cycle](https://kubernetes.io/releases/release/) and
  [deprecation policy](https://kubernetes.io/docs/reference/using-api/deprecation-policy/)
- [RFC 9745: The Deprecation HTTP response header field](https://www.rfc-editor.org/rfc/rfc9745.html)
- [RFC 8594: The Sunset HTTP header field](https://www.rfc-editor.org/rfc/rfc8594.html)
- [Node.js release schedule](https://github.com/nodejs/release)
- Next: [deploying microservices](deploying-microservices.md). Back to the [release engineering overview](../release-engineering.md).
