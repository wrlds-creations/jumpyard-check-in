# GitHub Actions OIDC

Use GitHub Actions OpenID Connect for AWS deployments when possible. Avoid long-lived AWS access keys by default.

## Pattern

1. Create an AWS IAM role trusted by GitHub's OIDC provider.
2. Restrict the trust policy to the intended repository, branch, environment, or workflow.
3. Grant least-privilege permissions for the deployment action. Prefer a separate read-only plan role when the cloud diff must be visible before approval.
4. Use `aws-actions/configure-aws-credentials` with `role-to-assume`.
5. Keep PR workflows to validation, synth, diff, lint, or tests.
6. Build once, record the artifact and source SHA, and deploy or roll back that same artifact without rebuilding.
7. Require `workflow_dispatch`, an exact artifact/target guard, and protected environment approval for staging or production writes.
8. Pin third-party Actions to full commit SHAs.

## Review Checklist

- No static AWS credentials in repository secrets unless explicitly approved.
- Role trust policy is scoped to the repo and deployment path.
- Production deployment requires a human-controlled gate.
- Workflow output includes enough information to review changed resources.
- The approval follows the plan and names the exact release SHA/artifact.
- Rollback selects a prior successful artifact and uses the same target guards.
- `AWS_RESOURCES.md` is updated when resources are added, changed, or removed.
