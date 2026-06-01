# CODEX_TASK.md

## Ticket ID
T0076

## Goal
Verify the full new-booking guest purchase flow after card payments were unblocked.

## Dependencies
- T0075 completed and merged.
- Roller Playground card payment is visible on the public allowlisted checkout.
- Adyen/Roller test Visa ending `1142` is available for Playground card smoke.
- Public test origin `https://jumpyard-check-in.pages.dev` remains allowlisted.

## Allowed areas
- CODEX_TASK.md
- PROJECT_CONTEXT.md
- REPO_CURRENT_STATE.md
- FOLLOWUPS.md
- TEST_PLAN.md
- Payment/check-in test scripts only if needed for safe diagnostics
- Phone app files only if the smoke exposes a current-flow bug that blocks T0076

## Do not touch
- SMS/email production unlock work
- Data API importer code
- Webhook code
- Redeem code
- Staff/admin app
- CDK infrastructure code
- Aurora migrations
- AWS resources
- Production credentials
- Live Roller config
- `.env`
- Unrelated local assets or deliverables

## Requirements

1. Run a public full-flow smoke from `https://jumpyard-check-in.pages.dev`.
   - Start from the buy-entry path.
   - Select a valid time, entry product, quantity, and no or minimal add-ons.
   - Enter safe test contact details.
   - Confirm the basket/review step happens before payment.
   - Submit card payment with the Adyen/Roller test Visa ending `1142`.

2. Verify post-payment continuation.
   - The guest should not return to the existing-booking summary loop.
   - The guest should continue into the safety/check-in path.
   - Complete enough of the safety flow to confirm the QR/handoff state can be reached, unless video timing/tooling blocks that specific step.

3. Verify server-side state where practical.
   - Identify the resulting Roller Playground booking reference or safe local draft/session ids if available.
   - Confirm JumpYard Cloud owns the check-in continuation state.
   - Do not print or persist full card number, raw payment JWT, access tokens, Roller secrets, or full sensitive guest data.

4. Update source-of-truth docs.
   - Update `PROJECT_CONTEXT.md` with the T0076 outcome.
   - Update `REPO_CURRENT_STATE.md` with T0076 status, validation, and next ticket.
   - Update `TEST_PLAN.md` with full-flow validation results.
   - Add any blockers or out-of-scope findings to `FOLLOWUPS.md`.

## Non-goals
- Do not build a custom card form.
- Do not bypass Roller's approved payment package.
- Do not change app UI unless the current flow is blocked.
- Do not test Roller Live/production.
- Do not enable unattended SMS or email sends.
- Do not create, change, deploy, or delete AWS resources.

## Acceptance criteria
- T0076 is documented as the active ticket.
- The new-booking flow is tested from buy-entry through approved payment.
- The result after payment is documented as passed, blocked, or needing a focused fix.
- Any booking/session identifiers are recorded safely.
- `npm run validate` passes.
- `git diff --check` passes.

## Manual verification
Open `https://jumpyard-check-in.pages.dev`, run the buy-entry flow, pay with the Adyen/Roller test Visa ending `1142`, and confirm the guest reaches the safety/QR continuation instead of looping back to add-ons/payment.

## Automated validation
Run where local tooling permits:
- npm run validate
- git diff --check
