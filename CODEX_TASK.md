# CODEX_TASK.md

## Ticket ID

T0019

## Goal

Polish and verify the phone lookup path for webhook-created Aurora bookings, without changing payment or redeem behavior.

## Dependencies

- T0018 completed, pushed, and merged to `main`.
- Roller Playground booking webhook is registered against the dev endpoint.
- Dev `POST /v1/check-in/lookup` uses Aurora first and returns source/freshness metadata.
- Test booking `5032444` exists in Playground/Aurora from a real Roller webhook.

## Current Status

Completed locally on branch `codex/t0019-phone-lookup-polish`.

Validation result:

- `npm run validate`: passed.
- `cd jumpyard-checkin-phone && npm run lint`: passed with four pre-existing `<img>` warnings.
- `cd jumpyard-checkin-phone && npm run build`: passed.
- Dev API lookup for `5032444`: returned `found`, `payment_required`, `source.system=jumpyard_cloud`, `freshnessStatus=fresh`.
- Browser lookup at `http://localhost:3000`: booking `5032444` opens the booking summary, shows `Obetald`, keeps the check-in CTA disabled, and exposes stable non-visible metadata for source/freshness verification.

## Allowed Areas

- `CODEX_TASK.md`
- `PROJECT_CONTEXT.md`
- `DECISIONS.md`
- `REPO_CURRENT_STATE.md`
- `FOLLOWUPS.md`
- `TEST_PLAN.md`
- `jumpyard-checkin-phone/README.md`
- `jumpyard-checkin-phone/src/flow/cloudClient.ts`
- `jumpyard-checkin-phone/src/flow/types.ts`
- `jumpyard-checkin-phone/src/components/BookingLookup.tsx`
- `jumpyard-checkin-phone/src/components/BookingSummary.tsx`

## Do Not Touch

- Kiosk UI
- Admin UI
- Assets
- Deliverables
- Infra deploy code
- AWS resources
- Payment implementation
- Redeem implementation
- Booking creation implementation
- Production config
- Production credentials
- `.env`

## Requirements

1. Keep the phone app calling JumpYard Cloud only.
2. Preserve the current unpaid-booking behavior:
   - show the booking summary
   - show `Obetald`
   - keep the start-check-in CTA disabled
3. Carry lookup `source` metadata from JumpYard Cloud into the phone booking model.
4. Add stable test hooks for lookup input, submit, and booking summary verification.
5. Do not show internal source/freshness labels to guests by default.
6. Replace the hardcoded demo expected-date fallback with today's venue date in `Europe/Stockholm`, while still allowing `NEXT_PUBLIC_JUMPYARD_LOOKUP_EXPECTED_DATE` override.
7. Verify manually created Playground booking `5032444` can be found from the phone flow through Aurora.

## Non-Goals

- Do not implement redeem.
- Do not implement payment.
- Do not allow unpaid bookings to proceed into check-in.
- Do not change add-on behavior.
- Do not create or modify AWS resources.
- Do not write to Roller.
- Do not change app visual design beyond testability and lookup polish.

## Acceptance Criteria

- Booking `5032444` can be entered in the phone lookup flow.
- The phone flow shows the booking summary using JumpYard Cloud/Aurora data.
- The booking summary keeps unpaid check-in blocked.
- The booking summary exposes non-visible metadata confirming `source.system=jumpyard_cloud` and `freshnessStatus=fresh`.
- Phone lint and build pass.
- Root validation passes.
- No assets, deliverables, payment, redeem, AWS resource, production config, or `.env` files are changed.

## Manual Verification

Open:

```text
http://localhost:3000
```

Then:

1. Select `Jag har en bokning`.
2. Enter booking reference `5032444`.
3. Press `Sök`.
4. Confirm the booking summary opens.
5. Confirm the summary shows:
   - time `12:00-13:00` or equivalent rendered range
   - `1` jumper
   - product `Entré 60 min`
   - payment state `Obetald`
   - booking reference `5032444`
   - disabled CTA `Betalning krävs`

The browser automation also verified booking summary metadata:

```json
{
  "bookingReference": "5032444",
  "sourceSystem": "jumpyard_cloud",
  "freshness": "fresh",
  "refreshedFromRoller": "false",
  "paymentStatus": "PendingPayment",
  "amountOwing": "200"
}
```

## Automated Validation

Run:

- `npm run validate`
- `cd jumpyard-checkin-phone && npm run lint`
- `cd jumpyard-checkin-phone && npm run build`
