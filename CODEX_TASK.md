# CODEX_TASK.md

## Ticket ID

T0007

## Goal

Create the first Aurora PostgreSQL schema and migration runner for JumpYard Cloud ingestion and operational state.

## Dependencies

- T0006 completed, pushed, and merged to `main`.
- JumpYard Cloud dev foundation exists in AWS account `376129878018`, region `eu-north-1`.
- `skills/aws-project-infrastructure/` must be followed for AWS governance.

## Current Status

Completed locally and applied to the approved dev Aurora cluster on 2026-05-20.

Applied migration result:

- Branch: `codex/t0007-aurora-schema-migrations`
- Migration command: `npm --prefix infra run migrate:dev`
- Migration status command: `npm --prefix infra run migrate:dev:status`
- Applied migration: `0001 initial schema`
- Target cluster: `arn:aws:rds:eu-north-1:376129878018:cluster:jumpyard-check-in-dev-aurora`
- Database: `jumpyard_cloud`
- Schema: `jumpyard`
- Verified tables: 15
- Verified indexes: 62

## Allowed Areas

- `CODEX_TASK.md`
- `PROJECT_CONTEXT.md`
- `DECISIONS.md`
- `REPO_CURRENT_STATE.md`
- `FOLLOWUPS.md`
- `AWS_RESOURCES.md`
- `TEST_PLAN.md`
- `infra/package.json`
- `infra/package-lock.json`
- `infra/tsconfig.json`
- `infra/migrations/`
- `infra/scripts/`

## Do Not Touch

- App source code
- UI files
- Assets
- Deliverables
- Roller write integration code
- Payment logic
- Redeem logic
- Production credentials
- `.env`
- Staging or production AWS resources

## Requirements

1. Add a migration runner for the approved T0006 dev Aurora cluster.
2. Add an initial SQL migration for the `jumpyard` schema.
3. Create the ingestion and operational tables from the T0003/T0005 contracts:
   - `roller_bookings`
   - `roller_booking_items`
   - `roller_booking_tickets`
   - `roller_booking_payments`
   - `guest_profiles`
   - `checkin_tokens`
   - `checkin_attempts`
   - `handoff_sessions`
   - `booking_links`
   - `idempotency_records`
   - `product_catalog_cache`
   - `roller_webhook_events`
   - `booking_seed_runs`
   - `event_log`
4. Add `schema_migrations` tracking.
5. Add lookup, seed, webhook, idempotency, audit, and operational indexes needed by upcoming tickets.
6. Keep stored PII minimal by using hashes/masked fields where contact data is needed.
7. Run AWS preflight before applying the migration:
   - `aws sts get-caller-identity --profile wrlds-dev`
   - `aws configure get region --profile wrlds-dev`
8. Apply the migration only to the approved dev target.
9. Update source-of-truth docs with migration commands and deployed schema state.

## Non-Goals

- Do not implement API business logic.
- Do not connect phone/kiosk/admin apps to AWS.
- Do not implement daily seed logic.
- Do not implement webhook logic.
- Do not create Playground fake bookings.
- Do not call Roller writes.
- Do not create, update, redeem, or pay Roller bookings.
- Do not create staging or production AWS resources.
- Do not add production credentials.

## Acceptance Criteria

- Migration runner exists and does not log secrets.
- Initial SQL migration is idempotent.
- Dev Aurora has the `jumpyard` schema and the expected operational tables.
- `schema_migrations` records `0001 initial schema`.
- `npm run validate` passes.
- `npm run infra:check` passes.
- No app code, UI, assets, deliverables, Roller write logic, `.env`, or production config is changed.

## Manual Verification

After migration, confirm in AWS/Aurora:

- Database `jumpyard_cloud` exists.
- Schema `jumpyard` exists.
- `schema_migrations` contains `0001`.
- The expected ingestion and operational tables exist.
- No Roller credentials or production secrets are committed.

## Automated Validation

Run:

- `npm --prefix infra run build`
- `aws sts get-caller-identity --profile wrlds-dev`
- `aws configure get region --profile wrlds-dev`
- `npm --prefix infra run migrate:dev:status`
- `npm --prefix infra run migrate:dev`
- direct Aurora Data API table/index verification
- `npm run validate`
- `npm run infra:check`
