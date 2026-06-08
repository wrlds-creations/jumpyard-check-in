# CODEX_TASK.md

## Ticket ID
T0105

## Goal
Clean up the existing-booking add-on flow before the Gustav demo, without changing Roller payment, backend, AWS, or redemption behavior.

## Context
- The public phone app can now buy entry, add products, pay, and proceed to check-in.
- Existing-booking add-on flow has several UI/demo blockers:
  - Booking summary says the next step is safety video even though existing bookings go to add-ons first.
  - Existing-booking add-ons still show unsupported future items such as Connected/extra person.
  - Add-on review/payment states can show duplicate back links.
  - Add-on review CTA says `Reservera tillägg` and shows a check icon, which is unclear before payment.
  - Add-on review list lacks the same JumpYard product icons as the new-booking flow.
  - Ready-for-staff handout copy says generic `Armband` instead of the actual entry product.

## Allowed Areas
- `CODEX_TASK.md`
- `PROJECT_CONTEXT.md`
- `DECISIONS.md`
- `REPO_CURRENT_STATE.md`
- `FOLLOWUPS.md`
- `TEST_PLAN.md`
- `jumpyard-checkin-phone/src/components/BookingSummary.tsx`
- `jumpyard-checkin-phone/src/components/AddonsOffer.tsx`
- `jumpyard-checkin-phone/src/components/ConfirmationScreen.tsx`
- `jumpyard-checkin-phone/src/context/LanguageContext.tsx`
- `jumpyard-checkin-phone/src/flow/types.ts`

## Do Not Touch
- Roller Live
- Production credentials
- `.env`
- AWS resources or deploys
- Aurora migrations
- Staff/admin backend behavior
- Payment package internals
- Redemption logic
- SMS/email logic
- Broad dynamic add-on catalog

## Requirements

1. Document the near-term roadmap:
   - `T0105`: existing-booking add-on UI cleanup.
   - `T0106`: SkyRider consent before payment in both new-booking and existing-booking flows.
   - `T0107`: show linked add-on booking products in staff/handoff fulfillment.
   - `T0108`: demo regression smoke/runbook.

2. Existing booking summary cleanup:
   - Remove the visible `next step: safety video` hint.
   - Keep paid/unpaid and booking details unchanged.

3. Existing-booking add-on catalog cleanup:
   - Hide `Connected` and `extra person` from the existing-booking add-on picker for now.
   - Keep stock add-ons and SkyRider available when supported by the current backend.

4. Existing-booking add-on review cleanup:
   - Avoid duplicate back links inside add-on review/payment states.
   - Rename the review CTA from `Reservera tillägg` to a payment-forward label.
   - Remove the check icon from the review CTA.
   - Show JumpYard product icons next to review items.

5. Ready-for-staff handout copy:
   - Replace generic `Armband` wording with the actual entry product label when available.
   - Keep add-on handout behavior unchanged until T0107.

## Non-Goals
- Do not implement SkyRider height consent in T0105.
- Do not make linked add-on bookings appear in staff/admin in T0105.
- Do not change how add-on drafts/payments are created.
- Do not change Roller availability rules or product IDs.
- Do not introduce new backend endpoints.

## Acceptance Criteria
- Existing booking summary no longer says safety video is the next step.
- Existing-booking add-on picker no longer shows Connected or extra person.
- Add-on review has one back affordance, product icons, no CTA check icon, and clearer payment-forward CTA copy.
- Confirmation handout shows the entry product label instead of generic wristband copy.
- Source-of-truth docs record T0105 and the follow-up tickets T0106-T0108.

## Validation
- `npm --prefix jumpyard-checkin-phone run lint`
- `npm --prefix jumpyard-checkin-phone run build`
- Browser smoke on local phone app for an existing booking add-on flow, if feasible.
