# Repo Current State

Use this file as the living snapshot of what actually exists in the repository. Update it after completed tickets, audits, meaningful dependency changes, or workflow changes.

## Snapshot

- Date: 2026-05-18
- Current branch: `codex/t0000-source-of-truth`
- Current status: Source-of-truth setup in progress.
- Current ticket: `T0000`
- Completed tickets: None.
- Recommended next ticket: `T0001 Roller Playground connectivity spike`

## Current Structure

```text
.
|-- AGENTS.md
|-- PROJECT_CONTEXT.md
|-- DECISIONS.md
|-- CODEX_TASK.md
|-- REPO_CURRENT_STATE.md
|-- FOLLOWUPS.md
|-- AWS_RESOURCES.md
|-- TEST_PLAN.md
|-- jumpyard-checkin-phone/
|-- jumpyard-checkin-kiosk/
`-- jumpyard-checkin-admin/
```

## Known Validation Commands

| Command | Purpose | Notes |
|---|---|---|
| `npm run validate` | Validate root WRLDS workflow files and skills. | Exists at repository root. |
| `cd jumpyard-checkin-phone && npm run lint` | Lint phone app. | Existing app command; not required for T0000 docs-only ticket. |
| `cd jumpyard-checkin-phone && npm run build` | Build phone app. | Existing app command; not required for T0000 docs-only ticket. |
| `cd jumpyard-checkin-kiosk && npm run lint` | Lint kiosk app. | Existing app command; not required for T0000 docs-only ticket. |
| `cd jumpyard-checkin-kiosk && npm run build` | Build kiosk app. | Existing app command; not required for T0000 docs-only ticket. |
| `cd jumpyard-checkin-admin && npm run lint` | Lint admin app. | Existing app command; not required for T0000 docs-only ticket. |
| `cd jumpyard-checkin-admin && npm run build` | Build admin app. | Existing app command; not required for T0000 docs-only ticket. |

## Completed Tickets

None.

## Current Ticket

| Ticket | Goal | Status | Notes |
|---|---|---|---|
| `T0000` | Set up the repository source-of-truth documents for the WRLDS Codex workflow. | In progress | Docs-only ticket. Do not modify app functionality. |

## Validation Status

- Automated validation: `npm run validate` passed on 2026-05-18.
- Manual validation: Pending project-owner review.
- App lint/build: Not required for T0000 docs-only ticket.

## Known Issues Summary

- Roller Playground connectivity has not been implemented.
- JumpYard Cloud/server API contract has not been defined.
- Staff handoff/redeem flow integration has not been implemented.

## Open Questions

- What server-side runtime should host the Sprint 1 JumpYard Cloud/server API?
- Which Roller Playground endpoint should be used first for booking lookup?
- Which fields should define the first staff handoff code contract?
