# CODEX_TASK.md

## Ticket ID
T0073

## Goal
Run a controlled unified booking-time SMS and email smoke test through the existing due-booking processor.

## Dependencies
- T0072 completed.
- Dev AWS stack exists and targets Roller Playground.
- A verified SNS sandbox test phone exists.
- A verified SES dev test email identity exists.

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

1. Create or identify one scoped paid Roller Playground booking for today.
   - Use the verified test phone and verified test email only.
   - Do not print full phone numbers, full email addresses, raw tokens, access tokens, client secrets, or raw check-in links.

2. Refresh Aurora with existing sync/webhook paths.
   - Use the deployed Data API sync or existing webhook/lookup path as needed.
   - Confirm the booking is visible to the due-message processor from Aurora.

3. Run the unified booking-time message processor.
   - First run planning mode with `confirmSend=false`.
   - Then run one controlled confirmed send with `confirmSend=true`.
   - Use public HTTPS check-in base URL `https://jumpyard-check-in.pages.dev/`.
   - Keep the normal unattended EventBridge schedule in planning mode.

4. Verify safe delivery state.
   - Confirm both SMS and email delivery audit rows exist in Aurora.
   - Confirm provider message ids are stored.
   - Check SMS provider delivery status if available.
   - Document whether handset sender display still needs manual/user confirmation.

5. Update source-of-truth docs.
   - Update `PROJECT_CONTEXT.md` with the controlled smoke result.
   - Update `REPO_CURRENT_STATE.md` with T0073 status and next ticket.
   - Update `TEST_PLAN.md` with the exact safe verification result.
   - Update `AWS_RESOURCES.md` with meaningful AWS operational state.
   - Update `FOLLOWUPS.md` for any remaining production-readiness gaps.

## Non-goals
- Do not enable unattended scheduled SMS or email sends.
- Do not request SNS SMS sandbox exit.
- Do not request SES production access.
- Do not add or verify new sender identities.
- Do not create, change, deploy, or delete AWS resources.
- Do not change Lambda/app/CDK behavior.
- Do not change SES identities, SNS sandbox numbers, sender IDs, domains, DKIM, or MAIL FROM.
- Do not test payment flows.
- Do not create Roller Live/production data.
- Do not implement fixes discovered during verification.

## Acceptance criteria
- A scoped today's Playground booking is used for the smoke.
- Unified planning finds the booking for both SMS and email.
- Controlled confirmed send processes both SMS and email.
- Aurora audit rows show sent SMS and email with provider message ids.
- SMS provider delivery status is checked if available.
- No secrets, raw tokens, full URLs, full phone numbers, or full email addresses are printed or committed.
- The normal EventBridge schedule remains `confirmSend=false`.
- `npm run validate` passes.
- `git diff --check` passes.

## Manual verification
Confirm on the test phone and test mailbox whether the SMS and email were received and whether the SMS sender display looks acceptable. The machine validation can confirm provider acceptance, but handset display is still a user-visible check.

## Automated validation
Run:
- npm run validate
- git diff --check
