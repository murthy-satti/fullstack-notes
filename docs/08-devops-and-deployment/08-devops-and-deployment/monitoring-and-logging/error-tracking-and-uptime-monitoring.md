# Error Tracking and Uptime Monitoring

Metrics say the error rate rose; logs hold the details of individual
requests. Two more tools complete the picture. **Error tracking** captures
every unhandled exception, in the API and in users' browsers, groups
thousands of identical failures into one issue with a readable stack trace,
the release that introduced it, and how many users it hit. **Uptime and
synthetic monitoring** test the service from the outside, the way users
reach it, through DNS, TLS, CDNs, and load balancers. This lesson covers
both, plus frontend real-user monitoring with Core Web Vitals, health
endpoints (`/healthz` liveness compared with `/readyz` readiness), and
status pages.

## Why it matters

Many failures never show up as server-side 5xx responses. A JavaScript
error in TaskFlow Web's task editor makes the Save button do nothing: the
API never receives the request, so no server metric moves. An expired
certificate or a broken DNS record stops every user before they reach your
infrastructure, so internal dashboards stay green. A crashed process that
the orchestrator keeps restarting may look "up" most of the time.

Error trackers turn scattered exceptions into a prioritized list tied to
releases, so you notice a bad deploy from the first few users instead of
the first support ticket. Outside-in checks are the only way to see what
users see when the problem is between them and your code. Health
endpoints, done right, let load balancers and orchestrators route traffic
away from broken instances automatically; done wrong, they cause cascading
restarts.

## Real-world usage

- **Sentry (issue grouping).** Sentry's documentation on
  [issue grouping](https://docs.sentry.io/concepts/data-management/event-grouping/)
  explains how events are fingerprinted, primarily by stack trace, and
  grouped into issues, and how to customize fingerprints when the default
  grouping is too coarse or too fine.
- **Google web.dev (Core Web Vitals).** The
  [Web Vitals](https://web.dev/articles/vitals) guide defines the current
  Core Web Vitals (Largest Contentful Paint, Interaction to Next Paint, and
  Cumulative Layout Shift), their "good" thresholds, and the
  recommendation to evaluate them at the 75th percentile of page loads.
- **Kubernetes (probes).** The guide
  [Configure Liveness, Readiness and Startup Probes](https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/)
  explains that a failed liveness probe restarts a container while a
  failed readiness probe only removes the pod from Service endpoints, and
  warns that liveness probes must be configured carefully. Kubernetes' own
  API server exposes separate
  [`/livez` and `/readyz` endpoints](https://kubernetes.io/docs/reference/using-api/health-checks/).
- **Prometheus blackbox exporter.** The
  [blackbox exporter](https://github.com/prometheus/blackbox_exporter)
  probes endpoints over HTTP, HTTPS, DNS, TCP, ICMP, and gRPC and exposes
  results such as `probe_success` and the certificate expiry time as
  metrics, which is the open-source building block for synthetic checks.

**Popular tools and providers:** Sentry, Rollbar, BugSnag, Honeybadger,
Datadog Error Tracking, and Grafana Faro for errors and real-user
monitoring; Checkly, Grafana Synthetic Monitoring, Datadog Synthetics,
Amazon CloudWatch Synthetics, Pingdom, and UptimeRobot for synthetic
checks; Atlassian Statuspage, Instatus, and Better Stack for status pages.

## How it works

### Error tracking compared with logs

A log line records that something happened. An error tracker is built
around **exceptions** and adds:

- **Grouping:** 12,000 occurrences of the same `TypeError` become one
  issue with a count, first-seen and last-seen times, and the number of
  distinct users affected.
- **Rich context:** stack trace with source code, breadcrumbs (what
  happened just before), browser and OS, release, environment, request,
  and trace ID.
- **Release awareness:** which release introduced an issue, whether a fix
  release resolved it, and whether it came back (a **regression**).
- **Workflow:** assign, link to a ticket, mark resolved, ignore, and alert
  on new or regressed issues.

Use both: the tracker for exceptions and crashes, logs for the request
story around them, linked by the trace ID.

### Anatomy of an error event

| Part | Example for TaskFlow Web |
|---|---|
| Exception | `TypeError: Cannot read properties of undefined (reading 'dueAt')` |
| Stack trace | `TaskList.tsx:42 in formatDue`, `TaskList.tsx:88 in TaskRow` (after symbolication) |
| Breadcrumbs | Navigation to `/tasks`, `GET /api/tasks` returned 200, click on "Edit" |
| Release and environment | `taskflow-web@1.42.0`, `production` |
| Context and tags | Browser, OS, route `/tasks`, feature flag `new-editor=on` |
| User | A pseudonymous ID such as `u_42`, never an email by default |
| Trace ID | Links to the backend trace and logs for the same action |

### Grouping and fingerprinting

The tracker computes a **fingerprint** for each event and groups events
with the same fingerprint into one issue. The default is based mainly on
the stack trace (especially frames in your own code), falling back to the
exception type and message.

Grouping goes wrong in two directions:

- **Too fine:** messages that contain IDs or timestamps
  (`Task 6650f1c2 not found`), or stacks that differ only by minified
  names, create thousands of one-event issues. Fix with stable messages
  and source maps, or a custom fingerprint.
- **Too coarse:** a generic wrapper such as `fetchJson()` that throws for
  every API failure puts unrelated failures in one issue. Fix by adding
  the endpoint or error code to the fingerprint.

### Source maps for minified frontend code

The production bundle of TaskFlow Web is minified: one line, short
variable names, no file structure. A stack frame like
`main.3f9a.js:1:4821` is useless. A **source map** maps positions in the
bundle back to the original file, line, and name (`TaskList.tsx:42` in
`formatDue`).

How it should work:

1. The build generates source maps (Vite: `build.sourcemap`).
2. CI uploads them to the error tracker, tagged with the release, before
   deploying.
3. CI **deletes the `.map` files** from the build output, so they are never
   served to the public.
4. The tracker uses the uploaded maps to symbolicate incoming stacks.

Why source maps must not be public:

- They contain your **original source code**, often including comments,
  internal API routes, feature flags for unreleased features, and
  business logic, making it much easier to study the app for weaknesses.
- Any secret that was (wrongly) embedded at build time is easier to find.
- They are large and slow down nothing for users, so there is no benefit
  to serving them.

Vite's `build.sourcemap: "hidden"` generates maps without adding the
`//# sourceMappingURL=` comment to bundles, so browsers do not request
them; deleting the files is still required, because a predictable URL
such as `main.3f9a.js.map` could otherwise be fetched directly.

### Releases, release health, and environments

Every event carries a **release** identifier (`taskflow-web@1.42.0`, or a
commit SHA) set at build time. That enables:

- "New in this release" views to spot regressions right after a deploy.
- Resolving an issue "in the next release", so it reopens automatically
  as a regression if it appears in a newer release.
- **Release health:** the share of sessions or users that ended without a
  crash in each release, compared across releases, as a signal to halt a
  rollout (see
  [rollbacks and safe releases](../deployment-strategies/rollbacks-and-safe-releases.md)).

The **environment** (`production`, `staging`, `development`) keeps test
noise out of production alerts. Alert only on production; review staging
issues before releasing.

### Scrubbing personal data before it leaves

Error events can carry sensitive data: request bodies, headers, cookies,
form inputs in breadcrumbs, and local variables. Defend in layers:

- **Limit what the SDK collects.** Sentry's JavaScript SDK v11 sends user
  data such as IP addresses, cookies, and request bodies by default, so
  turn off what you do not need with its `dataCollection` option (it
  replaced `sendDefaultPii`), and set a pseudonymous user ID yourself.
- Strip known sensitive fields in a **`beforeSend`** (and
  `beforeBreadcrumb`) hook in the SDK, so the data never leaves the
  user's browser or your server.
- Enable **server-side scrubbing** rules in the tracker as a second net
  (passwords, tokens, card-number patterns).
- If you use session replay, keep text and inputs **masked** by default.
- Treat the tracker as a data processor in your privacy policy and set
  retention deliberately.

![Diagram: eight steps. 1, an error is thrown in TaskFlow Web in minified main.3f9a.js at line 1, column 4821. 2, the SDK captures stack trace, breadcrumbs, release, environment, user id, and trace id. 3, the beforeSend hook scrubs emails and tokens, drops known noise, and samples if needed. 4, the tracker ingests the event with rate limits, quotas, and server-side scrubbing. 5, it symbolicates with the private source map, giving TaskList.tsx:42 and a readable stack trace. 6, it fingerprints the event and groups it into a new or existing issue, counting users affected. 7, an alert rule fires on a new issue in production, a regression, or a spike in the error rate. 8, the team assigns it, links a ticket, and resolves it in 1.42.1; a regression reopens it. CI uploads each release's source maps and then deletes them; passwords, tokens, full emails, and card data must never be sent.](error-event-lifecycle.svg)

### Real-user monitoring and Core Web Vitals

**Real-user monitoring (RUM)** collects performance data from actual
users' browsers. Synthetic checks measure a lab-like path from a few
locations; RUM measures every device, network, and region you actually
serve.

Google's Core Web Vitals, evaluated at the **75th percentile** of page
loads (separately for mobile and desktop):

| Metric | Measures | Good | Poor |
|---|---|---|---|
| **LCP** (Largest Contentful Paint) | Loading: when the main content appears | 2.5 s or less | Over 4 s |
| **INP** (Interaction to Next Paint) | Responsiveness: delay from a click or key press to the next frame | 200 ms or less | Over 500 ms |
| **CLS** (Cumulative Layout Shift) | Visual stability: unexpected movement of content | 0.1 or less | Over 0.25 |

INP replaced First Input Delay (FID) as a Core Web Vital in March 2024. The
open-source `web-vitals` library measures all three in the browser so you
can send them to your own endpoint or RUM tool; split them by route and
release to catch a frontend regression the same way you catch a backend
one.

### Synthetic and uptime checks

**Synthetic monitoring** runs scripted requests on a schedule from
locations you choose:

| Check type | What it tests | TaskFlow example |
|---|---|---|
| HTTP(S) | Status code, response body, latency, redirects | `GET https://api.example.com/healthz` returns 200 and `"status":"ok"` in under 2 s |
| TLS certificate | Validity, chain, days until expiry | Certificate on `api.example.com` valid for more than 14 days |
| DNS | Records resolve to the expected values | `app.example.com` points to the CDN |
| Multi-step API | A short user journey through the API | Log in, create a task, read it back, delete it |
| Browser (scripted) | The real UI in a headless browser, often with Playwright | Log in to TaskFlow Web, create a task, see it in the list |

![Diagram: probes in us-east, us-west, eu-west, and ap-south test api.example.com through DNS, TLS, the CDN, and the load balancer. us-east gets 200 OK in 182 ms, us-west 200 OK in 240 ms, eu-west times out after 5 s, and ap-south gets 200 OK in 310 ms. An HTTP check every 60 s sends GET /healthz and expects 200, the right body, and a certificate valid for more than 14 days; a browser check every 5 minutes logs in, creates a task, and sees it in the list. A quorum rule alerts only when two or more regions fail two runs in a row, so with one of four regions failing the result is recorded and retried without a page, as it is likely a local network issue.](synthetic-checks-regions.svg)

Design rules:

- **Probe from several regions and alert on a quorum.** A single probe
  location fails for its own network reasons; requiring two or more
  regions to fail, on consecutive runs, removes most false alarms.
- **Probe from outside your infrastructure**, so a cloud-region or
  network outage that takes down your servers does not also take down
  the checks.
- **Check the journeys that matter**, not just the home page. A static
  home page from the CDN can be "up" while the API is down.
- **Use dedicated test accounts and clean up** the data synthetic checks
  create, and exclude their traffic from business metrics and SLIs if it
  would distort them.
- **Keep checks fast and frequent** (every 1 to 5 minutes) so they detect
  outages within minutes and double as a steady source of SLI data for
  low-traffic services.

### Health endpoints: liveness and readiness

Health endpoints let machines (load balancers, Kubernetes, uptime
checkers) decide what to do with an instance. They answer different
questions, and mixing them up causes outages:

| Endpoint | Question | Should check | Must not check | On failure |
|---|---|---|---|---|
| `/healthz` (liveness) | Is this process alive and not stuck? | That the HTTP server responds; optionally that the event loop is not blocked | Databases or other services | The orchestrator restarts the container |
| `/readyz` (readiness) | Can this instance serve traffic right now? | Startup finished, not shutting down, required dependencies reachable (a quick MongoDB `ping`) | Optional or third-party dependencies; slow deep checks | The instance is removed from load balancing until it recovers |
| Startup (often reuses `/healthz`) | Has a slow-starting app finished starting? | Same as liveness | Same as liveness | Liveness checks wait until startup succeeds |

The classic mistake is a **liveness** check that queries the database.
When MongoDB has a brief problem, every pod fails liveness, Kubernetes
restarts every pod, and the restarts add load and time to the outage. A
database problem should make pods *not ready* (stop sending traffic),
not *dead* (restart).

Other guidelines:

- Make checks cheap and bounded by a short timeout; the probe may run
  every few seconds on every instance.
- Return `503` when not ready, and flip readiness to failing at the start
  of graceful shutdown so the load balancer drains the instance before it
  stops.
- Do not expose detailed health output (versions, dependency hosts) on the
  public internet; keep detailed diagnostics on an internal port or behind
  authentication.

The probe configuration itself is covered in
[health probes and rolling updates](../kubernetes/health-probes-and-rolling-updates.md).

### Status pages

A status page tells users what is happening during an incident, which
cuts support load and builds trust:

- **Host it separately** from your own infrastructure (a hosted status
  page service or a different provider), so it stays up when you are
  down.
- **Model components** the way users see them: API, web app, reminders and
  email, integrations.
- **Post early, update on a cadence** (for example every 30 minutes during
  a major incident), and close with a summary and, for significant
  incidents, a public postmortem.
- **Automate carefully:** automatic "degraded" updates from synthetic
  checks are fast but can be wrong; most teams let a human confirm before
  posting.
- **Announce maintenance windows** in advance.

## When to use and when not to use

| Need | Use | Not a substitute for |
|---|---|---|
| Find and prioritize crashes in API and browser code | Error tracker | Metrics-based SLO alerts |
| Know the user's actual page speed by device and region | RUM with Core Web Vitals | Synthetic checks (lab data) |
| Know the service is reachable from the internet | Multi-region synthetic checks | Internal metrics |
| Let orchestrators route around broken instances | `/readyz` and `/healthz` | Monitoring dashboards |
| Communicate with customers during incidents | Status page | Direct support for affected customers |

An error tracker is not a log store (do not send every handled warning as
an "error"), and a synthetic check is not an SLI on its own unless it runs
often enough and represents real traffic.

## Practical examples

### Error tracking in TaskFlow API (Express)

```js
// src/instrument.mjs (loaded with --import before the app)
import * as Sentry from "@sentry/node";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV ?? "development",
  release: `taskflow-api@${process.env.APP_VERSION ?? "dev"}`,
  // SDK v11 collects everything by default: turn off automatic user data
  // (IP address), cookies, and request and response bodies.
  dataCollection: { userInfo: false, cookies: false, httpBodies: [] },
  // Tracing is handled by OpenTelemetry in this service, so tracesSampleRate
  // stays unset; errors are attached to the active OpenTelemetry trace.
  integrations: [Sentry.openTelemetryIntegration()],
  beforeSend(event) {
    // Defence in depth: remove headers that must never leave the server.
    if (event.request?.headers) {
      delete event.request.headers.authorization;
      delete event.request.headers.cookie;
      delete event.request.headers["x-api-key"];
    }
    return event;
  },
});
```

```js
// src/app.js
import * as Sentry from "@sentry/node";
import express from "express";
import { tasksRouter } from "./tasks/router.js";

export const app = express();
app.use(express.json());
app.use("/tasks", tasksRouter);

// After all routes: reports unhandled errors, then passes them on.
Sentry.setupExpressErrorHandler(app);

app.use((err, req, res, next) => {
  res.status(500).json({ error: "Internal Server Error", requestId: req.id });
});
```

```js
// src/tasks/errors.js: group duplicate-key failures by collection, not by message
import * as Sentry from "@sentry/node";

export function reportDuplicateTask(err, collection) {
  Sentry.withScope((scope) => {
    scope.setFingerprint(["mongo-duplicate-key", collection]);
    scope.setTag("collection", collection);
    Sentry.captureException(err);
  });
}
```

Parts: `instrument.mjs` must run before Express is imported (with
`node --import ./src/instrument.mjs src/server.js`), just like the
OpenTelemetry setup; `setupExpressErrorHandler` captures errors that reach
Express's error handling; `openTelemetryIntegration()` puts the request's
trace ID on each error event; the custom fingerprint keeps every
`E11000 duplicate key` error for the tasks collection in one issue even
though each message contains a different key value. Only report errors
that need attention: expected client errors such as validation failures
are not issues.

### Error tracking and source maps in TaskFlow Web (React and Vite)

```js
// src/sentry.js (TaskFlow Web)
import * as Sentry from "@sentry/react";

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN, // a DSN is public by design; it only allows sending events
  environment: import.meta.env.MODE,
  release: `taskflow-web@${import.meta.env.VITE_APP_VERSION}`,
  dataCollection: { userInfo: false, cookies: false, httpBodies: [] },
  integrations: [Sentry.browserTracingIntegration()],
  tracesSampleRate: 0.05,
  // Only attach trace headers to our own API, not to third parties.
  tracePropagationTargets: [/^https:\/\/api\.example\.com/],
});
```

```js
// vite.config.js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { sentryVitePlugin } from "@sentry/vite-plugin";

export default defineConfig({
  build: {
    sourcemap: "hidden", // generate maps, without sourceMappingURL comments in the bundles
  },
  plugins: [
    react(),
    // Keep the Sentry plugin last. It uploads maps for this release at build time.
    sentryVitePlugin({
      org: "example",
      project: "taskflow-web",
      authToken: process.env.SENTRY_AUTH_TOKEN, // CI secret, never committed
      release: { name: `taskflow-web@${process.env.VITE_APP_VERSION}` },
      sourcemaps: {
        filesToDeleteAfterUpload: ["./dist/**/*.map"], // never deploy maps
      },
    }),
  ],
});
```

```bash
# CI: build with the release version; the plugin uploads and deletes the maps
VITE_APP_VERSION="1.42.0" SENTRY_AUTH_TOKEN="<token>" npm run build
test -z "$(find dist -name '*.map')" || { echo "source maps left in dist/"; exit 1; }
```

The final check fails the pipeline if any `.map` file would be deployed.
The auth token used for uploads is a secret with write access to your
project; it belongs only in CI, unlike the DSN.

### Health endpoints with graceful shutdown

```js
// src/health.js
let shuttingDown = false;

export function markShuttingDown() {
  shuttingDown = true;
}

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export function registerHealthRoutes(app, mongoClient) {
  // Liveness: the process answers HTTP. No dependency checks.
  app.get("/healthz", (req, res) => {
    res.status(200).json({ status: "ok" });
  });

  // Readiness: safe to receive traffic right now.
  app.get("/readyz", async (req, res) => {
    if (shuttingDown) {
      return res.status(503).json({ status: "shutting_down" });
    }
    try {
      await withTimeout(mongoClient.db("admin").command({ ping: 1 }), 500);
      res.status(200).json({ status: "ready" });
    } catch {
      res.status(503).json({ status: "not_ready", reason: "database" });
    }
  });
}
```

```js
// src/server.js (shutdown part)
import { markShuttingDown } from "./health.js";

process.once("SIGTERM", () => {
  markShuttingDown(); // readiness fails, the load balancer stops sending new requests
  setTimeout(() => {
    server.close(() => mongoClient.close().then(() => process.exit(0)));
  }, 10_000); // wait for endpoints to update before refusing connections
});
```

The 10-second delay before closing the server gives load balancers time to
notice the failing readiness check; tune it to your probe period and
failure threshold.

### Multi-region probes with the blackbox exporter

```yaml
# blackbox/blackbox.yml (deployed in each probe region)
modules:
  taskflow_health:
    prober: http
    timeout: 5s
    http:
      method: GET
      valid_status_codes: [200]
      fail_if_not_ssl: true
      fail_if_body_not_matches_regexp:
        - '"status":"ok"'
```

```yaml
# prometheus/prometheus.yml (one job per probe region)
scrape_configs:
  - job_name: blackbox-taskflow
    metrics_path: /probe
    params:
      module: [taskflow_health]
    static_configs:
      - targets: ["https://api.example.com/healthz"]
        labels:
          region: eu-west
    relabel_configs:
      - source_labels: [__address__]
        target_label: __param_target
      - source_labels: [__param_target]
        target_label: instance
      - target_label: __address__
        replacement: blackbox-eu-west.monitoring.example.com:9115
```

The relabeling turns the listed URL into the `target` query parameter and
sends the scrape to the regional exporter, which performs the probe and
returns `probe_success`, `probe_duration_seconds`, and
`probe_ssl_earliest_cert_expiry`. The quorum alert
(`count(probe_success == 0) >= 2`) is shown in
[alerting and on-call](alerting-and-on-call.md). Host at least some probes
outside the cloud region and provider that runs TaskFlow.

### Reporting Core Web Vitals from TaskFlow Web

```js
// src/vitals.js (TaskFlow Web)
import { onCLS, onINP, onLCP } from "web-vitals";

function send(metric) {
  const body = JSON.stringify({
    name: metric.name,         // "LCP" | "INP" | "CLS"
    value: metric.value,
    rating: metric.rating,     // "good" | "needs-improvement" | "poor"
    id: metric.id,
    route: window.location.pathname.replace(/\/[0-9a-f]{24}(?=\/|$)/g, "/:id"),
    release: import.meta.env.VITE_APP_VERSION,
  });
  // sendBeacon survives page unload; fall back to fetch with keepalive.
  if (!navigator.sendBeacon?.("https://api.example.com/rum", body)) {
    fetch("https://api.example.com/rum", { method: "POST", body, keepalive: true });
  }
}

onCLS(send);
onINP(send);
onLCP(send);
```

The route is normalized (MongoDB ObjectIds replaced by `:id`) before it
becomes a metric label on the server, for the cardinality reasons explained
in [metrics and dashboards](metrics-and-dashboards.md).

## Best practices

- Report unhandled exceptions from both the API and the browser, tagged
  with release and environment.
- Upload source maps privately at build time and make the pipeline fail
  if any map would be deployed.
- Keep personal data out of error events: limited SDK data collection,
  `beforeSend` scrubbing, server-side rules.
- Fix grouping early: stable error messages and custom fingerprints where
  needed.
- Alert on new and regressed issues in production, and watch release
  health during rollouts.
- Measure Core Web Vitals from real users at p75, per route and release.
- Run synthetic checks for critical journeys from several regions outside
  your infrastructure, with a quorum rule.
- Keep liveness checks dependency-free; put dependency checks in
  readiness; fail readiness during shutdown.
- Host the status page independently and update it on a fixed cadence
  during incidents.

## In production

- **Every pod restarts at once during a short database blip.**
  *Detect:* restart counts jump across all pods at the same moment as a
  MongoDB failover, and the outage lasts longer than the failover itself.
  *Cause:* the liveness endpoint checks the database. *Fix:* make
  `/healthz` dependency-free, move the database check to `/readyz`, and
  give probes sensible thresholds.
- **Error stack traces are unreadable after a frontend deploy.**
  *Detect:* new issues show frames like `main.3f9a.js:1:4821`. *Cause:*
  source maps were not uploaded for this release, or the release name in
  the SDK does not match the uploaded one. *Fix:* upload maps in the same
  CI job that builds, use one release variable for both, and fail the
  build if the upload fails.
- **Source maps are publicly downloadable.**
  *Detect:* a request for `https://app.example.com/assets/main.3f9a.js.map`
  returns 200. *Cause:* maps were left in the build output and deployed
  to the CDN. *Fix:* delete maps after upload, add a CI check, purge them
  from the CDN, and review the exposed code for embedded secrets.
- **The uptime check says 100% while users cannot log in.**
  *Detect:* support reports login failures; the check on the home page
  stays green. *Cause:* the home page is static and served by the CDN,
  while the API behind login is down. *Fix:* check `/healthz` on the API
  and run a multi-step login journey.
- **Synthetic alerts fire every few nights and then clear.**
  *Detect:* pages from a single probe location with timeouts while other
  regions are fine. *Cause:* network problems near that probe. *Fix:*
  require two or more regions to fail on consecutive runs before paging.
- **The error tracker quota runs out by mid-month.**
  *Detect:* the tracker drops events; one issue accounts for most volume.
  *Cause:* a noisy error (often from a browser extension or a bot) or a
  loop that reports the same error repeatedly. *Fix:* fix or ignore the
  noise, filter third-party script errors, sample very frequent events,
  and set rate limits per project.

## Important terminology

- **Error tracking:** Capturing, grouping, and managing application
  exceptions with context.
- **Issue:** A group of events with the same fingerprint.
- **Fingerprint:** The value used to decide which events belong together.
- **Breadcrumbs:** The trail of events (navigation, requests, clicks, logs)
  recorded before an error.
- **Source map:** A file mapping minified code positions to original
  source.
- **Symbolication:** Translating a minified or compiled stack trace into
  original files and lines.
- **Release health:** Crash-free session or user rates per release.
- **RUM:** Real-user monitoring, measured in users' browsers.
- **Core Web Vitals:** LCP, INP, and CLS.
- **Synthetic monitoring:** Scripted checks run on a schedule from chosen
  locations.
- **Liveness / readiness:** Whether a process should be restarted, and
  whether it should receive traffic.
- **Status page:** A public page reporting service status and incidents.

## Common mistakes and misconceptions

- Shipping source maps to production, or not uploading them at all.
- Leaving request bodies, cookies, or emails in error events.
- Reporting expected errors (validation failures, 404s) as issues, which
  buries real bugs.
- Using the home page as the only uptime check.
- Probing from one location, or from inside the same cloud region as the
  app.
- Checking dependencies in liveness probes.
- Treating a green synthetic check as proof that all users are fine.
- Hosting the status page on the infrastructure it reports on.
- Measuring Core Web Vitals only in the lab, on a fast laptop.

## Revision questions

1. What does an error tracker add compared with logging the exception?
2. Why do error messages that include IDs cause poor grouping, and how do
   you fix it?
3. Walk through how a minified stack frame becomes `TaskList.tsx:42`.
   Where must the source map live, and why?
4. What are LCP, INP, and CLS, and what are the "good" thresholds at the
   75th percentile?
5. Four probe regions run every minute, and each region independently
   fails 0.5% of runs for local reasons. Roughly how many false alerts per
   day would a single-region rule give, compared with a rule requiring two
   regions to fail together? (Single region: 1,440 x 0.005 = 7.2 per day
   per region. Two specific regions together: about 0.000025 per run,
   with 6 region pairs about 0.00015 per run, or about 0.2 per day; adding
   "two consecutive runs" reduces it much further.)
6. What should `/healthz` and `/readyz` each check, and what happens when
   each fails?
7. Why should readiness start failing before the server closes during a
   graceful shutdown?
8. Where should a status page be hosted, and how often should it be
   updated during a major incident?

## Further learning

- [Sentry: Express guide](https://docs.sentry.io/platforms/javascript/guides/express/)
- [Sentry: Source maps](https://docs.sentry.io/platforms/javascript/sourcemaps/)
- [Sentry: Scrubbing sensitive data](https://docs.sentry.io/security-legal-pii/scrubbing/)
- [web.dev: Interaction to Next Paint](https://web.dev/articles/inp)
- [web-vitals library](https://github.com/GoogleChrome/web-vitals)
- [Vite: Build options (`build.sourcemap`)](https://vite.dev/config/build-options)
- [Kubernetes: Liveness, readiness, and startup probes](https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/)
- Next: [incident response and postmortems](incident-response-and-postmortems.md).
  Back to the [monitoring and logging overview](../monitoring-and-logging.md).
