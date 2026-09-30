# #458 Safety before payment

Issue: https://github.com/wrlds-creations/jumpyard-check-in/issues/458 (paired kiosk: https://github.com/wrlds-creations/jumpyard-check-in-kiosk/issues/143). Decision: D0231 (kiosk D0043).

## Decisions

Workshop points 2 and 3 (2026-09-28) asked for fewer questions. Love decided on 2026-09-29 that safety comes before payment on phone and kiosk, with the approval on the video screen instead of a separate rules step. After the localhost preview on 2026-09-30 Love chose:

- **Design A** on phone and kiosk: when the film has played to the end it docks to the top and the approval appears under it.
- **Buy path:** … → review (Översikt) → safety → contact (Kontakt) → payment → completion.
- **Existing booking:** add-ons → review → safety → add-on payment → completion. Without add-ons: add-ons → safety → completion.
- **Wording:** the six short rules and "Jag intygar att samtliga i min bokning har tagit del av reglerna och förstått dem." / "I confirm that everyone in my booking has read and understood the rules."
- **Done at approval** (later the same day): the guest must not be affected by ROLLER's delay. "När kunden har fått godkänd betalning så ska den bara känna att då är jag klar", and "telefonen ska också visa klar direkt". The system handles the rest in the background.

## One safety screen

`SafetyVideo` keeps the genuine-end rule (D0210/D0219): only the playback controller's real end reveals the approval. The approval (`SafetyApproval`) is in the layout from the start, hidden and inert, and the finished film docks with a transform, so nothing moves the layout. Replay and failure help stay. `SafetyAttest` and its six checkboxes are removed; a saved `APP_SAFETY_ATTEST` step from before the change shows the same screen and still completes.

## Cloud

- **Approval with the purchase.** `POST /v1/bookings/draft` accepts an optional `safetyAttestation: { attestedAt, copyVersion: "safety-rules-2026-09-30-v1", locale: "sv" | "en" }` on phone and kiosk new purchases.
  - Any other shape or version returns 400 `safety_attestation_invalid` before provider work.
  - It is not part of the ROLLER payload or the draft idempotency hash.
  - After the ROLLER draft exists, and before any zero-owing publish, Cloud records it in `jumpyard.idempotency_records` (key `jysa_<sha256(uniqueId)>`, operation `safety_attestation`, two days, no contact data).
  - A failed record never fails the purchase, and client keys cannot use the `jysa_` namespace.
- **Provisional phone handoff.** After an approved phone payment, `POST /v1/bookings/draft/finalize` with `action: "phone_approved"` checks for a recent `ecommerce` `new_booking` draft that carries the approval.
  - It creates a provisional booking row (`payment_approved_booking_syncing`, never replacing ROLLER data already stored), a two-hour guest credential (only its hash is stored) and one session per booking and visit day (`bookingSyncStatus: pending`, source `phone_payment_approved`).
  - It returns the kiosk's `provisionalHandoff` shape, and the phone marks the session ready for staff to get the number.
  - Drafts without the approval get 409 `safety_attestation_missing`, and unknown drafts get 404. The route keeps its guest-write throttling.
- **Background confirmation.** Lookup and webhook already send a paid-booking signal to the Booking Lambda for every settled booking (named for #437). When ROLLER's booking is fresh, fully paid and has tickets, that signal also attaches its reference and tickets to the phone provisional session and sets it `confirmed`.
  - The phone adds two late lookups (15 s and 60 s) in case the webhook is late.
  - Until confirmation the staff app shows "Bokningen bekräftas" and cannot hand out or redeem, exactly as for the kiosk.
- **Session start.** A `guest_in_progress` session for a paid booking with a matching approval is readied from Aurora alone. Unpaid bookings still cannot start ordinary sessions.
- **Kiosk.** The provisional session from the terminal finalize is unchanged. The kiosk marks it ready right after the durable card approval (kiosk D0043).
- **Grants and migrations.** None are needed: the Booking Lambda already writes provisional bookings, tokens and sessions for the kiosk (migration 0020), and the Session Lambda allocates the number.

## Phone behaviour

- **Buy path.**
  - The Contact step cannot start a draft before the approval, and the draft carries it.
  - After the approved payment the phone shows "Vi slutför ditt köp …" (D0209 copy) while it asks Cloud for the provisional session and marks it ready. It then opens the completion screen with the number and QR. This usually takes a second or two, with no Continue button and no safety step.
  - Only if Cloud cannot give the provisional session does the calm wait on the receipt run. It uses the D0199 schedule, then shows the delayed state with one manual check and the staff path ("Betala inte igen …"). It never asks for another payment.
- **Existing booking.** Safety sits between the add-on review and the add-on payment. After the approved add-on payment the visit is marked ready at once and completion opens. ROLLER confirms the add-on booking in the background, nudged by two late lookups. If the guest drops the add-ons after a declined payment, the approval still stands. Without add-ons the page's safety screen leads straight to completion.
- **Back and Exit.** Back from safety returns to the review. Exit works until payment. After payment the flow stays one-way.
- **Reload.** The pre-payment snapshot keeps `safetyAttestedAt`, so a reload at contact does not ask for safety again. Payment recovery passes the saved approval on: a paid purchase opens completion without another tap, and a still-unpaid one shows the delayed state instead of safety. The progress bar shows Safety before Payment in both paths.

## Verification

- `npm run validate:gh458-safety-before-payment` (12 tests) covers:
  - draft validation, and capture before persistence and outside the ROLLER payload and hash;
  - failure isolation and the reserved namespace;
  - session start and resume readiness, and no readiness for unpaid bookings;
  - the phone provisional handoff: only attested ecommerce drafts qualify, ROLLER data is never replaced, the credential hash is stored, and retries are idempotent;
  - background attachment only for fresh, fully paid bookings with tickets, riding the paid-booking signal;
  - the shared copy version.
- Phone suites:
  - `test:payment-confirmation`, whose `purchasePreparationFlow.test.mjs` covers completion at approval, the fallback wait and attested recovery;
  - `test:paid-confirmation`, whose `attestedAddonsCompletion.test.mjs` covers add-ons completing at approval;
  - `test:safety-video`, `test:payment-recovery`, `test:payment-options`, `test:flow-nav`, `test:exit-flow` and `test:language-toggle`;
  - lint, typecheck and a webpack build.
- Root: `validate:gh331-paid-booking-confirmation` keeps D0199 for purchases without an approval and pins the fallback path.
- Physical acceptance is still needed: a Park phone purchase, where the number appears at approval and the staff app shows "Bokningen bekräftas" until ROLLER confirms, and a P400 kiosk run.

## Rollout notes and follow-ups

- Clients and Cloud tolerate each other's versions. An older Cloud rejects `phone_approved`, and the phone then runs the calm wait. An older client sends no approval and keeps the old order. Promote the phone and kiosk origins after the Cloud release to get immediate completion.
- **Accepted risk.** The phone's approval claim cannot be verified before ROLLER confirms. A provisional number for an unpaid claim therefore stays "Bokningen bekräftas" for staff and can never be handed out or redeemed.
- **Possible follow-up.** A server-side sweep that flags phone provisional sessions still unconfirmed after some minutes as `needs_staff`, like the kiosk reconciliation.
