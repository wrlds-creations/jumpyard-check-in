# GH-518: Back from payment keeps the contact step editable

Issue #518. On 2026-10-13 Love went to payment on the live phone, tapped "Tillbaka" to add a code, and found every field on "Din kontakt" locked: the code field, "Klistra in", the first name and the email. Love asked for the fix the same day ("fixa nu"). Decision D0256.

## What the guest sees

1. **Back from "Betalning"**, before a payment is submitted, returns to "Din kontakt" with every field usable. That covers the name and email fields, the email choice, and the code field with "Klistra in", "Applicera" and the X.
2. **Nothing changed:** "Gå till betalning" opens the same payment again.
3. **Something changed** (the code, a contact field or the email choice): the next "Gå till betalning" creates a new booking draft with the new details and price.
4. **Unchanged:**
   - no Back while a payment is submitted, unresolved or approved;
   - a refused card still drops its draft through the existing retry;
   - the copy and the design.

## Why it was locked

T0182 (2026-07-07) kept the draft on Back, so that going back and forth would not create a second ROLLER draft. It also disabled every contact input while a draft existed, because `checkoutLocked` included `Boolean(draft)`. The code handlers already dropped the draft, but their field was disabled too.

## Calls

- **Back and forth without a change:** no quote and no draft. The card payment loads its own session again, as before.
- **After a change:** one draft, plus one quote unless Continue reuses a completed Apply (#421). That is the same as the first Continue.
- **The dropped draft** stays unpaid in ROLLER, as when a guest leaves on "Betalning" today. Its capacity hold is ROLLER's, so a nearly full start time could reject the new draft until ROLLER releases the old hold. This has not been observed.

## Code

- `BuyTickets`:
  - `checkoutLocked` is `submitting || showPaymentSyncCard`.
  - `dropKeptDraft` drops a kept draft and its payment state. `updateContact` and the new `updateEmailMarketingChoice` call it; the code handlers already dropped the draft.
- **Reload:** once the draft is gone, the pre-payment recovery effect writes the contact snapshot, so a reload restores the contact step and never the old payment.
- **Payment recovery:** the payment's own record is cleared when the payment screen closes before submission. This is unchanged.

## Validation

- `test:payment-options`: the payment-option harness runs the real handlers.
  - Back keeps the draft, and an unchanged Continue makes no call.
  - A changed first name, email, email choice, typed code or removed code drops the draft. Continue then creates one fresh draft with the new values.
  - Back stays shut while a payment runs.
- `emailMarketingConsent.test.mjs` pins the email choice handler. All phone suites, lint and `tsc` pass.
- **Localhost**, `/preview/klistra-in?frame=tom` at 390×844 (SV) and 375×667 (EN). A browser-only stand-in answered Cloud's draft, with no source change. Path: Continue to "Betalning" (269 kr), then Tillbaka. All fields were open. SOMMAR25 and Applicera gave 214 kr, and Continue made one new draft with the code ("Betalningen laddas för 214 kr").
  - Tillbaka without a change reopened the same draft.
  - A new first name, the email choice and a new email each made exactly one new draft with that value.
  - A cleared code went back to 269 kr.
- **After release:** Love goes to payment on an iPhone, taps Tillbaka, adds a code and sees the lower price on "Betalning".
