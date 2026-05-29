# CODEX_TASK.md

## Ticket ID
T0072

## Goal
Verify guest SMS and email sender readiness before enabling unattended booking-time sends.

## Dependencies
- T0068 unified booking-time guest messaging is deployed.
- T0071 confirmed Data API and webhook freshness.
- Dev AWS stack exists and targets Roller Playground.

## Allowed areas
- CODEX_TASK.md
- PROJECT_CONTEXT.md
- DECISIONS.md
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

1. Verify current dev SMS sender readiness.
   - Confirm SNS SMS sandbox status.
   - Confirm verified sandbox recipient count/status without printing full phone numbers.
   - Confirm current SMS account attributes relevant to sender ID, transactional type, spend limit, and delivery logging.
   - Confirm session Lambda/EventBridge config requests the intended sender and public check-in URL.

2. Verify current dev email sender readiness.
   - Confirm SES account sandbox/production access state.
   - Confirm verified sender identities without exposing secrets.
   - Confirm dev sender/reply-to config.
   - Confirm whether DKIM/custom MAIL FROM/domain readiness exists.

3. Verify unattended schedule remains safe.
   - Confirm booking-time EventBridge target still uses the unified SMS/email processor.
   - Confirm `confirmSend=false` is still in effect for scheduled runs.
   - Confirm no real unattended sends are enabled in dev.

4. Verify delivery audit and monitoring posture.
   - Check safe aggregate counts/statuses in `jumpyard.sms_deliveries` and `jumpyard.email_deliveries`.
   - Confirm relevant alarms/log groups exist.
   - Document gaps instead of implementing fixes.

5. Update source-of-truth docs.
   - Update `PROJECT_CONTEXT.md` with the sender readiness result.
   - Add a decision in `DECISIONS.md` if unattended guest messaging remains blocked.
   - Update `REPO_CURRENT_STATE.md` with T0072 status and the locked T0073-T0077 guest messaging unlock roadmap.
   - Update `TEST_PLAN.md` with the exact safe verification result.
   - Update `AWS_RESOURCES.md` with meaningful AWS operational state.
   - Add follow-ups for any operational gaps.

## Non-goals
- Do not send SMS.
- Do not send email.
- Do not enable unattended scheduled sends.
- Do not request SNS or SES production access.
- Do not create, change, deploy, or delete AWS resources.
- Do not change Lambda/app/CDK behavior.
- Do not change SES identities, SNS sandbox numbers, sender IDs, domains, DKIM, or MAIL FROM.
- Do not test payment flows.
- Do not create Roller Live/production data.
- Do not implement fixes discovered during verification.

## Acceptance criteria
- Current SNS SMS sandbox/readiness state is known and documented.
- Current SES sender/readiness state is known and documented.
- Booking-time schedule is confirmed safe with `confirmSend=false`.
- Audit rows for SMS/email are summarized safely.
- Production blockers are documented as follow-ups.
- `npm run validate` passes.
- `git diff --check` passes.

## Manual verification
Review the T0072 rows in `TEST_PLAN.md` and confirm a new Codex session can see whether SMS/email sender readiness is safe for controlled smoke only or ready for unattended guest messaging without relying on chat history.

## Automated validation
Run:
- npm run validate
- git diff --check
