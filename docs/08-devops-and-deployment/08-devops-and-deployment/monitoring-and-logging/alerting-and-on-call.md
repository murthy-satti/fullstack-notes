# Alerting and On-Call

An alert is a decision, made in advance, that a condition deserves a
human's attention. Paging someone at 3 a.m. is the most expensive thing a
monitoring system can do, so every alert has to earn it. This lesson
covers alerting on symptoms rather than causes, the difference between a
page and a ticket, severity levels, how to keep alerts actionable and avoid
alert fatigue, how Alertmanager groups, deduplicates, inhibits, and routes
alerts, why every alert needs a runbook, and how to run a humane on-call
rotation: handoffs, escalation policies, follow-the-sun, and the metrics
that show whether on-call is healthy.

## Why it matters

Bad alerting fails in two directions. Too few alerts and users discover
outages before you do. Too many and engineers learn to ignore them: when
nine pages out of ten need no action, the tenth (the real one) is
acknowledged and snoozed like the rest. Alert fatigue is a major
reliability risk, and it also burns people out and makes on-call something
everyone avoids.

Good alerting is small and precise. A team running TaskFlow API should be
paged only when users are being hurt, or are about to be, and something
can be done about it now. Everything else becomes a ticket, a dashboard, or
automation. Combined with a fair rotation and good runbooks, that makes
on-call sustainable.

## Real-world usage

- **Google SRE (philosophy of paging).** The chapter
  [Monitoring Distributed Systems](https://sre.google/sre-book/monitoring-distributed-systems/)
  says pages should be urgent, actionable, and require human intelligence,
  and that you should page on symptoms rather than causes; anything that
  can be handled by a robot should not page a human.
- **Google SRE (being on-call).** The chapter
  [Being On-Call](https://sre.google/sre-book/being-on-call/) describes
  primary and secondary rotations, caps the share of time an engineer
  spends on-call, and sets a target of at most two incidents per 12-hour
  shift so each incident gets proper follow-up.
- **Prometheus.** The project's
  [alerting best practices](https://prometheus.io/docs/practices/alerting/)
  recommend keeping alerting simple, alerting on symptoms associated with
  end-user pain, alerting on latency and errors as high in the stack as
  possible, and having consoles that let you find the cause.
- **PagerDuty Incident Response.** PagerDuty's public
  [incident response documentation](https://response.pagerduty.com/),
  including [Being On-Call](https://response.pagerduty.com/oncall/being_oncall/),
  describes on-call responsibilities, acknowledgement expectations,
  handoffs, and escalation in a form many companies adopt.

**Popular tools and providers:** Prometheus Alertmanager, Grafana
Alerting, PagerDuty, Jira Service Management, incident.io, Splunk On-Call,
and cloud-native alarms such as Amazon CloudWatch alarms with SNS.

## How it works

### Alert on symptoms, not causes

A **symptom** is something a user experiences: errors, slowness, missing
data. A **cause** is a reason it might happen: high CPU, a full disk, a
restarted pod. Causes are many, change with the architecture, and often do
not hurt anyone. Symptoms are few and always matter.

| Cause-based alert (avoid paging) | Symptom-based alert (page) |
|---|---|
| CPU above 90% on an API pod | Error budget burning 14x too fast |
| One of six pods restarted | p99 latency above SLO for the create-task journey |
| MongoDB replica lag above 10 s | Synthetic "create and read a task" check failing from two regions |
| Queue depth above 1,000 | Reminder emails more than 15 minutes late (freshness SLI) |
| Memory above 80% | Public TLS certificate expires in under 7 days with renewal failing |

Cause-based signals are still valuable: they belong on dashboards, in
tickets (a disk that will fill in five days), and in the runbook as
diagnosis steps. The exception is a cause that predicts imminent,
unavoidable user pain with no slack, such as a disk that will be full in
two hours; that can page.

### Pages, tickets, and dashboards

The SRE book describes three kinds of monitoring output:

| Output | Meaning | Response time | TaskFlow examples |
|---|---|---|---|
| **Page** | A human must act now | Minutes, any hour | Fast error budget burn, site down from outside, data loss risk |
| **Ticket** | A human must act, but not now | Hours to days, working hours | Slow budget burn, certificate expiring in 20 days, disk full in 5 days, backup job failed once |
| **Dashboard or log** | Nobody needs to act; useful for diagnosis | Never, unless investigating | CPU, memory, individual pod restarts, cache hit ratio |

Most alerts people create should be tickets or dashboard panels. A
practical rule: if the right response is "look at it tomorrow", it must not
page tonight.

### Severity levels

Severity labels on alerts drive routing. Keep the scheme small and
written down:

| Severity | Definition | Routing |
|---|---|---|
| `page` (critical) | User-facing SLO at risk now; needs action within minutes | Pager service, primary on-call, escalation |
| `ticket` (warning) | Will become user-facing if ignored for days | Ticket queue for the owning team |
| `info` | Context only | Chat channel or dashboard, no notification |

Do not invent more levels than you route differently; five severities that
all go to the same channel are one severity.

### Actionable alerts and alert fatigue

![Diagram: a flowchart for a detected condition. Are users hurt, or about to be? If no: dashboard only, no alert, for example CPU at 80% while the SLO is fine. If yes: does it need a human within minutes? If no: a ticket to fix during work hours, for example a disk that will be full in 5 days. If yes: can the responder act on it? If no: automate the fix or delete the alert, for example restarting a stuck worker automatically. If yes: is it new, with nothing else already paging for it? If no: group or inhibit it in Alertmanager, for example 40 pods alerting for one database outage. If yes: page the on-call engineer with a runbook link and a dashboard.](should-this-page.svg)

Every paging alert should pass four tests:

1. **Urgent:** waiting until morning would hurt users or the business.
2. **Actionable:** the responder can do something (mitigate, roll back,
   fail over, scale), and the runbook says what.
3. **Requires judgement:** if the fix is a fixed script, automate it
   instead of paging.
4. **Novel:** it is not a duplicate of another page for the same problem.

Alert fatigue builds up from small exceptions: a flapping alert nobody
fixed, a threshold set on a quiet week, a duplicate per pod. Counter it
with process:

- **Review every page** in a weekly on-call review: was it actionable?
  If not, fix, downgrade, or delete the alert that week.
- **Track the actionable rate**: the share of pages that led to a real
  action. A healthy target is well above half; anything near zero means
  the alert is noise.
- **Use `for:` to require a condition to persist** (for example 5 minutes)
  for threshold alerts, so momentary spikes do not page. SLO burn-rate
  alerts already have this built into their windows.
- **Delete alerts nobody would miss.** An alert that has not fired in a
  year and has no clear owner is not protection, it is clutter.

### The alerting pipeline

![Diagram: Prometheus evaluates rules and sends firing alerts with severity and service labels to an Alertmanager cluster, where they are 1) deduplicated, 2) grouped by alertname and service, 3) inhibited so pages hide related tickets, 4) silenced for planned maintenance (an engineer adds silences), and 5) routed by the severity label. The default route goes to the team chat channel with no page, severity=ticket goes to a ticket queue for the next business day, and severity=page goes to the pager service by phone call and push. Defaults are group_wait 30s, group_interval 5m, repeat_interval 4h. The pager notifies the primary on-call, who acknowledges within 5 minutes; with no acknowledgement the secondary is paged after 5 minutes and the engineering manager after 15 minutes.](alert-routing-pipeline.svg)

**Alerting rules** live in Prometheus (or Grafana, or a cloud provider).
Each rule has an expression, an optional `for` duration (the condition
must hold that long; until then the alert is *pending*), optional
`keep_firing_for` (keeps it firing briefly after the condition clears, to
avoid flapping), labels such as `severity`, and annotations such as
`summary` and `runbook_url`.

**Alertmanager** receives firing alerts from one or more Prometheus
servers and decides who hears about them:

- **Deduplication:** run two Prometheus servers for redundancy and both
  send the same alert; Alertmanager notifies once. Run Alertmanager itself
  as a small cluster (two or three instances) that shares state.
- **Grouping:** `group_by: [alertname, service]` turns 40 pod-level alerts
  into one notification. `group_wait` (default 30 s) waits to collect the
  first batch, `group_interval` (default 5 m) controls updates to an
  existing group, and `repeat_interval` (default 4 h) re-sends while it is
  still firing.
- **Inhibition:** suppress some alerts while others fire. If "TaskFlow API
  down" is paging, the latency and error-budget alerts for the same
  service add nothing.
- **Silences:** temporary, time-limited mutes created by people (in the
  UI or with `amtool`) during maintenance or while an incident is already
  being worked. Every silence should have an author, a comment, and an
  expiry.
- **Routing:** a tree of matchers on labels sends each group to a
  **receiver** (pager, ticket webhook, chat, email).

### Runbook links in every alert

A page at 3 a.m. should never leave the responder wondering what it means.
Every alert carries a `runbook_url` annotation pointing to a page that
answers:

1. **What this alert means**, in one sentence, and what users experience.
2. **Impact and urgency:** which journeys and how badly.
3. **Dashboards and queries** to open first (linked, with the right
   variables).
4. **Diagnosis steps:** the likely causes, how to tell them apart.
5. **Mitigation:** the safe actions, such as rolling back the last deploy,
   scaling out, failing over, disabling a feature flag, in order of
   preference.
6. **Escalation:** who to call when the runbook does not work.

Runbooks are reviewed after every incident that used them, and an alert
without a runbook is not allowed to page.

### On-call rotations and handoffs

A rotation is the schedule of who responds:

- **Primary and secondary:** the primary responds to pages; the secondary
  backs up the primary (escalation) and takes over if the primary is
  overloaded or unreachable.
- **Shift length:** commonly one week, handing over on a weekday morning
  so the handoff happens during work hours.
- **Team size:** with fewer than about six to eight people in a rotation,
  each person is on-call too often; small teams share a rotation with a
  neighbouring team or buy time with better automation.
- **Handoffs:** a short written note (or meeting) at every change of
  shift: open incidents, active silences and why, noisy alerts, risky
  changes scheduled, anything half-finished.
- **Compensation and recovery:** time off after a night of pages, and pay
  or time in lieu for being on-call, are part of a sustainable rotation.

### Escalation policies

An **escalation policy** says what happens when a page is not
acknowledged: page the primary; if no acknowledgement in 5 minutes, page
the secondary; after 15 minutes, page the engineering manager. It ensures
that a dead phone battery or a missed vibration does not turn a 10-minute
incident into a 2-hour one. Acknowledgement only means "I am on it"; the
responder then works the problem or declares an incident (see
[incident response and postmortems](incident-response-and-postmortems.md)).

### Follow-the-sun

Teams spread across time zones can split the day so nobody is paged at
night: for example, a team in Europe covers 08:00 to 16:00 UTC, one in the
Americas 16:00 to 24:00, and one in Asia-Pacific 00:00 to 08:00. This
removes night pages but needs at least two or three sites with real
expertise in the service, consistent runbooks, and excellent handoffs at
each boundary.

### On-call health metrics

Measure on-call like any other system:

| Metric | What it tells you | Healthy signal |
|---|---|---|
| Pages per shift | Load on the responder | Low single digits per week; at most about two incidents per 12-hour shift |
| Pages outside working hours | Sleep disruption | Trending down |
| Actionable rate | Alert quality | Most pages led to action |
| Time to acknowledge (MTTA) | Responsiveness and paging reliability | A few minutes |
| Time to mitigate | Effectiveness of runbooks and tooling | Trending down |
| Top alerts by count | Where to invest | The top three are fixed or deleted each quarter |
| Repeat incidents | Whether follow-ups get done | Rare |

## When to use and when not to use

| Condition | Action |
|---|---|
| SLO burn rate fast (14.4x or 6x) | Page |
| Service unreachable from external probes in two or more regions | Page |
| SLO burn rate slow (1x over days) | Ticket |
| Certificate expires in under 21 days | Ticket; page only if under 7 days and renewal is failing |
| Disk will be full within 4 hours at current rate | Page (imminent, no slack) |
| Disk will be full within 5 days | Ticket |
| One pod restarting, others healthy and SLO fine | Dashboard; ticket if it persists |
| CPU or memory high, SLO fine | Dashboard |
| Backup job failed once | Ticket; page if no successful backup for over 26 hours on a critical database |
| Prometheus or Alertmanager itself is down | Page through an external watchdog |

## Practical examples

### Prometheus alerting rules

```yaml
# prometheus/rules/taskflow-alerts.yml
groups:
  - name: taskflow-availability
    rules:
      - alert: TaskflowApiDown
        expr: sum(up{job="taskflow-api"}) == 0 or absent(up{job="taskflow-api"})   # absent(): no targets discovered at all
        for: 2m
        labels:
          severity: page
          service: taskflow-api
        annotations:
          summary: "No TaskFlow API instance can be scraped"
          runbook_url: "https://runbooks.example.com/taskflow-api/api-down"

      - alert: TaskflowSyntheticCheckFailing
        # Blackbox exporter probes from several regions; page only when two or more fail.
        expr: count(probe_success{job="blackbox-taskflow"} == 0) >= 2
        for: 3m
        labels:
          severity: page
          service: taskflow-api
        annotations:
          summary: "External probes failing from {{ $value }} regions"
          runbook_url: "https://runbooks.example.com/taskflow-api/synthetic-failing"

  - name: taskflow-capacity
    rules:
      - alert: TaskflowDbDiskFullSoon
        expr: predict_linear(node_filesystem_avail_bytes{job="node", mountpoint="/var/lib/mongodb"}[6h], 5 * 86400) < 0
        for: 30m
        labels:
          severity: ticket
          service: taskflow-db
        annotations:
          summary: "MongoDB data disk on {{ $labels.instance }} will be full within 5 days"
          runbook_url: "https://runbooks.example.com/taskflow-db/disk-full"

      - alert: TaskflowCertificateExpiringSoon
        expr: (probe_ssl_earliest_cert_expiry{job="blackbox-taskflow"} - time()) / 86400 < 21
        for: 1h
        labels:
          severity: ticket
          service: taskflow-api
        annotations:
          summary: "TLS certificate for {{ $labels.instance }} expires in {{ $value | humanize }} days"
          runbook_url: "https://runbooks.example.com/taskflow-api/certificate-expiry"

  - name: meta
    rules:
      - alert: Watchdog
        # Always firing. An external service pages if it STOPS receiving this.
        expr: vector(1)
        labels:
          severity: none
        annotations:
          summary: "Alerting pipeline heartbeat"
```

The SLO burn-rate pages from
[SLIs, SLOs, and error budgets](slis-slos-and-error-budgets.md) are the
main symptom alerts; these rules cover total outages, outside-in checks,
capacity tickets, and the pipeline itself. `predict_linear` extrapolates
the last 6 hours of free space 5 days ahead. The `Watchdog` alert is a
dead man's switch: it proves the whole path from Prometheus to the
receiver works, and its absence is what pages.

### Alertmanager routing, grouping, and inhibition

```yaml
# alertmanager/alertmanager.yml
global:
  resolve_timeout: 5m

route:
  receiver: team-chat            # default: anything not matched below
  group_by: [alertname, service]
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h
  routes:
    - matchers: ['alertname="Watchdog"']
      receiver: heartbeat
      group_interval: 1m           # repeats are only sent at group_interval ticks
      repeat_interval: 1m
    - matchers: ['severity="page"']
      receiver: taskflow-pager
      repeat_interval: 1h
    - matchers: ['severity="ticket"']
      receiver: taskflow-tickets
      repeat_interval: 24h

inhibit_rules:
  # While the API is completely down, its other alerts add nothing.
  - source_matchers: ['alertname="TaskflowApiDown"']
    target_matchers: ['alertname!="TaskflowApiDown"', 'service="taskflow-api"']
    equal: [service]
  # A page for a service hides that service's tickets.
  - source_matchers: ['severity="page"']
    target_matchers: ['severity="ticket"']
    equal: [service]

receivers:
  - name: taskflow-pager
    pagerduty_configs:
      - routing_key_file: /etc/alertmanager/secrets/pagerduty-routing-key
        severity: critical
  - name: taskflow-tickets
    webhook_configs:
      - url: https://tickets.example.com/hooks/alertmanager
  - name: team-chat
    slack_configs:
      - api_url_file: /etc/alertmanager/secrets/slack-webhook-url
        channel: "#taskflow-alerts"
        send_resolved: true
  - name: heartbeat
    webhook_configs:
      - url: https://heartbeat.example.com/ping/<check-id>
```

Parts: the route tree matches top to bottom and stops at the first
matching child; `group_by` keeps one notification per alert name and
service; the inhibit rules mute duplicates while a bigger alert is
firing; secrets (the PagerDuty routing key and chat webhook URL) are read
from files mounted from a secret store, not written in the config; the
heartbeat receiver pings an external dead man's switch service every
minute. Alertmanager rounds `repeat_interval` up to a multiple of
`group_interval`, so the heartbeat route lowers both; with the inherited
5-minute `group_interval` it would ping only every 5 minutes.

### Validating and testing alerts

```bash
# Syntax and semantic checks, run in CI on every change
promtool check rules prometheus/rules/*.yml
amtool check-config alertmanager/alertmanager.yml

# Unit tests for alert rules
promtool test rules prometheus/tests/taskflow-alerts.test.yml

# Show which receiver an alert with these labels would reach
amtool config routes test --config.file=alertmanager/alertmanager.yml severity=page service=taskflow-api

# Silence an alert during planned maintenance, with an expiry and a reason
amtool silence add alertname=TaskflowDbDiskFullSoon service=taskflow-db \
  --duration=2h --comment="Disk resize in progress (change 4821)" \
  --alertmanager.url=http://alertmanager:9093
```

```yaml
# prometheus/tests/taskflow-alerts.test.yml
rule_files:
  - ../rules/taskflow-alerts.yml

evaluation_interval: 1m

tests:
  - interval: 1m
    input_series:
      - series: 'up{job="taskflow-api", instance="api-1:9464"}'
        values: "1 1 0 0 0 0 0"
      - series: 'up{job="taskflow-api", instance="api-2:9464"}'
        values: "1 1 0 0 0 0 0"
    alert_rule_test:
      - eval_time: 3m
        alertname: TaskflowApiDown
        exp_alerts: []          # down for 1 minute: still pending
      - eval_time: 5m
        alertname: TaskflowApiDown
        exp_alerts:
          - exp_labels:
              severity: page
              service: taskflow-api
            exp_annotations:
              summary: "No TaskFlow API instance can be scraped"
              runbook_url: "https://runbooks.example.com/taskflow-api/api-down"
```

Testing alerts in CI catches typos in label names (which silently route a
page to the wrong place) and checks that `for` durations behave as
intended.

### A handoff note template

```text
On-call handoff: taskflow, week 46 (primary: <name>, secondary: <name>)

Open incidents:        none / INC-123 (status, next step, owner)
Active silences:       TaskflowDbDiskFullSoon until Thu 14:00 (disk resize, change 4821)
Pages this week:       6 (4 actionable). Noisy: TaskflowSyntheticCheckFailing from ap-south (ticket TF-881)
Risky changes ahead:   MongoDB 8.0 upgrade Wed 10:00 UTC, rollback plan in change 4830
Follow-ups for review: runbook for certificate expiry was out of date (fixed), ticket TF-879
```

## Best practices

- Page on symptoms tied to SLOs; send causes to dashboards and tickets.
- Make every page urgent, actionable, judgement-requiring, and novel.
- Require a `runbook_url` and a dashboard link on every paging alert.
- Use a small, written severity scheme that maps one-to-one to routing.
- Group and inhibit aggressively so one problem produces one page.
- Run Prometheus and Alertmanager redundantly, and watch them with an
  external dead man's switch.
- Test rules and routes in CI with `promtool` and `amtool`.
- Review every page weekly; fix or delete non-actionable alerts that week.
- Keep rotations large enough, hand off in writing, compensate on-call,
  and give recovery time after bad nights.
- Track pages per shift, actionable rate, and time to acknowledge.

## In production

- **The on-call engineer receives 40 pages in 2 minutes for one outage.**
  *Detect:* the pager history shows one page per pod and per alert for a
  single database failure. *Cause:* `group_by` includes `instance` or
  `pod`, or no inhibition from the root-cause alert. *Fix:* group by
  `alertname` and `service`, add inhibit rules from "service down" to its
  dependent alerts, and alert on service-level symptoms rather than
  per-pod conditions.
- **A real outage was acknowledged and ignored.**
  *Detect:* the postmortem timeline shows the page acknowledged within a
  minute but no action for 30 minutes. *Cause:* alert fatigue: the same
  alert had fired and self-resolved dozens of times that month. *Fix:*
  measure the actionable rate per alert, fix or delete flapping alerts,
  and tie paging to SLO burn rates.
- **Nobody was paged during a full outage.**
  *Detect:* users reported the outage; the alert history shows the rule
  firing but no notification sent. *Cause:* Alertmanager was down, its
  pager secret had expired, or a route matcher had a typo in the severity
  label. *Fix:* an external dead man's switch on a `Watchdog` alert,
  `amtool config routes test` in CI, and a periodic end-to-end test page.
- **Alerts keep firing after the problem is fixed.**
  *Detect:* the dashboard shows recovery, but the alert stays firing for
  an hour and re-pages. *Cause:* a long-window expression without a short
  window, or a `repeat_interval` that is too short for the receiver.
  *Fix:* use multiwindow burn-rate rules, and set repeat intervals per
  route.
- **A silence outlived the maintenance and hid a real failure.**
  *Detect:* an incident review finds a matching silence created days
  earlier with no expiry note. *Cause:* broad silences (matching a whole
  service) with long durations. *Fix:* narrow matchers, short expiries,
  mandatory comments, and active silences listed in every handoff.
- **On-call engineers burn out and leave the rotation.**
  *Detect:* rising pages outside working hours, people swapping shifts,
  and repeat incidents. *Cause:* noisy alerts, small rotations, and no
  time to fix root causes. *Fix:* cap on-call load, prioritize the top
  noisy alerts in planning, enlarge or merge rotations, and give recovery
  time.

## Important terminology

- **Alert rule:** An expression evaluated periodically; when true (for the
  `for` duration), it fires.
- **Pending / firing:** States of an alert before and after its `for`
  duration has elapsed.
- **Page:** A notification that interrupts a person immediately.
- **Ticket:** A tracked task for non-urgent follow-up.
- **Symptom / cause:** What users experience versus why it happens.
- **Grouping:** Combining related alerts into one notification.
- **Inhibition:** Suppressing alerts while a related, more important alert
  fires.
- **Silence:** A time-limited, manual mute of matching alerts.
- **Runbook:** A document describing how to diagnose and mitigate a
  specific alert.
- **Escalation policy:** Rules for who is notified when a page is not
  acknowledged.
- **Follow-the-sun:** Splitting on-call across time zones to avoid night
  shifts.
- **Dead man's switch:** An always-firing alert whose absence triggers
  notification, proving the pipeline works.
- **MTTA / MTTR:** Mean time to acknowledge, and to restore or resolve.

## Common mistakes and misconceptions

- Paging on CPU, memory, or individual pod restarts.
- Thinking that more alerts mean better coverage.
- Alerts without runbooks, owners, or links to dashboards.
- Copying thresholds from a blog post instead of deriving them from SLOs.
- Grouping by `instance`, producing one page per pod.
- Silences without expiry or comments.
- Monitoring the alerting system with itself.
- Treating on-call as a punishment, or expecting one person to carry it
  alone.
- Muting a noisy alert instead of fixing or deleting it.

## Revision questions

1. Give two cause-based alerts and rewrite each as a symptom-based alert
   for TaskFlow API.
2. What four properties should every paging alert have?
3. Explain Alertmanager's grouping, inhibition, and silences with an
   example of each.
4. What do `group_wait`, `group_interval`, and `repeat_interval` control?
5. What belongs in a runbook linked from an alert?
6. A rotation of five engineers takes weekly shifts. How many weeks a year
   is each person on-call as primary, and why might that be too much?
   (52 / 5 = about 10.4 weeks, one week in five, which leaves little
   time to recover and is often combined with secondary duty as well.)
7. In one week the primary received 18 pages, 11 outside working hours,
   and 5 led to an action. What would you change first?
8. Why does a `Watchdog` alert need an external receiver?

## Further learning

- [Prometheus: Alerting rules](https://prometheus.io/docs/prometheus/latest/configuration/alerting_rules/)
- [Prometheus: Alertmanager configuration](https://prometheus.io/docs/alerting/latest/configuration/)
- [Prometheus: Unit testing for rules](https://prometheus.io/docs/prometheus/latest/configuration/unit_testing_rules/)
- [Google SRE Workbook: On-Call](https://sre.google/workbook/on-call/)
- [Google SRE book: Being On-Call](https://sre.google/sre-book/being-on-call/)
- [PagerDuty Incident Response: Being On-Call](https://response.pagerduty.com/oncall/being_oncall/)
- Next: [error tracking and uptime monitoring](error-tracking-and-uptime-monitoring.md).
  Back to the [monitoring and logging overview](../monitoring-and-logging.md).
