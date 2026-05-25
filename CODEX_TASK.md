# CODEX_TASK.md

## Ticket ID
T0047

## Goal
Replace the staff/admin temporary redeem dev-code flow with a first server-owned staff authentication slice for the dev handoff app.

## Dependencies
- T0046 completed and merged.
- Dev AWS stack exists in account `376129878018`, region `eu-north-1`.
- Staff/admin production identity provider is not selected yet.

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
- infra/lambda/session/index.js
- infra/lambda/redeem/index.js
- jumpyard-checkin-admin/src/lib/adminApi.ts
- jumpyard-checkin-admin/src/app/page.tsx

## Do not touch
- Phone UI
- Kiosk UI
- Payment package/drop-in code
- Roller booking/draft write logic
- Aurora migrations
- SMS scheduling logic
- Production credentials
- Live Roller config
- `.env`
- Unrelated assets or deliverables

## Requirements

1. Add a dev staff auth secret.
   - Store a generated staff passcode in AWS Secrets Manager.
   - Do not commit or print the passcode.
   - Keep the secret separate from Roller credentials and redeem dev-token secrets.

2. Add a staff login endpoint.
   - Expose `POST /v1/staff/auth/login` through JumpYard Cloud.
   - Validate the passcode server-side.
   - Return a short-lived staff token and safe staff display metadata.
   - Never return or log the stored passcode.

3. Protect staff handoff endpoints with staff auth.
   - Require the staff token for `GET /v1/staff/check-in/sessions`.
   - Require the staff token for `GET /v1/staff/check-in/sessions/{checkinSessionId}`.
   - Return a clear forbidden/expired response for missing or invalid tokens.

4. Protect staff-confirmed redeem with staff auth.
   - Require the staff token for `POST /v1/staff/check-in/sessions/{checkinSessionId}/redeem`.
   - Keep final Roller refresh, eligibility checks, idempotency, audit, and session completion behavior unchanged.
   - Do not require the admin app to send the old manually entered redeem dev code for the staff route.

5. Update the admin app.
   - Show a staff login screen before handoff data loads.
   - Store the short-lived staff auth session in browser session storage only.
   - Send the staff token on staff list, detail, and redeem requests.
   - Remove the visible temporary dev-code input from the normal staff handoff flow.
   - Allow logout to clear the staff auth session.

6. Deploy dev AWS changes if validation passes.
   - Verify AWS account `376129878018`.
   - Verify region `eu-north-1`.
   - Run CDK diff before deploy.
   - Update AWS docs with the new staff auth secret and route.

7. Document the result.
   - Update source-of-truth docs with the staff auth behavior.
   - Keep clear that this is a pilot/dev auth slice, not final production SSO/Cognito.
   - Add follow-up for production staff identity, roles, and token/session policy.

## Non-goals
- Do not implement Cognito, SSO, or production staff identity yet.
- Do not change phone check-in behavior.
- Do not change SMS sending behavior.
- Do not change Roller booking, payment, draft, or add-product behavior.
- Do not create or change Aurora schema.
- Do not redeem a real Playground ticket during validation unless explicitly requested.
- Do not remove the lower-level protected direct redeem dev-token path used for controlled internal/dev testing.

## Acceptance criteria
- Staff/admin app no longer asks for a temporary dev redeem code in the normal handoff redeem flow.
- Staff login succeeds only with the AWS-stored staff passcode.
- Staff list/detail routes reject missing or invalid staff auth.
- Staff redeem route rejects missing or invalid staff auth.
- Staff redeem route still delegates to the existing server-side final Roller refresh/redeem path after auth succeeds.
- `npm run validate` passes.
- Admin lint/build pass.
- Lambda syntax, infra build, synth, and diff pass.
- If deployed, post-deploy diff shows no unexpected changes.

## Manual verification
- Retrieve the generated staff passcode from AWS Secrets Manager without printing it.
- Confirm staff login returns a token and expiry.
- Confirm staff list fails without a token.
- Confirm staff list succeeds with the token.
- Confirm staff redeem against a fake/nonexistent session passes auth and returns not found, without redeeming any real Roller ticket.
- Open the admin app and confirm the temporary dev-code input is gone from the normal handoff panel.

## Automated validation
Run:
- `node --check infra/lambda/session/index.js`
- `node --check infra/lambda/redeem/index.js`
- `npm --prefix infra run build`
- `npm --prefix infra run synth:dev`
- `npm --prefix jumpyard-checkin-admin run lint`
- `npm --prefix jumpyard-checkin-admin run build`
- `npm run validate`
- `git diff --check`
- AWS identity and region preflight before deploy
- `npm --prefix infra run diff:dev` before deploy
- `npm --prefix infra run deploy:dev` only for approved dev backend behavior
- `npm --prefix infra run diff:dev` after deploy
