# CODEX_TASK.md

## Ticket ID
T0113

## Goal
Remove hardcoded add-on prices from the phone frontend and derive add-on prices from Roller/JumpYard Cloud data.

## Context
- T0112 centralized add-on price/config metadata so the two phone add-on flows could not drift internally.
- T0113 now removes static add-on price literals from that frontend catalog.
- JumpYard Cloud already owns the server boundary and has a Roller product catalog cache with product pricing metadata from Roller `/products`.
- The phone app must still call JumpYard Cloud only, never Roller directly.

## Allowed Areas
- `CODEX_TASK.md`
- `PROJECT_CONTEXT.md`
- `REPO_CURRENT_STATE.md`
- `DECISIONS.md`
- `TEST_PLAN.md`
- `AWS_RESOURCES.md`
- `JUMPYARD_CLOUD_CONTRACT.md`
- `infra/lambda/booking/index.js`
- `jumpyard-checkin-phone/src/flow/addonCatalog.ts`
- `jumpyard-checkin-phone/src/flow/cloudClient.ts`
- `jumpyard-checkin-phone/src/components/BuyTickets.tsx`
- `jumpyard-checkin-phone/src/components/AddonsOffer.tsx`

## Do Not Touch
- Roller Live
- Production credentials
- `.env`
- AWS resource creation/deletion beyond the existing `BookingHandler` Lambda code deploy explicitly scoped below
- Aurora migrations
- Staff/admin application source
- Payment package internals
- Redemption logic or redeem writes
- SMS/email logic
- Roller bookings, drafts, payments, or redemptions

## Requirements

1. Dynamic add-on pricing:
   - Remove static add-on price values from the phone add-on catalog.
   - Use JumpYard Cloud data derived from Roller product/availability sources for visible add-on prices.
   - Keep final quote/draft/payment amount due server-owned through existing quote/draft responses.

2. Buy-entry add-ons:
   - The buy-entry add-on selection and local basket estimate should use add-on prices returned by JumpYard Cloud availability data.
   - Do not show/select an add-on whose dynamic price or product id is unavailable.

3. Existing-booking add-ons:
   - The existing-booking add-on selection should load the same server-owned dynamic price data before enabling add-on purchase.
   - Quote, review, draft, and payment preparation must remain based on JumpYard Cloud add-product endpoints.

4. Backend contract:
   - Extend the existing booking availability response as needed; do not add a new public API route in this ticket.
   - Read stock add-on product ids/prices from the Roller product catalog cache.
   - Keep capacity-gated add-ons such as SkyRider using Roller availability data.

5. Documentation:
   - Update source-of-truth docs and validation notes for T0113.

6. Dev deployment:
   - Deploy only the existing dev `BookingHandler` Lambda code after AWS preflight and CDK diff confirm no new resources or route changes.
   - Run post-deploy diff and a read-only availability smoke.

## Non-Goals
- Do not change product display names in T0113; T0114 handles customer-friendly labels.
- Do not change back navigation in T0113; T0115 handles it.
- Do not change add-on quantity rules in T0113; T0116 handles it.
- Do not add new guest-facing add-ons.
- Do not add AWS resources, routes, IAM changes, secrets, migrations, or EventBridge changes.

## Acceptance Criteria
- No static add-on price literals remain in the phone add-on catalog or add-on components.
- Buy-entry add-on prices come from JumpYard Cloud availability data.
- Existing-booking add-on prices are loaded from JumpYard Cloud before add-on purchase is enabled.
- Quote/draft/payment totals still come from JumpYard Cloud quote/draft responses.
- No frontend Roller calls, payment internals, redeem logic, SMS/email logic, or Roller writes change.

## Validation
- `node --check infra/lambda/booking/index.js`
- `npm --prefix jumpyard-checkin-phone run lint`
- `npm --prefix jumpyard-checkin-phone run build`
- `npm run validate`
- Browser smoke with mocked JumpYard Cloud availability confirms add-on selection uses dynamic prices.
- Search confirms old static add-on price literals are removed from frontend add-on catalog/components.
