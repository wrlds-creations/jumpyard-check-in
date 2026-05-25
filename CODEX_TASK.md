# CODEX_TASK.md

## Ticket ID
T0048

## Goal
Polish the staff/admin handoff app for real staff use on phones and align its visual language with the JumpYard phone check-in app.

## Dependencies
- T0047 completed and merged.
- Staff auth endpoint is deployed in dev.
- Existing staff list/detail/redeem behavior must remain unchanged.

## Allowed areas
- CODEX_TASK.md
- PROJECT_CONTEXT.md
- DECISIONS.md
- REPO_CURRENT_STATE.md
- FOLLOWUPS.md
- TEST_PLAN.md
- JUMPYARD_CLOUD_CONTRACT.md
- jumpyard-checkin-admin/src/app/page.tsx
- jumpyard-checkin-admin/src/app/globals.css
- jumpyard-checkin-admin/src/app/layout.tsx
- jumpyard-checkin-admin/src/app/manifest.ts
- jumpyard-checkin-admin/src/lib/adminApi.ts
- jumpyard-checkin-admin/public/**
- jumpyard-checkin-phone/src/app/layout.tsx
- jumpyard-checkin-phone/src/app/globals.css
- jumpyard-checkin-kiosk/src/app/layout.tsx
- jumpyard-checkin-kiosk/src/app/globals.css

## Do not touch
- Phone app flow/components
- Kiosk app flow/components
- JumpYard Cloud Lambda/backend behavior
- AWS resources or CDK
- Aurora migrations
- Roller booking/payment/redeem logic
- SMS logic
- Production credentials
- Live Roller config
- `.env`
- Unrelated local assets or deliverables

## Requirements

1. Improve staff/admin mobile ergonomics.
   - The handoff app must fit phone-sized screens without horizontal overflow.
   - Staff login, handoff search, QR scanner, waiting list, detail view, and redeem action must have usable tap targets.
   - A selected handoff should be easy to review on a phone without requiring staff to scroll past the full waiting list first.

2. Align the admin app with the phone check-in visual language.
   - Use the same JumpYard logo and approved icon style already used by the phone app.
   - Do not use Google font imports or historical display-font overrides for the current check-in surfaces.
   - Use the documented JumpYard system sans-serif stack consistently across admin, phone, and kiosk app shells.
   - Use compatible colors, rounded corners, spacing, and italic/uppercase emphasis.
   - Keep the result operational and staff-focused, not a marketing page.

3. Improve staff operation states.
   - Keep staff auth session behavior from T0047 unchanged.
   - Make loading, empty, error, scanner, selected, completed, and redeem states clear.
   - Keep QR scan/paste/manual code paths available.

4. Preserve the existing contracts.
   - Do not change request payloads or response expectations for staff auth/list/detail/redeem.
   - Do not add frontend secrets or dev redeem tokens.
   - Do not call Roller directly from the admin app.

5. Document the result.
   - Update source-of-truth docs with T0048 status and validation.
   - Keep future production staff identity, public URL, and QR token hardening as follow-ups rather than widening this ticket.

## Non-goals
- Do not implement staff roles, Cognito, SSO, or MFA.
- Do not change backend auth/session token policy.
- Do not change phone check-in behavior.
- Do not change SMS scheduling or delivery behavior.
- Do not change payment or add-product flows.
- Do not redeem a real Playground ticket during validation unless explicitly requested.
- Do not create or modify AWS resources.

## Acceptance criteria
- Admin app is visually aligned with the phone app's JumpYard design system.
- Staff handoff UI is usable on phone-sized screens.
- Staff login, list, detail, scanner, and redeem controls still render.
- Historical display-font references are removed from source and source-of-truth docs.
- No backend, AWS, Roller, SMS, or payment code is changed.
- `npm --prefix jumpyard-checkin-admin run lint` passes.
- `npm --prefix jumpyard-checkin-admin run build` passes.
- Phone app shell font change builds/lints without changing flow behavior.
- Kiosk app shell font change builds without changing flow behavior; any pre-existing kiosk lint failures outside the shell change are documented.
- `npm run validate` passes.

## Manual verification
- Open `http://127.0.0.1:3002/` or `http://localhost:3002/`.
- Confirm staff login screen fits a phone viewport.
- Confirm authenticated handoff list/detail view fits a phone viewport.
- Confirm QR scanner panel opens without breaking layout.
- Confirm desktop layout still shows list and detail side by side.

## Automated validation
Run:
- `npm --prefix jumpyard-checkin-admin run lint`
- `npm --prefix jumpyard-checkin-admin run build`
- `npm --prefix jumpyard-checkin-phone run lint`
- `npm --prefix jumpyard-checkin-phone run build`
- `npm --prefix jumpyard-checkin-kiosk run lint`
- `npm --prefix jumpyard-checkin-kiosk run build`
- `npm run validate`
- `git diff --check`
