# Infrastructure from Code

Create TaskFlow's cloud resources with Terraform: a network with public and
private subnets, versioned storage for uploads, and the permissions the app
needs, with remote state and locking. Plans run on pull requests, applies
run after merge, and you prove it all by destroying and recreating it.

## Why this project helps

- Builds infrastructure-as-code skills: providers, resources, modules,
  state, and plans that reviewers can read.
- Improves **repeatability**: environments can be rebuilt from code, and
  nothing depends on someone remembering console clicks.
- Improves **change safety**: every infrastructure change is a reviewed
  pull request with a plan attached.
- Remote state, locking, and drift are standard interview topics for DevOps
  and platform roles.

## What you need

- Terraform (a version that supports S3-native state locking) and a cloud
  account with a budget alert.
- A state bucket for the S3 backend, and an OIDC-assumable role for CI.
- GitHub Actions with `hashicorp/setup-terraform@v4`.
- Builds on [Ship It Pipeline](ship-it-pipeline.md).

## How to do it

1. Learn the core workflow (`terraform init`, `plan`, `apply`) in
   [IaC fundamentals](../infrastructure-as-code/iac-fundamentals.md).
2. Configure an S3 backend with `use_lockfile = true` so state is remote and
   locked; see [Terraform in practice](../infrastructure-as-code/terraform-in-practice.md).
3. Create a VPC with public and private subnets across two zones (the
   community VPC module is fine); see
   [cloud building blocks](../infrastructure-as-code/cloud-building-blocks.md).
4. Add an uploads bucket with versioning and public access blocked.
5. Add a role for the API with a least-privilege policy for that bucket and
   nothing else.
6. In CI, run `terraform plan -out=tfplan` on every pull request and post it
   for review, authenticating with OIDC instead of stored keys.
7. Run `terraform apply tfplan` only after merge to `main`, behind a
   protected environment.
8. Destroy everything, recreate it from code, and run `terraform plan`
   again: it should report no changes.

## Done when

- State lives in the remote backend, and a second concurrent run waits for
  the lock.
- Every pull request shows a plan, and applies happen only after merge.
- The bucket is versioned and private, and the API role can reach only that
  bucket.
- No cloud keys are stored in the repository or CI secrets.
- After destroy and recreate, `terraform plan` reports no changes.

## Stretch goals

- Split code into modules with separate state per environment.
- Add a policy check (Checkov, Trivy, or OPA) to the plan job; see
  [Secure the Pipeline](secure-the-pipeline.md).
- Reconcile infrastructure continuously with GitOps; see
  [immutable infrastructure and GitOps](../infrastructure-as-code/immutable-infrastructure-and-gitops.md).

## Lessons to use

- [Infrastructure as Code](../infrastructure-as-code.md)
- [Identity and access management](../devsecops-and-cloud-security/identity-and-access-management.md)
- [Pipeline and supply chain security](../ci-cd/pipeline-and-supply-chain-security.md)

Back to [all projects](../projects.md).
