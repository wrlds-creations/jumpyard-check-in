# Issue #346: webhook retry timing and the kiosk confirmation race

Issue [#346](https://github.com/wrlds-creations/jumpyard-check-in/issues/346), decision D0262.

## What happened

These facts were read from Park logs, metrics and alarm history on 2026-10-14, without changing anything. There were two stalls in the 30 days from 2026-09-15. Times are UTC.

| Kiosk card purchase | Webhook failure | Queue held until | Repaired by recovery |
|---|---|---|---|
| 2026-10-07: approved 14:37:53; ROLLER publish accepted and the kiosk confirmed by 14:37:54.573; automatic check-in redeemed 14:37:59 | Booking Lambda `needs_staff` 14:37:59.062; worker `kiosk_confirmation_failed` 14:37:59.079 | 14:49:54 | The failed booking at 14:40:05 (confirmed); seven waiting events at 14:45 |
| 2026-10-12: approved 13:03:25; the kiosk confirmed 13:04:36 after 70 s of 404s; automatic check-in redeemed 13:04:40 | `needs_staff` 13:04:40.344; `kiosk_confirmation_failed` 13:04:40.367 | 13:16:36 | 13:10:07 (confirmed) |

- These were the worker's only handled failures since 2026-09-15. In the same period, 59 kiosk card payments were approved.
- Neither stall came from a deploy. The processor Lambda was last modified on 2026-09-23. The 2026-10-07 stall began six minutes after Park run 37636977573 ended.
- Both times, `webhook-processing-failures` and `webhook-queue-stale` went to ALARM and sent email.
- Volume from 7 to 13 October was 94–752 events per day. A processed event takes 2–4.5 s, and the Saturday peak is about 3 events per minute.

## Why

In a normal kiosk card purchase, five things happen in order:
1. The kiosk reconciliation confirms the booking.
2. Automatic check-in redeems the tickets and writes a final refresh of the booking row (`roller_redeem_final_refresh`).
3. ROLLER's `Created` webhook arrives 2–9 s after the kiosk confirmation.
4. The worker upserts the booking (`roller_webhook_enrichment`).
5. The worker's redundant kiosk confirmation reads that row and returns `confirmed`.

In both failures, automatic check-in's final refresh landed between the worker's upsert and its confirmation read, in the same second. The confirmation check accepted only `roller_live_lookup` and `roller_webhook_enrichment`, so it returned `needs_staff`.

The exact reason is inferred from the timing and the code, because nothing logged it. That reason is most likely `authoritative_source_invalid`. `markKioskReconciliationNeedsStaff` keeps a confirmed draft's own result, so nothing was stored either.

The worker threw `kiosk_confirmation_failed`, and its message stayed invisible for the queue's 720 s. Every later event in the single FIFO group waited behind it. The five-minute recovery carried the waiting events past it, so staff lists lagged 2–12 minutes. The guest was admitted both times, and the draft stayed `confirmed`.

## Change (D0262)

1. **Booking Lambda.** `KIOSK_AUTHORITATIVE_BOOKING_SOURCES` adds `roller_redeem_final_refresh`. The redeem refresh is a full live ROLLER readback: it writes venue, status, payment, totals, date, `externalId` and tickets. The partial kiosk snapshot (`kiosk_payment_reconciliation`) is still not accepted.
2. **Worker retry timing.**
   - When the worker sees a failure, it calls `ChangeMessageVisibility` so the message returns after 60, 120, 240 or 480 s, chosen by `ApproximateReceiveCount`.
   - On the fifth delivery it sets 0 s, so SQS moves the message to the DLQ at once.
   - If that call fails, the 720 s visibility applies.
   - Crashes, Lambda timeouts and throttled deliveries keep the 720 s margin that AWS recommends (six times the 120 s timeout).
3. **Worker ROLLER timeout.** Each ROLLER `fetch` gets `AbortSignal.timeout(15 s + the 1 s pacing wait)`. A hang now fails as `roller_request_timeout`. Before, it ran into the 120 s Lambda timeout, counted no attempt and held the message for 12 minutes.
4. **Worker logging.** `kiosk_confirmation_failed` now logs and stores the Booking Lambda's reason code. If the Lambda failed, the code is `function_error`; if the reason is missing or not a plain code, it is `unknown`. Each `failed` log line also shows `retryInSeconds`.

**Unchanged:**
- One message group, reserved concurrency 1 and batch size 1.
- Visibility of 720 s and `maxReceiveCount` 5.
- The five-minute recovery, the alarms and IAM. The worker's consume grant already included `sqs:ChangeMessageVisibility`.
- ROLLER calls per attempt (2–3). A failing event still gets at most five queue attempts, now within about 15 minutes instead of about an hour.

## Rejected options

- **Shorter queue visibility.** It would go below AWS's six-times guidance, and the worker has a single slot that it shares with the recovery job. Throttled deliveries could reach the DLQ.
- **One message group per booking, with more workers.** Event-source polling scales beyond reserved concurrency 1, which gives throttled receipts. It roughly doubles peak ROLLER calls, and the booking writes are last-writer-wins.
- **Lower `maxReceiveCount`.** The DLQ alarm already exists, and transient faults would need manual replay more often.
- **No deploys during opening hours.** This is already the release rule, and the stalls were not caused by deploys.
- **The September branch `codex/gh-346-webhook-capacity`.** It added durable attempt accounting and a DLQ written from code. It was never merged, and this smaller change supersedes it.

## Validation

- `npm run validate:gh346-webhook-retry`: 9 of 9 pass.
- These existing validators also pass:
  - `validate:t0197-webhook-reconciliation`
  - `validate:gh282-kiosk-handoff-repair`
  - `validate:kiosk-payment-reconciliation`
  - `validate:gh481-kiosk-publish-with-payment`
  - `validate:gh531-kiosk-expected-miss`
  - `validate:gh483-kiosk-staff-resolution`
  - `validate:gh456-auto-checkin`
  - `validate:gh257-webhook-item-reconcile`
  - `validate:gh340-server-errors`
  - `validate:gh335-alarm-routing`
  - `validate:gh484-kiosk-phone-link`
  - `validate:gh527-zero-kr-venue`
  - `validate:gh333-staff-redeem-recovery`
  - `validate:gh279-redeem-item-reconcile`
  - `validate:kiosk-terminal-backend`
  - `validate:gh285-kiosk-addon-terminal`

## After release

- **Kiosk card purchase on Park.** `webhook-processing-failures` and `webhook-queue-stale` stay OK, and the processor log shows no `kiosk_confirmation_failed`. The Booking Lambda shows a second `confirmed` a few seconds after the first.
- **Any future failure.** Its log line carries `reason` and `retryInSeconds`.

## Remaining risks

- A hard crash or Lambda timeout still holds the group for 12 minutes. None was seen in 30 days.
- A failure that lasts longer than about 15 minutes now reaches the DLQ sooner, and the event then needs the guarded replay.
- The race's reason code is inferred. If it happens again, the new logging will confirm it.
