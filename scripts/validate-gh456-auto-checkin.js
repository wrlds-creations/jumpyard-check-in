'use strict';

// GH-456 (D0230): every completed check-in is admitted in ROLLER automatically, through the same
// path and idempotency key as staff "Checka in", inside the check-in window. GH-453 (D0229): a
// reopened visit keeps its number after admission. These checks drive the real Redeem and Session
// Lambdas with a scripted Aurora Data API and ROLLER.

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const REDEEM_PATH = path.join(ROOT, 'infra', 'lambda', 'redeem', 'index.js');
const SESSION_DIR = path.join(ROOT, 'infra', 'lambda', 'session');
const SESSION_PATH = path.join(SESSION_DIR, 'index.js');
const BOOKING_PATH = path.join(ROOT, 'infra', 'lambda', 'booking', 'index.js');
const VENUE = '50871';
const BOOKING_ID = 'roller-booking-456';
const BOOKING_REFERENCE = '456001';
const SESSION_ID = 'jycs_456';
const TICKETS = ['456001-1', '456001-2'];
const IDEMPOTENCY_KEY = `staff-redeem:${SESSION_ID}`;
const stockholmDay = (offsetDays = 0) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date(Date.now() + offsetDays * 86400000));
const TODAY = stockholmDay(0);
const TOMORROW = stockholmDay(1);
const YESTERDAY = stockholmDay(-1);

function rdsResult(rows, numberOfRecordsUpdated = 0) {
  if (!rows || rows.length === 0) return { columnMetadata: [], numberOfRecordsUpdated, records: [] };
  const columns = Object.keys(rows[0]);
  return {
    columnMetadata: columns.map((name) => ({ name })),
    numberOfRecordsUpdated,
    records: rows.map((row) => columns.map((name) => {
      const value = row[name];
      if (value === null || value === undefined) return { isNull: true };
      if (typeof value === 'number') return { longValue: value };
      if (typeof value === 'boolean') return { booleanValue: value };
      return { stringValue: String(value) };
    })),
  };
}

const parameterValue = (parameters, name) => (parameters ?? []).find((parameter) => parameter.name === name)?.value?.stringValue ?? null;

function ticketJson(redeemStatusLastSeen = null, bookingDate = TODAY) {
  return JSON.stringify(TICKETS.map((ticketId) => ({
    ticketId, bookingItemId: 'item-1', productId: '900001', bookingDate, redeemStatusLastSeen,
    lastSeenFromRollerAt: `${bookingDate}T09:00:00.000Z`, ticketProductType: 'standardPass', ticketProductSubType: null,
    ticketSource: 'roller_live', itemProductType: 'standardPass', itemProductSubType: null, itemParentType: null,
    productCatalogType: null, productCatalogSubType: null, productCatalogParentType: null,
    productName: '60 min entré', parentProductName: null,
  })));
}

function bookingRow({ bookingDate = TODAY, startTime = '00:00:00', endTime = '23:59:00', redeemed = null } = {}) {
  return {
    roller_unique_id: BOOKING_ID, booking_reference: BOOKING_REFERENCE, roller_env: 'live', booking_status: 'confirmed',
    payment_status: 'paid', amount_owing_cents: 0, total_cents: 40000, booking_date: bookingDate, venue_id: VENUE,
    start_time: startTime, end_time: endTime, freshness_status: 'fresh', is_tombstoned: false,
    last_seen_from_roller_at: `${bookingDate}T09:00:00.000Z`, tickets_json: ticketJson(redeemed, bookingDate),
  };
}

// The manifest rows readManifest selects for this booking: one admission line by default (GH-491).
function manifestRow(overrides = {}) {
  return {
    roller_unique_id: BOOKING_ID, booking_item_id: 'item-1', product_id: '900001', parent_product_id: null,
    product_name: '60 min entré', parent_product_name: null, quantity: 2, booking_date: TODAY,
    start_time: '14:00:00', end_time: '15:00:00', selected_units: 2,
    summary: JSON.stringify({ productType: 'standardPass' }), ...overrides,
  };
}

function staffSessionRow(script = {}) {
  return {
    checkin_session_id: SESSION_ID, roller_unique_id: BOOKING_ID, booking_reference: BOOKING_REFERENCE,
    visit_date: script.visitDate ?? TODAY, status: script.status ?? 'ready_for_staff', safety_status: 'completed',
    handoff_code: '0427', handoff_status: script.status === 'redeemed' ? 'completed' : 'ready_for_staff',
    booking_sync_status: script.syncStatus ?? 'confirmed', selected_ticket_ids: JSON.stringify(TICKETS),
    expires_at: '2999-01-01T00:00:00.000Z', ready_for_staff_at: `${TODAY}T10:00:00.000Z`, completed_at: null,
    updated_at: `${TODAY}T10:00:00.000Z`, checked_in_by: null,
    handout_claim: script.claim ? JSON.stringify({ actorId: 'staff-1', operationId: null }) : null,
  };
}

function redeemedSessionRow() {
  return { ...staffSessionRow({ status: 'redeemed' }), completed_at: `${TODAY}T10:01:00.000Z` };
}

function rollerBooking(ticketStatus = 'Unredeemed') {
  return {
    uniqueId: BOOKING_ID, bookingReference: BOOKING_REFERENCE, status: 'Confirmed', paymentStatus: 'Paid',
    amountOwing: 0, total: 400, venueId: Number(VENUE),
    items: [{ bookingItemId: 'item-1', productId: 900001, productName: '60 min entré', productType: 'standardPass',
      quantity: TICKETS.length, bookingDate: TODAY, startTime: '00:00:00', endTime: '23:59:00',
      tickets: TICKETS.map((ticketId) => ({ ticketId, redeemStatus: ticketStatus, locations: [] })) }],
  };
}

function createRedeemDatabase(script = {}) {
  const state = { calls: [], lastRequestHash: null };
  const execute = async (sql, parameters) => {
    state.calls.push({ sql, parameters });
    if (/WITH marked_tickets AS/.test(sql)) {
      if (/UPDATE jumpyard\.checkin_sessions/.test(sql)) return rdsResult([redeemedSessionRow()], 1);
      return rdsResult([{ marked_tickets: TICKETS.length, completed_keys: 1 }]);
    }
    if (/WITH previous AS/.test(sql)) return rdsResult([{ attempts: (script.previousAttempts ?? 0) + 1 }], 1);
    if (/FROM jumpyard\.checkin_sessions AS cs/.test(sql)) return script.noSession ? rdsResult([]) : rdsResult([staffSessionRow(script)]);
    if (/FROM jumpyard\.roller_bookings AS b/.test(sql)) return rdsResult([bookingRow({ bookingDate: script.visitDate ?? TODAY })]);
    if (/INSERT INTO jumpyard\.roller_bookings/.test(sql)) return rdsResult([], 1);
    if (/INSERT INTO jumpyard\.roller_booking_items/.test(sql)) return rdsResult([{ booking_item_key: 'jybi_456' }], 1);
    if (/INSERT INTO jumpyard\.roller_booking_tickets/.test(sql)) return rdsResult([], 1);
    if (/INSERT INTO jumpyard\.idempotency_records/.test(sql)) {
      state.lastRequestHash = parameterValue(parameters, 'requestHash');
      return rdsResult([], 1);
    }
    if (/UPDATE jumpyard\.idempotency_records\s+SET status = :status/.test(sql)) return rdsResult([], 1);
    if (/SELECT status\s+FROM jumpyard\.idempotency_records/.test(sql)) {
      return script.receiptByKey ? rdsResult([{ status: 'succeeded' }]) : rdsResult([]);
    }
    if (/UPDATE jumpyard\.checkin_sessions\s+SET\s+status = 'redeemed'/.test(sql)) return rdsResult([redeemedSessionRow()], 1);
    if (/INSERT INTO jumpyard\.checkin_attempts/.test(sql)) return rdsResult([], 1);
    if (/INSERT INTO jumpyard\.event_log/.test(sql)) return rdsResult([], 1);
    throw new Error(`Unexpected SQL during GH-456 validation: ${sql.slice(0, 90)}`);
  };
  return { execute, state };
}

function createRoller(script = {}) {
  const calls = [];
  const json = (status, body) => ({ ok: status >= 200 && status < 300, status,
    async json() { return body; }, async text() { return JSON.stringify(body); } });
  const fetchImpl = async (url, init = {}) => {
    const target = new URL(String(url));
    const method = init.method ?? 'GET';
    calls.push(`${method} ${target.pathname}`);
    if (target.pathname === '/token') return json(200, { access_token: 'synthetic-token', token_type: 'Bearer', expires_in: 3600 });
    if (target.pathname === '/products') return json(200, []);
    if (target.pathname === `/bookings/${BOOKING_ID}`) return json(200, rollerBooking());
    if (target.pathname === '/redemptions' && method === 'POST') {
      if (script.redemptionStatus === 503) return json(503, { errors: [{ name: 'Unavailable' }] });
      if (script.redemptionStatus === 409) return json(409, { errors: [{ name: 'Conflict' }] });
      return json(200, { redeemed: TICKETS });
    }
    throw new Error(`Unexpected Roller call during GH-456 validation: ${method} ${target.pathname}`);
  };
  return { calls, fetchImpl };
}

function redeemEnvironment(overrides = {}) {
  return {
    DATABASE_CLUSTER_ARN: 'arn:aws:rds:eu-north-1:000000000000:cluster:synthetic',
    DATABASE_SECRET_ARN: 'arn:aws:secretsmanager:eu-north-1:000000000000:secret:synthetic',
    ENABLE_ROLLER_REDEEM_WRITES: 'true',
    ENABLE_T0166_LIVE_REDEEM_SMOKE: 'false',
    ENABLE_T0176_FULL_FLOW_REHEARSAL: 'true',
    JUMPYARD_EMERGENCY_STOP: 'false',
    JUMPYARD_ENVIRONMENT: 'park-test',
    ROLLER_BASE_URL_PARAMETER_NAME: '/synthetic/roller/base-url',
    ROLLER_CREDENTIALS_SECRET_ARN: 'arn:aws:secretsmanager:eu-north-1:000000000000:secret:roller',
    ROLLER_ENV_PARAMETER_NAME: '/synthetic/roller/env',
    STAFF_IDENTITY_VENUE_ID: VENUE,
    T0176_FULL_FLOW_ALLOWED_OPERATING_DATES: TODAY,
    T0176_FULL_FLOW_VENUE_ID: VENUE,
    ...overrides,
  };
}

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

function loadRedeem({ database, roller, env = redeemEnvironment() }) {
  const source = fs.readFileSync(REDEEM_PATH, 'utf8');
  const module = { exports: {} };
  const warnings = [];
  const aws = fakeAws(async (command) => {
    if (command.name === 'GetParameterCommand') {
      const name = String(command.input?.Name ?? '');
      if (name === env.ROLLER_ENV_PARAMETER_NAME) return { Parameter: { Value: 'live' } };
      if (name === env.ROLLER_BASE_URL_PARAMETER_NAME) return { Parameter: { Value: 'https://api.roller.app' } };
      throw new Error(`Unexpected SSM parameter ${name}`);
    }
    if (command.name === 'GetSecretValueCommand') return { SecretString: JSON.stringify({ clientId: 'c', clientSecret: 's' }) };
    if (command.name === 'ExecuteStatementCommand') return database.execute(command.input.sql, command.input.parameters ?? []);
    throw new Error(`Unexpected AWS command ${command.name} during GH-456 validation.`);
  });
  vm.runInNewContext(source, {
    AbortSignal, Buffer, TextDecoder, TextEncoder, URL, URLSearchParams, clearTimeout, setTimeout,
    console: { error: (m) => warnings.push(String(m)), info() {}, log() {}, warn: (m) => warnings.push(String(m)) },
    exports: module.exports, fetch: roller.fetchImpl, module, process: { env: { ...env } },
    require(moduleId) {
      if (moduleId === './staff-handout-write') return require('../infra/lambda/redeem/staff-handout-write');
      if (moduleId === './server-diagnostics') return require('../infra/lambda/lookup/server-diagnostics');
      if (moduleId === './checkin-window') return require('../infra/lambda/shared/checkin-window');
      if (moduleId === './staff-handout') return require('../infra/lambda/shared/staff-handout');
      if (moduleId === 'crypto' || moduleId === 'node:crypto') return crypto;
      if (moduleId.startsWith('@aws-sdk/')) return aws;
      throw new Error(`Unexpected require(${JSON.stringify(moduleId)}) during GH-456 validation.`);
    },
  }, { filename: REDEEM_PATH });
  return { handler: module.exports.handler, warnings };
}

const autoEvent = (trigger = 'ready_for_staff') => ({ source: 'jumpyard.auto-checkin',
  detail: { checkinSessionId: SESSION_ID, correlationId: 'jy_gh456_validation', trigger } });

async function runAuto({ database: dbScript = {}, roller: rollerScript = {}, env } = {}) {
  const database = createRedeemDatabase(dbScript);
  const roller = createRoller(rollerScript);
  const { handler } = loadRedeem({ database, roller, env });
  let result;
  let error = null;
  try { result = await handler(autoEvent()); } catch (caught) { error = caught; }
  return { calls: database.state.calls, error, result, roller: roller.calls };
}

const sqlCalls = (calls, pattern) => calls.filter((call) => pattern.test(call.sql));
const posts = (rollerCalls) => rollerCalls.filter((call) => call === 'POST /redemptions').length;

async function validateAutoCheckinAdmitsThroughTheStaffPath() {
  const { calls, error, result, roller } = await runAuto();
  assert.equal(error, null);
  assert.equal(result.status, 'redeemed');
  assert.equal(posts(roller), 1, 'exactly one ROLLER redemption');
  const reserve = sqlCalls(calls, /INSERT INTO jumpyard\.idempotency_records/)[0];
  assert.equal(parameterValue(reserve.parameters, 'idempotencyKey'), IDEMPOTENCY_KEY, 'the staff key, so staff and the system never both redeem');
  const receipt = sqlCalls(calls, /WITH marked_tickets AS/)[0];
  const actor = JSON.parse(parameterValue(receipt.parameters, 'staffActor'));
  assert.equal(actor.actorId, 'system:auto-checkin');
  assert.equal(actor.displayName, 'automatiskt', 'the board shows "Incheckad HH:MM · automatiskt"');
  assert.ok(sqlCalls(calls, /INSERT INTO jumpyard\.event_log/).some((call) =>
    parameterValue(call.parameters, 'eventType') === 'checkin.auto_checkin_completed'));
  console.log('[pass] a ready, confirmed session of today is admitted once, with the staff key and the system actor');
}

async function validateNothingHappensUntilEveryConditionHolds() {
  for (const [label, script, status] of [
    ['booking sync pending', { syncStatus: 'pending' }, 'booking_sync_pending'],
    ['staff mid-handout', { claim: true }, 'staff_claimed'],
    ['already admitted', { status: 'redeemed' }, 'already_completed'],
    ['not ready', { status: 'guest_in_progress' }, 'not_ready'],
    ['another day', { visitDate: YESTERDAY }, 'outside_window'],
    ['unknown session', { noSession: true }, 'session_not_found'],
  ]) {
    const { calls, error, result, roller } = await runAuto({ database: script });
    assert.equal(error, null, label);
    assert.equal(result.status, status, label);
    assert.equal(roller.length, 0, `${label}: no ROLLER traffic`);
    assert.equal(sqlCalls(calls, /INSERT INTO jumpyard\.idempotency_records/).length, 0, `${label}: no key reserved`);
  }
  assert.equal((await runAuto({ env: redeemEnvironment({ AUTO_CHECKIN_REDEEM: 'off' }) })).result.status, 'disabled');
  assert.equal((await runAuto({ env: redeemEnvironment({ JUMPYARD_EMERGENCY_STOP: 'true' }) })).result.status, 'emergency_stop');
  console.log('[pass] pending sync, staff claims, other days, admitted or unready sessions and the kill switches never touch ROLLER');
}

async function validateRetriesAreBoundedAndEndWithStaff() {
  const first = await runAuto({ roller: { redemptionStatus: 503 } });
  assert.equal(first.error?.code, 'auto_checkin_retry', 'a ROLLER outage throws so Lambda retries');
  const failure = sqlCalls(first.calls, /WITH previous AS/)[0];
  assert.equal(parameterValue(failure.parameters, 'retryable'), 'true');

  const last = await runAuto({ database: { previousAttempts: 2 }, roller: { redemptionStatus: 503 } });
  assert.equal(last.error, null, 'the third failure stops retrying');
  assert.equal(last.result.status, 'needs_staff');

  const rejected = await runAuto({ roller: { redemptionStatus: 409 } });
  assert.equal(rejected.error, null, 'a ROLLER rejection is not retried');
  assert.equal(rejected.result.status, 'needs_staff');
  assert.equal(parameterValue(sqlCalls(rejected.calls, /WITH previous AS/)[0].parameters, 'retryable'), 'false');
  console.log('[pass] outages retry at most three times; rejections and the last failure hand the group to staff');
}

async function validateReceiptCompletesWithoutRoller() {
  const { calls, error, result, roller } = await runAuto({ database: { receiptByKey: true } });
  assert.equal(error, null);
  assert.equal(result.status, 'redeemed');
  assert.equal(result.recovered, 'local_receipt');
  assert.equal(posts(roller), 0, 'an earlier successful redemption is never repeated (#333)');
  assert.ok(sqlCalls(calls, /WITH marked_tickets AS/).length === 1);
  console.log('[pass] an earlier receipt completes the session locally without a second redemption');
}

function createSessionDatabase(script = {}) {
  const state = { calls: [] };
  const execute = async (sql, parameters) => {
    state.calls.push({ sql, parameters });
    if (/FROM jumpyard\.roller_bookings AS b\s+LEFT JOIN jumpyard\.roller_booking_tickets AS t/.test(sql)) return rdsResult([script.booking]);
    if (/AND status = 'redeemed'\s+AND handoff_code IS NOT NULL/.test(sql)) {
      return script.completed ? rdsResult([{ ...redeemedSessionRow(), handoff_day: TODAY, guest_resume_step: null,
        created_at: `${TODAY}T09:59:00.000Z` }]) : rdsResult([]);
    }
    if (/AND status IN \('guest_in_progress', 'ready_for_staff', 'staff_in_progress'\)\s+AND expires_at > now\(\)/.test(sql)) return rdsResult([]);
    if (/WITH source_bookings AS MATERIALIZED/.test(sql)) return rdsResult(script.manifestRows ?? [manifestRow()]);
    if (/FROM jumpyard\.staff_handout_claims c/.test(sql)) return rdsResult([{ claims: '[]', receipts: '[]' }]);
    if (/INSERT INTO jumpyard\.event_log/.test(sql)) return rdsResult([], 1);
    throw new Error(`Unexpected SQL during GH-456 session validation: ${sql.slice(0, 90)}`);
  };
  return { execute, state };
}

function loadSession({ database, env = {} }) {
  const source = fs.readFileSync(SESSION_PATH, 'utf8');
  const module = { exports: {} };
  const invokes = [];
  const aws = fakeAws(async (command) => {
    if (command.name === 'ExecuteStatementCommand') return database.execute(command.input.sql, command.input.parameters ?? []);
    if (command.name === 'InvokeCommand') { invokes.push(command.input); return { StatusCode: 202 }; }
    throw new Error(`Unexpected AWS command ${command.name} during GH-456 session validation.`);
  });
  vm.runInNewContext(`${source}\nmodule.exports.__gh456 = { handleStartSession, requestAutoCheckin };`, {
    AbortSignal, Buffer, TextDecoder, TextEncoder, URL, URLSearchParams, clearTimeout, setTimeout,
    console: { error() {}, info() {}, log() {}, warn() {} },
    exports: module.exports, module,
    process: { env: { DATABASE_CLUSTER_ARN: 'arn:synthetic', DATABASE_SECRET_ARN: 'arn:synthetic', ...env } },
    require(moduleId) {
      if (moduleId.startsWith('./')) return require(path.join(SESSION_DIR, moduleId));
      if (moduleId === 'crypto' || moduleId === 'node:crypto') return crypto;
      if (moduleId.startsWith('@aws-sdk/')) return aws;
      throw new Error(`Unexpected require(${JSON.stringify(moduleId)}) during GH-456 session validation.`);
    },
  }, { filename: SESSION_PATH });
  return { internals: module.exports.__gh456, invokes };
}

async function startSession(script, body) {
  const database = createSessionDatabase(script);
  const { internals } = loadSession({ database });
  const response = await internals.handleStartSession({ headers: {} }, {
    identifier: BOOKING_REFERENCE, idempotencyKey: `start-${crypto.randomUUID()}`, ...body,
  }, 'jy_gh456_session', { trustedGuestAccess: true });
  return { body: JSON.parse(response.body), calls: database.state.calls, statusCode: response.statusCode };
}

async function validateWindowBlocksEarlyCheckIn() {
  const result = await startSession({ booking: bookingRow({ bookingDate: TOMORROW, startTime: '14:00:00', endTime: '15:00:00' }) },
    { expectedDate: TOMORROW });
  assert.equal(result.statusCode, 409);
  assert.equal(result.body.error.code, 'checkin_too_early');
  assert.equal(result.body.checkinWindow.opensAt, '12:00', 'check-in opens two hours before the start');
  assert.equal(result.body.checkinWindow.closesAt, '15:00');
  assert.equal(sqlCalls(result.calls, /INSERT INTO jumpyard\.checkin_sessions/).length, 0, 'no session is created');

  const late = await startSession({ booking: bookingRow({ bookingDate: YESTERDAY }) }, { expectedDate: YESTERDAY });
  assert.equal(late.body.error.code, 'checkin_too_late');
  console.log('[pass] a new check-in before the window or after the session gets a clear too-early or too-late answer');
}

async function validateReopenAfterAdmissionKeepsTheNumber() {
  const reopened = await startSession({ booking: bookingRow({ redeemed: 'redeemed' }), completed: true }, { expectedDate: TODAY });
  assert.equal(reopened.statusCode, 200);
  assert.equal(reopened.body.status, 'session_completed');
  assert.equal(reopened.body.session.handoffCode, '0427');
  assert.equal(reopened.body.session.status, 'redeemed');
  assert.deepEqual(reopened.body.visit.cafe, [], 'bands only: nothing to collect at the café');
  assert.ok(reopened.body.visit.checkedInAt);

  // GH-491 (workshop 2026-10-07): the water bottle is collected in the café, like coffee and pizza.
  const withWater = await startSession({ booking: bookingRow({ redeemed: 'redeemed' }), completed: true, manifestRows: [
    manifestRow(),
    manifestRow({ booking_item_id: 'item-2', product_id: '1765459', product_name: 'JumpYard Vatten', quantity: 1,
      selected_units: 0, summary: JSON.stringify({ productType: 'beverage' }) }),
    manifestRow({ booking_item_id: 'item-3', product_id: '1765452', product_name: 'Bryggkaffe', quantity: 2,
      selected_units: 0, summary: JSON.stringify({ productType: 'foodbeverage' }) }),
  ] }, { expectedDate: TODAY });
  assert.deepEqual(withWater.body.visit.cafe.map(({ kind, name, remaining }) => ({ kind, name, remaining })), [
    { kind: 'water', name: 'JumpYard Vatten', remaining: 1 }, { kind: 'coffee', name: 'Bryggkaffe', remaining: 2 },
  ]);

  // GH-491: with no ROLLER items yet (a purchase ROLLER has not confirmed) the visit leaves the café
  // list out, so the phone groups the draft's own items instead of showing an empty café.
  const unconfirmed = await startSession({ booking: bookingRow({ redeemed: 'redeemed' }), completed: true, manifestRows: [] },
    { expectedDate: TODAY });
  assert.equal('cafe' in unconfirmed.body.visit, false);
  assert.ok(unconfirmed.body.visit.checkedInAt);

  const unknown = await startSession({ booking: bookingRow({ redeemed: 'redeemed' }), completed: false }, { expectedDate: TODAY });
  assert.equal(unknown.statusCode, 409, 'redeemed without our session (for example at kassan) stays blocked');
  assert.equal(unknown.body.error.code, 'already_redeemed');
  console.log('[pass] reopening an admitted visit the same day returns its number instead of a dead end');
}

async function validateDispatch() {
  const { internals, invokes } = loadSession({ database: createSessionDatabase({}), env: { AUTO_CHECKIN_FUNCTION_NAME: 'jumpyard-redeem' } });
  await internals.requestAutoCheckin(SESSION_ID, 'ready_for_staff', 'jy_dispatch');
  assert.equal(invokes.length, 1);
  assert.equal(invokes[0].FunctionName, 'jumpyard-redeem');
  assert.equal(invokes[0].InvocationType, 'Event', 'asynchronous: the guest never waits for ROLLER');
  assert.deepEqual(JSON.parse(Buffer.from(invokes[0].Payload).toString()), {
    source: 'jumpyard.auto-checkin', detail: { checkinSessionId: SESSION_ID, correlationId: 'jy_dispatch', trigger: 'ready_for_staff' },
  });
  const quiet = loadSession({ database: createSessionDatabase({}) });
  await quiet.internals.requestAutoCheckin(SESSION_ID, 'ready_for_staff', 'jy_dispatch');
  assert.equal(quiet.invokes.length, 0, 'no function name, no dispatch');
  console.log('[pass] ready sessions are handed to the Redeem Lambda asynchronously');
}

function validateSourceContracts() {
  const session = fs.readFileSync(SESSION_PATH, 'utf8');
  const booking = fs.readFileSync(BOOKING_PATH, 'utf8');
  const stack = fs.readFileSync(path.join(ROOT, 'infra', 'lib', 'jumpyard-cloud-stack.ts'), 'utf8');
  const board = fs.readFileSync(path.join(ROOT, 'jumpyard-checkin-admin', 'src', 'components', 'staff', 'StaffExperience.tsx'), 'utf8');
  const contract = fs.readFileSync(path.join(ROOT, 'JUMPYARD_CLOUD_CONTRACT.md'), 'utf8');
  const packageJson = fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8');
  const slice = (text, start, end) => text.slice(text.indexOf(start), text.indexOf(end, text.indexOf(start)));

  assert.match(slice(session, 'async function handleReadyForStaff(', 'async function readyAttestedPurchaseSession('),
    /requestAutoCheckin\(updatedSession\.checkinSessionId, 'ready_for_staff', correlationId\)/);
  assert.match(slice(session, 'async function readyAttestedPurchaseSession(', 'async function findSafetyAttestation('),
    /requestAutoCheckin\(readySession\.checkinSessionId, 'safety_attested_ready', correlationId\)/);
  assert.match(slice(booking, 'async function confirmPhoneProvisionalHandoff(', 'async function requestAutoCheckin('),
    /requestAutoCheckin\(attached\.map\(\(row\) => row\.checkin_session_id\), 'phone_booking_confirmed'/);
  assert.match(slice(booking, 'async function confirmKioskReconciliation(', 'async function confirmKioskAddProductReconciliation('),
    /requestAutoCheckin\(parseJsonArraySafe\(confirmed\.attached_session_ids\), 'kiosk_booking_confirmed'/);
  for (const handler of ['sessionHandler', 'bookingHandler']) {
    assert.match(stack, new RegExp(`${handler}\\.addEnvironment\\('AUTO_CHECKIN_FUNCTION_NAME', redeemHandler\\.functionName\\)`));
    assert.match(stack, new RegExp(`redeemHandler\\.grantInvoke\\(${handler}\\)`));
  }
  assert.match(board, /session\.autoCheckin\?\.status === "needs_staff" \? "Behöver personal"/);
  // Love, 2026-10-06: automatic check-in is on in Nacka from this deploy. The switch lives in the
  // deploy config (Redeem Lambda AUTO_CHECKIN_REDEEM), so turning it off is a reviewed config change.
  assert.match(stack, /redeemHandler\.addEnvironment\('AUTO_CHECKIN_REDEEM', config\.autoCheckin\.redeem \? 'on' : 'off'\)/);
  const parkConfig = JSON.parse(fs.readFileSync(path.join(ROOT, 'infra', 'config', 'park-test-full-flow-rehearsal.json'), 'utf8'));
  assert.deepEqual(parkConfig.autoCheckin, { redeem: true }, 'Park deploys with automatic check-in on');
  for (const term of ['checkin_too_early', 'checkin_too_late', 'session_completed', 'jumpyard.auto-checkin']) {
    assert.ok(contract.includes(term), `JUMPYARD_CLOUD_CONTRACT.md documents ${term}`);
  }
  assert.match(packageJson, /validate:gh456-auto-checkin/);
  for (const target of ['session', 'redeem']) {
    assert.equal(fs.readFileSync(path.join(ROOT, 'infra', 'lambda', target, 'checkin-window.js'), 'utf8'),
      fs.readFileSync(path.join(ROOT, 'infra', 'lambda', 'shared', 'checkin-window.js'), 'utf8'), `${target} copy is current`);
  }
  console.log('[pass] triggers, IAM wiring, the staff board label, the contract and the shared window module are in place');
}

async function main() {
  await validateAutoCheckinAdmitsThroughTheStaffPath();
  await validateNothingHappensUntilEveryConditionHolds();
  await validateRetriesAreBoundedAndEndWithStaff();
  await validateReceiptCompletesWithoutRoller();
  await validateWindowBlocksEarlyCheckIn();
  await validateReopenAfterAdmissionKeepsTheNumber();
  await validateDispatch();
  validateSourceContracts();
  console.log('GH-456 automatic check-in validation passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
