# CODEX_TASK.md

## Ticket ID
T0104

## Goal
Deploy the already-merged T0103 booking Lambda change to AWS dev and verify that the public phone app can receive SkyRider as a capacity-gated add-on from JumpYard Cloud availability.

## Context
- T0103 was merged to `main`, and Cloudflare deployed the phone frontend automatically.
- Cloudflare did not deploy the AWS booking Lambda.
- The deployed AWS booking Lambda still returned only `entry` and `family` availability, so the new phone UI correctly hid SkyRider.
- This ticket deploys only the booking Lambda code already present on `main`.

## Allowed areas
- `CODEX_TASK.md`
- `PROJECT_CONTEXT.md`
- `DECISIONS.md`
- `AWS_RESOURCES.md`
- `REPO_CURRENT_STATE.md`
- `FOLLOWUPS.md`
- `TEST_PLAN.md`

## Do not touch
- Roller Live
- Production credentials
- `.env`
- AWS resource shape beyond deploying the existing booking Lambda code asset
- Aurora migrations
- Phone app UI implementation
- Staff/admin app
- SMS/email logic
- Payment, gift-card, or Klippkort behavior
- Broader dynamic add-on catalog

## Requirements

1. Confirm AWS deployment target:
   - Account must be `376129878018`.
   - Region must be `eu-north-1`.
   - Environment must be `dev`.

2. Deploy scoped backend change:
   - Run CDK build/synth/diff.
   - Confirm diff only changes `BookingHandler` Lambda code.
   - Deploy the dev stack.

3. Verify deployed behavior:
   - Call deployed `POST /v1/bookings/availability`.
   - Confirm each selected slot includes product key `skyrider`.
   - Confirm `skyrider` has `type="addon"` and product id `1765443`.
   - Confirm stock add-ons remain frontend-owned static add-ons.

## Non-goals
- Do not add UI polish.
- Do not change the SkyRider visibility rules from T0103.
- Do not deploy production or Roller Live.
- Do not change Cloudflare configuration.
- Do not create bookings, drafts, payments, or redemptions.

## Acceptance Criteria
- AWS identity and region are verified before deploy.
- CDK diff shows only `BookingHandler` Lambda code asset changing.
- Dev deploy completes successfully.
- Deployed availability API returns `addon,entry,family` product types.
- Deployed availability API includes `skyrider` in selected slot product keys.
- Source-of-truth docs record the deploy and move phone summary icon/copy polish to T0105.

## Validation
- `node --check infra/lambda/booking/index.js`
- `npm --prefix infra run build`
- `npm --prefix infra run synth:dev`
- `npm --prefix infra run diff:dev`
- `npm --prefix infra run deploy:dev`
- `POST /v1/bookings/availability` smoke against deployed dev API
