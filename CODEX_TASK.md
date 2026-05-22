# CODEX_TASK.md

## Ticket ID
T0044

## Goal
Make JumpYard Cloud SMS check-in links open correctly in the phone app by resolving `jy_token` through the server-side session-link API.

## Dependencies
- T0038 completed and merged.
- T0039 completed and merged.
- T0043 completed and merged.
- Dev AWS stack exists in account `376129878018`, region `eu-north-1`.
- Existing SMS links are server-owned opaque tokens, not booking numbers.

## Allowed areas
- CODEX_TASK.md
- PROJECT_CONTEXT.md
- DECISIONS.md
- REPO_CURRENT_STATE.md
- FOLLOWUPS.md
- TEST_PLAN.md
- AWS_RESOURCES.md
- JUMPYARD_CLOUD_CONTRACT.md
- infra/lambda/session/index.js
- jumpyard-checkin-phone/src/app/page.tsx
- jumpyard-checkin-phone/src/flow/cloudClient.ts
- jumpyard-checkin-phone/src/flow/machine.ts

## Do not touch
- Admin UI
- Kiosk UI
- Payment package/drop-in code
- Redeem business logic
- Roller booking/draft write logic
- Aurora migrations
- Production credentials
- Live Roller config
- `.env`
- Unrelated assets or deliverables

## Requirements

1. Update the phone app link detection.
   - Treat `jy_token` as an SMS/deep-link channel.
   - Keep legacy `token` support where it already exists.
   - Do not treat booking reference alone as check-in authority.

2. Add a phone client call for session-link resolution.
   - Call JumpYard Cloud `POST /v1/check-in/session-links/resolve`.
   - Send the raw token only in the request body.
   - Do not log, persist, or expose raw tokens in UI.

3. Return enough safe data from session-link resolution for the phone UI.
   - Include the server-owned check-in session.
   - Include a normalized booking summary from Aurora.
   - Do not return guest email, phone, raw Roller payloads, or secrets.

4. Route the phone app after link resolution.
   - `guest_in_progress` opens the booking summary / normal continuation.
   - `ready_for_staff` opens the final QR confirmation screen.
   - completed/redeemed sessions show the already checked-in state.
   - Invalid or expired links fall back to manual booking lookup without exposing token details.

5. Deploy the dev session Lambda if backend code changes.
   - Verify AWS account `376129878018`.
   - Verify region `eu-north-1`.
   - Use CDK diff before deploy.
   - Update AWS docs if the deployed session endpoint behavior changes.

6. Document the result.
   - Update source-of-truth docs with the new SMS/mobile link behavior.
   - Keep SNS sandbox status and public/mobile URL limitation documented.

## Non-goals
- Do not request production SNS sandbox exit.
- Do not add SMS scheduling by booking time.
- Do not build SMS buttons in phone/admin UI.
- Do not change SMS provider implementation.
- Do not send bulk SMS.
- Do not call Roller.
- Do not redeem tickets.
- Do not create or mutate Roller bookings.
- Do not add payment UI or payment processing.
- Do not replace temporary staff/dev auth.

## Acceptance criteria
- A URL containing `?jy_token=...` enters the SMS phone flow.
- The phone app resolves the token through JumpYard Cloud, not mock data.
- The phone app can render the resolved booking/session state.
- Raw token, full SMS URL, full phone number, SMS text, OTP, and secrets are not printed or committed.
- `npm run validate` passes.
- Phone lint/build pass.
- Session Lambda syntax/build/synth pass.
- If deployed, post-deploy diff shows no unexpected changes.

## Manual verification
- Create or use a dev check-in link for a known paid booking.
- Open the phone app with `?jy_token=<raw token>` locally.
- Confirm the app reaches booking summary, QR confirmation, or already-checked-in based on server session state.
- Do not paste the raw token into committed files or docs.

## Automated validation
Run:
- `node --check infra/lambda/session/index.js`
- `npm --prefix infra run build`
- `npm --prefix infra run synth:dev`
- `npm --prefix jumpyard-checkin-phone run lint`
- `npm --prefix jumpyard-checkin-phone run build`
- `npm run validate`
- `git diff --check`
- AWS identity and region preflight before deploy
- `npm --prefix infra run diff:dev` before deploy
- `npm --prefix infra run deploy:dev` only for approved dev backend behavior
- `npm --prefix infra run diff:dev` after deploy
