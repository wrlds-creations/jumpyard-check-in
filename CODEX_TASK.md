# CODEX_TASK.md

## Ticket ID
T0060

## Goal
Add the first API security and observability hardening slice for JumpYard Cloud dev, including API call visibility.

## Dependencies
- T0058 production-readiness audit identified public API/CORS and observability as staging/live blockers.
- T0059 redeem eligibility filter is merged to `main`.
- AWS dev stack remains the implementation target.

## Allowed areas
- CODEX_TASK.md
- PROJECT_CONTEXT.md
- DECISIONS.md
- REPO_CURRENT_STATE.md
- FOLLOWUPS.md
- AWS_RESOURCES.md
- TEST_PLAN.md
- infra/config/dev.json
- infra/config/dev.example.json
- infra/lib/config.ts
- infra/lib/jumpyard-cloud-stack.ts
- infra/lambda/lookup/index.js
- infra/lambda/booking/index.js
- infra/lambda/redeem/index.js
- infra/lambda/webhook/index.js
- infra/lambda/data-sync/index.js

## Do not touch
- UI files
- Payment package vendor files
- Package dependencies
- Aurora migrations or schema
- Production credentials
- Live Roller config
- `.env`
- Unrelated local assets or deliverables

## Requirements

1. Tighten dev API CORS from wildcard to an explicit allow-list.
   - Include local phone/admin dev origins.
   - Include the current Cloudflare Pages origin.
   - Keep the config environment-specific.

2. Add CloudWatch observability for JumpYard Cloud dev.
   - Create an operational dashboard for API, Lambda, queue, and Roller outbound API activity.
   - Add alarms for API 5xx, high API 4xx, Lambda errors, Lambda throttles, DLQ messages, and Roller outbound API errors.
   - Keep alarm missing-data behavior safe for dev.

3. Add API call tracking.
   - Track API Gateway inbound request volume through CloudWatch metrics.
   - Track outbound Roller API calls from Lambda handlers using safe CloudWatch metrics.
   - Do not log secrets, access tokens, payment JWTs, raw Roller payloads, full phone numbers, or full emails.

4. Update source-of-truth documentation.
   - Document new observability resources and where to inspect them in AWS.
   - Update current ticket status and recommended next ticket.
   - Keep T0058 readiness notes consistent with the new state.

5. Deploy only approved dev infrastructure/Lambda changes if validation is clean.
   - Read AWS_RESOURCES.md and use the AWS infrastructure workflow.
   - Confirm AWS account `376129878018` and region `eu-north-1`.
   - Review CDK diff before deploy.

## Non-goals
- Do not add staging or production AWS resources.
- Do not add WAF, Cognito, SSO, or API Gateway authorizers yet.
- Do not change app UI.
- Do not change Roller business behavior.
- Do not change payment, SMS, webhook, Data API, session, or redeem flow semantics.
- Do not create Aurora schema changes.
- Do not touch Roller Live.

## Acceptance criteria
- CORS no longer uses `allowOrigins=['*']` for the dev stack.
- AWS has a JumpYard Cloud operational dashboard for dev.
- AWS has CloudWatch alarms for the agreed dev failure signals.
- Roller outbound calls emit safe count/error metrics.
- `npm --prefix infra run build` passes.
- `npm --prefix infra run synth:dev` passes.
- `npm --prefix infra run deploy:dev` passes after clean diff review.
- `npm run validate` passes.
- `git diff --check` passes.

## Manual verification
- Open CloudWatch dashboard `jumpyard-check-in-dev-ops` in AWS.
- Confirm API request counts, Lambda metrics, DLQ metrics, and Roller API call/error widgets exist.
- Confirm CloudWatch alarms with prefix `jumpyard-check-in-dev` exist.
- Confirm no metric/log output contains secrets, raw payment JWTs, full phone numbers, or full emails.

## Automated validation
Run:
- `node --check infra/lambda/lookup/index.js`
- `node --check infra/lambda/booking/index.js`
- `node --check infra/lambda/redeem/index.js`
- `node --check infra/lambda/webhook/index.js`
- `node --check infra/lambda/data-sync/index.js`
- `npm --prefix infra run build`
- `npm --prefix infra run synth:dev`
- `npm --prefix infra run diff:dev`
- `npm --prefix infra run deploy:dev`
- `npm run validate`
- `git diff --check`
