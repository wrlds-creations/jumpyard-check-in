# Repo Current State

Use this file as the short operational snapshot of what actually exists in the repository. Historical detail lives in the linked archives.

## Snapshot

- Date: 2026-06-23
- Current branch: `codex/t0155-register-live-webhook`
- Current status: T0155 complete and ready to merge.
- Current ticket: None active
- Completed tickets: archived in `docs/history/completed-tickets.md` (154 completed tickets; latest `T0155`).
- Recommended next step: start T0156 to configure the separate park-test frontend API target.

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
- Park-test Live webhook registration: [docs/t0155-live-webhook-registration.md](docs/t0155-live-webhook-registration.md)

T0155 registered the Roller Live booking webhook for park-test as webhook id `1465`. The webhook posts booking `Created`, `Updated`, and `Cancelled` events with `tickets=true` to `https://ij4rnaui2b.execute-api.eu-north-1.amazonaws.com/v1/roller/webhooks/bookings` using the `x-roller-apikey` value from `/jumpyard-check-in-park-test/webhooks/dev-token`. The registration command listed existing webhooks before writing, avoided duplicates, and recorded rollback endpoint `https://api.roller.app/webhooks/1465`.

Park-test webhook processing remains disabled. The safe intake smoke returned HTTP `200` with response status `ignored_disabled`, and Aurora `jumpyard.roller_webhook_events` stayed at `0` rows for the smoke event before and after the request. T0155 did not create/update AWS resources, enable webhook processing, connect frontend traffic, create bookings/drafts/payments, redeem tickets, or send SMS/email.

## Known Validation Commands

| Command | Purpose | Notes |
|---|---|---|
| `node scripts/validate-current-ticket.js` | Verify `CODEX_TASK.md` and `REPO_CURRENT_STATE.md` agree on active/no-active ticket state. | Does not call GitHub, AWS, Roller, or the network. |
| `node scripts/validate-followups.js` | Verify active followups have unique ids and no Done/Closed rows under Open. | Reads `FOLLOWUPS.md` and `docs/history/followups-done.md`. |
| `node scripts/validate-history-archives.js` | Verify required history/backlog files exist and active docs link to them. | Added in T0128. |
| `npm run validate` | Run the root documentation/workflow validators. | Required after source-of-truth changes. |
| `git diff --check` | Check whitespace in the working diff. | Required before closeout/commit. |
| `npm --prefix infra run validate:config-guards` | Prove dev/park-test config guard behavior. | Local only; no AWS or Roller calls. |
| `npm --prefix infra run validate:park-test-synth` | Synthesize dev and park-test templates locally and verify separation. | Local only; no AWS or Roller calls. |
| `npm --prefix infra run validate:roller-live-readonly-preflight` | Prove the T0153 Roller Live preflight script refuses write-like and sensitive endpoints. | Local only; no AWS or Roller calls. |
| `npm --prefix infra run preflight:roller-live:park-test` | Run the T0153 Roller Live read-only preflight. | Reads AWS config/secrets and calls only hard-allowlisted Roller Live read endpoints. |
| `npm --prefix infra run validate:roller-live-webhook-dry-run` | Prove the T0154 webhook dry-run rejects write-like args and unsafe config. | Local only; no AWS or Roller calls. |
| `npm --prefix infra run webhook:live:park-test:dry-run` | Print the T0154 Live webhook dry-run plan. | Read-only AWS metadata only; no Roller calls, no AWS writes, no secret values. |
| `npm --prefix infra run validate:roller-live-webhook-register` | Prove the T0155 registration guard blocks non-scoped Roller endpoints and requires the Live write phrase. | Local only; no AWS or Roller calls. |
| `npm --prefix infra run register:webhook:live:park-test` | List/check the park-test Roller Live webhook registration. | Calls Roller Live auth and `GET /webhooks`; no webhook writes. |
| `npm --prefix infra run register:webhook:live:park-test:apply` | Register or match the park-test Roller Live webhook. | Requires `ROLLER_LIVE_WEBHOOK_REGISTER_ALLOW_WRITE=I_UNDERSTAND_THIS_REGISTERS_LIVE_WEBHOOK_FOR_JUMPYARD_NACKA`; no duplicate is created when id `1465` already matches. |
| `npm run infra:check` | Type-check infra, run config guards, run park-test synth validation, run local Live guard self-tests, and synthesize the example dev stack. | Local synth/self-tests only; does not deploy or call Roller. |
| App-specific lint/build commands | Validate phone/admin/kiosk app changes when a ticket touches app code. | Not required for T0155 because app code was unchanged. |

## Completed Tickets

Completed-ticket history is archived in [docs/history/completed-tickets.md](docs/history/completed-tickets.md).

- Archived completed-ticket count: 154
- Latest completed ticket: `T0155`
- Current active ticket: None active

## Current Ticket

| Ticket | Goal | Status | Notes |
|---|---|---|---|
| None active | No ticket is currently open. | Closed | T0155 is complete; start T0156 before making the next scoped change. |

## Confirmed Next Tickets

| Ticket | Goal | Status | Notes |
|---|---|---|---|
| `T0156` | Configure separate park-test frontend API target. | Planned | Same phone/admin source code; separate deployment/env target; no direct Roller calls from frontend. |
| `T0157` | Run Live quote/cost smoke. | Planned | Quote/cost only after explicit ticket start. No draft, payment, redeem, webhook registration, frontend traffic, SMS, or email. |
| `T0158` | Controlled Live draft smoke. | Planned | One controlled draft only after explicit approval and write-gate handling. No payment or redeem. |

Broad future planning lives in [docs/roadmap/backlog.md](docs/roadmap/backlog.md).

## Validation Status

Historical validation evidence is archived in [docs/history/validation-log.md](docs/history/validation-log.md).

- T0155 local validation, Roller Live webhook registration, duplicate check, and safe intake smoke are recorded in [docs/t0155-live-webhook-registration.md](docs/t0155-live-webhook-registration.md).
- T0154 local validation and dry-run output are recorded in [docs/t0154-live-webhook-dry-run.md](docs/t0154-live-webhook-dry-run.md).
- T0153 local validation and successful Live read-only preflight are recorded in [docs/t0153-roller-live-readonly-preflight.md](docs/t0153-roller-live-readonly-preflight.md).
- T0145 through T0152 closeout validation is recorded in [docs/history/validation-log.md](docs/history/validation-log.md).
- Recent closeout validation for T0128 through T0144 is recorded in [docs/history/validation-log.md](docs/history/validation-log.md).

## Current Risks And Open Questions

- T0150 deployed `jumpyard-check-in-park-test-stack` to `CREATE_COMPLETE`. API endpoint: `https://ij4rnaui2b.execute-api.eu-north-1.amazonaws.com`; Aurora cluster: `jumpyard-check-in-park-test-aurora`; raw bucket: `jumpyard-check-in-park-test-raw-376129878018-eu-north-1`.
- T0151 applied SQL migrations `0001` through `0008` to the dedicated park-test Aurora database; key operational data tables checked in T0151 remained empty.
- T0152 deployed park-test gates for staff auth, guest message sends, webhook processing, booking draft/payment-start writes, redeem writes, and emergency stop. Park-test has `JUMPYARD_EMERGENCY_STOP=true` and all sensitive operation gates closed.
- T0153 passed the first Roller Live read-only preflight for JumpYard Nacka Forum using `/jumpyard-check-in-park-test/roller/credentials`. Confirmed venue id `50871`, 60-minute entry product ids, availability reads, and payment settings visibility.
- T0155 registered Roller Live webhook id `1465`, but park-test webhook processing remains disabled. A real Roller delivery should currently be acknowledged and ignored until a future scoped ticket opens processing.
- T0148 uses placeholder explicit CORS origins in `infra/config/park-test.json`; T0156 must replace or confirm real park-test phone/admin origins before visitor testing.
- The park-test plan is not an approval to create additional AWS resources, call new Roller Live endpoints, create drafts/payments, redeem tickets, or run visitor traffic; those actions remain gated by scoped future tickets and explicit approvals.
- Production readiness remains partial; active future work is tracked in [FOLLOWUPS.md](FOLLOWUPS.md), [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md), and [docs/roadmap/backlog.md](docs/roadmap/backlog.md).
- Unrelated local work was stashed as `stash@{0}: pre-t0128-local-unrelated-work` before the T0128 branch was created.
