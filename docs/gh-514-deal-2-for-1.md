# The "2 timmar för 1" deal on the phone and the kiosk

Scope: [issue #514](https://github.com/wrlds-creations/jumpyard-check-in/issues/514), kiosk [#195](https://github.com/wrlds-creations/jumpyard-check-in-kiosk/issues/195), decision D0252.

On 2026-10-12 Love reported a new deal in ROLLER. The apps did not show it, because Cloud offers only the products it names.

## Verified product evidence

All reads on 2026-10-12 were read-only: the public web checkout and Park Aurora, 0 ROLLER API calls.

| Source | Finding |
|---|---|
| boka-nackaforum.jumpyard.se, under DEALS | "2 timmar för 1": 120 minutes of jumping for the 60-minute price, Monday to Thursday, 10:00–18:00 every 30 minutes. Friday and Saturday are disabled. 200 kr in every slot in the week of 2026-10-12. |
| Aurora `product_catalog_cache` | Parent `1416422` (`sessionpass`), cached by the nightly sync at 04:01. |
| Web variants | `1416423` 160 kr, `1416425` 179 kr, `1416427` 180 kr, `1416429` 200 kr, `1416431` 210 kr. |
| Drop-In variants | `1416424` 180 kr, `1416426` 199 kr, `1416428` 200 kr, `1416430` 220 kr, `1416432` 230 kr. Each web price has exactly one Drop-In sibling at +20 kr. |
| Aurora `roller_booking_items`, 2026-10-12 | 15 paid tickets: 8 Drop-In at the kassa and 7 web. Each item spans 120 minutes. |
| Live phone app, 2026-10-12 at 15:35 | No deal. The regular 120 minutes cost 280 kr, against 220 kr for the deal at the kassa. The Weekday Combo was gone, as planned in #491. |

## Why the apps missed it

- Cloud reads seven products from the cache by exact ROLLER parent name: the six entries and the Weekday Combo.
- The only deal-like slot was locked to the Weekday Combo's ids and to its "2 personer · 60 min · 1 pizza" copy.
- Nothing reports a web-checkout product that the apps do not sell. A Project draft covers that warning.

## What changed

- **Cloud (`DEAL120`, type `deal`, 120 minutes, one jumper per unit):**
  - It is found by its exact parent name and offered only while the public web checkout lists the parent. ROLLER's sessions decide the days.
  - There is no fixed Live id mapping. A renamed or removed deal disappears instead of showing wrong copy.
  - The price is the Drop-In sibling at web + 20 kr (D0248).
  - `deal` is a purchase admission type for band colours.
  - The deal is optional: its absence never blocks the entries.
- **Phone and kiosk:**
  - A "2 timmar för 1" section comes first, above the entries.
  - It holds one card with the Combo's red glow: the clock icon, "120 MIN", per person, the spots left, "Betala för 60 min" and the red tag "Passa på" (en "Deal").
  - Love chose tag A. A percentage tag was rejected because the deal is 60 kr off the regular 120 minutes, not half.
  - The summary line reads "2 timmar för 1", and the quantity header "2 timmar för 1 · 120 min".
- **What already worked:** the staff handout and lookups treat the `sessionpass` as an admission. A deal bought at the kassa or on the web checks in as "2 timmar för 1" with one band for start + 120 minutes.

## Validation

- `npm run validate:gh514-deal` runs the real availability, validation and quote handlers. It has 7 checks, all passing:
  - a deal day prices every slot at its Drop-In sibling from the one existing availability read;
  - unlisted, failed-catalog, no-session and renamed cases hide the deal and keep the entries;
  - mismatched Drop-In tiers are rejected;
  - a quote sends the Drop-In id.
- All 7 checks fail against the previous `main`.
- Existing suites still pass: GH-501, GH-339/341, GH-459, GH-367, GH-345, GH-484 and GH-253.
- Phone: `test:product-visibility`, `test:workshop-flow`, `test:flow-transitions`, `test:payment-recovery`, `test:completion`, `test:paid-confirmation`, `test:guest-typography`, lint and `tsc`.
- Localhost review on 2026-10-12, phone 375x812 and kiosk 1080x1920: the product step, quantity, contact and completion (green band for 16:00).

## Rollout

The order is Park, then the public phone, then the kiosk Pages. The live purchase test must run Monday to Thursday, because the deal is not sold on the 17/18 test weekend.
