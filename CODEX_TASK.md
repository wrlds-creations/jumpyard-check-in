# CODEX_TASK.md

## Ticket ID
T0065

## Goal
Complete the dev guest SMS path with a public check-in URL, clear provider diagnostics, and a confirmed SMS smoke to the verified sandbox phone.

## Dependencies
- T0039 added protected SMS link sending through AWS SNS.
- T0042 added SNS SMS delivery status diagnostics.
- T0043 verified the approved masked test phone in the SNS SMS sandbox.
- T0049 kept scheduled booking-time SMS safe behind explicit confirmed-send guards.
- T0063 configured the public Cloudflare check-in URL for guest messaging links.
- T0064 moved SMS/email completion ahead of broader production-readiness work.

## Allowed areas
- CODEX_TASK.md
- PROJECT_CONTEXT.md
- DECISIONS.md
- REPO_CURRENT_STATE.md
- FOLLOWUPS.md
- AWS_RESOURCES.md
- TEST_PLAN.md
- infra/lambda/session/index.js
- jumpyard-checkin-phone/src/flow/cloudClient.ts

## Do not touch
- UI design files
- App source code outside the narrow `jy_token` routing fallback
- CDK infrastructure definitions
- Aurora migrations
- Package dependencies
- Roller payment flow
- Redeem flow
- Webhook registration
- Data API importer behavior
- Production credentials
- Live Roller config
- `.env`
- Unrelated local assets or deliverables

## Requirements

1. Keep SMS sends server-owned and guarded.
   - Keep `POST /v1/check-in/session-links/send-sms` protected by the check-in link dev token.
   - Do not expose raw tokens, full URLs, full phone numbers, or SMS text in responses or logs.
   - Keep scheduled booking-time SMS at `confirmSend=false` in dev.

2. Improve SMS operational diagnostics.
   - Return safe provider metadata for SMS send/planning responses.
   - Indicate whether a Sender ID is configured/requested.
   - Keep the SMS provider response masked and audit-safe.

3. Improve the SMS guest copy without changing the phone UI.
   - Use the booking start time when available.
   - Keep the SMS short enough for normal transactional usage.
   - Keep the opaque `jy_token` link model.

4. Run a confirmed dev SMS smoke.
   - Use the public `https://jumpyard-check-in.pages.dev/` base URL.
   - Send only to the already verified sandbox test phone.
   - Confirm AWS SNS accepts the message.
   - Confirm the SMS delivery audit row exists in Aurora.
   - Check CloudWatch/SNS delivery status if available.

5. Update source-of-truth docs.
   - Document SMS status after T0065.
   - Keep remaining SMS production blockers explicit: SNS sandbox exit or verified-recipient policy, consent/unsubscribe wording, and later unified booking-time messaging.

6. Fix SMS link routing for blocked known bookings.
   - A valid `jy_token` link must not fall back to manual booking-code search just because the linked booking is already redeemed.
   - Already-redeemed linked bookings should show the existing already-checked-in state.
   - Invalid, expired, or unknown tokens may still fall back to manual booking lookup.

## Non-goals
- Do not enable unattended scheduled SMS sends.
- Do not exit SNS sandbox.
- Do not create staging or production AWS resources.
- Do not change email behavior.
- Do not change the phone UI design.
- Do not write to Roller Live/production.
- Do not change payment, redeem, webhook, or Data API behavior.

## Acceptance criteria
- `node --check infra/lambda/session/index.js` passes.
- `npm --prefix infra run build` passes.
- `npm --prefix infra run synth:dev` passes.
- Dev deploy updates only the approved session Lambda code if AWS credentials are available.
- Confirmed SMS smoke returns `sms_sent` for the verified sandbox test phone.
- SMS response includes safe provider diagnostics and no raw token/full URL/full phone number.
- `jumpyard.sms_deliveries` contains the confirmed smoke row.
- A valid `jy_token` for an already-redeemed booking shows the already-checked-in state instead of the manual booking-code screen.
- `npm run validate` passes.
- `git diff --check` passes.

## Manual verification
Confirm the verified test phone receives the SMS and that the link opens the public check-in app.

## Automated validation
Run:
- node --check infra/lambda/session/index.js
- npm --prefix infra run build
- npm --prefix infra run synth:dev
- npm --prefix infra run deploy:dev, if AWS credentials are available
- npm run validate
- git diff --check
