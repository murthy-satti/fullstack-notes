# SLIs, SLOs, and Error Budgets

"Is TaskFlow reliable enough?" is an argument until you put numbers on it.
A **service level indicator (SLI)** measures one aspect of the service as
users experience it, a **service level objective (SLO)** sets a target for
that measurement over a time window, and the **error budget** is the amount
of unreliability the target still allows. This lesson defines SLIs, SLOs,
and SLAs, shows how to choose good SLIs, computes the "nines" correctly,
works through error budget math, explains error budget policies, and builds
the multiwindow, multi-burn-rate alerts recommended by Google's SRE
Workbook, ending with an SLO document for TaskFlow API.

## Why it matters

Without an agreed target, reliability work is driven by whoever shouts
loudest: product wants features, operations wants stability, and every
incident triggers a debate about whether things are "bad enough" to slow
down. An SLO turns that into a shared, measurable contract inside the team.
If the service is meeting its SLO, you ship; if it is burning the budget
too fast, you stop and fix reliability. Nobody has to win an argument.

SLOs also fix alerting. Instead of paging on CPU, memory, or every error
spike, you page when users are being hurt fast enough to threaten the
objective. That single change removes most alert noise, as the next lesson
on [alerting and on-call](alerting-and-on-call.md) shows.

## Real-world usage

- **Google SRE book.** The chapter
  [Service Level Objectives](https://sre.google/sre-book/service-level-objectives/)
  defines SLIs, SLOs, and SLAs, explains why 100% is the wrong target, and
  recommends choosing a small number of indicators that reflect what users
  care about.
- **Google SRE Workbook: error budgets in practice.** The chapter
  [Implementing SLOs](https://sre.google/workbook/implementing-slos/)
  walks through choosing SLIs, measuring them, and using error budgets to
  make decisions, and the
  [Example Error Budget Policy](https://sre.google/workbook/error-budget-policy/)
  shows a policy that halts non-critical releases when a service exceeds
  its budget.
- **Google SRE Workbook: alerting.** The chapter
  [Alerting on SLOs](https://sre.google/workbook/alerting-on-slos/)
  compares six alerting approaches and recommends multiwindow,
  multi-burn-rate alerts, with a table of burn rates (14.4, 6, and 1) and
  windows for a 99.9% SLO.
- **Cloud provider SLAs.** Public SLAs such as the
  [Amazon Compute Service Level Agreement](https://aws.amazon.com/compute/sla/)
  promise a monthly uptime percentage and define service credits when it is
  missed, which is the contractual layer that sits on top of internal SLOs.

**Popular tools and providers:** Prometheus recording and alerting rules,
Sloth and Pyrra (generate SLO rules for Prometheus), the OpenSLO
specification, Grafana SLO, Datadog SLOs, Google Cloud Service Monitoring,
Nobl9, and Amazon CloudWatch Application Signals.

## How it works

### SLI, SLO, and SLA

| Term | What it is | Who it is for | TaskFlow example |
|---|---|---|---|
| **SLI** (indicator) | A measurement, usually a ratio of good events to valid events | Engineers | Proportion of `/tasks` requests that return a non-5xx response |
| **SLO** (objective) | A target for an SLI over a window | The team and its stakeholders | 99.9% of requests succeed over a rolling 30 days |
| **SLA** (agreement) | A contract with consequences, usually money or service credits | Customers and lawyers | 99.5% monthly availability or a 10% credit |
| **Error budget** | `1 - SLO`: how much failure the SLO allows | The team, to make decisions | 0.1% of requests may fail: about 50,000 of 50 million a month |

An SLA should always be **looser** than the internal SLO. If TaskFlow
promises customers 99.5%, the team aims for 99.9% so it notices and reacts
long before the contract is at risk. Many internal services have SLOs and
no SLA at all.

### Choosing good SLIs

The SRE books recommend expressing SLIs as a ratio:

```text
SLI = good events / valid events   (x 100%)
```

Common SLI types:

| Type | Question | TaskFlow SLI |
|---|---|---|
| **Availability** | Did the request succeed? | Non-5xx responses / all API requests (excluding health checks) |
| **Latency** | Was it fast enough? | Requests served in under 300 ms / all requests |
| **Freshness** | Is the data recent enough? | Reminder emails sent within 5 minutes of the due time / reminders due |
| **Correctness** | Was the answer right? | Synthetic task reads that return the expected content / synthetic reads |
| **Throughput or coverage** | Did the batch process everything? | Nightly export jobs that complete by 06:00 / jobs scheduled |

Guidelines that make SLIs trustworthy:

- **Measure as close to the user as practical.** Load balancer or ingress
  logs and metrics see requests that never reached the app (a crashed pod,
  a full connection queue). Application metrics miss those. Real-user or
  synthetic measurements from outside catch DNS and CDN failures too.
- **Define "valid" carefully.** Exclude health checks and synthetic
  traffic you do not want to count. Decide deliberately how to treat
  `4xx`: a `404` for a missing task is the client's problem (good, or not
  valid), but a `429` caused by your own overloaded rate limiter may well
  be a failure.
- **Use thresholds, not averages, for latency.** "99% of requests faster
  than 300 ms" is understandable and directly measurable from a histogram
  bucket at `le="0.3"`. Some teams use two thresholds (p90 under 100 ms
  and p99 under 500 ms).
- **Few SLIs per user journey.** Two or three (availability, latency,
  maybe freshness) for each critical journey such as "create a task" and
  "list my tasks". Twenty SLIs is a dashboard, not an objective.

### SLO targets and the nines

Allowed full-outage time per window:

| SLO | Error budget | Per 30 days (43,200 min) | Per year (365 days) |
|---|---|---|---|
| 99% | 1% | 432 min = **7 h 12 min** | 3.65 days |
| 99.5% | 0.5% | 216 min = **3 h 36 min** | 1.83 days |
| 99.9% | 0.1% | 43.2 min = **43 min 12 s** | 8.76 hours |
| 99.95% | 0.05% | 21.6 min = **21 min 36 s** | 4.38 hours |
| 99.99% | 0.01% | 4.32 min = **4 min 19 s** | 52.6 minutes |
| 99.999% | 0.001% | 0.432 min = **26 s** | 5.26 minutes |

How to compute any row: window length times `(1 - SLO)`. For 99.95% over
30 days: `43,200 min x 0.0005 = 21.6 min`.

Choosing a target:

- **Each extra nine costs far more than the last** in engineering and
  infrastructure (the SRE book warns an increment may cost 100x more):
  redundancy across zones, faster detection, automated rollback, on-call
  staffing.
- **You cannot be more reliable than your dependencies** without
  redundancy. If TaskFlow depends on a single managed database with a
  99.95% SLA and a single region, a 99.99% SLO is fiction.
- **Users cannot tell the difference above a point.** Their own Wi-Fi and
  mobile networks fail more often than 0.01% of the time.
- **Start from current performance.** Measure the SLI for a few weeks,
  set the SLO slightly below what you already achieve, and tighten it as
  the service improves.
- **Prefer request-based SLOs over time-based ones** for APIs: "0.1% of
  requests may fail" handles partial outages (one bad pod out of ten)
  better than "the service is up or down each minute".

### Error budget math

![Diagram: for a 99.9% SLO over 30 days, the error budget is 43.2 minutes of full outage (30 d x 24 h x 60 min x 0.001). The budget-remaining line falls about 1% a day, drops 41.7% on day 9 because of an 18-minute outage (18 / 43.2), continues to 37.3% on day 21, drops 23.1% because a bad deploy caused 25% errors for 40 minutes, and ends at 5.2% on day 30. A dashed line shows an even spend reaching 0% on day 30. A red policy line at 25% marks where the error budget policy freezes risky releases, crossed on day 21.](error-budget-burndown.svg)

A worked example for TaskFlow API:

```text
SLO: 99.9% of API requests succeed, rolling 30 days
Traffic: ~50,000,000 requests per 30 days (about 19 requests/second on average)

Error budget = 50,000,000 x (1 - 0.999) = 50,000 failed requests

Incident A: full outage for 15 minutes at 20 requests/second
  failed = 15 x 60 x 20 = 18,000            -> 36% of the budget

Incident B: bad deploy, 5% of requests fail for 2 hours at 25 requests/second
  failed = 2 x 3,600 x 25 x 0.05 = 9,000     -> 18% of the budget

Background: 0.02% of requests fail all month
  failed = 50,000,000 x 0.0002 = 10,000      -> 20% of the budget

Total used = 37,000 of 50,000 = 74%; 26% remaining
```

The **burn rate** is how fast the budget is being consumed relative to
the rate that would use exactly all of it over the window:

```text
burn rate = observed error ratio / (1 - SLO)

0.1% errors on a 99.9% SLO  -> burn rate 1    -> budget lasts exactly 30 days
0.5% errors                 -> burn rate 5    -> budget gone in 30 / 5 = 6 days
1.44% errors                -> burn rate 14.4 -> budget gone in about 2.1 days (50 h)
100% errors (full outage)   -> burn rate 1,000 -> budget gone in about 43 minutes
```

Burn rate is the bridge between SLOs and alerting: a burn rate of 1 is
exactly on budget, anything far above it is an emergency.

### Error budget policies

An SLO without consequences is a dashboard. An **error budget policy** is
a short, agreed document saying what the team does as the budget runs low.
A typical policy for TaskFlow:

| Budget remaining (rolling 30 days) | Action |
|---|---|
| More than 50% | Normal development; experiments and risky migrations allowed |
| 25% to 50% | Extra review for risky changes; prioritize reliability bugs from recent incidents |
| Below 25% | Freeze non-critical feature releases; only fixes and reliability work ship |
| Exhausted | Freeze continues until the SLI is back within the SLO over the window; postmortem required for any single incident using more than 20% |

Good policies are agreed in advance by engineering and product leadership,
apply automatically (no meeting needed to decide), define exceptions
(security fixes always ship), and are reviewed when they do not seem to
work. The budget is also permission: with 70% left near the end of the
window, the team can afford a risky but valuable migration.

### Alerting on SLOs: multiwindow, multi-burn-rate

The naive alert "error ratio over 0.1% for 5 minutes" fires on every small
blip and resolves before anyone looks. The opposite, "budget below 10%",
fires days too late. The SRE Workbook's recommendation is to alert on
**burn rate**, over **two windows at once**:

- A **long window** proves the burn is significant (not a 30-second
  spike).
- A **short window**, one-twelfth of the long one, proves it is still
  happening, so the alert resolves soon after a fix instead of firing for
  another hour.

Recommended starting parameters for a 99.9% SLO over 30 days, from the
SRE Workbook:

| Severity | Budget consumed | Long window | Short window | Burn rate | Error ratio threshold |
|---|---|---|---|---|---|
| Page | 2% | 1 hour | 5 minutes | 14.4 | 14.4 x 0.1% = 1.44% |
| Page | 5% | 6 hours | 30 minutes | 6 | 6 x 0.1% = 0.6% |
| Ticket | 10% | 3 days | 6 hours | 1 | 1 x 0.1% = 0.1% |

Where 14.4 comes from: 2% of a 30-day budget consumed in 1 hour means
burning at `0.02 x 720 hours / 1 hour = 14.4` times the sustainable rate.
Likewise `0.05 x 720 / 6 = 6` and `0.10 x 720 / 72 = 1`.

![Diagram: SLO 99.9%, page when the 1-hour and 5-minute error ratios both exceed 14.4 x 0.1% = 1.44%. Over 90 minutes, the actual error ratio jumps from 0.05% to 10% at minute 10 and the fix lands at minute 30. The 5-minute window rises to 10% by minute 15 and falls back by minute 35. The 1-hour window rises to about 3.4% by minute 30, stays there until minute 70, then falls back by minute 90. The page fires while both windows are above the threshold, from minute 18.4 to 34.3. With the 1-hour window alone, the alert would keep paging until minute 81.6, 52 minutes after the fix.](burn-rate-alert-windows.svg)

Properties of this scheme:

- **Detection time scales with severity.** A full outage (100% errors,
  burn rate 1,000) trips the 1-hour condition after about
  `0.0144 x 60 min = 52 s`; a 2% error ratio takes about 43 minutes; a
  slow 0.2% leak never pages but opens a ticket within days.
- **Fast reset.** The short window drops below the threshold minutes
  after a fix.
- **Precision.** A page always means at least 2% (or 5%) of the monthly
  budget is being lost, which is worth waking someone for.

Low-traffic services need care: with 20 requests an hour, one failure is
a 5% error ratio. Options are synthetic traffic to keep a steady
denominator, longer windows, or a minimum count of failed requests before
alerting.

### SLO documents

An SLO is written down and versioned, like code. The SRE Workbook's
[example SLO document](https://sre.google/workbook/slo-document/) includes
the service overview, the SLIs and SLOs with their exact measurement,
the rationale for each target, the error budget, clarifications and
caveats, and links to the error budget policy and dashboards. Keep it in
the service's repository and review it at least quarterly.

## When to use and when not to use

| Situation | Approach |
|---|---|
| User-facing API or website | Availability and latency SLOs per critical journey |
| Asynchronous pipeline (reminders, exports) | Freshness and completeness SLOs |
| Internal platform used by other teams | SLOs agreed with those teams; they are your users |
| Prototype or internal tool with no users yet | Skip formal SLOs; basic alerts are enough |
| Hard regulatory or safety guarantees | SLOs help operations, but they do not replace formal requirements and testing |
| Contract with customers | An SLA, backed by a stricter internal SLO |

SLOs are not a tool for ranking teams or punishing incidents, and they do
not replace debugging telemetry; they decide **when** to act, not **what**
is broken.

## Practical examples

### SLI recording rules for TaskFlow API

```yaml
# prometheus/rules/taskflow-slo-recording.yml
groups:
  - name: taskflow-slo-sli
    rules:
      # Availability SLI: share of requests that failed (5xx), per window.
      # Health checks and unmatched routes are not valid events.
      - record: taskflow:slo_errors:ratio_rate5m
        expr: |
          sum(rate(http_request_duration_seconds_count{job="taskflow-api", route!~"unmatched|/healthz|/readyz", status_code=~"5.."}[5m]))
          /
          sum(rate(http_request_duration_seconds_count{job="taskflow-api", route!~"unmatched|/healthz|/readyz"}[5m]))
      - record: taskflow:slo_errors:ratio_rate30m
        expr: |
          sum(rate(http_request_duration_seconds_count{job="taskflow-api", route!~"unmatched|/healthz|/readyz", status_code=~"5.."}[30m]))
          /
          sum(rate(http_request_duration_seconds_count{job="taskflow-api", route!~"unmatched|/healthz|/readyz"}[30m]))
      - record: taskflow:slo_errors:ratio_rate1h
        expr: |
          sum(rate(http_request_duration_seconds_count{job="taskflow-api", route!~"unmatched|/healthz|/readyz", status_code=~"5.."}[1h]))
          /
          sum(rate(http_request_duration_seconds_count{job="taskflow-api", route!~"unmatched|/healthz|/readyz"}[1h]))
      - record: taskflow:slo_errors:ratio_rate6h
        expr: |
          sum(rate(http_request_duration_seconds_count{job="taskflow-api", route!~"unmatched|/healthz|/readyz", status_code=~"5.."}[6h]))
          /
          sum(rate(http_request_duration_seconds_count{job="taskflow-api", route!~"unmatched|/healthz|/readyz"}[6h]))
      - record: taskflow:slo_errors:ratio_rate3d
        expr: |
          sum(rate(http_request_duration_seconds_count{job="taskflow-api", route!~"unmatched|/healthz|/readyz", status_code=~"5.."}[3d]))
          /
          sum(rate(http_request_duration_seconds_count{job="taskflow-api", route!~"unmatched|/healthz|/readyz"}[3d]))

      # Latency SLI: share of valid requests slower than 300 ms (bucket boundary at 0.3).
      - record: taskflow:slo_latency_bad:ratio_rate1h
        expr: |
          1 - (
            sum(rate(http_request_duration_seconds_bucket{job="taskflow-api", route!~"unmatched|/healthz|/readyz", le="0.3"}[1h]))
            /
            sum(rate(http_request_duration_seconds_count{job="taskflow-api", route!~"unmatched|/healthz|/readyz"}[1h]))
          )
```

Tools such as Sloth or Pyrra generate exactly this kind of rule set from a
short SLO definition, which avoids copy-paste mistakes across windows.

### Multiwindow, multi-burn-rate alerts

```yaml
# prometheus/rules/taskflow-slo-alerts.yml
groups:
  - name: taskflow-slo-alerts
    rules:
      - alert: TaskflowErrorBudgetBurnFast
        expr: |
          taskflow:slo_errors:ratio_rate1h > (14.4 * 0.001)
          and
          taskflow:slo_errors:ratio_rate5m > (14.4 * 0.001)
        labels:
          severity: page
          service: taskflow-api
        annotations:
          summary: "TaskFlow API is burning its 30-day error budget at 14x or more"
          description: "1h error ratio {{ $value | humanizePercentage }}; at this rate 2% of the monthly budget is gone every hour."
          runbook_url: "https://runbooks.example.com/taskflow-api/error-budget-burn"

      - alert: TaskflowErrorBudgetBurnSustained
        expr: |
          taskflow:slo_errors:ratio_rate6h > (6 * 0.001)
          and
          taskflow:slo_errors:ratio_rate30m > (6 * 0.001)
        labels:
          severity: page
          service: taskflow-api
        annotations:
          summary: "TaskFlow API has burned 5% of its error budget in 6 hours"
          runbook_url: "https://runbooks.example.com/taskflow-api/error-budget-burn"

      - alert: TaskflowErrorBudgetBurnSlow
        expr: |
          taskflow:slo_errors:ratio_rate3d > (1 * 0.001)
          and
          taskflow:slo_errors:ratio_rate6h > (1 * 0.001)
        labels:
          severity: ticket
          service: taskflow-api
        annotations:
          summary: "TaskFlow API is on track to exhaust its error budget this month"
          runbook_url: "https://runbooks.example.com/taskflow-api/error-budget-burn"
```

No `for:` clause is needed: the windows already provide the smoothing,
and adding `for` only delays detection. The `severity` label is what
Alertmanager routes on (pager versus ticket queue), covered in
[alerting and on-call](alerting-and-on-call.md).

### Error budget remaining

```text
# Budget remaining over the last 30 days, as a fraction (1 = untouched, 0 = exhausted)
1 - (
  (
    sum(increase(http_request_duration_seconds_count{job="taskflow-api", route!~"unmatched|/healthz|/readyz", status_code=~"5.."}[30d]))
    /
    sum(increase(http_request_duration_seconds_count{job="taskflow-api", route!~"unmatched|/healthz|/readyz"}[30d]))
  ) / 0.001
)
```

A query over 30 days of raw data is expensive; in production compute it
from a recording rule, or from long-term storage such as Mimir or Thanos,
and show it as the headline panel on the service dashboard.

### An SLO document for TaskFlow API

```yaml
# docs/slo/taskflow-api.yaml (team-owned, reviewed quarterly)
service: taskflow-api
owner: tasks-team
window: rolling 30 days
user_journeys:
  - name: create and list tasks
    endpoints: ["POST /tasks", "GET /tasks", "GET /tasks/:id", "PATCH /tasks/:id"]
slos:
  - name: availability
    sli: share of valid requests that do not return 5xx, measured at the ingress
    valid_events: all API requests except health checks and synthetic probes
    objective: 99.9%
    error_budget: 0.1% of requests (about 50,000 per 30 days at current traffic)
  - name: latency
    sli: share of valid requests served in under 300 ms, measured at the ingress
    objective: 99%
rationale: >
  Current performance over the last quarter is 99.95% availability and 99.4% under
  300 ms. Targets leave headroom for planned migrations. The managed database
  plan's SLA is stricter than 99.9%, so it does not cap these objectives.
alerting: multiwindow multi-burn-rate (14.4 / 6 page, 1 ticket), see taskflow-slo-alerts.yml
error_budget_policy: docs/slo/error-budget-policy.md
dashboard: https://grafana.example.com/d/taskflow-slo
review: quarterly, or after any incident consuming more than 20% of the budget
```

The format is illustrative; the content follows the structure of the SRE
Workbook's example document. The OpenSLO project defines a standard YAML
schema for the same information if you want tooling to read it.

## Best practices

- Write SLIs as good events divided by valid events, measured as close to
  users as practical.
- Pick two or three SLIs per critical user journey; leave the rest to
  dashboards.
- Set SLOs from measured current performance and real user needs, never
  100%, and keep SLAs looser than SLOs.
- Use request-based SLOs for APIs; time-based ones hide partial failures.
- Align histogram buckets with latency SLO thresholds.
- Alert on burn rate with long and short windows; page only for fast
  burns.
- Agree an error budget policy in advance with product leadership, and
  follow it.
- Version the SLO document with the service and review it regularly.
- Report budget remaining on the main dashboard and in planning
  meetings.

## In production

- **The SLO dashboard is green while customers complain.**
  *Detect:* support tickets and social media reports of errors, while the
  application-level SLI stays above target. *Cause:* the SLI is measured in
  the app, so requests that fail before reaching it (crashed pods, ingress
  timeouts, DNS or certificate problems) are invisible. *Fix:* measure at
  the load balancer or ingress, add synthetic checks from outside, and
  include those failures in the SLI.
- **The burn-rate page fires every night for a few minutes.**
  *Detect:* repeated short pages at low-traffic hours, each with a handful
  of failed requests. *Cause:* tiny denominators make a few errors look
  like a high error ratio. *Fix:* add a minimum event count to the alert,
  generate steady synthetic traffic, or use longer windows for low-traffic
  services.
- **The budget is always exhausted, and nothing changes.**
  *Detect:* budget remaining sits at zero for months while features keep
  shipping. *Cause:* an SLO set above what the system can deliver, or no
  error budget policy with agreed consequences. *Fix:* reset the target to
  measured performance, agree a policy with leadership, and invest in the
  top causes of budget burn.
- **The budget is never touched, and the team is still afraid to deploy.**
  *Detect:* 95% of the budget remains every month, yet releases are slow
  and heavily gated. *Cause:* the SLO is looser than needed, or the team is
  not using the budget as permission. *Fix:* spend it deliberately on
  faster releases and experiments, or tighten the SLO if users need more.
- **Latency SLI values jump when the dashboard is changed from 5m to 1h.**
  *Detect:* the "requests under 300 ms" ratio looks different across
  panels and the alert disagrees with the dashboard. *Cause:* the
  histogram has no bucket at 0.3 s, so the ratio is interpolated, or
  panels average ratios instead of dividing summed rates. *Fix:* add a
  `le="0.3"` bucket and compute ratios as `sum(rate(good[1h])) /
  sum(rate(valid[1h]))`, with the same range for both.
- **A dependency outage burns the whole budget and the team argues about
  whether it counts.**
  *Detect:* a postmortem debate over excluding the incident. *Cause:* the
  SLO document did not define how dependency failures are treated.
  *Fix:* users felt it, so it counts; record the decision in the SLO
  document and invest in redundancy or graceful degradation for that
  dependency.

## Important terminology

- **SLI:** A measured indicator of service level, usually good events /
  valid events.
- **SLO:** A target value for an SLI over a time window.
- **SLA:** A contract with customers that includes consequences for missing
  a target.
- **Error budget:** `1 - SLO`; the allowed amount of failure in the window.
- **Burn rate:** Observed error ratio divided by the error budget ratio; 1
  means on budget.
- **Rolling window:** A window that moves with time (the last 30 days), as
  opposed to a calendar month.
- **Error budget policy:** Agreed actions taken as the budget is consumed.
- **Multiwindow, multi-burn-rate alert:** An alert that requires both a
  long and a short window to exceed a burn-rate threshold, at several
  severities.
- **The nines:** Shorthand for availability levels (three nines = 99.9%).

## Common mistakes and misconceptions

- Targeting 100%, which forbids change and is impossible anyway.
- Using SLA numbers as internal SLOs, leaving no margin before contractual
  breaches.
- Measuring SLIs only inside the app.
- Averaging latency instead of using thresholds and histograms.
- Having dozens of SLOs, so none of them drives decisions.
- Alerting on raw error ratios with a short `for:` instead of burn rates.
- Computing nines wrongly: 99.9% is 43 minutes a month, not 4.3, and
  99.99% is about 4 minutes, not 43.
- Defining SLOs and never agreeing what happens when they are missed.
- Treating error budgets as a quota to be avoided rather than spent.

## Revision questions

1. Explain the difference between an SLI, an SLO, and an SLA with a
   TaskFlow example of each. Why must the SLA be looser than the SLO?
2. How much full downtime does a 99.95% SLO allow in 30 days, and in a
   year? (21 min 36 s; about 4.38 hours.)
3. TaskFlow serves 80 million requests in 30 days with a 99.9% SLO. How
   many requests may fail? A 25-minute outage at 40 requests per second
   uses what share of that budget? (80,000; 25 x 60 x 40 = 60,000, which
   is 75%.)
4. The current error ratio is 0.3% on a 99.9% SLO. What is the burn rate,
   and when will a fresh budget run out? (3; in 10 days.)
5. Where does the burn-rate threshold 14.4 come from, and why does the
   alert need both a 1-hour and a 5-minute window?
6. Why should the availability SLI be measured at the ingress rather than
   inside the Express app?
7. Should a `429 Too Many Requests` count as a good or bad event? Argue
   both sides.
8. What should an error budget policy say, and who must agree to it?

## Further learning

- [Google SRE book: Service Level Objectives](https://sre.google/sre-book/service-level-objectives/)
- [Google SRE Workbook: Implementing SLOs](https://sre.google/workbook/implementing-slos/)
- [Google SRE Workbook: Alerting on SLOs](https://sre.google/workbook/alerting-on-slos/)
- [Google SRE Workbook: Example error budget policy](https://sre.google/workbook/error-budget-policy/)
- [OpenSLO specification](https://openslo.com/)
- [Sloth: SLO generator for Prometheus](https://sloth.dev/)
- Next: [alerting and on-call](alerting-and-on-call.md). Back to the
  [monitoring and logging overview](../monitoring-and-logging.md).
