# Repo Current State

Use this file as the short operational snapshot of what actually exists in the repository. Historical detail lives in the linked archives.

## Snapshot

- Date: 2026-06-15
- Current branch: `codex/t0128-full-context-hygiene-migration`
- Current status: No active ticket after T0128. The full context-hygiene migration is complete, with old project memory moved into `docs/history` and `docs/roadmap`, active source-of-truth files shortened, and validators protecting the new structure. T0126 is handled manually outside Codex and is not a completed ticket.
- Current ticket: None active after T0128
- Completed tickets: archived in `docs/history/completed-tickets.md` (126 completed tickets; latest `T0128`).
- Recommended next step: choose the next scoped Codex ticket from the roadmap or active followups, then activate it in `CODEX_TASK.md` before editing.

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
| App-specific lint/build commands | Validate phone/admin/kiosk app changes when a ticket touches app code. | Not required for T0128 because it is docs/tooling-only. |
| AWS/infra commands | Validate or deploy infra only when a scoped ticket allows AWS work. | T0128 does not create, change, deploy, or delete AWS resources. |

## Completed Tickets

Completed-ticket history is archived in [docs/history/completed-tickets.md](docs/history/completed-tickets.md).

- Archived completed-ticket count: 126
- Latest completed ticket: `T0128`
- Current active ticket: None active after T0128
- T0126 is handled manually outside Codex and is not marked completed.

## Current Ticket

| Ticket | Goal | Status | Notes |
|---|---|---|---|
| None active after T0128 | No active Codex ticket. | Complete | T0128 finished the full context-hygiene migration. Select a new scoped ticket before making further changes. T0126 is handled manually outside Codex and must not be marked completed. |

## Confirmed Next Tickets

No next Codex ticket is confirmed. Broad future planning lives in [docs/roadmap/backlog.md](docs/roadmap/backlog.md). T0126 is handled manually outside Codex and is not marked completed.

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
- T0128 closeout validation is recorded in the final handoff for this branch.

## Current Risks And Open Questions

- T0128 was docs/tooling-only; no phone/admin/kiosk/backend/AWS/Roller/payment/SMS/email behavior changed.
- T0126 remains a manual Pelle/Anders demo rehearsal outside Codex and must not be marked completed automatically.
- Production readiness remains partial; active future work is tracked in [FOLLOWUPS.md](FOLLOWUPS.md), [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md), and [docs/roadmap/backlog.md](docs/roadmap/backlog.md).
- Unrelated local work was stashed as `stash@{0}: pre-t0128-local-unrelated-work` before this branch was created.
