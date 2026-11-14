# Immutable Infrastructure and GitOps

Immutable infrastructure means servers and containers are never modified
after they start: to change anything, you build a new image and replace
the old instances. GitOps applies the same idea to delivery: the desired
state of a system lives in Git, and an agent running next to the system
continuously pulls that state and makes reality match it. Together they
give every environment a single, reviewable source of truth and make
changes, rollbacks, and drift visible.

This lesson covers pets versus cattle, mutable versus immutable servers,
golden images with Packer, where configuration management (Ansible) still
fits, the four GitOps principles, push versus pull deployments, Argo CD
and Flux, and environment repositories with promotion by pull request.

## Why it matters

Servers that are changed in place accumulate history nobody can see: a
package upgraded on two of three hosts, a configuration edited during an
incident, a hotfix applied by hand. Each server becomes slightly unique,
and the differences surface as "works on server 2 only" bugs, failed
rollbacks, and rebuilds that never quite reproduce production.

Pipelines that push changes into clusters have a similar weakness: the
pipeline holds powerful credentials, and once it has run, nothing notices
if someone edits the cluster by hand. GitOps closes both gaps: changes
enter only through Git, an agent with local credentials applies them, and
any manual change is reported or reverted within minutes.

## Real-world usage

- **Martin Fowler (Kief Morris) on immutable servers.** The bliki entry
  [ImmutableServer](https://martinfowler.com/bliki/ImmutableServer.html)
  describes servers that, once deployed, are never modified, only
  replaced with a new instance built from updated definitions, as the
  answer to configuration drift on long-lived servers.
- **OpenGitOps.** The [OpenGitOps principles](https://opengitops.dev/),
  maintained by a CNCF working group, define GitOps by four properties:
  desired state is **declarative**, **versioned and immutable**, **pulled
  automatically** by software agents, and **continuously reconciled**
  against the actual state.
- **Argo CD.** The [Argo CD documentation](https://argo-cd.readthedocs.io/en/stable/)
  describes a declarative GitOps continuous delivery tool for Kubernetes
  that compares live cluster state with manifests in Git, reports
  applications as `Synced` or `OutOfSync`, and can sync automatically,
  prune removed resources, and self-heal manual changes. Argo is a CNCF
  graduated project.
- **Flux.** The [Flux documentation](https://fluxcd.io/flux/) describes a
  set of Kubernetes controllers (source, kustomize, helm, notification,
  image automation) that reconcile clusters from Git, OCI artifacts, or
  Helm repositories. Flux is also a CNCF graduated project.
- **HashiCorp Packer.** The [Packer documentation](https://developer.hashicorp.com/packer/docs)
  describes building identical machine images for several platforms from
  a single source template, the basis of the golden image approach.

**Popular tools and providers:** Packer, Docker and BuildKit, EC2 Image
Builder, Ansible (as an image provisioner), Argo CD, Flux, Kargo for
promotion, Kustomize, Helm, Renovate for automated update pull requests,
and Crossplane for managing cloud resources through Kubernetes.

## How it works

### Pets and cattle

A common metaphor: **pets** are servers with names, cared for
individually and nursed back to health when sick (`db-master-01`, the
build server under someone's desk). **Cattle** are interchangeable
instances, numbered rather than named, replaced rather than repaired when
something is wrong. Cloud and container platforms are designed for
cattle: auto scaling groups and Kubernetes ReplicaSets replace unhealthy
instances automatically. Pets still exist (some databases, licensed
software, appliances), but the goal is to keep as few as possible and to
manage them carefully.

### Mutable and immutable servers

![Diagram: left, mutable: three servers start identical on v1, engineers change them in place over SSH by upgrading packages, editing configuration, and applying hotfixes over months, and they diverge into snowflakes where server 1 is v2 patched, server 2 missed a hotfix, and server 3 has an unrecorded edit; right, immutable: an image for v2 is built once with Packer or Docker and tested, three new instances are launched from the same image, traffic shifts to them, and the old v1 instances are terminated, so every instance matches what was tested and rollback means launching the previous image.](immutable-vs-mutable.svg)

| | Mutable (change in place) | Immutable (replace) |
|---|---|---|
| How a change happens | SSH, configuration management run, or a script modifies running servers | A new image is built, new instances replace old ones |
| Drift | Accumulates over time | Impossible on running instances, by design |
| What was tested | The change, not the resulting server | The exact image that runs |
| Rollback | Undo the change (often impossible to do cleanly) | Launch the previous image |
| Speed of a small change | Fast | A build and a rollout |
| State on the instance | Often kept there | Must live elsewhere (databases, object storage, volumes) |
| Security patching | Patch running hosts | Rebuild images regularly and roll them out |

Containers made immutability the default: an image digest never
changes, and Kubernetes replaces pods instead of updating them. Running
containers with a read-only root filesystem enforces it.

### Golden images with Packer

A **golden image** is a machine image (an AMI, a GCP image, an Azure
image) with the operating system, security hardening, agents (logging,
monitoring), and runtime already installed. Packer builds it from a
template: it starts a temporary instance from a base image, runs
provisioners (shell scripts, file uploads, Ansible), and saves the result
as a new image.

Two strategies:

- **Bake everything:** the image includes the application release.
  Instances start fast and are fully immutable; every release needs an
  image build.
- **Bake the platform, add the app at boot:** the image has the OS,
  runtime, and agents; the instance downloads the application release
  at startup. Faster releases, slower boots, and some mutability.

Rebuild images on a schedule (for example weekly) to pick up security
patches, test them in staging, and roll them out like any release.

### Configuration management: where Ansible still fits

Tools such as Ansible, Chef, and Puppet configure the inside of servers.
With immutable infrastructure their role changes rather than disappears:

- **Building images:** Packer can run an Ansible playbook as a
  provisioner, so the same tested roles configure every image.
- **Long-lived machines:** databases on VMs, on-premises servers,
  bastion hosts, and hardware that cannot be replaced on demand.
- **Network devices and appliances** managed over SSH or APIs.
- **One-time operations** across a fleet, such as rotating a file or
  collecting diagnostics.

Running configuration management continuously against production cattle
is a sign the instances are not really immutable.

### The GitOps principles

1. **Declarative:** the desired state of the system is described, not
   scripted (Kubernetes manifests, Helm values, Kustomize overlays,
   Terraform code).
2. **Versioned and immutable:** desired state is stored in Git (or
   another versioned, immutable store) with full history. Every change is
   a commit; rollback is a revert.
3. **Pulled automatically:** agents fetch the desired state from the
   source. No external system needs credentials to push into the
   environment.
4. **Continuously reconciled:** agents compare desired with actual state,
   all the time, and act on differences, including changes made by hand.

### Push and pull deployments

![Diagram: left, push: a merge triggers a CI pipeline that runs kubectl apply or helm upgrade against the cluster, so CI holds credentials that can change the cluster and manual changes made later go unnoticed; right, pull with GitOps: CI in the application repository builds an image and opens a pull request to the environment repository, where merging is the deployment; an agent inside the cluster, Argo CD or Flux, pulls the environment repository about every minute, compares it with live state, and applies the difference to the workloads, so credentials stay inside the cluster and manual changes are reverted.](push-vs-pull-gitops.svg)

| | Push (CI deploys) | Pull (GitOps agent) |
|---|---|---|
| Who changes the environment | The CI pipeline | An agent inside the environment |
| Credentials | CI holds credentials for every target | Credentials stay inside each cluster; CI only needs Git access |
| Drift after a deploy | Not noticed until the next deploy | Detected and optionally reverted continuously |
| Audit trail | CI logs plus Git | Git history is the deployment history |
| Multi-cluster | CI must reach every cluster's API | Each cluster pulls on its own, even behind firewalls |
| Rollback | Rerun an old pipeline | `git revert` of the change |
| Feedback in the pipeline | Immediate (CI waits for the rollout) | Asynchronous; needs notifications or status checks |
| Typical tools | GitHub Actions, GitLab CI, Jenkins with kubectl or helm | Argo CD, Flux |

Push is simpler to start with and fine for small setups. Pull scales
better across clusters and teams and gives stronger guarantees that what
runs equals what is in Git.

### Argo CD and Flux

| | Argo CD | Flux |
|---|---|---|
| Unit of deployment | `Application` (a path in a repo to a cluster and namespace); `ApplicationSet` generates many | `GitRepository` or `OCIRepository` source plus `Kustomization` or `HelmRelease` |
| Interface | Web UI, CLI, API; strong visual diff and sync status | CLI-first, configured entirely through Kubernetes resources |
| Sync | Manual or automated; `prune` and `selfHeal` options; sync waves and hooks for ordering | Interval-based reconciliation; `prune`, health checks, dependencies between Kustomizations |
| Multi-cluster | One Argo CD can manage many clusters | Usually Flux runs in each cluster |
| Image updates | Argo CD Image Updater (separate project) | Image reflector and automation controllers |

Both reconcile Kubernetes clusters from Git, support Helm and Kustomize,
and work with encrypted or external secrets (see
[secrets management](../environment-variables/secrets-management.md)).
Choose by team preference: Argo CD for its UI and application-centric
model, Flux for a lightweight, composable set of controllers.

### Environment repositories and promotion by pull request

A common layout keeps application code and deployment configuration in
separate repositories:

```text
taskflow-deploy/                         # the environment ("GitOps") repository
  apps/
    taskflow-api/
      base/                              # Deployment, Service, HPA shared by all environments
        deployment.yaml
        service.yaml
        kustomization.yaml
      overlays/
        staging/
          kustomization.yaml             # image digest, replicas, config for staging
        prod/
          kustomization.yaml             # image digest, replicas, config for production
  clusters/
    staging/                             # what the staging cluster's agent watches
    prod/
```

The release flow:

1. CI in the application repository builds and pushes an image, then
   commits the new **digest** to `overlays/staging` (automatically).
2. The staging agent syncs; tests and checks run against staging.
3. **Promotion** is a pull request that copies the same digest into
   `overlays/prod`. Review, required checks, and approval happen on the
   pull request; merging deploys.
4. **Rollback** is reverting that commit.

Tools such as Kargo and Renovate can open and track promotion pull
requests automatically. The same model works for infrastructure:
controllers such as Crossplane or Terraform-running controllers reconcile
cloud resources from Git, although many teams keep Terraform in a CI
plan-and-apply workflow instead (see
[Terraform in practice](terraform-in-practice.md)).

## When to use and when not to use

| Situation | Approach |
|---|---|
| Stateless services on VMs | Immutable images and replacement through auto scaling groups |
| Containers on Kubernetes | Immutable images by digest, GitOps with Argo CD or Flux |
| A single small cluster, small team | Push from CI is acceptable; adopt GitOps when drift or audit becomes a problem |
| Many clusters or regions, or clusters behind firewalls | GitOps (pull) |
| Databases and other stateful pets | Careful configuration management, managed services where possible, volumes kept separate from replaceable instances |
| Network devices, on-premises hardware | Configuration management (Ansible) |
| Very frequent tiny config tweaks during incidents | Still go through Git; keep a documented emergency path and reconcile afterwards |

## Practical examples

### A golden image for TaskFlow API hosts with Packer

```hcl
# images/taskflow-api.pkr.hcl: a hardened base image for TaskFlow API hosts
packer {
  required_plugins {
    amazon = {
      source  = "github.com/hashicorp/amazon"
      version = "~> 1.8"
    }
  }
}

variable "region" {
  type    = string
  default = "eu-west-1"
}

variable "image_version" {
  type = string # for example "2026.11.13" or the commit SHA
}

source "amazon-ebs" "api" {
  region        = var.region
  instance_type = "t3.small"
  ssh_username  = "ubuntu"
  ami_name      = "taskflow-api-${var.image_version}"

  source_ami_filter {
    filters = {
      name                = "ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*"
      root-device-type    = "ebs"
      virtualization-type = "hvm"
    }
    owners      = ["099720109477"] # Canonical
    most_recent = true
  }

  tags = {
    Name         = "taskflow-api"
    ImageVersion = var.image_version
    BuiltBy      = "packer"
  }
}

build {
  sources = ["source.amazon-ebs.api"]

  provisioner "shell" {
    inline = [
      "sudo apt-get update",
      "sudo DEBIAN_FRONTEND=noninteractive apt-get -y upgrade",
      "curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -",
      "sudo apt-get install -y nodejs",
      "sudo useradd --system --create-home --shell /usr/sbin/nologin taskflow",
    ]
  }

  provisioner "file" {
    source      = "files/taskflow-api.service"
    destination = "/tmp/taskflow-api.service"
  }

  provisioner "shell" {
    inline = [
      "sudo mv /tmp/taskflow-api.service /etc/systemd/system/taskflow-api.service",
      "sudo systemctl enable taskflow-api",
    ]
  }
}
```

```bash
packer init images/
packer validate -var image_version=2026.11.13 images/
packer build -var image_version=2026.11.13 images/
```

The template validates with Packer 1.16.2 and the Amazon plugin 1.8.4.
Instances are then launched from `taskflow-api-<version>` by a launch
template managed in Terraform; changing the image means updating that
version and rolling the auto scaling group, never SSH-ing into hosts.

### Kustomize overlays that pin an image by digest

```yaml
# apps/taskflow-api/overlays/staging/kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
namespace: taskflow
resources:
  - ../../base
images:
  - name: ghcr.io/example/taskflow-api
    digest: sha256:4f2c0000000000000000000000000000000000000000000000000000000000aa
replicas:
  - name: taskflow-api
    count: 2
```

```yaml
# apps/taskflow-api/overlays/prod/kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
namespace: taskflow
resources:
  - ../../base
images:
  - name: ghcr.io/example/taskflow-api
    digest: sha256:3b9c0000000000000000000000000000000000000000000000000000000000bb   # promoted by PR
replicas:
  - name: taskflow-api
    count: 6
```

The base `deployment.yaml` refers to `ghcr.io/example/taskflow-api`
without a tag; each overlay decides which exact digest runs. (The digests
here are placeholders.)

### An Argo CD Application with automated sync and self-heal

```yaml
# clusters/prod/taskflow-api.yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: taskflow-api-prod
  namespace: argocd
spec:
  project: taskflow
  source:
    repoURL: https://github.com/example/taskflow-deploy.git
    targetRevision: main
    path: apps/taskflow-api/overlays/prod
  destination:
    server: https://kubernetes.default.svc
    namespace: taskflow
  syncPolicy:
    automated:
      prune: true      # delete resources removed from Git
      selfHeal: true   # revert changes made directly in the cluster
    syncOptions:
      - CreateNamespace=true
```

With `selfHeal`, a `kubectl edit` in production is undone at the next
reconciliation, which is exactly the behavior that keeps Git the source
of truth.

### The same with Flux

```yaml
# clusters/prod/taskflow-api.yaml
apiVersion: source.toolkit.fluxcd.io/v1
kind: GitRepository
metadata:
  name: taskflow-deploy
  namespace: flux-system
spec:
  interval: 1m
  url: https://github.com/example/taskflow-deploy
  ref:
    branch: main
---
apiVersion: kustomize.toolkit.fluxcd.io/v1
kind: Kustomization
metadata:
  name: taskflow-api-prod
  namespace: flux-system
spec:
  interval: 10m              # also re-applies periodically, correcting drift
  path: ./apps/taskflow-api/overlays/prod
  prune: true
  sourceRef:
    kind: GitRepository
    name: taskflow-deploy
  targetNamespace: taskflow
  wait: true                 # report Ready only when workloads are healthy
  timeout: 5m
```

### Updating staging automatically and opening a production promotion PR

```yaml
# .github/workflows/release.yml (in the application repository; build job omitted)
name: Release

on:
  push:
    branches: [main]

jobs:
  promote:
    needs: build             # outputs.digest from the image build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
        with:
          repository: example/taskflow-deploy
          token: ${{ secrets.DEPLOY_REPO_TOKEN }}   # fine-grained token for this one repository
          path: deploy

      - name: Deploy to staging (commit directly)
        working-directory: deploy
        env:
          DIGEST: ${{ needs.build.outputs.digest }}
        run: |
          yq -i '(.images[] | select(.name == "ghcr.io/example/taskflow-api")).digest = strenv(DIGEST)' \
            apps/taskflow-api/overlays/staging/kustomization.yaml
          git config user.name "release-bot"
          git config user.email "release-bot@users.noreply.github.com"
          git commit -am "staging: taskflow-api $DIGEST"
          git push origin main

      - name: Open the production promotion pull request
        working-directory: deploy
        env:
          DIGEST: ${{ needs.build.outputs.digest }}
          GH_TOKEN: ${{ secrets.DEPLOY_REPO_TOKEN }}
        run: |
          git switch -c "promote/taskflow-api-${DIGEST#sha256:}"
          yq -i '(.images[] | select(.name == "ghcr.io/example/taskflow-api")).digest = strenv(DIGEST)' \
            apps/taskflow-api/overlays/prod/kustomization.yaml
          git commit -am "prod: promote taskflow-api $DIGEST"
          git push origin HEAD
          gh pr create --title "Promote taskflow-api to production" \
            --body "Same digest that is running in staging: $DIGEST"
```

Staging follows `main` automatically; production changes only when a
reviewer merges the promotion pull request, after staging has shown the
digest is healthy. Branch protection on the environment repository
(required reviews, required status checks) is what makes the merge the
approval.

## Best practices

- Build images once, identify them by digest, and never patch running
  instances.
- Keep state off instances: databases, object storage, and volumes that
  outlive the instance.
- Rebuild base images on a schedule for security patches and roll them
  out like releases.
- Use configuration management to build images and to manage the few
  real pets, not to mutate cattle.
- Keep desired state in Git, reviewed through pull requests with branch
  protection.
- Let in-cluster agents pull and reconcile; give CI no cluster
  credentials.
- Enable pruning and self-healing once teams trust the process; alert on
  `OutOfSync` that persists.
- Promote by digest through environment overlays; roll back with
  `git revert`.
- Keep secrets out of plain Git: SOPS, Sealed Secrets, or external secret
  stores.

## In production

- **A hotfix made with `kubectl edit` disappeared minutes later.**
  *Detect:* the change reverts; Argo CD or Flux logs show a sync. *Cause:*
  self-heal restored the state in Git. *Fix:* make the fix in Git (an
  emergency pull request), or temporarily pause sync for that application
  through a documented procedure.
- **Production is `OutOfSync` for hours and nobody noticed.**
  *Detect:* the GitOps UI or metrics show drift; deployments seem not to
  happen. *Cause:* a sync error (invalid manifest, missing CRD, failing
  hook) or a paused application. *Fix:* alert on sync status and health,
  and add manifest validation to the environment repository's CI.
- **Rollback did not restore the old behavior.**
  *Detect:* the reverted commit synced but errors continue. *Cause:* the
  change also touched something outside Git (a database migration, a
  manual cloud change). *Fix:* bring every change into Git or the IaC
  pipeline, and keep schema changes backward compatible.
- **Servers in the same group behave differently.**
  *Detect:* errors only on some hosts; package versions differ. *Cause:*
  in-place patching and manual changes. *Fix:* rebuild from a golden image
  and replace all instances; block SSH changes.
- **The image pipeline shipped a vulnerable base image for months.**
  *Detect:* scanners report old CVEs in running images. *Cause:* images
  were built once and never rebuilt. *Fix:* scheduled rebuilds, image
  scanning gates, and a maximum image age.
- **A promotion deployed a digest that never ran in staging.**
  *Detect:* production digest differs from staging history. *Cause:* the
  production overlay was edited by hand with a newer build. *Fix:*
  automate promotion from staging's recorded digest and require checks
  that verify it.

## Important terminology

- **Immutable infrastructure:** instances are replaced, never modified
  after deployment.
- **Pets and cattle:** individually maintained servers versus
  interchangeable, replaceable instances.
- **Golden image:** a pre-built machine image with OS, hardening, and
  runtime installed.
- **Bake / fry:** putting software into the image at build time versus
  installing it at boot.
- **Configuration management:** tools that configure the contents of
  servers (Ansible, Chef, Puppet).
- **GitOps:** operating systems by declarative desired state in Git,
  pulled and continuously reconciled by agents.
- **Reconciliation:** comparing desired and actual state and acting on the
  difference.
- **Push deployment / pull deployment:** an external system applies
  changes versus an agent in the environment fetches them.
- **Environment repository:** a repository holding the desired state of
  each environment.
- **Promotion:** moving a tested artifact to the next environment, here
  by a pull request that changes its digest.
- **Self-heal:** automatically reverting manual changes to match Git.
- **Prune:** deleting live resources that were removed from Git.

## Common mistakes and misconceptions

- Calling infrastructure immutable while patching instances over SSH.
- Keeping important data on instances that are meant to be replaced.
- Building images once and never rebuilding them for patches.
- Giving the GitOps agent and CI both write access "to be safe",
  bringing back push-style risks.
- Committing plain-text secrets to the environment repository.
- Using mutable tags such as `latest` in GitOps manifests, so Git no
  longer says what runs.
- Thinking GitOps removes the need for progressive delivery; it changes
  who applies changes, not how carefully traffic shifts.
- Treating every emergency as a reason to bypass Git permanently.

## Revision questions

1. What problems do mutable servers cause, and how does immutable
   replacement solve them?
2. Compare baking the whole application into an image with installing it
   at boot.
3. When does Ansible still make sense in an immutable world?
4. State the four OpenGitOps principles.
5. List three differences between push and pull deployments.
6. What do Argo CD's `prune` and `selfHeal` options do, and when might you
   turn `selfHeal` off temporarily?
7. Describe promotion from staging to production using an environment
   repository and image digests. How is rollback done?
8. A team has 4 clusters in 4 regions behind private networks. Why is
   pull-based GitOps a better fit than CI pushing to each cluster?

## Further learning

- [Martin Fowler: ImmutableServer](https://martinfowler.com/bliki/ImmutableServer.html)
- [OpenGitOps principles](https://opengitops.dev/)
- [Argo CD documentation](https://argo-cd.readthedocs.io/en/stable/)
- [Flux documentation](https://fluxcd.io/flux/)
- [Packer documentation](https://developer.hashicorp.com/packer/docs)
- [Kustomize: images field](https://kubectl.docs.kubernetes.io/references/kustomize/kustomization/images/)
- Next: [infrastructure as code interview questions and answers](interview-questions-and-answers.md). Back to the
  [infrastructure as code overview](../infrastructure-as-code.md).
