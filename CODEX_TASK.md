# CODEX_TASK.md

## Ticket ID
T0056

## Goal
Reconcile paid Roller draft bookings back to JumpYard Cloud prepayment draft state.

## Dependencies
- T0055 completed and merged.
- T0054 public Swish smoke confirmed that Roller can publish a paid Playground booking after payment.
- The public T0055 smoke created paid Roller booking `5063394`, while its local `prepayment_booking_drafts` row stayed `payment_pending`.

## Allowed areas
- CODEX_TASK.md
- PROJECT_CONTEXT.md
- DECISIONS.md
- REPO_CURRENT_STATE.md
- FOLLOWUPS.md
- AWS_RESOURCES.md
- TEST_PLAN.md
- infra/lambda/lookup/index.js
- infra/lambda/webhook/index.js

## Do not touch
- Phone UI
- Staff/admin UI
- Kiosk UI
- Payment package vendor files
- Aurora migrations or schema unless existing statuses are insufficient
- Package dependencies
- Production credentials
- Live Roller config
- `.env`
- SMS behavior
- Staff authentication behavior
- Unrelated local assets or deliverables

## Requirements

1. Reconcile paid new-booking draft state from lookup.
   - When `POST /v1/check-in/lookup` sees a settled Roller booking snapshot that matches a local prepayment draft, update the matching draft state.
   - Match by `prepayment_booking_drafts.roller_draft_unique_id = roller_bookings.roller_unique_id`.
   - Use the existing `published` status instead of adding a new schema status.

2. Reconcile paid draft state from webhook enrichment.
   - When Roller booking webhook enrichment fetches a settled booking snapshot, update the matching local prepayment draft state.
   - This must work for both new-booking drafts and linked add-product drafts.

3. Keep pending and unsafe states unchanged.
   - Do not mark a draft published when Roller still reports unpaid, pending, partial payment, or positive amount owing.
   - Do not treat Aurora-only pending state as payment truth.

4. Keep payment secrets safe.
   - Do not persist, log, print, or render raw `paymentJwt` values.
   - Store only safe lifecycle metadata and event-log summaries.

5. Add safe observability.
   - Write an idempotent `event_log` row when a prepayment draft is marked `published`.
   - The event payload must contain only safe ids/status metadata, not raw Roller payloads or contact PII.

## Non-goals
- Do not fix Roller/Adyen card method configuration.
- Do not change the payment UI.
- Do not add a new payment webhook endpoint.
- Do not implement payment refunds, gift cards, memberships, or discounts.
- Do not change existing-booking add-product UX.
- Do not create a new Aurora migration unless the existing status values cannot represent the lifecycle.
- Do not write to Roller Live/production.

## Acceptance criteria
- A paid Roller booking that originated from `prepayment_booking_drafts` changes the matching local draft from `payment_pending` or `payment_blocked` to `published`.
- Matching drafts have `amount_owing_cents=0` when the authoritative Roller snapshot is settled.
- The reconciliation works from lookup and webhook enrichment paths.
- Pending/unpaid Roller snapshots do not change local draft status to `published`.
- `event_log` records a safe `prepayment_draft.published` event.
- `npm run validate` passes.
- Infra build/synth passes.

## Manual verification
- Deploy the lookup/webhook Lambda changes to dev if validation passes.
- Trigger lookup for known paid Playground booking `5063394`.
- In Aurora, confirm the matching `jumpyard.prepayment_booking_drafts` row is `published`.
- In Aurora, confirm a `jumpyard.event_log` row with event type `prepayment_draft.published` exists.
- Confirm no raw `paymentJwt`, access token, or secret is printed during verification.

## Automated validation
Run:
- `node --check infra/lambda/lookup/index.js`
- `node --check infra/lambda/webhook/index.js`
- `npm --prefix infra run build`
- `npm --prefix infra run synth:dev`
- `npm run validate`
- `git diff --check`
