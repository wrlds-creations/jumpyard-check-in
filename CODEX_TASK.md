# CODEX_TASK.md

## Ticket ID
T0038

## Goal
Create the JumpYard Cloud SMS token/session link foundation without sending SMS.

## Dependencies
- T0037 completed and merged.
- Dev AWS stack exists.
- Dev Aurora schema already includes `jumpyard.checkin_tokens`.
- Dev booking/session API is deployed.

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

## Do not touch
- Phone UI
- Admin UI
- Kiosk UI
- Package dependencies
- Aurora migrations
- Payment package/drop-in code
- Redeem business logic
- SMS provider integration
- Production credentials
- Live Roller config
- `.env`
- Unrelated assets or deliverables

## Requirements

1. Add a dev-protected check-in session link creation endpoint.
   - It must require a server/dev token before creating links.
   - It must accept a booking reference or Roller unique id that exists in Aurora.
   - It must generate a high-entropy raw token and store only a SHA-256 token hash in `jumpyard.checkin_tokens`.
   - It must return the raw token and optional phone check-in URL only once in the API response.
   - It must never log raw tokens or guest PII.

2. Add a public check-in session link resolve endpoint.
   - It must accept a raw token.
   - It must hash the token and find the matching row in `jumpyard.checkin_tokens`.
   - It must reject missing, expired, or consumed links.
   - It must mark the link as opened.
   - It must start or resume the existing JumpYard Cloud check-in session for the linked booking.
   - It must not call Roller.

3. Add dev AWS resources through CDK.
   - Add a Secrets Manager secret for the dev link-creation token.
   - Grant only the session Lambda read access to that secret.
   - Add API Gateway routes for link creation and token resolution.
   - Add the required CORS header for the dev link-creation token.

4. Preserve the security model.
   - The raw booking number must not be the only authority when using a link.
   - Token hashes may be stored; raw tokens must not be persisted.
   - SMS sending remains out of scope for this ticket.

5. Update source-of-truth docs with:
   - New AWS resource and endpoint details.
   - Validation and deploy results.
   - Recommended next ticket: `T0039 SMS sending`.

## Non-goals
- Do not send SMS.
- Do not integrate Twilio, AWS SNS, Pinpoint, or another SMS provider.
- Do not change phone UI routing.
- Do not call Roller.
- Do not redeem tickets.
- Do not create or mutate Roller bookings.
- Do not add payment UI or payment processing.
- Do not create production resources.

## Acceptance criteria
- `POST /v1/check-in/session-links` creates a protected dev token link for an Aurora booking.
- `POST /v1/check-in/session-links/resolve` resolves the token and starts/resumes a JumpYard Cloud session.
- Raw token values are response-only and are not stored in Aurora.
- Dev deploy succeeds.
- `npm run validate` passes.
- No app UI code was changed.

## Manual verification
In AWS Console:
- Open Secrets Manager and confirm `/jumpyard-check-in-dev/checkin-links/dev-token` exists.
- Open API Gateway and confirm the session-link routes exist.
- Open Aurora Query Editor and confirm `jumpyard.checkin_tokens` has only token hashes.
- Resolve a generated token and confirm `opened_at` is set and a check-in session exists or resumes.

## Automated validation
Run:
- `node --check infra/lambda/session/index.js`
- `npm --prefix infra run build`
- `npm --prefix infra run synth:dev`
- `npm --prefix infra run diff:dev`
- `npm --prefix infra run deploy:dev`
- Deployed API smoke for link creation and token resolution
- `npm run validate`
- `git diff --check`
