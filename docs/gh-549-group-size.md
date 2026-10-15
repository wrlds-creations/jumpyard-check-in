# Up to 50 jumpers per group, add-ons not tied to entries (#549, kiosk #223)

## Background

On 2026-10-15 Love asked: "vi måste låsa upp så man kan köpa upp till 20 entreer, att man alltid kan köpa hur många skyrides, vatten, kaffe och hänglås som man vill oavsett antal entreer". On the plan in the issue chat Love answered "1. Ja 2. Ja, kör enligt planen.": a family counts as four jumpers, and an add-on goes up to 99.

Love then asked "kan vi sätta 50 i entreer? och vi tillåter väl om någon gjort 50 entreer via en bokning via rollers hemsida och checkar in?" and decided "Ja, kör 50."

Decision D0272; kiosk D0079.

## Phone and kiosk

- **Jumpers.** A purchase holds up to 50 jumpers (`MAX_JUMPERS_PER_PURCHASE`): 50 entries, 25 combos (2 each) or 12 families (4 each). ROLLER's capacity for the slot still applies. Before, every product stopped at 10 units, so 10 families meant 40 jumpers.
- **Add-ons.** SkyRider, water, coffee and padlocks go up to 99 each (`ADDON_MAX_QUANTITY`), whatever the number of jumpers.
  - This holds in a purchase and on an existing booking.
  - ROLLER's free SkyRider places still apply.
  - Fewer jumpers no longer lowers an add-on the guest chose.
  - 99 is the kiosk slip's limit per line (`SLIP_LIMITS.quantity`).
- **Socks are unchanged.** In a purchase the guest picks any number next to the jumpers and gets the reminder (D0261/D0074). On an existing booking it stays four pairs per guest.

## Cloud check-in

A read-only Park check on 2026-10-15 covered the last 30 days of bookings and the last 21 days of sessions:
- ROLLER issues one ticket per jumper (a family has 4, a combo 2) and one per add-on unit.
- SkyRider, JumpSocks and padlocks are `addon` items. Entries are `sessionpass`.
- Kiosk and phone purchase sessions list every ticket of the booking, add-ons included. The largest session had 6.

Before #549, the Redeem Lambda refused more than 10 ids, counting the add-on tickets it never redeems. So a purchase with more than ten units in total failed both the automatic check-in (`400 too_many_tickets`, then "needs staff") and the staff check-in (`409`). A booking from ROLLER's web shop with more than 10 entries stopped the same way.

Now:
- **Limits.** A redeem request or session may carry up to 1000 ids (`MAX_REQUEST_TICKET_IDS`), which keeps the 32 KiB body bound. After the product split, a group may check in up to 50 entry tickets (`MAX_GROUP_ENTRY_TICKETS`). More is `409 too_many_tickets` before any ROLLER call, and the group goes to kassan as before.
- **Calls of 10.** `redeemRollerTicketsInBatches` sends `POST /redemptions` 10 tickets at a time, one call after the other. The first refusal stops the rest and is the result.
- **Retries.** A retried or resumed key (`retry_after_failure`, `resumed`) is the same operation run again. It does not send a ticket that ROLLER's final refresh already shows redeemed, so an attempt that stopped between the calls finishes the group without redeeming anything twice.
- **First attempts.** A first attempt sends the whole group. A group that is partly redeemed elsewhere is still refused and goes to staff, as before.
- **409 and the receipt.** The request hash and the durable receipt (#333) cover the whole group. A `409` still triggers one authoritative recheck, and only "every selected ticket redeemed" completes the group.
- **Session Lambda.** An explicit ticket selection allows 50 (`MAX_SELECTED_TICKETS`). Clients send none and get every redeemable ticket, as before.
- **Bookings made elsewhere.** A booking from ROLLER's web shop or a kalas booking that a guest checks in on the phone or kiosk follows the same rules: up to 50 entry tickets check in by themselves.
- **Staff app.** No change. It counts the group's admissions from the manifest.

## ROLLER calls

| Group | Before | Now |
|---|---|---|
| 1-10 jumpers | 1 booking read + 1 redemption | the same |
| 11-50 jumpers | could not be checked in | 1 booking read + 1 redemption per 10 (up to 5) |

The token, catalog and venue reads are cached as before, and the purchase itself makes no extra calls. `checkin.redeem_succeeded` records `rollerCalls`. Five calls of about a second each stay well inside the Redeem Lambda's 25 s timeout and the 30 s API Gateway limit for "Lämna ut".

## Verification

- `npm run validate:gh549-group-size` runs two files:
  - `scripts/validate-gh549-group-size.test.js` drives the real Redeem and Session Lambdas.
  - `groupSize.test.mjs` covers the phone.
- The Cloud tests cover:
  - 20 entries in two calls of 10 and 50 in five, while up to 10 stays one call;
  - add-on tickets never sent and not counted;
  - 51 refused before ROLLER;
  - retried and resumed keys that send only the rest, and a partly redeemed group whose first attempt still goes to staff;
  - a failed second call and a `409` recheck;
  - the automatic check-in of a 50-entry kiosk purchase;
  - the session limit.
- Kiosk: `npm run test:kiosk-group-size` in jumpyard-check-in-kiosk.
- After release:
  - a phone purchase and a kiosk purchase of more than 10 entries each check in by themselves;
  - a web booking of more than 10 entries checked in on the phone or kiosk does the same;
  - each shows under "Incheckade" with all its jumpers, and its `checkin.redeem_succeeded` event records one ROLLER call per 10.
