# AWS Resources

All AWS resources created for this project must be represented here if they are managed by this project or materially affect cost, security, data, deployment, or ownership.

## Current Status

No AWS resources created yet.

T0003 proposes the target JumpYard Cloud architecture only. These resources are not created, deployed, or configured yet.

T0004 adds a CDK TypeScript foundation in `infra/`, but it has not been deployed. The CDK app can synthesize CloudFormation locally and must not be deployed until AWS account metadata and WRLDS tags are confirmed.

## Resource Inventory

| Resource Name | AWS Service | Environment | Region | Managed By | Notes |
|---|---|---|---|---|---|

## Proposed Target Resources

| Proposed Resource | AWS Service | Environment | Purpose | Status |
|---|---|---|---|---|
| JumpYard Cloud API | API Gateway HTTP API | `dev` first, then `staging`/`prod` TBD | Phone app entrypoint for server-owned contracts. | Defined in CDK, not deployed |
| JumpYard Cloud handlers | Lambda | `dev` first, then `staging`/`prod` TBD | Lookup, quote, draft booking, add-product, redeem, webhook handlers. | Defined in CDK as placeholders, not deployed |
| Roller credentials | Secrets Manager | Per environment | Store Roller client id and client secret server-side. | Defined in CDK as placeholder secret, not deployed |
| Roller non-secret config | SSM Parameter Store | Per environment | Store Roller environment and Playground base URL. | Defined in CDK, not deployed |
| JumpYard operational database | Aurora PostgreSQL Serverless v2 | Per environment | Roller snapshot, operational state, check-in attempts, idempotency, handoff state, webhook events, event log. | Defined in CDK, not deployed |
| Raw payload/archive storage | S3 | Per environment | Optional raw Roller payloads, Data API export files, and analysis dumps. | Defined in CDK with 30-day lifecycle, not deployed |
| Roller rate-limit control | SQS plus DLQ | Per environment | Serialize Roller operations and provide dead-letter handling. | Defined in CDK, not deployed |
| Async processing | EventBridge | Per environment | Webhook and reconciliation event bus. | Defined in CDK, not deployed |
| JumpYard logs | CloudWatch Logs | Per environment | Operational logs and error traces with Lambda log retention. | Defined in CDK, not deployed |
| Infrastructure deployment | CDK TypeScript | Per environment | Repeatable infrastructure with WRLDS tags. | Local synth only |

## Governance Notes

- Do not create AWS resources unless a ticket explicitly allows AWS deploy work.
- Confirm client, project, environment, owner, repository, tags, data classification, exportability, and cost center before AWS deploy work.
- Update this file whenever AWS resources are created, changed, discovered, deleted, or replaced.
- Proposed resources are planning records only and are not evidence that AWS resources exist.
- `infra/config/dev.example.json` is for local synth validation only and is not an approved deployment config.

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
