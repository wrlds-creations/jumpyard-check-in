# Issue #589: a kiosk purchase whose items the webhook stored first

Issue [#589](https://github.com/wrlds-creations/jumpyard-check-in/issues/589), decision D0287.

## What happened

Saturday 2026-10-17 at Nacka, 10:13: a group paid 269 kr at a kiosk.
1. ROLLER created the booking 55 s later.
2. ROLLER's `Created` webhook reached Cloud first and stored the booking's items.
3. A tenth of a second later, the Booking Lambda's kiosk reconciliation stored the same items under other keys and failed.
4. The webhook's kiosk check then read the half-written booking row, answered `authoritative_source_invalid` and retried after 60 s (D0262). The single webhook queue waited that minute.
5. The group was attached and checked in at 10:15:17 instead of 10:14:14.

**The failing statement.** `persistKioskReconciliationBookingSnapshot` (`infra/lambda/booking/index.js`) inserted each item under `jybi_` + sha256(rollerUniqueId:bookingItemId) with `ON CONFLICT (booking_item_key)`. The webhook (`upsertWebhookBookingItem`) had stored the same ROLLER item under `bookingitem:` + sha256(bookingItemId). The partial unique index `roller_booking_items_booking_item_id_unique_idx` (`0001_initial_schema.sql`) is not covered by that conflict target, so Aurora raised:

```
ERROR:  duplicate key value violates unique constraint "roller_booking_items_booking_item_id_unique_idx"   (SQLSTATE 23505)
DETAIL:  Key (booking_item_id)=(320699833) already exists.
```

The snapshot's booking upsert had already committed `source_last_updated_by = 'kiosk_payment_reconciliation'`, which is not one of `KIOSK_AUTHORITATIVE_BOOKING_SOURCES`. The Booking Lambda turned the error into a 500 JSON for its asynchronous invocation, so there was no Lambda retry and no `Errors` metric, and `cloud.server_error` carries no SQLSTATE.

**Evidence (read-only, Park, 2026-10-19).** Aurora's error log (`error/postgresql.log.2026-10-17-0800` to `2026-10-18-1300`), the Booking and webhook-processor logs, and Aurora rows read with SELECT only. Aurora keeps these files for about 3 days, so the table preserves them. Times UTC.

| Booking `kiosk_reconciliation` 500 | Aurora 23505, item id | Webhook kiosk check |
|---|---|---|
| 10-17 08:14:13.588 | 320699833 | 08:14:14.195 `authoritative_source_invalid`, retry 60 s |
| 09:43:12.156 | 320730801 | 09:43:12.382 same |
| 09:54:14.678 | 320735888 | none: the webhook confirmed ms earlier |
| 10:13:29.467 | 320746379 | 10:13:30.276 same |
| 10:16:13.510 | 320747815 | 10:16:13.752 same |
| 10:50:01.697 | 320766803 | 10:50:02.299 same |
| 10:52:09.921 | 320767961 | none: the webhook confirmed ms earlier |
| 11:38:31.448 | 320796997 | 11:38:31.933 same |
| 11:55:33.577 | 320807684 | none: kiosk add-on, confirmed by the webhook |
| 12:21:30.249 | 320825978 | 12:21:30.494 same |
| 13:10:37.626 | 320860317 | 13:10:38.143 same |
| 13:52:33.117 | 320890892 | 13:52:33.397 same |
| 10-18 07:52:22.274 | 321023564 | 07:52:22.816 same |
| 13:09:24.579 | 321184817 | 13:09:24.799 same |

- All 14 failures match to the second: 13 new bookings and 1 add-on, among 193 kiosk purchases (165 new, 28 add-ons). The webhook check failed in 11 cases, 9 on Saturday and 2 on Sunday.
- `webhook-processing-failures` went to ALARM within a minute of 10 of those 11 checks. Group 0007's bands disappeared from the staff board for 64 s on Sunday at 09:52 (#582, D0283).
- **Lookup.** The Lookup Lambda's `upsertLiveBookingItem` has the same collision the other way round: it writes `bookingitem:` keys with `ON CONFLICT (booking_item_key)`. On 10-17 at 11:55:06 UTC a lookup of item 320791407, stored under `jybi_…`, answered 500, and `api-5xx` followed at 11:56:35 UTC (13:56:35 in Sweden). There were three more on 10-15 (K2–K4 recovery lookups). 103 of the 165 new kiosk bookings on 17–18/10 have `jybi_` items.
- **Example, booking 177723378.** The card was approved at 10:13:17.9; the readback got 404s until the webhook stored the `bookingitem:` rows at 10:14:13.45. The reconciliation failed at 10:14:13.588 and the webhook check at 10:14:14.12 answered `authoritative_source_invalid`. The Handoff was attached at 10:15:17.49, 64 s later.
- **Frequency.** The Booking log (kept 30 days) shows 17 failures: 3 on 2026-10-13, 12 on 10-17 and 2 on 10-18, only on busy kiosk days.
- **Why now.** Since D0238 (#481) the readback waits for ROLLER to create the booking from its own payment notification, so the webhook's `Created` note and the readback's first 200 land in the same seconds. Before, the kiosk wrote first and the other writers collided; those were fixed in August (#257, #279, #294).

## Change (D0287)

1. **Kiosk snapshot items.** An item with a ROLLER item id is upserted the way the webhook, the check-in's final refresh (`redeem`) and the nightly sync (`data-sync`) already do: `ON CONFLICT (booking_item_id) WHERE booking_item_id IS NOT NULL DO UPDATE … WHERE roller_booking_items.roller_unique_id = EXCLUDED.roller_unique_id RETURNING booking_item_key` (`upsertKioskReconciliationBookingItem`).
   - The row keeps the key it was stored under first, and the item's tickets go on the returned key.
   - Product and parent names and the parent product id are never blanked (`COALESCE`), and the kiosk's item details are merged into the stored `item_summary`.
   - An id that belongs to another booking (never seen) overwrites nothing; the run fails with `kiosk_booking_item_identity_conflict`, as the webhook does.
   - An item without an id keeps the `jybi_` upsert on its own key.
   - The same function serves new kiosk bookings, kiosk add-ons and the staff "Betalningen gick igenom" resolution (`confirmKioskAttemptFromRollerEvidence`, #483), so all three are covered.
2. **The booking row in the same snapshot.** When a full live ROLLER read (`roller_live_lookup`, `roller_redeem_final_refresh` or `roller_webhook_enrichment`) wrote the row, the snapshot keeps that `source_last_updated_by`. It still refreshes the booking and paid status and amount owing, and merges its keys into the summary. Its update never touches total, currency, date, venue or `externalId`. A row the snapshot creates, or one that only the kiosk or the nightly sync wrote, still names `kiosk_payment_reconciliation`.
3. **Lookup Lambda.** `upsertLiveBookingItem` applies the same item-id rule and returns the stored key; `upsertLiveBooking` already passes it to `upsertLiveTicket`. A conflicting id fails with `lookup_booking_item_identity_conflict`. An item without an id keeps the lookup's own key rule.

**ROLLER calls.** None added. Each avoided collision also saves the webhook retry's 2 calls (22 on the test weekend).

**Unchanged.** `KIOSK_AUTHORITATIVE_BOOKING_SOURCES`, the webhook processor, its queue and message group, IAM, alarms and migrations. Both runtime roles already have SELECT, INSERT and UPDATE on `roller_booking_items` and `roller_booking_tickets`, which `RETURNING` and the conflict `WHERE` need. Existing `jybi_` rows and the unique index stay as they are; the snapshot is not wrapped in a transaction.

**D0283.** Its revisit trigger, "the Booking worker attaches the session even when the webhook stored ROLLER's items first", is now met. Its draft stand-in stays as the safety net for the fraction of a second between the webhook's items and the attachment.

**Not included.** Logging the SQLSTATE in `cloud.server_error`, and the Lookup Lambda's own kiosk Handoff check after a kassan change (a 500 risk noted in #581, none seen).

**Remaining risk.** A kiosk add-on whose items the webhook stored first is now confirmed by the worker too. If the webhook's paid-booking signal (GH-563) has already released the group, the worker's add-on confirmation admits it again, because it admits every session it updates. The Redeem Lambda then answers `already_completed` or `in_progress` (D0285). The test weekend had one such add-on race among 28 kiosk add-ons.

## Validation

- `npm run validate:gh589-kiosk-item-key` (part of `npm run validate`) drives the real Booking and Lookup Lambdas with a scripted Aurora: the item rule and its named error, the tickets on the returned key, the unchanged `jybi_` upsert without an id, and the booking row's kept source with no update to total, currency, date, venue or `externalId`.
- With `GH589_DATABASE_TEST=true` (CI's "Staff handout database" job) the webhook, Booking and Lookup Lambdas run against PostgreSQL with every migration applied and their own roles:
  1. webhook first: the reconciliation worker attaches the Handoff in the same run, starts one automatic check-in and keeps the webhook's keys, and the webhook's check after it is skipped (#581);
  2. reconciliation first, then the webhook: unchanged, and the webhook keeps the `jybi_` keys;
  3. the kiosk check right after a snapshot that met a full-read booking row answers `confirmed`;
  4. a kiosk add-on whose items the webhook stored first is confirmed and released by its own reconciliation;
  5. a lookup of a kiosk booking with `jybi_` rows answers 200 and keeps the keys of the items and tickets;
  6. an item without an id keeps its one `jybi_` row, and an item id owned by another booking overwrites nothing and raises the named error in both Lambdas;
  7. a staff "Betalningen gick igenom" with the webhook's rows stored first attaches the booking, with no 500.

  Every case asserts the exact ROLLER calls. Run on the code before this change, cases 1, 3, 4, 5, 6 and 7 fail with the 23505 or its 500, and case 2 passes.
- Existing validators: `kiosk-payment-reconciliation`, `t0197-webhook-reconciliation`, `gh282-kiosk-handoff-repair`, `gh257-webhook-item-reconcile`, `gh481`, `gh531`, `gh563`, `gh570`, `gh581`, `gh583`, `gh340-server-errors` and `t0195-least-privilege`.

## After release

- A kiosk test purchase shows no regression.
- The race depends on timing, so the proof is the 24–25/10 weekend at Nacka. Read Aurora's error log within 3 days. Expect:
  - no `kiosk_reconciliation` `DatabaseErrorException` in the Booking log;
  - no `roller_booking_items_booking_item_id_unique_idx` in Aurora's error log;
  - no webhook `authoritative_source_invalid` retry, and no `webhook-processing-failures` alarm from one;
  - no lookup 500 at the database stage.
