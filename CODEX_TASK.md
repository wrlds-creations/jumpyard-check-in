# CODEX_TASK.md

## Ticket ID
T0066

## Goal
Complete the dev guest email path as far as current AWS SES setup allows, with public check-in links, safe provider diagnostics, branded email content, and explicit SES readiness blockers.

## Dependencies
- T0063 added the protected email link route, Aurora `email_deliveries`, SES-ready send code, and dry-run preview.
- T0064 moved SMS/email completion ahead of broader production-readiness work.
- T0065 confirmed the SMS leg and public `jy_token` link behavior.

## Allowed areas
- CODEX_TASK.md
- PROJECT_CONTEXT.md
- DECISIONS.md
- REPO_CURRENT_STATE.md
- FOLLOWUPS.md
- AWS_RESOURCES.md
- TEST_PLAN.md
- infra/lambda/session/index.js

## Do not touch
- Phone UI design
- Admin UI design
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

1. Keep email sends server-owned and guarded.
   - Keep `POST /v1/check-in/session-links/send-email` protected by the check-in link dev token.
   - Do not expose raw tokens, full URLs, full email addresses, or raw email body in logs.
   - Keep guest email independent from phone app frontend secrets.

2. Improve email operational diagnostics.
   - Return safe provider metadata for email planning/sending responses.
   - Indicate whether a sender address is configured.
   - Indicate whether reply-to is configured.
   - Keep provider errors redacted.

3. Improve email guest copy.
   - Use the booking start time when available.
   - Keep the HTML email button-based so the public check-in link is hidden behind the CTA.
   - Keep the opaque `jy_token` link model.

4. Verify current SES readiness.
   - Confirm AWS account and region.
   - Confirm SES sending status, sandbox/production access, quota, and configured identities.
   - Do not create or verify a sender/domain unless explicitly approved with the exact sender/domain.

5. Run safe deployed email smoke tests if AWS credentials are available.
   - Dry-run against a known booking using the public `https://jumpyard-check-in.pages.dev/` base URL.
   - Confirm Aurora records a planned email delivery row.
   - Confirm a real send remains blocked when no verified SES sender is configured.

6. Update source-of-truth docs.
   - Document what works after T0066.
   - Keep remaining email production blockers explicit: verified SES sender/domain, SES sandbox exit or verified recipient policy, branding/reply-to, consent/unsubscribe wording, and unified booking-time messaging.

## Non-goals
- Do not enable unattended scheduled email sends.
- Do not create or verify SES sender/domain identities without explicit sender/domain approval.
- Do not exit SES sandbox.
- Do not create staging or production AWS resources.
- Do not change SMS scheduling behavior.
- Do not write to Roller Live/production.
- Do not change payment, redeem, webhook, or Data API behavior.

## Acceptance criteria
- `node --check infra/lambda/session/index.js` passes.
- `npm --prefix infra run build` passes.
- `npm --prefix infra run synth:dev` passes.
- Dev deploy updates only the approved session Lambda code if AWS credentials are available.
- Email dry-run returns `email_planned` with safe diagnostics and no raw token/full URL/full email address.
- `jumpyard.email_deliveries` contains the dry-run row.
- Confirmed send fails closed while SES sender is not configured.
- SES readiness status is documented.
- `npm run validate` passes.
- `git diff --check` passes.

## Manual verification
Review the dry-run preview shape and confirm the email CTA copy/link model is acceptable before configuring a real SES sender.

## Automated validation
Run:
- node --check infra/lambda/session/index.js
- npm --prefix infra run build
- npm --prefix infra run synth:dev
- npm --prefix infra run deploy:dev, if AWS credentials are available
- npm run validate
- git diff --check
