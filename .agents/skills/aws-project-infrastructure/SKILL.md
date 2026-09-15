---
name: aws-project-infrastructure
description: Review or change WRLDS AWS infrastructure when resource identity, deployment, inventory or tagging needs governance.
---

# AWS project infrastructure

Use the project's confirmed AWS context and AWS_RESOURCES.md. Read the relevant reference for [tagging](references/tagging.md), [OIDC](references/github-actions-oidc.md), [inventory](references/resource-inventory.md) or [CDK](references/aws-cdk-patterns.md).

## Resource-change boundary

Before each resource-changing session, verify the active account with aws sts get-caller-identity and verify the intended region and environment. Recheck after credentials, profile or target changes. A first-deploy check is not sufficient for later sessions.

Reuse confirmed business metadata from project records. Ask only for missing required values in [the tagging policy](../../../references/aws-tagging-standard.md). A read-only review does not require inventing deployment metadata.

For the first generated stack or Amplify sandbox, verify package/app namespace before creating durable data or users; changing it later can create a different stack and auth outputs.

Use the project's IaC and approved deployment path. Prefer CDK for general AWS infrastructure and Amplify Gen 2 only when appropriate for the app. Use least-privilege OIDC or named SSO profiles; long-lived credentials need explicit approval. PR checks do not deploy production. Manual console changes require explicit applicable scope and subsequent codification.

Follow [the CI/CD policy](../../../references/aws-cicd-standard.md) and any stricter project release gates. Do not infer cloud-mutation authority from a general code task. Update AWS_RESOURCES.md for created, changed, deleted or materially relevant discovered resources. Report actual identity, validation and resource changes, separating plans from completed deployments.

Project billing requires WRLDS:Client=JumpYard and WRLDS:CostCenter=JumpYard. Preserve the project release/ownership boundary in AGENTS.md and PROJECT_CONTEXT.md.
