'use strict';

// GH-549 (D0272): a group checks in up to 50 entry tickets. ROLLER accepts 10 tickets per
// POST /redemptions call, so the Redeem Lambda sends a larger group in one call per 10, one after the
// other; a group of up to 10 is still exactly one call. Add-on units (SkyRider, JumpSocks, padlocks)
// are ROLLER tickets of their own in a purchase session, are never redeemed and no longer count
// toward any limit. These checks drive the real Redeem and Session Lambdas with a scripted Aurora
// Data API and ROLLER.

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const REDEEM_PATH = path.join(ROOT, 'infra', 'lambda', 'redeem', 'index.js');
const SESSION_DIR = path.join(ROOT, 'infra', 'lambda', 'session');
const SESSION_PATH = path.join(SESSION_DIR, 'index.js');
const VENUE = '50871';
const BOOKING_ID = 'roller-booking-549';
const BOOKING_REFERENCE = '549001';
const SESSION_ID = 'jycs_549';
const IDEMPOTENCY_KEY = `staff-redeem:${SESSION_ID}`;
const TODAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());

const entryIds = (count) => Array.from({ length: count }, (_, index) => `${BOOKING_REFERENCE}-e${index + 1}`);
const addonIds = (count) => Array.from({ length: count }, (_, index) => `${BOOKING_REFERENCE}-a${index + 1}`);

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

const parameterValue = (parameters, name) =>
  (parameters ?? []).find((parameter) => parameter.name === name)?.value?.stringValue ?? null;

// Live Nacka, 2026-10-15: entries are ROLLER "sessionpass" items, SkyRider, JumpSocks and padlocks
// "addon" items, and every unit is a ticket of its own.
function localTicket(ticketId, productType) {
  return {
    ticketId, bookingItemId: productType === 'addon' ? 'item-addon' : 'item-entry',
    productId: productType === 'addon' ? '970338' : '1189812', bookingDate: TODAY, redeemStatusLastSeen: null,
    lastSeenFromRollerAt: `${TODAY}T09:00:00.000Z`, ticketProductType: productType, ticketProductSubType: null,
    ticketSource: 'roller_live', itemProductType: productType, itemProductSubType: null, itemParentType: null,
    productCatalogType: null, productCatalogSubType: null, productCatalogParentType: null,
    productName: productType === 'addon' ? 'JumpSocks' : 'Entré 60 min', parentProductName: null,
  };
}

/**
 * One purchase: `entries` entry tickets and `addons` add-on tickets. `rollerRedeemed` lists tickets
 * ROLLER already shows redeemed; a successful POST marks its tickets redeemed, as ROLLER does, and a
 * POST that names an already redeemed ticket is refused with 409. `postStatuses[n]` is the HTTP status
 * of the n-th redemption call (200 by default). `previousKey` replays the same operation's key:
 * `failed` (a retry) or `stale` (an attempt that stopped while in progress).
 */
function createScenario({ entries = 20, addons = 0, rollerRedeemed = [], postStatuses = [], recheckRedeemsAll = false,
  previousAttempts = 0, previousKey = null } = {}) {
  const entryTickets = entryIds(entries);
  const addonTickets = addonIds(addons);
  const sessionTickets = [...entryTickets, ...addonTickets];
  const redeemed = new Set(rollerRedeemed);
  const db = { calls: [], lastRequestHash: null };
  const roller = { calls: [], posts: [] };

  const sessionRow = (status = 'ready_for_staff') => ({
    checkin_session_id: SESSION_ID, roller_unique_id: BOOKING_ID, booking_reference: BOOKING_REFERENCE,
    visit_date: TODAY, status, safety_status: 'completed', handoff_code: '0549',
    handoff_status: status === 'redeemed' ? 'completed' : 'ready_for_staff', booking_sync_status: 'confirmed',
    selected_ticket_ids: JSON.stringify(sessionTickets), expires_at: '2999-01-01T00:00:00.000Z',
    ready_for_staff_at: `${TODAY}T10:00:00.000Z`, completed_at: status === 'redeemed' ? `${TODAY}T10:01:00.000Z` : null,
    updated_at: `${TODAY}T10:00:00.000Z`, checked_in_by: null, handout_claim: null,
  });
  const contextRow = () => ({
    roller_unique_id: BOOKING_ID, booking_reference: BOOKING_REFERENCE, roller_env: 'live', booking_status: 'confirmed',
    payment_status: 'paid', amount_owing_cents: 0, total_cents: 600000, booking_date: TODAY, venue_id: VENUE,
    start_time: '00:00:00', end_time: '23:59:00', freshness_status: 'fresh', is_tombstoned: false,
    last_seen_from_roller_at: `${TODAY}T09:00:00.000Z`,
    tickets_json: JSON.stringify([
      ...entryTickets.map((ticketId) => localTicket(ticketId, 'sessionpass')),
      ...addonTickets.map((ticketId) => localTicket(ticketId, 'addon')),
    ]),
  });
  const rollerBooking = () => {
    const ticket = (ticketId) => ({ ticketId, redeemStatus: redeemed.has(ticketId) ? 'Redeemed' : 'Unredeemed', locations: [] });
    return {
      uniqueId: BOOKING_ID, bookingReference: BOOKING_REFERENCE, status: 'Confirmed', paymentStatus: 'Paid',
      amountOwing: 0, total: 6000, venueId: Number(VENUE),
      items: [
        { bookingItemId: 'item-entry', productId: 1189812, productName: 'Entré 60 min', productType: 'sessionpass',
          quantity: entryTickets.length, bookingDate: TODAY, startTime: '00:00:00', endTime: '23:59:00',
          tickets: entryTickets.map(ticket) },
        ...(addonTickets.length > 0 ? [{ bookingItemId: 'item-addon', productId: 970338, productName: 'JumpSocks',
          productType: 'addon', quantity: addonTickets.length, bookingDate: TODAY, startTime: '00:00:00',
          endTime: '23:59:00', tickets: addonTickets.map(ticket) }] : []),
      ],
    };
  };

  const execute = async (sql, parameters) => {
    db.calls.push({ sql, parameters });
    if (/WITH marked_tickets AS/.test(sql)) {
      if (/UPDATE jumpyard\.checkin_sessions/.test(sql)) return rdsResult([sessionRow('redeemed')], 1);
      return rdsResult([{ marked_tickets: entryTickets.length, completed_keys: 1 }]);
    }
    if (/WITH previous AS/.test(sql)) return rdsResult([{ attempts: previousAttempts + 1 }], 1);
    if (/FROM jumpyard\.checkin_sessions AS cs/.test(sql)) return rdsResult([sessionRow()]);
    if (/FROM jumpyard\.roller_bookings AS b/.test(sql)) return rdsResult([contextRow()]);
    if (/INSERT INTO jumpyard\.roller_bookings/.test(sql)) return rdsResult([], 1);
    if (/INSERT INTO jumpyard\.roller_booking_items/.test(sql)) return rdsResult([{ booking_item_key: 'jybi_549' }], 1);
    if (/INSERT INTO jumpyard\.roller_booking_tickets/.test(sql)) return rdsResult([], 1);
    if (/INSERT INTO jumpyard\.idempotency_records/.test(sql)) {
      db.lastRequestHash = parameterValue(parameters, 'requestHash');
      return rdsResult([], previousKey ? 0 : 1);
    }
    if (/SELECT\s+status,\s+request_hash,\s+result_ref/.test(sql)) {
      return rdsResult([{ status: previousKey === 'stale' ? 'in_progress' : 'failed', request_hash: db.lastRequestHash,
        result_ref: null, stale: previousKey === 'stale' }]);
    }
    if (/UPDATE jumpyard\.idempotency_records\s+SET status = 'in_progress'/.test(sql)) return rdsResult([], 1);
    if (/UPDATE jumpyard\.idempotency_records\s+SET status = :status/.test(sql)) return rdsResult([], 1);
    if (/SELECT status\s+FROM jumpyard\.idempotency_records/.test(sql)) return rdsResult([]);
    if (/UPDATE jumpyard\.checkin_sessions\s+SET\s+status = 'redeemed'/.test(sql)) return rdsResult([sessionRow('redeemed')], 1);
    if (/INSERT INTO jumpyard\.checkin_attempts/.test(sql)) return rdsResult([], 1);
    if (/INSERT INTO jumpyard\.event_log/.test(sql)) return rdsResult([], 1);
    throw new Error(`Unexpected SQL during GH-549 validation: ${sql.slice(0, 90)}`);
  };

  const json = (status, body) => ({
    ok: status >= 200 && status < 300, status,
    async json() { return body; }, async text() { return JSON.stringify(body); },
  });
  const fetchImpl = async (url, init = {}) => {
    const target = new URL(String(url));
    const method = init.method ?? 'GET';
    roller.calls.push(`${method} ${target.pathname}`);
    if (target.pathname === '/token') return json(200, { access_token: 'synthetic-token', token_type: 'Bearer', expires_in: 3600 });
    if (target.pathname === '/products') return json(200, []);
    if (target.pathname === `/bookings/${BOOKING_ID}`) {
      const detailCalls = roller.calls.filter((call) => call === `GET /bookings/${BOOKING_ID}`).length;
      if (detailCalls > 1 && recheckRedeemsAll) entryTickets.forEach((ticketId) => redeemed.add(ticketId));
      return json(200, rollerBooking());
    }
    if (target.pathname === '/redemptions' && method === 'POST') {
      const tickets = JSON.parse(init.body).tickets.map((ticket) => ticket.ticketId);
      roller.posts.push(tickets);
      const status = postStatuses[roller.posts.length - 1] ?? (tickets.some((ticketId) => redeemed.has(ticketId)) ? 409 : 200);
      if (status !== 200) return json(status, { errors: [{ name: status === 409 ? 'Conflict' : 'Unavailable' }] });
      tickets.forEach((ticketId) => redeemed.add(ticketId));
      return json(200, { redeemed: tickets });
    }
    throw new Error(`Unexpected Roller call during GH-549 validation: ${method} ${target.pathname}`);
  };

  return { addonTickets, db, entryTickets, execute, fetchImpl, redeemed, roller, sessionTickets };
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

function loadRedeem(scenario, env = redeemEnvironment()) {
  const source = fs.readFileSync(REDEEM_PATH, 'utf8');
  const module = { exports: {} };
  const aws = fakeAws(async (command) => {
    if (command.name === 'GetParameterCommand') {
      const name = String(command.input?.Name ?? '');
      if (name === env.ROLLER_ENV_PARAMETER_NAME) return { Parameter: { Value: 'live' } };
      if (name === env.ROLLER_BASE_URL_PARAMETER_NAME) return { Parameter: { Value: 'https://api.roller.app' } };
      throw new Error(`Unexpected SSM parameter ${name}`);
    }
    if (command.name === 'GetSecretValueCommand') return { SecretString: JSON.stringify({ clientId: 'c', clientSecret: 's' }) };
    if (command.name === 'ExecuteStatementCommand') return scenario.execute(command.input.sql, command.input.parameters ?? []);
    throw new Error(`Unexpected AWS command ${command.name} during GH-549 validation.`);
  });
  vm.runInNewContext(`${source}\nmodule.exports.__gh549 = { evaluateStaffRedeemSession, validateRequest };`, {
    AbortSignal, Buffer, TextDecoder, TextEncoder, URL, URLSearchParams, clearTimeout, setTimeout,
    console: { error() {}, info() {}, log() {}, warn() {} },
    exports: module.exports, fetch: scenario.fetchImpl, module, process: { env: { ...env } },
    require(moduleId) {
      if (moduleId === './staff-handout-write') return require('../infra/lambda/redeem/staff-handout-write');
      if (moduleId === './server-diagnostics') return require('../infra/lambda/lookup/server-diagnostics');
      if (moduleId === './checkin-window') return require('../infra/lambda/shared/checkin-window');
      if (moduleId === './staff-handout') return require('../infra/lambda/shared/staff-handout');
      if (moduleId === 'crypto' || moduleId === 'node:crypto') return crypto;
      if (moduleId.startsWith('@aws-sdk/')) return aws;
      throw new Error(`Unexpected require(${JSON.stringify(moduleId)}) during GH-549 validation.`);
    },
  }, { filename: REDEEM_PATH });
  return { handler: module.exports.handler, internals: module.exports.__gh549 };
}

// The trusted staff event the staff wrapper and the automatic check-in both send.
function staffRedeemEvent(ticketIds) {
  return {
    __jumpyardTrustedStaffActor: {
      actorId: 'staff-549', displayName: 'Synthetic Staff', environment: 'park-test', role: 'staff_operator',
      sessionId: 'staff-session-549', staffIdentityId: 'staff-549', venueId: VENUE,
    },
    __jumpyardTrustedStaffRedeem: true,
    __jumpyardTrustedStaffSessionId: SESSION_ID,
    body: JSON.stringify({
      bookingReference: BOOKING_REFERENCE, confirmRedeem: true, correlationId: 'jy_gh549_validation',
      expectedDate: TODAY, idempotencyKey: IDEMPOTENCY_KEY, rollerUniqueId: BOOKING_ID, ticketIds,
    }),
    headers: {},
    pathParameters: {},
    rawPath: '/v1/check-in/redeem',
    routeKey: 'POST /v1/check-in/redeem',
  };
}

async function redeem(options) {
  const scenario = createScenario(options);
  const { handler } = loadRedeem(scenario);
  const response = await handler(staffRedeemEvent(scenario.sessionTickets));
  return { body: JSON.parse(response.body), scenario, statusCode: response.statusCode };
}

const sqlCalls = (scenario, pattern) => scenario.db.calls.filter((call) => pattern.test(call.sql));

test('a group of 20 is redeemed in two ROLLER calls of 10, then completed once', async () => {
  const { body, scenario, statusCode } = await redeem({ entries: 20 });
  assert.equal(statusCode, 200);
  assert.equal(body.status, 'redeemed');
  assert.deepEqual(scenario.roller.posts, [scenario.entryTickets.slice(0, 10), scenario.entryTickets.slice(10)]);
  assert.deepEqual(body.redeemedTicketIds, scenario.entryTickets);
  assert.equal(body.session?.status, 'redeemed');
  assert.equal(sqlCalls(scenario, /WITH marked_tickets AS/).length, 1, 'one durable receipt after both calls');
  const receipt = sqlCalls(scenario, /WITH marked_tickets AS/)[0];
  assert.deepEqual(JSON.parse(parameterValue(receipt.parameters, 'ticketIds')), scenario.entryTickets);
  assert.equal(scenario.roller.calls.filter((call) => call === `GET /bookings/${BOOKING_ID}`).length, 1,
    'the booking is read once, before the calls');
  const succeeded = sqlCalls(scenario, /INSERT INTO jumpyard\.event_log/)
    .find((call) => parameterValue(call.parameters, 'eventType') === 'checkin.redeem_succeeded');
  assert.equal(JSON.parse(parameterValue(succeeded.parameters, 'eventPayload')).rollerCalls, 2);
});

test('a group of up to 10 is still exactly one ROLLER call', async () => {
  for (const entries of [1, 4, 10]) {
    const { body, scenario } = await redeem({ entries });
    assert.equal(body.status, 'redeemed', `${entries} entries`);
    assert.deepEqual(scenario.roller.posts, [scenario.entryTickets], `${entries} entries: one call with every ticket`);
  }
  const eleven = await redeem({ entries: 11 });
  assert.deepEqual(eleven.scenario.roller.posts.map((tickets) => tickets.length), [10, 1]);
});

test('add-on tickets are never sent to ROLLER and no longer count toward the limit', async () => {
  // Before #549 the 11 ids (3 entries + 8 add-on units) were refused as too_many_tickets.
  const small = await redeem({ entries: 3, addons: 8 });
  assert.equal(small.statusCode, 200);
  assert.equal(small.body.status, 'redeemed');
  assert.deepEqual(small.scenario.roller.posts, [small.scenario.entryTickets]);

  const full = await redeem({ entries: 20, addons: 120 });
  assert.equal(full.body.status, 'redeemed');
  assert.deepEqual(full.scenario.roller.posts.flat(), full.scenario.entryTickets);
  assert.ok(full.scenario.roller.posts.every((tickets) => tickets.length <= 10));
  assert.ok(full.scenario.addonTickets.every((ticketId) => !full.scenario.redeemed.has(ticketId)));
});

test('a group of 50 is redeemed in five ROLLER calls of 10', async () => {
  const { body, scenario, statusCode } = await redeem({ entries: 50, addons: 60 });
  assert.equal(statusCode, 200);
  assert.equal(body.status, 'redeemed');
  assert.deepEqual(scenario.roller.posts.map((tickets) => tickets.length), [10, 10, 10, 10, 10]);
  assert.deepEqual(scenario.roller.posts.flat(), scenario.entryTickets);
  assert.deepEqual(body.redeemedTicketIds, scenario.entryTickets);
  assert.equal(sqlCalls(scenario, /WITH marked_tickets AS/).length, 1);
  const succeeded = sqlCalls(scenario, /INSERT INTO jumpyard\.event_log/)
    .find((call) => parameterValue(call.parameters, 'eventType') === 'checkin.redeem_succeeded');
  assert.equal(JSON.parse(parameterValue(succeeded.parameters, 'eventPayload')).rollerCalls, 5);
});

test('more than 50 entry tickets is refused before any ROLLER call', async () => {
  const { body, scenario, statusCode } = await redeem({ entries: 51 });
  assert.equal(statusCode, 409);
  assert.equal(body.error?.code, 'too_many_tickets');
  assert.equal(body.redeemPlan?.maxTicketsPerGroup, 50);
  assert.equal(body.redeemPlan?.maxTicketsPerRollerCall, 10);
  assert.equal(scenario.roller.calls.length, 0);
  assert.equal(sqlCalls(scenario, /INSERT INTO jumpyard\.idempotency_records/).length, 0);
});

test('a retried or resumed attempt sends only the tickets ROLLER has not redeemed', async () => {
  const entries = entryIds(20);
  for (const previousKey of ['failed', 'stale']) {
    const { body, scenario } = await redeem({ entries: 20, rollerRedeemed: entries.slice(0, 10), previousKey });
    assert.equal(body.status, 'redeemed', previousKey);
    assert.deepEqual(scenario.roller.posts, [entries.slice(10)], `${previousKey}: the first ten are not redeemed twice`);
    assert.deepEqual(body.redeemedTicketIds, entries, `${previousKey}: the whole group is completed`);
  }
});

test('a first attempt on a group partly redeemed elsewhere still sends the whole group and goes to staff', async () => {
  const entries = entryIds(12);
  const { body, scenario, statusCode } = await redeem({ entries: 12, rollerRedeemed: entries.slice(0, 3) });
  assert.equal(statusCode, 409);
  assert.equal(body.status, 'rejected');
  assert.deepEqual(scenario.roller.posts, [entries.slice(0, 10)], 'the redeemed tickets are sent, as before #549');
  assert.equal(sqlCalls(scenario, /WITH marked_tickets AS/).length, 0);
});

test('a failed second call leaves the group open, and the next attempt finishes it', async () => {
  const failed = await redeem({ entries: 20, postStatuses: [200, 503] });
  assert.equal(failed.statusCode, 502);
  assert.equal(failed.body.status, 'roller_error');
  assert.equal(failed.scenario.roller.posts.length, 2);
  assert.equal(sqlCalls(failed.scenario, /WITH marked_tickets AS/).length, 0, 'nothing is marked complete');
  assert.ok(sqlCalls(failed.scenario, /UPDATE jumpyard\.idempotency_records\s+SET status = :status/)
    .some((call) => parameterValue(call.parameters, 'status') === 'failed'), 'the key is released for a retry');

  // ROLLER kept the first ten; the retry with the same key sends the other ten only.
  const retry = await redeem({ entries: 20, rollerRedeemed: [...failed.scenario.redeemed], previousKey: 'failed' });
  assert.equal(retry.body.status, 'redeemed');
  assert.deepEqual(retry.scenario.roller.posts, [entryIds(20).slice(10)]);
});

test('a conflict on the second call whose recheck shows the group redeemed completes it', async () => {
  const { body, scenario } = await redeem({ entries: 20, postStatuses: [200, 409], recheckRedeemsAll: true });
  assert.equal(body.status, 'redeemed');
  assert.equal(body.recovered, 'roller_ticket_status');
  assert.equal(scenario.roller.posts.length, 2);
  assert.equal(sqlCalls(scenario, /WITH marked_tickets AS/).length, 1);
});

test('the automatic check-in admits a kiosk purchase of 50 entries and many add-ons', async () => {
  const scenario = createScenario({ entries: 50, addons: 30 });
  const { handler } = loadRedeem(scenario);
  const result = await handler({ source: 'jumpyard.auto-checkin',
    detail: { checkinSessionId: SESSION_ID, correlationId: 'jy_gh549_auto', trigger: 'kiosk_booking_confirmed' } });
  assert.equal(result.status, 'redeemed');
  assert.deepEqual(scenario.roller.posts.map((tickets) => tickets.length), [10, 10, 10, 10, 10]);
  assert.deepEqual(scenario.roller.posts.flat(), scenario.entryTickets);
  const reserve = sqlCalls(scenario, /INSERT INTO jumpyard\.idempotency_records/)[0];
  assert.equal(parameterValue(reserve.parameters, 'idempotencyKey'), IDEMPOTENCY_KEY, 'the shared staff key (#333)');
});

test('the staff session and request checks bound the ids, not the entries', () => {
  const scenario = createScenario({ entries: 50, addons: 200 });
  const { internals } = loadRedeem(scenario);
  const session = (count) => ({
    bookingReference: BOOKING_REFERENCE, bookingSyncStatus: 'confirmed', expiresAt: '2999-01-01T00:00:00.000Z',
    handoffStatus: 'ready_for_staff', rollerUniqueId: BOOKING_ID, safetyStatus: 'completed',
    selectedTicketIds: Array.from({ length: count }, (_, index) => `t-${index}`), status: 'ready_for_staff',
  });
  assert.equal(internals.evaluateStaffRedeemSession(session(250)).canRedeem, true, '50 entries and 200 add-on units');
  assert.equal(internals.evaluateStaffRedeemSession(session(1001)).reason, 'too_many_tickets');
  const request = (count) => ({ identifier: BOOKING_REFERENCE, idempotencyKey: IDEMPOTENCY_KEY,
    ticketIds: Array.from({ length: count }, (_, index) => `t-${index}`), ticketIdsContainDuplicates: false });
  assert.equal(internals.validateRequest(request(1000)), null);
  assert.equal(internals.validateRequest(request(1001))?.code, 'too_many_tickets');
});

function loadSession() {
  const source = fs.readFileSync(SESSION_PATH, 'utf8');
  const module = { exports: {} };
  const aws = fakeAws(async (command) => { throw new Error(`Unexpected AWS command ${command.name}`); });
  vm.runInNewContext(`${source}\nmodule.exports.__gh549 = { validateStartRequest };`, {
    AbortSignal, Buffer, TextDecoder, TextEncoder, URL, URLSearchParams, clearTimeout, setTimeout,
    console: { error() {}, info() {}, log() {}, warn() {} },
    exports: module.exports, module,
    process: { env: { DATABASE_CLUSTER_ARN: 'arn:synthetic', DATABASE_SECRET_ARN: 'arn:synthetic' } },
    require(moduleId) {
      if (moduleId.startsWith('./')) return require(path.join(SESSION_DIR, moduleId));
      if (moduleId === 'crypto' || moduleId === 'node:crypto') return crypto;
      if (moduleId.startsWith('@aws-sdk/')) return aws;
      throw new Error(`Unexpected require(${JSON.stringify(moduleId)}) during GH-549 session validation.`);
    },
  }, { filename: SESSION_PATH });
  return module.exports.__gh549;
}

test('a check-in session may select 50 tickets', () => {
  const { validateStartRequest } = loadSession();
  const start = (count) => ({ identifier: BOOKING_REFERENCE, idempotencyKey: 'start-549',
    ticketIds: entryIds(count), ticketIdsContainDuplicates: false });
  assert.equal(validateStartRequest(start(50)), null);
  assert.equal(validateStartRequest(start(51))?.code, 'too_many_tickets');
});

test('ROLLER still gets at most 10 tickets per call, and the limits are documented', () => {
  const redeemSource = fs.readFileSync(REDEEM_PATH, 'utf8');
  assert.match(redeemSource, /const MAX_REDEEM_TICKETS = 10;/);
  assert.match(redeemSource, /const MAX_GROUP_ENTRY_TICKETS = 50;/);
  assert.match(redeemSource, /redeemRollerTicketsInBatches\(config, token, pendingTicketIds, request\)/);
  assert.match(fs.readFileSync(SESSION_PATH, 'utf8'), /const MAX_SELECTED_TICKETS = 50;/);
  assert.match(fs.readFileSync(path.join(ROOT, 'JUMPYARD_CLOUD_CONTRACT.md'), 'utf8'), /#549/);
  assert.match(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'), /validate:gh549-group-size/);
});
