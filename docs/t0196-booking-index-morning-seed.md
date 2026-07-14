# T0196 Park-Test Booking Index And Morning Seed

T0196 implements GitHub issue [#197](https://github.com/wrlds-creations/jumpyard-check-in/issues/197). Roller remains authoritative. Aurora is a bounded operational cache for fast arrival lookup, recovery, and audit.

## Live Boundary

- Environment: AWS `park-test`, Roller `live`, JumpYard Nacka venue `50871` only.
- Live activation requires the exact deployment approval `T0196_LIVE_BOOKING_INDEX_APPROVED`.
- The normal `infra/config/park-test.json` keeps the schedule disabled. The approved full-flow configuration enables it.
- The Lambda has reserved concurrency `1` and spaces Roller requests by at least one second.
- Provider `429` and transient `5xx` responses use bounded retries and `Retry-After`; truncation, invalid windows, or unexpected Live configuration fail closed.
- The job calls only Roller auth and read-only Data API endpoints. It cannot create bookings, charge payments, redeem tickets, manage webhooks, or send guest messages.

## Window And Retention Policy

Roller Data API dates are modified-date windows, not visit dates. A future December visit can have been created in July, so the initial discovery window must look backward even though old visits should not be retained.

- Initial discovery window: `2025-07-14` through `2026-07-15`, split into 53 reviewed seven-day operator windows and internally into provider-required one-day requests.
- Daily schedule: EventBridge `cron(0 2 * * ? *)` with a one-day overlap from the latest successful run.
- Provider limit: each Live Data API request covers exactly one modified-date day.
- Aurora visit retention: booking date from 30 days before the run through today, plus every future booking date. Future visits are never aged out before they occur.
- Related tickets, payments, and customers are retained only when linked to the approved booking set. Raw Roller responses and free-text names/notes are not stored.
- Refunds/credits keep their signed payment amount. Negative values are not rejected or changed to positive values.

## Sources And Writes

The handler reads `/data/bookingitems`, `/data/tickets`, `/data/bookingpayments`, and `/data/customers`. It normalizes and transactionally upserts `roller_bookings`, `roller_booking_items`, `roller_booking_tickets`, `roller_booking_payments`, `guest_profiles`, and `booking_seed_runs`.

Migrations `0013` and `0014` are part of the T0196 contract:

- `0013` grants the data-sync principal only the target columns PostgreSQL needs for idempotent conflict detection. Related-data tables do not receive table-wide `SELECT`.
- The handler binds update values directly instead of using `EXCLUDED.*`, avoiding broader read privilege for payment/contact rows.
- `0014` removes the old nonnegative payment constraint because Roller represents refunds/credits with negative amounts.

## Operator Workflow

Plan mode performs no AWS or Roller call:

```powershell
cd infra
node node_modules/ts-node/dist/bin.js --prefer-ts-exts scripts/roller-live-booking-index.ts `
  --config ./config/park-test-full-flow-rehearsal.json `
  --profile wrlds-dev `
  --start-date 2025-07-14 `
  --end-date 2026-07-15 `
  --chunk-days 7 --json
```

Apply additionally requires:

```powershell
$env:T0196_BACKFILL_APPROVAL='I_APPROVE_T0196_PARK_TEST_AURORA_BACKFILL'
```

If the local network fails during a synchronous Lambda invocation, stop. Do not blindly retry an ambiguous response. Read the latest successful `booking_seed_runs`/CloudWatch receipt and resume from its `date_range_end`; upserts are idempotent, but avoiding duplicate provider reads is preferred.

Rollback disables the EventBridge rule by deploying `infra/config/park-test.json`. It does not delete Aurora rows. Any data removal remains governed by the separately approved T0195 lifecycle operation.

## 2026-07-14 Rollout Evidence

- Read-only Live preflight confirmed the provider enforces one-day requests. Safe totals for `2026-07-13` through `2026-07-14` were 217 booking items, 154 tickets, 145 payments, and 16 customers.
- CloudFormation reached `UPDATE_COMPLETE` with 171 resources. The only new resource was `jumpyard-check-in-park-test-booking-index-stale`; the existing data-sync Lambda/rule were updated in place.
- The rule is enabled at `02:00 UTC`; data-sync is `Active`/`Successful` with reserved concurrency `1`; the freshness alarm is `OK`.
- All 53 unique backfill windows completed through `2026-07-15`. Network response loss caused safe idempotent duplicate receipts, which motivated fail-closed operator resume behavior.
- Aggregate Aurora verification found 6,174 bookings, 8,921 items, 6,662 tickets, 6,127 payments, and 983 guest profiles; all bookings are Live venue `50871`.
- Retention verification found zero bookings older than 30 days, 92 bookings today, 120 future bookings, minimum visit date `2026-06-14`, and maximum visit date `2026-12-30`.
- 108 signed refund/credit payments were retained. Three failed seed attempts document the discovered privilege/constraint defects; subsequent exact-window retries succeeded after forward-only migrations.
- Scheduled-event smoke completed one-day provider windows idempotently. Webhook processing and JumpYard-owned guest sends remained disabled, and no Roller write endpoint was called.
- Post-rollout CDK diff reported no differences and CloudFormation drift was `IN_SYNC` with zero drifted resources.

## Monitoring

- Freshness alarm: `jumpyard-check-in-park-test-booking-index-stale`.
- Existing Lambda error/throttle and Roller API alarms remain active.
- A missing success metric for five consecutive six-hour periods triggers freshness alarm evaluation.
- Structured logs contain correlation/run ids, source windows, counts, duration, and safe errors only; they must not contain raw records, tokens, secrets, or PII.
