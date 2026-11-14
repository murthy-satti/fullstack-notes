# DevOps Fundamentals Interview Questions and Answers

These questions review what DevOps is, how it relates to SRE and
platform engineering, how delivery performance is measured, the team
practices behind ownership, and internal platforms and developer
portals. Try answering each one before reading the answer.

## What DevOps is

### 1. What is DevOps, in one or two sentences?

DevOps is the set of cultural habits, practices, and automation that
lets one team change a system quickly and safely and learn from how it
behaves in production. AWS describes it as "the combination of cultural
philosophies, practices, and tools" that increases an organization's
ability to deliver at high velocity; the emphasis on culture and shared
ownership is what separates it from a toolchain.

### 2. What problem was DevOps created to solve?

The split between development, rewarded for shipping features, and
operations, rewarded for stability. The split produced large, infrequent
releases, hand-offs "over the wall", slow feedback to the people who
wrote the code, and blame when things broke. Google's SRE book describes
the result as structural conflict between pace of change and stability.

### 3. Where did the DevOps movement come from?

Patrick Debois presented agile infrastructure ideas at Agile 2008 in
Toronto. In June 2009 John Allspaw and Paul Hammond gave the Velocity
talk "10+ Deploys Per Day: Dev and Ops Cooperation at Flickr", and Debois
organized the first devopsdays in Ghent, Belgium, on 30 and 31 October
2009. Books followed: Continuous Delivery (2010), The Phoenix Project
(2013), The DevOps Handbook (2016), and Accelerate (2018).

### 4. What does CALMS stand for, and where does it come from?

Culture, Automation, Lean, Measurement, Sharing. John Willis summarized
DevOps as CAMS in a July 2010 post; Lean was added later, and Google's
SRE Workbook credits CA(L)MS to John Willis, Damon Edwards, and Jez
Humble. Culture comes first: in Willis's words, "If you don't have
culture, all automation attempts will be fruitless."

### 5. Explain the Three Ways.

From Gene Kim's 2012 article: the First Way is flow and systems
thinking (optimize the whole value stream, never pass known defects
downstream); the Second Way amplifies right-to-left feedback loops; the
Third Way builds a culture of continual experimentation and learning,
with time to improve daily work and practice through repetition. Faster
flow without feedback only ships problems faster.

### 6. Why is a "DevOps team" between development and operations an anti-pattern?

It adds another functional silo and another hand-off, which is the
problem DevOps tries to remove. Jez Humble's 2012 post put it bluntly:
"THERE IS NO SUCH THING AS A DEVOPS TEAM." He did accept a central team
that builds a self-service platform and coaches others, as long as it is
not on the hook for running other teams' systems.

### 7. Can you buy DevOps?

No. Tools support the practices but do not create them. Willis warned
that a vendor claiming a "Devops product" does not "have a clue of what
Devops is." Organizations that buy tools without changing ownership,
batch size, and feedback usually see no improvement in lead time or
stability.

### 8. What is value stream mapping, and what is flow efficiency?

Value stream mapping draws the steps from request (or commit) to
production with the work time and the wait time of each step.

```text
lead time       = work time + wait time
flow efficiency = work time / lead time
```

A change with 5 hours of work and 158 hours of waiting has a lead time of
about 163 hours and a flow efficiency near 3%: removing a queue helps far
more than working faster.

### 9. Why do small batches reduce risk? Show it with numbers.

If each change has a 2% chance of causing a problem, a release of 40
changes contains at least one bad change with probability
`1 - 0.98^40`, about 55%, and finding it takes about six rounds of
bisection. Deploying each change alone keeps every deploy at 2%, points
to one suspect, and makes rollback remove only that change. Feedback also
arrives while the code is fresh.

### 10. What is a WIP limit, and how does Little's law explain it?

A WIP limit caps how many items may be in a stage at once, so the team
finishes before starting. Little's law says average lead time equals
average work in progress divided by average throughput: a team finishing
10 items a week with 30 in progress has a 3-week lead time; with 10 in
progress, 1 week, without working any faster.

### 11. Does delivering faster make systems less stable?

DORA's research consistently says no: throughput and stability tend to
move together, and its 2025 report calls the "speed vs. stability"
trade-off a myth. The mechanism is batch size: small, frequent changes
are easier to test, diagnose, and roll back than large, rare ones.

## DevOps, SRE, and platform engineering

### 12. How does Google define Site Reliability Engineering?

Benjamin Treynor Sloss: "SRE is what happens when you ask a software
engineer to design an operations team." SREs are engineers who automate
operational work, manage services to SLOs with error budgets, and keep
operational work capped so engineering time remains. SRE started at
Google in 2003.

### 13. What does "class SRE implements interface DevOps" mean?

From the SRE Workbook: DevOps is a broad philosophy that is "relatively
silent on how to run operations at a detailed level"; SRE is one concrete
implementation with an opinionated framework (SLOs, error budgets, toil
limits, blameless postmortems). Both share the goals of fewer silos,
gradual change, measurement, and treating accidents as normal.

### 14. What is Google's 50% rule for SRE, and how is it enforced?

At most 50% of SRE time goes to operational work (tickets, on-call,
manual tasks); the rest goes to engineering. Google measures it, and
when operational work exceeds the cap, the excess is redirected to the
product development team: tickets go to development managers and
developers rejoin the pager. That feedback pushes developers to build
systems that need less manual work.

### 15. What is toil, and what is not toil?

Toil is work tied to running a production service that is manual,
repetitive, automatable, tactical, devoid of enduring value, and scales
linearly with the service. Meetings and HR paperwork are overhead, not
toil, and cleanup with lasting value is not toil even if it is unpleasant.
Google reports its SREs average about 33% toil against a target under 50%.

### 16. How do error budgets resolve the conflict between developers and operations?

The product owners set an availability target, and the error budget is
one minus that target. While budget remains, teams spend it on launches
and experiments; when it is exhausted, an agreed policy slows risky
releases. The decision comes from a number agreed in advance instead of
an argument during each launch.

### 17. How would you decide which toil to automate first?

Log recurring tasks with frequency and duration, estimate the effort to
automate or eliminate each, and rank by payback: hours to automate
divided by hours saved per week. A 6-hour script that saves 2 hours a
week pays back in 3 weeks. Prefer eliminating the cause (fix the stuck
worker) over automating the symptom (restart it faster).

### 18. What SRE team implementations does Google Cloud describe?

Six, roughly in order of adoption: kitchen sink (everything), infrastructure,
tools, product or application, embedded (SREs working inside development
teams, changing code), and consulting (advising without changing code).
Before any of them, it recommends part-time SRE advocates. Embedded teams
teach hands-on; consulting scales an experienced group but risks advice
without context.

### 19. What is platform engineering, and how is it different from a traditional infrastructure team?

Platform engineering builds an internal developer platform as a product:
self-service tools, services, and golden paths designed around developers'
needs, with a product owner, roadmap, and adoption measures. A traditional
infrastructure team fulfills requests; a platform team removes the need
for requests by making capabilities self-service.

### 20. What are the four Team Topologies team types?

Stream-aligned teams own a flow of work end to end ("You Built It, You
Run It" teams). Platform teams provide a compelling internal product that
speeds them up. Enabling teams help others gain capabilities, then move
on. Complicated-subsystem teams own parts that need deep specialist
knowledge.

### 21. What are the three interaction modes, and when do you use each?

Collaboration: working closely for a defined period to discover
something new, such as a new interface; high bandwidth and high cost, so
time-box it. X-as-a-Service: consume a well-defined capability with
minimal interaction, such as the deploy pipeline. Facilitating: one team
mentors another until it can work alone.

### 22. What is Conway's law, and why does it matter for DevOps?

Melvin Conway wrote in 1968 that organizations "are constrained to
produce designs which are copies of the communication structures of these
organizations." If teams are split by function, systems end up with
hand-offs at the same seams. Team Topologies uses this deliberately:
design team boundaries and interactions for the architecture and flow you
want.

### 23. What is team cognitive load, and what is the Thinnest Viable Platform?

Cognitive load is the mental effort a team needs to own its work; past a
point, quality and speed drop. Platform, enabling, and
complicated-subsystem teams exist to reduce the load on stream-aligned
teams. The Thinnest Viable Platform provides just enough capability to
make those teams faster, instead of a bloated platform that adds
dependencies.

## Measuring delivery performance

### 24. What are DORA's five software delivery metrics?

Throughput: change lead time, deployment frequency, and failed
deployment recovery time. Instability: change fail rate and deployment
rework rate. DORA's guide says they are meant to be applied at the
application or service level and used together, not as single targets.

### 25. How have DORA's metrics changed over time?

Research began in 2014 with four variables, including mean time to
recover (MTTR). In 2023 MTTR was renamed and redefined as failed
deployment recovery time, to separate failures caused by software changes
from external failures. In 2024 deployment rework rate was added,
recovery time moved into the throughput group, and change fail and
rework rates formed the stability (now "instability") group. The 2025
report published per-metric distributions and seven team profiles
instead of a four-level table.

### 26. How do you measure change lead time precisely?

From commit time to the first successful production deployment that
contains the commit. Re-deploys after a rollback must not reset the
clock, and staging deploys do not count. Squash and rebase merges create
commits whose committer date is the merge time, hiding review wait; if
review time matters, start at the pull request's first commit and say so.

### 27. What counts as a deployment for deployment frequency?

A successful deployment to production of one service, planned or
unplanned (rollbacks and hotfixes count). Failed pipeline runs that never
reached production do not. Report deployments per week, the share of
working days with a deployment, or the time between deployments.

### 28. How do you decide which deployments count toward change fail rate?

Those that required immediate intervention after reaching production: a
rollback, hotfix, fix forward, or patch, which is how DORA's 2025 survey
describes it. Decide explicitly whether disabling a feature flag counts,
write the rule down, and link each incident to the deployment that caused
it, or the rate will silently read zero.

### 29. Why was MTTR replaced by failed deployment recovery time?

MTTR mixed recovery from failed changes with recovery from anything else,
such as a data center outage. The new metric measures only how quickly a
team recovers from a deployment that failed and needed immediate
intervention, which is what delivery practices control. Other outages
belong in SLO and incident metrics.

### 30. Why report median and p90 lead time instead of the mean?

Lead times are skewed. In a two-week TaskFlow sample, the median was 2.3
hours, the mean 12.2 hours, and the p90 20.9 hours, because a few commits
waited over a weekend or on a branch. The median describes the typical
change; a high percentile describes the tail you want to shrink; the mean
moves when one forgotten commit ships.

### 31. What benchmarks does DORA publish, and how should you use them?

The 2024 report's four clusters, for example elite: lead time under one
day, deploys on demand, 5% change fail rate, recovery under one hour (19%
of respondents). The 2025 report instead shows answer distributions per
metric. DORA's advice: "the best teams are those that achieve elite
improvement, not necessarily elite performance". Compare a service with
its own past, not with other teams.

### 32. In 2024, why did the medium cluster have a lower change fail rate than the high cluster?

The clusters emerged from the data: one group was faster but less stable
(high, 20% change fail rate), another slower but more stable (medium,
10%). DORA chose to call the faster group "high" and noted there may be
no universal answer to which is better; it depends on the service and its
users.

### 33. What are flow metrics, and how do they differ from DORA's metrics?

The Flow Framework measures from work start to work complete across four
flow item types (features, defects, risks, and debt): flow velocity
(items completed), flow time, flow efficiency (active share of flow
time), flow load (work in progress), and flow distribution (the mix of
item types). DORA starts at commit; flow metrics include the waiting
before it and show whether debt and risk work is being starved.

### 34. What is the SPACE framework?

SPACE (Forsgren and colleagues, ACM Queue, 2021) says developer
productivity cannot be captured by one metric. Its five dimensions are
satisfaction and well-being, performance, activity, communication and
collaboration, and efficiency and flow. Measure at least three, mixing
survey data with system data, and never judge productivity by activity
counts alone.

### 35. Explain Goodhart's law with an example of gaming delivery metrics.

"When a measure becomes a target, it ceases to be a good measure" (the
popular phrasing, credited to Marilyn Strathern). If leadership demands
"multiple deployments per day", teams can deploy unchanged code or split
one change into many deploys; if change fail rate is a target, incidents
stop being linked to deployments. DORA lists "Setting metrics as a goal"
as its first pitfall.

### 36. How would you compute lead time from git and deployment data?

Record each production deployment with its SHA and time, use
`git rev-list <previous sha>..<sha>` to list the commits it shipped, and
load commit times from `git log --format='%H,%cI'`. Lead time per commit
is its first successful deployment time minus its commit time:

```sql
SELECT dc.sha, MIN(julianday(d.finished_at)) AS deployed_jd
FROM deployment_commits dc
JOIN deployments d ON d.id = dc.deployment_id
WHERE d.environment = 'production' AND d.status = 'success'
GROUP BY dc.sha
```

Then subtract `julianday(committed_at)` and take the median per week.

### 37. Why store raw delivery events instead of computed numbers?

Raw events let you recompute every metric when a definition changes or a
bug in the calculation is found. Vendor histories also expire: GitHub,
for example, retains previous deployment statuses for 90 days. Export
events into your own store, in UTC, with the service name on each one.

## Team practices and ownership

### 38. What does "you build it, you run it" mean, and where does it come from?

The team that builds a service also operates and supports it, including
on-call. The phrase comes from Werner Vogels's 2006 ACM Queue interview:
"Giving developers operational responsibilities has greatly enhanced the
quality of the services ... You build it, you run it." It closes the
feedback loop: teams paged for their own bugs fix the causes.

### 39. What does a team need before it can run its own services sustainably?

Netflix's "full cycle developer" post lists the prerequisites: tooling
that makes deploying, monitoring, and rolling back easy, training,
partnerships with central teams that build shared tools, and staffing
"with enough headroom" for operational work. Without these, it warns,
"teams risk overload and burnout."

### 40. How large should an on-call rotation be?

The SRE book caps on-call at 25% of an engineer's time. With a primary
and a secondary on every weekly shift, that needs at least eight
engineers for a single-site 24/7 rotation, or six per site for two sites.
A team of five on the same rotation would be on call 40% of the time.

### 41. How do you know whether on-call is fair?

Look beyond shift counts: pages per person, pages outside working hours,
the share handled by the busiest person compared with an even share, the
actionable rate, and how often shifts are swapped or uncovered. One
person handling far more than their share usually points to a noisy
alert, which should be fixed rather than rescheduled around.

### 42. What is blameless culture, and does it mean nobody is accountable?

It treats failures as information about the system: what made an action
seem reasonable, and what safeguard was missing. Punishing individuals
creates incentives to hide the truth. Accountability remains: owners
complete the action items, and deliberate malicious acts follow other
processes.

### 43. What is the Westrum typology?

Ron Westrum's three cultures, distinguished by how information flows:
pathological (power-oriented; messengers punished; failure leads to
scapegoating), bureaucratic (rule-oriented; messengers neglected; failure
leads to justice), and generative (performance-oriented; messengers
trained; failure leads to inquiry). DORA found generative, high-trust
culture predicts software delivery and organizational performance.

### 44. What is an architecture decision record, and what does it contain?

A short, numbered document recording one architecturally significant
decision, introduced by Michael Nygard in 2011: title, context, decision
("We will ..."), status (proposed, accepted, deprecated, or superseded),
and consequences, positive and negative. ADRs live in the repository,
numbers are never reused, and reversed decisions are kept and marked
superseded.

### 45. What did DORA find about change advisory boards?

That heavyweight approval by people outside the team has a negative
impact on software delivery performance, and that "no evidence was found
to support the hypothesis that a more formal, external review process was
associated with lower change fail rates." It slows delivery, which
creates larger batches and more risk per release.

### 46. How can you meet segregation of duties without a CAB?

Use peer review: a change is approved by someone other than its author in
the pull request, with the review recorded in the development platform.
Add automated tests and checks, flag high-risk changes (migrations,
authentication, infrastructure) for extra review, and keep the pipeline
as the audit trail. Use the same fast path for emergency changes.

### 47. Why does documentation quality matter to delivery performance?

DORA found "a clear link between documentation quality and
organizational performance", and that documentation quality drives the
implementation of every technical practice it studied; for example,
trunk-based development lifted organizational performance far more for
teams with above-average documentation. Keep docs next to code and
update them in the same pull requests.

### 48. What conditions define trunk-based development in DORA's research?

Three or fewer active branches, merging to trunk at least once a day, and
no code freezes or integration phases. The habits behind it are social:
small pull requests, reviews within hours, a red main branch fixed first,
and unfinished work merged behind feature flags.

## Platform engineering and developer portals

### 49. What is an internal developer platform?

A set of shared tools, services, and golden paths, offered through
self-service interfaces and run as a product for internal developers.
The CNCF defines a platform as "an integrated collection of capabilities
defined and presented according to the needs of the platform's users";
Evan Bottcher calls it "a compelling internal product."

### 50. What are golden paths, paved roads, and golden cages?

A golden path, in Spotify's words, is "the 'opinionated and supported'
path to 'build something'". Netflix's paved road is its supported set of
tools, encouraged by being "a far better experience" rather than
mandated. A golden cage, a DORA pitfall, is a rigid path with no exits
that ignores the needs of different kinds of teams.

### 51. What is ticket-ops, and why is it a trap?

A platform team that fulfills infrastructure requests manually, like a
"vending machine" for tickets. It stays trapped in toil, becomes the
bottleneck, and never builds self-service. Forty requests a month at 45
minutes each is 30 hours of platform time plus days of waiting for every
team; a self-service path removes both.

### 52. What is Backstage?

"An open source framework for building developer portals", created at
Spotify and open-sourced in March 2020. Its core features are the
software catalog, software templates, TechDocs, and plugins. It was
accepted to the CNCF in September 2020 and moved to Incubating in March
2022. Spotify reported a 55% decrease in onboarding time, measured as time
to a new engineer's 10th pull request.

### 53. What goes in a catalog-info.yaml, and why does `spec.owner` matter?

The entity's `apiVersion`, `kind` (Component, API, Resource, System,
and so on), `metadata` (name, description, annotations, links), and
`spec` (type, lifecycle, owner, system, dependencies, provided APIs).
`spec.owner` names the team that "bears ultimate responsibility" for the
entity, which turns the catalog into an ownership map that answers "who
do I call?".

### 54. How do software templates encode a golden path?

A template defines form parameters and steps: fetch a skeleton project
with best practices built in, publish it as a new repository, and
register it in the catalog with its owner. Every new service starts with
the standard pipeline, SLO document, dashboards, and runbook links,
instead of drifting toward them later. Calling a shared, versioned
reusable workflow instead of copying the pipeline keeps existing
services current too: a security fix ships once, to every caller.

### 55. How do you measure whether a platform succeeds?

Combine delivery outcomes of product teams (DORA's metrics) with
developer experience (surveys such as CSAT or NPS), adoption and
retention, task success for key journeys, and efficiency measures such as
time to provision a database or to deploy a brand-new service. Backstage's
guide adds onboarding time, measured as time to a new engineer's 10th
merged pull request.

### 56. What did DORA's 2024 report find about internal developer platforms?

Users had 8% higher individual productivity and 10% higher team
performance, and organizational performance rose 6%, but throughput fell
8% and change stability 14%. Mandatory, exclusive use was linked to a 6%
throughput decrease. Performance followed a J-curve: early gains, a dip,
then recovery as the platform matured.

### 57. When should a small team not build a platform, and what are the cheaper options?

When only one to three teams share the need, or nobody can run the
platform as a product. Cheapest: a shared template repository, a wiki
page, and managed services. Next: a managed or commercial product with
your defaults on top, trading a subscription for engineering time. Most
expensive: self-building a platform and portal, because it needs a
dedicated team to build, upgrade, support, and be on call for it.

## Scenario-based questions

### 58. Leadership created a "DevOps team" a year ago, but lead time and stability have not changed. What do you look at?

**What to check first:** who deploys, who is paged, and where tickets go
between product teams and the new team.

**How to confirm:** a value stream map shows changes waiting in the DevOps
team's queue; product teams still hand off deploys and never see alerts.

**Likely causes and fixes:** a new silo between development and
operations. Give product teams ownership of deploys and on-call, and
turn the central team into a platform or enabling team that builds
self-service tools and coaches. See [what is DevOps](what-is-devops.md).

### 59. The CI pipeline takes 10 minutes, but change lead time is 12 days. Where is the time going?

**What to check first:** the gap between merge and production: release
trains, approval meetings, manual QA, deploy windows.

**How to confirm:** map the value stream with work and wait times per
step; most of the 12 days will be waiting.

**Likely causes and fixes:** queues, not slow work. Remove the biggest
wait first: deploy on merge instead of a weekly release cut, replace
external approval with peer review and automated checks, and automate
regression tests. See [what is DevOps](what-is-devops.md).

### 60. Deployment frequency doubled the month after leadership set a target. Should you celebrate?

**What to check first:** commits per deployment and lead time over the
same period.

**How to confirm:** many deployments ship no new commits, or one change
is split into several deploys; lead time is unchanged.

**Likely causes and fixes:** Goodhart's law: the metric became the goal.
Withdraw the target, track throughput and instability together per
service, and discuss trends with teams instead of ranking them. See
[measuring delivery performance](measuring-delivery-performance.md).

### 61. The delivery dashboard shows a 0% change fail rate, yet production incidents happen every week. Why?

**What to check first:** whether incidents record the deployment that
caused them.

**How to confirm:** incident records have no link to deployments, and
rollbacks are not marked as unplanned deployments.

**Likely causes and fixes:** the numerator is never populated. Add a
required "triggering deployment" field to incident records and a reason
input to rollback and hotfix workflows, then recompute from raw events.
See [measuring delivery performance](measuring-delivery-performance.md).

### 62. Median lead time is two hours, but product managers say features take months. Who is right?

**What to check first:** where the clock starts and the merge strategy.

**How to confirm:** squash merges stamp commits at merge time; pull
requests stay open for days; flow time from work start is far longer.

**Likely causes and fixes:** both are right about different spans. Add
lead time from the pull request's first commit and flow time from work
start, and look for waiting in backlogs and reviews. See
[measuring delivery performance](measuring-delivery-performance.md).

### 63. Your newly formed SRE team spends 85% of its time on tickets and manual tasks. What do you do?

**What to check first:** a time sample of where SRE hours go, and whether
any cap on operational work exists.

**How to confirm:** no automation projects shipped for a quarter; the top
toil items repeat weekly.

**Likely causes and fixes:** an operations team renamed SRE without the
mechanisms. Agree a 50% cap with leadership, redirect excess work to the
owning development teams, and fund the top toil fixes ranked by payback.
See [DevOps, SRE, and platform engineering](devops-sre-and-platform-engineering.md).

### 64. After moving to "you build it, you run it", developers are burning out. What went wrong?

**What to check first:** pages per person, after-hours pages, rotation
size, and how much planned capacity goes to operational work.

**How to confirm:** a rotation of three or four people, noisy alerts, and
no time budgeted for fixing them.

**Likely causes and fixes:** ownership without support. Merge rotations
until each person is on call about a quarter of the time or less, fix the
noisiest alerts, provide platform defaults for deploys and rollbacks, and
reserve capacity for operability work. See
[team practices and ownership](team-practices-and-ownership.md).

### 65. One engineer in a six-person rotation handled 39% of last month's pages. The schedule is equal. Why?

**What to check first:** which alerts paged that engineer and when.

**How to confirm:** an on-call report shows one alert firing repeatedly
during their week, mostly at night, and rarely needing action.

**Likely causes and fixes:** a noisy alert, not an unfair schedule. Tune
or delete the alert, give the engineer recovery time, and review
per-person load monthly. See
[team practices and ownership](team-practices-and-ownership.md).

### 66. Every change waits for a weekly change advisory board, yet incidents are not decreasing. What do you propose?

**What to check first:** how long changes wait for approval and how many
changes each release bundles.

**How to confirm:** approval wait dominates lead time, and change fail
rate has not improved since the board was added.

**Likely causes and fixes:** external approval as the main control, which
DORA found slows delivery without lowering change fail rates. Move
approval into peer review, automate checks, flag high-risk paths for
extra review, keep an audit trail, and give the board a coordination
role. See [team practices and ownership](team-practices-and-ownership.md).

### 67. Postmortems have become vague since a manager named an engineer in one. How do you recover?

**What to check first:** recent postmortem timelines and near-miss
reports.

**How to confirm:** timelines with gaps, phrases like "a configuration
issue occurred", and no near misses reported.

**Likely causes and fixes:** blame broke psychological safety.
Leadership restates the blameless policy publicly, reviews focus on
system changes, and people are thanked for candid accounts. See
[team practices and ownership](team-practices-and-ownership.md).

### 68. A developer portal launched three months ago and few teams use it. What next?

**What to check first:** which journeys teams actually struggle with,
from interviews and usage data.

**How to confirm:** low weekly active users; templates rarely run;
features chosen without user research.

**Likely causes and fixes:** "build it and they will come". Pick the most
painful journey, ship a minimal golden path for it, measure task success
and satisfaction, and remove any mandates. See
[platform engineering and developer portals](platform-engineering-and-developer-portals.md).

### 69. The platform team's backlog is almost entirely "create X for team Y" tickets. How do you fix it?

**What to check first:** the most frequent request types and how long
each waits.

**How to confirm:** the same few requests (databases, environments,
access) make up most tickets and wait days.

**Likely causes and fixes:** ticket-ops. Automate the top requests behind
an API, CLI, or portal form with secure defaults, and measure time from
request to use. See
[platform engineering and developer portals](platform-engineering-and-developer-portals.md).

### 70. After a mandated move to the internal platform, lead time and deployment frequency got worse. Why?

**What to check first:** where changes wait in the new pipeline and which
teams' needs it does not fit.

**How to confirm:** extra handoffs and approval steps appear in the value
stream; teams with unusual needs work around the platform.

**Likely causes and fixes:** a mandatory, one-size-fits-all path, the
pattern DORA linked to lower throughput. Remove the mandate, make the
platform composable, and fix the slowest steps. See
[platform engineering and developer portals](platform-engineering-and-developer-portals.md).

## Further learning

- [DevOps fundamentals overview](../devops-fundamentals.md)
- [What is DevOps](what-is-devops.md) ·
  [DevOps, SRE, and platform engineering](devops-sre-and-platform-engineering.md) ·
  [Measuring delivery performance](measuring-delivery-performance.md) ·
  [Team practices and ownership](team-practices-and-ownership.md) ·
  [Platform engineering and developer portals](platform-engineering-and-developer-portals.md)
- [DORA: Software delivery performance metrics](https://dora.dev/guides/dora-metrics/)
- [Google SRE Workbook: How SRE Relates to DevOps](https://sre.google/workbook/how-sre-relates/)
- [Team Topologies: Key concepts](https://teamtopologies.com/key-concepts)
