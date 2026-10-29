# Issue #598: the nightly 30-day lifecycle on Park

Issue [#598](https://github.com/wrlds-creations/jumpyard-check-in/issues/598), decisions D0289 and D0291 (the catch-up). It follows T0195 (#194), whose policy is unchanged: [policy](t0195-data-lifecycle-policy.md), [recovery](t0195-aurora-recovery-rehearsal.md).

## What happened

`PROJECT_CONTEXT.md` promises that booking and contact state is removed or anonymized 30 days after the visit. On Park nothing had ever been removed.

The read-only check on 2026-10-26 at 14:29 UTC used the dedicated lifecycle identity inside a READ ONLY transaction that was rolled back, and read counts only:

- `jumpyard.data_lifecycle_runs` was empty. The only live run had been the 2026-07-14 dry-run, before the booking import.
- 21,673 of 29,754 cached bookings were past their 30-day clock, the oldest from 2026-06-14.
- 3,984 guest profiles holding an email address or phone number were older than 30 days.

Ingestion already respects the window: the daily sync and the webhook skip bookings older than 30 days. Old rows therefore only piled up.

**Three causes.**

1. **No job existed.** T0195 shipped a manual operator CLI and left scheduling to an external-write checkpoint that never happened. Park had three EventBridge rules (daily sync, webhook recovery and the disabled SMS schedule) and no lifecycle Lambda.
2. **An apply would have failed.** Twelve of the 30 apply statements pick their candidates with `FOR UPDATE SKIP LOCKED`. PostgreSQL requires UPDATE privilege on at least one column of a row-locked table, and `jumpyard_lifecycle_runtime` had DELETE but not UPDATE on eleven tables:
   - `product_catalog_cache`, `checkin_tokens`, `idempotency_records`, `staff_pin_auth_limits`;
   - `guest_profiles`, `handoff_sessions`;
   - `roller_booking_tickets`, `roller_booking_payments`, `checkin_sessions`, `roller_booking_items`, `roller_bookings`.

   On Park, `EXPLAIN` (nothing executed, READ ONLY transaction) returned `permission denied` (42501) for each of those twelve statements. The first action is already one of them, so every apply would have rolled back completely. The least-privilege validator checked the grant text only, and no test ran an apply as the real role.
3. **The manual tool could not keep up.** One run changes at most 500 rows per action and 5,000 in total, and each run needs a freshly reviewed digest, three environment locks and a receipt file. The backlog was about 185,200 row changes, roughly 100 runs. Over 60 days, Park averaged 640 tickets and 704 audit events a day, and the busiest days had 2,254 tickets and 3,778 events, so even one run a day falls behind.

## What the catch-up changes (counts on 2026-10-26)

| Action | Rows |
| --- | ---: |
| Delete bookings past 30 days | 21,101 |
| Delete their tickets / items / payments | 46,015 / 30,532 / 21,576 |
| Delete their check-in sessions (staff hand-out rows follow by cascade) | 139 (+29) |
| Older bookings kept as protected (a ticket valid later, a later visit or item date) | 572 |
| Delete guest profiles with email/phone (164 older ones are kept for protected bookings or recent drafts) | 3,820 |
| Remove contact fields from drafts / delete drafts at 90 days | 159 / 29 |
| Delete expired idempotency rows, guest tokens, staff sessions, catalog rows, PIN limiters | 3,080 / 1,519 / 214 / 112 / 5 |
| Pseudonymize audit rows at 30 days: event log, webhook events, attempts, booking links, seed runs, email deliveries | 30,728 / 14,677 / 42 / 23 / 19 / 3 |
| Delete audit rows at 90 days: event log, webhook events, seed runs, attempts, booking links | 7,658 / 3,657 / 74 / 14 / 4 |
| **Total row changes** | **about 185,200** |

Only Park's own Aurora database changes. ROLLER keeps every booking and customer, and the job makes no call to ROLLER, Klaviyo or any other provider.

## Change (D0289)

1. **Row-lock grants (migration `0028`).** The lifecycle role receives UPDATE on one column of each of the eleven tables. That is enough for the row lock. The lifecycle SQL never updates those columns: each is either overwritten by its own writer (`updated_at`, `product_hash`) or read by no runtime decision (`checkin_tokens.created_at`). No other role changes.
2. **One policy for the CLI and the job.**
   - The reviewed T0195 statements and the bounded apply transaction moved from `infra/scripts/data-lifecycle.ts` to `infra/lambda/data-lifecycle/policy.js` and `engine.js`, without changing a SQL character.
   - The policy definition digest is still `fd84eadd4c3731e6f87881ad996b08a84c587f3cd719c45fbbc4b6fad5063c01` (`t0195-v1`).
   - The operator CLI imports both modules, and its arguments, gates, receipts and self-test are unchanged.
3. **The nightly Lambda** `jumpyard-check-in-park-test-stack-data-lifecycle`.
   - **Start.** The EventBridge rule `jumpyard-check-in-park-test-data-lifecycle-nightly` runs it at 23:30 UTC. That is 00:30 in Stockholm in winter and 01:30 in summer, after closing and before the 02:00 UTC daily sync.
   - **Concurrency and retries.** Reserved concurrency 1. Neither EventBridge nor Lambda retries a failed night.
   - **Permissions.** It reads only `/jumpyard-check-in-park-test/aurora/lifecycle` and may run the four Data API calls on the Park cluster. It has no ROLLER, Klaviyo, queue, bucket, staff or administrator access.
   - **Passes.** Each invocation repeats count, plan and apply until nothing is eligible. It stops after 20 passes, after a 12-minute budget, or when a pass changes nothing.
     - A pass is one unchanged T0195 apply: advisory lock, `NOWAIT` table locks, recount under the lock, digest match, `SERIALIZABLE` and all-or-nothing rollback. Each pass also writes a completed `data_lifecycle_runs` row.
     - The per-action batch shrinks from 500 until a pass plans at most 5,000 rows.
     - Passes are 15 s apart, so webhook writes get through.
   - **Retries.** A busy table, another apply, a moved count, a serialization failure or a deadlock rolls the pass back. The pass is retried up to five times a night. Any other failure stops the night.
   - **Modes** from the reviewed Park config:
     - `off`: the rule is disabled.
     - `plan`: counts and logs only.
     - `apply`: deletes and anonymizes.
   - **Approved digest.** The job refuses to run if the code's policy definition digest differs from the one approved in config.
   - **Ceiling.** An apply night stops before any change when the eligible total is above the approved ceiling: 25,000 normally. A configured catch-up may raise it until a set last day (Stockholm time). In plan mode a total above the ceiling is only logged.
   - **Logs and metrics.** Both hold counts only, never row values. The logs record the night, each pass with its run id and per-action counts, retries with their class and SQLSTATE, and stops.
     - The metrics `DataLifecycleNightCompleted`, `DataLifecycleBehind`, `DataLifecycleRowsChanged` and `DataLifecycleEligibleRemaining` (namespace `JumpYard/Cloud`, `Handler=data-lifecycle`) are sent with every night that is not off.
   - **Alarms.** Both reach the alarm recipients:
     - `…-data-lifecycle-lambda-errors`: a stopped night.
     - `…-data-lifecycle-behind`: rows still past their clock after a night outside the catch-up.

     Neither alarms on missing data. A missing-data alarm would fire at its first evaluation after the deploy and fail Park's zero-alarm verification, so a night that never starts shows up instead in the morning readback and in `data_lifecycle_runs`. Throttles are expected with one-at-a-time concurrency and stay dashboard-only.
4. **Config.** `dataLifecycle` in `infra/config/park-test-full-flow-rehearsal.json` (the deployed Park profile) holds the mode, the approved digest and the 25,000 ceiling. It started in `plan`; checkpoint 3 sets `apply` with a one-time catch-up (below). Only `park-test` may define it. A `catchUp` block (`maxEligibleTotal`, `until`) needs `apply` and a ceiling above the normal one.

This revises the dry-run-first rule of D0162: for the nightly job, the approved standing policy and its guards replace a human review of every plan digest. The operator CLI keeps that rule.

## The catch-up (checkpoint 3, D0291)

Love approved checkpoint 3 on 2026-10-28 and its last day, 2026-11-06, on 2026-10-29. The deployed Park profile now reads:

```json
"dataLifecycle": {
  "mode": "apply",
  "approvedPolicyDefinitionDigest": "fd84eadd4c3731e6f87881ad996b08a84c587f3cd719c45fbbc4b6fad5063c01",
  "maxEligibleTotal": 25000,
  "catchUp": { "maxEligibleTotal": 200000, "until": "2026-11-06" }
}
```

- **Only the environment changes.** The protected deploy changes three variables of the lifecycle Lambda: `DATA_LIFECYCLE_MODE` from `plan` to `apply`, `DATA_LIFECYCLE_CATCH_UP_MAX_ELIGIBLE_TOTAL` to `200000` and `DATA_LIFECYCLE_CATCH_UP_UNTIL` to `2026-11-06`, both empty before. The code, the policy SQL and its digest, the rule, the permissions and the alarms stay as they are, and Park keeps 228 resources.
- **The nights.** The deploy runs on 2026-10-29 after closing, so the first apply night starts at 00:30 CET on 2026-10-30. `until` is inclusive in Stockholm time, so the 200,000 ceiling covers the eight nights from 2026-10-30 to 2026-11-06. From the night of 2026-11-07 the ceiling is 25,000 again, without a deploy.
- **The size.** The first plan night (2026-10-28) counted 146,893 eligible rows. An item becomes eligible only once its tickets are gone, and a booking once its items are gone. The catch-up is therefore about 193,000 row changes, plus the daily inflow. The first apply count is about 150,000, under the 200,000 ceiling.
- **The pace.** A pass changes at most 5,000 rows and at most 500 per action, so the roughly 50,000 tickets alone take about 100 passes.
  - At 20 passes a night, the backlog should be gone during the sixth night (2026-11-04).
  - If the 12-minute budget fits fewer passes, it takes a night or two longer. Even at 13 passes a night, what is left on 2026-11-07 stays well under 25,000, so the normal nights finish it.
  - This is an estimate: the night loop run with the first night's counts and the 60-day average inflow.
- **During the catch-up** a night may end with rows left (`max_runs` or `budget`). That is expected, and the `-behind` alarm stays quiet. The `-lambda-errors` alarm still reports a stopped night.
- **Afterwards.** If more than 25,000 rows are still eligible on 2026-11-07, that night stops before any change and alarms. A longer catch-up then needs Love's ok, a config change and a deploy. The spent `catchUp` block may stay in the config; removing it is a later cleanup.
- **Restore points.** The checkpoint-2 snapshot `jy-park-test-prechange-20261028t191348z-ihjx86` and the seven-day automated backups (PITR), which also cover the day between the snapshot and the first apply night.
- **Readback.** Every catch-up morning, as listed in [TEST_PLAN.md](../TEST_PLAN.md#the-nightly-lifecycle-catch-up-598).

## External-write checkpoints

Each step needs Love's explicit ok in chat, and each readback must pass before the next step.

1. **Plan mode.** Release, then a protected Park deploy with `apply_migrations=true` for `0028`. Done on 2026-10-27: release 40483249815, Park run 40484298434.
   - Readback: migration `0028` is applied, the rule is enabled, and the Lambda has only the lifecycle secret.
   - The first night's plan log matches the counts above plus one day's inflow, and no row has changed. On 2026-10-28 it counted 146,893 eligible rows and changed none.
   - Alarms and queues are normal.
2. **Pre-change snapshot.** Taken with the existing recovery tool (`T0195_AURORA_SNAPSHOT_APPROVAL`) right before step 3. Done on 2026-10-28: `jy-park-test-prechange-20261028t191348z-ihjx86`, available at 20:18 CET.
3. **Catch-up.** A config change to `apply` with a one-time `catchUp` (200,000 through 2026-11-06, see above), then a protected deploy.
   - Expect about six nights at 20 passes a night.
   - Each morning, read back the completed runs, the remaining counts, alarms and the webhook queue, and check a staff board, a phone lookup and a kiosk lookup ([TEST_PLAN.md](../TEST_PLAN.md#the-nightly-lifecycle-catch-up-598)).
4. **Steady state.** The ceiling falls back to 25,000 after the catch-up's last day without a deploy. Read back one week of nights.
5. **Recovery proof.** The isolated restore rehearsal from the step-2 snapshot: restore, verify, reapply the lifecycle on the restore with a receipt, then clean up. Each tool action takes its own approval phrase.
6. **Snapshot decision.** Keep or delete `jy-park-test-prechange-20260714t154842z-ghunbv` and the step-2 snapshot. Each deletion takes its own approval phrase.

## Stopping, reading and recovering

- **Stop.** Deploy the Park config with `"mode": "off"`, which disables the rule; the next night does nothing. In an emergency, disable the rule `jumpyard-check-in-park-test-data-lifecycle-nightly` (a manual AWS write that Park's drift check then reports) and codify it with the next deploy.
- **Read a night.** The Lambda log group `/aws/lambda/jumpyard-check-in-park-test-stack-data-lifecycle` (30 days) has one JSON line per pass and a `night_done` or `night_failed` summary. `jumpyard.data_lifecycle_runs` keeps each completed pass for 90 days.
- **Recover.** A committed pass cannot be undone by the job. Deleted rows stay in the seven-day automated backups (PITR) and in any manual snapshot until it is deleted. Restore only into the isolated rehearsal path, and reapply the lifecycle there before any traffic (D0165).
- **Reports.** After the catch-up, visits older than 30 days can no longer be re-queried. Gustav's weekend page (#591) keeps every number already added. An export that needs older days must run before the first apply night (2026-10-30), or add new days to an earlier export instead of rebuilding it.

## Validation

- `npm run validate:gh598-lifecycle-nightly` (part of `npm run validate`) drives the night loop with a fake engine. It covers:
  - settings refuse any environment but `park-test`, a runtime or administrator secret, a changed policy digest and an incomplete catch-up;
  - the catch-up ceiling lasts through its last Stockholm day;
  - every pass stays within 500 per action and 5,000 in total;
  - plan mode never applies;
  - apply works through a backlog until nothing is eligible;
  - a count above the ceiling changes nothing;
  - a busy database is retried, and any other failure stops with a message that carries no row value;
  - a night out of time or progress recounts what is left.
- With `GH598_DATABASE_TEST=true` (CI's "Staff handout database" job, in its own fresh database with every migration) the same file checks PostgreSQL as `jumpyard_lifecycle_runtime`:
  - every apply statement passes `EXPLAIN`;
  - plan mode and a ceiling stop change nothing;
  - apply removes an old booking with its items, tickets, payment, session and hand-out claim;
  - it keeps a booking whose ticket is valid later, today's booking and the guest profile a protected ticket uses;
  - it anonymizes a 40-day draft and pseudonymizes a 40-day audit row;
  - it deletes 90-day rows and expired idempotency rows and tokens;
  - it records one completed run per pass, and a second night finds nothing.
  - Against migrations without `0028` the test fails with Park's `permission denied for table product_catalog_cache`.
- `npm --prefix infra run validate:t0195-least-privilege` derives every row-locked table from the policy itself and requires UPDATE on at least one of its columns. Without `0028` it fails on `product_catalog_cache`.
- `npm run validate:t0195-data-lifecycle`, `npm --prefix infra run validate:park-test-synth` and `npm --prefix infra run validate:config-guards`.
  - The synth check has the job only in the deployed Park profile, in apply mode with the reviewed catch-up (200,000 through 2026-11-06). Its permissions are exactly the four Data API calls on the cluster plus reading the lifecycle secret, the rule runs at `cron(30 23 * * ? *)` without retries, and both alarms reach the recipients without alarming on missing data.
  - The config guards require the deployed profile's `dataLifecycle` block to be exactly the reviewed one above, and still refuse a lifecycle outside `park-test`, an unclear mode, a malformed digest, a catch-up in plan mode, a catch-up ceiling at or below the normal one and a catch-up without a valid last day.
