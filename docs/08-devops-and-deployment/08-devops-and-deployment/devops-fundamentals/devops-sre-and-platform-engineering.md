# DevOps, SRE, and Platform Engineering

Job advertisements use "DevOps engineer", "site reliability engineer",
and "platform engineer" almost interchangeably, yet the three names come
from different places and describe different mechanisms. DevOps is a
philosophy about how development and operations work together. Site
Reliability Engineering (SRE) is Google's concrete implementation of the
reliability side of it, with error budgets and limits on manual work.
Platform engineering builds internal products that make good practice
self-service for every team.

This lesson defines each one from its primary sources, shows how they fit
together, explains toil and the SRE time budget with a worked example,
describes the common ways SRE teams are organized, and introduces Team
Topologies' four team types and three interaction modes, applied to the
teams that build TaskFlow.

## Why it matters

Organizations regularly get these models wrong in ways that cost years.
An operations team is renamed "SRE" but still spends all its time on
tickets. A "DevOps team" is created to own every deployment and becomes
the new bottleneck. A platform team builds a portal nobody asked for and
then mandates it. Each failure comes from copying a name without the
mechanism behind it: SRE works because it caps operational work and ties
releases to an error budget; platforms work because they are run as
products for developers; DevOps works because the people who build a
service also run it.

Knowing the mechanisms also helps you choose. A five-person startup needs
DevOps habits but not an SRE organization. A company with forty product
teams that each built their own pipeline probably needs a platform team.
A service with strict reliability needs may justify dedicated SREs.

## Real-world usage

- **Google's definition of SRE.** In the
  [introduction to the SRE book](https://sre.google/sre-book/introduction/),
  Benjamin Treynor Sloss writes: "SRE is what happens when you ask a
  software engineer to design an operations team." He describes joining
  Google in 2003 to run a production team of seven engineers, and the
  rule that "Google places a 50% cap on the aggregate 'ops' work for all
  SREs."
- **SRE and DevOps.** The SRE Workbook chapter
  [How SRE Relates to DevOps](https://sre.google/workbook/how-sre-relates/)
  sums up the relationship as "class SRE implements interface DevOps",
  and clarifies that "product development teams in Google own their
  service by default"; SRE "is neither available nor warranted for the
  bulk of services."
- **How SRE teams are organized.** Google Cloud's 2019 post
  [How SRE teams are organized, and how to get started](https://cloud.google.com/blog/products/devops-sre/how-sre-teams-are-organized-and-how-to-get-started)
  describes six implementations, from a "kitchen sink" team that does
  everything to consulting teams that advise without changing code, with
  the pros and cons of each.
- **Platform engineering.** DORA's
  [platform engineering capability](https://dora.dev/capabilities/platform-engineering/)
  defines an internal developer platform as shared tools, services, and
  "golden paths", and reports that by 2025, 90% of organizations used an
  internal developer platform and 76% had dedicated platform teams.
- **Team Topologies.** The
  [Team Topologies key concepts](https://teamtopologies.com/key-concepts)
  describe four fundamental team types (stream-aligned, enabling,
  complicated subsystem, and platform) and three interaction modes
  (collaboration, X-as-a-Service, and facilitating), and call
  stream-aligned teams "You Built It, You Run It" teams.

**Popular tools and providers:** SLO tooling such as Prometheus with
Sloth or Pyrra, Grafana SLO, and Datadog SLOs; incident and on-call tools
such as PagerDuty and incident.io; platform building blocks such as
Kubernetes, Argo CD, Crossplane, and Terraform; and developer portals
such as Backstage.

## How it works

### Three names for answers to one problem

All three respond to the same problem from the previous lesson: work and
knowledge split between people who change systems and people who run
them. They answer it at different levels.

| | DevOps | SRE | Platform engineering |
|---|---|---|---|
| What it is | A culture and set of practices | A job role and a set of practices, defined at Google | A discipline that builds internal products for developers |
| Origin | Practitioner movement, 2008 to 2009 | Google, from 2003 | Grew from DevOps and SRE as organizations scaled |
| Core mechanism | Shared ownership, CALMS, the Three Ways | SLOs and error budgets, a cap on operational work, toil reduction | Self-service golden paths, run as a product |
| Primary customer | Users of the product | Users of the service, through its reliability | Internal developers |
| Typical measures | DORA delivery metrics | SLO compliance, error budget, share of time on toil, pages per shift | Adoption, developer satisfaction, product teams' DORA metrics |
| Typical failure | A "DevOps team" that becomes a new silo | An operations team renamed SRE, still doing tickets all day | A ticket queue or a mandated portal nobody wants |

### SRE as Google defines it

The SRE book describes the traditional "sysadmin" model, in which an
operations team grows linearly with the service, because every new
server, customer, and feature adds manual work. SRE's answer is to staff
operations with software engineers who will "quickly become bored by
performing tasks by hand" and have the skills to automate them. The book
lists the core tenets every Google SRE team follows:

- **Ensuring a durable focus on engineering:** at most 50% of SRE time on
  operational work, at most two events per 8 to 12-hour on-call shift so
  each gets proper follow-up, and blame-free postmortems for all
  significant incidents.
- **Pursuing maximum change velocity without violating the SLO:** the
  error budget, described below.
- **Monitoring:** software interprets signals, and humans are notified
  only when they need to act: alerts for action now, tickets for action
  later; logs are kept for diagnosis and notify no one.
- **Emergency response:** reliability depends on time to repair, and the
  book reports that playbooks written in advance produce "roughly a 3x
  improvement in MTTR" compared with "winging it".
- **Change management:** "roughly 70% of outages are due to changes in a
  live system", so SRE automates progressive rollouts, fast detection,
  and safe rollback.
- **Demand forecasting, capacity planning, provisioning, efficiency and
  performance:** SRE owns capacity because capacity is availability
  (see [load testing fundamentals](../performance-and-reliability-testing/load-testing-fundamentals.md)
  and [autoscaling server fleets](../load-balancing-and-multi-server/autoscaling-server-fleets.md)).

![Diagram: an SRE team's time as Google budgets it: at least 50 percent engineering projects, at most 25 percent on call, and up to 25 percent other operational work; below, the safety valve: measure SRE time each quarter; if ops work is not over 50 percent, keep the engineering focus by automating toil and improving the service; if it is over 50 percent, redirect the excess work to the product development team, which takes tickets and joins the pager, until ops work is back under 50 percent; developers who share the operational load are pushed to build systems that need less manual work.](sre-time-budget.svg)

The 50% cap is enforced, not aspirational. Google measures how SRE time
is spent, and when operational work exceeds the cap the excess is
redirected to the product development team: bugs and tickets go to
development managers, and developers rejoin the pager rotation. The SRE
Workbook suggests thinking of the limit less as a cap than as "a
guarantee": an explicit promise that engineering time exists to remove
the work, rather than toiling at it forever.

### Error budgets: the contract between development and SRE

SRE replaces the argument between "ship faster" and "change nothing"
with a number. The product owners choose an availability target, and
"the error budget is one minus the availability target." A 99.9% SLO
over 30 days allows about 43 minutes of full outage, or 0.1% of requests
failing. While budget remains, teams spend it on launches and
experiments; when it is gone, an agreed policy slows or stops risky
releases until reliability recovers. In the SRE book's words, "SRE's goal
is no longer 'zero outages'; rather, SREs and product developers aim to
spend the error budget getting maximum feature velocity."

SLIs, SLO targets, burn rates, and error budget policies are covered in
depth in [SLIs, SLOs, and error budgets](../monitoring-and-logging/slis-slos-and-error-budgets.md).

### Toil

The SRE book's chapter [Eliminating Toil](https://sre.google/sre-book/eliminating-toil/)
defines toil as "the kind of work tied to running a production service
that tends to be manual, repetitive, automatable, tactical, devoid of
enduring value, and that scales linearly as a service grows."

| Attribute | Test | TaskFlow example |
|---|---|---|
| Manual | A human does it, even if only by running a script | Running `npm run migrate` on the production host by hand |
| Repetitive | Done over and over, not a one-off | Resetting staging test data every few days |
| Automatable | A machine could do it, or the need could be designed away | Granting read access to production logs via tickets |
| Tactical | Interrupt-driven and reactive; the book counts handling pager alerts | Restarting a stuck reminder worker at 3 a.m. |
| No enduring value | The service is in the same state afterwards | Answering "is the API down?" in chat |
| O(n) with growth | Grows with traffic, users, or services | Rotating API keys for every new partner by hand |

Not all unpleasant work is toil. Team meetings, goal setting, and HR
paperwork are **overhead**, and cleaning up a messy alert configuration
may be grungy but has lasting value. Google reports that its SREs spend
on average about 33% of their time on toil, with wide variation between
individuals, against a target of under 50%.

A worked example. The four engineers on the TaskFlow tasks team (160
hours a week) keep a toil log for a month:

```text
toil: 15.5 h/week of 160 h team time (9.7%)

task                                   h/week   hours to automate   payback
Reset staging test data                   2.0                   6   3.0 weeks
Answer is-the-API-down questions          3.0                  10   3.3 weeks
Rotate partner API keys by hand           4.0                  24   6.0 weeks
Grant read access to production logs      2.0                  12   6.0 weeks
Run database migrations by hand           3.0                  20   6.7 weeks
Restart stuck reminder worker             1.5                  16  10.7 weeks
```

Ranking by payback (hours to automate divided by hours saved per week)
tells the team what to automate first: a staging reset script pays for
itself in three weeks, a public status page in just over three. The
script that produces this report is in the practical examples below.

### How SRE teams are organized

Google Cloud's 2019 post describes six implementations, roughly in the
order organizations adopt them:

| Implementation | Scope | Main strength | Main risk |
|---|---|---|---|
| Kitchen sink ("everything SRE") | Every service and workflow, usually the first SRE team | Easy to start without reorganizing | Unbounded scope; day-to-day demands crowd out SRE practices |
| Infrastructure | Shared infrastructure such as clusters, CI/CD, monitoring, networking | Defines production standards as code that simplify every team's work | Can drift away from customer experience |
| Tools | Software that helps others measure and improve reliability | Reusable reliability tooling | Solving the wrong problems if far from front-line teams |
| Product or application | One critical application or business area | Clear link between business priorities and SRE effort | Duplicated infrastructure and divergent practices across many such teams |
| Embedded | SREs work inside development teams for a period, changing code and configuration | Hands-on teaching of SRE practices | Divergent practices; embedded SREs lose contact with peers |
| Consulting | Advises teams without changing their code | Scales the impact of an experienced SRE group | Advice without enough context; seen as hands-off |

The post recommends starting even earlier, with a few engineers spending
part of their time as SRE advocates, before staffing any dedicated team.
It also notes that an SRE team can act as the company's "reliability
standards and practices" group, defining how production may be changed,
how incidents run, and how error budgets work.

### Platform engineering

DORA defines platform engineering as "a sociotechnical discipline"
focused on "automation, self-service, and repeatability", which designs
and builds toolchains and workflows, "often called an 'Internal
Developer Platform'", that provide shared tools, services, and "golden
paths". It stresses that the platform is "an internal product designed
specifically for developers", not a collection of infrastructure tickets.

The idea is not new. In his 2012 post against "DevOps teams", Jez Humble
described the one central team he did support, listing its first job as
"Builds a platform that allows developers to self-service environments
for testing and production", and added: "This platform is a product."
Google SRE
reached a similar place from the other direction. The SRE book chapter
[The Evolving SRE Engagement Model](https://sre.google/sre-book/evolving-sre-engagement-model/)
describes how reviewing services one at a time did not scale, so SRE
built shared frameworks and a common production platform; services built
on it become "production ready" by design, SRE supports the platform,
and development teams provide on-call support for bugs in their own
application code.

Platforms are covered in depth in
[platform engineering and developer portals](platform-engineering-and-developer-portals.md).

### How the three relate

![Diagram: DevOps at the top as the shared philosophy of culture, automation, lean, measurement, sharing, and the Three Ways; two arrows labeled "implements" lead to Site Reliability Engineering, which implements reliability with SLOs, error budgets, toil limits, and incidents, and to platform engineering, which implements self-service with golden paths, paved roads, and a developer portal; both serve the stream-aligned product teams, which build and run their own services; SRE gives the teams SLOs, coaching, and on-call help and receives incidents and SLO data; the platform gives them self-service tools and receives their needs and friction.](devops-sre-platform-relationship.svg)

Read the diagram as an interface and two implementations:

- **DevOps says what good looks like:** shared ownership, small batches,
  fast feedback, continuous learning. The SRE Workbook notes it is
  "relatively silent on how to run operations at a detailed level."
- **SRE says how to run reliable services:** an "opinionated intellectual
  framework (including concepts like error budgets)" with measurable
  limits on toil and paging.
- **Platform engineering says how to make the right way the easy way for
  many teams:** a product that turns repeated decisions (how to build,
  deploy, observe, and secure a service) into self-service defaults.
- **Product teams remain the owners.** Neither SRE nor a platform team
  should take ownership of other teams' services away from them. Their
  job is to make that ownership affordable.

A small organization may have all three in one person's head: a team
that owns its service (DevOps), sets an SLO with an error budget (SRE),
and reuses one shared deploy workflow (a very thin platform).

### Team Topologies

Melvin Conway observed in 1968 that "organizations which design systems
(in the broad sense used here) are constrained to produce designs which
are copies of the communication structures of these organizations"
([How Do Committees Invent?](https://www.melconway.com/Home/Committees_Paper.html)).
Team Topologies, by Matthew Skelton and Manuel Pais (second edition
2025), turns that observation into a design tool: decide how teams
should interact so that the architecture you want, and fast flow of
change, become the natural result.

| Team type | Purpose (from the key concepts page) | TaskFlow example |
|---|---|---|
| Stream-aligned | "aligned to a flow of work from (usually) a segment of the business domain"; owns it end to end | Tasks team (API), Web team, Reminders team |
| Platform | "provide a compelling internal product to accelerate delivery by Stream-aligned teams" | Delivery platform team: CI/CD templates, Kubernetes, observability |
| Enabling | "helps a Stream-aligned team to overcome obstacles"; temporarily boosts skills, then moves on | Reliability enabling team teaching SLOs and on-call practice |
| Complicated subsystem | "where significant mathematics/calculation/technical expertise is needed" | Scheduling engine that suggests due dates |

| Interaction mode | Meaning | When to use it |
|---|---|---|
| Collaboration | Working closely together for a defined period to discover new things | A new capability whose interface is not yet known; high bandwidth, high cost, so time-box it |
| X-as-a-Service | One team provides and the other consumes, with minimal interaction | Mature, well-understood capabilities such as the deploy pipeline |
| Facilitating | One team helps and mentors another | Teaching a practice until the receiving team can do it alone |

![Diagram: TaskFlow organized with Team Topologies: three stream-aligned teams, the Web team owning TaskFlow Web, the Reminders team owning task reminders, and the Tasks team owning the TaskFlow API, each building and running its service; a delivery platform team provides CI/CD templates, Kubernetes, observability, and a developer portal to all three as X-as-a-Service and collaborates with the Web team for a limited time; a reliability enabling team facilitates the Reminders team for six weeks with SRE practices and SLO coaching; a scheduling engine team, a complicated subsystem, provides its engine to the Tasks team as X-as-a-Service.](team-topologies-taskflow.svg)

The approach is built around **team cognitive load**: a team can only
own so much before quality and speed fall. Platform, enabling, and
complicated-subsystem teams exist to reduce the load on stream-aligned
teams, and the key concepts page warns that "most internal platforms
become bloated monstrosities" unless they follow the **Thinnest Viable
Platform** idea: provide just enough capability to make stream-aligned
teams faster.

### Job titles in practice

Titles vary between companies, so read the job description, not the
label. Typical scopes are:

| Title | Usually means | Watch out for |
|---|---|---|
| DevOps engineer | Builds pipelines, infrastructure as code, and deployment tooling, often inside or alongside product teams | A role that owns everyone's deployments, recreating the wall |
| Site reliability engineer | Owns reliability of services with SLOs, incident response, capacity, and automation; spends a bounded share of time on operations | An operations job renamed, with no engineering time or error budget |
| Platform engineer | Builds and runs the internal platform as a product: golden paths, self-service APIs, developer portal | A ticket-driven infrastructure team with a new name |

## When to use and when not to use

| Context | Good fit | Not yet |
|---|---|---|
| One team, one product, early stage | DevOps habits: the team owns build, deploy, and on-call; one SLO per critical journey | A separate SRE team or a platform team |
| 3 to 10 product teams, each solving deployment differently | A thin platform: shared pipeline templates, one deploy path, a service catalog | A large portal project before the common needs are known |
| A critical service whose outages are expensive | Dedicated SRE support (product or embedded), with a production readiness review | SRE for every service; most should stay with their developers |
| Many teams, high cognitive load, repeated reliability problems | Platform team plus an SRE "standards and practices" or enabling team | Mandating tools without user research |
| An operations team that wants to "become SRE" | Measure toil, set SLOs, cap operational work, automate the top toil | Renaming the team and keeping the ticket queue |

The SRE Workbook calls renaming without changing practices
"rename-and-shame" and warns it is "a hollow one, unlikely to yield
benefit." The same is true of renaming an infrastructure team
"platform".

## Practical examples

### A toil log and payback report

Keep a simple log of recurring operational work for a few weeks:

```text
# toil.csv
task,kind,per_week,minutes_each,automation_hours
Restart stuck reminder worker,manual fix,3,30,16
Rotate partner API keys by hand,ticket,2,120,24
Answer is-the-API-down questions,interrupt,12,15,10
Reset staging test data,ticket,4,30,6
Run database migrations by hand,release chore,3,60,20
Grant read access to production logs,ticket,6,20,12
```

```js
// scripts/toil-report.js: weekly toil, share of team time, and automation payback
// Usage: node scripts/toil-report.js toil.csv <engineers> <hours per engineer per week>
import { readFile } from "node:fs/promises";

const [file, engineers = "4", hoursEach = "40"] = process.argv.slice(2);
const teamHours = Number(engineers) * Number(hoursEach);

const [header, ...rows] = (await readFile(file, "utf8")).trim().split(/\r?\n/);
const cols = header.split(",");
const items = rows.map((line) => {
  const v = Object.fromEntries(line.split(",").map((x, i) => [cols[i], x]));
  const weekly = (Number(v.per_week) * Number(v.minutes_each)) / 60;
  return { task: v.task, weekly, automate: Number(v.automation_hours) };
});

const total = items.reduce((sum, i) => sum + i.weekly, 0);
console.log(`toil: ${total.toFixed(1)} h/week of ${teamHours} h team time (${((100 * total) / teamHours).toFixed(1)}%)`);
console.log("payback  h/week  build h  task");
for (const i of items.sort((a, b) => a.automate / a.weekly - b.automate / b.weekly)) {
  const payback = `${(i.automate / i.weekly).toFixed(1)} wk`;
  console.log(`${payback.padStart(7)}  ${i.weekly.toFixed(1).padStart(6)}  ${String(i.automate).padStart(7)}  ${i.task}`);
}
```

```text
$ node scripts/toil-report.js toil.csv 4 40
toil: 15.5 h/week of 160 h team time (9.7%)
payback  h/week  build h  task
 3.0 wk     2.0        6  Reset staging test data
 3.3 wk     3.0       10  Answer is-the-API-down questions
 6.0 wk     4.0       24  Rotate partner API keys by hand
 6.0 wk     2.0       12  Grant read access to production logs
 6.7 wk     3.0       20  Run database migrations by hand
10.7 wk     1.5       16  Restart stuck reminder worker
```

The parser is deliberately simple (no quoted commas in fields). The
numbers are estimates; their job is to rank the work, not to be precise.
Notice that the cheapest fix is not always to automate the task: the
stuck reminder worker should be fixed so it stops getting stuck.

### A production readiness checklist

Google SRE runs a Production Readiness Review (PRR) before taking on a
service, to "verify that a service meets accepted standards of
production setup and operational readiness". A lightweight version is
useful for any team launching a service it will run itself:

```yaml
# docs/production-readiness.yaml: TaskFlow reminders service
service: taskflow-reminders
owner: reminders-team
review_date: 2026-11-10
checks:
  slos:
    - "Freshness SLO: 99% of reminders sent within 5 minutes of the due time"
    - "Dashboard shows every SLI in the SLO document"
  alerting:
    - "Burn-rate alerts page the owning team's rotation"
    - "Every paging alert links to a runbook"
  operations:
    - "On-call rotation has at least two people per shift (primary and secondary)"
    - "Rollback tested in staging within the last 30 days"
    - "Graceful shutdown drains in-flight jobs on SIGTERM"
  capacity:
    - "Load test at 3x the expected peak reminders per minute"
    - "Queue depth alert before the backlog breaks the freshness SLO"
  data:
    - "Backups restored successfully in the last quarter"
  dependencies:
    - "Behavior documented and tested when the email provider is down"
open_items:
  - "Add a runbook for 'reminder backlog growing' (owner: reminders-team, due 2026-11-24)"
```

The format is illustrative; the value is in reviewing the answers with
someone who has operated similar services, before users depend on them.

### A team charter with Team Topologies vocabulary

Writing down each team's type, ownership, and interactions makes
dependencies explicit and shows when an interaction mode should change:

```yaml
# teams/reminders-team.yaml
team: reminders-team
type: stream-aligned
owns:
  services: [taskflow-reminders]
  on_call: true                       # you build it, you run it
interactions:
  - team: delivery-platform
    mode: x-as-a-service              # uses pipelines, clusters, dashboards
  - team: reliability-enabling
    mode: facilitating
    purpose: "Define SLOs and set up burn-rate alerting"
    until: 2026-12-18                 # enabling help ends; the skill stays
  - team: tasks-team
    mode: x-as-a-service              # consumes the tasks API, versioned contract
cognitive_load_review: quarterly
```

Interactions that never end are a warning sign: a facilitating
engagement that runs for a year has become a dependency, and a
collaboration that never settles into X-as-a-Service usually means the
interface between the teams is still unclear.

## Best practices

- Start with DevOps habits in every team: own the service, automate the
  path to production, and learn from incidents.
- Adopt SRE mechanisms, not just the title: SLOs with error budget
  policies, a cap on operational work, and measured toil.
- Keep ownership with product teams by default; reserve dedicated SRE
  support for services that justify it.
- Measure toil for a few weeks before automating, and rank work by
  payback.
- Build platforms as products with user research, a roadmap, and
  measured adoption; start with the thinnest platform that helps.
- Name team types and interaction modes explicitly, time-box
  collaboration and facilitation, and revisit them as needs change.
- Watch cognitive load: when a team owns too much, split ownership or
  move undifferentiated work to a platform.

## In production

- **The new SRE team spends every day on tickets.**
  *Detect:* a time-tracking sample shows 80% or more of SRE time on
  tickets and pages; no automation projects ship for a quarter.
  *Cause:* an operations team was renamed without a cap on operational
  work or a mechanism to push excess back. *Fix:* measure the ops share,
  agree a 50% cap with leadership, redirect excess work to the owning
  development teams, and fund the top toil fixes.
- **Releases are blocked by the SRE team on every launch.**
  *Detect:* launch reviews queue for weeks and developers route around
  them with "small" changes. *Cause:* reliability is enforced by
  gatekeeping instead of an agreed error budget. *Fix:* define SLOs and
  an error budget policy with product leadership, and let the budget, not
  a reviewer, decide when releases slow down.
- **Developers carry the pager and burn out.**
  *Detect:* rising after-hours pages per person and people leaving the
  rotation. *Cause:* ownership was handed to product teams without
  runbooks, sane alerts, or platform support. *Fix:* cap pages per shift,
  give the team time to fix noisy alerts, and provide platform defaults
  for deploys, rollbacks, and dashboards.
- **The platform team's backlog is all tickets.**
  *Detect:* most platform work items are "create a database for team X"
  requests; developers wait days. *Cause:* "ticket-ops", which DORA lists
  as a platform pitfall. *Fix:* turn the most frequent requests into
  self-service APIs or templates, and measure time from request to use.
- **Each product team built its own pipeline and observability stack.**
  *Detect:* a dozen different deploy scripts and logging formats;
  security fixes take months to roll out everywhere. *Cause:* DevOps
  ownership without any shared platform. *Fix:* extract the common path
  into a thin, optional platform and migrate teams by making it clearly
  easier than their own tooling.
- **An enabling team has been "helping" the same team for a year.**
  *Detect:* the receiving team still cannot operate the practice
  without the enabling team. *Cause:* facilitation turned into
  dependency; the enabling team does the work instead of teaching it.
  *Fix:* agree an end date and a skill to transfer, and pair rather than
  do the work for them.

## Important terminology

- **DevOps:** The culture and practices of shared ownership between
  building and running software.
- **Site Reliability Engineering (SRE):** Google's approach of running
  operations as a software problem, with SLOs, error budgets, and a cap
  on operational work.
- **Error budget:** One minus the availability target; the amount of
  unreliability a service may spend.
- **Toil:** Manual, repetitive, automatable, tactical operational work
  with no enduring value that grows with the service.
- **Overhead:** Administrative work that is not tied to running a
  production service, such as meetings.
- **Production Readiness Review (PRR):** A review of a service's
  operational readiness before SRE support or launch.
- **Platform engineering:** Building internal developer platforms as
  products that make delivery self-service.
- **Internal developer platform (IDP):** The tools, services, and golden
  paths a platform team provides to developers.
- **Stream-aligned team:** A team aligned to a flow of work that owns it
  end to end.
- **Enabling team:** A team that helps others gain a capability, then
  moves on.
- **Complicated-subsystem team:** A team owning a part that needs deep
  specialist knowledge.
- **Interaction modes:** Collaboration, X-as-a-Service, and facilitating.
- **Cognitive load:** The mental effort a team needs to own its work.
- **Conway's law:** Systems mirror the communication structures of the
  organizations that design them.

## Common mistakes and misconceptions

- Treating DevOps, SRE, and platform engineering as competing
  alternatives rather than layers that fit together.
- Renaming an operations team "SRE" without SLOs, error budgets, or a
  limit on toil.
- Believing SRE means a separate team must run every service.
- Counting all disliked work as toil; meetings are overhead, and
  cleanup with lasting value is not toil.
- Automating toil that should have been designed away.
- Building a platform before several teams share the same need.
- Mandating a platform instead of making it the easiest path.
- Ignoring Conway's law: drawing an architecture that the team structure
  cannot produce.

## Revision questions

1. Explain "class SRE implements interface DevOps". What does SRE add
   that DevOps leaves open?
2. What happens at Google when operational work exceeds 50% of SRE time,
   and why is that a feedback mechanism rather than a punishment?
3. Name the six attributes of toil and give a TaskFlow example of each.
   Why are team meetings not toil?
4. A team of five engineers works 40 hours a week each. A toil log shows
   70 hours a week of toil, including a 10-hour weekly task that would
   take 40 hours to automate. What share of time is toil before and
   after automating that task, and what is the payback period? (35% of
   200 hours; 60 / 200 = 30% afterwards; 4 weeks.)
5. Compare the kitchen sink, embedded, and consulting SRE
   implementations. Which would you start with in a company of 60
   engineers, and why?
6. Why did Jez Humble accept a central team that builds a self-service
   platform while rejecting a "DevOps team"?
7. Describe the four Team Topologies team types and when each
   interaction mode is appropriate.
8. Your organization wants to "become SRE" next quarter. What would you
   measure first and what would you change before the name?

## Further learning

- [Google SRE book: Introduction](https://sre.google/sre-book/introduction/)
- [Google SRE book: Eliminating Toil](https://sre.google/sre-book/eliminating-toil/)
- [Google SRE Workbook: How SRE Relates to DevOps](https://sre.google/workbook/how-sre-relates/)
- [Google Cloud: How SRE teams are organized, and how to get started](https://cloud.google.com/blog/products/devops-sre/how-sre-teams-are-organized-and-how-to-get-started)
- [DORA: Platform engineering](https://dora.dev/capabilities/platform-engineering/)
- [Team Topologies: Key concepts](https://teamtopologies.com/key-concepts)
- Next: [measuring delivery performance](measuring-delivery-performance.md). Back to the [DevOps fundamentals overview](../devops-fundamentals.md).
