# #582 A kiosk group keeps its bands until its tickets are attached

Issue [#582](https://github.com/wrlds-creations/jumpyard-check-in/issues/582), decision [D0283](../DECISIONS.md). It revises when D0265's provisional lines ([#547](gh-547-ready-is-checked-in.md)) give way to ROLLER's.

## What happened

These facts were read from Park's Aurora rows (no names), Lambda logs and the webhook event of group 0007 (booking 177902708) on Sunday 2026-10-18, without changing anything. Times are Europe/Stockholm.

| Time | What |
|---|---|
| 09:51:06 | The kiosk payment is approved. The provisional session is ready, and the staff board shows the draft's goods (D0265). |
| 09:52:18 | ROLLER's `Created` webhook arrives. |
| 09:52:22.1–.3 | The webhook stores ROLLER's paid booking, its two items and their tickets. |
| 09:52:22.27 | The Booking worker's snapshot fails with a `DatabaseErrorException`, after it has written the booking row. The worker never attaches the session. |
| 09:52:22.5 | The webhook confirms the draft and asks the Booking Lambda to attach the session. It refuses with `authoritative_source_invalid`, because the worker's partial snapshot (`kiosk_payment_reconciliation`) wrote the row last. The webhook retries after 60 s (D0262). |
| 09:53:25.9 | The retry attaches the session with its two tickets. Automatic check-in redeems it at 09:53:27.9. |

The log records only the worker's error class. The timing and the code point to its item insert. It writes a `jybi_…` key with `ON CONFLICT (booking_item_key)`, but the webhook had just stored the same `booking_item_id` under a `bookingitem:…` key, which the unique index on `booking_item_id` refuses. #589 (D0287) fixed that collision, so the worker now attaches the session in the same run; this change stays as the safety net.

## Why the bands disappeared

From 09:52:22 to 09:53:26 the session was `pending` with no tickets, while ROLLER's items were already in Aurora.
- The draft's lines stood in only while the booking had no ROLLER items, so they stopped.
- ROLLER's admission line counts only the session's chosen tickets (`selectedUnits`). With none, the bands were dropped, and the group showed only its socks.

The race happened 9 times on 2026-10-17 and at least once on 2026-10-18.

## Change (D0283)

- **Board** (`staff-board.js`): the paid new-booking draft stands in while the session is not `confirmed` and either has no tickets yet or the booking has no ROLLER items. Before, only the second case counted. While the draft stands in, that booking's own ROLLER lines are left out, so nothing is counted twice. Add-on drafts are unchanged.
- **Detail** (`findStaffSessionDetail`, `handleStaffSessionDetail`): the same rule. The draft's items replace ROLLER's items and handout lines for that booking until the session has its tickets.
- **Handouts** are unchanged. Cloud answers `booking_sync_pending` until the session is confirmed. The staff app keeps a "Lämna ut" on the device (D0265) and confirms it on ROLLER's lines after the switch, matched by kind and product.
- **After the switch** the draft never stands in again, also when a later kiosk add-on makes the session `pending`, so goods handed out against ROLLER's lines stay counted.

## Calls

- No ROLLER call. The board reads the drafts only for sessions that are not confirmed, as before.
- Only the Session Lambda code changes. No migration, route, permission, staff app, phone or kiosk change.

## Not included

- The Booking worker's failing snapshot. If the worker attached the session even when the webhook stored ROLLER's items first, the gap would close at once. That needs its own issue.
- The webhook's 60 s retry after `authoritative_source_invalid`. It belongs to the webhook queue issue (#581).

## Validation

- `scripts/validate-gh345-handout-api.test.js` runs in CI's "Staff handout database" job (`GH345_PSQL`). Its #582 subtest uses the real board SQL, the Session Lambda's detail and the Redeem Lambda's handout route on PostgreSQL, in 0007's state. It checks that:
  - in the gap, the board and the detail list the draft's bands and coffee once, also with the booking row unpaid, and Cloud refuses a handout with `booking_sync_pending`;
  - after the switch, ROLLER's lines show the same counts and band colour;
  - the press kept from the gap is confirmed on ROLLER's lines and counted (café, then bands, which redeems the group);
  - a later add-on that makes the group `pending` keeps ROLLER's lines and their counts.
- On origin/main `197b503` the same subtest fails with 0 admissions, the 0007 symptom.
- `staffExperience.test.mjs`: a press on the draft's lines is confirmed on ROLLER's lines, with Cloud's own line builders on both sides.
- `validate:gh547-ready-is-checked-in` and `validate:gh253-handoff-sync-products` follow the new condition.

## After release

- **Love:** buy at a kiosk and fold the group out in the staff app at once. Its bands and goods show the whole time until it is checked in. A "Lämna ut" pressed in the first minute ends as "Utlämnat".
- **Monitor:** the race itself comes only now and then. The next time the processor logs `kiosk_confirmation_failed` with `authoritative_source_invalid`, check that the group kept its bands on the board during the 60 s retry.
- The Park plan may change only the Session Lambda code.
