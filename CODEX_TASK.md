# CODEX_TASK.md

## Ticket ID
T0087

## Goal
Prepare the staff/admin app for Cloudflare Pages deployment and make the dev JumpYard Cloud API ready to accept the intended admin Pages origin.

## Dependencies
- T0086 completed and merged.
- Staff/admin app already builds as a static Next export.
- JumpYard Cloud dev API is the only backend target for the admin app.

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
- jumpyard-checkin-admin/README.md
- jumpyard-checkin-admin/public/_headers

## Do not touch
- Staff/admin UI behavior
- Guest phone UI behavior
- JumpYard Cloud Lambda code
- Aurora migrations
- Roller API paths
- Payment behavior
- SMS/email behavior
- Package dependencies
- Assets
- Deliverables
- Production credentials
- Roller Live
- `.env`

## Requirements

1. Define the intended public admin Cloudflare Pages origin:
   - `https://jumpyard-checkin-admin.pages.dev`
   - document that a different Cloudflare project name requires a matching CORS config update

2. Prepare admin Cloudflare Pages deployment docs:
   - Cloudflare project name
   - repository and root directory
   - build command
   - output directory
   - required public environment variable
   - smoke checks for login, queue, search/QR, detail, and redeem

3. Prepare dev API CORS config for the admin Pages origin:
   - add the admin origin to `infra/config/dev.json`
   - keep local admin origins
   - keep the guest phone Pages origin
   - update the example config consistently

4. Add Cloudflare Pages static headers for the admin app:
   - no secrets
   - security headers suitable for a static staff app
   - allow browser API calls to JumpYard Cloud dev API

5. Document deployment constraints:
   - no Cloudflare account credentials or API token are stored in the repo
   - admin staff auth remains server-owned through JumpYard Cloud
   - AWS CORS deploy is required before the public admin URL can call staff APIs

## Non-goals
- Do not create a Cloudflare project from code unless Cloudflare credentials are already available.
- Do not deploy AWS unless the AWS profile is authenticated and the diff is reviewed.
- Do not change staff auth, queue, QR scanner, detail, or redeem behavior.
- Do not add production/staging domains.
- Do not enable guest messaging production unlock.
- Do not implement real-time guest-name enrichment; that stays in T0088.

## Acceptance criteria
- Admin app has documented Cloudflare Pages settings.
- Intended admin Pages origin is present in dev CORS config.
- Admin static export includes Cloudflare headers.
- Admin app builds.
- Root validation passes.
- No backend Lambda, Aurora, Roller, payment, SMS/email, package, asset, or production config behavior changes.

## Manual verification
After Cloudflare Pages is connected and AWS CORS is deployed, open the admin Pages URL and confirm:
- staff login works
- ready queue loads
- search/QR opens a handoff
- handoff detail loads
- staff redeem works on a dedicated Playground test booking

## Automated validation
Run:
- npm --prefix jumpyard-checkin-admin run build
- npm --prefix infra run synth:dev
- npm run validate
- git diff --check
