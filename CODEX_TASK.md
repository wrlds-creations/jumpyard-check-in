# CODEX_TASK.md

## Ticket ID
T0036

## Goal
Create a safe Data API backfill/sync foundation that can fill Aurora from Roller booking exports without building the scheduled AWS job yet.

## Dependencies
- T0035 completed and merged.
- Dev Aurora and local Roller Playground credentials are available.
- Existing import scripts for bookingitems, related data, and products exist.

## Allowed areas
- CODEX_TASK.md
- PROJECT_CONTEXT.md
- DECISIONS.md
- REPO_CURRENT_STATE.md
- FOLLOWUPS.md
- TEST_PLAN.md
- BOOKING_INDEX_INGESTION_CONTRACT.md
- JUMPYARD_CLOUD_CONTRACT.md
- infra/package.json
- infra/scripts/import-data-api-backfill.ts
- Existing infra import scripts only if required for orchestration compatibility

## Do not touch
- Phone UI
- Admin UI
- Kiosk UI
- Backend API Lambda behavior
- AWS CDK resources
- AWS deploy configuration
- Roller payment package/drop-in work
- Redeem business logic
- SMS provider integration
- Production credentials
- Live Roller config
- `.env`
- Unrelated assets or deliverables

## Requirements

1. Add a single local Data API backfill command.
   - It must run existing product, bookingitems, tickets, bookingpayments, and customers import paths in a safe order.
   - It must support explicit `--start-date` and `--end-date` arguments.
   - It must split the range into daily modified-date windows.

2. Keep dry-run as the default.
   - The command must not write to Aurora unless `--apply` is provided.
   - Apply mode must require a separate explicit confirmation environment variable.
   - Apply mode must continue using the existing per-import write confirmations internally.

3. Preserve the Data API safety model.
   - Use the existing Playground guard.
   - Never print Roller credentials, access tokens, raw payloads, raw guest names, raw emails, raw phone numbers, or booking notes.
   - Keep normalized Aurora upserts idempotent.

4. Document how this differs from the future scheduled sync.
   - T0036 is a local/manual foundation.
   - T0037 will move the same pattern into a scheduled dev AWS sync.

5. Update source-of-truth docs with:
   - New command names.
   - Validation results.
   - Recommended next ticket: `T0037 Scheduled daily Data API sync`.

## Non-goals
- Do not create or change AWS resources.
- Do not deploy anything.
- Do not add EventBridge schedules.
- Do not send SMS.
- Do not build SMS links or tokens.
- Do not implement payment package/drop-in.
- Do not create or mutate Roller bookings.
- Do not change app UI.

## Acceptance criteria
- A dry-run command can read all scoped Data API sources across at least one daily window.
- The apply command fails closed without the T0036 confirmation env var.
- The orchestrator command runs bookingitems before related data for each window and refreshes products for enrichment.
- `npm --prefix infra run build` passes.
- `npm run validate` passes.
- No app code was changed.

## Manual verification
Run a dry-run for a small Playground modified-date window and confirm the command reports:
- daily window count
- commands run
- sources covered
- `apply=false`

Run apply mode without the confirmation env var and confirm it fails before Aurora writes.

## Automated validation
Run:
- `npm --prefix infra run build`
- `npm --prefix infra run import:data-api-backfill:dev -- 2026-05-20 2026-05-21`
- `npm --prefix infra run import:data-api-backfill:dev:apply -- 2026-05-20 2026-05-21`
- `npm run validate`
- `git diff --check`
