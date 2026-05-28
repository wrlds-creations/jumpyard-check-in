# CODEX_TASK.md

## Ticket ID
T0067

## Goal
Run the first real SES-backed dev email smoke for a JumpYard check-in link, using the approved test address `love@wrlds.com`.

## Dependencies
- T0063 added the protected email link route, Aurora `email_deliveries`, SES-ready send code, and dry-run preview.
- T0066 confirmed email dry-run/audit behavior and failed closed when no SES sender identity existed.
- User approved `love@wrlds.com` as the test email address for T0067.

## Allowed areas
- CODEX_TASK.md
- PROJECT_CONTEXT.md
- DECISIONS.md
- REPO_CURRENT_STATE.md
- FOLLOWUPS.md
- AWS_RESOURCES.md
- TEST_PLAN.md
- infra/config/dev.json, only if the SES email identity is verified and a dev sender/reply-to config is required for the smoke

## Do not touch
- Phone UI design
- Admin UI design
- Aurora migrations
- Lambda business logic unless the smoke exposes a ticket-scoped blocker
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

1. Verify AWS and SES state.
   - Confirm AWS account `376129878018` and region `eu-north-1`.
   - Confirm SES account sending status and sandbox/production status.
   - Check whether `love@wrlds.com` is an SES identity.

2. Create or verify the dev SES email identity if needed.
   - Use only the user-approved address `love@wrlds.com`.
   - Apply WRLDS tags if an SES identity is created.
   - Do not attempt sandbox exit.
   - Do not create a production domain identity.

3. Configure dev sender only after identity verification.
   - Use `love@wrlds.com` as the dev sender/reply-to only after SES reports the identity as verified.
   - Deploy only the required dev config/session Lambda environment change.

4. Run a real protected email smoke when SES verification is complete.
   - Use booking `5063420` unless a safer current booking is required.
   - Use public base URL `https://jumpyard-check-in.pages.dev/`.
   - Send to `love@wrlds.com`.
   - Keep the request protected by the check-in link dev token.
   - Do not print raw check-in tokens, full links, secrets, or raw email body.
   - Confirm `jumpyard.email_deliveries` records a sent row.

5. If verification is still pending, stop safely.
   - Document that T0067 is blocked on clicking the SES verification email.
   - Do not configure a sender or attempt a confirmed send while identity status is pending.

6. Update source-of-truth docs.
   - Document SES identity status and any smoke result.
   - Keep production blockers separate from dev smoke: domain sender, SES sandbox/recipient policy, consent/unsubscribe, branding, and unified booking-time messaging.

## Non-goals
- Do not enable unattended scheduled email sends.
- Do not implement unified booking-time SMS+email orchestration in T0067.
- Do not exit SES sandbox.
- Do not create staging or production AWS resources.
- Do not change SMS scheduling behavior.
- Do not write to Roller Live/production.
- Do not change payment, redeem, webhook, or Data API behavior.

## Acceptance criteria
- AWS account and region are verified.
- SES identity `love@wrlds.com` exists and its verification state is documented.
- If verified, dev config uses the verified address, deploy succeeds, and a confirmed email smoke is accepted by SES.
- If pending, T0067 is safely blocked with clear next action.
- No raw token/full URL/full email body/secrets are printed or committed.
- `npm run validate` passes.
- `git diff --check` passes.

## Manual verification
Open the AWS SES verification email sent to `love@wrlds.com` and click the verification link before expecting a real email smoke to pass.

## Automated validation
Run:
- aws sts get-caller-identity --profile wrlds-dev
- aws sesv2 get-email-identity --email-identity love@wrlds.com --profile wrlds-dev --region eu-north-1
- npm --prefix infra run build, if dev config changes
- npm --prefix infra run synth:dev, if dev config changes
- npm --prefix infra run deploy:dev, if dev config changes and AWS credentials are available
- npm run validate
- git diff --check
