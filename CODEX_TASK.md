# CODEX_TASK.md

## Ticket ID
T0050

## Goal
Bootstrap the Roller Payments readiness path and document that the older T0040 payment placeholder is replaced by the T0050-T0052 payment execution sequence.

## Dependencies
- T0049 completed and merged.
- Roller API access is re-enabled in Playground.
- User has updated local `.env` and AWS Secrets Manager Roller credentials after the Playground refresh.
- Pabel confirmed Roller Payments API authorization, payment docs location, Adyen test-card source, and the need to allowlist the public test domain.

## Allowed areas
- CODEX_TASK.md
- PROJECT_CONTEXT.md
- DECISIONS.md
- REPO_CURRENT_STATE.md
- FOLLOWUPS.md
- TEST_PLAN.md
- JUMPYARD_CLOUD_CONTRACT.md
- .env.example
- package.json
- scripts/roller-payment-readiness.js
- Existing payment-readiness scripts only if needed

## Do not touch
- Phone app UI or flow
- Staff/admin UI
- Kiosk UI
- Roller booking/payment/redeem Lambda behavior
- Aurora migrations
- AWS resources or CDK config
- Production credentials
- Live Roller config
- `.env`
- Unrelated local assets or deliverables

## Requirements

1. Document the T0040 replacement.
   - T0040 was the older payment placeholder and must no longer be used as the next active ticket.
   - Forward payment work should use:
     - T0050 Payment readiness/bootstrap
     - T0051 New-booking payment execution
     - T0052 Add-product payment execution
   - Staff production readiness should remain a later separate ticket.

2. Capture the confirmed Roller/Pabel payment prerequisites.
   - Payment docs root: `https://docs.roller.app/docs/roller-payments`
   - Payment docs version-history page for readiness checks: `https://docs.roller.app/docs/roller-payments/egj77d29eagwv-version-history`
   - Public test origin requested for allowlisting: `https://jumpyard-check-in.pages.dev`
   - Test/fake card source: Adyen docs, Visa ending `1142`
   - Payment settings source: `GET /venues/me` field `paymentSettings`
   - Account authorization: confirmed if API keys can be generated for the venue.

3. Add a safe local readiness command.
   - Add `npm run roller:payment:readiness`.
   - It must load local `.env` without printing secrets.
   - It must reuse the Playground guard through the existing Roller client helper.
   - It must call only safe read endpoints and public GETs.
   - It must not create Roller bookings, drafts, payments, webhooks, AWS resources, or Aurora rows.
   - It must report whether `/venues/me` exposes usable payment settings.
   - It must report public-origin and allowlist readiness without pretending external allowlisting is complete.

4. Keep payment execution deferred.
   - Do not add payment UI.
   - Do not process test cards.
   - Do not publish draft bookings.
   - Do not wire the phone flow beyond the existing payment-pending state.

5. Update source-of-truth docs.
   - Update roadmap/current-state documents with T0050 and the clean T0051-T0053 sequence.
   - Update follow-ups so payment blockers reflect the new Pabel answer and remaining allowlist/execution work.
   - Update test plan with T0050 validation.

## Non-goals
- Do not install or integrate the Roller payment package in the phone app.
- Do not render Adyen/Roller payment drop-in UI.
- Do not take a real or test payment.
- Do not create or publish a Roller booking in this ticket.
- Do not deploy AWS changes.
- Do not change SMS, redeem, webhook, or staff-auth behavior.

## Acceptance criteria
- T0040 is documented as superseded by T0050-T0052.
- `npm run roller:payment:readiness` exists.
- The readiness command confirms Roller Playground auth and `/venues/me` payment-settings shape when credentials are valid.
- The readiness command reports `https://jumpyard-check-in.pages.dev` as the intended public test origin.
- The readiness command lists allowlist confirmation as pending until explicitly set.
- `npm run validate` passes.
- No app UI, Lambda behavior, AWS resources, or `.env` file is changed.

## Manual verification
- Review the roadmap and confirm no future ticket sequence jumps back to T0040.
- Confirm Pabel has allowlisted `https://jumpyard-check-in.pages.dev` before running browser payment execution in T0051.
- Confirm the Adyen Visa test card ending `1142` is used only from official docs during payment testing, not committed into source.

## Automated validation
Run:
- `node --check scripts/roller-payment-readiness.js`
- `npm run roller:payment:readiness`
- `npm run validate`
- `git diff --check`
