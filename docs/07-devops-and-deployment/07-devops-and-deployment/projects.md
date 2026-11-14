# DevOps and Deployment Projects

Build these to practice the DevOps lessons on a running system. Most of them
take the TaskFlow API from the Backend section (Express and MongoDB) from a
project on your laptop to a service you could run for real users. Do them in
order: each one builds on the pipeline, image, server, or domain from the
projects before it.

## Ship It Pipeline

Put TaskFlow under a real workflow: protect `main`, require pull requests
with a passing check, and add a GitHub Actions pipeline that lints, type
checks, and runs unit and integration tests against MongoDB in a service
container. Cache dependencies on the lockfile hash and keep the pipeline
under five minutes. Finish by tagging a release with a generated changelog.
Practices [Git and GitHub](git-and-github.md) and [CI/CD](ci-cd.md).

**Guide:** [one-page plan](projects/ship-it-pipeline.md)

## Production Image

Write a multi-stage Dockerfile that produces a small image running as a
non-root user, handles `SIGTERM` gracefully, and has a health check. Build
it in CI, tag it with the commit SHA, scan it for vulnerabilities, and push
it to a registry. Add a Docker Compose stack (API, MongoDB, and a database
UI) that starts in the right order using health conditions. Practices
[Docker](docker.md).

**Guide:** [one-page plan](projects/production-image.md)

## TaskFlow on Kubernetes

Run a local cluster (kind or minikube) and deploy TaskFlow with a
Deployment, Service, ConfigMap, and Secret. Add readiness and liveness
probes, resource requests and limits, and a HorizontalPodAutoscaler. Put
load on it with a load-testing tool, watch it scale, roll out a new image,
then roll back with `kubectl rollout undo` while requests keep succeeding.
Package it all as a Helm chart. Practices [Kubernetes](kubernetes.md).

**Guide:** [one-page plan](projects/taskflow-on-kubernetes.md)

## Config and Secrets Hardening

Replace every hard-coded setting with environment variables validated at
startup, so a missing value stops the process with a clear error. Move the
database password into a secret store, have the app fetch it at startup,
then rotate it with zero downtime using two valid passwords during the
switch. Commit a fake secret to a test repository and practice the full
response: revoke, rotate, and purge it from history. Practices
[Environment Variables and Secrets](environment-variables.md).

**Guide:** [one-page plan](projects/config-and-secrets-hardening.md)

## Canary Release Lab

Deploy two versions of TaskFlow behind a load balancer or ingress and shift
traffic in steps (5%, 25%, 50%, 100%). Ship a deliberately broken version
and have the rollout stop automatically when its error rate rises. Add a
feature flag that turns a new endpoint on for 10% of users with stable
bucketing, and rename a database field with expand and contract across
three deploys without downtime. Practices
[Deployment Strategies](deployment-strategies.md).

**Guide:** [one-page plan](projects/canary-release-lab.md)

## Version Everything

Give every TaskFlow artifact a version a person can trace: semantic
versions and tags for the API, a build ID baked into TaskFlow Web, and the
image digest in each deployment record. Deprecate one API field the way the
release engineering lessons describe, announce the deprecation and sunset
dates to clients, and keep the old field working until the date passes.
Make open browser tabs notice a new frontend release and reload safely, and
give a desktop or mobile build a minimum supported version that the API
enforces with a clear upgrade message. Practices
[Release Engineering](release-engineering.md).

**Guide:** [one-page plan](projects/version-everything.md)

## Production Server from Scratch

Rent a small virtual server and set it up by hand from a fresh Ubuntu LTS
image: a non-root user with sudo, key-only SSH, a firewall, automatic
security updates, and Node.js installed by a supported method. Run TaskFlow
under a hardened systemd unit behind Nginx, deploy with release folders and
a symlink switch so a rollback is one command, rotate the logs, and
schedule a nightly job that cannot overlap itself. Then fill the disk and
exhaust memory on purpose, and diagnose each problem with the tools from
the troubleshooting lesson. Practices
[Linux Server Operations](linux-server-operations.md).

**Guide:** [one-page plan](projects/production-server-from-scratch.md)

## Your Own Domain, Properly

Point a domain you own at TaskFlow: the apex and `www` with one redirecting
to the other, an `api` subdomain for the backend, and a CAA record naming
your certificate authority. Put a CDN in front of TaskFlow Web with cache
rules per path and a purge step in the deploy pipeline. Rehearse moving DNS
to another provider by lowering TTLs first and copying every record, then
send transactional email with SPF, DKIM, and DMARC, moving DMARC from
`p=none` to `p=reject` once the reports are clean. Practices
[Domains, DNS and Email](domains-dns-and-email.md).

**Guide:** [one-page plan](projects/your-own-domain-properly.md)

## TLS Everywhere

Serve TaskFlow over HTTPS behind Nginx or Caddy with a certificate from
Let's Encrypt (use its staging environment while testing), redirect HTTP to
HTTPS, and add HSTS. Confirm automatic renewal works with a dry run, add an
expiry alert, and use `openssl s_client` to diagnose a deliberately broken
certificate chain. Practices [SSL Certificates](ssl-certificates.md).

**Guide:** [one-page plan](projects/tls-everywhere.md)

## Three Servers, One Address

Run three TaskFlow instances behind a load balancer such as Nginx or
HAProxy. Move sessions to a shared store and uploads to object storage so
any instance can serve any request, then prove it by stopping instances one
at a time under load. Add health checks and connection draining so a
rolling deploy drops no requests, make a scheduled job run once per
scheduled time across the fleet, and protect a slow dependency with
timeouts, retries with jittered backoff, and a circuit breaker. Practices
[Load Balancing and Multi-Server Architecture](load-balancing-and-multi-server.md).

**Guide:** [one-page plan](projects/three-servers-one-address.md)

## Pick a Host and Price It

Write down what TaskFlow needs (traffic, data size, regions, compliance),
then price three ways to host the web app, API, and database: for example a
static host with a container platform and a managed database, an
all-in-one platform, and a single virtual server. Estimate each at 10,000,
1 million, and 50 million monthly page views with the providers' official
pricing calculators, deploy the two cheapest, and compare deploy time, cold
starts, and the real bill after a month. Set a budget alert on every
account before you start. Practices
[Hosting and Cloud Platforms](hosting-and-platforms.md).

**Guide:** [one-page plan](projects/pick-a-host-and-price-it.md)

## Infrastructure from Code

Use Terraform to create the cloud resources for TaskFlow: a network with
public and private subnets, storage for uploads with versioning, and the
permissions the app needs, with remote state and locking. Run `plan` on
every pull request and `apply` only after merge. Destroy everything and
recreate it from code to prove nothing was configured by hand. Practices
[Infrastructure as Code](infrastructure-as-code.md).

**Guide:** [one-page plan](projects/infrastructure-from-code.md)

## Secure the Pipeline

Add security checks to the TaskFlow pipeline: static analysis, dependency
and secret scanning, a scan of the Terraform code, and an image scan that
fails the build only on fixable critical findings. Replace any long-lived
cloud keys with OIDC and a least-privilege role, run a DAST scan against
staging, and put a WAF rate-limit rule in front of the login endpoint.
Triage what the scanners report with CVSS, EPSS, and the CISA Known
Exploited Vulnerabilities catalog. Practices
[DevSecOps and Cloud Security](devsecops-and-cloud-security.md).

**Guide:** [one-page plan](projects/secure-the-pipeline.md)

## Observability Lab

Instrument TaskFlow with JSON logs that carry a request ID, Prometheus
metrics for request rate, errors, and duration, and OpenTelemetry traces
that follow a request into MongoDB. Define an availability and a latency
SLO, build a dashboard, and add a burn-rate alert with a runbook link.
Break something on purpose, follow the alert to the trace and the log line
that explain it, and write a blameless postmortem. Practices
[Monitoring and Logging](monitoring-and-logging.md).

**Guide:** [one-page plan](projects/observability-lab.md)

## Load Test and Break It

Write k6 tests for TaskFlow's main user journeys with thresholds on p95
latency and error rate, and run a short version in CI that fails the build
when a threshold is crossed. Raise the load until latency bends upward,
find the bottleneck with the USE method and a CPU profile, fix it, and
measure again. Finish with a small game day: add latency between the API
and MongoDB with a fault-injection proxy such as Toxiproxy, write down what
you expect to happen, and compare it with what does. Practices
[Performance and Reliability Testing](performance-and-reliability-testing.md).

**Guide:** [one-page plan](projects/load-test-and-break-it.md)

## Backup and Restore Drill

Schedule encrypted MongoDB backups to object storage with a retention
policy and an immutable copy. Then run a drill: drop a collection, restore
to the minute before the mistake, verify the data with counts and a smoke
test, and record how long it really took. Compare the result with the RPO
and RTO you would promise users. Practices
[Backups and Disaster Recovery](backups.md).

**Guide:** [one-page plan](projects/backup-and-restore-drill.md)

## Measure Your Delivery

Compute the DORA metrics for your own TaskFlow work with a small script
over git history, deployment records, and the incidents from the earlier
projects. Choose one metric to improve and say why, write a one-page team
charter covering ownership, on-call, and how changes are approved, and
record one architecture decision as an ADR. Practices
[DevOps Fundamentals](devops-fundamentals.md).

**Guide:** [one-page plan](projects/measure-your-delivery.md)

## Publish These Notes

Deploy a MkDocs site like this one to GitHub Pages with a workflow that
builds on every push to `main`, fails on broken links with
`mkdocs build --strict`, and publishes only from the default branch. Add a
pull-request check that builds without deploying. Practices
[CI/CD](ci-cd.md) and
[deploying static sites](deployment-strategies/deploying-frontends-and-static-sites.md).

**Guide:** [one-page plan](projects/publish-these-notes.md)
