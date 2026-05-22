# CODEX_TASK.md

## Ticket ID
T0042

## Goal
Add AWS SMS delivery diagnostics for dev and run one diagnostic SMS with a non-localhost HTTPS base URL.

## Dependencies
- T0039 completed and merged.
- T0041 completed and merged.
- Dev AWS stack exists in account `376129878018`, region `eu-north-1`.
- User approved the same destination phone number for SMS diagnostics.

## Allowed areas
- CODEX_TASK.md
- PROJECT_CONTEXT.md
- DECISIONS.md
- REPO_CURRENT_STATE.md
- FOLLOWUPS.md
- TEST_PLAN.md
- AWS_RESOURCES.md
- JUMPYARD_CLOUD_CONTRACT.md
- infra/lib/jumpyard-cloud-stack.ts

## Do not touch
- Phone UI
- Admin UI
- Kiosk UI
- Lambda source code
- Aurora migrations
- Payment package/drop-in code
- Redeem business logic
- Roller booking/draft write logic
- Production credentials
- Live Roller config
- `.env`
- Unrelated assets or deliverables

## Requirements

1. Configure AWS SNS SMS delivery status diagnostics for dev.
   - Use CDK.
   - Add least-privilege-ish IAM for SNS to write SMS delivery status logs.
   - Keep the configuration in the confirmed dev stack.
   - Do not create production SMS resources.

2. Verify the SNS configuration.
   - Run AWS identity and region preflight.
   - Run CDK build/synth/diff.
   - Deploy only the approved SNS diagnostics change.
   - Confirm SNS SMS attributes show delivery status logging configured.

3. Run one diagnostic SMS after diagnostics are enabled.
   - Use the existing T0039 endpoint.
   - Use `confirmSend=true`.
   - Use a unique idempotency key.
   - Use a known dev Aurora booking reference.
   - Use an AWS-owned HTTPS base URL instead of `http://localhost:3000/`.
   - Do not print the full destination number, raw token, full check-in URL, SMS text, or provider secrets.

4. Inspect delivery diagnostics safely.
   - Query Aurora for the new `jumpyard.sms_deliveries` row.
   - Check CloudWatch/SNS delivery status logs if they are available.
   - Report delivery status without printing full phone numbers or raw message content.

5. Document the result.
   - Explain that SNS `sent` in Aurora means provider acceptance, while delivery status logs are the next layer of evidence.
   - Document whether CloudWatch delivery status logs appeared and what they showed.
   - Keep payment integration listed as blocked until Roller/Pabel prerequisites arrive.

## Non-goals
- Do not build SMS buttons in phone/admin UI.
- Do not change SMS provider implementation.
- Do not send bulk SMS.
- Do not call Roller.
- Do not redeem tickets.
- Do not create or mutate Roller bookings.
- Do not add payment UI or payment processing.
- Do not replace temporary staff/dev auth.

## Acceptance criteria
- Dev SNS SMS delivery diagnostics are configured through CDK.
- One protected diagnostic SMS send is attempted through JumpYard Cloud dev.
- The result is visible in `jumpyard.sms_deliveries`.
- CloudWatch/SNS delivery status logs are checked or a log-latency/open blocker is documented.
- Raw token, full URL, full phone number, SMS message text, and secrets are not printed or committed.
- `npm run validate` passes.

## Manual verification
- User checks whether the approved phone receives the diagnostic SMS.
- If received, user confirms whether the text is understandable.
- Link opening is not fully validated until the phone app has a public/mobile-reachable URL.

## Automated validation
Run:
- AWS identity and region preflight
- `npm --prefix infra run build`
- `npm --prefix infra run synth:dev`
- `npm --prefix infra run diff:dev`
- `npm --prefix infra run deploy:dev`
- AWS SNS SMS attribute verification
- Deployed API smoke with `confirmSend=true`
- Aurora verification for the created `jumpyard.sms_deliveries` row
- CloudWatch Logs inspection for SNS SMS delivery status
- `npm run validate`
- `git diff --check`
