# Repo Current State

Use this file as the short operational snapshot of what actually exists in the repository. Historical detail lives in the linked archives.

## Snapshot

- Date: 2026-06-16
- Current branch: `codex/t0131-hopptid-produktsteg`
- Current status: No active ticket after T0131.
- Current ticket: `NO_ACTIVE_TICKET`
- Completed tickets: archived in `docs/history/completed-tickets.md` (130 completed tickets; latest `T0131`).
- Recommended next step: activate `T0132` to present jump socks as an important manual choice.

## Current Structure

Active source-of-truth files:

- `PROJECT_CONTEXT.md`: stable project facts, architecture, constraints, current flow facts, language policy, and active open questions.
- `DECISIONS.md`: durable architecture, workflow, scope, data, security, deployment, and maintainability decisions.
- `CODEX_TASK.md`: the current active ticket or `NO_ACTIVE_TICKET`.
- `REPO_CURRENT_STATE.md`: this short current operational snapshot.
- `FOLLOWUPS.md`: active out-of-scope findings only; completed followups are archived.
- `TEST_PLAN.md`: current validation entrypoint only; historical evidence is archived.

History and planning archives:

- Completed tickets: [docs/history/completed-tickets.md](docs/history/completed-tickets.md)
- Historical validation evidence and old validation-command inventory: [docs/history/validation-log.md](docs/history/validation-log.md)
- Sprint 1 implementation narrative and old repo-state issue snapshot: [docs/history/sprint-1-ticket-history.md](docs/history/sprint-1-ticket-history.md)
- Done followups: [docs/history/followups-done.md](docs/history/followups-done.md)
- Forward roadmap/backlog: [docs/roadmap/backlog.md](docs/roadmap/backlog.md)

Major implementation roots remain unchanged by T0128: `infra/`, `jumpyard-checkin-phone/`, `jumpyard-checkin-admin/`, `jumpyard-checkin-kiosk/`, `scripts/`, and `skills/`.

## Known Validation Commands

| Command | Purpose | Notes |
|---|---|---|
| `node scripts/validate-current-ticket.js` | Verify `CODEX_TASK.md` and `REPO_CURRENT_STATE.md` agree on active/no-active ticket state. | Does not call GitHub, AWS, Roller, or the network. |
| `node scripts/validate-followups.js` | Verify active followups have unique ids and no Done/Closed rows under Open. | Reads `FOLLOWUPS.md` and `docs/history/followups-done.md`. |
| `node scripts/validate-history-archives.js` | Verify required history/backlog files exist and active docs link to them. | Added in T0128. |
| `npm run validate` | Run the root documentation/workflow validators. | Required after source-of-truth changes. |
| `git diff --check` | Check whitespace in the working diff. | Required before closeout/commit. |
| App-specific lint/build commands | Validate phone/admin/kiosk app changes when a ticket touches app code. | Required for T0131 because it touched phone UI. |
| AWS/infra commands | Validate or deploy infra only when a scoped ticket allows AWS work. | T0131 did not create, change, deploy, or delete AWS resources. |

## Completed Tickets

Completed-ticket history is archived in [docs/history/completed-tickets.md](docs/history/completed-tickets.md).

- Archived completed-ticket count: 130
- Latest completed ticket: `T0131`
- Current active ticket: None active after T0131

## Current Ticket

| Ticket | Goal | Status | Notes |
|---|---|---|---|
| `NO_ACTIVE_TICKET` | No active ticket. | Closed | Activate `T0132` next. |

## Confirmed Next Tickets

| Ticket | Goal | Status | Notes |
|---|---|---|---|
| `T0132` | Present jump socks as an important manual choice with warm copy. | Ready | Next ticket in the buy-flow/check-in UX sequence documented in [docs/roadmap/backlog.md](docs/roadmap/backlog.md). |

Broad future planning lives in [docs/roadmap/backlog.md](docs/roadmap/backlog.md).

## Validation Status

Historical validation evidence is archived in [docs/history/validation-log.md](docs/history/validation-log.md).

- T0128 baseline validation passed: `node scripts/validate-current-ticket.js` and `npm run validate`.
- T0128 Phase 2 ticket-state validation passed after activating T0128.
- T0128 Phase 3 followup validation passed after adding `scripts/validate-followups.js`.
- T0128 Phase 4 completed-ticket archive validation passed after moving the completed-ticket table.
- T0128 Phase 5 validation-log archive passed after shortening `TEST_PLAN.md`.
- T0128 Phase 6 project-context split passed after moving ticket narrative into history.
- T0128 Phase 7 roadmap/backlog split passed after moving broad future planning out of this file.
- T0128 Phase 8 current-snapshot compression and history-archive validation passed.
- T0128 closeout validation is recorded in the final handoff for that branch.
- T0126 baseline validation passed before activating Playground booking rehearsal work.
- T0126 created Playground bookings `5166994`, `5166995`, `5166996`, and `5166997` dated 2026-06-15.
- T0126 safe readiness checks passed for JumpYard Cloud lookup, public guest/admin page load, dev availability, and existing-booking add-on quote. A dev ready-for-staff handoff was created for booking `5166996` as `JY3829`.
- T0129 closeout validation is recorded in [docs/history/validation-log.md](docs/history/validation-log.md).
- T0130 closeout validation is recorded in [docs/history/validation-log.md](docs/history/validation-log.md).
- T0131 closeout validation is recorded in [docs/history/validation-log.md](docs/history/validation-log.md).

## Current Risks And Open Questions

- T0128 was docs/tooling-only; no phone/admin/kiosk/backend/AWS/Roller/payment/SMS/email behavior changed.
- The T0126 rehearsal touched Roller Playground and JumpYard Cloud dev operational state only. It did not redeem tickets and did not change app/backend/AWS/Roller Live/SMS/email behavior.
- T0129 was docs-only; no phone/admin/kiosk/backend/AWS/Roller/payment/SMS/email behavior changed.
- T0130 changed phone UI copy/display only; no backend, AWS, Roller, payment, draft, SMS, email, or future-date booking behavior changed.
- T0131 changed phone UI copy/display only; no backend, AWS, Roller, payment, draft, SMS, email, or flow-order behavior changed.
- Production readiness remains partial; active future work is tracked in [FOLLOWUPS.md](FOLLOWUPS.md), [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md), and [docs/roadmap/backlog.md](docs/roadmap/backlog.md).
- Unrelated local work was stashed as `stash@{0}: pre-t0128-local-unrelated-work` before this branch was created.
