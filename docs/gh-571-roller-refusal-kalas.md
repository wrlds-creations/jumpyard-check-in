# ROLLER refusals and kalas (#571, kiosk #244, D0281)

Issue: [#571](https://github.com/wrlds-creations/jumpyard-check-in/issues/571). Kiosk: [jumpyard-check-in-kiosk#244](https://github.com/wrlds-creations/jumpyard-check-in-kiosk/issues/244). Branches: `codex/gh-571-redeem-409` from `origin/main` `278dc16` (merged with `ab2e8e8`) and kiosk `codex/gh-244-kalas-welcome` from `13c87f6`.

## What happened on 2026-10-17

ROLLER refused two automatic check-ins at Nacka with HTTP 409 on `redeem_tickets`. Cloud did not record why. The staff app showed both groups as "Incheckad" (D0265).

| Group | Booking | Refused | Tickets sent |
|---|---|---|---|
| 0163 | 177249113 | 12:47:51 UTC | 8 "Antal" tickets of a MIDI kalas (15:00–16:40), plus 9 add-on tickets that were never sent |
| 0207 | 177683908 | 14:45:38 UTC | 1 ticket "Biljetter (180 kr)" of "Entré 60 min" (17:00, web booking) |

The read-only evidence came from Park Aurora (Session and Redeem runtime secrets) and the Redeem Lambda logs:

- **Call order.** Both requests ran GET booking, GET venue identity, POST redemptions 409 and GET booking (the #333 recheck). No error text was logged.
- **No receipt.** Both `idempotency_records` are `failed` with `roller_http_409`. No staff retry and no Cloud receipt followed (`redeem_status_last_seen` is empty).
- **Kalas never redeemed.** Cloud has never redeemed a party package: 0 of 405 tickets. Only two kalas ever started a Cloud session. Both were on 2026-10-17, and one was abandoned.
- **0207's product works.** The same product as 0207 was redeemed 16 times by Cloud that day.
- **Early check-in is not the cause.** 99 of the 223 groups checked in that day were admitted 10 or more minutes before their start, up to 80 minutes early. Cloud sends no `redemptionDevice`, so ROLLER's device setting "Validate session times" does not apply.

## What ROLLER documents

- **Redeem tickets (`POST /redemptions`).** "Only the following products are supported for redemption via API": standard passes, session passes, recurring sessions and memberships (the booking item). A refusal is 409 with `errors: [{ name: "InvalidRedemption", message, ticketId }]`. The documented messages are:
  - Ticket does not exist;
  - Booking Cancelled;
  - Ticket is not valid for this date;
  - Ticket IDs must be unique per request;
  - Ticket usage exhausted;
  - Product type not accepted;
  - Membership Invalid;
  - Ticket redemption usage exhausted;
  - Redemption device not found;
  - Duplicate custom ticket IDs found;
  - Custom ticket ID not found;
  - with "Validate session times", the before or after session time messages.
- **Product type mapping.** A party package is its own product type (13 PartyPackage), not a pass (6). The catalog marks the "Antal" variants of MINI, MIDI and MAXI only through `parentType: partypackage`.
- **Get booking detail.** `BookingTicket` has no redemption state, only ticket id, holder, membership fields, photo, locations, customer and signed waiver. The #333 recheck therefore cannot see a ticket that is already redeemed.

## Conclusion

- **0163.** A kalas can never be checked in through ROLLER's API, so this refusal was "Product type not accepted". `REDEEMABLE_PRODUCT_KEYS` had listed `partypackage` since T0059 (2026-05-28) as an untested assumption.
- **0207.** This was most likely "Ticket usage exhausted": the ticket had already been redeemed, for example at kassan. It can be confirmed in Venue Manager (booking 177683908, the ticket's redemption).

## Volume

| Day | Kalas | Children |
|---|---|---|
| Sat 2026-10-17 | 33 | 377 |
| Sun 2026-10-18 | 31 | 357 |
| Sat 2026-10-24 (booked by 2026-10-18) | 22 | 257 |
| Sun 2026-10-25 (booked by 2026-10-18) | 11 | 130 |

At 10:00 on 2026-10-18, three of the five pre-booked groups were kalas.

## Love's decisions (2026-10-18, #571 chat)

1. Staff see a group ROLLER refused: "Till kassan" under Incheckade (proposal A). Love's comment: "jättebra att det syns så".
2. A kalas is never checked in. Love: "de ska inte checkas in ... bara synas i kommande och skickas vidare". Love asked for a glad message at the scan or lookup: "hej kalasgäst, fråga personalen så hjälper dom dig vidare". Love approved it with "ok" and then said "Ta bort emojin!".
3. Kalas are told apart in Kommande from the morning ("Kalas · MIDI").

## Behavior

- **Lookup.** The Lookup Lambda answers `eligibility { canCheckIn: false, reason: "party_package" }` for a booking with a party-package item. It comes after `wrong_date` and before the payment rule.
- **Check-in start.** The check-in start and the session link refuse a kalas with `409 party_package`. This check comes after an inactive or not-fresh booking. Pre-arrival emails skip kalas, because they use the same start decision.
- **Phone and kiosk.** They show "Hej kalasgäst!" and "Fråga personalen, så hjälper de dig vidare." with one "Klar" button back to the start. The English text is "Hi, party guest!" and "Ask our staff and they'll help you from here." No session, film or purchase starts.
- **Staff board.** Every row carries `kalas: { package }`, read from items and the catalog, whether the kalas is paid or not. The staff app shows "Kalas · MIDI" in every list. A folded-out kalas says "Kalas checkas inte in här. Skicka vidare till kassan." and has no button, so a kalas stays in Kommande.
- **ROLLER's reason is kept.** When ROLLER refuses a redemption, Cloud stores its reason as a code (`product_type_not_accepted`, `ticket_usage_exhausted`, and so on) in several places:
  - in `session_summary.autoCheckin.roller`;
  - in the response's `roller.refusal`;
  - in event `checkin.redeem_rejected`, with each ticket's error and its state after the recheck;
  - in one log line that carries only codes and counts.
- **Staff marker for refusals.** A group with `autoCheckin.roller.statusCode = 409` shows a red "Till kassan", the reason and no "Lämna ut". An outage keeps "Lämna ut", which retries the check-in.
- **ROLLER calls.** No ROLLER call is added. A kalas now saves three calls (detail, redemption, recheck). Without the catalog's mark nothing is blocked, and a refusal shows as "Till kassan".

## Release note

Publish kiosk #244 with this Cloud release. Until then, an old kiosk shows its generic lookup error for a kalas, because it does not know `party_package`.

## Validation

- `npm run validate:gh571-roller-refusal` runs the following:
  - `scripts/validate-gh571-roller-refusal.test.js`, 12 tests;
  - `scripts/validate-gh571-kalas.test.js`, 5 tests;
  - the phone's `test:kalas`, 7 tests.
- The staff app's `staffExperience.test.mjs` has 30 tests.
- The kiosk's `test:kiosk-kalas` has 4 tests.
- Screenshots from the local apps were reviewed: the staff app with a fake Cloud, the kiosk `/preview/lookup` with the kalas fixture, and the phone at `?park=1` with a stubbed lookup.
