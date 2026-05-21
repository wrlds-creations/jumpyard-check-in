# AWS Resources

All AWS resources created for this project must be represented here if they are managed by this project or materially affect cost, security, data, deployment, or ownership.

## Current Status

JumpYard Check-in dev AWS foundation is deployed, Aurora migrations through `0002` have been applied, the dev lookup endpoint uses Aurora-first booking lookup with Roller REST refresh, the dev webhook endpoint records Roller webhook intake events, and dev Aurora contains bookingitems, product catalog cache data, tickets, customer contact data, lookup-refreshed records, and webhook intake metadata.

T0003 proposed the target JumpYard Cloud architecture only. T0004 added the CDK TypeScript foundation in `infra/`. T0005 defined the booking index ingestion contract only. T0006 deployed the foundation to AWS account `376129878018`, region `eu-north-1`, stack `jumpyard-check-in-dev-stack`. T0007 added and applied the first Aurora schema migration.

T0006 deploy notes:

- First deploy attempt failed because Aurora PostgreSQL `16.3` is not available in `eu-north-1`.
- The failed deploy rolled back. The retained empty S3 bucket was deleted, and the rollback stack record was removed before retry.
- Successful deploy uses Aurora PostgreSQL `16.13`.
- Post-deploy `cdk diff` shows no differences.
- Placeholder API smoke returned HTTP `501` as expected.

T0007 migration notes:

- Migration runner: `infra/scripts/run-migrations.ts`
- Migration command: `npm --prefix infra run migrate:dev`
- Status command: `npm --prefix infra run migrate:dev:status`
- Applied migration: `0001 initial schema`
- Aurora schema: `jumpyard`
- Verified tables: 15
- Verified indexes: 62

T0009 lookup deploy notes:

- Changed resource: `jumpyard-check-in-dev-stack-lookup`
- Endpoint: `POST https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com/v1/check-in/lookup`
- Behavior: reads Roller credentials from Secrets Manager, reads Roller env/base URL from SSM Parameter Store, calls Roller `GET /bookings/{identifier}`, enriches product names from `/products`, and returns a normalized JumpYard response.
- Roller writes: none.
- Post-deploy diff: no differences.

T0012 dev data import notes:

- AWS resources created or changed: none.
- Existing Aurora Data API was used to write normalized Roller Data API `/data/bookingitems` snapshots.
- Import command: `npm --prefix infra run import:bookingitems:dev:apply`
- Modified-date window: `2026-05-20 -> 2026-05-21`
- Imported rows matched after apply:
  - `jumpyard.roller_bookings`: 6 seed bookings
  - `jumpyard.roller_booking_items`: 9 booking items
  - `jumpyard.booking_seed_runs`: latest run `succeeded`
- Raw Roller payloads, customer names, emails, phone numbers, booking notes, secrets, and tokens were not printed or intentionally stored.

T0013 dev product cache notes:

- AWS resources created or changed: none.
- Existing Aurora Data API was used to write normalized Roller REST `/products` cache rows and enrich existing booking item rows.
- Import command: `npm --prefix infra run import:products:dev:apply`
- Imported rows matched after apply:
  - `jumpyard.product_catalog_cache`: 491 product/variation rows
  - `jumpyard.roller_booking_items`: 9 existing booking item rows enriched with product names
- Raw Roller payloads, customer names, emails, phone numbers, booking notes, secrets, and tokens were not printed or intentionally stored.

T0014 related Data API import notes:

- AWS resources created or changed: none.
- Existing Aurora Data API was used to apply migration `0002 related data sources`.
- Migration runner fix: migration checksums now normalize CRLF to LF before hashing so Windows line endings do not produce false checksum mismatches.
- Existing Aurora Data API was used to write normalized Roller Data API tickets, payments, and customers.
- Import command: `npm --prefix infra run import:related-data:dev:apply`
- Modified-date window: `2026-05-20 -> 2026-05-21`
- Imported rows matched after apply:
  - `jumpyard.roller_booking_tickets`: 6 ticket rows
  - `jumpyard.roller_booking_payments`: 0 payment rows
  - `jumpyard.guest_profiles`: 6 customer contact rows
- Email and phone are stored as explicit structured fields with hash/masked companion fields. Customer names, addresses, raw Roller payloads, booking notes, secrets, and tokens were not printed or intentionally stored.

T0015 webhook intake deploy notes:

- Changed resource: `jumpyard-check-in-dev-stack-webhook`
- Added secret: `/jumpyard-check-in-dev/webhooks/dev-token`
- Endpoint: `POST https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com/v1/roller/webhooks/bookings`
- Behavior: verifies a dev token, parses Roller webhook JSON, deduplicates by event id or stable hash, stores normalized metadata in `jumpyard.roller_webhook_events`, and writes safe event-log rows for newly received events.
- Response behavior: HTTP `200` for accepted, duplicate, unauthorized, invalid JSON, and oversized requests; HTTP `500` for config/database/internal failures that should trigger Roller retry.
- Raw webhook payloads, customer names, addresses, booking notes, secrets, and tokens are not printed or intentionally stored.

T0016 Aurora-first lookup deploy notes:

- Changed resource: `jumpyard-check-in-dev-stack-lookup`
- Endpoint: `POST https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com/v1/check-in/lookup`
- Behavior: reads fresh local records from `jumpyard.roller_bookings`, `jumpyard.roller_booking_items`, and `jumpyard.roller_booking_tickets` before calling Roller; refreshes from Roller `GET /bookings/{identifier}` when local data is missing, stale, tombstoned, or unclear; and upserts refreshed booking/item/ticket metadata back into Aurora.
- Roller writes: none.
- Raw Roller payloads, customer names, addresses, booking notes, secrets, and tokens are not printed or intentionally stored.

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
| `m0uo5g4mde` | API Gateway HTTP API | `dev` | `eu-north-1` | `cdk` | Endpoint `https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com`; lookup and webhook routes are implemented, booking/redeem placeholder routes return `501`. |
| `jumpyard-check-in-dev-stack-lookup` | Lambda | `dev` | `eu-north-1` | `cdk` | T0016 lookup handler; reads Aurora first, refreshes from Roller Playground only when needed, and returns normalized phone-flow lookup response. |
| `jumpyard-check-in-dev-stack-booking` | Lambda | `dev` | `eu-north-1` | `cdk` | Placeholder booking handler; no Roller calls. |
| `jumpyard-check-in-dev-stack-redeem` | Lambda | `dev` | `eu-north-1` | `cdk` | Placeholder redeem handler; no Roller calls. |
| `jumpyard-check-in-dev-stack-webhook` | Lambda | `dev` | `eu-north-1` | `cdk` | T0015 webhook intake handler; validates a dev token, stores idempotent metadata, and makes no Roller calls. |
| `/aws/lambda/jumpyard-check-in-dev-stack-lookup` | CloudWatch Logs | `dev` | `eu-north-1` | `cdk` | 30-day retention. |
| `/aws/lambda/jumpyard-check-in-dev-stack-booking` | CloudWatch Logs | `dev` | `eu-north-1` | `cdk` | 30-day retention. |
| `/aws/lambda/jumpyard-check-in-dev-stack-redeem` | CloudWatch Logs | `dev` | `eu-north-1` | `cdk` | 30-day retention. |
| `/aws/lambda/jumpyard-check-in-dev-stack-webhook` | CloudWatch Logs | `dev` | `eu-north-1` | `cdk` | 30-day retention. |
| `jumpyard-check-in-dev-aurora` | Aurora PostgreSQL Serverless v2 | `dev` | `eu-north-1` | `cdk` plus SQL migrations | Engine `aurora-postgresql 16.13`, database `jumpyard_cloud`, encrypted, deletion protection enabled, Data API enabled, schema `jumpyard` created by T0007. |
| `jumpyard-check-in-dev-aurora-writer` | RDS DB instance | `dev` | `eu-north-1` | `cdk` | Serverless writer instance. |
| `jumpyard-check-in-dev-aurora-subnets` | RDS DB subnet group | `dev` | `eu-north-1` | `cdk` | Uses isolated subnets. |
| `/jumpyard-check-in-dev/aurora/admin` | Secrets Manager | `dev` | `eu-north-1` | `cdk` | Generated Aurora admin credentials. |
| `/jumpyard-check-in-dev/roller/credentials` | Secrets Manager | `dev` | `eu-north-1` | `cdk` | Placeholder Roller credentials; values must be set in AWS before real Roller calls. |
| `/jumpyard-check-in-dev/webhooks/dev-token` | Secrets Manager | `dev` | `eu-north-1` | `cdk` | Development-only shared token for Roller Playground webhook delivery. Do not print or commit the token value. |
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

## Aurora Schema Inventory

T0007 created schema `jumpyard` in database `jumpyard_cloud`.

| Table | Purpose |
|---|---|
| `schema_migrations` | Tracks applied SQL migrations. Applied through `0002 related data sources`. |
| `roller_bookings` | Latest normalized Roller booking snapshot from seed, webhook enrichment, or live refresh. T0016 can upsert lookup-refreshed booking rows. |
| `roller_booking_items` | Normalized booking item/product rows. T0016 can upsert lookup-refreshed item rows. |
| `roller_booking_tickets` | Ticket ids and redeem readiness context from `/data/tickets` or lookup live refresh. |
| `roller_booking_payments` | Payment rows or summaries needed for check-in/payment decisions from `/data/bookingpayments`. |
| `guest_profiles` | Structured guest email/phone contact state plus masked/hash values for SMS/readiness and late enrichment. |
| `checkin_tokens` | SMS/link/open token state. |
| `checkin_attempts` | Check-in and redeem attempt audit. |
| `handoff_sessions` | Staff handoff, safety, and band-pairing state. |
| `booking_links` | Internal links between original bookings and separate add-on bookings. |
| `idempotency_records` | Write protection for booking, payment, redeem, and add-on operations. |
| `product_catalog_cache` | Product cache metadata and normalized summary from Roller REST `/products`; T0013 stores one row per product/variation cache key. |
| `roller_webhook_events` | Idempotent booking webhook intake and future enrichment state. T0015 stores normalized event metadata and payload hashes. |
| `booking_seed_runs` | Daily seed run tracking. |
| `event_log` | Append-only business and observability events. |

## Proposed Target Resources

| Proposed Resource | AWS Service | Environment | Purpose | Status |
|---|---|---|---|---|
| JumpYard Cloud API | API Gateway HTTP API | `dev` first, then `staging`/`prod` TBD | Phone app entrypoint for server-owned contracts. | Deployed to `dev` |
| JumpYard Cloud handlers | Lambda | `dev` first, then `staging`/`prod` TBD | Lookup, quote, draft booking, add-product, redeem, webhook handlers. | Lookup and webhook intake implemented in `dev`; booking and redeem handlers remain placeholders |
| Roller credentials | Secrets Manager | Per environment | Store Roller client id and client secret server-side. | Deployed and populated in `dev` |
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
