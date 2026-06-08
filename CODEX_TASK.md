# CODEX_TASK.md

## Ticket ID
T0108

## Goal
Run the Gustav demo regression smoke and lock the demo runbook.

## Context
- T0106 and T0107 are merged to `main`.
- T0107 backend behavior must be deployed before the public staff demo can show paid linked add-ons.
- The Gustav demo should be structured around a few clear flows rather than ad hoc clicking.

## Allowed Areas
- `CODEX_TASK.md`
- `PROJECT_CONTEXT.md`
- `REPO_CURRENT_STATE.md`
- `TEST_PLAN.md`
- `AWS_RESOURCES.md`
- `GUSTAV_DEMO_RUNBOOK.md`

## Do Not Touch
- Roller Live
- Production credentials
- `.env`
- AWS resources other than deploying the already-reviewed T0107 `SessionHandler` Lambda code
- Aurora migrations
- Phone or admin application source
- Payment package internals
- Redemption logic or redeem writes
- SMS/email logic
- Roller bookings, drafts, payments, or redemptions unless explicitly started as a separate manual demo

## Requirements

1. Deploy scope:
   - Confirm AWS account `376129878018` and dev region `eu-north-1`.
   - Run CDK build/synth/diff.
   - Deploy only if the diff is limited to `SessionHandler` Lambda code.
   - Confirm post-deploy no-diff.

2. Regression smoke:
   - Verify public phone and public admin pages respond.
   - Verify availability returns entry/add-on data and SkyRider from JumpYard Cloud.
   - Verify staff auth/list/detail works from the deployed API.
   - Verify at least one staff detail includes linked add-on fulfillment rows when present.
   - Verify current CloudWatch alarms are not firing.
   - Verify recent Data API/webhook health from Aurora.

3. Documentation:
   - Update source-of-truth docs and the lower roadmap/current-ticket tables.
   - Add a concise Gustav demo runbook/case order.
   - Record deployment and smoke results without secrets, raw PII, payment JWTs, or full card/gift-card/Klippkort values.

## Non-Goals
- Do not change feature behavior.
- Do not create new AWS resources.
- Do not run live/production cutover work.
- Do not broaden the add-on catalog or change product mapping.

## Acceptance Criteria
- T0107 session Lambda behavior is deployed to dev if diff scope is clean.
- Public API smoke confirms availability, staff auth/list/detail, linked add-on rows, alarms, and Aurora health.
- Gustav demo runbook exists in the repo.
- Source-of-truth docs record T0108 status and next confirmed step.

## Validation
- `npm --prefix infra run build`
- `npm --prefix infra run synth:dev`
- `npm --prefix infra run diff:dev`
- `npm --prefix infra run deploy:dev`
- Public API/page smoke commands documented in `TEST_PLAN.md`
- `npm run validate`
