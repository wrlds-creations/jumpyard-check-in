'use strict';

// GH-589 (D0287): on the 17–18/10 test weekend the Booking Lambda's kiosk reconciliation failed 14 times on
// Aurora's 23505 for roller_booking_items_booking_item_id_unique_idx. ROLLER's webhook had stored the paid
// booking's items under its `bookingitem:` keys a tenth of a second earlier, and the kiosk snapshot inserted
// the same ROLLER item under a `jybi_` key with ON CONFLICT (booking_item_key). The booking row it had just
// written named `kiosk_payment_reconciliation`, so the webhook's kiosk check answered
// authoritative_source_invalid and the note queue waited 60 s. A lookup hit the same index the other way
// round. The snapshot and the lookup now match an item on its ROLLER id, as the webhook, the check-in's final
// refresh and the nightly sync do, and keep the key it was stored under; a full-read booking row keeps its
// source. These checks drive the real Lambda sources with a scripted Aurora Data API, Lambda and ROLLER. With
// GH589_DATABASE_TEST=true they also run the webhook, Booking and Lookup Lambdas against PostgreSQL with every
// migration applied (the partial unique index must exist), each under its own database role; nothing reaches
// AWS or ROLLER.

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const BOOKING_PATH = path.join(ROOT, 'infra', 'lambda', 'booking', 'index.js');
const LOOKUP_PATH = path.join(ROOT, 'infra', 'lambda', 'lookup', 'index.js');
const WEBHOOK_PATH = path.join(ROOT, 'infra', 'lambda', 'webhook', 'index.js');
const contract = require('../infra/lambda/booking/kiosk-terminal-contract');

const TODAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const VENUE = '50871';
const AUTHORITATIVE_SOURCES = ['roller_live_lookup', 'roller_redeem_final_refresh', 'roller_webhook_enrichment'];
const ROLLER_ENV = { ROLLER_BASE_URL_PARAMETER_NAME: '/synthetic/roller/base-url', ROLLER_ENV_PARAMETER_NAME: '/synthetic/roller/env',
  ROLLER_CREDENTIALS_SECRET_ARN: 'arn:aws:secretsmanager:eu-north-1:000000000000:secret:roller' };
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

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
const oneLine = (sql) => sql.replace(/\s+/g, ' ').trim();
const json = (status, body) => ({ ok: status >= 200 && status < 300, status,
  async json() { return body; }, async text() { return body === null || body === undefined ? '' : JSON.stringify(body); } });

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

// Loads one Lambda source with fake AWS clients. `expose` lists internal functions to return, `overrides`
// replaces internal functions by name, and `invoke` answers the Lambda's own invocations of other Lambdas.
function loadLambda(file, { env = {}, execute = async () => rdsResult([]), fetchImpl, invoke = null, invokes = [], logs = [],
  expose = [], overrides = {} } = {}) {
  const directory = path.dirname(file);
  const module = { exports: {} };
  const aws = fakeAws(async (command) => {
    if (command.name === 'ExecuteStatementCommand') return execute(command.input.sql, command.input.parameters ?? []);
    if (command.name === 'InvokeCommand') {
      invokes.push(command.input);
      return invoke ? invoke(command.input) : { StatusCode: 202 };
    }
    if (command.name === 'GetParameterCommand') {
      const name = String(command.input?.Name ?? '');
      if (name === ROLLER_ENV.ROLLER_ENV_PARAMETER_NAME) return { Parameter: { Value: 'live' } };
      if (name === ROLLER_ENV.ROLLER_BASE_URL_PARAMETER_NAME) return { Parameter: { Value: 'https://api.roller.app' } };
    }
    if (command.name === 'GetSecretValueCommand') return { SecretString: JSON.stringify({ clientId: 'c', clientSecret: 's' }) };
    throw new Error(`Unexpected AWS command ${command.name} during GH-589 validation.`);
  });
  const replaced = Object.keys(overrides).map((name) => `${name} = __gh589Overrides.${name};`).join('\n');
  vm.runInNewContext(`${fs.readFileSync(file, 'utf8')}\n${replaced}\nmodule.exports.__gh589 = { ${expose.join(', ')} };`, {
    AbortSignal, Buffer, TextDecoder, TextEncoder, URL, URLSearchParams, clearTimeout, setTimeout,
    __gh589Overrides: overrides,
    console: { error: (line) => logs.push(String(line)), info: (line) => logs.push(String(line)), log: (line) => logs.push(String(line)),
      warn: (line) => logs.push(String(line)) },
    exports: module.exports, module,
    fetch: fetchImpl ?? (async () => { throw new Error('Unexpected network call during GH-589 validation.'); }),
    process: { env: { DATABASE_CLUSTER_ARN: 'arn:aws:rds:eu-north-1:000000000000:cluster:synthetic',
      DATABASE_SECRET_ARN: 'arn:aws:secretsmanager:eu-north-1:000000000000:secret:synthetic',
      RESOURCE_PREFIX: 'jumpyard-check-in-test', ...env } },
    require(moduleId) {
      if (moduleId === 'crypto' || moduleId === 'node:crypto') return crypto;
      if (moduleId.startsWith('@aws-sdk/')) return aws;
      if (moduleId.startsWith('./')) return require(path.join(directory, moduleId));
      throw new Error(`Unexpected require(${JSON.stringify(moduleId)}) during GH-589 validation.`);
    },
  }, { filename: file });
  return { handler: module.exports.handler, internals: module.exports.__gh589 };
}
const payloads = (invokes) => invokes.map((invoke) => [invoke.FunctionName, invoke.InvocationType,
  JSON.parse(Buffer.from(invoke.Payload).toString('utf8'))]);
const autoCheckins = (invokes) => payloads(invokes).filter(([name]) => name === 'synthetic-redeem')
  .map(([, , payload]) => [payload.detail.checkinSessionId, payload.detail.trigger]);

// A paid kiosk purchase as ROLLER's `GET /bookings/{id}` returns it: two entry tickets and a pair of socks.
// `items` replaces the purchase's items when a case needs other ones.
function rollerBooking({ uniqueId = 'roller-589', bookingReference = '589001', externalId = 'JY-K-589', entryItemId = '320699833',
  socksItemId = '320699834', tickets = ['589001-t1', '589001-t2'], total = 440, items = null } = {}) {
  return {
    uniqueId, bookingReference, externalId, status: 'Confirmed', paymentStatus: 'Paid', total, amountOwing: 0,
    costs: { total, amountOwing: 0 }, venueId: Number(VENUE),
    items: items ?? [
      { bookingItemId: entryItemId, productId: 900001, productName: '90 min entré', quantity: tickets.length, bookingDate: TODAY,
        startTime: '10:00:00', endTime: '11:30:00', tickets: tickets.map((ticketId) => ({ ticketId, locations: [] })) },
      { bookingItemId: socksItemId, productId: 1765445, productName: 'JumpSocks', quantity: 2, bookingDate: TODAY, tickets: [] },
    ],
  };
}

// --- 1. The snapshot's item rule, with a scripted Aurora ------------------------------------------

const WEBHOOK_ENTRY_KEY = `bookingitem:${sha256('320699833')}`;
const KIOSK_DRAFT_ROW = { prepayment_draft_id: `jypd_${'5'.repeat(18)}`, payment_attempt_id: `jytp_${'8'.repeat(18)}`, roller_env: 'live',
  booking_date: TODAY, start_time: '10:00:00', total_cents: 44000, currency: 'SEK', items_summary: '[]' };
// The ROLLER item 320699833 has an id; the 60 min drop-in, as an item without one, keeps the jybi_ rule.
const SCRIPTED_READBACK = () => contract.normalizeBookingReadback(rollerBooking({ items: [
  { bookingItemId: '320699833', productId: 900001, productName: '90 min entré', quantity: 2, bookingDate: TODAY, startTime: '10:00:00',
    endTime: '11:30:00', tickets: [{ ticketId: '589001-t1' }, { ticketId: '589001-t2' }] },
  { productId: 900002, productName: '60 min drop-in', quantity: 1, bookingDate: TODAY, startTime: '10:00:00', tickets: [{ ticketId: '589001-t3' }] },
] }), { requireTickets: true });

// `entryOwner`: 'webhook' when ROLLER's note stored the item first, 'other' when its id belongs to another booking.
function snapshotWithScript({ entryOwner = 'webhook' } = {}) {
  const statements = [];
  const { internals } = loadLambda(BOOKING_PATH, {
    env: { T0176_FULL_FLOW_VENUE_ID: VENUE }, expose: ['persistKioskReconciliationBookingSnapshot'],
    execute: async (sql, parameters) => {
      statements.push({ sql, parameters });
      if (/INSERT INTO jumpyard\.roller_booking_items/.test(sql)) {
        if (!parameterValue(parameters, 'bookingItemId')) return rdsResult([{ booking_item_key: parameterValue(parameters, 'bookingItemKey') }], 1);
        // The guard on roller_unique_id refuses another booking's item, so the statement returns no row.
        return entryOwner === 'webhook' ? rdsResult([{ booking_item_key: WEBHOOK_ENTRY_KEY }], 1) : rdsResult([], 0);
      }
      return rdsResult([], 1);
    },
  });
  const persist = () => internals.persistKioskReconciliationBookingSnapshot(KIOSK_DRAFT_ROW, SCRIPTED_READBACK());
  return { persist, statements };
}
const statementsFor = (statements, table) => statements.filter((statement) => new RegExp(`INSERT INTO jumpyard\\.${table} `).test(statement.sql));

test('The kiosk snapshot matches an item on its ROLLER id and puts the tickets on the key the webhook stored', async () => {
  const run = snapshotWithScript();
  await run.persist();
  const [entry, dropIn] = statementsFor(run.statements, 'roller_booking_items');
  const entrySql = oneLine(entry.sql);
  assert.match(entrySql, /ON CONFLICT \(booking_item_id\) WHERE booking_item_id IS NOT NULL DO UPDATE SET/);
  assert.match(entrySql, /WHERE jumpyard\.roller_booking_items\.roller_unique_id = EXCLUDED\.roller_unique_id RETURNING booking_item_key$/);
  for (const column of ['parent_product_id', 'product_name', 'parent_product_name']) {
    assert.ok(entrySql.includes(`${column} = COALESCE(EXCLUDED.${column}, jumpyard.roller_booking_items.${column})`), `${column} is never blanked`);
  }
  assert.ok(entrySql.includes("item_summary = COALESCE(jumpyard.roller_booking_items.item_summary, '{}'::jsonb) || jsonb_strip_nulls(EXCLUDED.item_summary)"),
    'the kiosk\'s item details are merged into the stored summary');
  assert.match(parameterValue(entry.parameters, 'bookingItemKey'), /^jybi_[a-f0-9]{32}$/, 'an item nobody stored yet still gets its jybi_ key');

  // The item without a ROLLER id keeps today's upsert on its jybi_ key.
  assert.equal(parameterValue(dropIn.parameters, 'bookingItemId'), null);
  assert.match(oneLine(dropIn.sql), /ON CONFLICT \(booking_item_key\) DO UPDATE SET product_id = EXCLUDED\.product_id, parent_product_id = EXCLUDED\.parent_product_id, product_name = EXCLUDED\.product_name, parent_product_name = EXCLUDED\.parent_product_name, quantity = EXCLUDED\.quantity, booking_date = EXCLUDED\.booking_date, start_time = EXCLUDED\.start_time, end_time = EXCLUDED\.end_time, item_summary = EXCLUDED\.item_summary, updated_at = now\(\) RETURNING booking_item_key$/);

  assert.deepEqual(statementsFor(run.statements, 'roller_booking_tickets').map((statement) => [parameterValue(statement.parameters, 'ticketId'),
    parameterValue(statement.parameters, 'bookingItemKey')]), [
    ['589001-t1', WEBHOOK_ENTRY_KEY], ['589001-t2', WEBHOOK_ENTRY_KEY],
    ['589001-t3', parameterValue(dropIn.parameters, 'bookingItemKey')],
  ], 'every ticket sits on the key its item row has');
});

test('An item id that belongs to another booking overwrites nothing and stops the snapshot with a named error', async () => {
  const run = snapshotWithScript({ entryOwner: 'other' });
  await assert.rejects(run.persist(), (error) => error.code === 'kiosk_booking_item_identity_conflict');
  assert.equal(statementsFor(run.statements, 'roller_booking_items').length, 1, 'nothing after the refused item');
  assert.deepEqual(statementsFor(run.statements, 'roller_booking_tickets'), [], 'no ticket is moved onto another booking\'s item');
});

test('A full-read booking row keeps its source; the snapshot still refreshes the paid status and never touches total, currency, date, venue or externalId', async () => {
  const run = snapshotWithScript();
  await run.persist();
  const [booking] = statementsFor(run.statements, 'roller_bookings');
  const sql = oneLine(booking.sql);
  const update = sql.slice(sql.indexOf('ON CONFLICT (roller_unique_id) DO UPDATE SET'));
  const sources = AUTHORITATIVE_SOURCES.map((source) => `'${source}'`).join(', ');
  assert.ok(update.includes(`source_last_updated_by = CASE WHEN jumpyard.roller_bookings.source_last_updated_by IN (${sources}) THEN jumpyard.roller_bookings.source_last_updated_by ELSE EXCLUDED.source_last_updated_by END`));
  for (const refreshed of ['booking_status = EXCLUDED.booking_status', 'payment_status = EXCLUDED.payment_status',
    'amount_owing_cents = EXCLUDED.amount_owing_cents', 'freshness_status = EXCLUDED.freshness_status']) {
    assert.ok(update.includes(refreshed), refreshed);
  }
  for (const column of ['total_cents', 'currency', 'booking_date', 'start_time', 'venue_id']) {
    assert.doesNotMatch(update, new RegExp(`\\b${column} =`), `${column} is never updated`);
  }
  assert.match(sql, /'kiosk_payment_reconciliation', now\(\), 'fresh'/, 'a row the snapshot creates still names the kiosk reconciliation');
  assert.deepEqual(Object.keys(JSON.parse(parameterValue(booking.parameters, 'normalizedSummary'))).sort(),
    ['bookingSyncStatus', 'paymentAttemptId', 'prepaymentDraftId'], 'the merged summary never replaces the externalId');
  // The kiosk check's own list of authoritative sources is unchanged (no kiosk_payment_reconciliation).
  assert.match(fs.readFileSync(BOOKING_PATH, 'utf8'),
    /const KIOSK_AUTHORITATIVE_BOOKING_SOURCES = new Set\(\[\s*'roller_live_lookup',\s*'roller_redeem_final_refresh',\s*'roller_webhook_enrichment',\s*\]\);/);
});

// --- 2. The lookup's item rule, with a scripted Aurora --------------------------------------------

const KIOSK_ENTRY_KEY = `jybi_${'a'.repeat(32)}`;
function lookupWithScript({ entryOwner = 'kiosk' } = {}) {
  const statements = [];
  const { internals } = loadLambda(LOOKUP_PATH, {
    expose: ['normalizeBooking', 'upsertLiveBooking'],
    execute: async (sql, parameters) => {
      statements.push({ sql, parameters });
      if (/INSERT INTO jumpyard\.roller_booking_items/.test(sql)) {
        if (!parameterValue(parameters, 'bookingItemId')) return rdsResult([{ booking_item_key: parameterValue(parameters, 'bookingItemKey') }], 1);
        return entryOwner === 'kiosk' ? rdsResult([{ booking_item_key: KIOSK_ENTRY_KEY }], 1) : rdsResult([], 0);
      }
      return rdsResult([], 1);
    },
  });
  const upsert = () => internals.upsertLiveBooking(internals.normalizeBooking(rollerBooking({ items: [
    { bookingItemId: '320791407', productId: 900001, productName: '90 min entré', quantity: 1, bookingDate: TODAY,
      tickets: [{ ticketId: '589002-t1' }] },
    { productId: 900002, productName: '60 min drop-in', quantity: 1, bookingDate: TODAY, tickets: [{ ticketId: '589002-t2' }] },
  ] }), { byId: new Map() }), 'live', VENUE);
  return { statements, upsert };
}

test('A lookup matches an item on its ROLLER id and keeps the kiosk\'s jybi_ key for the item and its tickets', async () => {
  const run = lookupWithScript();
  await run.upsert();
  const [entry, dropIn] = statementsFor(run.statements, 'roller_booking_items');
  const entrySql = oneLine(entry.sql);
  assert.match(entrySql, /ON CONFLICT \(booking_item_id\) WHERE booking_item_id IS NOT NULL DO UPDATE SET/);
  assert.match(entrySql, /WHERE jumpyard\.roller_booking_items\.roller_unique_id = EXCLUDED\.roller_unique_id RETURNING booking_item_key$/);
  assert.ok(entrySql.includes("item_summary = COALESCE(jumpyard.roller_booking_items.item_summary, '{}'::jsonb) || jsonb_strip_nulls(EXCLUDED.item_summary)"));
  assert.match(oneLine(dropIn.sql), /ON CONFLICT \(booking_item_key\) DO UPDATE SET roller_unique_id = EXCLUDED\.roller_unique_id, booking_item_id = EXCLUDED\.booking_item_id,[\s\S]* item_summary = EXCLUDED\.item_summary, updated_at = now\(\) RETURNING booking_item_key$/,
    'an item without an id keeps the lookup\'s own key rule');
  assert.deepEqual(statementsFor(run.statements, 'roller_booking_tickets').map((statement) => [parameterValue(statement.parameters, 'ticketId'),
    parameterValue(statement.parameters, 'bookingItemKey')]), [
    ['589002-t1', KIOSK_ENTRY_KEY],
    ['589002-t2', parameterValue(dropIn.parameters, 'bookingItemKey')],
  ]);

  const refused = lookupWithScript({ entryOwner: 'other' });
  await assert.rejects(refused.upsert(), (error) => error.code === 'lookup_booking_item_identity_conflict');
  assert.deepEqual(statementsFor(refused.statements, 'roller_booking_tickets'), []);
});

test('The validator, its CI database step and the decision are wired in', () => {
  const packageJson = fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8');
  assert.match(packageJson, /"validate:gh589-kiosk-item-key": "node --test scripts\/validate-gh589-kiosk-item-key\.test\.js"/);
  assert.match(packageJson, /npm run validate:gh589-kiosk-item-key/);
  assert.match(fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8'), /GH589_DATABASE_TEST: 'true'/);
  assert.match(fs.readFileSync(path.join(ROOT, 'DECISIONS.md'), 'utf8'), /\| `D\d{4}` \| 2026-10-\d\d \| [^|]*\(#589\)/);
});

// --- 3. PostgreSQL ---------------------------------------------------------------------------------

// Data API shaped results under one Lambda's role. Statements run one at a time on one connection, each
// under `SET ROLE`, so every Lambda is held to its own grants.
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

// A kiosk with its installation and profile, as the GH-483 staff resolution checks them (synthetic values).
const KIOSK_CAPABILITY = 'G'.repeat(43);
const KIOSK_INSTALLATION_ID = `ki_${sha256(KIOSK_CAPABILITY).slice(0, 24)}`;
const ROLLER_CONFIG = {
  env: 'live', baseUrl: 'https://api.roller.app', kioskVenueId: VENUE, allowLegacyKioskTerminalAlias: false,
  kioskInstallations: contract.normalizeKioskInstallationMap({
    [KIOSK_INSTALLATION_ID]: { active: true, allowedProfileIds: ['nacka-forum-kiosk-2'], venueId: VENUE },
  }),
  kioskProfiles: contract.normalizeKioskProfileMap({ 'nacka-forum-kiosk-2': { active: true, paymentTerminalAlias: 'primary', venueId: VENUE } }),
  paymentTerminals: contract.normalizePaymentTerminalMap({
    primary: { terminalId: 'synthetic-terminal', deviceId: 'synthetic-device', lockId: `kt_${'9'.repeat(32)}` },
  }),
  kioskNames: contract.normalizeKioskNameMap({}),
};
const BOOKING_ENV = { AUTO_CHECKIN_FUNCTION_NAME: 'synthetic-redeem', ENABLE_ROLLER_BOOKING_DRAFT_WRITES: 'true',
  JUMPYARD_EMERGENCY_STOP: 'false', T0176_FULL_FLOW_VENUE_ID: VENUE };
const LOOKUP_ENV = { ...ROLLER_ENV, JUMPYARD_ENVIRONMENT: 'park-test', JUMPYARD_EMERGENCY_STOP: 'false', ENABLE_T0171_ASSISTED_LOOKUP: 'true',
  T0171_ASSISTED_LOOKUP_ALLOWED_OPERATING_DATES: TODAY, T0171_ASSISTED_LOOKUP_VENUE_ID: VENUE,
  KIOSK_AUTHORITATIVE_CONFIRMATION_FUNCTION_NAME: 'synthetic-booking' };

// ROLLER, answering the listed booking paths and 404 for any other booking.
function rollerFake(bookings) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const target = new URL(String(url));
    const method = init.method ?? 'GET';
    calls.push(`${method} ${target.pathname}`);
    if (target.pathname === '/token') return json(200, { access_token: 'synthetic-token', token_type: 'Bearer', expires_in: 3600 });
    if (target.pathname === '/products') return json(200, []);
    if (method === 'GET' && bookings[target.pathname]) return json(200, bookings[target.pathname]);
    if (method === 'GET' && target.pathname.startsWith('/bookings/')) return json(404, null);
    throw new Error(`Unexpected ROLLER call during GH-589 validation: ${method} ${target.pathname}`);
  };
  return { calls, fetchImpl };
}

test('PostgreSQL: whichever writer stores a ROLLER item first, the kiosk purchase is attached and a lookup answers 200', {
  skip: process.env.GH589_DATABASE_TEST !== 'true',
}, async (t) => {
  const pg = require('../infra/node_modules/pg');
  const port = Number(process.env.GH589_PGPORT || 55589);
  assert.ok([55589, 55435].includes(port), 'Only disposable loopback test databases are allowed.');
  const rawText = new Set([114, 3802, 1082, 1083, 1114, 1184, 1266]);
  const client = new pg.Client({ host: '127.0.0.1', port, database: 'jumpyard_cloud', user: port === 55589 ? 'postgres' : 'gh345_test',
    password: '', ssl: false, types: { getTypeParser: (oid, format) => (rawText.has(oid) ? (value) => value
      : oid === 20 ? Number : pg.types.getTypeParser(oid, format)) } });
  await client.connect();
  const db = createDatabase(client);
  const prefix = `gh589_${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`;
  const hex = (label, length) => sha256(`${prefix}:${label}`).slice(0, length);
  const uuid = (label) => { const h = hex(label, 32); return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`; };
  const created = { bookings: [], drafts: [], sessions: [], tokens: [] };

  // One kiosk purchase: ROLLER's ids for the paid booking, which keeps the draft's unique id, and Cloud's ids.
  const group = (label) => ({
    label,
    bookingId: uuid(label),
    bookingReference: `5${String(parseInt(hex(`${label}:reference`, 12), 16) % 100_000_000).padStart(8, '0')}`,
    externalId: `JY-K-${prefix}-${label}`,
    prepaymentDraftId: `jypd_${hex(`${label}:draft`, 18)}`,
    paymentAttemptId: `jytp_${hex(`${label}:attempt`, 18)}`,
    entryItemId: `${prefix}-${label}-entry`,
    socksItemId: `${prefix}-${label}-socks`,
    tickets: [`${prefix}-${label}-t1`, `${prefix}-${label}-t2`],
  });
  const sessionId = (g) => `jycs_${g.paymentAttemptId.slice('jytp_'.length)}`;
  const paidBooking = (g, extra = {}) => rollerBooking({ uniqueId: g.bookingId, bookingReference: g.bookingReference, externalId: g.externalId,
    entryItemId: g.entryItemId, socksItemId: g.socksItemId, tickets: g.tickets, ...extra });
  const request = (g) => ({ prepaymentDraftId: g.prepaymentDraftId, paymentAttemptId: g.paymentAttemptId });

  // The kiosk purchase as the approval leaves it (D0190): the approved draft and, unless the terminal never
  // reported, the provisional booking row on the draft's unique id, the provisional session and the guest
  // access token derived from the payment attempt.
  const purchase = async (g, { attempt = 'approved', confirmation = 'pending', flow = 'new_booking', totalCents = 44000,
    original = null } = {}) => {
    created.bookings.push(g.bookingId);
    created.drafts.push(g.prepaymentDraftId);
    created.tokens.push(sha256(g.paymentAttemptId));
    await db.admin(`INSERT INTO jumpyard.prepayment_booking_drafts (prepayment_draft_id, roller_draft_unique_id, external_id,
        idempotency_key, status, roller_env, flow_type, payment_channel, payment_attempt_id, payment_attempt_status,
        booking_confirmation_status, booking_date, start_time, total_cents, amount_owing_cents, currency, item_count, items_summary,
        kiosk_installation_id, payment_approved_at, add_on_group_id, original_roller_unique_id, original_booking_reference)
      VALUES ($1, $2, $3, $1, 'payment_pending', 'live', $4, 'card_present', $5, $6, $7, $8::date, '10:00', $9, $9, 'SEK', 1,
        $10::jsonb, $11, $12::timestamptz, $13, $14, $15)`,
    [g.prepaymentDraftId, g.bookingId, g.externalId, flow, g.paymentAttemptId, attempt, confirmation, TODAY, totalCents,
      JSON.stringify([{ productId: '900001', productName: '90 min entré', quantity: 2, bookingDate: TODAY, startTime: '10:00:00' }]),
      KIOSK_INSTALLATION_ID, attempt === 'approved' ? new Date().toISOString() : null,
      original ? `jyao_${hex(g.label, 12)}` : null, original?.bookingId ?? null, original?.bookingReference ?? null]);
    if (flow !== 'new_booking' || attempt !== 'approved') return;
    created.sessions.push(sessionId(g));
    await db.admin(`INSERT INTO jumpyard.roller_bookings (roller_unique_id, booking_reference, roller_env, venue_id, booking_status,
        payment_status, amount_owing_cents, total_cents, currency, booking_date, start_time, source_last_updated_by, freshness_status,
        normalized_summary)
      VALUES ($1, $1, 'live', $2, 'payment_approved_booking_syncing', 'paid', 0, 44000, 'SEK', $3::date, '10:00', 'kiosk_terminal_approved',
        'stale', jsonb_build_object('bookingSyncStatus', 'pending', 'customerFirstName', 'Gäst', 'paymentAttemptId', $4::text))`,
    [g.bookingId, VENUE, TODAY, g.paymentAttemptId]);
    await db.admin(`INSERT INTO jumpyard.checkin_sessions (checkin_session_id, roller_unique_id, booking_reference, visit_date, status,
        safety_status, handoff_status, selected_ticket_ids, source_lookup_ref, expires_at, ready_for_staff_at, session_summary)
      VALUES ($1, $2, $2, $3::date, 'ready_for_staff', 'completed', 'ready_for_staff', '[]'::jsonb, $4, now() + interval '4 hours', now(),
        jsonb_build_object('paymentAttemptId', $5::text, 'bookingSyncStatus', 'pending'))`,
    [sessionId(g), g.bookingId, TODAY, g.prepaymentDraftId, g.paymentAttemptId]);
    await db.admin(`INSERT INTO jumpyard.checkin_tokens (token_hash, roller_unique_id, channel, expires_at)
      VALUES ($1, $2, 'guest_access', now() + interval '2 hours')`, [sha256(g.paymentAttemptId), g.bookingId]);
  };

  // The Booking Lambda under its own role. Its ROLLER configuration and token are fixed, so `fetchImpl` sees
  // exactly the booking reads; nothing waits.
  const bookingLambda = ({ fetchImpl, invokes = [], logs = [] } = {}) => loadLambda(BOOKING_PATH, {
    env: BOOKING_ENV, execute: db.asRole('jumpyard_booking_runtime'), fetchImpl, invokes, logs,
    expose: ['findKioskPrepaymentAttempt', 'handleKioskStaffResolution', 'persistKioskReconciliationBookingSnapshot'],
    overrides: {
      getRollerAccessToken: async () => ({ accessToken: 'synthetic-access', tokenType: 'Bearer' }),
      getRollerConfig: async () => ROLLER_CONFIG,
      readKioskPairing: async () => null,
      wait: async () => {},
    },
  });
  // The webhook's and the lookup's RequestResponse call to the Booking Lambda's kiosk check.
  const routeTo = (booking) => async (input) => {
    if (input.FunctionName !== 'synthetic-booking') return { StatusCode: 202 };
    const result = await booking.handler(JSON.parse(Buffer.from(input.Payload).toString('utf8')));
    return { StatusCode: 200, Payload: Buffer.from(JSON.stringify(result ?? null)) };
  };

  // What the webhook worker does with ROLLER's booking before its kiosk check: the booking, items and tickets.
  const webhookStores = async (g, body = paidBooking(g)) => {
    const bookingInvokes = [];
    const webhookInvokes = [];
    const hook = loadLambda(WEBHOOK_PATH, {
      env: { KIOSK_AUTHORITATIVE_CONFIRMATION_FUNCTION_NAME: 'synthetic-booking' }, execute: db.asRole('jumpyard_webhook_runtime'),
      invokes: webhookInvokes, invoke: routeTo(bookingLambda({ invokes: bookingInvokes })),
      expose: ['deleteMissingWebhookChildren', 'normalizeBooking', 'reconcilePrepaymentDraftFromPaidBooking', 'upsertWebhookBooking'],
    });
    const booking = hook.internals.normalizeBooking(body, { byId: new Map() });
    const keys = await hook.internals.upsertWebhookBooking(booking, 'live', VENUE);
    await hook.internals.deleteMissingWebhookChildren(booking, keys);
    // The webhook's next step: the draft and its kiosk check, as one note.
    const check = async () => ({
      kioskConfirmation: plain((await hook.internals.reconcilePrepaymentDraftFromPaidBooking(booking, 'roller_webhook_enrichment',
        `jy_gh589_${g.label}_webhook`)).kioskConfirmation),
      bookingInvokes,
      webhookInvokes,
    });
    return { check, keys: plain(keys) };
  };

  // The Booking Lambda's reconciliation worker, invoked as the kiosk's finalize invokes it.
  const runWorker = async (g, body) => {
    const roller = rollerFake({ [`/bookings/${g.bookingId}`]: body });
    const invokes = [];
    const logs = [];
    const result = await bookingLambda({ fetchImpl: roller.fetchImpl, invokes, logs }).handler({
      source: 'jumpyard.kiosk-payment-reconciliation', detail: { ...request(g), correlationId: `jy_gh589_${g.label}_worker` } });
    return { invokes, logs, result: plain(result), roller };
  };

  const rows = async (g) => {
    const one = async (sql, values) => { const row = (await db.admin(sql, values)).rows[0]; return row ? { ...row } : null; };
    return {
      booking: await one(`SELECT source_last_updated_by, booking_status, payment_status, amount_owing_cents, total_cents, currency,
          booking_date::text AS booking_date, venue_id, normalized_summary ->> 'externalId' AS external_id,
          normalized_summary ->> 'bookingSyncStatus' AS booking_sync_status, normalized_summary ->> 'paymentAttemptId' AS payment_attempt_id
        FROM jumpyard.roller_bookings WHERE roller_unique_id = $1`, [g.bookingId]),
      items: (await db.admin(`SELECT booking_item_id, booking_item_key, product_name FROM jumpyard.roller_booking_items
        WHERE roller_unique_id = $1 ORDER BY booking_item_id`, [g.bookingId])).rows.map((row) => ({ ...row })),
      tickets: (await db.admin(`SELECT ticket_id, booking_item_key FROM jumpyard.roller_booking_tickets WHERE roller_unique_id = $1
        ORDER BY ticket_id`, [g.bookingId])).rows.map((row) => [row.ticket_id, row.booking_item_key]),
      session: await one(`SELECT booking_reference, selected_ticket_ids::text AS selected_ticket_ids,
          session_summary ->> 'bookingSyncStatus' AS booking_sync_status
        FROM jumpyard.checkin_sessions WHERE checkin_session_id = $1`, [sessionId(g)]),
      draft: await one(`SELECT status, payment_attempt_status, booking_confirmation_status, reconciliation_last_result
        FROM jumpyard.prepayment_booking_drafts WHERE prepayment_draft_id = $1`, [g.prepaymentDraftId]),
    };
  };
  const keyOf = (state, itemId) => state.items.find((item) => item.booking_item_id === itemId)?.booking_item_key;
  const attached = (g, state) => {
    assert.equal(state.session.booking_reference, g.bookingReference);
    assert.deepEqual(JSON.parse(state.session.selected_ticket_ids), g.tickets);
    assert.equal(state.session.booking_sync_status, 'confirmed');
    assert.equal(state.draft.booking_confirmation_status, 'confirmed');
  };

  try {
    await t.test('1. Webhook first: the worker attaches the Handoff in the same run, starts one check-in and keeps the keys', async () => {
      // Saturday 10:14:13.45: ROLLER's Created note stores the items; 0.14 s later the worker's readback answers 200.
      const g = group('webhook-first');
      await purchase(g);
      const stored = await webhookStores(g);
      const before = await rows(g);
      assert.match(keyOf(before, g.entryItemId), /^bookingitem:/);

      const worker = await runWorker(g, paidBooking(g));
      assert.deepEqual(worker.result, { status: 'confirmed' }, 'no 23505 and no 500');
      const after = await rows(g);
      assert.deepEqual(after.items, before.items, 'one row per ROLLER item, each still on the webhook\'s key');
      assert.deepEqual(after.tickets, g.tickets.map((ticketId) => [ticketId, keyOf(before, g.entryItemId)]));
      attached(g, after);
      assert.equal(after.draft.reconciliation_last_result, 'confirmed');
      assert.deepEqual(autoCheckins(worker.invokes), [[sessionId(g), 'kiosk_booking_confirmed']]);
      assert.equal(after.booking.source_last_updated_by, 'roller_webhook_enrichment', 'the full read keeps its source');
      assert.equal(worker.logs.some((line) => line.includes('cloud.server_error')), false);

      // 10:14:14.12: the webhook's check right after is skipped (#581) instead of waiting 60 s.
      const check = await stored.check();
      assert.deepEqual(check.kioskConfirmation, { status: 'already_confirmed' });
      assert.deepEqual(check.webhookInvokes, [], 'no second confirmation');
      assert.deepEqual(autoCheckins(check.bookingInvokes), [], 'and no second automatic check-in');
      assert.deepEqual(worker.roller.calls, [`GET /bookings/${g.bookingId}`], 'the worker\'s one readback, no extra ROLLER call');
    });

    await t.test('2. Reconciliation first, then the webhook: unchanged, the webhook keeps the kiosk\'s jybi_ keys', async () => {
      const g = group('kiosk-first');
      await purchase(g);
      const worker = await runWorker(g, paidBooking(g));
      assert.deepEqual(worker.result, { status: 'confirmed' });
      const kiosk = await rows(g);
      assert.equal(kiosk.items.length, 2);
      assert.ok(kiosk.items.every((item) => /^jybi_[a-f0-9]{32}$/.test(item.booking_item_key)));
      assert.deepEqual(kiosk.tickets, g.tickets.map((ticketId) => [ticketId, keyOf(kiosk, g.entryItemId)]));
      assert.equal(kiosk.booking.source_last_updated_by, 'kiosk_payment_reconciliation', 'a row nobody read in full names the kiosk');

      const stored = await webhookStores(g);
      assert.deepEqual(stored.keys, [keyOf(kiosk, g.entryItemId), keyOf(kiosk, g.socksItemId)]);
      const after = await rows(g);
      assert.deepEqual(after.items, kiosk.items);
      assert.deepEqual(after.tickets, kiosk.tickets);
      assert.equal(after.booking.source_last_updated_by, 'roller_webhook_enrichment');
      attached(g, after);
      const check = await stored.check();
      assert.deepEqual(check.kioskConfirmation, { status: 'already_confirmed' });
      assert.deepEqual(autoCheckins([...worker.invokes, ...check.bookingInvokes]), [[sessionId(g), 'kiosk_booking_confirmed']]);
      assert.deepEqual(worker.roller.calls, [`GET /bookings/${g.bookingId}`]);
    });

    await t.test('3. The kiosk check right after a snapshot that met a full-read booking row answers confirmed', async () => {
      // The incident's window: the webhook stored the booking, the snapshot ran, and the webhook's check read the row.
      const g = group('check');
      await purchase(g);
      const stored = await webhookStores(g);
      const booking = bookingLambda();
      const existing = await booking.internals.findKioskPrepaymentAttempt(request(g));
      await assert.doesNotReject(() => booking.internals.persistKioskReconciliationBookingSnapshot(existing,
        contract.normalizeBookingReadback(paidBooking(g), { requireTickets: true })), 'the snapshot stores every row');
      assert.deepEqual((await rows(g)).booking, {
        source_last_updated_by: 'roller_webhook_enrichment', booking_status: 'confirmed', payment_status: 'Paid', amount_owing_cents: 0,
        total_cents: 44000, currency: 'SEK', booking_date: TODAY, venue_id: VENUE, external_id: g.externalId,
        booking_sync_status: 'confirmed', payment_attempt_id: g.paymentAttemptId,
      }, 'the source stays; the paid status and the kiosk\'s summary are refreshed; total, currency, date, venue and externalId stay');

      const check = await stored.check();
      assert.equal(check.kioskConfirmation?.status, 'confirmed', 'not authoritative_source_invalid');
      assert.equal(check.webhookInvokes.length, 1);
      attached(g, await rows(g));
      assert.deepEqual(autoCheckins(check.bookingInvokes), [[sessionId(g), 'kiosk_booking_confirmed']]);
    });

    await t.test('4. A kiosk add-on whose items the webhook stored first is confirmed and released by its own reconciliation', async () => {
      // A pre-booked pair finished at the kiosk and bought socks; the add-on holds their check-in.
      const original = group('addon-original');
      created.bookings.push(original.bookingId);
      created.sessions.push(sessionId(original));
      await db.admin(`INSERT INTO jumpyard.roller_bookings (roller_unique_id, booking_reference, roller_env, venue_id, booking_status,
          payment_status, amount_owing_cents, total_cents, booking_date, source_last_updated_by, freshness_status, last_seen_from_roller_at)
        VALUES ($1, $2, 'live', $3, 'Confirmed', 'Paid', 0, 40000, $4::date, 'roller_webhook_enrichment', 'fresh', now())`,
      [original.bookingId, original.bookingReference, VENUE, TODAY]);
      await db.admin(`INSERT INTO jumpyard.checkin_sessions (checkin_session_id, roller_unique_id, booking_reference, visit_date, status,
          safety_status, handoff_status, selected_ticket_ids, expires_at, ready_for_staff_at, session_summary)
        VALUES ($1, $2, $3, $4::date, 'ready_for_staff', 'completed', 'ready_for_staff', $5::jsonb, now() + interval '4 hours', now(),
          jsonb_build_object('bookingSyncStatus', 'pending', 'linkedAddOnSyncSource', 'kiosk_terminal_add_product'))`,
      [sessionId(original), original.bookingId, original.bookingReference, TODAY, JSON.stringify(original.tickets)]);
      const socks = group('addon-socks');
      await purchase(socks, { flow: 'add_product', totalCents: 9800, original });
      const socksBooking = paidBooking(socks, { total: 98, items: [
        { bookingItemId: socks.socksItemId, productId: 1765445, productName: 'JumpSocks', quantity: 2, bookingDate: TODAY, tickets: [] }] });
      await webhookStores(socks, socksBooking);
      const before = await rows(socks);
      assert.match(keyOf(before, socks.socksItemId), /^bookingitem:/);

      const worker = await runWorker(socks, socksBooking);
      assert.deepEqual(worker.result, { status: 'confirmed' });
      const after = await rows(socks);
      assert.deepEqual(after.items, before.items, 'the socks keep the webhook\'s row');
      assert.equal(after.draft.booking_confirmation_status, 'confirmed');
      const session = (await db.admin(`SELECT session_summary ->> 'bookingSyncStatus' AS sync, session_summary ->> 'linkedAddOnSyncSource' AS source
        FROM jumpyard.checkin_sessions WHERE checkin_session_id = $1`, [sessionId(original)])).rows[0];
      assert.deepEqual({ ...session }, { sync: 'confirmed', source: 'kiosk_terminal_add_product' });
      assert.deepEqual(autoCheckins(worker.invokes), [[sessionId(original), 'kiosk_add_on_confirmed']]);
      assert.deepEqual(worker.roller.calls, [`GET /bookings/${socks.bookingId}`]);
    });

    await t.test('5. A lookup of a kiosk booking with jybi_ rows answers 200, and the items and tickets keep their keys', async () => {
      // Kiosk first, then ROLLER's note: jybi_ rows and a booking row without the guest's name, so the
      // assisted lookup refreshes it from ROLLER (as the K2–K4 recovery lookups did on 15/10).
      const g = group('lookup');
      await purchase(g);
      assert.deepEqual((await runWorker(g, paidBooking(g))).result, { status: 'confirmed' });
      await webhookStores(g);
      const before = await rows(g);
      assert.ok(before.items.every((item) => /^jybi_/.test(item.booking_item_key)));

      const roller = rollerFake({ [`/bookings/${g.bookingReference}`]: paidBooking(g) });
      const bookingInvokes = [];
      const lookupInvokes = [];
      const logs = [];
      const lookup = loadLambda(LOOKUP_PATH, { env: LOOKUP_ENV, execute: db.asRole('jumpyard_lookup_runtime'), fetchImpl: roller.fetchImpl,
        invokes: lookupInvokes, invoke: routeTo(bookingLambda({ invokes: bookingInvokes })), logs });
      const response = await lookup.handler({ body: JSON.stringify({ identifier: g.bookingReference, expectedDate: TODAY,
        correlationId: 'jy_gh589_lookup' }) });
      const body = JSON.parse(response.body);
      assert.equal(response.statusCode, 200, JSON.stringify(body.error ?? body.status));
      assert.equal(body.status, 'found');
      assert.equal(body.source.refreshedFromRoller, true, 'the ROLLER path, where the collision was');
      const after = await rows(g);
      assert.deepEqual(after.items.map((item) => item.booking_item_key), before.items.map((item) => item.booking_item_key));
      assert.deepEqual(after.tickets, before.tickets);
      assert.equal(after.booking.source_last_updated_by, 'roller_live_lookup');
      assert.equal(logs.some((line) => line.includes('cloud.server_error')), false);
      // The lookup's own kiosk check is unchanged: it answers confirmed and admits nobody twice.
      assert.equal(lookupInvokes.filter((invoke) => invoke.FunctionName === 'synthetic-booking').length, 1);
      assert.deepEqual(autoCheckins(bookingInvokes), []);
      assert.deepEqual(roller.calls, ['POST /token', 'GET /products', `GET /bookings/${g.bookingReference}`]);
    });

    await t.test('6. An item without an id keeps its jybi_ row; an id owned by another booking overwrites nothing', async () => {
      const g = group('no-id');
      await purchase(g);
      const booking = bookingLambda();
      const existing = await booking.internals.findKioskPrepaymentAttempt(request(g));
      const withoutId = contract.normalizeBookingReadback(paidBooking(g, { items: [{ productId: 900001, productName: '90 min entré',
        quantity: 2, bookingDate: TODAY, startTime: '10:00:00', tickets: g.tickets.map((ticketId) => ({ ticketId })) }] }), { requireTickets: true });
      await booking.internals.persistKioskReconciliationBookingSnapshot(existing, withoutId);
      await booking.internals.persistKioskReconciliationBookingSnapshot(existing, withoutId);
      const state = await rows(g);
      const key = `jybi_${sha256(`${g.bookingId}:0`).slice(0, 32)}`;
      assert.deepEqual(state.items, [{ booking_item_id: null, booking_item_key: key, product_name: '90 min entré' }], 'one row, twice written');
      assert.deepEqual(state.tickets, g.tickets.map((ticketId) => [ticketId, key]));

      // Another booking already owns the ROLLER item id (never seen on Park): nothing is overwritten.
      const owner = group('owner');
      await purchase(owner);
      await webhookStores(owner);
      const ownerBefore = await rows(owner);
      const intruder = group('intruder');
      await purchase(intruder);
      const intruderRow = await booking.internals.findKioskPrepaymentAttempt(request(intruder));
      const stolen = contract.normalizeBookingReadback(paidBooking(intruder, { entryItemId: owner.entryItemId }), { requireTickets: true });
      await assert.rejects(booking.internals.persistKioskReconciliationBookingSnapshot(intruderRow, stolen),
        (error) => error.code === 'kiosk_booking_item_identity_conflict');
      const lookup = loadLambda(LOOKUP_PATH, { execute: db.asRole('jumpyard_lookup_runtime'), expose: ['normalizeBooking', 'upsertLiveBooking'] });
      await assert.rejects(lookup.internals.upsertLiveBooking(lookup.internals.normalizeBooking(paidBooking(intruder,
        { entryItemId: owner.entryItemId }), { byId: new Map() }), 'live', VENUE), (error) => error.code === 'lookup_booking_item_identity_conflict');
      const ownerAfter = await rows(owner);
      assert.deepEqual(ownerAfter.items, ownerBefore.items);
      assert.deepEqual(ownerAfter.tickets, ownerBefore.tickets);
      assert.deepEqual((await rows(intruder)).tickets, [], 'no ticket of the other booking lands on the owner\'s item');
    });

    await t.test('7. Staff "Betalningen gick igenom" with the webhook\'s rows stored first attaches the booking, with no 500', async () => {
      // The terminal never reported (unknown); ROLLER booked the payment and the webhook stored it, but its kiosk
      // check skips an attempt that never reported an approval. Staff resolve it at the kiosk.
      const g = group('staff');
      await purchase(g, { attempt: 'unknown', confirmation: 'needs_staff' });
      created.sessions.push(sessionId(g));
      const stored = await webhookStores(g);
      const webhookCheck = await stored.check();
      assert.equal(webhookCheck.kioskConfirmation, null, 'the webhook leaves an unknown attempt to staff');
      const before = await rows(g);
      assert.match(keyOf(before, g.entryItemId), /^bookingitem:/);

      const roller = rollerFake({ [`/bookings/${g.bookingId}`]: paidBooking(g) });
      const invokes = [];
      const response = await bookingLambda({ fetchImpl: roller.fetchImpl, invokes }).internals.handleKioskStaffResolution({
        action: 'paid', ...request(g), rollerDraftUniqueId: g.bookingId, kioskInstallationId: KIOSK_INSTALLATION_ID,
        kioskProfileId: 'nacka-forum-kiosk-2', kioskCapability: KIOSK_CAPABILITY, staffIdentityId: 'jystaff_gh589',
      }, 'jy_gh589_staff');
      assert.equal(response.statusCode, 200, JSON.stringify(plain(response.body)));
      assert.equal(response.body.result, 'staff_confirmed_paid');
      const after = await rows(g);
      attached(g, after);
      assert.deepEqual(after.items, before.items);
      assert.deepEqual(after.tickets, g.tickets.map((ticketId) => [ticketId, keyOf(before, g.entryItemId)]));
      assert.equal(after.booking.source_last_updated_by, 'roller_webhook_enrichment');
      assert.deepEqual(autoCheckins(invokes), [[sessionId(g), 'kiosk_booking_confirmed']]);
      assert.deepEqual(roller.calls, [`GET /bookings/${g.bookingId}`], 'the staff check\'s one ROLLER read');
    });
  } finally {
    await db.admin(`DELETE FROM jumpyard.event_log WHERE correlation_id LIKE 'jy_gh589_%' OR subject_ref = ANY($1)`,
      [[...created.bookings, ...created.drafts]]);
    await db.admin('DELETE FROM jumpyard.checkin_tokens WHERE roller_unique_id = ANY($1) OR token_hash = ANY($2)',
      [created.bookings, created.tokens]);
    await db.admin('DELETE FROM jumpyard.checkin_sessions WHERE checkin_session_id = ANY($1)', [created.sessions]);
    await db.admin('DELETE FROM jumpyard.prepayment_booking_drafts WHERE prepayment_draft_id = ANY($1)', [created.drafts]);
    await db.admin('DELETE FROM jumpyard.roller_bookings WHERE roller_unique_id = ANY($1)', [created.bookings]);
    await client.end();
  }
});
