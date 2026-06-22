# Repo Current State

Use this file as the short operational snapshot of what actually exists in the repository. Historical detail lives in the linked archives.

## Snapshot

- Date: 2026-06-22
- Current branch: `codex/t0153-roller-live-readonly-preflight`
- Current status: T0153 blocked on Live-capable Roller credentials.
- Current ticket: `T0153`
- Completed tickets: archived in `docs/history/completed-tickets.md` (151 completed tickets; latest `T0152`).
- Recommended next step: populate `/jumpyard-check-in-park-test/roller/credentials` with a Roller Live-capable credential or explicitly approve another read-only credential source, then rerun the T0153 preflight.

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

T0153 added hard-allowlisted Roller Live read-only preflight tooling. The actual Live data preflight is blocked because park-test credentials are placeholder-only and the documented dev fallback source is not accepted by Roller Live auth. App roots remain unchanged: `jumpyard-checkin-phone/`, `jumpyard-checkin-admin/`, and `jumpyard-checkin-kiosk/`.

## Known Validation Commands

| Command | Purpose | Notes |
|---|---|---|
| `node scripts/validate-current-ticket.js` | Verify `CODEX_TASK.md` and `REPO_CURRENT_STATE.md` agree on active/no-active ticket state. | Does not call GitHub, AWS, Roller, or the network. |
| `node scripts/validate-followups.js` | Verify active followups have unique ids and no Done/Closed rows under Open. | Reads `FOLLOWUPS.md` and `docs/history/followups-done.md`. |
| `node scripts/validate-history-archives.js` | Verify required history/backlog files exist and active docs link to them. | Added in T0128. |
| `npm run validate` | Run the root documentation/workflow validators. | Required after source-of-truth changes. |
| `git diff --check` | Check whitespace in the working diff. | Required before closeout/commit. |
| `npm --prefix infra run validate:config-guards` | Prove dev/park-test config guard behavior. | Added in T0147; local only, no AWS or Roller calls. |
| `npm --prefix infra run synth:park-test` | Synthesize the park-test CDK stack from `infra/config/park-test.json`. | Added in T0148; local only, no deploy. |
| `npm --prefix infra run validate:park-test-synth` | Synthesize dev and park-test templates locally and verify separation. | Added in T0148; no AWS or Roller calls. |
| `npm --prefix infra run validate:roller-live-readonly-preflight` | Prove the T0153 Roller Live preflight script refuses write-like and sensitive endpoints. | Local only; no AWS or Roller calls. |
| `npm --prefix infra run preflight:roller-live:park-test` | Run the T0153 Roller Live read-only preflight. | Reads AWS config/secrets and calls Roller only after credentials work. Currently blocked by Live auth. |
| `npm run infra:check` | Type-check infra, run config-guard validation, and synthesize the example dev stack. | Local synth only; does not deploy or call Roller. |
| App-specific lint/build commands | Validate phone/admin/kiosk app changes when a ticket touches app code. | Not required for T0153 because app code was unchanged. |
| AWS/infra commands | Validate or deploy infra only when a scoped ticket allows AWS work. | T0153 may read AWS config/secrets for park-test preflight only. Do not create/change AWS resources or print secret values. |

## Completed Tickets

Completed-ticket history is archived in [docs/history/completed-tickets.md](docs/history/completed-tickets.md).

- Archived completed-ticket count: 151
- Latest completed ticket: `T0152`
- Current active ticket: `T0153`

## Current Ticket

| Ticket | Goal | Status | Notes |
|---|---|---|---|
| `T0153` | Run Roller Live read-only preflight for JumpYard Nacka. | Blocked | Park-test Roller credentials are placeholder-only; explicit dev fallback credentials failed Roller Live auth with HTTP `400`. No Live data reads occurred. |

## Confirmed Next Tickets

| Ticket | Goal | Status | Notes |
|---|---|---|---|
| `T0154` | Prepare Live webhook dry-run. | Blocked | Waits for a successful T0153 Live read-only preflight. Dry-run only when unblocked. |
| `T0157` | Run Live quote/cost smoke. | Blocked | Waits for a successful T0153 Live read-only preflight and explicit quote/cost scope. |

Broad future planning lives in [docs/roadmap/backlog.md](docs/roadmap/backlog.md).

## Validation Status

Historical validation evidence is archived in [docs/history/validation-log.md](docs/history/validation-log.md).

- T0153 local validation and blocked Live auth result are recorded in [docs/t0153-roller-live-readonly-preflight.md](docs/t0153-roller-live-readonly-preflight.md).
- T0152 local and deploy validation is recorded in [docs/t0152-park-test-secrets-gates.md](docs/t0152-park-test-secrets-gates.md).
- T0151 closeout validation is recorded in [docs/history/validation-log.md](docs/history/validation-log.md).
- T0150 closeout validation is recorded in [docs/history/validation-log.md](docs/history/validation-log.md).
- T0149 closeout validation is recorded in [docs/history/validation-log.md](docs/history/validation-log.md).
- T0148 closeout validation is recorded in [docs/history/validation-log.md](docs/history/validation-log.md).
- T0147 closeout validation is recorded in [docs/history/validation-log.md](docs/history/validation-log.md).
- T0146 closeout validation is recorded in [docs/history/validation-log.md](docs/history/validation-log.md).
- T0145 closeout validation is recorded in [docs/history/validation-log.md](docs/history/validation-log.md).
- T0144 closeout validation is recorded in [docs/history/validation-log.md](docs/history/validation-log.md).
- Recent closeout validation for T0129 through T0143 is recorded in [docs/history/validation-log.md](docs/history/validation-log.md).
- T0128 baseline/archive validation history and older validation-command inventory are archived in [docs/history/validation-log.md](docs/history/validation-log.md).

## Current Risks And Open Questions

- T0150 deployed `jumpyard-check-in-park-test-stack` to `CREATE_COMPLETE`. API endpoint: `https://ij4rnaui2b.execute-api.eu-north-1.amazonaws.com`; Aurora cluster: `jumpyard-check-in-park-test-aurora`; raw bucket: `jumpyard-check-in-park-test-raw-376129878018-eu-north-1`.
- T0151 applied existing SQL migrations `0001` through `0008` to the dedicated park-test Aurora database. Park-test now has the `jumpyard` schema and 19 `jumpyard` tables; key operational data tables checked in T0151 remained empty.
- T0151 did not populate Roller Live credentials, call Roller Live, run imports, register webhooks, create drafts/payments, redeem tickets, send SMS/email, connect frontend traffic, change app behavior, or write to dev DB.
- T0152 deployed park-test gates for staff auth, guest message sends, webhook processing, booking draft/payment-start writes, redeem writes, and emergency stop. Park-test Lambda env readback confirmed `JUMPYARD_EMERGENCY_STOP=true` and all sensitive operation gates closed.
- T0153 is blocked before Live data reads: `/jumpyard-check-in-park-test/roller/credentials` is placeholder-only, and `/jumpyard-check-in-dev/roller/credentials` was not accepted by Roller Live token auth. T0154/T0157 should not proceed until Live read-only auth succeeds.
- T0150 found and fixed a park-test deploy stop risk: SNS SMS delivery-status custom resource would have changed account-wide SNS SMS attributes. That custom resource is now dev-only, and account SMS attributes still point to the dev delivery-status role.
- The park-test plan is not an approval to create AWS resources, call Roller Live, register Live webhooks, create drafts/payments, redeem tickets, or run visitor traffic; those actions remain gated by scoped future tickets and explicit approvals.
- The T0146 contract keeps park-test in AWS account `376129878018`, region `eu-north-1`, but requires separate future resources under namespace `jumpyard-check-in-park-test` and its own database, secrets, API, queues, schedules, logs, alarms, and frontend API target.
- T0147 config guards make dev fail closed against Roller Live and make park-test fail closed unless the config matches the T0146 contract and keeps confirmed scheduled sends off.
- T0148 found and handled the S3 bucket name limit for park-test raw payload storage; park-test uses compact `-raw-` bucket suffix while dev keeps its existing `-raw-payloads-` pattern.
- T0148 uses placeholder explicit CORS origins in `infra/config/park-test.json`; T0156 must replace or confirm real park-test phone/admin origins before visitor testing.
- T0151 reconciled the older `AWS_RESOURCES.md` docs drift: dev read-only verification showed migrations through `0008`, matching the schema inventory and migration files.
- Production readiness remains partial; active future work is tracked in [FOLLOWUPS.md](FOLLOWUPS.md), [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md), and [docs/roadmap/backlog.md](docs/roadmap/backlog.md).
- Unrelated local work was stashed as `stash@{0}: pre-t0128-local-unrelated-work` before the T0128 branch was created.
