# CODEX_TASK.md

## Ticket ID
T0127

## Goal
Create a safe project context-hygiene foundation for JumpYard Check-in without moving large history yet.

## Context
- T0125 is completed according to `REPO_CURRENT_STATE.md`.
- T0126 is reserved for final Pelle/Anders demo rehearsal.
- This T0127 ticket focuses on repository memory hygiene, validators, and audit documentation.
- The repository has grown beyond 120 completed tickets.
- The goal is to keep current context short while preserving historical Swedish and technical project history.

## Allowed Areas
- `CODEX_TASK.md`
- `REPO_CURRENT_STATE.md`
- `PROJECT_CONTEXT.md` only if a stable fact changes
- `DECISIONS.md` only if a meaningful workflow decision is made
- `FOLLOWUPS.md` only if needed for hygiene validation or audit notes
- `package.json`
- `scripts/`
- `skills/project-context-hygiene/`
- `docs/context-hygiene-audit.md`
- `docs/history/` only if creating placeholder files is clearly needed
- `docs/roadmap/` only if creating placeholder files is clearly needed

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
- Existing Swedish UX copy or business wording unless preserving it exactly

## Requirements
1. Create a context-hygiene skill.
2. Create a context-hygiene audit report.
3. Add validation that catches `CODEX_TASK.md` vs `REPO_CURRENT_STATE.md` mismatch.
4. If low-risk, add followup hygiene validation.
5. Do not move completed-ticket or validation history yet.
6. Preserve Swedish text and ticket history.
7. Run validation.

## Acceptance Criteria
- `CODEX_TASK.md` no longer points to stale T0125.
- A new project-context-hygiene skill exists and passes skill validation.
- `docs/context-hygiene-audit.md` exists.
- `npm run validate` catches stale active-ticket mismatches.
- `npm run validate` passes after the new checks are added.
- No application behavior, AWS, Roller, credentials, or deployment config changed.

## Validation
- `npm run validate`
- `node --check scripts/validate-current-ticket.js`
