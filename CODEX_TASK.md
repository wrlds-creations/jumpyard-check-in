# CODEX_TASK.md

## Ticket ID
T0046

## Goal
Add the dev AWS schedule for booking-time SMS processing so JumpYard Cloud can run the T0045 due-SMS trigger without a staff/admin manually calling the endpoint.

## Dependencies
- T0045 completed and merged.
- Dev AWS stack exists in account `376129878018`, region `eu-north-1`.
- SNS SMS sandbox is still active; only verified sandbox numbers can receive real SMS.
- The current dev check-in app URL is still `http://localhost:3000/`, so guest-facing real SMS links are not production-ready.

## Allowed areas
- CODEX_TASK.md
- PROJECT_CONTEXT.md
- DECISIONS.md
- REPO_CURRENT_STATE.md
- FOLLOWUPS.md
- TEST_PLAN.md
- AWS_RESOURCES.md
- JUMPYARD_CLOUD_CONTRACT.md
- infra/config/dev.json
- infra/config/dev.example.json
- infra/lib/config.ts
- infra/lib/jumpyard-cloud-stack.ts
- infra/lambda/session/index.js

## Do not touch
- Phone UI
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

1. Add an EventBridge schedule for booking-time SMS processing.
   - Use the existing session Lambda.
   - Invoke the existing T0045 due-SMS logic internally.
   - Do not expose a new public API route.

2. Keep the dev schedule safe by default.
   - Run on a short dev cadence so behavior can be observed.
   - Keep `confirmSend=false` in dev config until a public/mobile URL, SNS sandbox readiness, and messaging policy are approved.
   - Do not require a staff/admin dev code for scheduled internal AWS invocation.
   - Keep the HTTP endpoint token-protected.

3. Make the schedule configurable.
   - Configure schedule enabled/disabled.
   - Configure `confirmSend`.
   - Configure `rateMinutes`, `leadMinutes`, `windowMinutes`, and `limit`.
   - Validate config bounds during CDK synth.

4. Preserve T0045 safety rules.
   - Candidate selection still reads Aurora booking time windows.
   - Candidate sends still reuse the audited SMS/link path.
   - Duplicate recent sends are still skipped.
   - Raw tokens, full URLs, SMS text, full phone numbers, and secrets are not logged or persisted.

5. Deploy dev AWS changes if validation passes.
   - Verify AWS account `376129878018`.
   - Verify region `eu-north-1`.
   - Run CDK diff before deploy.
   - Update AWS docs with the new EventBridge rule.

6. Document the result.
   - Update source-of-truth docs with the scheduled processing behavior.
   - Keep clear that dev currently schedules planning mode, not real guest SMS sending.
   - Move real confirmed scheduled SMS sending to a follow-up once public/mobile URL and production SMS readiness are approved.

## Non-goals
- Do not enable unattended real SMS sending in dev while the base URL is `localhost`.
- Do not request SNS sandbox exit.
- Do not add SMS buttons in phone/admin UI.
- Do not change SMS provider implementation.
- Do not call Roller.
- Do not redeem tickets.
- Do not create or mutate Roller bookings.
- Do not add payment UI or payment processing.
- Do not replace temporary staff/dev auth.

## Acceptance criteria
- A dev EventBridge rule invokes the session Lambda for booking-time SMS processing.
- The scheduled path does not require manual staff/admin dev-token input.
- The public HTTP due-SMS endpoint remains token-protected.
- Dev schedule runs in planning mode with `confirmSend=false`.
- Schedule parameters are explicit in dev config.
- `npm run validate` passes.
- Session Lambda syntax, infra build, and synth pass.
- If deployed, post-deploy diff shows no unexpected changes.

## Manual verification
- Invoke the scheduled EventBridge-shaped payload against the session Lambda and confirm it returns a planning response.
- Confirm no real SMS is sent while `confirmSend=false`.
- Check CloudFormation/EventBridge for rule `jumpyard-check-in-dev-booking-time-sms-schedule`.

## Automated validation
Run:
- `node --check infra/lambda/session/index.js`
- `npm --prefix infra run build`
- `npm --prefix infra run synth:dev`
- `npm run validate`
- `git diff --check`
- AWS identity and region preflight before deploy
- `npm --prefix infra run diff:dev` before deploy
- `npm --prefix infra run deploy:dev` only for approved dev backend behavior
- `npm --prefix infra run diff:dev` after deploy
