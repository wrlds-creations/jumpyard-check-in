# CODEX_TASK.md

## Ticket ID

T0011

## Goal

Verify Roller Data API access and lock the booking-index sync strategy before building Aurora ingestion.

## Dependencies

- T0010 completed, pushed, and merged to `main`.
- Local Roller Playground credentials exist in `.env`.
- Do not commit `.env`.
- User supplied Roller Data API docs for overview, environments, rate limits, and `GET /data/bookingitems`.

## Current Status

Completed locally on branch `codex/t0011-data-api-smoke`.

Validation result:

- `node --check scripts/roller-data-api-smoke.js`: passed
- `npm run roller:data:smoke`: passed
- `npm run roller:data:smoke -- --start-date 2026-05-20 --end-date 2026-05-21`: passed
- Production URL rejection with `ROLLER_BASE_URL=https://api.roller.app`: passed

Data API smoke result:

- Endpoint: `GET /data/bookingitems`
- Modified-date window: `2026-05-20 -> 2026-05-21`
- Response shape: `currentPage`, `totalPages`, `totalItems`, `itemsPerPage`, `items`
- Records returned: `9`
- Seed booking references found: `5032210`, `5032211`, `5032212`, `5032213`, `5032214`, `5032215`
- Booking dates returned: `2026-05-21`, `2026-05-22`
- No secrets, access tokens, customer names, emails, or phone numbers printed

## Allowed Areas

- `CODEX_TASK.md`
- `PROJECT_CONTEXT.md`
- `DECISIONS.md`
- `REPO_CURRENT_STATE.md`
- `FOLLOWUPS.md`
- `TEST_PLAN.md`
- `BOOKING_INDEX_INGESTION_CONTRACT.md`
- `.env.example`
- `package.json`
- `scripts/roller-data-api-smoke.js`
- Existing Roller helper scripts only if needed for reuse

## Do Not Touch

- Phone UI
- Kiosk UI
- Admin UI
- Assets
- Deliverables
- Payment implementation
- Redeem implementation
- Booking creation implementation
- AWS infrastructure
- Production config
- Production credentials
- `.env`

## Requirements

1. Add a local-only Roller Data API smoke command:
   - `npm run roller:data:smoke`
2. The smoke test must:
   - Read Roller config from environment variables/local `.env`.
   - Reuse the Playground environment guard from earlier tickets.
   - Fail if `ROLLER_ENV` is not `playground`.
   - Fail if `ROLLER_BASE_URL` does not point to Playground.
   - Never print `ROLLER_CLIENT_SECRET`, access tokens, customer names, emails, or phone numbers.
   - Request `GET /data/bookingitems` with `startDate`, `endDate`, `pageNumber`, and `pageSize`.
   - Print only safe response shape, counts, date ranges, and known seed booking-reference matches.
3. Confirm whether the current Playground credentials can access the Data API.
4. Lock the booking-index sync strategy:
   - Initial backfill into Aurora.
   - Daily modified-date incremental sync.
   - Same-day webhook updates.
   - REST live refresh before check-in-critical decisions.
5. Update source-of-truth docs with:
   - Data API access result.
   - Data API modified-date behavior.
   - Validation commands.
   - Recommended next ticket.

## Non-Goals

- Do not write Data API data to Aurora yet.
- Do not create or change AWS resources.
- Do not implement cron/EventBridge scheduling.
- Do not implement webhook intake.
- Do not change the phone app.
- Do not call Roller Live/production.
- Do not make Roller write calls.
- Do not commit secrets.

## Acceptance Criteria

- `npm run roller:data:smoke` exists.
- Data API smoke is Playground-only and safe by default.
- The command confirms either:
  - Data API access works for current Playground credentials, or
  - Data API access is unavailable and the required follow-up is documented.
- Sync strategy is documented as backfill + daily modified-date sync + webhooks + REST live refresh.
- `npm run validate` passes.
- No app, asset, deliverable, AWS resource, production config, or `.env` files are changed.

## Manual Verification

Run:

```powershell
npm run roller:data:smoke
```

Optional explicit window for T0008 seed bookings:

```powershell
npm run roller:data:smoke -- --start-date 2026-05-20 --end-date 2026-05-21
```

Confirm no secrets, access tokens, customer names, emails, or phone numbers are printed.

## Automated Validation

Run:

- `node --check scripts/roller-data-api-smoke.js`
- `npm run roller:data:smoke`
- `npm run validate`
