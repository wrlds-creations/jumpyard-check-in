# CODEX_TASK.md

## Ticket ID
T0086

## Goal
Run a narrow guest/admin UI polish pass to remove remaining outdated backup-code/font artifacts and keep the active check-in surfaces aligned with the approved JumpYard visual rules.

## Dependencies
- T0085 completed and merged.
- T0084 already removed the visible guest backup-code box from the active ready-for-staff confirmation screen.

## Allowed areas
- CODEX_TASK.md
- PROJECT_CONTEXT.md
- REPO_CURRENT_STATE.md
- FOLLOWUPS.md
- TEST_PLAN.md
- jumpyard-checkin-phone/src/app/globals.css
- jumpyard-checkin-phone/src/components/PresentCode.tsx
- jumpyard-checkin-phone/src/context/LanguageContext.tsx
- jumpyard-checkin-admin/src/app/globals.css

## Do not touch
- Guest phone flow state machine behavior
- Staff/admin flow behavior
- JumpYard Cloud API/Lambda behavior
- AWS/CDK resources
- Aurora migrations
- Roller API write paths
- Payment behavior
- SMS/email behavior
- Package dependencies
- Assets
- Deliverables
- Production credentials
- Roller Live
- `.env`

## Requirements

1. Remove remaining guest-facing backup-code artifacts:
   - remove unused backup-code labels from the phone translations
   - update the legacy phone present-code component so it says staff/personalkod instead of backup code
   - keep the active QR/staff-code confirmation behavior intact

2. Remove obsolete font artifacts:
   - remove the unused `font-stretch-expanded` helper from active phone/admin globals
   - keep the documented system sans-serif font stack
   - do not add or restore any Google font imports or historical display-font overrides

3. Keep scope narrow:
   - no functional flow changes
   - no new components unless required for cleanup
   - no backend/API/deploy changes

## Non-goals
- Do not redesign the guest or admin apps.
- Do not change staff auth, queue, detail, QR scan, or redeem behavior.
- Do not change backend contracts or API behavior.
- Do not create new backend state or migrations.
- Do not add staff/admin Cloudflare deployment; that stays in T0087.
- Do not implement real-time guest-name enrichment; that stays in T0088.
- Do not change guest messaging, payment, booking, add-product, or safety flow behavior.

## Acceptance criteria
- Phone app builds.
- Admin app builds.
- No phone/admin source contains active backup-code UI text.
- No phone/admin global CSS contains the unused `font-stretch-expanded` helper.
- No backend, AWS, Roller, payment, SMS, email, package, or asset behavior changes.

## Manual verification
Open the phone app final ready-for-staff screen and confirm it shows QR plus staff/personalkod without a backup-code label. Open the staff/admin app and confirm it still loads normally.

## Automated validation
Run:
- npm --prefix jumpyard-checkin-phone run build
- npm --prefix jumpyard-checkin-admin run build
- npm run validate
- git diff --check
