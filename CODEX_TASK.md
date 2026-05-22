# CODEX_TASK.md

## Ticket ID
T0043

## Goal
Verify a test phone number in AWS SNS SMS sandbox and resend one JumpYard Cloud SMS link after verification.

## Dependencies
- T0039 completed and merged.
- T0042 completed and merged.
- Dev AWS stack exists in account `376129878018`, region `eu-north-1`.
- AWS SNS SMS sandbox is active.
- User provides one approved test destination phone number and the OTP received on that phone.

## Allowed areas
- CODEX_TASK.md
- PROJECT_CONTEXT.md
- REPO_CURRENT_STATE.md
- FOLLOWUPS.md
- TEST_PLAN.md
- AWS_RESOURCES.md
- JUMPYARD_CLOUD_CONTRACT.md

## Do not touch
- Phone UI
- Admin UI
- Kiosk UI
- Lambda source code
- CDK infrastructure code
- Aurora migrations
- Payment package/drop-in code
- Redeem business logic
- Roller booking/draft write logic
- Production credentials
- Live Roller config
- `.env`
- Unrelated assets or deliverables

## Requirements

1. Confirm current SNS sandbox state.
   - Check whether the account is in SMS sandbox.
   - List existing sandbox phone numbers.
   - Do not print full phone numbers in output or docs.

2. Start sandbox phone verification for one approved test number.
   - Use AWS SNS sandbox verification.
   - Mask the destination number in any output.
   - Wait for the user to provide the OTP from the phone.

3. Complete sandbox phone verification.
   - Submit the OTP through AWS SNS.
   - Confirm the phone number status is verified.
   - Do not store or commit the OTP.

4. Resend one JumpYard Cloud SMS link after verification.
   - Use the existing T0039 endpoint.
   - Use `confirmSend=true`.
   - Use a unique idempotency key.
   - Use a known dev Aurora booking reference.
   - Do not print the full destination number, raw token, full check-in URL, SMS text, OTP, or provider secrets.

5. Verify delivery evidence.
   - Query `jumpyard.sms_deliveries` for the new delivery audit row.
   - Check CloudWatch SNS delivery status logs.
   - Ask the user to confirm whether the phone received the SMS.

6. Document the result.
   - Update source-of-truth docs with sandbox verification result.
   - Keep payment integration listed as blocked until Roller/Pabel prerequisites arrive.

## Non-goals
- Do not request production SNS sandbox exit in this ticket unless the user explicitly asks.
- Do not build SMS buttons in phone/admin UI.
- Do not change SMS provider implementation.
- Do not send bulk SMS.
- Do not call Roller.
- Do not redeem tickets.
- Do not create or mutate Roller bookings.
- Do not add payment UI or payment processing.
- Do not replace temporary staff/dev auth.

## Acceptance criteria
- One approved test number is verified in SNS sandbox, or a clear AWS blocker is documented.
- One protected SMS send is attempted after verification.
- The result is visible in `jumpyard.sms_deliveries`.
- CloudWatch/SNS delivery status logs are checked.
- Raw token, full URL, full phone number, SMS message text, OTP, and secrets are not printed or committed.
- `npm run validate` passes.

## Manual verification
- User provides the OTP from the approved phone when AWS sends it.
- User confirms whether the approved phone receives the final JumpYard Cloud SMS.
- Link opening is not fully validated until the phone app has a public/mobile-reachable URL.

## Automated validation
Run:
- AWS identity and region preflight
- SNS sandbox status check
- SNS sandbox phone-number list/status check
- AWS SNS sandbox phone verification commands
- Deployed API smoke with `confirmSend=true`
- Aurora verification for the created `jumpyard.sms_deliveries` row
- CloudWatch Logs inspection for SNS SMS delivery status
- `npm run validate`
- `git diff --check`
