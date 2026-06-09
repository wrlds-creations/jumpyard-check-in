# CODEX_TASK.md

## Ticket ID
T0111

## Goal
Add a clear loading state while the phone app fetches available capacity/places.

## Context
- T0102 already replaced row-by-row loading with a branded availability-loading card in the buy-entry flow.
- The Gustav review still found that the capacity/availability fetch can feel static in the phone app.
- This ticket should make the waiting state explicit for guests without changing booking, quote, draft, payment, Roller, or AWS behavior.

## Allowed Areas
- `CODEX_TASK.md`
- `PROJECT_CONTEXT.md`
- `REPO_CURRENT_STATE.md`
- `TEST_PLAN.md`
- `jumpyard-checkin-phone/src/app/page.tsx`
- `jumpyard-checkin-phone/src/components/BuyTickets.tsx`
- `jumpyard-checkin-phone/src/components/AddonsOffer.tsx`
- `jumpyard-checkin-phone/src/flow/machine.ts`

## Do Not Touch
- Roller Live
- Production credentials
- `.env`
- AWS resources
- Aurora migrations
- Staff/admin application source
- Payment package internals
- Redemption logic or redeem writes
- SMS/email logic
- Roller bookings, drafts, payments, or redemptions

## Requirements

1. Loading state:
   - Show a spinner or animation while the phone app fetches available places/capacity.
   - Include the exact guest-facing text `Hämtar tillgängliga platser`.
   - Keep the loading state visually aligned with the JumpYard phone app style.

2. Scope:
   - Keep the change frontend-only unless existing frontend state cannot represent the fetch cleanly.
   - Do not change availability, quote, draft, payment, or Roller API contracts.

3. Documentation:
   - Keep the planned post-T0110 ticket roadmap in source-of-truth docs.
   - Update `REPO_CURRENT_STATE.md` after the ticket.

## Non-Goals
- Do not fix add-on pricing in T0111.
- Do not remove hardcoded add-on prices in T0111.
- Do not change product display-name mappings in T0111.
- Do not change back navigation, add-on quantity rules, SkyRider copy, gift-card/Klippkort validation, staff date display, or staff handout grouping in T0111.

## Acceptance Criteria
- Guests see a clear spinner/animation and `Hämtar tillgängliga platser` during the relevant capacity/availability fetch.
- The app no longer appears static while places are being loaded.
- No backend, Roller, payment, redeem, SMS/email, or AWS behavior changes.
- Source-of-truth docs still list the remaining planned tickets.

## Validation
- `npm --prefix jumpyard-checkin-phone run lint`
- `npm --prefix jumpyard-checkin-phone run build`
- `npm run validate`
