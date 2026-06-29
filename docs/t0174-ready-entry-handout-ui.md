# T0174 Ready-For-Entry Handout UI

## Goal

Restore the park-test ready-for-entry handout screen so guests and staff can clearly see:

- a visible QR/handoff code for staff handoff,
- the purchased entry ticket type/duration, such as 60/90/120 minutes,
- the handout items that staff should give out at check-in.

## Scope Completed

- Renumbered the active park-test readiness tickets:
  - `T0174` is Ready-for-entry handout UI.
  - `T0175` is Payment method readiness.
  - `T0176` is Frontend redeem rehearsal.
- Updated the phone confirmation screen to show a visible handoff QR and handoff code when a check-in session exists.
- Updated the phone handout list so the entry row no longer says only wristbands; it now also shows the booking product/duration.
- Updated the admin handout grouping so entry/wristband groups include duration when it can be derived from product text or start/end time.
- Kept the existing phone/admin design language and flow.

## Out Of Scope

- No Roller writes, payments, redemptions, refunds, webhook processing, SMS/email sends, AWS deploys, Cloudflare deploys, or visitor traffic.
- No payment-method investigation; that is now `T0175`.
- No frontend redeem rehearsal; that is now `T0176`.

## Validation

- `npm --prefix jumpyard-checkin-phone run lint` passed with existing `<img>` warnings only.
- `npm --prefix jumpyard-checkin-admin run lint` passed.
- `npm --prefix jumpyard-checkin-phone run build` passed.
- `npm --prefix jumpyard-checkin-admin run build` passed.
- `npm run validate` passed.
- `git diff --check` passed with existing CRLF normalization warnings only.
- Local phone dev server returned HTTP `200` at `http://127.0.0.1:3010/`.
- Local admin dev server returned HTTP `200` at `http://127.0.0.1:3011/`.
