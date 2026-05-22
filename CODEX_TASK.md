# CODEX_TASK.md

## Ticket ID
T0039

## Goal
Add server-owned SMS sending foundation for check-in session links.

## Dependencies
- T0038 completed and merged.
- Dev AWS stack exists.
- Dev Aurora has `jumpyard.checkin_tokens`.
- Guest phone/contact rows may exist in `jumpyard.guest_profiles`.

## Allowed areas
- CODEX_TASK.md
- PROJECT_CONTEXT.md
- DECISIONS.md
- REPO_CURRENT_STATE.md
- FOLLOWUPS.md
- TEST_PLAN.md
- BOOKING_INDEX_INGESTION_CONTRACT.md
- JUMPYARD_CLOUD_CONTRACT.md
- AWS_RESOURCES.md
- infra/lib/jumpyard-cloud-stack.ts
- infra/lambda/session/index.js
- infra/migrations/

## Do not touch
- Phone UI
- Admin UI
- Kiosk UI
- Payment package/drop-in code
- Redeem business logic
- Roller booking/draft write logic
- Production credentials
- Live Roller config
- `.env`
- Unrelated assets or deliverables

## Requirements

1. Add a protected SMS send endpoint.
   - Add `POST /v1/check-in/session-links/send-sms`.
   - Require the same dev link token used for T0038 link creation.
   - Resolve the target booking from Aurora by booking reference or Roller unique id.
   - Create a T0038 check-in link token internally.
   - Do not return the raw token or full check-in URL from the SMS endpoint response.

2. Add safe SMS delivery behavior.
   - Dry-run must be the default unless `confirmSend=true`.
   - Dry-run must create the link and audit row but must not call the SMS provider.
   - Confirmed sends may call AWS SNS from the session Lambda.
   - Never log or persist raw phone numbers beyond existing structured contact fields.
   - Never log or persist raw link tokens.
   - Never call Roller from this endpoint.

3. Add Aurora delivery audit storage.
   - Add a versioned migration for `jumpyard.sms_deliveries`.
   - Store booking reference, Roller unique id, token hash, provider, masked/hash destination, template, delivery status, dry-run flag, provider message id, and safe error summary.
   - Do not store raw SMS message text or raw link URL.

4. Add AWS permissions through CDK.
   - Add the new API Gateway route.
   - Configure session Lambda SMS env values for dev.
   - Grant only the session Lambda `sns:Publish` for provider sends.

5. Update source-of-truth docs.
   - Document SMS endpoint behavior.
   - Document new Aurora table and AWS permission.
   - Document validation and deploy results.
   - Keep payment-drop-in work blocked until Roller prerequisites arrive.

## Non-goals
- Do not build phone or admin UI for sending SMS.
- Do not send real SMS during validation unless explicitly confirmed.
- Do not add Twilio, Pinpoint, or another provider.
- Do not call Roller.
- Do not redeem tickets.
- Do not create or mutate Roller bookings.
- Do not add payment UI or payment processing.
- Do not create production resources.

## Acceptance criteria
- `POST /v1/check-in/session-links/send-sms` exists in dev.
- Unauthorized SMS send requests return `401`.
- Dry-run SMS requests create a hashed check-in token and `jumpyard.sms_deliveries` audit row without provider calls.
- Confirmed send path is implemented behind `confirmSend=true`.
- The session Lambda has the minimum new SMS provider permission.
- Raw tokens and full phone numbers are not returned by the SMS endpoint.
- `npm run validate` passes.

## Manual verification
In AWS Console:
- Open API Gateway and confirm the SMS send route exists.
- Open Aurora Query Editor and confirm `jumpyard.sms_deliveries` exists.
- Send one dry-run SMS request and confirm a `planned` row appears with masked destination and token hash only.
- Confirm `jumpyard.checkin_tokens` has only token hashes.

## Automated validation
Run:
- `node --check infra/lambda/session/index.js`
- `npm --prefix infra run build`
- `npm --prefix infra run migrate:dev`
- `npm --prefix infra run synth:dev`
- `npm --prefix infra run diff:dev`
- `npm --prefix infra run deploy:dev`
- Deployed API smoke for unauthorized SMS request
- Deployed API smoke for dry-run SMS request
- Aurora verification for `jumpyard.sms_deliveries`
- `npm run validate`
- `git diff --check`
