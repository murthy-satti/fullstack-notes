# DevOps and Deployment

DevOps is the set of practices that gets a code change from a developer's
laptop to real users quickly, safely, and repeatably, and then keeps it
running. It joins two jobs that used to belong to separate teams:
**delivery** (building, testing, packaging, and releasing software) and
**operations** (configuring, securing, observing, backing up, and recovering
it). The goal is not more tools; it is short feedback loops, so that small
changes ship often and problems are found and fixed in minutes rather than
weeks.

Every practice in this section exists because something went wrong without
it: a release that only worked on one machine, a secret committed to git, a
deploy that took the site down, an expired certificate, a backup that could
not be restored. This section teaches what each practice prevents, how it
works underneath, and how to apply it to a real Node.js application.

![Diagram: one change moves through six stages: Code (commit and review in Git and GitHub), Integrate (test and build in CI/CD), Package (a tagged Docker image), Deploy (release safely with Kubernetes and rollout strategies), Operate (configuration, TLS, backups, and disaster recovery), and Observe (logs, metrics, traces, and SLOs). The first four stages are the delivery pipeline that runs on every change; the last two are operations that run all the time. Infrastructure as Code sits under Deploy and Operate and provisions the platform. A dashed feedback arrow runs from Observe back to Code.](devops-lifecycle.svg)

## What this section teaches

You will learn how to:

- Explain what DevOps, SRE, and platform engineering are, how teams own
  what they ship, and how delivery performance is measured with the DORA
  metrics.
- Use Git and GitHub well: how Git stores history, merging and rebasing,
  branching strategies, pull requests and code review, versioning and
  releases, and how to recover from mistakes.
- Build CI/CD pipelines that test every change, build an artifact once, and
  promote the same artifact through environments, with GitHub Actions and a
  secure software supply chain.
- Package applications as Docker images with production-grade Dockerfiles,
  run local stacks with Docker Compose, and debug containers.
- Run containers on Kubernetes: deployments, services, configuration,
  health probes, rolling updates, autoscaling, ingress, and Helm.
- Manage configuration and secrets correctly across environments, including
  how `.env` files are really loaded and why frontend variables are public.
- Release safely with rolling, blue-green, and canary deployments, feature
  flags, zero-downtime database migrations, and fast rollbacks, for
  backends, static frontends, and desktop or mobile apps.
- Version and release software as a system: versioning patterns, keeping
  frontends, backends, and installed apps compatible, building updaters,
  running release trains, and deploying microservices and monorepos.
- Run a Linux server yourself: SSH, hardening a fresh machine, systemd
  and Nginx, troubleshooting CPU, memory, disk, and network problems, and
  scheduled jobs.
- Connect domains to hosting, migrate DNS without downtime, put a CDN in
  front of a site, and send email that does not land in spam.
- Grow from one server to many: load balancers and their algorithms,
  global traffic routing, multi-AZ and multi-region designs, autoscaling,
  service discovery and meshes, resilience patterns, and how large
  companies run at scale.
- Choose where to run and store software, from static hosts and
  serverless functions to containers, VMs, managed databases, and object,
  video, and archive storage, with real prices and the reasons each option
  fits a scenario.
- Provision infrastructure as code with Terraform, understand the cloud
  building blocks, and apply immutable infrastructure and GitOps.
- Build security into delivery and the cloud: pipeline scanners, identity
  and access, network security, WAF and DDoS protection, vulnerability
  management, and compliance basics.
- Observe running systems with structured logs, metrics, traces, SLOs,
  alerts, error tracking, and a calm incident process.
- Test performance and reliability with load tests, k6, bottleneck
  hunting, and chaos experiments.
- Serve traffic over TLS with certificates that renew themselves, and
  protect data with backups and disaster recovery plans that are tested.

## How DevOps practices appear in one change

Follow a single bug fix to the TaskFlow API, the Express and MongoDB task
service from the Backend section:

1. A developer creates a short-lived branch, commits the fix, and opens a
   **pull request**. Branch protection requires a review and green checks.
2. **CI** runs lint, type checks, unit tests, and integration tests against
   a real MongoDB in a service container. A failure blocks the merge.
3. After the merge, the pipeline builds a **Docker image** once, tags it
   with the commit SHA, scans it, and pushes it to a registry.
4. The same image, identified by its **digest**, is deployed to staging.
   **Configuration and secrets** are injected by the environment, never
   baked into the image.
5. Smoke tests pass, an approver promotes the image to production, and a
   **canary** sends 5% of traffic to the new version while dashboards and
   **SLO** burn rates are watched.
6. Metrics stay healthy, the rollout completes, and the old version is kept
   for an instant **rollback**. Had error rates risen, the rollout would have
   stopped automatically.
7. Throughout, the infrastructure underneath (network, cluster, DNS, TLS
   certificates, backups) is defined in **code**, reviewed like any other
   change, and recreated the same way every time.

The fix reached users in under an hour, and every step left a record of
what changed, who approved it, and which tests it passed.

## Learning path

The navigation follows the path a change takes, from the team's way of
working to the code, the release, the servers it runs on, and the
operations that keep it healthy:

1. **[DevOps Fundamentals](devops-fundamentals.md)**: what DevOps is, how
   SRE and platform teams fit in, and how to measure delivery.
2. **[Git and GitHub](git-and-github.md)**: version control,
   collaboration, and releases.
3. **[CI/CD](ci-cd.md)**: automated checks, builds, and promotion.
4. **[Docker](docker.md)**: packaging an application and its runtime into
   an image.
5. **[Kubernetes](kubernetes.md)**: running and scaling containers across
   machines.
6. **[Environment Variables and Secrets](environment-variables.md)**:
   configuration that changes per environment, and secrets that must never
   leak.
7. **[Deployment Strategies](deployment-strategies.md)**: releasing
   without downtime and rolling back in seconds.
8. **[Release Engineering](release-engineering.md)**: versions,
   compatibility between clients and servers, updaters, and releasing many
   services.
9. **[Linux Server Operations](linux-server-operations.md)**: running and
   fixing a server by hand.
10. **[Domains, DNS and Email](domains-dns-and-email.md)**: names,
    records, CDNs, and email that arrives.
11. **[Load Balancing and Multi-Server Architecture](load-balancing-and-multi-server.md)**:
    spreading traffic across servers, zones, and regions.
12. **[Hosting and Cloud Platforms](hosting-and-platforms.md)**: where to
    run and store everything, and what it costs.
13. **[Infrastructure as Code](infrastructure-as-code.md)**: servers,
    networks, and cloud resources defined in reviewed, versioned code.
14. **[DevSecOps and Cloud Security](devsecops-and-cloud-security.md)**:
    security checks in the pipeline and guardrails in the cloud.
15. **[Monitoring and Logging](monitoring-and-logging.md)**: knowing what
    production is doing, and responding to incidents.
16. **[Performance and Reliability Testing](performance-and-reliability-testing.md)**:
    finding the limits before users do.
17. **[SSL Certificates](ssl-certificates.md)**: TLS, certificate chains,
    and automatic renewal.
18. **[Backups and Disaster Recovery](backups.md)**: protecting data and
    restoring it within a known time.

If you are new to the area, start with DevOps Fundamentals, then Git,
CI/CD, and Docker; together they are enough to deploy a real project. To
run that project on your own server and domain, add Linux Server
Operations, Domains, DNS and Email, and SSL Certificates; to use a managed
platform instead, read Hosting and Cloud Platforms first. Add Kubernetes,
Load Balancing, and Infrastructure as Code when you run several services,
and Release Engineering when you ship apps that update separately from the
backend. Read DevSecOps, Monitoring, Performance Testing, and Backups
before anything you build goes to real users.

Every lesson includes how the concept works, practical examples, best
practices, production failure modes, terminology, common mistakes, revision
questions, and official learning resources. Each subject ends with
interview questions and answers.

## Related sections

- [Networking and Protocols](../01-networking-and-protocols/index.md) for
  how DNS, TCP, and HTTP work underneath the tools in this section.
- [Backend Development](../03-backend-development/index.md) for the
  TaskFlow API itself, health checks, and graceful shutdown.
- [Application Architecture](../05-application-architecture/index.md) for
  scalability, availability, and stateless services.
- [Servers and Infrastructure](../07-servers-and-infrastructure/index.md)
  for servers, Nginx, reverse proxies, load balancing, DNS, and CDNs.
- [Operating Systems and Linux](../09-operating-systems-and-linux/index.md)
  for processes, signals, and the Linux features containers are built on.
- [Security and Testing](../10-security-and-testing/index.md) for the
  security and test practices that pipelines enforce.

## A first practical exercise

Take the TaskFlow API from the Backend section and give it a delivery
pipeline:

1. Protect the `main` branch so changes need a pull request and a passing
   check.
2. Add a GitHub Actions workflow that installs dependencies with `npm ci`,
   lints, and runs the tests against MongoDB in a service container.
3. Write a multi-stage Dockerfile that runs the API as a non-root user, and
   build the image in CI tagged with the commit SHA.
4. Move every setting into environment variables validated at startup, so
   the same image runs locally, in staging, and in production.
5. Add `/healthz` and `/readyz` endpoints and structured JSON logs with a
   request ID, then deploy the image and confirm you can roll back to the
   previous tag in one command.

## Before moving on

- Why does building an artifact once and promoting it beat rebuilding it
  for each environment?
- What is the difference between deploying a change and releasing it to
  users?
- Why should secrets never be baked into an image or a frontend bundle?
- Which signals would tell you, within minutes, that a deploy made things
  worse?
- How would you prove that your backups can actually be restored, and how
  long it takes?
- What must change in an application before it can run on more than one
  server behind a load balancer?
- Which hosting option would you choose for a side project, and which for
  a steady high-traffic API, and why?
- How do you keep an installed app working when the API it calls changes?
