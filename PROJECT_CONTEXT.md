# Project Context

This file is the living project memory for JumpYard Next. Confirmed facts belong here. Unknowns remain `TBD`.

## Project Identity

- Project name: `JumpYard Next`
- Repository: `wrlds-creations/jumpyard-check-in`
- Current application: Existing JumpYard check-in app suite.
- Current phase: `Sprint 1`

## Sprint 1 Focus

Sprint 1 focuses on connecting the existing check-in app to Roller Playground through a server-side layer.

The target architecture is:

```text
check-in app -> JumpYard Cloud/server API -> Roller API
```

The current Sprint 1 API and data contract is documented in `JUMPYARD_CLOUD_CONTRACT.md`.

The first AWS foundation is defined as a CDK TypeScript app in `infra/`. T0006 deployed the confirmed dev config in `infra/config/dev.json`.

T0007 added Aurora schema migrations in `infra/migrations/` and a dev migration runner in `infra/scripts/run-migrations.ts`. The first migration created the `jumpyard` schema in dev Aurora.

T0008 adds a protected local Roller Playground seed tool for deterministic fake bookings. The tool is dry-run by default and can only write bookings when Playground config passes and an explicit write-confirmation environment variable is set.

T0009 replaced the dev `POST /v1/check-in/lookup` placeholder with a deployed server-side Roller Playground lookup Lambda. The endpoint reads Roller credentials from Secrets Manager, env/base URL from SSM Parameter Store, calls `GET /bookings/{identifier}`, enriches product names from `/products`, and returns a normalized JumpYard response.

T0010 wires the phone app booking lookup step to the deployed JumpYard Cloud lookup API. The phone app calls JumpYard Cloud only, maps `ready` responses to the existing booking summary with active check-in CTA, maps `payment_required` responses to the existing booking summary with `Obetald` and blocked check-in CTA, and stops the flow for wrong-date, non-redeemable, not-found, and service-failure states.

T0012 added a dev Aurora importer for Roller Data API `/data/bookingitems`. It upserts normalized booking rows into `jumpyard.roller_bookings`, booking item rows into `jumpyard.roller_booking_items`, and run state into `jumpyard.booking_seed_runs` without storing raw Roller payloads.

T0013 added a dev Aurora importer for Roller REST `/products`. It caches normalized product rows in `jumpyard.product_catalog_cache` and enriches existing `jumpyard.roller_booking_items` rows with product names and parent product names.

T0014 added a dev Aurora migration and importer for related Roller Data API sources: `/data/tickets`, `/data/bookingpayments`, and `/data/customers`. It upserts ticket ids into `jumpyard.roller_booking_tickets`, payment rows into `jumpyard.roller_booking_payments`, and structured customer contact fields into `jumpyard.guest_profiles`.

T0015 replaced the dev webhook placeholder with a safe Roller webhook intake Lambda. The dev endpoint acknowledges Roller-style deliveries quickly, deduplicates by event id or payload hash, stores normalized metadata in `jumpyard.roller_webhook_events`, writes safe event-log rows, and uses a dev-only webhook token stored in Secrets Manager until Roller production webhook verification is confirmed.

T0016 changed `POST /v1/check-in/lookup` to use Aurora first. The lookup Lambda now reads `jumpyard.roller_bookings`, `jumpyard.roller_booking_items`, and `jumpyard.roller_booking_tickets` for fresh local records, refreshes from Roller REST only when the local record is missing or unsafe, and upserts refreshed booking/item/ticket data back into Aurora.

T0017 changed the dev booking webhook Lambda from metadata-only intake to booking snapshot enrichment. A new accepted booking webhook event now fetches `GET /bookings/{identifier}` from Roller Playground, enriches product names best-effort from `/products`, upserts booking/item/ticket snapshots into Aurora, and marks `jumpyard.roller_webhook_events` as `processed` or `failed`.

T0018 registered the real Roller Playground booking webhook against the deployed dev endpoint. Roller webhook id `238` posts booking `Created`, `Updated`, and `Cancelled` events to JumpYard Cloud, includes tickets, sends the dev token in header `x-roller-apikey`, and real created-booking delivery has been confirmed through Aurora status `processed`.

T0019 polished the phone lookup path for webhook-created Aurora bookings. The phone app now carries JumpYard Cloud source/freshness metadata into the booking model for non-visible verification, uses stable test hooks for lookup testing, keeps internal source labels hidden from guests, and defaults lookup expected date to today's date in `Europe/Stockholm` when no explicit override is set.

T0020 adds the first safe server-owned redeem endpoint shape. The dev `POST /v1/check-in/redeem` Lambda resolves bookings and ticket ids from Aurora, validates Roller `POST /redemptions` constraints, writes safe check-in attempt/event audit rows, and returns a redeem plan while real Roller redemption writes remain disabled in deployed dev config.

T0021 enables controlled Roller Playground redemption execution for dev only. Confirmed redeem requests require a separate dev-only redeem token, refresh the booking from Roller REST immediately before the write, upsert the refreshed snapshot into Aurora, re-run eligibility, and only then call Roller `POST /redemptions`. The first controlled Playground redemption succeeded for dedicated booking `5032454`.

T0022 locks the phone/staff redeem handoff design. The phone app may start or resume a server-owned check-in session, but it must not hold redeem secrets or directly execute Roller redemption. Final ticket redemption remains a JumpYard Cloud action after staff/admin or another trusted server-side confirmation step, with the T0021 final Roller refresh still required before `POST /redemptions`.

T0023 implements the server-owned check-in session API skeleton in dev. JumpYard Cloud now has a `jumpyard.checkin_sessions` Aurora table, a deployed session Lambda, `POST /v1/check-in/sessions`, and `POST /v1/check-in/sessions/{checkinSessionId}/ready-for-staff`. The session API reads Aurora booking/ticket context, creates or resumes active sessions, blocks unsafe contexts, marks sessions ready for staff, and never calls Roller or redeems tickets.

T0024 wires the phone app booking summary CTA to `POST /v1/check-in/sessions`. A paid ready booking now creates or resumes a JumpYard Cloud session before the phone flow leaves the booking summary. The phone flow stores the returned session id/status in local flow state, keeps unpaid bookings blocked, and still does not call Roller or expose redeem credentials.

T0025 wires the phone app safety attestation completion to `POST /v1/check-in/sessions/{checkinSessionId}/ready-for-staff`. The phone flow stores the returned handoff status/code and shows the server-owned code on the final confirmation screen. This still does not call Roller or redeem tickets.

T0026 adds the first staff/admin handoff list and detail surface. JumpYard Cloud exposes read-only dev endpoints for ready-for-staff sessions, and the admin app reads those endpoints to show handoff code, session state, booking status, payment status, booking items, and selected tickets without exposing guest contact PII. This still does not call Roller or redeem tickets.

T0027 adds and deploys staff-confirmed redeem from a server-owned check-in session. JumpYard Cloud exposes a dev staff redeem route backed by the existing T0021 redeem Lambda: it requires a temporary dev redeem token until staff auth exists, resolves the session in Aurora, requires `ready_for_staff` state and completed safety, performs the final Roller REST refresh and eligibility re-check, calls Roller Playground `POST /redemptions`, marks local selected tickets redeemed, and marks the session `redeemed`/`completed`. The admin app can trigger this action from the selected handoff detail without storing the temporary code in source, browser env, localStorage, or sessionStorage.

T0028 improves the phone-to-staff QR handoff. The phone confirmation screen keeps the server-owned payload `JY_HANDOFF:<handoffCode>:<checkinSessionId>` as the QR value, renders it with the proven `qrcode` library, shows only the scannable QR plus short code to guests, and keeps the payload in test/debug attributes. The admin app can scan QR codes with the existing browser QR library, paste a full QR payload, type a short handoff code, and open the exact session when the payload includes `checkinSessionId`. This is a frontend-only polish ticket and does not change AWS, Roller, or redeem logic.

T0029 improves phone-side session resume behavior without changing AWS or Roller logic. After a successful paid lookup, the phone app asks JumpYard Cloud to start or resume the server-owned session. When JumpYard Cloud returns a resumed `ready_for_staff` session, the phone app opens the final QR confirmation screen directly from search instead of showing booking summary or restarting add-ons/safety. When the session is completed/redeemed or the session start call reports `already_redeemed`, the phone app shows an already checked-in state instead of treating the booking as a fresh check-in.

T0030 confirms the first Roller Playground draft-booking payment path without building payment UI. A guarded local discovery command creates no booking by default, can explicitly create a Playground-only draft booking, and confirmed that `POST /bookings/draft` returns cost fields plus a `paymentJwt`. Roller Payments official docs state that custom checkout payment uses Roller's payment library with the returned JWT, requires ROLLER authorization, a public HTTPS allowlisted domain for test and production, and an approved payment package. Test card details and exact venue enablement remain open before phone UI payment implementation.

T0031 implements and deploys the server-side JumpYard Cloud new-booking quote/draft endpoints. `POST /v1/bookings/quote` calls Roller Playground `POST /bookings/draft/costs` and returns normalized costs without creating a booking. `POST /v1/bookings/draft` requires `confirmDraft=true` and an idempotency key, calls Roller Playground `POST /bookings/draft`, returns the draft unique id, normalized costs, safe venue payment config from `GET /venues/me`, and the raw `paymentJwt` only in the API response for the future payment component. The booking Lambda writes only safe audit/idempotency rows and does not persist or log the raw `paymentJwt`.

T0032 adds a local payment-package POC harness against the deployed JumpYard Cloud quote/draft endpoints. It calls `POST /v1/bookings/quote` by default without creating a booking, can create one guarded Playground draft booking through `POST /v1/bookings/draft`, and reports only safe payment-session metadata. The actual in-PWA payment drop-in remains blocked until Roller provides/authorizes the approved payment package, a public HTTPS allowlisted test origin, and fake/test card details.

T0033 implements the phone create-booking pre-payment flow. The phone app now calls JumpYard Cloud `POST /v1/bookings/availability` to show the next three half-hour start times and capacity-limited jump products, calls `POST /v1/bookings/quote` for server-side cost confirmation, creates a guarded Roller Playground draft through `POST /v1/bookings/draft`, and ends in a payment-pending state. JumpYard Cloud persists safe draft metadata in `jumpyard.prepayment_booking_drafts`, including structured guest email/phone plus masked/hash fields, but never stores raw `paymentJwt` values.

T0034 implements add-product architecture build step 1 for existing bookings. JumpYard Cloud now exposes `POST /v1/bookings/{bookingReference}/add-products/quote` and `POST /v1/bookings/{bookingReference}/add-products`: quote validates the original booking and returns Roller draft costs without creating a booking, while draft creates a separate Roller Playground add-on draft booking, records it as `flow_type='add_product'` in `jumpyard.prepayment_booking_drafts`, and links it to the original booking through `jumpyard.booking_links`. The original Roller booking is never modified in this path, and raw `paymentJwt` values remain response-only.

T0035 wires the phone existing-booking add-ons step to the T0034 JumpYard Cloud add-product quote/draft endpoints. The phone flow can select mapped add-ons such as JumpSocks, Hänglås, Bryggkaffe, and SkyRider, collects the contact fields required by Roller draft booking, shows a server-side quote, creates a separate add-on draft, and stops at payment pending. Stock-only add-on drafts such as socks-only or padlock-only are valid linked add-on drafts, but they are not treated as redeemable check-in bookings.

T0036 adds a local Data API backfill orchestrator for the manual foundation before scheduling. `npm --prefix infra run import:data-api-backfill:dev` splits an explicit modified-date range into daily windows, runs bookingitems before related Data API sources for each day, and refreshes the product cache for item-name enrichment. It is dry-run by default. Apply mode requires `--apply` plus `ROLLER_DATA_BACKFILL_ALLOW_WRITE=I_UNDERSTAND_THIS_WRITES_DEV_AURORA_DATA_API_BACKFILL`, then sets the existing per-import write confirmations for the child import scripts.

The booking index ingestion contract is documented in `BOOKING_INDEX_INGESTION_CONTRACT.md`.

## Architecture Principles

- Roller is the source of truth for bookings.
- JumpYard Cloud/server API owns pilot operational state such as safety status, handoff code, and session status.
- The frontend must not call Roller directly in the real architecture.
- Roller credentials must stay server-side.
- Server-side integration should provide controlled logging, retries, error handling, and fallbacks.
- Roller integration must fail closed unless it is explicitly configured for Playground.
- Phone UI must not hold redeem tokens, Roller credentials, or final ticket-redemption authority.
- Staff/admin redeem in dev requires a manually entered temporary confirmation code until a real staff authentication model is implemented.

## Current Repository Shape

- `jumpyard-checkin-phone/`: guest-facing phone check-in web app.
- `jumpyard-checkin-kiosk/`: in-park kiosk check-in web app.
- `jumpyard-checkin-admin/`: staff PWA for redemption and handoff workflows.
- `infra/`: AWS CDK foundation for JumpYard Cloud, deployed to the confirmed dev AWS account.

## Delivery Workflow

- Work proceeds one ticket at a time.
- Each ticket should use a dedicated `codex/` branch.
- Local commits are made only when explicitly requested and belong to the current ticket branch.
- `main` is updated through a review/merge step, not by direct commits or direct pushes.
- Ticket commits should include only files that belong to the current ticket.

## Known Stack

- TypeScript
- Next.js
- React
- Tailwind CSS
- npm per app directory
- AWS CDK TypeScript for JumpYard Cloud infrastructure

## Current Data Ownership Model

- Booking data: Roller.
- Product catalog, availability, payment state, booking status, and ticket redemption state: Roller.
- Safety status, handoff code, staff handoff status, idempotency, and internal audit trail: JumpYard Cloud/server API.
- Short-lived normalized booking snapshots may be stored by JumpYard Cloud for UX, audit, and retry support, but Roller remains the source of truth.
- JumpYard Cloud should store Roller ids and minimal operational data, not full raw Roller payloads or unnecessary PII.
- Product catalog names/types may be cached because they are needed for display and normalization and are not guest PII.
- Guest email and phone may be stored as explicit structured contact fields for check-in/SMS readiness; free-text names, notes, addresses, and booking comments remain deferred.
- Check-in session state, staff handoff state, safety status, final redeem confirmation, idempotency, and audit are JumpYard Cloud-owned operational data.
- Pre-payment draft state is JumpYard Cloud operational state. It may store selected item summaries, totals, status, Roller draft ids, and structured guest email/phone with masked/hash fields, but raw payment JWTs remain response-only and must not be persisted.
- Existing-booking add-product drafts are JumpYard Cloud operational state linked to the original booking. Stock-only add-on drafts are handled as payment-pending add-ons and should not create guest check-in/redeem expectations by themselves.

## Phone-First Flow Targets

- `F1`: create a new booking through JumpYard Cloud using Roller draft/cost/payment patterns.
- `F2`: create a booking and check in by resolving Roller ticket ids and redeeming tickets server-side.
- `F3`: check in an existing booking and add products by creating a separate linked add-on booking, then linking original booking and add-on booking inside JumpYard Cloud.

For `F1`, the preferred target is to keep the guest inside the JumpYard PWA for booking creation and Playground/test payment if Roller supports a safe in-app payment flow through draft booking `paymentJwt` or an approved frontend payment component. T0033 implements the pre-payment booking flow while the payment package is externally blocked: product/time selection, server-side availability/capacity check where required, server-side quote, guarded draft creation, and a clear payment-pending state. Payment package/drop-in integration should wait until Roller/Pabel provides the missing prerequisites. Hosted payment links remain a fallback, not the preferred pilot UX.

## Phone/Staff Redeem Handoff

The pilot check-in completion path should separate guest phone progress from final Roller redemption:

1. Phone lookup reads a normalized booking from JumpYard Cloud.
2. Phone starts or resumes a JumpYard Cloud check-in session for that booking.
3. JumpYard Cloud owns the session state, safety gate status, selected ticket scope, handoff code/status, idempotency, and audit rows.
4. Staff/admin or another trusted server-side confirmation step authorizes final redeem.
5. JumpYard Cloud refreshes the booking from Roller REST, re-checks eligibility, then calls `POST /redemptions`.
6. Aurora stores the local attempt/result state, but Roller remains the source of truth for consumed ticket state.

The T0021 dev redeem token is only for controlled backend testing. It must never be shipped through phone app environment variables, browser storage, source code, or public network calls.

## Booking Index Strategy

- JumpYard Cloud should use an initial Roller Data API backfill to create the first Aurora booking index baseline.
- JumpYard Cloud should then run a daily Roller Data API modified-date sync to upsert new and changed records.
- Roller booking webhooks should update same-day booking changes after the latest sync.
- Live Roller REST lookup should still confirm check-in-critical state before writes such as redemption.
- The booking index is an operational cache/index, not the source of truth.
- Playground test bookings should be created by a protected internal seed tool or admin-only action, not by a public demo button in the phone check-in flow.
- Data API `startDate`/`endDate` windows are based on record modified date, while returned `bookingDate` is used for local visit-date filtering.
- Data API sync should use Get bookings, Get tickets, Get payments, and Get customers as the expected source set.
- Get attendance is for actual arrival/redeem reconciliation, not for seeding expected guests.
- Webhook payloads may be sufficient when configured with booking detail and payments, but JumpYard Cloud should enrich from live booking detail when data is incomplete, suspicious, stale, or check-in-critical.
- T0036 is the manual/local backfill foundation. T0037 should schedule the same modified-date sync pattern in dev AWS instead of adding another import model.

## Confirmed Implementation Roadmap

This table is the source-of-truth ticket backlog for upcoming implementation. Keep it updated whenever the next-ticket order changes so future Codex sessions do not rely on chat history.

After T0007, the next tickets should proceed in this order:

| Ticket | Goal | Why This Order |
|---|---|---|
| `T0008 Playground test booking seed tool` | Create deterministic Roller Playground test bookings through protected server-side tooling. | Reliable test scenarios are needed before validating lookup and check-in flows. |
| `T0009 Booking lookup endpoint` | Implement `POST /v1/check-in/lookup` against Roller Playground and local index shape. | First real JumpYard Cloud API behavior for the phone flow. |
| `T0010 Phone UI lookup wiring` | Connect the phone check-in lookup step to JumpYard Cloud `POST /v1/check-in/lookup`. | Completed locally; lets the first mobile flow step use the deployed server-side Roller lookup. |
| `T0011 Data API access smoke` | Verify Roller Data API access and lock modified-date sync strategy. | Prevents building Aurora ingestion against the wrong Data API mental model. |
| `T0012 Data API bookingitems import` | Upsert `/data/bookingitems` records into Aurora. | Completed locally against dev; starts the local booking index with confirmed Data API payload shape. |
| `T0013 Product catalog cache` | Cache Roller products and enrich booking item product names in Aurora. | Lets the booking index show human-readable products instead of only Roller product IDs. |
| `T0014 Related Data API sources` | Add tickets, payments, and customer/contact data once endpoint docs/access are confirmed. | Completed locally against dev Aurora; completes payment/contact/ticket context for lookup, SMS, and redemption. |
| `T0015 Booking webhook intake` | Implement safe webhook intake and idempotency. | Completed locally and deployed to dev; provides the same-day change signal intake before enrichment/snapshot updates. |
| `T0016 Aurora-first lookup` | Use Aurora for lookup display, then refresh from Roller when missing or unsafe. | Completed locally and deployed to dev; lets phone lookup stop depending on a live Roller read for every normal display lookup. |
| `T0017 Booking webhook enrichment` | Refresh Roller booking detail from webhook events and update Aurora snapshots. | Completed locally and deployed to dev; turns same-day webhook signals into fresh booking snapshots once Roller delivery is registered. |
| `T0018 Roller Playground webhook registration` | Register the Playground booking webhook against the dev endpoint and confirm real delivery headers/body. | Completed locally and deployed to dev; real Roller deliveries now update Aurora through webhook enrichment. |
| `T0019 Phone lookup display/source polish` | Decide whether to expose source/freshness/debug status in phone/admin UX. | Completed locally; source/freshness metadata is available for verification but remains hidden from guests by default. |
| `T0020 Redeem spike/server endpoint` | Add a safe server-owned redeem planning endpoint and keep Roller redemption writes disabled until controlled execution is scoped. | Completed locally and deployed to dev; next step is controlled redeem execution with auth/session and final refresh rules. |
| `T0021 Controlled Playground redeem execution` | Protect confirmed dev redemption with a separate token, refresh live Roller state, then execute one controlled Playground redeem. | First real ticket-level check-in write, still dev-only and not wired to phone UI. |
| `T0022 Phone/staff redeem handoff design` | Lock how the phone flow hands a ready booking to staff/server-owned final redeem. | Prevents exposing the T0021 dev token or future production redeem authority to the frontend. |
| `T0023 Check-in session API skeleton` | Implement the server-owned check-in session/handoff endpoints without redeeming tickets from the phone UI. | Gives the phone flow a safe next step after lookup while keeping final Roller redemption behind staff/server confirmation. |
| `T0024 Phone start-check-in session wiring` | Wire the phone app start-check-in CTA to `POST /v1/check-in/sessions`. | Completed; lets the guest flow create/resume a server-owned session while still keeping final Roller redemption out of the phone UI. |
| `T0025 Phone ready-for-staff handoff wiring` | Call `ready-for-staff` from the phone flow after the required guest-side steps are complete. | Completed locally; the guest flow now ends with a server-owned staff handoff code and still does not redeem tickets. |
| `T0026 Staff/admin handoff list/detail` | Show sessions waiting for staff and let staff inspect booking/session state. | Completed locally; gives staff a read-only surface for the server-owned handoff before final redeem. |
| `T0027 Staff-confirmed redeem from session` | Redeem selected tickets from the server-owned session after staff confirmation and final Roller refresh. | Completed and deployed to dev; completes the first end-to-end existing-booking check-in write path in dev. |
| `T0028 QR/handoff lookup polish` | Improve how staff finds handoff sessions by QR payload or short code. | Completed locally; phone QR uses the server-owned handoff payload, and admin can scan/paste/open the exact session. |
| `T0029 Phone session resume` | If lookup finds an existing active session, resume the correct phone state instead of restarting the whole flow. | Completed locally; paid lookup now starts/resumes the session, `ready_for_staff` resumes directly from search to QR, completed/redeemed resumes to an already checked-in state, and guest-in-progress continues normally. |
| `T0030 New booking/payment discovery spike` | Confirm the exact Roller Playground path for draft booking, payment token, test/fake card, and whether payment can stay inside the PWA without a hosted payment-link detour. | Completed locally; draft booking and `paymentJwt` are confirmed, while Roller payment-library authorization, domain allowlisting, package download, and test card details remain prerequisites for full in-app payment. |
| `T0031 Server-side booking quote/draft` | Add JumpYard Cloud endpoints for new-booking quote and draft creation against Roller Playground, without phone UI payment yet. | Completed and deployed to dev; quote returns normalized costs without creating a booking, draft returns a Roller draft id plus payment-session data behind idempotency and confirmation. |
| `T0032 Payment package proof-of-concept` | Verify the Roller payment-library package, fake/test card flow, and public HTTPS allowlisting path against the T0031 draft response. | Completed locally as a safe POC harness; quote/draft can be exercised through JumpYard Cloud, but full payment execution remains blocked by external Roller prerequisites. |
| `T0033 Phone create-booking pre-payment flow` | Wire the phone app to product/time selection, server-side availability/capacity check where needed, quote, guarded draft creation, and a payment-pending state. | Completed and deployed to dev; phone buy-entry now reaches a Roller Playground draft and stores safe pre-payment draft state in Aurora without rendering payment UI. |
| `T0034 Existing-booking add-product draft step 1` | Add server-side quote and separate add-on draft creation for existing bookings, linked in JumpYard Cloud. | Completed and deployed to dev; no phone UI wiring or payment execution yet. |
| `T0035 Phone add-product UI wiring` | Wire existing-booking add-products in the phone flow to the T0034 quote/draft endpoints. | Completed locally; lets a guest add mapped add-ons to an existing check-in session, create a separate linked Playground draft, and stop at payment pending. |
| `T0036 Data API backfill and sync foundation` | Build a fuller Data API import path for bookingitems, tickets, payments, and customers/contact data so Aurora can be filled consistently from Roller exports. | Completed locally; gives JumpYard Cloud a repeatable booking baseline before SMS links and production-like operating workflows. |
| `T0037 Scheduled daily Data API sync` | Move the T0036 import path into a scheduled dev AWS sync that runs a daily modified-date window and records run status. | Keeps Aurora reconciled even if webhooks are delayed, disabled, or out of order. |
| `T0038 SMS token/session link foundation` | Add secure JumpYard Cloud links that can resume or start a booking check-in session without exposing raw booking numbers as authority. | Prepares the phone flow for SMS delivery while keeping session ownership server-side. |
| `T0039 SMS sending` | Integrate the selected SMS provider and send check-in links from server-owned booking/session state. | Lets JumpYard invite guests into the phone check-in flow before arrival or from staff/admin workflows. |
| `T0040 Roller payment package/drop-in integration` | Add the approved Roller payment package, allowlisted public HTTPS origin, and fake/test card path when Roller/Pabel provides the missing prerequisites. | Completes in-PWA payment for both new-booking and add-product drafts once external blockers are removed. |
| `T0041 Staff auth replacement for temporary dev code` | Replace the manual dev redeem code with a real staff/admin auth model. | Needed before production-like staff redeem; can follow data/SMS work unless pilot security timing forces it earlier. |

Deterministic Playground test bookings means fixed, repeatable test scenarios rather than random data. The seed tool should create known cases such as paid-ready, pending-payment, wrong-date, already-redeemed, SkyRider/add-on, and stock/add-on routing scenarios. It must be protected, server-side, Playground-only, and never part of the public phone UI.

T0008 uses `npm run roller:seed:playground` as the local seed command. It reads Roller products first, maps seed scenarios to child/variation product IDs, and defaults to dry-run. Writes require `--apply` plus `ROLLER_SEED_ALLOW_WRITE=I_UNDERSTAND_THIS_WRITES_PLAYGROUND_BOOKINGS`.

## AWS Dev Target

- AWS account id: `376129878018`
- AWS profile/login method: `wrlds-dev` profile, matching the Bluetooth Hub dev deploy workflow.
- AWS region: `eu-north-1`
- Environment: `dev`
- Resource prefix: `jumpyard-check-in-dev`
- Stack: `jumpyard-check-in-dev-stack`
- API endpoint: `https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com`
- Aurora PostgreSQL engine: `aurora-postgresql 16.13`
- Aurora database: `jumpyard_cloud`
- Aurora schema: `jumpyard`
- Aurora migration command: `npm --prefix infra run migrate:dev`
- `WRLDS:Client`: `JumpYard`
- `WRLDS:Project`: `jumpyard-check-in`
- `WRLDS:Owner`: `love`
- `WRLDS:Repository`: `wrlds-creations/jumpyard-check-in`
- `WRLDS:ManagedBy`: `cdk`
- `WRLDS:DataClassification`: `internal`
- `WRLDS:Exportable`: `true`
- `WRLDS:CostCenter`: `unassigned`
- `WRLDS:CreatedBy`: `love`

## Roller Playground Configuration

- `ROLLER_ENV` must be `playground`.
- `ROLLER_BASE_URL` must clearly point to a Playground environment. ROLLER's documented Playground base URL is `https://api.play.roller.app`.
- Production/live-looking Roller URLs must be rejected before any client is created.
- `ROLLER_CLIENT_ID` and `ROLLER_CLIENT_SECRET` are optional for basic environment validation during T0001.
- Roller secrets must never be logged or committed.

## Roller Smoke Test

- `npm run roller:smoke` loads local `.env` values and reuses the Playground environment guard.
- The smoke test obtains a short-lived OAuth token through the server-side Roller client and then makes one read-only smoke request.
- The default read endpoint path is `/products`; override with `ROLLER_SMOKE_PATH` only if Roller confirms a different harmless read path.
- The script reports status and response shape only; it does not print credentials, access tokens, or full Roller response payloads.

## Confirmed Roller Playground Facts

- `GET /products` returned 96 products in Playground on 2026-05-19.
- `GET /products` returned 96 top-level products and 491 flattened products/variations in Playground on 2026-05-20.
- T0008 dry-run resolved seed payload product IDs to child/variation IDs, including `1765836` for `Entré 120 min`, `1765445` for `JumpSocks`, `1765443` for `SkyRider`, and `1765441` for `Hänglås`.
- T0008 created six deterministic Playground bookings on 2026-05-20:
  - `5032210`: paid-ready, status `Paid`, amount owing `0`, total `610`.
  - `5032211`: pending-payment, status `PendingPayment`, amount owing `260`.
  - `5032212`: wrong-date, status `PendingPayment`, amount owing `260`.
  - `5032213`: SkyRider/add-on, status `PendingPayment`, amount owing `300`.
  - `5032214`: original booking for linked add-on flow, status `PendingPayment`, amount owing `260`.
  - `5032215`: separate linked add-on booking, status `PendingPayment`, amount owing `92`.
- `GET /bookings/5001370` returned HTTP 200 in Playground and accepted the booking reference as the path id.
- `GET /bookings?date=2026-05-19` returned one booking in Playground on 2026-05-19.
- Known Playground booking for lookup testing: booking reference `5001370`, unique id `dbba266d-0951-4706-9adf-6c9d05edffbf`.
- Known Playground ticket from that booking: `5001370-21265504`.
- Dev `POST /v1/check-in/lookup` was deployed in T0009 and returned:
  - `5032210`: `found`, `ready`, `canCheckIn=true`.
  - `5032211`: `found`, `payment_required`, `canCheckIn=false`.
  - `5032212` with expected date `2026-05-21`: `found`, `wrong_date`, `canCheckIn=false`.
  - `999999999`: `not_found`, HTTP `404`.
- T0010 phone lookup uses public, non-secret config:
  - `NEXT_PUBLIC_JUMPYARD_CLOUD_API_BASE_URL`
  - `NEXT_PUBLIC_JUMPYARD_LOOKUP_EXPECTED_DATE`
- T0019 changed the phone lookup default expected date to today's date in `Europe/Stockholm` when no explicit `NEXT_PUBLIC_JUMPYARD_LOOKUP_EXPECTED_DATE` override is set.
- T0011 confirmed current Playground credentials can access Roller Data API `GET /data/bookingitems`.
- T0011 `npm run roller:data:smoke` for modified-date window `2026-05-20 -> 2026-05-21` returned:
  - response shape: `currentPage`, `totalPages`, `totalItems`, `itemsPerPage`, `items`
  - records returned: `9`
  - seed booking references found: `5032210`, `5032211`, `5032212`, `5032213`, `5032214`, `5032215`
  - returned booking dates: `2026-05-21`, `2026-05-22`
  - modified date range: `2026-05-20T09:05:03Z -> 2026-05-20T09:05:05Z`
- T0012 imported the same modified-date window into dev Aurora:
  - `jumpyard.roller_bookings`: 6 seed booking rows matched
  - `jumpyard.roller_booking_items`: 9 seed booking item rows matched
  - latest `jumpyard.booking_seed_runs` status: `succeeded`
  - imported booking references: `5032210`, `5032211`, `5032212`, `5032213`, `5032214`, `5032215`
- T0013 imported Roller product catalog data into dev Aurora:
  - `jumpyard.product_catalog_cache`: 491 product/variation rows matched
  - `jumpyard.roller_booking_items`: 9 seed booking item rows enriched with product names
  - sample enriched product names: `Biljetter (260 kr)`, `Antal`, `SkyRider 1 åk`, `Hänglås`, `Islatte`
- T0014 imported related Data API sources into dev Aurora:
  - `jumpyard.roller_booking_tickets`: 6 ticket rows matched
  - `jumpyard.roller_booking_payments`: 0 payment rows matched for the seed window
  - `jumpyard.guest_profiles`: 6 customer contact rows matched with structured email/phone plus masked/hash fields
  - `/data/bookingpayments` returning 0 rows for this seed window is a valid empty result, not a failure
- T0015 deployed dev webhook intake:
  - endpoint: `POST https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com/v1/roller/webhooks/bookings`
  - dev token secret: `/jumpyard-check-in-dev/webhooks/dev-token`
  - unauthorized requests return HTTP `200` with `ignored_unauthorized` and are not persisted
  - authorized first delivery returns HTTP `200` with `accepted`
  - authorized duplicate delivery returns HTTP `200` with `duplicate`
  - Aurora row `t0015-smoke-booking-created-5032210` exists in `jumpyard.roller_webhook_events` with status `received`
- T0016 deployed Aurora-first lookup:
  - `5032210`: `found`, `ready`, source `jumpyard_cloud`, no Roller refresh
  - `5032211`: `found`, `payment_required`, source `jumpyard_cloud`, no Roller refresh
  - `5032212`: `found`, `wrong_date`, source `jumpyard_cloud`, no Roller refresh
  - `5001370`: live-refreshed once from Roller, upserted into Aurora, and now reads from `jumpyard_cloud`
  - `999999999`: `not_found`, HTTP `404`
  - invalid JSON: `invalid_json`, HTTP `400`
- T0017 deployed webhook enrichment:
  - event `t0017-deployed-webhook-enrich-5032210-20260521095241`: HTTP `200`, status `accepted`, enrichment `processed`
  - refreshed booking `5032210` from Roller REST into Aurora with 2 items and 4 tickets
  - matching `jumpyard.roller_webhook_events` row status is `processed`
- T0018 registered the real Roller Playground booking webhook:
  - Roller webhook id `238`
  - endpoint `https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com/v1/roller/webhooks/bookings`
  - subscribed events `created`, `updated`, and `cancelled`
  - include `tickets=true`
  - real Roller delivery uses header `x-roller-apikey`
  - real created-booking event for booking `5032443` reached AWS, enriched through Roller REST, and wrote `status=processed` in `jumpyard.roller_webhook_events`
- T0019 verified phone lookup for manually created Playground booking `5032444`:
  - dev API returned `found`, `payment_required`, source `jumpyard_cloud`, and freshness `fresh`
  - browser flow opened the booking summary, showed `Obetald`, kept `Betalning krävs` disabled, and confirmed metadata `sourceSystem=jumpyard_cloud`, `freshness=fresh`

T0020 confirmed Roller `POST /redemptions` request rules:

- request body uses `tickets[]`
- each ticket requires `ticketId`
- `redemptionDate` is optional
- `redemptionDevice` identifies the device name
- one call accepts at most 10 unique ticket ids

T0021 confirmed controlled Roller Playground redemption behavior:

- dev token secret: `/jumpyard-check-in-dev/redeem/dev-token`
- `confirmRedeem=true` without token returns HTTP `403` before Roller writes
- safe planning still works without token when `confirmRedeem=false`
- dedicated paid Playground booking `5032454` was created for the controlled redeem smoke
- dedicated ticket `5032454-21397335` redeemed successfully through Roller Playground
- Aurora marks ticket `5032454-21397335` with `redeem_status_last_seen='redeemed'`
- reusing the same booking/ticket is blocked locally as `already_redeemed`
- a non-existent `redemptionDevice` causes Roller HTTP `409` with `Redemption device not found`, so JumpYard Cloud omits `redemptionDevice` unless a real Roller device name is configured

T0022 locks the handoff boundary:

- the phone app may start or resume a JumpYard Cloud check-in session
- the phone app must not call the confirmed redeem path with a secret token
- final redeem must be staff/admin-confirmed or server-trusted
- the final redeem path still needs the T0021 live Roller refresh and eligibility re-check before writing to Roller

T0023 confirmed server-side session behavior:

- dev endpoint `POST /v1/check-in/sessions` creates or resumes a session from Aurora booking/ticket snapshots
- dev endpoint `POST /v1/check-in/sessions/{checkinSessionId}/ready-for-staff` marks the session ready for staff and creates a handoff code
- booking `5032210` created session `jycs_mpfe3dum_7dc29b1b` and was later resumed
- booking `5032211` was blocked as `payment_required`
- session `jycs_mpfe3dum_7dc29b1b` was marked `ready_for_staff` with handoff code `JY6085`
- no Roller API calls or Roller writes happen in the session API

T0024 confirmed phone session-start behavior:

- phone endpoint client calls `POST /v1/check-in/sessions`
- paid booking `5032210` resumes session `jycs_mpfe3dum_7dc29b1b` before leaving booking summary
- phone flow stores `checkinSessionId` and session status in flow state
- unpaid booking `5032211` remains blocked on the booking summary with disabled `Betalning krävs`
- no Roller API calls, Roller secrets, or redeem tokens were added to phone code

T0025 confirmed phone ready-for-staff behavior:

- safety attestation completion calls `POST /v1/check-in/sessions/{checkinSessionId}/ready-for-staff`
- phone flow stores `handoffStatus` and `handoffCode` in flow state
- booking `5032210` reached `APP_CONFIRM` with session `jycs_mpfe3dum_7dc29b1b`
- final screen showed handoff code `JY6085` and QR payload `JY_HANDOFF:JY6085:jycs_mpfe3dum_7dc29b1b`
- no Roller API calls, Roller secrets, or redeem tokens were added to phone code

T0026 confirmed staff handoff list/detail behavior:

- dev endpoint `GET /v1/staff/check-in/sessions` lists active sessions with `handoff_status='ready_for_staff'`
- dev endpoint `GET /v1/staff/check-in/sessions/{checkinSessionId}` returns booking summary, booking items, tickets, and selected-ticket markers
- admin app reads JumpYard Cloud directly and shows handoff `JY6085` for booking `5032210`
- staff handoff list/detail returns no guest email or phone
- no Roller API calls, Roller writes, or redeem actions happen in staff list/detail

T0027 confirmed staff-confirmed redeem behavior:

- dev endpoint `POST /v1/staff/check-in/sessions/{checkinSessionId}/redeem` uses the existing redeem Lambda and T0021 final refresh path
- the endpoint requires the dev redeem token until staff auth is implemented
- a ready-for-staff session must have `safety_status='completed'`
- successful redeem marks selected local tickets as `redeemed`
- successful redeem marks the check-in session `status='redeemed'` and `handoff_status='completed'`
- admin app sends the temporary code only in the redeem request and does not persist it in browser storage or source

T0028 confirmed QR/handoff lookup behavior:

- phone QR payload remains `JY_HANDOFF:<handoffCode>:<checkinSessionId>`
- phone confirmation shows the QR plus short handoff code and keeps the full payload in DOM test/debug attributes
- admin app can parse `JY_HANDOFF:<handoffCode>:<checkinSessionId>`, `JY_SESSION:<checkinSessionId>`, raw `checkinSessionId`, and short `JY####` handoff codes
- full QR payload opens the exact session detail by `checkinSessionId`
- short handoff code selects a matching active waiting-list session
- browser camera scanning uses the existing admin `@zxing/browser` dependency and stops after success or close

T0029 confirmed phone session resume behavior:

- successful paid lookup starts/resumes the JumpYard Cloud session so active resume states can route before the booking summary
- `ready_for_staff` session resumes route directly to `APP_CONFIRM` from search
- completed/redeemed sessions or `already_redeemed` start responses route to `APP_PRESENT` with an already checked-in state
- guest-in-progress sessions still route through the normal add-ons/safety flow
- no Roller calls, redeem tokens, admin code, backend code, or AWS resources changed

T0030 confirmed Roller draft/payment discovery facts:

- `npm run roller:payment:discover` loads local `.env`, reuses the Playground guard, reads Roller products, selects a jump/session variation, and defaults to dry-run without creating a booking
- `npm run roller:payment:discover:apply-draft` fails closed without `ROLLER_PAYMENT_DISCOVERY_ALLOW_WRITE=I_UNDERSTAND_THIS_WRITES_PLAYGROUND_DRAFT_BOOKING`
- guarded direct apply created Playground draft booking unique id `bcb88005-ae64-4617-ba7a-b02b095a86c2` for `2026-05-22` at `10:00`
- the draft response returned HTTP `201`, total `260`, amount owing `260`, and a present three-part `paymentJwt`
- the script prints only safe response shape and never prints secrets, access tokens, or the raw payment JWT
- Roller Payments via API docs confirm the intended custom checkout flow: call `POST /bookings/draft`, pass the returned JWT to Roller's payment library, receive Adyen drop-in payment status, and use booking-created webhook as a success signal
- Roller Payments docs also state that the integration requires ROLLER approval, a public HTTPS allowlisted domain for test and production, and an approved payment package; test/fake card details are not confirmed in the available docs

## Non-Goals For Current Ticket

- Do not use Aurora lookup data as final authority before future write-critical actions such as redeem or add-on booking creation.
- Do not implement the scheduled daily AWS sync; T0036 is a local/manual backfill foundation.
- Do not rely on automatic Roller webhook delivery in production until production auth, IP allowlisting, and environment registration are explicitly scoped.
- Do not write to Roller Live/production.
- Do not create staging or production AWS resources.
- Do not add phone payment UI, production payment logic, or real payment processing.
- Do not wire phone UI to redeem.
- Do not expose the T0021 dev redeem token to frontend code or browser config.
- Do not add a public demo button to the phone check-in UI.

## Open Questions

| Question | Why It Matters | Owner | Status |
|---|---|---|---|
| Which Roller Playground write scopes are enabled for create booking, draft booking, payment, and redemption? | Needed before booking/payment work. Draft booking creation is confirmed through T0030/T0031/T0032/T0033/T0034; full payment processing still needs Roller payment-library enablement. | `T0040` | `Partially answered` |
| Does Roller Playground support an in-app payment flow from draft booking `paymentJwt`, including documented test/fake card numbers and any domain allow-listing requirements? | Determines whether F1 can complete payment inside the JumpYard PWA or must use a hosted fallback. Roller docs support the in-app library path, and T0032 can check the required inputs, but test cards, package access, account authorization, and domain allowlisting remain open. | `T0040` | `Blocked externally` |
| What is the best field or internal model for linking an original booking to a separate add-on booking? | T0034 selected `jumpyard.booking_links` with `add_on_group_id` plus add-product draft metadata in `jumpyard.prepayment_booking_drafts`. | `T0034` | `Answered for step 1` |
| Which products need reconfiguration from stock/add-on to ticket/session products for API-driven redemption? | Stock/add-on products are excluded from Roller ticket redemption webhook/API flow. | `TBD` | `Open` |
| Which Roller Data API endpoints and date ranges should power tickets, payments, and customers ingestion? | Required after bookingitems ingestion. | `T0036` | `Open` |
| Which webhook event id, signature, and payload fields does Roller provide in production? Playground delivery is confirmed with `x-roller-apikey`. | Required before exposing webhook intake beyond dev testing. | `TBD` | `Open` |
