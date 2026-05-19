# Repo Current State

Use this file as the living snapshot of what actually exists in the repository. Update it after completed tickets, audits, meaningful dependency changes, or workflow changes.

## Snapshot

- Date: 2026-05-19
- Current branch: `codex/t0003-booking-lookup-contract`
- Current status: T0003 JumpYard Cloud contract and data architecture completed locally.
- Current ticket: `T0003`
- Completed tickets: `T0000`, `T0001`, `T0002`
- Recommended next ticket: `T0004 JumpYard Cloud AWS foundation`

## Current Structure

```text
.
|-- .env.example
|-- AGENTS.md
|-- PROJECT_CONTEXT.md
|-- DECISIONS.md
|-- CODEX_TASK.md
|-- JUMPYARD_CLOUD_CONTRACT.md
|-- REPO_CURRENT_STATE.md
|-- FOLLOWUPS.md
|-- AWS_RESOURCES.md
|-- TEST_PLAN.md
|-- scripts/
|   |-- check-roller-env.js
|   |-- roller-client.js
|   `-- roller-smoke.js
|-- jumpyard-checkin-phone/
|-- jumpyard-checkin-kiosk/
`-- jumpyard-checkin-admin/
```

## Known Validation Commands

| Command | Purpose | Notes |
|---|---|---|
| `npm run validate` | Validate root WRLDS workflow files and skills. | Existing repository command. |
| `npm run roller:env:check` | Validate Roller env guard against current environment variables. | Requires `ROLLER_ENV=playground` and a Playground-looking `ROLLER_BASE_URL`; client credentials are optional. |
| `npm run roller:smoke` | Verify local Roller Playground credentials with an OAuth token request and one read-only smoke request. | Loads local `.env`; does not print secrets or full responses. |
| Read-only `GET /bookings/{bookingReference}` | Verify known Playground booking lookup behavior. | Run through the existing Roller client helper; do not print secrets or raw PII. |
| `cd jumpyard-checkin-phone && npm run lint` | Lint phone app. | Existing app command; not required for docs-only tickets unless app code changes. |
| `cd jumpyard-checkin-phone && npm run build` | Build phone app. | Existing app command; not required for docs-only tickets unless app code changes. |
| `cd jumpyard-checkin-kiosk && npm run lint` | Lint kiosk app. | Existing app command; not required for docs-only tickets unless app code changes. |
| `cd jumpyard-checkin-kiosk && npm run build` | Build kiosk app. | Existing app command; not required for docs-only tickets unless app code changes. |
| `cd jumpyard-checkin-admin && npm run lint` | Lint admin app. | Existing app command; not required for docs-only tickets unless app code changes. |
| `cd jumpyard-checkin-admin && npm run build` | Build admin app. | Existing app command; not required for docs-only tickets unless app code changes. |

## Completed Tickets

| Ticket | Summary | Completed On | Notes |
|---|---|---|---|
| `T0000` | Set up source-of-truth docs for WRLDS Codex workflow. | 2026-05-18 | Committed as `5655fb1`. |
| `T0001` | Added Roller Playground env guard and client skeleton. | 2026-05-18 | Committed as `2bfde41`. |
| `T0002` | Added Roller Playground credential smoke test and branch workflow docs. | 2026-05-19 | Merged to `main` through PR #6 as merge commit `155c655`. |

## Current Ticket

| Ticket | Goal | Status | Notes |
|---|---|---|---|
| `T0003` | Define JumpYard Cloud contract, data ownership, Roller endpoint map, Aurora data model, and proposed AWS target architecture. | Completed locally | Docs-only ticket. No app code, Roller writes, deployment config, or AWS resources changed. |

## Validation Status

- Automated validation: `npm run validate` passed on 2026-05-19.
- Roller env validation: `npm run roller:env:check` passed with local `.env` during T0002.
- Roller smoke validation: `npm run roller:smoke` passed with local `.env`; `/products` returned HTTP 200 and 96 products on 2026-05-19.
- Booking lookup validation: read-only `GET /bookings/5001370` returned HTTP 200 with booking reference `5001370`, unique id `dbba266d-0951-4706-9adf-6c9d05edffbf`, status `PendingPayment`, amount owing `260`, and ticket `5001370-21265504`.
- App lint/build: Not required for T0003 because app code is not changed.

## Known Issues Summary

- AWS resources have not been created; T0004 should create the first AWS foundation only after required metadata is confirmed.
- JumpYard Cloud/server API has not been implemented.
- Booking index ingestion from Roller Data API and booking webhooks has not been implemented.
- Playground fake booking seed tooling has not been implemented.
- Staff handoff/redeem flow integration has not been implemented.
- Roller `POST /redemptions` has not been tested yet.
- Existing-booking add-product linked-booking flow has not been tested yet.

## Open Questions

- What AWS account, region, environment name, owner, data classification, exportability, and cost center should be used for the first JumpYard Cloud deploy?
- What is the exact JumpYard Cloud link model between original booking and separate add-on booking?
- Which tenders work in the new add-on booking checkout flow: gift card, membership code, and multi-visit value?
- Which products must be configured as ticket/session products to support API-driven redemption and webhook-based counters?
- Which Roller Data API endpoint, credentials, date range, and payload shape should power the daily morning booking seed?
