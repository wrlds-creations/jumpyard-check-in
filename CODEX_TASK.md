# CODEX_TASK.md

## Ticket ID
T0045

## Goal
Add a safe booking-time SMS trigger foundation that can find upcoming bookings from Aurora and send check-in links through the existing server-owned SMS path.

## Dependencies
- T0038 completed and merged.
- T0039 completed and merged.
- T0044 completed and merged.
- Dev AWS stack exists in account `376129878018`, region `eu-north-1`.
- SNS SMS sandbox is still active; only verified sandbox numbers can receive real SMS.

## Allowed areas
- CODEX_TASK.md
- PROJECT_CONTEXT.md
- DECISIONS.md
- REPO_CURRENT_STATE.md
- FOLLOWUPS.md
- TEST_PLAN.md
- AWS_RESOURCES.md
- JUMPYARD_CLOUD_CONTRACT.md
- infra/lambda/session/index.js
- infra/lib/jumpyard-cloud-stack.ts

## Do not touch
- Phone UI
- Admin UI
- Kiosk UI
- Payment package/drop-in code
- Redeem business logic
- Roller booking/draft write logic
- Aurora migrations unless strictly required
- Production credentials
- Live Roller config
- `.env`
- Unrelated assets or deliverables

## Requirements

1. Add a protected booking-time SMS trigger endpoint.
   - Use the existing check-in link dev token protection.
   - Find upcoming bookings from Aurora by booking date/start time.
   - Default to a no-send planning response.
   - Require explicit `confirmSend=true` before calling AWS SNS.

2. Select only safe candidates.
   - Use Aurora booking snapshots and guest contact data.
   - Require fresh, active bookings.
   - Require a stored SMS-ready destination.
   - Require the booking to pass existing check-in session eligibility.
   - Do not send duplicate booking-time SMS if a real check-in SMS was already sent recently for the same booking.

3. Reuse the existing SMS/link path.
   - Create hashed check-in tokens only when actually sending.
   - Store only token hashes and SMS delivery audit rows.
   - Do not return or log raw tokens, full URLs, SMS text, or full phone numbers.

4. Keep the trigger configurable for dev testing.
   - Support a default `30` minute lead time window.
   - Support explicit `windowStartAt` and `windowEndAt` for safe test windows.
   - Cap batch size so this cannot become an accidental bulk sender.

5. Deploy dev session Lambda if backend behavior changes.
   - Verify AWS account `376129878018`.
   - Verify region `eu-north-1`.
   - Use CDK diff before deploy.
   - Update AWS docs if endpoint behavior changes.

6. Document the result.
   - Update source-of-truth docs with booking-time SMS trigger behavior.
   - Keep SNS sandbox and public/mobile URL limitations documented.

## Non-goals
- Do not create a scheduled EventBridge SMS sender yet.
- Do not request SNS sandbox exit.
- Do not send bulk SMS.
- Do not add SMS buttons in phone/admin UI.
- Do not change SMS provider implementation.
- Do not call Roller.
- Do not redeem tickets.
- Do not create or mutate Roller bookings.
- Do not add payment UI or payment processing.
- Do not replace temporary staff/dev auth.

## Acceptance criteria
- A protected endpoint can plan upcoming booking-time SMS candidates from Aurora.
- Planning mode returns masked destinations only and sends no SMS.
- Confirmed mode reuses the existing server-owned SMS link sender.
- Raw token, full SMS URL, full phone number, SMS text, OTP, and secrets are not printed or committed.
- Duplicate recent real SMS sends are skipped.
- `npm run validate` passes.
- Session Lambda syntax/build/synth pass.
- If deployed, post-deploy diff shows no unexpected changes.

## Manual verification
- Run the booking-time SMS trigger in planning mode against a test window that includes known dev bookings.
- Confirm the response shows only masked destinations and safe booking metadata.
- Run confirmed send only for a verified sandbox destination and a narrow test window.
- Check `jumpyard.sms_deliveries` and SNS delivery diagnostics if a real send is performed.

## Automated validation
Run:
- `node --check infra/lambda/session/index.js`
- `npm --prefix infra run build`
- `npm --prefix infra run synth:dev`
- `npm run validate`
- `git diff --check`
- AWS identity and region preflight before deploy
- `npm --prefix infra run diff:dev` before deploy
- `npm --prefix infra run deploy:dev` only for approved dev backend behavior
- `npm --prefix infra run diff:dev` after deploy
