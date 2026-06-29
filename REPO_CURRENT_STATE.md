# Repo Current State

Use this file as the short operational snapshot of what actually exists in the repository. Historical detail lives in the linked archives.

## Snapshot

- Date: 2026-06-29
- Current branch: `main`
- Current status: No active ticket; T0168 is completed locally and ready to merge.
- Current ticket: None active
- Completed tickets: archived in `docs/history/completed-tickets.md` (167 completed tickets; latest `T0168`).
- Recommended next step: start `T0169` post-payment booking sync, then continue to `T0170` park-test gate naming and runbook.

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
- Park-test Live existing-booking lookup smoke: [docs/t0160-live-existing-booking-lookup-smoke.md](docs/t0160-live-existing-booking-lookup-smoke.md)
- Park-test Live catalog and booking-index readiness: [docs/t0161-live-catalog-index-readiness.md](docs/t0161-live-catalog-index-readiness.md)
- Park-test existing-booking add-on smoke: [docs/t0162-existing-booking-addon-smoke.md](docs/t0162-existing-booking-addon-smoke.md)
- Park-test Live contact resolver: [docs/t0163-live-contact-resolver.md](docs/t0163-live-contact-resolver.md)
- Park-test existing-booking add-on payment smoke: [docs/t0164-existing-booking-addon-payment-smoke.md](docs/t0164-existing-booking-addon-payment-smoke.md)
- Park-test linked add-on settlement reconciliation: [docs/t0165-linked-addon-settlement-reconciliation.md](docs/t0165-linked-addon-settlement-reconciliation.md)
- Park-test controlled Live redeem smoke: [docs/t0166-controlled-live-redeem-smoke.md](docs/t0166-controlled-live-redeem-smoke.md)
- Park-test receipt and confirmation handling: [docs/t0167-receipt-confirmation-handling.md](docs/t0167-receipt-confirmation-handling.md)
- Park-test new-booking add-on visibility: [docs/t0168-new-booking-addon-visibility.md](docs/t0168-new-booking-addon-visibility.md)

Current park-test status:

- Park-test phone/admin Cloudflare Pages targets exist and point at the park-test API `https://ij4rnaui2b.execute-api.eu-north-1.amazonaws.com`.
- Roller Live access, webhook registration, quote/cost, controlled draft/payment, exact lookup, Live catalog readiness, existing-booking add-on payment, linked add-on settlement, one exact redeem, and new-booking Roller email proof have passed for Nacka.
- Aurora contains only scoped smoke/test state, including controlled booking `166447399`, add-on booking `166497194`, and redeem session `jycs_mqtimdxf_bb33c94c`; this is not a broad same-day booking import.
- T0168 found the missing new-booking add-ons were caused by backend Live phone add-on mapping being tied to the T0162 existing-booking add-on gate. BookingHandler now has a read-only `LIVE_PHONE_ADDON_PRODUCTS` mapping for Nacka Live add-ons while keeping write gates unchanged.
- Park-test new-booking draft writes were closed again after the T0167 receipt proof. Live lookup, existing-booking add-ons, redeem writes, staff auth, webhook processing, SMS, and JumpYard-owned email are closed; normal visitor traffic remains gated.

## Known Validation Commands

Current closeout entrypoints:

- `npm run validate`
- `npm run infra:check`
- `git diff --check`
- `npm --prefix infra run validate:roller-live-quote-smoke`
- `npm --prefix infra run validate:roller-live-draft-smoke`
- `npm --prefix infra run validate:roller-live-catalog-index-readiness`
- `npm --prefix infra run validate:roller-live-contact-resolver`
- `npm --prefix infra run synth:park-test-addon-settlement-smoke`
- `npm --prefix infra run synth:park-test-redeem-smoke`

Historical command evidence lives in [docs/history/validation-log.md](docs/history/validation-log.md) and ticket-specific docs.

## Completed Tickets

Completed-ticket history is archived in [docs/history/completed-tickets.md](docs/history/completed-tickets.md).

- Archived completed-ticket count: 167
- Latest completed ticket: `T0168`
- Current active ticket: None active

## Current Ticket

| Ticket | Goal | Status | Notes |
|---|---|---|---|
| None active | - | No active ticket. | T0168 fixed new-booking add-on visibility by separating read-only Live phone add-on mapping from write gates. |

## Confirmed Next Tickets

| Ticket | Goal | Status | Notes |
|---|---|---|---|
| `T0169` | Post-payment booking sync. | Planned | Make the PWA find/reconcile a newly paid booking or show an intentional staff fallback instead of the current "not synced" dead-end. |
| `T0170` | Park-test gate naming and runbook. | Planned | Rename/explain technical locks as human park-test modes with defaults, test-day settings, risk, owner, and rollback. |
| `T0171` | Park-test lookup mode. | Planned | Define safe Nacka/date-scoped existing-booking lookup for an unknown real visitor instead of exact booking-code allowlists. |
| `T0172` | Webhook and reconciliation readiness. | Planned | Decide REST-refresh versus webhook processing for payment settlement, add-ons, booking updates, and redeem confirmation during park-test. |
| `T0173` | Frontend redeem rehearsal. | Planned | Love tests the deployed phone/admin redeem flow end to end before a real visitor; exact booking/ticket scope only if another redeem is needed. |
| `T0174` | Park-test UI/UX readiness. | Planned | Final guest/staff UI pass before assisted visitor testing; no new Live unlock by itself. |
| `T0175` | Staff-assisted visitor test. | Planned | Limited assisted test after readiness gates, park approval, and runbook. |
| `T0176` | Outcome and go/no-go. | Planned | Documentation/report only. |

Broad future planning lives in [docs/roadmap/backlog.md](docs/roadmap/backlog.md).

## Validation Status

Historical validation evidence is archived in [docs/history/validation-log.md](docs/history/validation-log.md).

- Latest validation is recorded in [docs/t0168-new-booking-addon-visibility.md](docs/t0168-new-booking-addon-visibility.md).
- Older validation is archived in [docs/history/validation-log.md](docs/history/validation-log.md) and the referenced ticket docs.

## Current Risks And Open Questions

- Park-test AWS exists with dedicated API, Aurora, raw bucket, secrets, and gates; current resource details are in [AWS_RESOURCES.md](AWS_RESOURCES.md).
- Roller Live access, webhook registration, frontend target setup, first quote/cost smoke, first controlled draft smoke, first internal paid booking smoke, controlled lookup, Live catalog/index readiness, guest-detail contact resolution, controlled existing-booking add-on payment, scoped linked add-on settlement reconciliation, controlled Live redeem, and T0167 receipt email proof have passed for Nacka. Public draft writes, staff auth, broad lookup, existing-booking add-ons, redeem, webhook processing, SMS, and email remain scoped-ticket gated.
- The park-test plan is not an approval to create additional AWS resources, call new Roller Live endpoints, create drafts/payments, redeem additional tickets, or run visitor traffic.
- Production readiness remains partial; active future work is tracked in [FOLLOWUPS.md](FOLLOWUPS.md), [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md), and [docs/roadmap/backlog.md](docs/roadmap/backlog.md).
- Unrelated local work was stashed as `stash@{0}: pre-t0128-local-unrelated-work` before the T0128 branch was created.
