# CODEX_TASK.md

## Ticket ID
T0091

## Goal
Implement gift-card use in the buy-entry checkout flow using the proven Roller Draft Booking path.

## Dependencies
- T0090 completed and merged.
- Active Playground gift-card fixtures exist:
  - `100 kr` gift card reduces a `200 kr` quote to `amountOwing=100`.
  - `500 kr` gift card reduces a `200 kr` quote to `amountOwing=0`.
- Card-based new-booking and add-product payment flows already work in Playground.

## Allowed areas
- CODEX_TASK.md
- PROJECT_CONTEXT.md
- DECISIONS.md
- REPO_CURRENT_STATE.md
- FOLLOWUPS.md
- TEST_PLAN.md
- GIFT_CARD_MULTI_VISIT_DISCOVERY.md, only if needed for implementation notes
- infra/lambda/booking/index.js
- jumpyard-checkin-phone/src/app/page.tsx
- jumpyard-checkin-phone/src/flow/cloudClient.ts
- jumpyard-checkin-phone/src/flow/machine.ts
- Existing phone components touched only if required for the gift-card UI in the current buy-entry checkout flow

## Do not touch
- Staff/admin app
- Kiosk app
- Assets
- Deliverables
- Payment package/vendor files
- AWS CDK resources
- Aurora migrations
- Roller Live
- Production credentials
- `.env`
- Multi-visit or membership-code implementation
- Payment Link flow

## Requirements

1. Add a guest-facing gift-card input in the buy-entry checkout path before draft/payment creation.

2. Send gift cards to JumpYard Cloud quote/draft calls as:
   - `giftCards: [{ giftCardNumber }]`

3. Backend must:
   - accept optional gift cards in quote and draft payloads
   - forward gift cards to Roller Booking Costs/Create Draft Booking
   - return safe gift-card applied/error information
   - never log or persist full gift-card numbers

4. Frontend must:
   - show invalid gift-card errors returned by Roller
   - show applied gift-card amount/reduced amount owing when Roller returns it
   - continue to Roller/Adyen payment when `amountOwing > 0`
   - handle `amountOwing === 0` as a no-card-needed path if Roller supports draft publish/no-payment continuation

5. If zero-owing draft publish cannot be safely completed in this ticket:
   - fail closed or show a clear payment-not-needed pending state
   - document the exact blocker and next ticket

6. Keep multi-visit out of scope:
   - do not show remaining visits
   - do not add membership/multi-visit code behavior
   - do not guess discount-code payload behavior

## Non-goals
- Do not create or administer gift cards.
- Do not implement gift-card balance lookup UI.
- Do not import `/data/giftcards` into Aurora unless a proven need appears.
- Do not implement multi-visit or membership code.
- Do not change add-product Payment Link behavior.
- Do not change staff redeem behavior.
- Do not create AWS resources.
- Do not change production readiness tickets except for roadmap clarity.

## Acceptance criteria
- Buy-entry quote can include a gift card.
- Invalid gift cards show a safe guest-facing error.
- Partial gift-card payment reduces the amount due and still allows card payment for the remainder.
- Full gift-card payment does not render a card-payment requirement if Roller supports no-payment publish.
- No full gift-card numbers are stored, logged, or printed.
- Existing card-only checkout still works.
- Root validation passes.
- Phone lint/build pass if phone code changes.

## Manual verification
Use active Playground gift-card fixtures:
- invalid gift-card number
- `100 kr` gift card for partial payment
- `500 kr` gift card for full payment

Confirm:
- Roller Booking Costs applies or rejects gift card correctly.
- Phone UI explains the outcome clearly.
- No full gift-card number appears in logs or persisted state.

## Automated validation
Run:
- npm run validate
- node --check infra/lambda/booking/index.js
- npm --prefix jumpyard-checkin-phone run lint
- npm --prefix jumpyard-checkin-phone run build
- git diff --check

## Implementation result
- Implemented and deployed to JumpYard Cloud dev on 2026-06-02.
- Dev deploy changed only `BookingHandler` Lambda code.
- Direct API smoke passed for invalid gift card, partial `100 kr` gift card, and full `500 kr` gift card.
- Full gift-card smoke created Roller Playground booking `5101055` through no-payment draft publish.
- Public phone-flow proof moves to T0092 after this branch is committed, merged, and published by Cloudflare.
