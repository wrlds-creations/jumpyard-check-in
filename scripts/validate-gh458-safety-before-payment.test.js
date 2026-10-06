'use strict';

// GH-458 (D0231): safety is approved before payment. The Booking Lambda records the approval
// with the draft; the Session Lambda makes the paid session ready for staff (number and QR).
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const bookingPath = path.join(root, 'infra', 'lambda', 'booking', 'index.js');
const sessionPath = path.join(root, 'infra', 'lambda', 'session', 'index.js');
const COPY_VERSION = 'safety-rules-2026-09-30-v1';
const DRAFT_ID = '00000000-0000-4000-8000-000000000458';
const attestation = { attestedAt: '2026-09-30T08:15:00.000Z', copyVersion: COPY_VERSION, locale: 'sv' };
const plain = (value) => JSON.parse(JSON.stringify(value));
const sha256 = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');

function load(filePath, overrides = {}, names = []) {
  const module = { exports: {} };
  const aws = new Proxy({}, {
    get: (_target, name) => String(name).endsWith('Client')
      ? class { async send() { throw new Error('Unexpected AWS operation during GH-458 validation.'); } }
      : class { constructor(input) { this.input = input; } },
  });
  const localDirectory = path.dirname(filePath);
  const sandbox = {
    AbortSignal, Buffer, TextDecoder, TextEncoder, URL, URLSearchParams, clearTimeout, setTimeout,
    console: { log() {}, error() {}, warn() {} },
    exports: module.exports,
    fetch: async () => { throw new Error('Unexpected network call during GH-458 validation.'); },
    module,
    overrides,
    process: { env: {
      DATABASE_CLUSTER_ARN: 'arn:aws:rds:eu-north-1:000000000000:cluster:synthetic',
      DATABASE_SECRET_ARN: 'arn:aws:secretsmanager:eu-north-1:000000000000:secret:synthetic',
    } },
    require(moduleId) {
      if (moduleId === 'crypto' || moduleId === 'node:crypto') return crypto;
      if (moduleId.startsWith('@aws-sdk/')) return aws;
      if (moduleId === './server-diagnostics') return require('../infra/lambda/lookup/server-diagnostics');
      if (moduleId === './staff-handout') return require('../infra/lambda/shared/staff-handout');
      if (moduleId === './checkin-window') return require('../infra/lambda/shared/checkin-window');
      if (moduleId === './staff-handout-write') return require('../infra/lambda/redeem/staff-handout-write');
      if (moduleId.startsWith('./')) return require(path.join(localDirectory, moduleId));
      throw new Error(`Unexpected require(${JSON.stringify(moduleId)}) during GH-458 validation.`);
    },
  };
  const assignments = Object.keys(overrides).map((name) => `${name} = overrides.${name};`).join('\n');
  vm.runInNewContext(
    `${fs.readFileSync(filePath, 'utf8')}\n${assignments}\nmodule.exports.__gh458 = { ${names.join(', ')} };`,
    sandbox,
    { filename: filePath },
  );
  return { ...module.exports.__gh458, handler: module.exports.handler };
}

function rdsRows(rows) {
  if (rows.length === 0) return { columnMetadata: [], records: [] };
  const columns = Object.keys(rows[0]);
  return {
    columnMetadata: columns.map((name) => ({ name })),
    records: rows.map((row) => columns.map((name) => {
      const value = row[name];
      if (value === null || value === undefined) return { isNull: true };
      if (typeof value === 'number') return { longValue: value };
      return { stringValue: String(value) };
    })),
  };
}

const parameter = (call, name) => call.parameters.find((p) => p.name === name)?.value?.stringValue;

// ---------------------------------------------------------------------------------------------
// Booking Lambda: the approval travels with the draft and is recorded before any publish.

function draftBody(extra = {}) {
  return {
    confirmDraft: true,
    idempotencyKey: 'gh458-draft-fixture',
    customer: { firstName: 'Test', lastName: 'Fixture', email: 'test@example.invalid', phone: '+46000000000' },
    items: [{ productId: 101, quantity: 1, bookingDate: '2026-09-30', startTime: '12:00' }],
    ...extra,
  };
}

function bookingFixture(extra = {}) {
  const calls = [];
  const overrides = {
    getRollerConfig: async () => ({ env: 'playground', baseUrl: 'https://example.invalid' }),
    getRollerAccessToken: async () => 'synthetic-access',
    reserveIdempotencyKey: async (operation, key, requestHash) => {
      calls.push({ reserved: { operation, key, requestHash } });
      return { ok: true };
    },
    completeIdempotencyKey: async () => {},
    isNewBookingDraftWriteEnabled: () => true,
    validateT0176FullFlowRequestItemDates: () => ({ ok: true }),
    getRollerJson: async () => { throw new Error('Draft creation must not look up a customer'); },
    postRollerJson: async (_config, _token, endpoint, payload) => {
      calls.push({ endpoint, payload });
      return { ok: true, status: 200, body: { uniqueId: DRAFT_ID, costs: { total: 260, amountOwing: 260 }, currency: 'SEK', paymentJwt: 'a.b.c' } };
    },
    getVenuePaymentConfig: async () => ({ available: true, apiUrl: 'https://example.invalid' }),
    persistPrepaymentDraft: async () => { calls.push({ persisted: true }); return { prepaymentDraftId: 'jypd_000000000000000458' }; },
    writeBookingEventLog: async (entry) => { calls.push({ event: entry }); },
    executeStatement: async (sql, parameters) => { calls.push({ sql, parameters }); return { records: [] }; },
    ...extra,
  };
  return { calls, backend: load(bookingPath, overrides, ['handleDraft', 'normalizeDraftRequest', 'validateDraftRequest', 'validateSafetyAttestation', 'reserveIdempotencyKey']) };
}

test('booking: an optional, versioned approval is valid; anything else is rejected before provider work', async () => {
  const { backend } = bookingFixture();
  for (const value of [undefined, null, attestation, { ...attestation, locale: 'en' }]) {
    assert.equal(backend.validateSafetyAttestation(value), null);
  }
  for (const value of [true, 'yes', [], {}, { ...attestation, copyVersion: 'retired' }, { ...attestation, locale: 'de' },
    { ...attestation, attestedAt: 'not-a-date' }, { ...attestation, attestedAt: 42 }, { ...attestation, attestedAt: 'x'.repeat(41) }]) {
    assert.equal(backend.validateSafetyAttestation(value)?.code, 'safety_attestation_invalid');
  }
  const request = backend.normalizeDraftRequest({ headers: {} }, draftBody({ safetyAttestation: attestation }));
  assert.deepEqual(plain(request.safetyAttestation), attestation);
  assert.equal(backend.validateDraftRequest(request), null);
  assert.equal(backend.validateDraftRequest({ ...request, safetyAttestation: { attested: true } }).code, 'safety_attestation_invalid');

  const { calls, backend: handler } = bookingFixture();
  const rejected = await handler.handleDraft({ headers: {} }, draftBody({ safetyAttestation: { ...attestation, locale: 'fi' } }), 'gh458');
  assert.equal(rejected.statusCode, 400);
  assert.equal(JSON.parse(rejected.body).error.code, 'safety_attestation_invalid');
  assert.deepEqual(calls, []);
});

test('booking: the approval is recorded against the provider draft identity, outside the ROLLER payload and hash', async () => {
  const attested = bookingFixture();
  const result = await attested.backend.handleDraft({ headers: {} }, draftBody({ safetyAttestation: attestation }), 'gh458');
  assert.equal(result.statusCode, 201, result.body);
  const record = attested.calls.find((call) => call.sql?.includes("'safety_attestation'"));
  assert.ok(record, 'the approval must be recorded');
  assert.match(record.sql, /INSERT INTO jumpyard\.idempotency_records/);
  assert.match(record.sql, /ON CONFLICT \(idempotency_key\) DO NOTHING/);
  assert.equal(parameter(record, 'key'), `jysa_${sha256(DRAFT_ID)}`);
  const saved = JSON.parse(parameter(record, 'record'));
  assert.deepEqual({ ...saved, recordedAt: undefined }, {
    attestedAt: attestation.attestedAt, channel: 'phone', copyVersion: COPY_VERSION, environment: 'playground',
    locale: 'sv', recordedAt: undefined, uniqueId: DRAFT_ID,
  });
  assert.ok(!JSON.stringify(saved).includes('test@example.invalid'), 'no contact details in the record');
  const draftCall = attested.calls.findIndex((call) => call.endpoint === '/bookings/draft');
  const recordCall = attested.calls.indexOf(record);
  const persistCall = attested.calls.findIndex((call) => call.persisted);
  assert.ok(draftCall >= 0 && draftCall < recordCall && recordCall < persistCall, 'recorded after the draft, before persistence');
  assert.equal(JSON.stringify(attested.calls[draftCall].payload).includes('safety'), false);
  assert.ok(attested.calls.some((call) => call.event?.eventType === 'checkin.safety_attested_before_payment'));

  const plainDraft = bookingFixture();
  assert.equal((await plainDraft.backend.handleDraft({ headers: {} }, draftBody(), 'gh458')).statusCode, 201);
  assert.ok(!plainDraft.calls.some((call) => call.sql), 'no approval, no extra SQL (the old order)');
  const hash = (calls) => calls.find((call) => call.reserved).reserved.requestHash;
  assert.equal(hash(attested.calls), hash(plainDraft.calls), 'the approval never changes the draft idempotency hash');

  // Kiosk drafts carry the same approval; the provisional session is then marked ready by the kiosk.
  const kioskRequest = plainDraft.backend.normalizeDraftRequest({ headers: {} }, draftBody({ channel: 'kiosk', safetyAttestation: attestation }));
  assert.equal(kioskRequest.channel, 'kiosk');
  assert.deepEqual(plain(kioskRequest.safetyAttestation), attestation);
  assert.equal(plainDraft.backend.validateSafetyAttestation(kioskRequest.safetyAttestation), null);
});

test('booking: a failed record never fails the purchase, and clients cannot use the server namespace', async () => {
  const failing = bookingFixture({
    executeStatement: async (sql, parameters) => {
      failing.calls.push({ sql, parameters });
      throw new Error('synthetic database outage');
    },
  });
  const result = await failing.backend.handleDraft({ headers: {} }, draftBody({ safetyAttestation: attestation }), 'gh458');
  assert.equal(result.statusCode, 201, result.body);
  assert.ok(failing.calls.some((call) => call.persisted));

  const real = load(bookingPath, {}, ['reserveIdempotencyKey']);
  assert.equal((await real.reserveIdempotencyKey('booking_draft_create', `jysa_${sha256(DRAFT_ID)}`, 'fixture')).ok, false);
});

// ---------------------------------------------------------------------------------------------
// Session Lambda: the paid session becomes ready for staff when the purchase was attested.

function sessionRow(overrides = {}) {
  return {
    booking_reference: 'synthetic-booking',
    checkin_session_id: 'jycs_gh458',
    completed_at: null,
    created_at: '2026-09-30T08:20:00.000Z',
    expires_at: '2999-01-01T00:00:00.000Z',
    guest_resume_step: 'safety',
    handoff_code: null,
    handoff_day: null,
    handoff_status: 'not_ready',
    ready_for_staff_at: null,
    roller_unique_id: DRAFT_ID,
    safety_status: 'not_started',
    selected_ticket_ids: JSON.stringify(['synthetic-ticket']),
    status: 'guest_in_progress',
    updated_at: '2026-09-30T08:20:00.000Z',
    visit_date: '2026-09-30',
    ...overrides,
  };
}

const readyRow = sessionRow({
  handoff_code: '0042', handoff_day: '2026-09-30', handoff_status: 'ready_for_staff',
  ready_for_staff_at: '2026-09-30T08:21:00.000Z', safety_status: 'completed', status: 'ready_for_staff',
});

function sessionDatabase({ attestationRecord = { uniqueId: DRAFT_ID, copyVersion: COPY_VERSION }, readyFails = false } = {}) {
  const calls = [];
  const executeStatement = async (sql, parameters = []) => {
    calls.push({ sql, parameters });
    if (sql.includes("operation = 'safety_attestation'")) {
      return rdsRows(attestationRecord ? [{ result_ref: JSON.stringify(attestationRecord) }] : []);
    }
    if (sql.includes('jumpyard.ready_staff_session')) {
      if (readyFails) throw new Error('handoff_venue_required');
      return rdsRows([readyRow]);
    }
    return rdsRows([]);
  };
  return { calls, executeStatement };
}

const SESSION_NAMES = ['readyAttestedPurchaseSession', 'findSafetyAttestation', 'handleStartSession', 'mapSessionRow'];

test('session: an attested purchase session becomes ready for staff with its number', async () => {
  const db = sessionDatabase();
  const events = [];
  const s = load(sessionPath, { executeStatement: db.executeStatement, writeEventLog: async (entry) => { events.push(entry); } }, SESSION_NAMES);
  const session = s.mapSessionRow(sessionRow());
  const ready = plain(await s.readyAttestedPurchaseSession(session, 'gh458'));
  assert.equal(ready.status, 'ready_for_staff');
  assert.equal(ready.handoffCode, '0042');
  assert.equal(ready.safetyStatus, 'completed');
  const lookup = db.calls.find((call) => call.sql.includes("operation = 'safety_attestation'"));
  assert.equal(parameter(lookup, 'key'), `jysa_${sha256(DRAFT_ID)}`);
  assert.match(lookup.sql, /expires_at > now\(\)/);
  const readyCall = db.calls.find((call) => call.sql.includes('jumpyard.ready_staff_session'));
  assert.equal(parameter(readyCall, 'checkinSessionId'), 'jycs_gh458');
  assert.equal(parameter(readyCall, 'safetyStatus'), 'completed');
  assert.equal(events.length, 1);
  assert.equal(events[0].eventType, 'checkin.session_ready_for_staff');
  assert.equal(events[0].payload.source, 'safety_attested_before_payment');
  assert.ok(!db.calls.some((call) => /roller/i.test(call.sql) && /https?:/.test(call.sql)), 'Aurora only');
});

test('session: no approval, a foreign or retired record, or a non-active session changes nothing', async () => {
  for (const attestationRecord of [null, { uniqueId: 'another-booking', copyVersion: COPY_VERSION }, { uniqueId: DRAFT_ID, copyVersion: 'retired' }]) {
    const db = sessionDatabase({ attestationRecord });
    const s = load(sessionPath, { executeStatement: db.executeStatement, writeEventLog: async () => { throw new Error('no event'); } }, SESSION_NAMES);
    const session = s.mapSessionRow(sessionRow());
    assert.equal(await s.readyAttestedPurchaseSession(session, 'gh458'), session);
    assert.ok(!db.calls.some((call) => call.sql.includes('ready_staff_session')));
  }
  for (const row of [readyRow, sessionRow({ status: 'staff_in_progress' }), sessionRow({ status: 'redeemed' }), sessionRow({ expires_at: '2000-01-01T00:00:00.000Z' })]) {
    const db = sessionDatabase();
    const s = load(sessionPath, { executeStatement: db.executeStatement }, SESSION_NAMES);
    const session = s.mapSessionRow(row);
    assert.equal(await s.readyAttestedPurchaseSession(session, 'gh458'), session);
    assert.deepEqual(db.calls, [], 'no database work for sessions that are not in guest progress');
  }
  const failing = sessionDatabase({ readyFails: true });
  const s = load(sessionPath, { executeStatement: failing.executeStatement }, SESSION_NAMES);
  const session = s.mapSessionRow(sessionRow());
  assert.equal(await s.readyAttestedPurchaseSession(session, 'gh458'), session, 'a failed allocation leaves the ordinary session');
});

// GH-456 (D0230): a new check-in can only start on the visit day, inside its window.
const START_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());

function startContext({ paid = true } = {}) {
  return {
    booking: {
      amountOwingCents: paid ? 0 : 26000,
      bookingDate: START_DAY,
      bookingReference: 'synthetic-booking',
      bookingStatus: 'confirmed',
      freshnessStatus: 'fresh',
      isTombstoned: false,
      paymentStatus: paid ? 'paid' : 'unpaid',
      rollerUniqueId: DRAFT_ID,
      totalCents: 26000,
    },
    tickets: [{ ticketId: 'synthetic-ticket', bookingDate: START_DAY, productName: 'Entré',
      ticketProductType: 'sessionpass', redeemStatusLastSeen: null }],
  };
}

async function startSession({ paid = true, existing = null } = {}) {
  const db = sessionDatabase();
  const s = load(sessionPath, {
    executeStatement: db.executeStatement,
    verifyGuestAccessToken: async () => ({ ok: true, rollerUniqueId: DRAFT_ID, bookingReference: 'synthetic-booking' }),
    getBookingContext: async () => startContext({ paid }),
    reserveIdempotencyKey: async () => ({ ok: true }),
    completeIdempotencyKey: async () => {},
    expireOldSessions: async () => {},
    findActiveSession: async () => existing,
    createSession: async () => s.mapSessionRow(sessionRow()),
    markGuestResumeStep: async () => existing,
    writeEventLog: async () => {},
  }, SESSION_NAMES);
  const response = await s.handleStartSession(
    { headers: { authorization: 'Bearer synthetic' } },
    { rollerUniqueId: DRAFT_ID, identifier: DRAFT_ID, guestResumeStep: 'safety', idempotencyKey: 'gh458-session' },
    'gh458',
  );
  return { db, body: JSON.parse(response.body), statusCode: response.statusCode, s };
}

test('session start: a paid, attested purchase starts or resumes directly as ready for staff', async () => {
  const started = await startSession();
  assert.equal(started.statusCode, 201, JSON.stringify(started.body));
  assert.equal(started.body.status, 'session_started');
  assert.equal(started.body.session.status, 'ready_for_staff');
  assert.equal(started.body.session.handoffCode, '0042');

  const resumed = await startSession({ existing: load(sessionPath, {}, ['mapSessionRow']).mapSessionRow(sessionRow()) });
  assert.equal(resumed.statusCode, 200);
  assert.equal(resumed.body.status, 'session_resumed');
  assert.equal(resumed.body.session.status, 'ready_for_staff');
});

test('session start: an unpaid (declined or abandoned) purchase never becomes ready', async () => {
  const unpaid = await startSession({ paid: false });
  assert.equal(unpaid.statusCode, 409);
  assert.equal(unpaid.body.error.code, 'payment_required');
  assert.ok(!unpaid.db.calls.some((call) => call.sql.includes('safety_attestation') || call.sql.includes('ready_staff_session')));
});

test('shared copy version, least-privilege tables and no ROLLER call from the session route', () => {
  const booking = fs.readFileSync(bookingPath, 'utf8');
  const session = fs.readFileSync(sessionPath, 'utf8');
  for (const source of [booking, session]) {
    assert.equal(source.match(/const SAFETY_ATTESTATION_COPY_VERSION = '([^']+)'/)?.[1], COPY_VERSION);
  }
  for (const client of [
    path.join(root, 'jumpyard-checkin-phone', 'src', 'flow', 'safetyAttestation.ts'),
  ]) {
    assert.match(fs.readFileSync(client, 'utf8'), new RegExp(`SAFETY_ATTESTATION_COPY_VERSION = '${COPY_VERSION}'`));
  }
  const readyHelper = session.slice(session.indexOf('async function readyAttestedPurchaseSession'), session.indexOf('async function handleStaffSessionList'));
  assert.ok(readyHelper.length > 0);
  assert.doesNotMatch(readyHelper, /fetch\(|getRoller|roller\.app/);
  assert.match(readyHelper, /FROM jumpyard\.idempotency_records/);
});

// ---------------------------------------------------------------------------------------------
// Booking Lambda: an approved phone payment gets a provisional handoff at once (Love 2026-09-30:
// "telefonen ska också visa klar direkt"); ROLLER's paid booking is attached in the background.

const PREPAYMENT_ID = 'jypd_0123456789abcdef01';
const draftRow = {
  prepayment_draft_id: PREPAYMENT_ID, roller_draft_unique_id: DRAFT_ID, roller_env: 'playground', status: 'payment_pending',
  booking_date: '2026-09-30', start_time: '12:00:00', total_cents: 26000, currency: 'SEK',
  customer_first_name: 'Test', customer_last_name: 'Fixture',
  items_summary: JSON.stringify([{ productId: '101', productName: 'Entré 60 min', quantity: 2, bookingDate: '2026-09-30', startTime: '12:00' }]),
};

function phoneDatabase({ draft = draftRow, attested = true, sessionRow: row, attach = [], failOn } = {}) {
  const calls = [];
  const executeStatement = async (sql, parameters = []) => {
    calls.push({ sql, parameters });
    if (failOn && sql.includes(failOn)) throw new Error('synthetic database outage');
    if (sql.includes('FROM jumpyard.prepayment_booking_drafts')) return rdsRows(draft ? [draft] : []);
    if (sql.includes("operation = 'safety_attestation'")) {
      return rdsRows(attested ? [{ result_ref: JSON.stringify({ uniqueId: DRAFT_ID, copyVersion: COPY_VERSION, attestedAt: attestation.attestedAt }) }] : []);
    }
    if (sql.includes('SELECT checkin_session_id, status')) {
      return rdsRows([row ?? { checkin_session_id: 'jycs_' + PREPAYMENT_ID.slice(5), status: 'guest_in_progress', safety_status: 'completed',
        handoff_code: null, handoff_status: 'not_ready', expires_at: '2999-01-01T00:00:00.000Z', booking_sync_status: 'pending' }]);
    }
    if (sql.includes('UPDATE jumpyard.checkin_sessions AS cs')) return rdsRows(attach);
    return rdsRows([]);
  };
  return { calls, executeStatement };
}

function phoneBackend(db, extra = {}) {
  return load(bookingPath, {
    executeStatement: db.executeStatement,
    writeBookingEventLog: async () => {},
    ...extra,
  }, ['handleDraftFinalize', 'confirmPhoneProvisionalHandoff']);
}

const finalizeBody = (extra = {}) => ({ action: 'phone_approved', prepaymentDraftId: PREPAYMENT_ID, rollerDraftUniqueId: DRAFT_ID, ...extra });

test('phone approval: an attested phone purchase gets a provisional booking, guest access and session', async () => {
  const db = phoneDatabase();
  const response = await phoneBackend(db).handleDraftFinalize({ headers: {} }, finalizeBody(), 'gh458');
  assert.equal(response.statusCode, 200, response.body);
  const body = JSON.parse(response.body);
  assert.equal(body.status, 'provisional_handoff');
  const handoff = body.provisionalHandoff;
  assert.equal(handoff.booking.rollerUniqueId, DRAFT_ID);
  assert.equal(handoff.booking.paymentStatus, 'paid');
  assert.equal(handoff.booking.items[0].quantity, 2);
  assert.equal(handoff.session.bookingSyncStatus, 'pending');
  assert.equal(handoff.session.checkinSessionId, 'jycs_' + PREPAYMENT_ID.slice(5));
  assert.match(handoff.guestAccess.token, /^[A-Za-z0-9_-]{43}$/);

  const draftQuery = db.calls.find((call) => call.sql.includes('FROM jumpyard.prepayment_booking_drafts'));
  for (const rule of ["payment_channel = 'ecommerce'", "flow_type = 'new_booking'", "status IN ('payment_pending', 'published')"]) {
    assert.ok(draftQuery.sql.includes(rule), rule);
  }
  const bookingInsert = db.calls.find((call) => call.sql.includes('INSERT INTO jumpyard.roller_bookings'));
  assert.match(bookingInsert.sql, /ON CONFLICT \(roller_unique_id\) DO NOTHING/, 'never replaces ROLLER data');
  assert.match(bookingInsert.sql, /'phone_payment_approved'/);
  const tokenInsert = db.calls.find((call) => call.sql.includes('INSERT INTO jumpyard.checkin_tokens'));
  assert.equal(parameter(tokenInsert, 'tokenHash'), sha256(handoff.guestAccess.token), 'only the hash is stored');
  const sessionInsert = db.calls.find((call) => call.sql.includes('INSERT INTO jumpyard.checkin_sessions'));
  assert.match(sessionInsert.sql, /ON CONFLICT DO NOTHING/);
  assert.deepEqual(JSON.parse(parameter(sessionInsert, 'sessionSummary')), { bookingSyncStatus: 'pending', paymentStatus: 'approved',
    prepaymentDraftId: PREPAYMENT_ID, safetyAttestedAt: attestation.attestedAt, source: 'phone_payment_approved' });
  assert.ok(db.calls.some((call) => call.sql.includes('UPDATE jumpyard.checkin_sessions AS cs')), 'attaches at once if ROLLER was quick');
});

test('phone approval: unknown, foreign or unattested purchases never get a provisional number', async () => {
  for (const [bodyExtra, code, status] of [
    [{ prepaymentDraftId: 'jytp_0123456789abcdef01' }, 'prepayment_draft_id_invalid', 400],
    [{ rollerDraftUniqueId: 'x'.repeat(129) }, 'roller_draft_id_invalid', 400],
  ]) {
    const db = phoneDatabase();
    const response = await phoneBackend(db).handleDraftFinalize({ headers: {} }, finalizeBody(bodyExtra), 'gh458');
    assert.equal(response.statusCode, status);
    assert.equal(JSON.parse(response.body).error.code, code);
    assert.deepEqual(db.calls, []);
  }
  const missing = phoneDatabase({ draft: null });
  const notFound = await phoneBackend(missing).handleDraftFinalize({ headers: {} }, finalizeBody(), 'gh458');
  assert.equal(notFound.statusCode, 404);
  assert.ok(!missing.calls.some((call) => /INSERT INTO/.test(call.sql)));
  const unattested = phoneDatabase({ attested: false });
  const blocked = await phoneBackend(unattested).handleDraftFinalize({ headers: {} }, finalizeBody(), 'gh458');
  assert.equal(blocked.statusCode, 409);
  assert.equal(JSON.parse(blocked.body).error.code, 'safety_attestation_missing');
  assert.ok(!unattested.calls.some((call) => /INSERT INTO/.test(call.sql)), 'only the new order qualifies');
});

test('phone confirmation: a fresh, fully paid ROLLER booking attaches its tickets; failures never throw', async () => {
  const db = phoneDatabase({ attach: [{ checkin_session_id: 'jycs_x' }] });
  assert.equal((await phoneBackend(db).confirmPhoneProvisionalHandoff({ rollerUniqueId: DRAFT_ID }, 'gh458')).status, 'confirmed');
  const update = db.calls.find((call) => call.sql.includes('UPDATE jumpyard.checkin_sessions AS cs'));
  for (const rule of ["b.freshness_status = 'fresh'", 'b.amount_owing_cents = 0', "IN ('roller_live_lookup', 'roller_webhook_enrichment')",
    '(pending|unpaid|partial|cancel|fail|draft)', "cs.session_summary ->> 'source' = 'phone_payment_approved'",
    "cs.session_summary ->> 'bookingSyncStatus' = 'pending'", 'jsonb_array_length(booking.ticket_ids) > 0', "'bookingSyncStatus', 'confirmed'"]) {
    assert.ok(update.sql.includes(rule), rule);
  }
  assert.equal((await phoneBackend(phoneDatabase()).confirmPhoneProvisionalHandoff({ rollerUniqueId: DRAFT_ID }, 'gh458')).status, 'not_pending');
  assert.equal((await phoneBackend(phoneDatabase({ failOn: 'UPDATE jumpyard.checkin_sessions AS cs' }))
    .confirmPhoneProvisionalHandoff({ rollerUniqueId: DRAFT_ID }, 'gh458')).status, 'failed');
  assert.equal((await phoneBackend(phoneDatabase()).confirmPhoneProvisionalHandoff({}, 'gh458')).status, 'ignored');
});

test('phone confirmation rides the existing paid-booking signal from lookup and webhook', async () => {
  const order = [];
  const backend = load(bookingPath, {
    confirmPhoneProvisionalHandoff: async (detail) => { order.push(['confirm', detail.rollerUniqueId]); return { status: 'confirmed' }; },
    handlePhoneEmailMarketing: async (detail) => { order.push(['marketing', detail.rollerUniqueId]); return { status: 'provider_not_approved' }; },
  }, []);
  await backend.handler({ source: 'jumpyard.phone-email-marketing', detail: { rollerUniqueId: DRAFT_ID } });
  assert.deepEqual(order, [['confirm', DRAFT_ID], ['marketing', DRAFT_ID]]);
});
