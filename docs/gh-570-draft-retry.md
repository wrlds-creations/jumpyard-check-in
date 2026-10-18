# GH-570: one more try for a ROLLER draft, and no locked kiosk after a failed draft

Issue #570. Decision D0278.

## What happened

On 2026-10-17, during the Nacka test weekend, the Booking Lambda logged `cloud.server_error` twice with `stage: create_draft_booking` and `providerStatusCode: 500`:

- 13:30:50 on K1, after 6.9 s;
- 13:34:59 on K3, after 7.1 s.

Contact lookup, availability and the kiosk quote had succeeded. Cloud answered `502`, the guests pressed again, and no money was taken.

The kiosk had already reserved its installation and terminal claims (`kiosk_terminal_binding`, D0220) before ROLLER's draft call. No prepayment row ever referenced them, and D0220 gives active claims no expiry. Every later purchase on K1 and K3 therefore got `409 kiosk_payment_busy`, which the kiosk shows as "Vi kunde inte reservera bokningen.". About 15 purchases were refused until the monitor released exactly those four rows at 14:07:37.

Park access logs for `POST /v1/bookings/draft` over the 14 days to 2026-10-18 show 261 successes: p50 1.4 s, p90 1.9 s, p99 3.6 s, maximum 9.3 s. The only two 502s are the ones above.

## What changes

- **One more try.** `createRollerDraft` sends ROLLER's `POST /bookings/draft`. After a 5xx or a thrown error, such as a lost connection or a timeout, it waits 1 s and sends the same payload once more, with the same `externalId`. A 4xx is ROLLER's answer about the purchase and is never retried. This covers capacity, validation, conflicts and 429.
- **Time budget.** The second try starts only when the first answer came within 12 s of the request. Every try is aborted 25 s after the request began. The kiosk and the phone therefore always get an answer before API Gateway's 30 s limit, and a hanging ROLLER call can no longer keep the Lambda working after the client has given up.
- **Duplicates.** ROLLER offers no read of an unpaid draft:
  - booking search and booking detail do not list it, and detail answers 404 (D0239);
  - the Data API export leaves it out: none of the 13 unpaid Cloud drafts of 2026-10-17 reached the `roller_bookings` cache, while all 145 paid ones did.

  Resending the same `externalId` is therefore the only way ROLLER could recognise a draft it created before its 500. If ROLLER still keeps a second draft, it stays unpaid and its places return when ROLLER's 30-minute draft timer ends. Nobody holds its JWT, so it can never be paid. This is what already happens today when a guest presses again.
- **Claims released.** Each draft handler runs everything after the reservation inside `releaseKioskClaimsOnFailure`. A failure before the prepayment row exists runs `releaseKioskDraftBinding`. Such failures are an error answer from ROLLER after the tries, a failed kiosk amount check, a failed zero-owing publish, or any thrown error. The release is the existing partial-claim release with two guards: it touches only this attempt's `started` claims, and only while no `prepayment_booking_drafts` row has this `payment_attempt_id`. A drafted attempt keeps its claims until a D0220 outcome, as before. A failed release logs `booking.kiosk_claims_release_failed` and leaves the claims as they were.
- **Why releasing is safe.** The kiosk starts a terminal payment itself, with the draft's JWT (`payWithJwt`). Cloud returns that JWT only with a saved draft, so an attempt without a prepayment row can never charge a card.
- **Log.** The `booking.draft_*` and `booking.add_product_draft_*` events carry `rollerDraftAttempts`, with `status`, `failure` and `elapsedMs` for each try. A failed try logs `roller_draft_attempt_failed` with `next: retry` or `stop` and the `externalId`. A release logs `kiosk_claims_released` with the payment-attempt id and the number of released rows. `RollerApiErrorCount` still counts every failed ROLLER answer.
- **Unchanged:**
  - the quote, availability and publish calls, and every other ROLLER call;
  - the phone payment;
  - D0220 for drafted attempts;
  - a Lambda that stops mid-request (crash or Lambda timeout) still leaves its claims for staff resolution (D0239).

## Calls to ROLLER

Normally there is one draft call per purchase, as before. Only after a 5xx or a lost connection are there two.

## Kiosk message (kiosk repository)

After this change, `kiosk_payment_busy` means a real unresolved payment, not a failed draft. The kiosk still shows the generic "Vi kunde inte reservera bokningen." for it. A clearer message belongs in the kiosk repository and is not part of this issue.

## Code

`infra/lambda/booking/index.js`:

- `ROLLER_DRAFT_RETRY_PAUSE_MS` (1 000), `ROLLER_DRAFT_RETRY_LATEST_START_MS` (12 000) and `ROLLER_DRAFT_DEADLINE_MS` (25 000);
- `postRollerJson` takes an optional `{ timeoutMs }`, which only the draft call passes;
- `createRollerDraft` handles the tries and the log;
- `handleDraft` and `handleAddProductDraft` keep everything up to the reservation. They pass the rest to `createReservedDraft` and `createReservedAddProductDraft` through `releaseKioskClaimsOnFailure`;
- `releaseKioskDraftBinding` is the guarded release.

## Validation

- `validate:gh570-draft-retry` has 26 tests and runs the real handlers for new bookings and add-ons against a scripted ROLLER and an in-memory claim table. It covers:
  - a first 500 and then success, which gives one draft;
  - two 500s, which give today's 502 and release the claims;
  - 400, 404, 409, 422 and 429, which are not retried;
  - a draft ROLLER created despite its 500, which is reused rather than duplicated;
  - lost connections and timeouts;
  - the 12 s and 25 s budget;
  - errors before and after the prepayment row;
  - the phone;
  - K1 taking the next purchase after two 500s, while a drafted attempt still blocks it;
  - the deadline on the draft call only.

  All 26 fail on the previous code.
- `validate:kiosk-terminal-backend` now checks that both handlers send the terminal payload through `createRollerDraft`.

## Open

- **ROLLER:** does `POST /bookings/draft` recognise a repeated `externalId`? ROLLER's documentation does not say, so the reuse test describes the hoped-for ROLLER behaviour. Cloud's part is to resend the same id.
- **Release:** the release must happen outside test-day opening hours.
