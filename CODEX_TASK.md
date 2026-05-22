# CODEX_TASK.md

## Ticket ID
T0041

## Goal
Run and document the first controlled real SMS smoke test through JumpYard Cloud dev.

## Dependencies
- T0039 completed and merged.
- Dev AWS stack exists.
- `POST /v1/check-in/session-links/send-sms` is deployed.
- User explicitly approved one destination phone number for this dev smoke.

## Allowed areas
- CODEX_TASK.md
- PROJECT_CONTEXT.md
- DECISIONS.md
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

1. Use the existing T0039 endpoint for one controlled real SMS smoke.
   - Use `confirmSend=true`.
   - Use a unique idempotency key.
   - Use a known dev Aurora booking reference.
   - Use the approved destination number from the user.
   - Do not print the full destination number in terminal output or docs.

2. Verify the outcome safely.
   - Confirm whether AWS SNS accepted the message.
   - Query `jumpyard.sms_deliveries` for the delivery id.
   - Verify status, provider, dry-run flag, masked destination, and token hash presence.
   - Do not print raw token, full URL, full phone number, or provider secrets.

3. Document the result.
   - Update source-of-truth docs with the real SMS smoke result.
   - If AWS SNS blocks the send, document the safe blocker and next AWS setup step.
   - Keep payment integration listed as blocked until Roller/Pabel prerequisites arrive.

## Non-goals
- Do not build SMS buttons in phone/admin UI.
- Do not change SMS provider implementation.
- Do not create production SMS resources.
- Do not send bulk SMS.
- Do not call Roller.
- Do not redeem tickets.
- Do not create or mutate Roller bookings.
- Do not add payment UI or payment processing.

## Acceptance criteria
- One protected real SMS send attempt is made through JumpYard Cloud dev.
- The result is visible in `jumpyard.sms_deliveries`.
- Raw token, full URL, full phone number, and secrets are not printed or committed.
- Docs identify whether real SMS delivery is accepted by AWS SNS.
- `npm run validate` passes.

## Manual verification
- User checks whether the approved phone receives an SMS.
- If received, user confirms whether the text is understandable.
- The localhost link is expected to be a dev-only URL unless a public/mobile-reachable base URL is provided later.

## Automated validation
Run:
- Deployed API smoke with `confirmSend=true`
- Aurora verification for the created `jumpyard.sms_deliveries` row
- `npm run validate`
- `git diff --check`
