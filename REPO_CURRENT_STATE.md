# Repo Current State

Use this file as the short operational snapshot of what actually exists in the repository. Historical detail lives in the linked archives.

## Snapshot

- Date: 2026-06-22
- Current branch: `codex/t0154-live-webhook-dry-run`
- Current status: T0154 complete on this branch and ready to merge.
- Current ticket: `T0154`
- Completed tickets: archived in `docs/history/completed-tickets.md` (151 completed tickets; latest `T0152`).
- Recommended next step: merge T0154, then choose T0155 Live webhook registration or T0157 Live quote/cost smoke as the next scoped ticket.

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
- Park-test synth skeleton: [docs/t0148-park-test-synth-skeleton.md](docs/t0148-park-test-synth-skeleton.md)
- Park-test deploy/rollback preflight: [docs/t0149-park-test-deploy-rollback-preflight.md](docs/t0149-park-test-deploy-rollback-preflight.md)
- Park-test foundation deploy: [docs/t0150-park-test-foundation-deploy.md](docs/t0150-park-test-foundation-deploy.md)
- Park-test database migrations: [docs/t0151-park-test-db-migrations.md](docs/t0151-park-test-db-migrations.md)
- Park-test secrets and gates: [docs/t0152-park-test-secrets-gates.md](docs/t0152-park-test-secrets-gates.md)
- Park-test Roller Live read-only preflight: [docs/t0153-roller-live-readonly-preflight.md](docs/t0153-roller-live-readonly-preflight.md)
- Park-test Live webhook dry-run: [docs/t0154-live-webhook-dry-run.md](docs/t0154-live-webhook-dry-run.md)

T0154 added dry-run-only tooling for the park-test Roller Live booking webhook. The plan points Roller Live to `POST https://ij4rnaui2b.execute-api.eu-north-1.amazonaws.com/v1/roller/webhooks/bookings`, uses the `x-roller-apikey` value from `/jumpyard-check-in-park-test/webhooks/dev-token`, includes booking events `Created`, `Updated`, and `Cancelled` with `tickets=true`, and documents duplicate/rollback behavior. No Roller Live request, webhook registration, AWS write, frontend traffic, payment, redeem, SMS, or email occurred.

## Known Validation Commands

| Command | Purpose | Notes |
|---|---|---|
| `node scripts/validate-current-ticket.js` | Verify `CODEX_TASK.md` and `REPO_CURRENT_STATE.md` agree on active/no-active ticket state. | Does not call GitHub, AWS, Roller, or the network. |
| `node scripts/validate-followups.js` | Verify active followups have unique ids and no Done/Closed rows under Open. | Reads `FOLLOWUPS.md` and `docs/history/followups-done.md`. |
| `node scripts/validate-history-archives.js` | Verify required history/backlog files exist and active docs link to them. | Added in T0128. |
| `npm run validate` | Run the root documentation/workflow validators. | Required after source-of-truth changes. |
| `git diff --check` | Check whitespace in the working diff. | Required before closeout/commit. |
| `npm --prefix infra run validate:config-guards` | Prove dev/park-test config guard behavior. | Added in T0147; local only, no AWS or Roller calls. |
| `npm --prefix infra run validate:park-test-synth` | Synthesize dev and park-test templates locally and verify separation. | Added in T0148; no AWS or Roller calls. |
| `npm --prefix infra run validate:roller-live-readonly-preflight` | Prove the T0153 Roller Live preflight script refuses write-like and sensitive endpoints. | Local only; no AWS or Roller calls. |
| `npm --prefix infra run preflight:roller-live:park-test` | Run the T0153 Roller Live read-only preflight. | Reads AWS config/secrets and calls only the hard-allowlisted Roller Live read endpoints. |
| `npm --prefix infra run validate:roller-live-webhook-dry-run` | Prove the T0154 webhook dry-run rejects write-like args and unsafe config. | Local only; no AWS or Roller calls. |
| `npm --prefix infra run webhook:live:park-test:dry-run` | Print the T0154 Live webhook dry-run plan. | Read-only AWS metadata only; no Roller calls, no AWS writes, no secret values. |
| `npm run infra:check` | Type-check infra, run config guards, run park-test synth validation, run local Live guard self-tests, and synthesize the example dev stack. | Local synth/self-tests only; does not deploy or call Roller. |
| App-specific lint/build commands | Validate phone/admin/kiosk app changes when a ticket touches app code. | Not required for T0154 because app code was unchanged. |

## Completed Tickets

Completed-ticket history is archived in [docs/history/completed-tickets.md](docs/history/completed-tickets.md).

- Archived completed-ticket count: 151
- Latest completed ticket: `T0152`
- Current active ticket: `T0154`

## Current Ticket

| Ticket | Goal | Status | Notes |
|---|---|---|---|
| `T0154` | Prepare Roller Live webhook dry-run for park-test. | Complete | Added dry-run tooling and docs for endpoint, `x-roller-apikey` header source, events, duplicate handling, and rollback template. No Roller calls or writes. |

## Confirmed Next Tickets

| Ticket | Goal | Status | Notes |
|---|---|---|---|
| `T0155` | Register Live webhook. | Planned | Requires explicit approval. Only webhook registration/intake; no customer flow rollout, payment, redeem, frontend traffic, SMS, or email. |
| `T0156` | Configure separate park-test frontend API target. | Planned | Same phone/admin source code; separate deployment/env target; no direct Roller calls from frontend. |
| `T0157` | Run Live quote/cost smoke. | Planned | Quote/cost only after explicit ticket start. No draft, payment, redeem, webhook registration, frontend traffic, SMS, or email. |

Broad future planning lives in [docs/roadmap/backlog.md](docs/roadmap/backlog.md).

## Validation Status

Historical validation evidence is archived in [docs/history/validation-log.md](docs/history/validation-log.md).

- T0154 local validation and dry-run output are recorded in [docs/t0154-live-webhook-dry-run.md](docs/t0154-live-webhook-dry-run.md).
- T0153 local validation and successful Live read-only preflight are recorded in [docs/t0153-roller-live-readonly-preflight.md](docs/t0153-roller-live-readonly-preflight.md).
- T0152 local and deploy validation is recorded in [docs/t0152-park-test-secrets-gates.md](docs/t0152-park-test-secrets-gates.md).
- T0145 through T0151 closeout validation is recorded in [docs/history/validation-log.md](docs/history/validation-log.md).
- Recent closeout validation for T0128 through T0144 is recorded in [docs/history/validation-log.md](docs/history/validation-log.md).

## Current Risks And Open Questions

- T0150 deployed `jumpyard-check-in-park-test-stack` to `CREATE_COMPLETE`. API endpoint: `https://ij4rnaui2b.execute-api.eu-north-1.amazonaws.com`; Aurora cluster: `jumpyard-check-in-park-test-aurora`; raw bucket: `jumpyard-check-in-park-test-raw-376129878018-eu-north-1`.
- T0151 applied SQL migrations `0001` through `0008` to the dedicated park-test Aurora database; key operational data tables checked in T0151 remained empty.
- T0152 deployed park-test gates for staff auth, guest message sends, webhook processing, booking draft/payment-start writes, redeem writes, and emergency stop. Park-test has `JUMPYARD_EMERGENCY_STOP=true` and all sensitive operation gates closed.
- T0153 passed the first Roller Live read-only preflight for JumpYard Nacka Forum using `/jumpyard-check-in-park-test/roller/credentials`. Confirmed venue id `50871`, 60-minute entry product ids, availability reads, and payment settings visibility.
- T0154 did not inspect existing Roller Live webhooks. T0155 must `GET https://api.roller.app/webhooks` first, avoid duplicates, and record the exact Live webhook id before any rollback/removal action.
- The park-test plan is not an approval to create AWS resources, call new Roller Live endpoints, register Live webhooks, create drafts/payments, redeem tickets, or run visitor traffic; those actions remain gated by scoped future tickets and explicit approvals.
- T0148 uses placeholder explicit CORS origins in `infra/config/park-test.json`; T0156 must replace or confirm real park-test phone/admin origins before visitor testing.
- Production readiness remains partial; active future work is tracked in [FOLLOWUPS.md](FOLLOWUPS.md), [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md), and [docs/roadmap/backlog.md](docs/roadmap/backlog.md).
- Unrelated local work was stashed as `stash@{0}: pre-t0128-local-unrelated-work` before the T0128 branch was created.
