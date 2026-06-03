# CODEX_TASK.md

## Ticket ID
T0093

## Goal
Validate whether Nacka membership, `10-Kort`, or multi-visit codes can be used in the buy-entry checkout through a Roller-supported server-side quote/draft payload.

## Dependencies
- T0092 completed and merged.
- T0090 found that paid `10-Kort` does not currently expose a usable beta multi-pass balance through `GET /customers/{customerId}/multi-passes`.
- Roller Playground still has the relevant membership or `10-Kort` product/code fixtures available.

## Allowed areas
- CODEX_TASK.md
- PROJECT_CONTEXT.md
- REPO_CURRENT_STATE.md
- FOLLOWUPS.md
- TEST_PLAN.md
- GIFT_CARD_MULTI_VISIT_DISCOVERY.md
- Small local discovery script only if needed and consistent with existing Roller discovery tooling

## Do not touch
- Phone app UI
- Staff/admin app
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
- Real booking payment/redeem flows unless explicitly approved for a safe Playground-only smoke

## Requirements

1. Investigate the safest Roller-supported way to validate a guest-entered membership, `10-Kort`, or multi-visit code in the booking checkout payload.

2. Test only safe no-booking-write quote/cost calls first.
   - Candidate payload: `discounts: [{ code }]`
   - If docs or Playground behavior points to another field, document it before testing.

3. Confirm whether Roller returns:
   - accepted code / reduced amount owing
   - rejected code / safe error
   - no effect
   - any `multiPassAllocations` or related metadata

4. Do not display, implement, or promise remaining visit balance in V1 unless a proven public API fixture returns it.

5. If a write smoke is needed, stop and ask the user before creating a Playground draft or booking.

6. Update source-of-truth docs with the exact conclusion and next recommended ticket.

## Non-goals
- Do not implement membership/multi-visit UI.
- Do not change gift-card behavior.
- Do not change payment behavior.
- Do not change staff redeem behavior.
- Do not create AWS resources.
- Do not create Aurora schema.
- Do not consume a real multi-visit pass unless the user explicitly approves it.

## Acceptance criteria
- T0093 states whether membership/`10-Kort`/multi-visit codes can be validated through Roller quote/cost payloads.
- T0093 documents the exact tested payload shape and safe result.
- T0093 clearly states whether V1 should support only code validation, no support, or a later richer balance-aware implementation.
- No full secrets, raw tokens, full contact data, or private code values are committed.
- Root validation passes after docs updates.

## Manual verification
Use Roller Playground only.

If user-provided membership or multi-visit codes are needed, handle them as sensitive test data and do not commit or print them.

## Automated validation
Run:
- npm run validate
- git diff --check
