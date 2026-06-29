# T0168 New-Booking Add-On Visibility

## Goal

Explain why the 2026-06-26 park-test new-booking receipt proof showed no add-ons before payment, and fix only a tight local cause if found.

## Scope

- Trace the new-booking add-on display path from phone UI to JumpYard Cloud availability/catalog data.
- No Roller writes, payment, redeem, webhook processing, visitor traffic, broad lookup unlock, AWS resource creation, or AWS deploy.
- Use existing documented Live evidence from T0161/T0162 rather than creating another paid proof.

## Finding

The missing add-ons were caused by backend Live product mapping, not by a frontend visibility lock.

The phone UI shows new-booking add-ons only when the availability response contains a matching `type: "addon"` product with:

- a product id,
- a unit price,
- and a max quantity above zero.

That is intentional. It prevents the PWA from showing an add-on that cannot be quoted or drafted.

For park-test Live, the known add-on ids and prices were documented in T0161/T0162:

| Add-on | Live product/parent | Price |
|---|---:|---:|
| SkyRider | child `970336`, parent `970335` | `40` SEK |
| Socks | `970338`, parent `970337` | `45` SEK |
| Lock | `970334`, parent `970333` | `45` SEK |
| Coffee | `970352`, parent `970346` | `35` SEK |

But the BookingHandler only used that Live add-on fallback while the T0162 existing-booking add-on smoke gate was open. During the T0167 new-booking receipt proof, only the T0159 new-booking payment smoke gate was open, so new-booking availability could still create the entry booking but did not have a Live phone add-on mapping/prices to return to the frontend.

Plain-language version: the app had a shelf for add-ons, but the Live price tags were stored in the wrong locked drawer. When that drawer was closed, the shelf looked empty.

## Implementation

`infra/lambda/booking/index.js` now separates the known Live phone add-on catalog from the T0162 existing-booking write gate:

- Renamed the Live add-on fallback from the T0162 smoke-specific list to `LIVE_PHONE_ADDON_PRODUCTS`.
- Allows `loadPhoneAddonProducts("live")` to use the known Nacka Live add-on ids/prices even when `ENABLE_T0162_LIVE_ADDON_SMOKE=false`.
- Keeps Roller write gates unchanged. This does not open draft creation, payments, existing-booking add-ons, lookup, redeem, webhook processing, SMS, or email.
- Adds SkyRider child `970336` as a Live availability child fallback so a SkyRider selection can still validate availability when the park-test product cache is not populated.

## Safety Outcome

T0168 changed local BookingHandler code only.

It did not:

- Call Roller Live.
- Create drafts, bookings, payments, refunds, redemptions, webhooks, SMS, or email.
- Read bookings, customers, guests, tickets, or payments.
- Open AWS/Lambda runtime gates.
- Deploy AWS resources.
- Write Aurora rows.
- Run visitor traffic.

## Validation

Passed:

```powershell
node --check infra/lambda/booking/index.js
npm --prefix infra run build
npm --prefix jumpyard-checkin-phone run lint
npm run validate
git diff --check
npm run infra:check
```

`npm --prefix jumpyard-checkin-phone run lint` passed with the four existing `@next/next/no-img-element` warnings. `git diff --check` passed with line-ending normalization warnings only.

## Next Gate

Next planned ticket: `T0169` post-payment booking sync.

T0169 should handle the payment-complete state that currently says the booking has not synced after a successful paid new booking.
