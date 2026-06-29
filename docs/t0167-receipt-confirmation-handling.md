# T0167 Receipt And Confirmation Handling

## Goal

Resolve receipt/confirmation handling for park-test PWA payments so guests who create a new booking or buy add-ons through the PWA have a clear receipt path.

## Scope

- Investigate why the T0159 new-booking payment and the T0164 existing-booking add-on payment did not send an obvious guest receipt email.
- Keep receipt handling inside the existing PWA -> JumpYard Cloud -> Roller path.
- Do not create a new Live booking, take a new payment, refund, redeem, import broad booking data, enable SMS/email sending, or run visitor traffic in this ticket.

## Finding

The missing email path was caused by our own PWA request payload.

The booking Lambda already accepts and forwards `sendConfirmations` into the Roller `POST /bookings/draft` payload:

- `normalizeDraftRequest` reads `body.sendConfirmations === true`.
- `normalizeAddProductDraftRequest` reads `body.sendConfirmations === true`.
- `buildRollerBookingPayload` sends `sendConfirmations: request.sendConfirmations === true`.

But the phone frontend sent `sendConfirmations: false` in both paid PWA paths:

- New-booking drafts from `createDraftBooking`.
- Existing-booking add-on drafts from `createAddProductDraft`.

Plain-language version: the pipe to Roller was there, but the PWA was putting a note on the order that said "do not send confirmations".

## Implementation

T0167 changes the phone PWA to request Roller-native confirmations:

- New booking draft requests now send `sendConfirmations: true`.
- Existing-booking add-on draft requests now send `sendConfirmations: true`.

T0167 also adds safe operational visibility:

- `booking.draft_published_no_payment` event payloads include `sendConfirmations`.
- `booking.draft_succeeded` event payloads include `sendConfirmations`.
- `booking.add_product_draft_succeeded` event payloads include `sendConfirmations`.

These event fields are safe booleans only; no email address, payment card data, raw JWT, or raw Roller payload is logged.

Guest-facing copy now says that Roller sends the confirmation and receipt to the booking email after payment completes.

## Receipt Model

For park-test, Roller remains the receipt sender.

JumpYard Cloud should not send a separate receipt email in T0167 because:

- Roller owns the booking and payment of record.
- The PWA already creates the booking/payment through Roller's draft/payment flow.
- Park-test JumpYard SMS/email sending remains closed and out of scope.
- Duplicate receipts could confuse guests and staff unless designed as a later production messaging feature.

## Remaining Manual Proof

This ticket verifies the code path, not actual Live email delivery.

The actual email delivery still needs one future controlled proof after this branch is deployed:

- Create or add to a booking through the park-test PWA.
- Confirm the Roller booking/payment succeeds.
- Confirm the guest receives the Roller confirmation/receipt at the booking email.
- If no email arrives with `sendConfirmations=true`, treat that as a Roller/HQ/live-venue configuration issue or as a later JumpYard-owned receipt-email ticket.

No new paid transaction was created in T0167.

## Post-Merge Deploy Note

On 2026-06-26, T0167 was squash-merged to `main`, the park-test `BookingHandler` code was deployed, and the phone/admin Cloudflare Pages projects were direct-deployed from latest `main` through Wrangler because Git-triggered Pages deployments had not run since T0156.

The stable park-test phone URL was verified to serve the new bundle:

```text
https://jumpyard-check-in-park-test.pages.dev/
```

Verification found `sendConfirmations=true`, no remaining `sendConfirmations=false` marker in the phone bundle, and the park-test API base URL `https://ij4rnaui2b.execute-api.eu-north-1.amazonaws.com`.

The T0159 payment-smoke gate was then temporarily opened for one controlled new-booking receipt proof:

```text
JUMPYARD_EMERGENCY_STOP=true
ENABLE_ROLLER_BOOKING_DRAFT_WRITES=true
ENABLE_T0159_LIVE_PAYMENT_SMOKE_DRAFT_WRITES=true
ENABLE_T0162_LIVE_ADDON_SMOKE=false
```

Close the gate with the normal `park-test.json` config after the proof.

## Receipt Proof Result

Love completed a paid park-test PWA new booking for `Love Worlds` on 2026-06-26 and received the Roller booking confirmation email. This confirms the T0167 receipt path works for new-booking payments.

The same run still showed the phone recovery state `Betalningen är klar men bokningen har inte hunnit synkas` after payment, and no add-ons were shown before payment. Those are follow-up app-readiness issues, not receipt-email failures.

After the proof, the normal closed `park-test.json` config was redeployed. Readback confirmed:

```text
JUMPYARD_EMERGENCY_STOP=true
ENABLE_ROLLER_BOOKING_DRAFT_WRITES=false
ENABLE_T0159_LIVE_PAYMENT_SMOKE_DRAFT_WRITES=false
ENABLE_T0162_LIVE_ADDON_SMOKE=false
```

## Validation Log

- `node --check infra/lambda/booking/index.js` passed.
- `npm --prefix infra run build` passed.
- `npm --prefix jumpyard-checkin-phone run lint` passed with four existing `@next/next/no-img-element` warnings.
- `npm --prefix jumpyard-checkin-phone run build` passed.
- `npm run validate` passed.
- `git diff --check` passed with line-ending normalization warnings only.
- `npm run infra:check` passed.

No paid Live smoke was run in T0167.
