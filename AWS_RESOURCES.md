# AWS Resources

All AWS resources created for this project must be represented here if they are managed by this project or materially affect cost, security, data, deployment, or ownership.

## Current Status

JumpYard Check-in dev AWS foundation is deployed.

T0003 proposed the target JumpYard Cloud architecture only. T0004 added the CDK TypeScript foundation in `infra/`. T0005 defined the booking index ingestion contract only. T0006 deployed the foundation to AWS account `376129878018`, region `eu-north-1`, stack `jumpyard-check-in-dev-stack`.

T0006 deploy notes:

- First deploy attempt failed because Aurora PostgreSQL `16.3` is not available in `eu-north-1`.
- The failed deploy rolled back. The retained empty S3 bucket was deleted, and the rollback stack record was removed before retry.
- Successful deploy uses Aurora PostgreSQL `16.13`.
- Post-deploy `cdk diff` shows no differences.
- Placeholder API smoke returned HTTP `501` as expected.

Confirmed T0006 dev target:

| Field | Value |
|---|---|
| AWS account ID | `376129878018` |
| AWS profile/login method | `wrlds-dev` |
| AWS region | `eu-north-1` |
| Environment | `dev` |
| Resource prefix | `jumpyard-check-in-dev` |
| Config file | `infra/config/dev.json` |
| API endpoint | `https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com` |

## Resource Inventory

| Resource Name | AWS Service | Environment | Region | Managed By | Notes |
|---|---|---|---|---|---|
| `jumpyard-check-in-dev-stack` | CloudFormation | `dev` | `eu-north-1` | `cdk` | `CREATE_COMPLETE`. |
| `m0uo5g4mde` | API Gateway HTTP API | `dev` | `eu-north-1` | `cdk` | Endpoint `https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com`; placeholder routes return `501`. |
| `jumpyard-check-in-dev-stack-lookup` | Lambda | `dev` | `eu-north-1` | `cdk` | Placeholder lookup handler; no Roller calls. |
| `jumpyard-check-in-dev-stack-booking` | Lambda | `dev` | `eu-north-1` | `cdk` | Placeholder booking handler; no Roller calls. |
| `jumpyard-check-in-dev-stack-redeem` | Lambda | `dev` | `eu-north-1` | `cdk` | Placeholder redeem handler; no Roller calls. |
| `jumpyard-check-in-dev-stack-webhook` | Lambda | `dev` | `eu-north-1` | `cdk` | Placeholder webhook handler; no Roller calls. |
| `/aws/lambda/jumpyard-check-in-dev-stack-lookup` | CloudWatch Logs | `dev` | `eu-north-1` | `cdk` | 30-day retention. |
| `/aws/lambda/jumpyard-check-in-dev-stack-booking` | CloudWatch Logs | `dev` | `eu-north-1` | `cdk` | 30-day retention. |
| `/aws/lambda/jumpyard-check-in-dev-stack-redeem` | CloudWatch Logs | `dev` | `eu-north-1` | `cdk` | 30-day retention. |
| `/aws/lambda/jumpyard-check-in-dev-stack-webhook` | CloudWatch Logs | `dev` | `eu-north-1` | `cdk` | 30-day retention. |
| `jumpyard-check-in-dev-aurora` | Aurora PostgreSQL Serverless v2 | `dev` | `eu-north-1` | `cdk` | Engine `aurora-postgresql 16.13`, database `jumpyard_cloud`, encrypted, deletion protection enabled, Data API enabled. |
| `jumpyard-check-in-dev-aurora-writer` | RDS DB instance | `dev` | `eu-north-1` | `cdk` | Serverless writer instance. |
| `jumpyard-check-in-dev-aurora-subnets` | RDS DB subnet group | `dev` | `eu-north-1` | `cdk` | Uses isolated subnets. |
| `/jumpyard-check-in-dev/aurora/admin` | Secrets Manager | `dev` | `eu-north-1` | `cdk` | Generated Aurora admin credentials. |
| `/jumpyard-check-in-dev/roller/credentials` | Secrets Manager | `dev` | `eu-north-1` | `cdk` | Placeholder Roller credentials; values must be set in AWS before real Roller calls. |
| `/jumpyard-check-in-dev/roller/env` | SSM Parameter Store | `dev` | `eu-north-1` | `cdk` | Value `playground`. |
| `/jumpyard-check-in-dev/roller/base-url` | SSM Parameter Store | `dev` | `eu-north-1` | `cdk` | Value `https://api.play.roller.app`. |
| `jumpyard-check-in-dev-raw-payloads-376129878018-eu-north-1` | S3 | `dev` | `eu-north-1` | `cdk` | Encrypted, public access blocked, versioned, 30-day lifecycle, retained on stack deletion. |
| `jumpyard-check-in-dev-roller-ops` | SQS | `dev` | `eu-north-1` | `cdk` | Roller operations queue with DLQ redrive. |
| `jumpyard-check-in-dev-roller-ops-dlq` | SQS | `dev` | `eu-north-1` | `cdk` | Dead-letter queue. |
| `jumpyard-check-in-dev-events` | EventBridge | `dev` | `eu-north-1` | `cdk` | Internal JumpYard Cloud event bus. |
| `vpc-0d3ec43331e52813e` | VPC | `dev` | `eu-north-1` | `cdk` | CIDR `10.72.0.0/16`. |
| `subnet-005b2679b14023edc` | EC2 subnet | `dev` | `eu-north-1a` | `cdk` | Isolated subnet A. |
| `subnet-07bc326946413a10a` | EC2 subnet | `dev` | `eu-north-1b` | `cdk` | Isolated subnet B. |
| `sg-0bd327f3b974b3d73` | EC2 security group | `dev` | `eu-north-1` | `cdk` | Aurora boundary security group. |
| `jumpyard-check-in-dev-sta-*ServiceRole*` | IAM | `dev` | `eu-north-1` | `cdk` | Lambda execution roles and scoped inline policies for Secrets Manager, SSM, RDS Data API, S3, SQS, EventBridge, and CloudWatch metrics. |

## Proposed Target Resources

| Proposed Resource | AWS Service | Environment | Purpose | Status |
|---|---|---|---|---|
| JumpYard Cloud API | API Gateway HTTP API | `dev` first, then `staging`/`prod` TBD | Phone app entrypoint for server-owned contracts. | Deployed to `dev` |
| JumpYard Cloud handlers | Lambda | `dev` first, then `staging`/`prod` TBD | Lookup, quote, draft booking, add-product, redeem, webhook handlers. | Deployed to `dev` as placeholders |
| Roller credentials | Secrets Manager | Per environment | Store Roller client id and client secret server-side. | Deployed to `dev` as placeholder secret |
| Roller non-secret config | SSM Parameter Store | Per environment | Store Roller environment and Playground base URL. | Deployed to `dev` |
| JumpYard operational database | Aurora PostgreSQL Serverless v2 | Per environment | Roller snapshot, operational state, check-in attempts, idempotency, handoff state, webhook events, event log. | Deployed to `dev` |
| Raw payload/archive storage | S3 | Per environment | Optional raw Roller payloads, Data API export files, and analysis dumps. | Deployed to `dev` with 30-day lifecycle |
| Roller rate-limit control | SQS plus DLQ | Per environment | Serialize Roller operations and provide dead-letter handling. | Deployed to `dev` |
| Async processing | EventBridge | Per environment | Webhook and reconciliation event bus. | Deployed to `dev` |
| JumpYard logs | CloudWatch Logs | Per environment | Operational logs and error traces with Lambda log retention. | Deployed to `dev` |
| Infrastructure deployment | CDK TypeScript | Per environment | Repeatable infrastructure with WRLDS tags. | `dev` deployed |

## Governance Notes

- Do not create AWS resources unless a ticket explicitly allows AWS deploy work.
- Confirm client, project, environment, owner, repository, tags, data classification, exportability, and cost center before AWS deploy work.
- Update this file whenever AWS resources are created, changed, discovered, deleted, or replaced.
- `infra/config/dev.example.json` is for local synth validation only and is not an approved deployment config.
- `infra/config/dev.json` is the approved non-secret T0006 dev deployment config.
- Do not run future `cdk deploy` commands unless AWS identity matches account `376129878018` and region `eu-north-1`.
- Roller credentials in AWS must be populated through Secrets Manager only; do not commit secrets.

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

## Confirmed T0006 WRLDS Tags

| Tag | Value |
|---|---|
| `WRLDS:Client` | `JumpYard` |
| `WRLDS:Project` | `jumpyard-check-in` |
| `WRLDS:Environment` | `dev` |
| `WRLDS:Owner` | `love` |
| `WRLDS:Repository` | `wrlds-creations/jumpyard-check-in` |
| `WRLDS:ManagedBy` | `cdk` |
| `WRLDS:DataClassification` | `internal` |
| `WRLDS:Exportable` | `true` |
| `WRLDS:CostCenter` | `unassigned` |
| `WRLDS:CreatedBy` | `love` |
