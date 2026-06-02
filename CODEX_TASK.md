# CODEX_TASK.md

## Ticket ID
T0090

## Goal
Discover how Roller Playground supports gift card payment and multi-visit pass use in the buy-entry checkout flow.

## Dependencies
- T0089 completed and merged.
- Card-based new-booking and add-product payment flows already work in Playground.
- No production readiness work should resume until gift card and multi-visit behavior is understood.

## Allowed areas
- CODEX_TASK.md
- PROJECT_CONTEXT.md
- DECISIONS.md
- REPO_CURRENT_STATE.md
- FOLLOWUPS.md
- TEST_PLAN.md
- New gift-card/multi-visit discovery documentation file if useful
- Existing local Roller scripts only if a small read-only discovery helper is needed

## Do not touch
- App UI files
- Lambda code
- CDK resources
- Aurora migrations
- Payment package/vendor files
- Staff/admin behavior
- Guest phone behavior
- Assets
- Deliverables
- Production credentials
- Roller Live
- `.env`

## Requirements

1. Verify Roller documentation and current repository support for gift cards:
   - booking costs payload
   - draft booking payload
   - full gift-card payment behavior
   - partial gift-card payment behavior
   - whether `/data/giftcards` or booking payment rows are needed for reconciliation

2. Verify Roller documentation and current Playground behavior for multi-visit passes:
   - whether a documented guest multi-pass endpoint exists
   - whether multi-visit passes appear as tickets, memberships, guest details, or another object
   - whether they can be used in checkout as payment/entitlement or only redeemed later

3. Run only safe discovery checks:
   - read-only Roller REST/Data API calls are allowed
   - `POST /bookings/draft/costs` is allowed because it calculates costs and creates no booking
   - do not create draft bookings
   - do not publish draft bookings
   - do not process payments
   - do not redeem tickets
   - do not print secrets, raw tokens, raw payment JWTs, full gift-card numbers, full phone numbers, or full emails

4. Document the result clearly:
   - what is confirmed
   - what is blocked or unknown
   - what we should ask Josh/Joao/Pabel if needed
   - exact recommended scope for T0091
   - exact test cases for T0092

5. Update source-of-truth files:
   - current state
   - followups
   - decisions if a meaningful architecture choice is confirmed
   - test plan

## Non-goals
- Do not implement gift-card UI.
- Do not implement multi-visit UI.
- Do not change JumpYard Cloud endpoints.
- Do not create Roller bookings.
- Do not pay bookings.
- Do not redeem tickets or passes.
- Do not write to Aurora.
- Do not deploy AWS changes.
- Do not change production readiness tickets except to keep roadmap order clear.

## Acceptance criteria
- Gift-card payment path is documented as confirmed, blocked, or needing Roller clarification.
- Multi-visit pass path is documented as confirmed, blocked, or needing Roller clarification.
- T0091 implementation scope is precise and does not guess unsupported Roller behavior.
- T0092 smoke cases are explicit.
- No app, Lambda, AWS, Aurora, payment package, assets, or Roller write behavior changed.
- Root validation passes.

## Manual verification
Open the discovery document and confirm a new Codex session can answer:
- Can a guest enter a gift card during buy-entry checkout?
- What happens if gift card balance covers the full total?
- What happens if gift card balance only covers part of the total?
- How are multi-visit passes exposed by Roller?
- What should we ask Roller if anything is still unclear?

## Automated validation
Run:
- npm run validate
- git diff --check
