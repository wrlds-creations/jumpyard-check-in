# CODEX_TASK.md

## Ticket ID
T0112

## Goal
Fix add-on price inconsistency across add-on selection, summary, and payment preparation.

## Context
- The Gustav review found that add-ons can show different prices in selection, summary, and payment steps.
- Current phone add-on price metadata is duplicated between buy-entry add-ons and existing-booking add-ons.
- T0112 should make those UI paths use one shared frontend price/config source so they do not drift inside the app.
- T0113 remains responsible for replacing static prices with Roller/JumpYard Cloud-derived dynamic prices.

## Allowed Areas
- `CODEX_TASK.md`
- `PROJECT_CONTEXT.md`
- `REPO_CURRENT_STATE.md`
- `TEST_PLAN.md`
- `jumpyard-checkin-phone/src/components/BuyTickets.tsx`
- `jumpyard-checkin-phone/src/components/AddonsOffer.tsx`
- `jumpyard-checkin-phone/src/flow/addonCatalog.ts`

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

1. Shared add-on price/config source:
   - Move duplicated add-on price, product id, availability flag, max-per-guest, and icon metadata into one shared phone frontend module.
   - Use that shared source in both buy-entry and existing-booking add-on selection flows.

2. Price consistency:
   - Selection rows, local basket totals, review rows, and values passed forward in the phone flow should all use the same shared add-on price values.
   - Keep server quote/draft totals as the source for final amount due/payment display.

3. Scope:
   - Do not change backend API contracts or Roller calls.
   - Do not introduce dynamic Roller price fetching in T0112; that is T0113.

4. Documentation:
   - Update source-of-truth docs and validation notes for T0112.

## Non-Goals
- Do not remove static add-on prices in T0112.
- Do not add new Roller product mappings in T0112.
- Do not change add-on quantity rules in T0112.
- Do not change product display names in T0112.
- Do not change back navigation in T0112.

## Acceptance Criteria
- Buy-entry and existing-booking add-on flows no longer define separate price/config literals for the same add-ons.
- Visible add-on selection prices and local summary values are derived from one shared source.
- Final quote/draft/payment amounts still come from JumpYard Cloud responses.
- No backend, Roller, payment, redeem, SMS/email, or AWS behavior changes.

## Validation
- `npm --prefix jumpyard-checkin-phone run lint`
- `npm --prefix jumpyard-checkin-phone run build`
- `npm run validate`
- Search confirms duplicated add-on price literals are removed from the two components.
