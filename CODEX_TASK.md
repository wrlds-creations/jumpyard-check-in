# CODEX_TASK.md

## Ticket ID
T0068

## Goal
Unify booking-time guest messaging so one server-side processor can plan and send both SMS and email check-in links before the booked jump time.

## Dependencies
- T0045 added booking-time SMS planning.
- T0046/T0049 added the dev EventBridge schedule in safe planning mode.
- T0065 confirmed manual protected SMS delivery to the verified SNS sandbox phone.
- T0067 confirmed real SES-backed dev email delivery from verified sender `love@wrlds.com`.

## Allowed areas
- CODEX_TASK.md
- PROJECT_CONTEXT.md
- DECISIONS.md
- REPO_CURRENT_STATE.md
- FOLLOWUPS.md
- AWS_RESOURCES.md
- TEST_PLAN.md
- infra/lambda/session/index.js
- infra/lib/jumpyard-cloud-stack.ts

## Do not touch
- Phone UI design
- Admin UI design
- Payment flow
- Redeem flow
- Roller webhook registration
- Data API importer behavior
- Aurora migrations
- Package dependencies
- Production credentials
- Live Roller config
- `.env`
- Unrelated local assets or deliverables

## Requirements

1. Add a unified booking-time messaging processor.
   - It must use the same Aurora due-booking window as the existing booking-time SMS path.
   - It must support channels `sms`, `email`, or both.
   - It must keep the legacy `send-due-sms` route working for SMS-only compatibility.

2. Add a protected unified route.
   - Add `POST /v1/check-in/session-links/send-due-messages`.
   - Require the same check-in link dev token for public/manual calls.
   - Return safe booking metadata, channel status, and masked destinations only.
   - Never return raw check-in tokens, full check-in URLs, full phone numbers, full email addresses, secrets, or raw message bodies.

3. Reuse the existing channel senders.
   - SMS must reuse the audited `send-sms` path and `jumpyard.sms_deliveries`.
   - Email must reuse the audited `send-email` path and `jumpyard.email_deliveries`.
   - Both channels must keep existing dry-run-first behavior and duplicate/recent-send guards.

4. Update the dev schedule safely.
   - The existing EventBridge schedule may invoke the unified processor with both `sms` and `email`.
   - Dev config must remain planning-only with `confirmSend=false`.
   - Scheduled confirmed sends must still fail closed unless the explicit approval phrase and public HTTPS app URLs are configured.

5. Deploy and smoke test in dev.
   - Verify AWS account `376129878018` and region `eu-north-1`.
   - Deploy only the route/session Lambda/EventBridge payload changes.
   - Run a protected planning smoke through the new unified route.
   - Run an internal scheduled-event planning smoke without a public dev token.
   - Confirm the legacy SMS route still works.

6. Update source-of-truth docs.
   - Document that T0068 unifies SMS and email orchestration.
   - Keep production blockers separate: SNS sandbox exit, SES production sender/domain, consent/unsubscribe, sender branding, and production environment cutover.

## Non-goals
- Do not enable unattended real SMS or email sends.
- Do not exit SNS or SES sandbox.
- Do not create staging or production AWS resources.
- Do not change message copy beyond what is needed for the unified processor.
- Do not write to Roller Live/production.
- Do not change payment, redeem, webhook, or Data API behavior.

## Acceptance criteria
- `POST /v1/check-in/session-links/send-due-messages` exists in dev.
- The new route plans both SMS and email channels from one due-booking processor.
- The existing `send-due-sms` route still returns the SMS-only response shape.
- EventBridge invokes the unified processor with both channels but remains planning-only in dev.
- No raw token/full URL/full message body/secrets/full contact values are returned or logged intentionally.
- `node --check infra/lambda/session/index.js` passes.
- `npm --prefix infra run build` passes.
- `npm --prefix infra run synth:dev` passes.
- Post-deploy `cdk diff` shows no differences.
- `npm run validate` passes.
- `git diff --check` passes.

## Manual verification
Use the protected unified route in planning mode for a known Playground booking-time window and confirm the response shows separate channel rows for `sms` and `email`.

## Automated validation
Run:
- aws sts get-caller-identity --profile wrlds-dev
- aws configure get region --profile wrlds-dev
- node --check infra/lambda/session/index.js
- npm --prefix infra run build
- npm --prefix infra run synth:dev
- npm --prefix infra run diff:dev
- npm --prefix infra run deploy:dev
- npm run validate
- git diff --check
