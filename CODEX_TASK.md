# CODEX_TASK.md

## Ticket ID

T0002

## Goal

Verify that local Roller Playground credentials work through the server-side Roller client with a safe read-only smoke test.

## Dependencies

- T0001 completed.
- Local Roller credentials exist in `.env`.
- Do not commit `.env`.

## Allowed Areas

- `CODEX_TASK.md`
- `PROJECT_CONTEXT.md`
- `REPO_CURRENT_STATE.md`
- `FOLLOWUPS.md`
- `TEST_PLAN.md`
- `package.json`
- Existing Roller config/client files
- New small Roller smoke-test script if needed

## Do Not Touch

- UI files
- Assets
- Deliverables
- Payment logic
- Redeem logic
- Edit booking logic
- AWS resources
- Production config
- `.env`

## Requirements

1. Add or update a local-only Roller smoke test command, for example:
   - `npm run roller:smoke`
2. The smoke test must:
   - Read Roller config from environment variables.
   - Reuse the Playground environment guard from T0001.
   - Fail if `ROLLER_ENV` is not `playground`.
   - Fail if `ROLLER_BASE_URL` does not point to Playground.
   - Never print `ROLLER_CLIENT_SECRET`.
   - Make only one safe read-only API request.
3. Use the safest available read endpoint from the current Roller API setup.
   Preferred order:
   - products read/list endpoint
   - bookings search/read endpoint with no write action
   - another harmless read endpoint if better supported
4. If the exact endpoint or auth format is unclear:
   - Do not guess dangerously.
   - Add a clear note in `FOLLOWUPS.md`.
   - Keep the env guard and script structure in place.
   - Make the script fail with a helpful message.
5. Update `REPO_CURRENT_STATE.md` with:
   - T0002 status
   - Smoke test command
   - Validation result
   - Next recommended ticket: `T0003 Booking lookup endpoint`
6. Update `TEST_PLAN.md` with:
   - Roller credential smoke test
   - Expected success case
   - Expected failure when using production URL
   - Expected failure when credentials are missing

## Non-Goals

- Do not implement booking lookup UI.
- Do not create or edit bookings.
- Do not redeem tickets.
- Do not implement payment.
- Do not store Roller responses in a database.
- Do not create AWS infrastructure.

## Acceptance Criteria

- `npm run validate` passes.
- `npm run roller:env:check` passes if available.
- `npm run roller:smoke` runs with local Playground credentials.
- The smoke test confirms whether Roller Playground auth works.
- No secrets are printed or committed.
- No write API calls are made.

## Manual Verification

Create a local `.env` file with:

```env
ROLLER_ENV=playground
ROLLER_BASE_URL=<Playground API base URL>
ROLLER_CLIENT_ID=<local client id>
ROLLER_CLIENT_SECRET=<local client secret>
```

Then run:

```bash
npm run roller:smoke
```

Also verify that a production-looking URL is rejected.

## Automated Validation

Run:

- `npm run validate`
- `npm run roller:env:check`, if available
- `npm run roller:smoke`, if credentials are available locally
