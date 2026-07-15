# AWS CI/CD Standard

Use this standard for WRLDS projects that deploy or validate AWS infrastructure.

## Pull Request Validation

- Run tests, lint, type checks, and infrastructure validation.
- Run CDK synth, CloudFormation validate, Amplify validation, or equivalent.
- Run diff when credentials and context are available.
- Do not deploy production from pull requests.

## Local Dev Sandbox Deploys

- Local AWS SSO sandbox deploys are acceptable for development when the AWS account, region, environment, and tags are verified first.
- Use named SSO profiles instead of long-lived access keys for local development deploys.
- Staging and production should use a controlled GitHub Actions/OIDC flow or another approved deployment path.
- Production must not be deployed from an unreviewed local flow.

## Staging Deploy

- Build one immutable release artifact from an eligible reviewed commit and promote that same artifact without rebuilding.
- Produce a read-only target/diff plan before the protected deployment approval.
- Deploy staging from a protected environment and reviewed merge path through a manual workflow.
- Use separate least-privilege GitHub Actions OIDC plan and deploy roles when the approval must follow a live cloud diff.
- Assert repository, commit, artifact hash, account, region, environment, stack, and external-hosting targets before any write.
- Serialize deployments to one environment and emit deployment outputs needed for review and QA.
- Update `AWS_RESOURCES.md` when resources change.

## Production Deploy

- Require manual approval, `workflow_dispatch`, protected environments, or a release-based process.
- Deploy only reviewed immutable artifacts with explicit target guards and protected approval.
- Roll back by selecting a previously successful artifact and promoting it through the same guarded path; do not rebuild old source during rollback.
- Do not use production deploys as validation.

## GitHub Actions OIDC

- Prefer OIDC role assumption over long-lived credentials.
- Scope IAM trust policy to repository, branch, environment, or workflow.
- Grant least privilege.
- Use separate roles for staging and production. Split read-only planning from write-capable deployment where practical.
- Scope environment-gated deploy trust to the exact GitHub environment subject.
- Pin third-party Actions to full commit SHAs.

## Credential Policy

- No long-lived AWS access keys by default.
- If long-lived credentials are explicitly approved, document the reason, owner, rotation plan, and expiration.

## Resource Inventory

- Update `AWS_RESOURCES.md` for created, changed, deleted, imported, or materially cost/security-relevant resources.
- Keep resource inventory changes in the same PR as infrastructure changes when possible.
- Confirm required tags before deploy: `WRLDS:Client`, `WRLDS:Project`, `WRLDS:Environment`, `WRLDS:Owner`, `WRLDS:Repository`, `WRLDS:ManagedBy`, `WRLDS:DataClassification`, `WRLDS:Exportable`, `WRLDS:CostCenter`, and `WRLDS:CreatedBy`.
