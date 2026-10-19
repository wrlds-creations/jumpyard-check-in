# Issue #583: alarms that are not errors

Issue [#583](https://github.com/wrlds-creations/jumpyard-check-in/issues/583), decision D0284.

## What happened

On Sunday 2026-10-18 at Nacka two Park alarms fired on designed behaviour. Every purchase went through. Times are Swedish time unless marked UTC.

**`redeem-lambda-errors` at 11:36, 13:29 and 15:06** (groups 0034, 0068 and 0092). Read-only from the Park logs:

| Group | Worker confirmed (UTC) | Webhook confirmed | Second start threw |
|---|---|---|---|
| 0034 | 09:34:09.34 | 0.36 s later | 09:34:11.53 |
| 0068 | 11:26:39.44 | 2.6 s later | 11:26:44.11 |
| 0092 | 13:04:59.41 | 0.12 s later | 13:05:01.69 |

- The Booking Lambda's reconciliation worker found ROLLER's booking and confirmed it (`confirmKioskReconciliation`), which started the automatic check-in (`kiosk_booking_confirmed`).
- The webhook for the same booking arrived seconds earlier. Its authoritative confirmation (D0262) runs `confirmKioskReconciliation` again, which started a second automatic check-in.
- Both reached the shared redeem key `staff-redeem:<session>`. The one that came second got `redeem_in_progress` and threw `auto_checkin_retry:redeem_in_progress` for a Lambda retry. Lambda counts that as an error, and the retry a minute later found the group checked in.

The double start was not new with the 09:54 release. On 2026-10-17 and 18 the webhook's confirmation followed the worker's within 8 s for 104 of 125 worker-confirmed purchases. The second start usually found the check-in finished, or replayed its receipt after 3–4 ROLLER calls of its own. It threw only when it reached the key while the first one held it. That happened once before, on 2026-10-09 at 14:41 UTC.

**`roller-api-errors` at 10:32 and 11:00.**
- The worker reads ROLLER back every 5 s for 75 s, and since D0258 only the last 404 counts as a ROLLER error.
- On 2026-10-17 and 18 ROLLER confirmed kiosk purchases 51–96 s after the approval, so the readbacks ran out for 28 of 193 purchases.
- The webhook confirmed each of them within seconds, at the latest 96 s after the approval. The exception was 15:18, during the webhook queue block: the confirmation came after 392 s.
- At 12:05 the alarm was instead one 5 s timeout on `get_public_checkout_products`. That is a real ROLLER delay and stays an error.

## Change (D0284)

1. **One automatic check-in per kiosk confirmation.** `confirmKioskReconciliation` reads the session before it attaches the booking, in the same statement (`previously_confirmed`). It starts the automatic check-in only for a session that was not yet `confirmed` for that booking (`newly_confirmed_session_ids`). The repeat still attaches and answers `confirmed`, so the webhook's processing is unchanged.
2. **`redeem_in_progress` is a hand-off, not an error.** An automatic check-in that finds the session's redeem in progress ends with `{ status: 'in_progress' }` and one log line `checkin.auto_checkin_in_progress` (handler and trigger only). The attempt that holds the key completes the check-in. If it fails, it retries or hands the group to staff itself. A ROLLER outage still throws for Lambda's retry.
3. **The readback's last step comes at 100 s.**
   - The worker still reads ROLLER every 5 s to 75 s, and then has one more step at 100 s.
   - Like every step, that one first reads Cloud's own rows. A purchase the webhook has confirmed ends there, with no ROLLER call.
   - Only a purchase still unconfirmed is read back once more, and only that 404 counts as `RollerApiErrorCount`. The 404 at 75 s is now an expected miss.
   - When the webhook queue is blocked, as on 2026-10-18 at 15:18, that readback confirms the purchase itself.

**Timing.**
- The worker is an asynchronous invocation of the Booking Lambda, so API Gateway's 30 s limit does not apply. It now runs up to about 100 s inside the Lambda's 2-minute timeout.
- The kiosk never waits for it: the kiosk continues on the durable approval with the provisional session.
- The kiosk staff resolution's 5-minute "no payment" wait (D0239) concerns unapproved attempts and is unchanged.

**ROLLER calls.**
- A purchase makes the same readbacks as before, plus one at 100 s only when nothing has confirmed it by then.
- The removed second check-in start saves its 3–4 ROLLER calls on most kiosk purchases.

**Unchanged:** IAM, environment variables, migrations and alarms. The same goes for the webhook processor, the add-on paths (#547, #563), the Session Lambda's triggers and the Redeem Lambda's checks, keys and receipts.

## Validation

- `npm run validate:gh583-alarms-not-errors` (part of `npm run validate`). It drives the real Lambdas with a scripted Aurora, Lambda and ROLLER:
  - an automatic check-in that finds the redeem in progress ends without an error, without a failure count or a ROLLER redemption, and logs the hand-off;
  - a ROLLER outage still throws for Lambda's retry;
  - the worker's confirmation starts the check-in, and the webhook's repeat starts nothing but still gets its confirmation;
  - the worker's steps are every 5 s to 75 s, then 100 s;
  - a purchase the webhook confirms after 75 s ends at 100 s with 16 readbacks and no ROLLER error;
  - a purchase unconfirmed at 100 s is read once more: a 404 is the one error and `needs_staff`, a 200 confirms it.
- With `GH583_DATABASE_TEST=true` (CI's "Staff handout database" job), against PostgreSQL with all migrations and the Booking Lambda's own role:
  - the worker's confirmation attaches the session and starts one check-in;
  - the webhook's repeat attaches again and starts none;
  - a purchase whose readbacks ran out (`needs_staff`) is still admitted by the webhook's later confirmation.
- Locally the PostgreSQL test ran against PGlite 0.5.8 (PostgreSQL 18.3). On the previous code all eight tests fail, among them "no second automatic check-in" and `auto_checkin_retry:redeem_in_progress`.
- Updated for the new last step: `validate:gh531-kiosk-expected-miss` (17 readbacks when nothing confirms), `validate:gh481-kiosk-publish-with-payment` and `validate:kiosk-payment-reconciliation` (the offsets). `validate:gh456-auto-checkin` follows the renamed result column.

## After release

The Park plan may change only the Booking and Redeem Lambda code. Release outside test-day opening hours.

- **Love's kiosk purchase.** Buy at the kiosk as a guest. The group is checked in as before, and `redeem-lambda-errors` and `roller-api-errors` stay OK.
- **A normal day.**
  - The Redeem log has no `auto_checkin_retry:redeem_in_progress`.
  - A rare `checkin.auto_checkin_in_progress` line is the designed hand-off.
  - A Booking `get_booking_detail` error comes only from a purchase still unconfirmed at 100 s.

## Remaining risks

- Two confirmations whose statements overlap within a few milliseconds can both see the session unconfirmed and both start the check-in. The second then ends as an `in_progress` hand-off without an error.
- A purchase ROLLER confirms later than about 100 s, with the webhook also late, still counts one ROLLER error, as a real delay should.
