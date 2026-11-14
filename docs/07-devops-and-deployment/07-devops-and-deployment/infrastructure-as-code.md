# Infrastructure as Code

Infrastructure as code (IaC) means describing servers, networks,
databases, buckets, permissions, and DNS records in files that are
versioned, reviewed, and applied by tools, instead of creating them by
clicking through a cloud console. The files say what should exist; a
tool such as Terraform, OpenTofu, CloudFormation, or Pulumi works out
what to create, change, or delete to make reality match, and records
what it manages.

## What infrastructure as code provides

- **Repeatability:** the same code builds staging and production, or
  rebuilds an environment after a disaster.
- **Review and history:** every change is a pull request with a diff and
  a plan, and Git shows who changed what and why.
- **Safety:** tools show exactly what they will change before they do it,
  and automation applies only the reviewed change.
- **Drift detection:** comparing code with reality reveals manual changes
  made outside the process.
- **Documentation that stays true:** the code is the inventory of what
  exists and how it is connected.

It also brings new things to learn and protect: state files that contain
sensitive data, provider and module versions, refactoring without
destroying resources, and the discipline of never "just fixing it in the
console".

## How a typical IaC change works

For TaskFlow, adding an S3 bucket for user uploads:

1. An engineer adds a module call to the production Terraform code in a
   branch and opens a pull request.
2. CI runs `terraform init`, `fmt -check`, `validate`, and `plan`. The plan
   reads the remote **state** (what Terraform already manages) and shows
   the difference: for example 6 resources to add, 0 to change, 0 to
   destroy.
3. A reviewer reads the plan, not just the code, and approves.
4. On merge, CI runs `apply` with the saved plan. Terraform takes the
   **state lock**, calls the cloud APIs, and writes the new state.
5. A scheduled plan later compares code, state, and reality, and reports
   drift if someone changed the bucket by hand.

![Diagram: an engineer changes Terraform code in a branch; a pull request triggers CI to run init, validate, and plan, which reads the remote state; a reviewer reads the plan showing 2 to add, 1 to change, and 0 to destroy and approves; on merge CI applies exactly that plan, taking the state lock, calling the cloud APIs, and writing the new state, while the cloud creates or updates real resources such as a bucket, an IAM policy, and a VPC; a scheduled plan compares code, state, and reality and shows manual console changes as drift.](infrastructure-as-code-overview.svg)

## Practical example

```hcl
# envs/prod/main.tf: production uploads bucket for TaskFlow, built from a module
terraform {
  required_version = ">= 1.11"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

provider "aws" {
  region = "eu-west-1"
}

module "uploads" {
  source                            = "../../modules/uploads-bucket"
  bucket_name                       = "taskflow-prod-uploads-example"
  noncurrent_version_retention_days = 90
}

output "uploads_bucket" {
  value = module.uploads.bucket_name
}
```

```bash
terraform init
terraform plan -out=tfplan     # review: what will be created, changed, destroyed
terraform apply tfplan         # apply exactly the reviewed plan
```

The module (shown in full in
[Terraform in practice](infrastructure-as-code/terraform-in-practice.md))
creates a private, versioned, encrypted bucket and an IAM policy that the
API can use. Running `plan` again right after `apply` shows no changes:
the code and reality match.

## Infrastructure as code topic map

- [IaC fundamentals](infrastructure-as-code/iac-fundamentals.md)
- [Terraform in practice](infrastructure-as-code/terraform-in-practice.md)
- [Cloud building blocks](infrastructure-as-code/cloud-building-blocks.md)
- [Immutable infrastructure and GitOps](infrastructure-as-code/immutable-infrastructure-and-gitops.md)

**Review**

- [Infrastructure as code interview questions and answers](infrastructure-as-code/interview-questions-and-answers.md) · [cheat sheet](infrastructure-as-code/cheat-sheet.md)

## Developer perspective and common misconceptions

Start small: put one new resource under code, then import existing ones
gradually. Keep state remote, locked, encrypted, and access-controlled
from day one; review plans, not only code; and make the pipeline the only
thing with permission to change production.

- IaC is not just "scripts that call the cloud API"; declarative tools
  compare desired state with actual state and change only the difference.
- A clean `terraform plan` does not mean the infrastructure is correct; it
  means it matches the code.
- The state file is not a cache you can delete; it is how the tool knows
  which real resources it owns, and it often contains secrets.
- IaC does not replace configuration management or application
  deployment; it provisions the platform they run on.
- Renaming a resource in code can destroy and recreate it unless you tell
  the tool it moved.

## Further learning

- [Terraform documentation](https://developer.hashicorp.com/terraform/docs)
- [OpenTofu documentation](https://opentofu.org/docs/)
- [AWS Well-Architected: Operational excellence design principles](https://docs.aws.amazon.com/wellarchitected/latest/framework/oe-design-principles.html)
- [OpenGitOps principles](https://opengitops.dev/)
- [Infrastructure as code interview questions and answers](infrastructure-as-code/interview-questions-and-answers.md)
