# CODEX_TASK.md

## Ticket ID
T0063

## Goal
Verify guest messaging with the public check-in URL and add the server-owned email delivery foundation.

## Dependencies
- T0038/T0039 created opaque check-in links and SMS delivery audit rows.
- T0049 keeps unattended scheduled SMS sends disabled unless explicit safety config is present.
- T0062 classified `session-links` messaging routes as internal operations routes before staging/live.

## Allowed areas
- CODEX_TASK.md
- PROJECT_CONTEXT.md
- DECISIONS.md
- REPO_CURRENT_STATE.md
- FOLLOWUPS.md
- AWS_RESOURCES.md
- TEST_PLAN.md
- API_PROTECTION_BOUNDARY.md
- infra/config/dev.json
- infra/config/dev.example.json
- infra/lib/config.ts
- infra/lib/jumpyard-cloud-stack.ts
- infra/lambda/session/index.js
- infra/migrations/

## Do not touch
- UI files
- App source code outside the session Lambda
- Roller payment flow
- Redeem flow
- Webhook registration
- Data API importer behavior
- Production credentials
- Live Roller config
- `.env`
- Unrelated local assets or deliverables

## Requirements

1. Keep booking-time SMS automation safe.
   - Use the public Cloudflare check-in URL in dev config for future links.
   - Keep unattended scheduled sends disabled with `confirmSend=false`.
   - Do not send real SMS unless explicitly confirmed outside this ticket.

2. Add an email delivery foundation using the same check-in token model as SMS.
   - Create a `POST /v1/check-in/session-links/send-email` route.
   - Require the existing check-in link dev token for the route.
   - Create an opaque `jy_token` link with channel `email`.
   - Store only token hashes and masked/hashed destinations.
   - Never log or persist raw tokens or full check-in URLs.

3. Add email audit storage.
   - Add a versioned Aurora migration for `jumpyard.email_deliveries`.
   - Track delivery id, booking ids, token hash, provider, destination hash/mask, template, subject, status, dry-run flag, provider message id, safe errors, and timestamps.

4. Add provider-ready AWS SES support without forcing a real send.
   - Configure SES provider env for the session Lambda.
   - Add IAM permission for SES send on the session Lambda.
   - Fail confirmed sends unless a verified sender is configured.
   - Allow dry-run/preview without a verified SES sender.

5. Update source-of-truth docs.
   - Document that SMS and email use the same opaque link/session resolution pattern.
   - Document that no SES sender identity exists yet in dev unless verified later.
   - Mark guest email messaging follow-up as implemented to foundation level.

## Non-goals
- Do not create a SES sender/domain identity without confirmed sender details.
- Do not enable real unattended SMS.
- Do not send real email in this ticket.
- Do not add email UI to the phone app.
- Do not change staff/admin auth.
- Do not create staging or production AWS resources.
- Do not touch Roller Live.

## Acceptance criteria
- Email delivery route exists in CDK and session Lambda routing.
- Dry-run email planning creates an email token and `email_deliveries` audit row.
- Confirmed email send fails closed if SES sender is not configured.
- Dev scheduled SMS remains planning-only.
- Public check-in base URL is configured for guest messaging links in dev.
- `npm run validate` passes.
- `node --check infra/lambda/session/index.js` passes.
- `npm --prefix infra run build` passes.
- `npm --prefix infra run synth:dev` passes.
- Dev migration, deploy, and dry-run email smoke pass if AWS credentials are available.

## Manual verification
Use the protected email route in dry-run mode for a known booking, confirm the response returns only masked destination data, then query Aurora for the matching `jumpyard.email_deliveries` row.

## Automated validation
Run:
- node --check infra/lambda/session/index.js
- npm --prefix infra run build
- npm --prefix infra run synth:dev
- npm --prefix infra run migrate:dev
- npm --prefix infra run deploy:dev
- npm run validate
- git diff --check
