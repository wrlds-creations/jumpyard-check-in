'use strict';

// GH-583 (D0285): two Park alarms fired on designed behaviour on 2026-10-18.
// 1. redeem-lambda-errors: the reconciliation worker and the webhook both confirmed the same kiosk
//    booking, often within a second, and each started an automatic check-in. The second one found the
//    first one's redeem in progress and threw for a Lambda retry, which Lambda counts as an error. Now
//    only the confirmation that attaches the booking starts the check-in, and a redeem_in_progress
//    hand-off ends without an error.
// 2. roller-api-errors: the worker read ROLLER back for 75 s, but ROLLER confirmed kiosk purchases up to
//    96 s after the approval, so the last 404 counted as a ROLLER error although the webhook confirmed
//    the purchase seconds later. The last step now comes at 100 s and reads ROLLER only for a purchase
//    nothing has confirmed by then; only that readback's 404 is an error.
// These checks drive the real Booking and Redeem Lambda sources with a scripted Aurora Data API, Lambda
// and ROLLER. With GH583_DATABASE_TEST=true the confirmation also runs against PostgreSQL with the
// Booking Lambda's own database role; nothing reaches AWS or ROLLER.

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const BOOKING_PATH = path.join(ROOT, 'infra', 'lambda', 'booking', 'index.js');
const REDEEM_PATH = path.join(ROOT, 'infra', 'lambda', 'redeem', 'index.js');
const STACK_PATH = path.join(ROOT, 'infra', 'lib', 'jumpyard-cloud-stack.ts');
const TODAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const VENUE = '50871';
const SESSION_ID = 'jycs_583';
const BOOKING_ID = 'roller-booking-583';
const BOOKING_REFERENCE = '583001';
const TICKETS = ['583001-t1', '583001-t2'];
const DRAFT = { prepaymentDraftId: `jypd_${'5'.repeat(18)}`, paymentAttemptId: `jytp_${'8'.repeat(18)}` };
const ROLLER_ENV = { ROLLER_BASE_URL_PARAMETER_NAME: '/synthetic/roller/base-url', ROLLER_ENV_PARAMETER_NAME: '/synthetic/roller/env',
  ROLLER_CREDENTIALS_SECRET_ARN: 'arn:aws:secretsmanager:eu-north-1:000000000000:secret:roller' };
const REDEEM_ENV = {
  ENABLE_ROLLER_REDEEM_WRITES: 'true', ENABLE_T0166_LIVE_REDEEM_SMOKE: 'false', ENABLE_T0176_FULL_FLOW_REHEARSAL: 'true',
  JUMPYARD_EMERGENCY_STOP: 'false', JUMPYARD_ENVIRONMENT: 'park-test', STAFF_IDENTITY_VENUE_ID: VENUE,
  T0176_FULL_FLOW_ALLOWED_OPERATING_DATES: TODAY, T0176_FULL_FLOW_VENUE_ID: VENUE, ...ROLLER_ENV,
};

function dataApiField(value) {
  if (value === null || value === undefined) return { isNull: true };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return Number.isInteger(value) ? { longValue: value } : { doubleValue: value };
  return { stringValue: String(value) };
}
function rdsResult(rows, numberOfRecordsUpdated = 0) {
  if (!rows || rows.length === 0) return { columnMetadata: [], numberOfRecordsUpdated, records: [] };
  const columns = Object.keys(rows[0]);
  return { columnMetadata: columns.map((name) => ({ name })), numberOfRecordsUpdated,
    records: rows.map((row) => columns.map((name) => dataApiField(row[name]))) };
}
const plain = (value) => JSON.parse(JSON.stringify(value));
const parameterValue = (parameters, name) => (parameters ?? []).find((parameter) => parameter.name === name)?.value?.stringValue ?? null;

function fakeAws(handleCommand) {
  return new Proxy({}, {
    get(_target, property) {
      return class FakeAwsClientOrCommand {
        constructor(input) { this.input = input; this.name = String(property); }
        async send(command) { return handleCommand(command); }
      };
    },
  });
}

// Loads one Lambda source with fake AWS clients. `expose` lists internal functions to return, and
// `overrides` replaces internal functions (the worker's database steps and its wait) by name.
function loadLambda(file, { env = {}, execute = async () => rdsResult([]), fetchImpl, invokes = [], logs = [], expose = [],
  overrides = {} }) {
  const directory = path.dirname(file);
  const module = { exports: {} };
  const aws = fakeAws(async (command) => {
    if (command.name === 'ExecuteStatementCommand') return execute(command.input.sql, command.input.parameters ?? []);
    if (command.name === 'InvokeCommand') { invokes.push(command.input); return { StatusCode: 202 }; }
    if (command.name === 'GetParameterCommand') {
      const name = String(command.input?.Name ?? '');
      if (name === ROLLER_ENV.ROLLER_ENV_PARAMETER_NAME) return { Parameter: { Value: 'live' } };
      if (name === ROLLER_ENV.ROLLER_BASE_URL_PARAMETER_NAME) return { Parameter: { Value: 'https://api.roller.app' } };
    }
    if (command.name === 'GetSecretValueCommand') return { SecretString: JSON.stringify({ clientId: 'c', clientSecret: 's' }) };
    throw new Error(`Unexpected AWS command ${command.name} during GH-583 validation.`);
  });
  const replaced = Object.keys(overrides).map((name) => `${name} = __gh583Overrides.${name};`).join('\n');
  vm.runInNewContext(`${fs.readFileSync(file, 'utf8')}\n${replaced}\nmodule.exports.__gh583 = { ${expose.join(', ')} };`, {
    AbortSignal, Buffer, TextDecoder, TextEncoder, URL, URLSearchParams, clearTimeout, setTimeout,
    __gh583Overrides: overrides,
    console: { error: (line) => logs.push(String(line)), info: (line) => logs.push(String(line)), log: (line) => logs.push(String(line)),
      warn: (line) => logs.push(String(line)) },
    exports: module.exports, module,
    fetch: fetchImpl ?? (async () => { throw new Error('Unexpected network call during GH-583 validation.'); }),
    process: { env: { DATABASE_CLUSTER_ARN: 'arn:aws:rds:eu-north-1:000000000000:cluster:synthetic',
      DATABASE_SECRET_ARN: 'arn:aws:secretsmanager:eu-north-1:000000000000:secret:synthetic',
      RESOURCE_PREFIX: 'jumpyard-check-in-test', ...env } },
    require(moduleId) {
      if (moduleId === 'crypto' || moduleId === 'node:crypto') return crypto;
      if (moduleId.startsWith('@aws-sdk/')) return aws;
      if (moduleId.startsWith('./')) return require(path.join(directory, moduleId));
      throw new Error(`Unexpected require(${JSON.stringify(moduleId)}) during GH-583 validation.`);
    },
  }, { filename: file });
  return { handler: module.exports.handler, internals: module.exports.__gh583 };
}
const payloads = (invokes) => invokes.map((invoke) => JSON.parse(Buffer.from(invoke.Payload).toString('utf8')));

// --- 1. Redeem: a redeem_in_progress hand-off is not a Lambda error ------------------------------

// A kiosk group ready and confirmed, as the second automatic check-in of 2026-10-18 found it.
// `inProgress`: another trigger holds the session's redeem key (`staff-redeem:<session>`), fresh.
function redeemScenario({ inProgress = false, postStatus = 200 } = {}) {
  const db = { calls: [], requestHash: null };
  const roller = { calls: [] };
  const sessionRow = () => ({
    checkin_session_id: SESSION_ID, roller_unique_id: BOOKING_ID, booking_reference: BOOKING_REFERENCE, visit_date: TODAY,
    status: 'ready_for_staff', safety_status: 'completed', handoff_code: '0034', handoff_status: 'ready_for_staff',
    booking_sync_status: 'confirmed', selected_ticket_ids: JSON.stringify(TICKETS), expires_at: '2999-01-01T00:00:00.000Z',
    ready_for_staff_at: `${TODAY}T09:33:00.000Z`, completed_at: null, updated_at: `${TODAY}T09:34:09.000Z`, checked_in_by: null,
    handout_claim: null,
  });
  const localTicket = (ticketId) => ({
    ticketId, bookingItemId: 'item-583', productId: '900001', bookingDate: TODAY, redeemStatusLastSeen: null,
    lastSeenFromRollerAt: `${TODAY}T09:34:09.000Z`, ticketProductType: null, ticketProductSubType: null,
    ticketSource: 'kiosk_payment_reconciliation', itemProductType: 'sessionpass', itemProductSubType: null, itemParentType: null,
    productCatalogType: null, productCatalogSubType: null, productCatalogParentType: null, productName: '90 min',
    parentProductName: 'Drop-in',
  });
  const contextRow = () => ({
    roller_unique_id: BOOKING_ID, booking_reference: BOOKING_REFERENCE, roller_env: 'live', booking_status: 'Paid',
    payment_status: 'Paid', amount_owing_cents: 0, total_cents: 44000, booking_date: TODAY, venue_id: VENUE,
    start_time: '00:00:00', end_time: '23:59:00', freshness_status: 'fresh', is_tombstoned: false,
    last_seen_from_roller_at: `${TODAY}T09:34:09.000Z`, tickets_json: JSON.stringify(TICKETS.map(localTicket)),
  });
  const execute = async (sql, parameters) => {
    db.calls.push({ sql, parameters });
    if (/FROM jumpyard\.checkin_sessions AS cs/.test(sql)) return rdsResult([sessionRow()]);
    if (/FROM jumpyard\.roller_bookings AS b/.test(sql)) return rdsResult([contextRow()]);
    if (/INSERT INTO jumpyard\.roller_bookings/.test(sql)) return rdsResult([], 1);
    if (/INSERT INTO jumpyard\.roller_booking_items/.test(sql)) return rdsResult([{ booking_item_key: 'jybi_583' }], 1);
    if (/INSERT INTO jumpyard\.roller_booking_tickets/.test(sql)) return rdsResult([], 1);
    if (/INSERT INTO jumpyard\.idempotency_records/.test(sql)) {
      db.requestHash = parameterValue(parameters, 'requestHash');
      return rdsResult([], inProgress ? 0 : 1);
    }
    if (/AS stale\s+FROM jumpyard\.idempotency_records/.test(sql)) {
      return rdsResult([{ status: 'in_progress', request_hash: db.requestHash, result_ref: null, stale: false }]);
    }
    if (/SELECT status\s+FROM jumpyard\.idempotency_records/.test(sql)) return rdsResult([]);
    if (/UPDATE jumpyard\.idempotency_records\s+SET status = :status/.test(sql)) return rdsResult([], 1);
    if (/WITH previous AS/.test(sql)) return rdsResult([{ attempts: 1 }], 1);
    if (/INSERT INTO jumpyard\.checkin_attempts/.test(sql)) return rdsResult([], 1);
    if (/INSERT INTO jumpyard\.event_log/.test(sql)) return rdsResult([], 1);
    throw new Error(`Unexpected SQL during GH-583 validation: ${sql.slice(0, 90)}`);
  };
  const json = (status, body) => ({ ok: status >= 200 && status < 300, status,
    async json() { return body; }, async text() { return body === undefined ? '' : JSON.stringify(body); } });
  const fetchImpl = async (url, init = {}) => {
    const target = new URL(String(url));
    const method = init.method ?? 'GET';
    roller.calls.push(`${method} ${target.pathname}`);
    if (target.pathname === '/token') return json(200, { access_token: 'synthetic-token', token_type: 'Bearer', expires_in: 3600 });
    if (target.pathname === '/products') return json(200, []);
    if (target.pathname === `/bookings/${BOOKING_ID}`) {
      return json(200, { uniqueId: BOOKING_ID, bookingReference: BOOKING_REFERENCE, status: 'Paid', amountOwing: 0, total: 440,
        venueId: Number(VENUE), items: [{ bookingItemId: 'item-583', productId: 900001, productName: '90 min', productType: 'sessionpass',
          quantity: TICKETS.length, bookingDate: TODAY, startTime: '00:00:00', endTime: '23:59:00',
          tickets: TICKETS.map((ticketId) => ({ ticketId, locations: [] })) }] });
    }
    if (target.pathname === '/redemptions' && method === 'POST') return json(postStatus, postStatus === 200 ? {} : { errors: [] });
    throw new Error(`Unexpected ROLLER call during GH-583 validation: ${method} ${target.pathname}`);
  };
  return { db, execute, fetchImpl, roller };
}

async function autoCheckin(options) {
  const scenario = redeemScenario(options);
  const logs = [];
  const { handler } = loadLambda(REDEEM_PATH, { env: REDEEM_ENV, execute: scenario.execute, fetchImpl: scenario.fetchImpl, logs });
  let result = null;
  let error = null;
  try {
    result = await handler({ source: 'jumpyard.auto-checkin',
      detail: { checkinSessionId: SESSION_ID, correlationId: 'jy_gh583_webhook', trigger: 'kiosk_booking_confirmed' } });
  } catch (caught) { error = caught; }
  return { error, logs, result, scenario };
}

test('A second automatic check-in that finds the redeem in progress ends without an error', async () => {
  const { error, logs, result, scenario } = await autoCheckin({ inProgress: true });
  assert.equal(error, null, 'no throw, so Lambda counts no error and makes no retry');
  assert.deepEqual(plain(result), { status: 'in_progress', reason: 'redeem_in_progress' });
  assert.equal(scenario.roller.calls.includes('POST /redemptions'), false, 'the attempt holding the key redeems, not this one');
  assert.equal(scenario.db.calls.some((call) => /WITH previous AS/.test(call.sql)), false, 'no failure is counted on the session');
  const events = scenario.db.calls.filter((call) => /INSERT INTO jumpyard\.event_log/.test(call.sql))
    .map((call) => parameterValue(call.parameters, 'eventType'));
  assert.equal(events.some((type) => /auto_checkin_(failed|blocked)/.test(type)), false);
  assert.equal(logs.some((line) => line.includes('cloud.server_error')), false, 'no server error is reported');
  const handOff = logs.filter((line) => line.includes('"eventType":"checkin.auto_checkin_in_progress"')).map((line) => JSON.parse(line));
  assert.equal(handOff.length, 1, 'one log line marks the hand-off');
  assert.equal(handOff[0].handler, 'redeem');
  assert.equal(handOff[0].trigger, 'kiosk_booking_confirmed');
  assert.ok(!logs.join('\n').includes(SESSION_ID), 'the line carries codes only');
});

test('A ROLLER outage still throws for Lambda\'s retry, and a free key still redeems', async () => {
  const outage = await autoCheckin({ postStatus: 503 });
  assert.equal(outage.error?.code, 'auto_checkin_retry');
  assert.equal(outage.error?.message, 'auto_checkin_retry:roller_redeem_rejected');

  const source = fs.readFileSync(REDEEM_PATH, 'utf8').replace(/\r\n/g, '\n');
  const autoCheckinSource = source.slice(source.indexOf('async function handleAutoCheckin('), source.indexOf('function autoCheckinRetry('));
  assert.match(autoCheckinSource, /if \(reason === 'redeem_in_progress'\) \{[\s\S]*?return \{ status: 'in_progress', reason \};\s*\}/);
  assert.equal((autoCheckinSource.match(/throw autoCheckinRetry\(reason\)/g) ?? []).length, 1, 'only a retryable failure throws');
});

// --- 2. Booking: only the confirmation that attaches the booking starts the check-in ------------

function confirmationWithScript(row) {
  const statements = [];
  const invokes = [];
  const { internals } = loadLambda(BOOKING_PATH, {
    env: { AUTO_CHECKIN_FUNCTION_NAME: 'synthetic-redeem' }, invokes, expose: ['confirmKioskReconciliation'],
    execute: async (sql, parameters) => {
      statements.push({ sql, parameters });
      if (/previously_confirmed AS \(/.test(sql)) return rdsResult([row]);
      throw new Error(`Unexpected SQL during GH-583 validation: ${sql.slice(0, 90)}`);
    },
  });
  const confirm = (correlationId) => internals.confirmKioskReconciliation({ ...DRAFT, correlationId },
    { bookingReference: BOOKING_REFERENCE, rollerUniqueId: BOOKING_ID, ticketIds: TICKETS });
  return { confirm, invokes, statements };
}

test('The worker\'s confirmation starts the automatic check-in; the webhook\'s repeat a second later does not', async () => {
  const first = confirmationWithScript({ reconciliation_attempt_count: 14, attached_session_count: 1,
    newly_confirmed_session_ids: JSON.stringify([SESSION_ID]), attached_token_count: 1, attached_phone_link_count: 0 });
  const worker = await first.confirm('jy_gh583_worker');
  assert.equal(Number(worker.attached_session_count), 1);
  assert.deepEqual(payloads(first.invokes), [{ source: 'jumpyard.auto-checkin',
    detail: { checkinSessionId: SESSION_ID, correlationId: 'jy_gh583_worker', trigger: 'kiosk_booking_confirmed' } }]);

  // The webhook's confirmation re-attaches the same session: still confirmed for the webhook, no second start.
  const repeat = confirmationWithScript({ reconciliation_attempt_count: 14, attached_session_count: 1,
    newly_confirmed_session_ids: null, attached_token_count: 1, attached_phone_link_count: 0 });
  const webhook = await repeat.confirm('jy_gh583_webhook');
  assert.equal(Number(webhook.attached_session_count), 1, 'the webhook still gets its confirmation');
  assert.deepEqual(repeat.invokes, []);

  const sql = repeat.statements[0].sql.replace(/\s+/g, ' ');
  assert.match(sql, /SELECT session\.checkin_session_id FROM jumpyard\.checkin_sessions AS session WHERE session\.source_lookup_ref = :prepaymentDraftId AND session\.session_summary ->> 'paymentAttemptId' = :paymentAttemptId AND session\.roller_unique_id = :rollerUniqueId AND session\.session_summary ->> 'bookingSyncStatus' = 'confirmed' \), confirmed AS \(/);
  assert.match(sql, /WHERE NOT EXISTS \(SELECT 1 FROM previously_confirmed AS previous WHERE previous\.checkin_session_id = attached\.checkin_session_id\)\)::text AS newly_confirmed_session_ids/);
  assert.ok(sql.indexOf('previously_confirmed AS (') < sql.indexOf('attached_session AS ('),
    'read before the attachment, in the same statement');
});

// --- 3. Booking: the readback window ends at 100 s ----------------------------------------------

const confirmedBooking = { uniqueId: BOOKING_ID, bookingReference: BOOKING_REFERENCE, paymentStatus: 'Paid', costs: { amountOwing: 0 },
  items: [{ productId: '900001', tickets: TICKETS.map((ticketId) => ({ ticketId })) }] };
const pendingAttempt = { payment_attempt_status: 'approved', booking_confirmation_status: 'pending', status: 'payment_pending',
  flow_type: 'new_booking', roller_draft_unique_id: BOOKING_ID, payment_attempt_id: DRAFT.paymentAttemptId };
// What the worker reads once the webhook has confirmed the booking and attached the session.
const webhookConfirmed = { ...pendingAttempt, payment_attempt_status: 'reconciled', booking_confirmation_status: 'confirmed',
  status: 'published', checkin_session_id: SESSION_ID, confirmed_roller_unique_id: BOOKING_ID,
  confirmed_booking_reference: BOOKING_REFERENCE, session_booking_sync_status: 'confirmed', selected_ticket_ids: JSON.stringify(TICKETS) };

// The real worker with the real getRollerJson and metrics. `answers` is consumed per ROLLER GET and ends
// in 404; `confirmedFromStep` is the step (0 = 0 s) from which Cloud's rows show the webhook's confirmation.
function worker({ answers = [], confirmedFromStep = null } = {}) {
  const gets = [];
  const waits = [];
  const logs = [];
  const calls = { confirmations: 0, needsStaff: [] };
  let reads = 0;
  const { internals } = loadLambda(BOOKING_PATH, {
    logs, expose: ['handleKioskPaymentReconciliation'],
    fetchImpl: async (url, init = {}) => {
      const target = new URL(String(url));
      assert.equal(init.method, 'GET');
      gets.push(target.pathname);
      const next = answers.shift() ?? { status: 404, body: null };
      return { ok: next.status >= 200 && next.status < 300, status: next.status,
        text: async () => (next.body === null ? '' : JSON.stringify(next.body)) };
    },
    overrides: {
      // Read 0 is the worker's first check; read n is step n - 1.
      findKioskPrepaymentAttempt: async () => {
        const step = reads - 1;
        reads += 1;
        return confirmedFromStep !== null && step >= confirmedFromStep ? webhookConfirmed : pendingAttempt;
      },
      isEmergencyStopEnabled: () => false,
      isNewBookingDraftWriteEnabled: () => true,
      claimKioskReconciliation: async () => ({ roller_draft_unique_id: BOOKING_ID, payment_approved_at: new Date().toISOString(),
        amount_owing_cents: 44000 }),
      getRollerConfig: async () => ({ env: 'live', baseUrl: 'https://roller.invalid/api' }),
      getRollerAccessToken: async () => ({ accessToken: 'synthetic-access', tokenType: 'Bearer' }),
      recordKioskReconciliationAttempt: async () => {},
      persistKioskReconciliationBookingSnapshot: async () => {},
      confirmKioskReconciliation: async () => {
        calls.confirmations += 1;
        return { attached_session_count: 1, attached_token_count: 1, reconciliation_attempt_count: gets.length };
      },
      markKioskReconciliationNeedsStaff: async (_request, reason) => { calls.needsStaff.push(reason); },
      writeBookingEventLog: async () => {},
      wait: async (ms) => { waits.push(ms); },
    },
  });
  const metrics = () => logs.map((line) => { try { return JSON.parse(line); } catch { return null; } })
    .filter((record) => record && record._aws && 'RollerApiCallCount' in record);
  const count = (name) => metrics().filter((record) => record[name] === 1).length;
  const run = () => internals.handleKioskPaymentReconciliation(DRAFT, 'jy_gh583_worker');
  return { calls, count, gets, run, waits };
}

test('The steps read ROLLER every 5 s to 75 s, then once at 100 s', async () => {
  const { run, waits } = worker();
  await run();
  // No time passes in the fake, so each wait is its step's offset from the start.
  assert.deepEqual(waits.map((ms) => Math.round(ms / 1000) * 1000),
    [...Array.from({ length: 15 }, (_, index) => (index + 1) * 5_000), 100_000]);
  const stack = fs.readFileSync(STACK_PATH, 'utf8');
  assert.match(stack, /createHandler\('BookingHandler', 'booking', handlerResources, \{[\s\S]*?timeout: Duration\.minutes\(2\),/,
    'the Booking Lambda\'s 2-minute timeout leaves room for the readback at 100 s');
});

test('A purchase the webhook confirms after 75 s ends at 100 s with no further ROLLER call and no error', async () => {
  // Saturday 2026-10-18, 12:16: ROLLER confirmed after 93 s and the webhook 3 s later.
  const { calls, count, gets, run } = worker({ confirmedFromStep: 16 });
  assert.deepEqual(plain(await run()), { status: 'confirmed' });
  assert.equal(gets.length, 16, 'the 16 readbacks to 75 s, and none at 100 s');
  assert.equal(count('RollerApiExpectedMissCount'), 16, 'the 404 at 75 s is now an expected miss too');
  assert.equal(count('RollerApiErrorCount'), 0);
  assert.deepEqual(calls.needsStaff, []);
  assert.equal(calls.confirmations, 0, 'the webhook already confirmed and admitted it');
});

test('A purchase still unconfirmed at 100 s is read once more, and only that 404 is an error', async () => {
  const timedOut = worker();
  assert.deepEqual(plain(await timedOut.run()), { status: 'needs_staff' });
  assert.equal(timedOut.gets.length, 17);
  assert.equal(timedOut.count('RollerApiCallCount'), 17);
  assert.equal(timedOut.count('RollerApiExpectedMissCount'), 16);
  assert.equal(timedOut.count('RollerApiErrorCount'), 1, 'a purchase nobody confirmed in 100 s still alarms');
  assert.deepEqual(timedOut.calls.needsStaff, ['confirmation_timeout']);

  // The webhook queue is blocked (2026-10-18, 15:10–15:41) but ROLLER has the booking: the worker confirms it.
  const blocked = worker({ answers: [...Array.from({ length: 16 }, () => ({ status: 404, body: null })), { status: 200, body: confirmedBooking }] });
  assert.deepEqual(plain(await blocked.run()), { status: 'confirmed' });
  assert.equal(blocked.gets.length, 17);
  assert.equal(blocked.count('RollerApiErrorCount'), 0);
  assert.equal(blocked.calls.confirmations, 1);
  assert.deepEqual(blocked.calls.needsStaff, []);
});

test('The validator, its CI database step and the decision are wired in', () => {
  const packageJson = fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8');
  assert.match(packageJson, /"validate:gh583-alarms-not-errors": "node --test scripts\/validate-gh583-alarms-not-errors\.test\.js"/);
  assert.match(packageJson, /npm run validate:gh583-alarms-not-errors/);
  assert.match(fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8'), /GH583_DATABASE_TEST: 'true'/);
  assert.match(fs.readFileSync(path.join(ROOT, 'DECISIONS.md'), 'utf8'), /\| `D\d{4}` \| 2026-10-\d\d \| [^|]*\(#583\)/);
});

// --- 4. PostgreSQL ---------------------------------------------------------------------------------

// Data API shaped results under one Lambda's role. Statements run one at a time on one connection,
// each under `SET ROLE`, so the Booking Lambda is held to its own grants.
function createDatabase(client) {
  let queue = Promise.resolve();
  const serial = (work) => {
    const run = queue.then(work, work);
    queue = run.catch(() => {});
    return run;
  };
  const asRole = (role) => (sql, parameters = []) => serial(async () => {
    const indexes = new Map(parameters.map((parameter, index) => [parameter.name, index + 1]));
    const prepared = sql.replace(/(?<!:):([a-zA-Z][a-zA-Z0-9_]*)\b/g, (match, name) => (indexes.has(name) ? `$${indexes.get(name)}` : match));
    const values = parameters.map(({ value = {} }) => (value.isNull ? null
      : value.stringValue ?? value.longValue ?? value.booleanValue ?? value.doubleValue ?? null));
    await client.query(`SET ROLE ${role}`);
    try {
      const result = await client.query(prepared, values);
      return { columnMetadata: result.fields.map((field) => ({ name: field.name })), numberOfRecordsUpdated: result.rowCount ?? 0,
        records: result.rows.map((row) => result.fields.map((field) => dataApiField(row[field.name]))) };
    } finally {
      await client.query('RESET ROLE');
    }
  });
  const admin = (sql, values = []) => serial(() => client.query(sql, values));
  return { admin, asRole };
}

test('PostgreSQL: the worker\'s confirmation admits the group once, the webhook\'s repeat does not, and a late one still does', {
  skip: process.env.GH583_DATABASE_TEST !== 'true',
}, async () => {
  const pg = require('../infra/node_modules/pg');
  const port = Number(process.env.GH583_PGPORT || 55583);
  assert.ok([55583, 55435].includes(port), 'Only disposable loopback test databases are allowed.');
  const rawText = new Set([114, 3802, 1082, 1083, 1114, 1184, 1266]);
  const client = new pg.Client({ host: '127.0.0.1', port, database: 'jumpyard_cloud', user: port === 55583 ? 'postgres' : 'gh345_test',
    password: '', ssl: false, types: { getTypeParser: (oid, format) => (rawText.has(oid) ? (value) => value
      : oid === 20 ? Number : pg.types.getTypeParser(oid, format)) } });
  await client.connect();
  const db = createDatabase(client);
  const prefix = `gh583_${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`;
  const hex = (label, length) => crypto.createHash('sha256').update(`${prefix}:${label}`).digest('hex').slice(0, length);
  const created = { bookings: [], drafts: [], sessions: [], tokens: [] };

  // A kiosk purchase as the finalize step leaves it: the provisional booking row on the draft's unique id
  // (ROLLER keeps that id for the paid booking), the approved draft, the provisional session and the
  // guest access token derived from the payment attempt.
  const purchase = async (label, { syncStatus = 'pending', confirmation = 'pending' } = {}) => {
    const item = { bookingId: `${prefix}-${label}`, prepaymentDraftId: `jypd_${hex(`${label}:d`, 18)}`,
      paymentAttemptId: `jytp_${hex(`${label}:a`, 18)}`, sessionId: `jycs_${hex(label, 8)}_${hex(`${label}:s`, 8)}` };
    const tokenHash = crypto.createHash('sha256').update(item.paymentAttemptId).digest('hex');
    created.bookings.push(item.bookingId);
    created.drafts.push(item.prepaymentDraftId);
    created.sessions.push(item.sessionId);
    created.tokens.push(tokenHash);
    await db.admin(`INSERT INTO jumpyard.roller_bookings (roller_unique_id, booking_reference, roller_env, venue_id, booking_status,
        payment_status, amount_owing_cents, total_cents, booking_date, source_last_updated_by, freshness_status)
      VALUES ($1, $1, 'live', $2, 'payment_approved_booking_syncing', 'paid', 0, 44000, $3::date, 'kiosk_terminal_approved', 'stale')`,
    [item.bookingId, VENUE, TODAY]);
    await db.admin(`INSERT INTO jumpyard.prepayment_booking_drafts (prepayment_draft_id, roller_draft_unique_id, external_id,
        idempotency_key, status, roller_env, flow_type, payment_channel, payment_attempt_id, payment_attempt_status,
        booking_confirmation_status, booking_date, total_cents, amount_owing_cents)
      VALUES ($1, $2, $3, $1, 'payment_pending', 'live', 'new_booking', 'card_present', $4, 'approved', $5, $6::date, 44000, 44000)`,
    [item.prepaymentDraftId, item.bookingId, `JY-K-${prefix}-${label}`, item.paymentAttemptId, confirmation, TODAY]);
    await db.admin(`INSERT INTO jumpyard.checkin_sessions (checkin_session_id, roller_unique_id, booking_reference, visit_date, status,
        safety_status, handoff_status, selected_ticket_ids, source_lookup_ref, expires_at, ready_for_staff_at, session_summary)
      VALUES ($1, $2, $2, $3::date, 'ready_for_staff', 'completed', 'ready_for_staff', '[]'::jsonb, $4, now() + interval '4 hours', now(),
        jsonb_build_object('paymentAttemptId', $5::text, 'bookingSyncStatus', $6::text))`,
    [item.sessionId, item.bookingId, TODAY, item.prepaymentDraftId, item.paymentAttemptId, syncStatus]);
    await db.admin(`INSERT INTO jumpyard.checkin_tokens (token_hash, roller_unique_id, channel, expires_at)
      VALUES ($1, $2, 'guest_access', now() + interval '2 hours')`, [tokenHash, item.bookingId]);
    return item;
  };
  const booking = (invokes) => loadLambda(BOOKING_PATH, { env: { AUTO_CHECKIN_FUNCTION_NAME: 'synthetic-redeem' }, invokes,
    execute: db.asRole('jumpyard_booking_runtime'), expose: ['confirmKioskReconciliation'] }).internals;
  const confirm = (item, invokes, correlationId) => booking(invokes).confirmKioskReconciliation(
    { prepaymentDraftId: item.prepaymentDraftId, paymentAttemptId: item.paymentAttemptId, correlationId },
    { bookingReference: '583101', rollerUniqueId: item.bookingId, ticketIds: [`${item.bookingId}-t1`, `${item.bookingId}-t2`] });
  const session = async (item) => (await db.admin(`SELECT booking_reference, session_summary ->> 'bookingSyncStatus' AS sync
    FROM jumpyard.checkin_sessions WHERE checkin_session_id = $1`, [item.sessionId])).rows[0];
  const started = (invokes) => payloads(invokes).map((payload) => [payload.detail.checkinSessionId, payload.detail.trigger]);

  try {
    // Group 0034 at 09:34:09: the worker's readback confirmed it, the webhook's confirmation 0.36 s later.
    const kiosk = await purchase('0034');
    const workerInvokes = [];
    const byWorker = await confirm(kiosk, workerInvokes, 'jy_gh583_worker');
    assert.equal(Number(byWorker.attached_session_count), 1);
    assert.deepEqual({ ...(await session(kiosk)) }, { booking_reference: '583101', sync: 'confirmed' });
    assert.deepEqual(started(workerInvokes), [[kiosk.sessionId, 'kiosk_booking_confirmed']]);

    const webhookInvokes = [];
    const byWebhook = await confirm(kiosk, webhookInvokes, 'jy_gh583_webhook');
    assert.equal(Number(byWebhook.attached_session_count), 1, 'the repeat still attaches, so the webhook answers confirmed');
    assert.equal(Number(byWebhook.attached_token_count), 1);
    assert.deepEqual(webhookInvokes, [], 'no second automatic check-in');

    // A purchase whose readbacks ran out (needs_staff) is admitted by the webhook's later confirmation.
    const late = await purchase('late', { syncStatus: 'needs_staff', confirmation: 'needs_staff' });
    const lateInvokes = [];
    await confirm(late, lateInvokes, 'jy_gh583_late');
    assert.equal((await session(late)).sync, 'confirmed');
    assert.deepEqual(started(lateInvokes), [[late.sessionId, 'kiosk_booking_confirmed']]);
  } finally {
    await db.admin('DELETE FROM jumpyard.checkin_tokens WHERE token_hash = ANY($1)', [created.tokens]);
    await db.admin('DELETE FROM jumpyard.checkin_sessions WHERE checkin_session_id = ANY($1)', [created.sessions]);
    await db.admin('DELETE FROM jumpyard.prepayment_booking_drafts WHERE prepayment_draft_id = ANY($1)', [created.drafts]);
    await db.admin('DELETE FROM jumpyard.roller_bookings WHERE roller_unique_id = ANY($1)', [created.bookings]);
    await client.end();
  }
});
