# CODEX_TASK.md

## Ticket ID

T0008

## Goal

Create a protected Roller Playground seed tool for deterministic test bookings.

## Dependencies

- T0007 completed, pushed, and merged to `main`.
- Local Roller Playground credentials exist in `.env`.
- Do not commit `.env`.
- Roller write calls are allowed only against Playground through the guarded seed tool.

## Current Status

Completed.

Seed apply result:

- Created Playground booking references `5032210`, `5032211`, `5032212`, `5032213`, `5032214`, and `5032215`.
- Read-only readback confirmed HTTP 200 for all six references.
- Booking `5032210` is `Paid` with amount owing `0`.
- The remaining seed bookings are `PendingPayment`.

## Allowed Areas

- `CODEX_TASK.md`
- `PROJECT_CONTEXT.md`
- `DECISIONS.md`
- `REPO_CURRENT_STATE.md`
- `FOLLOWUPS.md`
- `TEST_PLAN.md`
- `.env.example`
- `package.json`
- Existing Roller helper/client scripts under `scripts/`
- New Roller seed-tool script under `scripts/`

## Do Not Touch

- App source code
- UI files
- Assets
- Deliverables
- Payment implementation
- Redeem implementation
- AWS resources
- Production config
- Production credentials
- `.env`

## Requirements

1. Add a local seed command, for example:
   - `npm run roller:seed:playground`
   - optional guarded apply helper: `npm run roller:seed:playground:apply`
2. The seed tool must:
   - Load local Roller config from environment variables.
   - Reuse the T0001/T0002 Playground guard.
   - Fail if `ROLLER_ENV` is not `playground`.
   - Fail if `ROLLER_BASE_URL` does not point to Playground.
   - Fail closed if the URL looks production/live.
   - Never print `ROLLER_CLIENT_SECRET`, access tokens, or payment JWTs.
3. The tool must read Roller products first and map configured scenario products to Roller child/variation product IDs, because Roller create booking payloads require variation IDs.
4. The tool must create deterministic fake booking payloads for known scenarios:
   - paid-ready lookup
   - pending-payment lookup
   - wrong-date lookup
   - SkyRider/add-on lookup
   - original booking for linked add-on flow
   - separate linked add-on booking
5. The tool must be safe by default:
   - dry-run by default
   - no Roller booking writes unless `--apply` is passed
   - `--apply` must also require `ROLLER_SEED_ALLOW_WRITE=I_UNDERSTAND_THIS_WRITES_PLAYGROUND_BOOKINGS`
6. The default write endpoint may be `POST /bookings` for real Playground lookup bookings.
   - `POST /bookings/draft` may be supported for draft-only checks.
   - Live/production endpoints must remain blocked.
7. If Roller rejects generated bookings because a capacity reservation or additional endpoint is required:
   - Do not guess dangerously.
   - Keep the guarded script structure.
   - Add a clear note in `FOLLOWUPS.md`.
8. Update source-of-truth docs with:
   - seed command
   - selected safety rules
   - validation results
   - recommended next ticket: `T0009 Booking lookup endpoint`

## Non-Goals

- Do not modify the phone, kiosk, or admin UI.
- Do not create a public demo button.
- Do not write to Roller Live/production.
- Do not implement payment processing.
- Do not implement redemption/check-in.
- Do not implement booking lookup API behavior.
- Do not create or change AWS resources.
- Do not store seed results in Aurora yet.

## Acceptance Criteria

- `npm run roller:seed:playground` performs a safe dry-run and prints the planned scenarios.
- Dry-run resolves known Playground products to child/variation IDs.
- Production/live-looking Roller URL is rejected before auth/write.
- `--apply` is blocked unless the explicit write confirmation env var is set.
- No secrets, access tokens, payment JWTs, or raw sensitive payloads are printed.
- `npm run validate` passes.
- No app code, UI files, assets, deliverables, AWS resources, or `.env` are changed.

## Manual Verification

Run:

- `npm run roller:seed:playground`
- `npm run roller:seed:playground:apply` without `ROLLER_SEED_ALLOW_WRITE`
- a production/live-looking URL rejection check
- optionally, `ROLLER_SEED_ALLOW_WRITE=I_UNDERSTAND_THIS_WRITES_PLAYGROUND_BOOKINGS npm run roller:seed:playground:apply`

Confirm any written bookings exist only in Roller Playground.

## Automated Validation

Run:

- `npm run validate`
- `npm run roller:seed:playground`
