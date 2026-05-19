# AWS Resources

All AWS resources created for this project must be represented here if they are managed by this project or materially affect cost, security, data, deployment, or ownership.

## Current Status

No AWS resources created yet.

T0003 proposes the target JumpYard Cloud architecture only. These resources are not created, deployed, or configured yet.

## Resource Inventory

| Resource Name | AWS Service | Environment | Region | Managed By | Notes |
|---|---|---|---|---|---|

## Proposed Target Resources

| Proposed Resource | AWS Service | Environment | Purpose | Status |
|---|---|---|---|---|
| JumpYard Cloud API | API Gateway HTTP API | `dev` first, then `staging`/`prod` TBD | Phone app entrypoint for server-owned contracts. | Proposed only |
| JumpYard Cloud handlers | Lambda | `dev` first, then `staging`/`prod` TBD | Lookup, quote, draft booking, add-product, redeem, webhook handlers. | Proposed only |
| Roller credentials | Secrets Manager | Per environment | Store Roller client id and client secret server-side. | Proposed only |
| JumpYard operational database | Aurora PostgreSQL | Per environment | Roller snapshot, operational state, check-in attempts, idempotency, handoff state, webhook events, event log. | Proposed only |
| Raw payload/archive storage | S3 | Per environment | Optional raw Roller payloads, Data API export files, and analysis dumps. | Proposed only |
| Short-lived cache/rate state | Redis or Aurora-backed locks | Per environment | Tokens, session cache, and Roller rate-limit coordination if needed. | Proposed only |
| Roller rate-limit control | SQS/EventBridge worker plus Aurora/Redis state | Per environment | Respect Roller one-call-per-second credential limit. | Proposed only |
| JumpYard logs | CloudWatch Logs | Per environment | Operational logs and error traces. | Proposed only |
| Async processing | EventBridge or SQS | Per environment | Webhook and reconciliation processing. | Proposed only |
| Infrastructure deployment | CDK TypeScript and GitHub Actions OIDC | Per environment | Repeatable AWS deployment with WRLDS tags. | Proposed only |

## Governance Notes

- Do not create AWS resources unless a ticket explicitly allows AWS work.
- Confirm client, project, environment, owner, repository, tags, data classification, exportability, and cost center before AWS work.
- Update this file whenever AWS resources are created, changed, discovered, deleted, or replaced.
- Proposed resources are planning records only and are not evidence that AWS resources exist.

## Required WRLDS Tags

- `WRLDS:Client`
- `WRLDS:Project`
- `WRLDS:Environment`
- `WRLDS:Owner`
- `WRLDS:Repository`
- `WRLDS:ManagedBy`
- `WRLDS:DataClassification`
- `WRLDS:Exportable`
- `WRLDS:CostCenter`
- `WRLDS:CreatedBy`
