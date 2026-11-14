# Keeping Frontend and Backend in Sync

The frontend and backend of one product are built together but deployed
separately, and they run on different machines: the API in your cluster,
the web app in millions of browser tabs, the desktop and mobile apps on
devices you do not control. For some time after every deploy they
disagree about what the API looks like. That disagreement, **version
skew**, cannot be avoided; it can only be designed for.

This lesson covers why skew is unavoidable, the deploy order for breaking
changes, backward- and forward-compatible API changes, API versioning
strategies and GraphQL deprecation, single-page apps with long-open tabs
and chunk-load errors, "new version available" prompts, platform skew
protection, clients that send their version and servers that enforce a
minimum, feature flags that switch behaviour only when both sides are
ready, consumer-driven contract tests in CI, and support windows for
clients that update late or never.

## Why it matters

- **Skew happens on every deploy.** A rolling update of the TaskFlow API
  runs the old and the new version side by side for minutes, and the load
  balancer sends each request to either one. A web page that makes twenty
  requests during that window almost certainly talks to both.
- **Clients outlive deploys.** A tab opened yesterday still runs
  yesterday's JavaScript. Desktop and mobile apps update over weeks; some
  never do. The API serves every one of them.
- **Skew bugs are intermittent.** They hit only some users, only during or
  after a deploy, and disappear on reload, which makes them hard to
  reproduce and easy to dismiss as "flaky".
- **The failures are user-visible.** A `400` because a new client sent a
  field the old server rejects; a crash because an old app met an enum
  value it did not know; a blank screen because a lazy-loaded chunk was
  deleted. Each looks like a bug in the code, but is really a bug in the
  release process.

## Real-world usage

- **Vercel Skew Protection.** Vercel's
  [Skew Protection](https://vercel.com/docs/skew-protection) pins
  framework-managed requests (assets, client-side navigations, prefetches)
  to the deployment that served the page, through a `?dpl=` query
  parameter, an `x-deployment-id` header, or a `__vdpl` cookie depending
  on the framework. Full-page navigations always get the latest
  deployment. It is available on Pro and Enterprise plans, with a default
  maximum age of 12 hours on Pro and one day on Enterprise.
- **Version skew, explained.** Malte Ubl's article
  [Version skew](https://www.industrialempathy.com/posts/version-skew/)
  (2023) describes client/server, service-to-service, configuration, and
  feature-flag skew, and the strategies against it: version locking,
  backward and forward compatibility, explicit versioning, and evaluating
  a flag in one place and passing the result as an argument. It states
  the core rule bluntly: servers must never introduce new required fields
  until they know all clients are updated.
- **Kubernetes.** The
  [Kubernetes version skew policy](https://kubernetes.io/releases/version-skew-policy/)
  is a written skew contract: `kubelet` must not be newer than
  `kube-apiserver` and may be up to three minor versions older, and the
  API server is always upgraded first. Servers first, clients later, with
  a stated window.
- **GitHub's REST API.** GitHub's
  [API versions](https://docs.github.com/en/rest/about-the-rest-api/api-versions)
  page describes date-named versions selected with the
  `X-GitHub-Api-Version` header, a default for requests without it,
  additive changes made available in all supported versions, and at least
  24 months of support for the previous version after a new one ships.
- **Pact.** The Pact Broker's
  [can-i-deploy](https://docs.pact.io/pact_broker/can_i_deploy) command
  checks whether the version you are about to deploy has passed contract
  verification against the versions already in the target environment,
  and exits non-zero if not.

**Popular tools and providers:** Vercel Skew Protection, Pact and the Pact
Broker, OpenAPI diff tools such as oasdiff, GraphQL schema checks,
feature flag services and OpenFeature, Workbox for service workers, and
the `semver` package for version comparisons.

## How it works

### Version skew: why it is unavoidable

During a rolling update every combination of old and new happens at once:

![Diagram: on the left, five bars show 10 API pods during a rolling update, with 0, 3, 6, 9, and 10 pods on the new version at t+0, t+1.5, t+3, t+4.5, and t+6 minutes, and a bracket under the middle three bars marks the skew window in which both versions serve; at 50% new pods, 20 requests from one page all reach the same version with probability 2 x 0.5^20, about 0.0002%. On the right, a matrix shows an old web build calling API 2.4.0 and a new build calling 2.4.1 working because the versions match, an old build calling 2.4.1 needing backward compatibility (the new server accepts old request shapes), and a new build calling 2.4.0 needing forward compatibility (the new client must not rely on the new server yet); a note says old tabs, installed apps, and scripts keep calling the new server for hours, months, or forever.](skew-window-rolling-deploy.svg)

Work through the numbers for TaskFlow: 10 API pods, `maxSurge: 3`, and
`maxUnavailable: 0` replace pods in about four rounds; if a new pod needs
75 seconds to become ready, the window lasts around five minutes. At the
halfway point the chance that 20 requests from one page all reach the
same version is `2 x 0.5^20`, about two in a million. So "a client talks
to one version" is false for every active session during every deploy.

Deploying frontend and backend "at the same time" does not remove the
window; it only hides it. Even an atomic switch of the web bundle leaves
every already-open tab on the old bundle.

### Compatibility in both directions

- **Backward compatible server:** a new API version works with old
  clients. It accepts every request shape a supported client sends and
  keeps every response field a supported client reads.
- **Forward compatible client:** an old client keeps working when the
  server changes underneath it. It ignores unknown fields, treats unknown
  enum values as a safe default, and never assumes the response has
  exactly the fields it knows.
- **New client, old server:** a new client must not depend on a server
  capability until that capability is deployed everywhere. Deploy order or
  a feature flag guarantees this.

Changes that look additive can still break readers:

| Change | Breaks | Why |
|---|---|---|
| New enum value (`status: "blocked"`) | Old clients with exhaustive `switch` statements or strict schema validation | They have no branch for the value; always ship a default branch |
| New required request field | Old clients | They never send it; add it as optional with a server default |
| Tightened validation (shorter max length) | Old clients that send what used to be valid | Validation is part of the contract |
| Field repurposed (`amount` from cents to dollars) | Everyone silently | Same name, new meaning; add a new field instead |
| New field in the response | Clients that reject unknown fields | A tolerant reader ignores it; a strict one fails |
| Changed default sort or page size | Clients that relied on the old default | Defaults are behaviour, not documentation |

The full list of additive and breaking changes is in the backend lesson
on [API design best practices](../../03-backend-development/backend-concepts/api-design-best-practices.md).
The release-engineering rule on top of it: **never repurpose; add, move
everyone, then remove**.

### Deploy order for a breaking change

A breaking change ships as a sequence of compatible changes, the same
expand-and-contract pattern used for
[zero-downtime database migrations](../deployment-strategies/zero-downtime-database-migrations.md):

![Diagram: renaming dueDate to due in five columns: before, every client sends dueDate; deploy 1 expands the API on day 0 so it accepts both shapes and returns both fields; deploy 2 switches clients from day 1, the web app sending and reading due and a new app build using due while old builds remain; then a wait for the support window in which the API counts requests using dueDate, old tabs are asked to reload, and the minimum app version is raised past the last build that sends dueDate until usage has been 0% for 14 days; deploy 3 contracts the API around day 60 to due only. A warning says the wrong order breaks every request in the gap.](breaking-change-deploy-order.svg)

1. **Expand the server.** Deploy an API that accepts both the old and the
   new request shape and returns both the old and the new field. Nothing
   changes for clients yet.
2. **Switch the clients.** Deploy the web app that uses the new field.
   Release new desktop and mobile builds that use it.
3. **Wait, and measure.** Count requests that still use the old shape, by
   client platform and version. Old tabs reload, old app versions decline
   as users update, and the minimum supported version is raised past the
   last build that used the old field.
4. **Contract the server.** When usage has been zero for long enough (and
   any announced sunset date has passed), remove the old field.

Reversing steps 1 and 2 breaks every new client that hits an old pod;
contracting before the wait breaks every old client still in use. The
rule in one sentence: servers learn new things before clients use them,
and forget old things only after no client does.

### API versioning strategies

When a change cannot be made compatibly, or when clients you do not
control need years of stability, version the API explicitly. The
backend lesson compares the strategies' basic mechanics; the release
trade-offs look like this:

| Strategy | Example | Release and operations trade-offs |
|---|---|---|
| Path | `/v1/tasks`, `/v2/tasks` | Easy to route, log, and cache per version; versions the whole API at once, so v2 often bundles unrelated changes |
| Header (dated or numbered) | `X-GitHub-Api-Version: 2022-11-28`, `TaskFlow-Version: 2026-11-01` | One URL per resource; fine-grained versions per change; caches must `Vary` on the header; easy for clients to forget |
| Media type | `Accept: application/vnd.taskflow.v2+json` | Per-resource versions within HTTP content negotiation; awkward for many client libraries and tools |
| Account pinning | The version stored on the account at first use (Stripe) | Clients never break by default; the server must transform responses for every supported version |
| No versions (evolve in place) | GraphQL schema evolution | Works when every change is additive and usage is measured per field |

Whichever you choose, the cost is the number of versions you serve at
once, so each version needs a usage metric, an owner, and a sunset plan.
Serving several versions from one codebase with response transforms is
shown in
[advanced deployment patterns](../deployment-strategies/advanced-deployment-patterns.md);
deprecation and sunset policies are covered in
[release trains and release management](release-trains-and-release-management.md).

### GraphQL: evolve instead of versioning

The GraphQL project's
[schema design guidance](https://graphql.org/learn/schema-design/) says
GraphQL "takes a strong opinion on avoiding versioning": because clients
request exactly the fields they use, new fields and types do not affect
existing queries. Removal works through deprecation:

```text
# schema.graphql (excerpt)
type Task {
  id: ID!
  title: String!
  dueDate: String @deprecated(reason: "Use due. Removed after 2027-03-31.")
  due: Due
}
```

Tools and clients surface the deprecation, and because a GraphQL server
can record which fields each operation selects, you know exactly which
clients (and which client versions) still read `dueDate`. Remove the
field when that number reaches zero. The trap is the same as with REST:
mobile apps carry their queries for years, so "zero" must include
installed versions, not just the latest web build.

### Single-page apps: long-open tabs and chunk-load errors

A single-page app is a client that updates only when the user loads a
new `index.html`. The failure modes:

- **Stale code against a new API.** A tab opened before the deploy keeps
  calling the API with old request shapes. That is the old-client row of
  the skew matrix, and backward compatibility handles it.
- **Missing chunks.** The old `index.html` references route chunks by
  hashed file name, such as `TaskBoard-Cm3fQ1sE.js`. If a deploy deletes
  old files, the next lazy navigation in an old tab fails. Vite's
  troubleshooting guide lists version skew as a cause of "Failed to fetch
  dynamically imported module" (the message Chromium-based browsers
  show), and webpack-based apps throw an error named `ChunkLoadError`.
- **Mixed versions after a partial reload.** A service worker or a cached
  `index.html` can combine old HTML with new assets or the reverse.

The defenses, in order of importance:

1. **Keep old assets for days.** Upload new hashed files beside the old
   ones and delete old releases later (the upload order is in
   [deploying frontends and static sites](../deployment-strategies/deploying-frontends-and-static-sites.md)).
2. **Serve `index.html` and `version.json` with `Cache-Control: no-cache`**
   so a reload always gets the current build.
3. **Recover from a missing chunk** by reloading once, with a guard
   against reload loops (examples below and in the frontend lesson).
4. **Tell long-open tabs that a new version exists**, and move them to it
   at a safe moment.
5. **Pin the session to its deployment** where the platform supports it.

### "New version available" prompts

A tab can learn about a new build in three ways:

| Signal | How | Trade-off |
|---|---|---|
| Polling `version.json` | Fetch it with `cache: "no-store"` every few minutes and when the tab becomes visible | Simple and host-independent; a small request per tab per interval |
| A response header | The API returns `X-App-Version` or a web build ID header; the client compares it with its own | No extra requests; requires the API to know the current web build, and CORS must expose the header |
| Service worker update | The browser checks the worker script on navigation; `updatefound` and a waiting worker signal a new build | Built into PWAs; the lifecycle has its own rules (see [update mechanisms and updaters](update-mechanisms-and-updaters.md)) |

What to do when a new version is detected:

- **Prompt:** show a non-blocking "A new version of TaskFlow is
  available. Reload" banner. The user chooses the moment.
- **Reload on the next navigation:** instead of a client-side route change,
  do a full page load to the destination URL. The user loses no work
  because they were leaving the page anyway.
- **Force a reload** only when the old client is known to be broken
  against the current API, and preserve unsaved input first.

Compare build IDs for inequality, not "greater than": after a rollback the
deployed build is older than the tab's, and the tab should move to it too.

### Platform skew protection

Some platforms remove the window for framework-managed requests by
routing each request to the deployment that served the page. On Vercel,
once Skew Protection is enabled (it is on by default for projects
created after November 19, 2024 with supported frameworks), requests for
assets and data from an open page carry the deployment ID and are served
by that deployment, until the deployment is older than the configured
maximum age. Three limits matter in practice:

- **Full-page navigations are not pinned.** A hard refresh loads the
  latest deployment, which is what you want.
- **Only some requests are pinned.** With Next.js and Astro, your own
  `fetch()` calls carry no deployment ID unless you add it; frameworks
  that use the `__vdpl` cookie pin those too.
- **The window is bounded.** With the 12-hour default on Pro, a dashboard
  left open over a weekend falls back to the latest deployment. Raise the
  maximum age for long-lived pages, or combine pinning with a reload
  prompt.

Platform pinning protects the web app's calls to its own deployment. It
does not help a separately deployed API, installed apps, or other
services, so the API still has to be backward compatible.

### Clients send their version; servers enforce a minimum

Every client sends who it is on every request, for example
`X-Client-Platform: desktop` and `X-Client-Version: 1.9.1` (the desktop
and mobile lesson introduces these headers and a basic check). With that
information the API can measure the version distribution, target flags,
and enforce a floor:

![Diagram: a request from desktop 1.5.2 with X-Client-Platform and X-Client-Version headers passes three decisions: an exempt path such as /client-config is served normally so the update screen can load; a version below the minimum 1.6.0 gets 426 Upgrade Required with error client_update_required and minVersion 1.6.0, and the app shows a blocking update screen with a store or installer link; a version below the recommended 1.9.0 is served normally with an X-Client-Update: recommended header, and the app shows a dismissible banner; anything else is served normally. A side note says unknown or missing versions are logged and served, never blocked.](min-version-gate.svg)

Design points that are easy to miss:

- **Two thresholds.** A *recommended* version produces a soft prompt; a
  *minimum* version blocks. Most of the time only the soft prompt moves.
- **Configuration, not code.** The thresholds live in a config document
  the API reloads, so raising the floor in an emergency needs no deploy.
- **Exempt paths.** The update screen may need configuration, links, or a
  token refresh; those endpoints must keep working for blocked clients.
- **A stable error.** RFC 9110 defines `426 Upgrade Required` for protocol
  upgrades and has the server name the required protocol in an `Upgrade`
  header, so some APIs prefer a `400`-class status for app versions. Both
  work if the status and a machine-readable error code are documented and
  understood by every client version from the first one onwards.
- **Never block the unknown.** Requests without a parsable version (old
  scripts, `curl`, partners) are logged, not rejected.
- **CORS.** For a browser client on another origin, the custom request
  headers must be listed in `Access-Control-Allow-Headers`, and JavaScript
  can read `X-App-Version` or `X-Client-Update` only if the server lists
  them in `Access-Control-Expose-Headers`. See
  [CORS](../../03-backend-development/backend-concepts/cors.md).

### Feature flags: switch when both sides are ready

Deploy order solves "server first"; flags solve "turn it on only when
every participant can handle it":

- **Server capability flags.** Ship client code that uses a new endpoint
  behind a flag; turn the flag on after the endpoint is deployed in every
  region.
- **Version-targeted flags.** Enable a server behaviour, such as returning
  the new `blocked` status, only for clients whose version is at least
  the first one that understands it. Older clients keep the old
  behaviour without an API version bump.
- **Evaluate once, pass the decision.** If the client and the server both
  evaluate the same flag, they can disagree for a moment while the flag
  changes. Evaluate it in one place and send the result with the request
  (Ubl's "arguments over flags").

Flag mechanics, targeting, and clean-up are covered in
[feature flags and progressive delivery](../deployment-strategies/feature-flags-and-progressive-delivery.md).

### Consumer-driven contract testing in CI

Integration tests prove that *this* frontend works with *this* backend.
Skew safety needs more: the new backend must work with every client
version still in use. Consumer-driven contracts (the pattern Ian
Robinson described in
[Consumer-Driven Contracts](https://martinfowler.com/articles/consumerDrivenContracts.html))
make that checkable:

1. Each consumer (TaskFlow Web, the desktop app, the mobile apps) records
   in a contract the requests it makes and the response fields it
   actually uses. With Pact, its unit tests run against a mock provider
   and write a pact file.
2. CI publishes the pact to a broker, tagged with the consumer's version
   (the commit SHA) and branch.
3. The provider's pipeline replays every relevant pact against the real
   API. The recommended selection is the consumers' main branch plus
   every version that is *deployed or released*: web builds recorded with
   `record-deployment` and store versions recorded with `record-release`,
   which stay in the set until their support ends.
4. Before any deploy, `can-i-deploy` asks the broker whether the version
   is verified against everything already in the target environment.
5. After the deploy, `record-deployment` (or `record-release`) updates the
   broker's view of what is running.

The contract tells the provider which fields are safe to remove: if no
supported consumer's pact mentions `dueDate`, the contract step is safe.
If the desktop 1.6 pact still does, removing it fails the provider's
build, long before production.

### Clients that update late or never

Web clients converge within hours or days; installed clients follow a
decay curve. If 25% of the remaining users of an old version update each
week, the share left after `n` weeks is `0.75^n`:

```text
weeks to fall below 2%:  n >= ln(0.02) / ln(0.75) = 3.91 / 0.288 = 13.6, so 14 weeks
0.75^13 = 2.4%   0.75^14 = 1.8%
```

So a support window shorter than about three months forces many users
to update, and a window of a few weeks is only realistic with in-app
update prompts. Write the policy down, the way Kubernetes does:

- **What is supported:** for example "the latest four desktop releases or
  six months, whichever is longer".
- **How deprecation is announced:** in-app banner, release notes, email
  for business customers, then a dated minimum version.
- **What protects old clients:** contract tests for every supported
  version, and usage dashboards by platform and version.
- **What happens at the end:** the floor rises and the oldest builds get
  the blocking update screen, which they understand because it has been
  part of the protocol since the first release.

## When to use and when not to use

| Situation | Use | Skip or simplify |
|---|---|---|
| Internal API whose only client is your own web app | Expand and contract within one version; keep old assets; reload prompts | Formal API versions |
| Public or partner API | Explicit versions (path or dated header), usage metrics, deprecation and sunset dates | Silent breaking changes "because nobody uses that field" |
| Mobile and desktop clients | Version headers, a minimum and a recommended version, contract tests for every supported release | Forcing updates as a routine tool |
| SPA on a platform with skew protection | Enable it, raise the maximum age for long-lived pages, still keep the API compatible | Relying on it for a separately deployed API |
| SPA on your own CDN | Keep old assets for days, `no-cache` HTML, chunk reload guard, version polling | Deleting old files on every deploy |
| Several teams' services and clients | Pact or schema checks in CI, `can-i-deploy` before deploys | Manual cross-team release checklists |
| Prototype with one developer | Deploy API first, then web; reload on chunk errors | Contract tooling |

## Practical examples

### Expand and contract a field in Express

```js
// src/routes/tasks.js (excerpt): phase 1, expand. Accept both shapes, return both.
import { Router } from "express";
import client from "prom-client";
import { Task } from "../models/task.js";

export const tasks = Router();

const legacyDueDate = new client.Counter({
  name: "taskflow_legacy_due_date_requests_total",
  help: "Requests that still send the deprecated dueDate field",
  labelNames: ["platform", "version"], // bounded: a few dozen client versions
});

function readDue(req) {
  if (req.body.due) return req.body.due;                    // new clients
  if (typeof req.body.dueDate === "string") {               // old clients
    legacyDueDate.inc({
      platform: req.get("X-Client-Platform") ?? "unknown",
      version: req.get("X-Client-Version") ?? "unknown",
    });
    return { date: req.body.dueDate, timezone: "UTC" };
  }
  return null;
}

function toResponse(task) {
  return {
    id: task.id,
    title: task.title,
    due: task.due,                    // new field
    dueDate: task.due?.date ?? null,  // old field: removed in the contract phase
  };
}

tasks.patch("/:id", async (req, res) => {
  const task = await Task.findById(req.params.id);
  if (!task) return res.status(404).json({ error: "not_found" });
  const due = readDue(req);
  if (due) task.due = due;
  await task.save();
  res.json(toResponse(task));
});
```

The counter is the go/no-go signal for the contract phase: when
`sum(increase(taskflow_legacy_due_date_requests_total[14d]))` is zero and
the minimum supported versions all use `due`, phase 3 deletes `readDue`'s
second branch and the `dueDate` response field.

### A version check and update prompt in TaskFlow Web

```js
// src/hooks/useNewVersion.js: is a different build deployed than the one running?
import { useEffect, useState } from "react";

const RUNNING = __APP_VERSION__;           // injected at build time by vite.config.js
const CHECK_EVERY_MS = 10 * 60 * 1000;

export function useNewVersion() {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    let stopped = false;
    async function check() {
      try {
        const res = await fetch("/version.json", { cache: "no-store" });
        const { version } = await res.json();
        // Inequality, not "greater than": a rollback must move tabs too
        if (!stopped && version !== RUNNING) setAvailable(true);
      } catch {
        // offline or mid-deploy: try again on the next tick
      }
    }
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    check();
    const timer = setInterval(check, CHECK_EVERY_MS);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return available;
}
```

```js
// src/components/UpdateBanner.jsx: prompt, and reload on the next navigation
import { useEffect } from "react";
import { useNewVersion } from "../hooks/useNewVersion.js";

export function UpdateBanner() {
  const available = useNewVersion();

  useEffect(() => {
    if (!available) return;
    // Turn the next in-app link click into a full page load of the new build
    const onClick = (event) => {
      const link = event.target.closest("a[href^='/']");
      const newTab = event.metaKey || event.ctrlKey || event.shiftKey;
      if (!link || event.defaultPrevented || event.button !== 0 || newTab) return;
      event.preventDefault();
      window.location.assign(link.href);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [available]);

  if (!available) return null;
  return (
    <div role="status" className="update-banner">
      A new version of TaskFlow is available.{" "}
      <button onClick={() => window.location.reload()}>Reload</button>
    </div>
  );
}
```

The capture-phase click listener runs before the router's own handler,
so the user's next navigation lands on the new build without losing
anything they were typing on the current page.

### Recover from a missing lazy chunk

```js
// src/lib/lazy-with-reload.js: one guarded reload when an old chunk is gone
import { lazy } from "react";

const KEY = "taskflow:chunk-reload-at";

export function lazyWithReload(load) {
  return lazy(async () => {
    try {
      return await load();
    } catch (error) {
      const last = Number(sessionStorage.getItem(KEY) ?? 0);
      if (Date.now() - last > 60_000) {       // at most one reload per minute
        sessionStorage.setItem(KEY, String(Date.now()));
        window.location.reload();
        return new Promise(() => {});          // keep Suspense waiting during the reload
      }
      throw error;                             // second failure: show the error boundary
    }
  });
}

// const TaskBoard = lazyWithReload(() => import("./pages/TaskBoard.jsx"));
```

This works the same way for Vite and webpack builds because it wraps the
dynamic import itself; the `vite:preloadError` listener shown in the
frontend lesson covers preloaded dependencies. Both are last resorts:
the real fix is keeping old chunks available.

### A client version policy that changes without a deploy

```js
// src/middleware/client-version-policy.js
import semver from "semver";

// Reloaded from a config document every minute (startup code not shown),
// so the floor can move in an emergency without a deploy.
let policy = {
  desktop: { min: "1.6.0", recommended: "1.9.0" },
  ios: { min: "3.0.0", recommended: "3.2.0" },
  android: { min: "3.0.0", recommended: "3.2.0" },
};
export const setClientPolicy = (next) => { policy = next; };

const EXEMPT = new Set(["/client-config", "/auth/refresh"]);

export function clientVersionPolicy(req, res, next) {
  const platform = req.get("X-Client-Platform");
  const version = semver.valid(req.get("X-Client-Version"));
  const rule = policy[platform];
  if (!rule || !version) return next();                 // unknown clients: never block

  if (semver.lt(version, rule.min) && !EXEMPT.has(req.path)) {
    return res.status(426).json({
      error: "client_update_required",
      message: "This version of TaskFlow is no longer supported. Please update.",
      minVersion: rule.min,
    });
  }
  if (semver.lt(version, rule.recommended)) {
    res.set("X-Client-Update", "recommended");
  }
  next();
}
```

```js
// src/app.js (excerpt): CORS must allow the request headers and expose the response ones
import cors from "cors";
import { clientVersionPolicy } from "./middleware/client-version-policy.js";

app.use(cors({
  origin: ["https://app.example.com"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Client-Platform", "X-Client-Version"],
  exposedHeaders: ["X-App-Version", "X-Client-Update"],
}));
app.use(clientVersionPolicy);
```

```js
// src/api/client.js: the one fetch wrapper every screen uses
export class UpdateRequiredError extends Error {
  constructor(minVersion) {
    super(`Update required: minimum version ${minVersion}`);
    this.minVersion = minVersion;
  }
}

export async function api(path, options = {}) {
  const res = await fetch(`https://api.example.com${path}`, {
    ...options,
    headers: {
      ...options.headers,
      "X-Client-Platform": "desktop",
      "X-Client-Version": __APP_VERSION__,
    },
  });
  if (res.headers.get("X-Client-Update") === "recommended") {
    window.dispatchEvent(new Event("taskflow:update-recommended"));   // soft banner
  }
  if (res.status === 426) {
    const body = await res.json().catch(() => ({}));
    if (body.error === "client_update_required") {
      window.dispatchEvent(new CustomEvent("taskflow:update-required", { detail: body }));
      throw new UpdateRequiredError(body.minVersion);                 // blocking screen
    }
  }
  return res;
}
```

The client handles both signals from its very first release, so years
later the server can still tell the oldest builds to update in a way
they understand.

### Contract tests with Pact in both pipelines

```js
// tests/contract/tasks.pact.test.js: TaskFlow Web (consumer)
import path from "node:path";
import { describe, it, expect } from "vitest";
import { Pact, Matchers, SpecificationVersion } from "@pact-foundation/pact";
import { getTask } from "../../src/api/tasks.js";

const { like } = Matchers;

const provider = new Pact({
  dir: path.resolve(process.cwd(), "pacts"),
  consumer: "taskflow-web",
  provider: "taskflow-api",
  spec: SpecificationVersion.SPECIFICATION_VERSION_V4,
});

describe("GET /v2/tasks/:id", () => {
  it("returns the fields the task board renders", async () => {
    await provider
      .addInteraction()
      .given("task 42 exists")
      .uponReceiving("a request for task 42")
      .withRequest("GET", "/v2/tasks/42", (builder) => {
        builder.headers({ Accept: "application/json" });
      })
      .willRespondWith(200, (builder) => {
        builder.headers({ "Content-Type": "application/json" });
        builder.jsonBody({
          id: like("42"),
          title: like("Write release notes"),
          due: { date: like("2026-11-20"), timezone: like("UTC") },
        });
      })
      .executeTest(async (mockserver) => {
        const task = await getTask("42", { baseUrl: mockserver.url });
        expect(task.due.date).toBe("2026-11-20");
      });
  });
});
```

The pact lists only the fields the web app reads (`id`, `title`, `due`),
not `dueDate`, which is exactly what tells the API team that removing
`dueDate` will not break this consumer.

```yaml
# .github/workflows/web-release.yml (TaskFlow Web)
name: web-release
on:
  push:
    branches: [main]
  pull_request:

permissions:
  contents: read

env:
  PACT_BROKER_BASE_URL: https://pact-broker.example.com
  PACT_CLI: pactfoundation/pact-cli:latest   # pin a tag you have tested

jobs:
  contract:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
        with:
          persist-credentials: false
      - uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npx vitest run tests/contract     # writes pacts/taskflow-web-taskflow-api.json
      - name: Publish the pact for this commit
        env:
          PACT_BROKER_TOKEN: ${{ secrets.PACT_BROKER_TOKEN }}
        run: |
          docker run --rm -w "$PWD" -v "$PWD:$PWD" \
            -e PACT_BROKER_BASE_URL -e PACT_BROKER_TOKEN \
            "$PACT_CLI" publish "$PWD/pacts" \
            --consumer-app-version "$GITHUB_SHA" \
            --branch "${GITHUB_HEAD_REF:-$GITHUB_REF_NAME}"

  deploy:
    if: github.ref == 'refs/heads/main'
    needs: contract
    runs-on: ubuntu-latest
    environment: production
    env:
      PACT_BROKER_TOKEN: ${{ secrets.PACT_BROKER_TOKEN }}
    steps:
      - uses: actions/checkout@v7
        with:
          persist-credentials: false
      - name: Can this build talk to the API versions in production?
        run: |
          docker run --rm -e PACT_BROKER_BASE_URL -e PACT_BROKER_TOKEN "$PACT_CLI" \
            pact-broker can-i-deploy --pacticipant taskflow-web \
            --version "$GITHUB_SHA" --to-environment production \
            --retry-while-unknown 10 --retry-interval 30
      - run: ./scripts/deploy-web.sh             # build and upload, as in the frontend lesson
      - name: Record the deployment
        run: |
          docker run --rm -e PACT_BROKER_BASE_URL -e PACT_BROKER_TOKEN "$PACT_CLI" \
            pact-broker record-deployment --pacticipant taskflow-web \
            --version "$GITHUB_SHA" --environment production
```

```js
// tests/contract/verify.pact.test.js: TaskFlow API (provider)
import { describe, it } from "vitest";
import { Verifier } from "@pact-foundation/pact";
import { startTestServer, seedTask } from "../helpers.js";

describe("pacts from every supported consumer version", () => {
  it("are honoured by this API build", async () => {
    const server = await startTestServer();             // the real app, test database
    try {
      await new Verifier({
        provider: "taskflow-api",
        providerBaseUrl: server.url,
        pactBrokerUrl: process.env.PACT_BROKER_BASE_URL,
        pactBrokerToken: process.env.PACT_BROKER_TOKEN,
        consumerVersionSelectors: [{ mainBranch: true }, { deployedOrReleased: true }],
        providerVersion: process.env.GITHUB_SHA,
        providerVersionBranch: process.env.GITHUB_REF_NAME,
        publishVerificationResult: process.env.CI === "true",
        stateHandlers: { "task 42 exists": () => seedTask({ id: "42" }) },
      }).verifyProvider();
    } finally {
      await server.close();
    }
  }, 120_000);
});
```

`deployedOrReleased` is what protects old installed apps: each mobile and
desktop version recorded with `record-release` stays in the verification
set until `record-support-ended` removes it, so the API cannot drop a
field that a supported app version still reads.

## Best practices

- Assume every interface runs in two versions at once, and design each
  change so both directions of the skew matrix work.
- Ship breaking changes as expand, switch clients, wait and measure,
  contract; never repurpose a field.
- Make clients tolerant readers from their first release: ignore unknown
  fields, default unknown enum values, and handle the update-required
  error.
- Send the client platform and version on every request, and keep
  minimum and recommended versions in configuration.
- Keep old web assets for days, serve HTML and `version.json` with
  `no-cache`, and recover from missing chunks with a guarded reload.
- Prompt long-open tabs to reload, and compare builds for inequality so
  rollbacks propagate.
- Run consumer-driven contract tests against every deployed or released
  consumer version, and gate deploys with `can-i-deploy`.
- Publish a written support window and deprecation process for installed
  clients, and watch the version distribution before raising the floor.

## In production

- **A burst of `400` errors during every deploy.**
  *Detect:* errors appear only while a rollout is in progress, mostly
  from the newest web build, with validation messages about an unknown
  field. *Cause:* the web app shipped a new request field before the API
  accepted it everywhere, so new clients hit old pods. *Fix:* deploy the
  API (expand) first, gate the client code behind a flag until the API
  rollout completes, and add a pipeline rule that client releases wait
  for the server change.
- **`ChunkLoadError` or "Failed to fetch dynamically imported module"
  spikes after deploys.**
  *Detect:* the error tracker shows the spike starting at the deploy time,
  only for sessions that began before it. *Cause:* the deploy deleted the
  previous build's hashed chunks. *Fix:* keep old assets for days, add the
  guarded reload, and add the new-version prompt.
- **An old desktop build crashes after an API deploy.**
  *Detect:* crash reports from one or two old versions start at the API
  deploy; newer versions are fine. *Cause:* a new enum value or a removed
  field that an old client's strict parsing could not handle. *Fix:* roll
  the API back or gate the value by client version, then add contract
  tests for every supported release and a default branch in clients.
- **The update banner never appears for the web app.**
  *Detect:* `X-Client-Update` is visible in the network panel, but
  `res.headers.get()` returns `null`. *Cause:* the API is on another
  origin and does not list the header in `Access-Control-Expose-Headers`.
  *Fix:* expose the headers in the CORS configuration and test it from the
  real origin.
- **Raising the minimum version strands users on a blank screen.**
  *Detect:* support tickets from old versions, and `426` responses on the
  endpoint that loads the update screen's links. *Cause:* the gate covered
  every path, including the configuration the update screen needs. *Fix:*
  exempt those paths, and test the update flow with the oldest supported
  build before every floor change.
- **`can-i-deploy` blocks every deploy with "unknown".**
  *Detect:* the step retries and fails; the broker shows no verification
  for the provider version in production. *Cause:* the provider pipeline
  never published verification results, or deployments were never
  recorded. *Fix:* publish verification results from CI and run
  `record-deployment` (or `record-release`) after every deploy.
- **A long-open dashboard breaks the morning after a deploy despite skew
  protection.**
  *Detect:* errors come from sessions older than 12 hours. *Cause:* the
  deployment aged out of the skew protection window, so the page's
  requests went to the latest deployment. *Fix:* raise the maximum age for
  such projects and add a reload prompt for long-lived pages.

## Important terminology

- **Version skew:** two or more interdependent components running
  different versions at the same time.
- **Skew window:** the period during which both the old and the new
  version serve traffic.
- **Backward compatibility:** a newer server works with older clients.
- **Forward compatibility:** an older client keeps working with a newer
  server.
- **Tolerant reader:** a client that ignores unknown fields and handles
  unknown values.
- **Expand and contract:** add the new form beside the old, migrate every
  user, then remove the old form.
- **Version locking (skew protection):** routing a client's requests to
  the exact deployment that served it.
- **Minimum supported version:** the oldest client version the server
  still serves.
- **Consumer-driven contract:** a test artifact in which a consumer
  records the requests it makes and the fields it uses, verified against
  the provider.
- **Support window:** how long a released client version is guaranteed to
  keep working.

## Common mistakes and misconceptions

- Believing that deploying frontend and backend together removes skew.
- Repurposing a field or making an optional field required in one step.
- Deleting old web assets on every deploy.
- Comparing build IDs with "greater than", so rollbacks never reach open
  tabs.
- Relying on platform skew protection for an API deployed elsewhere.
- Blocking requests with a missing or unparsable version header.
- Hard-coding the minimum version in a client release, so it can never
  move.
- Testing the API only against the latest client instead of every
  supported version.
- Forgetting CORS: custom headers that are neither allowed nor exposed.

## Revision questions

1. Why does a rolling deploy guarantee version skew even if the frontend
   and backend are released "at the same time"?
2. For each quadrant of the old/new client and server matrix, say what
   must be true for requests to succeed.
3. List the deploy steps for renaming `dueDate` to `due`, and explain what
   breaks if you swap the first two.
4. Give three changes that look additive but break old clients.
5. Compare path, header, and media-type API versioning from an operations
   point of view.
6. A tab opened yesterday fails on a lazy route. What happened, and which
   four defenses would you put in place?
7. If 25% of users on an old app version update each week, how many weeks
   until fewer than 2% remain? (`0.75^n < 0.02`, so 14 weeks.)
8. How do `record-release` and the `deployedOrReleased` selector protect
   installed apps from an API change?

## Further learning

- [Malte Ubl: Version skew](https://www.industrialempathy.com/posts/version-skew/)
- [Vercel: Skew Protection](https://vercel.com/docs/skew-protection)
- [Kubernetes version skew policy](https://kubernetes.io/releases/version-skew-policy/)
- [GitHub REST API versions](https://docs.github.com/en/rest/about-the-rest-api/api-versions)
- [Vite: Building for production (load error handling)](https://vite.dev/guide/build)
- [Pact: can-i-deploy](https://docs.pact.io/pact_broker/can_i_deploy) and
  [consumer version selectors](https://docs.pact.io/pact_broker/advanced_topics/consumer_version_selectors)
- [GraphQL: Schema design](https://graphql.org/learn/schema-design/)
- Next: [update mechanisms and updaters](update-mechanisms-and-updaters.md). Back to the [release engineering overview](../release-engineering.md).
