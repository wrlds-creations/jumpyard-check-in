# Repo Current State

Use this file as the short operational snapshot of what actually exists in the repository. Historical detail lives in the linked archives.

## Snapshot

- Date: 2026-06-24
- Current branch: `codex/t0159-internal-live-payment-smoke`
- Current status: No active ticket after T0159 closeout.
- Current ticket: None active
- Completed tickets: archived in `docs/history/completed-tickets.md` (158 completed tickets; latest `T0159`).
- Recommended next step: start `T0160` only after explicit approval, using paid booking `166447399` as the controlled Live lookup target or another approved paid booking.

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
- Park-test frontend target: [docs/t0156-park-test-frontend-target.md](docs/t0156-park-test-frontend-target.md)
- Park-test Live quote/cost smoke: [docs/t0157-live-quote-cost-smoke.md](docs/t0157-live-quote-cost-smoke.md)
- Park-test Live draft smoke: [docs/t0158-controlled-live-draft-smoke.md](docs/t0158-controlled-live-draft-smoke.md)
- Park-test internal Live payment smoke: [docs/t0159-internal-live-payment-smoke.md](docs/t0159-internal-live-payment-smoke.md)

T0156-T0159 current park-test status:

- Park-test Cloudflare Pages projects exist for phone/admin and point at `https://ij4rnaui2b.execute-api.eu-north-1.amazonaws.com`.
- T0157 passed a guarded Roller Live quote/cost smoke; T0158 created one controlled Roller Live draft `f81e46e5-5cf7-4193-b578-44a1b8140599`.
- T0159 completed one internal paid Live booking through the park-test phone PWA: Roller booking reference `166447399`, status `Paid`, total `200`, amount owing `0`.
- T0159 confirmed the post-payment phone sync fails because Live lookup remains gated; `T0160` owns that next controlled gate.
- Public API draft writes were closed again after T0159; visitor flow, lookup Live sync, payment/redeem writes, webhook processing, SMS, and email remain gated.

## Known Validation Commands

Current closeout entrypoints:

- `npm run validate`
- `npm run infra:check`
- `git diff --check`
- `npm --prefix infra run validate:roller-live-quote-smoke`
- `npm --prefix infra run validate:roller-live-draft-smoke`

Historical command evidence lives in [docs/history/validation-log.md](docs/history/validation-log.md) and ticket-specific docs.

## Completed Tickets

Completed-ticket history is archived in [docs/history/completed-tickets.md](docs/history/completed-tickets.md).

- Archived completed-ticket count: 158
- Latest completed ticket: `T0159`
- Current active ticket: None active

## Current Ticket

| Ticket | Goal | Status | Notes |
|---|---|---|---|
| None active | No active ticket. | None active | T0159 is complete; do not start T0160 until explicitly approved. |

## Confirmed Next Tickets

| Ticket | Goal | Status | Notes |
|---|---|---|---|
| `T0160` | Live existing-booking lookup smoke. | Planned | Prove booking-code lookup for one controlled Live booking through JumpYard Cloud; no all-day guest list. |
| `T0161` | Existing-booking add-on smoke. | Planned | Prove one controlled add-on path for an existing booking; original booking should not be directly mutated under current decisions. |
| `T0162` | Controlled Live redeem smoke. | Planned | Controlled booking only; no normal visitor traffic. |
| `T0163` | Staff-assisted visitor test. | Planned | Limited assisted visitor test after controlled smokes and park approval. |
| `T0164` | Outcome and go/no-go. | Planned | Documentation/report only. |

Broad future planning lives in [docs/roadmap/backlog.md](docs/roadmap/backlog.md).

## Validation Status

Historical validation evidence is archived in [docs/history/validation-log.md](docs/history/validation-log.md).

- Latest validation is recorded in [docs/t0159-internal-live-payment-smoke.md](docs/t0159-internal-live-payment-smoke.md).
- Older validation is archived in [docs/history/validation-log.md](docs/history/validation-log.md) and the referenced ticket docs.

## Current Risks And Open Questions

- Park-test AWS exists with dedicated API, Aurora, raw bucket, secrets, and gates; current resource details are in [AWS_RESOURCES.md](AWS_RESOURCES.md).
- Roller Live access, webhook registration, frontend target setup, first quote/cost smoke, first controlled draft smoke, and first internal paid booking smoke have passed for Nacka, but public API writes are closed again and guest-data reads remain scoped-ticket gated.
- The park-test plan is not an approval to create additional AWS resources, call new Roller Live endpoints, create drafts/payments, redeem tickets, or run visitor traffic.
- Production readiness remains partial; active future work is tracked in [FOLLOWUPS.md](FOLLOWUPS.md), [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md), and [docs/roadmap/backlog.md](docs/roadmap/backlog.md).
- Unrelated local work was stashed as `stash@{0}: pre-t0128-local-unrelated-work` before the T0128 branch was created.
