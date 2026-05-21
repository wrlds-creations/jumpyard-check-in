# AWS Resources

All AWS resources created for this project must be represented here if they are managed by this project or materially affect cost, security, data, deployment, or ownership.

## Current Status

JumpYard Check-in dev AWS foundation is deployed, Aurora migrations through `0003` have been applied, the dev lookup endpoint uses Aurora-first booking lookup with Roller REST refresh, the dev webhook endpoint records and enriches Roller webhook intake events, the dev redeem endpoint plans/audits redemption and supports controlled Playground redemption behind a dev token, the dev session endpoint creates/resumes server-owned check-in sessions and exposes read-only staff handoff list/detail routes, the real Roller Playground booking webhook is registered, and dev Aurora contains bookingitems, product catalog cache data, tickets, customer contact data, lookup-refreshed records, webhook-enriched records, session rows, and redeem attempt audit rows.

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

T0017 booking webhook enrichment deploy notes:

- Changed resource: `jumpyard-check-in-dev-stack-webhook`
- Endpoint: `POST https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com/v1/roller/webhooks/bookings`
- Behavior: verifies a dev token, deduplicates by event id or stable hash, refreshes accepted booking webhook events through Roller `GET /bookings/{identifier}`, enriches product names best-effort from `/products`, upserts booking/item/ticket metadata into Aurora, and marks webhook events `processed`, `pending_enrichment`, or `failed`.
- Roller writes: none.
- Real Roller Playground webhook registration: not done in T0017.
- Raw webhook payloads, raw Roller payloads, customer names, addresses, booking notes, secrets, and tokens are not printed or intentionally stored.

T0018 Roller Playground webhook registration notes:

- Changed AWS resource: `jumpyard-check-in-dev-stack-webhook`
- External Roller config changed: Roller Playground webhook id `238`
- Endpoint: `POST https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com/v1/roller/webhooks/bookings`
- Registered events: `Created`, `Updated`, and `Cancelled`
- Registered include: `tickets=true`
- Confirmed delivery header: `x-roller-apikey`
- Behavior: real Roller `Created` events now reach the dev Lambda, pass dev-token verification, refresh `GET /bookings/{identifier}`, upsert Aurora booking/item/ticket snapshots, and mark webhook events `processed`.
- Verified real event: booking `5032443`, unique id `69ea56d8-969f-41a3-bda5-cb09ad8a67b2`, status `processed`.
- Raw webhook payloads, raw Roller payloads, customer names, addresses, booking notes, secrets, and tokens are not printed or intentionally stored.

T0020 redeem endpoint notes:

- Changed resource: `jumpyard-check-in-dev-stack-redeem`
- Endpoint: `POST https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com/v1/check-in/redeem`
- Behavior: resolves local Aurora booking/ticket snapshots, validates idempotency and Roller redemption request constraints, returns safe redeem plans, and records planned/blocked attempts in `jumpyard.checkin_attempts` plus safe business events in `jumpyard.event_log`.
- Roller writes: disabled in deployed dev config by `ENABLE_ROLLER_REDEEM_WRITES=false`.
- Raw Roller payloads, customer names, addresses, booking notes, secrets, and tokens are not printed or intentionally stored.

T0021 controlled redeem execution notes:

- Changed resource: `jumpyard-check-in-dev-stack-redeem`
- Added secret: `/jumpyard-check-in-dev/redeem/dev-token`
- Endpoint: `POST https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com/v1/check-in/redeem`
- Behavior: `confirmRedeem=true` requires the dev redeem token, refreshes the booking from Roller REST, upserts the refreshed snapshot into Aurora, re-runs eligibility, and then calls Roller Playground `POST /redemptions`.
- Roller writes: enabled only for the protected dev path and still Playground-guarded.
- Controlled redeem smoke: dedicated booking `5032454` redeemed ticket `5032454-21397335` successfully through Roller Playground.
- Aurora verification: `jumpyard.checkin_attempts` contains the `redeemed` attempt and follow-up `already_redeemed` block; `jumpyard.roller_booking_tickets.redeem_status_last_seen='redeemed'` for `5032454-21397335`.
- Roller device note: an invalid `redemptionDevice` is rejected by Roller, so the dev Lambda omits `redemptionDevice` unless a real Roller device name is provided.
- Raw Roller payloads, customer names, addresses, booking notes, secrets, and tokens are not printed or intentionally stored.

T0023 check-in session API notes:

- Changed resource: `jumpyard-check-in-dev-stack-session`
- Added routes:
  - `POST https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com/v1/check-in/sessions`
  - `POST https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com/v1/check-in/sessions/{checkinSessionId}/ready-for-staff`
- Applied migration: `0003 checkin sessions`
- Added Aurora table: `jumpyard.checkin_sessions`
- Behavior: creates or resumes active server-owned check-in sessions from Aurora booking/ticket snapshots, blocks unpaid/wrong-date/inactive/already-redeemed contexts, marks sessions `ready_for_staff`, creates short handoff codes, and writes event-log rows.
- Roller calls: none.
- Roller writes: none.
- Verified session: booking `5032210` created/resumed session `jycs_mpfe3dum_7dc29b1b`, then marked it `ready_for_staff` with handoff code `JY6085`.
- Rejected smoke: booking `5032211` returned `payment_required`.
- Raw Roller payloads, customer names, addresses, booking notes, secrets, and tokens are not printed or intentionally stored.

T0026 staff handoff API notes:

- Changed resource: `jumpyard-check-in-dev-stack-session`
- Added routes:
  - `GET https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com/v1/staff/check-in/sessions`
  - `GET https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com/v1/staff/check-in/sessions/{checkinSessionId}`
- Behavior: reads ready-for-staff sessions, booking summaries, booking item rows, and ticket summaries from Aurora for staff/admin inspection.
- Roller calls: none.
- Roller writes: none.
- Session writes: none.
- Contact PII: guest email and phone are not returned by the staff endpoints.

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
| `m0uo5g4mde` | API Gateway HTTP API | `dev` | `eu-north-1` | `cdk` | Endpoint `https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com`; lookup, session, staff handoff, webhook, and redeem routes are implemented; booking placeholder routes return `501`. |
| `jumpyard-check-in-dev-stack-lookup` | Lambda | `dev` | `eu-north-1` | `cdk` | T0016 lookup handler; reads Aurora first, refreshes from Roller Playground only when needed, and returns normalized phone-flow lookup response. |
| `jumpyard-check-in-dev-stack-booking` | Lambda | `dev` | `eu-north-1` | `cdk` | Placeholder booking handler; no Roller calls. |
| `jumpyard-check-in-dev-stack-redeem` | Lambda | `dev` | `eu-north-1` | `cdk` | T0021 redeem handler; plans/validates server-side redemption from Aurora, requires a dev token for confirmed writes, refreshes live Roller state before write, and records attempt audit. |
| `jumpyard-check-in-dev-stack-session` | Lambda | `dev` | `eu-north-1` | `cdk` | T0026 session handler; creates/resumes Aurora-backed check-in sessions, marks sessions ready for staff, and serves read-only staff handoff list/detail without Roller calls or Roller writes. |
| `jumpyard-check-in-dev-stack-webhook` | Lambda | `dev` | `eu-north-1` | `cdk` | T0018 webhook handler; accepts Roller Playground `x-roller-apikey`, validates a dev token, stores idempotent metadata, refreshes booking detail from Roller Playground, and upserts Aurora booking/item/ticket snapshots. |
| Roller Playground webhook `238` | Roller Webhooks API | `dev`/Playground | External | Roller | Posts booking `Created`, `Updated`, and `Cancelled` events with `tickets=true` to the dev JumpYard Cloud webhook endpoint. |
| `/aws/lambda/jumpyard-check-in-dev-stack-lookup` | CloudWatch Logs | `dev` | `eu-north-1` | `cdk` | 30-day retention. |
| `/aws/lambda/jumpyard-check-in-dev-stack-booking` | CloudWatch Logs | `dev` | `eu-north-1` | `cdk` | 30-day retention. |
| `/aws/lambda/jumpyard-check-in-dev-stack-redeem` | CloudWatch Logs | `dev` | `eu-north-1` | `cdk` | 30-day retention. |
| `/aws/lambda/jumpyard-check-in-dev-stack-session` | CloudWatch Logs | `dev` | `eu-north-1` | `cdk` | 30-day retention. |
| `/aws/lambda/jumpyard-check-in-dev-stack-webhook` | CloudWatch Logs | `dev` | `eu-north-1` | `cdk` | 30-day retention. |
| `jumpyard-check-in-dev-aurora` | Aurora PostgreSQL Serverless v2 | `dev` | `eu-north-1` | `cdk` plus SQL migrations | Engine `aurora-postgresql 16.13`, database `jumpyard_cloud`, encrypted, deletion protection enabled, Data API enabled, schema `jumpyard` created by T0007. |
| `jumpyard-check-in-dev-aurora-writer` | RDS DB instance | `dev` | `eu-north-1` | `cdk` | Serverless writer instance. |
| `jumpyard-check-in-dev-aurora-subnets` | RDS DB subnet group | `dev` | `eu-north-1` | `cdk` | Uses isolated subnets. |
| `/jumpyard-check-in-dev/aurora/admin` | Secrets Manager | `dev` | `eu-north-1` | `cdk` | Generated Aurora admin credentials. |
| `/jumpyard-check-in-dev/roller/credentials` | Secrets Manager | `dev` | `eu-north-1` | `cdk` | Placeholder Roller credentials; values must be set in AWS before real Roller calls. |
| `/jumpyard-check-in-dev/webhooks/dev-token` | Secrets Manager | `dev` | `eu-north-1` | `cdk` | Development-only shared token for Roller Playground webhook delivery. Do not print or commit the token value. |
| `/jumpyard-check-in-dev/redeem/dev-token` | Secrets Manager | `dev` | `eu-north-1` | `cdk` | Development-only shared token for controlled Roller Playground redemption execution. Do not print or commit the token value. |
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
| `schema_migrations` | Tracks applied SQL migrations. Applied through `0003 checkin sessions`. |
| `roller_bookings` | Latest normalized Roller booking snapshot from seed, webhook enrichment, or live refresh. T0016 and T0017 can upsert refreshed booking rows. |
| `roller_booking_items` | Normalized booking item/product rows. T0016 and T0017 can upsert refreshed item rows. |
| `roller_booking_tickets` | Ticket ids and redeem readiness context from `/data/tickets`, lookup live refresh, or webhook enrichment. |
| `roller_booking_payments` | Payment rows or summaries needed for check-in/payment decisions from `/data/bookingpayments`. |
| `guest_profiles` | Structured guest email/phone contact state plus masked/hash values for SMS/readiness and late enrichment. |
| `checkin_sessions` | Server-owned guest check-in session state, selected ticket ids, safety status, handoff status/code, expiry, and ready-for-staff state. |
| `checkin_tokens` | SMS/link/open token state. |
| `checkin_attempts` | Check-in and redeem attempt audit. |
| `handoff_sessions` | Staff handoff, safety, and band-pairing state. |
| `booking_links` | Internal links between original bookings and separate add-on bookings. |
| `idempotency_records` | Write protection for booking, payment, redeem, and add-on operations. |
| `product_catalog_cache` | Product cache metadata and normalized summary from Roller REST `/products`; T0013 stores one row per product/variation cache key. |
| `roller_webhook_events` | Idempotent booking webhook intake and enrichment state. T0018 confirmed real Roller deliveries update event status, enrichment attempts, processed time, and safe error summaries. |
| `booking_seed_runs` | Daily seed run tracking. |
| `event_log` | Append-only business and observability events. |

## Proposed Target Resources

| Proposed Resource | AWS Service | Environment | Purpose | Status |
|---|---|---|---|---|
| JumpYard Cloud API | API Gateway HTTP API | `dev` first, then `staging`/`prod` TBD | Phone app entrypoint for server-owned contracts. | Deployed to `dev` |
| JumpYard Cloud handlers | Lambda | `dev` first, then `staging`/`prod` TBD | Lookup, session, quote, draft booking, add-product, redeem, webhook handlers. | Lookup, session, webhook intake/enrichment, and redeem implemented in `dev`; booking handlers remain placeholders |
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
