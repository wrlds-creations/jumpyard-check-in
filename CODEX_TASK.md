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

## T0093 Result

T0093 completed with only safe Roller Playground `POST /bookings/draft/costs` calls. No bookings, drafts, payments, redemptions, Aurora rows, AWS resources, app UI, Lambda code, assets, production credentials, or `.env` were changed.

Exact tested payload shape:

```json
{
  "discounts": [
    {
      "code": "<guest-entered membership or 10-Kort code>"
    }
  ]
}
```

Confirmed:

- Baseline entry quote for product `1765860`, `2026-06-03 10:00`, quantity `1` returned `total=200`, `amountOwing=200`, `discount=0`, and empty `multiPassAllocations`.
- Invalid code returned HTTP `200` but no amount reduction.
- Paid `10-Kort` booking reference, unique id, and booking item id returned no amount reduction.
- A normal paid entry ticket id returned no amount reduction.
- The masked paid `10-Kort` ticket id from booking `5101046` reduced one `200 kr` entry to `amountOwing=0` and `discount=200`.
- The same masked `10-Kort` ticket id reduced quantity `2` from `400 kr` to `amountOwing=0` and `discount=400`.
- Roller returned the accepted code as a normal `percentOff=100` discount with empty `multiPassAllocations`, not as a balance-aware multi-pass allocation.

Conclusion:

V1 can support membership/`10-Kort` as code validation only. It must not show remaining visits. A code should be treated as accepted only when Roller reduces `amountOwing` or returns a positive discount amount; an echoed discount row alone is not enough.

## Recommended Next Ticket

`T0094`: Implement membership/`10-Kort` code validation in the buy-entry checkout.

Scope:

- Add one optional membership/`10-Kort` code input only if it fits the existing checkout UX.
- Send the code as `discounts: [{ code }]` to JumpYard Cloud quote/draft payloads.
- Display accepted, rejected/no-effect, and no-balance states clearly.
- Do not display remaining visit balance.
- Ask before any guarded Playground write smoke because creating/publishing a booking with the code may consume or reserve a pass use.
