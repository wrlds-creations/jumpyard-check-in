# CODEX_TASK.md

## Ticket ID
NO_ACTIVE_TICKET

## Goal
No active Codex ticket.

## Context
- T0128 completed the full context-hygiene migration.
- Historical project memory now lives in `docs/history/` and broad forward planning lives in `docs/roadmap/backlog.md`.
- T0126 remains a manual Pelle/Anders demo rehearsal outside Codex and is not marked completed.

## Allowed Areas
- None until a new ticket is selected.

## Do Not Touch
- Roller Live
- Production credentials
- `.env`
- AWS resources or deploys
- Aurora migrations
- Phone application source
- Admin application behavior
- Kiosk application source
- JumpYard Cloud backend source
- Payment package/vendor source
- Roller bookings, drafts, payments, or redemptions
- SMS/email sending
- Vendor assets or icons
- unrelated local prompt files

## Requirements
1. Select and activate a new scoped ticket before making further repository changes.

## Validation
- `node scripts/validate-current-ticket.js`
- `node scripts/validate-followups.js`
- `node scripts/validate-history-archives.js`
- `npm run validate`
- `git diff --check`
