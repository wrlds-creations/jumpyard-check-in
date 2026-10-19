# Issue #581: a kassan change to a kiosk booking no longer holds the webhook queue

Issue [#581](https://github.com/wrlds-creations/jumpyard-check-in/issues/581), decision D0282.

## What happened

These facts were read from Park logs and Aurora on 2026-10-19, without changing anything. Times are Stockholm time.

- **The change.** Kiosk booking 177982403 (group 0088) was paid 480 kr at 14:45. The Booking Lambda attached its Handoff at 14:47:20, and the group was checked in with two tickets. At about 15:10 kassan removed one Drop-In entry, so ROLLER said 240 kr.
- **The failure.** ROLLER sent two `Updated` webhooks, at 15:10:14 and 15:10:15. The worker refreshed the booking, then asked the Booking Lambda to confirm the kiosk Handoff again. The Booking Lambda compared ROLLER's 240 kr with the kiosk draft's 480 kr and answered `needs_staff` / `authoritative_total_mismatch`.
- **The block.** D0262 retried each message after 60, 120, 240 and 480 s and then released it to the DLQ. That held the single FIFO group from 15:10 to 15:41. Group 0095's kiosk readback timed out (`confirmation_timeout`), and it waited 7 minutes for its `Created` webhook.
- **What is left.** Two messages are in `jumpyard-check-in-park-test-webhook-events-dlq.fifo`, and `webhook-dlq-visible` has been in ALARM since 15:28. That also fails a Park deploy's verify step. The two events have status `failed` with 6 and 8 attempts, so the five-minute recovery no longer picks them up.

Park read back on 2026-10-19:
- The 0088 draft is `published`, `reconciled`, `confirmed`, with result `confirmed` and total 48000.
- Its session is `redeemed`, with bookingSyncStatus `confirmed`, the booking's reference and id, and two tickets.
- The booking row says 24000, written by the morning sync.

## Why

The worker checked a kiosk Handoff on every webhook for a paid kiosk booking, even when the Booking Lambda had attached it long ago. The check compares ROLLER's booking with what the kiosk sold, so it can only pass before anyone changes the booking. After kassan's change it failed the same way on every retry.

## Change (D0282)

1. **An attached Handoff is not checked again.**
   - The worker's candidate query also reads the draft's `booking_confirmation_status` and `reconciliation_last_result`.
   - When both are `confirmed`, it skips the Booking Lambda call and returns `already_confirmed`.
   - Only the Booking Lambda's attachment statement (`confirmKioskReconciliation`) stores the result `confirmed`. It attaches the session and the guest token in the same statement. The webhook stores `confirmed_by_webhook`, and the lookup stores `confirmed_by_lookup`.
   - The booking, its items, tickets and guest are still upserted from ROLLER, so the cache takes the new total.
   - The webhook role cannot read `checkin_sessions`, so the worker uses the draft's result rather than the session.
2. **A reason that waiting cannot heal is never retried.**
   - Final reasons:
     - `authoritative_total_mismatch`, `authoritative_currency_mismatch` and `authoritative_booking_date_mismatch`;
     - `authoritative_venue_mismatch`, `authoritative_venue_configuration_missing` and `authoritative_environment_mismatch`;
     - `authoritative_external_id_mismatch`, `authoritative_booking_id_mismatch`, `authoritative_booking_reference_mismatch` and `authoritative_booking_ambiguous`;
     - `invalid_authoritative_confirmation_request`.
   - The worker logs `{"code":"kiosk_confirmation_failed","reason":…,"status":"not_retried"}` and acknowledges the message.
   - The rest of the refresh still runs. The event is stored as `processed` with `kiosk_confirmation_not_retried: <reason>`.
   - The Booking Lambda still marks a draft that is not yet confirmed as `needs_staff`, as before.
3. **Transient reasons still retry** after 1, 2, 4 and 8 minutes (D0262):
   - `authoritative_source_invalid`, `authoritative_booking_not_fresh` and `authoritative_booking_not_found`;
   - `authoritative_tickets_missing`, `authoritative_payment_not_settled` and `authoritative_handoff_attachment_missing`;
   - `function_error` and `unknown`.

   A test fails if the Booking Lambda gains a reason that is in neither list.

**Unchanged:**
- One message group, reserved concurrency 1, batch size 1, 12-minute visibility and five deliveries.
- The recovery job, the alarms, IAM and the migrations.
- ROLLER calls per event. A confirmed kiosk booking now saves one Booking Lambda call per webhook.

## The weekend's other kiosk failures

All 11 other `kiosk_confirmation_failed` lines this weekend were `authoritative_source_invalid`, each retried once after 60 s. That was 9 of 111 kiosk `Created` webhooks on Saturday and 2 of 54 on Sunday.

Each one fell in the same second as a `cloud.server_error` (`DatabaseErrorException`) in the Booking Lambda's own kiosk reconciliation. There were 14 such errors this weekend. In the 10:14:09 case on Saturday:
1. The kiosk readback got ROLLER's booking at 10:14:13.466.
2. The reconciliation failed at 10:14:13.588, apparently after it had written its partial booking row.
3. The webhook's check read that row at 10:14:14.122 and answered `authoritative_source_invalid`.
4. The webhook's retry attached the Handoff at 10:15:17.

So the retry is what confirmed these groups, and it stays. The kiosk reconciliation error is most likely the booking-item key collision already seen in the lookup: the kiosk snapshot writes `jybi_…` keys with `ON CONFLICT (booking_item_key)`, the webhook had written `bookingitem:…` for the same `booking_item_id`, and the unique index raises 23505. The log carries no SQLSTATE. It is a Booking Lambda fix outside this issue.

## Rejected options

- **One message group per booking.** One booking's retry would only hold its own later events. But Lambda polls several message groups at once. With reserved concurrency 1 those polls are throttled, and the messages can reach the DLQ unprocessed. Avoiding that needs the event source's maximum concurrency, at least 2, which roughly doubles peak ROLLER calls. D0262 rejected this too. After this change the only holds left in the weekend's data are the 60 s retries above, which are better removed at their source.
- **An "already attached" answer inside the Booking Lambda.** It would also cover the lookup, but it changes a Lambda that other issues are editing now, and the worker would still invoke it for every webhook.
- **A shorter retry for the race.** The retry is what attaches those Handoffs, so it would only move the wait. Fixing the reconciliation error removes it.

## Validation

- `npm run validate:gh581-kassan-change`: 6 of 6 pass. Against the code before this change, 5 fail; only the transient-retry case passes, as it should.
  - It replays 0088 through one real queue delivery: the booking is upserted at 24000, there is no Booking Lambda call, no visibility change and no batch failure, and the event is `processed`.
  - A redriven DLQ message with status `failed` and 8 attempts processes the same way.
  - A final reason on an unattached draft is recorded once, and `authoritative_source_invalid` still comes back after 60 s.
  - Each final reason, `function_error` and `unknown` are classified, and no personal data reaches the reason code.
  - Every reason in the Booking Lambda is classified exactly once.
- These existing validators also pass:
  - `validate:gh346-webhook-retry`, `validate:t0197-webhook-reconciliation`, `validate:gh282-kiosk-handoff-repair` and `validate:gh257-webhook-item-reconcile`;
  - `validate:kiosk-payment-reconciliation`, `validate:gh481-kiosk-publish-with-payment`, `validate:gh531-kiosk-expected-miss` and `validate:gh483-kiosk-staff-resolution`;
  - `validate:gh456-auto-checkin`, `validate:gh547-ready-is-checked-in`, `validate:gh563-addon-release` and `validate:gh570-draft-retry`;
  - `validate:gh340-server-errors`, `validate:gh335-alarm-routing` and `validate:t0195-least-privilege`.
- The PostgreSQL parts of `gh481`, `gh483` and `gh563` run in CI.
- The webhook role's read of the two draft columns was checked read-only on Park.

## After release

- **The DLQ.** With Love's OK, the monitor redrives the two messages. Under the new rule each processes in one delivery and is stored as `processed`. Then `webhook-dlq-visible` returns to OK. The alternative is to delete them once the cache matches ROLLER; it already does (24000).
- **A kassan change.** Kassan changes a kiosk booking that has been confirmed, for example by removing an entry. The processor log shows no `kiosk_confirmation_failed` for it, the event is `processed` in one attempt, and `webhook-queue-stale` stays OK.

## Remaining risks

- If kassan changes a kiosk booking before its Handoff is attached, the group stays with staff, as before. The event is now recorded instead of retried.
- The Lookup Lambda keeps its own copy of the kiosk check. A lookup of a kiosk booking that kassan has changed still answers 500. None was seen in the logs since 15:00 on 2026-10-18.
- Until the kiosk reconciliation's database error is fixed, it still costs some kiosk purchases an extra minute (11 of 165 this weekend).
