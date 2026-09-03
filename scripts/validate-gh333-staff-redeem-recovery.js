'use strict';

// #333: staff redeem must be resumable. Roller's redemption is the decision; the local
// bookkeeping (tickets, idempotency key, check-in session) is a durable receipt written in one
// statement right after Roller's OK, and a retry completes locally from that receipt or from
// Roller's own per-ticket state instead of failing with a generic 409.

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const REDEEM_PATH = path.join(ROOT, 'infra', 'lambda', 'redeem', 'index.js');
const APPROVED_DATE = '2026-09-06';
const VENUE = '50871';
const BOOKING_ID = 'roller-booking-333';
const BOOKING_REFERENCE = '333001';
const SESSION_ID = 'jycs_333';
const TICKETS = ['333001-1', '333001-2', '333001-3', '333001-4'];
const IDEMPOTENCY_KEY = `staff-redeem:${SESSION_ID}`;

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

function parameterValue(parameters, name) {
  const entry = (parameters ?? []).find((parameter) => parameter.name === name);
  return entry?.value?.stringValue ?? null;
}

function contextRow() {
  return {
    roller_unique_id: BOOKING_ID,
    booking_reference: BOOKING_REFERENCE,
    roller_env: 'live',
    booking_status: 'confirmed',
    payment_status: 'paid',
    amount_owing_cents: 0,
    total_cents: 100000,
    booking_date: APPROVED_DATE,
    venue_id: VENUE,
    start_time: '11:00:00',
    end_time: '12:00:00',
    freshness_status: 'fresh',
    is_tombstoned: false,
    last_seen_from_roller_at: `${APPROVED_DATE}T09:00:00.000Z`,
    tickets_json: JSON.stringify(TICKETS.map((ticketId) => ({
      ticketId,
      bookingItemId: 'item-1',
      productId: '900001',
      bookingDate: APPROVED_DATE,
      redeemStatusLastSeen: null,
      lastSeenFromRollerAt: `${APPROVED_DATE}T09:00:00.000Z`,
      ticketProductType: 'standardPass',
      ticketProductSubType: null,
      ticketSource: 'roller_live',
      itemProductType: 'standardPass',
      itemProductSubType: null,
      itemParentType: null,
      productCatalogType: null,
      productCatalogSubType: null,
      productCatalogParentType: null,
      productName: '60 min entry',
      parentProductName: null,
    }))),
  };
}

function sessionRow() {
  return {
    checkin_session_id: SESSION_ID,
    roller_unique_id: BOOKING_ID,
    booking_reference: BOOKING_REFERENCE,
    visit_date: APPROVED_DATE,
    status: 'redeemed',
    safety_status: 'completed',
    handoff_code: 'JY4711',
    handoff_status: 'completed',
    selected_ticket_ids: JSON.stringify(TICKETS),
    expires_at: `${APPROVED_DATE}T20:00:00.000Z`,
    ready_for_staff_at: `${APPROVED_DATE}T10:55:00.000Z`,
    completed_at: `${APPROVED_DATE}T11:02:00.000Z`,
    updated_at: `${APPROVED_DATE}T11:02:00.000Z`,
  };
}

function rollerBooking(ticketStatus) {
  return {
    uniqueId: BOOKING_ID,
    bookingReference: BOOKING_REFERENCE,
    status: 'Confirmed',
    paymentStatus: 'Paid',
    amountOwing: 0,
    total: 1000,
    venueId: Number(VENUE),
    items: [{
      bookingItemId: 'item-1',
      productId: 900001,
      productName: '60 min entry',
      productType: 'standardPass',
      quantity: TICKETS.length,
      bookingDate: APPROVED_DATE,
      startTime: '11:00:00',
      endTime: '12:00:00',
      tickets: TICKETS.map((ticketId) => ({ ticketId, redeemStatus: ticketStatus, locations: [] })),
    }],
  };
}

/**
 * Scripted Aurora Data API. `script` controls the idempotency table and failure injection; every
 * statement is recorded so tests can assert ordering.
 */
function createDatabase(script = {}) {
  const state = {
    calls: [],
    lastRequestHash: null,
  };

  const execute = async (sql, parameters) => {
    state.calls.push({ sql, parameters });

    if (/FROM jumpyard\.roller_bookings AS b/.test(sql)) return rdsResult([contextRow()]);
    if (/INSERT INTO jumpyard\.roller_bookings/.test(sql)) return rdsResult([], 1);
    if (/INSERT INTO jumpyard\.roller_booking_items/.test(sql)) return rdsResult([{ booking_item_key: 'jybi_333' }], 1);
    if (/INSERT INTO jumpyard\.roller_booking_tickets/.test(sql)) return rdsResult([], 1);

    if (/INSERT INTO jumpyard\.idempotency_records/.test(sql)) {
      state.lastRequestHash = parameterValue(parameters, 'requestHash');
      return rdsResult([], script.reserveInserted === false ? 0 : 1);
    }
    if (/SELECT\s+status,\s+request_hash,\s+result_ref/.test(sql)) {
      if (!script.existingKey) return rdsResult([]);
      return rdsResult([{
        status: script.existingKey.status,
        request_hash: script.existingKey.requestHash === 'same' ? state.lastRequestHash : script.existingKey.requestHash,
        result_ref: script.existingKey.resultRef ?? null,
        stale: script.existingKey.stale === true,
      }]);
    }
    if (/UPDATE jumpyard\.idempotency_records\s+SET status = 'in_progress'/.test(sql)) {
      return rdsResult([], script.claimUpdated === false ? 0 : 1);
    }
    if (/UPDATE jumpyard\.idempotency_records\s+SET status = :status/.test(sql)) return rdsResult([], 1);

    if (/WITH marked_tickets AS/.test(sql)) {
      if (/UPDATE jumpyard\.checkin_sessions/.test(sql)) return rdsResult([sessionRow()], 1);
      return rdsResult([{ marked_tickets: TICKETS.length, completed_keys: 1 }]);
    }

    if (/INSERT INTO jumpyard\.checkin_attempts/.test(sql)) {
      if (script.failAttemptInsert) throw Object.assign(new Error('synthetic attempt insert failure'), { code: 'synthetic_db_failure' });
      return rdsResult([], 1);
    }
    if (/INSERT INTO jumpyard\.event_log/.test(sql)) return rdsResult([], 1);

    if (/SELECT status\s+FROM jumpyard\.idempotency_records/.test(sql)) {
      return script.receiptByKey ? rdsResult([{ status: 'succeeded' }]) : rdsResult([]);
    }

    throw new Error(`Unexpected SQL during GH-333 validation: ${sql.slice(0, 80)}`);
  };

  return { execute, state };
}

/** Scripted Roller. Booking detail can answer differently on the post-409 recheck. */
function createRoller(script = {}) {
  const calls = [];
  const json = (status, body) => ({
    ok: status >= 200 && status < 300,
    status,
    async json() { return body; },
    async text() { return JSON.stringify(body); },
  });

  const fetchImpl = async (url, init = {}) => {
    const target = new URL(String(url));
    const method = init.method ?? 'GET';
    calls.push(`${method} ${target.pathname}`);

    if (target.pathname === '/token') return json(200, { access_token: 'synthetic-token', token_type: 'Bearer', expires_in: 3600 });
    if (target.pathname === '/products') return json(200, []);
    if (target.pathname === `/bookings/${BOOKING_ID}`) {
      const detailCalls = calls.filter((call) => call === `GET /bookings/${BOOKING_ID}`).length;
      const status = detailCalls > 1 && script.ticketStatusOnRecheck
        ? script.ticketStatusOnRecheck
        : (script.ticketStatus ?? 'Unredeemed');
      return json(200, rollerBooking(status));
    }
    if (target.pathname === '/redemptions' && method === 'POST') {
      if (script.redemptionStatus === 409) {
        return json(409, { errors: [{ name: 'AlreadyRedeemed', message: 'Ticket already redeemed' }] });
      }
      return json(200, { redeemed: TICKETS });
    }

    throw new Error(`Unexpected Roller call during GH-333 validation: ${method} ${target.pathname}`);
  };

  return { calls, fetchImpl };
}

function environment(overrides = {}) {
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
    T0176_FULL_FLOW_ALLOWED_OPERATING_DATES: APPROVED_DATE,
    T0176_FULL_FLOW_VENUE_ID: VENUE,
    ...overrides,
  };
}

function loadRedeem({ database, roller, env = environment() }) {
  const source = fs.readFileSync(REDEEM_PATH, 'utf8');
  const module = { exports: {} };
  const warnings = [];

  const handleCommand = async (command) => {
    if (command.name === 'GetParameterCommand') {
      const name = String(command.input?.Name ?? '');
      if (name === env.ROLLER_ENV_PARAMETER_NAME) return { Parameter: { Value: 'live' } };
      if (name === env.ROLLER_BASE_URL_PARAMETER_NAME) return { Parameter: { Value: 'https://api.roller.app' } };
      throw new Error(`Unexpected SSM parameter ${name}`);
    }
    if (command.name === 'GetSecretValueCommand') {
      return { SecretString: JSON.stringify({ clientId: 'synthetic-client', clientSecret: 'synthetic-secret' }) };
    }
    if (command.name === 'ExecuteStatementCommand') {
      return database.execute(command.input.sql, command.input.parameters ?? []);
    }
    throw new Error(`Unexpected AWS command ${command.name} during GH-333 validation.`);
  };

  const fakeAwsModule = new Proxy({}, {
    get(_target, property) {
      return class FakeAwsClientOrCommand {
        constructor(input) {
          this.input = input;
          this.name = String(property);
        }

        async send(command) {
          return handleCommand(command);
        }
      };
    },
  });

  const sandbox = {
    Buffer,
    TextDecoder,
    TextEncoder,
    URL,
    URLSearchParams,
    clearTimeout,
    console: {
      error: (message) => warnings.push(String(message)),
      info: () => undefined,
      log: () => undefined,
      warn: (message) => warnings.push(String(message)),
    },
    exports: module.exports,
    fetch: roller.fetchImpl,
    module,
    process: { env: { ...env } },
    require(moduleId) {
      if (moduleId === 'crypto' || moduleId === 'node:crypto') return crypto;
      if (moduleId.startsWith('@aws-sdk/')) return fakeAwsModule;
      throw new Error(`Unexpected require(${JSON.stringify(moduleId)}) during GH-333 validation.`);
    },
    setTimeout,
  };

  vm.runInNewContext(
    `${source}\nmodule.exports.__gh333 = { claimExistingIdempotencyKey, finalizeRedeemLocally, findSucceededRedeemReceipt, getRollerTicketRedeemStates, normalizeBooking };`,
    sandbox,
    { filename: REDEEM_PATH },
  );

  return { handler: module.exports.handler, internals: module.exports.__gh333, warnings };
}

function staffRedeemEvent() {
  return {
    __jumpyardTrustedStaffActor: {
      actorId: 'staff-333',
      displayName: 'Synthetic Staff',
      environment: 'park-test',
      role: 'staff_operator',
      sessionId: 'staff-session-333',
      staffIdentityId: 'staff-333',
      venueId: VENUE,
    },
    __jumpyardTrustedStaffRedeem: true,
    __jumpyardTrustedStaffSessionId: SESSION_ID,
    body: JSON.stringify({
      bookingReference: BOOKING_REFERENCE,
      confirmRedeem: true,
      correlationId: 'jy_gh333_validation',
      expectedDate: APPROVED_DATE,
      idempotencyKey: IDEMPOTENCY_KEY,
      rollerUniqueId: BOOKING_ID,
      ticketIds: TICKETS,
    }),
    headers: {},
    pathParameters: {},
    rawPath: '/v1/check-in/redeem',
    routeKey: 'POST /v1/check-in/redeem',
  };
}

async function run({ database: dbScript, roller: rollerScript } = {}) {
  const database = createDatabase(dbScript);
  const roller = createRoller(rollerScript);
  const loaded = loadRedeem({ database, roller });
  const response = await loaded.handler(staffRedeemEvent());
  return {
    body: JSON.parse(response.body),
    calls: database.state.calls,
    roller: roller.calls,
    statusCode: response.statusCode,
    warnings: loaded.warnings,
  };
}

const sqlIndex = (calls, pattern, parameterMatch = null) => calls.findIndex((call) =>
  pattern.test(call.sql) && (!parameterMatch || parameterValue(call.parameters, parameterMatch.name) === parameterMatch.value));
const countRoller = (calls, entry) => calls.filter((call) => call === entry).length;

async function validateReceiptIsWrittenBeforeBookkeeping() {
  const result = await run();

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.status, 'redeemed');
  assert.equal(result.body.recovered, undefined);
  assert.deepEqual(result.body.redeemedTicketIds, TICKETS);
  assert.equal(result.body.session?.status, 'redeemed');
  assert.equal(result.body.session?.handoffStatus, 'completed');
  assert.equal(countRoller(result.roller, 'POST /redemptions'), 1);

  const receipt = sqlIndex(result.calls, /WITH marked_tickets AS/);
  const attempt = sqlIndex(result.calls, /INSERT INTO jumpyard\.checkin_attempts/, { name: 'status', value: 'redeemed' });
  const event = sqlIndex(result.calls, /INSERT INTO jumpyard\.event_log/, { name: 'eventType', value: 'checkin.redeem_succeeded' });
  assert.ok(receipt >= 0, 'The durable receipt statement must run.');
  assert.ok(attempt >= 0 && event >= 0, 'Success bookkeeping must still be written.');
  assert.ok(attempt > receipt && event > receipt, 'Attempt and event bookkeeping must follow the receipt.');
  assert.equal(
    sqlIndex(result.calls, /INSERT INTO jumpyard\.checkin_attempts/),
    attempt,
    'No attempt row is written before the receipt on the success path.',
  );

  const receiptSql = result.calls[receipt].sql;
  assert.match(receiptSql, /UPDATE jumpyard\.roller_booking_tickets/);
  assert.match(receiptSql, /UPDATE jumpyard\.idempotency_records/);
  assert.match(receiptSql, /UPDATE jumpyard\.checkin_sessions/);
  assert.equal(
    result.calls.filter((call) => /SET redeem_status_last_seen = 'redeemed'/.test(call.sql)).length,
    1,
    'Tickets are marked inside the single receipt statement, not one statement per ticket.',
  );
  console.log('[pass] Roller OK is followed by one atomic receipt (tickets, key, session) before other bookkeeping');
}

async function validateReplayCompletesWithoutRoller() {
  const result = await run({ database: { existingKey: { requestHash: 'same', resultRef: 'redeemed:333001', status: 'succeeded' }, reserveInserted: false } });

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.status, 'redeemed');
  assert.equal(result.body.recovered, 'local_receipt');
  assert.equal(result.body.session?.status, 'redeemed');
  assert.equal(countRoller(result.roller, 'POST /redemptions'), 0, 'A replayed key must not redeem again in Roller.');
  assert.ok(sqlIndex(result.calls, /WITH marked_tickets AS/) >= 0);
  console.log('[pass] a replayed key completes the local check-in without a second Roller redemption');
}

async function validateLiveInProgressKeyIsBusy() {
  const result = await run({ database: { existingKey: { requestHash: 'same', stale: false, status: 'in_progress' }, reserveInserted: false } });

  assert.equal(result.statusCode, 409);
  assert.equal(result.body.error?.code, 'redeem_in_progress');
  assert.equal(result.body.retryAfterSeconds, 5);
  assert.equal(countRoller(result.roller, 'POST /redemptions'), 0);
  assert.equal(sqlIndex(result.calls, /WITH marked_tickets AS/), -1, 'A busy key must not finalize anything.');
  console.log('[pass] a live in-progress key on another device is reported busy without touching Roller');
}

async function validateStaleInProgressResumesFromRollerState() {
  const result = await run({
    database: { existingKey: { requestHash: 'same', stale: true, status: 'in_progress' }, reserveInserted: false },
    roller: { ticketStatus: 'Redeemed' },
  });

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.recovered, 'roller_ticket_status');
  assert.equal(countRoller(result.roller, 'POST /redemptions'), 0, 'Roller already redeemed the tickets; no second redemption.');
  assert.ok(sqlIndex(result.calls, /UPDATE jumpyard\.idempotency_records\s+SET status = 'in_progress'/) >= 0, 'The stale key is taken over.');
  assert.ok(sqlIndex(result.calls, /WITH marked_tickets AS/) >= 0);
  console.log('[pass] a stale in-progress key is resumed and completed from Roller ticket state');
}

async function validateRollerConflictWithUnredeemedTicketsStaysRejected() {
  const result = await run({ roller: { redemptionStatus: 409, ticketStatus: 'Unredeemed' } });

  assert.equal(result.statusCode, 409);
  assert.equal(result.body.status, 'rejected');
  assert.equal(result.body.error?.code, 'roller_redeem_rejected');
  assert.equal(result.body.recovered, undefined);
  assert.equal(countRoller(result.roller, `GET /bookings/${BOOKING_ID}`), 2, 'A 409 triggers exactly one authoritative recheck.');
  assert.equal(sqlIndex(result.calls, /WITH marked_tickets AS/), -1, 'A generic 409 must not be marked as a completed check-in.');
  assert.ok(sqlIndex(result.calls, /UPDATE jumpyard\.idempotency_records\s+SET status = :status/) >= 0, 'The key is marked failed for retry.');
  console.log('[pass] a Roller 409 with unredeemed tickets stays rejected and is never marked complete');
}

async function validateRollerConflictWithRedeemedTicketsCompletesLocally() {
  const result = await run({ roller: { redemptionStatus: 409, ticketStatus: 'Unredeemed', ticketStatusOnRecheck: 'Redeemed' } });

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.status, 'redeemed');
  assert.equal(result.body.recovered, 'roller_ticket_status');
  assert.equal(result.body.roller?.statusCode, 409);
  assert.equal(result.body.session?.status, 'redeemed');
  assert.ok(sqlIndex(result.calls, /WITH marked_tickets AS/) >= 0);
  console.log('[pass] a Roller 409 whose recheck shows every selected ticket redeemed completes the check-in');
}

async function validateDifferentRequestBehindSameKeyIsRejected() {
  const result = await run({ database: { existingKey: { requestHash: 'another-request', status: 'succeeded' }, reserveInserted: false } });

  assert.equal(result.statusCode, 409);
  assert.equal(result.body.error?.code, 'idempotency_key_reused');
  assert.equal(countRoller(result.roller, 'POST /redemptions'), 0);
  console.log('[pass] a different request behind the same key is still rejected');
}

async function validateBookkeepingFailureKeepsTheReceipt() {
  const result = await run({ database: { failAttemptInsert: true } });

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.status, 'redeemed');
  assert.equal(result.body.session?.status, 'redeemed');
  assert.ok(sqlIndex(result.calls, /WITH marked_tickets AS/) >= 0);
  assert.ok(
    result.warnings.some((line) => line.includes('checkin.redeem_bookkeeping_failed') && line.includes('synthetic_db_failure')),
    'A bookkeeping failure after the receipt is logged without personal data.',
  );
  assert.ok(!result.warnings.some((line) => /synthetic-token|synthetic-secret/.test(line)));
  console.log('[pass] a bookkeeping failure after the receipt does not undo the completed redeem');
}

async function validateReceiptLookupAndTicketStates() {
  const database = createDatabase({ receiptByKey: true });
  const { internals } = loadRedeem({ database, roller: createRoller() });

  // Objects cross the vm realm boundary, so compare fields rather than prototypes.
  const receipt = await internals.findSucceededRedeemReceipt({ idempotencyKey: IDEMPOTENCY_KEY, ticketIds: TICKETS });
  assert.equal(receipt?.source, 'local_receipt');
  assert.equal(receipt?.via, 'idempotency_key');
  assert.ok(
    database.state.calls.every((call) => !/FROM jumpyard\.checkin_attempts/.test(call.sql)),
    'The redeem runtime role may only insert into checkin_attempts; receipts must not read it.',
  );

  const none = createDatabase({});
  const noneInternals = loadRedeem({ database: none, roller: createRoller() }).internals;
  assert.equal(await noneInternals.findSucceededRedeemReceipt({ idempotencyKey: IDEMPOTENCY_KEY, ticketIds: TICKETS }), null);
  assert.equal(await noneInternals.findSucceededRedeemReceipt({ idempotencyKey: IDEMPOTENCY_KEY, ticketIds: [] }), null);
  assert.equal(await noneInternals.findSucceededRedeemReceipt({ idempotencyKey: null, ticketIds: TICKETS }), null);
  assert.equal(none.state.calls.length, 1, 'Only the key lookup runs; empty tickets or a missing key never query.');

  const normalized = internals.normalizeBooking(rollerBooking('Redeemed'), { byId: new Map() });
  assert.equal(internals.getRollerTicketRedeemStates(normalized, TICKETS).allRedeemed, true);
  const mixed = internals.normalizeBooking(rollerBooking('Redeemed'), { byId: new Map() });
  mixed.items[0].tickets[1].redeemStatus = 'Unredeemed';
  assert.equal(internals.getRollerTicketRedeemStates(mixed, TICKETS).allRedeemed, false);
  assert.equal(internals.getRollerTicketRedeemStates(normalized, [...TICKETS, 'missing-ticket']).allRedeemed, false);
  assert.equal(internals.getRollerTicketRedeemStates(normalized, []).allRedeemed, false);
  assert.equal(internals.getRollerTicketRedeemStates(internals.normalizeBooking(rollerBooking(null), { byId: new Map() }), TICKETS).allRedeemed, false);
  console.log('[pass] receipts are found by key or attempt, and only an explicit Roller redeemed state counts');
}

function validateSourceContracts() {
  const redeemSource = fs.readFileSync(REDEEM_PATH, 'utf8');
  const stackSource = fs.readFileSync(path.join(ROOT, 'infra', 'lib', 'jumpyard-cloud-stack.ts'), 'utf8');
  const adminPage = fs.readFileSync(path.join(ROOT, 'jumpyard-checkin-admin', 'src', 'app', 'page.tsx'), 'utf8');
  const adminApi = fs.readFileSync(path.join(ROOT, 'jumpyard-checkin-admin', 'src', 'lib', 'adminApi.ts'), 'utf8');
  const contract = fs.readFileSync(path.join(ROOT, 'JUMPYARD_CLOUD_CONTRACT.md'), 'utf8');
  const packageJson = fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8');

  const wrapperStart = redeemSource.indexOf('async function handleStaffSessionRedeem(');
  const wrapper = redeemSource.slice(wrapperStart, redeemSource.indexOf('function parseRequest(', wrapperStart));
  assert.ok(wrapper.indexOf('findSucceededRedeemReceipt(') < wrapper.indexOf('await exports.handler(redeemEvent)'),
    'The staff wrapper must check for an existing receipt before invoking the redeem handler.');
  assert.match(wrapper, /__jumpyardTrustedStaffSessionId: session\.checkinSessionId/);
  assert.match(wrapper, /redeemBody\.session\?\.status === 'redeemed'/);

  assert.match(stackSource, /createHandler\('RedeemHandler'[\s\S]*?timeout: Duration\.seconds\(25\)/);
  assert.match(adminPage, /idempotencyKey: `staff-redeem:\$\{detail\.checkinSessionId\}`,/);
  assert.doesNotMatch(adminPage, /staff-redeem:\$\{detail\.checkinSessionId\}:\$\{crypto\.randomUUID\(\)\}/);
  assert.match(adminPage, /redeemError\.code === "redeem_in_progress"/);
  assert.match(adminPage, /result\.recovered/);
  assert.match(adminApi, /recovered: body\.recovered === "local_receipt" \|\| body\.recovered === "roller_ticket_status"/);
  assert.match(contract, /redeem_in_progress/);
  assert.match(contract, /roller_ticket_status/);
  assert.match(packageJson, /validate:gh333-staff-redeem-recovery/);
  console.log('[pass] wrapper order, stable staff key, timeout, admin handling and contract are in place');
}

async function main() {
  await validateReceiptIsWrittenBeforeBookkeeping();
  await validateReplayCompletesWithoutRoller();
  await validateLiveInProgressKeyIsBusy();
  await validateStaleInProgressResumesFromRollerState();
  await validateRollerConflictWithUnredeemedTicketsStaysRejected();
  await validateRollerConflictWithRedeemedTicketsCompletesLocally();
  await validateDifferentRequestBehindSameKeyIsRejected();
  await validateBookkeepingFailureKeepsTheReceipt();
  await validateReceiptLookupAndTicketStates();
  validateSourceContracts();
  console.log('GH-333 staff redeem recovery validation passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
