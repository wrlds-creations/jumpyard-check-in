# Repo Current State

Use this file as the living snapshot of what actually exists in the repository. Update it after completed tickets, audits, meaningful dependency changes, or workflow changes.

## Snapshot

- Date: 2026-05-18
- Current branch: `codex/t0002-roller-smoke`
- Current status: T0002 Roller credential smoke test completed.
- Current ticket: `T0002`
- Completed tickets: `T0000`, `T0001`
- Recommended next ticket: `T0003 Booking lookup endpoint`

## Current Structure

```text
.
|-- .env.example
|-- AGENTS.md
|-- PROJECT_CONTEXT.md
|-- DECISIONS.md
|-- CODEX_TASK.md
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
| `cd jumpyard-checkin-phone && npm run lint` | Lint phone app. | Existing app command; not required for T0002 unless app code changes. |
| `cd jumpyard-checkin-phone && npm run build` | Build phone app. | Existing app command; not required for T0002 unless app code changes. |
| `cd jumpyard-checkin-kiosk && npm run lint` | Lint kiosk app. | Existing app command; not required for T0002 unless app code changes. |
| `cd jumpyard-checkin-kiosk && npm run build` | Build kiosk app. | Existing app command; not required for T0002 unless app code changes. |
| `cd jumpyard-checkin-admin && npm run lint` | Lint admin app. | Existing app command; not required for T0002 unless app code changes. |
| `cd jumpyard-checkin-admin && npm run build` | Build admin app. | Existing app command; not required for T0002 unless app code changes. |

## Completed Tickets

| Ticket | Summary | Completed On | Notes |
|---|---|---|---|
| `T0000` | Set up source-of-truth docs for WRLDS Codex workflow. | 2026-05-18 | Committed as `5655fb1`. |
| `T0001` | Added Roller Playground env guard and client skeleton. | 2026-05-18 | Committed as `2bfde41`. |

## Current Ticket

| Ticket | Goal | Status | Notes |
|---|---|---|---|
| `T0002` | Verify local Roller Playground credentials through a safe read-only smoke test. | Completed | Env guard passes and `npm run roller:smoke` returns HTTP 200 from read-only `/products` with no secrets printed. |

## Validation Status

- Automated validation: `npm run validate` passed on 2026-05-18.
- Roller env validation: `npm run roller:env:check` passed with local `.env`.
- Roller smoke validation: `npm run roller:smoke` passed with local `.env`; `/products` returned HTTP 200 and an empty JSON array summary.
- App lint/build: Not required for T0002 because app code is not changed.

## Known Issues Summary

- The Roller smoke test currently reports zero products from `/products`; T0003 should define the booking lookup endpoint and expected data contract.
- JumpYard Cloud/server API contract has not been defined.
- Staff handoff/redeem flow integration has not been implemented.

## Open Questions

- What exact Roller Playground credential scopes are available for T0002?
- Is `/products` the confirmed safest read-only smoke endpoint for this Roller account?
- Which fields should define the first booking lookup and staff handoff contracts?
