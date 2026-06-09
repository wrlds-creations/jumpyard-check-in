# CODEX_TASK.md

## Ticket ID
T0116

## Goal
Relax unnecessary max-one limits for add-ons where multiple quantities are operationally reasonable.

## Context
- T0116 is the next confirmed Gustav review ticket after T0115.
- `ADDON_CATALOG_CONFIG.maxPerGuest` controls add-on quantity limits in both the buy-entry and existing-booking add-on flows.
- Socks and coffee already allow several units per jumper/guest.
- Padlocks and SkyRider are currently limited to one per jumper/guest, which can feel too restrictive for the demo and pilot operation.
- The phone app must still call JumpYard Cloud only, never Roller directly.

## Allowed Areas
- `CODEX_TASK.md`
- `PROJECT_CONTEXT.md`
- `REPO_CURRENT_STATE.md`
- `TEST_PLAN.md`
- `jumpyard-checkin-phone/src/flow/addonCatalog.ts`

## Do Not Touch
- Roller Live
- Production credentials
- `.env`
- AWS resources or deploys
- Aurora migrations
- Staff/admin application source
- Kiosk application source
- Payment package internals
- Redemption logic or redeem writes
- SMS/email logic
- Roller bookings, drafts, payments, or redemptions
- Add-on prices, product ids, quote/draft/payment payload shape, or backend contracts

## Requirements

1. Add-on quantity rules:
   - Allow multiple padlocks where operationally reasonable.
   - Allow multiple SkyRider passes while keeping existing availability/capacity gating.
   - Keep hidden/future add-ons hidden in the existing-booking add-on picker.

2. Scope:
   - Change only the shared phone add-on quantity metadata.
   - Do not change add-on pricing, product ids, quote/draft/payment payloads, backend contracts, AWS, Roller writes, redeem, SMS, or email behavior.

3. Documentation:
   - Update source-of-truth docs and validation notes for T0116.

## Non-Goals
- Do not change SkyRider information copy in T0116; T0117 handles it.
- Do not change gift-card/Klippkort CTA or validation in T0116; T0118/T0119 handle those.
- Do not change staff date or handout behavior in T0116; T0120-T0122 handle those.
- Do not add new guest-facing add-ons.

## Acceptance Criteria
- Buy-entry add-ons can select more than one padlock.
- Existing-booking add-ons can select more than one padlock.
- SkyRider max is no longer hard capped at one per jumper/guest by frontend metadata, while existing capacity gating still applies.
- No price, product id, payment, backend, AWS, redeem, SMS/email, or Roller write behavior changes.

## Validation
- `npm --prefix jumpyard-checkin-phone run lint`
- `npm --prefix jumpyard-checkin-phone run build`
- `npm run validate`
- Code check confirms `ADDON_CATALOG_CONFIG` is the only changed source of quantity metadata.
- Browser or equivalent smoke confirms padlock/SkyRider increment buttons can go above one when availability allows it.
