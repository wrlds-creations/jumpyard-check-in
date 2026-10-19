# GH-531: kiosk reconciliation waits are expected misses

Issue #531. Decision D0258.

## What happened

After a kiosk terminal approval, the Booking Lambda's kiosk reconciliation reads the booking from ROLLER (`GET /bookings/{id}`, operation `get_booking_detail`) every 5 seconds, 16 times, from 0 to 75 s. ROLLER creates the paid booking from its own payment notification about 65–71 s after the approval (`KioskApprovalToBookingLatency` 65 957–71 038 ms on 2026-10-13). Until then it answers 404.

Each of those 404s counted as a ROLLER error, so every kiosk card purchase emitted 10–16 `RollerApiErrorCount` on 2026-10-13. That caused three problems:

- `roller-api-errors` (at least 1 per 5 minutes) flipped to ALARM on every kiosk card purchase.
- After consecutive purchases, `roller-api-errors-sustained` emailed Love at 15:47 and 15:52 local.
- The Park release verify requires zero alarms, so each purchase blocked deploys for 15–20 minutes. This happened to #519 runs 38384829064 and 38386103368.

## What changes

- **Waiting 404s:** while attempts remain, a 404 from the reconciliation's readback emits `RollerApiExpectedMissCount: 1` instead of `RollerApiErrorCount: 1`. The call still emits `RollerApiCallCount: 1` with the same dimensions and fields: operation `get_booking_detail`, method `GET`, status 404 and `Ok: false`.
- **Timeout:** the last attempt's 404 still emits `RollerApiErrorCount`. A reconciliation that runs out of its window therefore still alarms, alongside its existing `needs_staff` state and `booking.kiosk_terminal_reconciliation_exhausted` event.
- **Unchanged:** every other status during the wait (5xx, 401, 429, 400), every other 404, and every other caller and handler. The cadence and the number of ROLLER calls stay the same.
- **Alarms:** `roller-api-errors` and `roller-api-errors-sustained` keep reading `RollerApiErrorCount` with the same thresholds.

## Code

`infra/lambda/booking/index.js`:

- `emitRollerApiMetric` takes `expectedMiss`. A non-OK answer with `expectedMiss` emits `RollerApiExpectedMissCount`; any other non-OK answer emits `RollerApiErrorCount` as before.
- `getRollerJson` takes `{ expectedMissStatus }`. It marks the answer as an expected miss only when the status matches.
- `handleKioskPaymentReconciliation` passes `expectedMissStatus: 404` on every attempt except the last.

## AWS

The change is code only. The new embedded metric lives in `JumpYard/Cloud` under the existing three dimension sets, which adds at most three small custom metric series. There is no new alarm, threshold, dashboard or resource. See [AWS_RESOURCES.md](../AWS_RESOURCES.md#issue-531-kiosk-reconciliation-expected-misses-booking-code-only).

## Validation

- `validate:gh531-kiosk-expected-miss` runs the real reconciliation, `getRollerJson` and `emitRollerApiMetric` against scripted ROLLER answers. It checks:
  - waiting 404s, which produce no error;
  - a timed-out reconciliation, which produces one error;
  - real failures during the wait, which stay errors;
  - other 404s, which stay errors;
  - alarms that read only `RollerApiErrorCount`.
  On the previous code, four of its five tests fail.
- These validators still pass: `validate:gh481-kiosk-publish-with-payment`, `validate:kiosk-payment-reconciliation`, `validate:kiosk-terminal-backend`, `validate:gh483-kiosk-staff-resolution`, `validate:gh282-kiosk-handoff-repair`, `validate:gh285-kiosk-addon-terminal`, `validate:gh340-server-errors` and `validate:gh335-alarm-routing`.
- **After release:** a kiosk card purchase on Park leaves `roller-api-errors` OK, and `RollerApiExpectedMissCount` shows its waiting readbacks.

## Revised by #583 (D0285)

ROLLER confirmed kiosk purchases up to 96 s after the approval on 2026-10-18, so the last attempt at 75 s often counted an error just before the webhook confirmed the purchase. The last attempt now comes at 100 s and reads ROLLER only when nothing has confirmed the purchase by then; the 404 at 75 s is an expected miss. See [the notes](gh-583-alarms-not-errors.md).
