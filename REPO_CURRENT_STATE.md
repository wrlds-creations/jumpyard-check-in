# Repo Current State

Use this file as the short operational snapshot of what actually exists in the repository. Historical detail lives in the linked archives.

## Snapshot

- Date: 2026-06-17
- Current branch: `codex/t0147-config-guards`
- Current status: T0147 is completed as a code/config validation ticket; no active ticket is currently selected.
- Current ticket: None active
- Completed tickets: archived in `docs/history/completed-tickets.md` (146 completed tickets; latest `T0147`).
- Recommended next step: activate `T0148` to add a synthable park-test CDK/config skeleton without deploying or creating secrets/resources.

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

T0147 touched only `infra/lib/config.ts`, `infra/package.json`, `infra/scripts/validate-config-guards.ts`, and source-of-truth docs. App roots remain unchanged: `jumpyard-checkin-phone/`, `jumpyard-checkin-admin/`, and `jumpyard-checkin-kiosk/`.

## Known Validation Commands

| Command | Purpose | Notes |
|---|---|---|
| `node scripts/validate-current-ticket.js` | Verify `CODEX_TASK.md` and `REPO_CURRENT_STATE.md` agree on active/no-active ticket state. | Does not call GitHub, AWS, Roller, or the network. |
| `node scripts/validate-followups.js` | Verify active followups have unique ids and no Done/Closed rows under Open. | Reads `FOLLOWUPS.md` and `docs/history/followups-done.md`. |
| `node scripts/validate-history-archives.js` | Verify required history/backlog files exist and active docs link to them. | Added in T0128. |
| `npm run validate` | Run the root documentation/workflow validators. | Required after source-of-truth changes. |
| `git diff --check` | Check whitespace in the working diff. | Required before closeout/commit. |
| `npm --prefix infra run validate:config-guards` | Prove dev/park-test config guard behavior. | Added in T0147; local only, no AWS or Roller calls. |
| `npm run infra:check` | Type-check infra, run config-guard validation, and synthesize the example dev stack. | Local synth only; does not deploy or call Roller. |
| App-specific lint/build commands | Validate phone/admin/kiosk app changes when a ticket touches app code. | Not required for T0147 because app code is unchanged. |
| AWS/infra commands | Validate or deploy infra only when a scoped ticket allows AWS work. | T0147 changes validation code only and does not create, change, deploy, or delete AWS resources. |

## Completed Tickets

Completed-ticket history is archived in [docs/history/completed-tickets.md](docs/history/completed-tickets.md).

- Archived completed-ticket count: 146
- Latest completed ticket: `T0147`
- Current active ticket: None active

## Current Ticket

| Ticket | Goal | Status | Notes |
|---|---|---|---|
| None active | No active Codex ticket. | Idle | T0147 added fail-closed config guards without deploying, creating resources, or changing app/AWS/Roller/Cloudflare/payment/SMS/email behavior. |

## Confirmed Next Tickets

| Ticket | Goal | Status | Notes |
|---|---|---|---|
| `T0148` | Add a synthable park-test CDK/config skeleton with separate naming, tags, and resource prefix. | Ready | Next ticket in the `T0145`-`T0162` park-test sequence documented in [docs/roadmap/backlog.md](docs/roadmap/backlog.md). T0148 is synthesis only and must not deploy, create credentials, or call Roller. |

Broad future planning lives in [docs/roadmap/backlog.md](docs/roadmap/backlog.md).

## Validation Status

Historical validation evidence is archived in [docs/history/validation-log.md](docs/history/validation-log.md).

- T0147 closeout validation is recorded in [docs/history/validation-log.md](docs/history/validation-log.md).
- T0146 closeout validation is recorded in [docs/history/validation-log.md](docs/history/validation-log.md).
- T0145 closeout validation is recorded in [docs/history/validation-log.md](docs/history/validation-log.md).
- T0144 closeout validation is recorded in [docs/history/validation-log.md](docs/history/validation-log.md).
- Recent closeout validation for T0129 through T0143 is recorded in [docs/history/validation-log.md](docs/history/validation-log.md).
- T0128 baseline/archive validation history and older validation-command inventory are archived in [docs/history/validation-log.md](docs/history/validation-log.md).

## Current Risks And Open Questions

- T0147 did not deploy, create credentials, call AWS or Roller, create resources, webhooks, payments, redemptions, SMS, email, or change app behavior.
- The park-test plan is not an approval to create AWS resources, call Roller Live, register Live webhooks, create drafts/payments, redeem tickets, or run visitor traffic; those actions remain gated by scoped future tickets and explicit approvals.
- The T0146 contract keeps park-test in AWS account `376129878018`, region `eu-north-1`, but requires separate future resources under namespace `jumpyard-check-in-park-test` and its own database, secrets, API, queues, schedules, logs, alarms, and frontend API target.
- T0147 config guards make dev fail closed against Roller Live and make park-test fail closed unless the config matches the T0146 contract and keeps confirmed scheduled sends off.
- T0145 identified docs drift in `AWS_RESOURCES.md`: one top-level status sentence says Aurora migrations through `0007`, while the schema inventory and migration files show `0008` as the latest known migration. Verify and reconcile this before T0151 park-test database work.
- Production readiness remains partial; active future work is tracked in [FOLLOWUPS.md](FOLLOWUPS.md), [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md), and [docs/roadmap/backlog.md](docs/roadmap/backlog.md).
- Unrelated local work was stashed as `stash@{0}: pre-t0128-local-unrelated-work` before the T0128 branch was created.
