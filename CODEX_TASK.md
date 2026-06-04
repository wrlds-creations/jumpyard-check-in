# CODEX_TASK.md

## Ticket ID
T0103

## Goal
Add a narrow SkyRider availability gate to the phone buy-entry flow so SkyRider is only offered when Roller says it is available for the selected booking date/time, and selected SkyRider quantity cannot exceed returned capacity.

## Context
- The previously discussed broad add-on catalog ticket is deferred until it has been reviewed with Gustav.
- The current buy-entry add-on list remains intentionally curated.
- SkyRider is the only current buy-entry add-on that needs availability gating in this ticket.
- Stock-style add-ons such as socks, padlock, and coffee should remain selectable without Roller time-capacity checks.

## Allowed areas
- `CODEX_TASK.md`
- `PROJECT_CONTEXT.md`
- `DECISIONS.md`
- `REPO_CURRENT_STATE.md`
- `FOLLOWUPS.md`
- `TEST_PLAN.md`
- `infra/lambda/booking/index.js`
- `jumpyard-checkin-phone/src/components/BuyTickets.tsx`
- `jumpyard-checkin-phone/src/flow/cloudClient.ts`

## Do not touch
- Roller Live
- Production credentials
- `.env`
- AWS resources or CDK resource shape
- Aurora migrations
- Staff/admin app
- SMS/email logic
- Gift-card or Klippkort validation semantics
- Broader dynamic add-on catalog discovery

## Requirements

1. Extend the booking availability response:
   - Include the SkyRider parent product in the server-side Roller availability request.
   - Preserve existing entry/family product availability behavior.
   - Treat SkyRider's Roller all-day availability shape as valid when `onlineSalesOpen` is true.

2. Gate the phone add-on UI:
   - Show SkyRider only when available for the chosen slot/date.
   - Cap SkyRider quantity by the lower of selected jumper count and returned capacity when capacity is finite.
   - Hide SkyRider when availability is missing, closed, or zero.

3. Keep quote/draft safety:
   - Send item-level `requiresAvailability` flags from the phone app.
   - Server-side availability validation should validate only items explicitly marked as capacity-bound.
   - Entry products and SkyRider should be checked; stock add-ons should not block availability validation.

## Non-goals
- Do not build a dynamic add-on catalog.
- Do not decide which food/drink/merch products should be visible.
- Do not add Valo, extra person, Connected, party food, or other product groups.
- Do not change payment methods, payment package behavior, or checkout copy.
- Do not deploy AWS changes unless explicitly requested.

## Acceptance Criteria
- A selected time returns entry/family products as before.
- SkyRider is included in availability data when Roller product cache has the SkyRider parent.
- SkyRider is hidden in the add-on step if Roller does not expose valid availability for that selected date/time.
- If SkyRider capacity is finite, the plus button cannot exceed available capacity.
- Quote/draft with entry plus stock add-ons still works because stock add-ons are not capacity-checked.
- Quote/draft with entry plus SkyRider still performs server-side availability validation before creating a draft.

## Validation
- `node --check infra/lambda/booking/index.js`
- `npm --prefix jumpyard-checkin-phone run lint`
- `npm --prefix jumpyard-checkin-phone run build`
- `npm run validate`
- `git diff --check`
