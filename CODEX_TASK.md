# CODEX_TASK.md

## Ticket ID
T0061

## Goal
Add the first API Gateway protection boundary for JumpYard Cloud dev without changing app behavior.

## Dependencies
- T0060 added explicit CORS, API access logs, CloudWatch dashboard/alarms, and Roller outbound API call metrics.
- T0058 production-readiness audit identified public API protection as a staging/live blocker.
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

## Do not touch
- UI files
- Payment package vendor files
- Package dependencies
- Aurora migrations or schema
- Production credentials
- Live Roller config
- `.env`
- Lambda business logic
- Unrelated local assets or deliverables

## Requirements

1. Add environment-specific API Gateway stage throttling for dev.
   - Configure a default request rate limit.
   - Configure a default burst limit.
   - Keep values in config, not hardcoded.

2. Add throttling visibility.
   - Count HTTP 429 throttled API responses from API Gateway access logs.
   - Add throttled requests to the existing CloudWatch dashboard.
   - Add a CloudWatch alarm for throttled requests.
   - Do not log request bodies, secrets, raw payment JWTs, full phone numbers, or full emails.

3. Keep the guest/staff flow unchanged.
   - Do not add API Gateway authorizers yet.
   - Do not change existing app-level tokens, staff auth, webhook token handling, SMS behavior, payment behavior, or redeem behavior.
   - Do not add WAF in this ticket; keep WAF/edge controls as a later production-readiness step if needed.

4. Update source-of-truth documentation.
   - Document the new API Gateway throttling settings.
   - Document the new CloudWatch metric/alarm.
   - Update current ticket status and recommended next ticket.

5. Deploy only approved dev infrastructure changes if validation is clean.
   - Read AWS_RESOURCES.md and use the AWS infrastructure workflow.
   - Confirm AWS account `376129878018` and region `eu-north-1`.
   - Review CDK diff before deploy.

## Non-goals
- Do not add staging or production AWS resources.
- Do not add WAF, Cognito, SSO, Lambda authorizers, or JWT authorizers yet.
- Do not change app UI.
- Do not change Roller business behavior.
- Do not change payment, SMS, webhook, Data API, session, or redeem flow semantics.
- Do not create Aurora schema changes.
- Do not touch Roller Live.

## Acceptance criteria
- Dev API Gateway `$default` stage has configured throttling.
- Dev API Gateway detailed metrics remain enabled.
- Throttled requests are counted through a safe CloudWatch metric.
- CloudWatch dashboard includes throttled request visibility.
- CloudWatch alarm `jumpyard-check-in-dev-api-throttled-requests` exists.
- `npm --prefix infra run build` passes.
- `npm --prefix infra run synth:dev` passes.
- `npm --prefix infra run deploy:dev` passes after clean diff review.
- `npm run validate` passes.
- `git diff --check` passes.

## Manual verification
- Open API Gateway -> `m0uo5g4mde` -> Stages -> `$default`.
- Confirm default route throttling is rate `25` and burst `50`.
- Open CloudWatch dashboard `jumpyard-check-in-dev-ops`.
- Confirm API throttled request metric is visible.
- Open CloudWatch alarms and confirm `jumpyard-check-in-dev-api-throttled-requests` exists.

## Automated validation
Run:
- `npm --prefix infra run build`
- `npm --prefix infra run synth:dev`
- `npm --prefix infra run diff:dev`
- `npm --prefix infra run deploy:dev`
- `npm --prefix infra run diff:dev`
- `npm run validate`
- `git diff --check`
