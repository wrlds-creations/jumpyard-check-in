# Repo Current State

Use this file as the living snapshot of what actually exists in the repository. Update it after completed tickets, audits, meaningful dependency changes, or workflow changes.

## Snapshot

- Date: 2026-05-18
- Current branch: `codex/t0001-roller-env-guard`
- Current status: T0001 Roller Playground environment guard completed.
- Current ticket: `T0001`
- Completed tickets: `T0000`
- Recommended next ticket: `T0002 Roller Playground credential smoke test`

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
|   `-- roller-client.js
|-- jumpyard-checkin-phone/
|-- jumpyard-checkin-kiosk/
`-- jumpyard-checkin-admin/
```

## Known Validation Commands

| Command | Purpose | Notes |
|---|---|---|
| `npm run validate` | Validate root WRLDS workflow files and skills. | Existing repository command. |
| `npm run roller:env:check` | Validate Roller env guard against current environment variables. | Requires `ROLLER_ENV=playground` and a Playground-looking `ROLLER_BASE_URL`; client credentials are optional for basic validation. |
| `cd jumpyard-checkin-phone && npm run lint` | Lint phone app. | Existing app command; not required for T0001 unless app code changes. |
| `cd jumpyard-checkin-phone && npm run build` | Build phone app. | Existing app command; not required for T0001 unless app code changes. |
| `cd jumpyard-checkin-kiosk && npm run lint` | Lint kiosk app. | Existing app command; not required for T0001 unless app code changes. |
| `cd jumpyard-checkin-kiosk && npm run build` | Build kiosk app. | Existing app command; not required for T0001 unless app code changes. |
| `cd jumpyard-checkin-admin && npm run lint` | Lint admin app. | Existing app command; not required for T0001 unless app code changes. |
| `cd jumpyard-checkin-admin && npm run build` | Build admin app. | Existing app command; not required for T0001 unless app code changes. |

## Completed Tickets

| Ticket | Summary | Completed On | Notes |
|---|---|---|---|
| `T0000` | Set up source-of-truth docs for WRLDS Codex workflow. | 2026-05-18 | Committed as `5655fb1`. |

## Current Ticket

| Ticket | Goal | Status | Notes |
|---|---|---|---|
| `T0001` | Create a safe Roller Playground environment guard and Roller client skeleton without making real API calls. | Completed | No Roller API calls, bookings, payments, redeem logic, UI changes, or AWS resources. |

## Validation Status

- Automated validation: `npm run validate` passed on 2026-05-18.
- Roller env validation: Missing env failed as expected, Playground-looking config passed without credentials, production/live-looking URL failed as expected.
- Manual validation: Pending project-owner review.
- App lint/build: Not required for T0001 because app code is not changed.

## Known Issues Summary

- Roller Playground credential smoke test has not been implemented.
- JumpYard Cloud/server API contract has not been defined.
- Staff handoff/redeem flow integration has not been implemented.

## Open Questions

- What exact Roller Playground credential scopes are available for T0002?
- Which Roller Playground endpoint should be used first for booking lookup?
- Which fields should define the first staff handoff code contract?
