# Incident Response and Postmortems

Alerts and dashboards tell you something is wrong. What happens next, in
the minutes when users are affected and everyone is under pressure,
decides whether an outage lasts ten minutes or three hours. Incident
response is the practised process for that moment: declare the incident,
assign clear roles, communicate on a schedule, mitigate first, and fix the
root cause later. The **postmortem** afterwards turns the incident into
lasting improvements without blaming individuals. This lesson covers what
counts as an incident, severity levels, the lifecycle (detect, triage,
mitigate, resolve, learn), roles, communication, blameless postmortems
with a complete worked example, the "5 whys" and its limits, and tracking
action items to completion.

## Why it matters

Unmanaged incidents follow a familiar pattern: five engineers debug in
parallel in different directions, two of them restart the same service,
nobody updates customers, the support team learns about the outage from
social media, and the one person who knows the database is not told. The
technical problem may be simple; the coordination failure makes it long.
Google's SRE book opens its incident chapter with exactly such a story.

After the incident, the instinct is to find who made the mistake. That
teaches people to hide mistakes, so the next postmortem has less
information and the same failure happens again. Organizations that learn
fastest from failure treat incidents as evidence about the *system*
(tooling, processes, defaults, alerts) and fix that.

## Real-world usage

- **Google SRE (managing incidents).** The chapter
  [Managing Incidents](https://sre.google/sre-book/managing-incidents/)
  describes an incident management process based on the Incident Command
  System, with separate incident commander, operations, communication, and
  planning roles, a live incident document, and clear handoffs.
- **Google SRE (postmortem culture).** The chapter
  [Postmortem Culture: Learning from Failure](https://sre.google/sre-book/postmortem-culture/)
  explains blameless postmortems, when to write them, and how to review
  and share them; the book also includes an
  [example postmortem](https://sre.google/sre-book/example-postmortem/).
- **PagerDuty Incident Response.** PagerDuty's open documentation on
  [incident roles](https://response.pagerduty.com/before/different_roles/)
  defines the incident commander, deputy, scribe, subject matter experts,
  and customer and internal liaisons, and is widely reused as a starting
  point.
- **Public postmortems.** GitLab's
  [postmortem of its January 31, 2017 database outage](https://about.gitlab.com/blog/2017/02/10/postmortem-of-database-outage-of-january-31/)
  and Amazon's
  [summary of the February 2017 S3 disruption](https://aws.amazon.com/message/41926/)
  show real timelines, contributing factors, and action items. The AWS
  summary also notes that the service health dashboard itself could not be
  updated at first because it depended on the failing service.

**Popular tools and providers:** PagerDuty, incident.io, FireHydrant,
Rootly, Jira Service Management, Atlassian Statuspage, chat tools (Slack,
Microsoft Teams) with incident channels, and shared documents for the
live incident record.

## How it works

### What counts as an incident

An **incident** is an unplanned event that disrupts or threatens a service
and needs a coordinated response. Write the declaration criteria down so
nobody has to argue in the moment. For TaskFlow, declare an incident when
any of these is true:

- A user-facing SLO is burning fast (a burn-rate page fired), or users
  cannot complete a core journey (sign in, create or view tasks).
- Data may be lost, corrupted, or exposed, or there is a suspected
  security breach.
- The problem needs more than one person or team to fix.
- It is not clearly mitigated within 15 to 30 minutes of the first page.

The rule of thumb from experienced teams: **declare early, downgrade
later**. Declaring costs a channel and a few messages; not declaring costs
coordination when it matters most.

### Severity levels

| Severity | Definition | TaskFlow example | Response |
|---|---|---|---|
| **SEV1** (critical) | Most users cannot use the product, data loss or a security breach | API down for everyone; tasks deleted | All hands; IC and comms lead immediately; status page within 15 minutes; updates every 30 minutes; executive notification |
| **SEV2** (major) | A core feature broken or severely degraded for many users | Creating tasks fails for 30% of requests | IC and responders; status page; updates every 30 to 60 minutes |
| **SEV3** (minor) | Partial degradation with a workaround, or a small group affected | Reminder emails delayed by 20 minutes | On-call handles in working hours; internal updates |
| **SEV4** (low) | Cosmetic or internal-only issues | An admin report is slow | Normal ticket |

Severity can change during an incident; say so explicitly in the channel
when it does. Severity drives response, communication, and whether a
postmortem is required, not blame.

### The incident lifecycle

![Diagram: five phases in order: Detect (alert, probe, or customer report), Triage (declare, set severity, assign roles), Mitigate (stop user impact: roll back, fail over), Resolve (fix the cause, verify, close), and Learn (postmortem, action items), with a dashed loop from Learn back to Detect because action items improve detection, response, and prevention. Below, an example TaskFlow SEV2 after a bad deploy, in UTC and not to scale: 14:02 deploy 1.42.0; 14:05 the alert fires; 14:08 acknowledged; 14:12 SEV2 declared; 14:29 dropping a faulty index mitigates; 15:40 fix shipped and resolved; two days later the postmortem review. Detection took 3 minutes, response and mitigation 24 minutes, and users were affected for 27 minutes.](incident-lifecycle.svg)

1. **Detect.** An alert, a synthetic check, an error-tracker spike, or a
   customer report. Good monitoring makes this minutes, not hours.
2. **Triage.** Acknowledge, assess impact, declare the incident, set the
   severity, open the incident channel, and assign an incident commander.
3. **Mitigate.** Stop or reduce user impact as fast as possible, even
   before the cause is understood.
4. **Resolve.** Fix the underlying cause (or make the mitigation
   permanent), verify the SLIs are back to normal, and close the incident.
5. **Learn.** Write and review a blameless postmortem, and complete its
   action items.

Measure the clocks: **time to detect** (impact start to first alert),
**time to acknowledge**, **time to mitigate** (impact start to user
impact ending), and **time to resolve**. "MTTR" is used for both
"mitigate/restore" and "resolve", so define which you mean.

### Roles

![Diagram: the incident commander is at the centre and coordinates and decides but does not debug. They exchange tasks and status with the operations lead, who directs the fix with subject experts for the database, app, and network. They give facts and the next update time to the communications lead, who owns all updates and posts to the status page for customers every 30 minutes and briefs support and leadership. Decisions go to the scribe, who records the timeline. Every update goes to the incident channel and shared document, the single record.](incident-roles-communication.svg)

| Role | Responsibilities | Does not |
|---|---|---|
| **Incident commander (IC)** | Owns the incident: sets priorities, assigns work, makes decisions (roll back or not), keeps the big picture, declares severity changes and the end of the incident, hands off explicitly | Debug or type commands; that is how coordination gets lost |
| **Communications lead** | Writes status page updates and internal briefings on a fixed cadence, handles support and stakeholder questions, shields responders from interruptions | Speculate about causes in public |
| **Operations lead and subject matter experts** | Investigate and change production: roll back, fail over, scale, run queries; report findings to the IC | Make large changes without telling the IC |
| **Scribe** | Keeps the timeline in the incident document: what was observed, decided, and done, with UTC timestamps | Filter out "unimportant" events; the postmortem needs them |

In a small team, the first responder is IC until someone takes over, and
one person may hold several roles in a SEV3. For SEV1 and SEV2, separate
the IC from the people fixing. Handoffs are explicit ("I am handing IC to
Priya; Priya, please confirm"), and long incidents rotate people before
they are exhausted.

### Communication

Communication has two audiences with different needs:

- **Internal (the incident channel):** every observation, hypothesis,
  action, and decision, posted in one place so newcomers can catch up by
  reading. Side conversations in direct messages are how facts get lost.
- **External (status page, customer support, leadership):** what users
  experience, what you are doing, and when you will update next. No
  internal jargon, no blame, no guesses about root cause.

A status update always includes the **current impact**, **what is being
done**, and **the time of the next update**, and the next update is sent
on time even if there is nothing new ("still investigating" is
information). Cadence by severity: every 30 minutes for SEV1, every 30
to 60 minutes for SEV2.

### Mitigate first, then find the root cause

The first goal is to stop user pain, not to understand it. Common
mitigations, roughly in order of preference:

1. **Roll back** the most recent deploy or configuration change (the most
   common cause of incidents is change).
2. **Turn off a feature flag** for the new code path.
3. **Fail over** to a healthy replica, zone, or region.
4. **Scale out** or add capacity when the problem is load.
5. **Shed or block traffic**: rate-limit an abusive client, disable a
   non-essential feature, serve a degraded page.

Mitigation buys time to find the real cause calmly. Two cautions:

- **Preserve evidence** before destroying state: take a heap snapshot or
  a few thread dumps, save logs, snapshot a disk, before restarting
  everything.
- **Know what cannot be rolled back.** A database migration that dropped a
  column makes a code rollback unsafe; that is why migrations are written
  to be backward compatible (see
  [zero-downtime database migrations](../deployment-strategies/zero-downtime-database-migrations.md)).

### Blameless postmortems

A **postmortem** (also called an incident review or retrospective) is a
written record of an incident: what happened, its impact, why it
happened, and what will change. **Blameless** means it focuses on how the
system (code, tools, processes, defaults, incentives) allowed or amplified
the failure, and assumes people acted reasonably with the information they
had at the time.

Why blameless works: engineers who fear punishment hide details, and the
details are what make the analysis useful. "An engineer ran the wrong
command" is never the end of the analysis; the questions are why the
command was possible, why it looked right, and why nothing stopped it.
Blameless does not mean nobody is accountable: owners are accountable for
completing the action items.

When to write one (agree on this in advance): every SEV1 and SEV2, any
data loss, any incident needing on-call intervention beyond a runbook
step, any incident where monitoring failed to detect the problem, and any
incident consuming more than a set share (for example 20%) of the error
budget.

A postmortem template:

1. **Summary:** two or three sentences anyone in the company can
   understand.
2. **Impact:** who and what was affected, for how long, with numbers
   (failed requests, users, error budget consumed, revenue or support
   tickets where relevant).
3. **Timeline:** UTC timestamps from the triggering change through
   detection, response, mitigation, and resolution.
4. **Root causes and contributing factors:** the conditions that together
   produced the incident, including detection and response gaps.
5. **What went well:** practices to keep (fast rollback, a good runbook).
6. **What went wrong and where we got lucky.**
7. **Action items:** each with an owner, a priority, a due date, and a
   tracking link, grouped as detect, mitigate, and prevent.
8. **Lessons learned and supporting information:** graphs, links to the
   incident channel and document.

### Root causes, contributing factors, and the "5 whys"

The **5 whys** technique repeatedly asks "why?" to move from a symptom to
deeper causes:

```text
Why did task creation fail?        The API returned 500 for POST /tasks.
Why did it return 500?             A new index made inserts violate a unique constraint.
Why was the index unique?          The migration defined it as unique by mistake.
Why was the mistake not caught?    Tests ran on an empty database with no duplicates.
Why do tests use empty data?       No realistic test data set exists for migrations.
```

It is useful for pushing past the first answer, but it has known limits:

- It produces a **single linear chain**, while real incidents almost
  always have several contributing factors that were each necessary and
  only jointly sufficient (the code bug, *and* the missing test data,
  *and* the deploy at peak traffic, *and* an alert that took 10 minutes).
- Different people asking the same "why" reach different answers, and the
  chain tends to stop at whatever the facilitator already believed.
- It easily stops at **"human error"**, which is a starting point for
  analysis, not a cause.

Better practice is to list **contributing factors** across categories
(technical trigger, detection, response, process, organizational) and ask
"what made this action make sense at the time?" for every human decision
in the timeline. Richard Cook's short paper
[How Complex Systems Fail](https://how.complexsystems.fail/) explains why
post-accident attribution to a single "root cause" is fundamentally wrong
for complex systems.

### Action items that get done

Postmortems that produce no change are ceremonies. Good action items are:

- **Specific and verifiable:** "Add a migration test that runs against a
  sanitized copy of production data", not "be more careful with
  migrations".
- **Owned and dated:** one owner (a person, not a team), a due date, a
  priority, and a ticket in the normal backlog.
- **Balanced:** some improve detection (an alert that would have fired
  sooner), some mitigation (a faster rollback), some prevention (a
  guardrail that makes the failure impossible).
- **Tracked:** a recurring review of open postmortem actions, and a
  metric for completion rate. Repeat incidents with the same contributing
  factor are a sign that actions are not being completed.

## When to use and when not to use

| Situation | Response |
|---|---|
| SLO burn-rate page, users affected | Declare an incident; IC; status page for SEV1/SEV2 |
| Suspected security breach or data exposure | Declare; involve the security team; follow the security incident process, including legal and regulatory notification duties |
| A bug found in development or staging | Normal bug process, not an incident |
| A single failed background job retried successfully | Ticket; no incident |
| Near miss: a dangerous situation caught before impact | Short postmortem is worthwhile; near misses are cheap lessons |
| Planned maintenance | Change management and status page notice, not an incident (unless it goes wrong) |

## Practical examples

### Declaring an incident: a checklist for the first 10 minutes

```text
1. Acknowledge the page. Look at the SLO and RED dashboards: what is the user impact?
2. Declare: open #inc-<date>-<short-name>, post "Declaring SEV2: <impact>. I am IC until handoff."
3. Assign roles: ops lead, comms lead (SEV1/SEV2), scribe. Page experts you need.
4. Start the incident doc from the template; pin it in the channel.
5. Ask: "What changed?" Check deploys, config changes, feature flags, and infrastructure events.
6. Choose the fastest safe mitigation (roll back, flag off, fail over). Say it, then do it.
7. Comms lead posts the first status update and sets the next update time.
8. Every 15 minutes the IC summarizes: impact, current hypothesis, actions in flight, next steps.
```

### Status update templates

```text
Internal update (incident channel), SEV2, 14:30 UTC
Impact: ~30% of POST /tasks requests failed from 14:02 to 14:29 UTC. Reads unaffected.
Current state: Mitigated at 14:29 by dropping a unique index added by release 1.42.0.
               Error ratio back to baseline. App rolled back to 1.41.3 (did not help alone).
Working on: confirming no tasks were lost; preparing a corrected migration.
Next update: 15:00 UTC or sooner if anything changes.
IC: <name>  Ops: <name>  Comms: <name>
```

```text
Status page update, 14:35 UTC: Monitoring
Between 14:02 and 14:29 UTC, some attempts to create tasks failed with an error.
We have applied a fix and task creation is working normally. Existing tasks were not affected.
We are monitoring closely and will post another update by 15:30 UTC.
```

### A blameless postmortem for TaskFlow

```text
Postmortem: Task creation failures after release 1.42.0
Status: Action items in progress   Severity: SEV2   Incident date: 2026-11-10
Authors: <IC name>, <ops lead name>   Review meeting: 2026-11-12

Summary
Release 1.42.0 added a unique index on (userId, title) to the tasks collection by
mistake. For 27 minutes, users creating a task with a title they had used before
received an error. Dropping the index restored service. No data was lost.

Impact
- 14:02 to 14:29 UTC (27 minutes): 31% of POST /tasks requests returned 500.
- 6,840 failed task creations from 2,310 users; 37 support tickets.
- 14% of the 30-day error budget for API availability consumed.
- Reads and updates were not affected.

Timeline (UTC)
14:00  Release 1.42.0 rollout starts (index build included in the migration).
14:02  Rollout completes; E11000 duplicate key errors begin on POST /tasks.
14:05  TaskflowErrorBudgetBurnFast pages the primary on-call.
14:06  Error tracker alerts on a new issue: MongoServerError E11000 in createTask.
14:08  On-call acknowledges, sees errors started with the deploy.
14:12  SEV2 declared; IC, ops lead, and comms lead assigned.
14:15  Decision: roll back the application. Index left in place for now.
14:17  First status page update posted.
14:21  Rollback to 1.41.3 complete... errors continue at the same rate.
14:24  Ops lead identifies the unique index (not the code) as the cause.
14:29  Index dropped; error ratio returns to baseline. Impact ends.
15:40  Corrected migration (non-unique index) shipped in 1.42.1.
       Incident resolved.

Root causes and contributing factors
- The migration declared the new index { userId: 1, title: 1 } with unique: true.
  The intent was a non-unique index to speed up search.
- Migration tests ran against an empty database, so no duplicate titles existed.
- Code review covered the application diff; the migration file was reviewed
  quickly because "it only adds an index".
- The runbook for "errors after deploy" said to roll back the application, which
  does not undo schema changes, so the first mitigation did not help (8 extra minutes).
- Detection was good: the burn-rate alert fired 3 minutes after impact began.

What went well
- Burn-rate alert and the error tracker identified the deploy as the trigger within minutes.
- Roles were assigned quickly; customers received an update within 15 minutes of the page.

What went wrong / where we got lucky
- The rollback did not include schema changes.
- We were lucky the index was additive; a destructive migration could have lost data.

Action items
| # | Action | Type | Owner | Priority | Due | Ticket |
| 1 | Run migration tests against an anonymized production-like data set | Prevent | <name> | P1 | 2026-11-24 | TF-901 |
| 2 | Lint migrations: flag unique indexes and require explicit approval | Prevent | <name> | P2 | 2026-12-01 | TF-902 |
| 3 | Update the "errors after deploy" runbook: check schema changes before rollback | Mitigate | <name> | P1 | 2026-11-14 | TF-903 |
| 4 | Ship schema changes as a separate, earlier deploy step with its own rollback | Prevent | <name> | P2 | 2026-12-15 | TF-904 |
| 5 | Add a canary step so 5% of traffic sees a release for 10 minutes first | Detect | <name> | P2 | 2026-12-15 | TF-905 |
```

Note how the timeline exposes the 8 minutes lost to an ineffective first
mitigation, and how every contributing factor is about the system (tests,
review focus, runbook, deploy design), not the engineer who wrote the
migration. Action item 5 would have limited the impact to a small share of
users; see
[rolling, blue-green, and canary deployments](../deployment-strategies/rolling-blue-green-and-canary.md).

### Postmortem template

```text
# Postmortem: <short title>
Status: Draft | In review | Action items in progress | Complete
Severity: SEV<n>    Incident date: <YYYY-MM-DD>    Authors: <names>    Reviewers: <names>

## Summary            (2-3 sentences, for any reader)
## Impact             (who, what, how long, numbers, error budget consumed)
## Timeline           (UTC; trigger, detection, response, mitigation, resolution)
## Root causes and contributing factors   (technical, detection, response, process)
## What went well
## What went wrong / where we got lucky
## Action items       (# | action | type: detect/mitigate/prevent | owner | priority | due | ticket)
## Lessons learned
## Supporting information   (graphs, links to channel, incident doc, related postmortems)
```

## Best practices

- Write down declaration criteria and severity definitions before you
  need them; declare early.
- Separate the incident commander from the people fixing the problem.
- Keep one incident channel and one live document as the record.
- Communicate on a fixed cadence with impact, actions, and next update
  time, internally and externally.
- Mitigate first: roll back, flag off, fail over; investigate after users
  are safe, preserving evidence.
- Host the status page and incident tooling independently of the
  production systems they report on.
- Write blameless postmortems for every qualifying incident, review them
  in a meeting, and share them widely.
- List contributing factors across technical, detection, response, and
  process categories; never stop at "human error".
- Give every action item one owner, a due date, and a ticket, and review
  completion regularly.
- Practise: run incident drills and game days so roles feel familiar
  before a real SEV1.

## In production

- **Everyone is debugging and nobody is coordinating.**
  *Detect:* the incident channel is a stream of conflicting theories,
  two people restart the same service, and no decision is recorded.
  *Cause:* no incident commander, or the IC is also debugging. *Fix:*
  assign an IC who does not touch production, and have them summarize the
  state every 15 minutes.
- **Customers hear about the outage from social media first.**
  *Detect:* support tickets reference posts made before the first status
  update. *Cause:* no communications lead, or status updates wait until
  the cause is known. *Fix:* post an initial update within minutes of
  declaring ("we are investigating errors creating tasks") and update on a
  fixed cadence.
- **The same incident happens again three months later.**
  *Detect:* a new postmortem lists the same contributing factor as an old
  one. *Cause:* action items were vague, unowned, or deprioritized.
  *Fix:* concrete, owned, dated action items in the normal backlog,
  reviewed for completion; leadership treats overdue P1 actions as risk.
- **The first mitigation does not work and nobody knows why.**
  *Detect:* errors continue after a rollback. *Cause:* the change was not
  in the application code (a schema change, a configuration or feature
  flag, an infrastructure change). *Fix:* check every kind of change in
  the "what changed?" step, and record all changes in one place with
  timestamps.
- **People stop reporting their mistakes.**
  *Detect:* postmortems become vague ("a configuration issue occurred"),
  timelines have gaps, and near misses are never reported. *Cause:* a
  postmortem or manager blamed an individual. *Fix:* reaffirm blameless
  principles from leadership, focus reviews on system changes, and thank
  people for candid accounts.
- **A long incident degrades as responders tire.**
  *Detect:* after several hours, decisions slow and mistakes increase.
  *Cause:* no rotation of the IC and responders. *Fix:* plan handoffs
  every few hours for long incidents, with a written handoff summary.

## Important terminology

- **Incident:** An unplanned disruption, or threat of one, needing a
  coordinated response.
- **Severity (SEV):** A level describing impact and the response it
  requires.
- **Incident commander (IC):** The person coordinating the response and
  making decisions.
- **Communications lead:** The person responsible for internal and
  external updates.
- **Scribe:** The person recording the timeline.
- **Mitigation:** An action that reduces or stops user impact, even if the
  cause remains.
- **Resolution:** Fixing the underlying cause and confirming normal
  service.
- **Postmortem:** A written analysis of an incident with action items.
- **Blameless:** Focusing on system causes rather than individual fault.
- **Contributing factor:** One of several conditions that together
  produced an incident.
- **5 whys:** A technique that asks "why?" repeatedly to look past the
  first explanation.
- **Near miss:** A situation that could have caused an incident but did
  not.

## Common mistakes and misconceptions

- Waiting to declare an incident until the cause is understood.
- An incident commander who also debugs.
- Discussing the incident in many private chats instead of one channel.
- Investigating the root cause while users are still affected and a
  rollback is available.
- Restarting everything and destroying the evidence needed later.
- Postmortems that name and blame individuals, or that stop at "human
  error".
- Treating the 5 whys as finding *the* root cause in a complex system.
- Action items like "be more careful" or "improve monitoring" without an
  owner or date.
- Writing postmortems that nobody reads, reviews, or follows up.

## Revision questions

1. What criteria would you use to decide that a problem is an incident?
   Why "declare early, downgrade later"?
2. Describe the five phases of the incident lifecycle and what "done"
   means for each.
3. Why should the incident commander not debug?
4. What must every status update contain?
5. Give three mitigations you could apply before knowing the root cause,
   and one situation in which a rollback is unsafe.
6. In the TaskFlow example, impact began at 14:02, the alert fired at
   14:05, the incident was declared at 14:12, and impact ended at 14:29.
   What were the time to detect and the time to mitigate? How many minutes
   were lost to the ineffective first mitigation? (3 minutes; 27 minutes;
   8 minutes, from 14:21 to 14:29.)
7. What are the limits of the 5 whys, and what would you use instead or
   alongside it?
8. What makes an action item likely to be completed?

## Further learning

- [Google SRE book: Managing Incidents](https://sre.google/sre-book/managing-incidents/)
- [Google SRE book: Postmortem Culture](https://sre.google/sre-book/postmortem-culture/)
- [Google SRE Workbook: Incident Response](https://sre.google/workbook/incident-response/)
- [Google SRE Workbook: Postmortem Culture](https://sre.google/workbook/postmortem-culture/)
- [PagerDuty Incident Response documentation](https://response.pagerduty.com/)
- [Atlassian: Blameless postmortems](https://www.atlassian.com/incident-management/postmortem/blameless)
- Next: [monitoring and logging interview questions and answers](interview-questions-and-answers.md).
  Back to the [monitoring and logging overview](../monitoring-and-logging.md).
