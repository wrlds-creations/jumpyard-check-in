'use strict';

// GH-563: a kiosk add-on that the webhook (or a lookup) confirms before the Booking Lambda's
// reconciliation worker reads it back releases its group at once. The paid-booking signal that lookup
// and webhook already send for every settled booking, and the worker's early stop, update the linked
// session from the confirmed draft and start the automatic check-in, with no staff app open and no
// ROLLER call. The board refresh on staff reads stays the safety net. These checks drive the real
// Lambda sources with a scripted Aurora Data API, Lambda and ROLLER. With GH563_DATABASE_TEST=true
// they also run the webhook, Booking and Redeem statements against PostgreSQL with each Lambda's own
// database role; nothing reaches AWS or ROLLER.

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const BOOKING_PATH = path.join(ROOT, 'infra', 'lambda', 'booking', 'index.js');
const WEBHOOK_PATH = path.join(ROOT, 'infra', 'lambda', 'webhook', 'index.js');
const REDEEM_PATH = path.join(ROOT, 'infra', 'lambda', 'redeem', 'index.js');
const SESSION_PATH = path.join(ROOT, 'infra', 'lambda', 'session', 'index.js');
const TODAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const VENUE = '50871';
const ADDON_ID = '0b7c3c1e-5630-4a5e-9d1b-56300000a563';
const DRAFT = { prepaymentDraftId: 'jypd_563a563a563a563a56', paymentAttemptId: 'jytp_563a563a563a563a56' };
const RELEASE_SQL = /WITH confirmed_draft AS \(\s+SELECT/;
const ROLLER_ENV = { ROLLER_BASE_URL_PARAMETER_NAME: '/synthetic/roller/base-url', ROLLER_ENV_PARAMETER_NAME: '/synthetic/roller/env',
  ROLLER_CREDENTIALS_SECRET_ARN: 'arn:aws:secretsmanager:eu-north-1:000000000000:secret:roller' };

function rdsResult(rows, numberOfRecordsUpdated = 0) {
  if (!rows || rows.length === 0) return { columnMetadata: [], numberOfRecordsUpdated, records: [] };
  const columns = Object.keys(rows[0]);
  return {
    columnMetadata: columns.map((name) => ({ name })),
    numberOfRecordsUpdated,
    records: rows.map((row) => columns.map((name) => dataApiField(row[name]))),
  };
}
function dataApiField(value) {
  if (value === null || value === undefined) return { isNull: true };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return Number.isInteger(value) ? { longValue: value } : { doubleValue: value };
  return { stringValue: String(value) };
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

// Loads one Lambda source with fake AWS clients; `expose` lists internal functions to return.
function loadLambda(file, { env = {}, execute, fetchImpl, invokes = [], expose = [], roller = { env: 'live', baseUrl: 'https://api.roller.app' } }) {
  const directory = path.dirname(file);
  const module = { exports: {} };
  const aws = fakeAws(async (command) => {
    if (command.name === 'ExecuteStatementCommand') return execute(command.input.sql, command.input.parameters ?? []);
    if (command.name === 'InvokeCommand') { invokes.push(command.input); return { StatusCode: 202 }; }
    if (command.name === 'GetParameterCommand') {
      const name = String(command.input?.Name ?? '');
      if (name === ROLLER_ENV.ROLLER_ENV_PARAMETER_NAME) return { Parameter: { Value: roller.env } };
      if (name === ROLLER_ENV.ROLLER_BASE_URL_PARAMETER_NAME) return { Parameter: { Value: roller.baseUrl } };
    }
    if (command.name === 'GetSecretValueCommand') return { SecretString: JSON.stringify({ clientId: 'c', clientSecret: 's' }) };
    throw new Error(`Unexpected AWS command ${command.name} during GH-563 validation.`);
  });
  vm.runInNewContext(`${fs.readFileSync(file, 'utf8')}\nmodule.exports.__gh563 = { ${expose.join(', ')} };`, {
    AbortSignal, Buffer, TextDecoder, TextEncoder, URL, URLSearchParams, clearTimeout, setTimeout,
    console: { error() {}, info() {}, log() {}, warn() {} },
    exports: module.exports, module,
    fetch: fetchImpl ?? (async () => { throw new Error('Unexpected network call during GH-563 validation.'); }),
    process: { env: { DATABASE_CLUSTER_ARN: 'arn:aws:rds:eu-north-1:000000000000:cluster:synthetic',
      DATABASE_SECRET_ARN: 'arn:aws:secretsmanager:eu-north-1:000000000000:secret:synthetic', ...env } },
    require(moduleId) {
      if (moduleId === 'crypto' || moduleId === 'node:crypto') return crypto;
      if (moduleId.startsWith('@aws-sdk/')) return aws;
      if (moduleId.startsWith('./')) return require(path.join(directory, moduleId));
      throw new Error(`Unexpected require(${JSON.stringify(moduleId)}) during GH-563 validation.`);
    },
  }, { filename: file });
  return { handler: module.exports.handler, internals: module.exports.__gh563 };
}
const payloads = (invokes) => invokes.map((invoke) => [invoke.FunctionName, invoke.InvocationType,
  JSON.parse(Buffer.from(invoke.Payload).toString('utf8'))]);
const autoCheckin = (checkinSessionId, correlationId) => ['synthetic-redeem', 'Event',
  { source: 'jumpyard.auto-checkin', detail: { checkinSessionId, correlationId, trigger: 'kiosk_add_on_confirmed' } }];
const paidBookingSignal = (rollerUniqueId, correlationId) => ({ source: 'jumpyard.phone-email-marketing', detail: { rollerUniqueId, correlationId } });

// --- Scripted Aurora ----------------------------------------------------------------------------

function bookingWithScript({ release = { updated_session_count: 1, confirmed_session_ids: '["jycs_563"]' }, failRelease = false } = {}) {
  const statements = [];
  const invokes = [];
  const network = [];
  const { handler, internals } = loadLambda(BOOKING_PATH, {
    env: { AUTO_CHECKIN_FUNCTION_NAME: 'synthetic-redeem' }, invokes, expose: ['releaseConfirmedKioskAddOn'],
    fetchImpl: async (url) => { network.push(String(url)); throw new Error('Unexpected network call during GH-563 validation.'); },
    execute: async (sql, parameters) => {
      statements.push({ sql, parameters });
      if (RELEASE_SQL.test(sql)) {
        if (failRelease) throw new Error('synthetic database failure');
        return rdsResult([release]);
      }
      return rdsResult([]);
    },
  });
  return { handler, internals, invokes, network, statements };
}

test('The paid-booking signal releases a kiosk add-on\'s group and starts its automatic check-in, with no ROLLER call', async () => {
  const run = bookingWithScript();
  await run.handler(paidBookingSignal(ADDON_ID, 'jy_gh563_webhook'));
  const sqls = run.statements.map((statement) => statement.sql);
  const release = run.statements.find((statement) => RELEASE_SQL.test(statement.sql));
  assert.ok(release, 'the signal runs the release');
  assert.equal(parameterValue(release.parameters, 'rollerUniqueId'), ADDON_ID, 'keyed by the add-on booking ROLLER confirmed');
  assert.ok(sqls.findIndex((sql) => sql.includes('UPDATE jumpyard.checkin_sessions AS cs')) < sqls.indexOf(release.sql),
    'after the phone confirmation that rides the same signal (GH-458)');
  assert.deepEqual(payloads(run.invokes), [autoCheckin('jycs_563', 'jy_gh563_webhook')]);
  const audit = run.statements.find((statement) => /INSERT INTO jumpyard\.event_log/.test(statement.sql));
  assert.equal(parameterValue(audit.parameters, 'eventType'), 'booking.kiosk_add_on_released');
  assert.deepEqual(JSON.parse(parameterValue(audit.parameters, 'eventPayload')),
    { confirmedSessionCount: 1, sessionCount: 1, trigger: 'paid_booking_signal' });
  assert.deepEqual(run.network, [], 'no ROLLER call: the webhook already wrote everything the release reads');
});

test('A release that changes nothing, fails or has no booking id starts nothing and never fails the signal', async () => {
  const unchanged = bookingWithScript({ release: { updated_session_count: 0, confirmed_session_ids: null } });
  await unchanged.handler(paidBookingSignal(ADDON_ID, 'jy_gh563_replay'));
  assert.equal(unchanged.statements.filter((statement) => RELEASE_SQL.test(statement.sql)).length, 1);
  assert.deepEqual(unchanged.invokes, [], 'a replayed or unrelated booking admits nobody');
  assert.equal(unchanged.statements.some((statement) => /INSERT INTO jumpyard\.event_log/.test(statement.sql)), false);

  // Another add-on of the group still needs staff: the session changes to needs_staff, and nobody is admitted.
  const needsStaff = bookingWithScript({ release: { updated_session_count: 1, confirmed_session_ids: null } });
  assert.deepEqual(plain(await needsStaff.internals.releaseConfirmedKioskAddOn(ADDON_ID, 'jy_gh563', 'paid_booking_signal')), { status: 'updated' });
  assert.deepEqual(needsStaff.invokes, []);

  const failing = bookingWithScript({ failRelease: true });
  const response = await failing.handler(paidBookingSignal(ADDON_ID, 'jy_gh563_failure'));
  assert.equal(response?.status, 'blocked', 'the signal still reaches the marketing step, which stays closed here');
  assert.deepEqual(failing.invokes, []);
  assert.deepEqual(plain(await failing.internals.releaseConfirmedKioskAddOn(ADDON_ID, 'jy_gh563', 'paid_booking_signal')), { status: 'failed' });

  for (const rollerUniqueId of [undefined, '', 'x'.repeat(129)]) {
    const ignored = bookingWithScript();
    assert.deepEqual(plain(await ignored.internals.releaseConfirmedKioskAddOn(rollerUniqueId, 'jy_gh563', 'paid_booking_signal')), { status: 'ignored' });
    assert.equal(ignored.statements.length, 0);
  }
});

function draftRow(overrides = {}) {
  return {
    prepayment_draft_id: DRAFT.prepaymentDraftId, payment_attempt_id: DRAFT.paymentAttemptId, roller_draft_unique_id: ADDON_ID,
    flow_type: 'add_product', add_on_group_id: 'jyao_563', payment_attempt_status: 'approved', status: 'payment_pending',
    booking_confirmation_status: 'pending', roller_env: 'live', booking_date: TODAY, total_cents: 9800,
    payment_approved_at: new Date().toISOString(), checkin_session_id: null, ...overrides,
  };
}
const CONFIRMED_BY_WEBHOOK = { payment_attempt_status: 'reconciled', status: 'published', booking_confirmation_status: 'confirmed',
  reconciliation_last_result: 'confirmed_by_webhook' };

function workerWithScript(findRows) {
  const statements = [];
  const invokes = [];
  const network = [];
  let finds = 0;
  const { internals } = loadLambda(BOOKING_PATH, {
    env: { AUTO_CHECKIN_FUNCTION_NAME: 'synthetic-redeem', ENABLE_ROLLER_BOOKING_DRAFT_WRITES: 'true', JUMPYARD_EMERGENCY_STOP: 'false', ...ROLLER_ENV },
    invokes, expose: ['handleKioskPaymentReconciliation'], roller: { env: 'playground', baseUrl: 'https://api.playground.roller.app' },
    fetchImpl: async (url, init = {}) => {
      const target = new URL(String(url));
      network.push(`${init.method ?? 'GET'} ${target.pathname}`);
      if (target.pathname === '/token') {
        return { ok: true, status: 200, async json() { return { access_token: 't', token_type: 'Bearer', expires_in: 3600 }; },
          async text() { return '{"access_token":"t","token_type":"Bearer","expires_in":3600}'; } };
      }
      throw new Error(`Unexpected ROLLER call during GH-563 validation: ${target.pathname}`);
    },
    execute: async (sql, parameters) => {
      statements.push({ sql, parameters });
      if (/FROM jumpyard\.prepayment_booking_drafts AS draft\s+LEFT JOIN LATERAL/.test(sql)) {
        const row = findRows[Math.min(finds, findRows.length - 1)];
        finds += 1;
        return rdsResult([row]);
      }
      if (/SET reconciliation_started_at = COALESCE\(reconciliation_started_at, now\(\)\)/.test(sql)) {
        return rdsResult([{ roller_draft_unique_id: ADDON_ID, payment_approved_at: new Date().toISOString(), amount_owing_cents: 9800,
          kiosk_installation_id: null, terminal_transaction_ref: null, terminal_merchant_id: null }]);
      }
      if (RELEASE_SQL.test(sql)) return rdsResult([{ updated_session_count: 1, confirmed_session_ids: '["jycs_563"]' }]);
      return rdsResult([]);
    },
  });
  return { internals, invokes, network, statements };
}

test('The worker that finds its add-on confirmed by the webhook releases the group instead of stopping silently', async () => {
  // Saturday 2026-10-17 09:54: approved at :05, the webhook confirmed at :59 between two readbacks.
  const race = workerWithScript([draftRow(), draftRow(CONFIRMED_BY_WEBHOOK)]);
  const result = await race.internals.handleKioskPaymentReconciliation(DRAFT, 'jy_gh563_worker');
  assert.equal(result.status, 'confirmed');
  const releases = race.statements.filter((statement) => RELEASE_SQL.test(statement.sql));
  assert.equal(releases.length, 1);
  assert.equal(parameterValue(releases[0].parameters, 'rollerUniqueId'), ADDON_ID);
  assert.deepEqual(payloads(race.invokes), [autoCheckin('jycs_563', 'jy_gh563_worker')]);
  assert.deepEqual(race.network, ['POST /token'], 'the worker\'s usual token; no booking readback or publish after the webhook');
  const audit = race.statements.find((statement) => /INSERT INTO jumpyard\.event_log/.test(statement.sql)
    && parameterValue(statement.parameters, 'eventType') === 'booking.kiosk_add_on_released');
  assert.equal(JSON.parse(parameterValue(audit.parameters, 'eventPayload')).trigger, 'reconciliation_worker');

  // A worker that starts after the webhook confirmed releases at its first check, with no ROLLER call.
  const late = workerWithScript([draftRow(CONFIRMED_BY_WEBHOOK)]);
  assert.equal((await late.internals.handleKioskPaymentReconciliation(DRAFT, 'jy_gh563_late')).status, 'confirmed');
  assert.equal(late.statements.filter((statement) => RELEASE_SQL.test(statement.sql)).length, 1);
  assert.deepEqual(payloads(late.invokes), [autoCheckin('jycs_563', 'jy_gh563_late')]);
  assert.deepEqual(late.network, []);
});

test('The release uses the worker\'s own effective state, admits only changed sessions and never reads ROLLER', () => {
  const booking = fs.readFileSync(BOOKING_PATH, 'utf8').replace(/\r\n/g, '\n');
  const slice = (text, start, end) => text.slice(text.indexOf(start), text.indexOf(end, text.indexOf(start)));
  const release = slice(booking, 'async function releaseConfirmedKioskAddOn(', 'async function persistKioskReconciliationBookingSnapshot(');
  for (const rule of [
    "draft.payment_channel = 'card_present'", "draft.flow_type = 'add_product'", 'draft.add_on_group_id IS NOT NULL',
    "draft.payment_attempt_status IN ('approved', 'reconciled')", "draft.booking_confirmation_status = 'confirmed'",
    "${linkedAddOnEffectiveSyncCte('confirmed_draft')}", "session.status IN ('guest_in_progress', 'ready_for_staff', 'staff_in_progress')",
    'session.visit_date IS NOT DISTINCT FROM sync.booking_date', "'linkedAddOnSyncSource', 'confirmed_add_on_draft'",
    "COALESCE(session.session_summary ->> 'bookingSyncStatus', 'confirmed')\n             IS DISTINCT FROM sync.booking_sync_status",
    "WHERE booking_sync_status = 'confirmed')::text AS confirmed_session_ids",
    "requestAutoCheckin(confirmedSessionIds, 'kiosk_add_on_confirmed', correlationId)",
  ]) {
    assert.ok(release.includes(rule), rule);
  }
  // The booking role has no SELECT on booking_links (migration 0011), and the release calls no ROLLER helper.
  assert.doesNotMatch(release, /booking_links|getRollerJson|postRollerJson|getRollerAccessToken|fetch\(/);
  // The worker's own confirmation is unchanged: it still admits every session it updates.
  const confirm = slice(booking, 'async function confirmKioskAddProductReconciliation(', 'async function releaseConfirmedKioskAddOn(');
  assert.match(confirm, /'linkedAddOnSyncSource', 'kiosk_terminal_add_product'/);
  assert.match(confirm, /requestAutoCheckin\(parseJsonArraySafe\(confirmed\.linked_add_on_session_ids\), 'kiosk_add_on_confirmed'/);
  const signal = slice(booking, 'if (isPhoneEmailMarketingEvent) {', 'if (isKioskReconciliationEvent(event)) {');
  const order = ['await confirmPhoneProvisionalHandoff(event.detail, correlationId);',
    "await releaseConfirmedKioskAddOn(event.detail?.rollerUniqueId, correlationId, 'paid_booking_signal');",
    'return await handlePhoneEmailMarketing(event.detail, correlationId);'].map((call) => signal.indexOf(call));
  assert.ok(order[0] >= 0 && order[0] < order[1] && order[1] < order[2], 'phone confirmation, then the release, then marketing');
  assert.equal((slice(booking, 'async function handleKioskPaymentReconciliation(', 'async function handleKioskAuthoritativeConfirmation(')
    .match(/releaseConfirmedKioskAddOn\((existing|current)\.roller_draft_unique_id, correlationId, 'reconciliation_worker'\)/g) ?? []).length, 2);
  // Lookup and webhook still send the signal for every settled booking, and the board refresh stays the safety net.
  for (const file of [WEBHOOK_PATH, path.join(ROOT, 'infra', 'lambda', 'lookup', 'index.js')]) {
    assert.match(fs.readFileSync(file, 'utf8'), /await requestPhoneEmailMarketing\(booking, correlationId\);/);
  }
  const session = fs.readFileSync(SESSION_PATH, 'utf8').replace(/\r\n/g, '\n');
  for (const call of [
    'if (!query.cursor) await refreshLinkedAddOnEffectiveSyncState(null, auth.staff.venueId);',
    'async function findReadyStaffSessions(request, staffVenueId = null) {\n  await refreshLinkedAddOnEffectiveSyncState(null, staffVenueId);',
    'async function findStaffSessionDetail(checkinSessionId, staffVenueId = null) {\n  await refreshLinkedAddOnEffectiveSyncState(checkinSessionId, staffVenueId);',
  ]) {
    assert.ok(session.includes(call), call);
  }
  assert.match(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'),
    /"validate:gh563-addon-release": "node --test scripts\/validate-gh563-addon-release\.test\.js"/);
  assert.match(fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8'), /GH563_DATABASE_TEST: 'true'/);
});

// --- PostgreSQL ---------------------------------------------------------------------------------

// Returns Data API shaped results for one Lambda's role. Statements run one at a time on one
// connection, each under `SET ROLE`, so every Lambda is held to its own grants.
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
      return {
        columnMetadata: result.fields.map((field) => ({ name: field.name })),
        numberOfRecordsUpdated: result.rowCount ?? 0,
        records: result.rows.map((row) => result.fields.map((field) => dataApiField(row[field.name]))),
      };
    } finally {
      await client.query('RESET ROLE');
    }
  });
  const admin = (sql, values = []) => serial(() => client.query(sql, values));
  return { admin, asRole };
}

function rollerFake(bookingId, bookingReference, ticketIds) {
  const calls = [];
  let redeemed = false;
  const json = (status, body) => ({ ok: status >= 200 && status < 300, status, async json() { return body; }, async text() { return JSON.stringify(body); } });
  const fetchImpl = async (url, init = {}) => {
    const target = new URL(String(url));
    const method = init.method ?? 'GET';
    calls.push(`${method} ${target.pathname}`);
    if (target.pathname === '/token') return json(200, { access_token: 'synthetic-token', token_type: 'Bearer', expires_in: 3600 });
    if (target.pathname === '/products') return json(200, []);
    if (target.pathname === `/bookings/${bookingId}`) {
      return json(200, { uniqueId: bookingId, bookingReference, status: 'Confirmed', paymentStatus: 'Paid', amountOwing: 0, total: 400,
        venueId: Number(VENUE), items: [{ bookingItemId: `${bookingReference}-item`, productId: 900001, productName: '90 min entré',
          productType: 'standardPass', quantity: ticketIds.length, bookingDate: TODAY, startTime: '00:00:00', endTime: '23:59:00',
          tickets: ticketIds.map((ticketId) => ({ ticketId, redeemStatus: redeemed ? 'Redeemed' : 'Unredeemed', locations: [] })) }] });
    }
    if (target.pathname === '/redemptions' && method === 'POST') { redeemed = true; return json(200, { redeemed: ticketIds }); }
    throw new Error(`Unexpected ROLLER call during GH-563 validation: ${method} ${target.pathname}`);
  };
  return { calls, fetchImpl };
}

const REDEEM_ENV = {
  ENABLE_ROLLER_REDEEM_WRITES: 'true', ENABLE_T0166_LIVE_REDEEM_SMOKE: 'false', ENABLE_T0176_FULL_FLOW_REHEARSAL: 'true',
  JUMPYARD_EMERGENCY_STOP: 'false', JUMPYARD_ENVIRONMENT: 'park-test', STAFF_IDENTITY_VENUE_ID: VENUE,
  T0176_FULL_FLOW_ALLOWED_OPERATING_DATES: TODAY, T0176_FULL_FLOW_VENUE_ID: VENUE, ...ROLLER_ENV,
};

test('PostgreSQL: a webhook-confirmed kiosk add-on checks its group in with no staff read; needs_staff and pending stay', {
  skip: process.env.GH563_DATABASE_TEST !== 'true',
}, async () => {
  const { Client } = require('../infra/node_modules/pg');
  const port = Number(process.env.GH563_PGPORT || 55563);
  assert.ok([55563, 55435].includes(port), 'Only disposable loopback test databases are allowed.');
  const rawText = new Set([114, 3802, 1082, 1083, 1114, 1184, 1266]);
  const client = new Client({ host: '127.0.0.1', port, database: 'jumpyard_cloud', user: port === 55563 ? 'postgres' : 'gh345_test',
    password: '', ssl: false, types: { getTypeParser: (oid, format) => (rawText.has(oid) ? (value) => value
      : oid === 20 ? Number : require('../infra/node_modules/pg').types.getTypeParser(oid, format)) } });
  await client.connect();
  const db = createDatabase(client);
  const prefix = `gh563_${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`;
  const hex = (label, length) => crypto.createHash('sha256').update(`${prefix}:${label}`).digest('hex').slice(0, length);
  const uuid = (label) => { const h = hex(label, 32); return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`; };
  const created = { bookings: [], drafts: [], links: [], references: [], sessions: [] };

  const insertBooking = async (label, { reference, tickets = [] } = {}) => {
    const id = `${prefix}-${label}`;
    created.bookings.push(id);
    created.references.push(reference);
    await db.admin(`INSERT INTO jumpyard.roller_bookings (roller_unique_id, booking_reference, roller_env, venue_id, booking_status,
        payment_status, amount_owing_cents, total_cents, booking_date, start_time, end_time, source_last_updated_by, freshness_status,
        last_seen_from_roller_at, normalized_summary)
      VALUES ($1, $2, 'live', $3, 'confirmed', 'paid', 0, 40000, $4::date, '00:00:00', '23:59:00', 'roller_webhook_enrichment', 'fresh', now(),
        jsonb_build_object('bookingName', 'Gäst GH563'))`, [id, reference, VENUE, TODAY]);
    if (tickets.length > 0) {
      await db.admin(`INSERT INTO jumpyard.roller_booking_items (booking_item_key, roller_unique_id, booking_item_id, product_id, product_name,
          quantity, booking_date, start_time, end_time, item_summary)
        VALUES ($1, $2, $3, '900001', '90 min entré', $4, $5::date, '00:00:00', '23:59:00', jsonb_build_object('productType', 'standardPass'))`,
      [`jybi_${hex(label, 20)}`, id, `${reference}-item`, tickets.length, TODAY]);
      for (const ticketId of tickets) {
        await db.admin(`INSERT INTO jumpyard.roller_booking_tickets (ticket_id, roller_unique_id, booking_item_key, booking_item_id, product_id,
            booking_date, ticket_summary) VALUES ($1, $2, $3, $4, '900001', $5::date, jsonb_build_object('source', 'roller_live'))`,
        [ticketId, id, `jybi_${hex(label, 20)}`, `${reference}-item`, TODAY]);
      }
    }
    return id;
  };
  const insertSession = async (label, bookingId, reference, { syncStatus, tickets = [] }) => {
    const id = `jycs_${hex(label, 8)}_${hex(`${label}:s`, 8)}`;
    created.sessions.push(id);
    await db.admin(`INSERT INTO jumpyard.checkin_sessions (checkin_session_id, roller_unique_id, booking_reference, visit_date, status,
        safety_status, handoff_status, selected_ticket_ids, expires_at, ready_for_staff_at, session_summary)
      VALUES ($1, $2, $3, $4::date, 'ready_for_staff', 'completed', 'ready_for_staff', $5::jsonb, now() + interval '4 hours', now(),
        jsonb_build_object('bookingSyncStatus', $6::text, 'linkedAddOnSyncSource', 'kiosk_terminal_add_product'))`,
    [id, bookingId, reference, TODAY, JSON.stringify(tickets), syncStatus]);
    return id;
  };
  // An approved kiosk add-on draft and its link, as the kiosk and Booking Lambda leave them.
  const insertAddOn = async (label, originalId, originalReference, { attempt = 'approved', confirmation = 'pending', status = 'payment_pending' } = {}) => {
    const addOn = { id: uuid(label), prepaymentDraftId: `jypd_${hex(`${label}:d`, 18)}`, paymentAttemptId: `jytp_${hex(`${label}:a`, 18)}` };
    created.drafts.push(addOn.prepaymentDraftId);
    created.links.push(`jybl_${hex(label, 18)}`);
    await db.admin(`INSERT INTO jumpyard.prepayment_booking_drafts (prepayment_draft_id, roller_draft_unique_id, external_id, idempotency_key,
        status, roller_env, item_count, items_summary, flow_type, payment_channel, payment_attempt_id, payment_attempt_status,
        booking_confirmation_status, add_on_group_id, original_roller_unique_id, booking_date, total_cents, amount_owing_cents)
      VALUES ($1, $2, $3, $1, $4, 'live', 1, '[]'::jsonb, 'add_product', 'card_present', $5, $6, $7, $8, $9, $10::date, 9800, 9800)`,
    [addOn.prepaymentDraftId, addOn.id, `JY-A-${prefix}-${label}`, status, addOn.paymentAttemptId, attempt, confirmation,
      `jyao_${hex(label, 12)}`, originalId, TODAY]);
    await db.admin(`INSERT INTO jumpyard.booking_links (link_id, link_type, original_roller_unique_id, original_booking_reference,
        linked_roller_unique_id, add_on_group_id, status) VALUES ($1, 'add_product_draft', $2, $3, $4, $5, 'payment_pending')`,
    [`jybl_${hex(label, 18)}`, originalId, originalReference, addOn.id, `jyao_${hex(label, 12)}`]);
    return addOn;
  };
  // What the webhook's upsert writes for the paid add-on booking before it reconciles the draft.
  const storePaidAddOnBooking = async (addOn, reference) => {
    created.bookings.push(addOn.id);
    created.references.push(reference);
    await db.admin(`INSERT INTO jumpyard.roller_bookings (roller_unique_id, booking_reference, roller_env, venue_id, booking_status,
        payment_status, amount_owing_cents, total_cents, booking_date, source_last_updated_by, freshness_status, last_seen_from_roller_at)
      VALUES ($1, $2, 'live', $3, 'confirmed', 'paid', 0, 9800, $4::date, 'roller_webhook_enrichment', 'fresh', now())`, [addOn.id, reference, VENUE, TODAY]);
    await db.admin(`INSERT INTO jumpyard.roller_booking_items (booking_item_key, roller_unique_id, booking_item_id, product_id, product_name,
        quantity, booking_date)
      VALUES ($1, $2, $3, '1765445', 'JumpSocks', 2, $4::date)`, [`jybi_${hex(reference, 20)}`, addOn.id, `${reference}-item`, TODAY]);
  };
  const sessionState = async (id) => (await db.admin(`SELECT status, session_summary ->> 'bookingSyncStatus' AS sync,
      session_summary ->> 'linkedAddOnSyncSource' AS source FROM jumpyard.checkin_sessions WHERE checkin_session_id = $1`, [id])).rows[0];
  const webhook = (invokes) => loadLambda(WEBHOOK_PATH, { env: { PHONE_EMAIL_MARKETING_FUNCTION_NAME: 'synthetic-booking',
    KIOSK_AUTHORITATIVE_CONFIRMATION_FUNCTION_NAME: 'synthetic-booking' }, invokes, execute: db.asRole('jumpyard_webhook_runtime'),
  expose: ['reconcilePrepaymentDraftFromPaidBooking'] });
  const booking = (invokes) => loadLambda(BOOKING_PATH, { env: { AUTO_CHECKIN_FUNCTION_NAME: 'synthetic-redeem' }, invokes,
    execute: db.asRole('jumpyard_booking_runtime'), expose: ['confirmKioskAddProductReconciliation'] });
  const paidAddOn = (addOn, reference) => ({ rollerUniqueId: addOn.id, bookingReference: reference, paymentStatus: 'Paid', amountOwing: 0, total: 98 });

  try {
    // Saturday's case: a pre-booked pair finished at the kiosk and bought socks; the webhook confirmed first.
    const tickets = [`${prefix}-t1`, `${prefix}-t2`];
    const original = await insertBooking('race', { reference: '563001', tickets });
    const session = await insertSession('race', original, '563001', { syncStatus: 'pending', tickets });
    const socks = await insertAddOn('race-socks', original, '563001');
    await storePaidAddOnBooking(socks, '563002');

    const webhookInvokes = [];
    await webhook(webhookInvokes).internals.reconcilePrepaymentDraftFromPaidBooking(paidAddOn(socks, '563002'), 'roller_webhook_enrichment', 'jy_gh563_webhook');
    const draft = (await db.admin(`SELECT status, payment_attempt_status, booking_confirmation_status, reconciliation_last_result
      FROM jumpyard.prepayment_booking_drafts WHERE prepayment_draft_id = $1`, [socks.prepaymentDraftId])).rows[0];
    assert.deepEqual({ ...draft }, { status: 'published', payment_attempt_status: 'reconciled', booking_confirmation_status: 'confirmed',
      reconciliation_last_result: 'confirmed_by_webhook' });
    assert.equal((await sessionState(session)).sync, 'pending', 'the webhook itself still leaves the session pending (the bug\'s start)');
    const signals = payloads(webhookInvokes).filter(([, , payload]) => payload.source === 'jumpyard.phone-email-marketing');
    assert.deepEqual(signals, [['synthetic-booking', 'Event', paidBookingSignal(socks.id, 'jy_gh563_webhook')]]);

    const bookingInvokes = [];
    await booking(bookingInvokes).handler(signals[0][2]);
    assert.deepEqual({ ...(await sessionState(session)) }, { status: 'ready_for_staff', sync: 'confirmed', source: 'confirmed_add_on_draft' });
    assert.deepEqual(payloads(bookingInvokes), [autoCheckin(session, 'jy_gh563_webhook')]);
    const audit = (await db.admin(`SELECT event_payload FROM jumpyard.event_log WHERE event_type = 'booking.kiosk_add_on_released'
      AND subject_ref = $1`, [socks.id])).rows;
    assert.equal(audit.length, 1);

    // The Redeem Lambda admits the group from that invoke alone; no staff device read the board.
    const roller = rollerFake(original, '563001', tickets);
    const redeem = loadLambda(REDEEM_PATH, { env: REDEEM_ENV, execute: db.asRole('jumpyard_redeem_runtime'), fetchImpl: roller.fetchImpl });
    const admitted = await redeem.handler(payloads(bookingInvokes)[0][2]);
    assert.equal(admitted.status, 'redeemed', JSON.stringify(admitted));
    assert.equal((await sessionState(session)).status, 'redeemed');
    assert.equal(roller.calls.filter((call) => call === 'POST /redemptions').length, 1);

    // ROLLER's later Updated webhook repeats the signal: nothing changes and nobody is admitted twice.
    const replayInvokes = [];
    await booking(replayInvokes).handler(paidBookingSignal(socks.id, 'jy_gh563_replay'));
    assert.deepEqual(replayInvokes, []);

    // needs_staff stays needs_staff: the group's other add-on ran out of the window without ROLLER's booking.
    const staffBooking = await insertBooking('staff', { reference: '563011' });
    const staffSession = await insertSession('staff', staffBooking, '563011', { syncStatus: 'needs_staff' });
    const water = await insertAddOn('staff-water', staffBooking, '563011', { attempt: 'reconciled', confirmation: 'confirmed', status: 'published' });
    await insertAddOn('staff-coffee', staffBooking, '563011', { confirmation: 'needs_staff' });
    const staffInvokes = [];
    await booking(staffInvokes).handler(paidBookingSignal(water.id, 'jy_gh563_staff'));
    assert.equal((await sessionState(staffSession)).sync, 'needs_staff');
    assert.deepEqual(staffInvokes, []);

    // A pending sibling keeps the group pending until ROLLER confirms that one too.
    const pendingBooking = await insertBooking('pending', { reference: '563021' });
    const pendingSession = await insertSession('pending', pendingBooking, '563021', { syncStatus: 'pending' });
    const first = await insertAddOn('pending-first', pendingBooking, '563021', { attempt: 'reconciled', confirmation: 'confirmed', status: 'published' });
    await insertAddOn('pending-second', pendingBooking, '563021');
    const pendingInvokes = [];
    await booking(pendingInvokes).handler(paidBookingSignal(first.id, 'jy_gh563_pending'));
    assert.equal((await sessionState(pendingSession)).sync, 'pending');
    assert.deepEqual(pendingInvokes, []);

    // An approved add-on ROLLER has not confirmed, and a booking that is no kiosk add-on, change nothing.
    const quiet = await insertAddOn('quiet', pendingBooking, '563021');
    for (const id of [quiet.id, uuid('not-an-add-on')]) {
      const quietInvokes = [];
      await booking(quietInvokes).handler(paidBookingSignal(id, 'jy_gh563_quiet'));
      assert.deepEqual(quietInvokes, []);
    }
    assert.equal((await sessionState(pendingSession)).sync, 'pending');

    // The worker's own confirmation behaves as before, and the signal after it admits nobody twice.
    const workerBooking = await insertBooking('worker', { reference: '563031' });
    const workerSession = await insertSession('worker', workerBooking, '563031', { syncStatus: 'pending' });
    const pizza = await insertAddOn('worker-pizza', workerBooking, '563031');
    const workerInvokes = [];
    const worker = booking(workerInvokes);
    const confirmed = await worker.internals.confirmKioskAddProductReconciliation({ ...pizza, correlationId: 'jy_gh563_worker' },
      { bookingReference: '563032' });
    assert.equal(Number(confirmed.linked_add_on_session_count), 1);
    assert.deepEqual({ ...(await sessionState(workerSession)) }, { status: 'ready_for_staff', sync: 'confirmed', source: 'kiosk_terminal_add_product' });
    assert.deepEqual(payloads(workerInvokes), [autoCheckin(workerSession, 'jy_gh563_worker')]);
    await worker.handler(paidBookingSignal(pizza.id, 'jy_gh563_after_worker'));
    assert.equal(workerInvokes.length, 1, 'only a changed session is admitted');
  } finally {
    await db.admin('DELETE FROM jumpyard.event_log WHERE subject_ref = ANY($1) OR event_id = ANY($2)', [
      [...created.bookings, ...created.references, ...created.sessions],
      [...created.drafts.map((id) => `prepayment-draft-published:${id}`), ...created.links.map((id) => `booking-link-published:${id}`)],
    ]);
    await db.admin('DELETE FROM jumpyard.idempotency_records WHERE idempotency_key = ANY($1)',
      [created.sessions.map((id) => `staff-redeem:${id}`)]);
    await db.admin('DELETE FROM jumpyard.checkin_attempts WHERE roller_unique_id = ANY($1)', [created.bookings]);
    await db.admin('DELETE FROM jumpyard.booking_links WHERE link_id = ANY($1)', [created.links]);
    await db.admin('DELETE FROM jumpyard.prepayment_booking_drafts WHERE prepayment_draft_id = ANY($1)', [created.drafts]);
    await db.admin('DELETE FROM jumpyard.roller_bookings WHERE roller_unique_id = ANY($1)', [created.bookings]);
    await client.end();
  }
});
