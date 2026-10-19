'use strict';

// GH-547 (D0265): a guest who is done on the phone or kiosk is checked in for staff at once. Until ROLLER
// confirms a paid purchase, Cloud lists the paid draft's goods for the staff board and detail. A kiosk
// add-on that ROLLER confirms admits its group, and a band handout admits a group Cloud has not. These
// checks drive the real Lambda sources with a scripted Aurora Data API, Lambda and ROLLER; nothing
// reaches AWS or ROLLER.

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const BOOKING_PATH = path.join(ROOT, 'infra', 'lambda', 'booking', 'index.js');
const SESSION_PATH = path.join(ROOT, 'infra', 'lambda', 'session', 'index.js');
const REDEEM_PATH = path.join(ROOT, 'infra', 'lambda', 'redeem', 'index.js');
const { buildManifest, classifyItem, provisionalManifest } = require('../infra/lambda/shared/staff-handout');
const { createStaffBoard } = require('../infra/lambda/session/staff-board');
const TODAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const VENUE = '50871';
const plain = (value) => JSON.parse(JSON.stringify(value));

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

// Loads one Lambda source with fake AWS clients. `overrides` replaces functions after the source has
// loaded (staff authentication), the way a verified staff token would.
function loadLambda(file, { env = {}, execute, fetchImpl, invokes = [], expose = [], overrides = '' }) {
  const directory = path.dirname(file);
  const module = { exports: {} };
  const aws = fakeAws(async (command) => {
    if (command.name === 'ExecuteStatementCommand') return execute(command.input.sql, command.input.parameters ?? []);
    if (command.name === 'InvokeCommand') { invokes.push(command.input); return { StatusCode: 202 }; }
    if (command.name === 'GetParameterCommand') {
      const name = String(command.input?.Name ?? '');
      if (name === env.ROLLER_ENV_PARAMETER_NAME) return { Parameter: { Value: 'live' } };
      if (name === env.ROLLER_BASE_URL_PARAMETER_NAME) return { Parameter: { Value: 'https://api.roller.app' } };
    }
    if (command.name === 'GetSecretValueCommand') return { SecretString: JSON.stringify({ clientId: 'c', clientSecret: 's' }) };
    throw new Error(`Unexpected AWS command ${command.name} during GH-547 validation.`);
  });
  vm.runInNewContext(`${fs.readFileSync(file, 'utf8')}\n${overrides}\nmodule.exports.__gh547 = { ${expose.join(', ')} };`, {
    AbortSignal, Buffer, TextDecoder, TextEncoder, URL, URLSearchParams, clearTimeout, setTimeout,
    console: { error() {}, info() {}, log() {}, warn() {} },
    exports: module.exports, module,
    fetch: fetchImpl ?? (async () => { throw new Error('Unexpected network call during GH-547 validation.'); }),
    process: { env: { DATABASE_CLUSTER_ARN: 'arn:aws:rds:eu-north-1:000000000000:cluster:synthetic',
      DATABASE_SECRET_ARN: 'arn:aws:secretsmanager:eu-north-1:000000000000:secret:synthetic', ...env } },
    require(moduleId) {
      if (moduleId === 'crypto' || moduleId === 'node:crypto') return crypto;
      if (moduleId.startsWith('@aws-sdk/')) return aws;
      if (moduleId.startsWith('./')) return require(path.join(directory, moduleId));
      throw new Error(`Unexpected require(${JSON.stringify(moduleId)}) during GH-547 validation.`);
    },
  }, { filename: file });
  return { handler: module.exports.handler, internals: module.exports.__gh547 };
}
const payloads = (invokes) => invokes.map((invoke) => [invoke.FunctionName, invoke.InvocationType,
  JSON.parse(Buffer.from(invoke.Payload).toString('utf8'))]);

// A kiosk purchase as the Booking Lambda stores its draft (buildProductDisplayItem): Cloud's own types.
const draftItems = [
  { productId: '1189806', parentProductId: '1189805', productName: '60 min entré', parentProductName: 'Entré 60 min',
    productType: 'entry', quantity: 2, bookingDate: TODAY, startTime: '14:30', endTime: '15:30', durationMinutes: 60 },
  { productId: '1765445', productName: 'JumpSocks', productType: 'addon', quantity: 2, bookingDate: TODAY, startTime: '14:30', durationMinutes: 0 },
  { productId: '1765452', productName: 'Bryggkaffe', productType: 'addon', quantity: 1, bookingDate: TODAY, startTime: '14:30', durationMinutes: 0 },
];

test('A confirmed kiosk add-on asks the Redeem Lambda to admit its group, like a new kiosk purchase', async () => {
  for (const confirmed of [true, false]) {
    const invokes = [];
    const statements = [];
    const { internals } = loadLambda(BOOKING_PATH, { env: { AUTO_CHECKIN_FUNCTION_NAME: 'synthetic-redeem' }, invokes,
      expose: ['confirmKioskAddProductReconciliation'],
      execute: async (sql) => {
        statements.push(sql);
        return confirmed && /WITH confirmed_draft AS/.test(sql) ? rdsResult([{ add_on_group_id: 'jyao_547', linked_add_on_session_count: 2,
          linked_add_on_session_ids: '["jycs_one","jycs_two"]' }]) : rdsResult([]);
      } });
    const result = await internals.confirmKioskAddProductReconciliation(
      { correlationId: 'jy_gh547', paymentAttemptId: 'jytp_547', prepaymentDraftId: 'jypd_547' }, { bookingReference: 'R547' });
    assert.match(statements[0], /\(SELECT jsonb_agg\(checkin_session_id\) FROM updated_session\)::text AS linked_add_on_session_ids/);
    if (!confirmed) {
      assert.equal(result, null);
      assert.equal(invokes.length, 0, 'nothing confirmed, nothing admitted');
      continue;
    }
    assert.equal(result.add_on_group_id, 'jyao_547');
    assert.deepEqual(payloads(invokes), ['jycs_one', 'jycs_two'].map((checkinSessionId) => ['synthetic-redeem', 'Event',
      { source: 'jumpyard.auto-checkin', detail: { checkinSessionId, correlationId: 'jy_gh547', trigger: 'kiosk_add_on_confirmed' } }]));
  }
});

test('An add-on ROLLER confirms after the reconciliation window admits its group when the board sees it', async () => {
  for (const [ids, expected] of [['["jycs_late"]', ['jycs_late']], [null, []]]) {
    const invokes = [];
    const statements = [];
    const { internals } = loadLambda(SESSION_PATH, { env: { AUTO_CHECKIN_FUNCTION_NAME: 'synthetic-redeem' }, invokes,
      expose: ['refreshLinkedAddOnEffectiveSyncState'],
      execute: async (sql) => { statements.push(sql); return rdsResult([{ updated_session_count: 1, confirmed_session_ids: ids }]); } });
    assert.equal(await internals.refreshLinkedAddOnEffectiveSyncState(null, VENUE), 1);
    assert.match(statements[0], /RETURNING session\.checkin_session_id, sync\.booking_sync_status/);
    assert.match(statements[0], /FROM updated_session\s+WHERE booking_sync_status = 'confirmed'\)::text AS confirmed_session_ids/);
    assert.deepEqual(payloads(invokes), expected.map((checkinSessionId) => ['synthetic-redeem', 'Event',
      { source: 'jumpyard.auto-checkin', detail: { checkinSessionId, correlationId: null, trigger: 'kiosk_add_on_confirmed' } }]));
  }
});

test('A paid draft becomes the same handout lines, counters and band colours, marked provisional', () => {
  const lines = provisionalManifest([{ rollerUniqueId: 'draft-1', items: draftItems }, null, { rollerUniqueId: 'addon-1', items: [draftItems[1]] }], TODAY);
  assert.deepEqual(plain(lines.map(({ id, kind, area, name, quantity, provisional }) => [id, kind, area, name, quantity, provisional])), [
    [`draft-1:provisional:0:${TODAY}:purchased`, 'admission', 'entrance', 'Besöksband', 2, true],
    [`draft-1:provisional:1:${TODAY}:purchased`, 'socks', 'entrance', 'JumpSocks', 2, true],
    [`draft-1:provisional:2:${TODAY}:purchased`, 'coffee', 'cafe', 'Bryggkaffe', 1, true],
    [`addon-1:provisional:0:${TODAY}:purchased`, 'socks', 'entrance', 'JumpSocks', 2, true],
  ]);
  assert.equal(lines[0].bandColour.id, 'gul', 'the band follows the end time 15:30 (D0233)');
  assert.equal(lines[0].productId, '1189806', 'the product links the line to ROLLER\'s booking later');
  // The verified Weekday Combo keeps its contents; another day's lines and empty drafts list nothing.
  const combo = provisionalManifest([{ rollerUniqueId: 'combo', items: [{ productId: '1242136', parentProductId: '1242135',
    productName: 'Weekday Combo', productType: 'combo', quantity: 1, bookingDate: TODAY, startTime: '12:00', endTime: '13:00' }] }], TODAY);
  assert.deepEqual(combo.map((line) => [line.kind, line.area, line.quantity]), [['admission', 'entrance', 2], ['pizza', 'cafe', 1]]);
  assert.equal(provisionalManifest([{ rollerUniqueId: 'old', items: [{ ...draftItems[0], bookingDate: '2000-01-01' }] }], TODAY).length, 0);
  assert.deepEqual(provisionalManifest(null, TODAY), []);
  // ROLLER's own lines never take Cloud's purchase types and never carry the provisional mark.
  assert.equal(classifyItem({ summary: { productType: 'entry' }, productName: 'Entré 60 min' }), 'other');
  assert.equal(classifyItem({ summary: { productType: 'entry' }, provisional: true }), 'admission');
  const authoritative = buildManifest([{ rollerUniqueId: 'R1', bookingItemId: 'i1', productId: 'p', productName: '60 min entré',
    quantity: 2, bookingDate: TODAY, startTime: '14:30:00', endTime: '15:30:00', summary: { productType: 'sessionpass' } }], TODAY);
  assert.equal(authoritative[0].provisional, undefined);
  assert.equal(authoritative[0].bandColour.id, 'gul');
});

test('The staff board counts a pending purchase\'s goods from its paid draft; a confirmed row is unchanged', async () => {
  const statements = [];
  const rows = [
    { checkin_session_id: 'jycs_kiosk', booking_sync_status: 'pending', visit_date: TODAY, handout_catalog: '[]', collected_items: '{}',
      provisional_catalog: JSON.stringify([{ rollerUniqueId: 'draft-1', items: draftItems }, null,
        { rollerUniqueId: 'addon-1', items: [{ ...draftItems[2], quantity: 2 }] }]), board_cursor: 'a' },
    { checkin_session_id: 'jycs_done', booking_sync_status: 'confirmed', visit_date: TODAY, collected_items: '{}', provisional_catalog: null,
      handout_catalog: JSON.stringify([{ rollerUniqueId: 'R1', bookingItemId: 'i1', productId: 'p', productName: '90 min entré', quantity: 3,
        bookingDate: TODAY, startTime: '11:30:00', endTime: '13:00:00', summary: { productType: 'sessionpass' } }]), board_cursor: 'b' },
  ];
  const board = createStaffBoard({ executeStatement: async (sql) => { statements.push(sql); return rows; }, mappedRows: (result) => result,
    stringParameter: (name, value) => ({ name, value }),
    mapSession: (row) => ({ checkinSessionId: row.checkin_session_id, bookingSyncStatus: row.booking_sync_status, counts: {} }) });
  const { sessions } = await board.list({ day: TODAY, search: null, cursor: null, venueId: VENUE, todayOnly: true });
  const [kiosk, done] = plain(sessions);
  assert.equal(kiosk.counts.admission, 2);
  assert.deepEqual(kiosk.bandColours.map((band) => [band.id, band.quantity]), [['gul', 2]]);
  assert.deepEqual([kiosk.cafeQuantity, kiosk.cafeRemaining], [3, 3], 'the purchase\'s coffee and the pending add-on\'s two');
  assert.equal(done.counts.admission, 3);
  assert.deepEqual(done.bandColours.map((band) => band.id), ['morkbla']);
  assert.deepEqual([done.cafeQuantity, done.cafeRemaining], [0, 0]);
  const sql = statements[0];
  assert.match(sql, /CASE WHEN COALESCE\(cs\.session_summary ->> 'bookingSyncStatus', 'confirmed'\) <> 'confirmed' THEN jsonb_build_array\(/);
  // GH-582: the draft also stands in while ROLLER's items have arrived but the session has no tickets yet.
  assert.match(sql, /WHERE d\.roller_draft_unique_id = b\.roller_unique_id\s+AND \(cs\.selected_ticket_ids = '\[\]'::jsonb\s+OR NOT EXISTS \(SELECT 1 FROM jumpyard\.roller_booking_items i WHERE i\.roller_unique_id = b\.roller_unique_id\)\)/);
  assert.match(sql, /d\.payment_attempt_status IN \('approved', 'reconciled'\) AND d\.booking_confirmation_status IN \('pending', 'needs_staff'\)/);
  assert.match(sql, /NOT EXISTS \(SELECT 1 FROM jumpyard\.roller_booking_items i WHERE i\.roller_unique_id = link\.linked_roller_unique_id\)/);
});

function sessionDetailDatabase(syncStatus, calls) {
  return async (sql) => {
    calls.push(sql);
    if (/WITH linked_state AS/.test(sql)) return rdsResult([{ updated_session_count: 0, confirmed_session_ids: null }]);
    if (/WHERE cs\.checkin_session_id = :checkinSessionId/.test(sql)) {
      return rdsResult([{ checkin_session_id: 'jycs_kiosk', roller_unique_id: 'draft-1', booking_reference: 'draft-1', visit_date: TODAY,
        status: 'ready_for_staff', safety_status: 'completed', handoff_code: '0058', handoff_status: 'ready_for_staff',
        booking_sync_status: syncStatus, selected_ticket_ids: '[]', start_time: '14:30:00', ready_for_staff_at: `${TODAY}T12:09:00.000Z` }]);
    }
    if (/WITH staff_items AS/.test(sql)) return rdsResult([]);
    if (/SELECT[\s\S]*draft\.add_on_group_id/.test(sql)) return rdsResult([]);
    if (/SELECT draft\.items_summary::text AS items_summary/.test(sql)) return rdsResult([{ items_summary: JSON.stringify(draftItems) }]);
    if (/WITH source_bookings AS MATERIALIZED/.test(sql)) return rdsResult([]);
    if (/FROM jumpyard\.staff_handout_claims c WHERE c\.roller_unique_id/.test(sql)) return rdsResult([{ claims: '[]', receipts: '[]' }]);
    return rdsResult([]);
  };
}

test('The staff detail lists a pending purchase\'s goods as handout lines, also past the window, until ROLLER confirms', async () => {
  for (const syncStatus of ['pending', 'needs_staff', 'confirmed']) {
    const calls = [];
    const { internals } = loadLambda(SESSION_PATH, { execute: sessionDetailDatabase(syncStatus, calls), expose: ['handleStaffSessionDetail'],
      overrides: `authorizeStaffRequest = async () => ({ ok: true, staff: { actorId: 'staff-1', venueId: '${VENUE}', role: 'staff_operator' } });` });
    const response = await internals.handleStaffSessionDetail({ pathParameters: { checkinSessionId: 'jycs_kiosk' },
      rawPath: '/v1/staff/check-in/sessions/jycs_kiosk', headers: {} }, 'jy_gh547');
    assert.equal(response.statusCode, 200, syncStatus);
    const { session } = JSON.parse(response.body);
    if (syncStatus === 'confirmed') {
      assert.deepEqual(session.handout.items, [], 'a confirmed booking lists only ROLLER\'s lines');
      assert.equal(calls.some((sql) => /SELECT draft\.items_summary::text AS items_summary/.test(sql)), false);
      continue;
    }
    assert.deepEqual(session.handout.items.map((item) => [item.kind, item.area, item.quantity, item.collected, item.available, item.provisional]), [
      ['admission', 'entrance', 2, 0, 2, true], ['socks', 'entrance', 2, 0, 2, true], ['coffee', 'cafe', 1, 0, 1, true]], syncStatus);
    assert.equal(session.handout.items[0].bandColour.id, 'gul');
    assert.equal(session.counts.admission, 2);
    assert.equal(new Set(session.handout.items.map((item) => item.id)).size, 3);
  }
});

// --- A band handout admits the group when Cloud has not (D0217, needsAdmission) ---------------------
const SESSION_ID = 'jycs_547';
const BOOKING_ID = 'roller-booking-547';
const TICKETS = ['547001-1', '547001-2'];
const MANIFEST_ID = `${BOOKING_ID}:item-1:${TODAY}:purchased`;
const OPERATION_ID = `handout:${SESSION_ID}:entrance:3`;

function redeemEnvironment() {
  return {
    ENABLE_ROLLER_REDEEM_WRITES: 'true', ENABLE_T0166_LIVE_REDEEM_SMOKE: 'false', ENABLE_T0176_FULL_FLOW_REHEARSAL: 'true',
    JUMPYARD_EMERGENCY_STOP: 'false', JUMPYARD_ENVIRONMENT: 'park-test',
    ROLLER_BASE_URL_PARAMETER_NAME: '/synthetic/roller/base-url', ROLLER_ENV_PARAMETER_NAME: '/synthetic/roller/env',
    ROLLER_CREDENTIALS_SECRET_ARN: 'arn:aws:secretsmanager:eu-north-1:000000000000:secret:roller',
    STAFF_IDENTITY_VENUE_ID: VENUE, T0176_FULL_FLOW_ALLOWED_OPERATING_DATES: TODAY, T0176_FULL_FLOW_VENUE_ID: VENUE,
  };
}
function redeemDatabase({ admitted }) {
  const state = { calls: [], prepared: false, redeemed: admitted, actions: [] };
  const ticketsJson = (status) => JSON.stringify(TICKETS.map((ticketId) => ({ ticketId, bookingItemId: 'item-1', productId: '900001',
    bookingDate: TODAY, redeemStatusLastSeen: status, lastSeenFromRollerAt: `${TODAY}T09:00:00.000Z`, ticketProductType: 'standardPass',
    ticketProductSubType: null, ticketSource: 'roller_live', itemProductType: 'standardPass', itemProductSubType: null, itemParentType: null,
    productCatalogType: null, productCatalogSubType: null, productCatalogParentType: null, productName: '60 min entré', parentProductName: null })));
  const sessionRow = () => ({ checkin_session_id: SESSION_ID, roller_unique_id: BOOKING_ID, booking_reference: '547001', visit_date: TODAY,
    status: state.redeemed ? 'redeemed' : 'ready_for_staff', safety_status: 'completed', handoff_code: '0547',
    handoff_status: state.redeemed ? 'completed' : 'ready_for_staff', booking_sync_status: 'confirmed', selected_ticket_ids: JSON.stringify(TICKETS),
    expires_at: '2999-01-01T00:00:00.000Z', ready_for_staff_at: `${TODAY}T10:00:00.000Z`, completed_at: state.redeemed ? `${TODAY}T10:01:00.000Z` : null,
    updated_at: `${TODAY}T10:00:00.000Z`, checked_in_by: null,
    handout_claim: state.prepared ? JSON.stringify({ actorId: 'staff-1', operationId: OPERATION_ID }) : null });
  const handoutLine = { id: MANIFEST_ID, sourceBookingId: BOOKING_ID, bookingItemId: 'item-1', area: 'entrance', kind: 'admission', quantity: 2 };
  const execute = async (sql, parameters) => {
    state.calls.push({ sql, parameters });
    if (/SELECT jumpyard\.change_staff_handout\(/.test(sql)) {
      const action = parameterValue(parameters, 'action');
      state.actions.push(action);
      if (action === 'prepare') state.prepared = true;
      return rdsResult([{ result: JSON.stringify({ operationId: OPERATION_ID, needsAdmission: true, items: [handoutLine], revision: 3,
        completed: action === 'complete' }) }]);
    }
    if (/WITH source_bookings AS MATERIALIZED/.test(sql)) {
      return rdsResult([{ roller_unique_id: BOOKING_ID, booking_item_id: 'item-1', product_id: '900001', parent_product_id: null,
        product_name: '60 min entré', parent_product_name: null, quantity: 2, booking_date: TODAY, start_time: '14:00:00', end_time: '15:00:00',
        selected_units: 2, summary: JSON.stringify({ productType: 'standardPass' }) }]);
    }
    if (/FROM jumpyard\.staff_handout_claims c WHERE c\.roller_unique_id/.test(sql)) return rdsResult([{ claims: '[]', receipts: '[]' }]);
    if (/WITH marked_tickets AS/.test(sql)) {
      state.redeemed = true;
      if (/UPDATE jumpyard\.checkin_sessions/.test(sql)) return rdsResult([sessionRow()], 1);
      return rdsResult([{ marked_tickets: TICKETS.length, completed_keys: 1 }]);
    }
    if (/FROM jumpyard\.checkin_sessions AS cs/.test(sql)) return rdsResult([sessionRow()]);
    if (/FROM jumpyard\.roller_bookings AS b/.test(sql)) {
      return rdsResult([{ roller_unique_id: BOOKING_ID, booking_reference: '547001', roller_env: 'live', booking_status: 'confirmed',
        payment_status: 'paid', amount_owing_cents: 0, total_cents: 40000, booking_date: TODAY, venue_id: VENUE, start_time: '00:00:00',
        end_time: '23:59:00', freshness_status: 'fresh', is_tombstoned: false, last_seen_from_roller_at: `${TODAY}T09:00:00.000Z`,
        tickets_json: ticketsJson(state.redeemed ? 'Redeemed' : null) }]);
    }
    if (/INSERT INTO jumpyard\.roller_bookings/.test(sql)) return rdsResult([], 1);
    if (/INSERT INTO jumpyard\.roller_booking_items/.test(sql)) return rdsResult([{ booking_item_key: 'jybi_547' }], 1);
    if (/INSERT INTO jumpyard\.roller_booking_tickets/.test(sql)) return rdsResult([], 1);
    if (/INSERT INTO jumpyard\.idempotency_records/.test(sql)) return rdsResult([], 1);
    if (/UPDATE jumpyard\.idempotency_records\s+SET status = :status/.test(sql)) return rdsResult([], 1);
    if (/SELECT status\s+FROM jumpyard\.idempotency_records/.test(sql)) return rdsResult([]);
    if (/UPDATE jumpyard\.checkin_sessions\s+SET\s+status = 'redeemed'/.test(sql)) { state.redeemed = true; return rdsResult([sessionRow()], 1); }
    if (/INSERT INTO jumpyard\.checkin_attempts/.test(sql)) return rdsResult([], 1);
    if (/INSERT INTO jumpyard\.event_log/.test(sql)) return rdsResult([], 1);
    throw new Error(`Unexpected SQL during GH-547 handout validation: ${sql.slice(0, 120)}`);
  };
  return { execute, state };
}
function roller(admitted) {
  const calls = [];
  let redeemed = admitted;
  const json = (status, body) => ({ ok: status >= 200 && status < 300, status, async json() { return body; }, async text() { return JSON.stringify(body); } });
  const fetchImpl = async (url, init = {}) => {
    const target = new URL(String(url));
    const method = init.method ?? 'GET';
    calls.push(`${method} ${target.pathname}`);
    if (target.pathname === '/token') return json(200, { access_token: 'synthetic-token', token_type: 'Bearer', expires_in: 3600 });
    if (target.pathname === `/bookings/${BOOKING_ID}`) {
      return json(200, { uniqueId: BOOKING_ID, bookingReference: '547001', status: 'Confirmed', paymentStatus: 'Paid', amountOwing: 0, total: 400,
        venueId: Number(VENUE), items: [{ bookingItemId: 'item-1', productId: 900001, productName: '60 min entré', productType: 'standardPass',
          quantity: TICKETS.length, bookingDate: TODAY, startTime: '00:00:00', endTime: '23:59:00',
          tickets: TICKETS.map((ticketId) => ({ ticketId, redeemStatus: redeemed ? 'Redeemed' : 'Unredeemed', locations: [] })) }] });
    }
    if (target.pathname === '/redemptions' && method === 'POST') { redeemed = true; return json(200, { redeemed: TICKETS }); }
    throw new Error(`Unexpected ROLLER call during GH-547 validation: ${method} ${target.pathname}`);
  };
  return { calls, fetchImpl };
}
const STAFF = { actorId: 'staff-1', staffIdentityId: 'staff-1', displayName: 'Anna', venueId: VENUE, role: 'staff_operator',
  permissions: ['staff:sessions:read', 'staff:sessions:redeem'] };

test('A remembered band handout checks the group in, in ROLLER, when Cloud has not; never twice when Cloud has', async () => {
  for (const admitted of [false, true]) {
    const database = redeemDatabase({ admitted });
    const provider = roller(admitted);
    const { handler } = loadLambda(REDEEM_PATH, { env: redeemEnvironment(), execute: database.execute, fetchImpl: provider.fetchImpl,
      overrides: `authorizeStaffRedeemRequest = async () => ({ ok: true, staff: ${JSON.stringify(STAFF)} });` });
    const response = await handler({ routeKey: 'POST /v1/staff/check-in/sessions/{checkinSessionId}/handout',
      rawPath: `/v1/staff/check-in/sessions/${SESSION_ID}/handout`, pathParameters: { checkinSessionId: SESSION_ID }, headers: {},
      body: JSON.stringify({ area: 'entrance', action: 'confirm', revision: 3 }) });
    const body = JSON.parse(response.body);
    assert.equal(response.statusCode, 200, `${admitted}: ${response.body}`);
    assert.equal(body.completed, true);
    assert.deepEqual(database.state.actions, ['prepare', 'complete']);
    const redemptions = provider.calls.filter((call) => call === 'POST /redemptions').length;
    if (admitted) {
      assert.equal(redemptions, 0, 'Cloud admitted the group already: the bands are only handed out');
      continue;
    }
    assert.equal(redemptions, 1, 'the bands check the group in, in ROLLER');
    const reserve = database.state.calls.find((call) => /INSERT INTO jumpyard\.idempotency_records/.test(call.sql));
    assert.equal(parameterValue(reserve.parameters, 'idempotencyKey'), `staff-redeem:${SESSION_ID}`,
      'the key Cloud\'s automatic check-in uses, so the two never redeem twice (#333)');
    assert.equal(body.session.status, 'redeemed');
  }
  // Cloud's automatic check-in leaves a group to the colleague who holds its entrance handout.
  const redeem = fs.readFileSync(REDEEM_PATH, 'utf8');
  assert.match(redeem, /if \(session\.handoutClaim\) return \{ status: 'staff_claimed' \};/);
  assert.match(redeem, /claim\.area = 'entrance' AND \(claim\.expires_at > now\(\) OR claim\.pending_operation IS NOT NULL\)/);
});
