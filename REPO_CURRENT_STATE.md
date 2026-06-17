# Repo Current State

Use this file as the short operational snapshot of what actually exists in the repository. Historical detail lives in the linked archives.

## Snapshot

- Date: 2026-06-17
- Current branch: `codex/t0146-park-test-environment-contract`
- Current status: T0146 is completed as a documentation-only park-test environment contract; no active ticket is currently selected.
- Current ticket: None active
- Completed tickets: archived in `docs/history/completed-tickets.md` (145 completed tickets; latest `T0146`).
- Recommended next step: activate `T0147` to implement config guards for explicit `park-test` support while keeping dev fail-closed against Roller Live.

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
- Park-test current-state audit: [docs/t0145-current-state-audit.md](docs/t0145-current-state-audit.md)
- Park-test environment contract: [docs/t0146-park-test-environment-contract.md](docs/t0146-park-test-environment-contract.md)

Major implementation roots remain unchanged by T0146: `infra/`, `jumpyard-checkin-phone/`, `jumpyard-checkin-admin/`, `jumpyard-checkin-kiosk/`, `scripts/`, and `skills/`.

## Known Validation Commands

| Command | Purpose | Notes |
|---|---|---|
| `node scripts/validate-current-ticket.js` | Verify `CODEX_TASK.md` and `REPO_CURRENT_STATE.md` agree on active/no-active ticket state. | Does not call GitHub, AWS, Roller, or the network. |
| `node scripts/validate-followups.js` | Verify active followups have unique ids and no Done/Closed rows under Open. | Reads `FOLLOWUPS.md` and `docs/history/followups-done.md`. |
| `node scripts/validate-history-archives.js` | Verify required history/backlog files exist and active docs link to them. | Added in T0128. |
| `npm run validate` | Run the root documentation/workflow validators. | Required after source-of-truth changes. |
| `git diff --check` | Check whitespace in the working diff. | Required before closeout/commit. |
| App-specific lint/build commands | Validate phone/admin/kiosk app changes when a ticket touches app code. | Not required for T0146 because it is docs-only. |
| AWS/infra commands | Validate or deploy infra only when a scoped ticket allows AWS work. | T0146 updates the planned environment contract only and does not create, change, deploy, or delete AWS resources. |

## Completed Tickets

Completed-ticket history is archived in [docs/history/completed-tickets.md](docs/history/completed-tickets.md).

- Archived completed-ticket count: 145
- Latest completed ticket: `T0146`
- Current active ticket: None active

## Current Ticket

| Ticket | Goal | Status | Notes |
|---|---|---|---|
| None active | No active Codex ticket. | Idle | T0146 locked the park-test environment contract without changing app/backend/infra/AWS/Roller/Cloudflare/payment/SMS/email behavior. |

## Confirmed Next Tickets

| Ticket | Goal | Status | Notes |
|---|---|---|---|
| `T0147` | Implement config guards for explicit `park-test` support while keeping dev fail-closed against Roller Live. | Ready | Next ticket in the `T0145`-`T0162` park-test sequence documented in [docs/roadmap/backlog.md](docs/roadmap/backlog.md). T0147 is code/config validation only and must not deploy, create credentials, or call AWS/Roller. |

Broad future planning lives in [docs/roadmap/backlog.md](docs/roadmap/backlog.md).

## Validation Status

Historical validation evidence is archived in [docs/history/validation-log.md](docs/history/validation-log.md).

- T0146 closeout validation is recorded in [docs/history/validation-log.md](docs/history/validation-log.md).
- T0145 closeout validation is recorded in [docs/history/validation-log.md](docs/history/validation-log.md).
- T0144 closeout validation is recorded in [docs/history/validation-log.md](docs/history/validation-log.md).
- Recent closeout validation for T0129 through T0143 is recorded in [docs/history/validation-log.md](docs/history/validation-log.md).
- T0128 baseline/archive validation history and older validation-command inventory are archived in [docs/history/validation-log.md](docs/history/validation-log.md).

## Current Risks And Open Questions

- T0146 was docs-only; no phone/admin/kiosk/backend/AWS/Roller/Cloudflare/payment/session/SMS/email behavior changed.
- The park-test plan is not an approval to create AWS resources, call Roller Live, register Live webhooks, create drafts/payments, redeem tickets, or run visitor traffic; those actions remain gated by scoped future tickets and explicit approvals.
- The T0146 contract keeps park-test in AWS account `376129878018`, region `eu-north-1`, but requires separate future resources under namespace `jumpyard-check-in-park-test` and its own database, secrets, API, queues, schedules, logs, alarms, and frontend API target.
- T0145 identified docs drift in `AWS_RESOURCES.md`: one top-level status sentence says Aurora migrations through `0007`, while the schema inventory and migration files show `0008` as the latest known migration. Verify and reconcile this before T0151 park-test database work.
- Production readiness remains partial; active future work is tracked in [FOLLOWUPS.md](FOLLOWUPS.md), [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md), and [docs/roadmap/backlog.md](docs/roadmap/backlog.md).
- Unrelated local work was stashed as `stash@{0}: pre-t0128-local-unrelated-work` before the T0128 branch was created.
