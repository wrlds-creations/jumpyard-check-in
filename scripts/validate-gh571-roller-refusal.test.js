'use strict';

// GH-571: when ROLLER refuses a redemption, the Redeem Lambda keeps ROLLER's reason. ROLLER answers a
// refused POST /redemptions with 409 and `errors: [{ name, message, ticketId }]`, for example "Product
// type not accepted" for a kalas (a party package is not a pass) or "Ticket usage exhausted" for a
// ticket already redeemed elsewhere. ROLLER's booking detail has no redemption state, so that message is
// the only record of why. The reason goes to the check-in session (staff app, monitor), the event log
// and one log line of codes, with no ROLLER call beyond the #333 recheck. These checks drive the real
// Redeem Lambda with a scripted Aurora Data API and ROLLER.

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const REDEEM_PATH = path.join(ROOT, 'infra', 'lambda', 'redeem', 'index.js');
const VENUE = '50871';
const BOOKING_ID = 'roller-booking-571';
const BOOKING_REFERENCE = '571001';
const SESSION_ID = 'jycs_571';
const IDEMPOTENCY_KEY = `staff-redeem:${SESSION_ID}`;
const TODAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());

const ticketIds = (count) => Array.from({ length: count }, (_, index) => `${BOOKING_REFERENCE}-t${index + 1}`);

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
const parameterIsNull = (parameters, name) =>
  (parameters ?? []).find((parameter) => parameter.name === name)?.value?.isNull === true;

/**
 * One group of `count` tickets of `productType`. ROLLER answers the redemption with `postStatus` and
 * `errors` (a function of the sent ticket ids), and its booking detail lists tickets the way ROLLER
 * documents them: without any redemption state.
 */
function createScenario({ count = 8, productType = 'partypackage', postStatus = 409, errors = () => [],
  rawBody = undefined, eventLogFails = false, previousAttempts = 0 } = {}) {
  const tickets = ticketIds(count);
  const db = { calls: [], lastRequestHash: null };
  const roller = { calls: [], posts: [] };
  const sessionRow = () => ({
    checkin_session_id: SESSION_ID, roller_unique_id: BOOKING_ID, booking_reference: BOOKING_REFERENCE,
    visit_date: TODAY, status: 'ready_for_staff', safety_status: 'completed', handoff_code: '0163',
    handoff_status: 'ready_for_staff', booking_sync_status: 'confirmed', selected_ticket_ids: JSON.stringify(tickets),
    expires_at: '2999-01-01T00:00:00.000Z', ready_for_staff_at: `${TODAY}T12:47:48.000Z`, completed_at: null,
    updated_at: `${TODAY}T12:47:48.000Z`, checked_in_by: null, handout_claim: null,
  });
  const localTicket = (ticketId) => ({
    ticketId, bookingItemId: 'item-571', productId: '970638', bookingDate: TODAY, redeemStatusLastSeen: null,
    lastSeenFromRollerAt: `${TODAY}T09:00:00.000Z`, ticketProductType: null, ticketProductSubType: null,
    ticketSource: 'roller_redeem_final_refresh', itemProductType: productType, itemProductSubType: null,
    itemParentType: null, productCatalogType: null, productCatalogSubType: null, productCatalogParentType: null,
    productName: 'Antal', parentProductName: 'MIDI 1 timme och 40 minuter',
  });
  const contextRow = () => ({
    roller_unique_id: BOOKING_ID, booking_reference: BOOKING_REFERENCE, roller_env: 'live', booking_status: 'Paid',
    payment_status: 'Paid', amount_owing_cents: 0, total_cents: 260520, booking_date: TODAY, venue_id: VENUE,
    start_time: '00:00:00', end_time: '23:59:00', freshness_status: 'fresh', is_tombstoned: false,
    last_seen_from_roller_at: `${TODAY}T09:00:00.000Z`, tickets_json: JSON.stringify(tickets.map(localTicket)),
  });
  // ROLLER's GET /bookings/{id}: BookingTicket has ticketId, locations and holder fields, no redemption state.
  const rollerBooking = () => ({
    uniqueId: BOOKING_ID, bookingReference: BOOKING_REFERENCE, status: 'Paid', amountOwing: 0, total: 2605.2,
    venueId: Number(VENUE),
    items: [{ bookingItemId: 'item-571', productId: 970638, productName: 'Antal', productType, quantity: tickets.length,
      bookingDate: TODAY, startTime: '00:00:00', endTime: '23:59:00',
      tickets: tickets.map((ticketId) => ({ ticketId, locations: [52807] })) }],
  });

  const execute = async (sql, parameters) => {
    db.calls.push({ sql, parameters });
    if (/WITH marked_tickets AS/.test(sql)) throw new Error('A refused redemption must never be marked complete.');
    if (/WITH previous AS/.test(sql)) return rdsResult([{ attempts: previousAttempts + 1 }], 1);
    if (/FROM jumpyard\.checkin_sessions AS cs/.test(sql)) return rdsResult([sessionRow()]);
    if (/FROM jumpyard\.roller_bookings AS b/.test(sql)) return rdsResult([contextRow()]);
    if (/INSERT INTO jumpyard\.roller_bookings/.test(sql)) return rdsResult([], 1);
    if (/INSERT INTO jumpyard\.roller_booking_items/.test(sql)) return rdsResult([{ booking_item_key: 'jybi_571' }], 1);
    if (/INSERT INTO jumpyard\.roller_booking_tickets/.test(sql)) return rdsResult([], 1);
    if (/INSERT INTO jumpyard\.idempotency_records/.test(sql)) {
      db.lastRequestHash = parameterValue(parameters, 'requestHash');
      return rdsResult([], 1);
    }
    if (/UPDATE jumpyard\.idempotency_records\s+SET status = :status/.test(sql)) return rdsResult([], 1);
    if (/SELECT status\s+FROM jumpyard\.idempotency_records/.test(sql)) return rdsResult([]);
    if (/INSERT INTO jumpyard\.checkin_attempts/.test(sql)) return rdsResult([], 1);
    if (/INSERT INTO jumpyard\.event_log/.test(sql)) {
      if (eventLogFails && parameterValue(parameters, 'eventType') === 'checkin.redeem_rejected') {
        const error = new Error('synthetic_db_failure');
        error.name = 'DatabaseErrorException';
        throw error;
      }
      return rdsResult([], 1);
    }
    throw new Error(`Unexpected SQL during GH-571 validation: ${sql.slice(0, 90)}`);
  };

  const json = (status, body) => ({
    ok: status >= 200 && status < 300, status,
    async json() { return body; }, async text() { return body === undefined ? '' : JSON.stringify(body); },
  });
  const fetchImpl = async (url, init = {}) => {
    const target = new URL(String(url));
    const method = init.method ?? 'GET';
    roller.calls.push(`${method} ${target.pathname}`);
    if (target.pathname === '/token') return json(200, { access_token: 'synthetic-token', token_type: 'Bearer', expires_in: 3600 });
    if (target.pathname === '/products') return json(200, []);
    if (target.pathname === `/bookings/${BOOKING_ID}`) return json(200, rollerBooking());
    if (target.pathname === '/redemptions' && method === 'POST') {
      const sent = JSON.parse(init.body).tickets.map((ticket) => ticket.ticketId);
      roller.posts.push(sent);
      if (postStatus === 200) return json(200, { redeemed: sent });
      return json(postStatus, rawBody !== undefined ? rawBody : { errors: errors(sent) });
    }
    throw new Error(`Unexpected Roller call during GH-571 validation: ${method} ${target.pathname}`);
  };

  return { db, execute, fetchImpl, roller, tickets };
}

function redeemEnvironment() {
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

function loadRedeem(scenario) {
  const env = redeemEnvironment();
  const source = fs.readFileSync(REDEEM_PATH, 'utf8');
  const module = { exports: {} };
  const logs = [];
  const aws = fakeAws(async (command) => {
    if (command.name === 'GetParameterCommand') {
      const name = String(command.input?.Name ?? '');
      if (name === env.ROLLER_ENV_PARAMETER_NAME) return { Parameter: { Value: 'live' } };
      if (name === env.ROLLER_BASE_URL_PARAMETER_NAME) return { Parameter: { Value: 'https://api.roller.app' } };
      throw new Error(`Unexpected SSM parameter ${name}`);
    }
    if (command.name === 'GetSecretValueCommand') return { SecretString: JSON.stringify({ clientId: 'c', clientSecret: 's' }) };
    if (command.name === 'ExecuteStatementCommand') return scenario.execute(command.input.sql, command.input.parameters ?? []);
    throw new Error(`Unexpected AWS command ${command.name} during GH-571 validation.`);
  });
  vm.runInNewContext(`${source}\nmodule.exports.__gh571 = { rollerRefusalCode };`, {
    AbortSignal, Buffer, TextDecoder, TextEncoder, URL, URLSearchParams, clearTimeout, setTimeout,
    console: { error: (line) => logs.push(String(line)), info() {}, log() {}, warn: (line) => logs.push(String(line)) },
    exports: module.exports, fetch: scenario.fetchImpl, module, process: { env: { ...env } },
    require(moduleId) {
      if (moduleId === './staff-handout-write') return require('../infra/lambda/redeem/staff-handout-write');
      if (moduleId === './server-diagnostics') return require('../infra/lambda/lookup/server-diagnostics');
      if (moduleId === './checkin-window') return require('../infra/lambda/shared/checkin-window');
      if (moduleId === './staff-handout') return require('../infra/lambda/shared/staff-handout');
      if (moduleId === 'crypto' || moduleId === 'node:crypto') return crypto;
      if (moduleId.startsWith('@aws-sdk/')) return aws;
      throw new Error(`Unexpected require(${JSON.stringify(moduleId)}) during GH-571 validation.`);
    },
  }, { filename: REDEEM_PATH });
  return { handler: module.exports.handler, internals: module.exports.__gh571, logs };
}

async function autoCheckin(options) {
  const scenario = createScenario(options);
  const { handler, logs } = loadRedeem(scenario);
  let result = null;
  let error = null;
  try {
    result = await handler({ source: 'jumpyard.auto-checkin',
      detail: { checkinSessionId: SESSION_ID, correlationId: 'jy_gh571_auto', trigger: 'ready_for_staff' } });
  } catch (caught) { error = caught; }
  return { error, logs, result, scenario };
}

const sqlCalls = (scenario, pattern) => scenario.db.calls.filter((call) => pattern.test(call.sql));
const events = (scenario, eventType) => sqlCalls(scenario, /INSERT INTO jumpyard\.event_log/)
  .filter((call) => parameterValue(call.parameters, 'eventType') === eventType)
  .map((call) => JSON.parse(parameterValue(call.parameters, 'eventPayload')));
const storedRefusal = (scenario) => {
  const failure = sqlCalls(scenario, /WITH previous AS/)[0];
  return failure && !parameterIsNull(failure.parameters, 'roller')
    ? JSON.parse(parameterValue(failure.parameters, 'roller')) : null;
};
const refusalLogs = (logs) => logs.filter((line) => line.includes('"eventType":"checkin.redeem_rejected"'))
  .map((line) => JSON.parse(line));
const documented = (message) => (sent) => sent.map((ticketId) => ({ name: 'InvalidRedemption', message, ticketId }));

test('a kalas refused with "Product type not accepted" keeps the reason on the session', async () => {
  const { error, logs, result, scenario } = await autoCheckin({ count: 8, errors: documented('Product type not accepted') });
  assert.equal(error, null, 'a refusal is not retried');
  assert.equal(result.status, 'needs_staff');
  assert.equal(result.reason, 'roller_redeem_rejected');

  const refusal = storedRefusal(scenario);
  assert.equal(refusal.statusCode, 409);
  assert.equal(refusal.reason, 'product_type_not_accepted');
  assert.deepEqual(refusal.reasons, { product_type_not_accepted: 8 });
  assert.equal(refusal.message, 'Product type not accepted');
  assert.equal(refusal.ticketCount, 8);
  // ROLLER's booking detail shows no redemption state, which the recheck records as such.
  assert.deepEqual(refusal.afterRefresh, { bookingStatus: 'Paid', read: true, redeemedTickets: 0, ticketsWithoutState: 8 });

  const failure = sqlCalls(scenario, /WITH previous AS/)[0];
  assert.equal(parameterValue(failure.parameters, 'reason'), 'roller_redeem_rejected', 'the existing reason is unchanged');
  assert.equal(parameterValue(failure.parameters, 'retryable'), 'false');
  assert.match(failure.sql, /jsonb_build_object\('roller', CAST\(:roller AS jsonb\)\)/);
  assert.equal(events(scenario, 'checkin.auto_checkin_failed')[0].rollerReason, 'product_type_not_accepted');
});

test('the event log keeps ROLLER\'s error for every ticket and what the recheck showed', async () => {
  const { scenario } = await autoCheckin({ count: 8, errors: documented('Product type not accepted') });
  const [rejected] = events(scenario, 'checkin.redeem_rejected');
  assert.equal(rejected.reason, 'product_type_not_accepted');
  assert.equal(rejected.errors.length, 8);
  assert.deepEqual(rejected.errors[0], { code: 'product_type_not_accepted', message: 'Product type not accepted',
    name: 'InvalidRedemption', ticketId: scenario.tickets[0] });
  assert.deepEqual(Object.keys(rejected.ticketStatesAfterRefresh), scenario.tickets);
  assert.ok(Object.values(rejected.ticketStatesAfterRefresh).every((state) => state === null));
  assert.equal(rejected.rollerCalls, 1);
  assert.equal(rejected.actorId, 'system:auto-checkin', 'the automatic actor is recorded');
  const attempt = sqlCalls(scenario, /INSERT INTO jumpyard\.checkin_attempts/)[0];
  assert.equal(parameterValue(attempt.parameters, 'rollerResponseRef'), 'roller_redemptions:http_409');
});

test('no ROLLER call is added: one read, one redemption and the #333 recheck', async () => {
  const { scenario } = await autoCheckin({ count: 8, errors: documented('Product type not accepted') });
  const business = scenario.roller.calls.filter((call) => !/^(POST \/token|GET \/products)$/.test(call));
  assert.deepEqual(business, [`GET /bookings/${BOOKING_ID}`, 'POST /redemptions', `GET /bookings/${BOOKING_ID}`]);
});

test('a ticket already redeemed elsewhere is recorded as ticket_usage_exhausted', async () => {
  const { result, scenario } = await autoCheckin({ count: 1, productType: 'sessionpass',
    errors: documented('Ticket usage exhausted') });
  assert.equal(result.status, 'needs_staff');
  const refusal = storedRefusal(scenario);
  assert.equal(refusal.reason, 'ticket_usage_exhausted');
  assert.equal(refusal.message, 'Ticket usage exhausted');
  assert.deepEqual(refusal.afterRefresh, { bookingStatus: 'Paid', read: true, redeemedTickets: 0, ticketsWithoutState: 1 });
});

test('a 409 without a body is recorded as http_409', async () => {
  const { scenario } = await autoCheckin({ count: 2, productType: 'sessionpass', rawBody: undefined, errors: () => [] });
  const refusal = storedRefusal(scenario);
  assert.equal(refusal.reason, 'http_409');
  assert.equal(refusal.message, null);
  assert.deepEqual(refusal.reasons, {});

  const empty = await autoCheckin({ count: 2, productType: 'sessionpass', rawBody: null });
  assert.equal(storedRefusal(empty.scenario).reason, 'http_409');
});

test('a ROLLER outage keeps its status, retries as before and skips the recheck', async () => {
  const { error, scenario } = await autoCheckin({ count: 2, productType: 'sessionpass', postStatus: 503,
    rawBody: { errors: [{ name: 'Unavailable' }] } });
  assert.equal(error?.code, 'auto_checkin_retry', 'Lambda retries an outage');
  const refusal = storedRefusal(scenario);
  assert.equal(refusal.statusCode, 503);
  assert.equal(refusal.reason, 'http_503');
  assert.equal(refusal.afterRefresh, null);
  assert.equal(scenario.roller.calls.filter((call) => call === `GET /bookings/${BOOKING_ID}`).length, 1, 'no recheck after a 503');
  assert.equal(parameterValue(sqlCalls(scenario, /WITH previous AS/)[0].parameters, 'retryable'), 'true');
});

test('the log line carries codes and counts, never ticket ids or ROLLER text', async () => {
  const { logs, scenario } = await autoCheckin({ count: 8, errors: documented('Product type not accepted') });
  const [line] = refusalLogs(logs);
  assert.equal(line.handler, 'redeem');
  assert.equal(line.providerStatusCode, 409);
  assert.equal(line.reason, 'product_type_not_accepted');
  assert.deepEqual(line.reasons, { product_type_not_accepted: 8 });
  assert.equal(line.ticketCount, 8);
  assert.deepEqual(line.afterRefresh, { bookingStatus: 'paid', read: true, redeemedTickets: 0, ticketsWithoutState: 8 });
  const text = logs.join('\n');
  assert.ok(!text.includes(BOOKING_REFERENCE), 'no booking reference or ticket id in the logs');
  assert.ok(!text.includes('Product type not accepted'), 'ROLLER text stays in Aurora');
  assert.ok(scenario.tickets.every((ticketId) => !text.includes(ticketId)));
});

test('an undocumented message is "other", and stored errors and text are bounded', async () => {
  const long = `Something new from ROLLER ${'x'.repeat(400)}`;
  const { scenario } = await autoCheckin({ count: 10, productType: 'sessionpass',
    errors: (sent) => [...sent, 'extra-1', 'extra-2'].map((ticketId) => ({ name: 'InvalidRedemption', message: long, ticketId })) });
  const refusal = storedRefusal(scenario);
  assert.equal(refusal.reason, 'other');
  assert.equal(refusal.message.length, 200);
  const [rejected] = events(scenario, 'checkin.redeem_rejected');
  assert.equal(rejected.errors.length, 10, 'at most ten errors, one ROLLER call\'s worth');
  assert.deepEqual(refusal.reasons, { other: 10 });
});

test('a failed event-log write never changes the refusal', async () => {
  const { error, logs, result, scenario } = await autoCheckin({ count: 8, eventLogFails: true,
    errors: documented('Product type not accepted') });
  assert.equal(error, null);
  assert.equal(result.status, 'needs_staff');
  assert.equal(storedRefusal(scenario).reason, 'product_type_not_accepted');
  assert.ok(logs.some((line) => line.includes('checkin.redeem_rejected_bookkeeping_failed')));
  assert.ok(!logs.some((line) => line.includes('synthetic_db_failure')));
});

test('a staff-pressed redemption returns the refusal and records the staff member', async () => {
  const scenario = createScenario({ count: 3, productType: 'sessionpass', errors: documented('Ticket usage exhausted') });
  const { handler } = loadRedeem(scenario);
  const response = await handler({
    __jumpyardTrustedStaffActor: { actorId: 'staff-571', displayName: 'Synthetic Staff', environment: 'park-test',
      role: 'staff_operator', sessionId: 'staff-session-571', staffIdentityId: 'staff-571', venueId: VENUE },
    __jumpyardTrustedStaffRedeem: true,
    __jumpyardTrustedStaffSessionId: SESSION_ID,
    body: JSON.stringify({ bookingReference: BOOKING_REFERENCE, confirmRedeem: true, correlationId: 'jy_gh571_staff',
      expectedDate: TODAY, idempotencyKey: IDEMPOTENCY_KEY, rollerUniqueId: BOOKING_ID, ticketIds: scenario.tickets }),
    headers: {}, pathParameters: {}, rawPath: '/v1/check-in/redeem', routeKey: 'POST /v1/check-in/redeem',
  });
  const body = JSON.parse(response.body);
  assert.equal(response.statusCode, 409);
  assert.equal(body.status, 'rejected');
  assert.equal(body.error.code, 'roller_redeem_rejected');
  assert.equal(body.roller.refusal.reason, 'ticket_usage_exhausted');
  assert.equal(body.roller.errors.length, 3, 'the existing errors list is unchanged');
  const [rejected] = events(scenario, 'checkin.redeem_rejected');
  assert.equal(rejected.actorId, 'staff-571');
  assert.equal(sqlCalls(scenario, /WITH previous AS/).length, 0, 'only the automatic check-in counts attempts');
});

test('every message ROLLER documents for a refused redemption has its own code', () => {
  const { internals } = loadRedeem(createScenario());
  for (const [message, code] of [
    ['Ticket does not exist', 'ticket_not_found'],
    ['Booking Cancelled', 'booking_cancelled'],
    ['Ticket is not valid for this date', 'ticket_not_valid_for_date'],
    ['Ticket IDs must be unique per request', 'duplicate_ticket_ids'],
    ['Ticket usage exhausted', 'ticket_usage_exhausted'],
    ['Product type not accepted', 'product_type_not_accepted'],
    ['Membership Invalid', 'membership_invalid'],
    ['Ticket redemption usage exhausted', 'ticket_redemption_usage_exhausted'],
    ['Redemption device not found', 'redemption_device_not_found'],
    ['Duplicate custom ticket IDs found', 'duplicate_custom_ticket_ids'],
    ['Custom ticket ID not found', 'custom_ticket_not_found'],
    ['Ticket cannot be redeemed before the session start time', 'before_session_start'],
    ['Ticket cannot be redeemed after the session end time', 'after_session_end'],
    ['  product   TYPE not accepted. ', 'product_type_not_accepted'],
    ['', 'unknown'],
    [null, 'unknown'],
    ['Something else', 'other'],
  ]) {
    assert.equal(internals.rollerRefusalCode(message), code, String(message));
  }
});

test('the change is wired into validation and documented', () => {
  assert.match(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'), /validate:gh571-roller-refusal/);
  assert.match(fs.readFileSync(path.join(ROOT, 'JUMPYARD_CLOUD_CONTRACT.md'), 'utf8'), /#571/);
});
