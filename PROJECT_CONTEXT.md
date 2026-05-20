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

## Phone-First Flow Targets

- `F1`: create a new booking through JumpYard Cloud using Roller draft/cost/payment patterns.
- `F2`: create a booking and check in by resolving Roller ticket ids and redeeming tickets server-side.
- `F3`: check in an existing booking and add products by creating a separate linked add-on booking, then linking original booking and add-on booking inside JumpYard Cloud.

## Booking Index Strategy

- JumpYard Cloud should use a daily Roller Data API seed each morning to preload the operational booking index.
- Roller booking webhooks should update same-day booking changes after the seed.
- Live Roller REST lookup should still confirm check-in-critical state before writes such as redemption.
- The booking index is an operational cache/index, not the source of truth.
- Playground test bookings should be created by a protected internal seed tool or admin-only action, not by a public demo button in the phone check-in flow.
- Daily seed should use Get bookings, Get tickets, Get payments, and Get customers as the expected source set.
- Get attendance is for actual arrival/redeem reconciliation, not for seeding expected guests.
- Webhook payloads may be sufficient when configured with booking detail and payments, but JumpYard Cloud should enrich from live booking detail when data is incomplete, suspicious, stale, or check-in-critical.

## Confirmed Implementation Roadmap

After T0007, the next tickets should proceed in this order:

| Ticket | Goal | Why This Order |
|---|---|---|
| `T0008 Playground test booking seed tool` | Create deterministic Roller Playground test bookings through protected server-side tooling. | Reliable test scenarios are needed before validating lookup and check-in flows. |
| `T0009 Booking lookup endpoint` | Implement `POST /v1/check-in/lookup` against Roller Playground and local index shape. | First real JumpYard Cloud API behavior for the phone flow. |
| `T0010 Daily seed job` | Implement the Roller Data API seed into Aurora. | Fills the booking index automatically for operating days. |
| `T0011 Booking webhook intake` | Implement webhook intake, idempotency, and enrichment. | Keeps the booking index fresh after the morning seed. |

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

## Non-Goals For Current Ticket

- Do not implement API business logic beyond the local T0008 seed tool.
- Do not write to Roller Live/production.
- Do not redeem Roller tickets.
- Do not create staging or production AWS resources.
- Do not modify app functionality.
- Do not add payment logic.
- Do not add redeem logic.
- Do not deploy AWS infrastructure outside the approved T0006 dev foundation.
- Do not add a public demo button to the phone check-in UI.

## Open Questions

| Question | Why It Matters | Owner | Status |
|---|---|---|---|
| Which Roller Playground write scopes are enabled for create booking, draft booking, payment, and redemption? | Needed before T0004+ write spikes. | `TBD` | `Open` |
| What is the best field or internal model for linking an original booking to a separate add-on booking? | Required for add-product implementation. | `TBD` | `Open` |
| Which products need reconfiguration from stock/add-on to ticket/session products for API-driven redemption? | Stock/add-on products are excluded from Roller ticket redemption webhook/API flow. | `TBD` | `Open` |
| Which Roller Data API endpoint and date range should power the daily morning booking seed? | Required before booking index ingestion implementation. | `TBD` | `Open` |
| Which webhook event id, signature, and payload fields does Roller provide in Playground and production? | Required before exposing webhook intake beyond local/dev testing. | `TBD` | `Open` |
