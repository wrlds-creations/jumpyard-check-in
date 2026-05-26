# CODEX_TASK.md

## Ticket ID
T0049

## Goal
Add a safe confirmed-send gate for scheduled booking-time SMS so dev can only move from planning to real unattended sends after the required public URL and SMS approvals are explicitly configured.

## Dependencies
- T0048 completed and merged.
- T0045 booking-time SMS trigger exists.
- T0046 EventBridge schedule exists and currently runs in planning mode.
- SNS sandbox limitations and public/mobile URL requirements are documented.

## Allowed areas
- CODEX_TASK.md
- PROJECT_CONTEXT.md
- DECISIONS.md
- REPO_CURRENT_STATE.md
- FOLLOWUPS.md
- TEST_PLAN.md
- JUMPYARD_CLOUD_CONTRACT.md
- AWS_RESOURCES.md
- infra/config/dev.json
- infra/config/dev.example.json
- infra/lib/config.ts
- infra/lib/jumpyard-cloud-stack.ts
- infra/lambda/session/index.js

## Do not touch
- Phone app UI or flow
- Staff/admin UI
- Kiosk UI
- Roller booking/payment/redeem logic
- Aurora migrations
- Production credentials
- Live Roller config
- `.env`
- Unrelated local assets or deliverables

## Requirements

1. Make the scheduled booking-time SMS configuration explicit.
   - Add a configurable check-in SMS base URL instead of hardcoded scheduler/runtime localhost behavior.
   - Keep dev defaulting to the local phone URL while real scheduled sends remain disabled.

2. Add a confirmed scheduled-send safety gate.
   - `confirmSend=true` for scheduled SMS must require an explicit approval phrase in config.
   - `confirmSend=true` for scheduled SMS must require a public HTTPS check-in base URL.
   - Unsafe confirmed scheduled config must fail before deploy/synth.
   - Runtime scheduled events must also block confirmed sends when the approval phrase or public HTTPS URL is missing.

3. Preserve manual protected SMS behavior.
   - Existing token-protected `POST /v1/check-in/session-links/send-sms` behavior must not change.
   - Existing token-protected `POST /v1/check-in/session-links/send-due-sms` manual planning/confirmed behavior must not change except for safe response metadata.

4. Keep dev safe by default.
   - `infra/config/dev.json` must keep scheduled `confirmSend=false`.
   - T0049 must not send real unattended SMS unless the missing prerequisites are explicitly configured later.

5. Document the result.
   - Update source-of-truth docs with the T0049 state, safety gate, validation, and next tickets.
   - Update AWS resource notes for the changed scheduler/session configuration.

## Non-goals
- Do not request SNS production access or exit sandbox.
- Do not configure a public hosting domain.
- Do not send real unattended SMS in this ticket.
- Do not add email sending.
- Do not change guest-facing phone flow.
- Do not change staff auth/redeem behavior.
- Do not create or modify Aurora schema.

## Acceptance criteria
- Scheduled SMS can still run in planning mode.
- Confirmed scheduled sends require both the approval phrase and public HTTPS base URL.
- Dev config remains planning-only.
- CDK build and synth pass with safe dev config.
- Session Lambda syntax validation passes.
- `npm run validate` passes.
- No app UI code is changed.

## Manual verification
- Review `infra/config/dev.json` and confirm `confirmSend=false`.
- Review scheduler payload in synthesized CDK output or code and confirm it carries the configured base URL and approval field.
- Confirm the documented prerequisites before any future change to `confirmSend=true`.

## Automated validation
Run:
- `node --check infra/lambda/session/index.js`
- `npm --prefix infra run build`
- `npm --prefix infra run synth:dev`
- `npm run validate`
- `git diff --check`
