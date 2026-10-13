'use strict';

// GH-527: a 0 kr booking (a 100 % code or a gift card that covers it) is published inside the draft call and
// looked up at once (post_payment_sync), before ROLLER's booking webhook fills in its venue. The lookup now stores
// the configured park venue, so the attested-ready session start allocates the number (ready_staff_session)
// instead of failing on handoff_venue_required, and a failure logs a safe code.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const lookupPath = path.join(root, 'infra', 'lambda', 'lookup', 'index.js');
const sessionPath = path.join(root, 'infra', 'lambda', 'session', 'index.js');
const webhookPath = path.join(root, 'infra', 'lambda', 'webhook', 'index.js');
const VENUE = '50871';
const BOOKING_ID = 'roller-draft-527';
const DATABASE_ENV = {
  DATABASE_CLUSTER_ARN: 'arn:aws:rds:eu-north-1:000000000000:cluster:synthetic',
  DATABASE_SECRET_ARN: 'arn:aws:secretsmanager:eu-north-1:000000000000:secret:synthetic',
};
const LOOKUP_ENV = { ...DATABASE_ENV, JUMPYARD_ENVIRONMENT: 'park-test', T0171_ASSISTED_LOOKUP_VENUE_ID: VENUE };
const plain = (value) => JSON.parse(JSON.stringify(value));

function load(filePath, { overrides = {}, names = [], env = DATABASE_ENV, errors = [] } = {}) {
  const module = { exports: {} };
  const aws = new Proxy({}, {
    get: (_target, name) => String(name).endsWith('Client')
      ? class { async send() { throw new Error('Unexpected AWS operation during GH-527 validation.'); } }
      : class { constructor(input) { this.input = input; } },
  });
  const localDirectory = path.dirname(filePath);
  const sandbox = {
    AbortSignal, Buffer, TextDecoder, TextEncoder, URL, URLSearchParams, clearTimeout, setTimeout,
    console: { log() {}, warn() {}, info() {}, error: (message) => errors.push(String(message)) },
    exports: module.exports,
    fetch: async () => { throw new Error('Unexpected network call during GH-527 validation.'); },
    module,
    overrides,
    process: { env },
    require(moduleId) {
      if (moduleId === 'crypto' || moduleId === 'node:crypto') return crypto;
      if (moduleId.startsWith('@aws-sdk/')) return aws;
      if (moduleId === './server-diagnostics') return require('../infra/lambda/lookup/server-diagnostics');
      if (moduleId === './staff-handout') return require('../infra/lambda/shared/staff-handout');
      if (moduleId === './checkin-window') return require('../infra/lambda/shared/checkin-window');
      if (moduleId === './staff-handout-write') return require('../infra/lambda/redeem/staff-handout-write');
      if (moduleId.startsWith('./')) return require(path.join(localDirectory, moduleId));
      throw new Error(`Unexpected require(${JSON.stringify(moduleId)}) during GH-527 validation.`);
    },
  };
  const assignments = Object.keys(overrides).map((name) => `${name} = overrides.${name};`).join('\n');
  vm.runInNewContext(
    `${fs.readFileSync(filePath, 'utf8')}\n${assignments}\nmodule.exports.__gh527 = { ${names.join(', ')} };`,
    sandbox,
    { filename: filePath },
  );
  return module.exports.__gh527;
}

function rdsRows(rows) {
  if (!rows.length) return { columnMetadata: [], records: [] };
  const columns = Object.keys(rows[0]);
  return {
    columnMetadata: columns.map((name) => ({ name })),
    records: rows.map((row) => columns.map((name) => {
      const value = row[name];
      if (value === null || value === undefined) return { isNull: true };
      if (typeof value === 'number') return { longValue: value };
      if (typeof value === 'boolean') return { booleanValue: value };
      return { stringValue: String(value) };
    })),
  };
}

const parameter = (call, name) => call.parameters.find((entry) => entry.name === name)?.value?.stringValue ?? null;
const TODAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit' })
  .format(new Date());

function sessionRow(overrides = {}) {
  return {
    checkin_session_id: 'jycs_gh527', roller_unique_id: BOOKING_ID, booking_reference: 'B527', visit_date: TODAY,
    status: 'guest_in_progress', safety_status: 'pending', guest_resume_step: 'safety', handoff_code: null,
    handoff_day: null, handoff_status: null, selected_ticket_ids: '[]', expires_at: '2999-01-01T00:00:00.000Z',
    ready_for_staff_at: null, completed_at: null, created_at: `${TODAY}T11:31:42.000Z`, updated_at: `${TODAY}T11:31:42.000Z`,
    ...overrides,
  };
}

// The booking row as Aurora keeps it: one row per ROLLER booking whose venue a later write only fills in, never
// clears (COALESCE(EXCLUDED.venue_id, venue_id) in the lookup and webhook upserts).
function bookingStore() {
  const rows = new Map();
  return {
    rows,
    upsert(rollerUniqueId, venueId) {
      const existing = rows.get(rollerUniqueId);
      rows.set(rollerUniqueId, { venueId: venueId ?? existing?.venueId ?? null });
    },
  };
}

function lookupDatabase(store) {
  const calls = [];
  const executeStatement = async (sql, parameters = []) => {
    calls.push({ sql, parameters });
    if (/INSERT INTO jumpyard\.roller_bookings/.test(sql)) {
      store.upsert(parameter({ parameters }, 'rollerUniqueId'), parameter({ parameters }, 'venueId'));
    }
    return rdsRows([]);
  };
  return { calls, executeStatement };
}

function sessionDatabase(store, copyVersion) {
  const calls = [];
  const executeStatement = async (sql, parameters = []) => {
    calls.push({ sql, parameters });
    if (sql.includes("operation = 'safety_attestation'")) {
      return rdsRows([{ result_ref: JSON.stringify({ uniqueId: BOOKING_ID, copyVersion }) }]);
    }
    if (sql.includes('jumpyard.ready_staff_session')) {
      // migrations/0021: the number needs the booking's park venue.
      if (!store.rows.get(BOOKING_ID)?.venueId) {
        throw new Error('ERROR: handoff_venue_required; Where: PL/pgSQL function jumpyard.ready_staff_session(text,text) line 14');
      }
      return rdsRows([sessionRow({
        status: 'ready_for_staff', safety_status: 'completed', guest_resume_step: null, handoff_code: '0007',
        handoff_day: TODAY, handoff_status: 'ready_for_staff', ready_for_staff_at: `${TODAY}T11:31:43.000Z`,
      })]);
    }
    return rdsRows([]);
  };
  return { calls, executeStatement };
}

const ZERO_KR_BOOKING = {
  rollerUniqueId: BOOKING_ID, bookingReference: 'B527', status: 'Booked', paymentStatus: 'NoPaymentRequired',
  amountOwing: 0, total: 0, items: [], customer: null,
};

async function startAfterLookup(scopeVenueId) {
  const store = bookingStore();
  const lookup = load(lookupPath, { names: ['upsertLiveBooking'], env: LOOKUP_ENV, overrides: { executeStatement: lookupDatabase(store).executeStatement } });
  await lookup.upsertLiveBooking(ZERO_KR_BOOKING, 'live', scopeVenueId);
  const errors = [];
  const names = ['readyAttestedPurchaseSession', 'mapSessionRow', 'SAFETY_ATTESTATION_COPY_VERSION'];
  const copy = load(sessionPath, { names }).SAFETY_ATTESTATION_COPY_VERSION;
  const db = sessionDatabase(store, copy);
  const events = [];
  const session = load(sessionPath, {
    names, errors,
    overrides: {
      executeStatement: db.executeStatement,
      writeEventLog: async (entry) => { events.push(entry.eventType); },
      requestAutoCheckin: async () => { events.push('auto_checkin_requested'); },
    },
  });
  const started = plain(await session.readyAttestedPurchaseSession(session.mapSessionRow(sessionRow()), 'jy_gh527'));
  return { errors, events, started, store };
}

test('lookup: a post-payment booking without a venue gets the configured park venue, and nothing else changes', () => {
  const lookup = load(lookupPath, { names: ['validateParkTestBookingScope'], env: LOOKUP_ENV });
  const sync = { mode: 'post_payment_sync', draft: { rollerDraftUniqueId: BOOKING_ID } };
  assert.deepEqual(plain(lookup.validateParkTestBookingScope(sync, {}, { bookingReference: 'B527' }, ZERO_KR_BOOKING)),
    { ok: true, venueId: VENUE }, 'the phone sends no venue and ROLLER\'s detail has none before the webhook');
  assert.equal(lookup.validateParkTestBookingScope(sync, { venueId: '111' }, {}, ZERO_KR_BOOKING).venueId, '111',
    'a venue from the request still wins');
  assert.equal(lookup.validateParkTestBookingScope(sync, {}, { venueId: '222' }, ZERO_KR_BOOKING).venueId, '222',
    'a venue from ROLLER still wins');
  assert.equal(lookup.validateParkTestBookingScope(sync, {}, {}, { ...ZERO_KR_BOOKING, venueId: '333' }).venueId, '333',
    'the stored row\'s venue still wins');

  assert.equal(lookup.validateParkTestBookingScope({ mode: 'explicit_live_lookup_gate' }, {}, {}, ZERO_KR_BOOKING).venueId,
    undefined, 'other lookup modes keep the request venue only');
  const otherEnvironment = load(lookupPath, { names: ['validateParkTestBookingScope'], env: { ...LOOKUP_ENV, JUMPYARD_ENVIRONMENT: 'dev' } });
  assert.equal(otherEnvironment.validateParkTestBookingScope(sync, {}, {}, ZERO_KR_BOOKING).venueId, undefined);
  const unconfigured = load(lookupPath, { names: ['validateParkTestBookingScope'], env: { ...LOOKUP_ENV, T0171_ASSISTED_LOOKUP_VENUE_ID: '' } });
  assert.equal(unconfigured.validateParkTestBookingScope(sync, {}, {}, ZERO_KR_BOOKING).venueId, null,
    'without a configured venue the row stays as before');
});

test('order: lookup, then session start, then webhook gives the 0 kr purchase its number at session start', async () => {
  const lookup = load(lookupPath, { names: ['validateParkTestBookingScope'], env: LOOKUP_ENV });
  const scope = lookup.validateParkTestBookingScope({ mode: 'post_payment_sync' }, {}, {}, ZERO_KR_BOOKING);
  const { errors, events, started, store } = await startAfterLookup(scope.venueId);
  assert.equal(store.rows.get(BOOKING_ID).venueId, VENUE, 'the lookup stored the park venue');
  assert.equal(started.status, 'ready_for_staff', 'the session starts attested-ready');
  assert.equal(started.handoffCode, '0007');
  assert.deepEqual(events, ['checkin.session_ready_for_staff', 'auto_checkin_requested']);
  assert.deepEqual(errors, [], 'no checkin.attested_ready_failed');

  // ROLLER's webhook arrives afterwards and only fills in or keeps the venue.
  store.upsert(BOOKING_ID, null);
  assert.equal(store.rows.get(BOOKING_ID).venueId, VENUE);
  const webhook = fs.readFileSync(webhookPath, 'utf8');
  const lookupSource = fs.readFileSync(lookupPath, 'utf8');
  for (const source of [webhook, lookupSource]) {
    assert.match(source, /venue_id = COALESCE\(EXCLUDED\.venue_id, jumpyard\.roller_bookings\.venue_id\)/);
  }
});

test('before the fix the start failed on handoff_venue_required; the log now says so without guest data', async () => {
  const { errors, started } = await startAfterLookup(undefined);
  assert.equal(started.status, 'guest_in_progress', 'without a venue the ordinary session stays, as live on 2026-10-13');
  assert.equal(errors.length, 1);
  const logged = JSON.parse(errors[0]);
  assert.deepEqual(Object.keys(logged).sort(), ['code', 'correlationId', 'event']);
  assert.equal(logged.event, 'checkin.attested_ready_failed');
  assert.equal(logged.code, 'handoff_venue_required');
});

test('the failure code is the error\'s own code or one of our database codes, never other message text', () => {
  const { safeFailureCode, OWN_DATABASE_FAILURE_CODES } = load(sessionPath, { names: ['safeFailureCode', 'OWN_DATABASE_FAILURE_CODES'] });
  assert.equal(safeFailureCode({ code: 'handoff_venue_required' }), 'handoff_venue_required');
  assert.equal(safeFailureCode(new Error('ERROR: handoff_venue_required; Where: PL/pgSQL function jumpyard.ready_staff_session')), 'handoff_venue_required');
  // Monitor review 2026-10-13: an email's local part looks like a snake_case code and must never reach the log.
  assert.equal(safeFailureCode(new Error('ERROR: duplicate key value; Key (email)=(first_last@example.com) already exists')), 'unknown_error');
  assert.equal(safeFailureCode(new Error('first_last@example.com handoff_venue_required')), 'handoff_venue_required', 'only the known code is taken');
  assert.equal(safeFailureCode(new Error('Guest anna@example.com, phone 0701234567')), 'unknown_error', 'no guest data');
  assert.equal(safeFailureCode({ code: 'Bad Code With Spaces', message: 'nothing here' }), 'unknown_error');
  assert.equal(safeFailureCode({ code: 'ECONNRESET', message: 'socket hang up' }), 'unknown_error');
  assert.equal(safeFailureCode(null), 'unknown_error');

  // Every code our migrations raise is on the allowlist, so a new one is never logged as unknown_error by mistake.
  const migrations = fs.readdirSync(path.join(root, 'infra', 'migrations')).filter((name) => name.endsWith('.sql'))
    .map((name) => fs.readFileSync(path.join(root, 'infra', 'migrations', name), 'utf8')).join('\n');
  const raised = new Set([...migrations.matchAll(/RAISE EXCEPTION '([a-z][a-z0-9_]+)'/g), ...migrations.matchAll(/MESSAGE = '([a-z][a-z0-9_]+)'/g)]
    .map((match) => match[1]));
  assert.ok(raised.has('handoff_venue_required'));
  assert.deepEqual([...raised].filter((code) => !OWN_DATABASE_FAILURE_CODES.includes(code)), []);
});

test('source: no new ROLLER call, and the venue rule sits in the non-assisted lookup branch', () => {
  const lookupSource = fs.readFileSync(lookupPath, 'utf8');
  const helper = lookupSource.slice(lookupSource.indexOf('function postPaymentSyncVenueId('), lookupSource.indexOf('function validateParkTestBookingScope('));
  assert.ok(helper.length > 0);
  assert.doesNotMatch(helper, /fetch|getRoller|rollerRequest|await /, 'the venue comes from configuration, not from ROLLER');
  assert.match(lookupSource, /if \(!isParkTestEnvironment\(\) \|\| access\?\.mode !== 'assisted_lookup'\) \{\s+return \{ ok: true, venueId: postPaymentSyncVenueId\(access, request, rollerBooking, booking\) \};/);
  assert.match(lookupSource, /await upsertLiveBooking\(scopedBooking, config\.env, parkTestScope\.venueId \?\? request\.venueId\);/);
  const sessionSource = fs.readFileSync(sessionPath, 'utf8');
  assert.match(sessionSource, /console\.error\(JSON\.stringify\(\{ event: 'checkin\.attested_ready_failed', correlationId, code: safeFailureCode\(error\) \}\)\);/);
  assert.match(fs.readFileSync(path.join(root, 'package.json'), 'utf8'), /validate:gh527-zero-kr-venue/);
});
