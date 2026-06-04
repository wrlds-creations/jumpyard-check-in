# CODEX_TASK.md

## Ticket ID
T0102

## Goal
Polish the public phone buy-entry demo flow so it is clearer and more JumpYard-branded before the Playground demo.

## Dependencies
- T0101 completed and merged.
- The public phone app already supports buy entry, live availability, add-ons, gift card, Klippkort, Roller payment, safety, and staff handoff.
- Existing Roller Playground and JumpYard Cloud dev APIs remain unchanged.

## Allowed areas
- CODEX_TASK.md
- PROJECT_CONTEXT.md
- DECISIONS.md
- REPO_CURRENT_STATE.md
- FOLLOWUPS.md
- TEST_PLAN.md
- Existing phone app UI files
- Existing phone app translation/context files
- JumpYard phone icon references and newly referenced phone public icons if required by the UI

## Do not touch
- Roller Live
- Production credentials
- `.env`
- AWS resources
- Aurora migrations
- Backend Lambda behavior
- Staff/admin app
- Deliverables
- Payment package/vendor files
- SMS/email sending logic
- Raw secrets or raw payment JWT handling

## Requirements

1. Improve the time-selection loading moment:
   - Do not show all time buttons as individually loading.
   - Show one branded loading state with a JumpYard icon/logo feel.
   - Use clear copy such as fetching available places/capacity.

2. Move optional payment-code entry out of contact:
   - Contact should stay focused on name, email, and phone.
   - Gift card and Klippkort should be shown under the payment/review part of the flow.
   - Keep the server-side order correct: codes must still be included before quote/draft/payment.

3. Improve icon use:
   - Add a phone icon to the phone field.
   - Use JumpYard-created icons for payment, gift card, Klippkort, and basket rows where available.
   - Do not add placeholder icons when no suitable icon exists.

4. Polish the review/summary:
   - Add compact icons beside basket rows such as entry, socks, lock, coffee, and SkyRider.
   - Make the selected jump time explicit instead of showing a bare time value.
   - Remove the duplicate grey bottom total/time footer.
   - Keep the total/payment amount clear without repeating unnecessary totals.

5. Keep behavior scoped:
   - Do not change payment API contracts.
   - Do not change Roller payment package behavior.
   - Do not create bookings or make Roller writes as part of validation.

## Non-goals
- Do not implement new payment methods.
- Do not solve Swish/Apple Pay visibility.
- Do not change gift-card or Klippkort backend validation.
- Do not create demo bookings.
- Do not change staff handoff UI.
- Do not change SMS/email production unlock.
- Do not change production readiness or AWS alerting.

## Acceptance Criteria
- Buy-entry loading after time selection uses one branded loading card.
- Gift card and Klippkort inputs no longer appear in the contact step.
- Gift card and Klippkort inputs appear in a payment/review dropdown before draft creation.
- Updating gift card or Klippkort values requires an updated quote before the payment button is enabled.
- Review basket rows include JumpYard icons and clearer jump-time labeling.
- Payment surfaces use the JumpYard payment-card icon instead of a generic card icon.
- Phone app lint/build pass.
- Source-of-truth docs reflect T0102 scope and validation.

## Manual Verification
Open the phone app and walk the non-writing part of the buy-entry flow:

1. Choose `Köp entré`.
2. Pick a time and press `Fortsätt`.
3. Confirm the single branded loading card appears.
4. Confirm product capacity loads.
5. Continue to contact and confirm only contact fields appear.
6. Continue to summary and confirm payment-code dropdown, row icons, explicit jump time, and cleaner total presentation.

## Automated Validation
Run:
- `npm --prefix jumpyard-checkin-phone run lint`
- `npm --prefix jumpyard-checkin-phone run build`
- `npm run validate`
- `git diff --check`
