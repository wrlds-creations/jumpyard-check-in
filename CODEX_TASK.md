# CODEX_TASK.md

## Ticket ID
NO_ACTIVE_TICKET

## Goal
No active Codex ticket.

## Context
- T0126 completed the Pelle/Anders same-day Playground booking rehearsal preparation on 2026-06-15.
- T0129 completed the buy-flow/check-in UX backlog intake on 2026-06-16.
- T0130 completed the buy-entry start-time/date clarification on 2026-06-16.
- Historical project memory lives in `docs/history/` and broad forward planning lives in `docs/roadmap/backlog.md`.
- Select and activate the next scoped ticket before making further repository changes.
- Recommended next ticket: `T0131`.

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
