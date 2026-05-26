# CODEX_TASK.md

## Ticket ID
T0054

## Goal
Confirm the public Roller payment behavior after T0053 and lock the remaining card-method blocker before building the next phone-flow step.

## Dependencies
- T0053 completed and merged.
- Roller Playground API credentials are valid locally and in AWS.
- Pabel confirmed `https://jumpyard-check-in.pages.dev` is allowlisted for Playground payment testing.

## Allowed areas
- CODEX_TASK.md
- PROJECT_CONTEXT.md
- DECISIONS.md
- REPO_CURRENT_STATE.md
- FOLLOWUPS.md
- TEST_PLAN.md
- JUMPYARD_CLOUD_CONTRACT.md

## Do not touch
- App source code
- Staff/admin UI
- Kiosk UI
- AWS resources or CDK config
- Backend/Lambda code
- Aurora migrations
- Roller webhook registration
- Production credentials
- Live Roller config
- `.env`
- Payment package vendor files
- Package dependencies
- Unrelated local assets or deliverables

## Requirements

1. Re-run the public payment smoke on `https://jumpyard-check-in.pages.dev`.
   - Confirm T0053 is live on Cloudflare.
   - Create only Playground test drafts/bookings.
   - Do not print raw `paymentJwt`, access tokens, client secrets, or full card numbers.

2. Explain the Swish result.
   - Confirm whether Swish produced a real paid Roller Playground booking.
   - Confirm the booking is visible through JumpYard Cloud lookup as paid/ready.

3. Investigate why card fields are missing.
   - Confirm whether the phone app filters out card payment.
   - Inspect Roller's public payment configuration/session shape safely.
   - Determine whether the missing card UI is fixable in JumpYard code or requires Roller/Adyen configuration.

4. Lock the next phone-flow ticket.
   - Document that after a paid new booking, the guest should enter the check-in flow at safety/QR instead of returning through add-ons/payment.
   - Document the desired buy-entry progress bar: product, add-ons, payment, safety, done.

## Non-goals
- Do not implement production payment rollout.
- Do not implement post-payment progress bar/routing yet.
- Do not add gift card, membership, discount, or multi-visit behavior.
- Do not add or edit payment package vendor code.
- Do not add package dependencies.
- Do not create or change AWS resources.
- Do not change SMS, webhook, Data API, staff auth, redeem, or app behavior.

## Acceptance criteria
- Public T0053 payment smoke result is documented.
- Swish paid-booking behavior is explained and verified.
- Card-method status is documented with a clear next action.
- The next phone-flow/progressbar ticket is documented.
- No app, backend, AWS, package, vendor, or credential files are changed.
- `npm run validate` passes.

## Manual verification
- On the public Cloudflare URL, create a Playground-only test draft with entry plus add-on.
- Confirm payment UI renders after review.
- Confirm Swish can produce a paid booking in Playground if selected.
- Confirm card fields are still absent until Roller/Adyen enables the card/scheme method for this Playground configuration.

## Automated validation
Run:
- `npm run validate`
- `git diff --check`
