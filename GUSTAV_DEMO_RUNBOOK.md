# Gustav Demo Runbook

This is the short demo order for the JumpYard Playground review. Use the public apps unless a step explicitly says Roller or AWS.

## Public URLs

| Surface | URL | Purpose |
|---|---|---|
| Guest check-in | `https://jumpyard-check-in.pages.dev/` | Guest buys entry or checks in an existing booking. |
| Staff handoff | `https://jumpyard-checkin-admin.pages.dev/` | Staff scans/searches and completes handoff/redeem. |
| AWS dev API | `https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com` | JumpYard Cloud backend. |

## Demo Order

| Step | Flow | What to Show | Where to Verify |
|---|---|---|---|
| 1 | Buy entry from zero | Select a time, show real remaining capacity, choose entry quantity, optionally add stock/SkyRider, pay, complete safety, show QR/code. | Roller booking should appear as paid; AWS staff queue should receive ready handoff after safety. |
| 2 | Staff redeem | Open staff app, search/scan handoff, show guest name, entry plus products to hand out, then complete check-in. | Roller item/ticket shows redeemed; staff queue removes completed handoff. |
| 3 | Existing booking plus add-ons | Search an already-paid booking, add socks/padlock/coffee/SkyRider, pay linked add-on draft, complete safety/QR. | Staff handoff should show original entry plus linked paid add-ons in the same summary. |
| 4 | Gift card checkout | Add gift card on review/payment prep, show amount reduced or fully covered. | Roller booking costs/draft reflect gift-card deduction; full-cover flow should not require card payment. |
| 5 | Klippkort checkout | Add Klippkort code on review/payment prep, show eligible entry amount reduced. | Do not promise remaining visits; Roller validates the code through discount-code behavior. |

## Talking Points

| Topic | Simple Explanation |
|---|---|
| Capacity | The guest app asks JumpYard Cloud, and JumpYard Cloud asks Roller. The frontend does not call Roller directly. |
| Payment | Draft booking reserves the booking in Roller, then the Roller/Adyen payment package completes payment. |
| Existing add-ons | Add-ons are created as a separate linked Roller booking, then shown together in staff handoff. |
| Staff handoff | Staff sees the operational checklist: who, when, paid status, and what to hand out. |
| Gift card/Klippkort | Roller validates values/codes. JumpYard Cloud only sends the supported payload and displays the result. |

## Current Demo Health

| Check | Status | Notes |
|---|---|---|
| Public guest app | Passed | Cloudflare page returns HTTP 200. |
| Public staff app | Passed | Cloudflare page returns HTTP 200. |
| Availability | Passed | Dev API returns entry, add-ons, and SkyRider. |
| Staff linked add-ons | Passed | Staff detail returned 5 product rows, including 4 linked add-on rows. |
| AWS alarms | Passed | All 17 `jumpyard-check-in-dev-*` alarms are `OK`. |
| Data API/webhook health | Passed | Aurora has recent successful Data API seed runs and processed webhooks. |

## T0126 Pelle/Anders Same-Day Rehearsal Fixtures

T0126 created Roller Playground bookings dated 2026-06-15 for same-day rehearsal before the Pelle/Anders walkthrough on 2026-06-16 at 10:00.

| Purpose | Booking Reference | Visit Time | State | Notes |
|---|---|---|---|---|
| Paid existing-booking check-in | `5166994` | 15:00 | Paid / ready | Two `60 min entré` tickets plus two JumpSocks. Lookup returned `ready` with amount owing `0`. |
| Unpaid stop state | `5166995` | 15:30 | Pending payment | One `60 min entré` ticket. Lookup returned `payment_required` with amount owing `220`. |
| SkyRider handout grouping | `5166996` | 16:00 | Paid / ready | One `60 min entré` plus one SkyRider. A ready-for-staff dev handoff was created as `JY3829` / `jycs_mqf5s3e1_c6e6d961`. |
| Existing-booking add-on source | `5166997` | 16:30 | Paid / ready | One `60 min entré`. Add-on quote for JumpSocks, hänglås, Bryggkaffe, and SkyRider returned `quoted`, total `165`, `wroteBooking=false`. |

T0126 readiness checks:

- Roller env guard passed for Playground.
- Public guest app returned HTTP `200`.
- Public staff/admin app returned HTTP `200`.
- Dev availability for 15:00, 15:30, 16:00, and 16:30 returned entry, family, SkyRider, JumpSocks, hänglås, and Bryggkaffe as available.
- JumpYard Cloud lookup returned the four created bookings from fresh Aurora-backed state.
