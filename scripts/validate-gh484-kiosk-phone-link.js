'use strict';

// GH-484 (D0240): when a kiosk check-in gets its number, Cloud mints a check-in link that the kiosk
// shows as a small QR ("Lappen i mobilen"). These checks drive the real Session Lambda with a
// scripted Aurora Data API and read the Booking Lambda's reconciliation statement.

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const SESSION_DIR = path.join(ROOT, 'infra', 'lambda', 'session');
const SESSION_PATH = path.join(SESSION_DIR, 'index.js');
const BOOKING_PATH = path.join(ROOT, 'infra', 'lambda', 'booking', 'index.js');
const BOOKING_ID = 'roller-booking-484';
const SESSION = {
  checkinSessionId: 'jycs_484', rollerUniqueId: BOOKING_ID, bookingReference: '484001', handoffCode: '0484',
  status: 'ready_for_staff', selectedTicketIds: ['484001-1'],
};

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

function createDatabase(script = {}) {
  const calls = [];
  const execute = async (sql, parameters) => {
    calls.push({ sql, parameters });
    if (/SELECT count\(\*\)::int AS link_count/.test(sql)) return rdsResult([{ link_count: script.existingLinks ?? 0 }]);
    if (/INSERT INTO jumpyard\.checkin_tokens/.test(sql)) {
      if (script.insertFails) throw new Error('synthetic insert failure');
      return rdsResult([{ token_hash: parameterValue(parameters, 'tokenHash'), expires_at: parameterValue(parameters, 'expiresAt') }], 1);
    }
    if (/INSERT INTO jumpyard\.event_log/.test(sql)) return rdsResult([], 1);
    if (/FROM jumpyard\.checkin_tokens AS ct\s+LEFT JOIN jumpyard\.roller_bookings AS b\s+ON b\.roller_unique_id = ct\.roller_unique_id\s+WHERE ct\.token_hash = :tokenHash\s+LIMIT 1/.test(sql)) {
      return rdsResult([{ token_hash: 'hash', roller_unique_id: BOOKING_ID, channel: script.channel ?? 'kiosk_phone',
        expires_at: '2000-01-01T00:00:00.000Z', opened_at: null, consumed_at: null, booking_reference: '484001' }]);
    }
    throw new Error(`Unexpected SQL during GH-484 validation: ${sql.slice(0, 90)}`);
  };
  return { calls, execute };
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

function loadSession(database) {
  const source = fs.readFileSync(SESSION_PATH, 'utf8');
  const module = { exports: {} };
  const errors = [];
  const aws = fakeAws(async (command) => {
    if (command.name === 'ExecuteStatementCommand') return database.execute(command.input.sql, command.input.parameters ?? []);
    throw new Error(`Unexpected AWS command ${command.name} during GH-484 validation.`);
  });
  vm.runInNewContext(`${source}\nmodule.exports.__gh484 = { createKioskPhoneLink, handleResolveSessionLink, normalizeReadyRequest };`, {
    AbortSignal, Buffer, TextDecoder, TextEncoder, URL, URLSearchParams, clearTimeout, setTimeout,
    console: { error: (message) => errors.push(String(message)), info() {}, log() {}, warn() {} },
    exports: module.exports, module,
    process: { env: { DATABASE_CLUSTER_ARN: 'arn:synthetic', DATABASE_SECRET_ARN: 'arn:synthetic' } },
    require(moduleId) {
      if (moduleId.startsWith('./')) return require(path.join(SESSION_DIR, moduleId));
      if (moduleId === 'crypto' || moduleId === 'node:crypto') return crypto;
      if (moduleId.startsWith('@aws-sdk/')) return aws;
      throw new Error(`Unexpected require(${JSON.stringify(moduleId)}) during GH-484 validation.`);
    },
  }, { filename: SESSION_PATH });
  return { errors, internals: module.exports.__gh484 };
}

const sqlCalls = (calls, pattern) => calls.filter((call) => pattern.test(call.sql));

const TODAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());

// The provisional booking a kiosk payment creates before ROLLER confirms it (booking runtime, GH-249).
function provisionalBookingRow() {
  return {
    roller_unique_id: BOOKING_ID, booking_reference: BOOKING_ID, roller_env: 'live', booking_status: 'payment_approved_booking_syncing',
    payment_status: 'paid', amount_owing_cents: 0, total_cents: 25000, booking_date: TODAY, venue_id: '50871',
    start_time: '00:00:00', end_time: '23:59:00', freshness_status: 'stale', is_tombstoned: false,
    last_seen_from_roller_at: null, tickets_json: '[]',
  };
}

function readyKioskSessionRow() {
  return {
    checkin_session_id: SESSION.checkinSessionId, roller_unique_id: BOOKING_ID, booking_reference: BOOKING_ID,
    visit_date: TODAY, status: 'ready_for_staff', safety_status: 'completed', guest_resume_step: null,
    handoff_code: SESSION.handoffCode, handoff_day: TODAY, handoff_status: 'ready_for_staff', selected_ticket_ids: '[]',
    expires_at: '2999-01-01T00:00:00.000Z', ready_for_staff_at: `${TODAY}T13:09:06.000Z`, completed_at: null,
    created_at: `${TODAY}T13:09:05.000Z`, updated_at: `${TODAY}T13:09:06.000Z`,
  };
}

// What a kiosk purchase stores before ROLLER confirms it: a Weekday Combo for two, socks and coffee.
const KIOSK_DRAFT_ITEMS = [
  { productId: '1242136', parentProductId: '1242135', productName: 'Weekday Combo', parentProductName: 'Weekday Combo',
    productType: 'sessionpass', quantity: 1, bookingDate: TODAY, startTime: '14:00', endTime: '16:00' },
  { productId: '1189901', parentProductId: '1189900', productName: 'Strumpor', parentProductName: 'JumpSocks',
    productType: 'addon', quantity: 2, bookingDate: TODAY },
  { productId: '1190001', parentProductId: '1190000', productName: 'Bryggkaffe', parentProductName: 'Kaffe',
    productType: 'addon', quantity: 1, bookingDate: TODAY },
];

function createResolveDatabase(script = {}) {
  const calls = [];
  const execute = async (sql, parameters) => {
    calls.push({ sql, parameters });
    if (/FROM jumpyard\.checkin_tokens AS ct\s+LEFT JOIN jumpyard\.roller_bookings AS b\s+ON b\.roller_unique_id = ct\.roller_unique_id\s+WHERE ct\.token_hash = :tokenHash\s+LIMIT 1/.test(sql)) {
      return rdsResult([{ token_hash: 'hash', roller_unique_id: BOOKING_ID, channel: script.channel ?? 'kiosk_phone',
        expires_at: '2999-01-01T00:00:00.000Z', opened_at: null, consumed_at: null, booking_reference: BOOKING_ID }]);
    }
    if (/UPDATE jumpyard\.checkin_tokens\s+SET opened_at = now\(\)/.test(sql)) return rdsResult([{ opened_at: `${TODAY}T13:09:08.000Z` }], 1);
    if (/INSERT INTO jumpyard\.event_log/.test(sql)) return rdsResult([], 1);
    if (/FROM jumpyard\.roller_bookings AS b\s+LEFT JOIN jumpyard\.roller_booking_tickets AS t/.test(sql)) return rdsResult([provisionalBookingRow()]);
    if (/AND status IN \('guest_in_progress', 'ready_for_staff', 'staff_in_progress'\)\s+AND expires_at > now\(\)/.test(sql)) {
      return rdsResult(script.readySession === false ? [] : [readyKioskSessionRow()]);
    }
    if (/FROM jumpyard\.roller_booking_items AS item\s+LEFT JOIN jumpyard\.roller_booking_tickets AS ticket/.test(sql)) return rdsResult([]);
    if (/FROM jumpyard\.prepayment_booking_drafts AS draft\s+WHERE draft\.roller_draft_unique_id = :rollerUniqueId/.test(sql)) {
      return rdsResult([{ items_summary: JSON.stringify(script.draftItems ?? KIOSK_DRAFT_ITEMS) }]);
    }
    if (/WITH source_bookings AS MATERIALIZED/.test(sql)) return rdsResult([]);
    if (/FROM jumpyard\.booking_links AS link\s+INNER JOIN jumpyard\.prepayment_booking_drafts AS draft/.test(sql)) return rdsResult([]);
    if (/WITH staff_items AS \(/.test(sql)) return rdsResult([]);
    if (/FROM jumpyard\.staff_handout_claims c/.test(sql)) return rdsResult([{ claims: '[]', receipts: '[]' }]);
    throw new Error(`Unexpected SQL during GH-484 resolve validation: ${sql.replace(/s+/g, " ").slice(0, 160)}`);
  };
  return { calls, execute };
}

async function resolveLink(script) {
  const database = createResolveDatabase(script);
  const response = await loadSession(database).internals.handleResolveSessionLink({ headers: {} },
    { token: 'k'.repeat(43), expectedDate: TODAY }, 'jy_gh484_resolve');
  return { body: JSON.parse(response.body), calls: database.calls, statusCode: response.statusCode };
}

async function validateKioskLinkOpensTheVisitBeforeRollerConfirms() {
  const opened = await resolveLink({});
  assert.equal(opened.statusCode, 200, 'a scan right after a kiosk purchase opens the visit');
  assert.equal(opened.body.status, 'session_resumed');
  assert.equal(opened.body.session.handoffCode, SESSION.handoffCode, 'the same number as the kiosk');
  assert.equal(opened.body.session.status, 'ready_for_staff');
  assert.equal(opened.body.guestAccess.token, 'k'.repeat(43), 'the phone keeps the link as its guest access');
  assert.equal(sqlCalls(opened.calls, /INSERT INTO jumpyard\.checkin_sessions/).length, 0, 'no second session is created');
  // Live test 2026-10-07: before ROLLER confirms, the phone gets what was bought, not a generic entry.
  assert.deepEqual(opened.body.booking.items.map((item) => [item.productName, item.quantity]),
    [['Weekday Combo', 1], ['Strumpor', 2], ['Bryggkaffe', 1]]);
  assert.ok(opened.body.booking.items[0].packageContents?.length, 'the Combo carries its bands and pizza');
  assert.equal(opened.body.source.provisionalItems, true);
  assert.equal('cafe' in (opened.body.visit ?? {}), false, 'no café list yet, so the phone groups the items itself');

  const notReady = await resolveLink({ readySession: false });
  assert.equal(notReady.statusCode, 409, 'without a ready kiosk session the phone still waits');
  assert.equal(notReady.body.error.code, 'booking_not_fresh');

  const email = await resolveLink({ channel: 'email' });
  assert.equal(email.statusCode, 409, 'an email link keeps the ordinary freshness rule');
  assert.equal(email.body.error.code, 'booking_not_fresh');
  console.log('[pass] a kiosk QR scanned before ROLLER confirms the purchase opens the same ready visit at once');
}

async function validateLinkIsMintedForTheKioskGuest() {
  const database = createDatabase();
  const { internals } = loadSession(database);
  const link = await internals.createKioskPhoneLink(SESSION, 'jy_gh484');
  assert.ok(link, 'a link is returned');
  const url = new URL(link.url);
  assert.equal(`${url.origin}/`, 'https://checkin.jumpyard.se/', 'the public Nacka check-in origin');
  assert.match(url.searchParams.get('jy_token'), /^[A-Za-z0-9_-]{43}$/, 'a 32-byte base64url token the phone already resolves');
  assert.equal([...url.searchParams.keys()].join(','), 'jy_token');

  const insert = sqlCalls(database.calls, /INSERT INTO jumpyard\.checkin_tokens/)[0];
  assert.equal(parameterValue(insert.parameters, 'channel'), 'kiosk_phone');
  assert.equal(parameterValue(insert.parameters, 'rollerUniqueId'), BOOKING_ID);
  assert.equal(parameterValue(insert.parameters, 'tokenHash'),
    crypto.createHash('sha256').update(url.searchParams.get('jy_token')).digest('hex'), 'only the hash is stored');
  const expiresAt = new Date(parameterValue(insert.parameters, 'expiresAt'));
  const minutesLeft = (expiresAt.getTime() - Date.now()) / 60000;
  assert.ok(minutesLeft >= 29 && minutesLeft <= 1441, 'valid until midnight of the visit day (at least 30 minutes)');
  const midnight = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Stockholm', hour: '2-digit', minute: '2-digit',
    hourCycle: 'h23' }).format(expiresAt);
  assert.ok(minutesLeft < 31 || midnight === '00:00' || midnight === '23:59', `expires at Stockholm midnight, got ${midnight}`);

  const event = sqlCalls(database.calls, /INSERT INTO jumpyard\.event_log/)[0];
  assert.equal(parameterValue(event.parameters, 'eventType'), 'checkin.kiosk_phone_link_created');
  for (const call of database.calls) {
    for (const parameter of call.parameters ?? []) {
      assert.ok(!String(parameter.value?.stringValue ?? '').includes(url.searchParams.get('jy_token')),
        'the raw token is never written to Aurora');
    }
  }
  console.log('[pass] a kiosk check-in gets a checkin.jumpyard.se link with a hashed kiosk_phone token until midnight');
}

async function validateLinksAreBoundedAndOptional() {
  const capped = createDatabase({ existingLinks: 5 });
  assert.equal(await loadSession(capped).internals.createKioskPhoneLink(SESSION, 'jy_gh484'), null);
  assert.equal(sqlCalls(capped.calls, /INSERT INTO jumpyard\.checkin_tokens/).length, 0, 'no more than five links per booking and day');

  const failing = createDatabase({ insertFails: true });
  const loaded = loadSession(failing);
  assert.equal(await loaded.internals.createKioskPhoneLink(SESSION, 'jy_gh484'), null, 'a failure only leaves the QR out');
  assert.ok(loaded.errors.some((message) => message.includes('checkin.kiosk_phone_link_failed')));

  const { internals } = loadSession(createDatabase());
  assert.equal(internals.normalizeReadyRequest({}, { phoneLink: true }).phoneLink, true);
  assert.equal(internals.normalizeReadyRequest({}, { phoneLink: 'yes' }).phoneLink, false, 'only an explicit true asks for a link');
  assert.equal(internals.normalizeReadyRequest({}, {}).phoneLink, false);
  console.log('[pass] links are capped per booking and day, optional, and never block the ready answer');
}

async function validatePhoneLinksResolveLikeOtherLinks() {
  const kiosk = createDatabase({ channel: 'kiosk_phone' });
  const accepted = await loadSession(kiosk).internals.handleResolveSessionLink({ headers: {} }, { token: 'x'.repeat(43) }, 'jy_gh484');
  assert.equal(JSON.parse(accepted.body).error.code, 'checkin_link_expired', 'a kiosk_phone token passes the channel check');

  const guestAccess = createDatabase({ channel: 'guest_access' });
  const refused = await loadSession(guestAccess).internals.handleResolveSessionLink({ headers: {} }, { token: 'x'.repeat(43) }, 'jy_gh484');
  assert.equal(JSON.parse(refused.body).error.code, 'checkin_link_not_found', 'other token kinds still do not resolve as links');
  console.log('[pass] kiosk_phone links resolve through the ordinary check-in link route');
}

function validateSourceContracts() {
  const session = fs.readFileSync(SESSION_PATH, 'utf8');
  const booking = fs.readFileSync(BOOKING_PATH, 'utf8');
  const contract = fs.readFileSync(path.join(ROOT, 'JUMPYARD_CLOUD_CONTRACT.md'), 'utf8');
  const packageJson = fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8');
  const slice = (text, start, end) => text.slice(text.indexOf(start), text.indexOf(end, text.indexOf(start)));

  const ready = slice(session, 'async function handleReadyForStaff(', 'async function createKioskPhoneLink(');
  assert.match(ready, /const checkinLink = request\.phoneLink \? await createKioskPhoneLink\(updatedSession, correlationId\) : null;/);
  assert.match(ready, /\.\.\.\(checkinLink \? \{ checkinLink \} : \{\}\)/);
  assert.ok(ready.indexOf("requestAutoCheckin(updatedSession.checkinSessionId, 'ready_for_staff'") < ready.indexOf('createKioskPhoneLink('),
    'automatic check-in is requested before the link');
  assert.match(slice(session, 'async function verifyGuestAccessToken(', 'function getGuestAccessCredential('),
    /ct\.channel IN \('sms', 'email', 'manual', 'dev', 'kiosk_phone'\)/);
  assert.match(slice(session, 'async function markSessionLinkOpened(', 'async function markSessionLinkSent('),
    /AND channel IN \('sms', 'email', 'manual', 'dev', 'kiosk_phone'\)/);
  assert.match(slice(session, 'async function handleResolveSessionLink(', 'if (tokenRecord.consumedAt)'),
    /RESOLVABLE_LINK_CHANNELS\.has\(tokenRecord\.channel\)/);
  assert.match(session, /if \(!CHECKIN_LINK_CHANNELS\.has\(request\.channel\)\) \{/, 'the development link route still cannot mint kiosk_phone');

  const reconciliation = slice(booking, 'async function confirmKioskReconciliation(', 'async function confirmKioskAddProductReconciliation(');
  assert.match(reconciliation, /attached_phone_links AS \(\s*-- GH-484[\s\S]*?WHERE channel = 'kiosk_phone'\s+AND roller_unique_id IN \(\s*SELECT draft_session\.roller_unique_id[\s\S]*?AND EXISTS \(SELECT 1 FROM confirmed\)/);
  assert.ok(reconciliation.indexOf('attached_phone_links') < reconciliation.indexOf("'kiosk_booking_confirmed'"),
    'links move in the same statement, before the automatic check-in trigger');

  for (const term of ['phoneLink', 'checkinLink', 'kiosk_phone']) {
    assert.ok(contract.includes(term), `JUMPYARD_CLOUD_CONTRACT.md documents ${term}`);
  }
  assert.match(packageJson, /validate:gh484-kiosk-phone-link/);
  console.log('[pass] ready-for-staff, resolution, guest access, reconciliation and the contract carry the kiosk phone link');
}

async function main() {
  await validateKioskLinkOpensTheVisitBeforeRollerConfirms();
  await validateLinkIsMintedForTheKioskGuest();
  await validateLinksAreBoundedAndOptional();
  await validatePhoneLinksResolveLikeOtherLinks();
  validateSourceContracts();
  console.log('GH-484 kiosk phone link validation passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
