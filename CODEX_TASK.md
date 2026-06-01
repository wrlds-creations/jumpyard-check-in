# CODEX_TASK.md

## Ticket ID
T0082

## Goal
Fix existing-booking add-product draft creation so it can reuse the original booking contact server-side without showing duplicate contact fields to the guest.

## Dependencies
- T0079 completed: guest-facing add-product contact re-entry is removed.
- T0081 completed: integrated rehearsal confirmed the add-product quote path works, but confirmed draft creation fails when customer details are not resolved.

## Allowed areas
- CODEX_TASK.md
- PROJECT_CONTEXT.md
- DECISIONS.md
- REPO_CURRENT_STATE.md
- FOLLOWUPS.md
- AWS_RESOURCES.md
- TEST_PLAN.md
- infra/lambda/booking/index.js

Operational verification may use:
- Dev JumpYard Cloud API
- Dev Aurora read-only queries
- Roller Playground add-product draft creation for one scoped smoke booking
- AWS CDK deploy for the existing booking Lambda code only

## Do not touch
- Phone UI files
- Admin UI files
- Assets
- Deliverables
- Aurora migrations
- CDK resource definitions unless required for the booking Lambda code deploy
- Package dependencies
- Production credentials
- Roller Live
- `.env`

## Requirements

1. Keep the existing no-duplicate-contact add-product UX contract:
   - the phone app does not need to send `customer` for existing-booking add-products
   - JumpYard Cloud must resolve contact server-side
   - JumpYard Cloud must fail closed if required contact details cannot be resolved

2. Improve server-side contact resolution for add-product drafts:
   - use the original Roller booking/customer id when available
   - use Aurora `guest_profiles` when available
   - reuse safe original new-booking draft contact data stored in `prepayment_booking_drafts` when the original booking was created by JumpYard Cloud
   - use the Roller booking name only for first/last name fallback, not for email/phone invention

3. Preserve sensitive-data rules:
   - do not log or persist raw `paymentJwt`
   - do not print full customer email or phone values during validation
   - do not commit secrets

4. Deploy only the existing dev booking Lambda code change after AWS preflight confirms:
   - account `376129878018`
   - region `eu-north-1`
   - approved `infra/config/dev.json` tags

5. Verify the fix:
   - syntax/build/synth pass
   - pre-deploy diff is scoped to the booking Lambda code
   - deploy succeeds
   - post-deploy diff shows no differences
   - a no-customer add-product draft smoke creates a linked Playground draft and Aurora link row

## Non-goals
- Do not change the guest-facing add-product UI.
- Do not change payment UI.
- Do not redeem tickets.
- Do not implement staff handoff improvements.
- Do not create new AWS resources.
- Do not create Aurora migrations.
- Do not change SMS/email behavior.
- Do not write to Roller Live.

## Acceptance criteria
- Add-product confirmed draft creation no longer fails with missing `customer.firstName` for a fresh JumpYard-created paid booking that has stored original contact data.
- Aurora stores the linked add-product draft metadata and booking link.
- Raw `paymentJwt`, access tokens, and full contact PII are not printed or persisted.
- `npm run validate` passes.
- `npm --prefix infra run diff:dev` shows no differences after deploy.

## Manual verification
Use a fresh paid Playground booking created through the public phone app, then create an add-product draft without resending customer details. Confirm the draft/link in Aurora using safe identifiers only.

## Automated validation
Run:
- node --check infra/lambda/booking/index.js
- npm --prefix infra run build
- npm --prefix infra run synth:dev
- npm --prefix infra run diff:dev
- npm run validate
- git diff --check
