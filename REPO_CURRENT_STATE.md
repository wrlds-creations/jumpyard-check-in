# Repo Current State

Use this file as the living snapshot of what actually exists in the repository. Update it after completed tickets, audits, meaningful dependency changes, or workflow changes.

## Snapshot

- Date: 2026-05-20
- Current branch: `codex/t0012-bookingitems-aurora-import`
- Current status: T0012 bookingitems Aurora import completed locally and applied to dev.
- Current ticket: `T0012` completed locally
- Completed tickets: `T0000`, `T0001`, `T0002`, `T0003`, `T0004`, `T0005`, `T0006`, `T0007`, `T0008`, `T0009`, `T0010`, `T0011`, `T0012`
- Recommended next ticket: `T0013 Related Data API sources`

## Current Structure

```text
.
|-- .env.example
|-- AGENTS.md
|-- PROJECT_CONTEXT.md
|-- DECISIONS.md
|-- CODEX_TASK.md
|-- JUMPYARD_CLOUD_CONTRACT.md
|-- BOOKING_INDEX_INGESTION_CONTRACT.md
|-- REPO_CURRENT_STATE.md
|-- FOLLOWUPS.md
|-- AWS_RESOURCES.md
|-- TEST_PLAN.md
|-- scripts/
|   |-- check-roller-env.js
|   |-- roller-client.js
|   |-- roller-data-api-smoke.js
|   |-- roller-seed-playground.js
|   `-- roller-smoke.js
|-- infra/
|   |-- bin/jumpyard-cloud.ts
|   |-- config/dev.json
|   |-- config/dev.example.json
|   |-- lambda/lookup/index.js
|   |-- lib/config.ts
|   |-- scripts/import-bookingitems.ts
|   |-- lib/jumpyard-cloud-stack.ts
|   |-- migrations/0001_initial_schema.sql
|   |-- scripts/run-migrations.ts
|   |-- cdk.json
|   |-- package.json
|   |-- package-lock.json
|   `-- tsconfig.json
|-- jumpyard-checkin-phone/
|   `-- src/flow/cloudClient.ts
|-- jumpyard-checkin-kiosk/
`-- jumpyard-checkin-admin/
```

## Known Validation Commands

| Command | Purpose | Notes |
|---|---|---|
| `npm run validate` | Validate root WRLDS workflow files and skills. | Existing repository command. |
| `npm run infra:check` | Type-check and synthesize the deploy-blocked CDK foundation with example config. | Added in T0004; does not deploy or require AWS credentials. |
| `npm run infra:synth` | Synthesize the JumpYard Cloud CDK stack with `infra/config/dev.example.json`. | Added in T0004; example config is not approved for deploy. |
| `npm --prefix infra run synth:dev` | Synthesize the confirmed T0006 dev stack. | Uses `infra/config/dev.json`. |
| `npm --prefix infra run diff:dev` | Review AWS dev changes before deploy. | Must show only approved T0004 foundation resources. |
| `npm --prefix infra run deploy:dev` | Deploy the approved dev foundation. | Run only after account `376129878018` and region `eu-north-1` are verified. |
| `npm --prefix infra run migrate:dev:status` | Show applied/pending Aurora migrations for dev. | Uses Aurora Data API and the `/jumpyard-check-in-dev/aurora/admin` secret; does not print secrets. |
| `npm --prefix infra run migrate:dev` | Apply pending Aurora migrations to dev. | Run only after AWS account `376129878018` and region `eu-north-1` are verified. |
| `npm --prefix infra run import:bookingitems:dev` | Dry-run Roller Data API `/data/bookingitems` normalization for dev Aurora import. | Reads local `.env`, calls Roller Playground, and performs no Aurora writes. |
| `npm --prefix infra run import:bookingitems:dev:apply` | Apply Roller Data API `/data/bookingitems` import into dev Aurora. | Requires `ROLLER_IMPORT_ALLOW_WRITE=I_UNDERSTAND_THIS_WRITES_DEV_AURORA_BOOKINGITEMS`; verify AWS account and region first. |
| `npm --prefix infra audit` | Audit infra dependencies. | Currently reports one moderate bundled `brace-expansion` issue inside `aws-cdk-lib`; automatic fix unavailable. |
| `npm run roller:env:check` | Validate Roller env guard against current environment variables. | Requires `ROLLER_ENV=playground` and a Playground-looking `ROLLER_BASE_URL`; client credentials are optional. |
| `npm run roller:smoke` | Verify local Roller Playground credentials with an OAuth token request and one read-only smoke request. | Loads local `.env`; does not print secrets or full Roller responses. |
| `npm run roller:data:smoke` | Verify local Roller Data API `/data/bookingitems` access and safe response shape. | Loads local `.env`; uses modified-date window defaults and does not print secrets, tokens, customer names, emails, or phone numbers. |
| `npm run roller:seed:playground` | Plan deterministic Roller Playground seed bookings. | Dry-run by default; no booking writes. |
| `npm run roller:seed:playground:apply` | Create deterministic Roller Playground seed bookings. | Writes only when `ROLLER_SEED_ALLOW_WRITE=I_UNDERSTAND_THIS_WRITES_PLAYGROUND_BOOKINGS` is set and the Playground guard passes. |
| Read-only `GET /bookings/{bookingReference}` | Verify known Playground booking lookup behavior. | Run through the existing Roller client helper; do not print secrets or raw PII. |
| `cd jumpyard-checkin-phone && npm run lint` | Lint phone app. | Existing app command; not required unless app code changes. |
| `cd jumpyard-checkin-phone && npm run build` | Build phone app. | Existing app command; not required unless app code changes. |
| `cd jumpyard-checkin-kiosk && npm run lint` | Lint kiosk app. | Existing app command; not required unless app code changes. |
| `cd jumpyard-checkin-kiosk && npm run build` | Build kiosk app. | Existing app command; not required unless app code changes. |
| `cd jumpyard-checkin-admin && npm run lint` | Lint admin app. | Existing app command; not required unless app code changes. |
| `cd jumpyard-checkin-admin && npm run build` | Build admin app. | Existing app command; not required unless app code changes. |

## Completed Tickets

| Ticket | Summary | Completed On | Notes |
|---|---|---|---|
| `T0000` | Set up source-of-truth docs for WRLDS Codex workflow. | 2026-05-18 | Committed as `5655fb1`. |
| `T0001` | Added Roller Playground env guard and client skeleton. | 2026-05-18 | Committed as `2bfde41`. |
| `T0002` | Added Roller Playground credential smoke test and branch workflow docs. | 2026-05-19 | Merged to `main` through PR #6 as merge commit `155c655`. |
| `T0003` | Defined JumpYard Cloud contract, data ownership, Roller endpoint map, Aurora data model, and proposed AWS target architecture. | 2026-05-19 | Merged to `main` through PR #7 as merge commit `b99cbfb`. |
| `T0004` | Added deploy-blocked JumpYard Cloud AWS CDK foundation. | 2026-05-19 | Merged to `main` through PR #8 as merge commit `bb9c660`. |
| `T0005` | Defined booking index ingestion contract and post-T0005 roadmap. | 2026-05-19 | Merged to `main` through PR #9 as merge commit `7ea23e9`. |
| `T0006` | Deployed the JumpYard Cloud AWS dev foundation. | 2026-05-19 | Merged to `main` through PR #10 as merge commit `799e6d9`. Stack `jumpyard-check-in-dev-stack`, API `https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com`, Aurora PostgreSQL `16.13`. |
| `T0007` | Added Aurora SQL migrations, migration runner, and initial ingestion/operational schema. | 2026-05-20 | Merged to `main` through PR #11 as merge commit `69e5a6b`; applied `0001 initial schema` to dev Aurora. |
| `T0008` | Added protected Roller Playground seed tooling and created deterministic test bookings. | 2026-05-20 | Created Playground booking references `5032210` through `5032215`. |
| `T0009` | Implemented and deployed server-side booking lookup endpoint. | 2026-05-20 | Dev `POST /v1/check-in/lookup` now calls Roller Playground `GET /bookings/{identifier}` and returns normalized JumpYard lookup response. |
| `T0010` | Wired phone booking lookup step to JumpYard Cloud. | 2026-05-20 | Phone UI calls dev `POST /v1/check-in/lookup`, shows ready and unpaid found bookings in summary, blocks check-in for unpaid bookings, and shows stop states for wrong-date, non-redeemable, not-found, and service failures. |
| `T0011` | Added Data API smoke test and locked backfill/incremental sync strategy. | 2026-05-20 | `GET /data/bookingitems` works in Playground and returned 9 rows for the T0008 seed modified-date window. |
| `T0012` | Imported Roller Data API bookingitems into dev Aurora. | 2026-05-20 | Upserted 6 seed bookings and 9 booking item rows into dev Aurora, with run tracking in `booking_seed_runs`. |

## Current Ticket

| Ticket | Goal | Status | Notes |
|---|---|---|---|
| `T0012` | Import `/data/bookingitems` into dev Aurora. | Completed locally and applied to dev | Commit/review still pending. |

## Confirmed Next Tickets

| Ticket | Goal | Notes |
|---|---|---|
| `T0013` | Related Data API sources | Add tickets, payments, and customers after endpoint docs/access are confirmed. |
| `T0014` | Booking webhook intake | Implement webhook intake, idempotency, and enrichment. |
| `T0015` | Lookup Aurora-first | Use Aurora for display lookup, with REST refresh when missing, stale, or check-in-critical. |

## Validation Status

- Automated root validation: `npm run validate` passed during T0008 on 2026-05-20.
- Infra validation: `npm run infra:check` passed during T0007 on 2026-05-20.
- Infra synth: `npm run infra:synth` passed during T0004 using `infra/config/dev.example.json`.
- Metadata guard: missing `-c config=...` fails as expected before synth.
- AWS CLI preflight: `aws --version` passed on 2026-05-19.
- AWS identity preflight: `aws sts get-caller-identity` failed on 2026-05-19 because no AWS credentials are configured.
- AWS config preflight: `aws configure list` shows no profile, access key, secret key, or region.
- T0006 dev metadata: confirmed account `376129878018`, region `eu-north-1`, profile `wrlds-dev`, resource prefix `jumpyard-check-in-dev`, and WRLDS tags in `infra/config/dev.json`.
- AWS SSO login: `aws sso login --profile wrlds-dev` passed on 2026-05-19.
- AWS identity preflight after login: account `376129878018`, assumed role `AWSReservedSSO_AdministratorAccess_8a2502e60c822ae0/Love`.
- AWS region preflight after login: `eu-north-1`.
- Dev synth: `npm --prefix infra run synth:dev` passed with `infra/config/dev.json`.
- Dev diff before deploy: `npm --prefix infra run diff:dev` showed only the approved foundation resources.
- First dev deploy attempt: failed because Aurora PostgreSQL `16.3` is not available in `eu-north-1`; rollback completed and retained empty S3 bucket was deleted.
- Final dev deploy: `npm --prefix infra run deploy:dev` passed after changing Aurora PostgreSQL to `16.13`.
- Post-deploy diff: `npm --prefix infra run diff:dev` showed no differences.
- Placeholder API smoke: `POST https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com/v1/check-in/lookup` returned HTTP `501`.
- T0007 AWS identity preflight: `aws sts get-caller-identity --profile wrlds-dev` returned account `376129878018` on 2026-05-20 after SSO login refresh.
- T0007 AWS region preflight: `aws configure get region --profile wrlds-dev` returned `eu-north-1`.
- Aurora migration status before apply: `npm --prefix infra run migrate:dev:status` showed `0001 initial schema: pending`.
- Aurora migration apply: `npm --prefix infra run migrate:dev` applied `0001 initial schema`.
- Aurora migration status after apply: `npm --prefix infra run migrate:dev:status` showed `0001 initial schema: applied`.
- Aurora migration idempotency: re-running `npm --prefix infra run migrate:dev` skipped the already-applied `0001 initial schema`.
- Aurora Data API verification: `jumpyard` schema contains 15 tables and 62 indexes.
- Infra dependency audit: `npm --prefix infra audit` reports one moderate bundled `brace-expansion` issue inside `aws-cdk-lib`; no dependency fix was applied in T0007.
- Roller env validation: `npm run roller:env:check` passed with local `.env` during T0002.
- Roller smoke validation: `npm run roller:smoke` passed with local `.env`; `/products` returned HTTP 200 and 96 products on 2026-05-19.
- Booking lookup validation: read-only `GET /bookings/5001370` returned HTTP 200 with booking reference `5001370`, unique id `dbba266d-0951-4706-9adf-6c9d05edffbf`, status `PendingPayment`, amount owing `260`, and ticket `5001370-21265504`.
- T0008 seed dry-run: `npm run roller:seed:playground` passed on 2026-05-20, resolved 6 scenarios, and selected child/variation product IDs for `Entré 120 min`, `JumpSocks`, `SkyRider`, `Hänglås`, and coffee/tea.
- T0008 apply guard: `npm run roller:seed:playground:apply` without `ROLLER_SEED_ALLOW_WRITE` failed closed before writes.
- T0008 production URL rejection: `ROLLER_BASE_URL=https://api.roller.app` was rejected before auth/write.
- T0008 Playground seed apply: guarded apply created booking references `5032210`, `5032211`, `5032212`, `5032213`, `5032214`, and `5032215` in Playground on 2026-05-20.
- T0008 seed readback: read-only `GET /bookings/{bookingReference}` returned HTTP 200 for all six new references. `5032210` is `Paid` with amount owing `0`; the others are `PendingPayment`.
- T0009 local handler smoke: paid, pending, wrong-date, and not-found lookup cases returned expected normalized responses using AWS Secrets Manager/SSM plus Roller Playground.
- T0009 AWS identity preflight: `aws sts get-caller-identity --profile wrlds-dev` returned account `376129878018`.
- T0009 AWS region preflight: `aws configure get region --profile wrlds-dev` returned `eu-north-1`.
- T0009 pre-deploy diff: `npm --prefix infra run diff:dev` showed only the approved lookup Lambda code change.
- T0009 deploy: `npm --prefix infra run deploy:dev` updated `jumpyard-check-in-dev-stack-lookup` successfully.
- T0009 deployed smoke: `POST /v1/check-in/lookup` returned `ready` for `5032210`, `payment_required` for `5032211`, `wrong_date` for `5032212` with expected date `2026-05-21`, and `not_found` for `999999999`.
- T0009 post-deploy diff: `npm --prefix infra run diff:dev` showed no differences.
- T0009 validation: `npm run validate` and `npm --prefix infra run check` passed.
- T0010 validation: `npm run validate` passed.
- T0010 phone lint: `cd jumpyard-checkin-phone && npm run lint` passed with four pre-existing `<img>` warnings.
- T0010 phone build: `cd jumpyard-checkin-phone && npm run build` passed.
- T0010 CORS preflight: `OPTIONS /v1/check-in/lookup` returned HTTP `204` with `access-control-allow-origin: *`.
- T0010 local dev server: `http://127.0.0.1:3000` returned HTTP `200`.
- T0010 headless browser automation: not run because Playwright is not installed in `jumpyard-checkin-phone`.
- T0011 script syntax: `node --check scripts/roller-data-api-smoke.js` passed.
- T0011 Data API smoke: `npm run roller:data:smoke` passed with local `.env`; `/data/bookingitems` returned 9 records for modified-date window `2026-05-20 -> 2026-05-21`.
- T0011 Data API seed reference check: Data API response included seed booking references `5032210`, `5032211`, `5032212`, `5032213`, `5032214`, and `5032215`.
- T0011 Data API response shape: first page returned object keys `currentPage`, `totalPages`, `totalItems`, `itemsPerPage`, and `items`.
- T0011 production URL rejection: `ROLLER_BASE_URL=https://api.roller.app` was rejected before Data API calls.
- T0012 infra build: `npm --prefix infra run build` passed.
- T0012 dry-run: `npm --prefix infra run import:bookingitems:dev -- --start-date 2026-05-20 --end-date 2026-05-21` returned 9 records, 6 bookings, 9 booking items, and 0 skipped records without Aurora writes.
- T0012 write guard: `npm --prefix infra run import:bookingitems:dev:apply -- --start-date 2026-05-20 --end-date 2026-05-21` failed closed without `ROLLER_IMPORT_ALLOW_WRITE`.
- T0012 AWS identity preflight: `aws sts get-caller-identity --profile wrlds-dev` returned account `376129878018`.
- T0012 AWS region preflight: `aws configure get region --profile wrlds-dev` returned `eu-north-1`.
- T0012 dev apply: guarded apply upserted 6 bookings and 9 booking items into Aurora.
- T0012 idempotency check: re-running guarded apply against the same window still matched 6 bookings and 9 booking items.
- T0012 Aurora verification: direct Data API query returned booking references `5032210` through `5032215` in `jumpyard.roller_bookings`.
- T0012 seed run verification: latest `jumpyard.booking_seed_runs` row for the import has status `succeeded` and counts 9 source records, 6 booking upserts, and 9 booking item upserts.

## Known Issues Summary

- AWS dev foundation is deployed. Lookup handler is implemented; booking, redeem, and webhook handlers are still placeholders and return `501`.
- Roller credentials secret in AWS has been populated for dev and was used by T0009 lookup smoke tests.
- JumpYard Cloud lookup API business logic has been implemented for live Roller detail lookup. Other API business logic is still pending.
- Phone app booking lookup now calls JumpYard Cloud for the first check-in step. Payment, redeem, and booking creation UI behavior are still pending.
- Aurora schema exists in dev, and T0012 writes normalized `/data/bookingitems` snapshots into `roller_bookings` and `roller_booking_items`.
- Booking index ingestion has started with Data API bookingitems. Tickets, payments, customers, and webhooks have not been implemented.
- Roller Data API `/data/bookingitems` access, query params, paging shape, and modified-date behavior are confirmed in Playground; tickets, payments, and customers Data API endpoints are still open.
- Webhook event id, signature/verification method, retry behavior, and event names are still open.
- Already-redeemed Playground seed data is deferred until redemption is implemented and safely tested.
- Staff handoff/redeem flow integration has not been implemented.
- Roller `POST /redemptions` has not been tested yet.
- Existing-booking add-product linked-booking flow has not been tested yet.
- `aws-cdk-lib` currently carries a moderate bundled dependency audit warning; a dependency fix should be evaluated separately from T0007.

## Open Questions

- What is the exact JumpYard Cloud link model between original booking and separate add-on booking?
- Which tenders work in the new add-on booking checkout flow: gift card, membership code, and multi-visit value?
- Which products must be configured as ticket/session products to support API-driven redemption and webhook-based counters?
- Which exact Roller Data API endpoints, query params, and payloads should power tickets, payments, and customers ingestion?
- Which webhook event id, signature/verification method, retry behavior, and event names does Roller provide in Playground and production?
