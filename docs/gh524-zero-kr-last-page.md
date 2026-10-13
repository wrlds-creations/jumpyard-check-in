# GH-524: a 0 kr purchase goes straight to the last page

Issue #524. On 2026-10-13 Love bought with a 100 % code and got the card "Bokning klar … Hämta bokningen igen" before the last page: "Om jag inte behöver betala för bokningen för att jag har en 100% rabattkod och liknande så vill jag inte få upp någon hämta bokningen igen pop-up [...] Så betala inget så går jag direkt till sista skärmen." On the receipt line: "Det ska stå kvittot är skickat. Det måste finnas ett verb där". Love approved the scope in the coordinating chat the same day, then the localhost screenshots and the safety-film fix ("ok, committa och lämna till samordningen"). In the same live test the safety film showed a second time before the last page. Decision D0257; kiosk #206 is the counterpart (kiosk D0068).

## What the guest sees

1. **Nothing to pay:** a gift card or code brings "Att betala" to 0 kr, and the button reads "Slutför bokning".
2. **The tap:** the button keeps its busy state ("Skapar bokning…" with a spinner, full colour, #448) while the booking is created and fetched. The guest stays on "Din kontakt".
3. **Locked meanwhile:**
   - Back and Exit step aside, as on the payment screens. Their room under the content stays, so the button does not jump.
   - The name, email, email choice and code fields are disabled.
4. **Then the last page:** "Du är incheckad" with the number, the route and the receipt line. There is no card in between, and the safety film never shows a second time.
5. **Only a real failure** shows the existing card: "Bokning klar", the failure text and "Hämta bokningen igen". Its retry and its Back are unchanged.
6. **Receipt line:** "Kvittot är skickat till din e-post" ("Your receipt has been sent to your email").
7. **Unchanged:**
   - card, Apple Pay and Google Pay payments;
   - payment recovery after a reload;
   - the safety order (#458);
   - the rest of the last page.

## Why the film showed again

Safety is approved before the draft (D0231), and the draft carries that approval. Cloud's session start then makes the session ready by itself. In Love's test that failed (`checkin.attested_ready_failed`): the booking got its venue only with ROLLER's webhook, a few seconds after the publish, and a session without a venue cannot be made ready (`handoff_venue_required`). The 0 kr path had not passed the approval to the page, so the page took the not-ready session back to the film. Card purchases were not affected, because their finalize step writes the venue and the page marks those sessions ready itself.

The 0 kr path now passes the approval too:

- When Cloud's start comes back not ready, the page marks the session ready itself.
- A refused ready call is retried after 2 s and 4 s, which covers the webhook's few seconds. Only then does "Hämta bokningen igen" show.
- Cloud #527 gives a 0 kr booking its park venue at the post-payment lookup, so Cloud's start should make the session ready again. The page's ready call and its retries stay as a safety net.

## Calls

- The quote (or the reused Apply quote, #421) and the draft.
- One `POST /v1/check-in/lookup`, retried up to three times 2 s apart only when the lookup itself fails (`resolvePaidConfirmation`). ROLLER has a 0 kr booking at once, so the first lookup normally answers paid. The ROLLER 404s behind the roller-api-errors alarm on 2026-10-13 came from Cloud's kiosk card reconciliation, not from this path.
- The session start.
- When that session is not ready, one ready call.
- While Cloud lacks the venue, up to two more session resumes and ready calls. These go to Cloud and Aurora only, with no ROLLER call.
- The retry on the failure card is one more lookup of the same kind, never a new draft.

## Code

- `BuyTickets`:
  - `createDraft` no longer sets `PENDING` for a 0 kr draft. It starts `resolvePaidDraftBooking`, and the guest stays on `CONTACT`.
  - `noPaymentResolving` is `step === 'CONTACT' && noPaymentRequired`. It feeds the following:
    - `contactBusy` (the button's busy state);
    - `backNavigationLocked`;
    - `checkoutLocked` (kept beside #518's rule, D0256, so a 0 kr draft still locks the fields);
    - Exit, which is hidden.
  - `FlowNav` gets `keepSpacer`, so the 96 px spacer stays while neither control shows.
  - `resolvePaidDraftBooking`, for a 0 kr draft:
    - passes `safetyAttestedAt` to `onBookingReady`;
    - runs it through `retryAfterDelays` with `NO_PAYMENT_READY_RETRY_DELAYS_MS` (2 s, 4 s);
    - sets `PENDING` after a failure.
    Card payments keep their own paths.
  - `getDraftRecoveryStep` still saves a 0 kr draft as `PENDING`, so a reload during the wait shows the same recovery as before.
- `PhoneCompletion` copy: "Kvittot är skickat till din e-post" / "Your receipt has been sent to your email".

## Validation

- `test:payment-confirmation`: `purchasePreparationFlow.test.mjs` runs the real `createDraft` and `resolvePaidDraftBooking` with the page's `onBookingReady`.
  - A 0 kr draft stays on the contact step and opens the last page with one lookup and one session start, never the card.
  - A session that Cloud could not make ready is marked ready by the page (one ready call) and opens `APP_CONFIRM`, never the film.
  - A ready call refused twice is retried after 2 s and 4 s and opens the last page. One that keeps failing shows the card, never the film.
  - Three failed lookups open the card. Its retry is one more lookup and no new draft.
  - The waiting purchase is saved as `PENDING`; a kept paid draft is still `PAYMENT`.
- `test:payment-options`: Apply then Continue with a 200 kr code ends on the contact step with one draft. #518's rule still holds.
- `test:phone-contact`, `test:flow-nav` and `test:completion` pin the busy button, the locks, the kept spacer and the new receipt line.
- All phone suites, lint, `tsc` and `next build --webpack` with the mock boundary check pass.
- Mutation checks:
  - putting `setStep('PENDING')` back fails eight tests;
  - dropping the failure step fails the two failure tests;
  - dropping the approval fails the three film tests;
  - dropping the retries fails the two retry tests.
- **Localhost:** the real page `/?park=1` at 375×812, SV and EN, in headless Edge.
  - A browser-only stand-in for Cloud was installed before the app loaded. Nothing reached Park, ROLLER or a payment provider.
  - A saved purchase reopened "Din kontakt" with 2 × 90 min and 2 JumpSocks. TEST100 brought "Att betala" to 0 kr.
  - "Slutför bokning" turned busy. Back, Exit and the fields locked, and the button stayed in place.
  - The last page opened after one lookup, with "Kvittot är skickat till din e-post" (the EN line fits on one line at 375 px).
  - With the lookup forced to fail, the card with "Hämta bokningen igen" showed after three attempts.
  - **Venue race:** a session start that is not ready plus a first refused ready call went KIOSK_CHOICE > KIOSK_BUY > APP_CONFIRM. The same run without the approval went to APP_SAFETY_VIDEO, which is Love's bug.
- **After release:** on an iPhone, a purchase with a 100 % code, or a gift card that covers everything, goes straight to the last page without the film a second time.
