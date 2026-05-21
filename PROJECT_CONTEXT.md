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

The booking index ingestion contract is documented in `BOOKING_INDEX_INGESTION_CONTRACT.md`.

## Architecture Principles

- Roller is the source of truth for bookings.
- JumpYard Cloud/server API owns pilot operational state such as safety status, handoff code, and session status.
- The frontend must not call Roller directly in the real architecture.
- Roller credentials must stay server-side.
- Server-side integration should provide controlled logging, retries, error handling, and fallbacks.
- Roller integration must fail closed unless it is explicitly configured for Playground.

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

## Phone-First Flow Targets

- `F1`: create a new booking through JumpYard Cloud using Roller draft/cost/payment patterns.
- `F2`: create a booking and check in by resolving Roller ticket ids and redeeming tickets server-side.
- `F3`: check in an existing booking and add products by creating a separate linked add-on booking, then linking original booking and add-on booking inside JumpYard Cloud.

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

## Confirmed Implementation Roadmap

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
| `T0017 Phone lookup display from Aurora` | Let the phone app consume the Aurora-first lookup response. | Moves the mobile first step toward the real booking-index architecture. |

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
- T0010 local demo default expected date is `2026-05-21` to match deterministic Playground seed bookings.
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

## Non-Goals For Current Ticket

- Do not use Aurora lookup data as final authority before future write-critical actions such as redeem or add-on booking creation.
- Do not implement daily seed ingestion.
- Do not rely on webhook events for booking display until enrichment/snapshot updates are implemented.
- Do not write to Roller Live/production.
- Do not redeem Roller tickets.
- Do not create staging or production AWS resources.
- Do not add payment logic.
- Do not add redeem logic.
- Do not add a public demo button to the phone check-in UI.

## Open Questions

| Question | Why It Matters | Owner | Status |
|---|---|---|---|
| Which Roller Playground write scopes are enabled for create booking, draft booking, payment, and redemption? | Needed before T0004+ write spikes. | `TBD` | `Open` |
| What is the best field or internal model for linking an original booking to a separate add-on booking? | Required for add-product implementation. | `TBD` | `Open` |
| Which products need reconfiguration from stock/add-on to ticket/session products for API-driven redemption? | Stock/add-on products are excluded from Roller ticket redemption webhook/API flow. | `TBD` | `Open` |
| Which Roller Data API endpoints and date ranges should power tickets, payments, and customers ingestion? | Required after bookingitems ingestion. | `TBD` | `Open` |
| Which webhook event id, signature, and payload fields does Roller provide in Playground and production? | Required before exposing webhook intake beyond local/dev testing. | `TBD` | `Open` |
