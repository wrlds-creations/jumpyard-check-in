# T0164 Existing Booking Add-On Payment Smoke

## Goal

Retry the controlled existing-booking add-on payment path through the park-test phone frontend for Roller Live booking `166490323`, after T0163 added server-side guest-detail contact fallback.

## Scope

- Booking: `166490323` only.
- Add-on: one Live socks add-on, product `970338`, `45` SEK.
- Original booking must not be directly mutated.
- The add-on path may create a separate linked add-on draft/payment flow only after the user performs the phone frontend payment step.
- Redeem, webhook processing, staff auth, SMS, email, broad same-day booking indexing, and normal visitor traffic remain out of scope.

## AWS Gate Opening

Opened with:

```powershell
npx cdk deploy -c config=./config/park-test-live-addon-smoke.json --profile wrlds-dev --require-approval never
```

CDK diff changed only existing Lambda environment variables:

- `LookupHandler`
  - `ENABLE_T0160_LIVE_LOOKUP_SMOKE=false -> true`
  - `T0160_LIVE_LOOKUP_SMOKE_ALLOWED_IDENTIFIERS="" -> 166490323`
- `BookingHandler`
  - `ENABLE_ROLLER_BOOKING_DRAFT_WRITES=false -> true`
  - `ENABLE_T0162_LIVE_ADDON_SMOKE=false -> true`
  - `T0162_LIVE_ADDON_SMOKE_ALLOWED_IDENTIFIERS="" -> 166490323`

Readback after deploy:

- Lookup env: `park-test`, emergency stop `true`, lookup smoke `true`, allowlist `166490323`.
- Booking env: `park-test`, emergency stop `true`, draft writes `true`, T0159 internal payment smoke `false`, T0162 add-on smoke `true`, add-on allowlist `166490323`.

No new AWS resources were created.

## Preflight API Evidence

Safe API preflight before phone payment:

- `POST /v1/check-in/lookup`
  - HTTP `200`
  - status `found`
  - payment status `Paid`
  - amount owing `0`
  - source `jumpyard_cloud`
  - eligibility `ready`
- `POST /v1/bookings/166490323/add-products/quote`
  - HTTP `200`
  - status `quoted`
  - mode `separate_draft_booking`
  - item count `1`
  - total `45`
  - amount owing `45`
  - source endpoint `POST /bookings/draft/costs`
  - `wroteBooking=false`

## Manual Phone Frontend Test

The user completed the phone checkout/payment on:

```text
https://jumpyard-check-in-park-test.pages.dev
```

Manual result:

- Existing booking searched: `166490323`.
- Add-on selected: one socks add-on.
- User reported the add-on payment completed successfully in the phone PWA.

## Aurora And Roller Readback

Safe Aurora readback after payment found:

- Prepayment draft `jypd_8bdb1d1035b84d30b2`.
- Roller draft unique id `4a092241-6947-436a-97ea-04813a8404aa`.
- Flow type `add_product`.
- Original booking reference `166490323`.
- Add-on group `jyao_6024ae4dcd3b43ea9a`.
- Local status `payment_pending`.
- Total `4500` cents, amount owing `4500` cents at draft creation time.
- `payment_jwt_present=true` and `payment_config_available=true`.

Safe Aurora link readback found:

- Link `jyl_f35c09033efb40ba94`.
- Link type `add_product_draft`.
- Original booking reference `166490323`.
- Linked Roller unique id `4a092241-6947-436a-97ea-04813a8404aa`.
- Linked booking reference still `null`.
- Link status `payment_pending`.

Safe event readback found:

- `booking.add_product_quote_succeeded`.
- `booking.add_product_draft_succeeded`.

Direct read-only Roller Live verification of the linked add-on unique id returned:

- HTTP `200`.
- Linked add-on booking reference `166497194`.
- Status `Paid`.
- Total `45`.
- Amount owing `0`.
- Item count `1`.
- Ticket count `1`.

Conclusion:

- The add-on payment path works in Roller Live.
- The original booking was not directly mutated by JumpYard Cloud.
- JumpYard Cloud created the intended separate linked add-on draft and the user paid it successfully.
- Local Aurora state still needs settlement reconciliation for linked add-on payments: the paid Roller booking is known through readback, but the local prepayment draft/link stayed `payment_pending` because webhook processing and broad lookup/reconciliation were intentionally closed during this ticket.

## Closeout

Closed with:

```powershell
npx cdk deploy -c config=./config/park-test.json --profile wrlds-dev --require-approval never
```

Readback after closing:

- Lookup env: `park-test`, emergency stop `true`, lookup smoke `false`, allowlist empty.
- Booking env: `park-test`, emergency stop `true`, draft writes `false`, T0159 internal payment smoke `false`, T0162 add-on smoke `false`, add-on allowlist empty.
- `npx cdk diff -c config=./config/park-test.json --profile wrlds-dev --method=template` showed no differences.

Closed-gate API checks:

- `POST /v1/check-in/lookup` returned HTTP `409`, status `blocked`, code `live_lookup_disabled`.
- `POST /v1/bookings/166490323/add-products/quote` returned HTTP `409`, status `blocked`, code `live_addon_smoke_disabled`.

## Follow-Up

Add T0165 before controlled redeem:

- Reconcile a paid linked add-on booking back into Aurora without broad visitor traffic.
- Mark the prepayment draft as published after an authoritative settled Roller snapshot is observed.
- Update/verify the booking link so staff/admin can trust the add-on handout state.
- Keep redeem, webhook processing, SMS, email, broad booking import, and normal visitor traffic closed unless explicitly scoped.

Updated forward sequence after T0164:

- `T0165`: linked add-on settlement reconciliation.
- `T0166`: controlled Live redeem smoke.
- `T0167`: receipt and confirmation handling for new bookings and existing-booking add-on purchases.
- `T0168`: park-test UI/UX readiness.
- `T0169`: staff-assisted visitor test.
- `T0170`: outcome and go/no-go.
