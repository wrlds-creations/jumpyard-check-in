# GH-520: the safety film before an existing booking's summary

Issue #520 moves the safety film ahead of the summary when a guest with an existing booking adds something to pay for. On 2026-10-13 Love tested an existing booking: "om jag ska lägga till en extra vattenflaska så får jag upp sammanställningen innan säkerhetsvideo, den ska komma efter precis som när man köper entré". Love approved the 375×812 SV/EN localhost preview the same day ("ja kör, commit, PR och release för båda"). Decision D0255; kiosk #202 is the counterpart.

## What the guest sees

1. **Order:** add-ons, the SkyRider attestation when needed, the safety film and its approval, the summary ("Kontrollera tillägg"), then payment. This is the purchase's order (#491).
2. **The approval:** while the summary's price is checked, the button shows "Räknar pris…". The summary opens when the price is known.
3. **Already approved:** an approval given earlier in the visit goes straight to the summary. This includes "Välj annat betalsätt" after a declined payment.
4. **Back:** from the summary to the film, which shows the approval at once (#491 round 1), and from the film to the add-ons with the basket kept.
5. **Progress bar:** the film lights Säkerhet; the summary and the payment light Betalning.
6. **Unchanged:** nothing to pay (the page's own safety step), SkyRider consent, Google Pay, Apple Pay and card payment, and the attested completion with the number.

## Calls

One `POST /v1/bookings/{id}/add-products/quote` per summary, as before, now made after the approval. Back to the film keeps the summary's quote. A quote that answers after the guest went back to the add-ons is dropped. A failed quote returns to the add-ons with its message, and Continue tries again. The draft is still created only from the summary, after the approval. No Cloud, ROLLER or payment change.

## Code

- `AddonsOffer`:
  - `goToStepAfterAddons` sends Continue and the SkyRider confirmation to `SAFETY` until safety is approved, and to `goToReview` after that.
  - The film's approval calls `goToReview`, which reuses an existing quote.
  - Back goes from `REVIEW` to `SAFETY` and from `SAFETY` to `returnToSelect`. `returnToSelect` retires a quote in flight through `reviewRequestRef`.
  - `createDraft` reads the approval from state and still refuses to run without it.
  - The film gets `approvedAt`, `isSubmitting` and `submittingLabel={t.buy.quoting}`.
- `SafetyApproval` has an optional `submittingLabel`. The page's own safety step keeps "Gör redo för personal...".
- `page.tsx` maps `REVIEW` to the Payment column.
- Preview: `/preview/flow` follows the new order, and the summary's button opens the payment stand-in.

## Validation

- `test:safety-video` includes `addonSafetyOrder.test.mjs`, which runs the real `AddonsOffer` handlers. It covers:
  - the order and one quote per summary;
  - Back from the summary and from the film;
  - an earlier approval, a late quote and a failed quote;
  - SkyRider, a declined payment and nothing to pay;
  - the old order and the progress column.
- `test:flow-transitions` covers SkyRider. Every phone suite, lint, `tsc` and `next build --webpack` pass.
- Localhost: `/preview/flow?full=1&screen=booking&lang=sv|en` at 375×812. The path is +1 water, the film, the approval, the summary and payment. Then Back to the film (approved), Back to the add-ons, and Continue straight to the summary.
- After release: an existing Nacka booking on an iPhone adds a water bottle and sees the film before the summary.
