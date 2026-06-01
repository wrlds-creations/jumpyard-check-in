# CODEX_TASK.md

## Ticket ID
T0075

## Goal
Verify and unblock Roller Playground card payments in the JumpYard phone checkout after Roller enabled card methods for the Playground payment integration.

## Dependencies
- T0074 completed and merged.
- Pabel confirmed on 2026-06-01 that the Playground payment integration issue is fixed and card payments should now show up.
- Public test origin `https://jumpyard-check-in.pages.dev` is allowlisted for Roller Payments testing.
- Existing Roller payment package/drop-in wiring exists from T0051-T0054.

## Allowed areas
- CODEX_TASK.md
- PROJECT_CONTEXT.md
- DECISIONS.md
- REPO_CURRENT_STATE.md
- FOLLOWUPS.md
- TEST_PLAN.md
- jumpyard-checkin-phone payment UI files only if the smoke exposes a payment UI issue
- Existing payment validation scripts only if needed for safer diagnostics

## Do not touch
- SMS/email production unlock work
- Data API importer code
- Webhook code
- Redeem code
- Staff/admin app unless explicitly needed for verification
- CDK infrastructure code
- Aurora migrations
- AWS resources
- Production credentials
- Live Roller config
- `.env`
- Unrelated local assets or deliverables

## Requirements

1. Re-scope the near-term roadmap so payment/card verification comes before email/SMS production unlock.
   - Document why: core purchase/check-in flows should be proven before invitation messaging work continues.
   - Keep email/SMS production unlock as later tickets.

2. Confirm the current payment implementation path.
   - New booking uses JumpYard Cloud quote/draft endpoints.
   - Draft response returns `paymentJwt` only to the frontend response.
   - Frontend uses the approved Roller payment package/drop-in.
   - Frontend must not receive Roller client credentials or call generic Roller REST APIs.

3. Attempt a safe card payment smoke for a Playground booking.
   - Use the public allowlisted origin.
   - Use the Adyen/Roller test Visa ending `1142`.
   - Do not print or persist full card number, raw payment JWT, access tokens, or Roller secrets.
   - If browser/network automation is blocked locally, document the blocker and exact manual smoke still needed.

4. Update source-of-truth docs.
   - Update `PROJECT_CONTEXT.md` with Pabel's card-payment fix and the new flow-first roadmap.
   - Update `DECISIONS.md` with the payment-before-messaging sequencing decision.
   - Update `REPO_CURRENT_STATE.md` with T0075 status and next tickets.
   - Update `FOLLOWUPS.md` to move card/scheme payment from external blocker to active verification.
   - Update `TEST_PLAN.md` with the T0075 validation result.

## Non-goals
- Do not build a custom card form.
- Do not bypass Roller's approved payment package.
- Do not store raw payment JWTs or card data.
- Do not test Roller Live/production.
- Do not enable unattended SMS or email sends.
- Do not submit AWS Support cases.
- Do not create, change, deploy, or delete AWS resources.

## Acceptance criteria
- T0075 is documented as the active ticket.
- Pabel's confirmation is recorded.
- The next-ticket roadmap prioritizes the core booking/payment/check-in flows before email/SMS production unlock.
- The existing card payment path is verified as using the Roller package/JWT exception, not direct Roller frontend API calls.
- Card smoke result is recorded as passed, blocked, or manual-pending with exact reason.
- `npm run validate` passes if local execution is available.
- `git diff --check` passes.

## Manual verification
On `https://jumpyard-check-in.pages.dev`, start a new buy-entry flow, select a valid time/product/quantity/add-ons/contact details, reach payment, confirm that card is visible, and test the Adyen Visa test card ending `1142`. Confirm whether payment approves, creates a paid Roller Playground booking, and continues into JumpYard safety/check-in.

## Automated validation
Run where local network/tooling permits:
- npm run validate
- npm run roller:payment:readiness
- npm run roller:payment:poc
- git diff --check
