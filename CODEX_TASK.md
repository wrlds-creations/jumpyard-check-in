# CODEX_TASK.md

## Ticket ID
T0083

## Goal
Add staff-only booking identity and search data to the handoff queue so staff can identify guests by booking code, customer name, or email.

## Dependencies
- T0082 completed and merged.
- Staff auth from T0047 remains required for all staff handoff APIs.

## Allowed areas
- CODEX_TASK.md
- PROJECT_CONTEXT.md
- DECISIONS.md
- REPO_CURRENT_STATE.md
- FOLLOWUPS.md
- AWS_RESOURCES.md
- TEST_PLAN.md
- infra/migrations/0008_prepayment_draft_customer_names.sql
- infra/lambda/booking/index.js
- infra/lambda/data-sync/index.js
- infra/lambda/session/index.js
- infra/scripts/import-related-data.ts
- jumpyard-checkin-admin/src/lib/adminApi.ts
- jumpyard-checkin-admin/src/app/page.tsx

Operational verification may use:
- Dev JumpYard Cloud API
- Dev Aurora read-only queries and the T0083 customer-name migration
- AWS CDK deploy for existing booking, session, and data-sync Lambda code only

## Do not touch
- Guest phone flow behavior
- Booking/payment Lambda
- Roller API write paths
- Assets
- Deliverables
- CDK resource definitions unless required for the session Lambda code deploy
- Package dependencies
- Production credentials
- Roller Live
- `.env`

## Requirements

1. Extend the authenticated staff handoff API response with limited guest identity:
   - booking/customer display name when available
   - masked email when available
   - masked phone when available

2. Support staff search through the authenticated staff list endpoint:
   - handoff code
   - booking reference
   - booking/customer name
   - email
   - phone when available

3. Keep PII boundaries:
   - do not expose raw email or raw phone in the staff API response
   - do not add guest identity to public phone APIs or public guest UI
   - do not print full email, phone, tokens, or secrets during validation

4. Update the staff/admin UI enough to use the new data:
   - show name in the queue row and detail view
   - show masked contact details when available
   - show product names before raw ticket ids in the ticket rows
   - keep the current queue/detail layout; full UX redesign stays in T0084/T0085

5. Persist reliable customer names for staff-only handoff:
   - store first and last name on new prepayment draft rows
   - import first and last name from Roller Data API `/data/customers` into `guest_profiles.latest_booking_context`
   - backfill existing draft rows from matched guest profiles where possible

6. Deploy only the existing dev Lambda code changes after AWS preflight confirms:
   - account `376129878018`
   - region `eu-north-1`
   - approved `infra/config/dev.json` tags

## Non-goals
- Do not redesign the full staff handoff flow.
- Do not add the large green redeem success screen.
- Do not deploy the staff/admin app to Cloudflare.
- Do not change guest ready-for-staff QR UI.
- Do not change payment behavior.
- Do not redeem tickets as part of this ticket.
- Do not create new AWS resources.
- Do not create new Aurora tables; T0083 may add name columns to the existing prepayment draft table.
- Do not change SMS/email behavior.
- Do not write to Roller Live.

## Acceptance criteria
- Staff handoff list/detail responses include limited guest identity when available.
- Staff handoff search can match a ready session by booking code, name, and email.
- The admin UI shows the guest name for staff without exposing raw contact details.
- Staff ticket rows show useful product context instead of using raw Roller item ids as the main label.
- `npm run validate` passes.
- `npm --prefix infra run diff:dev` shows no differences after deploy.

## Manual verification
Open the staff/admin app, log in with the staff passcode, and confirm the queue can be searched by booking code, customer name, and email for a ready-for-staff booking. Confirm only masked contact details are visible.

## Automated validation
Run:
- node --check infra/lambda/session/index.js
- node --check infra/lambda/booking/index.js
- node --check infra/lambda/data-sync/index.js
- npm --prefix infra run build
- npm --prefix infra run migrate:dev
- npm --prefix infra run synth:dev
- npm --prefix infra run diff:dev
- npm --prefix jumpyard-checkin-admin run build
- npm run validate
- git diff --check
