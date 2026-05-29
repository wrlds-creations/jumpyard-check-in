# CODEX_TASK.md

## Ticket ID
T0071

## Goal
Verify Data API daily sync and Roller booking webhook health before relying on Aurora freshness automation.

## Dependencies
- T0070 completed the integrated dev smoke for the existing-booking check-in path.
- Dev AWS stack exists and targets Roller Playground.
- EventBridge daily Data API sync is deployed.
- Roller Playground booking webhook is registered.

## Allowed areas
- CODEX_TASK.md
- PROJECT_CONTEXT.md
- REPO_CURRENT_STATE.md
- FOLLOWUPS.md
- AWS_RESOURCES.md
- TEST_PLAN.md

## Do not touch
- App source code
- UI files
- Payment implementation
- SMS/email Lambda code
- Data API importer code
- Webhook code
- Redeem code
- CDK infrastructure code
- Aurora migrations
- Package dependencies
- Production credentials
- Live Roller config
- `.env`
- Unrelated local assets or deliverables

## Requirements

1. Verify scheduled Data API configuration.
   - Confirm the dev EventBridge rule exists.
   - Confirm the rule is enabled.
   - Confirm it targets the dev data-sync Lambda.
   - Confirm schedule timing is documented.

2. Verify Data API run health in Aurora.
   - Check latest `jumpyard.booking_seed_runs` rows.
   - Confirm the latest scheduled run succeeded.
   - Confirm previous failures, if any, are documented with cause and recovery status.
   - Run a manual dev-only Data API sync for today's modified-date window if safe.

3. Verify webhook health in Aurora.
   - Check recent `jumpyard.roller_webhook_events` rows.
   - Confirm recent booking webhook events are `processed`.
   - Confirm enrichment attempts and processing timestamps look healthy.

4. Verify Aurora freshness after sync/webhook.
   - Confirm recent bookings have booking, item, ticket, payment, and guest/contact rows where available.
   - Confirm lookup can read a recent synced booking from `jumpyard_cloud` without refreshing Roller.
   - Do not print secrets, raw tokens, full phone numbers, or full email addresses.

5. Update source-of-truth docs.
   - Update `PROJECT_CONTEXT.md` with the Data API and webhook health result.
   - Update `REPO_CURRENT_STATE.md` with T0071 status and next recommended ticket.
   - Update `TEST_PLAN.md` with the exact safe verification result.
   - Update `AWS_RESOURCES.md` with meaningful AWS operational state.
   - Add follow-ups for any operational gaps.

## Non-goals
- Do not enable unattended SMS/email sends.
- Do not send SMS or email.
- Do not test payment flows.
- Do not create Roller Live/production data.
- Do not create staging/live resources.
- Do not create, change, deploy, or delete AWS resources.
- Do not change Lambda/app/CDK behavior.
- Do not implement fixes discovered during verification.

## Acceptance criteria
- EventBridge daily Data API schedule is confirmed enabled.
- Latest scheduled Data API run status is known and documented.
- Manual current-day Data API sync succeeds or any blocker is documented.
- Recent Roller webhook event processing is confirmed.
- Aurora rows show current booking/item/ticket/payment/contact freshness for recent smoke data.
- Lookup confirms a recent booking is served from `jumpyard_cloud` / Aurora.
- Any operational gap is documented with a follow-up id.
- `npm run validate` passes.
- `git diff --check` passes.

## Manual verification
Review the T0071 rows in `TEST_PLAN.md` and confirm a new Codex session can see whether daily sync and webhook ingestion are healthy without relying on chat history.

## Automated validation
Run:
- npm run validate
- git diff --check
