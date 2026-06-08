# Repo Current State

Use this file as the living snapshot of what actually exists in the repository. Update it after completed tickets, audits, meaningful dependency changes, or workflow changes.

## Snapshot

- Date: 2026-06-08
- Current branch: `codex/t0105-existing-booking-ui-cleanup`
- Current status: T0105 is completed locally. T0104 deployed the merged T0103 booking Lambda change to AWS dev, and the deployed `POST /v1/bookings/availability` endpoint now returns `skyrider` as `type='addon'` with product id `1765443`. T0105 cleaned up the frontend-only existing-booking add-on demo path before the Gustav rehearsal.
- Current ticket: `T0105`
- Completed tickets: `T0000`, `T0001`, `T0002`, `T0003`, `T0004`, `T0005`, `T0006`, `T0007`, `T0008`, `T0009`, `T0010`, `T0011`, `T0012`, `T0013`, `T0014`, `T0015`, `T0016`, `T0017`, `T0018`, `T0019`, `T0020`, `T0021`, `T0022`, `T0023`, `T0024`, `T0025`, `T0026`, `T0027`, `T0028`, `T0029`, `T0030`, `T0031`, `T0032`, `T0033`, `T0034`, `T0035`, `T0036`, `T0037`, `T0038`, `T0039`, `T0041`, `T0042`, `T0043`, `T0044`, `T0045`, `T0046`, `T0047`, `T0048`, `T0049`, `T0050`, `T0051`, `T0052`, `T0053`, `T0054`, `T0055`, `T0056`, `T0057`, `T0058`, `T0059`, `T0060`, `T0061`, `T0062`, `T0063`, `T0064`, `T0065`, `T0066`, `T0067`, `T0068`, `T0069`, `T0070`, `T0071`, `T0072`, `T0073`, `T0074`, `T0075`, `T0076`, `T0077`, `T0078`, `T0079`, `T0080`, `T0081`, `T0082`, `T0083`, `T0084`, `T0085`, `T0086`, `T0087`, `T0088`, `T0089`, `T0090`, `T0091`, `T0092`, `T0093`, `T0095`, `T0096`, `T0097`, `T0098`, `T0099`, `T0100`, `T0101`, `T0102`, `T0103`, `T0104`, `T0105`
- Recommended next step: run T0106 SkyRider consent-before-payment, then T0107 linked add-ons in staff/handoff, and T0108 full Gustav demo regression smoke/runbook.

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
|-- OPERATIONS_RUNBOOK.md
|-- GUEST_MESSAGING_PRODUCTION_UNLOCK.md
|-- GIFT_CARD_MULTI_VISIT_DISCOVERY.md
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
|   |-- migrations/0008_prepayment_draft_customer_names.sql
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
| Deployed `POST /v1/check-in/session-links/send-due-messages` | Plan or manually confirm booking-time guest messages for SMS and email from one due-booking processor. | Protected by the check-in link dev token for manual calls; EventBridge invokes it internally in planning mode with `confirmSend=false`. |
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
| `T0068` | Unified booking-time guest messaging. | 2026-05-29 | Merged through PR #70; adds `POST /v1/check-in/session-links/send-due-messages`, keeps `send-due-sms` as SMS-only compatibility, and changes the dev EventBridge booking-time payload to plan both SMS and email from one processor without enabling real unattended sends. |
| `T0069` | Locked the stabilization roadmap. | 2026-05-29 | Docs-only ticket; keeps full dev-flow proof, Data API/webhook checks, and guest SMS/email verification ahead of broader staging/live readiness work. |
| `T0070` | Ran integrated dev smoke test. | 2026-05-29 | Fresh paid Playground booking `5100836` completed lookup, session start, ready-for-staff, staff auth/detail, staff-confirmed redeem, and local completed session/ticket state. A leftover retry session for `5100835` was redeemed as cleanup. |
| `T0071` | Verified Data API and webhook health. | 2026-05-29 | Dev daily Data API rule is enabled and latest scheduled run succeeded; manual current-day sync succeeded; recent Roller webhook events for `5100835` and `5100836` are processed; lookup for `5100836` reads fresh Aurora data. |
| `T0072` | Verified guest SMS/email sender readiness. | 2026-05-29 | SNS remains sandboxed with one verified test phone; SES remains sandboxed with only `love@wrlds.com` verified; schedule still runs unified SMS/email planning with `confirmSend=false`; unattended sends remain blocked. |
| `T0073` | Ran controlled unified booking-time message smoke. | 2026-05-29 | Scoped Playground booking `5100877` was synced into Aurora; unified planning found SMS and email; controlled confirmed send wrote sent Aurora audit rows for both channels; SNS accepted the SMS, and the user confirmed SMS plus email receipt. |
| `T0074` | Prepared SMS production unlock package. | 2026-05-29 | Read-only AWS checks confirmed SNS and AWS End User Messaging SMS remain sandboxed with no sender IDs or pools; docs now contain the AWS Support case draft and missing user inputs. |
| `T0075` | Verified card payment unblock. | 2026-06-01 | Pabel's Roller Playground fix is confirmed in the public checkout: card payment renders, Adyen Visa test card ending `1142` submits, and the phone flow reaches the safety-video step. |
| `T0076` | Verified full new-booking purchase flow. | 2026-06-01 | Public Cloudflare smoke completed buy-entry, time/product/add-ons/contact/review, card payment with Adyen Visa ending `1142`, safety video/rules, and ready-for-staff QR/handoff code `JY4704`; merged through PR #78. |
| `T0077` | Verified paid existing-booking happy path. | 2026-06-01 | Public existing-booking lookup for paid booking `5100930` resumed directly to ready-for-staff QR/handoff code `JY4704`; merged through PR #79. |
| `T0078` | Verified existing-booking add-product payment flow. | 2026-06-01 | Public existing-booking add-product smoke for paid booking `5100926` selected one `Strumpor`, created a separate linked add-on draft, paid by card with Adyen Visa ending `1142`, and continued to safety video; merged through PR #80. |
| `T0079` | Polished existing-booking add-product UX. | 2026-06-01 | Existing-booking add-products no longer ask guests to re-enter contact details when original booking contact can be resolved server-side; approved add-product payment briefly confirms before safety continuation; merged through PR #81. |
| `T0080` | Verified Data API, webhook, Aurora, and lookup health. | 2026-06-01 | Daily Data API schedule is enabled and healthy, recent seed runs succeeded, recent smoke bookings are fresh in Aurora, recent webhooks are processed, public lookups return from Aurora, and deployed no-customer add-product quote returns safely; merged through PR #82. |
| `T0081` | Ran integrated Playground flow rehearsal. | 2026-06-01 | New card-paid booking `5100963` reached ready-for-staff handoff `JY7597`, staff-confirmed redeem succeeded for ticket `5100963-21683812`, and Aurora/webhook readback was fresh. Add-product quote/no-contact UX worked, but confirmed add-product draft creation failed closed with `customer.firstName is required`; T0082 must fix original-customer resolution before linked add-product payment can be re-passed. |
| `T0082` | Fixed add-product contact resolution. | 2026-06-01 | Booking Lambda now reuses original new-booking draft contact data plus Roller customer id/Aurora guest profiles for no-customer add-product drafts; deployed booking Lambda code only; no-customer smoke for original booking `5100965` created linked add-on draft `jypd_7d8379902449415aab` and link `jyl_7e8eac4758424c24bc`. |
| `T0083` | Added staff handoff identity/search data. | 2026-06-01 | Session Lambda now returns staff-only guest identity fields with masked contact values and supports staff search over code, booking reference, stored first/last name, email, and phone; booking/data-sync capture customer names; admin queue/detail displays safe identity fields and product-first ticket rows. |
| `T0084` | Rebuilt staff handoff one-page queue/detail UX. | 2026-06-02 | Staff/admin now defaults to search/QR plus queue, opens a compact selected handoff summary with products to hand out, and removed the guest backup-code box as a pulled-forward UI fix. |
| `T0085` | Polished staff redeem confirmation. | 2026-06-02 | Successful staff redeem now shows a large green confirmation and waits for staff to choose `Tillbaka till kön` or `Scanna ny QR`; merged through PR #86. |
| `T0086` | Guest/admin UI polish pass. | 2026-06-02 | Phone/admin UI only: removed leftover backup-code labels/text from phone source, changed the legacy present-code label to staff/personalkod, removed unused font-stretch helpers from phone/admin globals, and kept flow behavior unchanged; merged through PR #87. |
| `T0087` | Staff admin Cloudflare deployment. | 2026-06-02 | Admin Pages settings are documented for `jumpyard-checkin-admin`, static Cloudflare headers are added, dev CORS includes `https://jumpyard-checkin-admin.pages.dev`, public staff smoke passed from the Cloudflare URL, and the ticket was merged through PR #88. |
| `T0088` | Real-time guest-name enrichment. | 2026-06-02 | Webhook enrichment now uses booking detail plus documented read-only `GET /guests/{guestId}` fallback when needed; dev deploy and safe booking `5100965` smoke confirmed guest profile name/contact booleans without raw PII output. |
| `T0089` | Guest messaging production unlock package. | 2026-06-02 | Read-only AWS checks confirmed SNS SMS and SES remain sandboxed; `GUEST_MESSAGING_PRODUCTION_UNLOCK.md` documents hard gates, missing inputs, and future approved steps without changing resources, code, support cases, or unattended sends. |
| `T0090` | Gift card and multi-visit discovery. | 2026-06-02 | Roller Playground safe discovery confirmed gift-card cost payload behavior, invalid gift-card errors, active partial/full gift-card application in costs, the documented multi-pass read endpoint, and a paid `10-Kort` membership fixture that did not expose or auto-apply as a multi-pass. |
| `T0091` | Gift card checkout implementation. | 2026-06-03 | Merged through PR #93 as merge commit `9718b58`; buy-entry gift-card checkout is implemented, dev-deployed, and direct API-smoked for invalid, partial, and full gift-card behavior. |
| `T0092` | Gift card integrated smoke. | 2026-06-03 | Public phone app gift-card flow passed invalid, partial, full-cover, and card-only smokes; full-cover booking `5101070` verified through Roller Data API and JumpYard Cloud Aurora-backed lookup. |
| `T0093` | Membership/10-Kort code validation. | 2026-06-03 | Safe no-write Roller Playground costs calls confirmed `discounts: [{ code }]` can accept the masked paid `10-Kort` ticket id as a 100% discount. No balance or multi-pass allocation was exposed; V1 should implement code validation only if scoped. |
| `T0095` | Integrated regression rehearsal. | 2026-06-03 | Public non-destructive smoke passed for phone load, availability/product flow, card-only payment surface, gift-card input, invalid gift-card blocking, public admin load, and staff login plus queue access. No payment, messaging send, or redeem was intentionally executed. |
| `T0096` | Controlled full integrated write/redeem rehearsal. | 2026-06-03 | Public flow created paid booking `5101105`; JumpYard Cloud lookup returned fresh Aurora-backed state; session `jycs_mpy1x4ne_910af158` reached ready-for-staff handoff `JY5397`; staff-confirmed redeem consumed one ticket and public admin queue returned to empty. |
| `T0097` | Membership/discount-code discovery. | 2026-06-03 | Gustav's clarification was confirmed through official docs and safe no-write Roller Playground checks: current Nacka `10-Kort` is not exposed as beta multi-pass balance, but the known code applies through `discounts: [{ code }]` as a 100% discount. |
| `T0098` | Controlled 10-Kort consumption smoke. | 2026-06-03 | One approved Playground write created and published booking `5101114` with the masked `10-Kort` code. Roller showed booking discount evidence but no 10 -> 9 remaining-use readback; V1 must not show remaining visits. |
| `T0101` | Operational monitoring and runbooks. | 2026-06-04 | Read-only AWS checks confirmed dashboard `jumpyard-check-in-dev-ops`, 17 `jumpyard-check-in-dev-*` alarms in `OK`, and Lambda log groups with 30-day retention. Added `OPERATIONS_RUNBOOK.md` for dev incident response across Data API, webhook, booking/payment, gift card/Klippkort, messaging, and staff redeem without changing AWS resources. |
| `T0102` | Phone buy-entry demo polish. | 2026-06-04 | Merged through PR #102; polished loading, contact/payment-code placement, summary rows, and payment icon/copy without changing backend behavior. |
| `T0103` | SkyRider availability gate. | 2026-06-04 | Implemented locally; booking availability now includes SkyRider, phone add-ons hide/cap SkyRider from availability, and quote/draft validates only explicitly capacity-bound items. |
| `T0104` | SkyRider availability backend deploy. | 2026-06-08 | Deployed the T0103 booking Lambda code to AWS dev; deployed availability now returns `skyrider` as an add-on with product id `1765443` for tested slots. |

## Current Ticket

| Ticket | Goal | Status | Notes |
|---|---|---|---|
| `T0104` | SkyRider availability backend deploy. | Completed locally | AWS dev deploy passed; deployed API smoke confirms SkyRider availability is now returned to the public phone app. |

## Confirmed Next Tickets

| Ticket | Goal | Notes |
|---|---|---|
| `T0105` | Phone summary icon/copy polish | Use the preferred calendar/time icon, correct product icons for handout/add-on rows, and remove redundant subtitles/details in the check-in app summary so rows are tighter and easier to scan. |
| `TBD` | Guest-facing add-on catalog review | Talk with Gustav before exposing more Roller add-ons such as drinks, food, merch, Valo, event, party, gift-card, and membership products. |
| `TBD` | Production readiness sequence | Resume staging/live config, route protection, retention, secrets, live backfill, webhook registration, monitoring/runbooks, rollback, and cutover rehearsal after the Playground demo scope is stable. |

## Validation Status

- T0090 docs verification: Roller Create draft booking docs describe gift card payments separately from discounts, booking costs uses the same booking payload family for safe cost calculation, and Help Center docs describe gift cards as stored-value tender.
- T0090 safe Roller Playground discovery: direct `POST /bookings/draft/costs` returned `bookingCosts.total=200` and `amountOwing=200` for entry product `1765860` at `2026-06-02 10:00`; adding an invalid gift card kept `amountOwing=200` and returned one `giftCardErrors` entry.
- T0090 gift-card data check: `/data/giftcards` first returned HTTP `200` but zero records for sampled Playground windows; after Venue Manager fixtures were created and paid, the `2026-06-02` window returned two gift cards for booking references `5101043` and `5101044` with balances `500` and `100`. Safe `POST /bookings/draft/costs` quotes using those gift cards applied one gift card with no errors; the `100 kr` card reduced a `200 kr` quote to `amountOwing=100`, and the `500 kr` card reduced it to `amountOwing=0`. `/products` contains `giftcard` products `Presentkort`, `Presentkort Återbetalningskort`, and `Julbox`.
- T0090 multi-visit discovery: product catalog contains `membership` products for `10-Kort`, `20-Kort`, and `30-Kort`; a safe cost quote for `10-Kort` variation `1765758` returned `total=1750`; paid booking `5101046` bought `10-Kort` and exposes membership-like ticket fields, but `GET /customers/4045520/multi-passes` returned zero balances and a costs quote with the same guest email returned `amountOwing=200` with empty `multiPassAllocations`. Help Center beta multi-pass docs describe automatic all-or-nothing application to eligible session passes by booking holder/email, but current `10-Kort` is not proven to be that model. Pabel/project notes indicate Nacka multi-visit may instead be validated as a membership/discount code; V1 should let Roller validate codes and should not show remaining visit balance.
- T0090 scope guard: no app code, Lambda code, CDK resources, Aurora migrations, AWS resources, Roller bookings, drafts, payments, redemptions, assets, deliverables, or production credentials changed.
- T0091 implementation status: `infra/lambda/booking/index.js` now returns safe gift-card applied/error metadata, redacts gift-card numbers from Roller errors, includes gift-card hashes in idempotency request hashes, and publishes full gift-card/no-payment drafts through `POST /bookings/draft/publish` when `amountOwing=0`. The phone buy-entry flow now has an optional gift-card field, sends `giftCards` to quote/draft, shows invalid/applied states, keeps partial gift-card bookings on card payment for the remainder, and routes full gift-card bookings into booking sync instead of card entry.
- T0091 local validation: `node --check infra/lambda/booking/index.js`, `npm --prefix jumpyard-checkin-phone run lint`, `npm --prefix jumpyard-checkin-phone run build`, `npm run validate`, `git diff --check`, and `npm --prefix infra run synth:dev` passed. Phone lint still reports the existing four Next.js `<img>` warnings, and `git diff --check` reports Git CRLF notices only.
- T0091 deploy: AWS profile `wrlds-dev` resolved account `376129878018`; pre-deploy `npm --prefix infra run diff:dev` showed only `BookingHandler` Lambda code; `npm --prefix infra run deploy:dev` passed on 2026-06-02; post-deploy diff showed no differences.
- T0091 browser sanity: local phone app loaded at `http://localhost:3000/?codexSmoke=t0091-gift-card-ui`; buy-entry flow reached the contact/payment group and showed the optional `Presentkort` input with the expected help text. Full public phone flow remains pending until T0091 is committed/merged and Cloudflare publishes the phone UI.
- T0091 dev API smoke: direct JumpYard Cloud quote calls with active masked gift-card fixtures passed. Invalid gift card returned HTTP `200`, `status=quoted`, `amountOwing=200`, and one safe gift-card error. The `100 kr` fixture reduced a `200 kr` quote to `amountOwing=100`. The `500 kr` fixture reduced a `200 kr` quote to `amountOwing=0`.
- T0091 no-payment draft smoke: direct JumpYard Cloud draft call with the full gift-card fixture created Roller Playground booking `5101055`, returned HTTP `201`, `amountOwing=0`, `giftCardAppliedCount=1`, and Aurora shows the local prepayment draft as `published` with `total_cents=20000` and `amount_owing_cents=0`.
- T0092 public smoke attempt: `https://jumpyard-check-in.pages.dev/?codexSmoke=t0092-gift-card` reached the buy-entry contact step, but the public UI did not show `Presentkort`. A cache-busted reload still lacked the field.
- T0092 public deploy verification: public HTML/JavaScript chunks for `https://jumpyard-check-in.pages.dev` did not contain `Presentkort`, `giftCard`, or `giftCards`; GitHub showed PR #93 merged as `9718b58` but no deployment/status for that merge commit.
- T0092 public UI retest: after Cloudflare updated, public phone app reached the buy-entry contact step and exposed the optional `Presentkort` field with help text.
- T0092 invalid gift-card public smoke: entering an invalid gift card produced safe text `Gift card could not be applied`, kept total `200 kr`, and disabled `Gå till betalning`.
- T0092 partial gift-card public smoke: the active `100 kr` fixture reduced a `200 kr` booking to `100 kr`, then rendered Roller/Adyen payment for `100 kr` with card, instalment, and Google Pay methods visible.
- T0092 full gift-card public smoke: the active full-cover fixture reduced a `200 kr` booking to `0 kr`, skipped card entry, and continued to the phone safety/check-in flow. Roller Data API showed paid API booking `5101070` for `2026-06-03`, and JumpYard Cloud lookup returned booking `5101070` as `found`, `Paid`, `amountOwing=0`, source `jumpyard_cloud`, lookup path `aurora:booking_reference`, freshness `fresh`, and one redeemable ticket.
- T0092 card-only regression smoke: a normal no-gift-card `200 kr` buy-entry flow still rendered Roller/Adyen payment for `200 kr`.
- T0092 direct Aurora CLI readback: not run because local AWS SSO for profile `wrlds-dev` had expired. Use `aws sso login --profile wrlds-dev` before any future direct RDS Data API verification.
- T0093 baseline costs smoke: direct Roller Playground `POST /bookings/draft/costs` for product `1765860`, `2026-06-03 10:00`, quantity `1`, returned `total=200`, `amountOwing=200`, `discount=0`, and empty `multiPassAllocations`.
- T0093 no-effect code smokes: invalid code, paid `10-Kort` booking reference, paid `10-Kort` unique id, paid `10-Kort` booking item id, and normal paid entry ticket id all returned HTTP `200` but kept `amountOwing=200` and `discount=0`. A returned/echoed discount row is not proof that the code applied.
- T0093 accepted code smoke: the masked paid `10-Kort` ticket id from booking `5101046` sent as `discounts: [{ code }]` reduced one `200 kr` entry to `amountOwing=0`, `discount=200`, and reduced quantity `2` from `400 kr` to `amountOwing=0`, `discount=400`; Roller returned it as a normal `percentOff=100` discount with empty `multiPassAllocations`.
- T0093 scope guard: no script files, app UI, Lambda code, CDK resources, Aurora migrations, AWS resources, Roller bookings, drafts, payments, redemptions, assets, deliverables, production credentials, or `.env` changed.
- T0095 public phone regression: public phone app loaded, buy-entry time/product/quantity/add-on/contact path reached the optional `Presentkort` field, and live availability showed remaining capacity before product selection.
- T0095 payment regression: existing public card-only payment surface still rendered Roller/Adyen for `200 kr`, including card, instalment, Google Pay, and Swish. No payment was submitted.
- T0095 invalid gift-card regression: invalid gift-card input showed `Gift card could not be applied`, kept total `200 kr`, and disabled `Gå till betalning`.
- T0095 public staff/admin regression: public admin loaded, accepted the current dev staff code, and reached search, QR scan, and queue view. Queue was empty; no staff redeem was run.
- T0095 scope guard: no app code, Lambda code, CDK resources, Aurora migrations, AWS resources, Roller bookings, drafts, payments, redemptions, SMS/email sends, assets, deliverables, production credentials, or `.env` changed.
- T0096 public write/redeem rehearsal: public phone flow created booking `5101105` for `2026-06-03 14:30`, one normal `60 min entre`, no gift card, no membership/`10-Kort`, and no add-ons. Swish completed the `200 kr` Playground payment after card-field automation was blocked by cross-origin Adyen iframes.
- T0096 state verification: Roller Data API found booking `5101105` as `Paid`; JumpYard Cloud lookup returned `found`, eligibility `ready`, `source.system=jumpyard_cloud`, `freshnessStatus=fresh`, and `refreshedFromRoller=false`.
- T0096 handoff/redeem: session `jycs_mpy1x4ne_910af158` was marked ready for staff with handoff `JY5397` and safety status `completed`; staff-confirmed redeem returned `redeemed` with one ticket consumed, and the public admin queue showed zero waiting handoffs afterwards.
- T0096 automation limits: the public phone app continued to `Sakerhetsvideo`, but the in-app browser runtime could not complete the loaded HTML5 safety video or type into cross-origin card fields. These are documented test-automation limits; no app/source changes were made.
- T0096 scope guard: no app code, Lambda code, CDK resources, Aurora migrations, AWS resources, Roller Live data, secrets, `.env`, SMS/email sends, assets, deliverables, or production credentials changed.
- T0097 official docs check: Roller Validate discount codes docs say that endpoint is being deprecated and Booking Costs should be used for discount validation. Roller Create Discount Codes docs confirm codes are first-class discount configuration artifacts, and membership redemption data exists as a Data API readback source.
- T0097 `10-Kort` fixture check: paid Playground booking `5101046` is still `Paid`, total `1750`, has customer id context, and contains membership-like markers. `GET /customers/4045520/multi-passes` returned HTTP `200` with zero balances.
- T0097 safe costs smokes: baseline one-entry quote returned `amountOwing=200`, invalid code kept `amountOwing=200` with `discount=0`, and the masked known `10-Kort` code sent as `discounts: [{ code }]` reduced one entry to `amountOwing=0`, `discount=200`, and quantity `2` to `amountOwing=0`, `discount=400`; `multiPassAllocations` stayed empty.
- T0097 scope guard: no app code, Lambda code, CDK resources, Aurora migrations, AWS resources, Roller bookings, drafts, payments, redemptions, Live data, secrets, `.env`, assets, or deliverables changed.
- T0098 pre-write checks: `GET /bookings/5101046` returned `Paid`, customer id `4045520`, and one masked candidate code; `GET /customers/4045520/multi-passes` returned zero balances; a no-write costs quote with the masked code returned `amountOwing=0` and `discount=200`.
- T0098 controlled write: one dedicated Playground booking was created with the masked code. `POST /bookings/draft` returned HTTP `201`, `amountOwing=0`, and `paymentJwtPresent=true`; `POST /bookings/draft/publish` returned HTTP `201` and booking reference `5101114`.
- T0098 post-write checks: `GET /bookings/5101114` returned `Paid`; original and smoke customer `multi-passes` still returned zero balances; the same code still quoted as valid for up to ten entries, while quantity `11` left `amountOwing=200`.
- T0098 product coverage quotes: the masked code discounted representative entry/session pass products (`Entré 60 min`, `Entré 120 min`) and multi-quantity entry quotes, but did not discount JumpSocks, coffee/tea, SkyRider add-ons, or mixed-basket add-on amounts.
- T0098 Data API readback: `/data/bookingitems` found booking `5101114` with `bookingTotal=0`, `discountAmount=200`, one discount code/id, and no remaining-use balance. `/data/membershipredemptions` returned HTTP `400` with `startDate is required, endDate is required` despite supplied parameters, so Roller must clarify that endpoint before it can be used.
- T0099 implementation status: phone buy-entry checkout now has an optional `Klippkort` field, sends safe `discountCodes` to JumpYard Cloud quote/draft calls, displays applied/rejected state, and blocks no-effect codes. Booking Lambda returns safe discount-code metadata, hashes codes in idempotency material, redacts raw codes from Roller errors, and uses no-payment draft publish when gift card or klippkort coverage reduces `amountOwing` to zero.
- T0099 local validation: `node --check infra/lambda/booking/index.js`, `npm --prefix jumpyard-checkin-phone run build`, `npm run validate`, and `git diff --check` passed. Phone build reported existing baseline-browser-mapping age notices; `git diff --check` reported Git CRLF notices only.
- T0100 branch/deploy status: branch `codex/t0100-klippkort-deploy-smoke` was created on 2026-06-04. AWS SSO profile `wrlds-dev` resolved account `376129878018`; pre-deploy `npm.cmd --prefix infra run diff:dev` showed only `BookingHandler` Lambda code; `npm.cmd --prefix infra run deploy:dev` passed; post-deploy `npm.cmd --prefix infra run diff:dev` showed no differences.
- T0100 backend Klippkort smoke: dev JumpYard Cloud availability found entry product `1765860` at `10:00`. Baseline quote returned `amountOwing=200`; invalid code returned `amountOwing=200` with one safe discount-code error; the masked paid `10-Kort` ticket/code from booking `5101046` reduced entry-only to `amountOwing=0` with `discount=200`; mixed entry plus JumpSocks with `requireAvailability=false` left `amountOwing=45` and `discount=200`; a full-coverage draft was published without payment as Roller Playground booking `5101133`. Validation output and Aurora event rows used masked codes/counts only.
- T0100 regression smoke: the active masked `100 kr` gift card from booking `5101044` still applied separately through `giftCards`, reducing a `200 kr` quote to `amountOwing=100` with one applied gift card and no gift-card errors. PR #99 merged T0099/T0100 into `main`; after Cloudflare published, public bundle check for `https://jumpyard-check-in.pages.dev` found `Klippkort`, `clipCard`, and `discountCodes`. Public API smoke confirmed baseline `amountOwing=200`, invalid Klippkort kept `amountOwing=200` with one safe error, valid entry-only Klippkort reduced `amountOwing=0`, and mixed entry plus JumpSocks left `amountOwing=45`.
- T0089 AWS read-only checks: SNS SMS sandbox status is still enabled, SNS SMS type is transactional, monthly spend limit is `1` USD, no default Sender ID/origination number exists, AWS End User Messaging SMS is still sandbox tier with no sender ids/pools/phone numbers, SES production access is disabled, only `love@wrlds.com` is verified for SES, and no dedicated email configuration set exists.
- T0089 documentation: `GUEST_MESSAGING_PRODUCTION_UNLOCK.md` records SMS sandbox exit, SES production access, sender/domain identity gates, missing JumpYard/WRLDS inputs, and future approved implementation steps.
- T0089 scope guard: no app code, Lambda code, CDK resources, Aurora migrations, Roller config, support cases, sender identities, domains, SMS/email sends, EventBridge payloads, or `confirmSend` behavior changed.
- T0088 endpoint verification: official Roller docs page `Get guest detail` confirms `GET /guests/{guestId}` and states `guestId` is formerly/equivalent to `customerId`.
- T0088 deploy: `node --check infra/lambda/webhook/index.js`, `npm --prefix infra run synth:dev`, pre-deploy `npm --prefix infra run diff:dev`, and `npm --prefix infra run deploy:dev` passed; CDK diff showed only `WebhookHandler` Lambda code.
- T0088 webhook smoke: safe Playground webhook event for booking `5100965` returned `status=accepted`, `enrichmentStatus=processed`, `guestDetailStatus=available`, and `guestNamePresent=true` without printing raw PII.
- T0088 Aurora readback: boolean-only query confirmed booking customer id, booking name flag, guest profile, first/last context, email, and phone were present without printing raw PII.
- T0081 branch setup: branch `codex/t0081-integrated-flow-rehearsal` was created from updated `main` after T0080 was merged through PR #82.
- T0081 new-booking smoke: public Cloudflare buy-entry flow created paid Playground booking `5100963` for `2026-06-01 14:00`, completed card payment with Adyen Visa ending `1142`, completed safety video and safety rules, and reached ready-for-staff session `jycs_mpv4s30n_b9f8b58c` with handoff `JY7597`.
- T0081 staff redeem smoke: staff login with the dev passcode returned a short-lived token, staff list/detail found booking `5100963`, and staff-confirmed redeem returned HTTP `200` with Roller status code `200`, redeemed ticket `5100963-21683812`, session status `redeemed`, and handoff status `completed`.
- T0081 Aurora/webhook readback: bookings `5100963` and `5100965` are `Paid`, `fresh`, and present in `jumpyard.roller_bookings`; their `Created` webhook events are `processed`; ticket `5100963-21683812` is locally marked `redeemed`, while `5100965-21683813` remains unredeemed for future testing.
- T0081 add-product blocker: public existing-booking add-product flow skipped visible contact fields and quote returned `45 kr`, but `RESERVERA TILLÄGG` failed closed with `customer.firstName is required for Roller draft booking creation` for old booking `5100926` and fresh paid booking `5100965`. Direct API confirmed quote succeeds but confirmed create fails without full resolved customer data.
- T0082 branch setup: branch `codex/t0082-add-product-contact-resolution` was created from updated `main` after T0081.
- T0082 backend fix: `infra/lambda/booking/index.js` now passes Roller `customerId` into local contact resolution, reads original JumpYard-created booking contact from `jumpyard.prepayment_booking_drafts`, and merges email/phone from Aurora guest profiles without inventing missing contact values.
- T0082 deploy: AWS preflight confirmed account `376129878018`, region `eu-north-1`, and approved dev tags. Pre-deploy CDK diff showed only `BookingHandler` Lambda code; deploy passed; post-deploy diff showed no differences.
- T0082 no-customer draft smoke: `POST /v1/bookings/5100965/add-products` with no `customer` payload created Roller Playground draft `45ee1b0e-ab69-4e31-832f-d956af599365`, prepayment draft `jypd_7d8379902449415aab`, add-on group `jyao_f93769db16d840678e`, and link `jyl_7e8eac4758424c24bc`; Aurora shows status `payment_pending`, total `4500` cents, and `payment_jwt_present=true`.
- T0083 branch setup: branch `codex/t0083-staff-identity-search` was created from updated `main` after T0082 was merged and pushed.
- T0083 backend/UI fix: `infra/lambda/session/index.js` adds staff-only guest identity mapping and backend search for handoff list; `infra/lambda/booking/index.js` stores first/last name on new prepayment drafts; `infra/lambda/data-sync/index.js` and `infra/scripts/import-related-data.ts` store Roller Data API customer first/last names in `guest_profiles.latest_booking_context`; `jumpyard-checkin-admin/src/lib/adminApi.ts` and `jumpyard-checkin-admin/src/app/page.tsx` show safe identity data, send search text to JumpYard Cloud, and show product names before ticket ids.
- T0083 migration/backfill: `npm --prefix infra run migrate:dev` applied `0008 prepayment draft customer names`, adding `customer_first_name` and `customer_last_name` to `jumpyard.prepayment_booking_drafts` and backfilling matched rows from `guest_profiles` where possible.
- T0083 deploy: AWS preflight confirmed account `376129878018`, region `eu-north-1`, and approved dev tags. CDK diffs were limited to `DataSyncHandler`, `BookingHandler`, and `SessionHandler` Lambda code over the staged deploys; deploys passed; final post-deploy diff showed no differences.
- T0083 staff API smoke: controlled ready-for-staff session for booking `5100965` was created without redeeming; staff search by booking reference, first name, derived last-name value, and masked contact found it, and the response included name plus masked email/phone flags while confirming raw `email`/`phone` fields were not returned.
- T0079 branch setup: branch `codex/t0079-add-product-ux-polish` was created from updated `main` after T0078 was merged through PR #80.
- T0079 backend behavior: existing-booking add-product quote/draft requests can omit `customer`; JumpYard Cloud resolves the original booking contact from Roller detail plus Aurora `guest_profiles` and fails closed if first name, last name, email, or phone cannot be resolved.
- T0079 phone behavior: the existing-booking add-product flow skips the visible contact form, quotes directly after add-on selection, sends no customer payload for add-product quote/draft, and shows a short payment-approved confirmation before continuing to the original safety/check-in path.
- T0079 validation: `node --check infra/lambda/booking/index.js`, `npm --prefix jumpyard-checkin-phone run lint`, `npm --prefix jumpyard-checkin-phone run build`, `npm run validate`, and `git diff --check` passed. Phone lint still reports only the pre-existing `<img>` warnings; local browser sanity loaded `http://localhost:3000/?codexSmoke=t0079-local`.
- T0078 branch setup: branch `codex/t0078-add-product-payment-flow` was created from updated `main` after T0077 was merged.
- T0078 public add-product smoke: `https://jumpyard-check-in.pages.dev` used paid existing booking `5100926`, entered the add-ons step, selected one `Strumpor`, collected add-on contact details, showed server quote `45 kr`, and created a separate linked add-on draft.
- T0078 linked-draft proof: the safe API response used `mode='separate_draft_booking'`, original booking `5100926`, Roller draft unique id `fe892301-95b7-490a-b4ad-dff311cfdd7f`, add-on group `jyao_32bbe440269649e7af`, link `jyl_77074c7ce26047b3b0`, and prepayment draft `jypd_529c13ed3a8a4d83a1`.
- T0078 payment continuation: the Roller/Adyen drop-in rendered card payment, secure iframes accepted the Adyen Visa test card ending `1142`, `Betala 45,00 kr` submitted, and the phone flow returned to the original booking's safety-video step.
- T0078 scope safety: no original booking mutation endpoint was used, no staff/admin redeem was performed, no AWS resources were changed, and no full guest contact data, Roller secrets, raw payment JWTs, access tokens, or full card data were printed.
- T0078 intermediate retry note: selector/debug attempts created unpaid pending linked add-on drafts for `5100929`, `5100928`, and `5100927`; the final successful payment pass was `5100926`.
- T0078 Aurora readback: direct read-only Aurora verification was not completed because the local AWS SSO token for profile `wrlds-dev` had expired.
- T0077 branch setup: branch `codex/t0077-existing-booking-happy-path` was created from updated `main` after T0076 was merged.
- T0077 merge: branch `codex/t0077-existing-booking-happy-path` was pushed and merged through PR #79 before T0078 started.
- T0077 paid booking discovery: read-only Roller Data API `/data/bookingitems` for modified-date window `2026-06-01 -> 2026-06-02` found paid booking `5100930`, booking date `2026-06-01`, session start `11:00`, product id `1765860`.
- T0077 public existing-booking smoke: `https://jumpyard-check-in.pages.dev/?codexSmoke=t0077-existing-5100930` used the existing-booking path, entered booking reference `5100930`, and reached the ready-for-staff QR/handoff screen without another payment.
- T0077 session resume behavior: the app resumed the existing server-owned ready-for-staff session and showed handoff/backup code `JY4704`, which confirms completed safety was not repeated.
- T0077 scope safety: no staff/admin redeem was performed, no AWS resources were changed, and no full guest contact data, Roller secrets, raw payment JWTs, or card data were printed.
- T0076 branch setup: branch `codex/t0076-new-booking-full-purchase-flow` was created from updated `main` after T0075 was merged.
- T0076 public browser smoke: `https://jumpyard-check-in.pages.dev` completed the new-booking path with 60 min entry at `11:00`, no add-ons, contact entry, basket review before payment, Adyen Visa test card ending `1142`, safety video, six safety confirmations, and final ready-for-staff QR/handoff state.
- T0076 payment/server path: captured public API flow included JumpYard Cloud availability, quote, draft creation, post-payment lookup, session creation, and ready-for-staff calls; frontend did not call Roller REST directly or receive Roller credentials.
- T0076 final handoff: successful smoke reached `REDO FOR PERSONAL`/ready-for-staff with handoff/backup code `JY4704` and one armband item.
- T0076 lookup timing: a short `404` lookup retry occurred immediately after payment before the paid booking became visible; the following lookup succeeded and the flow continued to handoff.
- T0076 Aurora readback: direct read-only Aurora verification was not completed because the local AWS SSO token for profile `wrlds-dev` had expired.
- T0075 branch setup: branch `codex/t0075-card-payment-unblock` was created successfully after permissions changed.
- T0075 payment readiness: `ROLLER_PAYMENT_ALLOWLIST_CONFIRMED=true npm.cmd run roller:payment:readiness -- --json` returned `ready_for_payment_implementation`, with venue payment settings available, docs reachable, public origin reachable, and no blockers.
- T0075 payment POC: `ROLLER_PAYMENT_PUBLIC_ORIGIN=https://jumpyard-check-in.pages.dev ROLLER_PAYMENT_TEST_CARD_CONFIRMED=true npm.cmd run roller:payment:poc -- --json` returned `ready_for_browser_payment_test`; the script now recognizes the vendored `@roller/ecom-payments` package `1.0.217`.
- T0075 public browser smoke: `https://jumpyard-check-in.pages.dev` rendered `Kortbetalning`, selected 60 min entry at `10:00`, filled the Adyen Visa test card ending `1142`, submitted `Betala 200,00 kr`, and reached the phone safety-video step with no captured request failures.
- T0075 in-app browser note: Codex in-app browser can verify card rendering but cannot type into Adyen cross-origin secure iframes; the actual card-entry smoke used Playwright with installed Chrome.
- T0075 payment-method follow-up: current public drop-in renders card, Delbetalning, and Google Pay; Swish is not visible after the card fix, and `FU-071` tracks Pabel/Roller confirmation for Swish and Apple Pay.
- T0074 AWS preflight: `aws sts get-caller-identity --profile wrlds-dev --region eu-north-1` returned account `376129878018`, and region is `eu-north-1`.
- T0074 SNS sandbox state: `aws sns get-sms-sandbox-account-status` returned `IsInSandbox=true`; unverified guest phone numbers still cannot receive SMS.
- T0074 SNS SMS attributes: `DefaultSMSType=Transactional`, `MonthlySpendLimit=1`, `DeliveryStatusSuccessSamplingRate=100`, and delivery-status IAM role are configured; no `DefaultSenderID` is set.
- T0074 AWS End User Messaging SMS state: account tier is `SANDBOX`, and read-only checks found no sender IDs and no pools.
- T0074 official docs review: AWS production SMS access requires a support request with use case, website/app URL, target countries, message type, opt-in/consent, sample message copy, and volume/rate expectations.
- T0074 support package: `PROJECT_CONTEXT.md` contains a draft AWS Support case; user still needs to confirm expected monthly volume, peak rate, final transactional copy, opt-in/consent wording, opt-out/support wording, and approval to submit.
- T0074 safety: no AWS Support case was submitted, no sender resources were created, no SMS attributes were changed, and EventBridge booking-time messaging remains `confirmSend=false`.
- T0074 final validation: `npm run validate` and `git diff --check` passed on 2026-05-29; `git diff --check` reported CRLF line-ending notices only.
- T0073 AWS preflight: `aws sts get-caller-identity --profile wrlds-dev --region eu-north-1` returned account `376129878018`, and region is `eu-north-1`.
- T0073 scoped booking: created paid Roller Playground booking `5100877` for `2026-05-29 15:30` with approved test SMS/email destinations only.
- T0073 Aurora refresh: manual Data API sync for `2026-05-29 -> 2026-05-30` succeeded with 4 bookingitems, 4 tickets, 4 payments, 5 customers, 491 products, and 4 booking upserts.
- T0073 unified planning: protected `POST /v1/check-in/session-links/send-due-messages` with `confirmSend=false` planned one SMS and one email for booking `5100877`, using masked destinations only.
- T0073 controlled confirmed send: protected `confirmSend=true` processed one SMS delivery `jysms_mpqwyxay_e7fe6d3c` and one email delivery `jyem_mpqwyxox_94ea00f5`, both recorded in Aurora as `sent`, `dry_run=false`, with provider message ids present.
- T0073 provider status: SNS delivery log reported `Message has been accepted by phone`; SES acceptance is represented by the stored SES provider message id because no SES delivery-event stream is configured.
- T0073 manual confirmation: user confirmed SMS and email arrived; current text is acceptable for now but needs copy polish before broader guest rollout.
- T0073 schedule safety: EventBridge booking-time messaging remains `confirmSend=false`, so unattended scheduled sends are still disabled.
- T0073 final validation: `npm run validate` and `git diff --check` passed on 2026-05-29; `git diff --check` reported CRLF line-ending notices only.
- T0072 AWS preflight: `aws sts get-caller-identity --profile wrlds-dev --region eu-north-1` returned account `376129878018`, and region is `eu-north-1`.
- T0072 SMS readiness: SNS SMS sandbox is still enabled, one masked test recipient is verified, `DefaultSMSType=Transactional`, monthly spend limit is `1`, delivery-status success sampling is `100`, and a delivery-status role is configured. The session Lambda requests `SMS_SENDER_ID=JumpYard`, but no account `DefaultSenderID` is set, so actual handset sender display must be verified in T0073.
- T0072 email readiness: SES sending is enabled but `ProductionAccessEnabled=false`; quota is 200 messages per 24 hours and 1 message per second; only email identity `love@wrlds.com` is verified; no domain identity, DKIM signing, or custom MAIL FROM setup exists.
- T0072 schedule safety: EventBridge rule `jumpyard-check-in-dev-booking-time-sms-schedule` invokes unified channels `sms` and `email` every 5 minutes with `confirmSend=false`, so scheduled runs remain planning-only.
- T0072 audit/monitoring: Aurora has safe planned/sent aggregate rows for SMS and email; session Lambda alarms are `OK`; channel-specific SMS/email alarms and runbooks are still open follow-ups.
- T0072 final validation: `npm run validate` and `git diff --check` passed on 2026-05-29; `git diff --check` reported CRLF line-ending notices only.
- T0071 AWS preflight: `aws sts get-caller-identity --profile wrlds-dev --region eu-north-1` returned account `376129878018`, and region is `eu-north-1`.
- T0071 Data API schedule: EventBridge rule `jumpyard-check-in-dev-data-api-daily-sync` is `ENABLED`, runs `cron(0 2 * * ? *)`, targets `jumpyard-check-in-dev-stack-data-sync`, and latest scheduled run `2026-05-28 -> 2026-05-29` succeeded.
- T0071 manual Data API sync: Lambda invoke for `2026-05-29 -> 2026-05-30` succeeded in about 31 seconds with 2 bookingitems, 2 tickets, 2 payments, 2 customers, 491 products, and 2 booking upserts.
- T0071 webhook/Aurora health: recent `Created` webhook events for bookings `5100835` and `5100836` are `processed`; both bookings are `Paid`, `fresh`, and have item/ticket/payment rows after sync.
- T0071 lookup freshness: `POST /v1/check-in/lookup` for `5100836` returned `found`, `ready`, source `jumpyard_cloud`, lookup path `aurora:booking_reference`, `freshnessStatus=fresh`, and `refreshedFromRoller=false`.
- T0071 alarm check: data-sync Lambda errors/throttles, webhook Lambda errors/throttles, and Roller API error alarms are `OK`.
- T0071 final validation: `npm run validate` and `git diff --check` passed on 2026-05-29; `git diff --check` reported CRLF line-ending notices only.
- T0070 integrated smoke: fresh paid Roller Playground booking `5100836` for `2026-05-29 10:30` looked up through JumpYard Cloud as `found/ready` from `aurora:booking_reference`, started session `jycs_mpqo1mlo_177e4e06`, marked handoff `JY2024` ready for staff, staff-authenticated, staff-confirm redeemed one ticket, and final staff detail showed session `redeemed`, handoff `completed`, and one local redeemed ticket.
- T0070 cleanup: earlier retry session `jycs_mpqo02zt_3e4329f9` for booking `5100835` was staff-redeemed as cleanup; the staff ready list then returned count `0`.
- T0070 observation: Roller `GET /bookings/5100836` returned HTTP `200` after redeem, but the booking-detail ticket object did not expose a clear redeemed status field. The authoritative Roller write was the successful staff-confirmed `POST /redemptions` path, and local Aurora staff detail reflected the redeemed state.
- T0070 final validation: `npm run validate` and `git diff --check` passed on 2026-05-29; `git diff --check` reported CRLF line-ending notices only.
- T0069 docs validation: `npm run validate` and `git diff --check` passed on 2026-05-29; `git diff --check` reported CRLF line-ending notices only.
- T0068 syntax/build/synth: `node --check infra/lambda/session/index.js`, `npm --prefix infra run build`, and `npm --prefix infra run synth:dev` passed on 2026-05-28.
- T0068 AWS preflight/deploy: account `376129878018` and region `eu-north-1` were verified. CDK diff showed only the new `send-due-messages` route, session Lambda code asset, and EventBridge booking-time payload/description changes; deploy passed and post-deploy diff showed no differences.
- T0068 unified route smoke: protected `POST /v1/check-in/session-links/send-due-messages` planning mode returned `booking_time_messages_planned` with separate `sms` and `email` channel results and masked destinations only.
- T0068 legacy route smoke: protected `POST /v1/check-in/session-links/send-due-sms` still returned `booking_time_sms_planned` with SMS-only channel results.
- T0068 scheduled-event smoke: direct Lambda invoke with EventBridge-shaped `scheduled_booking_time_messaging` payload returned planning results for both channels without public dev-token auth and with `confirmSend=false`.
- T0068 final validation: `npm run validate` and `git diff --check` passed on 2026-05-28; `git diff --check` reported CRLF line-ending notices only.
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
- Roller `POST /bookings/draft` has been executed through the protected T0030 discovery path, deployed T0031 JumpYard Cloud draft endpoint, and guarded T0032 POC harness against Playground and returned costs plus `paymentJwt`; T0050 confirms `/venues/me` payment settings are available, T0051 wires the approved payment package in the phone buy-entry flow, T0052 reuses it for linked add-product drafts, and T0054 confirmed public Swish payment could complete. Pabel confirmed on 2026-06-01 that the Playground payment integration issue is fixed; T0075 confirmed card smoke, and T0076 confirmed the full card-paid new-booking flow to ready-for-staff handoff.
- Existing-booking add-product linked-booking flow has been tested server-side in dev and wired in the phone UI, including the shared payment package path when JWT/config are present. T0079 removes the guest-facing duplicate contact form for add-products; JumpYard Cloud now resolves the original booking contact server-side and fails closed if that contact is missing.
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
- Does the public checkout now render and approve the Adyen Visa test card ending `1142` after Pabel's 2026-06-01 Playground payment fix?
