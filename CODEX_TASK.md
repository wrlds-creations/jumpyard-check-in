# CODEX_TASK.md

## Ticket ID
T0097

## Goal
Investigate and prove how JumpYard Nacka `10-Kort`/membership codes work when Roller models them as membership-linked discount codes rather than beta multi-visit passes.

## Dependencies
- T0096 completed and merged.
- Gustav confirmed the current `10-Kort` setup is not the Roller beta multi-pass model.
- Existing Playground `10-Kort` fixture booking `5101046` exists.
- Local Roller Playground credentials are available for safe read/no-write API checks.

## Allowed areas
- CODEX_TASK.md
- PROJECT_CONTEXT.md
- DECISIONS.md
- REPO_CURRENT_STATE.md
- FOLLOWUPS.md
- TEST_PLAN.md
- GIFT_CARD_MULTI_VISIT_DISCOVERY.md

## Do not touch
- Phone app UI
- Staff/admin app UI
- Kiosk app
- Lambda implementation
- AWS CDK resources
- Aurora migrations
- Payment package/vendor files
- Assets
- Deliverables
- Roller Live
- Production credentials
- `.env`

## Requirements

1. Research current official Roller documentation for:
   - Discounts and discount codes.
   - Membership or pass code behavior if documented.
   - Multi-pass endpoint boundaries.
   - Booking Costs/Create Draft Booking discount payload behavior.

2. Re-check the existing Playground `10-Kort` fixture:
   - Confirm it still appears as a paid membership-like booking.
   - Confirm whether the documented `GET /customers/{customerId}/multi-passes` endpoint still returns no balance.
   - Confirm whether the known membership/ticket code still applies through `discounts: [{ code }]`.

3. Test safe no-write quote cases only unless explicitly approved:
   - Baseline no-code quote.
   - Invalid code quote.
   - Known `10-Kort`/membership code quote.
   - Quantity edge case if useful.
   - Normal ticket comparison if needed.

4. Do not create or publish bookings in T0097 unless a separate explicit write approval is given.

5. Document the interpretation clearly:
   - What Gustav's model likely means.
   - What Roller proved through API responses.
   - What remains unknown about actual use consumption/exhaustion.
   - What JumpYard should and should not build in V1.

6. Update `GIFT_CARD_MULTI_VISIT_DISCOVERY.md` with the T0097 findings.

7. Update `DECISIONS.md` if the architecture direction changes from "multi-visit pass" to "membership discount-code validation".

8. Update `REPO_CURRENT_STATE.md` with:
   - T0097 status.
   - Safe test results.
   - Recommended next ticket.

9. Put any out-of-scope findings in `FOLLOWUPS.md`.

## Non-goals
- Do not implement membership-code UI.
- Do not change JumpYard Cloud quote/draft behavior.
- Do not create or publish a Roller booking.
- Do not consume a `10-Kort`/membership use.
- Do not call Roller Live.
- Do not change AWS resources.
- Do not add migrations.
- Do not change secrets or credentials.

## Acceptance criteria
- T0097 clearly explains whether the current Nacka `10-Kort` behaves like a discount-code validation flow.
- The docs clearly separate this model from Roller beta multi-pass balances.
- The docs identify whether V1 should use `discounts: [{ code }]` and how to detect applied vs no-effect codes.
- Unknowns about actual use consumption are recorded before any implementation ticket.
- No app/source behavior changes are made.
- Root validation passes after docs updates.

## Manual verification
Read the updated source-of-truth docs and confirm a future Codex session can explain the difference between:

- Gift card payment.
- Roller beta multi-pass balance endpoint.
- Nacka membership/`10-Kort` discount-code behavior.

## Automated validation
Run:
- npm run validate
- git diff --check
