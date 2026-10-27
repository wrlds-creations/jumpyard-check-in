'use strict';

// GH-598: the nightly Park lifecycle job. Unit tests drive the night loop with a fake engine; the
// PostgreSQL tests run the real T0195 statements as jumpyard_lifecycle_runtime against a fresh,
// disposable database. On 2026-10-26 Park refused 12 of the 30 apply statements with "permission
// denied", because FOR UPDATE needs UPDATE privilege. Synthetic data only; no AWS call is possible.
const assert = require('node:assert/strict');
const test = require('node:test');

const policy = require('../infra/lambda/data-lifecycle/policy');
const engine = require('../infra/lambda/data-lifecycle/engine');
const nightly = require('../infra/lambda/data-lifecycle/nightly');
const { nightMetricValues } = require('../infra/lambda/data-lifecycle/index');

const DIGEST = 'fd84eadd4c3731e6f87881ad996b08a84c587f3cd719c45fbbc4b6fad5063c01';
const CLUSTER_ARN = 'arn:aws:rds:eu-north-1:376129878018:cluster:jumpyard-check-in-park-test-aurora';
const SECRET_ARN = 'arn:aws:secretsmanager:eu-north-1:376129878018:secret:/jumpyard-check-in-park-test/aurora/lifecycle-Ab12Cd';
const ENV = Object.freeze({
  DATABASE_CLUSTER_ARN: CLUSTER_ARN,
  DATABASE_SECRET_ARN: SECRET_ARN,
  DATA_LIFECYCLE_APPROVED_POLICY_DIGEST: DIGEST,
  DATA_LIFECYCLE_BATCH_SIZE: '500',
  DATA_LIFECYCLE_BUDGET_SECONDS: '720',
  DATA_LIFECYCLE_CATCH_UP_MAX_ELIGIBLE_TOTAL: '',
  DATA_LIFECYCLE_CATCH_UP_UNTIL: '',
  DATA_LIFECYCLE_ENVIRONMENT: 'park-test',
  DATA_LIFECYCLE_MAX_ELIGIBLE_TOTAL: '25000',
  DATA_LIFECYCLE_MAX_MUTATIONS: '5000',
  DATA_LIFECYCLE_MAX_RUNS: '20',
  DATA_LIFECYCLE_MODE: 'apply',
  DATA_LIFECYCLE_PAUSE_SECONDS: '15',
});
const settingsFor = (overrides = {}) => nightly.readSettings({ ...ENV, ...overrides });
const lifecycleContext = (rds) => ({
  clusterArn: CLUSTER_ARN,
  clusterIdentifier: 'jumpyard-check-in-park-test-aurora',
  database: policy.DATABASE,
  environment: 'park-test',
  rds,
  secretArn: SECRET_ARN,
});
const countsOf = (values) => new Map(policy.ACTION_SPECS.map(({ name }) => [name, values[name] ?? 0]));

// A fake engine: each pass removes up to the planned rows of every action.
function fakeEngine(initial, { failures = [] } = {}) {
  const remaining = new Map(countsOf(initial));
  const calls = { applies: 0, counts: 0, plans: [] };
  return {
    calls,
    remaining,
    async loadEligibleCounts() {
      calls.counts += 1;
      return new Map(remaining);
    },
    async applyPlan(_context, plan) {
      calls.applies += 1;
      calls.plans.push(plan);
      const failure = failures.shift();
      if (failure) throw failure;
      const actions = plan.actions.map((action) => {
        const affected = Math.min(remaining.get(action.action), action.planned);
        remaining.set(action.action, remaining.get(action.action) - affected);
        return { ...action, affected };
      });
      const affectedTotal = actions.reduce((total, action) => total + action.affected, 0);
      return { actions, affectedCountsDigest: 'x'.repeat(64), affectedTotal, completedAt: plan.referenceAt, runId: `jylc_${calls.applies}` };
    },
  };
}

function night(settings, fake, { now = () => new Date('2026-10-28T23:30:00Z'), timeLeftMs = () => 800_000 } = {}) {
  const logs = [];
  const run = nightly.runNight({
    settings: { ...settings, pauseMs: 0 },
    context: lifecycleContext(null),
    engine: fake,
    log: (entry) => logs.push(entry),
    now,
    sleep: async () => {},
    timeLeftMs,
  });
  return { logs, run };
}

test('The reviewed T0195 policy is unchanged and is the approved definition', () => {
  assert.equal(policy.policyDefinitionDigest(), DIGEST);
  assert.equal(policy.ACTION_SPECS.length, 30);
  assert.equal(policy.POLICY_VERSION, 't0195-v1');
});

test('Settings accept only the approved Park job with the dedicated lifecycle secret', () => {
  const settings = settingsFor();
  assert.equal(settings.mode, 'apply');
  assert.equal(settings.clusterIdentifier, 'jumpyard-check-in-park-test-aurora');
  assert.equal(settings.batchSize, 500);
  assert.equal(settings.budgetMs, 720_000);
  assert.throws(() => settingsFor({ DATA_LIFECYCLE_MODE: 'on' }), /off, plan or apply/);
  assert.throws(() => settingsFor({ DATA_LIFECYCLE_ENVIRONMENT: 'production' }), /park-test only/);
  for (const secret of ['aurora/admin', 'aurora/runtime/session']) {
    assert.throws(
      () => settingsFor({ DATABASE_SECRET_ARN: SECRET_ARN.replace('aurora/lifecycle', secret) }),
      /dedicated lifecycle secret/,
    );
  }
  assert.throws(() => settingsFor({ DATA_LIFECYCLE_APPROVED_POLICY_DIGEST: 'a'.repeat(64) }), /not the approved policy/);
  assert.throws(() => settingsFor({ DATA_LIFECYCLE_BATCH_SIZE: '501' }), /between 1 and 500/);
  assert.throws(() => settingsFor({ DATA_LIFECYCLE_MAX_MUTATIONS: '5001' }), /between 1 and 5000/);
  assert.throws(() => settingsFor({ DATA_LIFECYCLE_CATCH_UP_UNTIL: '2026-11-10' }), /both its ceiling and its last day/);
});

test('The catch-up ceiling lasts through its last Stockholm day', () => {
  const settings = settingsFor({
    DATA_LIFECYCLE_CATCH_UP_MAX_ELIGIBLE_TOTAL: '200000',
    DATA_LIFECYCLE_CATCH_UP_UNTIL: '2026-11-10',
  });
  // 22:59 UTC on 10 November is 23:59 in Stockholm; 23:30 UTC is already 11 November.
  assert.deepEqual(nightly.ceilingFor(settings, new Date('2026-11-10T22:59:00Z')), { catchUp: true, ceiling: 200_000 });
  assert.deepEqual(nightly.ceilingFor(settings, new Date('2026-11-10T23:30:00Z')), { catchUp: false, ceiling: 25_000 });
  assert.deepEqual(nightly.ceilingFor(settingsFor(), new Date('2026-11-01T00:00:00Z')), { catchUp: false, ceiling: 25_000 });
});

test('A pass fits its batch under the 5,000-row guard', () => {
  const counts = countsOf({
    roller_booking_ticket_delete_30d: 46_015,
    event_log_anonymize_30d: 30_728,
    roller_booking_payment_delete_30d: 21_576,
    webhook_event_anonymize_30d: 14_677,
    event_log_delete_90d: 7658,
    roller_booking_item_delete_30d: 5537,
    guest_profile_delete_30d: 3820,
    webhook_event_delete_90d: 3657,
    idempotency_delete_24h: 3080,
    checkin_token_delete_24h: 1519,
    staff_session_delete_24h: 214,
  });
  const batch = nightly.fitBatchSize(counts, 500, 5000);
  const planned = (size) => [...counts.values()].reduce((total, eligible) => total + Math.min(eligible, size), 0);
  assert.ok(planned(batch) <= 5000);
  assert.ok(planned(batch + 1) > 5000);
  assert.equal(nightly.fitBatchSize(countsOf({ idempotency_delete_24h: 40 }), 500, 5000), 500);
});

test('Plan mode only counts, even above the ceiling', async () => {
  const fake = fakeEngine({ roller_booking_ticket_delete_30d: 46_015, guest_profile_delete_30d: 3820 });
  const { logs, run } = night(settingsFor({ DATA_LIFECYCLE_MODE: 'plan' }), fake);
  const summary = await run;
  assert.equal(summary.stoppedBy, 'plan');
  assert.equal(fake.calls.applies, 0);
  assert.equal(summary.rowsChanged, 0);
  const plan = logs.find((entry) => entry.event === 'plan');
  assert.equal(plan.aboveCeiling, true);
  assert.equal(plan.eligibleTotal, 49_835);
  assert.equal(plan.policyDefinitionDigest, DIGEST);
});

test('Apply mode works through the backlog in bounded passes until nothing is eligible', async () => {
  const fake = fakeEngine({ roller_booking_ticket_delete_30d: 1200, event_log_anonymize_30d: 900, idempotency_delete_24h: 30 });
  const { logs, run } = night(settingsFor(), fake);
  const summary = await run;
  assert.equal(summary.stoppedBy, 'done');
  assert.equal(summary.runs, 3);
  assert.equal(summary.rowsChanged, 2130);
  assert.equal(summary.eligibleRemaining, 0);
  assert.ok(fake.calls.plans.every((plan) => plan.plannedTotal <= plan.maxMutations && plan.batchSize <= 500));
  assert.equal(logs.filter((entry) => entry.event === 'run').length, 3);
  assert.deepEqual(nightMetricValues(summary, true), {
    DataLifecycleNightCompleted: 1,
    DataLifecycleBehind: 0,
    DataLifecycleRowsChanged: 2130,
    DataLifecycleEligibleRemaining: 0,
  });
});

test('A count above the approved ceiling stops the night before any change', async () => {
  const fake = fakeEngine({ roller_booking_ticket_delete_30d: 25_001 });
  const { logs, run } = night(settingsFor(), fake);
  await assert.rejects(run, /above the approved ceiling; nothing was changed/);
  assert.equal(fake.calls.applies, 0);
  assert.deepEqual(logs.at(-1), { event: 'ceiling_exceeded', ceiling: 25_000, eligibleTotal: 25_001 });
});

test('The approved catch-up ceiling lets the first nights take the backlog', async () => {
  const settings = settingsFor({
    DATA_LIFECYCLE_CATCH_UP_MAX_ELIGIBLE_TOTAL: '200000',
    DATA_LIFECYCLE_CATCH_UP_UNTIL: '2026-11-10',
    DATA_LIFECYCLE_MAX_RUNS: '2',
  });
  const fake = fakeEngine({ roller_booking_ticket_delete_30d: 46_015 });
  const summary = await night(settings, fake).run;
  assert.equal(summary.catchUp, true);
  assert.equal(summary.stoppedBy, 'max_runs');
  assert.equal(summary.rowsChanged, 1000);
  assert.equal(summary.eligibleRemaining, 45_015);
  assert.equal(nightMetricValues(summary, true).DataLifecycleBehind, 0, 'a planned catch-up is not behind');
  assert.equal(nightMetricValues({ ...summary, catchUp: false }, true).DataLifecycleBehind, 1);
});

test('A busy database is retried; any other failure stops the night with a safe message', async () => {
  // Shaped like the SDK's service exception: its own class, a name and request metadata.
  class DatabaseErrorException extends Error {
    constructor(message) {
      super(message);
      this.name = 'DatabaseErrorException';
      this.$metadata = {};
    }
  }
  const lock = new DatabaseErrorException('ERROR: could not obtain lock on relation "roller_bookings"; SQLState: 55P03');
  const retried = fakeEngine({ idempotency_delete_24h: 10 }, { failures: [lock] });
  const { logs, run } = night(settingsFor(), retried);
  const summary = await run;
  assert.equal(summary.retries, 1);
  assert.equal(summary.stoppedBy, 'done');
  assert.deepEqual(logs.find((entry) => entry.event === 'retry'), { event: 'retry', reason: 'lock_unavailable', sqlState: '55P03' });

  const leaking = new DatabaseErrorException(
    'ERROR: Key (roller_unique_id)=(synthetic-guest-value) is still referenced; SQLState: 23503',
  );
  const failed = fakeEngine({ idempotency_delete_24h: 10 }, { failures: [leaking] });
  const outcome = night(settingsFor(), failed);
  await assert.rejects(outcome.run, (error) => {
    assert.match(error.message, /Lifecycle night failed \(database_error\); the open pass was rolled back\./);
    assert.doesNotMatch(error.message, /synthetic-guest-value/);
    return true;
  });
  assert.deepEqual(outcome.logs.at(-1), { event: 'failed', reason: 'database_error', sqlState: '23503' });
  assert.doesNotMatch(JSON.stringify(outcome.logs), /synthetic-guest-value/);
});

test('A night that runs out of time or makes no progress recounts and reports what is left', async () => {
  let clock = Date.parse('2026-10-28T23:30:00Z');
  const fake = fakeEngine({ roller_booking_ticket_delete_30d: 5000 });
  const original = fake.applyPlan;
  fake.applyPlan = async (...args) => {
    clock += 400_000;
    return original(...args);
  };
  const summary = await night(settingsFor(), fake, { now: () => new Date(clock) }).run;
  assert.equal(summary.stoppedBy, 'budget');
  assert.equal(summary.runs, 2);
  assert.equal(summary.eligibleRemaining, 4000);
  assert.equal(nightMetricValues(summary, true).DataLifecycleBehind, 1);

  const stuck = fakeEngine({ checkin_session_delete_30d: 3 });
  stuck.applyPlan = async (_context, plan) => ({
    actions: plan.actions.map((action) => ({ ...action, affected: 0 })),
    affectedCountsDigest: 'x'.repeat(64),
    affectedTotal: 0,
    completedAt: plan.referenceAt,
    runId: 'jylc_stuck',
  });
  const stuckSummary = await night(settingsFor(), stuck).run;
  assert.equal(stuckSummary.stoppedBy, 'no_progress');
  assert.equal(stuckSummary.eligibleRemaining, 3);
});

test('Off mode does nothing', async () => {
  const fake = fakeEngine({ idempotency_delete_24h: 10 });
  const summary = await night(settingsFor({ DATA_LIFECYCLE_MODE: 'off' }), fake).run;
  assert.equal(summary.stoppedBy, 'off');
  assert.equal(fake.calls.counts, 0);
});

// --- PostgreSQL ---------------------------------------------------------------------------------

const DATABASE_TEST = process.env.GH598_DATABASE_TEST === 'true';

function databaseConnection() {
  const port = Number(process.env.GH598_PGPORT || 55598);
  assert.ok([55598, 55435].includes(port), 'Only disposable loopback test databases are allowed.');
  return {
    host: '127.0.0.1',
    port,
    database: process.env.GH598_PGDATABASE || 'gh598_lifecycle',
    user: process.env.GH598_PGUSER || 'gh345_test',
    password: '',
    ssl: false,
  };
}

// The Data API client, served by PostgreSQL as the lifecycle role.
function dataApiOverPostgres(pool) {
  const transactions = new Map();
  const toField = (value) => {
    if (value === null || value === undefined) return { isNull: true };
    if (typeof value === 'boolean') return { booleanValue: value };
    if (typeof value === 'number') return Number.isInteger(value) ? { longValue: value } : { doubleValue: value };
    if (value instanceof Date) return { stringValue: value.toISOString() };
    return { stringValue: typeof value === 'object' ? JSON.stringify(value) : String(value) };
  };
  const run = async (client, sql, parameters = []) => {
    const indexes = new Map(parameters.map((parameter, index) => [parameter.name, index + 1]));
    const text = sql.replace(/(?<!:):([a-zA-Z][a-zA-Z0-9_]*)\b/g, (match, name) => (indexes.has(name) ? `$${indexes.get(name)}` : match));
    const values = parameters.map(({ value }) => (value.isNull ? null : value.stringValue ?? value.longValue ?? value.booleanValue ?? null));
    const result = await client.query({ text, values, rowMode: 'array' });
    return { records: (result.rows ?? []).map((row) => row.map(toField)) };
  };
  const checkout = async () => {
    const client = await pool.connect();
    await client.query('SET ROLE jumpyard_lifecycle_runtime');
    return client;
  };
  const release = async (client) => {
    try {
      await client.query('RESET ROLE');
    } finally {
      client.release();
    }
  };
  return {
    async send(command) {
      const input = command.input;
      switch (command.constructor.name) {
        case 'BeginTransactionCommand': {
          const client = await checkout();
          await client.query('BEGIN');
          const transactionId = `tx_${transactions.size + 1}_${Date.now()}`;
          transactions.set(transactionId, client);
          return { transactionId };
        }
        case 'ExecuteStatementCommand': {
          if (input.transactionId) return run(transactions.get(input.transactionId), input.sql, input.parameters);
          const client = await checkout();
          try {
            return await run(client, input.sql, input.parameters);
          } finally {
            await release(client);
          }
        }
        case 'CommitTransactionCommand':
        case 'RollbackTransactionCommand': {
          const client = transactions.get(input.transactionId);
          transactions.delete(input.transactionId);
          try {
            await client.query(command.constructor.name === 'CommitTransactionCommand' ? 'COMMIT' : 'ROLLBACK');
          } finally {
            await release(client);
          }
          return {};
        }
        default:
          throw new Error(`Unexpected Data API command ${command.constructor.name}`);
      }
    },
  };
}

async function seed(admin) {
  const day = (offset) => `current_date + ${offset}`;
  const at = (days) => `now() + interval '${days} days'`;
  await admin.query(`INSERT INTO jumpyard.roller_bookings (roller_unique_id, booking_reference, roller_env, venue_id, booking_date, start_time, end_time)
    VALUES ('gh598-old', 'GH598OLD', 'live', '50871', ${day(-40)}, '10:00', '12:00'),
           ('gh598-pass', 'GH598PASS', 'live', '50871', ${day(-40)}, '10:00', '12:00'),
           ('gh598-today', 'GH598TODAY', 'live', '50871', ${day(0)}, '10:00', '12:00')`);
  await admin.query(`INSERT INTO jumpyard.roller_booking_items (booking_item_key, roller_unique_id, product_id, booking_date, start_time, end_time)
    VALUES ('gh598-old-entry', 'gh598-old', '101', ${day(-40)}, '10:00', '12:00'),
           ('gh598-old-socks', 'gh598-old', '102', ${day(-40)}, '10:00', '12:00'),
           ('gh598-pass-entry', 'gh598-pass', '103', ${day(-40)}, '10:00', '12:00'),
           ('gh598-today-entry', 'gh598-today', '101', ${day(0)}, '10:00', '12:00')`);
  await admin.query(`INSERT INTO jumpyard.roller_booking_tickets (ticket_id, roller_unique_id, booking_item_key, roller_customer_id, booking_date, expiry_date)
    VALUES ('gh598-old-t1', 'gh598-old', 'gh598-old-entry', 'gh598-customer-old', ${day(-40)}, NULL),
           ('gh598-old-t2', 'gh598-old', 'gh598-old-entry', 'gh598-customer-old', ${day(-40)}, NULL),
           ('gh598-pass-t1', 'gh598-pass', 'gh598-pass-entry', 'gh598-customer-pass', ${day(-40)}, ${day(100)}),
           ('gh598-today-t1', 'gh598-today', 'gh598-today-entry', 'gh598-customer-today', ${day(0)}, NULL)`);
  await admin.query(`INSERT INTO jumpyard.roller_booking_payments (payment_key, roller_unique_id, amount_cents)
    VALUES ('gh598-old-p1', 'gh598-old', 24000), ('gh598-pass-p1', 'gh598-pass', 99000), ('gh598-today-p1', 'gh598-today', 24000)`);
  await admin.query(`INSERT INTO jumpyard.checkin_sessions (checkin_session_id, roller_unique_id, booking_reference, visit_date, status, expires_at)
    VALUES ('gh598-old-session', 'gh598-old', 'GH598OLD', ${day(-40)}, 'redeemed', ${at(-39)})`);
  await admin.query(`INSERT INTO jumpyard.staff_handout_claims (roller_unique_id, visit_date, area, checkin_session_id, venue_id, actor_name)
    VALUES ('gh598-old', ${day(-40)}, 'entrance', 'gh598-old-session', '50871', 'Synthetic Staff')`);
  await admin.query(`INSERT INTO jumpyard.guest_profiles (guest_profile_id, roller_customer_id, email, contact_number, last_seen_from_roller_at, updated_at)
    VALUES ('gh598-guest-old', 'gh598-customer-old', 'gh598-old@example.invalid', '+46000000598', ${at(-40)}, ${at(-40)}),
           ('gh598-guest-pass', 'gh598-customer-pass', 'gh598-pass@example.invalid', NULL, ${at(-40)}, ${at(-40)}),
           ('gh598-guest-today', 'gh598-customer-today', 'gh598-today@example.invalid', NULL, now(), now())`);
  await admin.query(`INSERT INTO jumpyard.prepayment_booking_drafts
      (prepayment_draft_id, external_id, idempotency_key, roller_env, booking_date, start_time, customer_email, customer_phone,
       customer_first_name, expires_at, created_at, updated_at)
    VALUES ('gh598-draft-40', 'JY-D-GH598-40', 'gh598-draft-40', 'live', ${day(-40)}, '10:00', 'gh598-draft@example.invalid',
            '+46000000598', 'Synthetic', ${at(-40)}, ${at(-40)}, ${at(-40)}),
           ('gh598-draft-100', 'JY-D-GH598-100', 'gh598-draft-100', 'live', ${day(-100)}, '10:00', 'gh598-old-draft@example.invalid',
            NULL, NULL, ${at(-100)}, ${at(-100)}, ${at(-100)})`);
  await admin.query(`INSERT INTO jumpyard.idempotency_records (idempotency_key, operation, request_hash, status, expires_at)
    VALUES ('gh598-idem-expired', 'synthetic', 'h', 'completed', ${at(-2)}), ('gh598-idem-live', 'synthetic', 'h', 'started', ${at(1)})`);
  await admin.query(`INSERT INTO jumpyard.checkin_tokens (token_hash, roller_unique_id, channel, expires_at)
    VALUES ('gh598-token-expired', 'gh598-today', 'email', ${at(-2)}), ('gh598-token-live', 'gh598-today', 'email', ${at(1)})`);
  await admin.query(`INSERT INTO jumpyard.event_log (event_id, event_type, subject_ref, summary, event_payload, created_at)
    VALUES ('gh598-event-40', 'synthetic.event', 'GH598OLD', 'synthetic summary', '{"booking":"GH598OLD"}', ${at(-40)}),
           ('gh598-event-100', 'synthetic.event', 'GH598OLD', 'synthetic summary', '{}', ${at(-100)}),
           ('gh598-event-today', 'synthetic.event', 'GH598TODAY', 'synthetic summary', '{"booking":"GH598TODAY"}', now())`);
}

test('PostgreSQL: the lifecycle role may run every apply statement, and nightly apply keeps protected rows', {
  skip: !DATABASE_TEST,
}, async () => {
  const { Pool } = require('../infra/node_modules/pg');
  const admin = new Pool(databaseConnection());
  const lifecyclePool = new Pool({ ...databaseConnection(), max: 2 });
  try {
    const fresh = await admin.query('SELECT count(*)::int AS bookings FROM jumpyard.roller_bookings');
    assert.equal(fresh.rows[0].bookings, 0, 'The lifecycle test needs a fresh, disposable database.');

    // Every apply statement passes the executor's permission check as the lifecycle role.
    const client = await lifecyclePool.connect();
    try {
      await client.query('SET ROLE jumpyard_lifecycle_runtime');
      for (const spec of policy.ACTION_SPECS) {
        const indexes = new Map([['referenceAt', 1], ['batchSize', 2]]);
        const text = spec.mutateSql.replace(/(?<!:):([a-zA-Z][a-zA-Z0-9_]*)\b/g, (match, name) => `$${indexes.get(name) ?? match}`);
        await client.query({ text: `EXPLAIN (COSTS OFF) ${text}`, values: [new Date().toISOString(), 1] });
      }
    } finally {
      await client.query('RESET ROLE');
      client.release();
    }

    await seed(admin);
    const rds = dataApiOverPostgres(lifecyclePool);
    const settings = { ...settingsFor(), pauseMs: 0 };
    const nightRun = (overrides = {}) => nightly.runNight({
      settings: { ...settings, ...overrides },
      context: lifecycleContext(rds),
      log: () => {},
      sleep: async () => {},
      timeLeftMs: () => 800_000,
    });
    const rowCount = async (table, where = 'true') =>
      (await admin.query(`SELECT count(*)::int AS n FROM jumpyard.${table} WHERE ${where}`)).rows[0].n;
    const snapshot = async () => Promise.all(
      ['roller_bookings', 'roller_booking_items', 'roller_booking_tickets', 'guest_profiles', 'event_log'].map((table) => rowCount(table)),
    );

    const before = await snapshot();
    const planned = await nightRun({ mode: 'plan' });
    assert.equal(planned.stoppedBy, 'plan');
    assert.deepEqual(await snapshot(), before, 'plan mode changes nothing');
    await assert.rejects(nightRun({ maxEligibleTotal: 3 }), /above the approved ceiling/);
    assert.deepEqual(await snapshot(), before, 'a ceiling stop changes nothing');

    const first = await nightRun();
    assert.equal(first.stoppedBy, 'done');
    assert.ok(first.runs >= 3, 'children first, then the booking');

    assert.equal(await rowCount('roller_bookings', "roller_unique_id = 'gh598-old'"), 0);
    for (const table of ['roller_booking_items', 'roller_booking_tickets', 'roller_booking_payments', 'checkin_sessions', 'staff_handout_claims']) {
      assert.equal(await rowCount(table, "roller_unique_id = 'gh598-old'"), 0, `${table} of the old booking`);
    }
    for (const id of ['gh598-pass', 'gh598-today']) {
      assert.equal(await rowCount('roller_bookings', `roller_unique_id = '${id}'`), 1, `${id} is kept`);
      assert.equal(await rowCount('roller_booking_tickets', `roller_unique_id = '${id}'`), 1, `${id} keeps its ticket`);
      assert.equal(await rowCount('roller_booking_payments', `roller_unique_id = '${id}'`), 1, `${id} keeps its payment`);
    }
    const guests = (await admin.query("SELECT guest_profile_id FROM jumpyard.guest_profiles WHERE guest_profile_id LIKE 'gh598-%' ORDER BY 1")).rows;
    assert.deepEqual(guests.map((row) => row.guest_profile_id), ['gh598-guest-pass', 'gh598-guest-today']);

    const draft = (await admin.query(`SELECT customer_email, customer_phone, customer_first_name, external_id, idempotency_key
      FROM jumpyard.prepayment_booking_drafts WHERE prepayment_draft_id = 'gh598-draft-40'`)).rows[0];
    assert.equal(draft.customer_email, null);
    assert.equal(draft.customer_phone, null);
    assert.equal(draft.customer_first_name, null);
    assert.match(draft.external_id, /^audit_[a-f0-9]{32}$/);
    assert.match(draft.idempotency_key, /^audit_[a-f0-9]{32}$/);
    assert.equal(await rowCount('prepayment_booking_drafts', "prepayment_draft_id = 'gh598-draft-100'"), 0);

    assert.equal(await rowCount('idempotency_records', "idempotency_key = 'gh598-idem-expired'"), 0);
    assert.equal(await rowCount('idempotency_records', "idempotency_key = 'gh598-idem-live'"), 1);
    assert.equal(await rowCount('checkin_tokens', "token_hash = 'gh598-token-expired'"), 0);
    assert.equal(await rowCount('checkin_tokens', "token_hash = 'gh598-token-live'"), 1);
    const event = (await admin.query("SELECT subject_ref, summary, event_payload FROM jumpyard.event_log WHERE event_id = 'gh598-event-40'")).rows[0];
    assert.match(event.subject_ref, /^audit_[a-f0-9]{32}$/);
    assert.equal(event.summary, null);
    assert.deepEqual(event.event_payload, {});
    assert.equal(await rowCount('event_log', "event_id = 'gh598-event-100'"), 0);
    assert.equal(await rowCount('event_log', "event_id = 'gh598-event-today' AND summary IS NOT NULL"), 1);

    const runs = (await admin.query(`SELECT count(*)::int AS n, sum(affected_total)::int AS changed
      FROM jumpyard.data_lifecycle_runs WHERE status = 'completed' AND policy_definition_digest = $1`, [DIGEST])).rows[0];
    assert.equal(runs.n, first.runs);
    assert.equal(runs.changed, first.rowsChanged);

    const second = await nightRun();
    assert.equal(second.stoppedBy, 'done');
    assert.equal(second.runs, 0, 'a second night finds nothing to do');
    assert.equal(await engine.loadEligibleCounts(lifecycleContext(rds), new Date().toISOString()).then((counts) =>
      [...counts.values()].reduce((total, eligible) => total + eligible, 0)), 0);
  } finally {
    await lifecyclePool.end();
    await admin.end();
  }
});
