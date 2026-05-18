# CODEX_TASK.md

## Ticket ID

T0001

## Goal

Create a safe Roller Playground environment guard and Roller client skeleton without making real API calls.

## Dependencies

- T0000 completed.
- No Roller API credentials required yet.

## Allowed Areas

- `CODEX_TASK.md`
- `PROJECT_CONTEXT.md`
- `DECISIONS.md`
- `REPO_CURRENT_STATE.md`
- `FOLLOWUPS.md`
- `TEST_PLAN.md`
- `.env.example`
- `package.json`
- Existing config/server/lib/api folders only if needed for the Roller skeleton
- New Roller-related files only if they fit the existing repo structure

## Do Not Touch

- UI design
- Existing check-in app flow
- Assets
- Deliverables
- Payment logic
- Redeem logic
- AWS resources
- Production credentials
- Any unrelated refactor

## Requirements

1. Add `.env.example` entries for Roller Playground config:
   - `ROLLER_ENV=playground`
   - `ROLLER_BASE_URL=`
   - `ROLLER_CLIENT_ID=`
   - `ROLLER_CLIENT_SECRET=`
2. Add a Roller environment validation helper that:
   - Requires `ROLLER_ENV` to be `playground`
   - Requires `ROLLER_BASE_URL` to clearly point to a playground environment
   - Fails fast if the URL looks like production/live
   - Never logs secrets
3. Add a minimal Roller client skeleton:
   - Reads config from env
   - Exposes a placeholder client/config object
   - Does not call Roller yet
   - Does not require real credentials to run basic validation
4. Add a validation command if it fits the repo conventions, for example:
   - `npm run roller:env:check`
5. Update `DECISIONS.md` with:
   - `D0002`: Roller integration must fail closed unless configured for Playground.
6. Update `REPO_CURRENT_STATE.md` with:
   - T0001 in progress/completed status
   - New script or validation command
   - Next recommended ticket: `T0002 Roller Playground credential smoke test`
7. Update `TEST_PLAN.md` with:
   - Env validation test
   - Production URL rejection test
   - Missing credentials behavior

## Non-Goals

- Do not connect to Roller.
- Do not create bookings.
- Do not read bookings.
- Do not implement payment.
- Do not implement redeem.
- Do not create AWS infrastructure.
- Do not change app UI.

## Acceptance Criteria

- Repo has documented Roller Playground env variables.
- Validation passes with safe Playground-looking config.
- Validation fails with production/live-looking URL.
- No secrets are committed.
- `npm run validate` passes.
- Any added Roller-specific validation command passes.

## Manual Verification

Run the Roller env check with:

1. Missing env values
2. Playground-looking base URL
3. Production-looking base URL

Confirm production-looking config is rejected.

## Automated Validation

Run:

- `npm run validate`
- Any new Roller env validation command
