# GH-447: a kiosk attempt that never reached the terminal no longer locks the kiosk

Issues #447 and #580, with kiosk #134. Decision D0282 (kiosk D0087).

## What happened

On Sunday 2026-10-18 at Nacka, kiosk K5 (`nacka-k5`) sent `POST /v1/bookings/draft` at 14:33:38. Cloud answered `201` after 6.9 s, which is slow for ROLLER's draft. The draft was `jypd_952827fc5b68430994` with attempt `jytp_620de7a91e30433b82`, for 480 kr.

Two page loads followed, at 14:33:50 and 14:34:39. They were most likely Chrome's pull-to-refresh, because the kiosk web had no `overscroll-behavior` on `html` or `body`. The kiosk lost the `201` and came back on the contact step. It never had the draft's payment JWT, so no terminal payment could start.

The attempt stayed `created` with no terminal result. D0220 keeps the installation and terminal claims until a definitive outcome, so every later purchase got `409 kiosk_payment_busy`. That made 16 refused attempts from 14:34 until staff switched K5 off around 15:15. The kiosk showed only "Vi kunde inte reservera bokningen."

The same lock lasted 27 hours on 2026-09-23 (#447).

## What changes

- **Release on evidence.** `reserveKioskDraftBinding` claims as before. When the claim is busy, `releaseAbandonedKioskAttempts` reads the attempts that hold the two keys (`readKioskClaimHolders`). An attempt gets one `GET /bookings/{draft uniqueId}` only when all of these hold:
  - it is still `created`, so it never reported a terminal result;
  - it is not published;
  - it has no booking reference and no booking in the local cache;
  - it is at least 10 minutes old, or its own kiosk reports it (below).
- **The guarded statement.** ROLLER's 404 runs `releaseAbandonedKioskAttempt`. One guarded statement records `cancelled` with `reconciliation_last_result = 'abandoned_no_payment'` and inserts the audit `booking.kiosk_abandoned_attempt_released`. The statement re-checks every condition, so a late result, booking or publish makes it a no-op. A definitive outcome lets the claim be taken over, so the reservation is tried once more in the same request.
- **The kiosk's report (kiosk #134).** The kiosk saves a draft request's idempotency key before it sends the request. It drops the key once the answer carries a payment JWT or a 4xx shows that nothing was created. Saved keys travel with the next draft as `unstartedDraftKeys`, at most three:
  - an answer lost to a reload or a lost connection;
  - a server error;
  - a draft without a payment JWT (the PENDING card).

  A reported attempt of the same installation qualifies without the 10 minutes, matched on `prepayment_booking_drafts.idempotency_key` and `kiosk_installation_id`. Everything else still applies, including ROLLER's 404.
- **What stays locked.** These keep the kiosk busy as before:
  - `unknown` and approved attempts, which reached the terminal and follow D0239;
  - an attempt ROLLER knows (paid, unpaid or unclear);
  - a failed ROLLER check;
  - a claim without a prepayment row (D0220/D0278);
  - any error in the release, which is logged and fails closed.
- **Log, metric and audit.**
  - Every busy reservation logs `kiosk_payment_busy` with each holder's attempt id, status, age, report flag and ROLLER classification.
  - A release emits `KioskTerminalOutcomeCount` with outcome `abandoned`.
  - ROLLER's 404 counts as `RollerApiExpectedMissCount` (D0258), so the release does not trip `roller-api-errors`.

## Why it is safe

- **No token, no payment.** The kiosk starts a terminal payment itself, with the draft's JWT. A kiosk that lost the answer never had it.
- **The wait and the evidence.** For an attempt that may have reached the terminal, the 10 minutes is twice the staff rule of D0239. The terminal times out after about 135 s, and ROLLER books a late payment within about 75 s. ROLLER's 404 together with an empty cache is the same evidence staff use for "Ingen betalning".
- **A late approval is never lost.** It still updates the released attempt, as `recordKioskTerminalOutcome` always has. The PostgreSQL test checks this.

## Calls to ROLLER

- **Normal purchase:** none extra.
- **Busy purchase:** one read per qualifying attempt. A kiosk-reported attempt can be read at once; any other attempt only after 10 minutes.

## Code

- **Booking Lambda (`infra/lambda/booking/index.js`):**
  - `reserveKioskDraftBinding` and `claimKioskDraftBinding`;
  - `releaseAbandonedKioskAttempts`, `readKioskClaimHolders` and `releaseAbandonedKioskAttempt`;
  - `readKioskStaffRollerEvidence` takes `expectedMissStatus`;
  - the draft and add-on normalizers read `unstartedDraftKeys`.
- **Contract module (`kiosk-terminal-contract.js`):**
  - `KIOSK_ABANDONED_ATTEMPT_MIN_AGE_SECONDS` (600);
  - `kioskAbandonedAttemptCheckable`;
  - `normalizeKioskUnstartedDraftKeys`.

## Validation

- `npm run validate:gh447-abandoned-kiosk-attempt` (26 tests) runs the real draft and add-on handlers against an in-memory claim table and a scripted ROLLER. It covers:
  - K5's release after 10 minutes;
  - the kiosk-reported release;
  - every condition that keeps the kiosk busy without a ROLLER call;
  - every ROLLER answer other than 404;
  - a lost race;
  - a failing read;
  - the guarded statement.
- The PostgreSQL case (`GH447_DATABASE_TEST`, CI port 55435) runs the statements as `jumpyard_booking_runtime`. It covers:
  - one release and one audit;
  - the guards;
  - another installation's report;
  - two purchases racing for one kiosk;
  - a late approval before and after a release.

  Locally the case passed against a PGlite stand-in, and the two statements passed as the booking role in a rolled-back transaction.
- `validate:gh531-kiosk-expected-miss` now allows this second expected-miss caller.

## Not part of this change

- K5's attempt from 2026-10-18 is released by the monitor with Love's explicit OK, because that is a production write.
- There is no new alarm. The monitor's lock check already flags a long-held claim.
