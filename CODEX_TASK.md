# CODEX_TASK.md

## Ticket ID
T0055

## Goal
After a paid new buy-entry booking, continue directly into the check-in safety/QR flow and show a clear buy-entry progress indicator.

## Dependencies
- T0054 completed and merged.
- T0053 buy-entry basket order is live in the phone app.
- Roller card/scheme payment remains externally blocked; this ticket must not depend on card fields being enabled.

## Allowed areas
- CODEX_TASK.md
- PROJECT_CONTEXT.md
- DECISIONS.md
- REPO_CURRENT_STATE.md
- FOLLOWUPS.md
- TEST_PLAN.md
- jumpyard-checkin-phone/src/app/page.tsx
- jumpyard-checkin-phone/src/components/BuyTickets.tsx
- jumpyard-checkin-phone/src/context/LanguageContext.tsx
- jumpyard-checkin-phone/src/flow/machine.ts
- jumpyard-checkin-phone/src/flow/types.ts

## Do not touch
- AWS resources or CDK config
- Backend/Lambda code
- Aurora migrations
- Roller webhook registration
- Production credentials
- Live Roller config
- `.env`
- Payment package vendor files
- Package dependencies
- Staff/admin UI
- Kiosk UI
- Unrelated local assets or deliverables

## Requirements

1. Add a buy-entry progress indicator.
   - Show the full new-booking path when the guest chooses `Köp entré`.
   - Keep the visible steps compact: entry, add-ons, payment, safety, done.
   - Treat time, ticket selection, and jumper quantity as part of the `entry` step.
   - Treat contact, summary, and Roller payment as part of the `payment` step.
   - Treat safety as its own step.
   - Treat the final QR handoff/done screen as its own `done` step.
   - Match the existing JumpYard phone-app visual language and official icon assets.

2. Update buy-entry copy.
   - The review step should read as a booking summary before payment.
   - Replace `Reservera bokning` wording with payment-oriented wording.
   - Avoid saying card-only payment because Swish can work when configured.

3. Fix paid new-booking continuation.
   - After Roller payment approval and paid booking lookup, do not route back into the normal existing-booking summary/add-ons/payment loop.
   - Start or resume the JumpYard Cloud check-in session.
   - If the session is new/guest-in-progress, route directly to safety.
   - If the session is already ready for staff, route to the QR confirmation screen.
   - If the session is already completed/redeemed, show already checked in.

4. Keep existing-booking behavior unchanged.
   - `Jag har en bokning` lookup still uses the existing booking summary path.
   - Existing-booking add-products remain separate from this new-booking continuation ticket.

## Non-goals
- Do not fix Roller/Adyen card method configuration.
- Do not change payment package vendor code.
- Do not implement gift card, membership, discount, or multi-visit behavior.
- Do not create, deploy, or change AWS resources.
- Do not change staff/admin redeem logic.
- Do not change SMS, webhook, or Data API behavior.
- Do not create real production bookings or payments.

## Acceptance criteria
- Buy-entry flow shows a progress indicator from `Köp entré`.
- Progress indicator advances through entry, add-ons, payment, safety, and done.
- Paid new-booking continuation enters safety/QR instead of the existing-booking add-ons/payment loop.
- Existing-booking lookup behavior is unchanged.
- `npm --prefix jumpyard-checkin-phone run lint` passes.
- `npm --prefix jumpyard-checkin-phone run build` passes.
- `npm run validate` passes.

## Manual verification
- Open the phone app locally.
- Click `Köp entré`.
- Confirm progress labels appear: entry, add-ons, payment, safety, done.
- Select a time and entry product, continue through quantity and add-ons, and confirm the progress state advances.
- After a paid new-booking payment approval, confirm the guest continues to safety/QR instead of returning to the booking-summary/add-ons/payment loop.

## Automated validation
Run:
- `npm --prefix jumpyard-checkin-phone run lint`
- `npm --prefix jumpyard-checkin-phone run build`
- `npm run validate`
- `git diff --check`
