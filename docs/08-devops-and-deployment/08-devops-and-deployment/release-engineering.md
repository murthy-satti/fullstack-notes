# Release Engineering

Release engineering is the discipline of turning source code into
versions that people and machines can install, run, and trust, and of
managing how those versions coexist once they are out. Google's SRE book
describes it concisely as building and delivering software. In practice it
answers questions that a single deploy pipeline does not: which version is
running where, which versions must still work together, how installed
software updates itself, when a release ships, and how dozens of services
or apps in one repository are released without stepping on each other.

## What release engineering provides

- **Identifiable versions:** every artifact (image, bundle, installer,
  schema, event) says exactly what it is and where it came from, so an
  incident starts with facts instead of guesses.
- **Compatibility across versions in flight:** old clients keep working
  against new servers, new servers keep reading old data, and breaking
  changes happen in a deliberate order.
- **Safe update paths:** desktop, mobile, and web clients update through
  signed, staged, observable mechanisms that can be paused.
- **A predictable cadence:** release trains, cut-offs, hotfix branches,
  and long-term support lines that customers and teams can plan around.
- **Independent delivery at scale:** many services, or many apps in one
  monorepo, each released on its own schedule without lock-step deploys.

## How a typical release works

A TaskFlow release that renames a field touches every layer of the
product, one layer at a time:

1. A change merges to `main`. CI builds each artifact once and stamps it
   with a version such as `2.4.1+build.873.g3f2a1c` and its commit.
2. The database migration expands the schema so both the old and the new
   column exist; the running API version keeps working.
3. The TaskFlow API deploys with a rolling update. For a few minutes both
   versions serve traffic, so the new version accepts the old and the new
   request shapes.
4. TaskFlow Web deploys. New tabs load the new bundle; tabs opened earlier
   keep running the old one, so old assets stay available and those tabs
   are prompted to reload.
5. Desktop and mobile clients update over days or weeks through their
   updaters and stores. The API keeps serving every supported client
   version, and clients below the minimum version are asked to update.
6. When usage of the old field drops to zero (or its announced sunset
   date passes), a final release removes it: the contract step.

![Diagram: a snapshot of TaskFlow on one afternoon, layer by layer: open browser tabs run web build 873 and an older build 861; installed apps include desktop 1.9.1, 1.8.4 and 1.6.2, iOS 3.2.0 and 3.0.1, and Android 3.1.0; the API contract has a current /v2 and a deprecated /v1 with a sunset date; a rolling deploy has 4 of 10 API pods on 2.4.1 and 6 on 2.4.0; producers publish task.assigned v2 and v1; and an expanded database schema works with both API versions. A side column lists what keeps each layer compatible, and the caption says that a release changes one layer at a time while every version still in use must work with its neighbours.](release-engineering-overview.svg)

## Practical example

Many teams record each product release as a small manifest that names
every component version that shipped together. CI writes it; humans and
tools read it during incidents and audits.

```json
{
  "release": "2026.11.2",
  "createdAt": "2026-11-13T10:42:00Z",
  "api": {
    "version": "2.4.1+build.873.g3f2a1c",
    "image": "ghcr.io/example/taskflow-api@sha256:<digest>",
    "apiVersions": { "current": "v2", "deprecated": { "v1": "2027-06-30" } }
  },
  "web": { "build": "873", "commit": "3f2a1c9" },
  "schema": { "lastMigration": "0042_add_due_object" },
  "clients": {
    "minSupported": { "desktop": "1.6.0", "ios": "3.0.0", "android": "3.0.0" },
    "latest": { "desktop": "1.9.1", "ios": "3.2.0", "android": "3.2.0" }
  }
}
```

The manifest answers "what exactly is TaskFlow 2026.11.2?" without anyone
reconstructing it from deploy logs, and it gives the API, the updater,
and support tooling one source for the minimum supported client versions.

## Release engineering topic map

**Versions and compatibility**

- [Versioning patterns](release-engineering/versioning-patterns.md)
- [Keeping frontend and backend in sync](release-engineering/keeping-frontend-and-backend-in-sync.md)

**Shipping to users**

- [Update mechanisms and updaters](release-engineering/update-mechanisms-and-updaters.md)
- [Release trains and release management](release-engineering/release-trains-and-release-management.md)

**Many deployables**

- [Deploying microservices](release-engineering/deploying-microservices.md)
- [Monorepo builds and deployments](release-engineering/monorepo-builds-and-deployments.md)

**Review**

- [Release engineering interview questions and answers](release-engineering/interview-questions-and-answers.md) · [cheat sheet](release-engineering/cheat-sheet.md)

Related lessons elsewhere in this section: SemVer, tags, and changelog
automation in
[versioning, tags, and releases](git-and-github/versioning-tags-and-releases.md);
code signing and store review in
[releasing desktop and mobile apps](deployment-strategies/releasing-desktop-and-mobile-apps.md);
and expand-and-contract schema changes in
[zero-downtime database migrations](deployment-strategies/zero-downtime-database-migrations.md).

## Developer perspective and common misconceptions

Think of every interface in your product as something that will exist in
at least two versions at the same moment: the one before your deploy and
the one after. Design each change so that both can run side by side,
stamp every artifact with its exact version, and make the update path
for installed software as safe as your server pipeline.

- "We deploy frontend and backend together, so skew cannot happen." Any
  rolling deploy mixes versions for minutes, and browser tabs keep old
  code for hours or days.
- A version number is not a release process. It only helps when it is
  stamped into the artifact and visible at runtime.
- An installed client cannot be rolled back. A bad version is replaced by
  shipping a newer one.
- Microservices do not make deploys independent by themselves; shared
  databases and breaking contracts turn them into a distributed monolith.
- A monorepo does not mean one deploy. Each app should still build and
  ship on its own when it is affected.

## Further learning

- [Google SRE book: Release Engineering](https://sre.google/sre-book/release-engineering/)
- [Semantic Versioning 2.0.0](https://semver.org/)
- [Kubernetes version skew policy](https://kubernetes.io/releases/version-skew-policy/),
  a good example of a written compatibility promise
- [Malte Ubl: Version skew](https://www.industrialempathy.com/posts/version-skew/)
- [Release engineering interview questions and answers](release-engineering/interview-questions-and-answers.md)
