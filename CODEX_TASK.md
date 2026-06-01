# CODEX_TASK.md

## Ticket ID
T0078

## Goal
Verify the existing-booking add-product payment flow.

## Dependencies
- T0077 completed and merged.
- Public phone app is available at `https://jumpyard-check-in.pages.dev`.
- Roller Playground card payment works through the approved Roller payment package.
- A paid existing Roller Playground booking for today's operating date is available or can be created through the already-proven new-booking flow.

## Allowed areas
- CODEX_TASK.md
- PROJECT_CONTEXT.md
- REPO_CURRENT_STATE.md
- FOLLOWUPS.md
- TEST_PLAN.md
- Payment/check-in test scripts only if needed for safe diagnostics
- Phone app files only if the smoke exposes a current-flow bug that blocks T0078

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

1. Run a public add-product smoke from `https://jumpyard-check-in.pages.dev`.
   - Start from a paid existing booking.
   - Enter the existing-booking path.
   - Confirm the booking can enter the add-ons step instead of being forced into an already-complete QR state.
   - Select one minimal mapped add-on where possible.
   - Confirm quote/review shows the add-on before payment.

2. Verify add-product draft/payment behavior.
   - Confirm JumpYard Cloud creates a separate linked add-on draft booking, not a mutation of the original booking.
   - Submit card payment with the Adyen/Roller test Visa ending `1142` if the flow reaches payment.
   - Confirm approved payment returns to the original check-in continuation.

3. Verify safe identifiers and state where practical.
   - Record only safe original booking, linked draft/add-on booking, and handoff/session identifiers.
   - Do not print or persist access tokens, Roller secrets, raw payment JWTs, full phone numbers, full emails, or card data.

4. Update source-of-truth docs.
   - Update `PROJECT_CONTEXT.md` with the T0078 outcome.
   - Update `REPO_CURRENT_STATE.md` with T0078 status, validation, and next ticket.
   - Update `TEST_PLAN.md` with add-product payment validation results.
   - Add any blockers or out-of-scope findings to `FOLLOWUPS.md`.

## Non-goals
- Do not change the existing add-product architecture.
- Do not modify the original Roller booking directly.
- Do not redeem tickets in T0078.
- Do not test staff/admin handoff completion.
- Do not test Roller Live/production.
- Do not enable unattended SMS or email sends.
- Do not create, change, deploy, or delete AWS resources.

## Acceptance criteria
- T0078 is documented as the active ticket.
- Add-product payment is tested from a paid existing booking or documented as blocked with a precise reason.
- Any linked add-on booking/draft behavior is recorded safely.
- `npm run validate` passes.
- `git diff --check` passes.

## Manual verification
Open `https://jumpyard-check-in.pages.dev`, choose the existing-booking path, enter a paid booking reference that has not already completed safety, select one mapped add-on, pay with the Adyen/Roller test Visa ending `1142`, and confirm the flow returns to the original check-in continuation.

## Automated validation
Run where local tooling permits:
- npm run validate
- git diff --check
