# Repo Current State

Use this file as the living snapshot of what actually exists in the repository. Update it after completed tickets, audits, meaningful dependency changes, or workflow changes.

## Snapshot

- Date: 2026-05-28
- Current branch: `codex/t0067-real-email-smoke`
- Current status: T0067 real SES email smoke is implemented, deployed to dev, and smoke-tested locally, not committed.
- Current ticket: `T0067` completed locally, not committed
- Completed tickets: `T0000`, `T0001`, `T0002`, `T0003`, `T0004`, `T0005`, `T0006`, `T0007`, `T0008`, `T0009`, `T0010`, `T0011`, `T0012`, `T0013`, `T0014`, `T0015`, `T0016`, `T0017`, `T0018`, `T0019`, `T0020`, `T0021`, `T0022`, `T0023`, `T0024`, `T0025`, `T0026`, `T0027`, `T0028`, `T0029`, `T0030`, `T0031`, `T0032`, `T0033`, `T0034`, `T0035`, `T0036`, `T0037`, `T0038`, `T0039`, `T0041`, `T0042`, `T0043`, `T0044`, `T0045`, `T0046`, `T0047`, `T0048`, `T0049`, `T0050`, `T0051`, `T0052`, `T0053`, `T0054`, `T0055`, `T0056`, `T0057`, `T0058`, `T0059`, `T0060`, `T0061`, `T0062`, `T0063`, `T0064`, `T0065`, `T0066`, `T0067`
- Recommended next step: review/commit/merge T0067, then start T0068 unified booking-time guest messaging.

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
|-- API_PROTECTION_BOUNDARY.md
|-- REPO_CURRENT_STATE.md
|-- FOLLOWUPS.md
|-- AWS_RESOURCES.md
|-- TEST_PLAN.md
|-- scripts/
|   |-- check-roller-env.js
|   |-- roller-client.js
|   |-- roller-data-api-smoke.js
|   |-- roller-payment-discovery.js
|   |-- roller-payment-package-poc.js
|   |-- roller-payment-readiness.js
|   |-- roller-seed-playground.js
|   `-- roller-smoke.js
|-- infra/
|   |-- bin/jumpyard-cloud.ts
|   |-- config/dev.json
|   |-- config/dev.example.json
|   |-- lambda/booking/index.js
|   |-- lambda/lookup/index.js
|   |-- lambda/redeem/index.js
|   |-- lambda/session/index.js
|   |-- lambda/webhook/index.js
|   |-- lambda/data-sync/index.js
|   |-- lib/config.ts
|   |-- scripts/import-bookingitems.ts
|   |-- scripts/import-data-api-backfill.ts
|   |-- scripts/import-products.ts
|   |-- scripts/import-related-data.ts
|   |-- scripts/register-roller-webhook.ts
|   |-- lib/jumpyard-cloud-stack.ts
|   |-- migrations/0001_initial_schema.sql
|   |-- migrations/0002_related_data_sources.sql
|   |-- migrations/0003_checkin_sessions.sql
|   |-- migrations/0004_prepayment_booking_drafts.sql
|   |-- migrations/0005_add_product_draft_links.sql
|   |-- migrations/0006_sms_deliveries.sql
|   |-- migrations/0007_email_deliveries.sql
|   |-- scripts/run-migrations.ts
|   |-- cdk.json
|   |-- package.json
|   |-- package-lock.json
|   `-- tsconfig.json
|-- jumpyard-checkin-phone/
|   |-- vendor/ecom-payments/
|   |-- src/app/page.tsx
|   |-- src/components/AddonsOffer.tsx
|   |-- src/components/BookingSummary.tsx
|   |-- src/components/ConfirmationScreen.tsx
|   |-- src/components/RollerPaymentDropIn.tsx
|   |-- src/components/SafetyAttest.tsx
|   |-- src/context/LanguageContext.tsx
|   |-- src/flow/cloudClient.ts
|   `-- src/flow/machine.ts
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
| `npm --prefix infra run diff:dev` | Review AWS dev changes before deploy. | Must show only approved ticket-scoped resources/code changes. If CDK cannot read the SSO profile directly, export temporary profile credentials into the shell process before running CDK. |
| `npm --prefix infra run deploy:dev` | Deploy the approved dev foundation. | Run only after account `376129878018` and region `eu-north-1` are verified. |
| `node --check infra/lambda/booking/index.js` | Confirm booking Lambda JavaScript syntax. | Added in T0031. |
| `node --check infra/lambda/lookup/index.js` | Confirm lookup Lambda JavaScript syntax. | Used by T0056 payment draft reconciliation. |
| `node --check infra/lambda/webhook/index.js` | Confirm webhook Lambda JavaScript syntax. | Used by T0056 payment draft reconciliation. |
| `npm --prefix infra run register:webhook:dev` | Dry-run Roller Playground booking webhook registration for the dev endpoint. | Reads AWS SSM/Secrets Manager config, validates Playground, and does not print secrets. |
| `npm --prefix infra run register:webhook:dev:apply` | Register the Roller Playground booking webhook for the dev endpoint. | Requires `ROLLER_WEBHOOK_REGISTER_ALLOW_WRITE=I_UNDERSTAND_THIS_REGISTERS_PLAYGROUND_WEBHOOK`; creates no duplicate when the webhook already exists. |
| `npm --prefix infra run migrate:dev:status` | Show applied/pending Aurora migrations for dev. | Uses Aurora Data API and the `/jumpyard-check-in-dev/aurora/admin` secret; does not print secrets. |
| `npm --prefix infra run migrate:dev` | Apply pending Aurora migrations to dev. | Run only after AWS account `376129878018` and region `eu-north-1` are verified. |
| `npm --prefix infra run import:bookingitems:dev` | Dry-run Roller Data API `/data/bookingitems` normalization for dev Aurora import. | Reads local `.env`, calls Roller Playground, and performs no Aurora writes. |
| `npm --prefix infra run import:bookingitems:dev:apply` | Apply Roller Data API `/data/bookingitems` import into dev Aurora. | Requires `ROLLER_IMPORT_ALLOW_WRITE=I_UNDERSTAND_THIS_WRITES_DEV_AURORA_BOOKINGITEMS`; verify AWS account and region first. |
| `npm --prefix infra run import:products:dev` | Dry-run Roller REST `/products` normalization for dev Aurora product cache import. | Reads local `.env`, calls Roller Playground, and performs no Aurora writes. |
| `npm --prefix infra run import:products:dev:apply` | Apply Roller product cache import and booking item enrichment into dev Aurora. | Requires `ROLLER_PRODUCT_IMPORT_ALLOW_WRITE=I_UNDERSTAND_THIS_WRITES_DEV_AURORA_PRODUCTS`; verify AWS account and region first. |
| `npm --prefix infra run import:related-data:dev` | Dry-run Roller Data API tickets, payments, and customers normalization for dev Aurora import. | Reads local `.env`, calls Roller Playground, and performs no Aurora writes. |
| `npm --prefix infra run import:related-data:dev:apply` | Apply Roller related Data API source import into dev Aurora. | Requires `ROLLER_RELATED_IMPORT_ALLOW_WRITE=I_UNDERSTAND_THIS_WRITES_DEV_AURORA_RELATED_DATA`; verify AWS account and region first. |
| `npm --prefix infra run import:data-api-backfill:dev` | Dry-run all current Roller Data API import sources over explicit daily modified-date windows. | Requires explicit start/end dates, e.g. `-- 2026-05-20 2026-05-21`; runs bookingitems, related data, and product refresh without Aurora writes. |
| `npm --prefix infra run import:data-api-backfill:dev:apply` | Apply all current Roller Data API import sources over explicit daily modified-date windows. | Requires `ROLLER_DATA_BACKFILL_ALLOW_WRITE=I_UNDERSTAND_THIS_WRITES_DEV_AURORA_DATA_API_BACKFILL`; child import write guards are set internally. |
| `npm --prefix infra audit` | Audit infra dependencies. | Currently reports one moderate bundled `brace-expansion` issue inside `aws-cdk-lib`; automatic fix unavailable. |
| `npm run roller:env:check` | Validate Roller env guard against current environment variables. | Requires `ROLLER_ENV=playground` and a Playground-looking `ROLLER_BASE_URL`; client credentials are optional. |
| `npm run roller:smoke` | Verify local Roller Playground credentials with an OAuth token request and one read-only smoke request. | Loads local `.env`; does not print secrets or full Roller responses. |
| `npm run roller:data:smoke` | Verify local Roller Data API `/data/bookingitems` access and safe response shape. | Loads local `.env`; uses modified-date window defaults and does not print secrets, tokens, customer names, emails, or phone numbers. |
| `npm run roller:payment:discover` | Dry-run the Roller Playground new-booking payment discovery path. | Loads local `.env`, validates Playground, reads products, selects a jump/session product, and creates no booking. |
| `npm run roller:payment:discover:apply-draft` | Create one guarded Roller Playground draft booking for payment discovery. | Requires `ROLLER_PAYMENT_DISCOVERY_ALLOW_WRITE=I_UNDERSTAND_THIS_WRITES_PLAYGROUND_DRAFT_BOOKING`; does not print secrets, access tokens, or raw payment JWTs. |
| `npm run roller:payment:poc` | Run the T0032 JumpYard Cloud payment-package POC preflight. | Calls deployed `POST /v1/bookings/quote`, creates no booking, and reports package/origin/test-card blockers without printing secrets or raw JWTs. |
| `npm run roller:payment:poc:apply-draft` | Create one guarded Playground draft through JumpYard Cloud for payment-package POC. | Requires `ROLLER_PAYMENT_POC_ALLOW_DRAFT=I_UNDERSTAND_THIS_CREATES_PLAYGROUND_DRAFT_BOOKING`; does not print secrets or raw payment JWTs. |
| `npm run roller:payment:readiness` | Run the T0050 Roller Payments readiness check. | Reads local `.env`, validates Playground credentials, checks `GET /venues/me` payment settings, checks the public test origin and Roller docs page, and creates no bookings, drafts, payments, AWS resources, or Aurora rows. |
| Deployed `POST /v1/bookings/availability` | Load Roller Playground product availability through JumpYard Cloud. | Used by the phone buy-entry flow; the frontend still never calls Roller directly. |
| Deployed `POST /v1/check-in/session-links/send-sms` | Manually create and send guest check-in SMS links. | Protected by the check-in link dev token; confirmed sends return safe provider diagnostics and still respect SNS sandbox limits. |
| Deployed `POST /v1/check-in/session-links/send-due-sms` | Plan or manually confirm booking-time SMS sends from Aurora booking time windows. | Protected by the check-in link dev token; planning mode sends no SMS, and confirmed sends still respect SNS sandbox limits. |
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
| `T0013` | Cached Roller product catalog rows and enriched booking item product names in dev Aurora. | 2026-05-20 | Cached 491 product/variation rows and enriched 9 seed booking item rows. |
| `T0014` | Imported Roller Data API tickets, booking payments, and customer contact data into dev Aurora. | 2026-05-20 | Applied migration `0002`, upserted 6 tickets and 6 guest profiles; booking payments returned 0 rows for the seed window. |
| `T0015` | Implemented safe dev Roller booking webhook intake. | 2026-05-20 | Deployed webhook Lambda with dev-token verification, metadata-only persistence, and idempotency; smoke event `t0015-smoke-booking-created-5032210` is in Aurora. |
| `T0016` | Implemented Aurora-first lookup with Roller REST refresh. | 2026-05-21 | Dev lookup now returns fresh local Aurora records first, refreshes missing/unsafe records from Roller, and upserts live booking/item/ticket data back into Aurora. |
| `T0017` | Implemented booking webhook enrichment. | 2026-05-21 | Dev webhook now refreshes Roller booking detail, upserts Aurora booking/item/ticket snapshots, and marks webhook events `processed` after enrichment. |
| `T0018` | Registered the real Roller Playground booking webhook. | 2026-05-21 | Roller webhook id `238` posts to dev JumpYard Cloud; real created-booking delivery for `5032443` reached AWS and was enriched into Aurora with status `processed`. |
| `T0019` | Polished and verified phone lookup for webhook-created Aurora bookings. | 2026-05-21 | Booking `5032444` opens in the phone summary from `jumpyard_cloud`, remains blocked as unpaid, and carries source/freshness metadata for non-visible verification. |
| `T0020` | Added safe server-owned redeem planning endpoint. | 2026-05-21 | Dev `POST /v1/check-in/redeem` resolves Aurora tickets, writes planned/blocked audit rows, and keeps Roller redemption writes disabled. |
| `T0021` | Enabled controlled Playground redeem execution. | 2026-05-21 | Dev `POST /v1/check-in/redeem` requires a dev token for confirmed writes, refreshes Roller before write, and redeemed dedicated booking `5032454`. |
| `T0022` | Locked phone/staff redeem handoff design. | 2026-05-21 | Phone may start/resume a JumpYard Cloud check-in session, but final Roller redemption must be staff/server-confirmed and never secret-powered from the frontend. |
| `T0023` | Implemented server-owned check-in session API skeleton. | 2026-05-21 | Dev session API creates/resumes Aurora-backed sessions and marks sessions ready for staff without Roller calls or phone UI changes. |
| `T0024` | Wired phone start-check-in CTA to JumpYard Cloud sessions. | 2026-05-21 | Paid booking `5032210` starts/resumes session before flow progress; unpaid booking `5032211` remains blocked with `Betalning krävs`. |
| `T0025` | Wired phone safety completion to ready-for-staff handoff. | 2026-05-21 | Paid booking `5032210` reaches final screen with handoff status `ready_for_staff` and code `JY6085`; no Roller redeem is called. |
| `T0026` | Added staff/admin handoff list/detail. | 2026-05-21 | Dev staff API lists/detail reads `ready_for_staff` sessions from Aurora; admin app shows handoff code `JY6085`, booking `5032210`, products, tickets, and status details without redeeming. |
| `T0027` | Added staff-confirmed redeem from session. | 2026-05-21 | Dev staff redeem route reuses the controlled T0021 final refresh/redeem path, requires a temporary dev code, and admin app can trigger completion from the handoff detail. |
| `T0028` | Added QR/handoff lookup polish. | 2026-05-21 | Phone QR uses the server-owned `JY_HANDOFF:<handoffCode>:<checkinSessionId>` payload via the `qrcode` library, and admin can scan/paste QR payloads or type short codes to open handoff sessions. |
| `T0029` | Added phone session resume routing. | 2026-05-21 | Paid lookup starts/resumes the server session; ready-for-staff sessions route directly from search to QR, completed/redeemed sessions show already checked in, and guest-in-progress sessions continue the normal phone flow. |
| `T0030` | Added new-booking payment discovery tooling and docs. | 2026-05-21 | Confirmed Roller Playground draft booking returns costs plus `paymentJwt`; in-app payment still needs Roller payment-library authorization, domain allowlisting, package access, and test card details. |
| `T0031` | Implemented deployed server-side booking quote/draft endpoints. | 2026-05-21 | Dev `POST /v1/bookings/quote` returns normalized Roller costs without creating a booking; dev `POST /v1/bookings/draft` creates a Playground draft behind `confirmDraft=true` and idempotency, returns safe payment config plus a raw `paymentJwt` only in the response. |
| `T0032` | Added payment-package POC harness. | 2026-05-22 | `npm run roller:payment:poc` exercises deployed JumpYard Cloud quote without creating a booking; guarded apply-draft created Playground draft `a8644795-a29d-4302-8a37-056d525e7bd4` and confirmed `paymentJwtPresent=true`. Full payment remains blocked by package, public HTTPS allowlist, and fake/test card prerequisites. |
| `T0033` | Added phone create-booking pre-payment flow. | 2026-05-22 | Phone buy-entry loads server-side Roller availability, quotes a selected time/product/quantity, creates a guarded Playground draft, stops at payment pending, and persists safe draft metadata in `jumpyard.prepayment_booking_drafts` without raw `paymentJwt`. |
| `T0034` | Added existing-booking add-product quote/draft step 1. | 2026-05-22 | Dev `POST /v1/bookings/{bookingReference}/add-products/quote` returns add-on costs without creating a booking; dev `POST /v1/bookings/{bookingReference}/add-products` creates a separate Roller Playground add-on draft, stores `flow_type='add_product'`, and links it to the original booking in `jumpyard.booking_links`. |
| `T0035` | Wired phone add-product UI to add-product quote/draft endpoints. | 2026-05-22 | Existing-booking phone add-ons now collect contact, quote mapped add-ons, create a separate linked Playground add-on draft, and stop at payment pending; socks-only/padlock-only drafts are treated as non-redeemable add-on drafts. |
| `T0036` | Added local Data API backfill/sync foundation. | 2026-05-22 | New dry-run-first orchestrator runs bookingitems, tickets, bookingpayments, customers, and product refresh across daily modified-date windows; apply mode is separately guarded. |
| `T0037` | Added scheduled dev Data API sync. | 2026-05-22 | EventBridge rule `jumpyard-check-in-dev-data-api-daily-sync` invokes Lambda `jumpyard-check-in-dev-stack-data-sync`, imports previous-day modified-date windows into Aurora, refreshes products, and records run health in `booking_seed_runs`. |
| `T0038` | Added SMS token/session link foundation. | 2026-05-22 | Dev `POST /v1/check-in/session-links` creates protected check-in links and stores only SHA-256 token hashes; public `POST /v1/check-in/session-links/resolve` marks links opened and starts/resumes JumpYard Cloud sessions without Roller calls. |
| `T0039` | Added server-owned SMS sending foundation. | 2026-05-22 | Dev `POST /v1/check-in/session-links/send-sms` creates hashed check-in tokens, records `jumpyard.sms_deliveries`, defaults to dry-run, and can send through AWS SNS only with explicit confirmation. |
| `T0041` | Ran controlled real SMS smoke. | 2026-05-22 | AWS SNS accepted one confirmed dev SMS for booking `5032210`; Aurora delivery `jysms_mpgvzkpz_5b4ae399` is `sent` with masked destination `+46*****9508`, `dry_run=false`, provider message id present, and token hash present. |
| `T0042` | Added SMS delivery diagnostics. | 2026-05-22 | Dev SNS SMS delivery status logs are enabled; diagnostic delivery `jysms_mpgwlk9u_9566748e` was accepted by SNS but CloudWatch shows provider `FAILURE` because the account is in SMS sandbox mode. |
| `T0043` | Verified SNS sandbox phone and resent SMS. | 2026-05-22 | Masked destination `+46*****9508` is verified in SNS sandbox; Aurora delivery `jysms_mpgxbla6_b59779cd` is `sent` and CloudWatch shows provider `SUCCESS`. |
| `T0044` | Added phone SMS link resume. | 2026-05-22 | Phone `jy_token` links resolve through JumpYard Cloud, receive safe booking/session context, and route to booking summary, QR confirmation, or manual lookup without mock token data. |
| `T0045` | Added booking-time SMS trigger foundation. | 2026-05-22 | Dev `POST /v1/check-in/session-links/send-due-sms` plans upcoming Aurora bookings by start time, skips unsafe/duplicate candidates, and reuses the existing SMS sender only with `confirmSend=true`. |
| `T0046` | Added scheduled booking-time SMS processing. | 2026-05-25 | EventBridge rule `jumpyard-check-in-dev-booking-time-sms-schedule` invokes the session Lambda every 5 minutes in dev planning mode with `confirmSend=false`; public due-SMS endpoint remains token-protected. |
| `T0047` | Added staff auth replacement for temporary dev code. | 2026-05-25 | Normal admin handoff now uses JumpYard Cloud staff login and a short-lived staff token for list/detail/redeem; the lower-level direct redeem dev token remains for controlled internal/dev testing only. |
| `T0048` | Polished staff/admin handoff UI. | 2026-05-25 | Admin handoff now uses JumpYard phone-app icons, the documented system sans-serif font stack, mobile-first selected-detail ordering, larger rounded tap targets, simplified handoff copy, fewer decorative icons, and clearer scanner/list/detail/redeem states without changing backend contracts. Historical display-font imports were removed from admin/phone/kiosk app shells. |
| `T0049` | Added confirmed scheduled SMS safety gate. | 2026-05-25 | Dev scheduled booking-time SMS now has explicit `checkinBaseUrl` and `confirmedSendApproval` config fields, synth-time and runtime blocking for unsafe confirmed scheduled sends, and deployed EventBridge payload updates while keeping `confirmSend=false`. |
| `T0050` | Added payment readiness/bootstrap. | 2026-05-26 | Added `npm run roller:payment:readiness`, documented Pabel's payment answers, set `https://jumpyard-check-in.pages.dev` as the intended public test origin, and started the T0050-T0053 replacement sequence for the old T0040 placeholder. |
| `T0051` | Added new-booking payment execution wiring. | 2026-05-26 | Vendored Roller payment package `v217`, wired phone buy-entry drafts to the Roller/Adyen drop-in, kept raw JWT response-only/in-memory, made package bootstrap failures fail closed instead of spin indefinitely, and left public browser payment smoke pending allowlist confirmation. |
| `T0052` | Added add-product payment execution wiring. | 2026-05-26 | Reused the T0051 Roller payment drop-in for separate linked add-product drafts, kept raw JWT response-only/in-memory, preserved the payment-pending fallback, and routed approved add-product payment back into the original booking check-in flow without using the legacy local payment screen. |
| `T0053` | Added new-booking basket-before-payment flow. | 2026-05-26 | Phone buy-entry now collects mapped add-ons before contact/review and sends entry plus selected add-ons in one draft/payment request; existing-booking add-product flow remains separate. |
| `T0054` | Public payment method smoke. | 2026-05-26 | Public Cloudflare smoke confirmed Swish can complete and produce paid booking `5063382`; card/scheme is missing from current Roller/Adyen Playground payment methods and is blocked externally. |
| `T0055` | Added new-booking paid continuation and buy-entry progress. | 2026-05-26 | Paid new-booking continuation starts/resumes the JumpYard Cloud check-in session and routes to safety/QR instead of the existing-booking summary/add-ons/payment loop. |
| `T0056` | Reconciled payment draft status after Roller settlement. | 2026-05-27 | Lookup and webhook enrichment mark matching local prepayment drafts `published` after an authoritative settled Roller booking snapshot; PR #59 merged to `main`. |
| `T0057` | Ran integrated dev/Playground smoke test. | 2026-05-27 | Entry-only booking `5063420` completed lookup, session, ready-for-staff, staff auth/list/detail, staff-confirmed redeem, and final Aurora state; mixed entry plus add-on booking `5063419` exposed a redeem eligibility follow-up. |
| `T0058` | Audited stack production readiness. | 2026-05-27 | Docs-only readiness audit merged through PR #61; staging/live remain blocked by environment split, auth/API guardrails, observability, SMS, secrets lifecycle, retention/cutover, and rollback runbooks. |
| `T0059` | Added redeem eligibility filter. | 2026-05-28 | Merged through PR #62; session and redeem Lambdas filter selected ticket ids by structured redeemable product metadata, and dev smoke redeemed only entry tickets in mixed booking `5063419`. |
| `T0060` | Added API security and observability hardening. | 2026-05-28 | Merged through PR #63; dev CORS is explicit, API access logs are enabled, CloudWatch dashboard/alarms are deployed, and Roller-calling Lambdas emit safe outbound API metrics. |
| `T0061` | Added API Gateway stage throttling and throttle visibility. | 2026-05-28 | Merged through PR #64; dev `$default` stage throttling is rate `25` requests/second and burst `50`, detailed metrics remain enabled, API 429s are counted in CloudWatch, and alarm `jumpyard-check-in-dev-api-throttled-requests` exists. |
| `T0062` | Documented route auth and WAF/edge boundary design. | 2026-05-28 | Merged to `main` through PR #65 with T0063; `API_PROTECTION_BOUNDARY.md` classifies current routes and target staging/live route protection. |
| `T0063` | Added guest messaging verification and email service foundation. | 2026-05-28 | Merged to `main` through PR #65; adds protected email link route, `email_deliveries`, SES-ready dry-run path, and public messaging base URL. |
| `T0064` | Reordered roadmap so SMS and email completion come first. | 2026-05-28 | Merged to `main` through PR #66; no app code, Lambda code, AWS resources, Roller config, or credentials changed. |
| `T0065` | Completed dev guest SMS path. | 2026-05-28 | Merged to `main` through PR #67; session Lambda SMS responses now include safe sender/provider diagnostics, SMS copy uses booking start time when available, confirmed public-URL SNS smoke to the verified sandbox phone succeeded, and `jy_token` links now show already-checked-in state for redeemed bookings instead of manual lookup fallback. |
| `T0066` | Completed dev guest email path as far as current SES setup allows. | 2026-05-28 | Merged to `main` through PR #68; session Lambda email responses now include safe sender/reply-to diagnostics, email copy uses booking start time when available, dry-run with public URL creates Aurora audit state, and confirmed sends fail closed because SES has no verified sender/domain identity. |
| `T0067` | Ran first real SES-backed dev email smoke. | 2026-05-28 | SES identity `love@wrlds.com` is verified and tagged; dev config uses it as sender/reply-to; protected confirmed email smoke for booking `5063420` wrote sent Aurora rows and SES provider message ids. |

## Current Ticket

| Ticket | Goal | Status | Notes |
|---|---|---|---|
| `T0067` | Real SES email smoke. | Completed locally, not committed | SES identity `love@wrlds.com` is verified, dev sender/reply-to config was deployed, and protected confirmed smoke sent real email for booking `5063420`. |

## Confirmed Next Tickets

| Ticket | Goal | Notes |
|---|---|---|
| `T0068` | Unified booking-time guest messaging | Make SMS and email work together from booking time windows with idempotency, audit rows, safe retry/failure handling, and clear dry-run versus confirmed-send controls. |
| `T0069` | Environment and cutover plan | Define staging/live config, secret ownership, deployment/rollback runbook, live backfill, webhook registration, and cutover checklist before any non-dev stack is created. |
| `T0070` | Alarm notifications and runbooks | Connect CloudWatch alarms to a notification path, document operator actions, and define dashboard/runbook usage for dev-to-staging readiness. |
| `T0071` | Secrets and dev-token replacement | Replace or isolate dev-only passcodes/shared tokens, define secret owners and rotation cadence, and prepare separate staging/live secret values. |
| `T0072` | Route auth and WAF implementation | Implement the T0062 boundary in infrastructure after the environment and identity choices are approved. |
| `T0073` | Data retention and PII policy | Lock retention, deletion/export, masking/hash, Aurora backup, event-log, and raw-payload policy before production data. |
| `T0074` | Deployment and rollback runbook | Define CI/CD identity, preflight gates, migration backup/restore, CDK diff approval, smoke tests, rollback criteria, and ownership. |
| `T0075` | Live backfill and cutover rehearsal | Rehearse initial live backfill, daily sync, webhook registration order, freshness checks, replay/reconciliation, and go/no-go checklist. |
| `Deferred` | Card/scheme payment smoke | Wait for Pabel/Roller to enable or confirm the `scheme` card method before testing the Adyen Visa card path. |

## Validation Status

- Automated root validation: `npm run validate` passed on 2026-05-28 for T0061 source-of-truth updates.
- T0056 validation: `node --check infra/lambda/lookup/index.js`, `node --check infra/lambda/webhook/index.js`, `npm --prefix infra run build`, `npm --prefix infra run synth:dev`, `npm run validate`, and `git diff --check` passed on 2026-05-27. `git diff --check` reported CRLF notices only.
- T0056 AWS preflight/deploy: account `376129878018` and region `eu-north-1` were verified with short-lived credentials exported from the existing `wrlds-dev` SSO profile. Pre-deploy diff showed only `LookupHandler` and `WebhookHandler` Lambda code asset changes, deploy passed, and post-deploy diff showed no differences.
- T0056 dev smoke: lookup for known paid booking `5063394` returned `found`/`ready`, Roller unique id `abec3317-1dc1-4b44-917b-5b52ae104d69`, `paymentStatus=Paid`, and `amountOwing=0`. Aurora row `jypd_835161973ab34210ac` changed to `published`, `amount_owing_cents=0`, and `event_log` contains `prepayment_draft.published`.
- T0057 integrated smoke: booking `5063394` still looks up as `Paid`/`ready` with draft `jypd_835161973ab34210ac` already `published`.
- T0057 redeemable happy path: protected Playground seed booking `5063420` for `2026-05-27` completed lookup, session `jycs_mpns6nvd_bc6ab155`, handoff `JY2947`, staff auth/list/detail, staff-confirmed redeem, and Aurora final state `sessionStatus=redeemed`, `handoffStatus=completed`, `selectedTicketCount=1`, `redeemedTicketCount=1`.
- T0057 browser smoke: public phone app `https://jumpyard-check-in.pages.dev` loaded with buy-entry and booking lookup copy; local admin app was temporarily started on `127.0.0.1:3002`, rendered the handoff shell, and was stopped after verification.
- T0057 finding: mixed entry plus JumpSocks booking `5063419` reached ready-for-staff, but staff redeem was rejected by Roller with `Product type not accepted` because selected tickets included non-redeemable add-on tickets.
- T0058 read-only AWS audit: account `376129878018`, region `eu-north-1`, stack `UPDATE_COMPLETE`, API `m0uo5g4mde`, Aurora `available`, SNS SMS sandbox `true`, and zero `jumpyard-check-in-dev*` CloudWatch alarms were confirmed without changing resources.
- T0058 readiness result: dev is suitable for Playground development and controlled smoke tests, but staging/live is blocked by environment split, production auth/API guardrails, observability alarms, SMS production readiness, secrets lifecycle, retention/cutover, and deployment rollback runbooks.
- T0058 validation: `npm --prefix infra run build`, `npm --prefix infra run synth:dev`, `npm run validate`, and `git diff --check` passed on 2026-05-27. `git diff --check` reported CRLF notices only.
- T0059 validation: `node --check infra/lambda/redeem/index.js`, `node --check infra/lambda/session/index.js`, `npm --prefix infra run build`, `npm --prefix infra run synth:dev`, `npm run validate`, and `git diff --check` passed on 2026-05-28.
- T0059 deploy: AWS preflight confirmed account `376129878018` and region `eu-north-1`; pre-deploy diff showed only `RedeemHandler` and `SessionHandler` Lambda code assets; `npm --prefix infra run deploy:dev` passed; post-deploy diff showed no differences.
- T0059 mixed booking smoke: booking `5063419` plan selected entry tickets `5063419-21529629` and `5063419-21529630`, excluded add-on tickets `5063419-21529631` and `5063419-21529632`, and a new session selected only the two entry tickets. Staff-confirmed Playground redeem succeeded for the two entry tickets using the booking-date redemption timestamp; Aurora shows the two add-on tickets still unredeemed.
- T0059 entry-only regression: booking `5063394` plan selected one ticket, excluded zero, and remained ready; already-redeemed entry-only bookings `5063420` and `5032454` stayed blocked as `already_redeemed` with one selected ticket and zero excluded tickets.
- T0060 validation: `node --check` passed for lookup, booking, redeem, webhook, and data-sync Lambdas; `npm --prefix infra run build`, `npm --prefix infra run synth:dev`, `npm run infra:check`, `npm run validate`, and `git diff --check` passed on 2026-05-28. `git diff --check` reported CRLF notices only.
- T0060 deploy: AWS preflight confirmed account `376129878018` and region `eu-north-1`; pre-deploy diff showed explicit CORS, API access log group, CloudWatch dashboard/alarms, Lambda env updates, and Roller metric code; `npm --prefix infra run deploy:dev` passed; post-deploy diff showed no differences.
- T0060 AWS verification: CloudWatch dashboard `jumpyard-check-in-dev-ops` exists; `describe-alarms --alarm-name-prefix jumpyard-check-in-dev` returned 16 alarms; API CORS origins are explicit and include `https://jumpyard-check-in.pages.dev`.
- T0060 smoke: `OPTIONS /v1/bookings/availability` from `https://jumpyard-check-in.pages.dev` returned HTTP `204` with that allowed origin; `POST /v1/bookings/availability` for `2026-05-28` at `10:00` returned `status=available`, source `roller`, `wroteBooking=false`, and booking Lambda logs showed safe Roller API call metric entries for `oauth_token` and `get_product_availability`.
- T0061 validation: `npm --prefix infra run build`, `npm --prefix infra run synth:dev`, `npm run infra:check`, `npm run validate`, and `git diff --check` passed on 2026-05-28. `git diff --check` reported CRLF notices only.
- T0061 deploy: AWS preflight confirmed account `376129878018` and region `eu-north-1`; pre-deploy diff showed only API Gateway stage throttling, a CloudWatch Logs metric filter, one CloudWatch alarm, and dashboard updates; `npm --prefix infra run deploy:dev` passed; post-deploy diff showed no differences.
- T0061 AWS verification: API Gateway `$default` stage has `DetailedMetricsEnabled=true`, `ThrottlingBurstLimit=50`, and `ThrottlingRateLimit=25`; CloudWatch Logs metric filter `ApiThrottledRequestMetricFilter...` writes `JumpYard/Cloud` metric `ApiThrottledRequestCount`; alarm `jumpyard-check-in-dev-api-throttled-requests` exists.
- T0061 smoke: `POST /v1/bookings/availability` returned HTTP `200` after throttling was enabled, with source `roller` and `wroteBooking=false`.
- T0062 validation: route inventory comparison found 19 CDK route declarations and 19 documented routes; `npm run validate` and `git diff --check` passed on 2026-05-28. `git diff --check` reported CRLF notices only.
- T0062 roadmap adjustment: user chose to postpone the environment/cutover plan and prioritize guest messaging verification plus email service foundation as T0063.
- T0062 AWS/resource result: no AWS resources, app code, Lambda code, CDK code, Aurora schema, package dependencies, or Roller config were changed.
- T0063 validation: `node --check infra/lambda/session/index.js`, `npm --prefix infra run build`, `npm --prefix infra run synth:dev`, `npm run validate`, and `git diff --check` passed on 2026-05-28. `git diff --check` reported CRLF notices only.
- T0063 AWS preflight: account `376129878018`, region `eu-north-1`; SES sending is enabled but `list-email-identities` returned no verified identities.
- T0063 migration/deploy: `npm --prefix infra run migrate:dev` applied `0007 email deliveries`; pre-deploy diff showed one email route, session Lambda code/env/IAM, and SMS base URL target update; `npm --prefix infra run deploy:dev` passed; post-deploy diff showed no differences.
- T0063 email dry-run smoke: protected route `POST /v1/check-in/session-links/send-email` for booking `5063420` returned `email_planned`, delivery `jyem_mppbtp9i_5e98ee13`, provider `aws_ses`, masked destination `l***@e***.com`, and preview text with `[check-in-link]` placeholder instead of a raw token URL.
- T0063 Aurora verification: latest `jumpyard.email_deliveries` row has delivery `jyem_mppbtp9i_5e98ee13`, booking `5063420`, status `planned`, `dry_run=true`, provider `aws_ses`, and template `checkin_email_v1`.
- T0063 confirmed-send guard: confirmed email request returned HTTP `400` with `email_sender_not_configured` because no SES sender identity is configured yet.
- T0063 SMS safety smoke: protected SMS dry-run with public base URL returned `sms_planned`, delivery `jysms_mppbz4gm_e52cdd54`, provider `aws_sns`, and masked destination `+46*****9508`; dev scheduled SMS remains `confirmSend=false`.
- T0064 roadmap result: docs now prioritize guest SMS completion, guest email completion, and unified booking-time guest messaging before environment/cutover, alarm runbooks, dev-token replacement, route auth/WAF, retention, deployment rollback, and live backfill/cutover rehearsal.
- T0064 validation: `npm run validate` and `git diff --check` passed on 2026-05-28. `git diff --check` reported CRLF notices only.
- T0065 validation: `node --check infra/lambda/session/index.js`, `npm --prefix infra run build`, `npm --prefix infra run synth:dev`, `npm --prefix jumpyard-checkin-phone run lint`, `npm --prefix jumpyard-checkin-phone run build`, `npm run validate`, and `git diff --check` passed on 2026-05-28. Phone lint still reports the pre-existing four `<img>` warnings; `git diff --check` reported CRLF notices only.
- T0065 deploy: AWS preflight confirmed account `376129878018` and region `eu-north-1`; pre-deploy diff showed only the `SessionHandler` Lambda code asset changing; `npm --prefix infra run deploy:dev` passed for SMS diagnostics, and the follow-up token fallback deploy also changed only `SessionHandler`.
- T0065 confirmed SMS smoke: protected `POST /v1/check-in/session-links/send-sms` for booking `5063420` used public base URL `https://jumpyard-check-in.pages.dev/`, returned `sms_sent`, delivery `jysms_mppg15lj_7c660ef2`, provider `aws_sns`, provider message id present, sender ID configured/requested, and masked destination `+46*****9508`.
- T0065 Aurora/SNS verification: `jumpyard.sms_deliveries` contains delivery `jysms_mppg15lj_7c660ef2` with status `sent`, `dry_run=false`, and CloudWatch SNS delivery status reports `SUCCESS` with provider response `Message has been accepted by phone.`
- T0065 `jy_token` routing verification: local phone app opened an active token for booking `5063394` directly to `APP_BOOKING`; an already-redeemed token for booking `5063420` opened `APP_PRESENT` with `REDAN INCHECKAD`; an invalid token still fell back to `KIOSK_LOOKUP`.
- T0065 post-deploy diff: `npm --prefix infra run diff:dev` showed no differences.
- T0066 validation: `node --check infra/lambda/session/index.js`, `npm --prefix infra run build`, `npm --prefix infra run synth:dev`, and AWS SES readiness checks passed on 2026-05-28 before deploy.
- T0066 deploy: AWS preflight confirmed account `376129878018` and region `eu-north-1`; pre-deploy diff showed only the `SessionHandler` Lambda code asset changing; `npm --prefix infra run deploy:dev` passed.
- T0066 SES readiness: `aws sesv2 get-account` returned `SendingEnabled=true`, `ProductionAccessEnabled=false`, max 200 emails per 24 hours, max send rate 1 email/second; `list-email-identities` returned no identities.
- T0066 email dry-run smoke: protected `POST /v1/check-in/session-links/send-email` for booking `5063420` used public base URL `https://jumpyard-check-in.pages.dev/`, returned `email_planned`, delivery `jyem_mppic9ea_01a07299`, provider `aws_ses`, `fromAddressConfigured=false`, `replyToConfigured=false`, and masked destination `t0***@example.invalid`.
- T0066 Aurora verification: `jumpyard.email_deliveries` contains delivery `jyem_mppic9ea_01a07299` with status `planned`, `dry_run=true`, provider `aws_ses`, and template `checkin_email_v1`.
- T0066 confirmed-send guard: confirmed email request returned HTTP `400` with `email_sender_not_configured`, which is expected until a verified SES sender/domain is configured.
- T0067 AWS/SES preflight: account `376129878018`, region `eu-north-1`; SES remains sandboxed with `ProductionAccessEnabled=false`, sending enabled, max 200 emails per day, and max send rate 1 email/second.
- T0067 SES identity: created tagged SES email identity `love@wrlds.com`; current status is `VerificationStatus=SUCCESS` and `VerifiedForSendingStatus=true`.
- T0067 deploy: `infra/config/dev.json` now sets `guestEmail.fromAddress` and `guestEmail.replyToAddresses` to `love@wrlds.com`; CDK diff showed only `SessionHandler` environment variables changing, and deploy passed.
- T0067 real email smoke: protected `POST /v1/check-in/session-links/send-email` for booking `5063420` used public base URL `https://jumpyard-check-in.pages.dev/`, returned `email_sent`, and Aurora shows sent deliveries `jyem_mppo8w07_296c1a5e` and `jyem_mppo99gl_3c888240` with provider message ids present.
- T0055 validation: public Cloudflare smoke after merge created paid booking `5063394`, started/resumed a JumpYard Cloud session, and routed the phone flow to safety. The matching local prepayment draft still showed `payment_pending`, which is the T0056 reconciliation target.
- T0055 validation: `npm --prefix jumpyard-checkin-phone run lint`, `npm --prefix jumpyard-checkin-phone run build`, local browser progress smoke at `http://localhost:3000/`, `npm run validate`, and `git diff --check` passed on 2026-05-26. Browser smoke confirmed compact progress labels `Entré`, `Tillägg`, `Betalning`, `Säkerhet`, and `Klar`, and advanced through `TIMESLOT`, `PRODUCT`, `QUANTITY`, `ADDONS`, and `CONTACT`. Phone lint still reports the pre-existing four `<img>` warnings, and Next build still reports stale `baseline-browser-mapping` advisory warnings.
- T0054 validation: public Cloudflare smoke confirmed T0053 flow order, Swish payment created paid booking `5063382`, JumpYard Cloud lookup returned `Paid`/`amountOwing=0`/`canCheckIn=true`, safe payment-config inspection found no `scheme` card method for the current Playground custom-checkout configuration, and `git diff --check` passed with CRLF notices only.
- T0053 validation: `npm run validate`, `npm --prefix jumpyard-checkin-phone run lint`, `npm --prefix jumpyard-checkin-phone run build`, local browser flow smoke at `http://localhost:3000/`, and `git diff --check` passed on 2026-05-26. Browser smoke selected 60 min entry plus one socks add-on and reached review with both lines before draft/payment. Phone lint still reports the pre-existing four `<img>` warnings, and Next build still reports stale `baseline-browser-mapping` advisory warnings.
- T0052 validation: `npm run validate`, `cd jumpyard-checkin-phone && npm run lint`, `cd jumpyard-checkin-phone && npm run build`, source scan for raw JWT/logging, local browser smoke at `http://localhost:3000/`, and `git diff --check` passed on 2026-05-26. Phone lint still reports the pre-existing four `<img>` warnings, and Next build still reports stale `baseline-browser-mapping` advisory warnings. Public browser card smoke is now unblocked by Pabel's allowlist confirmation and remains pending execution.
- T0051 validation: `npm run validate`, `npm run roller:payment:readiness`, `cd jumpyard-checkin-phone && npm run lint`, `cd jumpyard-checkin-phone && npm run build`, source scan for raw JWT/logging, local browser smoke at `http://127.0.0.1:3000/`, and `git diff --check` passed on 2026-05-26. Pabel later confirmed the public-origin allowlist. `npm audit --omit=dev` warns on existing `next@16.0.8`/`postcss` advisories and is tracked as `FU-043`. A local payment bootstrap spinner was fixed so missing package configuration becomes a visible unavailable state.
- T0050 validation: `node --check scripts/roller-payment-readiness.js`, `npm run roller:payment:readiness`, `npm run validate`, and `git diff --check` passed. Readiness reported Roller `/venues/me` HTTP `200`, `paymentSettings` available, public origin HTTP `200`, Roller docs HTTP `200`, and blocker `public_origin_allowlist_confirmation`.
- T0049 validation: `node --check infra/lambda/session/index.js`, `npm --prefix infra run build`, `npm --prefix infra run synth:dev`, unsafe confirmed-send synth guards, runtime guard smoke, `npm run validate`, pre/post `npm --prefix infra run diff:dev`, `npm --prefix infra run deploy:dev`, and `git diff --check` passed.
- T0049 post-credential-recovery smoke: new Playground booking `5063366` for `2026-05-26` returned `ready` from JumpYard Cloud, existed in Aurora as `Paid`/`fresh` with 4 tickets, started check-in session `jycs_mpmg3swu_0c34710f`, reached `ready_for_staff` with handoff `JY8713`, and appeared in the staff-auth-protected handoff list/detail without redeeming tickets.
- T0048 validation: admin lint/build passed, phone lint/build passed with existing image optimization warnings, kiosk build passed, `npm run validate` passed, and `git diff --check` passed.
- T0048 kiosk lint: `npm --prefix jumpyard-checkin-kiosk run lint` is still blocked by pre-existing component/context lint errors outside the shell font change.
- T0048 browser validation: admin `http://127.0.0.1:3002/` and phone `http://localhost:3000/` both used the documented system sans-serif font stack and showed no horizontal overflow at `390x844` or `1280x800`.
- T0048 admin copy validation: browser checks on `http://localhost:3002/` showed the login surface no longer renders `Personal`, `Logga in`, `Logga ut`, or the previous login/input icons. Logged-in mobile header stays on one row, `Sök` and `Skanna QR` render as 900 italic, and the search placeholder is `Sök eller skanna QR`.
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
- T0013 infra build: `npm --prefix infra run build` passed.
- T0013 dry-run: `npm --prefix infra run import:products:dev` returned 96 top-level products and 491 flattened product/variation rows without Aurora writes.
- T0013 write guard: `npm --prefix infra run import:products:dev:apply` failed closed without `ROLLER_PRODUCT_IMPORT_ALLOW_WRITE`.
- T0013 AWS identity preflight: `aws sts get-caller-identity --profile wrlds-dev` returned account `376129878018`.
- T0013 AWS region preflight: `aws configure get region --profile wrlds-dev` returned `eu-north-1`.
- T0013 dev apply: guarded apply matched 491 `jumpyard.product_catalog_cache` rows and 9 `jumpyard.roller_booking_items` rows with product names.
- T0013 Aurora verification: seed booking item product names now include `Biljetter (260 kr)`, `Antal`, `SkyRider 1 åk`, `Hänglås`, and `Islatte`.
- T0014 Data API tickets smoke: `node scripts/roller-data-api-smoke.js --path /data/tickets --start-date 2026-05-20 --end-date 2026-05-21 --max-pages 2 --json` returned 6 records.
- T0014 Data API bookingpayments smoke: `node scripts/roller-data-api-smoke.js --path /data/bookingpayments --start-date 2026-05-20 --end-date 2026-05-21 --max-pages 2 --json` returned 0 records.
- T0014 Data API customers smoke: `node scripts/roller-data-api-smoke.js --path /data/customers --start-date 2026-05-20 --end-date 2026-05-21 --max-pages 2 --json` returned 6 records with contact fields.
- T0014 migration status before apply: `0001 initial schema` applied and `0002 related data sources` pending.
- T0014 migration apply: `npm --prefix infra run migrate:dev` applied `0002 related data sources`.
- T0014 migration status after apply: `0001` and `0002` applied.
- T0014 dry-run: `npm --prefix infra run import:related-data:dev -- --start-date 2026-05-20 --end-date 2026-05-21` returned 6 tickets, 0 payments, 6 customers, and 0 skipped records without Aurora writes.
- T0014 write guard: `npm --prefix infra run import:related-data:dev:apply -- --start-date 2026-05-20 --end-date 2026-05-21` failed closed without `ROLLER_RELATED_IMPORT_ALLOW_WRITE`.
- T0014 dev apply: guarded apply upserted 6 tickets, 0 payments, and 6 customers into Aurora.
- T0014 idempotency check: re-running guarded apply against the same window upserted the same records without duplicate rows.
- T0014 Aurora verification: direct Data API query returned 6 ticket rows, 0 payment rows, and 6 guest profile rows with masked contact output.
- T0015 webhook Lambda syntax: `node --check infra/lambda/webhook/index.js` passed.
- T0015 local handler smoke: unauthorized and invalid JSON requests returned HTTP `200`; missing database config returned HTTP `500`.
- T0015 infra build: `npm --prefix infra run build` passed.
- T0015 dev synth: `npm --prefix infra run synth:dev` passed.
- T0015 pre-deploy diff: `npm --prefix infra run diff:dev` showed the webhook Lambda asset and dev webhook-token secret changes.
- T0015 AWS identity preflight: `aws sts get-caller-identity --profile wrlds-dev` returned account `376129878018`.
- T0015 AWS region preflight: `aws configure get region --profile wrlds-dev` returned `eu-north-1`.
- T0015 deploy: `npm --prefix infra run deploy:dev` passed; stack reported no changes because AWS was already in sync with the synthesized T0015 template.
- T0015 post-deploy diff: `npm --prefix infra run diff:dev` showed no differences.
- T0015 deployed unauthorized smoke: `POST /v1/roller/webhooks/bookings` without token returned HTTP `200` and `ignored_unauthorized`.
- T0015 deployed accepted smoke: `POST /v1/roller/webhooks/bookings` with dev token returned HTTP `200` and `accepted` for event `t0015-smoke-booking-created-5032210`.
- T0015 deployed duplicate smoke: repeating the same authorized request returned HTTP `200` and `duplicate`.
- T0015 Aurora verification: direct Data API query returned webhook event `t0015-smoke-booking-created-5032210` with status `received`.
- T0015 final validation: `npm run validate`, `npm --prefix infra run build`, and `node --check infra/lambda/webhook/index.js` passed.
- T0016 lookup Lambda syntax: `node --check infra/lambda/lookup/index.js` passed.
- T0016 local invalid JSON check: lookup handler returned HTTP `400` with `invalid_json`.
- T0016 local Aurora-first smoke: `5032210`, `5032211`, and `5032212` returned from source `jumpyard_cloud` without Roller refresh.
- T0016 local live-refresh smoke: first `5001370` lookup returned source `roller` and `refreshedFromRoller=true`; second `5001370` lookup returned source `jumpyard_cloud`.
- T0016 AWS identity preflight: `aws sts get-caller-identity --profile wrlds-dev` returned account `376129878018`.
- T0016 AWS region preflight: `aws configure get region --profile wrlds-dev` returned `eu-north-1`.
- T0016 infra build: `npm --prefix infra run build` passed.
- T0016 dev synth: `npm --prefix infra run synth:dev` passed.
- T0016 pre-deploy diff: `npm --prefix infra run diff:dev` showed only the lookup Lambda code asset change.
- T0016 deploy: `npm --prefix infra run deploy:dev` updated `jumpyard-check-in-dev-stack-lookup`.
- T0016 deployed smoke: `5032210` => `ready` from `jumpyard_cloud`; `5032211` => `payment_required` from `jumpyard_cloud`; `5032212` => `wrong_date` from `jumpyard_cloud`; `999999999` => HTTP `404` `not_found`; invalid JSON => HTTP `400` `invalid_json`.
- T0016 post-deploy diff: `npm --prefix infra run diff:dev` showed no differences.
- T0016 final validation: `npm run validate`, `npm --prefix infra run build`, and `node --check infra/lambda/lookup/index.js` passed.
- T0017 webhook Lambda syntax: `node --check infra/lambda/webhook/index.js` passed.
- T0017 local webhook enrichment smoke: event `t0017-local-webhook-enrich-5032210-20260521094844` returned HTTP `200`, enrichment `processed`, booking `5032210`, 2 items, and 4 tickets.
- T0017 local Aurora verification: direct Data API query showed the local smoke event with status `processed`, one enrichment attempt, and `processed_at`.
- T0017 infra build: `npm --prefix infra run build` passed.
- T0017 dev synth: `npm --prefix infra run synth:dev` passed.
- T0017 pre-deploy diff: `npm --prefix infra run diff:dev` showed only the webhook Lambda code asset change.
- T0017 deploy: `npm --prefix infra run deploy:dev` updated `jumpyard-check-in-dev-stack-webhook`.
- T0017 deployed smoke: event `t0017-deployed-webhook-enrich-5032210-20260521095241` returned HTTP `200`, enrichment `processed`, booking `5032210`, 2 items, and 4 tickets.
- T0017 deployed Aurora verification: direct Data API query showed the deployed smoke event with status `processed`, one enrichment attempt, and `processed_at`.
- T0017 post-deploy diff: `npm --prefix infra run diff:dev` showed no differences.
- T0017 final validation: `npm run validate`, `npm --prefix infra run build`, and `node --check infra/lambda/webhook/index.js` passed.
- T0018 webhook registration dry-run: `npm --prefix infra run register:webhook:dev` passed and detected existing webhook id `238`.
- T0018 webhook registration apply: guarded apply registered Roller Playground webhook id `238` against the dev endpoint.
- T0018 real delivery discovery: Roller sends the configured webhook token in header `x-roller-apikey`.
- T0018 dev deploy: `npm --prefix infra run deploy:dev` updated `jumpyard-check-in-dev-stack-webhook` with real Roller header support and event-type normalization.
- T0018 real Roller delivery: creating Playground booking `5032443` triggered a `Created` webhook, enriched booking `5032443`, and wrote `status=processed` in `jumpyard.roller_webhook_events`.
- T0018 final validation: `npm run validate`, `npm --prefix infra run build`, `node --check infra/lambda/webhook/index.js`, `npm --prefix infra run register:webhook:dev`, and post-deploy `npm --prefix infra run diff:dev` passed.
- T0019 API lookup verification: `POST /v1/check-in/lookup` for `5032444` returned `found`, `payment_required`, `source.system=jumpyard_cloud`, and `freshnessStatus=fresh`.
- T0019 browser verification: `http://localhost:3000` found `5032444`, opened booking summary, showed `Obetald`, disabled `Betalning krävs`, and exposed metadata `sourceSystem=jumpyard_cloud`, `freshness=fresh`.
- T0019 validation: `npm run validate`, `cd jumpyard-checkin-phone && npm run lint`, and `cd jumpyard-checkin-phone && npm run build` passed. Lint still reports the four pre-existing `<img>` warnings.
- T0020 redeem Lambda syntax: `node --check infra/lambda/redeem/index.js` passed.
- T0020 local request-shape smoke: invalid JSON, missing idempotency key, duplicate ticket ids, and more than 10 ticket ids returned expected stable errors before database or Roller work.
- T0020 validation: `npm run validate`, `npm --prefix infra run build`, and `npm --prefix infra run synth:dev` passed.
- T0020 AWS identity preflight: `aws sts get-caller-identity --profile wrlds-dev` returned account `376129878018`.
- T0020 AWS region preflight: `aws configure get region --profile wrlds-dev` returned `eu-north-1`.
- T0020 pre-deploy diff: `npm --prefix infra run diff:dev` showed only the approved redeem Lambda asset and `ENABLE_ROLLER_REDEEM_WRITES=false` environment change.
- T0020 deploy: `npm --prefix infra run deploy:dev` updated `jumpyard-check-in-dev-stack-redeem`.
- T0020 deployed smoke: missing idempotency returned HTTP `400`; booking `5032210` returned `planned` with 4 tickets; unpaid booking `5032211` returned `payment_required`; `confirmRedeem=true` returned `redeem_write_disabled`.
- T0020 Aurora audit verification: direct Data API query showed `planned`, `blocked`, and `write_disabled` rows in `jumpyard.checkin_attempts` for the smoke requests.
- T0020 post-deploy diff: `npm --prefix infra run diff:dev` showed no differences.
- T0021 validation: `npm run validate`, `node --check infra/lambda/redeem/index.js`, `npm --prefix infra run build`, and `npm --prefix infra run synth:dev` passed.
- T0021 AWS identity preflight: `aws sts get-caller-identity --profile wrlds-dev` returned account `376129878018`.
- T0021 AWS region preflight: `aws configure get region --profile wrlds-dev` returned `eu-north-1`.
- T0021 pre-deploy diff: `npm --prefix infra run diff:dev` showed the approved redeem dev-token secret, CORS header, redeem Lambda asset/env change, and scoped Secrets Manager permission.
- T0021 first deploy: `npm --prefix infra run deploy:dev` created `/jumpyard-check-in-dev/redeem/dev-token`, enabled protected redeem writes, and updated the redeem Lambda.
- T0021 first controlled write smoke: `confirmRedeem=true` without token returned HTTP `403`; planning returned `planned`; first write attempt returned Roller HTTP `409` because default `redemptionDevice` did not exist in Roller.
- T0021 follow-up diff/deploy: removed the invalid default `redemptionDevice`; diff showed only the redeem Lambda asset; deploy passed.
- T0021 controlled redeem smoke: dedicated booking `5032454` returned HTTP `200` with status `redeemed`; ticket `5032454-21397335` was redeemed through Roller Playground.
- T0021 reuse smoke: a follow-up plan for booking `5032454` returned HTTP `409` with `already_redeemed`.
- T0021 Aurora verification: direct Data API query showed `redeemed` and `already_redeemed` attempt rows, and `roller_booking_tickets.redeem_status_last_seen='redeemed'` for `5032454-21397335`.
- T0021 post-deploy diff: `npm --prefix infra run diff:dev` showed no differences.
- T0022 validation: `npm run validate` passed; no app code, infra code, AWS resources, migrations, credentials, `.env`, or Roller calls were changed.
- T0023 validation: `npm run validate`, `node --check infra/lambda/session/index.js`, `npm --prefix infra run build`, and `npm --prefix infra run synth:dev` passed.
- T0023 AWS preflight: `aws sts get-caller-identity --profile wrlds-dev` returned account `376129878018`, and region `eu-north-1` was confirmed.
- T0023 migration status before apply: `0001` and `0002` applied, `0003 checkin sessions` pending.
- T0023 migration apply: `npm --prefix infra run migrate:dev` applied `0003 checkin sessions`.
- T0023 pre-deploy diff: `npm --prefix infra run diff:dev` showed only the approved session Lambda, log group, two API routes, invoke permissions, and scoped DB/log permissions.
- T0023 deploy: `npm --prefix infra run deploy:dev` created `jumpyard-check-in-dev-stack-session` and session API routes.
- T0023 deployed smoke: booking `5032210` returned `session_started` with session `jycs_mpfe3dum_7dc29b1b`; repeating start returned `session_resumed`; booking `5032211` returned `payment_required`; marking the session ready returned `ready_for_staff` with handoff code `JY6085`.
- T0023 Aurora verification: direct Data API query showed session `jycs_mpfe3dum_7dc29b1b` with `status='ready_for_staff'`, `handoff_status='ready_for_staff'`, and `safety_status='completed'`.
- T0023 post-deploy diff: `npm --prefix infra run diff:dev` showed no differences.
- T0024 phone lint: `cd jumpyard-checkin-phone && npm run lint` passed with four pre-existing `<img>` warnings.
- T0024 phone build: `cd jumpyard-checkin-phone && npm run build` passed.
- T0024 browser paid-session verification: booking `5032210` advanced from booking summary to add-ons only after session `jycs_mpfe3dum_7dc29b1b` was present in phone flow state.
- T0024 browser unpaid verification: booking `5032211` stayed on `APP_BOOKING`, showed disabled `Betalning krävs`, and had no session id.
- T0025 validation: `npm run validate`, `npm --prefix jumpyard-checkin-phone run lint`, and `npm --prefix jumpyard-checkin-phone run build` passed. Lint still reports the four pre-existing `<img>` warnings.
- T0025 browser ready-for-staff verification: booking `5032210` reached `APP_CONFIRM` with session `jycs_mpfe3dum_7dc29b1b`, session status `ready_for_staff`, handoff status `ready_for_staff`, and handoff code `JY6085`.
- T0026 validation: `npm run validate`, `node --check infra/lambda/session/index.js`, `npm --prefix infra run build`, `npm --prefix infra run synth:dev`, `npm --prefix jumpyard-checkin-admin run lint`, and `npm --prefix jumpyard-checkin-admin run build` passed.
- T0026 AWS deploy: `npm --prefix infra run deploy:dev` added `GET /v1/staff/check-in/sessions` and `GET /v1/staff/check-in/sessions/{checkinSessionId}`; post-deploy `npm --prefix infra run diff:dev` showed no differences.
- T0026 API smoke: staff list returned one active ready session for booking `5032210`, session `jycs_mpfe3dum_7dc29b1b`, handoff code `JY6085`, 2 booking items, 4 selected tickets, and 4 total tickets.
- T0026 browser verification: local admin app at `http://127.0.0.1:3002/` rendered handoff code `JY6085`, booking `5032210`, product rows, and ticket rows from the dev JumpYard Cloud API.
- T0027 validation: `npm run validate`, `node --check infra/lambda/redeem/index.js`, `npm --prefix infra run build`, `npm --prefix infra run synth:dev`, `npm --prefix jumpyard-checkin-admin run lint`, and `npm --prefix jumpyard-checkin-admin run build` passed.
- T0027 AWS preflight: `aws sts get-caller-identity --profile wrlds-dev` returned account `376129878018`, and region `eu-north-1` was confirmed.
- T0027 pre-deploy diff: `npm --prefix infra run diff:dev` showed only the approved staff redeem route, API Gateway integration/invoke permission, and redeem Lambda code asset.
- T0027 AWS deploy: `npm --prefix infra run deploy:dev` added `POST /v1/staff/check-in/sessions/{checkinSessionId}/redeem`; post-deploy `npm --prefix infra run diff:dev` showed no differences.
- T0027 guard smoke: local Lambda invocation returned HTTP `400` for missing `confirmRedeem=true` and HTTP `403` for missing dev redeem token before DB/Roller work.
- T0027 API smoke: dedicated Playground booking `5032473`, session `jycs_mpfhz4jp_a4770adb`, handoff `JY3091` redeemed 1 selected ticket through the new staff route and returned `status='redeemed'`.
- T0027 post-redeem verification: staff detail returned session `redeemed`, handoff `completed`, `completedAt`, and 1 local redeemed ticket for `jycs_mpfhz4jp_a4770adb`; the session no longer appeared in the active waiting list.
- T0027 browser verification: local admin app at `http://127.0.0.1:3002/` rendered ready handoff `JY7166` for booking `5032474` with the staff redeem panel, temporary dev-code input, and disabled `Slutför` button until a code is entered.
- T0028 validation: `npm run validate`, `npm --prefix jumpyard-checkin-phone run lint`, `npm --prefix jumpyard-checkin-phone run build`, `npm --prefix jumpyard-checkin-admin run lint`, and `npm --prefix jumpyard-checkin-admin run build` passed. Phone lint still reports the pre-existing `<img>` warnings.
- T0028 browser verification: local admin app at `http://127.0.0.1:3002/` rendered `Öppna` and `Skanna QR`, accepted full payload `JY_HANDOFF:JY2493:jycs_mpfh6ww7_9ff95b42`, opened handoff `JY2493`, and opened/closed the QR scanner cleanly.
- T0029 phone lint: `npm --prefix jumpyard-checkin-phone run lint` passed with the same pre-existing `<img>` warnings.
- T0029 phone build: `npm --prefix jumpyard-checkin-phone run build` passed.
- T0029 root validation: `npm run validate` passed.
- T0029 browser ready resume: local phone app at `http://localhost:3000` searched booking `5032469`, resumed fresh session `jycs_mpfm485d_f3717834`, and routed directly from search to QR confirmation with handoff code `JY1721`.
- T0029 browser already-redeemed resume: local phone app opened booking `5032454`, received the already-redeemed session-start block, and routed to `Redan incheckad` with `data-already-checked-in=true`.
- T0030 payment discovery syntax: `node --check scripts/roller-payment-discovery.js` passed.
- T0030 payment discovery dry-run: `npm run roller:payment:discover` passed, selected product `Biljetter (260 kr)` id `1765836`, and created no booking.
- T0030 payment discovery write guard: `npm run roller:payment:discover:apply-draft` failed closed without `ROLLER_PAYMENT_DISCOVERY_ALLOW_WRITE`.
- T0030 guarded draft write: direct guarded apply created Playground draft booking unique id `bcb88005-ae64-4617-ba7a-b02b095a86c2`; response returned HTTP `201`, total `260`, amount owing `260`, and `paymentJwtPresent=true` without printing the raw JWT.
- T0030 official docs check: Roller Payments via API docs confirm the custom checkout path uses Roller's payment library plus returned draft-booking JWT, but requires ROLLER authorization, public HTTPS domain allowlisting, and approved payment package access.
- T0030 root validation: `npm run validate` passed.
- T0031 booking Lambda syntax: `node --check infra/lambda/booking/index.js` passed.
- T0031 infra build: `npm --prefix infra run build` passed.
- T0031 infra synth: `npm --prefix infra run synth:dev` passed.
- T0031 CDK diff: scoped to `BookingHandler` code only. CDK needed temporary credentials exported from the `wrlds-dev` AWS CLI profile because direct SSO profile resolution failed inside the CDK process.
- T0031 dev deploy: deployed `jumpyard-check-in-dev-stack-booking` code through CDK; CloudFormation update completed successfully.
- T0031 deployed quote smoke: `POST /v1/bookings/quote` for product `1765836` on `2026-05-22` returned HTTP `200`, status `quoted`, total `260`, amount owing `260`, tax `14.72`, and `wroteBooking=false`.
- T0031 deployed draft smoke: `POST /v1/bookings/draft` with `confirmDraft=true` and a unique idempotency key returned HTTP `201`, draft unique id `2c1abf4f-944c-4122-a4ff-da8440c46321`, total `260`, amount owing `260`, `jwtPresent=true`, `jwtPartCount=3`, and `paymentConfigAvailable=true`. The raw JWT was not printed.
- T0031 post-deploy CDK diff: no differences.
- T0032 payment POC syntax: `node --check scripts/roller-payment-package-poc.js` passed.
- T0032 payment POC default: `npm run roller:payment:poc` returned quote HTTP `200`, total `260`, amount owing `260`, created no draft booking, and reported blockers `approved_payment_package`, `public_https_allowlisted_origin`, and `roller_fake_or_test_card_details`.
- T0032 payment POC write guard: `npm run roller:payment:poc:apply-draft` without confirmation failed closed before creating a draft.
- T0032 guarded payment POC draft: guarded apply created Playground draft `a8644795-a29d-4302-8a37-056d525e7bd4`, returned HTTP `201`, `paymentJwtPresent=true`, `paymentJwtPartCount=3`, and `venuePaymentConfigAvailable=true`; raw JWT was not printed.
- T0032 final validation: `npm run validate` and `git diff --check` passed.
- T0033 AWS preflight: `aws sts get-caller-identity --profile wrlds-dev` returned account `376129878018`, and `aws configure get region --profile wrlds-dev` returned `eu-north-1`.
- T0033 migration: `npm --prefix infra run migrate:dev` applied `0004 prepayment booking drafts`; post-apply status shows applied.
- T0033 deploy: `npm --prefix infra run deploy:dev` updated `jumpyard-check-in-dev-stack` with `POST /v1/bookings/availability` and booking Lambda changes; post-deploy `npm --prefix infra run diff:dev` showed no differences.
- T0033 deployed API smoke: `POST /v1/bookings/availability` returned available jump products for `2026-05-22`, `POST /v1/bookings/quote` returned HTTP `200` with total `200`, and `POST /v1/bookings/draft` returned HTTP `201` with draft `045b9ed6-7541-4f33-9e61-bfbd5bf0f8a3`, `paymentJwtPresent=true`, and raw JWT not printed.
- T0033 Aurora verification: `jumpyard.prepayment_booking_drafts` contains deployed smoke row `jypd_5d96dca81de8429eb4` and browser smoke row `jypd_f78fea81bea24fdea2` with masked/hash contact fields and no raw payment JWT column.
- T0033 browser smoke: local phone buy-entry selected `10:00`, `60 min entré`, quantity `1`, quoted `200 kr`, created a Playground draft, and ended at `Betalning väntar` with `data-prepayment-status="payment_pending"`.
- T0033 final validation: `node --check infra/lambda/booking/index.js`, `npm --prefix infra run build`, `npm --prefix infra run synth:dev`, `npm --prefix jumpyard-checkin-phone run lint`, `npm --prefix jumpyard-checkin-phone run build`, `npm run validate`, and `git diff --check` passed. Phone lint still reports the existing four `<img>` warnings.
- T0034 AWS preflight: `aws sts get-caller-identity --profile wrlds-dev` returned account `376129878018`, and `aws configure get region --profile wrlds-dev` returned `eu-north-1`.
- T0034 migration: first `0005` attempt failed because the migration runner cannot safely split `DO $$` blocks; migration was rewritten without a `DO` block, then `npm --prefix infra run migrate:dev` applied `0005 add product draft links`.
- T0034 deploy: `npm --prefix infra run diff:dev` showed only the booking Lambda code asset before deploy; `npm --prefix infra run deploy:dev` updated `jumpyard-check-in-dev-stack-booking`; post-deploy `npm --prefix infra run diff:dev` showed no differences.
- T0034 deployed quote smoke: `POST /v1/bookings/5032210/add-products/quote` returned HTTP `200`, total `200`, amount owing `200`, `wroteBooking=false`, and Aurora `booking_links` count for original `5032210` remained unchanged.
- T0034 deployed draft smoke: `POST /v1/bookings/5032210/add-products` returned HTTP `201`, Roller draft `18e85e91-9a53-4afd-a951-75d1a41eaf9f`, add-on group `jyao_2b05e40abbda4bad9a`, link `jyl_cf14c98651b4451aba`, prepayment draft `jypd_2a5ad290e9c34eadaa`, and `paymentJwtPresent=true`.
- T0034 Aurora verification: `jumpyard.prepayment_booking_drafts` has `flow_type='add_product'` with original booking reference `5032210`; `jumpyard.booking_links` has `link_type='add_product_draft'`; the only JWT-related column is `payment_jwt_present`.
- T0035 validation: `npm --prefix jumpyard-checkin-phone run lint`, `npm --prefix jumpyard-checkin-phone run build`, `npm run validate`, and `git diff --check` passed on 2026-05-22; lint still reports only pre-existing `<img>` warnings.
- T0035 browser smoke: local phone app searched paid booking `5032443`, started a session, added one socks item, quoted `45 kr`, created add-product draft `jypd_740b8fc10ee446639b`, and stopped at payment pending.
- T0035 Aurora verification: draft `jypd_740b8fc10ee446639b` has `flow_type='add_product'`, `status='payment_pending'`, original booking `5032443`, `amount_owing_cents=4500`, `payment_jwt_present=true`, and a `booking_links.link_type='add_product_draft'` row.
- T0036 infra build: `npm --prefix infra run build` passed.
- T0036 dry-run: `npm --prefix infra run import:data-api-backfill:dev -- 2026-05-20 2026-05-21` passed and ran bookingitems, related data, and products with `apply=false`.
- T0036 apply guard: `npm --prefix infra run import:data-api-backfill:dev:apply -- 2026-05-20 2026-05-21` failed closed without `ROLLER_DATA_BACKFILL_ALLOW_WRITE`.
- T0037 syntax/build: `node --check infra/lambda/data-sync/index.js` and `npm --prefix infra run build` passed.
- T0037 synth/diff/deploy: `npm --prefix infra run synth:dev`, `npm --prefix infra run diff:dev`, and `npm --prefix infra run deploy:dev` passed against account `376129878018`, region `eu-north-1`.
- T0037 manual Lambda smoke: invoking `jumpyard-check-in-dev-stack-data-sync` for `2026-05-20 -> 2026-05-21` succeeded with 9 bookingitems, 6 tickets, 0 payments, 6 customers, and 491 product rows; Aurora `booking_seed_runs` recorded `succeeded`.
- T0037 post-deploy diff: `npm --prefix infra run diff:dev` showed no differences.
- T0038 syntax/build: `node --check infra/lambda/session/index.js` and `npm --prefix infra run build` passed.
- T0038 synth/diff/deploy: `npm --prefix infra run synth:dev`, `npm --prefix infra run diff:dev`, and `npm --prefix infra run deploy:dev` passed against account `376129878018`, region `eu-north-1`.
- T0038 deployed API smoke: protected link creation returned `link_created` with token/url present without printing raw token; public resolve returned `session_started`, and Aurora `jumpyard.checkin_tokens` showed the token hash row with `opened=true`, `consumed=false`, and `active=true`.
- T0038 unauthorized smoke: link creation without the dev token returned HTTP `401`.
- T0038 post-deploy diff: `npm --prefix infra run diff:dev` showed no differences.
- T0038 final validation: `npm run validate` and `git diff --check` passed.
- T0039 session Lambda syntax: `node --check infra/lambda/session/index.js` passed.
- T0039 infra build: `npm --prefix infra run build` passed.
- T0039 AWS preflight: account `376129878018`, region `eu-north-1`.
- T0039 migration apply: `npm --prefix infra run migrate:dev` applied `0006 sms deliveries`; status shows applied.
- T0039 synth/diff/deploy: `npm --prefix infra run synth:dev`, `npm --prefix infra run diff:dev`, and `npm --prefix infra run deploy:dev` passed; post-deploy diff showed no differences.
- T0039 deployed unauthorized smoke: `POST /v1/check-in/session-links/send-sms` without the dev token returned HTTP `401`.
- T0039 deployed dry-run smoke: protected request for booking `5032210` returned `sms_planned`, provider `aws_sns`, dryRun `true`, and masked destination `+46*****0000` without sending SMS.
- T0039 Aurora verification: `jumpyard.sms_deliveries` row `jysms_mpgvgmyt_f49e7b7d` has status `planned`, dry_run `true`, provider `aws_sns`, masked destination, and a token hash.
- T0039 final validation: `npm run validate` and `git diff --check` passed.
- T0041 real SMS smoke: protected request for booking `5032210` with `confirmSend=true` returned `sms_sent`, provider `aws_sns`, `dryRun=false`, masked destination `+46*****9508`, and provider accepted the message.
- T0041 Aurora verification: `jumpyard.sms_deliveries` row `jysms_mpgvzkpz_5b4ae399` has status `sent`, dry_run `false`, provider `aws_sns`, masked destination, token hash present, provider message id present, and sent timestamp present.
- T0042 infra validation: AWS preflight account `376129878018`, region `eu-north-1`; `npm --prefix infra run build`, `npm --prefix infra run synth:dev`, `npm --prefix infra run diff:dev`, and `npm --prefix infra run deploy:dev` passed for SNS delivery diagnostics.
- T0042 SNS attributes: `DefaultSMSType=Transactional`, `DeliveryStatusSuccessSamplingRate=100`, and delivery role `jumpyard-check-in-dev-sns-sms-delivery-status` are configured.
- T0042 diagnostic SMS: protected request for booking `5032210` with `confirmSend=true` created Aurora row `jysms_mpgwlk9u_9566748e` with status `sent`, provider `aws_sns`, `dry_run=false`, masked destination, provider message id present, and token hash present.
- T0042 CloudWatch delivery status: SNS failure log group reports `FAILURE` with provider response `Sandboxed account unable to send to number.`
- T0042 SNS sandbox status: `aws sns get-sms-sandbox-account-status` returned `IsInSandbox=true`.
- T0043 SNS sandbox verification: masked destination `+46*****9508` is `Verified` in SNS SMS sandbox. The one-time password was used once and not stored.
- T0043 verified SMS smoke: protected request for booking `5032210` with `confirmSend=true` created Aurora row `jysms_mpgxbla6_b59779cd` with status `sent`, provider `aws_sns`, `dry_run=false`, masked destination, provider message id present, and token hash present.
- T0043 CloudWatch delivery status: SNS success log group reports `SUCCESS` with provider response `Message has been accepted by phone.`
- T0044 session Lambda syntax/build: `node --check infra/lambda/session/index.js` and `npm --prefix infra run build` passed.
- T0044 phone lint/build: `npm --prefix jumpyard-checkin-phone run lint` passed with the existing `<img>` warnings, and `npm --prefix jumpyard-checkin-phone run build` passed.
- T0044 root validation: `npm run validate` passed.
- T0044 AWS preflight: account `376129878018`, region `eu-north-1`.
- T0044 CDK diff/deploy: pre-deploy diff showed only `SessionHandler` Lambda code changing; `npm --prefix infra run deploy:dev` passed; post-deploy diff showed no differences.
- T0044 deployed API smoke: protected link creation followed by public resolve returned `session_started`, included safe booking reference `5032210`, included 2 booking item rows, and returned source `jumpyard_cloud` / `checkin_link` without printing the raw token.
- T0044 browser smoke: local phone app opened a generated `?jy_token=...` link and reached `APP_BOOKING` with `checkinSessionStatus='guest_in_progress'`; invalid token fallback reached `KIOSK_LOOKUP`.
- T0045 session Lambda syntax/build/synth: `node --check infra/lambda/session/index.js`, `npm --prefix infra run build`, and `npm --prefix infra run synth:dev` passed.
- T0045 root validation: `npm run validate` passed.
- T0045 AWS preflight: account `376129878018`, region `eu-north-1`.
- T0045 CDK diff/deploy: first diff showed the new `send-due-sms` route, invoke permission, and session Lambda code; fallback fix diff showed only session Lambda code; deploys passed and post-deploy diff showed no differences.
- T0045 deployed planning smoke: protected planning mode returned `booking_time_sms_planned` without sending SMS; booking `5032210` was skipped as `sms_already_sent_recently`, and booking `5032211` was skipped as `payment_required`, both with masked destinations only.

## Known Issues Summary

- AWS dev foundation is deployed. Lookup, session, webhook, safe redeem-planning, controlled dev redeem execution, booking quote/draft handlers, and existing-booking add-product quote/draft handlers are implemented.
- Roller credentials secret in AWS has been populated for dev and was used by T0009 lookup smoke tests.
- JumpYard Cloud lookup API now uses Aurora first and refreshes from Roller when local data is missing or unsafe. Other API business logic is still pending.
- Phone app booking lookup now calls JumpYard Cloud for the first check-in step, carries non-visible lookup source/freshness metadata, uses today's Stockholm date by default, starts/resumes a JumpYard Cloud session after paid lookup, routes active ready sessions directly to QR, and marks new sessions ready for staff after safety attestation. Buy-entry can create one entry-plus-add-ons draft/payment flow and T0055 routes approved paid new bookings into safety/QR instead of the existing-booking loop.
- Aurora schema exists in dev. T0012 writes normalized `/data/bookingitems` snapshots into `roller_bookings` and `roller_booking_items`, T0013 enriches booking item product names from `product_catalog_cache`, T0014 imports tickets plus customer contact data, T0016 live-refresh lookup can upsert refreshed booking/item/ticket data, and T0017 webhook enrichment can upsert refreshed booking/item/ticket data.
- Booking index ingestion has started with Data API bookingitems, REST product catalog cache, tickets, booking payments, customer contact data, dev webhook event intake/enrichment, lookup-driven live refresh, real Roller Playground webhook delivery, and a local all-source daily-window backfill orchestrator.
- Roller Data API `/data/bookingitems`, `/data/tickets`, `/data/bookingpayments`, and `/data/customers` access, query params, paging shape, and modified-date behavior are confirmed in Playground for the T0008 seed window.
- Webhook retry behavior, response handling, booking event names, Playground auth header `x-roller-apikey`, and dev webhook registration are confirmed. Exact production auth/signature and IP allowlisting choice remain open.
- Already-redeemed Playground data now exists from T0021 controlled redeem booking `5032454`; a broader deterministic already-redeemed seed scenario is still deferred.
- Staff handoff/redeem flow design is documented in T0022, server-owned session/handoff API skeleton is deployed from T0023, phone session-start wiring is complete from T0024, phone ready-for-staff wiring is complete from T0025, the first staff/admin handoff list/detail is complete from T0026, staff-confirmed redeem is deployed from T0027, QR/paste lookup polish is complete from T0028, phone session resume routing is complete locally from T0029, staff auth replacement is deployed from T0047, staff/admin mobile visual polish is complete locally from T0048, and guest SMS/email link foundations both use the same opaque `jy_token` session-resolution model.
- Roller `POST /redemptions` has been executed once through the protected dev path against Playground booking `5032454`.
- Roller `POST /bookings/draft` has been executed through the protected T0030 discovery path, deployed T0031 JumpYard Cloud draft endpoint, and guarded T0032 POC harness against Playground and returned costs plus `paymentJwt`; T0050 confirms `/venues/me` payment settings are available, T0051 wires the approved payment package in the phone buy-entry flow, T0052 reuses it for linked add-product drafts, and T0054 confirmed public Swish payment can complete. The remaining blocker is Roller/Adyen enabling or confirming the card/scheme method for Playground custom checkout.
- Existing-booking add-product linked-booking flow has been tested server-side in dev and wired in the phone UI, including the shared payment package path when JWT/config are present.
- T0058 production-readiness audit is docs-only and made no AWS changes. T0060 added the first dev CORS/observability hardening, T0061 added dev API Gateway stage throttling plus 429 visibility, T0062 documented the route boundary, T0063 added email dry-run/audit support, and T0064 moved guest SMS/email completion ahead of broader staging/live readiness. The main staging/live blockers still include production environment config, route auth/WAF implementation, alarm notification/runbooks, SMS sandbox/consent/sender readiness, SES sender/domain verification, dev-token replacement, data retention, deployment rollback, and live backfill/cutover.
- `aws-cdk-lib` currently carries a moderate bundled dependency audit warning; a dependency fix should be evaluated separately from T0007.

## Open Questions

- What is the exact JumpYard Cloud link model between original booking and separate add-on booking?
- Which tenders work in the new add-on booking checkout flow: gift card, membership code, and multi-visit value?
- Which products must be configured as ticket/session products to support API-driven redemption and webhook-based counters?
- Which exact production retention/encryption policy should apply to stored guest email and phone?
- Should `/data/giftcards` be imported for gift card flows, and in which ticket?
- Which exact production auth header/signature and optional IP allowlisting should Roller webhook intake use beyond the confirmed Playground `x-roller-apikey` header?
- Which real Roller redemption device name should JumpYard Cloud send, if any, before production check-in?
- Which staff/admin authentication model should authorize final redeem in the pilot?
- Will Roller/Adyen enable or confirm the `scheme` card method for Playground custom checkout so the Adyen Visa test card ending `1142` can be tested on `https://jumpyard-check-in.pages.dev`?
