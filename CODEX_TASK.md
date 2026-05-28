# CODEX_TASK.md

## Ticket ID
T0059

## Goal
Filter staff-confirmed Roller redemption to only send Roller-redeemable ticket ids, so stock/add-on tickets do not fail the whole check-in.

## Dependencies
- T0057 integrated smoke found mixed entry plus stock/add-on bookings can include non-redeemable add-on ticket ids.
- T0058 stack production-readiness audit is merged to `main`.
- Roller remains the source of truth for final redeem.

## Allowed areas
- CODEX_TASK.md
- PROJECT_CONTEXT.md
- DECISIONS.md
- REPO_CURRENT_STATE.md
- FOLLOWUPS.md
- TEST_PLAN.md
- AWS_RESOURCES.md
- infra/lambda/redeem/index.js
- infra/lambda/session/index.js

## Do not touch
- UI files
- Payment package vendor files
- Package dependencies
- Aurora migrations or schema
- CDK infrastructure definitions
- Production credentials
- Live Roller config
- `.env`
- Unrelated local assets or deliverables

## Requirements

1. Add server-side redeem eligibility classification.
   - Use normalized product metadata from Aurora booking tickets, booking items, and product catalog cache where available.
   - Treat Roller-redeemable products as pass/session/party-package/membership style products.
   - Exclude stock/add-on/retail/gift-card/fee style products from `POST /redemptions`.
   - Do not classify by fragile product display names such as socks or padlocks.

2. Apply the filter before creating or redeeming check-in sessions.
   - New sessions should select only redeemable ticket ids when mixed bookings include add-on tickets.
   - Final redeem must re-apply the filter after the required Roller refresh.
   - Existing sessions that already contain add-on ticket ids must still be protected before Roller redeem.

3. Preserve safety and audit behavior.
   - Keep payment, date, freshness, already-redeemed, idempotency, and staff-auth checks.
   - Keep the final Roller REST refresh before any confirmed redemption write.
   - Include safe counts/ids in redeem plans without printing secrets or raw Roller payloads.

4. Update source-of-truth documentation.
   - Update FU-054 with T0059 status; mark it resolved only after dev deploy/smoke confirms the fix.
   - Add validation notes for mixed bookings and entry-only bookings.
   - Update recommended next ticket.

5. Deploy only approved dev Lambda code if validation is clean.
   - Read AWS_RESOURCES.md and use the AWS infrastructure workflow.
   - Confirm AWS account `376129878018` and region `eu-north-1`.
   - Deploy only the scoped dev Lambda code changes.

## Non-goals
- Do not change app UI.
- Do not create, edit, or pay Roller bookings.
- Do not add new AWS resources.
- Do not change Aurora schema.
- Do not change product configuration in Roller.
- Do not implement production auth or staging/live resources.
- Do not touch Roller Live.

## Acceptance criteria
- Mixed entry plus stock/add-on sessions do not send stock/add-on ticket ids to Roller `POST /redemptions`.
- Entry-only bookings still keep their redeemable ticket ids.
- `POST /redemptions` receives at most 10 redeemable ticket ids.
- Existing safety/payment/date/freshness/staff-auth gates still apply.
- FU-054 is updated with T0059 status and any remaining deploy/smoke gap.
- `npm run validate` passes.
- Relevant Lambda syntax/build/synth validation passes.

## Manual verification
- Use a mixed Playground booking with entry plus stock/add-on tickets and confirm the redeem plan excludes add-on ticket ids.
- Use an entry-only Playground booking and confirm it remains redeemable.
- Confirm no raw secrets, payment JWTs, full phone numbers, or full emails are printed.

## Automated validation
Run:
- `node --check infra/lambda/redeem/index.js`
- `node --check infra/lambda/session/index.js`
- `npm --prefix infra run build`
- `npm --prefix infra run synth:dev`
- `npm run validate`
- `git diff --check`
