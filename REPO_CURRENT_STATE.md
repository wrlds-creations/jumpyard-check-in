# Repo Current State

Use this file as the short operational snapshot of what actually exists in the repository. Historical detail lives in the linked archives.

## Snapshot

- Date: 2026-06-16
- Current branch: `codex/t0142-buy-entry-final-front-polish`
- Current status: T0142 is completed; no active ticket is currently selected.
- Current ticket: None active
- Completed tickets: archived in `docs/history/completed-tickets.md` (141 completed tickets; latest `T0142`).
- Recommended next step: review the completed branch locally, then commit/merge it if approved.

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
| App-specific lint/build commands | Validate phone/admin/kiosk app changes when a ticket touches app code. | Required for phone UI/client tickets such as T0139 and T0140. |
| AWS/infra commands | Validate or deploy infra only when a scoped ticket allows AWS work. | T0140 does not create, change, deploy, or delete AWS resources. |

## Completed Tickets

Completed-ticket history is archived in [docs/history/completed-tickets.md](docs/history/completed-tickets.md).

- Archived completed-ticket count: 141
- Latest completed ticket: `T0142`
- Current active ticket: None active

## Current Ticket

| Ticket | Goal | Status | Notes |
|---|---|---|---|
| None active | No active ticket is selected. | Idle | T0142 is complete and ready for review/commit if approved. |

## Confirmed Next Tickets

| Ticket | Goal | Status | Notes |
|---|---|---|---|
| None | No queued ticket in the current batch. | Idle | Broad future planning remains in [docs/roadmap/backlog.md](docs/roadmap/backlog.md). |

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
- T0132 closeout validation is recorded in [docs/history/validation-log.md](docs/history/validation-log.md).
- T0133 closeout validation is recorded in [docs/history/validation-log.md](docs/history/validation-log.md).
- T0134 closeout validation is recorded in [docs/history/validation-log.md](docs/history/validation-log.md).
- T0135 closeout validation is recorded in [docs/history/validation-log.md](docs/history/validation-log.md).
- T0136 closeout validation is recorded in [docs/history/validation-log.md](docs/history/validation-log.md).
- T0137 closeout validation is recorded in [docs/history/validation-log.md](docs/history/validation-log.md).
- T0138 closeout validation is recorded in [docs/history/validation-log.md](docs/history/validation-log.md).
- T0139 closeout validation is recorded in [docs/history/validation-log.md](docs/history/validation-log.md).
- T0140 closeout validation is recorded in [docs/history/validation-log.md](docs/history/validation-log.md).
- T0141 closeout validation is recorded in [docs/history/validation-log.md](docs/history/validation-log.md).
- T0142 closeout validation is recorded in [docs/history/validation-log.md](docs/history/validation-log.md).

## Current Risks And Open Questions

- T0128 was docs/tooling-only; no phone/admin/kiosk/backend/AWS/Roller/payment/SMS/email behavior changed.
- The T0126 rehearsal touched Roller Playground and JumpYard Cloud dev operational state only. It did not redeem tickets and did not change app/backend/AWS/Roller Live/SMS/email behavior.
- T0129 was docs-only; no phone/admin/kiosk/backend/AWS/Roller/payment/SMS/email behavior changed.
- T0130 changed phone UI copy/display only; no backend, AWS, Roller, payment, draft, SMS, email, or future-date booking behavior changed.
- T0131 changed phone UI copy/display only; no backend, AWS, Roller, payment, draft, SMS, email, or flow-order behavior changed.
- T0132 changed phone UI copy/display and local add-on selection state only; socks are not added automatically, already-have-socks confirmation clears selected socks, and no backend, AWS, Roller, payment, draft, SMS, email, pricing, or availability behavior changed.
- T0133 changed phone SkyRider attestation copy/display only; the confirmation gate remains and no capacity, quote, draft, payment, handout, staff grouping, backend, AWS, Roller, SMS, or email behavior changed.
- T0134 changed phone post-payment sync UI copy/display only; the payment provider integration, backend, AWS, Roller, quote, draft, SMS, and email behavior remain unchanged. Local browser smoke reached the payment step with a fake session, but approved-provider callback verification still requires a real provider event or a separately scoped test hook.
- T0135 changed phone buy-entry safety-video and safety-rules context copy only; existing-booking safety copy remains simpler, and no video completion tracking, final redeem, staff handoff, backend, AWS, Roller, quote, draft, payment, SMS, or email behavior changed. Local browser smoke verified buy-entry safety-video copy and existing-booking separation; full browser progression into rules still needs a playable media environment because local in-app video playback stayed paused.
- T0136 changed phone client-side buy-flow recovery only; local storage stores booking/draft identifiers, selected start/product, jumper count, payment/draft status, and current flow step, but does not store raw payment JWTs. Quote, draft, payment provider, session, redeem, staff handoff, backend, AWS, Roller, SMS, and email contracts remain unchanged.
- T0137 changed phone final confirmation copy/display and local confirmation context wiring only; SMS/home and park-QR final views now use `Check-in QR` language and show selected handout/add-on items, while redeem behavior, staff/admin queue semantics, backend, AWS, Roller, quote, draft, payment, session, SMS, and email contracts remain unchanged.
- T0138 changed phone buy-entry UI polish only: socks checkbox visibility, review icons, payment-code helper text, and post-payment sync display. Payment provider integration, backend, AWS, Roller, quote, draft, session, redeem, SMS, and email contracts remain unchanged.
- T0139 changed phone buy-entry pre-payment local recovery only: safe local state before draft/payment, refresh restore to the correct internal buy-entry step, and no raw payment JWT, payment-provider secret, or raw gift-card/Klippkort code persistence. Quote, draft, payment provider, session, redeem, staff handoff, backend, AWS, Roller, SMS, and email contracts remain unchanged.
- T0140 changed phone UI/client copy and display polish only after the T0138/T0139 buy-entry changes: final action copy, family product icon, review jumper label, post-payment sync card styling, and buy-entry safety-video copy/header icon. Payment provider integration, backend, AWS, Roller, quote, draft, session, redeem, SMS, and email contracts remain unchanged.
- T0141 changed phone UI/client display polish only after T0140: approved-payment sync check color, socks recommendation display, buy-entry safety-rules title/copy/header icon, recovery loading display, final new-booking action styling, and the main phone surface vertical overflow behavior. Payment provider integration, backend, AWS, Roller, quote, draft, session, redeem, SMS, and email contracts remain unchanged.
- T0142 changed phone UI/client display and local socks quantity behavior only: socks recommendation visualization, uncapped manual socks quantity, generated phone icon usage, payment loader icon, buy-entry safety/final copy without check-in QR, final confirmation QR/code removal, and new-booking action placement. Backend, AWS, Roller, quote, draft, payment provider, session, redeem, staff/admin handoff, SMS, and email contracts remain unchanged.
- Production readiness remains partial; active future work is tracked in [FOLLOWUPS.md](FOLLOWUPS.md), [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md), and [docs/roadmap/backlog.md](docs/roadmap/backlog.md).
- Unrelated local work was stashed as `stash@{0}: pre-t0128-local-unrelated-work` before this branch was created.
