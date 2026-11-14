# Infrastructure as Code Cheat Sheet

Quick revision of the infrastructure as code lessons, for use before an
interview or an infrastructure change.

## Key commands

| Command | What it does |
|---|---|
| `terraform init` | Sets up the backend, providers, modules, and `.terraform.lock.hcl` |
| `terraform init -upgrade` | Upgrades providers within the constraints; review the lock file diff |
| `terraform init -migrate-state` | Moves existing state into a newly configured backend |
| `terraform fmt -check -recursive` | Fails CI if files are not in the standard format |
| `terraform validate` | Checks syntax, types, and references |
| `terraform plan -out=tfplan` | Saves the computed changes; changes nothing |
| `terraform apply tfplan` | Applies exactly the reviewed plan; a stale plan is refused |
| `terraform plan -detailed-exitcode` | Drift check: exit `0` no changes, `1` error, `2` changes |
| `terraform plan -generate-config-out=generated.tf` | Drafts resource blocks for `import` blocks |
| `terraform plan -replace=<addr>` | Forces one resource to be recreated |
| `terraform state list` / `state show <addr>` | Inspects what is in state |
| `terraform force-unlock <LOCK_ID>` | Removes a stale lock once no run is active |
| `terraform output -raw <name>` | Reads an output for scripts |
| `packer init` / `validate` / `build -var image_version=...` | Installs plugins, checks, and builds a golden image |

## Key configuration

```hcl
# envs/prod/versions.tf: pinned versions, S3 state with native locking
terraform {
  required_version = ">= 1.11"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0" # any 6.x, never 7.0
    }
  }
  backend "s3" {
    bucket       = "example-taskflow-terraform-state"
    key          = "prod/uploads/terraform.tfstate"
    region       = "eu-west-1"
    encrypt      = true
    use_lockfile = true # lock object: <key>.tflock
  }
}
```

```hcl
# refactor.tf: adopt, rename, and forget without recreating anything
import {
  to = module.uploads.aws_s3_bucket.this
  id = "taskflow-prod-uploads-123456789012"
}

moved {
  from = aws_iam_role_policy_attachment.api_s3
  to   = aws_iam_role_policy_attachment.api_uploads
}

removed {
  from = aws_s3_bucket.legacy_exports
  lifecycle {
    destroy = false
  }
}
```

```yaml
# clusters/prod/taskflow-api.yaml (excerpt): Argo CD automated sync
spec:
  syncPolicy:
    automated:
      prune: true      # delete resources removed from Git
      selfHeal: true   # revert changes made directly in the cluster
```

## Decision guide

| If you need | Choose | Why |
|---|---|---|
| Many providers (clouds, DNS, CDN, GitHub) | Terraform or OpenTofu | Largest provider ecosystem |
| One cloud and its native tooling | CloudFormation or CDK (AWS), Bicep (Azure) | The cloud keeps the state |
| Loops, classes, and unit tests | Pulumi or CDK | General-purpose languages |
| To configure long-lived machines | Ansible | Agentless configuration management over SSH |
| Environments with different credentials | A root module and account per environment | Own state, credentials, and blast radius |
| Stateless servers on VMs | Packer golden images, replace instances | No drift; roll back by launching the previous image |
| Many clusters, some behind firewalls | Pull-based GitOps (Argo CD or Flux) | Credentials stay in each cluster |
| A web UI and many clusters from one place | Argo CD | Application-centric, visual diffs |
| Lightweight controllers in each cluster | Flux | Configured entirely through Kubernetes resources |

## Numbers and defaults to remember

| Item | Value |
|---|---|
| Plan symbols | `+` create, `~` update in place, `-` destroy, `-/+` replace |
| Parallelism | 10 operations at a time by default (`-parallelism`) |
| S3-native locking | Terraform 1.10, generally available in 1.11; DynamoDB locking is deprecated |
| Lock permissions | `s3:GetObject`, `s3:PutObject`, `s3:DeleteObject` on `<key>.tflock` |
| Refactoring blocks | `moved` 1.1+, `import` 1.5+, `removed` 1.7+ |
| Licenses | Terraform: Business Source License (August 2023); OpenTofu: MPL 2.0, CNCF sandbox |
| AWS subnet addresses | 5 reserved per subnet: a `/24` gives 251, a `/20` 4,091; a `/16` VPC holds 65,536 |
| Availability Zones | At least 2 for production; 3 is common for databases that elect a leader by majority |
| NAT gateways | One per AZ; charged per hour and per GB; an S3 gateway endpoint adds no charge |
| GitOps principles | Declarative, versioned and immutable, pulled automatically, continuously reconciled |

## Top mistakes

- **Keeping state on a laptop or in Git.** Use a remote backend with
  locking, versioning, encryption, and tight access control.
- **Not committing `.terraform.lock.hcl`.** Commit it; upgrade providers
  deliberately with `terraform init -upgrade`.
- **Renaming a resource without a `moved` block.** Add one; the plan
  should say "has moved to", not destroy and create.
- **Approving without reading the plan.** Check every `-/+` and destroy;
  add `prevent_destroy` to stateful resources.
- **Separating production with workspaces.** Give each environment its
  own root module and state, ideally in its own account.
- **Trusting `sensitive = true` with secrets.** It only hides output;
  state still holds the value, so restrict access to state.
- **Fixing in the console and leaving it there.** Run nightly drift
  detection; revert or adopt the change within a day.
- **Mutable tags such as `latest` in GitOps manifests.** Pin images by
  digest; promote by pull request.

## Where to go deeper

- [IaC fundamentals](iac-fundamentals.md)
- [Terraform in practice](terraform-in-practice.md)
- [Cloud building blocks](cloud-building-blocks.md)
- [Immutable infrastructure and GitOps](immutable-infrastructure-and-gitops.md)
- [Interview questions and answers](interview-questions-and-answers.md)

Back to the [infrastructure as code overview](../infrastructure-as-code.md).
