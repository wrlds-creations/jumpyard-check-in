# Repo Current State

Use this file as the short operational snapshot of what actually exists in the repository. Historical detail lives in the linked archives.

## Snapshot

- Date: 2026-06-29
- Current branch: `codex/t0176-frontend-redeem-rehearsal`
- Current status: T0176 full-flow rehearsal is deployed for Love's manual test. Nacka/date-scoped payment, lookup, add-ons, staff auth, and redeem are open; webhook processing, SMS, and JumpYard email remain closed.
- Current ticket: `T0176`
- Completed tickets: archived in `docs/history/completed-tickets.md` (174 completed tickets; latest closed `T0175`).
- Recommended next step: Commit/merge/deploy the T0176 manual feedback fix pass, then Love retests the park-test phone/admin flow before closing the window with normal `park-test.json`.

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
- Park-test post-payment booking sync: [docs/t0169-post-payment-booking-sync.md](docs/t0169-post-payment-booking-sync.md)
- Park-test gate naming and runbook: [docs/t0170-park-test-gate-runbook.md](docs/t0170-park-test-gate-runbook.md)
- Park-test lookup mode: [docs/t0171-park-test-lookup-mode.md](docs/t0171-park-test-lookup-mode.md)
- Park-test webhook and reconciliation readiness: [docs/t0173-webhook-reconciliation-readiness.md](docs/t0173-webhook-reconciliation-readiness.md)
- Park-test ready-for-entry handout UI: [docs/t0174-ready-entry-handout-ui.md](docs/t0174-ready-entry-handout-ui.md)
- Park-test payment method readiness: [docs/t0175-payment-method-readiness.md](docs/t0175-payment-method-readiness.md)
- Park-test frontend redeem rehearsal: [docs/t0176-frontend-redeem-rehearsal.md](docs/t0176-frontend-redeem-rehearsal.md)

Current park-test status:

- Park-test phone/admin Cloudflare Pages targets exist; phone was direct-deployed with the park-test API URL after an incorrect dev-fallback build was found.
- Roller Live access and controlled quote/draft/payment/lookup/add-on/settlement/redeem/receipt/sync smokes have passed for Nacka.
- Aurora contains only scoped smoke/test state, including controlled booking `166447399`, add-on booking `166497194`, and redeem session `jycs_mqtimdxf_bb33c94c`; this is not a broad same-day booking import.
- T0168 found the missing new-booking add-ons were caused by backend Live phone add-on mapping being tied to the T0162 existing-booking add-on gate. BookingHandler now has a read-only `LIVE_PHONE_ADDON_PRODUCTS` mapping for Nacka Live add-ons while keeping write gates unchanged.
- T0170 documents the human park-test gate names and maps them to current CDK config keys and Lambda environment variables. The current runtime variable names still include ticket numbers until a separate migration is scoped.
- Park-test payment-sync smoke mode was closed after Apple Pay was paused pending external diagnostics.
- BookingHandler accepts Live child variations only when Roller availability returns them under approved Nacka entry/family parents; quote smokes passed for E60 `1189809` and F60 `1189818`.
- T0171 assisted lookup was proven for `2026-06-29` through `2026-07-05`, but is temporarily closed while T0176 frontend redeem rehearsal mode is deployed.
- T0172 found no documented safe Roller Rest API path for public guest email lookup. If a visitor lacks their booking code, staff should search Roller Venue Manager by email and enter the discovered booking code into the T0171 PWA lookup.
- T0173 recommends keeping Live webhook processing closed for the first assisted park-test. Payment/add-on confirmation should use scoped REST refresh; redeem confirmation should use the synchronous Roller `POST /redemptions` success plus Aurora audit and manual Roller fallback if the result is uncertain.
- T0174 restores the ready-for-entry handout UI: the phone final screen shows a visible QR/handoff code and entry product/duration, and the admin handout detail groups wristbands by duration when available.
- T0175 adds the Apple Pay domain-association file and Cloudflare `_headers` rule to the phone app. The association file is live on `https://jumpyard-check-in-park-test.pages.dev/.well-known/apple-developer-merchantid-domain-association`; Apple Pay opens on iPhone but collapses at processing, so the code track is paused pending Pabel/Roller/Adyen logs and card remains fallback.
- T0176 currently deploys an assisted full-flow rehearsal window; webhook/message gates remain closed. A code-only manual feedback fix pass now updates ready-for-entry handout copy/icons, product quantities, existing-booking add-on loading/review/socks defaults, and POS booking display-name normalization; it still needs deploy/merge before the park-test URLs show it.

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
- `npm --prefix infra run synth:park-test-frontend-redeem-rehearsal`
- `npm --prefix infra run synth:park-test-full-flow-rehearsal`

Historical command evidence lives in [docs/history/validation-log.md](docs/history/validation-log.md) and ticket-specific docs.

## Completed Tickets

Completed-ticket history is archived in [docs/history/completed-tickets.md](docs/history/completed-tickets.md).

- Archived completed-ticket count: 174
- Latest closed ticket: `T0175`
- Current active ticket: `T0176`

## Current Ticket

| Ticket | Goal | Status | Notes |
|---|---|---|---|
| `T0176` | Frontend redeem and assisted full-flow rehearsal. | Manual test window open | Full-flow gate is deployed for Nacka/date scope; webhook processing and JumpYard guest sends remain closed. |

## Confirmed Next Tickets

| Ticket | Goal | Status | Notes |
|---|---|---|---|
| `T0177` | Park-test UI/UX readiness. | Planned | Final guest/staff UI pass before assisted visitor testing; no new Live unlock by itself. |
| `T0178` | Staff-assisted visitor test. | Planned | Limited assisted test after readiness gates, park approval, and runbook. |
| `T0179` | Outcome and go/no-go. | Planned | Documentation/report only. |

Broad future planning lives in [docs/roadmap/backlog.md](docs/roadmap/backlog.md).

## Validation Status

Historical validation evidence is archived in [docs/history/validation-log.md](docs/history/validation-log.md).

- Latest validation is recorded in [docs/t0176-frontend-redeem-rehearsal.md](docs/t0176-frontend-redeem-rehearsal.md).
- Older validation is archived in [docs/history/validation-log.md](docs/history/validation-log.md) and the referenced ticket docs.

## Current Risks And Open Questions

- Park-test AWS exists with dedicated API, Aurora, raw bucket, secrets, and gates; current resource details are in [AWS_RESOURCES.md](AWS_RESOURCES.md).
- Roller Live access and controlled smokes through receipt/sync/redeem have passed for Nacka. The T0176 full-flow rehearsal window is currently open for Love's manual test.
- The current window allows real Live bookings/payments/add-ons and scoped redeem through the deployed park-test flow. It does not allow webhooks, JumpYard-owned guest messages, broad same-day imports, new AWS resources, or broader venue/date scope.
- Production readiness remains partial; active future work is tracked in [FOLLOWUPS.md](FOLLOWUPS.md), [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md), and [docs/roadmap/backlog.md](docs/roadmap/backlog.md).
- Unrelated local work was stashed as `stash@{0}: pre-t0128-local-unrelated-work` before the T0128 branch was created.
