# DevOps Fundamentals Cheat Sheet

Quick revision of the DevOps fundamentals lessons, for use before an
interview or before you change how a team delivers and runs software.

## Key commands

| Command | What it does |
|---|---|
| `git rev-list <previous deployed sha>..<deployed sha>` | Lists exactly the commits a deployment shipped |
| `git log --format='%H,%cI'` | Exports commit SHAs with ISO 8601 committer times, for lead time |
| `node scripts/toil-report.js toil.csv 4 40` | Weekly toil, share of team time, and automation payback, cheapest first |
| `node scripts/oncall-report.js pages.csv Europe/Berlin` | Pages per person, out-of-hours share, and the noisiest alert |
| `node scripts/golden-state.js repos/*` | Scores each repository against the golden path; exits non-zero on gaps |

## Key configuration

```text
# .github/CODEOWNERS: the last matching pattern takes precedence
*                    @example/tasks-team
/migrations/         @example/data-reliability
/infra/              @example/platform-team
```

```yaml
# .github/workflows/deliver.yml (excerpt): call the platform's shared pipeline
jobs:
  pipeline:
    uses: example/platform-workflows/.github/workflows/node-service.yml@v1
    with:
      service: taskflow-reminders
    secrets: inherit
```

```yaml
# catalog-info.yaml: one component, its owner, and its system
apiVersion: backstage.io/v1alpha1
kind: Component
metadata:
  name: taskflow-api
spec:
  type: service
  lifecycle: production
  owner: tasks-team
  system: taskflow
```

## Decision guide

| If you need | Choose | Why |
|---|---|---|
| Fast feedback from production | You build it, you run it, with platform and enabling support | Teams paged for their own bugs fix the causes |
| Release decisions without arguments | SLOs with an agreed error budget policy | A number agreed in advance decides when releases slow down |
| To pick which toil to remove first | A toil log ranked by payback | Hours to automate divided by hours saved per week |
| Segregation of duties | Peer review in the pull request, plus automated checks | External approval slows delivery without lowering change fail rate |
| Extra scrutiny where risk is real | A protected environment for flagged paths (migrations, auth, infra) | Reviewers on everything recreate the CAB |
| Dedicated SRE support | Product or embedded SRE, for critical services only | Most services should stay with their developers |
| Shared delivery for one or two teams | Templates, a wiki page, and managed services | A self-built platform needs a dedicated team |
| Shared delivery for several teams | A thin platform: one golden path, a reusable workflow, a catalog | The thinnest viable platform, adopted by choice |
| A record of why the system is built this way | Numbered ADRs in the repository | Reviewed like code; superseded records are kept |

## Numbers and defaults to remember

| Item | Value |
|---|---|
| Lead time | Work time + wait time; flow efficiency = work time / lead time |
| Little's law | Average lead time = average WIP / average throughput |
| Batch risk | `1 - (1 - p)^n`: 40 changes at 2% each, about 55% |
| Error budget | 1 - SLO; 99.9% over 30 days is about 43 minutes |
| SRE time | At least 50% engineering; at most 25% on call |
| On-call load | At most two incidents per 8 to 12-hour shift |
| Rotation size | 8 engineers for one site, 6 per site for two (primary and secondary) |
| Toil at Google | About 33% on average, against a target under 50% |
| DORA throughput | Change lead time, deployment frequency, failed deployment recovery time |
| DORA instability | Change fail rate, deployment rework rate |
| 2024 elite cluster | Lead time under 1 day, deploys on demand, 5% change fail rate, recovery under 1 hour (19% of respondents) |
| 2025 typical respondent | Lead time 1 day to 1 week; deploys weekly to monthly; recovery under 1 day; change fail and rework rates 8% to 16% |
| Trunk-based development | 3 or fewer active branches, merge daily, no code freezes |
| Team Topologies | 4 team types, 3 interaction modes |
| SPACE | 5 dimensions; measure at least 3 |
| Platforms (DORA 2024) | +8% individual productivity, +10% team performance, -8% throughput, -14% change stability |
| GitHub deployment statuses | Previous statuses kept for 90 days; store your own copy |

## Top mistakes

- **Creating a "DevOps team" between development and operations.** Give
  product teams deploys and on-call; turn the central team into a
  platform or enabling team.
- **Renaming operations "SRE".** Measure toil, cap operational work at
  50%, and set SLOs with an error budget policy before changing the name.
- **Setting a DORA metric as a target.** Track throughput and instability
  together per service and discuss trends instead of ranking teams.
- **Reporting average lead time.** Report the median and p90, computed
  from raw events kept in your own store.
- **A change fail rate that reads 0%.** Link every incident to its
  deployment and mark rollbacks and hotfixes as unplanned deployments.
- **Judging on-call fairness by shift counts.** Track pages per person
  and out of hours, and fix the noisy alert.
- **Mandating the platform.** Make the golden path the easiest path, keep
  it optional, and measure adoption and task success.
- **Copying the pipeline into every repository.** Call one versioned
  reusable workflow, so a fix reaches every service.

## Where to go deeper

- [What is DevOps](what-is-devops.md)
- [DevOps, SRE, and platform engineering](devops-sre-and-platform-engineering.md)
- [Measuring delivery performance](measuring-delivery-performance.md)
- [Team practices and ownership](team-practices-and-ownership.md)
- [Platform engineering and developer portals](platform-engineering-and-developer-portals.md)
- [Interview questions and answers](interview-questions-and-answers.md)

Back to the [DevOps fundamentals overview](../devops-fundamentals.md).
