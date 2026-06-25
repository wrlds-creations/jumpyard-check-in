# Repo Current State

Use this file as the short operational snapshot of what actually exists in the repository. Historical detail lives in the linked archives.

## Snapshot

- Date: 2026-06-25
- Current branch: `codex/t0167-receipt-confirmation-handling`
- Current status: No active ticket; T0167 completed locally and pushed on the ticket branch.
- Current ticket: None active
- Completed tickets: archived in `docs/history/completed-tickets.md` (166 completed tickets; latest `T0167`).
- Recommended next step: deploy the latest receipt branch when ready, then run the controlled receipt email proof on 2026-06-26 before T0168 frontend redeem rehearsal.

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

T0156-T0167 current park-test status:

- Park-test Cloudflare Pages projects exist for phone/admin and point at `https://ij4rnaui2b.execute-api.eu-north-1.amazonaws.com`.
- T0157 passed a guarded Roller Live quote/cost smoke; T0158 created one controlled Roller Live draft `f81e46e5-5cf7-4193-b578-44a1b8140599`.
- T0159 completed one internal paid Live booking through the park-test phone PWA: Roller booking reference `166447399`, status `Paid`, total `200`, amount owing `0`.
- T0160 proved controlled Live existing-booking lookup for `166447399`; Aurora now contains the safe normalized booking snapshot, prepayment draft `jypd_56a8f1ca817c42a4b7` is `published`, and one `prepayment_draft.published` event is recorded.
- The user manually refunded the T0159 internal paid booking after T0160; refund handling remains outside the app unless a later ticket explicitly scopes it.
- T0161 verified Live catalog/index readiness: 6/6 entry parents and 4/4 park-test add-ons were found for Nacka; first assisted park test should use REST-on-demand booking lookup rather than broad same-day import.
- T0162 opened a scoped gate for booking `166490323`, proved exact Live lookup and Live add-on availability, then stopped safely at add-product quote with `original_booking_contact_unresolved`; no add-on draft, payment, booking link, or add-product event was created, and the normal closed `park-test.json` config was redeployed.
- T0163 found the missing contact path: booking detail exposes `customerId`, and `GET /guests/{customerId}` exposes complete first/last/email/phone. The BookingHandler now has this fallback deployed with normal park-test gates closed.
- T0164 completed the controlled retry of the existing-booking add-on payment path through the park-test phone frontend for booking `166490323`. The user paid one socks add-on; Roller Live readback returned linked add-on booking `166497194`, status `Paid`, total `45`, amount owing `0`.
- T0165 reconciled the paid linked add-on booking through a scoped settlement gate. Aurora now marks prepayment draft `jypd_8bdb1d1035b84d30b2` and booking link `jyl_f35c09033efb40ba94` as `published`, with linked booking reference `166497194`, and the normal closed config is redeployed.
- T0166 completed one controlled Live ticket redemption for original booking `166490323`, Roller unique id `9ae484b0-d9a9-4dad-b3d5-4ad3b0e25088`, and ticket `166490323-560714728`. The smoke used the park-test phone/admin session flow and Roller Live `POST /redemptions` returned HTTP `200`; Aurora marks session `jycs_mqtimdxf_bb33c94c` as `redeemed` and handoff `completed`.
- T0167 fixed the PWA receipt/confirmation code path after the T0159 and T0164 payments produced no guest receipt email. Code trace found the PWA sent `sendConfirmations=false`; phone new-booking and add-on draft requests now send `sendConfirmations=true`, backend event logs expose the safe flag, and guest copy points to Roller confirmation/receipt email. Actual Roller email delivery remains to be proven on the next controlled paid PWA transaction after deployment.
- Public API draft writes, Live lookup, redeem writes, staff auth, webhook processing, SMS, and email are closed again; normal visitor traffic remains gated.

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

- Archived completed-ticket count: 166
- Latest completed ticket: `T0167`
- Current active ticket: None active

## Current Ticket

| Ticket | Goal | Status | Notes |
|---|---|---|---|
| None active | - | No active ticket. | T0167 completed locally on branch `codex/t0167-receipt-confirmation-handling`; actual Live receipt email delivery still needs proof on the next controlled paid PWA transaction after deployment. |

## Confirmed Next Tickets

| Ticket | Goal | Status | Notes |
|---|---|---|---|
| `T0168` | Frontend redeem rehearsal. | Planned | Love tests the deployed phone/admin redeem flow end to end before a real visitor; exact booking/ticket scope only if another redeem is needed. |
| `T0169` | Park-test UI/UX readiness. | Planned | Final guest/staff UI pass before assisted visitor testing; no new Live unlock by itself. |
| `T0170` | Staff-assisted visitor test. | Planned | Limited assisted visitor test after controlled smokes, receipt handling, frontend redeem rehearsal, UI/UX readiness, and park approval. |
| `T0171` | Outcome and go/no-go. | Planned | Documentation/report only. |

Broad future planning lives in [docs/roadmap/backlog.md](docs/roadmap/backlog.md).

## Validation Status

Historical validation evidence is archived in [docs/history/validation-log.md](docs/history/validation-log.md).

- Latest validation is recorded in [docs/t0167-receipt-confirmation-handling.md](docs/t0167-receipt-confirmation-handling.md).
- Older validation is archived in [docs/history/validation-log.md](docs/history/validation-log.md) and the referenced ticket docs.

## Current Risks And Open Questions

- Park-test AWS exists with dedicated API, Aurora, raw bucket, secrets, and gates; current resource details are in [AWS_RESOURCES.md](AWS_RESOURCES.md).
- Roller Live access, webhook registration, frontend target setup, first quote/cost smoke, first controlled draft smoke, first internal paid booking smoke, controlled lookup, Live catalog/index readiness, guest-detail contact resolution, controlled existing-booking add-on payment, scoped linked add-on settlement reconciliation, and controlled Live redeem have passed for Nacka, but public API writes, staff auth, and redeem are closed again and guest-data reads remain scoped-ticket gated.
- The park-test plan is not an approval to create additional AWS resources, call new Roller Live endpoints, create drafts/payments, redeem additional tickets, or run visitor traffic.
- Production readiness remains partial; active future work is tracked in [FOLLOWUPS.md](FOLLOWUPS.md), [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md), and [docs/roadmap/backlog.md](docs/roadmap/backlog.md).
- Unrelated local work was stashed as `stash@{0}: pre-t0128-local-unrelated-work` before the T0128 branch was created.
