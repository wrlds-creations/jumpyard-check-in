# CODEX_TASK.md

## Ticket ID
NO_ACTIVE_TICKET

## Goal
No active ticket.

## Context
- T0135 completed the buy-entry safety-video context ticket on 2026-06-16.
- Historical project memory lives in `docs/history/` and broad forward planning lives in `docs/roadmap/backlog.md`.
- Completed tickets are removed from backlog and recorded in `docs/history/completed-tickets.md`.
- Closeout validation evidence is recorded in `docs/history/validation-log.md`.
- The recommended next ticket is `T0136`, which persists local buy-flow state so refresh can resume after purchase and during safety steps.

## Allowed Areas
- None until a new ticket is activated.

## Do Not Touch
- Roller Live
- Production credentials
- `.env`
- AWS resources or deploys
- Aurora migrations
- Application source outside an activated ticket
- unrelated local prompt files

## Requirements
1. Activate exactly one ticket before making implementation changes.
2. Read `PROJECT_CONTEXT.md`, `DECISIONS.md`, `REPO_CURRENT_STATE.md`, and this file at the start of the ticket.
3. Keep completed tickets out of backlog and archive completion/validation evidence in `docs/history/`.

## Validation
- `node scripts/validate-current-ticket.js`
- `npm run validate`
