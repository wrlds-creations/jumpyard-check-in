# CODEX_TASK.md

## Ticket ID
T0030

## Goal
Discover and document the safe Roller Playground path for new booking payment.

## Dependencies
- T0029 completed and merged.
- Roller Playground credentials exist locally in `.env`.
- Existing Roller client guard rejects Live/production URLs.

## Allowed areas
- CODEX_TASK.md
- PROJECT_CONTEXT.md
- DECISIONS.md
- REPO_CURRENT_STATE.md
- FOLLOWUPS.md
- TEST_PLAN.md
- JUMPYARD_CLOUD_CONTRACT.md
- package.json
- Existing `scripts/` Roller discovery tooling
- New small Roller payment discovery script if needed

## Do not touch
- Phone UI implementation
- Admin UI implementation
- Kiosk UI implementation
- AWS infrastructure
- Lambda/API handlers
- Aurora migrations
- Redeem business logic
- Staff auth
- Production credentials
- Live Roller config
- `.env`
- Unrelated assets or deliverables

## Requirements

1. Confirm the intended Roller Playground payment flow for new bookings:
   - Draft booking creation.
   - Returned booking cost fields.
   - Returned `paymentJwt`.
   - How the booking becomes published/confirmed after payment.

2. Add or update a safe local discovery command if useful, for example:
   - `npm run roller:payment:discover`

3. The discovery command must:
   - Load local `.env` without committing it.
   - Reuse the Playground environment guard.
   - Fail if `ROLLER_ENV` is not `playground`.
   - Fail if `ROLLER_BASE_URL` does not point to Playground.
   - Never print `ROLLER_CLIENT_SECRET`, access tokens, or raw payment JWTs.
   - Default to dry-run/no write mode.
   - Require an explicit one-off confirmation env var before creating any Playground draft booking.

4. If a Playground draft booking is created:
   - Use fake customer data only.
   - Do not create a live/production booking.
   - Do not process a real payment.
   - Summarize only safe identifiers and response shape.

5. Document whether fake/test payment can happen inside the JumpYard PWA:
   - Supported directly with Roller Payments and `paymentJwt`.
   - Requires a Roller-hosted payment page/link.
   - Requires extra docs from Roller or venue/payment configuration.
   - Unknown/blocked.

6. Update source-of-truth docs with:
   - T0030 status.
   - Findings.
   - Open questions.
   - Recommended next ticket.

## Non-goals
- Do not build phone booking UI.
- Do not implement JumpYard Cloud booking endpoints.
- Do not deploy AWS changes.
- Do not create Aurora tables.
- Do not process real payments.
- Do not redeem tickets.
- Do not implement add-product booking links.
- Do not register or change webhooks.

## Acceptance criteria
- The intended Roller draft/payment flow is documented.
- Any added discovery command defaults to no-write mode.
- Any write test is Playground-only and explicitly guarded.
- No secrets, access tokens, or raw payment JWTs are printed.
- `npm run validate` passes.
- Recommended next ticket is updated based on findings.

## Manual verification
Review the T0030 findings in source-of-truth docs and confirm whether the next implementation should build:
1. Server-side booking quote/draft endpoints.
2. A hosted payment-link fallback.
3. An in-app payment flow using Roller Payments.

## Automated validation
Run:
- `npm run validate`
- Any added Roller payment discovery command in dry-run mode
