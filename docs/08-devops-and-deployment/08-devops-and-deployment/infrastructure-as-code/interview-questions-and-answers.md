# Infrastructure as Code Interview Questions and Answers

These questions review IaC fundamentals, Terraform in practice, cloud
building blocks, and immutable infrastructure with GitOps. Try answering
each one before reading the answer.

## IaC fundamentals

### 1. What is infrastructure as code, and what problems does it solve?

Managing infrastructure through versioned, reviewed definitions applied
by tools. It replaces manual console work ("ClickOps") with reproducible
environments, reviewable diffs with previews, history of who changed what
and why, and drift detection.

### 2. What is the difference between declarative and imperative IaC?

Declarative code describes the desired end state ("this bucket exists
with versioning on"), and the tool computes the changes. Imperative code
lists steps ("create a bucket, then enable versioning"), which may fail
or duplicate resources on a second run and does not handle deletions or
drift by itself.

### 3. What does idempotent mean in IaC?

Applying the same definition once or many times has the same effect.
After the first successful apply, applying again changes nothing unless
reality drifted from the code.

### 4. Why does Terraform need a state file?

To map resource addresses in code to real objects, remember attributes
and dependencies, detect resources removed from code (so it can plan
their deletion), and avoid reading every attribute from the cloud on each
run.

### 5. Why is the state file sensitive, and how should it be stored?

It contains every attribute of managed resources, including generated
passwords and keys in plain text, even when marked `sensitive`. Store it
in a remote backend that is encrypted, versioned, locked, and readable
only by the pipeline and a few administrators. Never commit it to Git.

### 6. What is drift, and how do you detect it?

A difference between code and reality caused by changes outside the IaC
process, such as console edits. Detect it with scheduled `terraform plan
-detailed-exitcode` runs (exit code 2 means changes), platform drift
tools such as CloudFormation drift detection, or continuous
reconciliation in GitOps.

### 7. When you find drift, how do you decide what to do?

Revert it (apply the code) if the manual change was a mistake, or adopt
it (change the code in a reviewed pull request) if the change was right
but made the wrong way. Then reduce the causes, for example by limiting
console write access.

### 8. How does provisioning differ from configuration management?

Provisioning creates and manages resources (networks, VMs, databases,
buckets) with tools like Terraform or CloudFormation. Configuration
management manages what is inside servers (packages, files, services)
with tools like Ansible, Chef, or Puppet. Immutable images have reduced
the need for the second.

### 9. Compare Terraform, CloudFormation, and Pulumi.

Terraform uses HCL, a state file, and providers for almost any API.
CloudFormation uses YAML or JSON templates with state managed by AWS,
AWS only. Pulumi uses general-purpose languages with a state backend and
many providers. All preview changes before applying them.

### 10. Why does OpenTofu exist?

HashiCorp moved Terraform from the open-source MPL 2.0 license to the
Business Source License in August 2023. The community forked the last
open-source version as OpenTofu, now hosted by the Linux Foundation and a
CNCF sandbox project, kept under MPL 2.0 and largely compatible with
Terraform configuration.

### 11. What does a safe pull request workflow for infrastructure look like?

Format, validate, and policy-check on every push; plan with a read-only
role and post the plan for review; read the plan, especially replacements
and destroys; apply on merge from a saved plan with a write role that only
the main-branch pipeline can use.

## Terraform in practice

### 12. What do `required_providers` and `.terraform.lock.hcl` do?

`required_providers` declares which providers a module needs, with source
addresses and version constraints. The lock file records the exact
versions and checksums chosen by `terraform init`. Commit the lock file so
every machine and CI run uses the same provider builds.

### 13. What is the difference between a resource and a data source?

A resource is something Terraform creates, updates, and deletes. A data
source only reads existing information, such as the current account ID or
an IAM role managed by another stack.

### 14. How does Terraform decide the order of operations?

It builds a dependency graph from references between blocks; a resource
that references another is created after it, and independent resources
are created in parallel (10 at a time by default). `depends_on` adds
dependencies that references cannot express.

### 15. Why apply a saved plan?

`terraform apply tfplan` applies exactly the changes that were reviewed.
If state changed after the plan was made, Terraform rejects the stale plan
instead of applying something nobody reviewed.

### 16. How does state locking work with the S3 backend today?

With `use_lockfile = true`, Terraform creates a `.tflock` object next to
the state with a conditional write that fails if it already exists, so
only one run holds the lock. It was introduced in Terraform 1.10 and is
generally available from 1.11; DynamoDB-based locking is deprecated.

### 17. Why separate environments by directories instead of workspaces?

Separate root modules (ideally in separate cloud accounts) give each
environment its own state, credentials, and blast radius, and allow
deliberate differences. Workspaces share code and backend credentials,
making it easy to apply to the wrong environment; Terraform's own
documentation says they are not suitable where separate credentials and
access controls are needed.

### 18. What makes a good Terraform module?

A meaningful unit (a private bucket with its policy, a service with its
scaling), a small typed and validated interface with useful outputs, no
provider configuration inside, and versioning so environments upgrade
deliberately.

### 19. How do you rename a resource without destroying it?

Add a `moved` block from the old address to the new one. The plan shows
"has moved to" instead of destroy and create. Remove the block once it
has been applied everywhere.

### 20. How do you bring an existing, hand-made resource under Terraform?

Write an `import` block with the target address and the resource ID
(Terraform 1.5+). `terraform plan -generate-config-out=generated.tf` can
draft the resource configuration, which you then clean up and review.

### 21. How do you stop managing a resource without deleting it?

Use a `removed` block with `lifecycle { destroy = false }` (Terraform
1.7+). The resource leaves state but stays in the cloud.

### 22. How do you protect critical resources from accidental deletion?

`lifecycle { prevent_destroy = true }` makes any plan that would destroy
the resource fail. Combine it with reviewing plans for `-/+` replacements
and with cloud-side protections such as deletion protection on databases.

### 23. What is the risk of `-target`?

It applies only part of the configuration, leaving the rest unapplied and
the state partially updated relative to code. It is for emergencies, not
routine use.

### 24. How do you bootstrap the bucket that stores Terraform state?

Create it with a tiny separate configuration using local state (or a
documented manual step), with versioning, encryption, public access
blocked, and `prevent_destroy`. Optionally migrate that configuration's
own state into the bucket with `terraform init -migrate-state`.

### 25. Which credentials should plan and apply use in CI?

Plans on pull requests use a read-only role; applies use a separate role
with write access that only the main-branch pipeline (often behind an
environment approval) can assume, through OIDC federation rather than
stored keys.

## Cloud building blocks

### 26. What are regions and Availability Zones, and how should production use them?

A region is a geographic area; an Availability Zone is an independent
failure domain within it. Production should span at least two AZs in
every tier; multiple regions add resilience to regional failures at a
large cost in complexity.

### 27. What makes a subnet public on AWS?

Its route table sends `0.0.0.0/0` to an internet gateway. Only load
balancers and NAT gateways usually belong there; compute and databases
go in private subnets.

### 28. What does a NAT gateway do, and why one per AZ?

It lets resources in private subnets make outbound connections without
accepting inbound ones. Each NAT gateway lives in one AZ, so one per AZ
keeps each zone's outbound traffic working if another zone fails.

### 29. How can you reduce NAT gateway costs?

Route traffic to cloud services through VPC endpoints: a gateway endpoint
for S3 has no additional charge, and interface endpoints serve other
services privately. NAT gateways charge per hour and per gigabyte
processed.

### 30. Compare security groups and network ACLs.

Security groups attach to network interfaces, are stateful, allow-only,
and can reference other security groups. Network ACLs attach to subnets,
are stateless (return traffic must be allowed), support allow and deny
rules, and are evaluated in rule-number order.

### 31. How do you restrict database access to the application only?

Put the database in subnets without internet routes and give its security
group an ingress rule that references the application's security group
on the database port, with no CIDR-based rules.

### 32. How many usable addresses does a /24 subnet have on AWS?

256 addresses minus 5 that AWS reserves in every subnet: 251.

### 33. When would you choose VMs, Kubernetes, serverless containers, or functions?

VMs for full OS control or special software; Kubernetes for many services
with a team able to operate it; serverless containers for container
workloads without managing servers or clusters; functions for
event-driven or spiky work without long-lived connections.

### 34. Compare object, block, and file storage.

Object storage (S3) holds whole objects behind an HTTP API, ideal for
uploads, static assets, and backups. Block storage (EBS) is a disk for one
instance, used by databases. File storage (EFS) is a shared file system
for several instances.

### 35. What are the key IAM principles?

Least privilege, roles with temporary credentials for workloads,
federation and MFA for people, a locked-away root account, separate
accounts per environment, organization-wide guardrails, and regular
auditing and cleanup of permissions.

### 36. What is static stability?

Designing a service so it keeps working during a failure without needing
to create or change resources, for example by running enough spare
capacity in each AZ that losing one zone needs no scaling action.

## Immutable infrastructure and GitOps

### 37. What is immutable infrastructure?

Instances are never changed after deployment; a change means building a
new image and replacing the instances. It eliminates configuration drift,
ensures what runs equals what was tested, and makes rollback "launch the
previous image".

### 38. What is the difference between pets and cattle?

Pets are individually named, hand-maintained servers that are repaired
when sick. Cattle are interchangeable instances that are replaced when
unhealthy. Cloud platforms and orchestrators are designed for cattle.

### 39. What is a golden image, and how is it built?

A machine image with the OS, hardening, agents, and runtime (sometimes the
application) pre-installed. Packer builds it by launching a temporary
instance from a base image, running provisioners, and saving the result.
Rebuild it regularly to include security patches.

### 40. Where does Ansible still fit if infrastructure is immutable?

Building images (as a Packer provisioner), managing long-lived machines
that cannot be replaced, network devices and on-premises hardware, and
one-off fleet operations.

### 41. What are the four GitOps principles?

Desired state is declarative; it is versioned and immutable in a store
such as Git; agents pull it automatically; and agents continuously
reconcile actual state with it.

### 42. Compare push-based and pull-based deployment.

In push, CI applies changes to environments and must hold their
credentials; drift after the run goes unnoticed. In pull, an agent inside
each environment fetches desired state and reconciles continuously, so
credentials stay inside, Git history is the deployment history, and
manual changes are detected or reverted.

### 43. What do Argo CD's `prune` and `selfHeal` options do?

`prune` deletes live resources that were removed from Git. `selfHeal`
reverts changes made directly in the cluster so it matches Git again.

### 44. How does promotion work in a GitOps environment repository?

CI commits a new image digest to the staging overlay; after staging is
verified, a pull request copies the same digest into the production
overlay. Merging deploys; reverting the commit rolls back.

### 45. Why pin images by digest rather than tags in GitOps?

A digest identifies exact image content and never changes, so Git states
precisely what runs. A mutable tag such as `latest` can point to different
images over time, breaking reproducibility and rollback.

### 46. How are secrets handled in GitOps repositories?

Never in plain text. Use SOPS-encrypted files decrypted by the agent,
Sealed Secrets decrypted by an in-cluster controller, or references to an
external secret store synced by a controller.

### 47. What is the difference between Argo CD and Flux?

Both reconcile Kubernetes from Git. Argo CD centers on `Application`
resources with a strong web UI and can manage many clusters from one
place. Flux is a set of composable controllers configured through
Kubernetes resources, typically installed in each cluster, CLI-first.

## Scenario-based questions

### 48. A pull request's Terraform plan shows the production database will be replaced. What do you do?

**What to check first:** which attribute forces replacement and whether
the resource address changed.

**How to confirm:** the plan marks the attribute with "forces
replacement", or shows destroy at the old address and create at a new one.

**Likely causes and fixes:** a renamed resource (add a `moved` block) or a
change to an immutable attribute (find an in-place alternative or plan a
migration). Add `prevent_destroy` and deletion protection. See
[Terraform in practice](terraform-in-practice.md).

### 49. Terraform reports "Error acquiring the state lock". What now?

**What to check first:** whether another plan or apply is running for the
same state.

**How to confirm:** the error shows the lock holder, operation, and time;
CI shows an active or crashed run.

**Likely causes and fixes:** a concurrent run (wait, and serialize CI with
concurrency groups) or a stale lock from a crashed run (confirm nothing is
running, then `terraform force-unlock <LOCK_ID>`). See
[Terraform in practice](terraform-in-practice.md).

### 50. CI and an engineer get different plans for the same commit. Why?

**What to check first:** Terraform and provider versions, and variable
inputs.

**How to confirm:** `terraform version` and the lock file differ, or
different `.tfvars` files were used.

**Likely causes and fixes:** an uncommitted lock file or unpinned
versions. Commit `.terraform.lock.hcl`, pin `required_version`, and run
shared-environment plans only in CI. See
[Terraform in practice](terraform-in-practice.md).

### 51. A security group rule added during an incident vanished after an unrelated deploy. What happened?

**What to check first:** whether the rule exists in code.

**How to confirm:** the apply log shows the rule being removed as drift.

**Likely causes and fixes:** the console change was never adopted into
code, so apply reverted it. Adopt emergency changes into code within a day
and run nightly drift detection. See [IaC fundamentals](iac-fundamentals.md).

### 52. The nightly drift job reports that port 22 is open to the internet on the API security group. How do you respond?

**What to check first:** who made the change and when, from cloud audit
logs.

**How to confirm:** the plan shows the extra ingress rule, and audit logs
show a console or CLI call.

**Likely causes and fixes:** a manual change. Treat it as a security issue:
revert by applying the code, review access during the exposure window, and
restrict console write permissions in production. See
[IaC fundamentals](iac-fundamentals.md).

### 53. A state file with database passwords was found in a public bucket. What do you do?

**What to check first:** which secrets the state contains and how long it
was exposed.

**How to confirm:** bucket access logs and audit logs for reads of the
object.

**Likely causes and fixes:** state stored without access controls. Rotate
every secret in the state, lock down and encrypt the bucket, restrict
state access to pipeline roles, and keep secrets out of Terraform where
possible. See [IaC fundamentals](iac-fundamentals.md).

### 54. Someone applied staging configuration to production. How do you prevent a repeat?

**What to check first:** how environments are separated.

**How to confirm:** workspaces or a shared set of credentials were used
for both.

**Likely causes and fixes:** move to a root module and state per
environment, separate cloud accounts, and roles that can only change their
own environment. See [Terraform in practice](terraform-in-practice.md).

### 55. During an Availability Zone outage, the whole application went down. What was wrong with the design?

**What to check first:** where instances, NAT gateways, and the database
primary ran.

**How to confirm:** all tasks, or the only NAT gateway, were in the failed
zone.

**Likely causes and fixes:** single-AZ placement. Spread every tier across
at least two AZs, run one NAT gateway per AZ, use a multi-AZ database, and
keep enough capacity to lose one zone. See
[cloud building blocks](cloud-building-blocks.md).

### 56. The monthly bill shows NAT gateway charges larger than compute. Why?

**What to check first:** which traffic flows through the NAT gateways.

**How to confirm:** VPC flow logs show large transfers from private
subnets to S3 or other AWS services.

**Likely causes and fixes:** service traffic routed through NAT. Add an S3
gateway endpoint and interface endpoints for heavily used services. See
[cloud building blocks](cloud-building-blocks.md).

### 57. New tasks cannot start during a deploy: "insufficient IP addresses". What do you change?

**What to check first:** free IPs in the private subnets.

**How to confirm:** subnet available-address metrics are near zero during
rolling surges.

**Likely causes and fixes:** subnets sized without headroom for peaks and
surge. Add larger or additional subnets and plan capacity including
surges and pod IPs. See [cloud building blocks](cloud-building-blocks.md).

### 58. A fix made with `kubectl edit` in production keeps reverting. Why, and what is the right way?

**What to check first:** whether the application is managed by Argo CD or
Flux with self-healing.

**How to confirm:** the agent's events show a sync restoring the Git
state.

**Likely causes and fixes:** GitOps is working as designed. Make the fix in
Git through an emergency pull request, or pause sync through a documented
procedure and reconcile afterwards. See
[immutable infrastructure and GitOps](immutable-infrastructure-and-gitops.md).

### 59. Servers in one auto scaling group behave differently. How do you fix it for good?

**What to check first:** package and configuration differences between
hosts.

**How to confirm:** hosts were patched or edited individually over SSH.

**Likely causes and fixes:** mutable servers drifting. Build a golden
image, replace all instances from it, rebuild images on a schedule, and
block in-place changes. See
[immutable infrastructure and GitOps](immutable-infrastructure-and-gitops.md).

### 60. Production is running an image digest that never ran in staging. How did that happen, and how do you prevent it?

**What to check first:** the history of the production overlay in the
environment repository.

**How to confirm:** a commit set a digest not present in staging's
history, made by hand.

**Likely causes and fixes:** manual edits to production overlays. Automate
promotion from staging's recorded digest, protect the branch, and require
checks that verify the digest ran in staging. See
[immutable infrastructure and GitOps](immutable-infrastructure-and-gitops.md).

## Further learning

- [Infrastructure as code overview](../infrastructure-as-code.md)
- [IaC fundamentals](iac-fundamentals.md) ·
  [Terraform in practice](terraform-in-practice.md) ·
  [Cloud building blocks](cloud-building-blocks.md) ·
  [Immutable infrastructure and GitOps](immutable-infrastructure-and-gitops.md)
- [Terraform documentation](https://developer.hashicorp.com/terraform/docs)
- [OpenGitOps principles](https://opengitops.dev/)
