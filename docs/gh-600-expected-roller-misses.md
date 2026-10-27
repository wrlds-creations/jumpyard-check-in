# GH-600: expected ROLLER 404s in lookups and the staff payment check

Issue [#600](https://github.com/wrlds-creations/jumpyard-check-in/issues/600), decision D0290. It widens D0258 (#531).

## What happened

ROLLER answers 404 when a booking does not exist. Two callers answer that 404 as a normal result, yet both counted it as `RollerApiErrorCount`.

- **Guest lookup.** On 2026-10-27 two lookups got ROLLER 404 at 11:39:42 and 11:40:08 UTC. A lookup at 11:40:19 UTC returned 200, most likely the same guest after correcting the number. `roller-api-errors` was in ALARM from 11:40:55 UTC for about 15 minutes.
- **The Park Lookup log since 2026-10-01** (read-only): 582 `get_booking_detail` calls, of which 562 answered 200, 11 answered 500 and 9 answered 404.
  - All 11 answers of 500 came during ROLLER's incident on 2026-10-24.
  - All nine 404s were direct lookups by booking number or QR code, mostly in pairs about 25 s apart, on 2026-10-15, 10-18, 10-23, 10-24 (twice) and 10-27.
- **Staff payment check.** On 2026-10-20 two staff resolution reads on the test kiosk, at 06:49 and 06:52 UTC, got ROLLER's 404 and raised the alarm. On an unpaid attempt that 404 is the expected "no booking" evidence (D0239).

The raw alarm sends no email; only `roller-api-errors-sustained` does. It still wakes the monitor, and Park's deploy verify needs zero alarms, so one typo blocked deploys for about 15 minutes.

## What changes

- **Lookup Lambda.**
  - The direct identifier lookup (`POST /v1/check-in/lookup` with a booking number or QR code) passes `expectedMissStatus: 404` to `getBookingDetail`.
  - ROLLER's 404, which the handler answers as `404 booking_not_found`, emits `RollerApiExpectedMissCount: 1` instead of `RollerApiErrorCount: 1`.
  - `getBookingDetail` takes `expectedMissStatus`, and the Lookup's own `emitRollerApiMetric` takes `expectedMiss`, as in the Booking Lambda (D0258).
- **Booking Lambda.** The kiosk staff resolution route (`inspect`, `no_payment` and `paid`) reads ROLLER with `readKioskStaffRollerEvidence(config, row, { expectedMissStatus: 404 })`, as the automatic release does (D0286).
- **The call count.** Each call still emits `RollerApiCallCount: 1` with the same dimensions and fields: operation `get_booking_detail`, method `GET`, status 404 and `Ok: false`.

**Unchanged:**
- 400, 401, 403, 409, 429 and 5xx on the same reads still count as errors. Timeouts never emitted the metric and keep their server-error report.
- A 404 on the detail read of a booking that ROLLER's search just returned (an email lookup) still counts. So does the T0201 controlled refresh's 404.
- What the guest, the kiosk and the staff see, the number of ROLLER calls, and every other caller and handler.
- `roller-api-errors` and `roller-api-errors-sustained` keep reading `RollerApiErrorCount` with the same thresholds. There is no alarm on the misses.

## AWS

This is a code change in the Lookup and Booking Lambdas only.
- The Lookup handler's misses add at most two small custom metric series under the existing dimension sets (handler; handler, operation and method). The Booking series exist since D0258.
- There is no alarm, threshold, dashboard, IAM, environment, migration or resource change, and the Park template keeps 228 resources.

See [AWS_RESOURCES.md](../AWS_RESOURCES.md#issue-531-kiosk-reconciliation-expected-misses-booking-code-only).

## Validation

- `npm run validate:gh600-expected-roller-misses` is part of `npm run validate`. It runs the real Lookup handler as Park runs it (assisted lookup at Nacka) and the real staff resolution, with the real metric code and a scripted ROLLER. It checks that:
  - an unknown booking number or QR code answers `404 booking_not_found` as before, with one ROLLER call, `RollerApiExpectedMissCount: 1` and no `RollerApiErrorCount`;
  - 400, 401, 403, 409, 429, 500, 502 and 503 on the same lookup still answer `502 roller_lookup_failed` with one error, and a timeout is unchanged;
  - the 404 on a search hit's detail read and the T0201 refresh's 404 still count as errors;
  - the staff `inspect`, `no_payment` and `paid` checks on an unpaid attempt count ROLLER's 404 as a miss and decide as before, while the same failures still count as errors;
  - only the direct lookup and the three Booking callers name an expected miss, and the alarms still read only `RollerApiErrorCount`.
- On the previous Lambda code, the six tests for the new behaviour fail and the 22 tests for unchanged behaviour pass.
- Updated: `validate:gh340-server-errors`, whose 404 test now expects the miss (it had left that metric to this issue), and `validate:gh531-kiosk-expected-miss`, which now allows three Booking callers.

## After release

The Park plan may change only the Lookup and Booking Lambda code. There is no frontend change and no public promotion.

- **Love's test.** Type a wrong booking number on the office test kiosk. The kiosk shows its not-found message as before, and `roller-api-errors` stays OK.
- **A normal day.** The next real lookup 404 shows `RollerApiExpectedMissCount` in the Lookup log, and `roller-api-errors` stays OK. The monitor checks this read-only.

## Remaining risks

- A burst of unknown booking numbers no longer shows on `roller-api-errors`. The route's rate limits still bound it, and `RollerApiExpectedMissCount` shows it on the metric.
- If ROLLER ever answered 404 for bookings that exist, lookups would show only misses. During ROLLER's incident on 2026-10-24, booking detail failed with 500, not 404.
