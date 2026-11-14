# What Is DevOps

"DevOps" is easy to say and hard to pin down. People use the word for a
culture, a set of practices, a movement, a toolchain, and a job title.
This lesson starts from the problem DevOps was invented to solve, traces
its history from the Agile Manifesto to DORA's research, and explains the
two models most people use to describe it: CALMS and the Three Ways.

It then covers the ideas that make DevOps work day to day: value streams,
small batches, and limits on work in progress, with worked numbers for a
change to the TaskFlow API and a short script you can run on your own
team's process.

## Why it matters

Many organizations "adopt DevOps" by buying tools or renaming a team, and
are then surprised that releases are still slow and outages still turn
into arguments. The tools were never the point. DevOps exists because
splitting the people who change a system from the people who run it
creates large batches, long queues, slow feedback, and blame. Once you
understand that problem, every later practice in this section, from
trunk-based development to SLOs, makes sense as an answer to it, and you
can recognize an imitation when you see one.

The payoff is measurable. DORA's research has found for years that teams
which deliver changes quickly also tend to deliver them reliably; its
2025 report calls the "speed vs. stability" trade-off a myth. For a
developer the job changes too: your work is done when the change is
running well in production, not when the pull request merges.

## Real-world usage

- **Flickr at Velocity 2009.** John Allspaw and Paul Hammond's talk
  "10+ Deploys Per Day: Dev and Ops Cooperation at Flickr"
  ([slides post](https://www.kitchensoap.com/2009/06/23/slides-for-velocity-talk-2009/),
  [video](https://www.youtube.com/watch?v=LdOe18KhtT4)) showed a
  development team and an operations team cooperating closely enough to
  deploy many times a day. In the comments of that post, Allspaw
  describes one shared practice: developers write simple stats files
  that are collected automatically into Ganglia and Nagios, so they can
  add their own metrics and alert thresholds without operations writing
  a new script for each one.
- **Devopsdays.** [devopsdays.org](https://devopsdays.org/about) records
  that the first devopsdays was held in Ghent, Belgium in 2009; organizer
  Patrick Debois
  [announced it](https://groups.google.com/g/agile-system-administration/c/hp7WBg4uCJI)
  for 30 and 31 October 2009. His
  [speaker biography](https://devopsdays.org/events/2019-ghent/speakers/patrick-debois/)
  notes that he first presented concepts on agile infrastructure at Agile
  2008 in Toronto. The conference series is still run by local volunteers
  around the world.
- **CAMS and CALMS.** John Willis's July 2010 post
  [What Devops Means to Me](https://www.chef.io/blog/what-devops-means-to-me)
  summarized DevOps as culture, automation, measurement, and sharing, and
  warned that "Devops is not a product". Google's SRE Workbook chapter
  [How SRE Relates to DevOps](https://sre.google/workbook/how-sre-relates/)
  credits the extended acronym CA(L)MS, with Lean added, to John Willis,
  Damon Edwards, and Jez Humble.
- **The Three Ways.** Gene Kim's 2012 article
  [The Three Ways](https://itrevolution.com/articles/the-three-ways-principles-underpinning-devops/)
  presents flow, feedback, and continual experimentation and learning as
  the principles from which the patterns in The Phoenix Project and The
  DevOps Handbook are derived.
- **DORA.** The [DORA capabilities catalog](https://dora.dev/capabilities/)
  turns more than a decade of survey research into named practices, such
  as working in small batches, limiting work in process, and generative
  culture, each with implementation advice, pitfalls, and ways to
  measure it.

**Popular tools and providers:** none of these is DevOps by itself, but
DevOps teams commonly use GitHub or GitLab for code and pipelines,
Jenkins, Terraform or OpenTofu, Docker and Kubernetes, Prometheus,
Grafana, and OpenTelemetry for observability, PagerDuty or incident.io
for on-call, and Jira, Linear, or GitHub Projects to make work visible.

## How it works

### The problem: a wall between two goals

For decades most companies separated software work into two departments.
Development was rewarded for delivering features; operations was
rewarded for keeping production stable. Google's SRE book describes how
neither side could state its interest openly ("We want to launch
anything, any time, without hindrance" versus "We won't want to ever
change anything in the system once it works"), so the conflict turned
into what it calls trench warfare: operations added launch and change
gates, and developers learned to slip changes through as smaller "flag
flips" and "incremental updates" that avoided review.

| | Traditional split | DevOps |
|---|---|---|
| Goal | Dev: ship features. Ops: avoid change | One team: deliver value that keeps working |
| Release size | Large, every few weeks or months | Small, many times a day or week |
| Who deploys | Operations, from a hand-off document | The pipeline, triggered by the owning team |
| Who is paged | Operations, who did not write the code | The team that built the service |
| Feedback to developers | Tickets, days or weeks later | Dashboards and alerts, minutes later |
| Response to failure | Find who is to blame, add more approvals | Restore service, fix the system, share the lesson |

The wall is expensive in both directions. Changes wait in queues for
releases, environments, and approvals, so each release carries many
changes and more risk. When something breaks, the people who understand
the code are not the people holding the pager, so diagnosis is slow and
lessons rarely reach the code.

### A short history

![Diagram: a timeline: 2001, the Agile Manifesto is signed at Snowbird, Utah; 2003, Ben Treynor Sloss starts the Google production team that grows into SRE; 2008, Patrick Debois presents agile infrastructure ideas at Agile 2008 in Toronto; 2009, Allspaw and Hammond give "10+ Deploys Per Day: Dev and Ops Cooperation at Flickr" at Velocity, and the first devopsdays is held in Ghent on 30 and 31 October; 2010, John Willis summarizes DevOps as CAMS and Humble and Farley publish Continuous Delivery; 2012, Gene Kim describes the Three Ways; 2013, The Phoenix Project; 2014, DORA's research program begins; 2016, The DevOps Handbook; 2018, Accelerate explains the research behind DORA's metrics; 2023 and 2024, DORA renames MTTR to failed deployment recovery time and adds deployment rework rate.](devops-history-timeline.svg)

The [Agile Manifesto](https://agilemanifesto.org/) of 2001 changed how
software was written: individuals and interactions, working software,
customer collaboration, and responding to change. Development became
iterative, but operations often stayed a separate, plan-driven stage at
the end. The SRE book notes that the term "DevOps" emerged in industry in
late 2008. In 2009 two events gave it momentum: the Flickr talk at
Velocity in June, and the first devopsdays in October. Books and research
followed: Continuous Delivery (2010), The Phoenix Project (2013), The
DevOps Handbook (2016), and Accelerate (2018), which presented the
research behind DORA's delivery metrics.

Google developed Site Reliability Engineering independently from 2003,
and its SRE Workbook later described SRE as one concrete implementation
of DevOps ideas; that relationship is the subject of
[DevOps, SRE, and platform engineering](devops-sre-and-platform-engineering.md).

### Definitions

There is no standards body for DevOps, so definitions vary in emphasis:

- **AWS:** "DevOps is the combination of cultural philosophies,
  practices, and tools that increases an organization's ability to
  deliver applications and services at high velocity"
  ([What is DevOps?](https://aws.amazon.com/devops/what-is-devops/)).
- **Microsoft:** "DevOps combines development (Dev) and operations (Ops)
  to unite people, process, and technology in application planning,
  development, delivery, and operations"
  ([What is DevOps?](https://learn.microsoft.com/en-us/devops/what-is-devops)).
- **Google SRE Workbook:** "DevOps is a loose set of practices,
  guidelines, and culture designed to break down silos in IT
  development, operations, networking, and security."
- **Jez Humble (2012):** "The essence of Devops, I believe, is to design
  a system in which people are held responsible for the consequences of
  their actions - and indeed, one in which the right thing to do is also
  the easiest thing to do"
  ([There's No Such Thing as a "Devops Team"](https://continuousdelivery.com/2012/10/theres-no-such-thing-as-a-devops-team/)).

A working definition for this site: **DevOps is the set of cultural
habits, practices, and automation that lets one team change a system
quickly and safely and learn from how it behaves in production.** Each
part matters: culture without automation does not scale, automation
without shared ownership just moves the wall, and neither works without
feedback from production.

### CALMS

CALMS is a checklist for whether an organization is actually doing
DevOps or only using the vocabulary.

| Letter | Meaning | In practice for TaskFlow | Warning sign |
|---|---|---|---|
| **C**ulture | Shared ownership, trust, blameless learning. Willis: "If you don't have culture, all automation attempts will be fruitless." | The tasks team owns the API from design to on-call; incidents get blameless reviews | Postmortems name a person as the root cause |
| **A**utomation | Pipelines, infrastructure as code, automated tests and rollbacks | Every merge is tested and deployed by the pipeline; servers are built from code | Deploys need a person following a checklist |
| **L**ean | Small batches, limited work in progress, removing waste and waiting | Pull requests under a day old; a WIP limit on the board | Work waits days for reviews, environments, or approvals |
| **M**easurement | Measure delivery, reliability, and flow to guide improvement. Willis: "If you can't measure, you can't improve." | DORA metrics, SLOs, and lead time per stage on one dashboard | Nobody knows how long a change takes to reach users |
| **S**haring | Share knowledge, tools, and lessons across teams. Willis: "Sharing is the loopback in the CAMS cycle." | Postmortems and runbooks are published internally; platform tools are shared | Each team solves the same deployment problem alone |

Culture comes first in the acronym for a reason: an organization that
punishes people for outages will hide problems from any amount of
tooling. DORA's
[generative organizational culture](https://dora.dev/capabilities/generative-organizational-culture/)
capability, based on Ron Westrum's typology, finds that high-trust
cultures in which "failure leads to inquiry" and "messengers are trained"
predict better software delivery and organizational performance.

### The Three Ways

![Diagram: three bands; the First Way, flow and systems thinking, shows work moving left to right from development to operations to the customer in small batches without passing known defects downstream, optimizing the whole value stream rather than one silo; the Second Way, amplify feedback loops, shows dashed arrows right to left from the customer to operations to development through monitoring, alerts, user feedback, and blameless reviews; the Third Way, continual experimentation and learning, shows a loop of running safe experiments, learning from failure, practicing through game days, and improving daily work, repeated to keep improving the system of work.](three-ways.svg)

Gene Kim's Three Ways describe the principles that the patterns in The
Phoenix Project and The DevOps Handbook are derived from:

| Way | What it means | Outcomes named in the article | TaskFlow examples |
|---|---|---|---|
| First Way: flow and systems thinking | Optimize the performance of the whole system, from idea to customer, not one department | "never passing a known defect to downstream work centers, never allowing local optimization to create global degradation, always seeking to increase flow" | Small pull requests, CI on every change, one artifact promoted through environments |
| Second Way: amplify feedback loops | Create right-to-left feedback and make it fast and loud | "shortening and amplifying all feedback loops, and embedding knowledge where we need it" | Error-budget alerts to the owning team, canary analysis, a broken build stops the line |
| Third Way: continual experimentation and learning | Take risks and learn from failure; repetition and practice lead to mastery | "allocating time for the improvement of daily work, creating rituals that reward the team for taking risks, and introducing faults into the system to increase resilience" | Blameless postmortems, game days, time each sprint for automation and fixes |

The ways build on each other. Faster flow without feedback just ships
problems faster, and feedback that nobody has time to act on changes
nothing. The Third Way's "introducing faults into the system" is
practiced through chaos experiments and game days, covered in
[chaos engineering and game days](../performance-and-reliability-testing/chaos-engineering-and-game-days.md).

### What DevOps is not

- **A team in the middle.** Jez Humble's 2012 post argued that "THERE IS
  NO SUCH THING AS A DEVOPS TEAM": inserting a new group between
  development and operations creates "another functional silo", which is
  "clearly a poor (and ironic) way" to fix problems caused by silos. In
  the same post he accepts a team that builds a self-service platform and
  coaches others, as long as it is not on the hook for running other
  teams' systems. That idea grew into platform engineering.
- **A product or a tool.** Willis: "If a vendor tells you that they have
  a Devops product or a Devops compliant product, then you will know
  immediately that they don't have a clue of what Devops is."
- **Developers doing everything alone.** Ownership without support burns
  people out. Teams need platforms, documentation, and enabling experts,
  which later lessons cover.
- **The end of process or compliance.** Willis wrote that "there is
  nothing mutually exclusive about Devops and the enterprise process".
  DORA found that external approval boards slow delivery without
  lowering change fail rates, and recommends peer review plus automation
  to meet segregation-of-duties requirements (see
  [team practices and ownership](team-practices-and-ownership.md)).
- **Trading stability for speed.** Small, frequent changes are the main
  way DevOps teams become more stable, not less.
- **Only for startups or the web.** The practices apply to any software
  that changes and runs: internal systems, regulated platforms,
  embedded software with over-the-air updates.

### Value streams and value stream mapping

A **value stream** is the sequence of steps that turns a request into
value for a user. For software delivery, DORA focuses on the part from
code committed to code running in production, which is exactly what its
change lead time measures. **Value stream mapping (VSM)** draws that
sequence with two numbers per step: the time someone actually works on
the change, and the time the change waits before the step starts.

```text
lead time       = sum of work time + sum of wait time
flow efficiency = work time / lead time
```

DORA's [value stream mapping guide](https://dora.dev/guides/value-stream-management/)
recommends agreeing on a specific outcome first, mapping with everyone
who touches the work, and using rough numbers: "You generally need low
precision in the data." It also points out that software delivery has two
value streams: the normal path for features and fixes, and the recovery
path after a failed change, where failed deployment recovery time is
essentially the lead time of the fix.

![Diagram: current state of one TaskFlow change from commit to production in six steps with wait and work times: code review waits 20 h and takes 30 min, CI build and tests wait 12 min and take 18 min, the weekly release cut waits 72 h and takes 10 min, manual QA in staging waits 16 h and takes 3 h, the change board waits 48 h and takes 30 min, and the production deploy waits 2 h and takes 30 min; lead time is 163.2 h (6.8 days), 158.2 h waiting and 5.0 h of work, a flow efficiency of 3.0 percent; after moving to small pull requests reviewed within 2 h, automated tests, deploy on every merge with a canary, and peer review instead of the change board, lead time is 3.1 h, 2.0 h waiting and 1.1 h of work, a flow efficiency of 35.8 percent.](value-stream-map.svg)

The worked example is typical of a first map. Almost all of the 6.8 days
is waiting: for a reviewer, for the weekly release cut, for a QA slot,
for the approval board. Making the CI pipeline twice as fast would save 9
minutes out of 163 hours. Removing the weekly release cut alone would
save 72 hours. A value stream map turns the vague feeling that "releases
are slow" into a specific queue someone can remove. (Scheduled release
trains still suit some products, such as mobile apps; see
[release trains and release management](../release-engineering/release-trains-and-release-management.md).)

### Small batches

Batch size is the amount of change that moves through the system
together. DORA's
[working in small batches](https://dora.dev/capabilities/working-in-small-batches/)
capability recommends that developers check "multiple small releasable
changes into trunk at least once per day" and warns that "any batch of
code that takes longer than a week to complete and check is too big."

![Diagram: two four-week timelines with the same 40 changes, two per working day; with a large batch, the finished changes wait as grey dots and ship together in one release of 40 changes, so feedback on the first change arrives after about four weeks, a failure has 40 suspects, and a rollback removes all 40 changes; with small batches, each change ships on its own soon after it is written, giving 40 small releases, so feedback arrives within hours, a failure has one suspect, and a rollback removes one change.](small-vs-large-batches.svg)

A little arithmetic shows why. Suppose each change, however well tested,
has a 2% chance of causing a production problem (an illustrative
number):

```text
40 changes in one release:  P(at least one bad change) = 1 - 0.98^40 = 0.554  (55%)
1 change per deployment:    P(bad change)               = 0.02         (2%)

Finding the culprit in a failed 40-change release by bisection:
  log2(40) = 5.3, so about 6 rounds of deploy-and-check
```

The total number of bad changes is the same in both cases, but the large
release almost always contains one, nobody knows which, and rolling back
removes 39 good changes along with it. Small batches also shorten
feedback: a developer hears about a problem while the code is still in
their head. Teams make batches small with trunk-based development,
feature flags for unfinished work, dark launches, and branch by
abstraction (see [branching strategies](../git-and-github/branching-strategies.md)
and [feature flags and progressive delivery](../deployment-strategies/feature-flags-and-progressive-delivery.md)).

### Limiting work in progress

Work in progress (WIP) is everything started but not finished: open pull
requests, half-built features, tickets "in review". DORA's
[work in process limits](https://dora.dev/capabilities/wip-limits/)
capability explains that assigning people to many tasks at once makes
every task take longer, and recommends making all work visible on a
board, setting a WIP limit for each column, and pulling new work only
when something finishes. Its research shows WIP limits help most when
combined with visual displays and feedback from monitoring.

**Little's law** from queueing theory explains why. For a stable system,
averaged over time:

```text
average lead time = average work in progress / average throughput

TaskFlow team finishing 10 items per week:
  30 items in progress  ->  30 / 10 = 3 weeks per item
  10 items in progress  ->  10 / 10 = 1 week per item
```

The team did not work faster; it started less. In practice throughput
often rises too, because people switch context less and blocked work
becomes visible instead of hiding in a long list. DORA's advice for
when a WIP limit leaves someone idle is to help unblock other parts of
the value stream rather than relax the limit.

## When to use and when not to use

DevOps is not a tool you add when convenient; any team that builds and
runs software already has a value stream and a feedback loop, good or
bad. The real decisions are where to start and what not to copy.

| Situation | Start with | Avoid |
|---|---|---|
| Small product team, one service | Shared ownership, CI on every merge, automated deploys, basic SLO alerts | Hiring a "DevOps engineer" to own deploys for everyone |
| Several teams with slow, painful releases | A value stream map, then remove the biggest queue | Buying a new tool before knowing where work waits |
| Regulated environment (finance, health) | Peer review, automated checks, and an audit trail as the change control | Assuming compliance requires a weekly approval board |
| Legacy system with no tests | Characterization tests, a scripted deploy, then smaller releases | Daily production deploys before you can test or roll back |
| Vendor or packaged software you do not build | Ops practices: automated configuration, monitoring, upgrade rehearsals | Claiming "you build it, you run it" when you do not build it |
| Large organization starting out | One volunteer team as a pilot, with leadership support and measured results | A big-bang reorganization with new titles and no change in how work flows |

## Practical examples

### Map a value stream as data

Keep the map in the repository as JSON, so it can be reviewed and
updated after each improvement:

```json
{
  "name": "TaskFlow API change, commit to production",
  "states": {
    "current": [
      { "step": "Code review", "waitMin": 1200, "workMin": 30 },
      { "step": "CI build and tests", "waitMin": 12, "workMin": 18 },
      { "step": "Weekly release cut", "waitMin": 4320, "workMin": 10 },
      { "step": "Manual QA in staging", "waitMin": 960, "workMin": 180 },
      { "step": "Change advisory board", "waitMin": 2880, "workMin": 30 },
      { "step": "Production deploy", "waitMin": 120, "workMin": 30 }
    ],
    "future": [
      { "step": "Code review (small PR)", "waitMin": 120, "workMin": 15 },
      { "step": "CI build and tests", "waitMin": 0, "workMin": 12 },
      { "step": "Automated end-to-end tests", "waitMin": 0, "workMin": 10 },
      { "step": "Deploy on merge with canary", "waitMin": 0, "workMin": 30 }
    ]
  }
}
```

```js
// scripts/vsm.js: lead time, flow efficiency, and the biggest wait in a value stream
// Usage: node scripts/vsm.js value-stream.json
import { readFile } from "node:fs/promises";

const map = JSON.parse(await readFile(process.argv[2], "utf8"));
const hours = (min) => (min / 60).toFixed(1);

for (const [state, steps] of Object.entries(map.states)) {
  const work = steps.reduce((sum, s) => sum + s.workMin, 0);
  const wait = steps.reduce((sum, s) => sum + s.waitMin, 0);
  const lead = work + wait;
  const worst = steps.reduce((a, b) => (b.waitMin > a.waitMin ? b : a));

  console.log(`${state}: ${map.name}`);
  for (const s of steps) {
    console.log(`  ${s.step.padEnd(28)} wait ${hours(s.waitMin).padStart(5)} h   work ${hours(s.workMin).padStart(4)} h`);
  }
  console.log(`  lead time ${hours(lead)} h (${(lead / 1440).toFixed(1)} days), work ${hours(work)} h, wait ${hours(wait)} h`);
  console.log(`  flow efficiency ${((100 * work) / lead).toFixed(1)}%`);
  console.log(`  biggest wait: ${worst.step} (${((100 * worst.waitMin) / lead).toFixed(0)}% of lead time)\n`);
}
```

Running it (the project's `package.json` has `"type": "module"`):

```text
$ node scripts/vsm.js value-stream.json
current: TaskFlow API change, commit to production
  Code review                  wait  20.0 h   work  0.5 h
  CI build and tests           wait   0.2 h   work  0.3 h
  Weekly release cut           wait  72.0 h   work  0.2 h
  Manual QA in staging         wait  16.0 h   work  3.0 h
  Change advisory board        wait  48.0 h   work  0.5 h
  Production deploy            wait   2.0 h   work  0.5 h
  lead time 163.2 h (6.8 days), work 5.0 h, wait 158.2 h
  flow efficiency 3.0%
  biggest wait: Weekly release cut (44% of lead time)

future: TaskFlow API change, commit to production
  Code review (small PR)       wait   2.0 h   work  0.3 h
  CI build and tests           wait   0.0 h   work  0.2 h
  Automated end-to-end tests   wait   0.0 h   work  0.2 h
  Deploy on merge with canary  wait   0.0 h   work  0.5 h
  lead time 3.1 h (0.1 days), work 1.1 h, wait 2.0 h
  flow efficiency 35.8%
  biggest wait: Code review (small PR) (64% of lead time)
```

The "biggest wait" line is the point of the exercise: it tells the team
which single queue to attack next. In the future state the biggest wait
is code review, so the next experiment might be a team agreement to
review small pull requests within two working hours.

### Write down a team working agreement

A working agreement turns the principles into habits the team can check.
Keep it short, in the repository, and revisit it in retrospectives:

```text
# docs/working-agreement.md (TaskFlow tasks team)

Flow
- Pull requests stay small (aim for under 300 changed lines) and merge within one working day.
- Reviews of small pull requests start within two working hours.
- WIP limit: at most 5 items "in progress" and 3 "in review" for 5 developers.
- Unfinished features merge behind a flag that is off by default.

Feedback
- A red main branch is fixed or reverted before anything else.
- Every deploy is watched for 15 minutes on the service dashboard by its author.
- The team that writes the code is on call for it; pages go to us, not to another team.

Learning
- Every incident with user impact gets a blameless review within five working days.
- 20% of each sprint is reserved for automation, reliability, and debt.
- We revisit this agreement and the value stream map every quarter.
```

Numbers such as "under 300 lines" are team choices, not universal rules.
What matters is that they are explicit, visible, and measured.

### Make work in progress visible

Aging pull requests are invisible inventory. With the GitHub CLI you can
list every open pull request older than two days, with its age and size:

```bash
# Open PRs waiting more than two days: number, age in days, size, title
gh pr list --state open --limit 100 \
  --json number,title,createdAt,additions,deletions \
  --jq '.[] | select((now - (.createdAt | fromdateiso8601)) > 2 * 86400)
        | "#\(.number) \(((now - (.createdAt | fromdateiso8601)) / 86400) | floor)d \(.additions + .deletions) lines \(.title)"'
```

With two open pull requests, one opened a few hours ago and one twelve
days ago, the output is:

```text
#412 12d 660 lines Add due dates to tasks
```

A 12-day-old, 660-line pull request is exactly the kind of large batch
the rest of this lesson warns about. Bring the list to the daily standup
and finish old work before starting new work.

## Best practices

- Start from the problem, not the tools: map how a change reaches users
  and find where it waits.
- Give one team ownership of a service from design to production
  support, and give that team the tools and time to do it.
- Keep batches small: merge to trunk at least daily, hide unfinished work
  behind flags, deploy each change on its own.
- Make work visible and limit work in progress; finish before starting.
- Automate the path to production so every change follows the same
  tested, auditable route, including emergency fixes.
- Measure flow and reliability as trends for one service at a time, and
  use the numbers to choose experiments, not to rank people.
- Treat incidents as information about the system; review them
  blamelessly and share the lessons.
- Reserve time for improving the system of work, not only for features.

## In production

- **A new "DevOps team" was hired and releases are no faster.**
  *Detect:* lead time and deployment frequency are unchanged after six
  months; developers now file tickets to the new team instead of the old
  operations team. *Cause:* a new silo between development and
  operations, the anti-pattern Humble described. *Fix:* make product
  teams own their deploys and on-call, and turn the new team into a
  platform or enabling team that builds self-service tools and coaches.
- **Deploys got faster but incidents rose.**
  *Detect:* deployment frequency doubled while change fail rate climbed
  from 5% to 20%. *Cause:* automation of the First Way without the
  Second Way: no automated tests at the right level, no canary, no alert
  tied to user impact. *Fix:* add tests and progressive delivery, alert
  on SLO burn rate, and track throughput and instability together.
- **Everything is automated, yet a change still takes two weeks.**
  *Detect:* the pipeline runs in 12 minutes, but DORA change lead time
  is about 14 days. *Cause:* waiting dominates: reviews, release trains,
  and approval meetings. *Fix:* map the value stream, then remove the
  biggest queue first, typically by moving to trunk-based development
  and replacing external approvals with peer review and automated checks.
- **Product teams own production and are burning out.**
  *Detect:* rising after-hours pages, swapped on-call shifts, and people
  leaving the rotation. *Cause:* "you build it, you run it" introduced
  without platform support, runbooks, or time to fix noisy alerts.
  *Fix:* cap on-call load, invest in a paved road for deploys and
  monitoring, and reserve capacity for operability work.
- **The board is full and nothing finishes.**
  *Detect:* 30 cards in progress for 6 people, many aging for weeks;
  throughput is flat. *Cause:* no WIP limits, so every request is
  started immediately. *Fix:* set WIP limits per column, stop starting,
  and swarm on the oldest items; expect lead time to fall as Little's law
  predicts.
- **A transformation program stalls after a reorganization.**
  *Detect:* new titles and team names, but the value stream map looks
  the same. *Cause:* structure changed while daily practices, incentives,
  and approvals did not. *Fix:* pick one team and one measurable outcome,
  run small experiments, and spread what works.

## Important terminology

- **DevOps:** Cultural habits, practices, and automation that let one
  team change a system quickly and safely and learn from production.
- **Wall of confusion:** The hand-off between development and operations
  in the traditional model, where work and blame are thrown over.
- **CAMS / CALMS:** Culture, Automation, (Lean,) Measurement, Sharing; a
  summary of what DevOps requires.
- **The Three Ways:** Flow and systems thinking; amplified feedback
  loops; continual experimentation and learning.
- **Value stream:** The sequence of steps that turns a request into value
  for a user.
- **Value stream mapping:** Drawing a value stream with the work and wait
  time of each step to find delays.
- **Lead time:** Total elapsed time for a change, work plus waiting.
- **Flow efficiency:** Work time divided by lead time.
- **Batch size:** The amount of change that moves through the system
  together.
- **Work in progress (WIP):** Work started but not finished.
- **WIP limit:** A maximum number of items allowed in a stage at once.
- **Little's law:** Average lead time equals average WIP divided by
  average throughput.
- **Generative culture:** Westrum's high-trust, performance-oriented
  culture, in which failure leads to inquiry.

## Common mistakes and misconceptions

- Treating DevOps as a toolchain purchase or a job title.
- Creating a "DevOps team" that deploys for everyone, which recreates the
  wall with a new name.
- Automating a slow process instead of removing its queues.
- Measuring individual developers' activity instead of team flow.
- Believing speed and stability are a trade-off; small batches improve
  both.
- Copying the practices of very large companies without their scale,
  staff, or problems.
- Starting more work to "keep everyone busy", which lengthens every
  item's lead time.
- Treating DevOps as finished once a pipeline exists; the Third Way is
  continuous.

## Revision questions

1. What problem did the separation of development and operations
   create, in terms of incentives, batch size, and feedback?
2. Name two events from 2009 that gave the DevOps movement momentum,
   and who was behind each.
3. Explain each letter of CALMS with one concrete practice and one
   warning sign.
4. Describe the Three Ways. Why does faster flow without feedback make
   things worse?
5. Why did Jez Humble argue there is no such thing as a "DevOps team",
   and what kind of central team did he accept?
6. A change spends 30 minutes in review after waiting 2 days, 15 minutes
   in CI after waiting 10 minutes, and 20 minutes deploying after waiting
   5 days for a release window. Compute the lead time and flow
   efficiency. (Work = 65 min; wait = 2,880 + 10 + 7,200 = 10,090 min;
   lead time = 10,155 min, about 169 h or 7.1 days; flow efficiency =
   65 / 10,155 = 0.64%.)
7. A team has 24 items in progress and finishes 8 per week. What is the
   average lead time, and what happens if they cap WIP at 8? (3 weeks;
   1 week, if throughput holds.)
8. If each change has a 1% chance of causing an incident, what is the
   chance that a release of 50 changes contains at least one bad change?
   (1 - 0.99^50 = 39.5%.)

## Further learning

- [IT Revolution: The Three Ways (Gene Kim)](https://itrevolution.com/articles/the-three-ways-principles-underpinning-devops/)
- [John Willis: What Devops Means to Me](https://www.chef.io/blog/what-devops-means-to-me)
- [Jez Humble: There's No Such Thing as a "Devops Team"](https://continuousdelivery.com/2012/10/theres-no-such-thing-as-a-devops-team/)
- [DORA: Working in small batches](https://dora.dev/capabilities/working-in-small-batches/)
  and [Work in process limits](https://dora.dev/capabilities/wip-limits/)
- [DORA: Value stream mapping guide](https://dora.dev/guides/value-stream-management/)
- [Google SRE Workbook: How SRE Relates to DevOps](https://sre.google/workbook/how-sre-relates/)
- Next: [DevOps, SRE, and platform engineering](devops-sre-and-platform-engineering.md). Back to the [DevOps fundamentals overview](../devops-fundamentals.md).
